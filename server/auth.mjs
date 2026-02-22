import { randomUUID } from "node:crypto";

const DEFAULT_COOKIE_NAME = "jmemo_session";
const DEFAULT_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function parseCookies(cookieHeader = "") {
  return cookieHeader
    .split(";")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .reduce((accumulator, chunk) => {
      const separatorIndex = chunk.indexOf("=");
      if (separatorIndex < 1) {
        return accumulator;
      }

      const key = chunk.slice(0, separatorIndex).trim();
      const value = chunk.slice(separatorIndex + 1).trim();
      accumulator[key] = decodeURIComponent(value);
      return accumulator;
    }, {});
}

export function createAuthService(options = {}) {
  const {
    password = "",
    cookieName = DEFAULT_COOKIE_NAME,
    sessionTtlMs = DEFAULT_SESSION_TTL_MS
  } = options;

  const normalizedPassword = String(password ?? "").trim();
  const enabled = normalizedPassword.length > 0;
  const sessions = new Map();

  const pruneExpiredSessions = () => {
    const now = Date.now();
    for (const [token, expiresAt] of sessions.entries()) {
      if (expiresAt <= now) {
        sessions.delete(token);
      }
    }
  };

  const getTokenFromRequest = (req) => {
    const cookies = parseCookies(req.headers.cookie ?? "");
    return cookies[cookieName] ?? null;
  };

  const isValidToken = (token) => {
    if (!enabled) {
      return true;
    }

    if (!token) {
      return false;
    }

    pruneExpiredSessions();
    const expiresAt = sessions.get(token);
    if (!expiresAt) {
      return false;
    }

    if (expiresAt <= Date.now()) {
      sessions.delete(token);
      return false;
    }

    return true;
  };

  const createSession = (rawPassword) => {
    if (!enabled) {
      return null;
    }

    if (String(rawPassword ?? "") !== normalizedPassword) {
      return null;
    }

    const token = randomUUID();
    const expiresAt = Date.now() + sessionTtlMs;
    sessions.set(token, expiresAt);

    return {
      token,
      expiresAt
    };
  };

  const revokeToken = (token) => {
    if (!token) {
      return;
    }
    sessions.delete(token);
  };

  const setSessionCookie = (res, token) => {
    res.cookie(cookieName, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: sessionTtlMs
    });
  };

  const clearSessionCookie = (res) => {
    res.clearCookie(cookieName, {
      path: "/",
      sameSite: "lax",
      secure: false
    });
  };

  return {
    enabled,
    cookieName,
    sessionTtlMs,
    getTokenFromRequest,
    isValidToken,
    createSession,
    revokeToken,
    setSessionCookie,
    clearSessionCookie
  };
}
