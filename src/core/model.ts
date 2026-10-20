import { splitLines } from './hash';
import { buildRows, LayoutItem } from './layout';
import { parseMetadoc } from './parser';
import { highlightLines, renderMarkdown } from './render';
import { resolveSections, SectionLocation, SectionStatus } from './resolve';
import { FlatSymbol } from './symbols';

/** Everything the webview needs to draw one source/metadoc pair. Plain JSON. */
export interface ViewModel {
  sourceName: string;
  metadocName: string;
  /** highlight.js language used, or undefined for plain text. */
  language?: string;
  /** One HTML string per source line. */
  codeLines: string[];
  blocks: DocBlock[];
  rows: ViewRow[];
  warnings: string[];
  summary: Summary;
}

export interface DocBlock {
  kind: 'overview' | 'section';
  html: string;
  /** 1-based line of the block's anchor (or first line) in the metadoc. */
  metadocLine: number;
  symbol?: string;
  /** Line hint as written, e.g. "12-40". */
  hint?: string;
  location?: SectionLocation;
  status?: SectionStatus;
  /** Source span the section describes, if known. */
  span?: { start: number; end: number };
  messages: string[];
}

export interface ViewRow {
  codeStart: number;
  codeEnd: number;
  blocks: number[];
}

export interface Summary {
  sections: number;
  fresh: number;
  stale: number;
  unverified: number;
  unresolved: number;
  bySymbol: number;
  byLines: number;
}

export interface ViewModelInput {
  sourceName: string;
  metadocName: string;
  sourceText: string;
  metadocText: string;
  symbols: readonly FlatSymbol[];
  language?: string;
}

export function buildViewModel(input: ViewModelInput): ViewModel {
  const sourceLines = splitLines(input.sourceText);
  const parsed = parseMetadoc(input.metadocText);
  const resolved = resolveSections(parsed.sections, sourceLines, input.symbols);

  const blocks: DocBlock[] = [];
  const items: LayoutItem[] = [];
  if (parsed.overview !== undefined) {
    blocks.push({
      kind: 'overview',
      html: renderMarkdown(parsed.overview),
      metadocLine: (parsed.header?.line ?? 0) + 1,
      messages: [],
    });
    items.push({});
  }
  for (const entry of resolved) {
    const { section } = entry;
    blocks.push({
      kind: 'section',
      html: renderMarkdown(section.markdown),
      metadocLine: section.anchorLine,
      symbol: section.symbol,
      hint: section.lines ? `${section.lines.start}-${section.lines.end}` : undefined,
      location: entry.location,
      status: entry.status,
      span: entry.span,
      messages: entry.messages,
    });
    items.push({ anchorLine: entry.anchorLine });
  }

  const rows = buildRows(sourceLines.length, items).map((row) => ({
    codeStart: row.codeStart,
    codeEnd: row.codeEnd,
    blocks: row.items,
  }));

  const count = (predicate: (entry: (typeof resolved)[number]) => boolean): number =>
    resolved.filter(predicate).length;

  return {
    sourceName: input.sourceName,
    metadocName: input.metadocName,
    language: input.language,
    codeLines: highlightLines(
      sourceLines.map((line) => line.replace(/\r$/, '')),
      input.language,
    ),
    blocks,
    rows,
    warnings: parsed.warnings,
    summary: {
      sections: resolved.length,
      fresh: count((entry) => entry.status === 'fresh'),
      stale: count((entry) => entry.status === 'stale'),
      unverified: count((entry) => entry.status === 'unverified'),
      unresolved: count((entry) => entry.location === 'unresolved'),
      bySymbol: count((entry) => entry.location === 'symbol'),
      byLines: count((entry) => entry.location === 'lines'),
    },
  };
}
