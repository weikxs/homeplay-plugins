// Runs a plugin the way TimbreBox does, for tests: the TimbreBox sandbox
// scripts (tools/runtime) in a fresh context, with the host side answering
// each HTTP request from the test's `respond` function instead of the network.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const runtimeDir = join(dirname(fileURLToPath(import.meta.url)), 'runtime');
const runtime = Object.fromEntries(
  ['prelude', 'url', 'axios'].map((name) => [
    name,
    readFileSync(join(runtimeDir, `${name}.js`), 'utf8'),
  ]),
);

/**
 * Loads the plugin in [source] and returns `{ plugin, requests, logs }`.
 *
 * - `variables`: what the user entered in the plugin's settings.
 * - `respond(request)`: answers one request (`{ method, url, fullUrl, headers,
 *   params, data, timeout }`) with `{ status, headers, data }` (data as text
 *   or a value sent as JSON); throwing makes the request fail like a network
 *   error. Every request is also kept in `requests`.
 */
export function loadPlugin(source, { variables = {}, respond = noNetwork, os = 'linux', lang = 'en-US' } = {}) {
  const requests = [];
  const logs = [];
  const context = vm.createContext({ setTimeout, clearTimeout });
  context.sendMessage = (channel, payload) => {
    if (channel === '__log') {
      logs.push(String(payload));
    } else if (channel === '__hostHttp') {
      answer(context, JSON.parse(payload), respond, requests);
    }
    return '';
  };
  const env = { appVersion: 'test', os, lang, userVariables: variables };
  const prelude = runtime.prelude
    .replaceAll('__ENV__', JSON.stringify(env))
    .replaceAll('__MSG_NOT_LOADED__', JSON.stringify('This module is not available in tests: '))
    .replaceAll('__MSG_NOT_ALLOWED__', JSON.stringify('Module not allowed: '));
  for (const script of [prelude, runtime.url, runtime.axios]) {
    vm.runInContext(script, context);
  }
  if (/['"`]crypto-js['"`]/.test(source)) context.__lib_cryptojs = cryptoJs;
  vm.runInContext('var module={exports:{}};var exports=module.exports;', context);
  vm.runInContext(source, context);
  const plugin = vm.runInContext('__exportOf(module)', context);
  return { plugin, requests, logs };
}

function answer(context, request, respond, requests) {
  const full = new URL(request.url);
  for (const [key, value] of Object.entries(request.params ?? {})) {
    full.searchParams.append(key, String(value));
  }
  const recorded = { ...request, fullUrl: full.toString() };
  requests.push(recorded);
  Promise.resolve()
    .then(() => respond(recorded))
    .then(
      (response) =>
        context.__resolveHost(request.id, true, {
          status: response?.status ?? 200,
          headers: response?.headers ?? {},
          data: typeof response?.data === 'string' ? response.data : JSON.stringify(response?.data ?? null),
        }),
      (error) => context.__resolveHost(request.id, false, { message: error.message, code: error.code }),
    );
}

function noNetwork(request) {
  throw new Error(`No response given for ${request.method} ${request.url}`);
}

// The parts of crypto-js the plugins here use, on top of node:crypto.
const digest = (algorithm) => (text) => {
  const hex = createHash(algorithm).update(String(text), 'utf8').digest('hex');
  return { toString: () => hex };
};
const cryptoJs = { MD5: digest('md5'), SHA1: digest('sha1'), SHA256: digest('sha256') };
