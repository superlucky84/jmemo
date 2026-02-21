import { describe, expect, it } from "vitest";
import { parseCountCheckArgs } from "../../scripts/cutover-count-check.mjs";

const validUri = "mongodb+srv://user:pass@cluster0.example.mongodb.net/?retryWrites=true&w=majority";

describe("parseCountCheckArgs", () => {
  it("parses db and collections", () => {
    const parsed = parseCountCheckArgs([
      "--uri",
      validUri,
      "--db",
      "jmemo",
      "--collections",
      "jmemos,categories,logs"
    ]);

    expect(parsed.db).toBe("jmemo");
    expect(parsed.collections).toEqual(["jmemos", "categories", "logs"]);
    expect(parsed.uri).toBe(validUri);
  });

  it("throws on empty collections", () => {
    expect(() =>
      parseCountCheckArgs(["--uri", validUri, "--collections", ", ,"])
    ).toThrow("--collections must include at least one collection name");
  });
});
