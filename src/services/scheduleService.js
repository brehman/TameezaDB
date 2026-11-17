import { parseHHMM } from '../utils/time.js';

export function getUpcomingCalendarEvents(scheduleDays = {}, currentDate = new Date(), limit = Infinity) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Helsinki',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(currentDate))
    .filter((part) => part.type !== 'literal')
    .map((part) => [part.type, part.value]));
  const currentKey = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;

  return Object.entries(scheduleDays)
    .flatMap(([date, events]) => events.map((event) => ({ date, ...event })))
    .filter((event) => `${event.date}T${event.start}` > currentKey)
    .sort((first, second) => `${first.date}T${first.start}`.localeCompare(`${second.date}T${second.start}`))
    .slice(0, limit);
}

export function getUpcomingCalendarEvent(scheduleDays = {}, currentDate = new Date()) {
  return getUpcomingCalendarEvents(scheduleDays, currentDate, 1)[0] || null;
}

export function resolveCurrentScheduleState(daySchedule = {}, currentTime = '00:00', weekdayKey = 'monday') {
  const entries = Array.isArray(daySchedule)
    ? daySchedule
    : (daySchedule[weekdayKey] || daySchedule.monday || []);

  const nowMinutes = parseHHMM(currentTime);

  const current = entries
    .filter((item) => {
      const startMinutes = parseHHMM(item.start);
      const endMinutes = parseHHMM(item.end);
      if (startMinutes <= endMinutes) {
        return nowMinutes >= startMinutes && nowMinutes < endMinutes;
      }
      return nowMinutes >= startMinutes || nowMinutes < endMinutes;
    })
    .sort((a, b) => parseHHMM(a.start) - parseHHMM(b.start))[0] || null;

  const upcoming = entries
    .filter((item) => parseHHMM(item.start) > nowMinutes)
    .sort((a, b) => parseHHMM(a.start) - parseHHMM(b.start))[0] || null;

  const status = current ? 'Now' : upcoming ? 'Upcoming' : entries.length ? 'Completed' : 'No activity';

  return {
    current,
    next: upcoming,
    status,
    entries,
  };
}

// Calendar visibility follows Helsinki time, regardless of the player's timezone.
export function getScheduleDateWindow(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Helsinki', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(now)).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  const tomorrow = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + 1)).toISOString().slice(0, 10);
  const showTomorrow = Number(parts.hour) >= 13;
  return { today, tomorrow, showTomorrow, maxDate: showTomorrow ? tomorrow : today };
}
