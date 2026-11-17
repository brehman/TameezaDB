import { fetchElectricityFeed, selectElectricityDays } from './services/electricityFeed.js';
import { getDailyCodeForDate } from './services/dailyCodeService.js';
import { getAveragePrice, getCheapestInterval, getCurrentInterval, getElectricityBarColor, getElectricityBarHeight, getMostExpensiveInterval, getPriceLevel, isCurrentElectricityInterval } from './services/electricityService.js?v=spot-api-v2';
import { getUpcomingCalendarEvent } from './services/scheduleService.js';
import { fetchTransportData, getDepartureMinutesUntil, getSortedDepartures } from './services/transportService.js';
import { fetchWeatherData, getHourlyForecastFromCurrentHour, getThemeForSunPosition, mapWeatherCode } from './services/weatherService.js?v=yodeck-svg-schedule-refresh';
import { formatCountdown, formatDateLong, formatHHMM, formatHHMMSS, formatPrice, parseHHMM } from './utils/time.js';

const state = {
  config: null,
  weather: null,
  electricity: null,
  electricityRefreshAt: 0,
  liveRefreshRunning: false,
  transport: null,
  schedules: [],
  scheduleUpdating: false,
  scheduleStatus: '',
  selectedScheduleDate: '',
  dailyCodes: [],
  selectedDailyQuote: '',
  pageOrder: [],
  activePage: 'summary',
  rotationHandle: null,
  rotationPaused: false,
};

    async function fetchJSON(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`Unable to load ${url}: ${response.status}`);
  }
  return response.json();
}

async function loadSchedules() {
  const calendar = await fetchJSON('./data/schedules/calendar.json');
  return ['U', 'N', 'S', 'TC'].map((name) => ({
    name,
    days: calendar.children[name] || {},
  }));
}

async function updateSchedulesFromIcs() {
  if (state.scheduleUpdating) return;
  state.scheduleUpdating = true;
  state.scheduleStatus = 'Updating schedules...';
  renderSchedulePage();
  try {
    const { fetchIcsSchedules } = await import('./utils/ics.js');
    const schedules = await fetchIcsSchedules();
    state.schedules = schedules;
    state.scheduleStatus = 'Schedules updated from ICS files.';
  } catch (error) {
    console.warn('Schedule update failed.', error);
    state.scheduleStatus = 'Update failed. Previous schedules kept. Please try again.';
  } finally {
    state.scheduleUpdating = false;
    renderAll();
  }
}

function getHelsinkiDateKey(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Helsinki',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
    .filter((part) => part.type !== 'literal')
    .map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function updateClock() {
  const now = new Date();
  const time = formatHHMMSS(now);
  const dateText = formatDateLong(now);
  document.getElementById('header-time').textContent = time;
  document.getElementById('header-date').textContent = dateText;
  document.documentElement.dataset.theme = getThemeForSunPosition(
    now,
    state.weather?.daily?.sunrise,
    state.weather?.daily?.sunset
  );
}

function renderPageNavigation() {
  const nav = document.getElementById('page-nav');
  nav.innerHTML = '';
  state.pageOrder.forEach((pageId) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `nav-btn ${pageId === state.activePage ? 'active' : ''}`;
    item.textContent = state.config.pages[pageId]?.label || pageId;
    item.addEventListener('click', () => {
      state.activePage = pageId;
      renderPageNavigation();
      renderPages();
      resetRotationTimer();
    });
    nav.appendChild(item);
  });
}

function renderPages() {
  document.querySelectorAll('.page').forEach((page) => {
    const isVisible = page.dataset.page === state.activePage;
    page.classList.toggle('active', isVisible);
  });
}

