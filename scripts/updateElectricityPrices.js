import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ELECTRICITY_API, parseElectricityApi } from '../src/services/electricityFeed.js';

export async function updateElectricityPrices() {
  const response = await fetch(ELECTRICITY_API, {
    headers: { accept: 'application/json' }, signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Electricity source returned HTTP ${response.status}.`);
  const data = parseElectricityApi(await response.json());
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  await writeFile(resolve(projectRoot, 'data/electricity/fi-prices.json'), `${JSON.stringify(data, null, 2)}\n`);
  console.log(`Updated ${data.intervals.length} VAT-inclusive price intervals from ${data.source}.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await updateElectricityPrices();
}
