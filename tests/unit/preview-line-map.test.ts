import { describe, expect, it } from "vitest";
import { buildPreviewBlocks, findPreviewBlock } from "../../src/features/preview/line-map";

describe("buildPreviewBlocks", () => {
  it("builds paragraph-based blocks separated by blank lines", () => {
    const blocks = buildPreviewBlocks("a\nb\n\nc\n\nd\ne");

    expect(blocks).toEqual([
      { start: 1, end: 2, text: "a\nb" },
      { start: 4, end: 4, text: "c" },
      { start: 6, end: 7, text: "d\ne" }
    ]);
  });

  it("returns fallback block for empty input", () => {
    expect(buildPreviewBlocks("")).toEqual([{ start: 1, end: 1, text: "" }]);
  });
});

describe("findPreviewBlock", () => {
  const blocks = [
    { start: 1, end: 2, text: "a\nb" },
    { start: 4, end: 4, text: "c" },
    { start: 6, end: 7, text: "d\ne" }
  ];

  it("matches block containing the line", () => {
    expect(findPreviewBlock(blocks, 4)).toEqual(blocks[1]);
  });

  it("falls back to previous block when no direct match", () => {
    expect(findPreviewBlock(blocks, 5)).toEqual(blocks[1]);
  });

  it("falls back to first block when line is before first block", () => {
    expect(findPreviewBlock(blocks, 0)).toEqual(blocks[0]);
  });
});

