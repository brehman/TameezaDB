import test from 'node:test';
import assert from 'node:assert/strict';

import { getDailyCodeForDate, loadCodes } from '../src/services/dailyCodeService.js';
import { getUpcomingCalendarEvent, getUpcomingCalendarEvents, resolveCurrentScheduleState } from '../src/services/scheduleService.js';
import { getCurrentInterval, getElectricityBarColor, getElectricityBarHeight, getPriceColor, getPriceLevel, isCurrentElectricityInterval, normalizeElectricityData, shouldShowTomorrowElectricity } from '../src/services/electricityService.js';
import { getDepartureMinutesUntil, getSortedDepartures } from '../src/services/transportService.js';
import { getHourlyForecastFromCurrentHour, getThemeForSunPosition, normalizeWeatherData } from '../src/services/weatherService.js';
import { expandIcsCalendar } from '../scripts/buildSchedules.js';
import { parseElectricityApi, selectElectricityDays, fetchElectricityFeed } from '../src/services/electricityFeed.js';

const sampleCodes = ['CODE-001', 'CODE-002', 'CODE-003'];

const sampleSchedule = {
  monday: [
    { start: '07:00', end: '08:00', title: 'Breakfast' },
    { start: '08:00', end: '16:00', title: 'School' },
    { start: '18:00', end: '19:00', title: 'Dinner' }
  ]
};

test('daily code rotates deterministically from the configured start date', () => {
  const code = getDailyCodeForDate(sampleCodes, '2026-11-16', '2026-11-15');
  assert.equal(code, 'CODE-002');
});

test('daily code list ignores blank and comment lines', () => {
  const result = loadCodes(['# comment', '', 'CODE-10', '  CODE-11  ']);
  assert.deepEqual(result, ['CODE-10', 'CODE-11']);
});

test('schedule state identifies the current activity correctly', () => {
  const state = resolveCurrentScheduleState(sampleSchedule, '08:30', 'monday');
  assert.equal(state.current.title, 'School');
  assert.equal(state.status, 'Now');
});

test('upcoming calendar event selects the next TC event using Helsinki time', () => {
  const upcoming = getUpcomingCalendarEvent({
    '2026-11-16': [
      { start: '08:00', end: '09:00', title: 'Past event' },
      { start: '18:30', end: '19:00', title: 'Today event' },
    ],
    '2026-11-17': [{ start: '07:30', end: '08:00', title: 'Tomorrow event' }],
  }, '2026-11-16T17:00:00+02:00');

  assert.equal(upcoming.title, 'Today event');
  assert.equal(upcoming.date, '2026-11-16');
});

test('upcoming calendar list returns the next TC events in chronological order', () => {
  const events = getUpcomingCalendarEvents({
    '2026-11-18': [{ start: '12:00', end: '13:00', title: 'Third' }],
    '2026-11-17': [{ start: '14:00', end: '15:00', title: 'Second' }, { start: '09:00', end: '10:00', title: 'First' }],
  }, '2026-11-16T17:00:00+02:00', 2);

  assert.deepEqual(events.map((event) => event.title), ['First', 'Second']);
});

test('weather normalization exposes a seven-day forecast with daily conditions', () => {
  const dates = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'];
  const weather = normalizeWeatherData({
    daily: {
      time: dates,
      weather_code: [0, 3, 61, 71, 2, 45, 95],
      temperature_2m_min: [1, 2, 3, 4, 5, 6, 7],
      temperature_2m_max: [8, 9, 10, 11, 12, 13, 14],
    },
  });

  assert.equal(weather.daily.forecast.length, 7);
  assert.equal(weather.daily.forecast[3].date, '2026-11-19');
  assert.equal(weather.daily.forecast[3].description.label, 'Slight snow');
  assert.equal(weather.daily.forecast[3].temperatureMin, 4);
  assert.equal(weather.daily.forecast[3].temperatureMax, 11);
});

test('summary hourly forecast starts at the current Helsinki hour and shows five hours', () => {
  const hourly = [
    ...Array.from({ length: 24 }, (_, hour) => ({ time: `2026-11-16T${String(hour).padStart(2, '0')}:00` })),
    ...Array.from({ length: 24 }, (_, hour) => ({ time: `2026-11-17T${String(hour).padStart(2, '0')}:00` })),
  ];
  const selected = getHourlyForecastFromCurrentHour(hourly, '2026-11-16T17:42:00+02:00');

  assert.equal(selected.length, 5);
  assert.deepEqual(selected.map((hour) => hour.time), [
    '2026-11-16T17:00',
    '2026-11-16T18:00',
    '2026-11-16T19:00',
    '2026-11-16T20:00',
    '2026-11-16T21:00',
  ]);
});

