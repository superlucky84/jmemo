import { describe, expect, it } from "vitest";
import { maskSensitive, toSafeLogLine } from "../../server/logger.mjs";

describe("logger masking", () => {
  it("masks mongodb uri passwords in string messages", () => {
    const source =
      "connect mongodb+srv://superlucky84:my-secret-password@cluster0.l0gldxi.mongodb.net/jmemo";

    const masked = toSafeLogLine(source);
    expect(masked).toContain("mongodb+srv://superlucky84:***@cluster0.l0gldxi.mongodb.net/jmemo");
    expect(masked).not.toContain("my-secret-password");
  });

  it("masks sensitive object fields", () => {
    const masked = maskSensitive({
      MONGODB_URI: "mongodb+srv://u:pw@cluster0.mongodb.net",
      token: "abc",
      nested: {
        authorization: "Bearer token-value"
      },
      safe: "ok"
    });

    expect(masked).toEqual({
      MONGODB_URI: "[REDACTED]",
      token: "[REDACTED]",
      nested: {
        authorization: "[REDACTED]"
      },
      safe: "ok"
    });
  });
});
