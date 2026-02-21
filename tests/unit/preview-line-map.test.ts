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

  it("handles large note input without losing block lookup", () => {
    const lines: string[] = [];

    for (let index = 1; index <= 1000; index += 1) {
      lines.push(`line-${index}`);
      if (index % 10 === 0) {
        lines.push("");
      }
    }

    const generatedBlocks = buildPreviewBlocks(lines.join("\n"));
    expect(generatedBlocks.length).toBeGreaterThan(90);

    const blockAround500 = findPreviewBlock(generatedBlocks, 500);
    expect(blockAround500).not.toBeNull();
    expect((blockAround500?.start ?? 0) <= 500).toBe(true);
    expect((blockAround500?.end ?? 0) >= 500).toBe(true);
  });
});
