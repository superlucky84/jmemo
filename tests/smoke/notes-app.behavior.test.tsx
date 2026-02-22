// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "lithent";
import { NotesApp } from "../../src/app/notes-app";
import { NotesApiError } from "../../src/features/notes/api/notes-api";
import type { AuthStatus } from "../../src/features/notes/types";

const activeUnmounts: Array<() => void> = [];

const toAuthStatus = (enabled: boolean, authenticated: boolean): AuthStatus => ({
  ok: true,
  enabled,
  authenticated
});

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

async function runFooterCommand(container: HTMLElement, command: string) {
  const input = container.querySelector(".command-input") as HTMLInputElement;
  const form = container.querySelector(".command-form") as HTMLFormElement;

  input.value = command;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

  await flushMicrotasks();
  await flushMicrotasks();
}

function createBaseApi(overrides: Record<string, unknown> = {}) {
  return {
    async getAuthStatus() {
      return toAuthStatus(false, true);
    },
    async login() {
      return toAuthStatus(true, true);
    },
    async logout() {
      return toAuthStatus(true, false);
    },
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

function createAuthProtectedApi(overrides: Record<string, unknown> = {}) {
  let authenticated = false;

  return createBaseApi({
    async getAuthStatus() {
      return toAuthStatus(true, authenticated);
    },
    async login(password: string) {
      if (password !== "pw") {
        throw new NotesApiError(401, {
          code: "UNAUTHORIZED",
          message: "Invalid password"
        });
      }

      authenticated = true;
      return toAuthStatus(true, true);
    },
    async logout() {
      authenticated = false;
      return toAuthStatus(true, false);
    },
    ...overrides
  });
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

  it("renders markdown as html in viewer and preview panes", async () => {
    const listNotes = vi.fn(async () => [
      {
        _id: "000000000000000000000001",
        title: "markdown note",
        category: [],
        favorite: false
      }
    ]);
    const getNote = vi.fn(async () => ({
      _id: "000000000000000000000001",
      title: "markdown note",
      note: "# Viewer Title\n\n**viewer-bold**",
      category: []
    }));

    const app = <NotesApp api={createBaseApi({ listNotes, getNote })} />;
    const container = document.createElement("div");
    document.body.appendChild(container);
    activeUnmounts.push(render(app, container));
    await flushMicrotasks();

    const noteButton = container.querySelector(".list-main") as HTMLButtonElement;
    noteButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushMicrotasks();

    const viewerHeading = container.querySelector(".viewer .note-preview h1");
    const viewerStrong = container.querySelector(".viewer .note-preview strong");
    expect(viewerHeading?.textContent).toBe("Viewer Title");
    expect(viewerStrong?.textContent).toBe("viewer-bold");

    const editButton = [...container.querySelectorAll(".button")].find(
      (element) => element.textContent?.trim() === "Edit"
    ) as HTMLButtonElement;
    editButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushMicrotasks();

    const noteInput = container.querySelector(".note-input") as HTMLTextAreaElement;
    noteInput.value = "# Preview Title\n\n**preview-bold**";
    noteInput.dispatchEvent(new Event("input", { bubbles: true }));
    await flushMicrotasks();

    const previewHeading = container.querySelector(".preview-panel .note-preview h1");
    const previewStrong = container.querySelector(".preview-panel .note-preview strong");
    expect(previewHeading?.textContent).toBe("Preview Title");
    expect(previewStrong?.textContent).toBe("preview-bold");
  });

  it("supports :e and :q commands from global footer in non-editor modes", async () => {
    const listNotes = vi.fn(async () => [
      {
        _id: "000000000000000000000001",
        title: "command note",
        category: [],
        favorite: false
      }
    ]);
    const getNote = vi.fn(async () => ({
      _id: "000000000000000000000001",
      title: "command note",
      note: "body",
      category: []
    }));

    const app = <NotesApp api={createBaseApi({ listNotes, getNote })} />;
    const container = document.createElement("div");
    document.body.appendChild(container);
    activeUnmounts.push(render(app, container));
    await flushMicrotasks();

    const noteButton = container.querySelector(".list-main") as HTMLButtonElement;
    noteButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushMicrotasks();

    await runFooterCommand(container, ":e");
    expect(container.querySelector(".editor-grid")).not.toBeNull();
    expect(container.querySelector(".command-feedback")?.textContent).toContain("Enter write mode.");

    await runFooterCommand(container, ":q");
    expect(container.querySelector(".viewer")).not.toBeNull();

    await runFooterCommand(container, ":q");
    expect(container.querySelector(".empty")).not.toBeNull();
  });

  it("focuses global footer command input on ':' shortcut", async () => {
    const app = <NotesApp api={createBaseApi()} />;
    const container = document.createElement("div");
    document.body.appendChild(container);
    activeUnmounts.push(render(app, container));
    await flushMicrotasks();

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: ":",
        bubbles: true
      })
    );
    await flushMicrotasks();

    const commandInput = container.querySelector(".command-input") as HTMLInputElement;
    expect(commandInput.value).toBe(":");
  });

  it("blocks unauthenticated write entry and prompts login", async () => {
    const createNote = vi.fn(async () => ({
      _id: "000000000000000000000001",
      title: "created",
      note: "created",
      category: [],
      favorite: false
    }));

    const app = <NotesApp api={createAuthProtectedApi({ createNote })} />;
    const container = document.createElement("div");
    document.body.appendChild(container);
    activeUnmounts.push(render(app, container));
    await flushMicrotasks();

    const newButton = [...container.querySelectorAll(".button")].find(
      (element) => element.textContent?.trim() === "New"
    ) as HTMLButtonElement;
    newButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushMicrotasks();

    expect(container.querySelector(".editor-grid")).toBeNull();
    expect(container.textContent).toContain("Login is required for write operations.");

    await runFooterCommand(container, ":e");
    expect(container.querySelector(".editor-grid")).toBeNull();
    expect(container.querySelector(".command-feedback")?.textContent).toContain("Login first");
    expect(createNote).not.toHaveBeenCalled();
  });

  it("allows :w save after login and keeps write mode", async () => {
    const createNote = vi.fn(async () => ({
      _id: "000000000000000000000001",
      title: "logged-in title",
      note: "logged-in body",
      category: ["auth"],
      favorite: false
    }));
    const getNote = vi.fn(async () => ({
      _id: "000000000000000000000001",
      title: "logged-in title",
      note: "logged-in body",
      category: ["auth"]
    }));

    const app = <NotesApp api={createAuthProtectedApi({ createNote, getNote })} />;
    const container = document.createElement("div");
    document.body.appendChild(container);
    activeUnmounts.push(render(app, container));
    await flushMicrotasks();

    const passwordInput = container.querySelector(".auth-form .text-input") as HTMLInputElement;
    const loginForm = container.querySelector(".auth-form") as HTMLFormElement;
    passwordInput.value = "pw";
    passwordInput.dispatchEvent(new Event("input", { bubbles: true }));
    loginForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flushMicrotasks();
    await flushMicrotasks();

    expect(container.textContent).toContain("Authenticated.");

    const newButton = [...container.querySelectorAll(".button")].find(
      (element) => element.textContent?.trim() === "New"
    ) as HTMLButtonElement;
    newButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushMicrotasks();

    const [titleInput, tagsInput] = [...container.querySelectorAll(".editor-panel .text-input")] as HTMLInputElement[];
    const noteInput = container.querySelector(".note-input") as HTMLTextAreaElement;
    titleInput.value = "logged-in title";
    titleInput.dispatchEvent(new Event("input", { bubbles: true }));
    tagsInput.value = "auth";
    tagsInput.dispatchEvent(new Event("input", { bubbles: true }));
    noteInput.value = "logged-in body";
    noteInput.dispatchEvent(new Event("input", { bubbles: true }));

    await runFooterCommand(container, ":w");
    await flushMicrotasks();
    await flushMicrotasks();

    expect(createNote).toHaveBeenCalledTimes(1);
    expect(container.querySelector(".editor-grid")).not.toBeNull();
    expect(container.querySelector(".command-feedback")?.textContent).toContain("Save note.");
  });

  it("keeps draft and requires re-login when save returns 401", async () => {
    let authenticated = true;
    const createNote = vi
      .fn()
      .mockRejectedValueOnce(
        new NotesApiError(401, {
          code: "UNAUTHORIZED",
          message: "Authentication required"
        })
      )
      .mockResolvedValueOnce({
        _id: "000000000000000000000001",
        title: "expired-session-title",
        note: "expired-session-body",
        category: [],
        favorite: false
      });

    const app = (
      <NotesApp
        api={createBaseApi({
          async getAuthStatus() {
            return toAuthStatus(true, authenticated);
          },
          async login(password: string) {
            if (password !== "pw") {
              throw new NotesApiError(401, {
                code: "UNAUTHORIZED",
                message: "Invalid password"
              });
            }

            authenticated = true;
            return toAuthStatus(true, true);
          },
          createNote
        })}
      />
    );

    const container = document.createElement("div");
    document.body.appendChild(container);
    activeUnmounts.push(render(app, container));
    await flushMicrotasks();

    const newButton = [...container.querySelectorAll(".button")].find(
      (element) => element.textContent?.trim() === "New"
    ) as HTMLButtonElement;
    newButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushMicrotasks();

    const [titleInput] = [...container.querySelectorAll(".editor-panel .text-input")] as HTMLInputElement[];
    const noteInput = container.querySelector(".note-input") as HTMLTextAreaElement;
    titleInput.value = "expired-session-title";
    titleInput.dispatchEvent(new Event("input", { bubbles: true }));
    noteInput.value = "expired-session-body";
    noteInput.dispatchEvent(new Event("input", { bubbles: true }));

    await runFooterCommand(container, ":w");
    await flushMicrotasks();
    await flushMicrotasks();

    expect(createNote).toHaveBeenCalledTimes(1);
    expect(noteInput.value).toBe("expired-session-body");
    expect(container.textContent).toContain("Session expired. Please login again.");
    expect(container.querySelector(".auth-form")).not.toBeNull();

    const passwordInput = container.querySelector(".auth-form .text-input") as HTMLInputElement;
    const loginForm = container.querySelector(".auth-form") as HTMLFormElement;
    passwordInput.value = "pw";
    passwordInput.dispatchEvent(new Event("input", { bubbles: true }));
    loginForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flushMicrotasks();
    await flushMicrotasks();

    await runFooterCommand(container, ":w");
    await flushMicrotasks();
    await flushMicrotasks();

    expect(createNote).toHaveBeenCalledTimes(2);
    expect(container.querySelector(".command-feedback")?.textContent).toContain("Save note.");
  });

  it("allows :wq after login and closes write pane", async () => {
    const createNote = vi.fn(async () => ({
      _id: "000000000000000000000001",
      title: "saved-with-wq",
      note: "saved-with-wq",
      category: [],
      favorite: false
    }));
    const getNote = vi.fn(async () => ({
      _id: "000000000000000000000001",
      title: "saved-with-wq",
      note: "saved-with-wq",
      category: []
    }));

    const app = <NotesApp api={createAuthProtectedApi({ createNote, getNote })} />;
    const container = document.createElement("div");
    document.body.appendChild(container);
    activeUnmounts.push(render(app, container));
    await flushMicrotasks();

    const passwordInput = container.querySelector(".auth-form .text-input") as HTMLInputElement;
    const loginForm = container.querySelector(".auth-form") as HTMLFormElement;
    passwordInput.value = "pw";
    passwordInput.dispatchEvent(new Event("input", { bubbles: true }));
    loginForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flushMicrotasks();
    await flushMicrotasks();

    const newButton = [...container.querySelectorAll(".button")].find(
      (element) => element.textContent?.trim() === "New"
    ) as HTMLButtonElement;
    newButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushMicrotasks();

    const [titleInput] = [...container.querySelectorAll(".editor-panel .text-input")] as HTMLInputElement[];
    const noteInput = container.querySelector(".note-input") as HTMLTextAreaElement;
    titleInput.value = "saved-with-wq";
    titleInput.dispatchEvent(new Event("input", { bubbles: true }));
    noteInput.value = "saved-with-wq";
    noteInput.dispatchEvent(new Event("input", { bubbles: true }));

    await runFooterCommand(container, ":wq");
    await flushMicrotasks();
    await flushMicrotasks();

    expect(createNote).toHaveBeenCalledTimes(1);
    expect(container.querySelector(".viewer")).not.toBeNull();
  });

  it("allows save and delete buttons after login", async () => {
    const createNote = vi.fn(async () => ({
      _id: "000000000000000000000001",
      title: "saved-by-button",
      note: "saved-by-button",
      category: [],
      favorite: false
    }));
    const deleteNote = vi.fn(async () => ({ result: true }));
    const listNotes = vi.fn(async () => [
      {
        _id: "000000000000000000000001",
        title: "existing",
        category: [],
        favorite: false
      }
    ]);
    const getNote = vi.fn(async () => ({
      _id: "000000000000000000000001",
      title: "existing",
      note: "existing",
      category: []
    }));

    const app = <NotesApp api={createAuthProtectedApi({ createNote, deleteNote, listNotes, getNote })} />;
    const container = document.createElement("div");
    document.body.appendChild(container);
    activeUnmounts.push(render(app, container));
    await flushMicrotasks();

    const passwordInput = container.querySelector(".auth-form .text-input") as HTMLInputElement;
    const loginForm = container.querySelector(".auth-form") as HTMLFormElement;
    passwordInput.value = "pw";
    passwordInput.dispatchEvent(new Event("input", { bubbles: true }));
    loginForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flushMicrotasks();
    await flushMicrotasks();

    const newButton = [...container.querySelectorAll(".button")].find(
      (element) => element.textContent?.trim() === "New"
    ) as HTMLButtonElement;
    newButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushMicrotasks();

    const [titleInput] = [...container.querySelectorAll(".editor-panel .text-input")] as HTMLInputElement[];
    const noteInput = container.querySelector(".note-input") as HTMLTextAreaElement;
    const saveButton = [...container.querySelectorAll(".button")].find(
      (element) => element.textContent?.trim() === "Save"
    ) as HTMLButtonElement;
    titleInput.value = "saved-by-button";
    titleInput.dispatchEvent(new Event("input", { bubbles: true }));
    noteInput.value = "saved-by-button";
    noteInput.dispatchEvent(new Event("input", { bubbles: true }));

    saveButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushMicrotasks();
    await flushMicrotasks();

    expect(createNote).toHaveBeenCalledTimes(1);
    expect(container.querySelector(".editor-grid")).not.toBeNull();

    await runFooterCommand(container, ":wq");
    await flushMicrotasks();
    await flushMicrotasks();
    expect(container.querySelector(".viewer")).not.toBeNull();

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const deleteButton = [...container.querySelectorAll(".button")].find(
      (element) => element.textContent?.trim() === "Delete"
    ) as HTMLButtonElement;
    deleteButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushMicrotasks();

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(deleteNote).toHaveBeenCalledWith("000000000000000000000001");
  });

  it("syncs preview block when editor cursor line changes", async () => {
    const app = <NotesApp api={createBaseApi()} />;
    const container = document.createElement("div");
    document.body.appendChild(container);
    activeUnmounts.push(render(app, container));
    await flushMicrotasks();

    const newButton = [...container.querySelectorAll(".button")].find(
      (element) => element.textContent?.trim() === "New"
    ) as HTMLButtonElement;
    newButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushMicrotasks();

    const noteInput = container.querySelector(".note-input") as HTMLTextAreaElement;
    const scrollSpy = vi.fn();
    const rafSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});

    if (!("scrollIntoView" in Element.prototype)) {
      Object.defineProperty(Element.prototype, "scrollIntoView", {
        configurable: true,
        writable: true,
        value: () => {}
      });
    }
    vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(scrollSpy);

    noteInput.value = "line1\nline2\n\nline4\nline5";
    noteInput.dispatchEvent(new Event("input", { bubbles: true }));
    await flushMicrotasks();

    const targetOffset = noteInput.value.indexOf("line4");
    noteInput.selectionStart = targetOffset;
    noteInput.selectionEnd = targetOffset;
    noteInput.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowDown", bubbles: true }));
    await flushMicrotasks();

    const syncedBlock = container.querySelector('[data-line-start="4"]') as HTMLElement;
    expect(rafSpy).toHaveBeenCalled();
    expect(scrollSpy).toHaveBeenCalled();
    expect(scrollSpy.mock.instances.some((instance) => instance === syncedBlock)).toBe(true);
  });

  it("keeps preview bottom-aligned while typing near document end", async () => {
    const app = <NotesApp api={createBaseApi()} />;
    const container = document.createElement("div");
    document.body.appendChild(container);
    activeUnmounts.push(render(app, container));
    await flushMicrotasks();

    const newButton = [...container.querySelectorAll(".button")].find(
      (element) => element.textContent?.trim() === "New"
    ) as HTMLButtonElement;
    newButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushMicrotasks();

    const noteInput = container.querySelector(".note-input") as HTMLTextAreaElement;
    const rafSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});

    if (!("scrollIntoView" in Element.prototype)) {
      Object.defineProperty(Element.prototype, "scrollIntoView", {
        configurable: true,
        writable: true,
        value: () => {}
      });
    }
    const scrollSpy = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});

    noteInput.value = Array.from({ length: 12 }, (_, index) => `line-${index + 1}`).join("\n");
    noteInput.selectionStart = noteInput.value.length;
    noteInput.selectionEnd = noteInput.value.length;
    noteInput.dispatchEvent(new Event("input", { bubbles: true }));
    await flushMicrotasks();

    scrollSpy.mockClear();
    noteInput.value = `${noteInput.value} more`;
    noteInput.selectionStart = noteInput.value.length;
    noteInput.selectionEnd = noteInput.value.length;
    noteInput.dispatchEvent(new Event("input", { bubbles: true }));
    await flushMicrotasks();

    const hasBottomAlignCall = scrollSpy.mock.calls.some((args) => {
      const options = args[0] as { block?: string } | undefined;
      return options?.block === "end";
    });

    expect(rafSpy).toHaveBeenCalled();
    expect(hasBottomAlignCall).toBe(true);
  });

  it("keeps draft on save failure and allows retry success", async () => {
    const createNote = vi
      .fn()
      .mockRejectedValueOnce(
        new NotesApiError(500, {
          code: "FILE_SAVE_FAILED",
          message: "save failed",
          retryable: true
        })
      )
      .mockResolvedValueOnce({
        _id: "000000000000000000000001",
        title: "draft title",
        note: "draft body",
        category: [],
        favorite: false
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

    expect(container.textContent).toContain("FILE_SAVE_FAILED: save failed");
    expect((container.querySelector(".note-input") as HTMLTextAreaElement).value).toBe("draft body");

    saveButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushMicrotasks();
    await flushMicrotasks();

    expect(createNote).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Saved.");
  });
});
