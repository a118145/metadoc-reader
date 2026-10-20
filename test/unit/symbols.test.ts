import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findSymbolCandidates, flattenSymbols, normalizeSymbolName } from '../../src/core/symbols';

describe('normalizeSymbolName', () => {
  it('converts provider names to dotted anchor names', () => {
    assert.equal(normalizeSymbolName('LuSolver::decompose'), 'LuSolver.decompose');
    assert.equal(normalizeSymbolName('solve(const std::vector<double>&) const'), 'solve');
    assert.equal(normalizeSymbolName('Matrix<T>::at'), 'Matrix.at');
    assert.equal(normalizeSymbolName('(*Server).Handle'), 'Server.Handle');
    assert.equal(normalizeSymbolName('operator()'), 'operator()');
    assert.equal(normalizeSymbolName('operator<'), 'operator<');
    assert.equal(normalizeSymbolName('  __init__ '), '__init__');
  });
});

describe('flattenSymbols', () => {
  it('qualifies nested symbols with their parents', () => {
    const flat = flattenSymbols([
      {
        name: 'linalg',
        startLine: 1,
        endLine: 50,
        children: [
          { name: 'LuSolver::solve', startLine: 10, endLine: 20 },
          { name: 'Inner', startLine: 22, endLine: 30, children: [{ name: 'run(int)', startLine: 23, endLine: 29 }] },
        ],
      },
    ]);
    assert.deepEqual(
      flat.map((symbol) => symbol.qualifiedName),
      ['linalg', 'linalg.LuSolver.solve', 'linalg.Inner', 'linalg.Inner.run'],
    );
  });
});

describe('findSymbolCandidates', () => {
  const symbols = flattenSymbols([
    { name: 'ns', startLine: 1, endLine: 40, children: [{ name: 'A::f', startLine: 3, endLine: 5 }, { name: 'A::f', startLine: 7, endLine: 9 }] },
    { name: 'f', startLine: 30, endLine: 31 },
  ]);

  it('prefers exact matches and returns every overload', () => {
    assert.deepEqual(
      findSymbolCandidates(symbols, 'ns.A.f').map((symbol) => symbol.startLine),
      [3, 7],
    );
    assert.deepEqual(findSymbolCandidates(symbols, 'f').map((symbol) => symbol.startLine), [30]);
  });

  it('falls back to dot-boundary suffix matches in either direction', () => {
    assert.deepEqual(findSymbolCandidates(symbols, 'A.f').map((symbol) => symbol.startLine), [3, 7]);
    assert.deepEqual(findSymbolCandidates(symbols, 'outer.ns.A.f').map((symbol) => symbol.startLine), [3, 7]);
    assert.deepEqual(findSymbolCandidates(symbols, 'B.f'), [{ qualifiedName: 'f', startLine: 30, endLine: 31 }]);
    assert.deepEqual(findSymbolCandidates(symbols, 'xf'), []);
  });
});
