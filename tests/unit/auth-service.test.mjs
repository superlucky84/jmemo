import { describe, expect, it, vi } from "vitest";
import { createAuthService } from "../../server/auth.mjs";

describe("createAuthService", () => {
  it("stays disabled when password is empty", () => {
    const service = createAuthService({ password: "" });

    expect(service.enabled).toBe(false);
    expect(service.createSession("anything")).toBeNull();
    expect(service.isValidToken(null)).toBe(true);
  });

  it("creates and validates sessions when enabled", () => {
    const service = createAuthService({ password: "pw", sessionTtlMs: 1000 });

    expect(service.enabled).toBe(true);
    expect(service.createSession("wrong")).toBeNull();

    const session = service.createSession("pw");
    expect(session).not.toBeNull();
    expect(service.isValidToken(session?.token)).toBe(true);

    service.revokeToken(session?.token);
    expect(service.isValidToken(session?.token)).toBe(false);
  });

  it("reads session token from cookie header", () => {
    const service = createAuthService({ password: "pw", cookieName: "my_cookie" });
    const req = {
      headers: {
        cookie: "a=1; my_cookie=token123; b=2"
      }
    };

    expect(service.getTokenFromRequest(req)).toBe("token123");
  });

  it("writes and clears cookie via express response helpers", () => {
    const service = createAuthService({ password: "pw", sessionTtlMs: 1000 });
    const response = {
      cookie: vi.fn(),
      clearCookie: vi.fn()
    };

    service.setSessionCookie(response, "token-1");
    service.clearSessionCookie(response);

    expect(response.cookie).toHaveBeenCalledTimes(1);
    expect(response.clearCookie).toHaveBeenCalledTimes(1);
  });
});
