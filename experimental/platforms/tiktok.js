'use strict';

// Development source: keyword search needs the opt-in official guest bridge.
// Playback still requires fresh, independently verified full-access evidence.
const media = typeof env !== 'undefined' && env && env.media;
const unavailable = async function () {
  const error = new Error('This experimental plugin requires a host with the media source bridge. Use a compatible, configured build.');
  error.code = 'extractor_unavailable';
  throw error;
};
module.exports = Object.assign({
  platform: 'TikTok',
  version: '0.1.1-dev',
  experimental: true,
  requiredCapabilities: ['media.source'],
  author: 'HomePlay Plugins',
  srcUrl: 'https://raw.githubusercontent.com/weikxs/homeplay-plugins/main/experimental/platforms/tiktok.js',
}, media && typeof media.source === 'function' ? media.source('tiktok') : {
  search: unavailable, getMediaSource: unavailable, importMusicItem: unavailable,
});
