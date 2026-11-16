const HSL_ENDPOINT = 'https://api.digitransit.fi/routing/v2/hsl/gtfs/v1';

const STOP_DEFINITIONS = [
  { key: 'viherlaaksonTori', label: 'Viherlaaksontori' },
  { key: 'kavallinmaki', label: 'Kavallinmäki' },
  { key: 'kauniainen', label: 'Kauniainen' },
  { key: 'leppavaara', label: 'Leppävaara' },
];

const MINIMUM_LEAD_MINUTES = {
  viherlaaksonTori: 7,
  kavallinmaki: 7,
  kauniainen: 10,
  leppavaara: 15,
};

function formatDepartureTime(timestamp) {
  return new Date(timestamp * 1000).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Helsinki',
  });
}

function buildEmptyTransportData(source = 'HSL unavailable') {
  return {
    source,
    updatedAt: new Date().toISOString(),
    routes: STOP_DEFINITIONS.map(({ key, label }) => ({ key, label, departures: [] })),
  };
}

function buildStopQuery(stopIds) {
  return STOP_DEFINITIONS.map(({ key }) => {
    const stopId = stopIds[key];
    if (!stopId) throw new Error(`Missing HSL stop ID for ${key}.`);

    return `${key}: stop(id: "${stopId}") {
      name
      stoptimesWithoutPatterns(numberOfDepartures: 12) {
        serviceDay
        scheduledDeparture
        realtimeDeparture
        realtime
        pickupType
        headsign
        trip { routeShortName }
      }
    }`;
  }).join('\n');
}

function mapStopDepartures(stop, definition) {
  const departures = (stop?.stoptimesWithoutPatterns || [])
    .filter((item) => item.pickupType !== 'NONE')
    .map((item) => {
      const scheduledTimestamp = Number(item.serviceDay) + Number(item.scheduledDeparture);
      const predictedTimestamp = item.realtime && item.realtimeDeparture != null
        ? Number(item.serviceDay) + Number(item.realtimeDeparture)
        : scheduledTimestamp;

      return {
        route: item.trip?.routeShortName || 'Transit',
        destination: item.headsign || '',
        stopName: stop.name || definition.label,
        scheduled: formatDepartureTime(scheduledTimestamp),
        realtime: item.realtime ? formatDepartureTime(predictedTimestamp) : null,
        delay: Math.round((predictedTimestamp - scheduledTimestamp) / 60),
        timestamp: predictedTimestamp,
      };
    })
    .sort((first, second) => first.timestamp - second.timestamp);

  return {
    key: definition.key,
    label: stop?.name || definition.label,
    departures,
  };
}

export function getSortedDepartures(routes = [], perStopLimit = 2, currentDate = new Date()) {
  const nowSeconds = new Date(currentDate).getTime() / 1000;

  return routes
    .flatMap((route) => route.departures
      .slice()
      .filter((departure) => departure.timestamp - nowSeconds >= (MINIMUM_LEAD_MINUTES[route.key] || 0) * 60)
      .sort((first, second) => first.timestamp - second.timestamp)
      .slice(0, perStopLimit))
    .sort((first, second) => first.timestamp - second.timestamp);
}

export function getDepartureMinutesUntil(timestamp, currentDate = new Date()) {
  const remainingSeconds = Number(timestamp) - new Date(currentDate).getTime() / 1000;
  return Math.max(0, Math.ceil(remainingSeconds / 60));
}

export async function fetchTransportData(config = {}) {
  const transportConfig = config.transport || {};
  const subscriptionKey = transportConfig.subscriptionKey;
  if (!subscriptionKey) return buildEmptyTransportData();

  try {
    const response = await fetch(HSL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'digitransit-subscription-key': subscriptionKey,
      },
      body: JSON.stringify({ query: `{ ${buildStopQuery(transportConfig.stops || {})} }` }),
    });

    if (!response.ok) throw new Error(`HSL API request failed: ${response.status}`);

    const payload = await response.json();
    if (payload.errors?.length) throw new Error(payload.errors[0].message);

    return {
      source: 'HSL Digitransit',
      updatedAt: new Date().toISOString(),
      routes: STOP_DEFINITIONS.map((definition) => mapStopDepartures(payload.data?.[definition.key], definition)),
    };
  } catch (error) {
    console.warn('HSL transport request failed.', error);
    return buildEmptyTransportData();
  }
}