import assert from 'node:assert/strict';
import { test } from 'node:test';

import { loadPlugin } from './sandbox.mjs';

const source = `
const CryptoJS = require('crypto-js');
module.exports = {
  platform: 'Demo',
  search: async function (query) {
    const values = env.getUserVariables();
    const res = await axios.get(values.server + '/search', { params: { q: query } });
    return { isEnd: true, data: res.data.songs, hash: CryptoJS.MD5('demo').toString() };
  },
};
`;

test('a plugin runs on the TimbreBox sandbox scripts with the answers a test gives', async () => {
  const { plugin, requests } = loadPlugin(source, {
    variables: { server: 'https://music.example' },
    respond: () => ({ data: { songs: [{ id: '1', title: 'Ode to Joy' }] } }),
  });

  const result = await plugin.search('ode', 1, 'music');

  assert.equal(requests.length, 1);
  assert.equal(requests[0].fullUrl, 'https://music.example/search?q=ode');
  assert.deepEqual(Array.from(result.data, (song) => song.title), ['Ode to Joy']);
  assert.equal(result.hash, 'fe01ce2a7fbac8fafaed7c982a04e229');
});

test('a request without an answer fails like a network error', async () => {
  const { plugin } = loadPlugin(source, { variables: { server: 'https://music.example' } });

  await assert.rejects(plugin.search('ode', 1, 'music'));
});

test('the sandbox has no network of its own', () => {
  const { plugin } = loadPlugin(
    'module.exports = { platform: "Demo", kinds: [typeof fetch, typeof XMLHttpRequest] };',
  );

  assert.deepEqual(Array.from(plugin.kinds), ['undefined', 'undefined']);
});
