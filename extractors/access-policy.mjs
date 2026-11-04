import { fail } from './errors.mjs';

const PAID = ['is_paid', 'isPaid', 'is_pay', 'isPay', 'is_vip', 'isVip', 'vip_only', 'subscriber_only'];
const PREVIEW = ['is_preview', 'isPreview', 'is_trial', 'isTrial', 'trial_only', 'preview_only'];
const PRIVATE = ['privateItem', 'secret', 'is_private', 'isPrivate', 'isProhibited', 'takeDown', 'forFriend'];
const PAY_OBJECTS = ['pay_info', 'payment_info', 'paidContentInfo', 'series', 'series_info'];

function flag(value) {
  if (value === true || value === 1 || value === '1') return true;
  if (value === false || value === 0 || value === '0') return false;
  return null;
}

function inspect(nodes, fields) {
  let knownFalse = false;
  let unknown = false;
  for (const node of nodes) {
    for (const field of fields) {
      if (!Object.prototype.hasOwnProperty.call(node, field)) continue;
      const value = flag(node[field]);
      if (value === true) return 'restricted';
      if (value === false) knownFalse = true;
      else unknown = true;
    }
  }
  return unknown ? 'unknown' : knownFalse ? 'clear' : 'missing';
}

/**
 * Fail closed: missing price/preview evidence is not proof of free full playback.
 * These aliases are a conservative input contract, not a claim that each platform
 * always supplies them. Real payloads without sufficient evidence remain blocked.
 */
export function requireFreeFullContent(item) {
  const nodes = [item, item.video, item.status].filter((node) => node && typeof node === 'object');
  const privateState = inspect(nodes, PRIVATE);
  if (privateState === 'restricted') fail('content_restricted', 'Private or restricted content is excluded.');
  const paid = inspect(nodes, PAID);
  const preview = inspect(nodes, PREVIEW);
  const availability = item.availability;
  if (['premium_only', 'subscriber_only', 'needs_auth', 'private'].includes(availability)) {
    fail('content_restricted', 'Paid, subscriber-only or authenticated content is excluded.');
  }
  if (availability != null && availability !== 'public' && availability !== 'unlisted') {
    fail('access_unverified', 'The content availability value is not verified.');
  }
  if (paid === 'restricted') fail('paid_content', 'VIP, paid and subscription-only content is excluded.');
  if (preview === 'restricted') fail('preview_content', 'Preview and trial content is excluded.');
  // Uninterpreted entitlement objects must never silently turn into "free".
  if (nodes.some((node) => PAY_OBJECTS.some((key) => node[key] != null))) {
    fail('access_unverified', 'The content entitlement information is not verified.');
  }
  if ((privateState !== 'clear' && availability !== 'public') || privateState === 'unknown' || paid !== 'clear' || preview !== 'clear') {
    fail('access_unverified', 'Free, full-length access could not be verified; automatic playback is excluded.');
  }
}
