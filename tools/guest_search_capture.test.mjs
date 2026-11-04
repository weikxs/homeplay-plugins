import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const parser = fs.readFileSync(new URL('../extractors/guest-search-parser.cjs', import.meta.url), 'utf8');
const capture = fs.readFileSync(new URL('./runtime/guest_search_capture.js', import.meta.url), 'utf8');
function page({ wanted = 10, seenIds = [] } = {}) {
  const messages = [], responses = [];
  class XHR { open() {} send() {} addEventListener() {} }
  const context = {
    URL, TextDecoder, Uint8Array, XMLHttpRequest: XHR,
    location: { href: 'https://www.tiktok.com/search?q=music' },
    setTimeout() { return 1; }, setInterval() { return 1; }, clearInterval() {},
    document: { body: { scrollHeight: 1000 }, querySelectorAll: () => [] },
    scrollTo() {},
    TimbreBoxGuestSearchConfig: { platform: 'tiktok', query: 'music', jobId: 'fixture', wanted, seenIds },
    webkit: { messageHandlers: { timbreboxGuestSearch: { postMessage(v) { messages.push(v); } } } },
    fetch: async () => { const value = responses.shift(); return new Response(value === undefined ? '' : JSON.stringify(value), { status: 200 }); },
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(parser, context);
  vm.runInContext(capture, context);
  return {
    context, messages,
    async answer(payload, cursor = 0, keyword = 'music') {
      responses.push(payload);
      await context.fetch(`https://www.tiktok.com/api/search/general/full/?keyword=${keyword}&cursor=${cursor}`);
      for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve));
    },
  };
}
const item = index => ({ id: String(1000000000000000000n + BigInt(index)), desc: 'Synthetic fixture',
  author: { uniqueId: 'fixture_author', nickname: 'Fixture' }, video: { duration: 12, playAddr: 'https://media.example/not-exported' }, privateItem: false });
const payload = (start, count = 12, cursor = 12, more = 1) => ({ status_code: 0, data: Array.from({ length: count }, (_, i) => ({ item: item(start + i) })), cursor, has_more: more });

test('native capture exports only parsed stable metadata, not full API bodies or stream URLs', async () => {
  const p = page();
  await p.answer(payload(0));
  assert.equal(p.messages.length, 1);
  assert.equal(p.messages[0].data.length, 12);
  assert.equal(p.messages[0].pageCount, 1);
  assert.equal(p.messages[0].data[0].access, 'unverified');
  assert.equal(JSON.stringify(p.messages).includes('playAddr'), false);
  assert.equal(JSON.stringify(p.messages).includes('not-exported'), false);
});

test('known IDs require genuine subsequent official cursors, not repeated first pages', async () => {
  const p = page({ seenIds: Array.from({ length: 12 }, (_, i) => item(i).id), wanted: 8 });
  await p.answer(payload(0));
  assert.equal(p.messages.length, 0);
  await p.answer(payload(0)); // Replayed cursor 0 is ignored.
  assert.equal(p.messages.length, 0);
  await p.answer(payload(12, 12, 24), 12);
  assert.equal(p.messages.length, 1);
  assert.equal(p.messages[0].data.length, 12);
  assert.equal(p.messages[0].pageCount, 2);
});

test('final bounded cache page cannot overflow 50 saved metadata rows', async () => {
  const p = page({ seenIds: Array.from({ length: 48 }, (_, i) => item(i).id), wanted: 2 });
  await p.answer(payload(48));
  assert.equal(p.messages[0].data.length, 2);
});

test('another keyword cannot be used as this search response', async () => {
  const p = page();
  await p.answer(payload(0), 0, 'other');
  assert.equal(p.messages.length, 0);
});

test('refusal is retained without empty success or generated retry requests', async () => {
  const p = page();
  await p.answer({ status_code: 2483, data: [] });
  assert.equal(p.messages.length, 0);
  assert.equal(p.context.TimbreBoxGuestSearchState.lastError, 'search_access_required');
  assert.equal(p.context.TimbreBoxGuestSearchState.sourceStatus, 2483);
});

test('a later request from the official frontend can finish after its own session initialization', async () => {
  const p = page();
  await p.answer({ status_code: 2483, data: [] });
  await p.answer(payload(0));
  assert.equal(p.messages.length, 1);
  assert.equal(p.messages[0].data.length, 12);
  assert.equal(p.context.TimbreBoxGuestSearchState.lastError, null);
});

test('an empty observation is not success and does not interrupt the official frontend recovery', async () => {
  const p = page();
  await p.answer(undefined);
  assert.equal(p.messages.length, 0);
  assert.equal(p.context.TimbreBoxGuestSearchState.lastError, 'invalid_search_response');
  await p.answer(payload(0));
  assert.equal(p.messages[0].data.length, 12);
});

test('deadline preserves verified partial official pages without inventing an end', async () => {
  const p = page({ wanted: 50 });
  await p.answer(payload(0));
  await p.answer(payload(12, 12, 24), 12);
  assert.equal(p.messages.length, 0);
  assert.equal(p.context.TimbreBoxGuestSearchFinish(), true);
  assert.equal(p.messages[0].data.length, 24);
  assert.equal(p.messages[0].pageCount, 2);
  assert.equal(p.messages[0].isEnd, false);
  assert.equal(p.context.TimbreBoxGuestSearchFinish(), false);
  await p.answer(payload(24, 12, 36), 24);
  assert.equal(p.messages.length, 1);
});

test('deadline does not turn no response, malformed response or refusal into empty success', async () => {
  for (const response of [undefined, { status_code: 2483, data: [] }]) {
    const p = page({ wanted: 50 });
    assert.equal(p.context.TimbreBoxGuestSearchFinish(), false);
    await p.answer(response);
    assert.equal(p.context.TimbreBoxGuestSearchFinish(), false);
    assert.equal(p.messages.length, 0);
  }
});

test('deadline cannot conceal a refusal after earlier valid pages', async () => {
  const p = page({ wanted: 50 });
  await p.answer(payload(0));
  await p.answer({ status_code: 2483, data: [] }, 12);
  assert.equal(p.context.TimbreBoxGuestSearchFinish(), false);
  assert.equal(p.messages.length, 0);
});

test('deadline does not return replayed IDs as fresh partial results', async () => {
  const p = page({ wanted: 50, seenIds: Array.from({ length: 12 }, (_, i) => item(i).id) });
  await p.answer(payload(0));
  assert.equal(p.context.TimbreBoxGuestSearchFinish(), false);
  assert.equal(p.messages.length, 0);
});

test('optional sibling host uses the identical reviewed parser and capture bytes', t => {
  const root = new URL('../../timbrebox/apps/timbrebox_app/assets/plugin_runtime/', import.meta.url);
  if (!fs.existsSync(root)) { t.skip('Sibling host not checked out'); return; }
  assert.equal(fs.readFileSync(new URL('guest_search_parser.js', root), 'utf8'), parser);
  assert.equal(fs.readFileSync(new URL('guest_search_capture.js', root), 'utf8'), capture);
});
