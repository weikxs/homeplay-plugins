import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

const required = new Set(['prelude.js', 'url.js', 'axios.js', 'guest_search_parser.js',
  'guest_search_capture.js', 'guest_search_diagnostic.js']);

/** Offline verification of the reviewed host script snapshot. No fetches. */
export function checkRuntimeSnapshot(root) {
  const problems = [];
  try {
    root = realpathSync(root);
    const manifest = JSON.parse(readFileSync(join(root, 'tools/runtime/host-snapshot.json'), 'utf8'));
    if (manifest.repository !== 'https://github.com/weikxs/timbrebox' ||
        !/^[a-f0-9]{40}$/.test(manifest.commit || '') || !Array.isArray(manifest.assets)) {
      return ['runtime snapshot: invalid manifest'];
    }
    const seen = new Set();
    for (const asset of manifest.assets) {
      if (!asset || !required.has(asset.hostAsset) || seen.has(asset.hostAsset) ||
          typeof asset.localFile !== 'string' || !/^[a-f0-9]{64}$/.test(asset.sha256 || '')) {
        problems.push('runtime snapshot: malformed or repeated asset'); continue;
      }
      seen.add(asset.hostAsset);
      try {
        const path = resolve(root, asset.localFile);
        if (!path.startsWith(root + sep) || lstatSync(path).isSymbolicLink() || !realpathSync(path).startsWith(root + sep)) {
          problems.push(`runtime snapshot: unsafe path for ${asset.hostAsset}`); continue;
        }
        const digest = createHash('sha256').update(readFileSync(path)).digest('hex');
        if (digest !== asset.sha256) problems.push(`runtime snapshot: ${asset.hostAsset} differs from the reviewed snapshot`);
      } catch {
        problems.push(`runtime snapshot: missing or unreadable ${asset.hostAsset}`);
      }
    }
    if (seen.size !== required.size) problems.push('runtime snapshot: required assets are missing');
  } catch { problems.push('runtime snapshot: cannot read manifest or assets'); }
  return problems;
}
