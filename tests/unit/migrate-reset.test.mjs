import { describe, expect, it, vi } from "vitest";
import {
  EXIT_CODES,
  buildLocalRestoreCommand,
  buildRestoreCommand,
  createSummaryLine,
  parseMigrateResetArgs,
  resolveRestoreRunner,
  runMigrateReset
} from "../../scripts/migrate-reset.mjs";

function createLogger() {
  return {
    log: vi.fn(),
    error: vi.fn()
  };
}

describe("parseMigrateResetArgs", () => {
  it("parses required and optional flags", () => {
    const parsed = parseMigrateResetArgs([
      "--archive",
      "./mongo-all.archive",
      "--db",
      "jmemo",
      "--uri",
      "mongodb+srv://u:p@cluster.mongodb.net",
      "--yes"
    ]);

    expect(parsed).toEqual({
      archive: "./mongo-all.archive",
      db: "jmemo",
      uri: "mongodb+srv://u:p@cluster.mongodb.net",
      yes: true,
      dryRun: false,
      help: false
    });
  });

  it("throws when --archive is missing", () => {
    expect(() => parseMigrateResetArgs(["--yes"])).toThrow("Missing required option: --archive");
  });

  it("supports --dry-run without --yes in parsing", () => {
    const parsed = parseMigrateResetArgs(["--archive", "a.archive", "--dry-run"]);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.yes).toBe(false);
  });

  it("ignores standalone -- separator from pnpm run", () => {
    const parsed = parseMigrateResetArgs(["--", "--archive", "a.archive", "--dry-run"]);
    expect(parsed.archive).toBe("a.archive");
    expect(parsed.dryRun).toBe(true);
  });
});

describe("createSummaryLine", () => {
  it("prints mandatory fields", () => {
    const line = createSummaryLine({
      result: "SUCCESS",
      exitCode: 0,
      db: "jmemo",
      archive: "/tmp/a.archive"
    });

    expect(line).toContain("RESULT=SUCCESS");
    expect(line).toContain("EXIT_CODE=0");
    expect(line).toContain("DB=jmemo");
    expect(line).toContain("ARCHIVE=/tmp/a.archive");
  });
});

describe("buildRestoreCommand", () => {
  it("builds docker mongorestore command", () => {
    const command = buildRestoreCommand({
      uri: "mongodb+srv://u:p@cluster.mongodb.net",
      db: "jmemo",
      archive: "/tmp/mongo-all.archive"
    });

    expect(command.command).toBe("docker");
    expect(command.args.join(" ")).toContain("mongorestore");
    expect(command.args.join(" ")).toContain("--nsInclude=\"jmemo.*\"");
  });
});

describe("buildLocalRestoreCommand", () => {
  it("builds direct mongorestore command", () => {
    const command = buildLocalRestoreCommand({
      uri: "mongodb+srv://u:p@cluster.mongodb.net",
      db: "jmemo",
      archive: "/tmp/mongo-all.archive",
      mongorestoreBin: "mongorestore"
    });

    expect(command.command).toBe("mongorestore");
    expect(command.args).toContain("--gzip");
    expect(command.args).toContain("--archive=/tmp/mongo-all.archive");
    expect(command.args).toContain("--nsInclude=jmemo.*");
  });
});

describe("resolveRestoreRunner", () => {
  const params = {
    uri: "mongodb+srv://u:p@cluster.mongodb.net",
    db: "jmemo",
    archive: "/tmp/mongo-all.archive"
  };

  it("prefers docker when available", () => {
    const resolved = resolveRestoreRunner(params, {
      commandAvailable: (command) => command === "docker",
      fileExists: () => false,
      env: {}
    });

    expect(resolved.strategy).toBe("docker");
    expect(resolved.command).toBe("docker");
  });

  it("uses configured MONGORESTORE_BIN when docker is unavailable", () => {
    const resolved = resolveRestoreRunner(params, {
      commandAvailable: () => false,
      fileExists: () => false,
      env: {
        MONGORESTORE_BIN: "/custom/bin/mongorestore"
      }
    });

    expect(resolved.strategy).toBe("configured-mongorestore");
    expect(resolved.command).toBe("/custom/bin/mongorestore");
  });

  it("falls back to local node_modules mongorestore", () => {
    const resolved = resolveRestoreRunner(params, {
      commandAvailable: () => false,
      fileExists: (path) => path.endsWith("node_modules/.bin/mongorestore"),
      env: {},
      cwd: "/repo"
    });

    expect(resolved.strategy).toBe("local-mongorestore");
    expect(resolved.command).toContain("/repo/node_modules/.bin/mongorestore");
  });

  it("falls back to system mongorestore when present in PATH", () => {
    const resolved = resolveRestoreRunner(params, {
      commandAvailable: (command) => command === "mongorestore",
      fileExists: () => false,
      env: {}
    });

    expect(resolved.strategy).toBe("system-mongorestore");
    expect(resolved.command).toBe("mongorestore");
  });

  it("throws a clear install error when no runner is found", () => {
    expect(() =>
      resolveRestoreRunner(params, {
        commandAvailable: () => false,
        fileExists: () => false,
        env: {}
      })
    ).toThrow("No restore runner found.");
  });
});

