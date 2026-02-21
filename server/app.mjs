import { randomUUID } from "node:crypto";
import express from "express";
import { resolve } from "node:path";
import { createErrorMiddleware, createApiError } from "./errors.mjs";
import { createJnoteRouter } from "./routes/jnote.mjs";
import { toSafeLogLine } from "./logger.mjs";

function nowIso() {
  return new Date().toISOString();
}

export function createApp(options = {}) {
  const {
    noteService,
    readinessCheck = async () => ({ ok: true }),
    logger = console,
    uploadRootDir = resolve(process.cwd(), "images")
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

  app.use(
    "/jnote",
    createJnoteRouter({
      noteService,
      uploadRootDir
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
