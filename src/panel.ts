import * as path from 'path';
import * as vscode from 'vscode';
import { buildViewModel } from './core/model';
import { highlightLanguage } from './core/render';
import { documentSymbols } from './symbolProvider';

export const VIEW_TYPE = 'metadocReader.view';

/** Persisted webview state, used to restore panels after a window reload. */
export interface PanelState {
  source: string;
  metadoc: string;
  scrollY?: number;
}

/** Messages the webview sends to the extension. */
type WebviewMessage =
  | { type: 'ready' }
  | { type: 'reveal'; target: 'source' | 'metadoc'; line: number };

const REFRESH_DELAY_MS = 200;
/** Retries while a language server has not produced symbols yet. */
const SYMBOL_RETRY_DELAYS_MS = [1000, 2500, 5000];

function webviewOptions(context: vscode.ExtensionContext): vscode.WebviewOptions {
  return {
    enableScripts: true,
    localResourceRoots: [
      vscode.Uri.joinPath(context.extensionUri, 'media'),
      vscode.Uri.joinPath(context.extensionUri, 'dist'),
    ],
  };
}

/** One reader panel showing a source file and its metadoc side by side. */
export class MetadocPanel {
  private static readonly panels = new Map<string, MetadocPanel>();

  private readonly disposables: vscode.Disposable[] = [];
  private refreshTimer: NodeJS.Timeout | undefined;
  private symbolRetry = 0;
  private ready = false;

  /** Opens (or reveals) the reader for a source/metadoc pair. */
  static show(context: vscode.ExtensionContext, source: vscode.Uri, metadoc: vscode.Uri): void {
    const existing = MetadocPanel.panels.get(source.toString());
    if (existing && existing.metadoc.toString() === metadoc.toString()) {
      existing.panel.reveal();
      existing.scheduleRefresh(0);
      return;
    }
    existing?.panel.dispose();
    const panel = vscode.window.createWebviewPanel(VIEW_TYPE, '', vscode.ViewColumn.Active, webviewOptions(context));
    new MetadocPanel(context, panel, source, metadoc);
  }

  /** Re-attaches a panel VS Code restored after a reload. */
  static revive(context: vscode.ExtensionContext, panel: vscode.WebviewPanel, state: PanelState): void {
    panel.webview.options = webviewOptions(context);
    new MetadocPanel(context, panel, vscode.Uri.parse(state.source), vscode.Uri.parse(state.metadoc));
  }

  private constructor(
    context: vscode.ExtensionContext,
    private readonly panel: vscode.WebviewPanel,
    private readonly source: vscode.Uri,
    private readonly metadoc: vscode.Uri,
  ) {
    MetadocPanel.panels.set(source.toString(), this);
    const media = vscode.Uri.joinPath(context.extensionUri, 'media');
    const dist = vscode.Uri.joinPath(context.extensionUri, 'dist');
    panel.title = `${path.basename(source.fsPath)} · metadoc`;
    panel.webview.html = this.html(
      panel.webview.asWebviewUri(vscode.Uri.joinPath(dist, 'webview.js')),
      panel.webview.asWebviewUri(vscode.Uri.joinPath(media, 'webview.css')),
    );

    panel.onDidDispose(() => this.dispose(), undefined, this.disposables);
    panel.webview.onDidReceiveMessage((message: WebviewMessage) => this.onMessage(message), undefined, this.disposables);

    const isOurs = (uri: vscode.Uri): boolean =>
      uri.toString() === source.toString() || uri.toString() === metadoc.toString();
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (isOurs(event.document.uri)) {
          this.scheduleRefresh();
        }
      }),
    );
    for (const uri of [source, metadoc]) {
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(vscode.Uri.file(path.dirname(uri.fsPath)), path.basename(uri.fsPath)),
      );
      watcher.onDidChange(() => this.scheduleRefresh(), undefined, this.disposables);
      watcher.onDidCreate(() => this.scheduleRefresh(), undefined, this.disposables);
      watcher.onDidDelete(() => this.scheduleRefresh(), undefined, this.disposables);
      this.disposables.push(watcher);
    }
  }

  private onMessage(message: WebviewMessage): void {
    if (message.type === 'ready') {
      this.ready = true;
      this.scheduleRefresh(0);
    } else if (message.type === 'reveal') {
      const uri = message.target === 'source' ? this.source : this.metadoc;
      const position = new vscode.Position(Math.max(0, message.line - 1), 0);
      void vscode.window.showTextDocument(uri, {
        viewColumn: vscode.ViewColumn.Beside,
        selection: new vscode.Range(position, position),
      });
    }
  }

  private scheduleRefresh(delay = REFRESH_DELAY_MS): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      void this.refresh();
    }, delay);
  }

  private async refresh(): Promise<void> {
    if (!this.ready) {
      return;
    }
    let sourceDocument: vscode.TextDocument;
    let metadocDocument: vscode.TextDocument;
    try {
      [sourceDocument, metadocDocument] = await Promise.all([
        vscode.workspace.openTextDocument(this.source),
        vscode.workspace.openTextDocument(this.metadoc),
      ]);
    } catch (error) {
      void this.panel.webview.postMessage({ type: 'error', message: `Cannot read files: ${String(error)}` });
      return;
    }

    const symbols = await documentSymbols(sourceDocument);
    const model = buildViewModel({
      sourceName: path.basename(this.source.fsPath),
      metadocName: path.basename(this.metadoc.fsPath),
      sourceText: sourceDocument.getText(),
      metadocText: metadocDocument.getText(),
      symbols,
      language: highlightLanguage(sourceDocument.languageId, path.extname(this.source.fsPath)),
    });
    const state: PanelState = { source: this.source.toString(), metadoc: this.metadoc.toString() };
    void this.panel.webview.postMessage({ type: 'model', model, state });

    // Language servers often answer with no symbols while they are still starting up.
    const wantsSymbols = model.blocks.some((block) => block.symbol);
    if (symbols.length === 0 && wantsSymbols && this.symbolRetry < SYMBOL_RETRY_DELAYS_MS.length) {
      this.scheduleRefresh(SYMBOL_RETRY_DELAYS_MS[this.symbolRetry++]);
    }
  }

  private html(script: vscode.Uri, style: vscode.Uri): string {
    const nonce = [...Array(32)].map(() => Math.floor(Math.random() * 36).toString(36)).join('');
    const csp = [
      "default-src 'none'",
      `style-src ${this.panel.webview.cspSource}`,
      `img-src ${this.panel.webview.cspSource} https: data:`,
      `font-src ${this.panel.webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
    ].join('; ');
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${style}">
<title>Metadoc Reader</title>
</head>
<body>
<header id="toolbar"></header>
<div id="messages"></div>
<main id="view">
  <div id="code-column" class="column"></div>
  <div id="doc-column" class="column"></div>
</main>
<script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
  }

  private dispose(): void {
    if (MetadocPanel.panels.get(this.source.toString()) === this) {
      MetadocPanel.panels.delete(this.source.toString());
    }
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    for (const disposable of this.disposables.splice(0)) {
      disposable.dispose();
    }
  }
}