test('summary hourly forecast crosses Helsinki midnight while retaining five hours', () => {
  const hourly = [
    ...Array.from({ length: 24 }, (_, hour) => ({ time: `2026-11-16T${String(hour).padStart(2, '0')}:00` })),
    ...Array.from({ length: 24 }, (_, hour) => ({ time: `2026-11-17T${String(hour).padStart(2, '0')}:00` })),
  ];
  const selected = getHourlyForecastFromCurrentHour(hourly, '2026-11-16T22:24:00+02:00');

  assert.equal(selected.length, 5);
  assert.equal(selected[0].time, '2026-11-16T22:00');
  assert.equal(selected.at(-1).time, '2026-11-17T02:00');
});

test('theme switches between dark at night and light during daylight', () => {
  const sunrise = '2026-11-16T08:00:00+02:00';
  const sunset = '2026-11-16T16:00:00+02:00';

  assert.equal(getThemeForSunPosition('2026-11-16T07:59:00+02:00', sunrise, sunset), 'dark');
  assert.equal(getThemeForSunPosition('2026-11-16T08:00:00+02:00', sunrise, sunset), 'light');
  assert.equal(getThemeForSunPosition('2026-11-16T15:59:00+02:00', sunrise, sunset), 'light');
  assert.equal(getThemeForSunPosition('2026-11-16T16:00:00+02:00', sunrise, sunset), 'dark');
  assert.equal(getThemeForSunPosition('2026-11-16T12:00:00+02:00', null, null), 'light');
});

test('ICS schedules expand weekly events and skip excluded dates', () => {
  const calendar = `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:class\nDTSTART;TZID=Europe/Helsinki:20261116T090000\nDTEND;TZID=Europe/Helsinki:20261116T100000\nRRULE:FREQ=WEEKLY;UNTIL=20261130T100000\nEXDATE;TZID=Europe/Helsinki:20261123T090000\nSUMMARY:Class\nLOCATION:Room 1\nEND:VEVENT\nEND:VCALENDAR`;
  const result = expandIcsCalendar(calendar, new Date('2026-12-01T00:00:00Z'));

  assert.deepEqual(Object.keys(result).sort(), ['2026-11-16', '2026-11-30']);
  assert.equal(result['2026-11-16'][0].start, '09:00');
  assert.equal(result['2026-11-16'][0].end, '10:00');
  assert.equal(result['2026-11-16'][0].location, 'Room 1');
});

test('HSL departures are globally sorted and limited per stop', () => {
  const now = new Date('2026-11-16T14:00:00Z');
  const nowSeconds = now.getTime() / 1000;
  const departures = getSortedDepartures([
    { key: 'first', departures: [{ timestamp: nowSeconds + 300, route: 'A' }, { timestamp: nowSeconds + 600, route: 'B' }, { timestamp: nowSeconds + 900, route: 'C' }] },
    { key: 'second', departures: [{ timestamp: nowSeconds + 200, route: 'D' }, { timestamp: nowSeconds + 400, route: 'E' }] },
  ], 2, now);

  assert.deepEqual(departures.map((item) => item.timestamp), [nowSeconds + 200, nowSeconds + 300, nowSeconds + 400, nowSeconds + 600]);
});

test('HSL departure list can be capped to the six earliest eligible trips overall', () => {
  const now = new Date('2026-11-16T14:00:00Z');
  const nowSeconds = now.getTime() / 1000;
  const routes = Array.from({ length: 4 }, (_, routeIndex) => ({
    key: `stop${routeIndex}`,
    departures: Array.from({ length: 4 }, (_, departureIndex) => ({
      timestamp: nowSeconds + (routeIndex * 4 + departureIndex + 1) * 60,
      route: `${routeIndex}-${departureIndex}`,
    })),
  }));

  const departures = getSortedDepartures(routes, 6, now, 6);
  assert.equal(departures.length, 6);
  assert.deepEqual(departures.map((item) => item.timestamp), Array.from({ length: 6 }, (_, index) => nowSeconds + (index + 1) * 60));
});

