// Proxy: liefert die Aktivitäten aus intervals.icu, auf die Felder
// gemappt, die das Dashboard erwartet (inkl. Leistungs- und FTP-Werten für den FTP-Verlauf).
//
// Verknüpfung mit geplanten Workouts: intervals.icu paart Aktivitäten mit Kalender-Events.
// Die Paarung kommt als paired_event_id an der Aktivität bzw. paired_activity_id am Event —
// beides wird ausgewertet, damit das Dashboard exakt dieselbe Zuordnung zeigt.
//
// Achtung Strava: Aktivitäten, die über Strava nach intervals.icu kommen, gibt die API
// wegen der Strava-Nutzungsbedingungen nur als Stub zurück (ohne Dauer, Distanz, Name …).
// Die werden als stub:true markiert, damit das Dashboard nicht "0 min" anzeigt.
const { intervalsFetch, athleteId, daysAgo, isoDate } = require("./lib/intervalsClient");

exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};
    const oldest = q.oldest || daysAgo(45);
    const newest = q.newest || isoDate(new Date());
    const id = athleteId();

    const [data, events] = await Promise.all([
      intervalsFetch(`/athlete/${id}/activities?oldest=${oldest}&newest=${newest}`),
      // Events nur für die Paarung — schlägt das fehl, geht es ohne weiter
      intervalsFetch(`/athlete/${id}/events?oldest=${oldest}&newest=${newest}`).catch(() => []),
    ]);
    const eventByActivity = {};
    (Array.isArray(events) ? events : []).forEach((e) => {
      if (e && e.paired_activity_id != null) eventByActivity[String(e.paired_activity_id)] = e;
    });

    const mapped = (Array.isArray(data) ? data : []).map((a) => mapActivity(a, eventByActivity[String(a.id)]))
      .sort((x, y) => (x.start < y.start ? 1 : -1));

    return { statusCode: 200, headers: cors(), body: JSON.stringify(mapped) };
  } catch (e) {
    return { statusCode: 502, headers: cors(), body: JSON.stringify({ error: e.message }) };
  }
};

const num = (...v) => { for (const x of v) if (typeof x === "number" && !isNaN(x)) return x; return null; };
const mins = (s) => (s ? Math.round(s / 60) : 0);

function mapActivity(a, ev) {
  const movingSecs = num(a.moving_time, a.moving_time_seconds, a.icu_recording_time, a.elapsed_time);
  const distM = num(a.distance, a.icu_distance, a.distance_meters);
  const stub = !movingSecs && !distM && (a.source === "STRAVA" || !!a._note);
  return {
    id: a.id ?? null,
    date: (a.start_date_local || a.start_date || "").slice(0, 10),
    start: a.start_date_local || a.start_date || "",
    name: a.name || (ev && ev.name) || a.type || "Aktivität",
    type: a.type || (ev && ev.type) || null,
    source: a.source || null,
    stub,
    note: a._note || null,
    pairedEventId: a.paired_event_id ?? (ev ? ev.id : null),
    km: distM ? +(distM / 1000).toFixed(1) : 0,
    min: mins(movingSecs),
    elapsedMin: mins(num(a.elapsed_time)),
    elev: Math.round(num(a.total_elevation_gain, a.elevation_gain_meters) ?? 0),
    hr: num(a.average_heartrate),
    maxHr: num(a.max_heartrate),
    load: num(a.icu_training_load, a.training_load),
    intensity: num(a.icu_intensity),
    watts: num(a.icu_average_watts, a.average_watts),
    np: num(a.icu_weighted_avg_watts),
    ftp: num(a.icu_ftp),
    eftp: num(a.icu_pm_ftp, a.icu_eftp),
    rpe: num(a.icu_rpe),
    feel: num(a.feel),
    speed: num(a.average_speed),        // m/s
    cadence: num(a.average_cadence),
    calories: num(a.calories),
    trimp: num(a.trimp),
    decoupling: num(a.decoupling),
    ef: num(a.icu_efficiency_factor),
    zoneTimes: Array.isArray(a.icu_zone_times) ? a.icu_zone_times.map((z) => (typeof z === "number" ? z : z && z.secs) || 0) : null,
    hrZoneTimes: Array.isArray(a.icu_hr_zone_times) ? a.icu_hr_zone_times : null,
    device: a.device_name || null,
    description: a.description || null,
    planned: ev ? { name: ev.name || null, min: mins(num(ev.moving_time)), load: num(ev.icu_training_load) } : null,
  };
}

function cors() {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
}

module.exports.mapActivity = mapActivity;
