import { fileURLToPath } from "node:url";
import { runMigrateReset } from "./migrate-reset.mjs";
import { runCountCheck } from "./cutover-count-check.mjs";
import { runReleaseSmoke } from "./release-smoke.mjs";

function createExitError(message, exitCode = 2) {
  const error = new Error(message);
  error.exitCode = exitCode;
  return error;
}

export function parseCutoverArgs(argv = []) {
  const options = {
    archive: "",
    db: "jmemo",
    uri: "",
    baseUrl: process.env.API_BASE_URL ?? "http://127.0.0.1:4000",
    collections: ["jmemos", "categories"],
    skipWriteSmoke: false,
    dryRun: false,
    yes: false,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--") {
      continue;
    }

    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }

    if (token === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (token === "--yes" || token === "--confirm") {
      options.yes = true;
      continue;
    }

    if (token === "--skip-write-smoke") {
      options.skipWriteSmoke = true;
      continue;
    }

    if (token === "--archive") {
      options.archive = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (token === "--db") {
      options.db = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (token === "--uri") {
      options.uri = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (token === "--base-url") {
      options.baseUrl = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (token === "--collections") {
      const raw = argv[index + 1] ?? "";
      index += 1;
      options.collections = raw.split(",").map((item) => item.trim()).filter(Boolean);
      continue;
    }

    throw createExitError(`Unknown option: ${token}`);
  }

  if (options.help) {
    return options;
  }

  if (!options.archive.trim()) {
    throw createExitError("--archive <path> is required");
  }

  if (!options.db.trim()) {
    throw createExitError("--db must not be empty");
  }

  if (!options.baseUrl.trim()) {
    throw createExitError("--base-url must not be empty");
  }

  if (options.collections.length === 0) {
    throw createExitError("--collections must include at least one name");
  }

  if (!options.dryRun && !options.yes) {
    throw createExitError("Refusing cutover run without --yes");
  }

  return options;
}

function usageText() {
  return [
    "Usage:",
    "  pnpm run cutover:run -- --archive ./mongo-all.archive --yes [options]",
    "",
    "Options:",
    "  --archive <path>          Source archive path (required)",
    "  --db <name>               Target DB name (default: jmemo)",
    "  --uri <mongodb+srv://..>  Atlas URI (fallback: MONGODB_URI)",
    "  --base-url <url>          Backend base URL for release smoke",
    "  --collections <a,b,c>     Count-check collections (default: jmemos,categories)",
    "  --skip-write-smoke        Run health-only smoke without create/update/delete",
    "  --dry-run                 Print plan and run migrate dry-run only",
    "  --yes, --confirm          Required for destructive run",
    "  --help                    Show usage"
  ].join("\n");
}

function buildMigrateArgs(options) {
  const args = ["--archive", options.archive, "--db", options.db];

  if (options.uri) {
    args.push("--uri", options.uri);
  }

  if (options.dryRun) {
    args.push("--dry-run");
  } else {
    args.push("--yes");
  }

  return args;
}

function buildCountArgs(options) {
  const args = ["--db", options.db, "--collections", options.collections.join(",")];

  if (options.uri) {
    args.push("--uri", options.uri);
  }

  return args;
}

function buildSmokeArgs(options) {
  const args = ["--base-url", options.baseUrl];

  if (options.skipWriteSmoke) {
    args.push("--skip-write");
  }

  return args;
}

export async function runCutover(argv = process.argv.slice(2), dependencies = {}) {
  const logger = dependencies.logger ?? console;
  const migrate = dependencies.migrate ?? runMigrateReset;
  const countCheck = dependencies.countCheck ?? runCountCheck;
  const smoke = dependencies.smoke ?? runReleaseSmoke;

  try {
    const options = parseCutoverArgs(argv);

    if (options.help) {
      logger.log(usageText());
      return 0;
    }

    logger.log("[cutover] step=1 migrate-reset");
    const migrateCode = await migrate(buildMigrateArgs(options));
    if (migrateCode !== 0) {
      return migrateCode;
    }

    if (options.dryRun) {
      logger.log(
        JSON.stringify({
          result: "DRY_RUN_OK",
          step: "migrate-reset-only"
        })
      );
      return 0;
    }

    logger.log("[cutover] step=2 count-check");
    const countCode = await countCheck(buildCountArgs(options));
    if (countCode !== 0) {
      return countCode;
    }

    logger.log("[cutover] step=3 release-smoke");
    const smokeCode = await smoke(buildSmokeArgs(options));
    if (smokeCode !== 0) {
      return smokeCode;
    }

    logger.log(
      JSON.stringify({
        result: "OK",
        archive: options.archive,
        db: options.db
      })
    );
    return 0;
  } catch (error) {
    logger.error(
      JSON.stringify({
        result: "FAILED",
        message: error?.message ?? String(error)
      })
    );
    return error?.exitCode ?? 1;
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const exitCode = await runCutover(process.argv.slice(2));
  process.exit(exitCode);
}
