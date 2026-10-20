/** Provider-agnostic symbol tree, as obtained from a document symbol provider. Lines are 1-based. */
export interface SymbolNode {
  name: string;
  startLine: number;
  endLine: number;
  children?: SymbolNode[];
}

export interface FlatSymbol {
  /** Dotted qualified name, e.g. `linalg.Matrix.multiply`. */
  qualifiedName: string;
  startLine: number;
  endLine: number;
}

/**
 * Turns a provider's symbol name into the dotted form used by metadoc anchors: parameter lists and
 * template arguments are dropped, `::` becomes `.`, a Go receiver `(*T).M` becomes `T.M`.
 */
export function normalizeSymbolName(name: string): string {
  let result = name.trim();
  const receiver = /^\(\s*\*?\s*([\w.]+)\s*\)\s*\.(.+)$/.exec(result);
  if (receiver) {
    result = `${receiver[1]}.${receiver[2]}`;
  }
  const callOperator = /^(.*?\boperator\s*\(\s*\))/.exec(result);
  if (callOperator) {
    result = callOperator[1];
  } else {
    const paren = result.indexOf('(');
    if (paren > 0) {
      result = result.slice(0, paren);
    }
  }
  result = stripTemplateArguments(result);
  return result.replace(/::/g, '.').replace(/\s+/g, '');
}

/** Removes balanced `<...>` groups that follow an identifier, leaving `operator<` and friends alone. */
function stripTemplateArguments(name: string): string {
  let output = '';
  let index = 0;
  while (index < name.length) {
    const char = name[index];
    if (char === '<' && /\w$/.test(output) && !/\boperator$/.test(output)) {
      let depth = 0;
      let close = -1;
      for (let probe = index; probe < name.length; probe++) {
        if (name[probe] === '<') {
          depth++;
        } else if (name[probe] === '>') {
          depth--;
          if (depth === 0) {
            close = probe;
            break;
          }
        }
      }
      if (close > 0) {
        index = close + 1;
        continue;
      }
    }
    output += char;
    index++;
  }
  return output;
}

/** Flattens a symbol tree into qualified names (parent names joined with "."). */
export function flattenSymbols(nodes: readonly SymbolNode[], prefix = ''): FlatSymbol[] {
  const result: FlatSymbol[] = [];
  for (const node of nodes) {
    const own = normalizeSymbolName(node.name);
    const qualifiedName = prefix && own ? `${prefix}.${own}` : own || prefix;
    if (own) {
      result.push({ qualifiedName, startLine: node.startLine, endLine: node.endLine });
    }
    if (node.children && node.children.length > 0) {
      result.push(...flattenSymbols(node.children, qualifiedName));
    }
  }
  return result;
}

/**
 * Symbols matching an anchor's `symbol`. Exact qualified-name matches win. Otherwise one name may be
 * a dot-boundary suffix of the other (one side omits a leading namespace or module), but only when
 * the shorter of the two still has a scope (contains a `.`) and exactly one qualified name matches;
 * anything else returns no candidates so the caller falls back to the line hint. Several results are
 * overloads of one name; the caller picks by line hint.
 */
export function findSymbolCandidates(symbols: readonly FlatSymbol[], symbol: string): FlatSymbol[] {
  const exact = symbols.filter((candidate) => candidate.qualifiedName === symbol);
  if (exact.length > 0) {
    return exact;
  }
  const suffix = symbols.filter(({ qualifiedName }) => {
    const [shorter, longer] = qualifiedName.length < symbol.length ? [qualifiedName, symbol] : [symbol, qualifiedName];
    return shorter.includes('.') && longer.endsWith(`.${shorter}`);
  });
  const names = new Set(suffix.map((candidate) => candidate.qualifiedName));
  return names.size === 1 ? suffix : [];
}
