import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { highlightLanguage, highlightLines, renderMarkdown, splitHighlightedHtml } from '../../src/core/render';

describe('splitHighlightedHtml', () => {
  it('closes and reopens spans that cross line breaks', () => {
    assert.deepEqual(splitHighlightedHtml('a<span class="c">/*x\ny*/</span>b\nz'), [
      'a<span class="c">/*x</span>',
      '<span class="c">y*/</span>b',
      'z',
    ]);
  });
});

describe('highlightLines', () => {
  it('returns one escaped HTML line per source line', () => {
    const lines = ['s = """a', '<b>"""', 'x = 1'];
    const html = highlightLines(lines, 'python');
    assert.equal(html.length, 3);
    assert.match(html[1], /&lt;b&gt;/);
    assert.match(html[0], /hljs-string/);
    assert.match(html[1], /^<span class="hljs-string">/);
  });

  it('escapes plain text when no language is known', () => {
    assert.deepEqual(highlightLines(['<a & b>'], undefined), ['&lt;a &amp; b&gt;']);
  });
});

describe('highlightLanguage', () => {
  it('maps VS Code language ids and extensions to highlight.js languages', () => {
    assert.equal(highlightLanguage('python', '.py'), 'python');
    assert.equal(highlightLanguage('cpp', '.cpp'), 'cpp');
    assert.equal(highlightLanguage('plaintext', '.hpp'), 'hpp');
    assert.equal(highlightLanguage('shellscript', '.sh'), 'bash');
    assert.equal(highlightLanguage('plaintext', '.unknownext'), undefined);
  });
});

describe('renderMarkdown', () => {
  it('renders Markdown and escapes raw HTML', () => {
    const html = renderMarkdown('## Title\n\n<script>alert(1)</script> `code`');
    assert.match(html, /<h2>Title<\/h2>/);
    assert.match(html, /&lt;script&gt;/);
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /<code>code<\/code>/);
  });

  it('links explicit URLs but not bare file names', () => {
    const html = renderMarkdown('See kalman.py and https://example.com/x.');
    assert.doesNotMatch(html, /href="http:\/\/kalman\.py"/);
    assert.match(html, /<a href="https:\/\/example\.com\/x">/);
  });
});
