import * as path from 'path';
import { parseMetadoc } from './parser';

export const METADOC_EXTENSION = '.metadoc';

/** Minimal file-system access the pairing logic needs (injected so it can be tested). */
export interface PairingFs {
  /** File contents, or undefined if the file does not exist. */
  readText(file: string): Promise<string | undefined>;
  /** Names of the regular files in a directory. */
  listFiles(directory: string): Promise<string[]>;
}

export type PairingResult =
  | { kind: 'paired'; source: string; metadoc: string }
  | { kind: 'ambiguous'; metadoc: string; candidates: string[] }
  | { kind: 'error'; message: string };

export function isMetadocPath(file: string): boolean {
  return file.toLowerCase().endsWith(METADOC_EXTENSION);
}

/** File name up to (not including) its last dot; the whole name if it has no dot. */
export function stemOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

/** Metadoc files that may describe `source`, most specific first: `<name>.metadoc`, `<stem>.metadoc`. */
export function metadocCandidates(source: string): string[] {
  const directory = path.dirname(source);
  const name = path.basename(source);
  const candidates = [path.join(directory, name + METADOC_EXTENSION)];
  if (stemOf(name) !== name) {
    candidates.push(path.join(directory, stemOf(name) + METADOC_EXTENSION));
  }
  return candidates;
}

/** Resolves a header `source` value (a relative, "/"-separated path) against the metadoc's folder. */
export function resolveHeaderSource(metadoc: string, source: string): string {
  return path.resolve(path.dirname(metadoc), ...source.split('/'));
}

/** Finds the source file a metadoc describes. */
export async function pairFromMetadoc(metadoc: string, fs: PairingFs): Promise<PairingResult> {
  const text = await fs.readText(metadoc);
  if (text === undefined) {
    return { kind: 'error', message: `${path.basename(metadoc)} does not exist` };
  }
  const header = parseMetadoc(text).header;
  if (header?.source) {
    return { kind: 'paired', source: resolveHeaderSource(metadoc, header.source), metadoc };
  }
  // No header source: fall back to the file name.
  const directory = path.dirname(metadoc);
  const base = path.basename(metadoc).slice(0, -METADOC_EXTENSION.length);
  const files = (await fs.listFiles(directory)).filter((file) => !isMetadocPath(file));
  if (stemOf(base) !== base && files.includes(base)) {
    return { kind: 'paired', source: path.join(directory, base), metadoc };
  }
  const candidates = files.filter((file) => stemOf(file) === base).sort();
  if (candidates.length === 1) {
    return { kind: 'paired', source: path.join(directory, candidates[0]), metadoc };
  }
  if (candidates.length > 1) {
    return { kind: 'ambiguous', metadoc, candidates: candidates.map((file) => path.join(directory, file)) };
  }
  return { kind: 'error', message: `no source file found for ${path.basename(metadoc)} (add a source="..." header)` };
}

/** Finds the metadoc describing `source`, honoring the header's explicit `source` attribute. */
export async function pairFromSource(source: string, fs: PairingFs): Promise<PairingResult> {
  const describesOther: string[] = [];
  for (const candidate of metadocCandidates(source)) {
    const text = await fs.readText(candidate);
    if (text === undefined) {
      continue;
    }
    const header = parseMetadoc(text).header;
    if (!header?.source || path.resolve(resolveHeaderSource(candidate, header.source)) === path.resolve(source)) {
      return { kind: 'paired', source, metadoc: candidate };
    }
    describesOther.push(`${path.basename(candidate)} describes ${header.source}`);
  }
  const name = path.basename(source);
  if (describesOther.length > 0) {
    return {
      kind: 'error',
      message: `no metadoc describes ${name} (${describesOther.join('; ')}); create ${name}${METADOC_EXTENSION}`,
    };
  }
  return { kind: 'error', message: `no metadoc found for ${name} (expected ${stemOf(name)}${METADOC_EXTENSION})` };
}
