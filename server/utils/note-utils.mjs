import { rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { mkdirSync } from "node:fs";

const IMAGE_PATH_PATTERN = /!\[[^\]]*\]\((images\/[^)]+)\)/g;

export function ensureDirectory(pathString) {
  mkdirSync(pathString, { recursive: true, mode: 0o777 });
}

export function formatDatePath(date = new Date()) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}${month}${day}`;
}

export function toIsoDate(value) {
  if (!value) {
    return value;
  }

  return new Date(value).toISOString();
}

export function serializeNote(noteDocument) {
  if (!noteDocument) {
    return null;
  }

  const object = typeof noteDocument.toObject === "function" ? noteDocument.toObject() : noteDocument;
  const serialized = {
    ...object,
    _id: String(object._id)
  };

  if (serialized.regdate) {
    serialized.regdate = toIsoDate(serialized.regdate);
  }

  if (serialized.moddate) {
    serialized.moddate = toIsoDate(serialized.moddate);
  }

  return serialized;
}

export function toTagArray(input) {
  const array = Array.isArray(input) ? input : input != null ? [input] : [];
  return [...new Set(array.map((value) => String(value).trim().toLowerCase()).filter(Boolean))];
}

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseSearchTokens(searchString) {
  const raw = (searchString ?? "").trim();
  if (!raw) {
    return [];
  }

  return [...new Set(raw.split(/[\s,;:]+/).map((token) => token.trim().toLowerCase()).filter(Boolean))];
}

export function extractImagePathsFromNote(note) {
  const source = String(note ?? "");
  const paths = new Set();
  let match = IMAGE_PATH_PATTERN.exec(source);

  while (match) {
    const relativePath = match[1];

    if (relativePath.startsWith("images/")) {
      paths.add(relativePath);
    }

    match = IMAGE_PATH_PATTERN.exec(source);
  }

  return [...paths];
}

export function resolveImageAbsolutePath(imagesRootDir, relativeImagePath) {
  const normalizedRoot = resolve(imagesRootDir);
  const imageSuffix = relativeImagePath.replace(/^images\//, "");
  const absolutePath = resolve(join(normalizedRoot, imageSuffix));

  if (!absolutePath.startsWith(normalizedRoot)) {
    return null;
  }

  return absolutePath;
}

export async function cleanupRemovedImages({
  beforeNote,
  afterNote,
  imagesRootDir,
  logger = console
}) {
  const beforeImages = new Set(extractImagePathsFromNote(beforeNote));
  const afterImages = new Set(extractImagePathsFromNote(afterNote));

  const removeTargets = [...beforeImages].filter((path) => !afterImages.has(path));

  await Promise.all(
    removeTargets.map(async (relativePath) => {
      const absolutePath = resolveImageAbsolutePath(imagesRootDir, relativePath);
      if (!absolutePath) {
        return;
      }

      try {
        await rm(absolutePath, { force: true });
      } catch (error) {
        logger.warn?.(
          JSON.stringify({
            time: new Date().toISOString(),
            level: "warn",
            event: "image_cleanup_failed",
            relativePath,
            message: error?.message ?? String(error)
          })
        );
      }
    })
  );
}

export function ensureImagePathDirectory(imagesRootDir, relativePath) {
  const fullPath = join(imagesRootDir, dirname(relativePath.replace(/^images\//, "")));
  ensureDirectory(fullPath);
}
