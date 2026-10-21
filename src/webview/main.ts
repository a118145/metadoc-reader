import { computeGaps } from '../core/layout';
import type { DocBlock, ViewModel } from '../core/model';

interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): WebviewState | undefined;
  setState(state: WebviewState): void;
}

interface WebviewState {
  source?: string;
  metadoc?: string;
  scrollY?: number;
}

type HostMessage =
  | { type: 'model'; model: ViewModel; state: { source: string; metadoc: string } }
  | { type: 'error'; message: string };

declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();
const toolbar = document.getElementById('toolbar') as HTMLElement;
const messages = document.getElementById('messages') as HTMLElement;
const codeColumn = document.getElementById('code-column') as HTMLElement;
const docColumn = document.getElementById('doc-column') as HTMLElement;

let state: WebviewState = vscode.getState() ?? {};
let rowPairs: { code: HTMLElement; doc: HTMLElement; codeGap: HTMLElement; docGap: HTMLElement }[] = [];
let layoutPending = false;
let firstRender = true;

const resizeObserver = new ResizeObserver(() => scheduleLayout());

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

/** Equalizes the height of each row pair by growing the shorter side's gap. */
function layout(): void {
  layoutPending = false;
  const heights = rowPairs.map((pair) => ({
    code: pair.code.getBoundingClientRect().height,
    doc: pair.doc.getBoundingClientRect().height,
  }));
  computeGaps(heights).forEach((gap, index) => {
    const pair = rowPairs[index];
    pair.codeGap.style.height = `${gap.code}px`;
    pair.docGap.style.height = `${gap.doc}px`;
    pair.codeGap.classList.toggle('visible-gap', gap.code > 0);
    pair.docGap.classList.toggle('visible-gap', gap.doc > 0);
  });
}

function scheduleLayout(): void {
  if (!layoutPending) {
    layoutPending = true;
    requestAnimationFrame(layout);
  }
}

function statusBadges(block: DocBlock): HTMLElement[] {
  const badges: HTMLElement[] = [];
  if (block.status === 'stale') {
    badges.push(element('span', 'badge badge-stale', 'stale'));
  } else if (block.status === 'unverified') {
    badges.push(element('span', 'badge badge-unverified', 'unverified'));
  }
  if (block.symbol && block.location === 'lines') {
    badges.push(element('span', 'badge badge-lines', 'line hint'));
  } else if (block.location === 'unresolved') {
    badges.push(element('span', 'badge badge-unresolved', 'not placed'));
  }
  return badges;
}

function renderBlock(block: DocBlock, index: number): HTMLElement {
  const container = element('section', `block block-${block.kind}`);
  container.dataset.block = String(index);
  if (block.status) {
    container.classList.add(`status-${block.status}`);
  }
  if (block.location) {
    container.classList.add(`location-${block.location}`);
  }

  if (block.kind === 'section') {
    const meta = element('div', 'block-meta');
    if (block.symbol) {
      meta.append(element('code', 'symbol', block.symbol));
    }
    if (block.span) {
      meta.append(element('span', 'lines', `L${block.span.start}–${block.span.end}`));
    }
    meta.append(...statusBadges(block));
    container.append(meta);
  }
  if (block.messages.length > 0 && block.status !== 'fresh') {
    const list = element('ul', 'block-messages');
    for (const message of block.messages) {
      list.append(element('li', undefined, message));
    }
    container.append(list);
  }
  const body = element('div', 'markdown-body');
  body.innerHTML = block.html; // produced by markdown-it with raw HTML disabled
  container.append(body);
  return container;
}

