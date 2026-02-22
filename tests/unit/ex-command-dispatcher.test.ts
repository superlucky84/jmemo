import { describe, expect, it } from "vitest";
import { resolveExCommand } from "../../src/features/editor/ex-command-dispatcher";

describe("resolveExCommand", () => {
  it("routes :e to selected edit when note is selected", () => {
    const result = resolveExCommand(":e", {
      mode: "view",
      hasSelection: true
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.route.kind === "enter-write") {
      expect(result.route.source).toBe("selected");
      return;
    }

    throw new Error("Expected enter-write route");
  });

  it("routes :e to new write when selection is missing", () => {
    const result = resolveExCommand("edit", {
      mode: "list",
      hasSelection: false
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.route.kind === "enter-write") {
      expect(result.route.source).toBe("new");
      return;
    }

    throw new Error("Expected enter-write route");
  });

  it("rejects :e when already in write mode", () => {
    expect(
      resolveExCommand(":e", {
        mode: "write",
        hasSelection: true
      })
    ).toEqual({
      ok: false,
      message: "Already in write mode."
    });
  });

  it("routes :q from write/view and rejects in list", () => {
    const writeResult = resolveExCommand(":q", {
      mode: "write",
      hasSelection: true
    });
    expect(writeResult.ok).toBe(true);
    if (writeResult.ok) {
      expect(writeResult.route.kind).toBe("quit");
    }

    expect(
      resolveExCommand(":q", {
        mode: "list",
        hasSelection: false
      })
    ).toEqual({
      ok: false,
      message: "Already in list mode."
    });
  });

  it("routes :w and :wq only in write mode", () => {
    const saveResult = resolveExCommand(":w", {
      mode: "write",
      hasSelection: true
    });
    expect(saveResult.ok).toBe(true);
    if (saveResult.ok) {
      expect(saveResult.route.kind).toBe("save");
    }

    const saveAndCloseResult = resolveExCommand("wq", {
      mode: "write",
      hasSelection: true
    });
    expect(saveAndCloseResult.ok).toBe(true);
    if (saveAndCloseResult.ok) {
      expect(saveAndCloseResult.route.kind).toBe("save-and-close");
    }

    expect(
      resolveExCommand(":w", {
        mode: "view",
        hasSelection: true
      })
    ).toEqual({
      ok: false,
      message: ":w is available only in write mode."
    });
  });

  it("returns unknown for unsupported command", () => {
    expect(
      resolveExCommand(":set nu", {
        mode: "view",
        hasSelection: true
      })
    ).toEqual({
      ok: false,
      message: "Unknown command: set"
    });
  });
});
