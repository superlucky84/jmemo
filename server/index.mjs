import { resolve } from "node:path";
import { createApp } from "./app.mjs";
import { resolveAppEnv } from "../src/shared/env.mjs";
import { connectMongo, disconnectMongo, pingMongo } from "./db.mjs";
import { JmemoModel } from "./models/jmemo-model.mjs";
import { createNoteService } from "./services/note-service.mjs";

const config = resolveAppEnv(process.env, { requireMongoUri: false });
const uploadRootDir = resolve(process.cwd(), config.uploadDir);

if (config.mongoUri) {
  try {
    await connectMongo(config.mongoUri);
  } catch (error) {
    console.error(
      JSON.stringify({
        time: new Date().toISOString(),
        level: "error",
        event: "db_connect_failed",
        message: error?.message ?? String(error)
      })
    );
    process.exit(1);
  }
}

const noteService = createNoteService({
  JmemoModel,
  imagesRootDir: uploadRootDir,
  logger: console
});

const app = createApp({
  noteService,
  uploadRootDir,
  readinessCheck: async () => {
    if (!config.mongoUri) {
      return {
        ok: false,
        code: "DB_UNAVAILABLE",
        message: "MONGODB_URI is missing"
      };
    }

    try {
      await pingMongo();
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        code: "DB_UNAVAILABLE",
        message: error?.message ?? String(error)
      };
    }
  }
});

const server = app.listen(config.port, () => {
  console.log(
    JSON.stringify({
      time: new Date().toISOString(),
      level: "info",
      event: "server_started",
      port: config.port,
      uploadDir: uploadRootDir,
      logLevel: config.logLevel
    })
  );
});

async function shutdown(signal) {
  console.log(
    JSON.stringify({
      time: new Date().toISOString(),
      level: "info",
      event: "server_shutdown",
      signal
    })
  );

  await new Promise((resolvePromise) => {
    server.close(() => resolvePromise());
  });

  try {
    await disconnectMongo();
  } catch (error) {
    console.error(
      JSON.stringify({
        time: new Date().toISOString(),
        level: "error",
        event: "db_disconnect_failed",
        message: error?.message ?? String(error)
      })
    );
  }

  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

