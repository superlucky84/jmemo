import { describe, expect, it, vi } from "vitest";
import { parseCutoverArgs, runCutover } from "../../scripts/cutover-runner.mjs";

describe("parseCutoverArgs", () => {
  it("parses required fields and defaults", () => {
    const parsed = parseCutoverArgs(["--archive", "./mongo-all.archive", "--yes"]);
    expect(parsed.archive).toBe("./mongo-all.archive");
    expect(parsed.db).toBe("jmemo");
    expect(parsed.collections).toEqual(["jmemos", "categories"]);
    expect(parsed.yes).toBe(true);
  });

  it("rejects destructive run without --yes", () => {
    expect(() => parseCutoverArgs(["--archive", "./mongo-all.archive"])).toThrow(
      "Refusing cutover run without --yes"
    );
  });

  it("allows dry-run without --yes", () => {
    const parsed = parseCutoverArgs(["--archive", "./mongo-all.archive", "--dry-run"]);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.yes).toBe(false);
  });
});

describe("runCutover", () => {
  it("runs migrate -> count -> smoke in order", async () => {
    const steps = [];
    const code = await runCutover(["--archive", "a.archive", "--yes"], {
      logger: { log: vi.fn(), error: vi.fn() },
      migrate: async () => {
        steps.push("migrate");
        return 0;
      },
      countCheck: async () => {
        steps.push("count");
        return 0;
      },
      smoke: async () => {
        steps.push("smoke");
        return 0;
      }
    });

    expect(code).toBe(0);
    expect(steps).toEqual(["migrate", "count", "smoke"]);
  });

  it("stops after migrate on failure", async () => {
    const countCheck = vi.fn(async () => 0);
    const smoke = vi.fn(async () => 0);

    const code = await runCutover(["--archive", "a.archive", "--yes"], {
      logger: { log: vi.fn(), error: vi.fn() },
      migrate: async () => 5,
      countCheck,
      smoke
    });

    expect(code).toBe(5);
    expect(countCheck).not.toHaveBeenCalled();
    expect(smoke).not.toHaveBeenCalled();
  });
});
