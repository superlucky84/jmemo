import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";
import { validateMongoUri } from "../src/shared/env.mjs";

function createExitError(message, exitCode = 1) {
  const error = new Error(message);
  error.exitCode = exitCode;
  return error;
}

export function parseCountCheckArgs(argv = []) {
  const options = {
    uri: process.env.MONGODB_URI ?? "",
    db: "jmemo",
    collections: ["jmemos", "categories"],
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

    if (token === "--uri") {
      options.uri = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (token === "--db") {
      options.db = argv[index + 1] ?? "";
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

  if (!options.db.trim()) {
    throw createExitError("--db must not be empty");
  }

  if (options.collections.length === 0) {
    throw createExitError("--collections must include at least one collection name");
  }

  options.uri = validateMongoUri(options.uri);
  return options;
}

function usageText() {
  return [
    "Usage:",
    "  pnpm run release:counts -- [--uri <mongodb+srv://...>] [--db jmemo] [--collections jmemos,categories]",
    "",
    "Options:",
    "  --uri <uri>             Atlas URI (default: MONGODB_URI)",
    "  --db <name>             Target database name (default: jmemo)",
    "  --collections <a,b,c>   Comma-separated collection names",
    "  --help                  Show usage"
  ].join("\n");
}

export async function runCountCheck(argv = process.argv.slice(2), dependencies = {}) {
  const logger = dependencies.logger ?? console;
  let client;

  try {
    const options = parseCountCheckArgs(argv);

    if (options.help) {
      logger.log(usageText());
      return 0;
    }

    client = new MongoClient(options.uri);
    await client.connect();
    const db = client.db(options.db);

    const counts = {};
    let total = 0;

    for (const collectionName of options.collections) {
      const count = await db.collection(collectionName).countDocuments();
      counts[collectionName] = count;
      total += count;
    }

    logger.log(
      JSON.stringify({
        result: "OK",
        db: options.db,
        collections: counts,
        total
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
  } finally {
    if (client) {
      await client.close();
    }
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const exitCode = await runCountCheck(process.argv.slice(2));
  process.exit(exitCode);
}
