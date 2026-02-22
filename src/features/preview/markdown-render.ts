import MarkdownIt from "markdown-it";

const CODE_TOKEN_PATTERN = /@@CODETOKEN(\d+)@@/g;

const SCRIPT_KEYWORDS = new Set([
  "as",
  "async",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "finally",
  "for",
  "from",
  "function",
  "if",
  "implements",
  "import",
  "in",
  "instanceof",
  "interface",
  "let",
  "new",
  "of",
  "private",
  "protected",
  "public",
  "readonly",
  "return",
  "static",
  "super",
  "switch",
  "throw",
  "try",
  "type",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield"
]);

const SCRIPT_LITERALS = new Set(["false", "null", "true", "undefined", "NaN", "Infinity"]);

const BASH_KEYWORDS = new Set([
  "if",
  "then",
  "fi",
  "for",
  "in",
  "do",
  "done",
  "case",
  "esac",
  "while",
  "until",
  "elif",
  "else",
  "function",
  "local",
  "export",
  "return"
]);

const BASH_BUILTINS = new Set(["cd", "echo", "env", "exit", "pwd", "read", "set", "unset"]);

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeCodeFenceLanguage(rawLanguage: string) {
  const value = rawLanguage.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (!value) {
    return "";
  }

  const aliases: Record<string, string> = {
    javascript: "js",
    typescript: "ts",
    node: "js",
    mjs: "js",
    cjs: "js",
    sh: "bash",
    shell: "bash",
    zsh: "bash"
  };

  return aliases[value] ?? value;
}

function putCodeToken(tokens: string[], html: string) {
  const token = `@@CODETOKEN${tokens.length}@@`;
  tokens.push(html);
  return token;
}

function wrapCodeToken(className: string, rawText: string) {
  return `<span class="${className}">${escapeHtml(rawText)}</span>`;
}

function restoreCodeTokens(text: string, tokens: string[]) {
  return text.replace(CODE_TOKEN_PATTERN, (_, indexText: string) => {
    const index = Number(indexText);
    return tokens[index] ?? "";
  });
}

function highlightScriptCode(rawCode: string) {
  const tokens: string[] = [];
  let text = rawCode;

  text = text.replace(
    /`(?:\\[\s\S]|[^`])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,
    (match) => putCodeToken(tokens, wrapCodeToken("tok-string", match))
  );
  text = text.replace(/\/\*[\s\S]*?\*\//g, (match) => putCodeToken(tokens, wrapCodeToken("tok-comment", match)));
  text = text.replace(/\/\/[^\n\r]*/g, (match) => putCodeToken(tokens, wrapCodeToken("tok-comment", match)));

  text = escapeHtml(text);

  text = text.replace(/\b[A-Za-z_$][A-Za-z0-9_$]*\b/g, (word) => {
    if (SCRIPT_KEYWORDS.has(word)) {
      return `<span class="tok-keyword">${word}</span>`;
    }

    if (SCRIPT_LITERALS.has(word)) {
      return `<span class="tok-literal">${word}</span>`;
    }

    return word;
  });

  text = text.replace(
    /\b(?:0x[0-9a-fA-F]+|0b[01]+|0o[0-7]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?)\b/g,
    '<span class="tok-number">$&</span>'
  );

  return restoreCodeTokens(text, tokens);
}

function highlightBashCode(rawCode: string) {
  const tokens: string[] = [];
  let text = rawCode;

  text = text.replace(
    /`(?:\\[\s\S]|[^`])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,
    (match) => putCodeToken(tokens, wrapCodeToken("tok-string", match))
  );
  text = text.replace(/(^|[ \t])#([^\n\r]*)/g, (_, prefix: string, body: string) => {
    return `${prefix}${putCodeToken(tokens, wrapCodeToken("tok-comment", `#${body}`))}`;
  });
  text = text.replace(/\$(?:[A-Za-z_][A-Za-z0-9_]*|\{[^}\n]+\}|\d+)/g, (match) =>
    putCodeToken(tokens, wrapCodeToken("tok-variable", match))
  );

  text = escapeHtml(text);

  text = text.replace(/(^|[\s;|&()])(--?[A-Za-z0-9][A-Za-z0-9-]*)/g, (_, prefix: string, flag: string) => {
    return `${prefix}<span class="tok-attr">${flag}</span>`;
  });

  text = text.replace(/\b\d+(?:\.\d+)?\b/g, '<span class="tok-number">$&</span>');

  text = text.replace(/\b[A-Za-z_][A-Za-z0-9_]*\b/g, (word) => {
    if (BASH_KEYWORDS.has(word)) {
      return `<span class="tok-keyword">${word}</span>`;
    }

    if (BASH_BUILTINS.has(word)) {
      return `<span class="tok-function">${word}</span>`;
    }

    return word;
  });

  return restoreCodeTokens(text, tokens);
}

