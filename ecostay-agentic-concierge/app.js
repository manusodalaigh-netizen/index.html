const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQTSG7mXF31DN0TdGq0yVnq7iq840j6L5BiTWz1T0OUPOfW9VIKWRx_J57LcU1QzhDd3bP5VQMuG6Ba/pub?gid=455463878&single=true&output=csv";
const SHEET_GVIZ_BASE_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQTSG7mXF31DN0TdGq0yVnq7iq840j6L5BiTWz1T0OUPOfW9VIKWRx_J57LcU1QzhDd3bP5VQMuG6Ba/gviz/tq?headers=1&gid=455463878";
const SHEET_CSV_PROXY_URL = `https://api.allorigins.win/raw?url=${encodeURIComponent(SHEET_CSV_URL)}`;

const COUNTY_COORDS = {
  Wicklow: { latitude: 53.0118, longitude: -6.3272 },
  Clare: { latitude: 52.8449, longitude: -8.9863 },
  Galway: { latitude: 53.2707, longitude: -9.0568 },
  Kerry: { latitude: 52.1545, longitude: -9.5669 },
  Mayo: { latitude: 53.9346, longitude: -9.3516 },
  Cork: { latitude: 51.8985, longitude: -8.4756 }
};

const statusDot = document.getElementById("statusDot");
const dataStatus = document.getElementById("dataStatus");
const lastFetch = document.getElementById("lastFetch");
const recommendation = document.getElementById("recommendation");
const rowCount = document.getElementById("rowCount");
const packageTable = document.getElementById("packageTable");
const sheetLink = document.getElementById("sheetLink");

sheetLink.href = SHEET_CSV_URL;

let cachedPackages = [];
let lastFetchMethod = "none";

function setStatus(message, kind = "waiting") {
  dataStatus.textContent = message;
  statusDot.className = "status-dot";
  if (kind === "ok") statusDot.classList.add("ok");
  if (kind === "error") statusDot.classList.add("error");
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (cell !== "" || row.length > 0) {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      }
      if (char === "\r" && next === "\n") i++;
    } else {
      cell += char;
    }
  }

  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  const headers = rows.shift().map(header => header.trim());
  return rows
    .filter(values => values.some(value => value.trim() !== ""))
    .map(values => Object.fromEntries(headers.map((header, index) => [header, (values[index] || "").trim()])));
}

function normalisePackages(packages) {
  return packages.map(item => ({
    ...item,
    price_per_night_eur: Number(item.price_per_night_eur),
    available_slots: Number(item.available_slots),
    eco_score: Number(item.eco_score)
  }));
}

function fetchWithTimeout(url, options = {}, timeoutMs = 7000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, {
    ...options,
    cache: "no-store",
    signal: controller.signal
  }).finally(() => window.clearTimeout(timer));
}

async function fetchPackagesFromCSV() {
  const separator = SHEET_CSV_URL.includes("?") ? "&" : "?";
  const response = await fetchWithTimeout(`${SHEET_CSV_URL}${separator}cacheBust=${Date.now()}`);
  if (!response.ok) {
    throw new Error(`Google Sheet CSV fetch failed with status ${response.status}`);
  }
  const text = await response.text();
  lastFetchMethod = "published Google Sheet CSV";
  return normalisePackages(parseCSV(text));
}

function fetchPackagesFromGvizJSONP() {
  return new Promise((resolve, reject) => {
    const callbackName = `__ecostaySheetCallback_${Date.now()}`;
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Google Visualization fallback timed out"));
    }, 9000);

    function cleanup() {
      window.clearTimeout(timeout);
      script.remove();
      try { delete window[callbackName]; } catch (_) { window[callbackName] = undefined; }
    }

    window[callbackName] = response => {
      try {
        if (!response || response.status === "error") {
          const detail = response?.errors?.[0]?.detailed_message || "Unknown Google Sheets response error";
          throw new Error(detail);
        }

        const headers = response.table.cols
          .map(col => col.label || col.id)
          .map(header => String(header).trim());

        const rows = response.table.rows.map(row => {
          const values = row.c.map(cell => (cell ? (cell.v ?? cell.f ?? "") : ""));
          return Object.fromEntries(headers.map((header, index) => [header, String(values[index] ?? "").trim()]));
        });

        cleanup();
        lastFetchMethod = "Google Visualization JSONP fallback";
        resolve(normalisePackages(rows.filter(item => item.package_id)));
      } catch (error) {
        cleanup();
        reject(error);
      }
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("Google Visualization fallback script failed to load"));
    };

    const tqx = encodeURIComponent(`out:json;responseHandler:${callbackName}`);
    script.src = `${SHEET_GVIZ_BASE_URL}&tqx=${tqx}&cacheBust=${Date.now()}`;
    document.head.appendChild(script);
  });
}

