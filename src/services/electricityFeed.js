export const ELECTRICITY_API = 'https://api.porssisahko.net/v2/latest-prices.json';

export function helsinkiDate(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Helsinki', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(date)).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function parseElectricityApi(payload, now = new Date()) {
  if (!Array.isArray(payload?.prices) || !payload.prices.length) throw new Error('Empty electricity feed');
  const intervals = payload.prices.map((entry) => {
    const start = new Date(entry.startDate);
    const end = new Date(entry.endDate);
    // The API uses inclusive ends (xx:14:59.999); internally use exclusive ends.
    if (end.getUTCMilliseconds() === 999) end.setTime(end.getTime() + 1);
    if (typeof entry.price !== 'number' || !Number.isFinite(entry.price)
      || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
      throw new Error('Invalid electricity interval');
    }
    return { start: start.toISOString(), end: end.toISOString(), value: entry.price };
  }).sort((a, b) => a.start.localeCompare(b.start));
  for (let index = 1; index < intervals.length; index += 1) {
    if (intervals[index].start < intervals[index - 1].end) throw new Error('Overlapping electricity intervals');
  }
  if (!intervals.some((entry) => new Date(entry.start) <= now && now < new Date(entry.end))) {
    throw new Error('Electricity feed has no price for the current time');
  }
  return {
    schemaVersion: 2, country: 'FI', timezone: 'Europe/Helsinki', source: ELECTRICITY_API,
    fetchedAt: new Date(now).toISOString(), currency: 'cents/kWh', includesVat: true,
    intervals,
  };
}

// Aggregate complete hours only; missing quarters must not become an hourly price.
export function aggregateHourlyPrices(intervals = []) {
  const groups = new Map();
  for (const interval of intervals) {
    const start = new Date(interval.start).getTime();
    const hour = Math.floor(start / 3600000) * 3600000;
    if (!groups.has(hour)) groups.set(hour, []);
    groups.get(hour).push(interval);
  }
  return [...groups.entries()].sort(([a], [b]) => a - b).flatMap(([hour, entries]) => {
    entries.sort((a, b) => new Date(a.start) - new Date(b.start));
    let cursor = hour;
    let weightedPrice = 0;
    for (const entry of entries) {
      const start = new Date(entry.start).getTime();
      const end = new Date(entry.end).getTime();
      if (start !== cursor || end <= start || end > hour + 3600000 || !Number.isFinite(entry.value)) return [];
      weightedPrice += entry.value * (end - start);
      cursor = end;
    }
    return cursor === hour + 3600000 ? [{
      start: new Date(hour).toISOString(), end: new Date(cursor).toISOString(), value: weightedPrice / 3600000,
    }] : [];
  });
}

export function selectElectricityDays(feed = {}, now = new Date()) {
  // Legacy scraped prices have an unknown tax basis and must not be displayed.
  const intervals = feed.schemaVersion === 2 && feed.includesVat === true ? feed.intervals || [] : [];
  const today = helsinkiDate(now);
  const tomorrow = helsinkiDate(new Date(`${today}T12:00:00Z`).getTime() + 86400000);
  return {
    ...feed,
    intervals: intervals.filter((entry) => helsinkiDate(entry.start) === today),
    tomorrowIntervals: intervals.filter((entry) => helsinkiDate(entry.start) === tomorrow),
    date: today, tomorrowDate: tomorrow,
  };
}

export async function fetchElectricityFeed(fallbackUrl, previous = null, fetchSource = fetch) {
  async function request(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetchSource(url, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error(`Electricity request failed: ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }
  try {
    const saved = await request(fallbackUrl);
    if (saved.schemaVersion !== 2 || saved.includesVat !== true) throw new Error('Unknown electricity tax basis');
    // Revalidate timestamps and values; preserve the actual retrieval time.
    const validated = parseElectricityApi({ prices: saved.intervals.map((entry) => ({
      startDate: entry.start, endDate: entry.end, price: entry.value,
    })) });
    if (previous?.fetchedAt && previous.fetchedAt > saved.fetchedAt) return previous;
    return { ...validated, fetchedAt: saved.fetchedAt };
  } catch (error) {
    console.warn('Saved electricity prices unavailable; keeping last known feed.', error);
    return previous;
  }
}
