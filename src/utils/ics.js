import ICAL from '../vendor/ical.min.js';

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


// Fetch all calendars before replacing any displayed data.
export async function fetchIcsSchedules(fetchSource = fetch) {
  return Promise.all(['U', 'N', 'S', 'TC'].map(async (name) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetchSource(`./schedules/${name}.ics`, {
        cache: 'no-store', signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Unable to load ${name}.ics (${response.status})`);
      return { name, days: expandIcsCalendar(await response.text()) };
    } finally {
      clearTimeout(timeout);
    }
  }));
}