function renderElectricityChart(intervals, compact = false, split = false, currentDate = new Date()) {
  const prices = intervals.map((interval) => Number(interval.value)).filter(Number.isFinite);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 0;
  const priceTicks = minPrice === maxPrice
    ? [{ value: minPrice, height: getElectricityBarHeight(minPrice, intervals) }]
    : Array.from({ length: 6 }, (_, index) => {
      const value = minPrice + ((maxPrice - minPrice) * index) / 5;
      return { value, height: getElectricityBarHeight(value, intervals) };
    });
  const yAxis = `
    <div class="chart-y-axis" aria-label="Price scale in cents per kilowatt-hour">
      <span class="chart-y-axis-title">c/kWh</span>
      ${[...priceTicks].reverse().map((tick) => `<span class="chart-y-tick" style="bottom:${tick.height}%">${tick.value.toFixed(1)}</span>`).join('')}
    </div>
  `;
  const gridLines = priceTicks.map((tick) => `<span class="chart-gridline" style="bottom:${tick.height}%"></span>`).join('');
  const bars = intervals.map((interval) => {
    const value = Number(interval.value || 0);
    const height = getElectricityBarHeight(value, intervals);
    const color = getElectricityBarColor(value);
    const startTime = new Date(interval.start);
    const [hour, minute] = startTime.toLocaleTimeString('en-GB', { timeZone: 'Europe/Helsinki', hour: '2-digit', minute: '2-digit', hour12: false }).split(':');
    const label = minute === '00' && Number(hour) % (intervals.length > 48 ? 3 : 1) === 0 ? hour : '';
    const isCurrent = isCurrentElectricityInterval(interval, currentDate);
    const currentPrice = isCurrent ? ` data-current-price="${value.toFixed(1)}¢" aria-label="Current price ${value.toFixed(1)} cents per kilowatt-hour"` : '';
    return `<div class="chart-bar-wrap${isCurrent ? ' is-current-hour' : ''}"${currentPrice}><div class="chart-bar ${color}" style="height:${height}%"></div><span>${label}</span></div>`;
  }).join('');

  const chartSize = compact ? ' electricity-chart--compact' : split ? ' electricity-chart--split' : '';
  return `<div class="electricity-chart${chartSize}">${yAxis}<div class="chart-bars">${gridLines}${bars}</div></div>`;
}

