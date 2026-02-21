import { fileURLToPath } from "node:url";

function createExitError(message, exitCode = 1) {
  const error = new Error(message);
  error.exitCode = exitCode;
  return error;
}

export function parseReleaseSmokeArgs(argv = []) {
  const options = {
    baseUrl: process.env.API_BASE_URL ?? "http://127.0.0.1:4000",
    timeoutMs: 8000,
    skipWrite: false,
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

    if (token === "--skip-write") {
      options.skipWrite = true;
      continue;
    }

    if (token === "--base-url") {
      options.baseUrl = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (token === "--timeout-ms") {
      options.timeoutMs = Number(argv[index + 1] ?? "0");
      index += 1;
      continue;
    }

    throw createExitError(`Unknown option: ${token}`);
  }

  if (options.help) {
    return options;
  }

  if (!options.baseUrl.trim()) {
    throw createExitError("--base-url must not be empty");
  }

  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1000) {
    throw createExitError("--timeout-ms must be an integer >= 1000");
  }

  return options;
}

function usageText() {
  return [
    "Usage:",
    "  pnpm run release:smoke -- [--base-url http://127.0.0.1:4000] [--timeout-ms 8000] [--skip-write]",
    "",
    "Options:",
    "  --base-url <url>   API base URL (default: API_BASE_URL or http://127.0.0.1:4000)",
    "  --timeout-ms <n>   Request timeout in ms (default: 8000)",
    "  --skip-write       Skip create/update/delete probe and run health-only check",
    "  --help             Show usage"
  ].join("\n");
}

export async function requestJson({ baseUrl, path, method = "GET", body, timeoutMs = 8000 }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        "content-type": "application/json"
      },
      body: body ? JSON.stringify(body) : undefined
    });

    const contentType = response.headers.get("content-type") ?? "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    return {
      ok: response.ok,
      status: response.status,
      payload
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function runReleaseSmoke(argv = process.argv.slice(2), dependencies = {}) {
  const logger = dependencies.logger ?? console;

  try {
    const options = parseReleaseSmokeArgs(argv);

    if (options.help) {
      logger.log(usageText());
      return 0;
    }

    const live = await requestJson({
      baseUrl: options.baseUrl,
      path: "/health/live",
      timeoutMs: options.timeoutMs
    });
    const ready = await requestJson({
      baseUrl: options.baseUrl,
      path: "/health/ready",
      timeoutMs: options.timeoutMs
    });

    if (!live.ok || !ready.ok) {
      throw createExitError(
        `health check failed: live=${live.status}, ready=${ready.status}`
      );
    }

    if (options.skipWrite) {
      logger.log(
        JSON.stringify({
          result: "OK",
          mode: "health-only",
          baseUrl: options.baseUrl,
          live: live.status,
          ready: ready.status
        })
      );
      return 0;
    }

    const title = `release-smoke-${Date.now()}`;
    const created = await requestJson({
      baseUrl: options.baseUrl,
      path: "/jnote/create",
      method: "POST",
      body: {
        title,
        note: "release smoke note",
        category: ["release", "smoke"]
      },
      timeoutMs: options.timeoutMs
    });

    if (!created.ok || !created.payload?._id) {
      throw createExitError(`create failed: ${created.status}`);
    }

    const id = created.payload._id;

    const readOne = await requestJson({
      baseUrl: options.baseUrl,
      path: `/jnote/read/${id}`,
      timeoutMs: options.timeoutMs
    });
    if (!readOne.ok) {
      throw createExitError(`read failed: ${readOne.status}`);
    }

    const updated = await requestJson({
      baseUrl: options.baseUrl,
      path: "/jnote/update",
      method: "POST",
      body: {
        id,
        note: "release smoke note updated"
      },
      timeoutMs: options.timeoutMs
    });
    if (!updated.ok) {
      throw createExitError(`update failed: ${updated.status}`);
    }

    const deleted = await requestJson({
      baseUrl: options.baseUrl,
      path: "/jnote/delete",
      method: "POST",
      body: { id },
      timeoutMs: options.timeoutMs
    });
    if (!deleted.ok) {
      throw createExitError(`delete failed: ${deleted.status}`);
    }

    logger.log(
      JSON.stringify({
        result: "OK",
        mode: "full",
        baseUrl: options.baseUrl,
        noteId: id
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
  const exitCode = await runReleaseSmoke(process.argv.slice(2));
  process.exit(exitCode);
}
