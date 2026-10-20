import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseAnchorComment, parseLineRange, parseMetadoc } from '../../src/core/parser';
import { readExample } from './helpers';

describe('parseAnchorComment', () => {
  it('reads kind and double-quoted attributes', () => {
    const anchor = parseAnchorComment('<!-- metadoc:section symbol="A.b" lines="3-9" hash="0123456789ab" -->');
    assert.equal(anchor?.kind, 'section');
    assert.deepEqual([...(anchor?.attributes ?? [])], [
      ['symbol', 'A.b'],
      ['lines', '3-9'],
      ['hash', '0123456789ab'],
    ]);
    assert.deepEqual(anchor?.problems, []);
  });

  it('ignores ordinary HTML comments and inline anchors', () => {
    assert.equal(parseAnchorComment('<!-- just a comment -->'), undefined);
    assert.equal(parseAnchorComment('text <!-- metadoc:section lines="1-2" -->'), undefined);
  });

  it('reports unparsable text and duplicate attributes', () => {
    const anchor = parseAnchorComment('<!-- metadoc:section lines="1-2" lines="3-4" junk -->');
    assert.equal(anchor?.attributes.get('lines'), '1-2');
    assert.equal(anchor?.problems.length, 2);
  });
});

describe('parseLineRange', () => {
  it('accepts start-end and single lines', () => {
    assert.deepEqual(parseLineRange('12-40'), { start: 12, end: 40 });
    assert.deepEqual(parseLineRange('7'), { start: 7, end: 7 });
  });

  it('rejects zero, reversed and malformed ranges', () => {
    for (const value of ['0-3', '9-2', '1-', 'a-b', '1:2', '']) {
      assert.equal(parseLineRange(value), undefined, value);
    }
  });
});

describe('parseMetadoc', () => {
  const doc = [
    '',
    '<!-- metadoc:file version="0" source="calc.py" -->',
    '# Overview',
    '',
    'About the file.',
    '',
    '<!-- metadoc:section symbol="Calc.add" lines="3-5" hash="AAAAAAAAAAAA" -->',
    '## add',
    'Adds.',
    '',
    '<!-- metadoc:section lines="8-9" hash="bbbbbbbbbbbb" -->',
    'Tail.',
    '',
  ].join('\n');

  it('reads header, overview and sections in order', () => {
    const parsed = parseMetadoc(doc);
    assert.deepEqual(parsed.header, { line: 2, version: '0', source: 'calc.py' });
    assert.equal(parsed.overview, '# Overview\n\nAbout the file.');
    assert.equal(parsed.sections.length, 2);
    assert.deepEqual(parsed.sections[0], {
      symbol: 'Calc.add',
      lines: { start: 3, end: 5 },
      hash: 'aaaaaaaaaaaa',
      markdown: '## add\nAdds.',
      anchorLine: 7,
      problems: [],
    });
    assert.equal(parsed.sections[1].symbol, undefined);
    assert.equal(parsed.sections[1].markdown, 'Tail.');
    assert.deepEqual(parsed.warnings, []);
  });

  it('treats CRLF metadocs the same', () => {
    assert.deepEqual(parseMetadoc(doc.replace(/\n/g, '\r\n')), parseMetadoc(doc));
  });

  it('keeps sections with malformed attributes and records the problems', () => {
    const parsed = parseMetadoc(
      '<!-- metadoc:file version="0" source="x.py" -->\n<!-- metadoc:section symbol="a b" lines="5-2" hash="xyz" -->\nBody',
    );
    const [section] = parsed.sections;
    assert.equal(section.markdown, 'Body');
    assert.equal(section.symbol, undefined);
    assert.equal(section.lines, undefined);
    assert.equal(section.hash, undefined);
    assert.equal(section.problems.length, 3);
  });

  it('warns about a missing header, unsupported version and unknown anchors', () => {
    assert.match(parseMetadoc('# Text\n').warnings[0], /missing/);
    assert.match(parseMetadoc('<!-- metadoc:file version="7" source="a.c" -->').warnings[0], /not supported/);
    const unknown = parseMetadoc('<!-- metadoc:file version="0" source="a.c" -->\n<!-- metadoc:note x="1" -->\ntext');
    assert.match(unknown.warnings[0], /unknown anchor kind "metadoc:note"/);
    assert.equal(unknown.overview, 'text');
  });

  it('only accepts the header on the first non-blank line', () => {
    const parsed = parseMetadoc('Intro\n<!-- metadoc:file version="0" source="a.c" -->');
    assert.equal(parsed.header, undefined);
    assert.equal(parsed.warnings.length, 2);
  });

  it('does not treat anchors inside fenced code blocks as anchors', () => {
    const parsed = parseMetadoc(
      [
        '<!-- metadoc:file version="0" source="a.c" -->',
        '```markdown',
        '<!-- metadoc:section lines="1-2" hash="000000000000" -->',
        '```',
        '<!-- metadoc:section lines="1-2" hash="000000000000" -->',
        '~~~~',
        '<!-- metadoc:section lines="3-4" hash="000000000000" -->',
        '~~~',
        '~~~~',
      ].join('\n'),
    );
    assert.equal(parsed.sections.length, 1);
    assert.match(parsed.overview ?? '', /```markdown/);
    assert.match(parsed.sections[0].markdown, /lines="3-4"/);
  });

  it('parses the example fixtures without warnings', () => {
    for (const example of ['python/kalman.metadoc', 'cpp/lu_solver.metadoc']) {
      const parsed = parseMetadoc(readExample(example));
      assert.deepEqual(parsed.warnings, [], example);
      assert.ok(parsed.overview, example);
      assert.ok(parsed.sections.length >= 5, example);
      for (const section of parsed.sections) {
        assert.deepEqual(section.problems, [], `${example}:${section.anchorLine}`);
      }
    }
  });
});
