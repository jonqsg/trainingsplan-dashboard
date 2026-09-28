// Proxy: Details einer einzelnen Aktivität für die Detailseite im Dashboard —
// vor allem die Intervalle/Laps, die in der Aktivitätenliste nicht enthalten sind.
const { intervalsFetch } = require("./lib/intervalsClient");

exports.handler = async (event) => {
  try {
    const id = (event.queryStringParameters || {}).id;
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
