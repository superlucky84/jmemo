import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/styles/app.css"), "utf8");
const notesAppSource = readFileSync(resolve(process.cwd(), "src/app/notes-app.tsx"), "utf8");

describe("responsive style contract", () => {
  it("uses dynamic viewport height for app root", () => {
    expect(css).toContain("#app");
    expect(css).toContain("min-height: 100dvh;");
  });

  it("keeps command footer safe-area aware", () => {
    expect(notesAppSource).toContain("pb-[calc(8px+env(safe-area-inset-bottom))]");
    expect(notesAppSource).toContain("max-[980px]:pb-[calc(10px+env(safe-area-inset-bottom))]");
  });

  it("keeps mobile layout in one column", () => {
    expect(notesAppSource).toContain("max-[980px]:grid-cols-1");
  });

  it("applies touch-friendly independent scrolling options", () => {
    expect(notesAppSource).toContain("overscroll-contain");
    expect(notesAppSource).toContain("[-webkit-overflow-scrolling:touch]");
    expect(notesAppSource).toContain("[scrollbar-width:thin]");
  });
});
