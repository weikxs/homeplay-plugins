import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { loadPlugin } from '../../tools/sandbox.mjs';

const source = readFileSync(new URL('./subsonic.js', import.meta.url), 'utf8');
const password = randomBytes(8).toString('hex');
const settings = { server: 'http://192.168.0.10:4533', username: 'demo', password };

const ok = (body) => ({ data: { 'subsonic-response': { status: 'ok', version: '1.16.1', ...body } } });
const failed = (code, message) => ({
  data: { 'subsonic-response': { status: 'failed', version: '1.16.1', error: { code, message } } },
});
const song = (id, title, extra = {}) => ({ id, title, artist: 'Demo Artist', album: 'Demo Album', duration: 8, ...extra });

function plugin(respond, variables = settings) {
  return loadPlugin(source, { variables, respond });
}

const md5 = (text) => createHash('md5').update(text).digest('hex');

test('searches songs on the server the user entered', async () => {
  const { plugin: subsonic, requests } = plugin(() =>
    ok({ searchResult3: { song: [song('s1', 'Ode to Joy'), song('s2', 'Twinkle Twinkle Little Star')] } }),
  );

  const result = await subsonic.search('ode', 1, 'music');

  assert.deepEqual(
    Array.from(result.data, (item) => [item.id, item.title, item.artist, item.album, item.duration]),
    [
      ['s1', 'Ode to Joy', 'Demo Artist', 'Demo Album', 8],
      ['s2', 'Twinkle Twinkle Little Star', 'Demo Artist', 'Demo Album', 8],
    ],
  );
  assert.equal(result.isEnd, true);
  const url = new URL(requests[0].fullUrl);
  assert.equal(url.origin, 'http://192.168.0.10:4533');
  assert.equal(url.pathname, '/rest/search3');
  assert.equal(url.searchParams.get('query'), 'ode');
  assert.equal(url.searchParams.get('songCount'), '30');
  assert.equal(url.searchParams.get('songOffset'), '0');
});

test('signs every request with a fresh salted token, never the password', async () => {
  const { plugin: subsonic, requests } = plugin(() => ok({ searchResult3: {} }));

  await subsonic.search('ode', 1, 'music');
  await subsonic.search('ode', 1, 'music');

  const [first, second] = requests.map((request) => new URL(request.fullUrl).searchParams);
  for (const params of [first, second]) {
    assert.equal(params.get('u'), 'demo');
    assert.equal(params.get('t'), md5(password + params.get('s')));
    assert.equal(params.get('p'), null);
    assert.equal(params.get('f'), 'json');
  }
  assert.notEqual(first.get('s'), second.get('s'));
  assert.ok(requests.every((request) => !request.fullUrl.includes(password)));
});

test('pages through the results', async () => {
  const full = Array.from({ length: 30 }, (_, i) => song(`s${i}`, `Demo Song ${i}`));
  const { plugin: subsonic, requests } = plugin(() => ok({ searchResult3: { song: full } }));

  const result = await subsonic.search('demo', 3, 'music');

  assert.equal(result.isEnd, false);
  assert.equal(new URL(requests[0].fullUrl).searchParams.get('songOffset'), '60');
});

test('keeps a server that lives under a path', async () => {
  const { plugin: subsonic, requests } = plugin(() => ok({ searchResult3: {} }), {
    ...settings,
    server: 'https://music.example/navidrome/',
  });

  await subsonic.search('ode', 1, 'music');

  assert.equal(new URL(requests[0].fullUrl).pathname, '/navidrome/rest/search3');
});

test('plays a song from the server, signed', async () => {
  const { plugin: subsonic } = plugin(() => assert.fail('no request needed'));

  const media = await subsonic.getMediaSource({ id: 's1', title: 'Ode to Joy' }, 'standard');

  const url = new URL(media.url);
  assert.equal(url.origin, 'http://192.168.0.10:4533');
  assert.equal(url.pathname, '/rest/stream');
  assert.equal(url.searchParams.get('id'), 's1');
  assert.equal(url.searchParams.get('t'), md5(password + url.searchParams.get('s')));
  assert.ok(!media.url.includes(password));
});

test('reads synced lyrics as LRC', async () => {
  const { plugin: subsonic, requests } = plugin(() =>
    ok({
      lyricsList: {
        structuredLyrics: [
          { synced: true, line: [{ start: 0, value: 'Demo line one' }, { start: 63500, value: 'Demo line two' }] },
        ],
      },
    }),
  );

  const lyric = await subsonic.getLyric({ id: 's1', title: 'Ode to Joy', artist: 'Demo Artist' });

  assert.equal(lyric.rawLrc, '[00:00.00]Demo line one\n[01:03.50]Demo line two');
  assert.equal(new URL(requests[0].fullUrl).pathname, '/rest/getLyricsBySongId');
});

test('falls back to plain lyrics on a server without synced ones', async () => {
  const { plugin: subsonic, requests } = plugin((request) =>
    request.url.endsWith('/getLyricsBySongId')
      ? failed(70, 'Not found')
      : ok({ lyrics: { value: 'Demo line one\nDemo line two\n' } }),
  );

  const lyric = await subsonic.getLyric({ id: 's1', title: 'Ode to Joy', artist: 'Demo Artist' });

  assert.equal(lyric.rawLrc, 'Demo line one\nDemo line two');
  const params = new URL(requests[1].fullUrl).searchParams;
  assert.equal(params.get('artist'), 'Demo Artist');
  assert.equal(params.get('title'), 'Ode to Joy');
});

test('a song without lyrics has none', async () => {
  const { plugin: subsonic } = plugin((request) =>
    request.url.endsWith('/getLyricsBySongId') ? ok({ lyricsList: { structuredLyrics: [] } }) : ok({ lyrics: {} }),
  );

  assert.equal(await subsonic.getLyric({ id: 's1', title: 'Ode to Joy', artist: 'Demo Artist' }), null);
});

for (const [what, variables, expected] of [
  ['no server address', { ...settings, server: '' }, /Server address/],
  ['a server address that is not http(s)', { ...settings, server: 'ftp://music.example' }, /Server address/],
  ['no user name', { ...settings, username: '' }, /User name/],
  ['no password', { ...settings, password: '' }, /Password/],
]) {
  test(`asks for the setting when there is ${what}`, async () => {
    const { plugin: subsonic, requests } = plugin(() => ok({}), variables);

    await assert.rejects(subsonic.search('ode', 1, 'music'), expected);
    assert.equal(requests.length, 0);
  });
}

test('says when the server rejects the user name or password', async () => {
  const { plugin: subsonic, logs } = plugin(() => failed(40, 'Wrong username or password'));

  await assert.rejects(subsonic.search('ode', 1, 'music'), (error) => {
    assert.match(error.message, /user name or password/);
    assert.ok(!error.message.includes(password));
    return true;
  });
  assert.ok(logs.every((line) => !line.includes(password)));
});

test('says when the server cannot be reached, without the request details', async () => {
  const { plugin: subsonic } = plugin(() => {
    throw new Error('connection refused');
  });

  await assert.rejects(subsonic.search('ode', 1, 'music'), (error) => {
    assert.match(error.message, /Could not reach/);
    assert.match(error.message, /192\.168\.0\.10:4533/);
    assert.ok(!error.message.includes(password) && !error.message.includes('t='));
    return true;
  });
});

test('says when the address is not a Subsonic server', async () => {
  const { plugin: subsonic } = plugin(() => ({ data: '<html>Demo</html>' }));

  await assert.rejects(subsonic.search('ode', 1, 'music'), /not a Subsonic server/);
});
