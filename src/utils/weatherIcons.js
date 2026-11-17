// Small vector shapes avoid platform emoji fonts, external downloads, and animation.
const sun = '<circle cx="24" cy="23" r="10" fill="#fbbf24"/><path d="M24 5v4m0 28v4M6 23h4m28 0h4M11 10l3 3m20 20 3 3M11 36l3-3m20-20 3-3" stroke="#fbbf24" stroke-width="3" stroke-linecap="round"/>';
const cloud = '<path d="M15 43a10 10 0 0 1-1-20 14 14 0 0 1 26-3 11 11 0 1 1 5 23Z" fill="#cbd5e1" stroke="#64748b" stroke-width="2"/>';
const rain = '<path d="m21 48-3 7m14-7-3 7m14-7-3 7" stroke="#38bdf8" stroke-width="3" stroke-linecap="round"/>';
const snow = '<g fill="#7dd3fc"><circle cx="20" cy="52" r="3"/><circle cx="32" cy="56" r="3"/><circle cx="44" cy="52" r="3"/></g>';
const fog = '<path d="M10 48h44M15 54h34M20 60h24" stroke="#94a3b8" stroke-width="3" stroke-linecap="round"/>';
const lightning = '<path d="m33 40-10 13h9l-4 10 16-17H33l5-6Z" fill="#fbbf24" stroke="#d97706" stroke-width="1"/>';

export function weatherIcon(code) {
  code = Number(code);
  let shapes;
  if (code === 0) shapes = sun;
  else if (code === 1 || code === 2) shapes = sun + cloud;
  else if (code === 3) shapes = cloud;
  else if (code === 45 || code === 48) shapes = cloud + fog;
  else if (code >= 95) shapes = cloud + lightning;
  else if ((code >= 71 && code <= 77) || code === 85 || code === 86) shapes = cloud + snow;
  else if (code >= 51 && code <= 82) shapes = cloud + rain;
  else shapes = sun + cloud;
  return `<svg class="weather-symbol" viewBox="0 0 64 64" aria-hidden="true" focusable="false">${shapes}</svg>`;
}
