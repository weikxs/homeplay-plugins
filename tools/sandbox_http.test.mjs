import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadPlugin } from './sandbox.mjs';

const source = `module.exports = {
  search: async function() {
    try {
      const response = await axios.get('https://public.example/start');
      return { finalUrl: response.request.responseURL };
    } catch (error) {
      return { code: error.code, cancelled: axios.isCancel(error) };
    }
  },
};`;

test('axios exposes the final response URL supplied by the host', async () => {
  const loaded = loadPlugin(source, { respond: () => ({ url: 'https://public.example/final', data: {} }) });
  assert.equal((await loaded.plugin.search()).finalUrl, 'https://public.example/final');
});

test('host cancellation has axios cancellation semantics', async () => {
  const loaded = loadPlugin(source, { respond: () => {
    const error = new Error('Request cancelled');
    error.code = 'cancelled';
    throw error;
  } });
  const result = await loaded.plugin.search();
  assert.equal(result.code, 'ERR_CANCELED');
  assert.equal(result.cancelled, true);
});

test('an HTTP error is not mistaken for local cancellation', async () => {
  const loaded = loadPlugin(source, { respond: () => ({ status: 499 }) });
  const result = await loaded.plugin.search();
  assert.equal(result.code, 'ERR_BAD_REQUEST');
  assert.equal(result.cancelled, false);
});