async function fetchPackagesFromProxyCSV() {
  const separator = SHEET_CSV_PROXY_URL.includes("?") ? "&" : "?";
  const response = await fetchWithTimeout(`${SHEET_CSV_PROXY_URL}${separator}cacheBust=${Date.now()}`, {}, 9000);
  if (!response.ok) {
    throw new Error(`CORS proxy CSV fetch failed with status ${response.status}`);
  }
  const text = await response.text();
  lastFetchMethod = "published CSV through CORS proxy";
  return normalisePackages(parseCSV(text));
}

async function fetchPackages() {
  setStatus("Fetching live Google Sheet data...", "waiting");
  const errors = [];

  for (const attempt of [
    ["direct published CSV", fetchPackagesFromCSV],
    ["Google Visualization JSONP", fetchPackagesFromGvizJSONP],
    ["CORS proxy CSV", fetchPackagesFromProxyCSV]
  ]) {
    const [label, fn] = attempt;
    try {
      const packages = await fn();
      if (!packages.length) {
        throw new Error(`${label} returned zero rows`);
      }
      cachedPackages = packages;
      rowCount.textContent = String(packages.length);
      lastFetch.textContent = `Last fetched: ${new Date().toLocaleString()} via ${lastFetchMethod}`;
      setStatus("Live package data loaded", "ok");
      renderTable(packages);
      return packages;
    } catch (error) {
      console.warn(`${label} failed`, error);
      errors.push(`${label}: ${error.message}`);
    }
  }

  throw new Error(errors.join(" | "));
}

function renderTable(packages) {
  if (!packages.length) {
    packageTable.innerHTML = "<p>No package rows fetched yet.</p>";
    return;
  }

  const headers = Object.keys(packages[0]);
  const headerHtml = headers.map(header => `<th>${header}</th>`).join("");
  const rowHtml = packages.map(pkg => {
    const cells = headers.map(header => `<td>${pkg[header]}</td>`).join("");
    return `<tr>${cells}</tr>`;
  }).join("");

  packageTable.innerHTML = `<table><thead><tr>${headerHtml}</tr></thead><tbody>${rowHtml}</tbody></table>`;
}

function scorePackage(pkg, preferences) {
  let score = 0;
  const reasons = [];

  if (pkg.available_slots > 0) {
    score += 25;
    reasons.push(`${pkg.available_slots} available slot(s)`);
  } else {
    score -= 100;
    reasons.push("currently has zero availability");
  }

  if (preferences.county === "any" || pkg.county === preferences.county) {
    score += preferences.county === "any" ? 5 : 25;
    if (preferences.county !== "any") reasons.push(`matches your preferred county: ${pkg.county}`);
  }

  if (pkg.price_per_night_eur <= preferences.budget) {
    score += 20;
    reasons.push(`within your €${preferences.budget} budget`);
  } else {
    score -= 15;
    reasons.push(`above your €${preferences.budget} budget`);
  }

  const bestFor = pkg.best_for.toLowerCase();
  if (preferences.stylePreference === "any" || bestFor.includes(preferences.stylePreference)) {
    score += preferences.stylePreference === "any" ? 5 : 20;
    if (preferences.stylePreference !== "any") reasons.push(`fits your ${preferences.stylePreference} travel style`);
  }

  if (preferences.ecoPriority) {
    score += pkg.eco_score * 3;
    reasons.push(`eco-score ${pkg.eco_score}/10`);
  }

  return { pkg, score, reasons };
}

