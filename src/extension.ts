import * as path from 'path';
import * as vscode from 'vscode';
import { isMetadocPath, pairFromMetadoc, pairFromSource, PairingFs, PairingResult } from './core/pairing';
import { MetadocPanel, PanelState, VIEW_TYPE } from './panel';

/** Pairing file access through VS Code, preferring unsaved editor contents. */
const workspaceFs: PairingFs = {
  async readText(file) {
    const open = vscode.workspace.textDocuments.find((document) => document.uri.fsPath === file);
    if (open) {
      return open.getText();
    }
    try {
      return new TextDecoder().decode(await vscode.workspace.fs.readFile(vscode.Uri.file(file)));
    } catch {
      return undefined;
    }
  },
  async listFiles(directory) {
    try {
      const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(directory));
      return entries.filter(([, type]) => type === vscode.FileType.File).map(([name]) => name);
    } catch {
      return [];
    }
  },
};

async function exists(file: string): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(vscode.Uri.file(file));
    return true;
  } catch {
    return false;
  }
}

async function openReader(context: vscode.ExtensionContext, target?: vscode.Uri): Promise<void> {
  const uri = target instanceof vscode.Uri ? target : vscode.window.activeTextEditor?.document.uri;
  if (!uri || uri.scheme !== 'file') {
    void vscode.window.showErrorMessage('Metadoc Reader: open a source file or a .metadoc file first.');
    return;
  }

  let result: PairingResult = isMetadocPath(uri.fsPath)
    ? await pairFromMetadoc(uri.fsPath, workspaceFs)
    : await pairFromSource(uri.fsPath, workspaceFs);
  if (result.kind === 'ambiguous') {
    const pick = await vscode.window.showQuickPick(
      result.candidates.map((candidate) => path.basename(candidate)),
      { placeHolder: `Which file does ${path.basename(result.metadoc)} describe?` },
    );
    if (!pick) {
      return;
    }
    result = { kind: 'paired', metadoc: result.metadoc, source: path.join(path.dirname(result.metadoc), pick) };
  }
  if (result.kind === 'error') {
    void vscode.window.showErrorMessage(`Metadoc Reader: ${result.message}`);
    return;
  }
  if (!(await exists(result.source))) {
    void vscode.window.showErrorMessage(
      `Metadoc Reader: ${path.basename(result.metadoc)} names ${path.basename(result.source)}, which does not exist.`,
    );
    return;
  }
  MetadocPanel.show(context, vscode.Uri.file(result.source), vscode.Uri.file(result.metadoc));
}

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('metadocReader.open', (uri?: vscode.Uri) => openReader(context, uri)),
    vscode.window.registerWebviewPanelSerializer(VIEW_TYPE, {
      async deserializeWebviewPanel(panel: vscode.WebviewPanel, state: PanelState | undefined) {
        if (state?.source && state.metadoc) {
          MetadocPanel.revive(context, panel, state);
        } else {
          panel.dispose();
        }
      },
    }),
  );
}

export function deactivate(): void {
  // Panels dispose themselves with their webviews.
}
