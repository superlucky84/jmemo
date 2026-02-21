import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../server/app.mjs";
import { createMemoryNoteService } from "../../server/services/memory-note-service.mjs";
import { notesApi } from "../../src/features/notes/api/notes-api";

function normalizePath(input) {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    const url = new URL(raw);
    return `${url.pathname}${url.search}`;
  }

  return raw;
}

function toHeadersObject(headers) {
  if (!headers) {
    return {};
  }

  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }

  return headers;
}

function createFetchAdapter(app) {
  return async function appFetch(input, init = {}) {
    const method = (init.method ?? "GET").toUpperCase();
    const path = normalizePath(input);
    const headers = toHeadersObject(init.headers);
    let requester = request(app)[method.toLowerCase()](path);

    Object.entries(headers).forEach(([key, value]) => {
      requester = requester.set(key, value);
    });

    if (init.body instanceof FormData) {
      for (const [name, value] of init.body.entries()) {
        if (typeof value === "string") {
          requester = requester.field(name, value);
          continue;
        }

        if (value instanceof File) {
          const binary = Buffer.from(await value.arrayBuffer());
          requester = requester.attach(name, binary, value.name || "file.bin");
        }
      }
    } else if (typeof init.body === "string") {
      requester = requester.send(init.body);
    } else if (init.body != null) {
      requester = requester.send(init.body);
    }

    const response = await requester;
    const responseHeaders = new Headers();

    Object.entries(response.headers).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        responseHeaders.set(key, value.join(", "));
      } else if (value !== undefined) {
        responseHeaders.set(key, String(value));
      }
    });

    const payloadText =
      typeof response.body === "object" && response.body !== null && Object.keys(response.body).length > 0
        ? JSON.stringify(response.body)
        : String(response.text ?? "");

    return new Response(payloadText, {
      status: response.status,
      headers: responseHeaders
    });
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("notesApi integration with express backend", () => {
  it("runs create -> list -> get -> update -> delete flow end-to-end", async () => {
    const app = createApp({
      noteService: createMemoryNoteService(),
      readinessCheck: async () => ({ ok: true })
    });

    vi.stubGlobal("fetch", createFetchAdapter(app));

    const created = await notesApi.createNote({
      title: "integration-note",
      note: "hello integration",
      category: ["Phase7", "ClientServer"]
    });
    expect(created._id).toMatch(/^[0-9a-f]{24}$/);
    expect(created.category).toEqual(["phase7", "clientserver"]);

    const listed = await notesApi.listNotes({ searchString: "phase7 unknown" });
    expect(listed.some((item) => item._id === created._id)).toBe(true);

    const detail = await notesApi.getNote(created._id);
    expect(detail.note).toContain("integration");

    const updated = await notesApi.updateNote({
      id: created._id,
      note: "updated from integration",
      favorite: true
    });
    expect(updated.favorite).toBe(true);

    const deleted = await notesApi.deleteNote(created._id);
    expect(deleted).toEqual({ result: true });
  });
});