describe("runMigrateReset", () => {
  const validUri = "mongodb+srv://user:pass@cluster0.example.mongodb.net/?retryWrites=true&w=majority";

  it("returns success on dry-run and skips destructive phases", async () => {
    const logger = createLogger();
    const precheck = vi.fn();
    const dropDatabase = vi.fn();
    const restoreArchive = vi.fn();
    const postcheck = vi.fn();

    const exitCode = await runMigrateReset(["--archive", "./a.archive", "--dry-run"], {
      env: { MONGODB_URI: validUri },
      fileExists: () => true,
      precheck,
      dropDatabase,
      restoreArchive,
      postcheck,
      logger
    });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(precheck).not.toHaveBeenCalled();
    expect(dropDatabase).not.toHaveBeenCalled();
    expect(restoreArchive).not.toHaveBeenCalled();
    expect(postcheck).not.toHaveBeenCalled();
  });

  it("requires --yes for destructive run", async () => {
    const logger = createLogger();

    const exitCode = await runMigrateReset(["--archive", "./a.archive"], {
      env: { MONGODB_URI: validUri },
      fileExists: () => true,
      precheck: async () => undefined,
      logger
    });

    expect(exitCode).toBe(EXIT_CODES.INPUT_ERROR);
    expect(logger.error).toHaveBeenCalled();
  });

  it("maps precheck failure to connect code", async () => {
    const logger = createLogger();

    const exitCode = await runMigrateReset(["--archive", "./a.archive", "--yes"], {
      env: { MONGODB_URI: validUri },
      fileExists: () => true,
      precheck: async () => {
        throw new Error("mongodb ping failed");
      },
      logger
    });

    expect(exitCode).toBe(EXIT_CODES.CONNECT_FAIL);
  });

  it("maps drop failure to exit code 4", async () => {
    const logger = createLogger();

    const exitCode = await runMigrateReset(["--archive", "./a.archive", "--yes"], {
      env: { MONGODB_URI: validUri },
      fileExists: () => true,
      precheck: async () => undefined,
      dropDatabase: async () => {
        throw new Error("drop failed");
      },
      logger
    });

    expect(exitCode).toBe(EXIT_CODES.DROP_FAIL);
  });

  it("maps restore failure to exit code 5", async () => {
    const logger = createLogger();

    const exitCode = await runMigrateReset(["--archive", "./a.archive", "--yes"], {
      env: { MONGODB_URI: validUri },
      fileExists: () => true,
      precheck: async () => undefined,
      dropDatabase: async () => undefined,
      restoreArchive: async () => {
        throw new Error("restore failed");
      },
      logger
    });

    expect(exitCode).toBe(EXIT_CODES.RESTORE_FAIL);
  });

  it("maps postcheck failure to exit code 6", async () => {
    const logger = createLogger();

    const exitCode = await runMigrateReset(["--archive", "./a.archive", "--yes"], {
      env: { MONGODB_URI: validUri },
      fileExists: () => true,
      precheck: async () => undefined,
      dropDatabase: async () => undefined,
      restoreArchive: async () => undefined,
      postcheck: async () => {
        throw new Error("postcheck failed");
      },
      logger
    });

    expect(exitCode).toBe(EXIT_CODES.POSTCHECK_FAIL);
  });
});
