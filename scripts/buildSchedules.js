import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildScheduleCalendar } from '../src/services/calendarService.js';

function getHorizonDate() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Helsinki', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
  const today = [parts.year, parts.month, parts.day];
  return new Date(Date.UTC(today[0], today[1] - 1, today[2] + 400, 23, 59, 59));
}

export async function buildSchedules() {
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const sources = Object.fromEntries(await Promise.all(
    ['U', 'N', 'S', 'TC'].map(async (name) => [
      name,
      await readFile(resolve(projectRoot, `schedules/${name}.ics`), 'utf8'),
    ])
  ));
  const children = buildScheduleCalendar(sources, getHorizonDate());

  const output = { timezone: 'Europe/Helsinki', generatedAt: new Date().toISOString(), children };
  await writeFile(resolve(projectRoot, 'data/schedules/calendar.json'), `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Generated schedules for U (${Object.keys(children.U).length} dates), N (${Object.keys(children.N).length} dates), S (${Object.keys(children.S).length} dates), and TC (${Object.keys(children.TC).length} dates).`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildSchedules();
}