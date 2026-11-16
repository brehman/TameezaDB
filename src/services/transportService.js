const FALLBACK_DEPARTURES = {
  kavallinmaki: [
    { route: '200', destination: 'Helsinki', scheduled: '08:12', realtime: '08:12', delay: 0 },
    { route: '200', destination: 'Helsinki', scheduled: '08:42', realtime: '08:42', delay: 0 },
    { route: '200', destination: 'Helsinki', scheduled: '09:12', realtime: '09:14', delay: 2 },
  ],
  viherlaaksonTori: [
    { route: '114', destination: 'Leppävaara', scheduled: '08:15', realtime: '08:15', delay: 0 },
    { route: '123', destination: 'Leppävaara', scheduled: '08:32', realtime: '08:32', delay: 0 },
    { route: '106', destination: 'Leppävaara', scheduled: '08:50', realtime: '08:54', delay: 4 },
  ],
  kauniainen: [
    { route: 'I', destination: 'Helsinki', scheduled: '08:24', realtime: '08:24', delay: 0 },
    { route: 'A', destination: 'Helsinki', scheduled: '08:43', realtime: '08:44', delay: 1 },
    { route: 'L', destination: 'Helsinki', scheduled: '09:12', realtime: '09:12', delay: 0 },
  ],
  leppavaara: [
    { route: 'I', destination: 'Helsinki', scheduled: '08:17', realtime: '08:17', delay: 0 },
    { route: 'A', destination: 'Helsinki', scheduled: '08:37', realtime: '08:39', delay: 2 },
    { route: 'L', destination: 'Helsinki', scheduled: '09:01', realtime: '09:01', delay: 0 },
  ],
};

function buildFallbackTransportData() {
  return {
    source: 'Fallback sample data',
    updatedAt: new Date().toISOString(),
    routes: [
      { key: 'kavallinmaki', label: 'Kavallinmäki → Helsinki', departures: FALLBACK_DEPARTURES.kavallinmaki },
      { key: 'viherlaaksonTori', label: 'Viherlaakson tori → Leppävaara', departures: FALLBACK_DEPARTURES.viherlaaksonTori },
      { key: 'kauniainen', label: 'Kauniainen → Helsinki', departures: FALLBACK_DEPARTURES.kauniainen },
      { key: 'leppavaara', label: 'Leppävaara → Helsinki', departures: FALLBACK_DEPARTURES.leppavaara },
    ],
  };
}

async function fetchLiveTransportData(stops = {}) {
  const stopIds = {
    kavallinmaki: stops.kavallinmaki || 'HSL:1230101',
    viherlaaksonTori: stops.viherlaaksonTori || 'HSL:1230202',
    kauniainen: stops.kauniainen || 'HSL:1230303',
    leppavaara: stops.leppavaara || 'HSL:1230404',
  };

  const query = `query {
    kavallinmaki: stop(id: "${stopIds.kavallinmaki}") {
      name
      stoptimesWithoutPatterns(numberOfDepartures: 4, timeRange: 7200) {
        scheduledDeparture
        realtimeDeparture
        realtime
        delay
        trip { route { shortName type } tripHeadsign }
      }
    }
    viherlaaksonTori: stop(id: "${stopIds.viherlaaksonTori}") {
      name
      stoptimesWithoutPatterns(numberOfDepartures: 4, timeRange: 7200) {
        scheduledDeparture
        realtimeDeparture
        realtime
        delay
        trip { route { shortName type } tripHeadsign }
      }
    }
    kauniainen: stop(id: "${stopIds.kauniainen}") {
      name
      stoptimesWithoutPatterns(numberOfDepartures: 4, timeRange: 7200) {
        scheduledDeparture
        realtimeDeparture
        realtime
        delay
        trip { route { shortName type } tripHeadsign }
      }
    }
    leppavaara: stop(id: "${stopIds.leppavaara}") {
      name
      stoptimesWithoutPatterns(numberOfDepartures: 4, timeRange: 7200) {
        scheduledDeparture
        realtimeDeparture
        realtime
        delay
        trip { route { shortName type } tripHeadsign }
      }
    }
  }`;

  const response = await fetch('https://api.digitransit.fi/routing/v1/routers/hsl/index/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new Error(`HSL API request failed: ${response.status}`);
  }

  const payload = await response.json();
  const stopsData = payload.data || {};

  return {
    source: 'HSL Digitransit',
    updatedAt: new Date().toISOString(),
    routes: [
      { key: 'kavallinmaki', label: 'Kavallinmäki → Helsinki', departures: (stopsData.kavallinmaki?.stoptimesWithoutPatterns || []).map((item) => ({
        route: item.trip.route.shortName || 'Bus',
        destination: item.trip.tripHeadsign || 'Helsinki',
        scheduled: formatDepartureTime(item.scheduledDeparture),
        realtime: formatDepartureTime(item.realtimeDeparture),
        delay: Math.max(0, Math.round((item.realtimeDeparture - item.scheduledDeparture) / 60)),
      })) },
      { key: 'viherlaaksonTori', label: 'Viherlaakson tori → Leppävaara', departures: (stopsData.viherlaaksonTori?.stoptimesWithoutPatterns || []).map((item) => ({
        route: item.trip.route.shortName || 'Bus',
        destination: item.trip.tripHeadsign || 'Leppävaara',
        scheduled: formatDepartureTime(item.scheduledDeparture),
        realtime: formatDepartureTime(item.realtimeDeparture),
        delay: Math.max(0, Math.round((item.realtimeDeparture - item.scheduledDeparture) / 60)),
      })) },
      { key: 'kauniainen', label: 'Kauniainen → Helsinki', departures: (stopsData.kauniainen?.stoptimesWithoutPatterns || []).map((item) => ({
        route: item.trip.route.shortName || 'Train',
        destination: item.trip.tripHeadsign || 'Helsinki',
        scheduled: formatDepartureTime(item.scheduledDeparture),
        realtime: formatDepartureTime(item.realtimeDeparture),
        delay: Math.max(0, Math.round((item.realtimeDeparture - item.scheduledDeparture) / 60)),
      })) },
      { key: 'leppavaara', label: 'Leppävaara → Helsinki', departures: (stopsData.leppavaara?.stoptimesWithoutPatterns || []).map((item) => ({
        route: item.trip.route.shortName || 'Train',
        destination: item.trip.tripHeadsign || 'Helsinki',
        scheduled: formatDepartureTime(item.scheduledDeparture),
        realtime: formatDepartureTime(item.realtimeDeparture),
        delay: Math.max(0, Math.round((item.realtimeDeparture - item.scheduledDeparture) / 60)),
      })) },
    ],
  };
}

function formatDepartureTime(secondsSinceMidnight) {
  const minutes = Number(secondsSinceMidnight || 0) / 60;
  const currentDate = new Date();
  currentDate.setHours(0, 0, 0, 0);
  currentDate.setMinutes(Math.round(minutes));
  return currentDate.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Helsinki',
  });
}

export async function fetchTransportData(config = {}) {
  const transportConfig = config.transport || {};
  const stopIds = transportConfig.stops || {};

  try {
    if (!transportConfig.useStaticFallback) {
      return await fetchLiveTransportData(stopIds);
    }
  } catch (error) {
    console.warn('HSL transport check failed, using fallback data.', error);
  }

  return buildFallbackTransportData();
}
