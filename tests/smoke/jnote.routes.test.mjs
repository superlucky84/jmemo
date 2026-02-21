import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../server/app.mjs";
import { createApiError } from "../../server/errors.mjs";

function isValidHexObjectId(value) {
  return typeof value === "string" && /^[0-9a-f]{24}$/i.test(value);
}

function normalizeTags(input) {
  const values = Array.isArray(input) ? input : input != null ? [input] : [];
  return [...new Set(values.map((item) => String(item).trim().toLowerCase()).filter(Boolean))];
}

function createMemoryNoteService() {
  const store = new Map();
  let sequence = 1;

  function nextId() {
    const id = sequence.toString(16).padStart(24, "0");
    sequence += 1;
    return id;
  }

  return {
    async createNote(payload) {
      if (!payload.title || !String(payload.title).trim()) {
        throw createApiError("MISSING_REQUIRED_FIELD", {
          message: "title is required",
          details: { field: "title" }
        });
      }

      const now = new Date().toISOString();
      const note = {
        _id: nextId(),
        title: String(payload.title).trim(),
        note: String(payload.note ?? ""),
        favorite: false,
        category: normalizeTags(payload.category),
        regdate: now,
        moddate: now
      };

      store.set(note._id, note);
      return { ...note };
    },

    async listNotes() {
      return [...store.values()].sort((a, b) => {
        if (a.favorite !== b.favorite) {
          return Number(b.favorite) - Number(a.favorite);
        }

        if (a.moddate !== b.moddate) {
          return b.moddate.localeCompare(a.moddate);
        }

        return b._id.localeCompare(a._id);
      });
    },

    async getNoteById(id) {
      if (!isValidHexObjectId(id)) {
        throw createApiError("INVALID_ID_FORMAT", {
          message: "Invalid note id format",
          details: { field: "id" }
        });
      }

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
        category: note.category
      };
    },

    async updateNote(payload) {
      if (!isValidHexObjectId(payload.id)) {
        throw createApiError("INVALID_ID_FORMAT", {
          message: "Invalid note id format",
          details: { field: "id" }
        });
      }

      const note = store.get(payload.id);
      if (!note) {
        throw createApiError("NOTE_NOT_FOUND", {
          message: "Note not found",
          details: { id: payload.id }
        });
      }

      if (payload.favorite !== undefined) {
        note.favorite = Boolean(payload.favorite);
      }

      if (payload.title !== undefined) {
        note.title = String(payload.title);
      }

      if (payload.note !== undefined) {
        note.note = String(payload.note);
      }

      if (payload.category !== undefined) {
        note.category = normalizeTags(payload.category);
      }

      note.moddate = new Date().toISOString();
      return { ...note };
    },

    async deleteNote(id) {
      if (!isValidHexObjectId(id)) {
        throw createApiError("INVALID_ID_FORMAT", {
          message: "Invalid note id format",
          details: { field: "id" }
        });
      }

      if (!store.has(id)) {
        throw createApiError("NOTE_NOT_FOUND", {
          message: "Note not found",
          details: { id }
        });
      }

      store.delete(id);
      return { result: true };
    }
  };
}

const tempDirs = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(async (dirPath) => {
      await rm(dirPath, { recursive: true, force: true });
    })
  );
});

describe("/jnote routes smoke", () => {
  it("supports create -> read list -> read one -> update -> delete", async () => {
    const uploadRootDir = await mkdtemp(join(tmpdir(), "jmemo-upload-"));
    tempDirs.push(uploadRootDir);
    const app = createApp({
      noteService: createMemoryNoteService(),
      uploadRootDir,
      readinessCheck: async () => ({ ok: true })
    });

    const created = await request(app).post("/jnote/create").send({
      title: "Hello",
      note: "World",
      category: ["TagA", "TagB"]
    });
    expect(created.status).toBe(200);
    expect(created.body._id).toMatch(/^[0-9a-f]{24}$/);
    expect(created.body.category).toEqual(["taga", "tagb"]);

    const list = await request(app).get("/jnote/read");
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body)).toBe(true);
    expect(list.body).toHaveLength(1);

    const readOne = await request(app).get(`/jnote/read/${created.body._id}`);
    expect(readOne.status).toBe(200);
    expect(readOne.body.title).toBe("Hello");

    const updated = await request(app).post("/jnote/update").send({
      id: created.body._id,
      title: "Updated",
      note: "Changed",
      category: ["x"],
      favorite: true
    });
    expect(updated.status).toBe(200);
    expect(updated.body.title).toBe("Updated");
    expect(updated.body.favorite).toBe(true);

    const deleted = await request(app).post("/jnote/delete").send({
      id: created.body._id
    });
    expect(deleted.status).toBe(200);
    expect(deleted.body).toEqual({ result: true });
  });

  it("returns structured errors for invalid id and not found", async () => {
    const uploadRootDir = await mkdtemp(join(tmpdir(), "jmemo-upload-"));
    tempDirs.push(uploadRootDir);
    const app = createApp({
      noteService: createMemoryNoteService(),
      uploadRootDir,
      readinessCheck: async () => ({ ok: true })
    });

    const invalidId = await request(app).get("/jnote/read/not-an-object-id");
    expect(invalidId.status).toBe(400);
    expect(invalidId.body.error.code).toBe("INVALID_ID_FORMAT");
    expect(invalidId.body.ok).toBe(false);

    const notFound = await request(app)
      .post("/jnote/delete")
      .send({ id: "000000000000000000000001" });
    expect(notFound.status).toBe(404);
    expect(notFound.body.error.code).toBe("NOTE_NOT_FOUND");
    expect(notFound.body.ok).toBe(false);
  });

  it("accepts png upload and rejects svg / oversize files", async () => {
    const uploadRootDir = await mkdtemp(join(tmpdir(), "jmemo-upload-"));
    tempDirs.push(uploadRootDir);
    const app = createApp({
      noteService: createMemoryNoteService(),
      uploadRootDir,
      readinessCheck: async () => ({ ok: true })
    });

    const pngSignature = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d
    ]);
    const uploaded = await request(app)
      .post("/jnote/upload")
      .attach("pict", pngSignature, "ok.png");
    expect(uploaded.status).toBe(200);
    expect(uploaded.body.filepath).toMatch(/^images\/\d{8}\/.+\.png$/);

    const svg = await request(app)
      .post("/jnote/upload")
      .attach("pict", Buffer.from("<svg></svg>"), "bad.svg");
    expect(svg.status).toBe(415);
    expect(svg.body.error.code).toBe("UNSUPPORTED_MEDIA_TYPE");

    const largeBuffer = Buffer.alloc(10 * 1024 * 1024 + 1, 1);
    const oversized = await request(app)
      .post("/jnote/upload")
      .attach("pict", largeBuffer, "too-large.png");
    expect(oversized.status).toBe(413);
    expect(oversized.body.error.code).toBe("FILE_TOO_LARGE");
  });
});

