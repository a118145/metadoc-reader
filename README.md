# Metadoc Reader

AI tools now write code faster than people can read it. A **metadoc** is a companion file,
`<stem>.metadoc` next to `<stem>.py` / `<stem>.cpp` / ..., with short full-text explanations of
the file's algorithms, classes and functions. **Metadoc Reader** is a VS Code extension that shows
a source file and its metadoc side by side:

- each description sits level with the first line of the code it describes,
- blank gaps are inserted on whichever side is shorter, so the pairs stay aligned,
- both sides scroll together, even where the code and the text have very different lengths,
- descriptions whose code has changed since they were written are flagged as **stale**,
- the view refreshes when either file changes, on disk or in an open editor.

Metadocs are plain Markdown with invisible HTML-comment anchors, so they also read well on GitHub
and in any editor. The format is defined in **[docs/metadoc-spec.md](docs/metadoc-spec.md)**. That
document is the reference for tools (such as the companion *metadoc-skill* for AI agents) that
generate metadoc files.

```markdown
<!-- metadoc:file version="0" source="kalman.py" -->
# kalman.py
A minimal constant-velocity Kalman filter ...

<!-- metadoc:section symbol="KalmanFilter.update" lines="41-54" hash="a474c953856a" -->
### `update` — measurement update
Fuses one position measurement into the belief ...
```

Each section names a **symbol** (`KalmanFilter.update`), a **line-range hint** (`41-54`) and a
**hash** of that source span. The reader finds the code by symbol, using VS Code's document symbol
provider for the file's language, and falls back to the line hint. It marks the section stale when
the hash no longer matches.

## Install

Requirements: VS Code 1.85 or newer. Node.js 18+ and npm are needed only to build from source.

### From a `.vsix`

```sh
code --install-extension metadoc-reader-0.1.0.vsix
```

You can also run **Extensions: Install from VSIX...** from the command palette.

### From source

```sh
git clone https://github.com/a118145/metadoc-reader.git
cd metadoc-reader
npm install
npm run package          # builds dist/ and writes metadoc-reader-<version>.vsix
code --install-extension metadoc-reader-*.vsix
```

For development, open the folder in VS Code, run `npm run watch`, and press F5 (*Run Extension*).
This opens an Extension Development Host on the `examples/` folder.

## Use

1. Open a source file that has a metadoc (try `examples/python/kalman.py` or
   `examples/cpp/lu_solver.cpp`), or open the `.metadoc` file itself.
2. Run **Metadoc: Open in Metadoc Reader** from the command palette, from the editor's context
   menu, from the editor tab's context menu, or by right-clicking the file in the Explorer.
3. The reader opens in its own tab, with the highlighted code on the left and the rendered
   descriptions on the right.

In the reader:

- The toolbar counts sections that are up to date, stale, unverified (no valid hash), placed by
  line hint (symbol not found or no symbol provider), or not placed. Click **stale ↓** to jump to
  the next stale section.
- Stale code is tinted, and the matching description has a warning bar that says why.
- Click a line number or a section's `L12–40` link to open the source at that line. Click ✎ on a
  section to open the metadoc at that section.

Symbol resolution works for every language that has a document symbol provider installed, for
example Pylance/Python for `.py` and clangd or the C/C++ extension for `.cpp`. Without one, the
reader places sections by their line hints. It still finds code that moved by up to 20 lines,
because it searches nearby lines for the hashed span.

Pairing: `foo.metadoc` describes the file named in its header (`source="foo.cpp"`). When
`foo.cpp` and `foo.hpp` both need a metadoc, the second one is named `foo.hpp.metadoc`. See
[the spec](docs/metadoc-spec.md#2-files-and-pairing).

## Write a metadoc

Follow [docs/metadoc-spec.md](docs/metadoc-spec.md). The span hash of lines `start`–`end` is
reproducible with one line of Python:

```sh
python3 -c 'import hashlib,sys;p,s,e=sys.argv[1],int(sys.argv[2]),int(sys.argv[3]);L=open(p,encoding="utf-8-sig",newline="").read().split("\n")[s-1:e];print(hashlib.sha256("".join(l.rstrip(" \t\r")+"\n" for l in L).encode()).hexdigest()[:12])' kalman.py 41 54
```

## Develop

```sh
npm test            # compiles and runs the unit tests headlessly (node:test)
npm run typecheck   # strict TypeScript check of the extension and the webview
npm run build       # bundles dist/extension.js and dist/webview.js with esbuild
npm run package     # produces the .vsix
```

Layout:

| Path | Contents |
|---|---|
| `docs/metadoc-spec.md` | Format specification v0 |
| `src/core/` | VS Code-independent logic: parser, span hash, symbol matching, resolution, row/gap layout, rendering, pairing |
| `src/extension.ts`, `src/panel.ts`, `src/symbolProvider.ts` | Extension host: command, webview panel, refresh, symbol provider access |
| `src/webview/main.ts`, `media/webview.css` | Webview: draws rows, measures them and sets the gaps |
| `examples/` | Python and C++ fixtures with matching metadocs, used by the tests |
| `test/unit/` | Unit tests |

## License

MIT
