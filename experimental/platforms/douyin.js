'use strict';

// Development source: official guest search may require manual verification.
// No login automation or fabricated access flags; playback remains fail-closed.
const media = typeof env !== 'undefined' && env && env.media;
const unavailable = async function () {
  const error = new Error('This experimental plugin requires a host with the media source bridge. Use a compatible, configured build.');
  error.code = 'extractor_unavailable';
  throw error;
};
module.exports = Object.assign({
  platform: 'Douyin',
  version: '0.1.1-dev',
  experimental: true,
  requiredCapabilities: ['media.source'],
  author: 'HomePlay Plugins',
  srcUrl: 'https://raw.githubusercontent.com/weikxs/homeplay-plugins/main/experimental/platforms/douyin.js',
}, media && typeof media.source === 'function' ? media.source('douyin') : {
  search: unavailable, getMediaSource: unavailable, importMusicItem: unavailable,
});
