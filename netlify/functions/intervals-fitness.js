// Proxy: liefert CTL/ATL (Fitness/Fatigue) plus Wellness-Werte (HRV, Ruhepuls, Schlaf, Energie …)
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
        sleepQuality: d.sleepQuality ?? null,   // intervals.icu-Skala 1 (super) … 4 (schlecht)
        avgSleepingHR: d.avgSleepingHR ?? null,
        energy: energyValue(d),
        readiness: d.readiness ?? null,
        soreness: d.soreness ?? null,
        fatigue: d.fatigue ?? null,
        stress: d.stress ?? null,
        mood: d.mood ?? null,
        motivation: d.motivation ?? null,
        spO2: d.spO2 ?? null,
        respiration: d.respiration ?? null,
        weight: d.weight ?? null,
      };
    }).filter((d) => d.ctl != null);

    return { statusCode: 200, headers: cors(), body: JSON.stringify(mapped) };
  } catch (e) {
    return { statusCode: 502, headers: cors(), body: JSON.stringify({ error: e.message }) };
  }
};

// Energie-Wert: je nach Quelle heißt das Feld unterschiedlich (Garmin Body Battery,
// eigenes Wellness-Feld "Energy" …). Bekannte Namen zuerst, dann jedes numerische
// Feld, dessen Name nach Energie/Batterie klingt.
const ENERGY_KEYS = ["energy", "Energy", "bodyBattery", "BodyBattery", "body_battery", "bodyBatteryMax", "BodyBatteryMax"];
function energyValue(d) {
  for (const k of ENERGY_KEYS) if (typeof d[k] === "number") return d[k];
  const k = Object.keys(d).find((key) => /energy|battery/i.test(key) && typeof d[key] === "number");
  return k ? d[k] : null;
}

function cors() {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
}