test('HSL departures respect each stop minimum lead time', () => {
  const now = new Date('2026-11-16T14:00:00Z');
  const nowSeconds = now.getTime() / 1000;
  const routes = [
    { key: 'kavallinmaki', departures: [{ timestamp: nowSeconds + 6 * 60 }, { timestamp: nowSeconds + 7 * 60 }] },
    { key: 'viherlaaksonTori', departures: [{ timestamp: nowSeconds + 7 * 60 }] },
    { key: 'kauniainen', departures: [{ timestamp: nowSeconds + 9 * 60 }, { timestamp: nowSeconds + 10 * 60 }] },
    { key: 'leppavaara', departures: [{ timestamp: nowSeconds + 14 * 60 }, { timestamp: nowSeconds + 15 * 60 }] },
  ];

  assert.deepEqual(getSortedDepartures(routes, 2, now).map((departure) => departure.timestamp), [
    nowSeconds + 7 * 60,
    nowSeconds + 7 * 60,
    nowSeconds + 10 * 60,
    nowSeconds + 15 * 60,
  ]);
});

test('departure countdown rounds remaining time up to the next whole minute', () => {
  const now = new Date('2026-11-16T14:00:00Z');
  const timestamp = now.getTime() / 1000;

  assert.equal(getDepartureMinutesUntil(timestamp + 60, now), 1);
  assert.equal(getDepartureMinutesUntil(timestamp + 61, now), 2);
  assert.equal(getDepartureMinutesUntil(timestamp - 1, now), 0);
});

test('electricity intervals are normalized and current interval is selected', () => {
  const normalized = normalizeElectricityData([
    { start: '2026-11-16T00:00:00+02:00', end: '2026-11-16T00:15:00+02:00', value: 10 },
    { start: '2026-11-16T00:15:00+02:00', end: '2026-11-16T00:30:00+02:00', value: -2 },
    { start: '2026-11-16T00:30:00+02:00', end: '2026-11-16T00:45:00+02:00', value: 20 }
  ]);
  const active = getCurrentInterval(normalized, '2026-11-16T00:18:00+02:00');
  assert.equal(active.value, -2);
  assert.equal(getPriceColor(18, 10, 20), 'warning');
});

test('only the electricity interval containing the current time is highlighted', () => {
  const currentTime = '2026-11-16T00:18:00+02:00';
  assert.equal(isCurrentElectricityInterval({ start: '2026-11-16T00:15:00+02:00', end: '2026-11-16T00:30:00+02:00' }, currentTime), true);
  assert.equal(isCurrentElectricityInterval({ start: '2026-11-16T00:00:00+02:00', end: '2026-11-16T00:15:00+02:00' }, currentTime), false);
});

test('electricity bars scale with the actual price range so low and high prices do not render at the same height', () => {
  const values = [10.9, 16.1, 25.4];
  const lowest = getElectricityBarHeight(10.9, values);
  const middle = getElectricityBarHeight(16.1, values);
  const highest = getElectricityBarHeight(25.4, values);

  assert.ok(lowest < middle);
  assert.ok(middle < highest);
  assert.equal(highest, 100);
});

test('electricity bar colors follow the configured price bands', () => {
  assert.equal(getElectricityBarColor(-1), 'blue');
  assert.equal(getElectricityBarColor(0), 'blue');
  assert.equal(getElectricityBarColor(4.9), 'green');
  assert.equal(getElectricityBarColor(5), 'orange');
  assert.equal(getElectricityBarColor(15), 'orange');
  assert.equal(getElectricityBarColor(15.1), 'bright-red');
  assert.equal(getElectricityBarColor(25), 'bright-red');
  assert.equal(getElectricityBarColor(25.1), 'dark-red');
  assert.equal(getElectricityBarColor(35), 'dark-red');
  assert.equal(getElectricityBarColor(35.1), 'maroon');
});

test('electricity summary levels classify prices from extremely low to very high', () => {
  assert.equal(getPriceLevel(-0.1), 'extremely low');
  assert.equal(getPriceLevel(0), 'extremely low');
  assert.equal(getPriceLevel(4.99), 'low');
  assert.equal(getPriceLevel(5), 'medium');
  assert.equal(getPriceLevel(15), 'medium');
  assert.equal(getPriceLevel(15.01), 'high');
  assert.equal(getPriceLevel(25), 'high');
  assert.equal(getPriceLevel(25.01), 'very high');
});

const pricePayload = { prices: [
  { startDate: '2026-11-17T22:00:00Z', endDate: '2026-11-17T22:15:00Z', price: -1.25 },
  { startDate: '2026-11-17T21:45:00Z', endDate: '2026-11-17T22:00:00Z', price: 12.345 },
] };

