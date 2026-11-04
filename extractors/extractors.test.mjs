import assert from 'node:assert/strict';
import { test } from 'node:test';

import { requireFreeFullContent } from './access-policy.mjs';
import { parseDouyinPage, createDouyinExtractor } from './douyin.mjs';
import { parseTikTokPage, createTikTokExtractor } from './tiktok.mjs';
import { checkedMediaUrl } from './media.mjs';
import { loadPage, shareUrl } from './page-client.mjs';

const id = '1234567890';
const refs = {
  douyin: { id, url: `https://www.douyin.com/video/${id}` },
  tiktok: { id, url: `https://www.tiktok.com/@demo/video/${id}` },
};
const free = { is_paid: false, is_preview: false, is_private: false };
const allowed = (extra = {}) => ({ ...free, ...extra });
const code = (expected) => (error) => error.code === expected;
const script = (name, data) => `<html><script type="application/json" id="${name}">${data}</script></html>`;

function item(platform, extra = {}) {
  return platform === 'douyin' ? {
    ...free, aweme_id: id, desc: 'Demo public-domain performance', author: { nickname: 'Demo Artist' },
    video: { duration: 120000, play_addr: { url_list: ['https://media.douyinvod.com/demo.mp4'] } },
    music: { play_url: { url_list: ['https://media.douyinvod.com/music-excerpt.mp3'] } },
    ...extra,
  } : {
    ...free, id, desc: 'Demo public-domain performance', author: { nickname: 'Demo Artist' },
    video: { duration: 120, playAddr: 'https://media.tiktokcdn.com/demo.mp4' },
    music: { playUrl: 'https://media.tiktokcdn.com/music-excerpt.mp3' },
    ...extra,
  };
}

function page(platform, record = item(platform)) {
  if (platform === 'douyin') {
    return script('RENDER_DATA', encodeURIComponent(JSON.stringify({ route: { aweme: { detail: record } } })));
  }
  return script('__UNIVERSAL_DATA_FOR_REHYDRATION__', JSON.stringify({
    __DEFAULT_SCOPE__: { 'webapp.video-detail': { statusCode: 0, itemInfo: { itemStruct: record } } },
  }));
}

const parse = { douyin: parseDouyinPage, tiktok: parseTikTokPage };
const create = { douyin: createDouyinExtractor, tiktok: createTikTokExtractor };

for (const platform of ['douyin', 'tiktok']) {
  test(`${platform}: extracts a video stream with explicit free/full evidence`, () => {
    const result = parse[platform](page(platform), refs[platform]);
    assert.equal(result.id, id);
    assert.equal(result.sourceId, platform);
    assert.equal(result.title, 'Demo public-domain performance');
    assert.equal(result.artist, 'Demo Artist');
    assert.equal(result.duration, 120);
    assert.equal(result.contentKind, 'video_audio');
    assert.equal(result.fullSong, false);
    assert.equal(result.streams.length, 1);
    assert.ok(result.streams[0].url.endsWith('/demo.mp4'));
    assert.equal(result.streams[0].containsVideo, true);
    assert.equal(result.streams[0].headers.Referer, `https://www.${platform}.com/`);
    assert.ok(!JSON.stringify(result).includes('music-excerpt'));
  });

  test(`${platform}: refuses music excerpts when no video address exists`, () => {
    const record = item(platform);
    record.video = { duration: record.video.duration };
    assert.throws(() => parse[platform](page(platform, record), refs[platform]), code('media_unavailable'));
  });

  test(`${platform}: paid content is excluded before media selection`, () => {
    assert.throws(() => parse[platform](page(platform, item(platform, { is_paid: true, video: null })), refs[platform]), code('paid_content'));
  });

  test(`${platform}: preview content is excluded`, () => {
    assert.throws(() => parse[platform](page(platform, item(platform, { is_preview: true })), refs[platform]), code('preview_content'));
  });

  test(`${platform}: missing eligibility labels fails closed`, () => {
    const record = item(platform);
    delete record.is_paid;
    delete record.is_preview;
    assert.throws(() => parse[platform](page(platform, record), refs[platform]), code('access_unverified'));
  });

  test(`${platform}: input ID must match response ID`, () => {
    assert.throws(() => parse[platform](page(platform), { ...refs[platform], id: '999' }), (error) =>
      ['content_unavailable', 'content_mismatch'].includes(error.code));
  });

  test(`${platform}: extracts links from share text and drops tracking`, async () => {
    const requests = [];
    const extractor = create[platform]({ request: async (url, options) => {
      requests.push({ url, options });
      return { status: 200, data: page(platform) };
    } });
    const result = await extractor.extract(`Demo share ${refs[platform].url}?tracking=demo 查看`);
    assert.equal(result.id, id);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, refs[platform].url);
    assert.equal(requests[0].options.redirect, 'manual');
    assert.equal(requests[0].options.maxBytes, 2 * 1024 * 1024);
    assert.equal(requests[0].options.timeoutMs, 15000);
    assert.ok(!('Cookie' in requests[0].options.headers));
  });

  test(`${platform}: missing/challenge data is not a successful extraction`, () => {
    assert.throws(() => parse[platform]('<html><script>window.challenge = true;</script></html>', refs[platform]), code('page_unavailable'));
  });

  test(`${platform}: no fabricated search capability is exported`, () => {
    assert.equal(create[platform]().search, undefined);
  });
}

