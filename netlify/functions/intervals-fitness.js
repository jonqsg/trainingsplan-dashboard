// Proxy: liefert CTL/ATL (Fitness/Fatigue) plus Wellness-Werte (HRV, Ruhepuls, Schlaf …)
// aus intervals.icu für einen Zeitraum.
// TSB wird hier berechnet (ctl - atl), da intervals.icu es nicht immer als eigenes Feld liefert.
const { intervalsFetch, athleteId, daysAgo, isoDate } = require("./lib/intervalsClient");

exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};
    const oldest = q.oldest || daysAgo(90);
    const newest = q.newest || isoDate(new Date());
    const id = athleteId();

    const data = await intervalsFetch(`/athlete/${id}/wellness?oldest=${oldest}&newest=${newest}`);
    const mapped = (Array.isArray(data) ? data : []).map((d) => {
      const day = (d.id || d.date || "").slice(0, 10);
      return {
        day,
        date: day.slice(5), // "MM-DD"
        ctl: d.ctl ?? null,
        atl: d.atl ?? null,
        tsb: (d.ctl != null && d.atl != null) ? +(d.ctl - d.atl).toFixed(1) : null,
        hrv: d.hrv ?? null,
        restingHR: d.restingHR ?? null,
        sleepSecs: d.sleepSecs ?? null,
        sleepScore: d.sleepScore ?? null,
        readiness: d.readiness ?? null,
        soreness: d.soreness ?? null,
        fatigue: d.fatigue ?? null,
        stress: d.stress ?? null,
        weight: d.weight ?? null,
      };
    }).filter((d) => d.ctl != null);

    return { statusCode: 200, headers: cors(), body: JSON.stringify(mapped) };
  } catch (e) {
    return { statusCode: 502, headers: cors(), body: JSON.stringify({ error: e.message }) };
  }
};

function cors() {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
}
