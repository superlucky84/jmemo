import { describe, expect, it } from "vitest";
import { renderMarkdownToHtml } from "../../src/features/preview/markdown-render";

describe("renderMarkdownToHtml", () => {
  it("renders basic markdown syntax to html", () => {
    const html = renderMarkdownToHtml(
      "# Title\n\n- first\n- second\n\n`inline`\n\n```js\nconst n = 1;\n```"
    );

    expect(html).toMatch(/<h1[^>]*>Title<\/h1>/);
    expect(html).toMatch(/<ul[^>]*>/);
    expect(html).toMatch(/<li[^>]*>first<\/li>/);
    expect(html).toMatch(/<li[^>]*>second<\/li>/);
    expect(html).toContain('data-line-start="1"');
    expect(html).toContain('data-line-start="3"');
    expect(html).toMatch(/<p[^>]*><code>inline<\/code><\/p>/);
    expect(html).toMatch(/<pre[^>]*><code class="language-js">/);
    expect(html).toContain('<span class="tok-keyword">const</span>');
    expect(html).toContain('<span class="tok-number">1</span>');
  });

  it("highlights bash fenced code with comment, variable and option tokens", () => {
    const html = renderMarkdownToHtml('```bash\n# deploy\necho "$HOME" --help\n```');

    expect(html).toContain('<code class="language-bash">');
    expect(html).toContain('<span class="tok-comment"># deploy</span>');
    expect(html).toContain('<span class="tok-string">&quot;$HOME&quot;</span>');
    expect(html).toContain('<span class="tok-function">echo</span>');
    expect(html).toContain('<span class="tok-attr">--help</span>');
  });

  it("normalizes language aliases for fenced code", () => {
    const html = renderMarkdownToHtml("```typescript\nconst count = 2\n```");

    expect(html).toContain('<code class="language-ts">');
    expect(html).toContain('<span class="tok-keyword">const</span>');
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
