import { describe, expect, it } from "vitest";
import { createMemoryNoteService } from "../../server/services/memory-note-service.mjs";

describe("createMemoryNoteService", () => {
  it("supports create, read, update, delete lifecycle", async () => {
    const service = createMemoryNoteService();

    const created = await service.createNote({
      title: "alpha",
      note: "hello",
      category: ["TagA"]
    });
    expect(created._id).toMatch(/^[0-9a-f]{24}$/);
    expect(created.category).toEqual(["taga"]);

    const readOne = await service.getNoteById(created._id);
    expect(readOne.title).toBe("alpha");

    const updated = await service.updateNote({
      id: created._id,
      note: "updated",
      favorite: true
    });
    expect(updated.favorite).toBe(true);
    expect(updated.note).toBe("updated");

    const deleted = await service.deleteNote(created._id);
    expect(deleted).toEqual({ result: true });
  });

  it("supports OR tag search and pagination", async () => {
    const service = createMemoryNoteService();

    await service.createNote({
      title: "first",
      note: "1",
      category: ["alpha"]
    });
    await service.createNote({
      title: "second",
      note: "2",
      category: ["beta"]
    });

    const searched = await service.listNotes({ searchString: "alpha gamma" });
    expect(searched).toHaveLength(1);
    expect(searched[0].title).toBe("first");

    const paged = await service.listNotes({ page: 1, pageSize: 1 });
    expect(paged.items).toHaveLength(1);
    expect(paged.page).toBe(1);
    expect(paged.pageSize).toBe(1);
    expect(paged.total).toBe(2);
  });
});
