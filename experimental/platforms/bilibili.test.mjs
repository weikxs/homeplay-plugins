import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { loadPlugin } from '../../tools/sandbox.mjs';

const source = readFileSync(new URL('./bilibili.js', import.meta.url), 'utf8');
const bvid = 'BV1234567890';
const ref = { videoId: bvid, id: bvid, part: 1 };
const plain = (v) => JSON.parse(JSON.stringify(v));
function view() {
  return {
    bvid, state: 0, title: 'Demo &amp; audio', owner: { name: 'Demo artist' },
    pic: 'https://images.example/cover.jpg',
    rights: { pay: 0, ugc_pay: 0, arc_pay: 0, ugc_pay_preview: 0, no_background: 0 },
    is_chargeable_season: false, is_upower_exclusive: false,
    is_upower_preview: false, is_upower_exclusive_with_qa: false,
    pages: [{ page: 1, cid: 10, duration: 120, part: 'First part' }, { page: 2, cid: 20, duration: 120, part: 'Second part' }],
  };
}
function playback() {
  return { timelength: 120000, dash: { duration: 120, audio: [
    { bandwidth: 64000, mimeType: 'audio/mp4', codecs: 'mp4a.40.5', baseUrl: 'https://audio.bilivideo.com/low.m4s?demo=1' },
    { bandwidth: 128000, mimeType: 'audio/mp4', codecs: 'mp4a.40.2', baseUrl: 'https://audio.bilivideo.com/main.m4s?demo=1' },
    { bandwidth: 256000, mimeType: 'audio/mp4', codecs: 'mp4a.40.2', baseUrl: 'https://audio.bilivideo.com/high.m4s?demo=1' },
  ] } };
}
function setup({ changeView = () => {}, changePlay = () => {}, searchResponse, respond } = {}) {
  return loadPlugin(source, { respond: async (request) => {
    if (respond) {
      const custom = await respond(request);
      if (custom) return custom;
    }
    const path = new URL(request.url).pathname;
    if (path === '/x/frontend/finger/spi') {
      assert.equal(request.headers.Cookie, undefined);
      return { data: { code: 0, data: { b_3: 'demo-anonymous-three', b_4: 'demo-anonymous-four' } } };
    }
    assert.match(request.headers.Cookie, /^buvid3=demo-anonymous-three; buvid4=demo-anonymous-four$/);
    if (path === '/x/web-interface/search/type') return { data: searchResponse || { code: 0, data: {
      page: Number(request.params.page), numPages: 2,
      result: [{ bvid, title: 'Demo <em>song</em> &amp; audio', author: 'Demo', duration: '02:00' }],
    } } };
    if (path === '/x/web-interface/view') {
      const data = view(); changeView(data);
      return { data: { code: 0, data } };
    }
    if (path === '/x/player/playurl') {
      const data = playback(); changePlay(data);
      return { data: { code: 0, data } };
    }
    throw new Error('Unexpected fixture request');
  } });
}

const rejectsCode = (promise, code) => assert.rejects(promise, (error) => error.code === code);

test('load is idle and does not require desktop extraction or user credentials', () => {
  const loaded = loadPlugin(source);
  assert.equal(loaded.plugin.platform, 'Bilibili');
  assert.equal(loaded.plugin.userVariables, undefined);
  assert.equal(loaded.requests.length, 0);
  assert.equal(loaded.mediaRequests.length, 0);
});

test('real request contract: keyword, page, plain metadata, no temporary media in search', async () => {
  const loaded = setup();
  const found = plain(await loaded.plugin.search('demo song', 1, 'music'));
  assert.equal(found.isEnd, false);
  assert.equal(found.data[0].title, 'Demo song & audio');
  assert.equal(found.data[0].duration, 120);
  assert.equal(found.data[0].videoId, bvid);
  assert.equal(found.data[0].contentKind, 'video_audio');
  assert.ok(!JSON.stringify(found).includes('anonymous'));
  assert.ok(!JSON.stringify(found).includes('m4s'));
  assert.equal((await loaded.plugin.search('demo song', 2, 'music')).isEnd, true);
  assert.equal(loaded.requests.filter((r) => r.url.endsWith('/finger/spi')).length, 1);
  assert.equal(loaded.mediaRequests.length, 0);
});

test('concurrent calls share only the anonymous seed request', async () => {
  const loaded = setup();
  await Promise.all([loaded.plugin.search('first', 1, 'music'), loaded.plugin.search('second', 1, 'music')]);
  assert.equal(loaded.requests.filter((r) => r.url.endsWith('/finger/spi')).length, 1);
  assert.equal(loaded.requests.filter((r) => r.url.endsWith('/search/type')).length, 2);
});

