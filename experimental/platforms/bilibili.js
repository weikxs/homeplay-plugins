'use strict';

// Official anonymous HTTP responses only. Session values remain in this engine.
const API = 'https://api.bilibili.com';
const HOME = 'https://www.bilibili.com/';
const UA = 'Mozilla/5.0 (compatible; TimbreBox/0.1)';
const BVID = /^BV[A-Za-z0-9]{10}$/;
const PAGE_SIZE = 10;
let session;
let pendingSession;

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

async function jsonRequest(path, params, cookie) {
  let response;
  try {
    response = await axios.get(API + path, {
      params,
      headers: Object.assign({ 'User-Agent': UA, Referer: HOME }, cookie ? { Cookie: cookie } : {}),
      timeout: 15000,
      validateStatus: null,
    });
  } catch (_) {
    fail('platform_network_error', 'The platform request failed.');
  }
  if ([401, 403, 412].includes(response.status)) {
    session = undefined;
    fail('anonymous_access_unavailable', 'The platform currently refuses anonymous access.');
  }
  if (response.status === 429) fail('platform_rate_limited', 'The platform request was rate limited.');
  if (response.status !== 200) fail('platform_network_error', 'The platform returned an unsuccessful HTTP response.');
  const body = response.data;
  if (!body || typeof body !== 'object' || !Number.isInteger(body.code)) {
    fail('invalid_platform_response', 'The platform returned an invalid JSON response.');
  }
  if ([-101, -352, -403, -10403].includes(body.code)) {
    session = undefined;
    fail('anonymous_access_unavailable', 'The platform requires authentication or refused this anonymous session.');
  }
  if ([-404, 62002, 62004, 62012].includes(body.code)) fail('content_unavailable', 'The content is unavailable.');
  if (body.code !== 0) fail('platform_request_failed', 'The platform rejected this request.');
  if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) {
    fail('invalid_platform_response', 'The platform returned no valid response data.');
  }
  return body.data;
}

function cookieValue(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 512 &&
    !/[^\x21-\x7e]|[;,"\\]/.test(value);
}

async function anonymousCookie() {
  if (session && session.expires > Date.now()) return session.cookie;
  if (!pendingSession) {
    pendingSession = jsonRequest('/x/frontend/finger/spi').then((data) => {
      if (!cookieValue(data.b_3) || !cookieValue(data.b_4)) {
        fail('invalid_platform_response', 'The platform did not establish a valid anonymous session.');
      }
      return { cookie: 'buvid3=' + data.b_3 + '; buvid4=' + data.b_4, expires: Date.now() + 5 * 60 * 1000 };
    });
  }
  const pending = pendingSession;
  try {
    session = await pending;
    return session.cookie;
  } finally {
    if (pendingSession === pending) pendingSession = undefined;
  }
}

async function api(path, params) {
  return jsonRequest(path, params, await anonymousCookie());
}

function clearFlag(value) {
  return value === false || value === 0 || value === '0';
}

// Explicit content rights, not uploader membership or supported premium qualities.
function requirePublicContent(view) {
  const rights = view.rights;
  if (!rights || typeof rights !== 'object' || view.state !== 0) {
    fail('content_unverified', 'Public content rights could not be verified.');
  }
  const groups = [
    [rights, ['pay', 'ugc_pay', 'arc_pay', 'ugc_pay_preview', 'no_background']],
    [view, ['is_chargeable_season', 'is_upower_exclusive', 'is_upower_preview', 'is_upower_exclusive_with_qa']],
  ];
  for (const [node, keys] of groups) {
    for (const key of keys) {
      if (node[key] === true || node[key] === 1 || node[key] === '1') {
        fail('content_excluded', 'Paid, exclusive, preview or background-restricted content is excluded.');
      }
      if (!clearFlag(node[key])) fail('content_unverified', 'Content access information is incomplete.');
    }
  }
}

function reference(item) {
  const bvid = item && (item.videoId || item.bvid || item.id);
  const part = item && item.part != null ? item.part : 1;
  if (typeof bvid !== 'string' || !BVID.test(bvid) || !Number.isInteger(part) || part < 1 || part > 1000) {
    fail('invalid_media_reference', 'A valid video identity and part are required.');
  }
  return { bvid, part };
}

function pageReference(input) {
  let url;
  try { url = new URL(input); } catch (_) { fail('invalid_media_reference', 'A valid platform link is required.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) {
    fail('invalid_media_reference', 'A secure public platform link is required.');
  }
  if (url.hostname === 'b23.tv' && /^\/[A-Za-z0-9]+\/?$/.test(url.pathname)) return { short: url.href };
  if (!['www.bilibili.com', 'bilibili.com', 'm.bilibili.com'].includes(url.hostname)) {
    fail('invalid_media_reference', 'The link is not a supported platform page.');
  }
  const match = /^\/video\/(BV[A-Za-z0-9]{10})\/?$/.exec(url.pathname);
  if (!match) fail('invalid_media_reference', 'The link has no supported video identity.');
  return reference({ bvid: match[1], part: url.searchParams.has('p') ? Number(url.searchParams.get('p')) : 1 });
}

function plainTitle(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 4000) {
    fail('invalid_platform_response', 'The platform returned no valid title.');
  }
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return value.replace(/<[^>]*>/g, '').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (text, entity) => {
    if (entity[0] !== '#') return entities[entity.toLowerCase()];
    const number = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff) ? String.fromCodePoint(number) : text;
  }).trim();
}

