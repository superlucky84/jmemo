// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { render } from "lithent";
import { NotesApp } from "../../src/app/notes-app";

const activeUnmounts: Array<() => void> = [];

afterEach(() => {
  while (activeUnmounts.length) {
    const unmount = activeUnmounts.pop();
    unmount?.();
  }
  document.body.innerHTML = "";
});

describe("NotesApp render smoke", () => {
  it("renders shell without crashing", async () => {
    const app = (
      <NotesApp
        api={{
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
          }
        }}
      />
    );

    const container = document.createElement("div");
    document.body.appendChild(container);

    const unmount = render(app, container);
    activeUnmounts.push(unmount);

    expect(container.textContent).toContain("jmemo");
    expect(container.textContent).toContain("Search");
    expect(container.textContent).toContain("New");
  });
});

