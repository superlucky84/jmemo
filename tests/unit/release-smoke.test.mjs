import { describe, expect, it } from "vitest";
import { parseReleaseSmokeArgs } from "../../scripts/release-smoke.mjs";

describe("parseReleaseSmokeArgs", () => {
  it("parses base url, timeout and skip-write", () => {
    const parsed = parseReleaseSmokeArgs([
      "--base-url",
      "http://127.0.0.1:4100",
      "--timeout-ms",
      "12000",
      "--skip-write"
    ]);

    expect(parsed).toEqual({
      baseUrl: "http://127.0.0.1:4100",
      timeoutMs: 12000,
      skipWrite: true,
      help: false
    });
  });

  it("throws on invalid timeout", () => {
    expect(() => parseReleaseSmokeArgs(["--timeout-ms", "500"])).toThrow(
      "--timeout-ms must be an integer >= 1000"
    );
  });
});
