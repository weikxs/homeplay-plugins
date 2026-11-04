import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSearchResponse, SearchResultCollector } from './search-response.mjs';

// Synthetic protocol fixtures only; real-platform evidence is recorded separately.
const id = '1000000000000000001';
const item = (extra = {}) => ({
  id, desc: 'Protocol fixture', author: { uniqueId: 'fixture_author', nickname: 'Fixture' },
  video: { duration: 17, playAddr: 'https://media.example/not-a-saved-stream' },
  privateItem: false, ...extra,
});
const payload = (rows = [item()], extra = {}) => ({ status_code: 0, data: rows, cursor: 12, has_more: 1, ...extra });
const address = (cursor = 0, query = 'music') => `https://www.tiktok.com/api/search/general/full/?keyword=${encodeURIComponent(query)}&cursor=${cursor}`;
const parse = (body, options = {}) => parseSearchResponse('tiktok', body, { requestUrl: address(), query: 'music', ...options });
const code = (expected) => (error) => error.code === expected;

test('normal official rows retain real duration but do not invent playback rights', () => {
  const result = parse(payload());
  assert.equal(result.data[0].duration, 17);
  assert.equal(result.data[0].access, 'unverified');
  assert.equal(result.data[0].contentKind, 'video_audio');
  assert.equal(result.data[0].url, `https://www.tiktok.com/@fixture_author/video/${id}`);
  assert.equal(JSON.stringify(result).includes('playAddr'), false);
  assert.equal(JSON.stringify(result).includes('not-a-saved-stream'), false);
  assert.equal(result.isEnd, false);
  assert.equal(result.nextCursor, 12);
});

test('mixed general search rows ignore users and deduplicate actual video IDs', () => {
  const result = parse(payload([{ type: 1, item: item() }, { type: 2, user: {} }, item()]));
  assert.equal(result.data.length, 1);
});

test('query mismatch cannot turn recommendations into keyword results', () => {
  assert.throws(() => parse(payload(), { requestUrl: address(0, 'other') }), code('search_request_mismatch'));
});

test('only fixed HTTPS official search endpoints are accepted', () => {
  for (const requestUrl of [
    address().replace('www.tiktok.com', 'www.tiktok.com.attacker.example'),
    address().replace('https:', 'http:'),
    address().replace('/api/search/general/full/', '/api/recommend/item_list/'),
    address().replace('www.tiktok.com', 'name:secret@www.tiktok.com'),
  ]) assert.throws(() => parse(payload(), { requestUrl }), code('search_request_mismatch'));
});

test('refused official requests are typed errors, not successful empty pages', () => {
  assert.throws(() => parse(payload([], { status_code: 2483 })), code('search_access_required'));
});

test('server cursor and has_more, not filtered row count, control pagination', () => {
  const result = parse(payload([item({ is_paid: true })]));
  assert.equal(result.data.length, 0);
  assert.equal(result.excludedCount, 1);
  assert.equal(result.isEnd, false);
  assert.equal(result.nextCursor, 12);
});

test('restricted, paid and trial entries are excluded while unknown remains unverified', () => {
  for (const key of ['privateItem', 'secret', 'is_paid', 'is_preview', 'is_trial', 'is_vip', 'forFriend']) {
    assert.equal(parse(payload([item({ [key]: true })])).excludedCount, 1);
  }
  assert.equal(parse(payload([item({ privateItem: undefined })])).data[0].access, 'unverified');
});

test('nonadvancing and malformed cursors fail closed', () => {
  for (const extra of [{ cursor: 0 }, { cursor: 'invalid' }, { cursor: -1 }, { has_more: '1' }, { cursor: null }]) {
    assert.throws(() => parse(payload(undefined, extra)), code('invalid_search_response'));
  }
});

test('a genuine empty terminal page is distinct from a refused or malformed response', () => {
  assert.deepEqual(parse(payload([], { has_more: 0, cursor: 0 })), { data: [], isEnd: true, nextCursor: 0, excludedCount: 0 });
  assert.throws(() => parse({}), code('invalid_search_response'));
  assert.throws(() => parse(payload([{ user: {} }])), code('invalid_search_response'));
});

test('collector advances official cursors and suppresses cross-page duplicates', () => {
  const collector = new SearchResultCollector('tiktok', 'music');
  assert.equal(collector.append(payload(), address()).data.length, 1);
  assert.throws(() => collector.append(payload(), address()), code('search_request_mismatch'));
  const next = item({ id: '1000000000000000002' });
  const result = collector.append(payload([item(), next], { cursor: 24, has_more: 0 }), address(12));
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].id, next.id);
  assert.throws(() => collector.append(payload(), address(24)), code('search_already_ended'));
});

test('Douyin uses official aweme rows and millisecond video duration, never music material duration', () => {
  const row = { aweme_info: {
    aweme_id: id, desc: '协议样本', author: { nickname: '样本作者' },
    video: { duration: 17500 }, music: { duration: 300000, play_url: { uri: 'not-the-video' } },
  } };
  const result = parseSearchResponse('douyin', payload([row]), {
    requestUrl: 'https://www.douyin.com/aweme/v1/web/general/search/single/?keyword=%E9%9F%B3%E4%B9%90&cursor=0',
    query: '音乐',
  });
  assert.equal(result.data[0].duration, 17.5);
  assert.equal(result.data[0].access, 'unverified');
  assert.equal(result.data[0].url, `https://www.douyin.com/video/${id}`);
});
