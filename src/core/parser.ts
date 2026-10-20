import { HASH_PATTERN, splitLines } from './hash';

/** Format version this reader implements. */
export const SUPPORTED_VERSION = '0';

export interface LineRange {
  /** 1-based, inclusive. */
  start: number;
  /** 1-based, inclusive, >= start. */
  end: number;
}

export interface MetadocHeader {
  version?: string;
  source?: string;
  /** 1-based line of the header comment in the metadoc. */
  line: number;
}

export interface MetadocSection {
  /** Dotted qualified symbol name, if given and well-formed. */
  symbol?: string;
  /** Line-range hint, if given and well-formed. */
  lines?: LineRange;
  /** Lowercase 12-hex-char span hash, if given and well-formed. */
  hash?: string;
  /** Markdown body of the section (anchor line excluded, surrounding blank lines trimmed). */
  markdown: string;
  /** 1-based line of the anchor comment in the metadoc. */
  anchorLine: number;
  /** Problems found in the anchor; the section is still shown. */
  problems: string[];
}

export interface ParsedMetadoc {
  header?: MetadocHeader;
  /** Markdown between the header and the first section anchor, or undefined if blank. */
  overview?: string;
  sections: MetadocSection[];
  /** File-level problems (missing header, unsupported version, unknown anchors, ...). */
  warnings: string[];
}

interface AnchorComment {
  kind: string;
  attributes: Map<string, string>;
  problems: string[];
}

const ANCHOR_LINE = /^\s*<!--\s*metadoc:([A-Za-z0-9_-]*)(.*?)-->\s*$/;
const ATTRIBUTE = /\s*([A-Za-z][A-Za-z0-9_-]*)\s*=\s*"([^"]*)"/y;
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;
const LINES_VALUE = /^(\d+)(?:-(\d+))?$/;
const SYMBOL_VALUE = /^[^\s"]+$/;

/** Parses one line as a `<!-- metadoc:<kind> ... -->` comment, or returns undefined. */
export function parseAnchorComment(line: string): AnchorComment | undefined {
  const match = ANCHOR_LINE.exec(line);
  if (!match) {
    return undefined;
  }
  const attributes = new Map<string, string>();
  const problems: string[] = [];
  const rest = match[2];
  let position = 0;
  while (position < rest.length) {
    ATTRIBUTE.lastIndex = position;
    const attribute = ATTRIBUTE.exec(rest);
    if (!attribute) {
      if (rest.slice(position).trim() !== '') {
        problems.push(`unparsable anchor text "${rest.slice(position).trim()}"`);
      }
      break;
    }
    if (attributes.has(attribute[1])) {
      problems.push(`duplicate attribute "${attribute[1]}" (first value kept)`);
    } else {
      attributes.set(attribute[1], attribute[2]);
    }
    position = ATTRIBUTE.lastIndex;
  }
  return { kind: match[1], attributes, problems };
}

/** Parses a `lines` attribute value ("12-40" or "12"). */
export function parseLineRange(value: string): LineRange | undefined {
  const match = LINES_VALUE.exec(value.trim());
  if (!match) {
    return undefined;
  }
  const start = Number(match[1]);
  const end = match[2] === undefined ? start : Number(match[2]);
  if (start < 1 || end < start) {
    return undefined;
  }
  return { start, end };
}

function sectionFromAnchor(anchor: AnchorComment, anchorLine: number): MetadocSection {
  const problems = [...anchor.problems];
  const section: MetadocSection = { markdown: '', anchorLine, problems };

  const symbol = anchor.attributes.get('symbol');
  if (symbol !== undefined) {
    if (SYMBOL_VALUE.test(symbol)) {
      section.symbol = symbol;
    } else {
      problems.push(`invalid symbol "${symbol}"`);
    }
  }

  const lines = anchor.attributes.get('lines');
  if (lines === undefined) {
    problems.push('missing lines attribute');
  } else {
    section.lines = parseLineRange(lines);
    if (!section.lines) {
      problems.push(`invalid lines "${lines}" (expected "<start>-<end>", 1-based, start <= end)`);
    }
  }

  const hash = anchor.attributes.get('hash');
  if (hash === undefined) {
    problems.push('missing hash attribute');
  } else if (HASH_PATTERN.test(hash.toLowerCase())) {
    section.hash = hash.toLowerCase();
  } else {
    problems.push(`invalid hash "${hash}" (expected 12 hex characters)`);
  }
  return section;
}

function trimBlankLines(lines: string[]): string {
  let first = 0;
  let last = lines.length;
  while (first < last && lines[first].trim() === '') {
    first++;
  }
  while (last > first && lines[last - 1].trim() === '') {
    last--;
  }
  return lines.slice(first, last).join('\n');
}

/** Parses the text of a `.metadoc` file. Never throws; problems are reported as warnings. */
export function parseMetadoc(text: string): ParsedMetadoc {
  const lines = splitLines(text).map((line) => line.replace(/\r$/, ''));
  const warnings: string[] = [];
  const sections: MetadocSection[] = [];
  let header: MetadocHeader | undefined;
  let overviewLines: string[] = [];
  let current: { section: MetadocSection; body: string[] } | undefined;
  let seenContent = false;
  let fence: { char: string; length: number } | undefined;

  const flush = (): void => {
    if (current) {
      current.section.markdown = trimBlankLines(current.body);
      sections.push(current.section);
    }
  };

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const body = current ? current.body : overviewLines;

    if (fence) {
      const closing = new RegExp(`^ {0,3}${fence.char === '`' ? '`' : '~'}{${fence.length},}\\s*$`);
      if (closing.test(line)) {
        fence = undefined;
      }
      body.push(line);
      return;
    }
    const fenceOpen = FENCE_OPEN.exec(line);
    if (fenceOpen) {
      fence = { char: fenceOpen[1][0], length: fenceOpen[1].length };
      seenContent = true;
      body.push(line);
      return;
    }

    const anchor = parseAnchorComment(line);
    if (!anchor) {
      if (line.trim() !== '') {
        seenContent = true;
      }
      body.push(line);
      return;
    }

    if (anchor.kind === 'file') {
      if (!header && !seenContent && sections.length === 0) {
        header = { line: lineNumber, version: anchor.attributes.get('version'), source: anchor.attributes.get('source') };
        for (const problem of anchor.problems) {
          warnings.push(`header (line ${lineNumber}): ${problem}`);
        }
      } else {
        warnings.push(`line ${lineNumber}: misplaced metadoc:file header ignored (it must be the first non-blank line)`);
      }
      seenContent = true;
      return;
    }
    if (anchor.kind === 'section') {
      flush();
      current = { section: sectionFromAnchor(anchor, lineNumber), body: [] };
      seenContent = true;
      return;
    }
    warnings.push(`line ${lineNumber}: unknown anchor kind "metadoc:${anchor.kind}" ignored`);
  });
  flush();

  if (!header) {
    warnings.push('missing <!-- metadoc:file version="0" source="..." --> header on the first non-blank line');
  } else {
    if (header.version === undefined) {
      warnings.push('header has no version attribute; assuming version "0"');
    } else if (header.version !== SUPPORTED_VERSION) {
      warnings.push(`format version "${header.version}" is not supported (this reader implements "${SUPPORTED_VERSION}"); showing best effort`);
    }
    if (header.source === undefined || header.source.trim() === '') {
      warnings.push('header has no source attribute');
      header.source = undefined;
    }
  }

  const overview = trimBlankLines(overviewLines);
  return { header, overview: overview === '' ? undefined : overview, sections, warnings };
}
