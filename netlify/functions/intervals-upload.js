// FIT-Upload: lädt eine Aktivitätsdatei (z. B. "Share Fit" aus der OnelapFit-App) zu intervals.icu hoch.
// Hochgeladene Dateien liefert die intervals.icu-API vollständig aus — anders als Aktivitäten,
// die über Strava kommen (nur Stubs). intervals.icu ersetzt dabei normalerweise den Strava-Eintrag.
//
// POST   JSON { filename, data (base64), name?, pairedEventId?, stubId? }
//        → { id, stubRemains }  stubRemains: der Strava-Stub existiert danach noch (sonst doppelte Last)
// DELETE ?activityId=…  → entfernt einen verbliebenen Strava-Stub (nur Aktivitäten mit Quelle STRAVA)
const { intervalsFetch, athleteId } = require("./lib/intervalsClient");

const ALLOWED = /\.(fit|fit\.gz|gpx|gpx\.gz|tcx|tcx\.gz|zip)$/i;

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors() };
  try {
    if (event.httpMethod === "DELETE") {
      const id = (event.queryStringParameters || {}).activityId;
      if (!id) throw new Error("activityId fehlt.");
      const a = await intervalsFetch(`/activity/${encodeURIComponent(id)}`);
      if (!a || (a.source !== "STRAVA" && !a._note)) throw new Error("Es werden nur Strava-Einträge ohne Daten entfernt.");
      await intervalsFetch(`/activity/${encodeURIComponent(id)}`, { method: "DELETE" });
      return json({ ok: true });
    }
    if (event.httpMethod !== "POST") return json({ error: "Method not allowed" }, 405);

    const b = JSON.parse(event.body || "{}");
    if (!b.data || !b.filename) throw new Error("Datei fehlt.");
    if (!ALLOWED.test(b.filename)) throw new Error("Bitte eine .fit-Datei auswählen (auch .gpx, .tcx oder .zip möglich).");
    const buf = Buffer.from(b.data, "base64");
    if (!buf.length) throw new Error("Die Datei ist leer.");

    const form = new FormData();
    form.append("file", new Blob([buf]), b.filename);
    const params = new URLSearchParams();
    if (b.name) params.set("name", String(b.name).slice(0, 120));
    if (b.pairedEventId != null) params.set("paired_event_id", String(b.pairedEventId));
    const res = await intervalsFetch(`/athlete/${athleteId()}/activities${params.toString() ? `?${params}` : ""}`, { method: "POST", body: form });
    const id = res && (res.id ?? (Array.isArray(res.activities) && res.activities[0] && res.activities[0].id));

    // Hat intervals.icu den Strava-Stub ersetzt? Sonst zählt die Last doppelt.
    let stubRemains = false;
    if (b.stubId && String(b.stubId) !== String(id)) {
      stubRemains = await intervalsFetch(`/activity/${encodeURIComponent(b.stubId)}`).then(() => true).catch(() => false);
    }
    return json({ id: id ?? null, stubRemains });
  } catch (e) {
    return json({ error: e.message }, 502);
  }
};

function json(body, statusCode = 200) {
  return { statusCode, headers: { ...cors(), "Content-Type": "application/json" }, body: JSON.stringify(body) };
}
function cors() {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
}
