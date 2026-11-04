import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const script = fs.readFileSync(new URL('./runtime/guest_search_diagnostic.js', import.meta.url), 'utf8');
function snapshot(body, { links = 0, title = '', finish = () => false } = {}) {
  const context = { document: { body: { innerText: body }, title, hidden: true,
    readyState: 'complete', scripts: [1, 2, 3], documentElement: { outerHTML: '<html></html>' },
    querySelectorAll: () => Array(links).fill({}) }, TimbreBoxGuestSearchFinish: finish,
    TimbreBoxGuestSearchState: { pages: 0, items: 0 } };
  context.window = context;
  return vm.runInNewContext(script, context);
}

test('short verification shells become a user-action diagnostic, not a network timeout', () => {
  for (const body of ['验证中…', '请完成人机验证', 'Security check', 'Verify you are human']) {
    const result = snapshot(body);
    assert.equal(result.needsAction, true);
    assert.equal(result.challengeShell, true);
  }
});
test('blank/loading shells are not invented verification evidence', () => {
  for (const body of ['', '加载中…', '暂无结果']) {
    assert.equal(snapshot(body).needsAction, false);
  }
});
test('normal result titles mentioning verification or login do not imply a blocking shell', () => {
  assert.equal(snapshot('验证码 登录教程', { links: 12 }).needsAction, false);
  assert.equal(snapshot('验证码'.repeat(100)).needsAction, false);
  assert.equal(snapshot('登录').needsAction, false);
});
test('only explicit login requirements mark a short shell as needing interaction', () => {
  assert.equal(snapshot('请先登录后继续').needsAction, true);
  assert.equal(snapshot('Log in to continue').needsAction, true);
});
test('snapshot can flush fixed validated partial results without exporting page text', () => {
  let flushed = 0;
  const result = snapshot('Synthetic sensitive page body', { finish: () => { flushed++; return true; } });
  assert.equal(result.flushed, true);
  assert.equal(flushed, 1);
  assert.equal(JSON.stringify(result).includes('Synthetic sensitive page body'), false);
  assert.equal(Object.hasOwn(result, 'title'), false);
});
test('sibling host ships the exact reviewed fixed diagnostic script', t => {
  const host = new URL('../../timbrebox/apps/timbrebox_app/assets/plugin_runtime/guest_search_diagnostic.js', import.meta.url);
  if (!fs.existsSync(host)) { t.skip('Sibling host not checked out'); return; }
  assert.equal(fs.readFileSync(host, 'utf8'), script);
});
