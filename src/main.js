import { getDailyCodeForDate } from './services/dailyCodeService.js';
import { getAveragePrice, getCheapestInterval, getCurrentInterval, getElectricityBarColor, getElectricityBarHeight, getMostExpensiveInterval, getPriceColor, shouldShowTomorrowElectricity } from './services/electricityService.js';
import { fetchTransportData, getDepartureMinutesUntil, getSortedDepartures } from './services/transportService.js';
import { resolveCurrentScheduleState } from './services/scheduleService.js';
import { fetchWeatherData, mapWeatherCode } from './services/weatherService.js';
import { formatCountdown, formatDateLong, formatHHMM, formatHHMMSS, formatPrice, getWeekdayKey, parseHHMM } from './utils/time.js';

const state = {
  config: null,
  weather: null,
  electricity: null,
  transport: null,
  schedules: [],
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
  const files = ['child1', 'child2', 'child3'];
  const results = await Promise.all(
    files.map(async (fileName) => {
      const payload = await fetchJSON(`./data/schedules/${fileName}.json`);
      const name = fileName === 'child1' ? 'Ari' : fileName === 'child2' ? 'Mila' : 'Luca';
      return { name, schedule: payload };
    })
  );
  return results;
}

function updateClock() {
  const now = new Date();
  const time = formatHHMMSS(now);
  const dateText = formatDateLong(now);
  document.getElementById('header-time').textContent = time;
  document.getElementById('header-date').textContent = dateText;
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

function renderElectricityChart(intervals, compact = false, split = false) {
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
    const label = minute === '00' ? hour : '';
    return `<div class="chart-bar-wrap"><div class="chart-bar ${color}" style="height:${height}%"></div><span>${label}</span></div>`;
  }).join('');

  const chartSize = compact ? ' electricity-chart--compact' : split ? ' electricity-chart--split' : '';
  return `<div class="electricity-chart${chartSize}">${yAxis}<div class="chart-bars">${gridLines}${bars}</div></div>`;
}

