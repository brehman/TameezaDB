# Smart Home Information Dashboard

A static, GitHub Pages-friendly dashboard for a family home in Viherlaakso, Espoo, Finland. It combines weather, electricity pricing, public transport, a motivational daily quote, and a daily family schedule in a dark, television-friendly layout.

## Architecture

This project intentionally avoids a traditional backend. The dashboard is designed to run as a static site on GitHub Pages and remains compatible with Yodeck or any modern browser.

### Selected architecture

- Frontend: static HTML, CSS, and JavaScript modules
- Hosting: GitHub Pages
- Weather source: Open-Meteo (browser-friendly, no API key, CORS-friendly)
- Electricity source: VAT-inclusive 15-minute Finnish spot prices from the Porssisahko.net v2 JSON API, fetched by GitHub Actions into a static feed
- Public transport source: live HSL/Digitransit stop times for Viherlaaksontori, Kavallinmäki, Kauniainen, and Leppävaara
- Family schedules: U, N, S, and TC ICS calendars expanded into date-specific JSON when starting locally and before GitHub Pages deployment
- Daily quote: local text file with deterministic rotation logic

### Why this architecture

- It matches the requirement to avoid maintaining a server.
- It works on GitHub Pages without backend credentials.
- It remains simple to maintain and update.
- It requires no paid hosting.

## Run locally

```bash
cd /path/to/project
python3 -m http.server 8000
```

Open http://localhost:8000

## GitHub Pages deployment

1. Push the repository to GitHub.
2. In GitHub, open the repository settings.
3. Navigate to Pages.
4. Set the source to GitHub Actions.
5. Use the provided workflow file at `.github/workflows/deploy.yml`.

## Configuration

Edit `config/dashboard.json` to change:

- Weather coordinates
- Display and rotation settings
- Page order and durations
- Electricity price thresholds (feed prices already include VAT)
- HSL stop IDs
- Daily quote rotation start date

## Data files

- `data/daily-quotes.txt` — one motivational quote per line
- `schedules/U.ics`, `schedules/N.ics`, `schedules/S.ics`, and `schedules/TC.ics` — source calendars
- `data/schedules/calendar.json` — generated date-specific schedules; build with `npm run build:schedules`
- `data/electricity/fi-prices.json` — electricity feed updated from the Porssisahko.net v2 API hourly

The summary shows U, N, and S's first calendar start and last scheduled end for today, plus the next upcoming TC event. The Schedule page shows events for the selected date in four columns: U, N, S, and TC. Schedule JSON is regenerated from the ICS files when starting locally with `npm start` or `npm run serve`, and by the Pages workflow before deployment.

The Pages workflow refreshes electricity prices hourly before deployment using `https://api.porssisahko.net/v2/latest-prices.json`. Prices are in cents/kWh with VAT already included; no extra VAT is added. The browser checks the deployed JSON every 15 minutes and selects the matching delivery interval as time advances. It does not contact the API directly because the API does not supply browser CORS headers. This is a third-party day-ahead price feed, not a live grid connection. Tomorrow's chart appears when published prices are available. Helsinki dates are recalculated at rendering time so prices roll over at midnight without a new download. The display shows the retrieval timestamp and supplier attribution. Expired or unknown legacy prices are never presented as current; missing data is labelled unavailable/outdated. Electricity supplier margin and grid fees are excluded. Failed workflow refreshes produce a warning; the last valid saved feed may be deployed but expired intervals remain unavailable. Failure to commit the saved feed does not block deployment.

## Privacy warning

The dashboard is static and public by default. Daily quotes and any personal family information stored in GitHub Pages are publicly readable. The Digitransit subscription key is sent from browser code and is visible to visitors; use a key intended for public client-side use with appropriate quotas, or put the API request behind a server-side proxy. Rotate the key if it was not intended to be public.

If you need confidential schedule details or private wording, keep them on a local-only device or a private local network and disable the public file.

## Testing

```bash
npm test
```

## Planned enhancements

- Add a future local configuration editor for family schedules.

The Schedule page's **Update schedules** button fetches the latest deployed U, N, S, and TC ICS files without using cached responses and rebuilds the displayed calendars in the browser. Push changed ICS files and wait for deployment before pressing it. The refresh applies to this open dashboard; it does not write back to the repository. Failed updates preserve the previous calendars. Every page load automatically fetches and expands all four ICS files through the same loader, including S. The generated calendar JSON is used only if loading the ICS files fails.

Weather and home icons use lightweight SVG shapes instead of emoji, so signage players do not need emoji fonts.
