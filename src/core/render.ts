import hljs from 'highlight.js/lib/common';
import MarkdownIt from 'markdown-it';

/** VS Code language ids whose highlight.js name differs. */
const LANGUAGE_ALIASES: Record<string, string> = {
  cuda: 'cpp',
  'objective-c': 'objectivec',
  'objective-cpp': 'objectivec',
  shellscript: 'bash',
  jsonc: 'json',
  typescriptreact: 'typescript',
  javascriptreact: 'javascript',
};

/** Picks a highlight.js language from a VS Code language id or a file extension; undefined = plain. */
export function highlightLanguage(languageId: string | undefined, extension: string | undefined): string | undefined {
  const id = languageId === 'plaintext' ? undefined : languageId;
  for (const candidate of [id, id && LANGUAGE_ALIASES[id], extension?.replace(/^\./, '')]) {
    if (candidate && hljs.getLanguage(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Splits highlight.js HTML into one string per source line. Spans that cross a line break are
 * closed at the end of the line and reopened on the next, so every line is self-contained HTML.
 */
export function splitHighlightedHtml(html: string): string[] {
  const lines: string[] = [];
  const open: string[] = [];
  let current = '';
  const token = /<span[^>]*>|<\/span>|\n|[^<\n]+/g;
  let match: RegExpExecArray | null;
  while ((match = token.exec(html)) !== null) {
    const part = match[0];
    if (part === '\n') {
      lines.push(current + '</span>'.repeat(open.length));
      current = open.join('');
    } else if (part === '</span>') {
      open.pop();
      current += part;
    } else if (part.startsWith('<span')) {
      open.push(part);
      current += part;
    } else {
      current += part;
    }
  }
  lines.push(current + '</span>'.repeat(open.length));
  return lines;
}

/** Highlights source lines (already split, without line terminators) into per-line HTML. */
export function highlightLines(lines: readonly string[], language: string | undefined): string[] {
  const text = lines.join('\n');
  if (!language || lines.length === 0) {
    return lines.map(escapeHtml);
  }
  try {
    const result = splitHighlightedHtml(hljs.highlight(text, { language, ignoreIllegals: true }).value);
    return result.length === lines.length ? result : lines.map(escapeHtml);
  } catch {
    return lines.map(escapeHtml);
  }
}

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  highlight: (code, language) => {
    if (language && hljs.getLanguage(language)) {
      try {
        return hljs.highlight(code, { language, ignoreIllegals: true }).value;
      } catch {
        // fall through to the default escaping
      }
    }
    return '';
  },
});

// Only explicit URLs become links: file names such as "kalman.py" must not (.py is a TLD).
markdown.linkify.set({ fuzzyLink: false });

/** Renders metadoc Markdown to HTML. Raw HTML in the Markdown is escaped, not passed through. */
export function renderMarkdown(source: string): string {
  return markdown.render(source);
}
