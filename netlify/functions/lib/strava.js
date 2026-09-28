// Strava-API-Client, um die Aktivitäten anzureichern, die intervals.icu wegen der
// Strava-Nutzungsbedingungen nur als leeren Stub herausgibt.
// Abgerufen werden ausschließlich die eigenen Daten des Athleten.
//
// Tokens: Strava tauscht den Refresh-Token bei jeder Erneuerung ggf. aus, deshalb liegt
// der aktuelle Stand in Netlify Blobs (strava-token.json). STRAVA_REFRESH_TOKEN aus den
// Umgebungsvariablen dient nur als Startwert, falls die Verbindung nicht über
// /.netlify/functions/strava-auth hergestellt wurde.
const BASE = "https://www.strava.com/api/v3";
const TOKEN_KEY = "strava-token.json";

const configured = () => !!(process.env.STRAVA_CLIENT_ID && process.env.STRAVA_CLIENT_SECRET);

async function tokenRequest(params) {
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.STRAVA_CLIENT_ID, client_secret: process.env.STRAVA_CLIENT_SECRET, ...params }),
  });
  if (!res.ok) throw new Error(`Strava-Token ${res.status}: ${await res.text().catch(() => res.statusText)}`);
  return res.json();
}

async function saveToken(store, t, athlete) {
  const prev = (await store.get(TOKEN_KEY, { type: "json" }).catch(() => null)) || {};
  const data = { access_token: t.access_token, refresh_token: t.refresh_token, expires_at: t.expires_at, athlete: athlete || t.athlete || prev.athlete || null };
  await store.setJSON(TOKEN_KEY, data);
  return data;
}

// Liefert einen gültigen Access-Token oder null, wenn Strava nicht verbunden ist
async function accessToken(store) {
  if (!configured()) return null;
  let t = await store.get(TOKEN_KEY, { type: "json" }).catch(() => null);
  if (!t && process.env.STRAVA_REFRESH_TOKEN) t = { refresh_token: process.env.STRAVA_REFRESH_TOKEN, expires_at: 0 };
  if (!t || !t.refresh_token) return null;
  if (t.access_token && t.expires_at * 1000 > Date.now() + 60_000) return t.access_token;
  const fresh = await tokenRequest({ grant_type: "refresh_token", refresh_token: t.refresh_token });
  return (await saveToken(store, fresh, t.athlete)).access_token;
}

async function stravaFetch(token, path) {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Strava ${res.status}: ${await res.text().catch(() => res.statusText)}`);
  return res.json();
}

// Aktivitäten im Zeitraum [fromDay, toDay] (YYYY-MM-DD), kurz zwischengespeichert,
// damit häufige Syncs die Strava-Ratenlimits nicht belasten.
const CACHE_KEY = "strava-activities.json";
const CACHE_MS = 10 * 60 * 1000;
async function stravaActivities(store, fromDay, toDay) {
  const cache = await store.get(CACHE_KEY, { type: "json" }).catch(() => null);
  if (cache && cache.from <= fromDay && cache.to >= toDay && Date.now() - cache.fetchedAt < CACHE_MS) return cache.list;
  const token = await accessToken(store);
  if (!token) return null;
  // Puffer von einem Tag je Seite wegen Zeitzonen (Strava filtert nach UTC-Epoch)
  const after = Math.floor(new Date(`${fromDay}T00:00:00Z`).getTime() / 1000) - 86400;
  const before = Math.floor(new Date(`${toDay}T23:59:59Z`).getTime() / 1000) + 86400;
  const list = [];
  for (let page = 1; page <= 5; page++) {
    const batch = await stravaFetch(token, `/athlete/activities?after=${after}&before=${before}&per_page=200&page=${page}`);
    list.push(...batch.map(compact));
    if (batch.length < 200) break;
  }
  await store.setJSON(CACHE_KEY, { from: fromDay, to: toDay, fetchedAt: Date.now(), list });
  return list;
}

// Nur die Felder, die das Dashboard braucht
function compact(s) {
  return {
    id: s.id, name: s.name, type: s.sport_type || s.type, start: (s.start_date_local || "").replace("Z", ""),
    startUtc: s.start_date, distance: s.distance, moving_time: s.moving_time, elapsed_time: s.elapsed_time,
    elev: s.total_elevation_gain, speed: s.average_speed, hr: s.average_heartrate, maxHr: s.max_heartrate,
    watts: s.average_watts, np: s.weighted_average_watts, deviceWatts: !!s.device_watts, cadence: s.average_cadence,
    kj: s.kilojoules, sufferScore: s.suffer_score ?? null, device: s.device_name || null,
  };
}

module.exports = { configured, accessToken, tokenRequest, saveToken, stravaFetch, stravaActivities, TOKEN_KEY };
