export function parseHHMM(value = '00:00') {
  const [hours = '0', minutes = '0'] = String(value).split(':');
  return Number(hours) * 60 + Number(minutes);
}

export function formatHHMM(date = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Helsinki',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatHHMMSS(date = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Helsinki',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatDateLong(date = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Helsinki',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function getWeekdayKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Helsinki',
    weekday: 'long',
  }).format(date).toLowerCase();
}

export function formatCountdown(minutes) {
  if (minutes == null || Number.isNaN(minutes)) return '—';
  if (minutes <= 0) return 'Now';
  return `${Math.max(0, Math.round(minutes))} min`;
}

export function formatRelativeTimeFromNow(date) {
  const now = new Date();
  const diffMinutes = (new Date(date) - now) / 60000;
  return formatCountdown(diffMinutes);
}

export function formatPrice(value, digits = 1) {
  return `${Number(value).toFixed(digits)} c/kWh`;
}