test('TikTok: supports a bounded legacy JSON state', () => {
  const html = script('SIGI_STATE', JSON.stringify({ ItemModule: { [id]: item('tiktok') } }));
  assert.equal(parseTikTokPage(html, refs.tiktok).id, id);
});

test('TikTok: unsuccessful detail status is not ignored', () => {
  const html = script('__UNIVERSAL_DATA_FOR_REHYDRATION__', JSON.stringify({
    __DEFAULT_SCOPE__: { 'webapp.video-detail': { statusCode: 10204, itemInfo: { itemStruct: item('tiktok') } } },
  }));
  assert.throws(() => parseTikTokPage(html, refs.tiktok), code('content_unavailable'));
});

test('JSON data is parsed, never executed', () => {
  globalThis.__extractorExecuted = false;
  const html = script('SIGI_STATE', '(globalThis.__extractorExecuted = true, {})');
  assert.throws(() => parseTikTokPage(html, refs.tiktok), code('invalid_response'));
  assert.equal(globalThis.__extractorExecuted, false);
  delete globalThis.__extractorExecuted;
});

test('script data-id does not masquerade as id', () => {
  const html = page('tiktok').replace(' id=', ' data-id=');
  assert.throws(() => parseTikTokPage(html, refs.tiktok), code('page_unavailable'));
});

test('malformed percent-encoded state is rejected', () => {
  assert.throws(() => parseDouyinPage(script('RENDER_DATA', '%ZZ'), refs.douyin), code('invalid_response'));
});

test('oversized documents are rejected', () => {
  assert.throws(() => parseTikTokPage('x'.repeat(2 * 1024 * 1024 + 1), refs.tiktok), code('invalid_response'));
});

for (const [label, extra, expected] of [
  ['VIP', { isVip: 1 }, 'paid_content'],
  ['subscription', { subscriber_only: '1' }, 'paid_content'],
  ['nested paid', { video: { isPaid: true } }, 'paid_content'],
  ['nested trial', { status: { is_trial: true } }, 'preview_content'],
  ['private', { privateItem: true }, 'content_restricted'],
  ['friends only', { forFriend: true }, 'content_restricted'],
  ['premium availability', { availability: 'premium_only' }, 'content_restricted'],
  ['login required', { availability: 'needs_auth' }, 'content_restricted'],
  ['unknown availability', { availability: 'new-provider-state' }, 'access_unverified'],
  ['unknown paid flag', { isPaid: 'unknown' }, 'access_unverified'],
  ['unknown private flag', { privateItem: null }, 'access_unverified'],
  ['unknown entitlement object', { pay_info: {} }, 'access_unverified'],
  ['paid series', { series: { id: 'demo' } }, 'access_unverified'],
]) {
  test(`policy: blocks ${label}`, () => {
    assert.throws(() => requireFreeFullContent(allowed(extra)), code(expected));
  });
}

test('policy: absent public status is not assumed public', () => {
  assert.throws(() => requireFreeFullContent({ is_paid: false, is_preview: false }), code('access_unverified'));
});

test('policy: duration alone is not proof of free/full access', () => {
  assert.throws(() => requireFreeFullContent({ video: { duration: 240 } }), code('access_unverified'));
});

for (const address of [
  'http://media.tiktokcdn.com/demo.mp4', 'https://127.0.0.1/demo.mp4', 'file:///demo.mp4',
  'https://media.tiktokcdn.com.evil.example/demo.mp4', 'https://media.tiktokcdn.com:8443/demo.mp4',
  'https://demo:secret@media.tiktokcdn.com/demo.mp4', 'https://music.example/demo.mp4',
]) {
  test(`media: rejects disallowed address ${address.split('/')[0]}`, () => {
    assert.equal(checkedMediaUrl('tiktok', address), null);
  });
}

test('media: does not rewrite a watermark or change media endpoints', () => {
  const record = item('douyin');
  record.video.play_addr.url_list = ['https://media.douyinvod.com/playwm/demo.mp4?token=demo'];
  const result = parseDouyinPage(page('douyin', record), refs.douyin);
  assert.equal(result.streams[0].url, record.video.play_addr.url_list[0]);
});

test('media: drops duplicate and untrusted alternatives', () => {
  const record = item('douyin');
  record.video.play_addr.url_list.push('https://127.0.0.1/private', record.video.play_addr.url_list[0]);
  assert.equal(parseDouyinPage(page('douyin', record), refs.douyin).streams.length, 1);
});

