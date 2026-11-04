import { fail } from './errors.mjs';

const MAX_HTML_CHARS = 2 * 1024 * 1024;

// Parse data only: never execute page scripts or deserialize executable objects.
export function scriptJson(html, ids) {
  if (typeof html !== 'string' || html.length > MAX_HTML_CHARS) {
    fail('invalid_response', 'The page is missing or exceeds the extractor limit.');
  }
  const scripts = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  for (const match of html.matchAll(scripts)) {
    const id = /(?:^|\s)id\s*=\s*(["'])(.*?)\1/i.exec(match[1])?.[2];
    if (!ids.includes(id)) continue;
    try {
      const text = id === 'RENDER_DATA' ? decodeURIComponent(match[2].trim()) : match[2].trim();
      const value = JSON.parse(text);
      if (value && typeof value === 'object' && !Array.isArray(value)) return { id, value };
    } catch {
      fail('invalid_response', 'The platform returned unreadable content data.');
    }
    fail('invalid_response', 'The platform returned invalid content data.');
  }
  fail('page_unavailable', 'The page has no supported public content data; access or page format may have changed.');
}

// Douyin state varies by route. Traverse bounded data, not arbitrary executable text.
export function findRecord(root, keys, expectedId) {
  const pending = [root];
  let visited = 0;
  while (pending.length && visited++ < 10000) {
    const node = pending.shift();
    if (!node || typeof node !== 'object') continue;
    if (keys.some((key) => String(node[key] ?? '') === expectedId)) return node;
    for (const child of Object.values(node)) {
      if (child && typeof child === 'object') pending.push(child);
    }
    if (pending.length > 10000) fail('invalid_response', 'The platform returned excessive content data.');
  }
  return null;
}