async function fetchWeather(county) {
  const coords = COUNTY_COORDS[county];
  if (!coords) return null;

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude}&longitude=${coords.longitude}&current=temperature_2m,precipitation,wind_speed_10m&timezone=Europe%2FDublin`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Weather fetch failed with status ${response.status}`);
  const data = await response.json();
  return data.current;
}

function weatherAdvice(weather, packageIsWeatherSensitive) {
  if (!weather) return "Weather data was not requested or could not be loaded.";

  const temp = weather.temperature_2m;
  const precipitation = weather.precipitation;
  const wind = weather.wind_speed_10m;

  let advice = `Live weather: ${temp}°C, ${precipitation}mm precipitation, wind ${wind}km/h.`;
  if (packageIsWeatherSensitive && precipitation > 1) {
    advice += " Because this stay is weather-sensitive, the customer may want flexible dates or a human follow-up before booking.";
  } else if (packageIsWeatherSensitive) {
    advice += " Conditions look suitable for an outdoor-focused stay, based on the current live forecast.";
  } else {
    advice += " This package is less weather-sensitive, so current weather is a lower-risk factor.";
  }

  return advice;
}

function renderRecommendation(best, alternatives, weather) {
  const pkg = best.pkg;
  const isUnavailable = pkg.available_slots === 0;
  const weatherText = weatherAdvice(weather, pkg.weather_sensitive.toLowerCase() === "yes");
  const alternativeHtml = alternatives.slice(0, 2).map(item => `
    <li><strong>${item.pkg.name}</strong> in ${item.pkg.county}: €${item.pkg.price_per_night_eur}, ${item.pkg.available_slots} slot(s), eco-score ${item.pkg.eco_score}/10.</li>
  `).join("");

  recommendation.className = "recommendation-card";
  recommendation.innerHTML = `
    <div>
      <p class="eyebrow">Recommended package</p>
      <h3>${pkg.name}</h3>
      <p>${pkg.description}</p>
    </div>
    <div class="meta">
      <span class="pill">${pkg.location}, ${pkg.county}</span>
      <span class="pill">€${pkg.price_per_night_eur} per night</span>
      <span class="pill">${pkg.available_slots} slot(s)</span>
      <span class="pill">Eco-score ${pkg.eco_score}/10</span>
    </div>
    ${isUnavailable ? `<div class="warning"><strong>Human handoff recommended:</strong> this package has zero availability in the live sheet, so it should not be presented as bookable.</div>` : ""}
    <div>
      <h4>Why this match?</h4>
      <ul>${best.reasons.map(reason => `<li>${reason}</li>`).join("")}</ul>
    </div>
    <div>
      <h4>Live weather note</h4>
      <p>${weatherText}</p>
    </div>
    <div>
      <h4>Alternatives from live sheet</h4>
      <ul>${alternativeHtml || "<li>No strong alternatives found.</li>"}</ul>
    </div>
  `;
}

document.getElementById("preferenceForm").addEventListener("submit", async event => {
  event.preventDefault();

  const preferences = {
    county: document.getElementById("county").value,
    budget: Number(document.getElementById("budget").value),
    stylePreference: document.getElementById("stylePreference").value,
    ecoPriority: document.getElementById("ecoPriority").checked,
    weatherAware: document.getElementById("weatherAware").checked
  };

  recommendation.className = "placeholder";
  recommendation.textContent = "Fetching live data and generating recommendation...";

  try {
    const packages = await fetchPackages();
    const ranked = packages
      .map(pkg => scorePackage(pkg, preferences))
      .sort((a, b) => b.score - a.score);

    const best = ranked[0];
    let weather = null;
    if (preferences.weatherAware) {
      weather = await fetchWeather(best.pkg.county);
    }

    renderRecommendation(best, ranked.slice(1), weather);
  } catch (error) {
    setStatus("Live data fetch failed", "error");
    recommendation.className = "placeholder";
    recommendation.innerHTML = `<strong>Something went wrong:</strong> ${error.message}<br><br>Check that the Google Sheet is still published as CSV and reachable without login.`;
  }
});

// Fetch once on load so the evidence table is ready before the user submits preferences.
fetchPackages().catch(error => {
  console.error(error);
  setStatus("Initial live data fetch failed", "error");
  lastFetch.textContent = error.message;
});
