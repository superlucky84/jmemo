import { existsSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";
import { validateMongoUri } from "../src/shared/env.mjs";

export const EXIT_CODES = {
  SUCCESS: 0,
  INPUT_ERROR: 2,
  CONNECT_FAIL: 3,
  DROP_FAIL: 4,
  RESTORE_FAIL: 5,
  POSTCHECK_FAIL: 6
};

function createExitError(message, exitCode) {
  const error = new Error(message);
  error.exitCode = exitCode;
  return error;
}

export function parseMigrateResetArgs(argv = []) {
  const options = {
    archive: "",
    db: "jmemo",
    uri: "",
    yes: false,
    dryRun: false,
    help: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === "--") {
      continue;
    }

    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }

    if (token === "--yes" || token === "--confirm") {
      options.yes = true;
      continue;
    }

    if (token === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (token === "--archive") {
      options.archive = argv[i + 1] ?? "";
      i += 1;
      continue;
    }

    if (token === "--db") {
      options.db = argv[i + 1] ?? "";
      i += 1;
      continue;
    }

    if (token === "--uri") {
      options.uri = argv[i + 1] ?? "";
      i += 1;
      continue;
    }

    throw createExitError(`Unknown option: ${token}`, EXIT_CODES.INPUT_ERROR);
  }

  if (options.help) {
    return options;
  }

  if (!options.archive) {
    throw createExitError("Missing required option: --archive <path>", EXIT_CODES.INPUT_ERROR);
  }

  if (!options.db.trim()) {
    throw createExitError("Invalid option: --db must not be empty", EXIT_CODES.INPUT_ERROR);
  }

  return options;
}

export function createSummaryLine({ result, exitCode, db, archive }) {
  return `RESULT=${result} EXIT_CODE=${exitCode} DB=${db || "-"} ARCHIVE=${archive || "-"}`;
}

function printUsage(logger = console) {
  logger.log(
    [
      "Usage:",
      "  pnpm run migrate:reset -- --archive <path> [--db jmemo] [--uri <mongodb+srv://...>] [--yes] [--dry-run]",
      "",
      "Options:",
      "  --archive <path>   Required archive path",
      "  --db <name>        Target database name (default: jmemo)",
      "  --uri <uri>        Atlas connection URI (fallback: MONGODB_URI)",
      "  --yes, --confirm   Required for destructive drop+restore",
      "  --dry-run          Print plan only (no destructive action)",
      "  --help             Show usage"
    ].join("\n")
  );
}

async function withMongoClient(uri, fn) {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    return await fn(client);
  } finally {
    await client.close();
  }
}

async function defaultPrecheck({ uri }) {
  await withMongoClient(uri, async (client) => {
    await client.db().admin().ping();
  });
}

async function defaultDropDatabase({ uri, db }) {
  await withMongoClient(uri, async (client) => {
    await client.db(db).dropDatabase();
  });
}

function runCommand(command, args, options = {}) {
  return new Promise((resolveCommand, rejectCommand) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      ...options
    });

    child.on("error", rejectCommand);
    child.on("exit", (code) => {
      if (code === 0) {
        resolveCommand();
        return;
      }

      rejectCommand(new Error(`${command} exited with code ${code ?? "null"}`));
    });
  });
}

export function isCommandAvailable(command, dependencies = {}) {
  const spawnSyncImpl = dependencies.spawnSync ?? spawnSync;
  const result = spawnSyncImpl(command, ["--version"], {
    stdio: "ignore"
  });

  return !result.error;
}

function getLocalMongorestorePath(cwd = process.cwd()) {
  const binary = process.platform === "win32" ? "mongorestore.cmd" : "mongorestore";
  return resolve(cwd, "node_modules", ".bin", binary);
}

export function buildRestoreCommand({ uri, db, archive }) {
  const archiveFile = basename(archive);
  const archiveDir = dirname(archive);
  const namespaceFilter = `${db}.*`;

  return {
    command: "docker",
    args: [
      "run",
      "--rm",
      "-v",
      `${archiveDir}:/work`,
      "-e",
      `MONGODB_URI=${uri}`,
      "mongo:8",
      "sh",
      "-lc",
      `mongorestore --uri "$MONGODB_URI" --gzip --archive="/work/${archiveFile}" --nsInclude="${namespaceFilter}"`
    ]
  };
}

export function buildLocalRestoreCommand({ uri, db, archive, mongorestoreBin = "mongorestore" }) {
  return {
    command: mongorestoreBin,
    args: ["--uri", uri, "--gzip", `--archive=${archive}`, `--nsInclude=${db}.*`]
  };
}

