// Dünner Wrapper um die intervals.icu API.
// Hält den API-Key serverseitig (nie im Browser sichtbar).
// Auth-Methode: HTTP Basic mit Nutzername "API_KEY" und dem echten Key als Passwort
// (Standard-Methode laut intervals.icu-Community/Doku, siehe README).
const BASE = "https://intervals.icu/api/v1";

function authHeader() {
  const key = process.env.INTERVALS_API_KEY;
  if (!key) throw new Error("INTERVALS_API_KEY ist nicht gesetzt (Netlify-Umgebungsvariable fehlt).");
  const basic = Buffer.from(`API_KEY:${key}`).toString("base64");
  return `Basic ${basic}`;
}

function athleteId() {
  const id = process.env.INTERVALS_ATHLETE_ID;
  if (!id) throw new Error("INTERVALS_ATHLETE_ID ist nicht gesetzt (Netlify-Umgebungsvariable fehlt).");
  return id;
}

async function intervalsFetch(path, options = {}) {
  // Bei FormData (Datei-Upload) setzt fetch den multipart-Content-Type samt Boundary selbst
  const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: authHeader(),
      ...(isForm ? {} : { "Content-Type": "application/json" }),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`intervals.icu ${res.status}: ${text || res.statusText}`);
  }
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : res.text();
}

function isoDate(d) { return d.toISOString().slice(0, 10); }
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return isoDate(d); }

module.exports = { intervalsFetch, athleteId, isoDate, daysAgo };
