import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../server/app.mjs";
import { createAuthService } from "../../server/auth.mjs";
import { createApiError } from "../../server/errors.mjs";
import { API_ERROR_STATUS } from "../fixtures/api-errors.fixture.mjs";

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

      if (payload.favorite !== undefined && typeof payload.favorite !== "boolean") {
        throw createApiError("VALIDATION_ERROR", {
          message: "favorite must be boolean",
          details: { field: "favorite" }
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
    expect(invalidId.status).toBe(API_ERROR_STATUS.INVALID_ID_FORMAT);
    expect(invalidId.body.error.code).toBe("INVALID_ID_FORMAT");
    expect(invalidId.body.ok).toBe(false);

    const notFound = await request(app)
      .post("/jnote/delete")
      .send({ id: "000000000000000000000001" });
    expect(notFound.status).toBe(API_ERROR_STATUS.NOTE_NOT_FOUND);
    expect(notFound.body.error.code).toBe("NOTE_NOT_FOUND");
    expect(notFound.body.ok).toBe(false);
  });

  it("returns validation error codes for bad payloads", async () => {
    const uploadRootDir = await mkdtemp(join(tmpdir(), "jmemo-upload-"));
    tempDirs.push(uploadRootDir);
    const app = createApp({
      noteService: createMemoryNoteService(),
      uploadRootDir,
      readinessCheck: async () => ({ ok: true })
    });

    const missingTitle = await request(app).post("/jnote/create").send({
      note: "x"
    });
    expect(missingTitle.status).toBe(API_ERROR_STATUS.MISSING_REQUIRED_FIELD);
    expect(missingTitle.body.error.code).toBe("MISSING_REQUIRED_FIELD");

    const created = await request(app).post("/jnote/create").send({
      title: "title",
      note: "note"
    });
    expect(created.status).toBe(200);

    const invalidFavorite = await request(app).post("/jnote/update").send({
      id: created.body._id,
      favorite: "invalid"
    });
    expect(invalidFavorite.status).toBe(API_ERROR_STATUS.VALIDATION_ERROR);
    expect(invalidFavorite.body.error.code).toBe("VALIDATION_ERROR");

    const missingFile = await request(app).post("/jnote/upload");
    expect(missingFile.status).toBe(API_ERROR_STATUS.MISSING_REQUIRED_FIELD);
    expect(missingFile.body.error.code).toBe("MISSING_REQUIRED_FIELD");
  });

  it("protects write routes when auth is enabled", async () => {
    const uploadRootDir = await mkdtemp(join(tmpdir(), "jmemo-upload-"));
    tempDirs.push(uploadRootDir);
    const app = createApp({
      noteService: createMemoryNoteService(),
      uploadRootDir,
      readinessCheck: async () => ({ ok: true }),
      authService: createAuthService({
        password: "test-password"
      })
    });

    const unauthCreate = await request(app).post("/jnote/create").send({
      title: "blocked",
      note: "blocked"
    });
    expect(unauthCreate.status).toBe(API_ERROR_STATUS.UNAUTHORIZED);
    expect(unauthCreate.body.error.code).toBe("UNAUTHORIZED");

    const agent = request.agent(app);
    const badLogin = await agent.post("/auth/login").send({ password: "wrong" });
    expect(badLogin.status).toBe(API_ERROR_STATUS.UNAUTHORIZED);

    const login = await agent.post("/auth/login").send({ password: "test-password" });
    expect(login.status).toBe(200);
    expect(login.body.authenticated).toBe(true);

    const createAfterLogin = await agent.post("/jnote/create").send({
      title: "allowed",
      note: "after login"
    });
    expect(createAfterLogin.status).toBe(200);

    const meAfterLogin = await agent.get("/auth/me");
    expect(meAfterLogin.status).toBe(200);
    expect(meAfterLogin.body.authenticated).toBe(true);

    const logout = await agent.post("/auth/logout");
    expect(logout.status).toBe(200);
    expect(logout.body.authenticated).toBe(false);

    const blockedAgain = await agent.post("/jnote/delete").send({
      id: createAfterLogin.body._id
    });
    expect(blockedAgain.status).toBe(API_ERROR_STATUS.UNAUTHORIZED);
    expect(blockedAgain.body.error.code).toBe("UNAUTHORIZED");
  });

  it("expires authenticated session after ttl and blocks write routes again", async () => {
    const uploadRootDir = await mkdtemp(join(tmpdir(), "jmemo-upload-"));
    tempDirs.push(uploadRootDir);
    const app = createApp({
      noteService: createMemoryNoteService(),
      uploadRootDir,
      readinessCheck: async () => ({ ok: true }),
      authService: createAuthService({
        password: "test-password",
        sessionTtlMs: 5
      })
    });

    const agent = request.agent(app);
    const login = await agent.post("/auth/login").send({ password: "test-password" });
    expect(login.status).toBe(200);

    await new Promise((resolve) => {
      setTimeout(resolve, 25);
    });

    const meAfterExpiry = await agent.get("/auth/me");
    expect(meAfterExpiry.status).toBe(200);
    expect(meAfterExpiry.body.authenticated).toBe(false);

    const blockedCreate = await agent.post("/jnote/create").send({
      title: "blocked-after-expiry",
      note: "blocked"
    });
    expect(blockedCreate.status).toBe(API_ERROR_STATUS.UNAUTHORIZED);
    expect(blockedCreate.body.error.code).toBe("UNAUTHORIZED");
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
    expect(svg.status).toBe(API_ERROR_STATUS.UNSUPPORTED_MEDIA_TYPE);
    expect(svg.body.error.code).toBe("UNSUPPORTED_MEDIA_TYPE");

    const largeBuffer = Buffer.alloc(10 * 1024 * 1024 + 1, 1);
    const oversized = await request(app)
      .post("/jnote/upload")
      .attach("pict", largeBuffer, "too-large.png");
    expect(oversized.status).toBe(API_ERROR_STATUS.FILE_TOO_LARGE);
    expect(oversized.body.error.code).toBe("FILE_TOO_LARGE");
  });
});
