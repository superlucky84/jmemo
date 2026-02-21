import { readdir, rm, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { extractImagePathsFromNote } from "../utils/note-utils.mjs";
import { toSafeLogLine } from "../logger.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;

function normalizeSlash(pathString) {
  return pathString.replace(/\\/g, "/");
}

async function walkImageFiles(rootDir) {
  const queue = [rootDir];
  const files = [];

  while (queue.length > 0) {
    const current = queue.shift();
    const entries = await readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      const absolutePath = join(current, entry.name);

      if (entry.isDirectory()) {
        queue.push(absolutePath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const relativePath = normalizeSlash(relative(rootDir, absolutePath));
      const fileStat = await stat(absolutePath);

      files.push({
        absolutePath,
        relativePath: `images/${relativePath}`,
        mtimeMs: fileStat.mtimeMs
      });
    }
  }

  return files;
}

export function selectOrphanImages({
  files,
  referencedPaths,
  now = Date.now(),
  protectionMs = DAY_MS
}) {
  const referencedSet = new Set(referencedPaths);

  return files.filter((file) => {
    if (referencedSet.has(file.relativePath)) {
      return false;
    }

    return now - file.mtimeMs >= protectionMs;
  });
}

export async function collectReferencedImagePaths({ JmemoModel }) {
  const docs = await JmemoModel.find({}, { note: 1 }).lean();
  const paths = new Set();

  docs.forEach((doc) => {
    extractImagePathsFromNote(doc.note).forEach((path) => paths.add(path));
  });

  return paths;
}

export async function runOrphanImageCleanup({
  JmemoModel,
  imagesRootDir,
  logger = console,
  reason = "manual",
  protectionMs = DAY_MS
}) {
  const normalizedRoot = resolve(imagesRootDir);

  let files = [];
  try {
    files = await walkImageFiles(normalizedRoot);
  } catch (error) {
    logger.warn?.(
      toSafeLogLine({
        time: new Date().toISOString(),
        level: "warn",
        event: "orphan_cleanup_skipped",
        reason,
        message: error?.message ?? String(error)
      })
    );
    return {
      scanned: 0,
      deleted: 0,
      failed: 0
    };
  }

  const referencedPaths = await collectReferencedImagePaths({ JmemoModel });
  const candidates = selectOrphanImages({
    files,
    referencedPaths,
    protectionMs
  });

  let deleted = 0;
  let failed = 0;

  await Promise.all(
    candidates.map(async (candidate) => {
      try {
        await rm(candidate.absolutePath, { force: true });
        deleted += 1;
      } catch (error) {
        failed += 1;
        logger.warn?.(
          toSafeLogLine({
            time: new Date().toISOString(),
            level: "warn",
            event: "orphan_cleanup_failed",
            reason,
            path: candidate.relativePath,
            message: error?.message ?? String(error)
          })
        );
      }
    })
  );

  logger.info?.(
    toSafeLogLine({
      time: new Date().toISOString(),
      level: "info",
      event: "orphan_cleanup_completed",
      reason,
      scanned: files.length,
      candidates: candidates.length,
      deleted,
      failed
    })
  );

  return {
    scanned: files.length,
    candidates: candidates.length,
    deleted,
    failed
  };
}

export function scheduleOrphanImageCleanup({
  runCleanup,
  logger = console,
  intervalMs = DAY_MS
}) {
  const timer = setInterval(() => {
    void runCleanup().catch((error) => {
      logger.error?.(
        toSafeLogLine({
          time: new Date().toISOString(),
          level: "error",
          event: "orphan_cleanup_timer_failed",
          message: error?.message ?? String(error)
        })
      );
    });
  }, intervalMs);

  timer.unref?.();

  return () => {
    clearInterval(timer);
  };
}
