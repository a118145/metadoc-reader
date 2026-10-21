import * as vscode from 'vscode';
import { FlatSymbol, flattenSymbols, normalizeSymbolName, SymbolNode } from './core/symbols';

function fromDocumentSymbol(symbol: vscode.DocumentSymbol): SymbolNode {
  return {
    name: symbol.name,
    startLine: symbol.range.start.line + 1,
    endLine: symbol.range.end.line + 1,
    children: symbol.children.map(fromDocumentSymbol),
  };
}

/**
 * Qualified symbols of a document from whatever document symbol provider is installed for its
 * language. Returns an empty list if there is no provider (or it has not started yet).
 */
export async function documentSymbols(document: vscode.TextDocument): Promise<FlatSymbol[]> {
  let result: (vscode.DocumentSymbol | vscode.SymbolInformation)[] | undefined;
  try {
    result = await vscode.commands.executeCommand<(vscode.DocumentSymbol | vscode.SymbolInformation)[]>(
      'vscode.executeDocumentSymbolProvider',
      document.uri,
    );
  } catch {
    return [];
  }
  if (!result || result.length === 0) {
    return [];
  }
  if ('children' in result[0]) {
    return flattenSymbols((result as vscode.DocumentSymbol[]).map(fromDocumentSymbol));
  }
  // Flat SymbolInformation: qualify with the container name.
  return (result as vscode.SymbolInformation[]).map((symbol) => {
    const name = normalizeSymbolName(symbol.name);
    const container = symbol.containerName ? normalizeSymbolName(symbol.containerName) : '';
    return {
      qualifiedName: container ? `${container}.${name}` : name,
      startLine: symbol.location.range.start.line + 1,
      endLine: symbol.location.range.end.line + 1,
    };
  });
}
