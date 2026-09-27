// Schreibt ein geplantes Workout als Kalender-Event nach intervals.icu.
// POST   → anlegen, oder aktualisieren, wenn eventId mitkommt (z.B. nach dem Verschieben)
// DELETE → ?eventId=… löscht das Event wieder
// "description" enthält die strukturierten Schritte im intervals.icu-Workout-Format
// (vom Dashboard erzeugt) — intervals.icu macht daraus ein strukturiertes Workout,
// das mit Garmin/Wahoo/Zwift synchronisiert wird.
const { intervalsFetch, athleteId } = require("./lib/intervalsClient");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors() };
  const id = athleteId();

  try {
    if (event.httpMethod === "DELETE") {
      const eventId = (event.queryStringParameters || {}).eventId;
      if (!eventId) throw new Error("eventId fehlt.");
      await intervalsFetch(`/athlete/${id}/events/${encodeURIComponent(eventId)}`, { method: "DELETE" });
      return { statusCode: 200, headers: cors(), body: JSON.stringify({ ok: true }) };
    }
    if (event.httpMethod !== "POST") return { statusCode: 405, headers: cors(), body: "Method not allowed" };

    const w = JSON.parse(event.body || "{}");
    if (!w.dateKey) throw new Error("dateKey fehlt.");
    const payload = {
      category: "WORKOUT",
      start_date_local: `${w.dateKey}T07:00:00`,
      name: w.title,
      description: w.description || w.goal || w.notes || "",
      type: mapType(w.discipline),
      moving_time: w.duration ? w.duration * 60 : undefined,
    };
    const body = JSON.stringify(payload);

    let data;
    if (w.eventId) {
      try {
        data = await intervalsFetch(`/athlete/${id}/events/${encodeURIComponent(w.eventId)}`, { method: "PUT", body });
      } catch (e) {
        // Event wurde in intervals.icu gelöscht → neu anlegen
        if (!/ 404/.test(e.message)) throw e;
        data = await intervalsFetch(`/athlete/${id}/events`, { method: "POST", body });
      }
    } else {
      data = await intervalsFetch(`/athlete/${id}/events`, { method: "POST", body });
    }
    return { statusCode: 200, headers: cors(), body: JSON.stringify(data) };
  } catch (e) {
    return { statusCode: 502, headers: cors(), body: JSON.stringify({ error: e.message }) };
  }
};

function mapType(discipline) {
  return { rolle: "VirtualRide", rad: "Ride", lauf: "Run", schwimmen: "Swim", kraft: "WeightTraining" }[discipline] || "Workout";
}

function cors() {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
}