function renderToolbar(model: ViewModel): void {
  toolbar.replaceChildren();
  const title = element('div', 'title');
  title.append(element('span', 'file', model.sourceName), element('span', 'separator', '⟷'), element('span', 'file', model.metadocName));
  const chips = element('div', 'chips');
  const { summary } = model;
  chips.append(element('span', 'chip', `${summary.sections} sections`));
  if (summary.fresh > 0) {
    chips.append(element('span', 'chip chip-fresh', `${summary.fresh} up to date`));
  }
  if (summary.stale > 0) {
    chips.append(element('span', 'chip chip-stale', `${summary.stale} stale`));
  }
  if (summary.unverified > 0) {
    chips.append(element('span', 'chip chip-unverified', `${summary.unverified} unverified`));
  }
  if (summary.byLines > 0) {
    chips.append(element('span', 'chip chip-lines', `${summary.byLines} placed by line hint`));
  }
  if (summary.unresolved > 0) {
    chips.append(element('span', 'chip chip-unresolved', `${summary.unresolved} not placed`));
  }
  toolbar.append(title, chips);
}

function renderMessages(model: ViewModel): void {
  messages.replaceChildren();
  if (model.warnings.length === 0) {
    return;
  }
  const details = element('details', 'warnings');
  details.append(element('summary', undefined, `${model.warnings.length} metadoc warning(s)`));
  const list = element('ul');
  for (const warning of model.warnings) {
    list.append(element('li', undefined, warning));
  }
  details.append(list);
  messages.append(details);
}

function render(model: ViewModel): void {
  const scrollY = firstRender ? state.scrollY ?? 0 : window.scrollY;
  firstRender = false;
  resizeObserver.disconnect();
  renderToolbar(model);
  renderMessages(model);

  const staleLines = new Set<number>();
  for (const block of model.blocks) {
    if (block.status === 'stale' && block.span) {
      for (let line = block.span.start; line <= block.span.end; line++) {
        staleLines.add(line);
      }
    }
  }

  const codeRows: HTMLElement[] = [];
  const docRows: HTMLElement[] = [];
  rowPairs = model.rows.map((row) => {
    const codeRow = element('div', 'row code-row');
    const code = element('div', 'row-content');
    for (let line = row.codeStart; line <= row.codeEnd; line++) {
      const lineElement = element('div', staleLines.has(line) ? 'line stale-line' : 'line');
      const number = element('span', 'line-number', String(line));
      const text = element('span', 'line-text');
      text.innerHTML = model.codeLines[line - 1] || ' '; // highlight.js output is escaped HTML
      lineElement.append(number, text);
      code.append(lineElement);
    }
    const codeGap = element('div', 'gap');
    codeRow.append(code, codeGap);

    const docRow = element('div', 'row doc-row');
    const doc = element('div', 'row-content');
    for (const index of row.blocks) {
      doc.append(renderBlock(model.blocks[index], index));
    }
    const docGap = element('div', 'gap');
    docRow.append(doc, docGap);

    codeRows.push(codeRow);
    docRows.push(docRow);
    resizeObserver.observe(code);
    resizeObserver.observe(doc);
    return { code, doc, codeGap, docGap };
  });
  codeColumn.replaceChildren(...codeRows);
  docColumn.replaceChildren(...docRows);
  layout();
  window.scrollTo({ top: scrollY });
}

function renderError(message: string): void {
  toolbar.replaceChildren(element('div', 'title', 'Metadoc Reader'));
  messages.replaceChildren(element('div', 'error', message));
}

window.addEventListener('message', (event: MessageEvent<HostMessage>) => {
  const message = event.data;
  if (message.type === 'model') {
    state = { ...state, ...message.state };
    vscode.setState(state);
    render(message.model);
  } else if (message.type === 'error') {
    renderError(message.message);
  }
});

let scrollSaveTimer: number | undefined;
window.addEventListener('scroll', () => {
  window.clearTimeout(scrollSaveTimer);
  scrollSaveTimer = window.setTimeout(() => {
    state = { ...state, scrollY: window.scrollY };
    vscode.setState(state);
  }, 150);
});
window.addEventListener('resize', scheduleLayout);

vscode.postMessage({ type: 'ready' });
