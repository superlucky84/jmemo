const FENCE_PATTERN = /^```/;
const HEADING_PATTERN = /^(#{1,6})\s+(.*)$/;
const HR_PATTERN = /^(?:-{3,}|\*{3,}|_{3,})$/;
const BLOCKQUOTE_PATTERN = /^>\s?(.*)$/;
const ORDERED_LIST_PATTERN = /^\s*\d+\.\s+(.+)$/;
const UNORDERED_LIST_PATTERN = /^\s*[-*+]\s+(.+)$/;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value);
}

function parseLinkDestination(rawDestination: string) {
  const destination = rawDestination.trim();
  const withTitle = destination.match(/^(\S+)\s+"([^"]*)"$/);

  if (withTitle) {
    return {
      url: withTitle[1],
      title: withTitle[2]
    };
  }

  return {
    url: destination,
    title: ""
  };
}

function sanitizeUrl(rawUrl: string) {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.replace(/[\u0000-\u001f\u007f\s]+/g, "").toLowerCase();
  if (
    normalized.startsWith("javascript:") ||
    normalized.startsWith("vbscript:") ||
    normalized.startsWith("data:")
  ) {
    return null;
  }

  const scheme = trimmed.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:/)?.[0]?.toLowerCase() ?? "";
  if (scheme && !["http:", "https:", "mailto:", "tel:"].includes(scheme)) {
    return null;
  }

  return escapeAttribute(trimmed);
}

function renderInline(rawText: string) {
  const tokens: string[] = [];
  const putToken = (html: string) => {
    const token = `@@MDTOKEN${tokens.length}@@`;
    tokens.push(html);
    return token;
  };

  let text = rawText;

  text = text.replace(/`([^`]+)`/g, (_, codeText: string) =>
    putToken(`<code>${escapeHtml(codeText)}</code>`)
  );

  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt: string, destination: string) => {
    const parsed = parseLinkDestination(destination);
    const url = sanitizeUrl(parsed.url);
    if (!url) {
      return escapeHtml(`![${alt}](${destination})`);
    }

    const title = parsed.title ? ` title="${escapeAttribute(parsed.title)}"` : "";
    return putToken(`<img src="${url}" alt="${escapeAttribute(alt)}"${title} />`);
  });

  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label: string, destination: string) => {
    const parsed = parseLinkDestination(destination);
    const url = sanitizeUrl(parsed.url) ?? "#";
    const title = parsed.title ? ` title="${escapeAttribute(parsed.title)}"` : "";
    return putToken(`<a href="${url}" target="_blank" rel="noreferrer noopener"${title}>${escapeHtml(label)}</a>`);
  });

  text = escapeHtml(text);

  text = text.replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, "<strong>$2</strong>");
  text = text.replace(/(\*|_)(?=\S)([\s\S]*?\S)\1/g, "<em>$2</em>");
  text = text.replace(/~~(?=\S)([\s\S]*?\S)~~/g, "<del>$1</del>");

  text = text.replace(/@@MDTOKEN(\d+)@@/g, (_, indexText: string) => {
    const index = Number(indexText);
    return tokens[index] ?? "";
  });

  return text;
}

function startsBlock(line: string) {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }

  return (
    FENCE_PATTERN.test(trimmed) ||
    HEADING_PATTERN.test(trimmed) ||
    HR_PATTERN.test(trimmed) ||
    BLOCKQUOTE_PATTERN.test(trimmed) ||
    ORDERED_LIST_PATTERN.test(trimmed) ||
    UNORDERED_LIST_PATTERN.test(trimmed)
  );
}

function listItemContent(line: string, type: "ol" | "ul") {
  if (type === "ol") {
    return line.match(ORDERED_LIST_PATTERN)?.[1] ?? "";
  }

  return line.match(UNORDERED_LIST_PATTERN)?.[1] ?? "";
}

export function renderMarkdownToHtml(markdown: string) {
  const input = String(markdown ?? "").replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  const lines = input.split("\n");
  const htmlParts: string[] = [];

  if (input.trim() === "") {
    return "<p>&nbsp;</p>";
  }

  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (FENCE_PATTERN.test(trimmed)) {
      const language = trimmed.slice(3).trim().split(/\s+/)[0] ?? "";
      index += 1;
      const codeLines: string[] = [];

      while (index < lines.length && !FENCE_PATTERN.test(lines[index]?.trim() ?? "")) {
        codeLines.push(lines[index] ?? "");
        index += 1;
      }

      if (index < lines.length && FENCE_PATTERN.test(lines[index]?.trim() ?? "")) {
        index += 1;
      }

      const languageClass = language ? ` class="language-${escapeAttribute(language)}"` : "";
      htmlParts.push(`<pre><code${languageClass}>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
      continue;
    }

    const headingMatch = line.match(HEADING_PATTERN);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2] ?? "";
      htmlParts.push(`<h${level}>${renderInline(text)}</h${level}>`);
      index += 1;
      continue;
    }

    if (HR_PATTERN.test(trimmed)) {
      htmlParts.push("<hr>");
      index += 1;
      continue;
    }

    if (BLOCKQUOTE_PATTERN.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length) {
        const quoteMatch = (lines[index] ?? "").match(BLOCKQUOTE_PATTERN);
        if (!quoteMatch) {
          break;
        }
        quoteLines.push(quoteMatch[1] ?? "");
        index += 1;
      }
      htmlParts.push(`<blockquote>${renderMarkdownToHtml(quoteLines.join("\n"))}</blockquote>`);
      continue;
    }

    const isOrderedList = ORDERED_LIST_PATTERN.test(line);
    const isUnorderedList = UNORDERED_LIST_PATTERN.test(line);
    if (isOrderedList || isUnorderedList) {
      const type: "ol" | "ul" = isOrderedList ? "ol" : "ul";
      const items: string[] = [];
      while (index < lines.length) {
        const currentLine = lines[index] ?? "";
        if (!(type === "ol" ? ORDERED_LIST_PATTERN.test(currentLine) : UNORDERED_LIST_PATTERN.test(currentLine))) {
          break;
        }
        items.push(`<li>${renderInline(listItemContent(currentLine, type))}</li>`);
        index += 1;
      }
      htmlParts.push(`<${type}>${items.join("")}</${type}>`);
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const currentLine = lines[index] ?? "";
      const currentTrimmed = currentLine.trim();
      if (!currentTrimmed) {
        break;
      }
      if (paragraphLines.length > 0 && startsBlock(currentLine)) {
        break;
      }
      paragraphLines.push(currentLine);
      index += 1;
    }

    htmlParts.push(`<p>${paragraphLines.map((text) => renderInline(text)).join("<br>")}</p>`);
  }

  return htmlParts.join("");
}
