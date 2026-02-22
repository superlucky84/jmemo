import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/styles/app.css"), "utf8");

describe("responsive style contract", () => {
  it("uses dynamic viewport height for app shell", () => {
    expect(css).toContain("#app");
    expect(css).toContain("min-height: 100dvh;");
    expect(css).toMatch(/\.app-shell\s*\{[\s\S]*min-height:\s*100dvh;/);
  });

  it("keeps command footer safe-area aware", () => {
    expect(css).toContain("padding-bottom: calc(8px + env(safe-area-inset-bottom));");
    expect(css).toContain("padding-bottom: calc(10px + env(safe-area-inset-bottom));");
  });

  it("keeps mobile layout in one column with constrained height", () => {
    expect(css).toMatch(
      /@media\s*\(max-width:\s*980px\)\s*\{[\s\S]*\.layout\s*\{[\s\S]*grid-template-columns:\s*1fr;[\s\S]*min-height:\s*0;/
    );
  });

  it("applies touch-friendly independent scrolling options", () => {
    expect(css).toMatch(
      /\.list-area,\s*[\r\n\s]*\.content-body,\s*[\r\n\s]*\.preview-scroll\s*\{[\s\S]*overscroll-behavior:\s*contain;[\s\S]*-webkit-overflow-scrolling:\s*touch;/
    );
  });
});
