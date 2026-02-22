export type PreviewBlock = {
  start: number;
  end: number;
  text: string;
};

export function buildPreviewBlocks(noteText: string): PreviewBlock[] {
  const lines = String(noteText ?? "").split("\n");

  if (lines.length === 0) {
    return [{ start: 1, end: 1, text: "" }];
  }

  const blocks: PreviewBlock[] = [];
  let start = 1;
  let bucket: string[] = [];

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const isSeparator = line.trim() === "";

    if (isSeparator) {
      if (bucket.length > 0) {
        blocks.push({
          start,
          end: lineNumber - 1,
          text: bucket.join("\n")
        });
        bucket = [];
      }
      start = lineNumber + 1;
      return;
    }

    bucket.push(line);
  });

  if (bucket.length > 0) {
    blocks.push({
      start,
      end: lines.length,
      text: bucket.join("\n")
    });
  }

  if (blocks.length === 0) {
    blocks.push({
      start: 1,
      end: 1,
      text: ""
    });
  }

  return blocks;
}

export function findPreviewBlock(blocks: PreviewBlock[], lineNumber: number): PreviewBlock | null {
  if (blocks.length === 0) {
    return null;
  }

  let bestMatch: PreviewBlock | null = null;
  let bestSpan = Number.POSITIVE_INFINITY;
  let fallback: PreviewBlock | null = null;

  for (const block of blocks) {
    if (block.start <= lineNumber && lineNumber <= block.end) {
      const span = Math.max(1, block.end - block.start);
      if (
        !bestMatch ||
        span < bestSpan ||
        (span === bestSpan && block.start >= bestMatch.start)
      ) {
        bestMatch = block;
        bestSpan = span;
      }
      continue;
    }

    if (block.start <= lineNumber) {
      fallback = block;
    }
  }

  return bestMatch ?? fallback ?? blocks[0] ?? null;
}
