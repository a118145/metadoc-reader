import { createHash } from 'crypto';

/** Number of lowercase hex characters of the SHA-256 digest kept in a `hash` attribute. */
export const HASH_LENGTH = 12;

export const HASH_PATTERN = /^[0-9a-f]{12}$/;

/**
 * Splits text into lines the way the metadoc spec numbers them: a leading UTF-8 BOM is dropped,
 * lines are separated by "\n" only, and a trailing "\n" does not open an extra empty line.
 * Carriage returns stay in the line; `normalizeLine` removes them.
 */
export function splitLines(text: string): string[] {
  if (text.startsWith('﻿')) {
    text = text.slice(1);
  }
  if (text === '') {
    return [];
  }
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines;
}

/** Strips trailing spaces, tabs and carriage returns (and nothing else). */
export function normalizeLine(line: string): string {
  return line.replace(/[ \t\r]+$/, '');
}

/** Hash of an already normalized list of lines: every line is terminated by "\n" before hashing. */
export function hashNormalizedLines(lines: readonly string[]): string {
  const hash = createHash('sha256');
  for (const line of lines) {
    hash.update(line, 'utf8');
    hash.update('\n', 'utf8');
  }
  return hash.digest('hex').slice(0, HASH_LENGTH);
}

/**
 * Span hash of the 1-based inclusive line range `start`-`end` of `lines` (as produced by
 * `splitLines`). Returns undefined when the range does not lie inside the file.
 */
export function spanHash(lines: readonly string[], start: number, end: number): string | undefined {
  if (start < 1 || end < start || end > lines.length) {
    return undefined;
  }
  return hashNormalizedLines(lines.slice(start - 1, end).map(normalizeLine));
}

/** Convenience wrapper: span hash of a line range of a whole source text. */
export function spanHashOfText(text: string, start: number, end: number): string | undefined {
  return spanHash(splitLines(text), start, end);
}
