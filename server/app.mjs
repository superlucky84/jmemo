import { randomUUID } from "node:crypto";
import express from "express";
import { resolve } from "node:path";
import { createErrorMiddleware, createApiError } from "./errors.mjs";
import { createJnoteRouter } from "./routes/jnote.mjs";
import { toSafeLogLine } from "./logger.mjs";
import { createAuthService } from "./auth.mjs";

function nowIso() {
  return new Date().toISOString();
}

function asyncRoute(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

export function createApp(options = {}) {
  const {
    noteService,
    readinessCheck = async () => ({ ok: true }),
    logger = console,
    uploadRootDir = resolve(process.cwd(), "images"),
    authService = createAuthService({ password: "" })
  } = options;

  if (!noteService) {
    throw new Error("noteService is required for createApp");
  }

  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));

  app.use((req, res, next) => {
    req.requestId = randomUUID();
    req.requestStartedAt = Date.now();
    res.setHeader("x-request-id", req.requestId);
    next();
  });

  app.use((req, res, next) => {
    res.on("finish", () => {
      logger.info?.(
        toSafeLogLine({
          time: nowIso(),
          level: "info",
          requestId: req.requestId,
          route: req.originalUrl,
          status: res.statusCode,
          latencyMs: Date.now() - req.requestStartedAt
        })
      );
    });
    next();
  });

  app.use("/images", express.static(uploadRootDir));

  app.get("/health/live", (_req, res) => {
    res.json({
      ok: true,
      status: "live",
      time: nowIso()
    });
  });

  app.get("/health/ready", async (req, res, next) => {
    try {
      const result = await readinessCheck();

      if (!result?.ok) {
        throw createApiError(result?.code ?? "DB_UNAVAILABLE", {
          status: 503,
          message: result?.message ?? "Service is not ready",
          details: result?.details,
          retryable: true
        });
      }

      res.json({
        ok: true,
        status: "ready",
        time: nowIso(),
        requestId: req.requestId
      });
    } catch (error) {
      next(error);
    }
  });

  const getAuthState = (req) => {
    if (!authService.enabled) {
      return {
        enabled: false,
        authenticated: true
      };
    }

    const token = authService.getTokenFromRequest(req);
    return {
      enabled: true,
      authenticated: authService.isValidToken(token)
    };
  };

  const requireWriteAuth = (req, _res, next) => {
    const authState = getAuthState(req);
    if (authState.authenticated) {
      next();
      return;
    }

    next(
      createApiError("UNAUTHORIZED", {
        message: "Authentication required"
      })
    );
  };

  app.get(
    "/auth/me",
    asyncRoute(async (req, res) => {
      const authState = getAuthState(req);
      res.json({
        ok: true,
        enabled: authState.enabled,
        authenticated: authState.authenticated
      });
    })
  );

  app.post(
    "/auth/login",
    asyncRoute(async (req, res) => {
      if (!authService.enabled) {
        res.json({
          ok: true,
          enabled: false,
          authenticated: true
        });
        return;
      }

      const session = authService.createSession(req.body?.password);
      if (!session) {
        throw createApiError("UNAUTHORIZED", {
          message: "Invalid password"
        });
      }

      authService.setSessionCookie(res, session.token);
      res.json({
        ok: true,
        enabled: true,
        authenticated: true
      });
    })
  );

  app.post(
    "/auth/logout",
    asyncRoute(async (req, res) => {
      const token = authService.getTokenFromRequest(req);
      if (token) {
        authService.revokeToken(token);
      }

      authService.clearSessionCookie(res);
      res.json({
        ok: true,
        enabled: authService.enabled,
        authenticated: false
      });
    })
  );

  app.use(
    "/jnote",
    createJnoteRouter({
      noteService,
      uploadRootDir,
      requireWriteAuth
    })
  );

  app.use((req, _res, next) => {
    next(
      createApiError("NOT_FOUND", {
        message: "Route not found",
        details: { path: req.originalUrl }
      })
    );
  });

  app.use(createErrorMiddleware({ logger }));

  return app;
}
