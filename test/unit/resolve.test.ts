import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { spanHash, splitLines } from '../../src/core/hash';
import { MetadocSection } from '../../src/core/parser';
import { candidateStarts, resolveSection, resolveSections, SEARCH_RADIUS, prepareSource } from '../../src/core/resolve';
import { FlatSymbol } from '../../src/core/symbols';

const original = splitLines(
  [
    'import math', //            1
    '', //                       2
    '@cache', //                 3
    'def area(r):', //           4
    '    return math.pi * r * r', // 5
    '', //                       6
    'def volume(r, h):', //      7
    '    return area(r) * h', // 8
  ].join('\n'),
);

function section(overrides: Partial<MetadocSection>): MetadocSection {
  return { markdown: '', anchorLine: 1, problems: [], ...overrides };
}

const areaSection = section({ symbol: 'area', lines: { start: 3, end: 5 }, hash: spanHash(original, 3, 5) });
const volumeSection = section({ symbol: 'volume', lines: { start: 7, end: 8 }, hash: spanHash(original, 7, 8) });

/** Symbols as a provider would report them; the provider's range excludes the decorator. */
const symbolsOf = (offset: number): FlatSymbol[] => [
  { qualifiedName: 'area', startLine: 4 + offset, endLine: 5 + offset },
  { qualifiedName: 'volume', startLine: 7 + offset, endLine: 8 + offset },
];

describe('candidateStarts', () => {
  it('tries resolved start, hint start, then alternating distances up to the radius', () => {
    const starts = candidateStarts(30, 25);
    assert.deepEqual(starts.slice(0, 6), [30, 25, 29, 31, 28, 32]);
    assert.equal(starts.length, 2 * SEARCH_RADIUS + 1);
    assert.ok(candidateStarts(2, 2).every((start) => start >= 1));
  });
});

