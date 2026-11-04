// Checks the repository: every plugin follows docs/development/standards.md,
// index.json lists exactly the plugins as they are, and no real personal data
// is committed. Run with `node tools/check.mjs`; exits non-zero on a problem.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlugin } from './sandbox.mjs';
import { checkPrivacy } from './privacy.mjs';
import { checkRuntimeSnapshot } from './runtime_snapshot.mjs';

const repository = 'weikxs/homeplay-plugins';
const author = 'HomePlay Plugins';
const maxBytes = 64 * 1024;
// The modules the TimbreBox sandbox provides to `require`.
const sandboxModules = new Set(['axios', 'crypto-js', 'he', 'dayjs', 'qs', 'cheerio', 'big-integer']);
// The same rules TimbreBox applies to a plugin's declared settings.
const variableKey = /^[A-Za-z0-9_.-]{1,64}$/;
const maxVariables = 20;
const semver = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/** The raw URL of plugin [name] on `main`: its `srcUrl` and index entry. */
export const rawUrlOf = (name) =>
  `https://raw.githubusercontent.com/${repository}/main/plugins/${name}/${name}.js`;
export const experimentalUrlOf = name =>
  `https://raw.githubusercontent.com/${repository}/main/experimental/platforms/${name}.js`;

/** The problems of the plugin [name] whose code is [source]. */
export function checkPlugin(name, source, { experimental = false } = {}) {
  const problems = [];
  if (Buffer.byteLength(source) > maxBytes) {
    problems.push(`${name}: file size is over ${maxBytes / 1024} KB`);
  }
  for (const [, module] of source.matchAll(/require\(\s*['"`]([^'"`]+)['"`]\s*\)/g)) {
    if (!sandboxModules.has(module)) problems.push(`${name}: require('${module}') is not provided by the sandbox`);
  }
  if (/\beval\s*\(|\bnew\s+Function\s*\(|\bFunction\s*\(/.test(source)) {
    problems.push(`${name}: no eval or Function: plugins run no code they build at run time`);
  }
  let plugin;
  try {
    plugin = loadPlugin(source).plugin;
  } catch (error) {
    problems.push(`${name}: the script does not load: ${error.message}`);
    return problems;
  }
  const text = (key) => (typeof plugin[key] === 'string' ? plugin[key] : '');
  if (!text('platform').trim()) problems.push(`${name}: platform is missing`);
  if (!semver.test(text('version'))) problems.push(`${name}: version is not a semantic version`);
  if (text('author') !== author) problems.push(`${name}: author must be "${author}"`);
  const expectedUrl = experimental ? experimentalUrlOf(name) : rawUrlOf(name);
  if (text('srcUrl') !== expectedUrl) problems.push(`${name}: srcUrl must be ${expectedUrl}`);
  if (experimental) {
    if (plugin.experimental !== true || !text('version').includes('-')) problems.push(`${name}: experimental files require a marker and prerelease version`);
    const capabilities = plugin.requiredCapabilities;
    if (!Array.isArray(capabilities) || capabilities.length === 0 || capabilities.length > 8 ||
        new Set(capabilities).size !== capabilities.length ||
        capabilities.some(value => !['http', 'media.source'].includes(value))) {
      problems.push(`${name}: declare supported requiredCapabilities`);
    }
  } else if (plugin.experimental === true) {
    problems.push(`${name}: experimental plugins cannot enter the published directory`);
  }
  if (typeof plugin.search !== 'function') problems.push(`${name}: search is not exported as a function`);
  problems.push(...checkVariables(name, plugin.userVariables));
  return problems;
}

function checkVariables(name, variables) {
  if (variables === undefined) return [];
  if (!Array.isArray(variables)) return [`${name}: userVariables must be a list`];
  const problems = [];
  if (variables.length > maxVariables) problems.push(`${name}: userVariables has more than ${maxVariables} entries`);
  const keys = new Set();
  for (const variable of variables) {
    const key = variable?.key;
    if (typeof key !== 'string' || !variableKey.test(key)) {
      problems.push(`${name}: userVariables has a malformed key ${JSON.stringify(key)}`);
    } else if (keys.has(key)) {
      problems.push(`${name}: userVariables repeats the key ${key}`);
    }
    keys.add(key);
    if (typeof variable?.name !== 'string' || !variable.name.trim()) {
      problems.push(`${name}: userVariables entry ${key} has no name`);
    }
  }
  return problems;
}

/** The problems of [index] against [plugins] (`{ name, platform, version, url }`). */
export function checkIndex(index, plugins) {
  const problems = [];
  const listed = Array.isArray(index?.plugins) ? index.plugins : [];
  if (!Array.isArray(index?.plugins)) problems.push('index.json: plugins must be a list');
  if (listed.length > 512) problems.push('index.json: too many entries');
  const names = new Set(), urls = new Set();
  for (const [position, entry] of listed.slice(0, 512).entries()) {
    const label = `index.json: entry ${position + 1}`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) ||
        typeof entry.name !== 'string' || !entry.name.trim() || entry.name.length > 200 ||
        typeof entry.url !== 'string' || !entry.url.startsWith('https://') ||
        typeof entry.version !== 'string' || !semver.test(entry.version)) {
      problems.push(`${label} has malformed metadata`); continue;
    }
    const name = entry.name.trim().toLowerCase();
    if (names.has(name)) problems.push(`${label} has a duplicate name`);
    if (urls.has(entry.url)) problems.push(`${label} has a duplicate URL`);
    names.add(name); urls.add(entry.url);
    const plugin = plugins.find(p => p.url === entry.url);
    if (!plugin) problems.push(`${label} has no published plugin`);
    else if (entry.name !== plugin.platform || entry.version !== plugin.version) {
      problems.push(`${label} does not match the plugin name and version`);
    }
  }
  for (const plugin of plugins) {
    if (!listed.some((entry) => entry && entry.url === plugin.url)) {
      problems.push(`index.json: ${plugin.platform} is not listed`);
    }
  }
  return problems;
}

function main() {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const pluginsDir = join(root, 'plugins');
  const problems = [];
  const plugins = [];
  const names = existsSync(pluginsDir)
    ? readdirSync(pluginsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
    : [];
  for (const name of names) {
    const file = join(pluginsDir, name, `${name}.js`);
    if (!existsSync(file)) {
      problems.push(`plugins/${name}: ${name}.js is missing`);
      continue;
    }
    const source = readFileSync(file, 'utf8');
    problems.push(...checkPlugin(name, source));
    try {
      const { plugin } = loadPlugin(source);
      plugins.push({ name, platform: plugin.platform, version: plugin.version, url: rawUrlOf(name) });
    } catch {
      // Already reported by checkPlugin.
    }
  }
  const experimentalDir = join(root, 'experimental/platforms');
  const experimentalFiles = existsSync(experimentalDir)
    ? readdirSync(experimentalDir, { withFileTypes: true }).filter(entry => entry.isFile() && entry.name.endsWith('.js')) : [];
  for (const entry of experimentalFiles) {
    const name = entry.name.slice(0, -3);
    problems.push(...checkPlugin(name, readFileSync(join(experimentalDir, entry.name), 'utf8'), { experimental: true }));
  }
  const indexFile = join(root, 'index.json');
  if (existsSync(indexFile)) {
    try { problems.push(...checkIndex(JSON.parse(readFileSync(indexFile, 'utf8')), plugins)); }
    catch { problems.push('index.json: invalid JSON'); }
  } else if (plugins.length > 0) {
    problems.push('index.json is missing');
  }
  problems.push(...checkRuntimeSnapshot(root));
  problems.push(...checkPrivacy(root));
  for (const problem of problems) console.error(problem);
  console.log(problems.length === 0 ? `ok: ${plugins.length} published and ${experimentalFiles.length} experimental plugin(s) checked` : `${problems.length} problem(s)`);
  process.exitCode = problems.length === 0 ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
