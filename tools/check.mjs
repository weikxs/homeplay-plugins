// Checks the repository: every plugin follows docs/development/standards.md,
// index.json lists exactly the plugins as they are, and no real personal data
// is committed. Run with `node tools/check.mjs`; exits non-zero on a problem.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlugin } from './sandbox.mjs';

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

/** The problems of the plugin [name] whose code is [source]. */
export function checkPlugin(name, source) {
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
  if (text('srcUrl') !== rawUrlOf(name)) problems.push(`${name}: srcUrl must be ${rawUrlOf(name)}`);
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
  for (const entry of listed) {
    const plugin = plugins.find((p) => p.url === entry.url);
    if (!plugin) {
      problems.push(`index.json: ${entry.name} is listed but has no plugin at ${entry.url}`);
    } else if (entry.name !== plugin.platform || entry.version !== plugin.version) {
      problems.push(
        `index.json: ${entry.name} ${entry.version} does not match the plugin's platform and version (${plugin.platform} ${plugin.version})`,
      );
    }
  }
  for (const plugin of plugins) {
    if (!listed.some((entry) => entry.url === plugin.url)) {
      problems.push(`index.json: ${plugin.platform} is not listed`);
    }
  }
  return problems;
}

/** Real personal data in the files git tracks: the local denylist, e-mail addresses, home folders. */
function checkPrivacy(root) {
  const files = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
  const denylistFile = join(root, '.privacy-denylist');
  const patterns = existsSync(denylistFile)
    ? readFileSync(denylistFile, 'utf8')
        .split('\n')
        .filter((line) => line.trim() && !line.startsWith('#'))
        .map((line) => new RegExp(line, 'i'))
    : [];
  patterns.push(/[\w.+-]+@(?!(?:[\w-]+\.)*(?:example\.(?:com|org|net)|example)\b)[\w-]+\.[\w.-]+/);
  patterns.push(/\/(?:Users|home)\/(?!me\/|<)[\w.-]+\//);
  const problems = [];
  for (const file of files) {
    const lines = readFileSync(join(root, file), 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (patterns.some((pattern) => pattern.test(line))) problems.push(`${file}:${i + 1}: possible personal data`);
    });
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
  const indexFile = join(root, 'index.json');
  if (existsSync(indexFile)) {
    problems.push(...checkIndex(JSON.parse(readFileSync(indexFile, 'utf8')), plugins));
  } else if (plugins.length > 0) {
    problems.push('index.json is missing');
  }
  problems.push(...checkPrivacy(root));
  for (const problem of problems) console.error(problem);
  console.log(problems.length === 0 ? `ok: ${plugins.length} plugin(s) checked` : `${problems.length} problem(s)`);
  process.exitCode = problems.length === 0 ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
