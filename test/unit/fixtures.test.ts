import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { splitLines } from '../../src/core/hash';
import { buildViewModel } from '../../src/core/model';
import { parseMetadoc } from '../../src/core/parser';
import { resolveSections } from '../../src/core/resolve';
import { FlatSymbol, flattenSymbols } from '../../src/core/symbols';
import { readExample } from './helpers';

/** Shaped like Pylance's document symbols for kalman.py (ranges exclude decorators). */
const pythonSymbols = flattenSymbols([
  { name: 'GaussianState', startLine: 10, endLine: 16, children: [{ name: 'mean', startLine: 13, endLine: 13 }] },
  {
    name: 'KalmanFilter',
    startLine: 19,
    endLine: 58,
    children: [
      { name: '__init__', startLine: 22, endLine: 26 },
      { name: 'predict', startLine: 28, endLine: 39 },
      { name: 'update', startLine: 41, endLine: 54 },
      { name: 'position', startLine: 57, endLine: 58 },
    ],
  },
  { name: 'simulate', startLine: 61, endLine: 74 },
]);

/** Shaped like clangd's document symbols for lu_solver.cpp (out-of-line definitions). */
const cppSymbols = flattenSymbols([
  {
    name: 'linalg',
    startLine: 7,
    endLine: 87,
    children: [
      { name: '(anonymous namespace)', startLine: 9, endLine: 11, children: [{ name: 'kPivotTolerance', startLine: 10, endLine: 10 }] },
      { name: 'LuSolver::LuSolver', startLine: 13, endLine: 17 },
      { name: 'LuSolver::decompose', startLine: 19, endLine: 49 },
      { name: 'LuSolver::solve', startLine: 51, endLine: 74 },
      { name: 'LuSolver::determinant', startLine: 76, endLine: 85 },
    ],
  },
]);

const examples: { name: string; source: string; metadoc: string; symbols: FlatSymbol[]; language: string }[] = [
  { name: 'python', source: 'python/kalman.py', metadoc: 'python/kalman.metadoc', symbols: pythonSymbols, language: 'python' },
  { name: 'cpp', source: 'cpp/lu_solver.cpp', metadoc: 'cpp/lu_solver.metadoc', symbols: cppSymbols, language: 'cpp' },
];

for (const example of examples) {
  describe(`example fixture: ${example.name}`, () => {
    const sourceText = readExample(example.source);
    const metadocText = readExample(example.metadoc);
    const parsed = parseMetadoc(metadocText);

    it('names its source file in the header', () => {
      assert.equal(parsed.header?.source, example.source.split('/')[1]);
    });

    it('has every section fresh and placed by symbol when symbols are available', () => {
      const resolved = resolveSections(parsed.sections, splitLines(sourceText), example.symbols);
      for (const entry of resolved) {
        assert.equal(entry.status, 'fresh', `${entry.section.symbol ?? entry.section.anchorLine}: ${entry.messages.join('; ')}`);
        assert.equal(entry.location, entry.section.symbol ? 'symbol' : 'lines');
        assert.equal(entry.anchorLine, entry.section.lines?.start);
      }
    });

    it('stays fresh by line hint when no symbol provider is installed', () => {
      const resolved = resolveSections(parsed.sections, splitLines(sourceText), []);
      assert.ok(resolved.every((entry) => entry.status === 'fresh' && entry.location === 'lines'));
    });

    it('marks only the edited section stale', () => {
      const lines = splitLines(sourceText);
      const target = parsed.sections[parsed.sections.length - 1];
      const editLine = (target.lines?.start ?? 1) + 1;
      lines[editLine - 1] += ' // edited';
      const resolved = resolveSections(parsed.sections, lines, example.symbols);
      assert.deepEqual(
        resolved.map((entry) => entry.status),
        parsed.sections.map((section) => (section === target ? 'stale' : 'fresh')),
      );
    });

    it('keeps all sections fresh after inserting lines at the top of the file', () => {
      const shifted = `${'\n'.repeat(5)}${sourceText}`;
      const symbols = example.symbols.map((symbol) => ({ ...symbol, startLine: symbol.startLine + 5, endLine: symbol.endLine + 5 }));
      const resolved = resolveSections(parsed.sections, splitLines(shifted), symbols);
      assert.ok(resolved.every((entry) => entry.status === 'fresh'));
      assert.deepEqual(
        resolved.map((entry) => entry.anchorLine),
        parsed.sections.map((section) => (section.lines?.start ?? 0) + 5),
      );
    });

    it('builds a view model whose rows cover the source and align every section', () => {
      const model = buildViewModel({
        sourceName: example.source,
        metadocName: example.metadoc,
        sourceText,
        metadocText,
        symbols: example.symbols,
        language: example.language,
      });
      const lineCount = splitLines(sourceText).length;
      assert.equal(model.codeLines.length, lineCount);
      assert.deepEqual(model.summary, {
        sections: parsed.sections.length,
        fresh: parsed.sections.length,
        stale: 0,
        unverified: 0,
        unresolved: 0,
        bySymbol: parsed.sections.filter((section) => section.symbol).length,
        byLines: parsed.sections.filter((section) => !section.symbol).length,
      });
      assert.equal(model.blocks[0].kind, 'overview');
      assert.deepEqual(model.rows[0].blocks, [0]);
      let expectedStart = 1;
      for (const row of model.rows) {
        assert.equal(row.codeStart, expectedStart);
        expectedStart = row.codeEnd + 1;
        for (const index of row.blocks) {
          const block = model.blocks[index];
          if (block.kind === 'section') {
            assert.equal(block.span?.start, row.codeStart);
          }
        }
      }
      assert.equal(expectedStart, lineCount + 1);
    });
  });
}
