import * as assert from 'node:assert/strict';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import { metadocCandidates, pairFromMetadoc, pairFromSource, PairingFs, stemOf } from '../../src/core/pairing';

const dir = path.resolve('/work/project');
const at = (name: string): string => path.join(dir, name);

function fakeFs(files: Record<string, string>): PairingFs {
  return {
    async readText(file) {
      return files[path.basename(file)];
    },
    async listFiles() {
      return Object.keys(files);
    },
  };
}

const header = (source: string): string => `<!-- metadoc:file version="0" source="${source}" -->\n`;

describe('pairing helpers', () => {
  it('derives stems and candidate metadoc names', () => {
    assert.equal(stemOf('solver.test.py'), 'solver.test');
    assert.equal(stemOf('Makefile'), 'Makefile');
    assert.equal(stemOf('.bashrc'), '.bashrc');
    assert.deepEqual(metadocCandidates(at('lu.cpp')), [at('lu.cpp.metadoc'), at('lu.metadoc')]);
  });
});

describe('pairFromMetadoc', () => {
  it('uses the header source, relative to the metadoc folder', async () => {
    const result = await pairFromMetadoc(at('lu.metadoc'), fakeFs({ 'lu.metadoc': header('src/lu.cpp') }));
    assert.deepEqual(result, { kind: 'paired', source: path.join(dir, 'src', 'lu.cpp'), metadoc: at('lu.metadoc') });
  });

  it('falls back to the single file sharing the stem', async () => {
    const result = await pairFromMetadoc(at('lu.metadoc'), fakeFs({ 'lu.metadoc': '# no header', 'lu.cpp': '' }));
    assert.deepEqual(result, { kind: 'paired', source: at('lu.cpp'), metadoc: at('lu.metadoc') });
  });

  it('supports the <name>.<ext>.metadoc form without a header', async () => {
    const files = { 'lu.hpp.metadoc': '', 'lu.hpp': '', 'lu.cpp': '' };
    const result = await pairFromMetadoc(at('lu.hpp.metadoc'), fakeFs(files));
    assert.deepEqual(result, { kind: 'paired', source: at('lu.hpp'), metadoc: at('lu.hpp.metadoc') });
  });

  it('reports ambiguity when several files share the stem and there is no header', async () => {
    const result = await pairFromMetadoc(at('lu.metadoc'), fakeFs({ 'lu.metadoc': '', 'lu.hpp': '', 'lu.cpp': '' }));
    assert.deepEqual(result, { kind: 'ambiguous', metadoc: at('lu.metadoc'), candidates: [at('lu.cpp'), at('lu.hpp')] });
  });
});

describe('pairFromSource', () => {
  it('finds <stem>.metadoc when its header names the source', async () => {
    const files = { 'lu.metadoc': header('lu.cpp'), 'lu.cpp': '', 'lu.hpp': '' };
    assert.deepEqual(await pairFromSource(at('lu.cpp'), fakeFs(files)), {
      kind: 'paired',
      source: at('lu.cpp'),
      metadoc: at('lu.metadoc'),
    });
  });

  it('refuses a <stem>.metadoc that describes a sibling with the same stem', async () => {
    const files = { 'lu.metadoc': header('lu.cpp'), 'lu.cpp': '', 'lu.hpp': '' };
    const result = await pairFromSource(at('lu.hpp'), fakeFs(files));
    assert.equal(result.kind, 'error');
    assert.match(result.kind === 'error' ? result.message : '', /lu\.metadoc describes lu\.cpp/);
  });

  it('prefers <name>.<ext>.metadoc', async () => {
    const files = { 'lu.metadoc': header('lu.cpp'), 'lu.hpp.metadoc': header('lu.hpp') };
    const result = await pairFromSource(at('lu.hpp'), fakeFs(files));
    assert.deepEqual(result, { kind: 'paired', source: at('lu.hpp'), metadoc: at('lu.hpp.metadoc') });
  });

  it('reports a missing metadoc', async () => {
    const result = await pairFromSource(at('main.py'), fakeFs({ 'main.py': '' }));
    assert.equal(result.kind, 'error');
  });
});
