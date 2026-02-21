const MONGODB_URI_PATTERN = /(mongodb(?:\+srv)?:\/\/[^:\s@/]+:)([^@\s/]+)(@)/gi;
const BEARER_TOKEN_PATTERN = /(Bearer\s+)([A-Za-z0-9._\-]+)/gi;

const SENSITIVE_KEYWORDS = [
  "mongodb_uri",
  "uri",
  "token",
  "password",
  "passwd",
  "pwd",
  "authorization",
  "cookie",
  "set-cookie"
];

function isObject(value) {
  return typeof value === "object" && value !== null;
}

function shouldMaskKey(key) {
  const normalized = String(key).toLowerCase();
  return SENSITIVE_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function maskString(value) {
  return String(value)
    .replace(MONGODB_URI_PATTERN, "$1***$3")
    .replace(BEARER_TOKEN_PATTERN, "$1***");
}

export function maskSensitive(value) {
  if (typeof value === "string") {
    return maskString(value);
  }

  if (!isObject(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => maskSensitive(item));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (shouldMaskKey(key)) {
        return [key, "[REDACTED]"];
      }
      return [key, maskSensitive(item)];
    })
  );
}

export function toSafeLogLine(payload) {
  if (typeof payload === "string") {
    return maskString(payload);
  }

  return JSON.stringify(maskSensitive(payload));
}
