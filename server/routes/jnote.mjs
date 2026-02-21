import { randomUUID } from "node:crypto";
import { extname, join, resolve } from "node:path";
import express from "express";
import multer from "multer";
import { createApiError } from "../errors.mjs";
import { ensureDirectory, formatDatePath } from "../utils/note-utils.mjs";

const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp"
]);

function normalizeCategoriesFromBody(body = {}) {
  const direct = body.category;
  const legacy = body["category[]"];

  if (direct !== undefined) {
    return direct;
  }

  return legacy;
}

function toUploadError(error) {
  if (error?.name === "ApiError") {
    return error;
  }

  if (error?.code === "LIMIT_FILE_SIZE") {
    return createApiError("FILE_TOO_LARGE", {
      message: "Uploaded file exceeds 10MB limit",
      details: {
        limit: MAX_UPLOAD_SIZE
      }
    });
  }

  if (error instanceof Error) {
    return createApiError("FILE_SAVE_FAILED", {
      message: error.message
    });
  }

  return error;
}

function buildUploader(uploadRootDir) {
  const storage = multer.diskStorage({
    destination(req, _file, callback) {
      const datePath = formatDatePath();
      const absoluteDir = join(uploadRootDir, datePath);
      ensureDirectory(absoluteDir);
      req.uploadDatePath = datePath;
      callback(null, absoluteDir);
    },
    filename(_req, file, callback) {
      const extension = extname(file.originalname ?? "").toLowerCase();
      callback(null, `${randomUUID()}${extension}`);
    }
  });

  const fileFilter = (_req, file, callback) => {
    const extension = extname(file.originalname ?? "").toLowerCase();
    const mimeType = String(file.mimetype ?? "").toLowerCase();

    if (!ALLOWED_EXTENSIONS.has(extension) || !ALLOWED_MIME_TYPES.has(mimeType)) {
      callback(
        createApiError("UNSUPPORTED_MEDIA_TYPE", {
          message: "Only jpg, jpeg, png, gif, and webp are allowed",
          details: {
            extension,
            mimeType
          }
        })
      );
      return;
    }

    callback(null, true);
  };

  return multer({
    storage,
    fileFilter,
    limits: {
      fileSize: MAX_UPLOAD_SIZE
    }
  });
}

function asyncRoute(handler) {
  return async function wrapped(req, res, next) {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

export function createJnoteRouter(options = {}) {
  const { noteService, uploadRootDir = resolve(process.cwd(), "images") } = options;

  if (!noteService) {
    throw new Error("noteService is required for createJnoteRouter");
  }

  const router = express.Router();
  const uploader = buildUploader(uploadRootDir);

  router.post(
    "/create",
    asyncRoute(async (req, res) => {
      const created = await noteService.createNote({
        title: req.body.title,
        note: req.body.note,
        category: normalizeCategoriesFromBody(req.body)
      });

      res.json(created);
    })
  );

  router.get(
    "/read",
    asyncRoute(async (req, res) => {
      const result = await noteService.listNotes({
        searchString: req.query.searchString,
        page: req.query.page,
        pageSize: req.query.pageSize
      });

      res.json(result);
    })
  );

  router.get(
    "/read/:id",
    asyncRoute(async (req, res) => {
      const note = await noteService.getNoteById(req.params.id);
      res.json(note);
    })
  );

  router.post(
    "/update",
    asyncRoute(async (req, res) => {
      const updated = await noteService.updateNote({
        id: req.body.id,
        title: req.body.title,
        note: req.body.note,
        favorite: req.body.favorite,
        category: normalizeCategoriesFromBody(req.body)
      });

      res.json(updated);
    })
  );

  router.post(
    "/delete",
    asyncRoute(async (req, res) => {
      const response = await noteService.deleteNote(req.body.id);
      res.json(response);
    })
  );

  router.post("/upload", (req, res, next) => {
    uploader.single("pict")(req, res, (error) => {
      if (error) {
        next(toUploadError(error));
        return;
      }

      if (!req.file) {
        next(
          createApiError("MISSING_REQUIRED_FIELD", {
            message: "pict file is required",
            details: {
              field: "pict"
            }
          })
        );
        return;
      }

      res.json({
        filepath: `images/${req.uploadDatePath}/${req.file.filename}`
      });
    });
  });

  return router;
}
