// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "lithent";
import { NotesApp } from "../../src/app/notes-app";
import { NotesApiError } from "../../src/features/notes/api/notes-api";

const activeUnmounts: Array<() => void> = [];

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

function createBaseApi(overrides: Record<string, unknown> = {}) {
  return {
    async listNotes() {
      return [];
    },
    async listNotesPaged() {
      return {
        items: [],
        page: 1,
        pageSize: 30,
        total: 0,
        hasNext: false
      };
    },
    async getNote() {
      return {
        _id: "000000000000000000000001",
        title: "sample",
        note: "sample",
        category: []
      };
    },
    async createNote() {
      return {
        _id: "000000000000000000000001",
        title: "created",
        note: "created",
        category: [],
        favorite: false
      };
    },
    async updateNote() {
      return {
        _id: "000000000000000000000001",
        title: "updated",
        note: "updated",
        category: [],
        favorite: false
      };
    },
    async deleteNote() {
      return { result: true };
    },
    async uploadImage() {
      return { filepath: "images/20260221/sample.png" };
    },
    ...overrides
  };
}

afterEach(() => {
  while (activeUnmounts.length) {
    activeUnmounts.pop()?.();
  }
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("NotesApp behavior", () => {
  it("calls list API with entered search text", async () => {
    const listNotes = vi.fn(async () => []);
    const app = <NotesApp api={createBaseApi({ listNotes })} />;
    const container = document.createElement("div");
    document.body.appendChild(container);
    activeUnmounts.push(render(app, container));
    await flushMicrotasks();

    const searchInput = container.querySelector(".search-input") as HTMLInputElement;
    const searchButton = [...container.querySelectorAll(".button")].find(
      (element) => element.textContent?.trim() === "Search"
    ) as HTMLButtonElement;

    searchInput.value = "tag1 tag2";
    searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    searchButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushMicrotasks();

    expect(listNotes).toHaveBeenLastCalledWith({ searchString: "tag1 tag2" });
  });

  it("keeps editor content when save fails", async () => {
    const createNote = vi.fn(async () => {
      throw new NotesApiError(500, {
        code: "FILE_SAVE_FAILED",
        message: "save failed",
        retryable: true
      });
    });

    const app = <NotesApp api={createBaseApi({ createNote })} />;
    const container = document.createElement("div");
    document.body.appendChild(container);
    activeUnmounts.push(render(app, container));
    await flushMicrotasks();

    const newButton = [...container.querySelectorAll(".button")].find(
      (element) => element.textContent?.trim() === "New"
    ) as HTMLButtonElement;
    newButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushMicrotasks();

    const titleInput = container.querySelector(".text-input") as HTMLInputElement;
    const noteInput = container.querySelector(".note-input") as HTMLTextAreaElement;
    const saveButton = [...container.querySelectorAll(".button")].find(
      (element) => element.textContent?.trim() === "Save"
    ) as HTMLButtonElement;

    titleInput.value = "draft title";
    titleInput.dispatchEvent(new Event("input", { bubbles: true }));
    noteInput.value = "draft body";
    noteInput.dispatchEvent(new Event("input", { bubbles: true }));

    saveButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushMicrotasks();

    expect(createNote).toHaveBeenCalled();
    expect((container.querySelector(".text-input") as HTMLInputElement).value).toBe("draft title");
    expect((container.querySelector(".note-input") as HTMLTextAreaElement).value).toBe("draft body");
    expect(container.textContent).toContain("FILE_SAVE_FAILED: save failed");
  });

  it("uploads dropped image and inserts markdown into editor content", async () => {
    const uploadImage = vi.fn(async () => ({ filepath: "images/20260221/sample.png" }));

    const app = <NotesApp api={createBaseApi({ uploadImage })} />;
    const container = document.createElement("div");
    document.body.appendChild(container);
    activeUnmounts.push(render(app, container));
    await flushMicrotasks();

    const newButton = [...container.querySelectorAll(".button")].find(
      (element) => element.textContent?.trim() === "New"
    ) as HTMLButtonElement;
    newButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushMicrotasks();

    const dropTarget = container.querySelector(".monaco-vim-wrapper") as HTMLElement;
    const dropEvent = new Event("drop", {
      bubbles: true,
      cancelable: true
    }) as Event & { dataTransfer?: { files: File[] } };
    const file = new File([new Uint8Array([1, 2, 3])], "sample.png", {
      type: "image/png"
    });
    Object.defineProperty(dropEvent, "dataTransfer", {
      configurable: true,
      enumerable: true,
      value: {
        files: [file]
      }
    });

    dropTarget.dispatchEvent(dropEvent);
    await flushMicrotasks();
    await flushMicrotasks();

    const noteInput = container.querySelector(".note-input") as HTMLTextAreaElement;
    expect(uploadImage).toHaveBeenCalledTimes(1);
    expect(noteInput.value).toContain("![sample](images/20260221/sample.png)");
  });
});
