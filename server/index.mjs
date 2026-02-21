import { resolve } from "node:path";
import { createApp } from "./app.mjs";
import { resolveAppEnv } from "../src/shared/env.mjs";
import { connectMongo, disconnectMongo, pingMongo } from "./db.mjs";
import { toSafeLogLine } from "./logger.mjs";
import { JmemoModel } from "./models/jmemo-model.mjs";
import { createNoteService } from "./services/note-service.mjs";
import { runOrphanImageCleanup, scheduleOrphanImageCleanup } from "./services/orphan-image-cleaner.mjs";
import { createMemoryNoteService } from "./services/memory-note-service.mjs";

const config = resolveAppEnv(process.env, { requireMongoUri: false });
const uploadRootDir = resolve(process.cwd(), config.uploadDir);

if (!config.useMemoryService && config.mongoUri) {
  try {
    await connectMongo(config.mongoUri);
  } catch (error) {
    console.error(
      toSafeLogLine({
        time: new Date().toISOString(),
        level: "error",
        event: "db_connect_failed",
        message: error?.message ?? String(error)
      })
    );
    process.exit(1);
  }
}

const noteService = config.useMemoryService
  ? createMemoryNoteService({
      imagesRootDir: uploadRootDir,
      logger: console
    })
  : createNoteService({
      JmemoModel,
      imagesRootDir: uploadRootDir,
      logger: console
    });

let stopOrphanImageCleanupScheduler = () => {};

if (!config.useMemoryService && config.mongoUri) {
  void runOrphanImageCleanup({
    JmemoModel,
    imagesRootDir: uploadRootDir,
    logger: console,
    reason: "startup"
  });

  stopOrphanImageCleanupScheduler = scheduleOrphanImageCleanup({
    runCleanup: async () => {
      await runOrphanImageCleanup({
        JmemoModel,
        imagesRootDir: uploadRootDir,
        logger: console,
        reason: "interval"
      });
    },
    logger: console
  });
}

const app = createApp({
  noteService,
  uploadRootDir,
  readinessCheck: async () => {
    if (config.useMemoryService) {
      return {
        ok: true,
        mode: "memory"
      };
    }

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
    toSafeLogLine({
      time: new Date().toISOString(),
      level: "info",
      event: "server_started",
      port: config.port,
      uploadDir: uploadRootDir,
      logLevel: config.logLevel,
      dataMode: config.useMemoryService ? "memory" : "atlas"
    })
  );
});

async function shutdown(signal) {
  console.log(
    toSafeLogLine({
      time: new Date().toISOString(),
      level: "info",
      event: "server_shutdown",
      signal
    })
  );

  await new Promise((resolvePromise) => {
    server.close(() => resolvePromise());
  });

  stopOrphanImageCleanupScheduler();

  try {
    await disconnectMongo();
  } catch (error) {
    console.error(
      toSafeLogLine({
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
