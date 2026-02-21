import { createApiError } from "../errors.mjs";
import { cleanupRemovedImages, escapeRegExp, parseSearchTokens, serializeNote, toTagArray } from "../utils/note-utils.mjs";

function isValidHexObjectId(value) {
  return typeof value === "string" && /^[0-9a-f]{24}$/i.test(value);
}

function parsePaginationOptions(input = {}) {
  const hasPage = input.page !== undefined;
  const hasPageSize = input.pageSize !== undefined;

  if (!hasPage && !hasPageSize) {
    return null;
  }

  const page = Number(hasPage ? input.page : 1);
  const pageSize = Number(hasPageSize ? input.pageSize : 30);

  if (!Number.isInteger(page) || page < 1) {
    throw createApiError("VALIDATION_ERROR", {
      message: "page must be an integer >= 1",
      details: { field: "page" }
    });
  }

  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw createApiError("VALIDATION_ERROR", {
      message: "pageSize must be an integer between 1 and 100",
      details: { field: "pageSize" }
    });
  }

  return { page, pageSize };
}

function ensureRequiredTitle(title) {
  if (typeof title !== "string" || !title.trim()) {
    throw createApiError("MISSING_REQUIRED_FIELD", {
      message: "title is required",
      details: { field: "title" }
    });
  }
}

function ensureValidId(id) {
  if (!isValidHexObjectId(id)) {
    throw createApiError("INVALID_ID_FORMAT", {
      message: "Invalid note id format",
      details: { field: "id" }
    });
  }
}

function normalizeFavorite(value) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "off"].includes(normalized)) {
      return false;
    }
  }

  throw createApiError("VALIDATION_ERROR", {
    message: "favorite must be a boolean value",
    details: { field: "favorite" }
  });
}

function createIdGenerator() {
  let sequence = 1;

  return () => {
    const next = sequence.toString(16).padStart(24, "0");
    sequence += 1;
    return next;
  };
}

function matchesSearch(note, searchString) {
  const tokens = parseSearchTokens(searchString);
  if (tokens.length === 0) {
    return true;
  }

  const titlePattern = new RegExp(tokens.map(escapeRegExp).join("|"), "i");
  return titlePattern.test(note.title) || note.category.some((tag) => tokens.includes(tag));
}

function sortNotes(items) {
  return [...items].sort((a, b) => {
    if (a.favorite !== b.favorite) {
      return Number(b.favorite) - Number(a.favorite);
    }

    if (a.moddate !== b.moddate) {
      return b.moddate.localeCompare(a.moddate);
    }

    return b._id.localeCompare(a._id);
  });
}

export function createMemoryNoteService(options = {}) {
  const { imagesRootDir, logger = console } = options;
  const store = new Map();
  const nextId = createIdGenerator();

  return {
    async createNote(payload) {
      ensureRequiredTitle(payload.title);

      const now = new Date().toISOString();
      const note = {
        _id: nextId(),
        title: payload.title.trim(),
        note: String(payload.note ?? ""),
        category: toTagArray(payload.category),
        favorite: false,
        regdate: now,
        moddate: now
      };

      store.set(note._id, note);
      return serializeNote(note);
    },

    async listNotes(query = {}) {
      const pagination = parsePaginationOptions(query);
      const matched = sortNotes([...store.values()].filter((note) => matchesSearch(note, query.searchString)));

      if (!pagination) {
        return matched.map(serializeNote);
      }

      const skip = (pagination.page - 1) * pagination.pageSize;
      const paged = matched.slice(skip, skip + pagination.pageSize).map(serializeNote);
      return {
        items: paged,
        page: pagination.page,
        pageSize: pagination.pageSize,
        total: matched.length,
        hasNext: pagination.page * pagination.pageSize < matched.length
      };
    },

    async getNoteById(id) {
      ensureValidId(id);
      const note = store.get(id);

      if (!note) {
        throw createApiError("NOTE_NOT_FOUND", {
          message: "Note not found",
          details: { id }
        });
      }

      return {
        _id: note._id,
        title: note.title,
        note: note.note,
        category: [...note.category]
      };
    },

    async updateNote(payload) {
      ensureValidId(payload.id);
      const note = store.get(payload.id);

      if (!note) {
        throw createApiError("NOTE_NOT_FOUND", {
          message: "Note not found",
          details: { id: payload.id }
        });
      }

      const favorite = normalizeFavorite(payload.favorite);
      if (favorite !== undefined) {
        note.favorite = favorite;
      }

      const hasEditableField =
        payload.title !== undefined || payload.note !== undefined || payload.category !== undefined;
      const beforeNote = note.note;

      if (hasEditableField) {
        if (payload.title !== undefined) {
          ensureRequiredTitle(payload.title);
          note.title = payload.title.trim();
        }

        if (payload.note !== undefined) {
          note.note = String(payload.note ?? "");
        }

        if (payload.category !== undefined) {
          note.category = toTagArray(payload.category);
        }

        note.moddate = new Date().toISOString();
      }

      store.set(note._id, note);

      if (hasEditableField && imagesRootDir) {
        await cleanupRemovedImages({
          beforeNote,
          afterNote: note.note,
          imagesRootDir,
          logger
        });
      }

      return serializeNote(note);
    },

    async deleteNote(id) {
      ensureValidId(id);
      const note = store.get(id);

      if (!note) {
        throw createApiError("NOTE_NOT_FOUND", {
          message: "Note not found",
          details: { id }
        });
      }

      store.delete(id);

      if (imagesRootDir) {
        await cleanupRemovedImages({
          beforeNote: note.note,
          afterNote: "",
          imagesRootDir,
          logger
        });
      }

      return {
        result: true
      };
    }
  };
}
