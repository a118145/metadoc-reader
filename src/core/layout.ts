/**
 * Alignment model. The view is a sequence of rows; each row pairs a contiguous block of source lines
 * with the metadoc blocks that describe it. A row starts at the anchor line of its first block, so
 * aligning row tops aligns every anchored section with the start of its code span.
 */

export interface LayoutItem {
  /** Source line this block aligns with; undefined for blocks that just follow their predecessor. */
  anchorLine?: number;
}

export interface Row {
  /** First source line of the row (1-based). */
  codeStart: number;
  /** Last source line of the row; codeEnd < codeStart means the row has no code. */
  codeEnd: number;
  /** Indices into the item list, in display order. */
  items: number[];
}

/**
 * Splits `lineCount` source lines into rows for the given doc blocks (in metadoc order). Unanchored
 * blocks stay attached to the anchored block before them (or to the leading row). Anchored blocks
 * are ordered by anchor line (stable), so a metadoc written out of source order still aligns.
 */
export function buildRows(lineCount: number, items: readonly LayoutItem[]): Row[] {
  const leading: number[] = [];
  const groups: { anchor: number; items: number[] }[] = [];
  items.forEach((item, index) => {
    if (item.anchorLine !== undefined) {
      const anchor = Math.min(Math.max(1, item.anchorLine), lineCount + 1);
      groups.push({ anchor, items: [index] });
    } else if (groups.length === 0) {
      leading.push(index);
    } else {
      groups[groups.length - 1].items.push(index);
    }
  });
  groups.sort((a, b) => a.anchor - b.anchor);

  const rows: Row[] = [];
  const firstAnchor = groups.length > 0 ? groups[0].anchor : lineCount + 1;
  if (leading.length > 0 || firstAnchor > 1) {
    rows.push({ codeStart: 1, codeEnd: firstAnchor - 1, items: leading });
  }
  groups.forEach((group, index) => {
    const next = index + 1 < groups.length ? groups[index + 1].anchor : lineCount + 1;
    rows.push({ codeStart: group.anchor, codeEnd: next - 1, items: group.items });
  });
  return rows;
}

export interface RowHeights {
  code: number;
  doc: number;
}

/**
 * Gap (blank space appended below the content) on each side of every row, so that both sides of a
 * row end at the same height and therefore every following row starts aligned. The shorter side of
 * each row gets the difference; the taller side gets none.
 */
export function computeGaps(heights: readonly RowHeights[]): RowHeights[] {
  return heights.map(({ code, doc }) => {
    const height = Math.max(code, doc);
    return { code: height - code, doc: height - doc };
  });
}

/**
 * Index of the next target to jump to, given the viewport tops of all targets (in document order)
 * and the top a jump scrolls its target to. A target at (or within a couple of pixels of) the
 * landing position is the current one, so the first target below it is next; after the last one,
 * or when the page cannot scroll any further (`atEnd`), the jump wraps to the first. Returns -1
 * when there are no targets.
 */
export function nextJumpTarget(tops: readonly number[], landing: number, atEnd = false): number {
  if (tops.length === 0) {
    return -1;
  }
  if (atEnd) {
    return 0;
  }
  const next = tops.findIndex((top) => top > landing + 2);
  return next === -1 ? 0 : next;
}
