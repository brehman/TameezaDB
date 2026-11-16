export function loadCodes(input) {
  const rawLines = Array.isArray(input)
    ? input
    : typeof input === 'string'
      ? input.split(/\r?\n/)
      : [];

  return rawLines
    .map((line) => String(line).trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.replace(/^\s+|\s+$/g, ''));
}

function toUtcDateOnly(dateString) {
  const [year, month, day] = String(dateString).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function getDailyCodeForDate(codes, currentDateString, startDateString = null) {
  const cleanCodes = loadCodes(codes);
  if (!cleanCodes.length) return '';

  const referenceDate = toUtcDateOnly(currentDateString);
  const startDate = startDateString ? toUtcDateOnly(startDateString) : referenceDate;
  const diffDays = Math.floor((referenceDate.getTime() - startDate.getTime()) / 86400000);
  const index = ((diffDays % cleanCodes.length) + cleanCodes.length) % cleanCodes.length;

  return cleanCodes[index];
}
