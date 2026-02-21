import { describe, expect, it } from "vitest";
import { renderMarkdownToHtml } from "../../src/features/preview/markdown-render";

describe("renderMarkdownToHtml", () => {
  it("renders basic markdown syntax to html", () => {
    const html = renderMarkdownToHtml(
      "# Title\n\n- first\n- second\n\n`inline`\n\n```js\nconst n = 1;\n```"
    );

    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<ul><li>first</li><li>second</li></ul>");
    expect(html).toContain("<p><code>inline</code></p>");
    expect(html).toContain('<pre><code class="language-js">const n = 1;</code></pre>');
  });

  it("sanitizes unsafe html and javascript urls", () => {
    const html = renderMarkdownToHtml(
      '<script>alert("x")</script>\n[bad](javascript:alert(1))\n![x](javascript:alert(2))'
    );

    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(html).toContain('<a href="#" target="_blank" rel="noreferrer noopener">bad</a>');
    expect(html).not.toContain("javascript:alert");
    expect(html).not.toContain("<img");
  });

  it("renders empty markdown as non-collapsing paragraph", () => {
    expect(renderMarkdownToHtml("")).toBe("<p>&nbsp;</p>");
  });
});
