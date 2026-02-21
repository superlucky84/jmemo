import { resolveAppEnv } from "../src/shared/env.mjs";

try {
  const config = resolveAppEnv(process.env, { requireMongoUri: true });

  console.log("MONGODB_URI is configured.");
  console.log(`PORT=${config.port}`);
  console.log(`UPLOAD_DIR=${config.uploadDir}`);
  console.log(`LOG_LEVEL=${config.logLevel}`);
  console.log(`JMEMO_USE_MEMORY_SERVICE=${config.useMemoryService}`);
} catch (error) {
  console.error(error?.message ?? error);
  process.exit(1);
}
