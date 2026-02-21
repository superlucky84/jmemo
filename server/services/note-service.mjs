import { isValidObjectId } from "mongoose";
import { createApiError } from "../errors.mjs";
import {
  escapeRegExp,
  parseSearchTokens,
  serializeNote,
  toTagArray
} from "../utils/note-utils.mjs";

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

  return {
    page,
    pageSize
  };
}

function ensureValidNoteId(id) {
  if (!isValidObjectId(id)) {
    throw createApiError("INVALID_ID_FORMAT", {
      message: "Invalid note id format",
      details: { field: "id" }
    });
  }
}

function ensureRequiredTitle(title) {
  if (typeof title !== "string" || !title.trim()) {
    throw createApiError("MISSING_REQUIRED_FIELD", {
      message: "title is required",
      details: { field: "title" }
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

function normalizeSearchFilter(searchString) {
  const tokens = parseSearchTokens(searchString);
  if (tokens.length === 0) {
    return {};
  }

  const titlePattern = new RegExp(tokens.map(escapeRegExp).join("|"), "i");

  return {
    $or: [{ title: titlePattern }, { category: { $in: tokens } }]
  };
}

export function createNoteService(options = {}) {
  const {
    JmemoModel
  } = options;

  if (!JmemoModel) {
    throw new Error("JmemoModel is required for createNoteService");
  }

  return {
    async createNote(payload) {
      ensureRequiredTitle(payload.title);

      const note = new JmemoModel({
        title: payload.title.trim(),
        note: String(payload.note ?? ""),
        favorite: false,
        category: toTagArray(payload.category)
      });

      await note.save();
      return serializeNote(note);
    },

    async listNotes(query) {
      const pagination = parsePaginationOptions(query);
      const filter = normalizeSearchFilter(query.searchString);
      const sort = { favorite: -1, moddate: -1, _id: -1 };

      if (!pagination) {
        const items = await JmemoModel.find(filter).sort(sort).lean();
        return items.map(serializeNote);
      }

      const skip = (pagination.page - 1) * pagination.pageSize;
      const [items, total] = await Promise.all([
        JmemoModel.find(filter).sort(sort).skip(skip).limit(pagination.pageSize).lean(),
        JmemoModel.countDocuments(filter)
      ]);

      return {
        items: items.map(serializeNote),
        page: pagination.page,
        pageSize: pagination.pageSize,
        total,
        hasNext: pagination.page * pagination.pageSize < total
      };
    },

    async getNoteById(id) {
      ensureValidNoteId(id);

      const note = await JmemoModel.findOne(
        { _id: id },
        { title: 1, note: 1, category: 1 }
      ).lean();

      if (!note) {
        throw createApiError("NOTE_NOT_FOUND", {
          message: "Note not found",
          details: { id }
        });
      }

      return serializeNote(note);
    },

    async updateNote(payload) {
      ensureValidNoteId(payload.id);

      const note = await JmemoModel.findById(payload.id);

      if (!note) {
        throw createApiError("NOTE_NOT_FOUND", {
          message: "Note not found",
          details: { id: payload.id }
        });
      }

      const nextFavorite = normalizeFavorite(payload.favorite);

      if (nextFavorite !== undefined) {
        note.favorite = nextFavorite;
      }

      const hasEditableField =
        payload.title !== undefined || payload.note !== undefined || payload.category !== undefined;

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

        note.moddate = new Date();
      }

      await note.save();

      return serializeNote(note);
    },

    async deleteNote(id) {
      ensureValidNoteId(id);

      const note = await JmemoModel.findById(id);

      if (!note) {
        throw createApiError("NOTE_NOT_FOUND", {
          message: "Note not found",
          details: { id }
        });
      }

      await JmemoModel.deleteOne({ _id: id });

      return {
        result: true
      };
    }
  };
}
