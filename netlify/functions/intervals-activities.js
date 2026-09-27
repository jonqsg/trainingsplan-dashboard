// Proxy: liefert die Aktivitäten aus intervals.icu, auf die Felder
// gemappt, die das Dashboard erwartet (inkl. Leistungs- und FTP-Werten für den FTP-Verlauf).
const { intervalsFetch, athleteId, daysAgo, isoDate } = require("./lib/intervalsClient");

exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};
    const oldest = q.oldest || daysAgo(45);
    const newest = q.newest || isoDate(new Date());
    const id = athleteId();

    const data = await intervalsFetch(`/athlete/${id}/activities?oldest=${oldest}&newest=${newest}`);
    const mapped = (Array.isArray(data) ? data : []).map((a) => ({
      id: a.id ?? null,
      date: (a.start_date_local || a.start_date || "").slice(0, 10),
      name: a.name || a.type || "Aktivität",
      type: a.type || null,
      km: a.distance ? +(a.distance / 1000).toFixed(1) : (a.distance_meters ? +(a.distance_meters / 1000).toFixed(1) : 0),
      min: a.moving_time ? Math.round(a.moving_time / 60) : (a.moving_time_seconds ? Math.round(a.moving_time_seconds / 60) : 0),
      elev: Math.round(a.total_elevation_gain ?? a.elevation_gain_meters ?? 0),
      hr: a.average_heartrate ?? null,
      load: a.icu_training_load ?? a.training_load ?? null,
      watts: a.icu_average_watts ?? a.average_watts ?? null,
      np: a.icu_weighted_avg_watts ?? null,
      ftp: a.icu_ftp ?? null,
      eftp: a.icu_pm_ftp ?? a.icu_eftp ?? null,
      rpe: a.icu_rpe ?? null,
    })).sort((x, y) => (x.date < y.date ? 1 : -1));

    return { statusCode: 200, headers: cors(), body: JSON.stringify(mapped) };
  } catch (e) {
    return { statusCode: 502, headers: cors(), body: JSON.stringify({ error: e.message }) };
  }
};

function cors() {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
}
