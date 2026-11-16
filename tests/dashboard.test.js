import test from 'node:test';
import assert from 'node:assert/strict';

import { getDailyCodeForDate, loadCodes } from '../src/services/dailyCodeService.js';
import { resolveCurrentScheduleState } from '../src/services/scheduleService.js';
import { getCurrentInterval, getElectricityBarColor, getElectricityBarHeight, getPriceColor, normalizeElectricityData, shouldShowTomorrowElectricity } from '../src/services/electricityService.js';
import { parsePorssisahkoHtml } from '../scripts/updateElectricityPrices.js';

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

test('electricity source parser reads real hourly table values and handles midnight', () => {
  const rows = Array.from({ length: 24 }, (_, hour) => {
    const start = `${String(hour).padStart(2, '0')}:00`;
    const end = hour === 23 ? '00:00' : `${String(hour + 1).padStart(2, '0')}:00`;
    const value = hour === 0 ? '1.47' : hour === 23 ? '20.52' : '2.25';
    return `<tr><td>${start} - ${end}</td><td>${value} c/kWh</td></tr>`;
  }).join('');
  const html = `
    <div id="today">
      <p>Current price: 4.5 c/kWh</p>
      <p>Date: <strong>16.11.2026</strong></p>
      <table><tbody>${rows}</tbody></table>
    </div>
    <div id="tomorrow">
      <p>Date: <strong>17.11.2026</strong></p>
      <table><tbody>${rows}</tbody></table>
    </div>
  `;

  const result = parsePorssisahkoHtml(html);
  assert.equal(result.intervals.length, 24);
  assert.equal(result.tomorrowIntervals.length, 24);
  assert.equal(result.tomorrowDate, '2026-11-17');
  assert.equal(result.intervals[0].value, 1.47);
  assert.equal(result.intervals[0].start, '2026-11-15T22:00:00.000Z');
  assert.equal(result.intervals[23].end, '2026-11-16T22:00:00.000Z');
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
