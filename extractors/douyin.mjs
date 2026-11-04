import { findRecord, scriptJson } from './document.mjs';
import { fail } from './errors.mjs';
import { resultFromItem } from './media.mjs';
import { loadPage } from './page-client.mjs';

export function parseDouyinPage(html, reference) {
  const state = scriptJson(html, ['RENDER_DATA']);
  const item = findRecord(state.value, ['aweme_id', 'awemeId'], reference.id);
  if (!item) fail('content_unavailable', 'The page does not expose the requested video.');
  return resultFromItem('douyin', item, reference);
}

export function createDouyinExtractor({ request } = {}) {
  return {
    async extract(input, { signal } = {}) {
      const page = await loadPage('douyin', input, request, signal);
      return parseDouyinPage(page.html, page);
    },
  };
}