function electricityFeedStatus(current) {
  const fetchedAt = state.electricity?.fetchedAt;
  const updated = fetchedAt && Number.isFinite(new Date(fetchedAt).getTime())
    ? new Date(fetchedAt).toLocaleString('en-GB', { timeZone: 'Europe/Helsinki', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'unknown';
  return `${current ? '15-min spot • VAT included • excludes supplier margin and grid fees' : 'Price unavailable / outdated'} · Fetched ${updated} · Porssisahko.net`;
}

function renderSummaryPage() {
  const weatherSummary = state.weather?.current;
  const currentWeatherCode = weatherSummary?.description || mapWeatherCode(0);
  const hourlyCards = getHourlyForecastFromCurrentHour(state.weather?.hourly || [], new Date()).map((hour, index) => {
    const label = new Date(hour.time).toLocaleTimeString('en-GB', { timeZone: 'Europe/Helsinki', hour: '2-digit', hour12: false });
    return `
      <div class="mini-hour-card${index === 0 ? ' current-forecast-hour' : ''}">
        <div>${label}</div>
        <div class="mini-weather-condition">
          <span class="mini-weather-icon">${hour.description.icon}</span>
          <span class="mini-weather-label">${hour.description.label}</span>
        </div>
        <div class="mini-hour-temperatures">
          <strong>${Math.round(hour.temperature)}°</strong>
          <small>Feels like ${Math.round(hour.feelsLike ?? hour.temperature)}°</small>
        </div>
      </div>
    `;
  }).join('');

  const electricity = selectElectricityDays(state.electricity || {});
  const chartIntervals = electricity.intervals;
  const currentInterval = getCurrentInterval(chartIntervals, new Date());
  const priceValue = currentInterval ? currentInterval.value : null;
  const avgPrice = getAveragePrice(chartIntervals);
  const cheapest = getCheapestInterval(chartIntervals);
  const expensive = getMostExpensiveInterval(chartIntervals);
  const priceLevel = currentInterval ? getPriceLevel(priceValue) : 'Unavailable';

  const displayPrice = currentInterval ? priceValue.toFixed(2) : '--';

  const electricityChart = renderElectricityChart(chartIntervals, true);

  document.getElementById('summary-weather').innerHTML = `
    <div class="card-header">
      <h3>Weather</h3>
      <span class="tag">${currentWeatherCode.label}</span>
    </div>
    <div class="weather-main">
      <div class="weather-temp">${Math.round(weatherSummary?.temperature ?? 0)}°</div>
      <div class="weather-meta">
        <div class="weather-icon">${currentWeatherCode.icon}</div>
        <div>Feels like ${Math.round(weatherSummary?.feelsLike ?? 0)}°</div>
        <div>Wind ${Math.round(weatherSummary?.wind ?? 0)} km/h</div>
        <div>Rain ${Math.round(weatherSummary?.precipitation ?? 0)} mm</div>
      </div>
    </div>
    <div class="summary-row">
      <span>Min ${Math.round(state.weather?.daily?.temperatureMin ?? 0)}°</span>
      <span>Max ${Math.round(state.weather?.daily?.temperatureMax ?? 0)}°</span>
      <span>Hum ${Math.round(weatherSummary?.humidity ?? 0)}%</span>
    </div>
    <div class="mini-hour-row">${hourlyCards}</div>
  `;

  document.getElementById('summary-electricity').innerHTML = `
    <div class="card-header">
      <h3>Electricity</h3>
      <span class="tag price-level-${priceLevel.replaceAll(' ', '-')}">${priceLevel}</span>
    </div>
    <div class="big-price">${displayPrice} c/kWh</div>
    <div class="subtle-line">${electricityFeedStatus(currentInterval)}</div>
    <div class="chart-period-label">Today prices</div>
    <div class="stat-grid">
      <div><label>Average</label><strong>${chartIntervals.length ? avgPrice.toFixed(2) : '--'}</strong></div>
      <div><label>Cheapest</label><strong>${cheapest ? cheapest.value.toFixed(1) : '--'}</strong></div>
      <div><label>Most expensive</label><strong>${expensive ? expensive.value.toFixed(1) : '--'}</strong></div>
    </div>
    ${electricityChart}
  `;

  const now = new Date();
  const transportDepartures = getSortedDepartures(state.transport?.routes || [], 6, now, 6);
  const transportHtml = transportDepartures.map((item) => {
    const departureTime = item.realtime || item.scheduled;
    const minutesUntil = getDepartureMinutesUntil(item.timestamp, now);
    const delay = item.delay > 0 ? `<small>+${item.delay} min</small>` : '';
    return `<div class="transport-departure"><div class="transport-departure-time"><time>${departureTime}</time></div><strong>${item.route}</strong><span class="transport-countdown">(in ${minutesUntil} Mins)</span>${delay}</div>`;
  }).join('');

  document.getElementById('summary-transport').innerHTML = `
    <div class="card-header"><h3>HSL Departures</h3><span class="tag">${transportDepartures.length ? 'Live' : 'Unavailable'}</span></div>
    <div class="transport-departures">${transportHtml || '<p>No upcoming departures available.</p>'}</div>
  `;

  const todayKey = getHelsinkiDateKey();
  const scheduleCards = state.schedules.filter((child) => child.name !== 'TC').map((child) => {
    const events = child.days[todayKey] || [];
    const firstStart = events[0]?.start || '—';
    const lastEnd = events.at(-1)?.end || '—';
    return `
      <div class="child-summary">
        <h4>${child.name}</h4>
        <div class="schedule-summary-times">
          <div><label>Start</label><strong>${firstStart}</strong></div>
          <div><label>FREE AT</label><strong>${lastEnd}</strong></div>
        </div>
      </div>
    `;
  }).join('');

  document.getElementById('summary-schedule').innerHTML = `
    <div class="card-header"><h3>Family schedule</h3></div>
    <div class="schedule-summary-grid">${scheduleCards}</div>
  `;

  const tcCalendar = state.schedules.find((child) => child.name === 'TC')?.days || {};
  const upcomingEvent = getUpcomingCalendarEvent(tcCalendar, new Date());
  const upcomingDate = upcomingEvent
    ? new Date(`${upcomingEvent.date}T12:00:00`).toLocaleDateString('en-GB', { timeZone: 'Europe/Helsinki', weekday: 'short', day: 'numeric', month: 'short' })
    : '';
  document.getElementById('summary-upcoming-event').innerHTML = `
    <div class="card-header"><h3>Upcoming event</h3></div>
    ${upcomingEvent ? `
      <div class="upcoming-event-date">${upcomingDate} · ${upcomingEvent.start}–${upcomingEvent.end}</div>
      <div class="upcoming-event-title">${upcomingEvent.title}</div>
      ${upcomingEvent.location ? `<div class="upcoming-event-location">${upcomingEvent.location}</div>` : ''}
    ` : '<div class="upcoming-event-title">No upcoming events</div>'}
  `;
}

function renderElectricityPage() {
  const electricity = selectElectricityDays(state.electricity || {});
  const todayIntervals = electricity.intervals;
  const tomorrowIntervals = electricity.tomorrowIntervals;
  const showTomorrow = tomorrowIntervals.length > 0;
  const current = getCurrentInterval(todayIntervals, new Date());
  const renderPeriod = (label, intervals) => `
    <section class="electricity-period">
      <h3>${label}</h3>
      <div class="stats-row">
        <div class="stat-box"><span>Average</span><strong>${intervals.length ? getAveragePrice(intervals).toFixed(2) : '--'} c/kWh</strong></div>
        <div class="stat-box"><span>Cheapest</span><strong>${getCheapestInterval(intervals)?.value.toFixed(1) ?? '--'} c/kWh</strong></div>
        <div class="stat-box"><span>Most expensive</span><strong>${getMostExpensiveInterval(intervals)?.value.toFixed(1) ?? '--'} c/kWh</strong></div>
      </div>
      ${renderElectricityChart(intervals, false, showTomorrow)}
    </section>
  `;

  document.getElementById('electricity-page').innerHTML = `
    <div class="page-header">
      <h2>Electricity</h2>
      <p>Finland price zone • current ${current ? current.value.toFixed(2) : '--'} c/kWh</p>
    </div>
    <p class="subtle-line">${electricityFeedStatus(current)}</p>
    <div class="electricity-period-grid${showTomorrow ? ' electricity-period-grid--both' : ''}">
      ${renderPeriod('Today', todayIntervals)}
      ${showTomorrow ? renderPeriod('Tomorrow', tomorrowIntervals) : ''}
    </div>
  `;
}

function renderWeatherPage() {
  const current = state.weather?.current;
  const forecast = state.weather?.daily?.forecast || [];
  const weeklyTiles = forecast.map((day, index) => {
    const date = new Date(`${day.date}T12:00:00`);
    const weekday = index === 0 ? 'Today' : date.toLocaleDateString('en-GB', { timeZone: 'Europe/Helsinki', weekday: 'short' });
    const dateLabel = date.toLocaleDateString('en-GB', { timeZone: 'Europe/Helsinki', day: 'numeric', month: 'short' });
    return `
      <article class="weekly-weather-tile">
        <div class="weekly-weather-day">${weekday}</div>
        <div class="weekly-weather-date">${dateLabel}</div>
        <div class="weekly-weather-icon" aria-label="${day.description.label}">${day.description.icon}</div>
        <div class="weekly-weather-condition">${day.description.label}</div>
        <div class="weekly-weather-temperatures"><strong>${Math.round(day.temperatureMax)}°</strong><span>${Math.round(day.temperatureMin)}°</span></div>
      </article>
    `;
  }).join('');
  const quote = state.selectedDailyQuote || 'Keep going. Small steps still move you forward.';

  document.getElementById('weather-page').innerHTML = `
    <div class="page-header">
      <h2>Quote & Weather</h2>
      <p>Viherlaakso, Espoo · 7-day forecast</p>
    </div>
    <div class="quote-weather-layout">
      <section class="weather-quote-panel">
        <div class="code-label">TODAY’S QUOTE</div>
        <div class="quote-value">${quote}</div>
      </section>
      <section class="weekly-weather-panel">
        <div class="weekly-weather-heading">
          <div>
            <h3>Weather this week</h3>
            <p>${current?.description?.label || 'Forecast'} · ${Math.round(current?.temperature ?? 0)}° now</p>
          </div>
          <span class="weather-icon">${current?.description?.icon || mapWeatherCode(1).icon}</span>
        </div>
        <div class="weekly-weather-grid">${weeklyTiles}</div>
      </div>
      </section>
    </div>
  `;
}

function renderSchedulePage() {
  const date = state.selectedScheduleDate || getHelsinkiDateKey();
  state.selectedScheduleDate = date;
  const cards = state.schedules.map((child) => {
    const entries = child.days[date] || [];
    const lines = entries.map((entry) => `
      <div class="timeline-row">
        <time>${entry.start}–${entry.end}</time>
        <span>${entry.title}</span>
        <span>${entry.location || ''}</span>
      </div>
    `).join('');
    return `
      <div class="timeline-card">
        <h3>${child.name}</h3>
        <div class="timeline-events">${lines || '<p>No events scheduled.</p>'}</div>
      </div>
    `;
  }).join('');

  document.getElementById('schedule-page').innerHTML = `
    <div class="page-header">
      <h2>Schedule</h2>
      <div class="schedule-actions">
        <label class="schedule-date-control">Date <input id="schedule-date" type="date" value="${date}"></label>
        <button id="update-schedules" type="button" class="nav-btn" ${state.scheduleUpdating ? 'disabled' : ''}>${state.scheduleUpdating ? 'Updating...' : 'Update schedules'}</button>
      </div>
    </div>
    <p class="schedule-status" role="status" aria-live="polite">${state.scheduleStatus}</p>
    <div class="timeline-grid">${cards}</div>
  `;
  document.getElementById('update-schedules').addEventListener('click', updateSchedulesFromIcs);
  document.getElementById('schedule-date').addEventListener('change', (event) => {
    if (!event.target.value) return;
    state.selectedScheduleDate = event.target.value;
    renderSchedulePage();
  });
}

function renderTransportPage() {
  const groups = (state.transport?.routes || []).map((route) => {
    const departures = (route.departures || []).map((item) => {
      const delayText = item.delay ? `+${item.delay} min` : 'On time';
      return `
        <div class="departure-item">
          <span>${item.route}</span>
          <span>${item.destination}</span>
          <span>${item.realtime || item.scheduled}</span>
          <span>${delayText}</span>
        </div>
      `;
    }).join('');

    return `
      <div class="transport-card">
        <h3>${route.label}</h3>
        <div class="departure-list">${departures || '<p>No departures found.</p>'}</div>
      </div>
    `;
  }).join('');

  document.getElementById('transport-page').innerHTML = `
    <div class="page-header">
      <h2>Public transport</h2>
      <p>Live departures and fallback data</p>
    </div>
    <div class="transport-grid">${groups}</div>
  `;
}

function renderDailyCodePage() {
  const quote = state.selectedDailyQuote || 'Keep going. Small steps still move you forward.';
  const today = formatDateLong(new Date());
  document.getElementById('daily-code-page').innerHTML = `
    <div class="page-header">
      <h2>Today’s quote</h2>
      <p>${today}</p>
    </div>
    <div class="code-panel">
      <div class="code-label">MOTIVATION</div>
      <div class="quote-value">${quote}</div>
      <p>Replace the text file in data/daily-quotes.txt with your favorite motivational text.</p>
    </div>
  `;
}

function renderAll() {
  renderPageNavigation();
  renderPages();
  renderSummaryPage();
  renderElectricityPage();
  renderWeatherPage();
  renderSchedulePage();
  renderTransportPage();
  renderDailyCodePage();
}

async function refreshLiveData() {
  if (state.liveRefreshRunning) return;
  state.liveRefreshRunning = true;
  try {
    const interval = (state.config.refreshIntervals.electricityMinutes || 15) * 60000;
    if (Date.now() - state.electricityRefreshAt >= interval) {
      state.electricity = await fetchElectricityFeed(state.config.electricity.sourceUrl, state.electricity);
      state.electricityRefreshAt = Date.now();
    }
    renderAll();
    state.transport = await fetchTransportData(state.config);
    renderAll();
  } finally {
    state.liveRefreshRunning = false;
  }
}

function startRotation() {
  if (state.rotationHandle) clearInterval(state.rotationHandle);
  if (state.rotationPaused) return;

  state.rotationHandle = setInterval(() => {
    if (state.rotationPaused) return;
    const enabledPages = state.pageOrder.filter((pageId) => state.config.pages[pageId]?.enabled);
    if (!enabledPages.length) return;
    const currentIndex = enabledPages.indexOf(state.activePage);
    const nextIndex = currentIndex === enabledPages.length - 1 ? 0 : currentIndex + 1;
    state.activePage = enabledPages[nextIndex];
    renderAll();
  }, (state.config.pages[state.activePage]?.durationSeconds || 20) * 1000);
}

function resetRotationTimer() {
  if (!state.config?.display?.autoRotate) return;
  if (state.rotationPaused) return;
  startRotation();
}

function handleKeydown(event) {
  if (event.key === 'ArrowRight') {
    cyclePage(1);
  } else if (event.key === 'ArrowLeft') {
    cyclePage(-1);
  } else if (event.key === 'Home') {
    state.activePage = 'summary';
    renderAll();
  } else if (event.key === 'f' || event.key === 'F') {
    document.documentElement.requestFullscreen?.();
  } else if (event.key === ' ') {
    event.preventDefault();
    state.rotationPaused = !state.rotationPaused;
    if (!state.rotationPaused) resetRotationTimer();
  }
}

function cyclePage(direction) {
  const enabledPages = state.pageOrder.filter((pageId) => state.config.pages[pageId]?.enabled);
  const currentIndex = enabledPages.indexOf(state.activePage);
  const safeIndex = currentIndex === -1 ? 0 : currentIndex;
  const nextIndex = (safeIndex + direction + enabledPages.length) % enabledPages.length;
  state.activePage = enabledPages[nextIndex];
  renderAll();
  resetRotationTimer();
}

async function initializeDashboard() {
  state.config = await fetchJSON('./config/dashboard.json');
  state.pageOrder = Object.keys(state.config.pages).filter((pageId) => state.config.pages[pageId].enabled);
  state.selectedScheduleDate = getHelsinkiDateKey();
  state.schedules = await loadSchedules();
  state.weather = await fetchWeatherData(state.config.location.latitude, state.config.location.longitude).catch(() => null);
  state.electricity = await fetchElectricityFeed(state.config.electricity.sourceUrl);
  state.electricityRefreshAt = Date.now();
  state.transport = await fetchTransportData(state.config).catch(() => ({ routes: [] }));

  const dailyQuotesText = await fetch('./data/daily-quotes.txt').then((response) => response.text()).catch(() => 'Keep going. Small steps still move you forward.');
  const today = new Date().toISOString().slice(0, 10);
  const dailyConfig = state.config.dailyQuote || state.config.dailyCode || {};
  state.selectedDailyQuote = getDailyCodeForDate(dailyQuotesText, today, dailyConfig.startDate || '2026-11-16');

  document.addEventListener('keydown', handleKeydown);
  updateClock();
  setInterval(() => {
    updateClock();
    const minute = Math.floor(Date.now() / 60000);
    if (state.electricityRenderMinute !== minute) {
      state.electricityRenderMinute = minute;
      renderSummaryPage();
      renderElectricityPage();
    }
  }, 1000);
  setInterval(() => {
    refreshLiveData();
  }, 30000);
  renderAll();
  if (state.config.display.autoRotate) {
    startRotation();
  }
}

initializeDashboard();
