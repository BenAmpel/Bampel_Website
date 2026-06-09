// Research Command Center — pure logic + browser mount.
// Side-effect-free on import; call mountCommandCenter(root) in the browser.

export function formatAmount(n) {
  const v = Number(n);
  if (!v || Number.isNaN(v)) return '';
  if (v >= 1_000_000) return '$' + (v / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (v >= 1_000) return '$' + Math.round(v / 1_000) + 'K';
  return '$' + v;
}

export function relativeTime(iso, now = new Date()) {
  if (!iso) return '';
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const days = Math.floor((now - then) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return '1 month ago';
  if (months < 12) return `${months} months ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? '1 year ago' : `${years} years ago`;
}
