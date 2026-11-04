import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, unlinkSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkPrivacy } from './privacy.mjs';

function repository(t) {
  const root = mkdtempSync(join(tmpdir(), 'plugin-privacy-'));
  execFileSync('git', ['init', '--quiet', root]);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
const email = ['person', 'private.invalid'].join('@');
const token = 'ghp_' + 'x'.repeat(36);

test('new untracked files are inspected without echoing their private text', t => {
  const root = repository(t);
  writeFileSync(join(root, 'new.js'), email + '\n' + token);
  const findings = checkPrivacy(root);
  assert.ok(findings.some(line => line.startsWith('new.js:1:')));
  assert.ok(findings.some(line => line.startsWith('new.js:2:')));
  assert.equal(findings.join('\n').includes(email), false);
  assert.equal(findings.join('\n').includes(token), false);
});
test('a clean worktree cannot hide private text already staged in the index', t => {
  const root = repository(t);
  writeFileSync(join(root, 'staged.js'), token);
  execFileSync('git', ['add', 'staged.js'], { cwd: root });
  writeFileSync(join(root, 'staged.js'), 'Clean demo fixture');
  assert.ok(checkPrivacy(root).some(line => line.includes('staged.js (index):1:')));
});
test('ignored private files are not opened and clean demo addresses pass', t => {
  const root = repository(t);
  writeFileSync(join(root, '.gitignore'), 'private.txt\n.privacy-denylist\n');
  writeFileSync(join(root, 'private.txt'), token);
  writeFileSync(join(root, '.privacy-denylist'), 'never-publish-this-fixture');
  writeFileSync(join(root, 'clean.js'), 'demo@example.com /Users/me/music /home/me/music');
  assert.deepEqual(checkPrivacy(root), []);
});
test('deleted working files remain checked through their staged contents', t => {
  const root = repository(t);
  writeFileSync(join(root, 'gone.txt'), token);
  execFileSync('git', ['add', 'gone.txt'], { cwd: root });
  unlinkSync(join(root, 'gone.txt'));
  assert.ok(checkPrivacy(root).some(line => line.includes('gone.txt (index)')));
});
test('symbolic links are rejected without following external data', { skip: process.platform === 'win32' }, t => {
  const root = repository(t);
  const outside = mkdtempSync(join(tmpdir(), 'plugin-outside-'));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  writeFileSync(join(outside, 'data'), token);
  symlinkSync(join(outside, 'data'), join(root, 'linked'));
  const findings = checkPrivacy(root);
  assert.ok(findings.some(line => line.includes('non-regular or external')));
  assert.equal(findings.join('\n').includes(token), false);
});
test('URL userinfo is not mistaken for an e-mail address', t => {
  const root = repository(t);
  writeFileSync(join(root, 'url.js'), "'https://demo:secret@www.example.org/video/1'");
  assert.deepEqual(checkPrivacy(root), []);
  writeFileSync(join(root, 'real.js'), 'https://other:secret@www.example.org/?u=' + 'name' + '@' + 'mail.invalid');
  assert.ok(checkPrivacy(root).some(line => line.startsWith('real.js:1:')));
});
test('bare user:password@host userinfo is not an e-mail address either', t => {
  const root = repository(t);
  writeFileSync(join(root, 'bare.js'), "open('user:pass@www.example.org')");
  assert.deepEqual(checkPrivacy(root), []);
});
test('local denylist findings expose only file locations', t => {
  const root = repository(t);
  writeFileSync(join(root, '.gitignore'), '.privacy-denylist\n');
  writeFileSync(join(root, '.privacy-denylist'), 'fixture-sensitive-value');
  writeFileSync(join(root, 'file.js'), 'fixture-sensitive-value');
  const findings = checkPrivacy(root);
  assert.ok(findings.some(line => line.startsWith('file.js:1:')));
  assert.equal(findings.join('\n').includes('fixture-sensitive-value'), false);
});
