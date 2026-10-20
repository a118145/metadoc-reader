import { hashNormalizedLines, normalizeLine } from './hash';
import { LineRange, MetadocSection } from './parser';
import { FlatSymbol, findSymbolCandidates } from './symbols';

/** How far (in lines) around the resolved start the reader looks for the hashed span. */
export const SEARCH_RADIUS = 20;

/** `fresh`: hash verified; `stale`: hash does not match; `unverified`: no valid hash or lines to check. */
export type SectionStatus = 'fresh' | 'stale' | 'unverified';

/** How the section was placed: by symbol, by line hint, or not at all. */
export type SectionLocation = 'symbol' | 'lines' | 'unresolved';

export interface ResolvedSection {
  section: MetadocSection;
  location: SectionLocation;
  status: SectionStatus;
  /** First source line the section is aligned with; undefined when unresolved. */
  anchorLine?: number;
  /** Source span the section describes, as far as the reader could determine it. */
  span?: LineRange;
  messages: string[];
}

/** Source lines prepared once per file for repeated window hashing. */
export interface PreparedSource {
  normalized: string[];
}

export function prepareSource(lines: readonly string[]): PreparedSource {
  return { normalized: lines.map(normalizeLine) };
}

function windowHash(source: PreparedSource, start: number, length: number): string | undefined {
  if (start < 1 || start + length - 1 > source.normalized.length) {
    return undefined;
  }
  return hashNormalizedLines(source.normalized.slice(start - 1, start - 1 + length));
}

/**
 * Window starts in the order the spec prescribes: the resolved start, the hint start, then the
 * resolved start -1, +1, -2, +2, ... up to SEARCH_RADIUS.
 */
export function candidateStarts(resolvedStart: number, hintStart: number): number[] {
  const starts = [resolvedStart, hintStart];
  for (let distance = 1; distance <= SEARCH_RADIUS; distance++) {
    starts.push(resolvedStart - distance, resolvedStart + distance);
  }
  return starts.filter((start, index) => start >= 1 && starts.indexOf(start) === index);
}

/** Resolves one section against the source (resolution order: symbol, then line hint). */
export function resolveSection(
  section: MetadocSection,
  source: PreparedSource,
  symbols: readonly FlatSymbol[],
): ResolvedSection {
  const lineCount = source.normalized.length;
  const messages: string[] = [...section.problems];
  const hint = section.lines;
  let location: SectionLocation = 'unresolved';
  let anchorLine: number | undefined;
  let span: LineRange | undefined;

  if (section.symbol) {
    const candidates = findSymbolCandidates(symbols, section.symbol);
    if (candidates.length > 0) {
      const target = hint?.start ?? 1;
      const best = candidates.reduce((a, b) =>
        Math.abs(b.startLine - target) < Math.abs(a.startLine - target) ? b : a,
      );
      location = 'symbol';
      anchorLine = best.startLine;
      span = { start: best.startLine, end: best.endLine };
    } else if (symbols.length === 0) {
      messages.push(`no symbols available from a symbol provider; placed by line hint`);
    } else {
      messages.push(`symbol "${section.symbol}" not found; placed by line hint`);
    }
  }
  if (location === 'unresolved' && hint && hint.start <= lineCount) {
    location = 'lines';
    anchorLine = hint.start;
    span = { start: hint.start, end: Math.min(hint.end, lineCount) };
  }

  if (!section.hash || !hint) {
    if (location === 'unresolved') {
      messages.push('section could not be placed in the source');
    }
    return { section, location, status: 'unverified', anchorLine, span, messages };
  }

  const length = hint.end - hint.start + 1;
  for (const start of candidateStarts(anchorLine ?? hint.start, hint.start)) {
    if (windowHash(source, start, length) === section.hash) {
      if (location === 'unresolved') {
        location = 'lines';
      }
      return {
        section,
        location,
        status: 'fresh',
        anchorLine: start,
        span: { start, end: start + length - 1 },
        messages,
      };
    }
  }

  messages.push('source changed since this section was written (span hash does not match)');
  if (location === 'unresolved') {
    messages.push(`line hint ${hint.start}-${hint.end} lies outside the source (${lineCount} lines)`);
  }
  return { section, location, status: 'stale', anchorLine, span, messages };
}

export function resolveSections(
  sections: readonly MetadocSection[],
  lines: readonly string[],
  symbols: readonly FlatSymbol[],
): ResolvedSection[] {
  const source = prepareSource(lines);
  return sections.map((section) => resolveSection(section, source, symbols));
}
