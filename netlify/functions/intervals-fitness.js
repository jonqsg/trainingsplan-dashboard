// Proxy: liefert CTL/ATL (Fitness/Fatigue) aus intervals.icu für einen Zeitraum.
// TSB wird hier berechnet (ctl - atl), da intervals.icu es nicht immer als eigenes Feld liefert.
const { intervalsFetch, athleteId, daysAgo, isoDate } = require("./lib/intervalsClient");

exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};
    const oldest = q.oldest || daysAgo(30);
    const newest = q.newest || isoDate(new Date());
    const id = athleteId();

    const data = await intervalsFetch(`/athlete/${id}/wellness?oldest=${oldest}&newest=${newest}`);
    const mapped = (Array.isArray(data) ? data : []).map((d) => ({
      date: (d.id || d.date || "").slice(5), // "MM-DD"
      ctl: d.ctl ?? null,
      atl: d.atl ?? null,
      tsb: (d.ctl != null && d.atl != null) ? +(d.ctl - d.atl).toFixed(1) : null,
    })).filter((d) => d.ctl != null);

    return { statusCode: 200, headers: cors(), body: JSON.stringify(mapped) };
  } catch (e) {
    return { statusCode: 502, headers: cors(), body: JSON.stringify({ error: e.message }) };
  }
};

function cors() {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
}
