import { parseHHMM } from '../utils/time.js';

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
