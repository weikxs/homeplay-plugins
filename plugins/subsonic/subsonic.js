// Subsonic: search and play the music on your own Subsonic-compatible server
// (a music server on a NAS, at home or anywhere you run it).
//
// Every request is signed the way the Subsonic API documents: the user name,
// a fresh random salt and md5(password + salt). The password itself is never
// sent, logged or put in an error message.

'use strict';

const CryptoJS = require('crypto-js');

const API_VERSION = '1.16.1';
const CLIENT = 'HomePlay';
const PAGE_SIZE = 30;
const TIMEOUT_MS = 15000;

const SETTINGS = [
  { key: 'server', name: 'Server address', hint: 'http://192.168.0.10:4533' },
  { key: 'username', name: 'User name' },
  { key: 'password', name: 'Password' },
];

// What the Subsonic error codes mean for the user.
const ERRORS = {
  40: 'The server rejected the user name or password.',
  41: 'This account cannot sign in with a token; the server needs a different setting for it.',
  50: 'This account may not do that on the server.',
  70: 'The server did not find it.',
};

/** The user's settings, checked; throws naming the setting to fix. */
function settings() {
  const values = env.getUserVariables();
  const server = (values.server || '').trim();
  let base;
  try {
    base = new URL(server);
  } catch (error) {
    base = null;
  }
  if (!base || (base.protocol !== 'http:' && base.protocol !== 'https:')) {
    throw new Error('Fill in Server address in the plugin settings, such as http://192.168.0.10:4533.');
  }
  if (!(values.username || '').trim()) throw new Error('Fill in User name in the plugin settings.');
  if (!values.password) throw new Error('Fill in Password in the plugin settings.');
  return {
    base: base.origin + base.pathname.replace(/\/+$/, ''),
    host: base.host,
    username: values.username.trim(),
    password: values.password,
  };
}

function salt() {
  let text = '';
  for (let i = 0; i < 12; i++) text += Math.floor(Math.random() * 16).toString(16);
  return text;
}

/** The query parameters that sign one request. */
function auth(account) {
  const s = salt();
  return {
    u: account.username,
    t: CryptoJS.MD5(account.password + s).toString(),
    s: s,
    v: API_VERSION,
    c: CLIENT,
    f: 'json',
  };
}

/** Calls [endpoint] and returns the `subsonic-response` body. */
async function call(account, endpoint, params) {
  let response;
  try {
    response = await axios.get(account.base + '/rest/' + endpoint, {
      params: Object.assign(auth(account), params),
      timeout: TIMEOUT_MS,
    });
  } catch (error) {
    const status = error && error.response && error.response.status;
    throw new Error(
      status
        ? 'The server at ' + account.host + ' answered with status ' + status + '; check the server address.'
        : 'Could not reach the server at ' + account.host + '; check the server address and that the server is on.',
    );
  }
  const body = response.data && response.data['subsonic-response'];
  if (!body || typeof body !== 'object') {
    throw new Error('The address ' + account.host + ' is not a Subsonic server; check the server address.');
  }
  if (body.status !== 'ok') {
    const code = body.error && body.error.code;
    throw new Error(ERRORS[code] || 'The server refused the request.');
  }
  return body;
}

function toItem(song) {
  return {
    id: String(song.id),
    title: song.title || String(song.id),
    artist: song.artist || '',
    album: song.album || '',
    duration: typeof song.duration === 'number' ? song.duration : undefined,
  };
}

function lrcTime(ms) {
  const total = Math.max(0, Math.round(ms / 10));
  const minutes = Math.floor(total / 6000);
  const seconds = Math.floor((total % 6000) / 100);
  const hundredths = total % 100;
  const pad = (n) => (n < 10 ? '0' : '') + n;
  return '[' + pad(minutes) + ':' + pad(seconds) + '.' + pad(hundredths) + ']';
}

/** Synced lyrics from the OpenSubsonic extension, as LRC; null when there are none. */
async function syncedLyric(account, item) {
  let body;
  try {
    body = await call(account, 'getLyricsBySongId', { id: item.id });
  } catch (error) {
    return null; // A server without the extension: try plain lyrics.
  }
  const lyrics = (body.lyricsList && body.lyricsList.structuredLyrics) || [];
  const chosen = lyrics.find((lyric) => lyric.synced) || lyrics[0];
  if (!chosen || !Array.isArray(chosen.line) || chosen.line.length === 0) return null;
  return chosen.line
    .map((line) => (chosen.synced ? lrcTime(line.start || 0) : '') + (line.value || ''))
    .join('\n');
}

module.exports = {
  platform: 'Subsonic',
  version: '1.0.0',
  author: 'HomePlay Plugins',
  srcUrl: 'https://raw.githubusercontent.com/weikxs/homeplay-plugins/main/plugins/subsonic/subsonic.js',
  userVariables: SETTINGS,

  search: async function (query, page) {
    const account = settings();
    const body = await call(account, 'search3', {
      query: query,
      songCount: PAGE_SIZE,
      songOffset: (Math.max(1, page || 1) - 1) * PAGE_SIZE,
      artistCount: 0,
      albumCount: 0,
    });
    const songs = (body.searchResult3 && body.searchResult3.song) || [];
    return { isEnd: songs.length < PAGE_SIZE, data: songs.map(toItem) };
  },

  getMediaSource: async function (item) {
    const account = settings();
    const params = Object.assign(auth(account), { id: item.id });
    const query = Object.keys(params)
      .map((key) => encodeURIComponent(key) + '=' + encodeURIComponent(params[key]))
      .join('&');
    return { url: account.base + '/rest/stream?' + query };
  },

  getLyric: async function (item) {
    const account = settings();
    const synced = await syncedLyric(account, item);
    if (synced) return { rawLrc: synced };
    let body;
    try {
      body = await call(account, 'getLyrics', { artist: item.artist || '', title: item.title || '' });
    } catch (error) {
      return null;
    }
    const text = ((body.lyrics && body.lyrics.value) || '').trim();
    return text ? { rawLrc: text } : null;
  },
};
