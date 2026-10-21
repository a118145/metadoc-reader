import * as assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import { HASH_PATTERN, normalizeLine, spanHash, spanHashOfText, splitLines } from '../../src/core/hash';

const haveShellTools = ['python3', 'awk', 'sha256sum'].every(
  (tool) => spawnSync('sh', ['-c', `command -v ${tool}`]).status === 0,
);

describe('splitLines', () => {
  it('splits on LF, keeps CR for normalization, and ignores the final newline', () => {
    assert.deepEqual(splitLines('a\nb\n'), ['a', 'b']);
    assert.deepEqual(splitLines('a\r\nb'), ['a\r', 'b']);
    assert.deepEqual(splitLines('a\n\n'), ['a', '']);
    assert.deepEqual(splitLines(''), []);
  });

  it('drops a leading byte-order mark', () => {
    assert.deepEqual(splitLines('\uFEFFx\ny'), ['x', 'y']);
  });
});

describe('normalizeLine', () => {
  it('strips only trailing spaces, tabs and carriage returns', () => {
    assert.equal(normalizeLine('  code \t \r'), '  code');
    assert.equal(normalizeLine('\tindented'), '\tindented');
    assert.equal(normalizeLine('nbsp\u00a0'), 'nbsp\u00a0');
  });
});

describe('spanHash', () => {
  it('is the first 12 hex chars of SHA-256 over LF-terminated normalized lines', () => {
    // Independently: printf 'ab\ncd\n' | sha256sum | cut -c1-12
    assert.equal(spanHashOfText('ab  \r\ncd\t\nef', 1, 2), '5141648ccbe9');
    assert.match(spanHashOfText('x', 1, 1) ?? '', HASH_PATTERN);
  });

  it('ignores line-ending style, trailing whitespace and the final newline', () => {
    const unix = spanHashOfText('def f():\n    return 1\n', 1, 2);
    assert.equal(spanHashOfText('def f():  \r\n    return 1', 1, 2), unix);
    assert.equal(spanHashOfText('\uFEFFdef f():\n    return 1\n', 1, 2), unix);
  });

  it('is sensitive to indentation and content', () => {
    const base = spanHashOfText('if x:\n    y()\n', 1, 2);
    assert.notEqual(spanHashOfText('if x:\n  y()\n', 1, 2), base);
    assert.notEqual(spanHashOfText('if x:\n    z()\n', 1, 2), base);
  });

  it('returns undefined for ranges outside the file', () => {
    const lines = splitLines('a\nb\n');
    assert.equal(spanHash(lines, 0, 1), undefined);
    assert.equal(spanHash(lines, 2, 3), undefined);
    assert.equal(spanHash(lines, 2, 1), undefined);
  });

  it('matches the Python and awk one-liners documented in the spec', { skip: !haveShellTools }, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metadoc-hash-'));
    const file = path.join(dir, 'sample.py');
    const text = '\uFEFFimport os\r\n\r\ndef main():   \r\n\tprint(os.getcwd())\t\r\n';
    fs.writeFileSync(file, text, 'utf8');
    const expected = spanHashOfText(text, 2, 4);

    const python = execFileSync('python3', [
      '-c',
      'import hashlib,sys;p,s,e=sys.argv[1],int(sys.argv[2]),int(sys.argv[3]);L=open(p,encoding="utf-8-sig",newline="").read().split("\\n")[s-1:e];print(hashlib.sha256("".join(l.rstrip(" \\t\\r")+"\\n" for l in L).encode()).hexdigest()[:12])',
      file, '2', '4',
    ]).toString().trim();
    assert.equal(python, expected);

    const awk = execFileSync('sh', [
      '-c',
      `LC_ALL=C awk -v s=2 -v e=4 'NR==1{sub(/^\\357\\273\\277/,"")} NR>=s&&NR<=e{sub(/[ \\t\\r]+$/,"");print}' "$1" | sha256sum | cut -c1-12`,
      'sh', file,
    ]).toString().trim();
    assert.equal(awk, expected);
    fs.rmSync(dir, { recursive: true });
  });
});