test('each fresh runtime establishes its own anonymous session', async () => {
  for (let i = 0; i < 2; i++) {
    const loaded = setup();
    await loaded.plugin.search('demo', 1, 'music');
    assert.equal(loaded.requests[0].url, 'https://api.bilibili.com/x/frontend/finger/spi');
  }
});

test('stable reference is resolved again for each playback and never trusts saved permissions', async () => {
  const loaded = setup();
  const poisoned = { ...ref, cid: 999, is_paid: false, url: 'https://evil.example/audio' };
  for (let i = 0; i < 2; i++) {
    const media = await loaded.plugin.getMediaSource(poisoned, 'standard');
    assert.match(media.url, /\/main\.m4s\?/);
    assert.equal(media.mimeType, 'audio/mp4');
    assert.equal(media.headers.Cookie, undefined);
    assert.equal(media.bitrateKbps, 128);
  }
  assert.equal(loaded.requests.filter((r) => r.url.endsWith('/view')).length, 2);
  assert.equal(loaded.requests.filter((r) => r.url.endsWith('/playurl')).length, 2);
  assert.equal(await loaded.plugin.getMediaSource(ref, 'high'), null);
  assert.equal(loaded.logs.length, 0);
});

for (const key of ['pay', 'ugc_pay', 'arc_pay', 'ugc_pay_preview', 'no_background']) {
  test(`explicit rights deny ${key}`, async () => {
    const loaded = setup({ changeView: (v) => { v.rights[key] = 1; } });
    await rejectsCode(loaded.plugin.getMediaSource(ref), 'content_excluded');
    assert.equal(loaded.requests.some((r) => r.url.endsWith('/playurl')), false);
  });
  test(`missing rights evidence denies ${key}`, async () => {
    const loaded = setup({ changeView: (v) => { delete v.rights[key]; } });
    await rejectsCode(loaded.plugin.getMediaSource(ref), 'content_unverified');
  });
}
for (const key of ['is_chargeable_season', 'is_upower_exclusive', 'is_upower_preview', 'is_upower_exclusive_with_qa']) {
  test(`exclusive/preview flag ${key} is excluded`, async () => {
    const loaded = setup({ changeView: (v) => { v[key] = true; } });
    await rejectsCode(loaded.plugin.getMediaSource(ref), 'content_excluded');
  });
  test(`unknown exclusive/preview flag ${key} is denied`, async () => {
    const loaded = setup({ changeView: (v) => { delete v[key]; } });
    await rejectsCode(loaded.plugin.getMediaSource(ref), 'content_unverified');
  });
}

test('full-length evidence is mandatory even when the upstream omits preview flags', async () => {
  for (const changePlay of [
    (p) => { p.timelength = 30000; },
    (p) => { delete p.timelength; },
    (p) => { p.dash.duration = 30; },
  ]) {
    const loaded = setup({ changePlay });
    await rejectsCode(loaded.plugin.getMediaSource(ref), 'content_unverified');
  }
});

test('explicit preview and DRM responses are not playable', async () => {
  for (const key of ['is_preview', 'is_trial', 'is_drm']) {
    const loaded = setup({ changePlay: (p) => { p[key] = 1; } });
    await rejectsCode(loaded.plugin.getMediaSource(ref), 'content_excluded');
  }
});

test('explicitly unknown preview information cannot become a false flag', async () => {
  const loaded = setup({ changePlay: (p) => { p.is_preview = null; } });
  await rejectsCode(loaded.plugin.getMediaSource(ref), 'content_unverified');
});

test('zero-length and shortened tiny resources cannot pass rounding tolerance', async () => {
  const loaded = setup({
    changeView: (v) => { v.pages[0].duration = 1; },
    changePlay: (p) => { p.timelength = 500; p.dash.duration = 1; },
  });
  await rejectsCode(loaded.plugin.getMediaSource(ref), 'content_unverified');
});

test('official Akamai delivery and valid official backups are supported', async () => {
  for (const change of [
    (f) => { f.baseUrl = 'https://upos-hz-mirrorakam.akamaized.net/demo.m4s'; },
    (f) => { f.baseUrl = 'http://audio.bilivideo.com/unsafe'; f.backupUrl = ['https://audio.bilivideo.com/backup.m4s']; },
  ]) {
    const loaded = setup({ changePlay: (p) => p.dash.audio.forEach(change) });
    const media = await loaded.plugin.getMediaSource(ref);
    assert.match(media.url, /^https:/);
    assert.equal(media.bitrateKbps, 128);
  }
});

