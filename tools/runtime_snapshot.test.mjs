import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkRuntimeSnapshot } from './runtime_snapshot.mjs';

const names = ['prelude.js', 'url.js', 'axios.js', 'guest_search_parser.js',
  'guest_search_capture.js', 'guest_search_diagnostic.js'];
const commit = 'a'.repeat(40);

function repository(t) {
  const root = mkdtempSync(join(tmpdir(), 'plugin-snapshot-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'tools/runtime'), { recursive: true });
  const assets = names.map((name, index) => {
    const localFile = `tools/runtime/${name.replace('guest_search_parser', 'parser')}`;
    writeFileSync(join(root, localFile), `fixture ${index}\n`);
    return { hostAsset: name, localFile, sha256: '0'.repeat(64) };
  });
  writeFileSync(join(root, 'tools/runtime/host-snapshot.json'),
    JSON.stringify({ repository: 'https://github.com/weikxs/timbrebox', commit, assets }));
  return root;
}

// Recompute real digests with shasum so fixtures are not hardcoded copies.
function reseal(root) {
  const file = join(root, 'tools/runtime/host-snapshot.json');
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  for (const asset of manifest.assets) {
    asset.sha256 = execFileSync('shasum', ['-a', '256', join(root, asset.localFile)], { encoding: 'utf8' }).slice(0, 64);
  }
  writeFileSync(file, JSON.stringify(manifest));
}
const snapshot = root => JSON.parse(readFileSync(join(root, 'tools/runtime/host-snapshot.json'), 'utf8'));

test('a matching sealed snapshot passes', t => {
  const root = repository(t);
  reseal(root);
  assert.deepEqual(checkRuntimeSnapshot(root), []);
});

test('changed, missing and symlinked assets are reported', t => {
  const root = repository(t);
  reseal(root);
  writeFileSync(join(root, 'tools/runtime/prelude.js'), 'edited\n');
  assert.ok(checkRuntimeSnapshot(root).some(p => p.includes('prelude.js')));

  const manifest = snapshot(root);
  manifest.assets[0].localFile = 'tools/runtime/missing.js';
  writeFileSync(join(root, 'tools/runtime/host-snapshot.json'), JSON.stringify(manifest));
  assert.ok(checkRuntimeSnapshot(root).some(p => /missing|unsafe/.test(p)));
});

test('unsafe paths, malformed hashes and missing required assets are rejected', { skip: process.platform === 'win32' }, t => {
  const root = repository(t);
  reseal(root);
  const manifest = snapshot(root);
  manifest.assets[0].localFile = '../outside.js';
  writeFileSync(join(root, 'tools/runtime/host-snapshot.json'), JSON.stringify(manifest));
  assert.ok(checkRuntimeSnapshot(root).some(p => /unsafe/.test(p)));

  manifest.assets[0].localFile = 'tools/runtime/prelude.js';
  manifest.assets[0].sha256 = 'not-a-hash';
  writeFileSync(join(root, 'tools/runtime/host-snapshot.json'), JSON.stringify(manifest));
  assert.ok(checkRuntimeSnapshot(root).some(p => /malformed/.test(p)));

  writeFileSync(join(root, 'tools/runtime/host-snapshot.json'), JSON.stringify({ ...manifest,
    assets: manifest.assets.slice(1), commit: 'bad' }));
  const problems = checkRuntimeSnapshot(root);
  assert.ok(problems.some(p => /invalid manifest|required assets/.test(p)));

  manifest.commit = commit;
  manifest.assets = manifest.assets.map(asset => ({ ...asset, sha256: '0'.repeat(64) }));
  writeFileSync(join(root, 'tools/runtime/host-snapshot.json'), JSON.stringify(manifest));
  rmSync(join(root, 'tools/runtime/prelude.js'));
  symlinkSync(join(root, 'tools/runtime/url.js'), join(root, 'tools/runtime/prelude.js'));
  assert.ok(checkRuntimeSnapshot(root).some(p => /unsafe|differs/.test(p)));
});

test('every required host asset has to appear, and duplicates must not substitute', t => {
  const root = repository(t);
  reseal(root);
  const manifest = snapshot(root);
  manifest.assets[5] = { ...manifest.assets[0] };
  writeFileSync(join(root, 'tools/runtime/host-snapshot.json'), JSON.stringify(manifest));
  assert.ok(checkRuntimeSnapshot(root).some(p => /malformed or repeated|missing/.test(p)));
});
