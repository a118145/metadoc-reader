import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildRows, computeGaps, nextJumpTarget } from '../../src/core/layout';

describe('buildRows', () => {
  it('starts a row at every anchor and gives leading code its own row', () => {
    assert.deepEqual(buildRows(20, [{ anchorLine: 5 }, { anchorLine: 12 }]), [
      { codeStart: 1, codeEnd: 4, items: [] },
      { codeStart: 5, codeEnd: 11, items: [0] },
      { codeStart: 12, codeEnd: 20, items: [1] },
    ]);
  });

  it('puts an overview (unanchored first item) next to the code before the first anchor', () => {
    assert.deepEqual(buildRows(10, [{}, { anchorLine: 1 }]), [
      { codeStart: 1, codeEnd: 0, items: [0] },
      { codeStart: 1, codeEnd: 10, items: [1] },
    ]);
  });

  it('attaches unanchored blocks to the preceding anchored block', () => {
    assert.deepEqual(buildRows(10, [{ anchorLine: 2 }, {}, { anchorLine: 6 }]), [
      { codeStart: 1, codeEnd: 1, items: [] },
      { codeStart: 2, codeEnd: 5, items: [0, 1] },
      { codeStart: 6, codeEnd: 10, items: [2] },
    ]);
  });

  it('orders anchored blocks by source line, keeping their followers', () => {
    assert.deepEqual(buildRows(10, [{ anchorLine: 6 }, {}, { anchorLine: 2 }]), [
      { codeStart: 1, codeEnd: 1, items: [] },
      { codeStart: 2, codeEnd: 5, items: [2] },
      { codeStart: 6, codeEnd: 10, items: [0, 1] },
    ]);
  });

  it('produces empty code rows for blocks sharing a start line (nested sections)', () => {
    assert.deepEqual(buildRows(8, [{ anchorLine: 3 }, { anchorLine: 3 }]), [
      { codeStart: 1, codeEnd: 2, items: [] },
      { codeStart: 3, codeEnd: 2, items: [0] },
      { codeStart: 3, codeEnd: 8, items: [1] },
    ]);
  });

  it('covers every source line exactly once', () => {
    const rows = buildRows(100, [{ anchorLine: 40 }, {}, { anchorLine: 7 }, { anchorLine: 7 }, { anchorLine: 99 }]);
    const covered: number[] = [];
    for (const row of rows) {
      for (let line = row.codeStart; line <= row.codeEnd; line++) {
        covered.push(line);
      }
    }
    assert.deepEqual(covered, Array.from({ length: 100 }, (_, index) => index + 1));
  });

  it('handles a source without anchors and an empty source', () => {
    assert.deepEqual(buildRows(3, []), [{ codeStart: 1, codeEnd: 3, items: [] }]);
    assert.deepEqual(buildRows(0, []), []);
    assert.deepEqual(buildRows(0, [{}]), [{ codeStart: 1, codeEnd: 0, items: [0] }]);
  });
});

describe('computeGaps', () => {
  it('pads the shorter side of each row so both sides end together', () => {
    assert.deepEqual(
      computeGaps([
        { code: 120, doc: 40 },
        { code: 30, doc: 90 },
        { code: 50, doc: 50 },
        { code: 0, doc: 25 },
      ]),
      [
        { code: 0, doc: 80 },
        { code: 60, doc: 0 },
        { code: 0, doc: 0 },
        { code: 25, doc: 0 },
      ],
    );
  });

  it('keeps every row top aligned across both sides', () => {
    const heights = [
      { code: 10, doc: 33 },
      { code: 70, doc: 5 },
      { code: 18, doc: 18.5 },
    ];
    const gaps = computeGaps(heights);
    let codeTop = 0;
    let docTop = 0;
    heights.forEach((height, index) => {
      assert.equal(codeTop, docTop);
      codeTop += height.code + gaps[index].code;
      docTop += height.doc + gaps[index].doc;
    });
    assert.equal(codeTop, docTop);
  });
});

describe('nextJumpTarget', () => {
  it('moves past the target that the previous jump landed on', () => {
    // Toolbar 32 px + 8 px landing margin: the first stale section sits at the landing position.
    assert.equal(nextJumpTarget([40, 885], 40), 1);
    assert.equal(nextJumpTarget([40.5, 885], 40), 1);
  });

  it('picks the first target below the landing position and wraps after the last', () => {
    assert.equal(nextJumpTarget([-300, 120, 900], 40), 1);
    assert.equal(nextJumpTarget([-900, 40], 40), 0);
    assert.equal(nextJumpTarget([], 40), -1);
  });
});
