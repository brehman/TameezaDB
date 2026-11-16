import ICAL from '../../node_modules/ical.js/dist/ical.js';

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
        start: timeFormatter.format(start),
        end: timeFormatter.format(end),
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

export function buildScheduleCalendar(sources, throughDate) {
  return Object.fromEntries(
    ['U', 'N', 'S', 'TC'].map((name) => {
      if (typeof sources[name] !== 'string') throw new Error(`Missing ${name}.ics calendar.`);
      return [name, expandIcsCalendar(sources[name], throughDate)];
    })
  );
}