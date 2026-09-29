// FIT-Upload: lädt eine Aktivitätsdatei (z. B. "Share Fit" aus der OnelapFit-App) zu intervals.icu hoch.
// Hochgeladene Dateien liefert die intervals.icu-API vollständig aus — anders als Aktivitäten,
// die über Strava kommen (nur Stubs). intervals.icu ersetzt dabei normalerweise den Strava-Eintrag.
//
// Zwei Wege:
// 1. Dashboard:  POST JSON { filename, data (base64), name?, pairedEventId?, stubId? }
//                → { id, stubRemains }  (stubRemains: Strava-Stub existiert noch → Dashboard fragt nach)
// 2. iPhone-Kurzbefehl im Teilen-Menü: POST mit der Datei als rohem Body (beliebiger Content-Type)
//                → Klartext-Meldung für die Benachrichtigung. Ein verbliebener Strava-Stub mit gleicher
//                  Startzeit (±5 min) wird dabei automatisch entfernt, damit die Last nicht doppelt zählt.
// DELETE ?activityId=…  → entfernt einen verbliebenen Strava-Stub (nur Aktivitäten mit Quelle STRAVA)
const { intervalsFetch, athleteId } = require("./lib/intervalsClient");

const ALLOWED = /\.(fit|fit\.gz|gpx|gpx\.gz|tcx|tcx\.gz|zip)$/i;
const isStravaStub = (a) => !!a && (a.source === "STRAVA" || !!a._note) && !a.moving_time && !a.distance;

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors() };
  const ct = String((event.headers || {})["content-type"] || (event.headers || {})["Content-Type"] || "");
  const raw = event.httpMethod === "POST" && !/application\/json/i.test(ct);
  try {
    if (event.httpMethod === "DELETE") {
      const id = (event.queryStringParameters || {}).activityId;
      if (!id) throw new Error("activityId fehlt.");
      const a = await intervalsFetch(`/activity/${encodeURIComponent(id)}`);
      if (!isStravaStub(a)) throw new Error("Es werden nur Strava-Einträge ohne Daten entfernt.");
      await intervalsFetch(`/activity/${encodeURIComponent(id)}`, { method: "DELETE" });
      return json({ ok: true });
    }
    if (event.httpMethod !== "POST") return json({ error: "Method not allowed" }, 405);

    let buf, filename, b = {};
    if (raw) {
      if (!event.body) throw new Error("Keine Datei empfangen. Im Kurzbefehl als Anfragetext „Datei“ → „Kurzbefehleingabe“ wählen.");
      buf = Buffer.from(event.body, event.isBase64Encoded ? "base64" : "binary");
      filename = nameFor(buf, (event.queryStringParameters || {}).filename);
    } else {
      b = JSON.parse(event.body || "{}");
      if (!b.data || !b.filename) throw new Error("Datei fehlt.");
      buf = Buffer.from(b.data, "base64");
      filename = b.filename;
    }
    if (!buf.length) throw new Error("Die Datei ist leer.");
    if (!ALLOWED.test(filename)) throw new Error("Bitte eine .fit-Datei auswählen (auch .gpx, .tcx oder .zip möglich).");

    const form = new FormData();
    form.append("file", new Blob([buf]), filename);
    const params = new URLSearchParams();
    if (b.name) params.set("name", String(b.name).slice(0, 120));
    if (b.pairedEventId != null) params.set("paired_event_id", String(b.pairedEventId));
    const res = await intervalsFetch(`/athlete/${athleteId()}/activities${params.toString() ? `?${params}` : ""}`, { method: "POST", body: form });
    const id = res && (res.id ?? (Array.isArray(res.activities) && res.activities[0] && res.activities[0].id));

    // Hat intervals.icu den Strava-Stub ersetzt? Sonst zählt die Last doppelt.
    const stubs = b.stubId
      ? (String(b.stubId) !== String(id) ? await intervalsFetch(`/activity/${encodeURIComponent(b.stubId)}`).then((a) => [a]).catch(() => []) : [])
      : await findTwinStubs(id);

    if (!raw) return json({ id: id ?? null, stubRemains: stubs.length > 0 });

    // Kurzbefehl: niemand kann nachfragen → Stubs mit gleicher Startzeit direkt entfernen
    let removed = 0;
    for (const s of stubs) {
      if (!isStravaStub(s)) continue;
      await intervalsFetch(`/activity/${encodeURIComponent(s.id)}`, { method: "DELETE" }).then(() => removed++).catch(() => {});
    }
    const act = id ? await intervalsFetch(`/activity/${encodeURIComponent(id)}`).catch(() => null) : null;
    const when = act && act.start_date_local ? ` vom ${fmtDate(act.start_date_local)}` : "";
    return text(`✓ Fahrt${when} an intervals.icu übertragen${removed ? " — leerer Strava-Eintrag ersetzt" : ""}. Im Dashboard synchronisieren.`);
  } catch (e) {
    return raw ? text(`✗ Upload fehlgeschlagen: ${e.message}`) : json({ error: e.message }, 502);
  }
};

// Dateiname für den rohen Upload: Endung aus dem Namen oder am Dateiinhalt erkennen
function nameFor(buf, given) {
  if (given && ALLOWED.test(given)) return given;
  const base = (given || "fahrt").replace(/\.[^.]*$/, "") || "fahrt";
  if (buf[0] === 0x1f && buf[1] === 0x8b) return `${base}.fit.gz`;
  if (buf[0] === 0x50 && buf[1] === 0x4b) return `${base}.zip`;
  const head = buf.subarray(0, 400).toString("latin1");
  if (/TrainingCenterDatabase/.test(head)) return `${base}.tcx`;
  if (/<gpx/i.test(head)) return `${base}.gpx`;
  return `${base}.fit`; // FIT-Dateien tragen ".FIT" ab Byte 8 — Standardfall
}

// Strava-Stubs mit gleicher Startzeit (±5 min) wie die frisch hochgeladene Aktivität
async function findTwinStubs(id) {
  if (!id) return [];
  const act = await intervalsFetch(`/activity/${encodeURIComponent(id)}`).catch(() => null);
  if (!act || !act.start_date_local) return [];
  const day = act.start_date_local.slice(0, 10), t = Date.parse(`${act.start_date_local}Z`);
  const list = await intervalsFetch(`/athlete/${athleteId()}/activities?oldest=${day}&newest=${day}`).catch(() => []);
  return (Array.isArray(list) ? list : []).filter((a) => String(a.id) !== String(id) && isStravaStub(a)
    && Math.abs(Date.parse(`${a.start_date_local}Z`) - t) <= 5 * 60 * 1000);
}

function fmtDate(s) { const [y, m, d] = s.slice(0, 10).split("-"); return `${+d}.${+m}.${y}`; }
function json(body, statusCode = 200) {
  return { statusCode, headers: { ...cors(), "Content-Type": "application/json" }, body: JSON.stringify(body) };
}
// Kurzbefehle zeigen den Text direkt an — daher auch Fehler mit Status 200
function text(msg) {
  return { statusCode: 200, headers: { ...cors(), "Content-Type": "text/plain; charset=utf-8" }, body: msg };
}
function cors() {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
}
