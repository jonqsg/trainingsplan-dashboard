// Proxy: Details einer einzelnen Aktivität für die Detailseite im Dashboard —
// vor allem die Intervalle/Laps, die in der Aktivitätenliste nicht enthalten sind.
// ?strava=<id> → Runden direkt von Strava (für Aktivitäten, die intervals.icu nur als Stub liefert)
const { intervalsFetch } = require("./lib/intervalsClient");
const { planStore } = require("./lib/blobStore");
const strava = require("./lib/strava");

exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};
    if (q.strava) {
      const token = await strava.accessToken(planStore(event));
      if (!token) throw new Error("Strava ist nicht verbunden.");
      const laps = await strava.stravaFetch(token, `/activities/${encodeURIComponent(q.strava)}/laps`);
      const intervals = (Array.isArray(laps) ? laps : []).map((l) => ({
        label: l.name || null, type: null, secs: l.moving_time ?? l.elapsed_time ?? null,
        km: l.distance ? +(l.distance / 1000).toFixed(2) : null,
        watts: l.device_watts ? l.average_watts ?? null : null, hr: l.average_heartrate ?? null, intensity: null, zone: null,
      }));
      return { statusCode: 200, headers: cors(), body: JSON.stringify({ id: q.strava, intervals, source: "strava" }) };
    }
    const id = q.id;
    if (!id) throw new Error("id fehlt.");
    const a = await intervalsFetch(`/activity/${encodeURIComponent(id)}?intervals=true`);
    const intervals = (Array.isArray(a && a.icu_intervals) ? a.icu_intervals : []).map((i) => ({
      label: i.label || null,
      type: i.type || null,                       // z.B. WORK / RECOVERY
      secs: i.moving_time ?? i.elapsed_time ?? null,
      km: i.distance ? +(i.distance / 1000).toFixed(2) : null,
      watts: i.average_watts ?? null,
      hr: i.average_heartrate ?? null,
      intensity: i.intensity ?? null,
      zone: i.zone ?? null,
    }));
    return { statusCode: 200, headers: cors(), body: JSON.stringify({ id, intervals, stub: !!(a && a._note) }) };
  } catch (e) {
    return { statusCode: 502, headers: cors(), body: JSON.stringify({ error: e.message }) };
  }
};

function cors() {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
}