test('structured feed preserves VAT-inclusive quarter-hour prices and chronological order', () => {
  const feed = parseElectricityApi(pricePayload, new Date('2026-11-17T21:50:00Z'));
  assert.equal(feed.includesVat, true);
  assert.equal(feed.intervals[0].value, 12.345);
  assert.equal(feed.intervals[1].value, -1.25);
  assert.equal(feed.fetchedAt, '2026-11-17T21:50:00.000Z');
});

test('current interval never falls back to a past or future price', () => {
  const feed = parseElectricityApi(pricePayload, new Date('2026-11-17T21:50:00Z'));
  assert.equal(getCurrentInterval(feed.intervals, '2026-11-17T21:44:59Z'), null);
  assert.equal(getCurrentInterval(feed.intervals, '2026-11-17T22:15:00Z'), null);
  assert.equal(getCurrentInterval(feed.intervals, '2026-11-17T22:00:00Z').value, -1.25);
});

test('Helsinki midnight rolls tomorrow prices into today without fetching', () => {
  const feed = parseElectricityApi(pricePayload, new Date('2026-11-17T21:50:00Z'));
  const before = selectElectricityDays(feed, '2026-11-17T21:59:59Z');
  const after = selectElectricityDays(feed, '2026-11-17T22:00:00Z');
  assert.equal(before.intervals[0].value, 12.345);
  assert.equal(before.tomorrowIntervals[0].value, -1.25);
  assert.equal(after.intervals[0].value, -1.25);
  assert.equal(after.tomorrowIntervals.length, 0);
  assert.equal(selectElectricityDays(feed, '2026-11-19T00:00:00Z').intervals.length, 0);
  assert.equal(selectElectricityDays({ intervals: feed.intervals }, '2026-11-17T21:50:00Z').intervals.length, 0);
});

test('structured feed rejects expired, malformed, and overlapping prices', () => {
  const now = new Date('2026-11-17T21:50:00Z');
  assert.throws(() => parseElectricityApi(pricePayload, new Date('2026-11-19T00:00:00Z')), /current time/);
  assert.throws(() => parseElectricityApi({ prices: [{ ...pricePayload.prices[1], price: null }] }, now), /Invalid/);
  assert.throws(() => parseElectricityApi({ prices: [pricePayload.prices[1], pricePayload.prices[1]] }, now), /Overlapping/);
});

test('network failures preserve the previous feed, and expired prices remain unavailable', async () => {
  const previous = parseElectricityApi(pricePayload, new Date('2026-11-17T21:50:00Z'));
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const result = await fetchElectricityFeed('./saved.json', previous, async () => { throw new Error('offline'); });
    assert.equal(result, previous);
    assert.equal(getCurrentInterval(result.intervals, '2026-11-19T00:00:00Z'), null);
  } finally {
    console.warn = originalWarn;
  }
});

test('tomorrow electricity chart is visible from 13:00 Helsinki time when prices are available', () => {
  const electricityData = {
    intervals: [{ value: 10 }],
    tomorrowIntervals: [{ value: 20 }],
  };

  assert.equal(shouldShowTomorrowElectricity(electricityData, '2026-11-16T10:59:00Z'), false);
  assert.equal(shouldShowTomorrowElectricity(electricityData, '2026-11-16T11:00:00Z'), true);
  assert.equal(shouldShowTomorrowElectricity({ intervals: electricityData.intervals }, '2026-11-16T12:00:00Z'), false);
});


