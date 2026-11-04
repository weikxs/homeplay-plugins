import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

const maximumBytes = 4 * 1024 * 1024;
const email = /[\w.+-]+@(?!(?:[\w-]+\.)*(?:example\.(?:com|org|net)|example)\b)[\w-]+\.[\w.-]+/;
const homes = /\/(?:Users|home)\/(?!me\/|<)[\w.-]+\/|[A-Za-z]:\\+Users\\+(?!me(?:\\|$)|<)[^\\\s]+/i;
const secrets = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bgh[pousr]_[A-Za-z0-9]{36}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{22,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/,
  /\bsk-[A-Za-z0-9_-]{32,}/,
];

/** Check working files AND staged contents. Findings contain locations only. */
export function checkPrivacy(root) {
  root = realpathSync(root);
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  const index = git('ls-files', '--stage', '-z').split('\0').filter(Boolean);
  const tracked = new Set(index.map(entry => entry.slice(entry.indexOf('\t') + 1)));
  const unsafeIndex = new Set(index.filter(entry => !/^100(?:644|755) [a-f0-9]+ 0\t/.test(entry))
    .map(entry => entry.slice(entry.indexOf('\t') + 1)));
  const files = new Set([...tracked, ...git('ls-files', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean)]);
  const denylistFile = join(root, '.privacy-denylist');
  const patterns = [...secrets, homes];
  if (existsSync(denylistFile)) {
    try {
      for (const line of readFileSync(denylistFile, 'utf8').split('\n')) {
        if (line.trim() && !line.startsWith('#')) patterns.push(new RegExp(line, 'i'));
      }
    } catch { return ['privacy denylist could not be read or parsed']; }
  }
  const problems = new Set();
  function inspect(file, bytes, stage) {
    const label = stage ? `${file} (index)` : file;
    if (bytes.length > maximumBytes || bytes.includes(0)) {
      problems.add(`${label}: binary or oversized file requires separate privacy review`); return;
    }
    bytes.toString('utf8').split('\n').forEach((line, i) => {
      // URL or bare userinfo (user:password@host) is not an e-mail address.
      const withoutUserinfo = line
        .replace(/\/\/[^/\s@]*@/g, '//')
        .replace(/([\s'"(=,])[\w.-]+:[^\s@'"]*@/g, '$1');
      if (email.test(withoutUserinfo) || patterns.some(pattern => pattern.test(line))) {
        problems.add(`${label}:${i + 1}: possible private data`);
      }
    });
  }
  for (const file of files) {
    const path = resolve(root, file);
    if (!path.startsWith(root + sep)) { problems.add('privacy check found an invalid repository path'); continue; }
    try {
      const stat = lstatSync(path);
      if (stat.isSymbolicLink() || !stat.isFile() || !realpathSync(path).startsWith(root + sep)) {
        problems.add(`${file}: non-regular or external file requires separate privacy review`);
      } else if (stat.size > maximumBytes) {
        problems.add(`${file}: oversized file requires separate privacy review`);
      } else {
        inspect(file, readFileSync(path), false);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') problems.add(`${file}: could not inspect working file`);
    }
    if (unsafeIndex.has(file)) {
      problems.add(`${file}: non-regular or unmerged index entry requires separate privacy review`);
      continue;
    }
    if (tracked.has(file)) {
      try {
        // -- follows the revision argument, so a filename cannot become an option.
        const bytes = execFileSync('git', ['show', `:${file}`, '--'], { cwd: root, maxBuffer: maximumBytes + 1, stdio: ['ignore', 'pipe', 'pipe'] });
        inspect(file, bytes, true);
      } catch { problems.add(`${file}: could not inspect index content`); }
    }
  }
  return [...problems];
}
