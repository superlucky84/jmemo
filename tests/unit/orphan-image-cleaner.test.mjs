import { describe, expect, it } from "vitest";
import { selectOrphanImages } from "../../server/services/orphan-image-cleaner.mjs";

describe("selectOrphanImages", () => {
  it("keeps referenced files and selects only old unreferenced files", () => {
    const now = 1_700_000_000_000;
    const day = 24 * 60 * 60 * 1000;

    const selected = selectOrphanImages({
      now,
      protectionMs: day,
      referencedPaths: new Set(["images/20260221/keep.png"]),
      files: [
        {
          relativePath: "images/20260221/keep.png",
          absolutePath: "/tmp/keep.png",
          mtimeMs: now - day * 10
        },
        {
          relativePath: "images/20260221/recent.png",
          absolutePath: "/tmp/recent.png",
          mtimeMs: now - day / 2
        },
        {
          relativePath: "images/20260220/orphan.png",
          absolutePath: "/tmp/orphan.png",
          mtimeMs: now - day * 2
        }
      ]
    });

    expect(selected.map((item) => item.relativePath)).toEqual(["images/20260220/orphan.png"]);
  });
});