test('ICS refresh fetches all four source files without cache and expands events', async () => {
  const { fetchIcsSchedules } = await import('../src/utils/ics.js');
  const calls = [];
  const calendars = await fetchIcsSchedules(async (url, options) => {
    calls.push(url);
    assert.equal(options.cache, 'no-store');
    assert.ok(options.signal);
    return { ok: true, text: async () => 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:refresh-test\r\nDTSTART:20261117T080000Z\r\nDTEND:20261117T090000Z\r\nSUMMARY:Updated event\r\nEND:VEVENT\r\nEND:VCALENDAR' };
  });
  assert.deepEqual(calls, ['U', 'N', 'S', 'TC'].map((name) => `./schedules/${name}.ics`));
  assert.deepEqual(calendars.map((item) => item.name), ['U', 'N', 'S', 'TC']);
  assert.equal(calendars[0].days['2026-11-17'][0].start, '10:00');
  assert.equal(calendars[0].days['2026-11-17'][0].title, 'Updated event');
});

test('ICS refresh rejects a missing calendar instead of returning partial schedules', async () => {
  const { fetchIcsSchedules } = await import('../src/utils/ics.js');
  await assert.rejects(fetchIcsSchedules(async () => ({ ok: false, status: 404 })), /Unable to load.*404/);
});

test('weather graphics cover every condition using font-independent SVG', async () => {
  const { mapWeatherCode } = await import('../src/services/weatherService.js');
  for (const code of [0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99, -1]) {
    const { icon } = mapWeatherCode(code);
    assert.match(icon, /^<svg /);
    assert.match(icon, /viewBox="0 0 64 64"/);
    assert.doesNotMatch(icon, /<text|<image|<script|http/);
  }
});


test('saved API feed retains its fetch time and does not add VAT again', async () => {
  const now = new Date();
  const start = new Date(now.getTime() - 60000).toISOString();
  const end = new Date(now.getTime() + 840000).toISOString();
  const saved = parseElectricityApi({ prices: [{ startDate: start, endDate: end, price: 12.55 }] }, now);
  const result = await fetchElectricityFeed('./saved.json', null, async (url) => {
    assert.equal(url, './saved.json');
    return { ok: true, json: async () => saved };
  });
  assert.equal(result.intervals[0].value, 12.55);
  assert.equal(result.fetchedAt, saved.fetchedAt);
  assert.equal(result.includesVat, true);
});

test('API inclusive end timestamps become continuous exclusive intervals', () => {
  const feed = parseElectricityApi({ prices: [
    { startDate: '2026-11-17T10:00:00Z', endDate: '2026-11-17T10:14:59.999Z', price: 5 },
    { startDate: '2026-11-17T10:15:00Z', endDate: '2026-11-17T10:29:59.999Z', price: 6 },
  ] }, new Date('2026-11-17T10:14:59.999Z'));
  assert.equal(getCurrentInterval(feed.intervals, '2026-11-17T10:14:59.999Z').value, 5);
  assert.equal(getCurrentInterval(feed.intervals, '2026-11-17T10:15:00Z').value, 6);
});

test('hourly electricity averages four quarters and rejects incomplete hours', async () => {
  const { aggregateHourlyPrices } = await import('../src/services/electricityFeed.js');
  const quarters = [4, 8, -4, 12].map((value, index) => ({
    start: new Date(Date.UTC(2026, 10, 17, 8, index * 15)).toISOString(),
    end: new Date(Date.UTC(2026, 10, 17, 8, (index + 1) * 15)).toISOString(), value,
  }));
  const hours = aggregateHourlyPrices(quarters);
  assert.equal(hours.length, 1);
  assert.equal(hours[0].value, 5);
  assert.equal(hours[0].start, '2026-11-17T08:00:00.000Z');
  assert.equal(hours[0].end, '2026-11-17T09:00:00.000Z');
  assert.equal(getCurrentInterval(hours, '2026-11-17T08:40:00Z').value, 5);
  assert.equal(aggregateHourlyPrices(quarters.slice(1)).length, 0);
  assert.equal(aggregateHourlyPrices([...quarters, quarters[0]]).length, 0);
});

test('hourly electricity keeps repeated autumn Helsinki hours separate', async () => {
  const { aggregateHourlyPrices } = await import('../src/services/electricityFeed.js');
  const quarters = Array.from({ length: 8 }, (_, index) => ({
    start: new Date(Date.UTC(2026, 9, 25, 0, index * 15)).toISOString(),
    end: new Date(Date.UTC(2026, 9, 25, 0, (index + 1) * 15)).toISOString(), value: index < 4 ? 10 : 20,
  }));
  const hours = aggregateHourlyPrices(quarters);
  assert.equal(hours.length, 2);
  assert.equal(hours[0].value, 10);
  assert.equal(hours[1].value, 20);
});

test('tomorrow schedule unlocks at 13 Helsinki time in winter and summer', async () => {
  const { getScheduleDateWindow } = await import('../src/services/scheduleService.js');
  assert.equal(getScheduleDateWindow('2026-11-17T10:59:59Z').showTomorrow, false);
  const winter = getScheduleDateWindow('2026-11-17T11:00:00Z');
  assert.equal(winter.showTomorrow, true);
  assert.equal(winter.maxDate, '2026-11-18');
  assert.equal(getScheduleDateWindow('2026-06-17T09:59:59Z').showTomorrow, false);
  assert.equal(getScheduleDateWindow('2026-06-17T10:00:00Z').showTomorrow, true);
  const midnight = getScheduleDateWindow('2026-11-17T22:00:00Z');
  assert.equal(midnight.showTomorrow, false);
  assert.equal(midnight.today, '2026-11-18');
  assert.equal(midnight.maxDate, '2026-11-18');
});
