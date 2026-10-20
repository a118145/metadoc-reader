# The `.metadoc` format — specification v0

Status: **version 0** (initial). This document is the single source of truth for the format. A
producer (for example an AI agent following the metadoc skill) can write conforming files from this
document alone; a reader (for example the Metadoc Reader VS Code extension in this repository)
implements the reader rules in sections 7–9.

The key words MUST, MUST NOT, SHOULD, SHOULD NOT and MAY are used as in RFC 2119.

## 1. Purpose

A metadoc is a companion file that explains a source file in prose: concise, meaningful
descriptions of its algorithms, classes and functions. A reader shows the source and the metadoc
side by side and aligns each description with the code it describes. To make that alignment
possible, every description is tied to a span of the source by a small machine-readable anchor.

## 2. Files and pairing

- A metadoc is a UTF-8 text file with the extension `.metadoc`.
- It sits **in the same directory** as the source file it describes.
- Default name: `<stem>.metadoc` for the source `<stem>.<ext>`, where the stem is the file name up to
  (not including) its last dot. Example: `kalman.py` → `kalman.metadoc`; `lu_solver.cpp` →
  `lu_solver.metadoc`; `solver.test.py` → `solver.test.metadoc`.
- When several source files share a stem (`lu_solver.cpp`, `lu_solver.hpp`), `<stem>.metadoc`
  describes exactly one of them, namely the one named by its header (section 3). A metadoc for
  another file of the same stem MUST use the long form `<name>.metadoc`, where `<name>` is the full
  source file name: `lu_solver.hpp.metadoc`.
- A reader looking for the metadoc of source `<name>` tries `<name>.metadoc` first, then
  `<stem>.metadoc`, and accepts a candidate only if its header names that source (or the candidate
  has no `source` attribute).

## 3. File header

The first non-blank line of a metadoc MUST be the header comment:

```markdown
<!-- metadoc:file version="0" source="kalman.py" -->
```

| Attribute | Required | Meaning |
|-----------|----------|---------|
| `version` | yes | Format version. This document defines version `"0"`. |
| `source`  | yes | The described source file, as a path relative to the metadoc's directory with `/` separators. Normally just the file name. |

The header disambiguates pairing (section 2) and lets the format evolve (section 10).

## 4. Body

Everything after the header is **Markdown** (CommonMark). It renders normally on GitHub and in any
Markdown viewer; the anchors are HTML comments and therefore invisible there.

The body consists of:

1. An optional **overview**: Markdown between the header and the first section anchor. It describes
   the file as a whole and has no anchor. Readers show it at the top, next to the code that precedes
   the first section.
2. Zero or more **sections**. Each section starts with a section anchor line (section 5) and
   extends to the next section anchor or the end of the file. The anchor line itself is not part of
   the section's text.

Rules for sections:

- Sections MUST appear in **source order**: ascending start line of the span they describe.
- Spans MAY nest (a class section followed by sections for its methods) and MAY leave code
  undescribed. Two sections SHOULD NOT start on the same line.
- Each section SHOULD begin with a Markdown heading naming what it describes (for example
  `## \`KalmanFilter.update\``), so the file reads well without a reader. Use `##` for top-level
  symbols and `###` for members.
- Sections are rendered independently: link reference definitions are not shared between sections.
- Raw HTML in the Markdown, including ordinary HTML comments, is not interpreted by the reference
  reader (it is shown as literal text). Do not use it.
