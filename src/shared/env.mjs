const ALLOWED_LOG_LEVELS = new Set(["debug", "info", "warn", "error"]);

export function validateMongoUri(rawValue) {
  const uri = (rawValue ?? "").trim();

  if (!uri) {
    throw new Error("Missing MONGODB_URI in .env");
  }

  if (!uri.startsWith("mongodb+srv://")) {
    throw new Error("MONGODB_URI must start with mongodb+srv://");
  }

  if (uri.includes("<db_password>") || uri.includes("<URL_ENCODED_PASSWORD>")) {
    throw new Error("Replace password placeholder in MONGODB_URI before running the app.");
  }

  return uri;
}

export function parsePort(rawValue, fallback = 4000) {
  const value = (rawValue ?? "").trim();

  if (!value) {
    return fallback;
  }

  const port = Number(value);

  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("PORT must be an integer between 0 and 65535.");
  }

  return port;
}

export function parseUploadDir(rawValue, fallback = "images") {
  const uploadDir = (rawValue ?? "").trim();
  return uploadDir || fallback;
}

export function parseLogLevel(rawValue, fallback = "info") {
  const normalized = (rawValue ?? "").trim().toLowerCase();

  if (!normalized) {
    return fallback;
  }

  if (!ALLOWED_LOG_LEVELS.has(normalized)) {
    throw new Error(
      `LOG_LEVEL must be one of: ${Array.from(ALLOWED_LOG_LEVELS).join(", ")}.`
    );
  }

  return normalized;
}

export function resolveAppEnv(rawEnv = process.env, options = {}) {
  const { requireMongoUri = true } = options;
  const mongoUriRaw = rawEnv.MONGODB_URI;
  const mongoUri = requireMongoUri
    ? validateMongoUri(mongoUriRaw)
    : mongoUriRaw
      ? validateMongoUri(mongoUriRaw)
      : null;

  return {
    mongoUri,
    port: parsePort(rawEnv.PORT),
    uploadDir: parseUploadDir(rawEnv.UPLOAD_DIR),
    logLevel: parseLogLevel(rawEnv.LOG_LEVEL)
  };
}