function renderSummaryPage() {
  const weatherSummary = state.weather?.current;
  const currentWeatherCode = weatherSummary?.description || mapWeatherCode(0);
  const hourlyCards = (state.weather?.hourly || []).slice(0, 6).map((hour) => {
    const label = new Date(hour.time).toLocaleTimeString('en-GB', { timeZone: 'Europe/Helsinki', hour: '2-digit', hour12: false });
    return `
      <div class="mini-hour-card">
        <div>${label}</div>
        <div class="mini-weather-icon">${hour.description.icon}</div>
        <div>${Math.round(hour.temperature)}°</div>
      </div>
    `;
  }).join('');

  const chartIntervals = state.electricity?.intervals || [];
  const currentInterval = getCurrentInterval(state.electricity?.intervals || [], new Date());
  const priceValue = currentInterval ? currentInterval.value : 0;
  const avgPrice = getAveragePrice(chartIntervals);
  const cheapest = getCheapestInterval(chartIntervals);
  const expensive = getMostExpensiveInterval(chartIntervals);
  const priceColor = getPriceColor(priceValue, state.config.electricity.lowThreshold, state.config.electricity.highThreshold);

  const displayPrice = priceValue.toFixed(1);
  const vatMultiplier = 1 + (state.config.electricity.vatPercent || 0) / 100;
  const priceIncludingVat = (priceValue * vatMultiplier).toFixed(1);

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
      <span class="tag ${priceColor}">${priceColor}</span>
    </div>
    <div class="big-price">${displayPrice} c/kWh</div>
    <div class="subtle-line">Incl. VAT ${priceIncludingVat} c/kWh</div>
    <div class="chart-period-label">Today prices</div>
    <div class="stat-grid">
      <div><label>Average</label><strong>${avgPrice.toFixed(1)}</strong></div>
      <div><label>Cheapest</label><strong>${cheapest ? cheapest.value.toFixed(1) : '--'}</strong></div>
      <div><label>Most expensive</label><strong>${expensive ? expensive.value.toFixed(1) : '--'}</strong></div>
    </div>
    ${electricityChart}
  `;

  const now = new Date();
  const transportDepartures = getSortedDepartures(state.transport?.routes || [], 2, now);
  const transportHtml = transportDepartures.map((item) => {
    const departureTime = item.realtime || item.scheduled;
    const minutesUntil = getDepartureMinutesUntil(item.timestamp, now);
    const delay = item.delay > 0 ? `+${item.delay}m` : '';
    return `<div class="transport-departure"><div class="transport-departure-time"><time>${departureTime}</time><span class="transport-countdown">(in ${minutesUntil} Mins)</span></div><strong>${item.route}</strong><span>${item.destination}</span><small>${item.stopName}${delay ? ` · ${delay}` : ''}</small></div>`;
  }).join('');

  document.getElementById('summary-transport').innerHTML = `
    <div class="card-header"><h3>HSL Departures</h3><span class="tag">${transportDepartures.length ? 'Live' : 'Unavailable'}</span></div>
    <div class="transport-departures">${transportHtml || '<p>No upcoming departures available.</p>'}</div>
  `;

  const scheduleCards = state.schedules.map((child, index) => {
    const weekdayKey = getWeekdayKey(new Date());
    const resolved = resolveCurrentScheduleState(child.schedule, new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/Helsinki', hour: '2-digit', minute: '2-digit', hour12: false }), weekdayKey);
    const currentTitle = resolved.current?.title || 'No activity';
    const nextTitle = resolved.next?.title || '—';
    return `
      <div class="child-summary">
        <h4>${child.name}</h4>
        <div class="schedule-status">${resolved.status}</div>
        <div><strong>Now:</strong> ${currentTitle}</div>
        <div><strong>Next:</strong> ${nextTitle}</div>
      </div>
    `;
  }).join('');

  document.getElementById('summary-schedule').innerHTML = `
    <div class="card-header"><h3>Family schedule</h3></div>
    <div class="schedule-summary-grid">${scheduleCards}</div>
  `;

  const dailyQuoteValue = state.selectedDailyQuote || 'Keep going. Small steps still move you forward.';
  document.getElementById('summary-code').innerHTML = `
    <div class="card-header"><h3>Daily quote</h3></div>
    <div class="quote-box">${dailyQuoteValue}</div>
  `;
}

function renderElectricityPage() {
  const todayIntervals = state.electricity?.intervals || [];
  const tomorrowIntervals = state.electricity?.tomorrowIntervals || [];
  const showTomorrow = shouldShowTomorrowElectricity(state.electricity || {}, new Date());
  const current = getCurrentInterval(state.electricity?.intervals || [], new Date());
  const renderPeriod = (label, intervals) => `
    <section class="electricity-period">
      <h3>${label}</h3>
      <div class="stats-row">
        <div class="stat-box"><span>Average</span><strong>${getAveragePrice(intervals).toFixed(1)} c/kWh</strong></div>
        <div class="stat-box"><span>Cheapest</span><strong>${getCheapestInterval(intervals)?.value.toFixed(1) ?? '--'} c/kWh</strong></div>
        <div class="stat-box"><span>Most expensive</span><strong>${getMostExpensiveInterval(intervals)?.value.toFixed(1) ?? '--'} c/kWh</strong></div>
      </div>
      ${renderElectricityChart(intervals, false, showTomorrow)}
    </section>
  `;

  document.getElementById('electricity-page').innerHTML = `
    <div class="page-header">
      <h2>Electricity</h2>
      <p>Finland price zone • current ${current ? current.value.toFixed(1) : '--'} c/kWh</p>
    </div>
    <div class="electricity-period-grid${showTomorrow ? ' electricity-period-grid--both' : ''}">
      ${renderPeriod('Today', todayIntervals)}
      ${showTomorrow ? renderPeriod('Tomorrow', tomorrowIntervals) : ''}
    </div>
  `;
}

function renderWeatherPage() {
  const current = state.weather?.current;
  const hourly = (state.weather?.hourly || []).slice(0, 12).map((hour) => `
    <div class="weather-row-item">
      <div>${new Date(hour.time).toLocaleTimeString('en-GB', { timeZone: 'Europe/Helsinki', hour: '2-digit', hour12: false })}</div>
      <div>${hour.description.icon}</div>
      <div>${Math.round(hour.temperature)}°</div>
      <div>${hour.precipitationProbability ?? 0}%</div>
    </div>
  `).join('');

  document.getElementById('weather-page').innerHTML = `
    <div class="page-header">
      <h2>Weather</h2>
      <p>Viherlaakso, Espoo</p>
    </div>
    <div class="weather-header-block">
      <div class="weather-large">${Math.round(current?.temperature ?? 0)}°</div>
      <div>
        <h3>${current?.description?.label || 'Weather'}</h3>
        <p>Feels like ${Math.round(current?.feelsLike ?? 0)}° • Wind ${Math.round(current?.wind ?? 0)} km/h</p>
        <p>Humidity ${Math.round(current?.humidity ?? 0)}% • Precipitation ${Math.round(current?.precipitation ?? 0)} mm</p>
      </div>
    </div>
    <div class="weather-hourly-grid">${hourly}</div>
  `;
}

function renderSchedulePage() {
  const weekdayKey = getWeekdayKey(new Date());
  const cards = state.schedules.map((child) => {
    const entries = child.schedule[weekdayKey] || [];
    const lines = entries.map((entry) => `
      <div class="timeline-row">
        <span>${entry.start}</span>
        <span>${entry.title}</span>
        <span>${entry.location || '—'}</span>
      </div>
    `).join('');
    return `
      <div class="timeline-card">
        <h3>${child.name}</h3>
        ${lines || '<p>No activities found.</p>'}
      </div>
    `;
  }).join('');

  document.getElementById('schedule-page').innerHTML = `
    <div class="page-header">
      <h2>Family schedule</h2>
      <p>${weekdayKey[0].toUpperCase() + weekdayKey.slice(1)}</p>
    </div>
    <div class="timeline-grid">${cards}</div>
  `;
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
  try {
    const electricityData = await fetchJSON('./data/electricity/fi-prices.json', { cache: 'no-store' });
    if (electricityData?.intervals?.length) {
      state.electricity = electricityData;
    }
  } catch (error) {
    console.warn('Electricity refresh failed; keeping cached data.', error);
  }

  try {
    state.transport = await fetchTransportData(state.config);
  } catch (error) {
    console.warn('Transport refresh failed; keeping cached data.', error);
  }

  renderAll();
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
  const mapping = {
    ArrowRight: 1,
    ArrowLeft: -1,
    Home: 'summary',
    f: 'fullscreen',
    ' ': 'toggle-rotation',
  };

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
    document.getElementById('rotation-toggle').textContent = state.rotationPaused ? 'Resume' : 'Pause';
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
  state.schedules = await loadSchedules();
  state.weather = await fetchWeatherData(state.config.location.latitude, state.config.location.longitude).catch(() => null);
  state.electricity = await fetchJSON(state.config.electricity.sourceUrl, { cache: 'no-store' }).catch(() => ({ intervals: [] }));
  state.transport = await fetchTransportData(state.config).catch(() => ({ routes: [] }));

  const dailyQuotesText = await fetch('./data/daily-quotes.txt').then((response) => response.text()).catch(() => 'Keep going. Small steps still move you forward.');
  const today = new Date().toISOString().slice(0, 10);
  const dailyConfig = state.config.dailyQuote || state.config.dailyCode || {};
  state.selectedDailyQuote = getDailyCodeForDate(dailyQuotesText, today, dailyConfig.startDate || '2026-11-16');

  document.getElementById('rotation-toggle').addEventListener('click', () => {
    state.rotationPaused = !state.rotationPaused;
    document.getElementById('rotation-toggle').textContent = state.rotationPaused ? 'Resume' : 'Pause';
    if (!state.rotationPaused) resetRotationTimer();
  });

  document.getElementById('home-btn').addEventListener('click', () => {
    state.activePage = 'summary';
    renderAll();
  });

  document.getElementById('fullscreen-btn').addEventListener('click', () => {
    document.documentElement.requestFullscreen?.();
  });

  document.addEventListener('keydown', handleKeydown);
  updateClock();
  setInterval(updateClock, 1000);
  setInterval(() => {
    refreshLiveData();
  }, 30000);
  renderAll();
  if (state.config.display.autoRotate) {
    startRotation();
  }
}

initializeDashboard();
