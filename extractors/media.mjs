import { fail } from './errors.mjs';
import { requireFreeFullContent } from './access-policy.mjs';

const MEDIA_HOSTS = {
  douyin: ['douyinvod.com', 'douyin.com', 'douyincdn.com', 'amemv.com', 'snssdk.com', 'bytecdn.cn'],
  tiktok: ['tiktokcdn.com', 'tiktokcdn-us.com', 'tiktokcdn-eu.com', 'tiktokv.com', 'byteoversea.com', 'ibytedtos.com'],
};

export function checkedMediaUrl(platform, value) {
  if (typeof value !== 'string') return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  const allowed = MEDIA_HOSTS[platform]?.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !allowed) return null;
  return url.href;
}

function urls(value) {
  if (typeof value === 'string') return [value];
  if (!value || typeof value !== 'object') return [];
  const list = value.url_list ?? value.urlList ?? value.UrlList;
  return Array.isArray(list) ? list : [];
}

export function resultFromItem(platform, item, { id, url }) {
  const actualId = String(item.id ?? item.aweme_id ?? item.awemeId ?? '');
  if (actualId !== id) fail('content_mismatch', 'The returned item does not match the requested video.');
  requireFreeFullContent(item);
  const video = item.video;
  if (!video || typeof video !== 'object') fail('media_unavailable', 'The item contains no supported video media.');
  // Do not select music.playUrl/play_url: it can be a reusable music excerpt,
  // not the complete audio track of this video and certainly not a full song.
  const values = platform === 'douyin'
    ? [video.play_addr, ...(Array.isArray(video.bit_rate) ? video.bit_rate.map((rate) => rate.play_addr) : [])]
    : [video.playAddr, video.PlayAddrStruct];
  const candidates = [...new Set(values.flatMap(urls).map((value) => checkedMediaUrl(platform, value)).filter(Boolean))];
  if (!candidates.length) fail('media_unavailable', 'No supported HTTPS media address is available.');
  const rawDuration = Number(video.duration);
  const duration = Number.isFinite(rawDuration) && rawDuration > 0
    ? rawDuration / (platform === 'douyin' ? 1000 : 1)
    : null;
  if (!duration) fail('invalid_response', 'The video duration could not be verified.');
  const title = typeof item.desc === 'string' ? item.desc.trim() : '';
  const author = item.author?.nickname ?? item.author?.uniqueId ?? '';
  return {
    sourceId: platform, id, title: title || `Video ${id}`, artist: String(author), duration,
    webpageUrl: url, contentKind: 'video_audio', fullSong: false,
    streams: candidates.map((address) => ({
      url: address, headers: { Referer: platform === 'douyin' ? 'https://www.douyin.com/' : 'https://www.tiktok.com/' },
      containsVideo: true,
    })),
  };
}
