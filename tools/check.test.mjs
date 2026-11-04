import assert from 'node:assert/strict';
import { test } from 'node:test';

import { checkIndex, checkPlugin, rawUrlOf, experimentalUrlOf } from './check.mjs';

const good = `
const CryptoJS = require('crypto-js');
module.exports = {
  platform: 'Subsonic',
  version: '1.0.0',
  author: 'HomePlay Plugins',
  srcUrl: '${rawUrlOf('subsonic')}',
  userVariables: [
    { key: 'server', name: 'Server address', hint: 'https://music.example' },
    { key: 'password', name: 'Password' },
  ],
  search: async function () { return { isEnd: true, data: [] }; },
};
`;

const problemsOf = (source) => checkPlugin('subsonic', source);

test('a well-formed plugin passes', () => {
  assert.deepEqual(problemsOf(good), []);
});

for (const [what, source, expected] of [
  ['no platform', good.replace("platform: 'Subsonic',", ''), /platform/],
  ['a version that is not semver', good.replace("'1.0.0'", "'one'"), /version/],
  ['another author', good.replace("'HomePlay Plugins'", "'Someone'"), /author/],
  ['a srcUrl elsewhere', good.replace(rawUrlOf('subsonic'), 'https://elsewhere.example/a.js'), /srcUrl/],
  ['no search', good.replace('search:', 'find:'), /search/],
  ['a malformed setting key', good.replace("key: 'server'", "key: 'bad key'"), /userVariables/],
  ['a module the sandbox lacks', good.replace("'crypto-js'", "'fs'"), /require/],
  ['dynamic code', good.replace('search:', 'x: eval("1"), search:'), /eval/],
  ['a script that does not load', 'module.exports = {', /load/],
]) {
  test(`reports ${what}`, () => {
    const problems = problemsOf(source);
    assert.ok(
      problems.some((problem) => expected.test(problem)),
      `expected a problem matching ${expected}, got ${JSON.stringify(problems)}`,
    );
  });
}

test('reports a plugin over the size limit', () => {
  const problems = problemsOf(good + `// ${'x'.repeat(70 * 1024)}`);
  assert.ok(problems.some((problem) => /size/.test(problem)));
});

const plugin = { name: 'subsonic', platform: 'Subsonic', version: '1.0.0', url: rawUrlOf('subsonic') };

test('an index that lists every plugin as it is passes', () => {
  const index = { desc: 'HomePlay Plugins', plugins: [{ name: 'Subsonic', version: '1.0.0', url: rawUrlOf('subsonic') }] };
  assert.deepEqual(checkIndex(index, [plugin]), []);
});

test('duplicate subscription names and URLs cannot pass publication checks', () => {
  const entry = { name: 'Subsonic', version: '1.0.0', url: rawUrlOf('subsonic') };
  const problems = checkIndex({ plugins: [entry, { ...entry }] }, [plugin]);
  assert.ok(problems.some(problem => /duplicate name/.test(problem)));
  assert.ok(problems.some(problem => /duplicate URL/.test(problem)));
});

test('malformed subscription entries report errors instead of crashing', () => {
  for (const entry of [null, false, 1, [], {}, { name: 'Subsonic', url: rawUrlOf('subsonic'), version: null }]) {
    assert.ok(checkIndex({ plugins: [entry] }, [plugin]).some(problem => /malformed/.test(problem)));
  }
});

test('experimental sources require their own path, marker, prerelease and declared host capabilities', () => {
  const experimental = good.replace(rawUrlOf('subsonic'), experimentalUrlOf('subsonic'))
    .replace("version: '1.0.0'", "version: '1.0.1-dev', experimental: true, requiredCapabilities: ['media.source']");
  assert.deepEqual(checkPlugin('subsonic', experimental, { experimental: true }), []);
  for (const broken of [experimental.replace('experimental: true', 'experimental: false'),
    experimental.replace('1.0.1-dev', '1.0.1'), experimental.replace("['media.source']", "['unknown']")]) {
    assert.ok(checkPlugin('subsonic', broken, { experimental: true }).length > 0);
  }
  assert.ok(checkPlugin('subsonic', good.replace("version: '1.0.0'", "version: '1.0.0', experimental: true"))
    .some(problem => /cannot enter/.test(problem)));
});

test('reports an index out of step with the plugins', () => {
  const stale = { plugins: [{ name: 'Subsonic', version: '0.9.0', url: rawUrlOf('subsonic') }] };
  const extra = { plugins: [{ name: 'Gone', version: '1.0.0', url: rawUrlOf('gone') }] };
  assert.ok(checkIndex(stale, [plugin]).some((problem) => /version/.test(problem)));
  assert.ok(checkIndex(extra, [plugin]).some((problem) => /no published plugin/.test(problem)));
  assert.ok(checkIndex(extra, [plugin]).some((problem) => /Subsonic/.test(problem)));
});
