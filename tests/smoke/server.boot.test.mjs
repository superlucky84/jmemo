import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { createApp } from "../../server/app.mjs";

function createDummyNoteService() {
  return {
    async createNote() {
      return {};
    },
    async listNotes() {
      return [];
    },
    async getNoteById() {
      return {};
    },
    async updateNote() {
      return {};
    },
    async deleteNote() {
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

describe("server boot smoke", () => {
  it("responds on /health/live and /health/ready", async () => {
    const app = createApp({
      noteService: createDummyNoteService(),
      readinessCheck: async () => ({ ok: true })
    });

    const live = await request(app).get("/health/live");
    const ready = await request(app).get("/health/ready");

    expect(live.status).toBe(200);
    expect(ready.status).toBe(200);
    expect(live.body.status).toBe("live");
    expect(ready.body.status).toBe("ready");
  });

  it("returns 503 from /health/ready when readiness fails", async () => {
    const app = createApp({
      noteService: createDummyNoteService(),
      readinessCheck: async () => ({
        ok: false,
        code: "DB_UNAVAILABLE",
        message: "db ping failed"
      })
    });

    const ready = await request(app).get("/health/ready");

    expect(ready.status).toBe(503);
    expect(ready.body.error.code).toBe("DB_UNAVAILABLE");
  });

  it("serves built frontend index from / when dist exists", async () => {
    const frontendDistDir = await mkdtemp(join(tmpdir(), "jmemo-dist-"));
    tempDirs.push(frontendDistDir);
    await writeFile(
      join(frontendDistDir, "index.html"),
      "<!doctype html><html><body>jmemo-frontend</body></html>",
      "utf8"
    );

    const app = createApp({
      noteService: createDummyNoteService(),
      readinessCheck: async () => ({ ok: true }),
      frontendDistDir
    });

    const root = await request(app).get("/");
    expect(root.status).toBe(200);
    expect(root.text).toContain("jmemo-frontend");

    const health = await request(app).get("/health/live");
    expect(health.status).toBe(200);
    expect(health.body.status).toBe("live");
  });
});
