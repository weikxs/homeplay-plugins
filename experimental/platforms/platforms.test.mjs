import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { loadPlugin } from '../../tools/sandbox.mjs';

const links = {
  youtube: 'https://youtu.be/abcdefghijk',
  bilibili: 'https://www.bilibili.com/video/BV1234567890',
  douyin: 'https://v.douyin.com/Demo/',
  tiktok: 'https://vm.tiktok.com/Demo/',
};
const data = { id: 'demo-id', title: 'Demo performance', handle: 'demo' };
const plain = (value) => JSON.parse(JSON.stringify(value));

// Bilibili has its own direct-HTTP contract and dedicated tests.
for (const platform of ['youtube', 'douyin', 'tiktok']) {
  const source = readFileSync(new URL(`./${platform}.js`, import.meta.url), 'utf8');
  test(`${platform}: loads without process, network or credentials`, () => {
    const loaded = loadPlugin(source);
    assert.equal(loaded.requests.length, 0);
    assert.equal(loaded.mediaRequests.length, 0);
    assert.equal(loaded.plugin.version, '0.1.1-dev');
    assert.equal(loaded.plugin.experimental, true);
    assert.deepEqual(plain(loaded.plugin.requiredCapabilities), ['media.source']);
    assert.equal(loaded.plugin.userVariables, undefined);
  });
  test(`${platform}: a host without the media bridge fails clearly without fake empty success`, async () => {
    for (const environment of [undefined, null, {}, { media: {} }, { media: { source: false } }]) {
      const context = { module: { exports: {} } };
      if (environment !== undefined) context.env = environment;
      vm.runInNewContext(source, context);
      for (const method of ['search', 'getMediaSource', 'importMusicItem']) {
        await assert.rejects(context.module.exports[method]('fixture', 1, 'music'),
          error => error.code === 'extractor_unavailable' && /compatible/.test(error.message));
      }
    }
  });
  test(`${platform}: keyword searches use the bounded host API`, async () => {
    const loaded = loadPlugin(source, { mediaRespond: (request) => {
      assert.equal(request.operation, 'search');
      assert.equal(request.platform, platform);
      assert.equal(request.query, 'demo song');
      assert.equal(request.page, 2);
      return { isEnd: true, data: [data] };
    } });
    assert.deepEqual(plain(await loaded.plugin.search('demo song', 2, 'music')), { isEnd: true, data: [data] });
    assert.equal(loaded.requests.length, 0);
  });
  test(`${platform}: link search imports metadata, not the temporary media URL`, async () => {
    const loaded = loadPlugin(source, { mediaRespond: (request) => {
      assert.equal(request.operation, 'resolve');
      assert.equal(request.url, `Demo share ${links[platform]} 查看`);
      return { item: data, media: { url: 'https://media.example/audio?token=demo' } };
    } });
    const result = await loaded.plugin.search(`Demo share ${links[platform]} 查看`, 1, 'music');
    assert.deepEqual(plain(result), { isEnd: true, data: [data] });
    assert.ok(!JSON.stringify(result).includes('token'));
    assert.deepEqual(plain(await loaded.plugin.search(links[platform], 2, 'music')), { isEnd: true, data: [] });
    assert.equal(loaded.mediaRequests.length, 1);
  });
  test(`${platform}: another platform link does not start extraction`, async () => {
    const other = platform === 'youtube' ? links.tiktok : links.youtube;
    const loaded = loadPlugin(source);
    assert.deepEqual(plain(await loaded.plugin.search(other, 1, 'music')), { isEnd: true, data: [] });
    assert.equal(loaded.mediaRequests.length, 0);
  });
  test(`${platform}: playback always re-resolves the stable item`, async () => {
    const loaded = loadPlugin(source, { mediaRespond: (request) => {
      assert.equal(request.operation, 'resolve');
      assert.deepEqual(request.item, data);
      assert.equal(request.platform, platform);
      return { item: data, media: { url: 'https://media.example/audio.m4a', mimeType: 'audio/mp4' } };
    } });
    assert.equal((await loaded.plugin.getMediaSource(data, 'standard')).mimeType, 'audio/mp4');
    await loaded.plugin.getMediaSource(data, 'standard');
    assert.equal(loaded.mediaRequests.length, 2);
    assert.equal(await loaded.plugin.getMediaSource(data, 'high'), null);
    assert.equal(loaded.mediaRequests.length, 2);
  });
  test(`${platform}: backend failures preserve codes instead of returning fake empty success`, async () => {
    const loaded = loadPlugin(source, { mediaRespond: () => {
      const error = new Error('Paid content excluded');
      error.code = 'content_excluded';
      throw error;
    } });
    await assert.rejects(loaded.plugin.search('demo', 1, 'music'), (error) => error.code === 'content_excluded');
    await assert.rejects(loaded.plugin.getMediaSource(data, 'standard'), (error) => error.code === 'content_excluded');
    assert.equal(loaded.logs.length, 0);
  });
}

test('shared adapter rejects inherited object-property platform names', () => {
  const loaded = loadPlugin('module.exports = {make: env.media.source};');
  for (const platform of ['__proto__', 'constructor', 'toString']) {
    assert.throws(() => loaded.plugin.make(platform), /Unsupported media platform/);
  }
});

test('shared link routing accepts case-insensitive platform hosts', async () => {
  const source = readFileSync(new URL('./youtube.js', import.meta.url), 'utf8');
  const loaded = loadPlugin(source, { mediaRespond: () => ({ item: data, media: {} }) });
  const result = await loaded.plugin.search('https://YOUTU.BE/abcdefghijk', 1, 'music');
  assert.deepEqual(plain(result.data), [data]);
  assert.equal(loaded.mediaRequests.length, 1);
});

test('unsupported short-video search remains explicitly unavailable', async () => {
  for (const platform of ['douyin', 'tiktok']) {
    const source = readFileSync(new URL(`./${platform}.js`, import.meta.url), 'utf8');
    const loaded = loadPlugin(source, { mediaRespond: () => {
      const error = new Error('Keyword search is not implemented');
      error.code = 'platform_search_unavailable';
      throw error;
    } });
    await assert.rejects(loaded.plugin.search('demo', 1, 'music'), (error) => error.code === 'platform_search_unavailable');
  }
});
