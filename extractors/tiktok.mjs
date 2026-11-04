import { scriptJson } from './document.mjs';
import { fail } from './errors.mjs';
import { resultFromItem } from './media.mjs';
import { loadPage } from './page-client.mjs';

export function parseTikTokPage(html, reference) {
  const state = scriptJson(html, ['__UNIVERSAL_DATA_FOR_REHYDRATION__', 'SIGI_STATE']);
  let item;
  if (state.id === '__UNIVERSAL_DATA_FOR_REHYDRATION__') {
    const detail = state.value.__DEFAULT_SCOPE__?.['webapp.video-detail'];
    if (!detail || detail.statusCode !== 0) fail('content_unavailable', 'The page does not expose a successful public video response.');
    item = detail.itemInfo?.itemStruct;
  } else {
    item = state.value.ItemModule?.[reference.id];
  }
  if (!item || typeof item !== 'object') fail('content_unavailable', 'The page does not expose the requested video.');
  return resultFromItem('tiktok', item, reference);
}

export function createTikTokExtractor({ request } = {}) {
  return {
    async extract(input, { signal } = {}) {
      const page = await loadPage('tiktok', input, request, signal);
      return parseTikTokPage(page.html, page);
    },
  };
}
