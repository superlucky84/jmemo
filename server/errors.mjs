import { toSafeLogLine } from "./logger.mjs";

const ERROR_REGISTRY = {
  VALIDATION_ERROR: { status: 400, retryable: false },
  INVALID_ID_FORMAT: { status: 400, retryable: false },
  MISSING_REQUIRED_FIELD: { status: 400, retryable: false },
  NOTE_NOT_FOUND: { status: 404, retryable: false },
  CONFLICT: { status: 409, retryable: false },
  FILE_TOO_LARGE: { status: 413, retryable: false },
  UNSUPPORTED_MEDIA_TYPE: { status: 415, retryable: false },
  INTERNAL_ERROR: { status: 500, retryable: false },
  FILE_SAVE_FAILED: { status: 500, retryable: true },
  DB_UNAVAILABLE: { status: 503, retryable: true },
  MIGRATION_IN_PROGRESS: { status: 503, retryable: true },
  NOT_FOUND: { status: 404, retryable: false }
};

export class ApiError extends Error {
  constructor(code, message, options = {}) {
    super(message || code);
    this.name = "ApiError";
    this.code = code;
    this.status = options.status;
    this.details = options.details;
    this.retryable = options.retryable;
  }
}

export function createApiError(code, options = {}) {
  return new ApiError(code, options.message, options);
}

function normalizeApiError(error) {
  if (error instanceof ApiError) {
    const fallback = ERROR_REGISTRY[error.code] ?? ERROR_REGISTRY.INTERNAL_ERROR;
    return {
      status: error.status ?? fallback.status,
      code: error.code,
      message: error.message || error.code,
      details: error.details,
      retryable: error.retryable ?? fallback.retryable
    };
  }

  if (error?.name === "CastError") {
    const fallback = ERROR_REGISTRY.INVALID_ID_FORMAT;
    return {
      status: fallback.status,
      code: "INVALID_ID_FORMAT",
      message: "Invalid id format",
      details: {
        path: error.path
      },
      retryable: fallback.retryable
    };
  }

  const fallback = ERROR_REGISTRY.INTERNAL_ERROR;
  return {
    status: fallback.status,
    code: "INTERNAL_ERROR",
    message: "Internal server error",
    details: undefined,
    retryable: fallback.retryable
  };
}

export function createErrorMiddleware(options = {}) {
  const logger = options.logger ?? console;

  return function errorMiddleware(error, req, res, _next) {
    const normalized = normalizeApiError(error);

    logger.error?.(
      toSafeLogLine({
        time: new Date().toISOString(),
        level: "error",
        requestId: req.requestId,
        route: req.originalUrl,
        status: normalized.status,
        code: normalized.code,
        message: normalized.message
      })
    );

    res.status(normalized.status).json({
      ok: false,
      error: {
        code: normalized.code,
        message: normalized.message,
        details: normalized.details,
        retryable: normalized.retryable,
        requestId: req.requestId
      }
    });
  };
}
