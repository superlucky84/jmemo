import { afterEach, describe, expect, it, vi } from "vitest";
import { NotesApiError, notesApi } from "../../src/features/notes/api/notes-api";

function createJsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("notesApi", () => {
  it("normalizes list response from array", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        createJsonResponse([
          {
            _id: "1",
            title: "A",
            category: ["TagA", "TagA"],
            favorite: false
          }
        ])
      )
    );

    const result = await notesApi.listNotes();

    expect(result).toHaveLength(1);
    expect(result[0].category).toEqual(["taga"]);
  });

  it("supports paged response shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        createJsonResponse({
          items: [
            {
              _id: "1",
              title: "A",
              category: ["x"],
              favorite: false
            }
          ],
          page: 2,
          pageSize: 1,
          total: 3,
          hasNext: true
        })
      )
    );

    const result = await notesApi.listNotesPaged({ page: 2, pageSize: 1 });

    expect(result.page).toBe(2);
    expect(result.total).toBe(3);
    expect(result.items[0]._id).toBe("1");
  });

  it("throws NotesApiError for structured backend errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        createJsonResponse(
          {
            ok: false,
            error: {
              code: "NOTE_NOT_FOUND",
              message: "missing",
              retryable: false
            }
          },
          404
        )
      )
    );

    await expect(notesApi.getNote("123")).rejects.toBeInstanceOf(NotesApiError);
    await expect(notesApi.getNote("123")).rejects.toMatchObject({
      status: 404,
      code: "NOTE_NOT_FOUND"
    });
  });
});