describe('resolveSection', () => {
  it('resolves by symbol and verifies the hash even when the provider range differs', () => {
    const result = resolveSection(areaSection, prepareSource(original), symbolsOf(0));
    assert.equal(result.location, 'symbol');
    assert.equal(result.status, 'fresh');
    assert.equal(result.anchorLine, 3);
    assert.deepEqual(result.span, { start: 3, end: 5 });
  });

  it('follows code that moved and keeps it fresh', () => {
    const moved = ['# header', '# more', ...original];
    const result = resolveSection(volumeSection, prepareSource(moved), symbolsOf(2));
    assert.equal(result.status, 'fresh');
    assert.equal(result.anchorLine, 9);
  });

  it('falls back to the line hint without symbols and still finds moved code nearby', () => {
    const moved = ['# header', ...original];
    const result = resolveSection(volumeSection, prepareSource(moved), []);
    assert.equal(result.location, 'lines');
    assert.equal(result.status, 'fresh');
    assert.equal(result.anchorLine, 8);
    assert.match(result.messages[0], /no symbols/);
  });

  it('reports an unknown symbol and uses the line hint', () => {
    const result = resolveSection(section({ ...volumeSection, symbol: 'missing' }), prepareSource(original), symbolsOf(0));
    assert.equal(result.location, 'lines');
    assert.equal(result.status, 'fresh');
    assert.match(result.messages[0], /"missing" not found/);
  });

  it('places a section by line hint when only a same-named symbol in another scope exists', () => {
    const renamed = resolveSection(section({ ...areaSection, symbol: 'Shape.area' }), prepareSource(original), symbolsOf(0));
    assert.equal(renamed.location, 'lines');
    assert.equal(renamed.anchorLine, 3);
    assert.match(renamed.messages[0], /"Shape.area" not found/);

    const deleted = resolveSection(areaSection, prepareSource(original), [
      { qualifiedName: 'Shape.area', startLine: 4, endLine: 5 },
    ]);
    assert.equal(deleted.location, 'lines');
    assert.match(deleted.messages[0], /"area" not found/);
  });

  it('places a section by line hint when the provider omits a scope the anchor names', () => {
    const result = resolveSection(section({ ...areaSection, symbol: 'geometry.area' }), prepareSource(original), symbolsOf(0));
    assert.equal(result.location, 'lines');
    assert.equal(result.status, 'fresh');
    assert.equal(result.anchorLine, 3);
    assert.match(result.messages[0], /"geometry.area" not found/);
  });

  it('marks a section stale when its code changed', () => {
    const edited = [...original];
    edited[7] = '    return area(r) * h * 1.0';
    const result = resolveSection(volumeSection, prepareSource(edited), symbolsOf(0));
    assert.equal(result.status, 'stale');
    assert.equal(result.location, 'symbol');
    assert.equal(result.anchorLine, 7);
    assert.deepEqual(result.span, { start: 7, end: 8 });
  });

  it('does not count whitespace-only edits at line ends as changes', () => {
    const edited = original.map((line) => `${line}  \r`);
    assert.equal(resolveSection(volumeSection, prepareSource(edited), []).status, 'fresh');
  });

  it('reports code moved beyond the search radius without symbols as stale', () => {
    const moved = [...Array(SEARCH_RADIUS + 1).fill('#'), ...original];
    const result = resolveSection(volumeSection, prepareSource(moved), []);
    assert.equal(result.status, 'stale');
    assert.equal(result.anchorLine, 7);
  });

  it('chooses the overload closest to the line hint', () => {
    const symbols: FlatSymbol[] = [
      { qualifiedName: 'volume', startLine: 1, endLine: 2 },
      { qualifiedName: 'volume', startLine: 7, endLine: 8 },
    ];
    assert.equal(resolveSection(volumeSection, prepareSource(original), symbols).anchorLine, 7);
  });

  it('is unverified without hash or lines, and unresolved without any location', () => {
    const noHash = resolveSection(section({ symbol: 'area', lines: { start: 3, end: 5 } }), prepareSource(original), symbolsOf(0));
    assert.equal(noHash.status, 'unverified');
    assert.equal(noHash.anchorLine, 4);

    const nothing = resolveSection(section({ symbol: 'gone' }), prepareSource(original), symbolsOf(0));
    assert.equal(nothing.location, 'unresolved');
    assert.equal(nothing.anchorLine, undefined);
    assert.equal(nothing.status, 'unverified');
  });

  it('treats a hint beyond the end of the file as unresolved and stale', () => {
    const result = resolveSection(
      section({ lines: { start: 50, end: 52 }, hash: '000000000000' }),
      prepareSource(original),
      [],
    );
    assert.equal(result.location, 'unresolved');
    assert.equal(result.status, 'stale');
    assert.equal(result.anchorLine, undefined);
  });

  it('says "placed by line hint" only when the line hint actually placed the section', () => {
    const noHint = resolveSection(section({ symbol: 'gone' }), prepareSource(original), symbolsOf(0));
    assert.equal(noHint.location, 'unresolved');
    assert.deepEqual(noHint.messages, ['symbol "gone" not found', 'section could not be placed in the source']);

    const beyondEnd = resolveSection(
      section({ symbol: 'gone', lines: { start: 50, end: 52 }, hash: '000000000000' }),
      prepareSource(original),
      [],
    );
    assert.equal(beyondEnd.location, 'unresolved');
    assert.equal(beyondEnd.messages[0], 'no symbols available from a symbol provider');
    assert.ok(beyondEnd.messages.every((message) => !message.includes('placed by line hint')));

    const movedIntoFile = resolveSection(
      section({ symbol: 'gone', lines: { start: 10, end: 11 }, hash: volumeSection.hash }),
      prepareSource(original),
      symbolsOf(0),
    );
    assert.equal(movedIntoFile.location, 'lines');
    assert.equal(movedIntoFile.status, 'fresh');
    assert.equal(movedIntoFile.anchorLine, 7);
    assert.deepEqual(movedIntoFile.messages, ['symbol "gone" not found; placed by line hint']);
  });
});

describe('resolveSections', () => {
  it('resolves every section in order', () => {
    const results = resolveSections([areaSection, volumeSection], original, symbolsOf(0));
    assert.deepEqual(results.map((result) => result.anchorLine), [3, 7]);
  });
});
