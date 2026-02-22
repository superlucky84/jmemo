import { describe, expect, it } from "vitest";
import {
  parseAuthPassword,
  parseBooleanFlag,
  parseLogLevel,
  parsePort,
  parseSessionTtlHours,
  resolveAppEnv,
  validateMongoUri
} from "../../src/shared/env.mjs";

describe("validateMongoUri", () => {
  it("accepts a valid atlas uri", () => {
    const uri = "mongodb+srv://user:pass@cluster0.example.mongodb.net/?retryWrites=true&w=majority";

    expect(validateMongoUri(uri)).toBe(uri);
  });

  it("throws for empty value", () => {
    expect(() => validateMongoUri("")).toThrow("Missing MONGODB_URI");
  });

  it("throws for non-srv uri", () => {
    expect(() => validateMongoUri("mongodb://localhost:27017/jmemo")).toThrow(
      "must start with mongodb+srv://"
    );
  });
});

describe("parsePort", () => {
  it("uses fallback when PORT is missing", () => {
    expect(parsePort(undefined)).toBe(4000);
  });

  it("parses integer port", () => {
    expect(parsePort("8080")).toBe(8080);
  });

  it("rejects invalid port", () => {
    expect(() => parsePort("70000")).toThrow("PORT must be an integer");
  });
});

describe("parseLogLevel", () => {
  it("normalizes casing", () => {
    expect(parseLogLevel("WARN")).toBe("warn");
  });

  it("rejects unknown level", () => {
    expect(() => parseLogLevel("trace")).toThrow("LOG_LEVEL must be one of");
  });
});

describe("parseBooleanFlag", () => {
  it("parses true values", () => {
    expect(parseBooleanFlag("true")).toBe(true);
    expect(parseBooleanFlag("1")).toBe(true);
  });

  it("parses false values", () => {
    expect(parseBooleanFlag("false")).toBe(false);
    expect(parseBooleanFlag("0")).toBe(false);
  });

  it("throws for invalid value", () => {
    expect(() => parseBooleanFlag("maybe")).toThrow("Boolean flag must be one of");
  });
});

describe("parseAuthPassword", () => {
  it("trims value", () => {
    expect(parseAuthPassword("  pw  ")).toBe("pw");
  });

  it("returns fallback for empty value", () => {
    expect(parseAuthPassword("", "fallback")).toBe("fallback");
  });
});

describe("parseSessionTtlHours", () => {
  it("uses default for empty value", () => {
    expect(parseSessionTtlHours(undefined, 12)).toBe(12);
  });

  it("parses integer hours", () => {
    expect(parseSessionTtlHours("24")).toBe(24);
  });

  it("rejects invalid hours", () => {
    expect(() => parseSessionTtlHours("0")).toThrow("AUTH_SESSION_TTL_HOURS");
  });
});

describe("resolveAppEnv", () => {
  it("returns normalized config", () => {
    const config = resolveAppEnv({
      MONGODB_URI:
        "mongodb+srv://user:pass@cluster0.example.mongodb.net/?retryWrites=true&w=majority",
      PORT: "4010",
      UPLOAD_DIR: "images",
      LOG_LEVEL: "debug",
      AUTH_PASSWORD: "pw",
      AUTH_SESSION_TTL_HOURS: "24"
    });

    expect(config).toEqual({
      mongoUri:
        "mongodb+srv://user:pass@cluster0.example.mongodb.net/?retryWrites=true&w=majority",
      port: 4010,
      uploadDir: "images",
      logLevel: "debug",
      useMemoryService: false,
      authPassword: "pw",
      authSessionTtlHours: 24
    });
  });

  it("allows missing mongo uri when requireMongoUri=false", () => {
    const config = resolveAppEnv({}, { requireMongoUri: false });
    expect(config.mongoUri).toBeNull();
    expect(config.useMemoryService).toBe(false);
    expect(config.authPassword).toBe("");
    expect(config.authSessionTtlHours).toBe(12);
  });

  it("resolves memory service flag", () => {
    const config = resolveAppEnv(
      {
        MONGODB_URI:
          "mongodb+srv://user:pass@cluster0.example.mongodb.net/?retryWrites=true&w=majority",
        JMEMO_USE_MEMORY_SERVICE: "1"
      },
      { requireMongoUri: false }
    );

    expect(config.useMemoryService).toBe(true);
    expect(config.authPassword).toBe("");
  });
});