test('real empty search and broken pagination are distinct', async () => {
  const empty = setup({ searchResponse: { code: 0, data: { page: 1, numPages: 0, result: [] } } });
  assert.deepEqual(plain(await empty.plugin.search('demo', 1, 'music')), { isEnd: true, data: [] });
  const broken = setup({ searchResponse: { code: 0, data: { page: 2, numPages: 3, result: [] } } });
  await rejectsCode(broken.plugin.search('demo', 1, 'music'), 'invalid_platform_response');
});

test('wrong returned identity never produces playable media', async () => {
  const loaded = setup({ changeView: (v) => { v.bvid = 'BV0987654321'; } });
  await rejectsCode(loaded.plugin.getMediaSource(ref), 'invalid_platform_response');
});

test('multi-part share metadata retains the exact stable video and part', async () => {
  const loaded = setup();
  const result = plain(await loaded.plugin.search('Share https://www.bilibili.com/video/' + bvid + '?p=2 查看', 1, 'music'));
  assert.equal(result.data[0].id, bvid + ':p2');
  assert.equal(result.data[0].part, 2);
  assert.equal(result.data[0].title, 'Second part');
  await loaded.plugin.getMediaSource(result.data[0]);
  const play = loaded.requests.find((r) => r.url.endsWith('/playurl'));
  assert.equal(play.params.cid, '20');
});

test('short links use the final host URL and carry no API session', async () => {
  const loaded = setup({ respond: (r) => {
    if (!r.url.startsWith('https://b23.tv/')) return;
    assert.equal(r.headers.Cookie, undefined);
    return { url: 'https://www.bilibili.com/video/' + bvid, data: '' };
  } });
  const found = await loaded.plugin.search('https://b23.tv/Demo', 1, 'music');
  assert.equal(found.data[0].videoId, bvid);
});

test('short links resolving outside the platform are rejected', async () => {
  const loaded = setup({ respond: (r) => r.url.startsWith('https://b23.tv/') ? { url: 'https://evil.example/video/' + bvid } : undefined });
  await rejectsCode(loaded.plugin.search('https://b23.tv/Demo', 1, 'music'), 'invalid_media_reference');
});

test('foreign links and later import pages do not initiate HTTP', async () => {
  const loaded = setup();
  assert.deepEqual(plain(await loaded.plugin.search('https://youtu.be/abcdefghijk', 1, 'music')), { isEnd: true, data: [] });
  assert.deepEqual(plain(await loaded.plugin.search('https://www.bilibili.com/video/' + bvid, 2, 'music')), { isEnd: true, data: [] });
  assert.equal(loaded.requests.length, 0);
});

test('duplicates, invalid identities and explicitly paid search hits are filtered', async () => {
  const result = { code: 0, data: { page: 1, numPages: 1, result: [
    { bvid, title: 'First' }, { bvid, title: 'Duplicate' },
    { bvid: 'BV0987654321', title: 'Paid', is_pay: 1 }, { bvid: 'invalid', title: 'Bad ID' },
  ] } };
  const loaded = setup({ searchResponse: result });
  const data = (await loaded.plugin.search('demo', 1, 'music')).data;
  assert.equal(data.length, 1);
});

test('risk-control refusal stays an error rather than fake empty success', async () => {
  const loaded = setup({ respond: (r) => r.url.endsWith('/search/type') ? { status: 412 } : undefined });
  await rejectsCode(loaded.plugin.search('demo', 1, 'music'), 'anonymous_access_unavailable');
  assert.equal(loaded.logs.length, 0);
});

test('failed seed can be retried and does not retain a rejected promise', async () => {
  let fail = true;
  const loaded = setup({ respond: (r) => {
    if (r.url.endsWith('/finger/spi') && fail) { fail = false; return { status: 503 }; }
  } });
  await rejectsCode(loaded.plugin.search('demo', 1, 'music'), 'platform_network_error');
  assert.equal((await loaded.plugin.search('demo', 1, 'music')).data.length, 1);
});

test('unsafe anonymous identifiers never become Cookie headers', async () => {
  const loaded = setup({ respond: (r) => r.url.endsWith('/finger/spi') ? { data: { code: 0, data: { b_3: 'demo; stolen=yes', b_4: 'demo' } } } : undefined });
  await rejectsCode(loaded.plugin.search('demo', 1, 'music'), 'invalid_platform_response');
  assert.equal(loaded.requests.length, 1);
});

test('untrusted CDN hosts and encrypted or oversized formats are not selected', async () => {
  for (const change of [
    (f) => { f.baseUrl = 'https://evil.example/audio'; },
    (f) => { f.has_drm = true; },
    (f) => { f.bandwidth = 1000000; },
    (f) => { f.codecs = 'unsupported'; },
  ]) {
    const loaded = setup({ changePlay: (p) => p.dash.audio.forEach(change) });
    await rejectsCode(loaded.plugin.getMediaSource(ref), 'media_unavailable');
  }
});