function highlightCode(rawCode: string, language: string) {
  if (language === "bash") {
    return highlightBashCode(rawCode);
  }

  if (language === "js" || language === "ts" || language === "jsx" || language === "tsx") {
    return highlightScriptCode(rawCode);
  }

  return escapeHtml(rawCode);
}

type SanitizeOptions = {
  allowMailToTel?: boolean;
};

function sanitizeUrl(rawUrl: string, options: SanitizeOptions = {}) {
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

  const allowMailToTel = options.allowMailToTel ?? true;
  const allowedSchemes = allowMailToTel ? new Set(["http", "https", "mailto", "tel"]) : new Set(["http", "https"]);
  const scheme = trimmed.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/)?.[1]?.toLowerCase() ?? "";

  if (scheme && !allowedSchemes.has(scheme)) {
    return null;
  }

  return trimmed;
}

function readTokenLineRange(token: { map: [number, number] | null }) {
  const map = token.map;
  if (!map) {
    return null;
  }

  const start = Math.max(1, map[0] + 1);
  const end = Math.max(start, map[1]);
  return { start, end };
}

function tokenLineAttrs(token: {
  attrGet: (name: string) => string | null;
  map: [number, number] | null;
}) {
  const start = token.attrGet("data-line-start");
  const end = token.attrGet("data-line-end");

  if (start && end) {
    return ` data-line-start="${escapeHtml(start)}" data-line-end="${escapeHtml(end)}"`;
  }

  const range = readTokenLineRange(token);
  if (!range) {
    return "";
  }

  return ` data-line-start="${range.start}" data-line-end="${range.end}"`;
}

const markdownParser = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true
});

// Allow parsing of all markdown links first, then apply project-specific URL sanitation in renderer.
markdownParser.validateLink = () => true;

markdownParser.core.ruler.push("attach_line_map_attrs", (state) => {
  for (const token of state.tokens) {
    const isOpeningOrStandalone = token.nesting === 1 || token.nesting === 0;
    const hasRenderableTag = Boolean(token.tag);

    if (!token.block || !token.map || !isOpeningOrStandalone || !hasRenderableTag) {
      continue;
    }

    const range = readTokenLineRange(token);
    if (!range) {
      continue;
    }

    token.attrSet("data-line-start", String(range.start));
    token.attrSet("data-line-end", String(range.end));
  }
});

const originalLinkOpen = markdownParser.renderer.rules.link_open;
markdownParser.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const href = token.attrGet("href") ?? "";
  const sanitized = sanitizeUrl(href, { allowMailToTel: true });

  token.attrSet("href", sanitized ?? "#");
  token.attrSet("target", "_blank");
  token.attrSet("rel", "noreferrer noopener");

  if (originalLinkOpen) {
    return originalLinkOpen(tokens, idx, options, env, self);
  }

  return self.renderToken(tokens, idx, options);
};

const originalImage = markdownParser.renderer.rules.image;
markdownParser.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const src = token.attrGet("src") ?? "";
  const sanitized = sanitizeUrl(src, { allowMailToTel: false });

  if (!sanitized) {
    const altText =
      token.content ??
      token.children?.map((child) => child.content).join("").trim() ??
      "";
    return escapeHtml(altText);
  }

  token.attrSet("src", sanitized);

  if (originalImage) {
    return originalImage(tokens, idx, options, env, self);
  }

  return self.renderToken(tokens, idx, options);
};

markdownParser.renderer.rules.fence = (tokens, idx) => {
  const token = tokens[idx];
  const language = normalizeCodeFenceLanguage(token.info ?? "");
  const languageClass = language ? ` class="language-${escapeHtml(language)}"` : "";
  const lineAttrs = tokenLineAttrs(token);
  return `<pre${lineAttrs}><code${languageClass}>${highlightCode(token.content, language)}</code></pre>`;
};

markdownParser.renderer.rules.code_block = (tokens, idx) => {
  const token = tokens[idx];
  const lineAttrs = tokenLineAttrs(token);
  return `<pre${lineAttrs}><code>${escapeHtml(token.content)}</code></pre>`;
};

export function renderMarkdownToHtml(markdown: string) {
  const input = String(markdown ?? "").replaceAll("\r\n", "\n").replaceAll("\r", "\n");

  if (input.trim() === "") {
    return "<p>&nbsp;</p>";
  }

  return markdownParser.render(input).trim();
}