- Lines inside fenced code blocks (```` ``` ```` or `~~~`) are never anchors, so a metadoc can
  show anchor examples in code fences.

## 5. Section anchors

A section anchor is a line that contains only an HTML comment of this form (leading and trailing
whitespace allowed):

```markdown
<!-- metadoc:section symbol="KalmanFilter.update" lines="41-54" hash="a474c953856a" -->
```

Attribute syntax: `name="value"`, separated by whitespace, values in double quotes. Values cannot
contain `"`; there are no escape sequences. Attribute order does not matter.

| Attribute | Required | Meaning |
|-----------|----------|---------|
| `symbol`  | recommended | Dotted qualified name of the described symbol (section 5.1). Omit it for spans that are not a symbol (imports, constants blocks, a `main` guard). |
| `lines`   | yes | Line-range hint of the described span (section 5.2). |
| `hash`    | yes | Span hash of exactly those lines (section 6). |

### 5.1 Symbol names

`symbol` is the symbol's qualified name within the file, with every enclosing scope joined by `.`:

| Language construct | `symbol` |
|---|---|
| Python top-level function `simulate` | `simulate` |
| Python method `update` of class `KalmanFilter` | `KalmanFilter.update` |
| Python nested class `Config` in class `Model` | `Model.Config` |
| C++ method defined out of line, `void LuSolver::solve()` inside `namespace linalg` | `linalg.LuSolver.solve` |
| C++ constructor of `LuSolver` in `namespace linalg` | `linalg.LuSolver.LuSolver` |
| C++ free function `norm` in nested namespaces `a::b` | `a.b.norm` |
| TypeScript method `render` of class `View` | `View.render` |

Rules:

- Use the scope path as written in the source: namespaces, classes/structs, enclosing functions.
  Convert `::` to `.`. Do not include parameter lists, return types, template arguments or generic
  parameters (`Matrix<T>::at` → `Matrix.at`).
- Anonymous scopes (C++ anonymous namespaces, lambdas) cannot be named; anchor such spans with
  `lines` and `hash` only.
- Overloads share a name; the reader disambiguates them with the line hint.
- The value MUST NOT contain whitespace or `"`.

### 5.2 Line-range hint

`lines="<start>-<end>"`: 1-based, inclusive line numbers in the source file at the time the metadoc
is written, with `1 <= start <= end <= number of lines`. A single line MAY be written `lines="<n>"`.

The span of a symbol runs from its **first line** — including decorators, annotations/attributes and
template headers (`@dataclass`, `[[nodiscard]]`, `template <typename T>`), but excluding preceding
comments and blank lines — to its **last line** (closing brace, or last line of the indented body).
A non-symbol span covers exactly the lines described.

Line numbering: lines are separated by LF (`\n`); a CR before the LF is part of the line terminator.
A final line terminator does not start an extra line. A file that uses lone CR line endings is not
supported.

## 6. Span hash

The hash identifies the exact code a section was written against. Compute it over the lines
`start..end` of the `lines` attribute:

1. Read the file as UTF-8 and drop a leading byte-order mark (U+FEFF), if any.
2. Split into lines at LF (`\n`), numbering from 1 (section 5.2).
3. Take lines `start` through `end` inclusive.
4. From each line remove all trailing spaces (U+0020), tabs (U+0009) and carriage returns (U+000D).
   Nothing else is changed: leading indentation, inner whitespace and other characters are kept.
5. Append LF to every line (including the last) and concatenate.
6. Compute SHA-256 over the UTF-8 bytes of the result.
7. The hash is the **first 12 characters of the lowercase hexadecimal digest**.

Readers compare hashes case-insensitively; producers SHOULD write lowercase. Consequences: changing
line endings (CRLF/LF), trailing whitespace, or the file's final newline does not change a hash; any
other edit inside the span, including re-indentation, does.

### 6.1 Reference one-liners

Python 3 (canonical; arguments: file, start, end):

```sh
python3 -c 'import hashlib,sys;p,s,e=sys.argv[1],int(sys.argv[2]),int(sys.argv[3]);L=open(p,encoding="utf-8-sig",newline="").read().split("\n")[s-1:e];print(hashlib.sha256("".join(l.rstrip(" \t\r")+"\n" for l in L).encode()).hexdigest()[:12])' kalman.py 41 54
```

POSIX shell (GNU coreutils; on macOS replace `sha256sum` with `shasum -a 256`):

```sh
LC_ALL=C awk -v s=41 -v e=54 'NR==1{sub(/^\357\273\277/,"")} NR>=s&&NR<=e{sub(/[ \t\r]+$/,"");print}' kalman.py | sha256sum | cut -c1-12
```

Both print `a474c953856a` for `examples/python/kalman.py`, lines 41–54. Test vector: the two-line
span `ab␠␠\r\n` `cd\t\n` hashes to `5141648ccbe9` (the SHA-256 of `ab\ncd\n`).

## 7. Reader: resolving a section

For each section the reader determines a **resolved start** line, then verifies the hash.

**Resolution order:**

1. **Symbol.** If `symbol` is present and the language's document symbol provider reports matching
   symbols, take the one whose start line is closest to the hint's `start`. Matching is by exact
   qualified name (the provider's nested symbol names joined with `.`, with `::` converted to `.`
   and parameter lists/template arguments removed). If there is none, a provider name matches when
   one of the two names ends with `.` followed by the other (one side omits a leading namespace or
   module, e.g. `A.f` and `ns.A.f`), provided the shorter name still contains a `.` and exactly one
   distinct provider name matches this way. A bare anchor such as `update` therefore only matches a
   bare symbol `update`, never a method `KalmanFilter.update`, and `KalmanFilter.update` never
   matches a free function `update`. When no symbol matches, or the match is ambiguous, the section
   is placed by its line hint (step 2) and reported as "symbol not found". The resolved start is
   the matched symbol's first line as reported by the provider.
2. **Line hint.** Otherwise, if `lines` is valid and `start` is within the file, the resolved start
   is `start`.
3. Otherwise the section is **unresolved**.

**Hash verification.** With `L = end − start + 1`, the reader computes the span hash (section 6)
of the `L`-line windows beginning at, in this order: the resolved start, the hint's `start`, then
resolved start −1, +1, −2, +2, … up to ±20 lines (windows that do not fit in the file are skipped).
The first window whose hash equals `hash` is the section's span. This tolerates code that moved
(with or without a symbol provider) and providers whose symbol ranges begin at a different line than
the hint (for example after the decorators).

**Section status:**

| Status | Condition |
|---|---|
| fresh | A window matched. The section is aligned with the matched window's first line. |
| stale | `hash` and `lines` are valid but no window matched: the code changed since the section was written. The section is aligned with the resolved start (if any) and visibly flagged. |
| unverified | `hash` or `lines` is missing or malformed, so freshness cannot be checked. The section is aligned with the resolved start (if any) and flagged. |

A section is **placed** by symbol or by line hint as above, or by the matched window if only that
located it. An unresolved, unmatched section is shown directly after the preceding section, without
alignment, and flagged.

## 8. Reader: alignment and scrolling

The view pairs the code with the descriptions in rows. Each placed section starts a new row at its
start line; a row contains the code from its start line up to the line before the next row's start.
The overview and code before the first section form the first row. Within each row, the side with
less content is padded with a blank gap, so that every section's top edge is level with the first
line of its code span. Both sides scroll together. When sections are out of source order the reader
orders rows by start line; a section that cannot be placed stays with the preceding one.

## 9. Malformed and unknown content

Readers never reject a metadoc; they show what they can and report problems.

- **Missing header:** the reader warns, assumes version `"0"`, and pairs by file name.
- **Header not on the first non-blank line:** treated as missing; the misplaced header is ignored.
- **Unsupported `version`:** the reader warns and renders the file as version 0, best effort.
- **Unknown anchor kinds** (`<!-- metadoc:<other> ... -->` on a line of its own): ignored with a
  warning and not rendered; they neither start nor end a section.
- **Unknown attributes:** ignored silently (forward compatibility).
- **Malformed attribute values** (an invalid `lines` such as `9-2`, a `hash` that is not 12 hex
  characters, a `symbol` containing whitespace), **missing required attributes**, **duplicate
  attributes** (first wins) or **unparsable text** in an anchor: the section still starts at that
  anchor; the invalid attributes are treated as absent and the section is flagged with the problem.
- An anchor must be a line of its own; a `<!-- metadoc:... -->` comment that shares its line with
  other text is ordinary Markdown.

## 10. Versioning

`version` is a single integer string. Version `"0"` is this document. Additive changes (new optional
attributes, new anchor kinds) keep the version, because readers ignore what they do not know. A
change that alters the meaning of existing content (hash definition, resolution, required attributes)
increments the version.

## 11. Complete example

`kalman.metadoc`, describing `kalman.py` (excerpt; the full pair is in `examples/python/`):

```markdown
<!-- metadoc:file version="0" source="kalman.py" -->
# kalman.py

A minimal constant-velocity Kalman filter in one dimension.

<!-- metadoc:section symbol="GaussianState" lines="9-16" hash="80af0221e425" -->
## `GaussianState`

Plain data holder for the Gaussian belief: mean vector and 2×2 covariance.

<!-- metadoc:section symbol="KalmanFilter.update" lines="41-54" hash="a474c953856a" -->
### `update` — measurement update

Fuses one position measurement into the belief ...

<!-- metadoc:section lines="77-79" hash="6b207bf93c99" -->
## Script entry point

When run directly, prints the simulation as three aligned columns.
```

## 12. Producer checklist

1. Name the file `<stem>.metadoc` (or `<name>.metadoc` if the stem is taken) next to the source.
2. Write the header with `version="0"` and `source="<file name>"`.
3. Optionally write an overview.
4. For each described span, in source order: an anchor line with `symbol` (when it is a nameable
   symbol), `lines` (decorators/attributes included, preceding comments excluded) and `hash`
   computed with section 6.1 over exactly those lines; then the Markdown description, starting with a
   heading.
5. After editing the source, recompute `lines` and `hash` of every section whose code changed or
   moved, and update its text.
