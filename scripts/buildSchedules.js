import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const timezone = 'Europe/Helsinki';
import { expandIcsCalendar } from '../src/utils/ics.js';
export { expandIcsCalendar } from '../src/utils/ics.js';

export async function buildSchedules() {
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const children = {};

  for (const child of ['U', 'N', 'S', 'TC']) {
    const source = await readFile(resolve(projectRoot, `schedules/${child}.ics`), 'utf8');
    children[child] = expandIcsCalendar(source);
  }

  const output = { timezone, generatedAt: new Date().toISOString(), children };
  await writeFile(resolve(projectRoot, 'data/schedules/calendar.json'), `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Generated schedules for U (${Object.keys(children.U).length} dates), N (${Object.keys(children.N).length} dates), S (${Object.keys(children.S).length} dates), and TC (${Object.keys(children.TC).length} dates).`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildSchedules();
}