for (const input of [
  'https://www.tiktok.com.evil.example/@demo/video/123', 'http://www.tiktok.com/@demo/video/123',
  'https://demo:secret@www.tiktok.com/@demo/video/123', 'https://www.tiktok.com:8443/@demo/video/123',
  'https://127.0.0.1/video/123', 'file:///video/123', 'https://www.tiktok.com/search?q=demo',
]) {
  test('links: refuses unsafe or non-video input', () => {
    assert.throws(() => shareUrl('tiktok', input), code('invalid_url'));
  });
}

test('links: short-link redirect stays within the same platform', async () => {
  const requests = [];
  const extractor = createTikTokExtractor({ request: async (url) => {
    requests.push(url);
    return requests.length === 1 ? { status: 302, headers: { Location: refs.tiktok.url + '?tracking=demo' } }
      : { status: 200, data: page('tiktok') };
  } });
  assert.equal((await extractor.extract('https://vm.tiktok.com/DemoCode/')).id, id);
  assert.deepEqual(requests, ['https://vm.tiktok.com/DemoCode/', refs.tiktok.url]);
});

for (const target of ['https://127.0.0.1/', 'https://www.douyin.com/video/123', 'http://www.tiktok.com/@demo/video/123']) {
  test('redirects: blocks cross-platform, private and downgraded destinations before request', async () => {
    let requests = 0;
    const extractor = createTikTokExtractor({ request: async () => {
      requests++;
      return { status: 302, headers: { location: target } };
    } });
    await assert.rejects(extractor.extract('https://vm.tiktok.com/Demo/'), code('redirect_error'));
    assert.equal(requests, 1);
  });
}

test('redirects: rejects transports that automatically follow redirects', async () => {
  await assert.rejects(loadPage('tiktok', refs.tiktok.url, async () => ({
    status: 200, url: 'https://music.example/', data: page('tiktok'),
  })), code('transport_error'));
});

test('redirects: rejects loops and excessive chains', async () => {
  await assert.rejects(loadPage('tiktok', refs.tiktok.url, async () => ({
    status: 302, headers: { location: refs.tiktok.url },
  })), code('redirect_error'));
  let requests = 0;
  await assert.rejects(loadPage('tiktok', 'https://vm.tiktok.com/Demo/', async () => ({
    status: 302, headers: { location: `https://vm.tiktok.com/Demo${++requests}/` },
  })), code('redirect_error'));
  assert.equal(requests, 5);
});

for (const [status, expected] of [[401, 'content_restricted'], [403, 'content_restricted'], [404, 'content_unavailable'], [410, 'content_unavailable'], [429, 'rate_limited'], [500, 'network_error']]) {
  test(`HTTP: maps status ${status}`, async () => {
    await assert.rejects(loadPage('tiktok', refs.tiktok.url, async () => ({ status })), code(expected));
  });
}

test('HTTP: network failures do not leak signed URLs or cookies', async () => {
  await assert.rejects(loadPage('tiktok', refs.tiktok.url, async () => {
    throw new Error('https://music.example/?token=demo Cookie=secret');
  }), (error) => error.code === 'network_error' && !/token|Cookie|secret/.test(error.message));
});

test('HTTP: missing transport cannot perform hidden network requests', async () => {
  await assert.rejects(createTikTokExtractor().extract(refs.tiktok.url), code('transport_required'));
});

test('HTTP: cancellation before the request avoids network activity', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(loadPage('tiktok', refs.tiktok.url, () => assert.fail('must not request'), controller.signal), code('cancelled'));
});

test('HTTP: multibyte responses are limited by bytes, not characters', async () => {
  await assert.rejects(loadPage('tiktok', refs.tiktok.url, async () => ({
    status: 200, data: '歌'.repeat(800000),
  })), code('invalid_response'));
});

test('HTTP: deadline aborts the transport without waiting in real time', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let transportSignal;
  const task = loadPage('tiktok', refs.tiktok.url, async (_, options) => {
    transportSignal = options.signal;
    return new Promise(() => {});
  });
  const rejected = assert.rejects(task, code('timeout'));
  await Promise.resolve();
  t.mock.timers.tick(15000);
  await rejected;
  assert.equal(transportSignal.aborted, true);
});

test('HTTP: immediate cancellation does not start a queued request', async () => {
  const controller = new AbortController();
  let requests = 0;
  const task = loadPage('tiktok', refs.tiktok.url, async () => {
    requests++;
    return { status: 200, data: page('tiktok') };
  }, controller.signal);
  controller.abort();
  await assert.rejects(task, code('cancelled'));
  assert.equal(requests, 0);
});

test('HTTP: cancellation during a request aborts the transport', async () => {
  const controller = new AbortController();
  let transportSignal;
  const task = loadPage('tiktok', refs.tiktok.url, async (_, options) => {
    transportSignal = options.signal;
    controller.abort();
    return new Promise(() => {});
  }, controller.signal);
  await assert.rejects(task, code('cancelled'));
  assert.equal(transportSignal.aborted, true);
});
