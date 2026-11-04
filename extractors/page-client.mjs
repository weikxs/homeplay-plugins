import { ExtractionError, fail } from './errors.mjs';

const HOSTS = {
  douyin: new Set(['douyin.com', 'www.douyin.com', 'v.douyin.com', 'www.iesdouyin.com']),
  tiktok: new Set(['tiktok.com', 'www.tiktok.com', 'm.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com']),
};
const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 15000;

export function checkedPageUrl(platform, input) {
  let url;
  try { url = new URL(input); } catch { fail('invalid_url', 'A supported HTTPS platform link is required.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !HOSTS[platform]?.has(url.hostname)) {
    fail('invalid_url', 'This link is not an allowed HTTPS platform page.');
  }
  url.hash = '';
  return url;
}

export function contentId(platform, url) {
  const pattern = platform === 'douyin' ? /^\/(?:share\/)?video\/(\d+)\/?$/ : /^\/@[^/]+\/video\/(\d+)\/?$/;
  return pattern.exec(url.pathname)?.[1] ?? null;
}

export function shareUrl(platform, input) {
  if (typeof input !== 'string' || input.length > 8192) fail('invalid_url', 'A supported platform link is required.');
  const match = input.match(/https?:\/\/[^\s<>"'，。！？；（）【】]+/i);
  if (!match) fail('invalid_url', 'No supported platform link was found.');
  const url = checkedPageUrl(platform, match[0]);
  if (!contentId(platform, url)) {
    const short = platform === 'douyin'
      ? url.hostname === 'v.douyin.com' && /^\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)
      : ['vm.tiktok.com', 'vt.tiktok.com'].includes(url.hostname) && /^\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)
        || ['www.tiktok.com', 'tiktok.com'].includes(url.hostname) && /^\/t\/[A-Za-z0-9_-]+\/?$/.test(url.pathname);
    if (!short) fail('invalid_url', 'Only video links and supported short links can be extracted.');
  }
  // Tracking parameters and embedded credentials are never replayed.
  url.search = '';
  return url;
}

function location(headers) {
  if (typeof headers?.get === 'function') return headers.get('location');
  const key = Object.keys(headers ?? {}).find((key) => key.toLowerCase() === 'location');
  return key ? headers[key] : null;
}

async function requestOnce(request, url, signal) {
  if (signal?.aborted) fail('cancelled', 'Extraction was cancelled.');
  const controller = new AbortController();
  let timer;
  let onAbort;
  const interrupted = new Promise((_, reject) => {
    onAbort = () => {
      controller.abort();
      reject(new ExtractionError('cancelled', 'Extraction was cancelled.'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => {
      controller.abort();
      reject(new ExtractionError('timeout', 'The platform request timed out.'));
    }, TIMEOUT_MS);
  });
  try {
    return await Promise.race([
      Promise.resolve().then(() => {
        if (controller.signal.aborted) fail('cancelled', 'Extraction was cancelled.');
        return request(url.href, {
          redirect: 'manual', signal: controller.signal, timeoutMs: TIMEOUT_MS, maxBytes: MAX_BYTES,
          headers: { Accept: 'text/html', 'User-Agent': 'HomePlay/0.1' },
        });
      }),
      interrupted,
    ]);
  } catch (error) {
    if (error instanceof ExtractionError) throw error;
    fail('network_error', 'The platform request failed.');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/** request must enforce manual redirects and the byte limit before buffering. */
export async function loadPage(platform, input, request, signal) {
  if (typeof request !== 'function') fail('transport_required', 'A bounded, policy-checked HTTP transport is required.');
  let url = shareUrl(platform, input);
  const expectedId = contentId(platform, url);
  const seen = new Set();
  for (let hop = 0; hop <= 4; hop++) {
    if (seen.has(url.href)) fail('redirect_error', 'The platform returned a redirect loop.');
    seen.add(url.href);
    const response = await requestOnce(request, url, signal);
    // Reject transports that silently follow redirects, even to another allowed host.
    if (response?.url && response.url !== url.href) fail('transport_error', 'The HTTP transport followed a redirect automatically.');
    const status = response?.status;
    if ([301, 302, 303, 307, 308].includes(status)) {
      const target = location(response.headers);
      if (typeof target !== 'string' || !target) fail('redirect_error', 'The platform redirect has no destination.');
      try { url = checkedPageUrl(platform, new URL(target, url).href); }
      catch { fail('redirect_error', 'The platform redirected outside the allowed page hosts.'); }
      url.search = '';
      continue;
    }
    if (status === 401 || status === 403) fail('content_restricted', 'Anonymous access to this page is unavailable.');
    if (status === 404 || status === 410) fail('content_unavailable', 'The content is unavailable.');
    if (status === 429) fail('rate_limited', 'The platform is rate limiting requests.');
    if (!Number.isInteger(status) || status < 200 || status >= 300) fail('network_error', 'The platform returned an unsuccessful response.');
    const id = contentId(platform, url);
    if (!id || expectedId && expectedId !== id) fail('content_mismatch', 'The response does not identify the requested video.');
    if (typeof response.data !== 'string' || response.data.length > MAX_BYTES
      || new TextEncoder().encode(response.data).byteLength > MAX_BYTES) {
      fail('invalid_response', 'The page is missing or exceeds the extractor limit.');
    }
    if (signal?.aborted) fail('cancelled', 'Extraction was cancelled.');
    return { html: response.data, url: url.href, id };
  }
  fail('redirect_error', 'The platform returned too many redirects.');
}
