export function normalizeElectricityData(entries = []) {
  return entries
    .map((entry) => ({
      start: new Date(entry.start),
      end: new Date(entry.end),
      value: Number(entry.value ?? entry.price ?? 0),
    }))
    .filter((entry) => !Number.isNaN(entry.start.getTime()) && !Number.isNaN(entry.end.getTime()));
}

export function getCurrentInterval(intervals = [], currentDate = new Date()) {
  const normalized = normalizeElectricityData(intervals);
  const now = new Date(currentDate);
  return normalized.find((interval) => now >= interval.start && now < interval.end) || normalized[0] || null;
}

export function shouldShowTomorrowElectricity(electricityData = {}, currentDate = new Date()) {
  const localHour = Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Helsinki',
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(currentDate)));
  return localHour >= 13 && electricityData.tomorrowIntervals?.length > 0;
}

export function getPriceColor(value, lowThreshold = 10, highThreshold = 20) {
  if (value < 0) return 'success';
  if (value < lowThreshold) return 'success';
  if (value < highThreshold) return 'warning';
  return 'danger';
}

export function getElectricityBarColor(value) {
  if (value <= 0) return 'blue';
  if (value < 5) return 'green';
  if (value <= 15) return 'orange';
  if (value <= 25) return 'bright-red';
  if (value <= 35) return 'dark-red';
  return 'maroon';
}

export function getAveragePrice(intervals = []) {
  const values = normalizeElectricityData(intervals).map((interval) => interval.value);
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function getElectricityBarHeight(value, intervals = []) {
  const values = Array.isArray(intervals) && intervals.length && typeof intervals[0] === 'number'
    ? intervals
    : normalizeElectricityData(intervals).map((interval) => interval.value);
  if (!values.length) return 0;

  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue || 1;
  const normalized = (Number(value) - minValue) / range;

  return Number(Math.max(8, Math.min(100, 8 + normalized * 92)).toFixed(1));
}

export function getCheapestInterval(intervals = []) {
  const normalized = normalizeElectricityData(intervals);
  if (!normalized.length) return null;
  return normalized.reduce((best, current) => (current.value < best.value ? current : best), normalized[0]);
}

export function getMostExpensiveInterval(intervals = []) {
  const normalized = normalizeElectricityData(intervals);
  if (!normalized.length) return null;
  return normalized.reduce((best, current) => (current.value > best.value ? current : best), normalized[0]);
}
