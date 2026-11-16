const WEATHER_CODES = {
  0: { label: 'Clear sky', icon: '☀️' },
  1: { label: 'Mostly clear', icon: '🌤️' },
  2: { label: 'Partly cloudy', icon: '⛅' },
  3: { label: 'Overcast', icon: '☁️' },
  45: { label: 'Fog', icon: '🌫️' },
  48: { label: 'Depositing rime fog', icon: '🌫️' },
  51: { label: 'Light drizzle', icon: '🌦️' },
  53: { label: 'Drizzle', icon: '🌦️' },
  55: { label: 'Dense drizzle', icon: '🌧️' },
  56: { label: 'Freezing drizzle', icon: '🌧️' },
  57: { label: 'Heavy freezing drizzle', icon: '🌧️' },
  61: { label: 'Slight rain', icon: '🌦️' },
  63: { label: 'Rain', icon: '🌧️' },
  65: { label: 'Heavy rain', icon: '🌧️' },
  66: { label: 'Freezing rain', icon: '🌧️' },
  67: { label: 'Heavy freezing rain', icon: '🌧️' },
  71: { label: 'Slight snow', icon: '🌨️' },
  73: { label: 'Snow', icon: '❄️' },
  75: { label: 'Heavy snow', icon: '❄️' },
  77: { label: 'Snow grains', icon: '❄️' },
  80: { label: 'Rain showers', icon: '🌦️' },
  81: { label: 'Heavy rain showers', icon: '🌧️' },
  82: { label: 'Violent rain showers', icon: '⛈️' },
  85: { label: 'Snow showers', icon: '🌨️' },
  86: { label: 'Heavy snow showers', icon: '❄️' },
  95: { label: 'Thunderstorm', icon: '⛈️' },
  96: { label: 'Thunderstorm with hail', icon: '⛈️' },
  99: { label: 'Severe thunderstorm', icon: '⛈️' },
};

export function mapWeatherCode(code) {
  return WEATHER_CODES[Number(code)] || { label: 'Weather', icon: '🌤️' };
}

export function getThemeForSunPosition(currentDate = new Date(), sunrise, sunset) {
  if (!sunrise || !sunset) return 'light';
  const now = new Date(currentDate).getTime();
  const sunriseTime = new Date(sunrise).getTime();
  const sunsetTime = new Date(sunset).getTime();
  if (!Number.isFinite(now) || !Number.isFinite(sunriseTime) || !Number.isFinite(sunsetTime)) return 'light';
  return now < sunriseTime || now >= sunsetTime ? 'dark' : 'light';
}

export function getHourlyForecastFromCurrentHour(hourly = [], currentDate = new Date(), hoursToShow = 5) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Helsinki',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(currentDate))
    .filter((part) => part.type !== 'literal')
    .map((part) => [part.type, part.value]));
  const currentHourKey = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:00`;
  const startIndex = hourly.findIndex((entry) => entry.time >= currentHourKey);

  return startIndex < 0 ? [] : hourly.slice(startIndex, startIndex + hoursToShow);
}

export function normalizeWeatherData(json) {
  const hourly = json.hourly || {};
  const daily = json.daily || {};
  const current = json.current || {};

  const hourlyData = (hourly.time || []).map((time, index) => ({
    time,
    temperature: hourly.temperature_2m?.[index],
    feelsLike: hourly.apparent_temperature?.[index],
    precipitationProbability: hourly.precipitation_probability?.[index],
    precipitation: hourly.precipitation?.[index],
    windSpeed: hourly.windspeed_10m?.[index],
    weatherCode: hourly.weather_code?.[index],
    description: mapWeatherCode(hourly.weather_code?.[index]),
  }));

  return {
    current: {
      temperature: current.temperature_2m,
      feelsLike: current.apparent_temperature,
      humidity: current.relative_humidity_2m,
      wind: current.wind_speed_10m,
      precipitation: current.precipitation,
      weatherCode: current.weather_code,
      description: mapWeatherCode(current.weather_code),
    },
    daily: {
      temperatureMin: daily.temperature_2m_min?.[0],
      temperatureMax: daily.temperature_2m_max?.[0],
      tomorrowMin: daily.temperature_2m_min?.[1],
      tomorrowMax: daily.temperature_2m_max?.[1],
      sunrise: daily.sunrise?.[0],
      sunset: daily.sunset?.[0],
      sunriseTomorrow: daily.sunrise?.[1],
      sunsetTomorrow: daily.sunset?.[1],
      forecast: (daily.time || []).map((date, index) => ({
        date,
        temperatureMin: daily.temperature_2m_min?.[index],
        temperatureMax: daily.temperature_2m_max?.[index],
        weatherCode: daily.weather_code?.[index],
        description: mapWeatherCode(daily.weather_code?.[index]),
      })),
    },
    hourly: hourlyData,
    source: 'Open-Meteo',
  };
}

export async function fetchWeatherData(latitude = 60.178, longitude = 24.825) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m,precipitation&hourly=temperature_2m,apparent_temperature,precipitation_probability,weather_code,windspeed_10m,precipitation&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset&timezone=Europe%2FHelsinki&forecast_days=7`;

  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Weather request failed: ${response.status}`);
  }

  const json = await response.json();
  return normalizeWeatherData(json);
}