export function resolveRestoreRunner({ uri, db, archive }, dependencies = {}) {
  const fileExists = dependencies.fileExists ?? existsSync;
  const commandAvailable =
    dependencies.commandAvailable ?? ((command) => isCommandAvailable(command, dependencies));
  const env = dependencies.env ?? process.env;
  const cwd = dependencies.cwd ?? process.cwd();
  const configuredMongorestore = (env.MONGORESTORE_BIN ?? "").trim();
  const localMongorestore = getLocalMongorestorePath(cwd);

  if (commandAvailable("docker")) {
    return {
      strategy: "docker",
      ...buildRestoreCommand({ uri, db, archive })
    };
  }

  if (configuredMongorestore) {
    return {
      strategy: "configured-mongorestore",
      ...buildLocalRestoreCommand({
        uri,
        db,
        archive,
        mongorestoreBin: configuredMongorestore
      })
    };
  }

  if (fileExists(localMongorestore)) {
    return {
      strategy: "local-mongorestore",
      ...buildLocalRestoreCommand({
        uri,
        db,
        archive,
        mongorestoreBin: localMongorestore
      })
    };
  }

  if (commandAvailable("mongorestore")) {
    return {
      strategy: "system-mongorestore",
      ...buildLocalRestoreCommand({
        uri,
        db,
        archive,
        mongorestoreBin: "mongorestore"
      })
    };
  }

  throw new Error(
    [
      "No restore runner found.",
      "Install mongorestore (recommended: `brew install mongodb-database-tools`) or install Docker.",
      "You can also set MONGORESTORE_BIN to a custom mongorestore path."
    ].join(" ")
  );
}

async function defaultRestoreArchive({ uri, db, archive, logger }) {
  const { strategy, command, args } = resolveRestoreRunner({ uri, db, archive });
  logger?.log(`[restore-runner] strategy=${strategy} command=${command}`);
  await runCommand(command, args);
}

async function defaultPostcheck({ uri, db }) {
  const collections = await withMongoClient(uri, async (client) => {
    const listed = await client.db(db).listCollections({}, { nameOnly: true }).toArray();
    return listed.map((item) => item.name);
  });

  if (collections.length === 0) {
    throw new Error("Postcheck failed: no collections restored.");
  }
}

export async function runMigrateReset(argv = process.argv.slice(2), dependencies = {}) {
  const logger = dependencies.logger ?? console;
  let parsed = {
    archive: "",
    db: "jmemo"
  };
  let archiveAbsolutePath = "";
  let exitCode = EXIT_CODES.SUCCESS;
  let result = "SUCCESS";

  try {
    parsed = parseMigrateResetArgs(argv);

    if (parsed.help) {
      printUsage(logger);
      return EXIT_CODES.SUCCESS;
    }

    archiveAbsolutePath = resolve(parsed.archive);
    const uri = validateMongoUri(parsed.uri || (dependencies.env ?? process.env).MONGODB_URI);
    const fileExists = dependencies.fileExists ?? existsSync;

    if (!fileExists(archiveAbsolutePath)) {
      throw createExitError(
        `Archive not found: ${archiveAbsolutePath}`,
        EXIT_CODES.INPUT_ERROR
      );
    }

    const precheck = dependencies.precheck ?? defaultPrecheck;
    const dropDatabase = dependencies.dropDatabase ?? defaultDropDatabase;
    const restoreArchive = dependencies.restoreArchive ?? defaultRestoreArchive;
    const postcheck = dependencies.postcheck ?? defaultPostcheck;

    if (parsed.dryRun) {
      result = "DRY_RUN";
      logger.log(
        [
          "[plan] precheck -> drop -> restore -> postcheck",
          `[plan] db=${parsed.db}`,
          `[plan] archive=${archiveAbsolutePath}`
        ].join("\n")
      );
    } else {
      if (!parsed.yes) {
        throw createExitError(
          "Refusing destructive operation without --yes (or --confirm).",
          EXIT_CODES.INPUT_ERROR
        );
      }

      logger.log(`[phase] precheck`);
      try {
        await precheck({
          uri,
          db: parsed.db,
          archive: archiveAbsolutePath
        });
      } catch (error) {
        throw createExitError(
          `Precheck failed: ${error?.message ?? error}`,
          EXIT_CODES.CONNECT_FAIL
        );
      }

      logger.log(`[phase] drop`);
      try {
        await dropDatabase({
          uri,
          db: parsed.db,
          archive: archiveAbsolutePath
        });
      } catch (error) {
        throw createExitError(
          `Drop failed: ${error?.message ?? error}`,
          EXIT_CODES.DROP_FAIL
        );
      }

      logger.log(`[phase] restore`);
      try {
        await restoreArchive({
          uri,
          db: parsed.db,
          archive: archiveAbsolutePath,
          logger
        });
      } catch (error) {
        throw createExitError(
          `Restore failed: ${error?.message ?? error}`,
          EXIT_CODES.RESTORE_FAIL
        );
      }

      logger.log(`[phase] postcheck`);
      try {
        await postcheck({
          uri,
          db: parsed.db,
          archive: archiveAbsolutePath
        });
      } catch (error) {
        throw createExitError(
          `Postcheck failed: ${error?.message ?? error}`,
          EXIT_CODES.POSTCHECK_FAIL
        );
      }
    }
  } catch (error) {
    const message = error?.message ?? String(error);

    if (error?.exitCode) {
      exitCode = error.exitCode;
    } else if (message.toLowerCase().includes("mongodb")) {
      exitCode = EXIT_CODES.CONNECT_FAIL;
    } else {
      exitCode = EXIT_CODES.INPUT_ERROR;
    }

    result = "FAILED";
    logger.error(message);
  } finally {
    logger.log(
      createSummaryLine({
        result,
        exitCode,
        db: parsed.db,
        archive: archiveAbsolutePath || parsed.archive
      })
    );
  }

  return exitCode;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const exitCode = await runMigrateReset(process.argv.slice(2));
  process.exit(exitCode);
}
