import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';

const sourceUrl = 'https://xn--prssishk-5za8oi.net/';
const timezone = 'Europe/Helsinki';
const localDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: timezone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function parsePageDate($, page) {
  const dateText = page.find('p').toArray()
    .map((element) => $(element).text())
    .find((text) => /\b\d{1,2}\.\d{1,2}\.\d{4}\b/.test(text));
  const match = dateText?.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/);
  if (!match) throw new Error('Could not find the price date in the source page.');

  return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
}

function addOneDay(date) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

function helsinkiTimeToIso(date, time) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const targetUtc = Date.UTC(year, month - 1, day, hour, minute);
  let timestamp = targetUtc;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = Object.fromEntries(
      localDateFormatter.formatToParts(new Date(timestamp))
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, Number(part.value)])
    );
    const representedUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
    const correction = targetUtc - representedUtc;
    timestamp += correction;
    if (correction === 0) break;
  }

  return new Date(timestamp).toISOString();
}

function parsePricePeriod($, id, required) {
  const page = $(`#${id}`);
  if (!page.length) {
    if (required) throw new Error(`The source page no longer contains the ${id} price table.`);
    return { date: null, intervals: [] };
  }

  const intervals = page.find('table tbody tr').toArray().map((row) => {
    const cells = $(row).find('td');
    const times = $(cells[0]).text().trim().match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
    const valueText = $(cells[1]).text().trim().match(/-?\d+(?:[,.]\d+)?/);
    if (!times || !valueText) return null;

    const [startTime, endTime] = times.slice(1);
    return { startTime, endTime, value: Number(valueText[0].replace(',', '.')) };
  }).filter(Boolean);

  if (intervals.length < 20) {
    if (required) throw new Error(`Expected a full day's hourly prices, but found ${intervals.length} intervals.`);
    return { date: null, intervals: [] };
  }

  const date = parsePageDate($, page);
  return {
    date,
    intervals: intervals.map(({ startTime, endTime, value }) => {
    const endDate = endTime <= startTime ? addOneDay(date) : date;
    return {
      start: helsinkiTimeToIso(date, startTime),
      end: helsinkiTimeToIso(endDate, endTime),
      value,
    };
    }),
  };
}

export function parsePorssisahkoHtml(html) {
  const $ = load(html);
  const today = parsePricePeriod($, 'today', true);
  const tomorrow = parsePricePeriod($, 'tomorrow', false);

  return {
    country: 'FI',
    timezone,
    source: sourceUrl,
    date: today.date,
    intervals: today.intervals,
    tomorrowDate: tomorrow.date,
    tomorrowIntervals: tomorrow.intervals,
  };
}

export async function updateElectricityPrices() {
  const response = await fetch(sourceUrl, {
    headers: { accept: 'text/html' },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Electricity source returned HTTP ${response.status}.`);

  const data = parsePorssisahkoHtml(await response.text());
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const outputPath = resolve(projectRoot, 'data/electricity/fi-prices.json');
  await writeFile(outputPath, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`Updated ${data.intervals.length} today and ${data.tomorrowIntervals.length} tomorrow Finnish hourly prices from ${data.source}.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await updateElectricityPrices();
}