function seconds(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : undefined;
  if (typeof value !== 'string' || !/^\d+(?::\d{1,2}){1,2}$/.test(value)) return undefined;
  return value.split(':').reduce((total, part) => total * 60 + Number(part), 0) || undefined;
}

function summary(raw, ref, page) {
  return {
    id: ref.part > 1 ? ref.bvid + ':p' + ref.part : ref.bvid,
    videoId: ref.bvid,
    part: ref.part,
    title: plainTitle(page && ref.part > 1 ? page.part : raw.title),
    artist: typeof raw.author === 'string' ? raw.author : raw.owner && typeof raw.owner.name === 'string' ? raw.owner.name : 'Bilibili',
    duration: seconds(page ? page.duration : raw.duration),
    artwork: typeof raw.pic === 'string' ? raw.pic.replace(/^\/\//, 'https://') : undefined,
    contentKind: 'video_audio',
  };
}

async function content(ref) {
  const view = await api('/x/web-interface/view', { bvid: ref.bvid });
  if (view.bvid !== ref.bvid) fail('invalid_platform_response', 'The platform returned a different video.');
  requirePublicContent(view);
  const page = Array.isArray(view.pages) && view.pages.find((entry) => entry.page === ref.part);
  if (!page || !Number.isSafeInteger(page.cid) || page.cid <= 0 || !seconds(page.duration)) {
    fail('content_unavailable', 'The requested video part is unavailable.');
  }
  return { view, page };
}

async function search(query, page, type) {
  if (type && type !== 'music') return { isEnd: true, data: [] };
  if (typeof query !== 'string' || !query.trim() || query.length > 8192 || !Number.isInteger(page) || page < 1 || page > 1000) {
    fail('invalid_media_request', 'A nonempty query and valid page are required.');
  }
  const link = query.match(/https?:\/\/[^\s<>"'，。！？；（）【】]+/i);
  if (link || BVID.test(query.trim())) {
    if (page !== 1) return { isEnd: true, data: [] };
    if (link && !/^https:\/\/(?:b23\.tv|(?:www\.|m\.)?bilibili\.com)(?:\/|$)/i.test(link[0])) return { isEnd: true, data: [] };
    let ref = link ? pageReference(link[0]) : reference({ bvid: query.trim() });
    if (ref.short) {
      let response;
      try { response = await axios.get(ref.short, { headers: { 'User-Agent': UA }, timeout: 15000 }); }
      catch (_) { fail('anonymous_access_unavailable', 'The platform short link is unavailable.'); }
      ref = pageReference(response.request.responseURL);
      if (ref.short) fail('invalid_media_reference', 'The short link did not resolve to a video.');
    }
    const { view, page: selected } = await content(ref);
    return { isEnd: true, data: [summary(view, ref, selected)] };
  }
  if (query.trim().length > 256) fail('invalid_media_request', 'The keyword is too long.');
  const result = await api('/x/web-interface/search/type', { search_type: 'video', keyword: query.trim(), page, page_size: PAGE_SIZE });
  if (!Array.isArray(result.result) || result.page !== page || !Number.isInteger(result.numPages) || result.numPages < 0) {
    fail('invalid_platform_response', 'The platform returned invalid search pagination.');
  }
  const seen = new Set();
  const data = [];
  for (const item of result.result) {
    if (!item || typeof item.bvid !== 'string' || !BVID.test(item.bvid) || seen.has(item.bvid)) continue;
    if (['is_pay', 'is_paid', 'is_vip', 'is_preview', 'is_trial'].some((key) => [true, 1, '1'].includes(item[key]))) continue;
    seen.add(item.bvid);
    data.push(summary(item, { bvid: item.bvid, part: 1 }));
  }
  return { isEnd: page >= result.numPages, data };
}

async function getMediaSource(item, quality) {
  if (quality && quality !== 'standard') return null;
  const ref = reference(item);
  const { page } = await content(ref); // Never trust rights or a CID from a saved item.
  const play = await api('/x/player/playurl', { bvid: ref.bvid, cid: page.cid, fnval: 16, fourk: 0 });
  for (const key of ['is_preview', 'is_trial', 'is_drm']) {
    if (Object.prototype.hasOwnProperty.call(play, key) && !clearFlag(play[key])) {
      fail([true, 1, '1'].includes(play[key]) ? 'content_excluded' : 'content_unverified', 'Preview, restricted or unverified streams are excluded.');
    }
  }
  // The API may omit a preview flag. Explicit free rights AND a full-length
  // resource matching this exact part are required instead; no flags are added.
  const tolerance = Math.min(2000, page.duration * 100);
  if (!Number.isFinite(play.timelength) || play.timelength <= 0 || Math.abs(play.timelength - page.duration * 1000) > tolerance ||
      !play.dash || !Number.isFinite(play.dash.duration) || play.dash.duration <= 0 || Math.abs(play.dash.duration - page.duration) * 1000 > tolerance) {
    fail('content_unverified', 'Full-length playback of this part could not be verified.');
  }
  const audio = [];
  for (const format of Array.isArray(play.dash.audio) ? play.dash.audio : []) {
    if (!format || !Number.isFinite(format.bandwidth) || format.bandwidth <= 0 || format.bandwidth > 192000 ||
        (format.mimeType || format.mime_type) !== 'audio/mp4' || !/^mp4a\.40\.(2|5)$/.test(format.codecs || '')) continue;
    if (['has_drm', 'drm_tech_type'].some((key) => format[key] != null && !clearFlag(format[key]))) continue;
    const backups = format.backupUrl || format.backup_url;
    const urls = [format.baseUrl || format.base_url].concat(Array.isArray(backups) ? backups : []);
    for (const address of urls) {
      if (typeof address !== 'string') continue;
      let url;
      try { url = new URL(address); } catch (_) { continue; }
      const officialCdn = url.hostname === 'upos-hz-mirrorakam.akamaized.net' ||
        ['bilivideo.com', 'bilivideo.cn', 'bilibili.com'].some((domain) => url.hostname === domain || url.hostname.endsWith('.' + domain));
      if (url.protocol === 'https:' && !url.username && !url.password && officialCdn) {
        audio.push({ url: address, bandwidth: format.bandwidth });
        break;
      }
    }
  }
  audio.sort((a, b) => b.bandwidth - a.bandwidth);
  if (!audio.length) fail('media_unavailable', 'No supported public audio stream is available.');
  return {
    url: audio[0].url,
    headers: { 'User-Agent': UA, Referer: HOME + 'video/' + ref.bvid },
    mimeType: 'audio/mp4',
    bitrateKbps: audio[0].bandwidth / 1000,
  };
}

module.exports = {
  platform: 'Bilibili',
  version: '0.1.1-dev',
  experimental: true,
  requiredCapabilities: ['http'],
  author: 'HomePlay Plugins',
  srcUrl: 'https://raw.githubusercontent.com/weikxs/homeplay-plugins/main/experimental/platforms/bilibili.js',
  search,
  getMediaSource,
};
