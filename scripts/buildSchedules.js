import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ICAL from 'ical.js';

const timezone = 'Europe/Helsinki';
const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: timezone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: timezone,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function localDateKey(date) {
  const parts = Object.fromEntries(dateFormatter.formatToParts(date)
    .filter((part) => part.type !== 'literal')
    .map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function localTime(date) {
  return timeFormatter.format(date);
}

function getHorizonDate() {
  const today = localDateKey(new Date()).split('-').map(Number);
  return new Date(Date.UTC(today[0], today[1] - 1, today[2] + 400, 23, 59, 59));
}

export function expandIcsCalendar(source, throughDate = getHorizonDate()) {
  const root = new ICAL.Component(ICAL.parse(source));
  const calendar = {};

  root.getAllSubcomponents('vevent').forEach((component) => {
    const event = new ICAL.Event(component);
    const iterator = event.iterator();
    let occurrence;

    while ((occurrence = iterator.next())) {
      const details = event.getOccurrenceDetails(occurrence);
      const start = details.startDate.toJSDate();
      if (start > throughDate) break;

      const end = details.endDate.toJSDate();
      const date = localDateKey(start);
      calendar[date] ||= [];
      calendar[date].push({
        start: localTime(start),
        end: localTime(end),
        title: details.item.summary || 'Untitled event',
        location: details.item.location || '',
      });
    }
  });

  Object.values(calendar).forEach((events) => {
    events.sort((first, second) => first.start.localeCompare(second.start) || first.end.localeCompare(second.end));
  });

  return calendar;
}

export async function buildSchedules() {
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const children = {};

  for (const child of ['U', 'N', 'TC']) {
    const source = await readFile(resolve(projectRoot, `schedules/${child}.ics`), 'utf8');
    children[child] = expandIcsCalendar(source);
  }

  const output = { timezone, generatedAt: new Date().toISOString(), children };
  await writeFile(resolve(projectRoot, 'data/schedules/calendar.json'), `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Generated schedules for U (${Object.keys(children.U).length} dates), N (${Object.keys(children.N).length} dates), and TC (${Object.keys(children.TC).length} dates).`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildSchedules();
}