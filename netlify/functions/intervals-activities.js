// Proxy: liefert die Aktivitäten aus intervals.icu, auf die Felder
// gemappt, die das Dashboard erwartet (inkl. Leistungs- und FTP-Werten für den FTP-Verlauf).
//
// Verknüpfung mit geplanten Workouts: intervals.icu paart Aktivitäten mit Kalender-Events.
// Die Paarung kommt als paired_event_id an der Aktivität bzw. paired_activity_id am Event —
// beides wird ausgewertet, damit das Dashboard exakt dieselbe Zuordnung zeigt.
//
// Achtung Strava: Aktivitäten, die über Strava nach intervals.icu kommen, gibt die API
// wegen der Strava-Nutzungsbedingungen nur als Stub zurück (ohne Dauer, Distanz, Name …).
// Die werden als stub:true markiert, damit das Dashboard nicht "0 min" anzeigt — und, wenn
// Strava verbunden ist (siehe strava-auth.js), direkt mit den Daten von Strava ergänzt.
const { intervalsFetch, athleteId, daysAgo, isoDate } = require("./lib/intervalsClient");
const { planStore } = require("./lib/blobStore");
const strava = require("./lib/strava");

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

    const raw = Array.isArray(data) ? data : [];
    let mapped = raw.map((a) => mapActivity(a, eventByActivity[String(a.id)]));
    mapped = await enrichFromStrava(event, mapped, raw, Number(q.ftp) || null);
    mapped.sort((x, y) => (x.start < y.start ? 1 : -1));

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

// Ersetzt Strava-Stubs durch die echten Werte aus der Strava-API (falls verbunden).
// Fehler hier dürfen den Sync nie verhindern — dann bleibt es beim Stub.
async function enrichFromStrava(event, mapped, raw, ftp) {
  const stubs = mapped.filter((a) => a.stub && a.date);
  if (!stubs.length || !strava.configured()) return mapped;
  try {
    const store = planStore(event);
    const days = stubs.map((a) => a.date).sort();
    const list = await strava.stravaActivities(store, days[0], days[days.length - 1]);
    if (!list) return mapped;
    const used = new Set();
    return mapped.map((a, i) => {
      if (!a.stub) return a;
      const s = findStrava(a, raw[i], list, used);
      if (!s) return a;
      used.add(s.id);
      return mergeStrava(a, s, ftp);
    });
  } catch (e) {
    console.warn("Strava-Anreicherung fehlgeschlagen:", e.message);
    return mapped;
  }
}

const stravaIdOf = (r) => r && (r.strava_id ?? r.external_id ?? null);
function findStrava(a, r, list, used) {
  const free = list.filter((s) => !used.has(s.id));
  const sid = stravaIdOf(r);
  if (sid != null) { const hit = free.find((s) => String(s.id) === String(sid)); if (hit) return hit; }
  // Startzeit (lokal) auf ±5 Minuten
  const t = Date.parse(`${a.start}Z`);
  if (!isNaN(t)) {
    const hit = free.map((s) => [s, Math.abs(Date.parse(`${s.start}Z`) - t)]).filter(([, d]) => d <= 5 * 60 * 1000).sort((x, y) => x[1] - y[1])[0];
    if (hit) return hit[0];
  }
  // Notlösung: einzige Strava-Aktivität desselben Tages
  const sameDay = free.filter((s) => s.start.slice(0, 10) === a.date);
  return sameDay.length === 1 ? sameDay[0] : null;
}

function mergeStrava(a, s, ftp) {
  const secs = s.moving_time || s.elapsed_time || 0;
  const power = s.deviceWatts ? (s.np || s.watts) : null;
  // TSS-Schätzung aus Leistung und FTP (Strava selbst liefert keine Trainingslast)
  const load = power && ftp && secs ? Math.round((secs / 3600) * Math.pow(power / ftp, 2) * 100) : null;
  return {
    ...a,
    stub: false, viaStrava: true, stravaId: s.id,
    name: s.name || a.name, type: a.type || s.type,
    km: s.distance ? +(s.distance / 1000).toFixed(1) : 0,
    min: mins(secs), elapsedMin: mins(s.elapsed_time),
    elev: Math.round(s.elev || 0),
    hr: num(s.hr), maxHr: num(s.maxHr), watts: s.deviceWatts ? num(s.watts) : null, np: s.deviceWatts ? num(s.np) : null,
    speed: num(s.speed), cadence: num(s.cadence), calories: s.kj ? Math.round(s.kj) : null, // kJ ≈ kcal beim Radfahren
    load: load ?? a.load, loadEstimated: load != null,
    intensity: power && ftp ? Math.round((power / ftp) * 100) : a.intensity,
    device: s.device || a.device,
  };
}

function cors() {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
}

module.exports.mapActivity = mapActivity;
