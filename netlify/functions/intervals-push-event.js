// Schreibt ein geplantes Workout als Kalender-Event nach intervals.icu.
// Optionaler Integrations-Schritt: wird vom Dashboard über einen Button in der
// Workout-Detailansicht aufgerufen, ist aber unabhängig vom Rest — kann
// jederzeit erweitert werden (z.B. um Structured-Workout-Steps mitzugeben).
const { intervalsFetch, athleteId } = require("./lib/intervalsClient");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors() };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: cors(), body: "Method not allowed" };

  try {
    const w = JSON.parse(event.body || "{}");
    const id = athleteId();

    const payload = {
      category: "WORKOUT",
      start_date_local: `${w.dateKey}T07:00:00`,
      name: w.title,
      description: w.goal || w.notes || "",
      type: mapType(w.discipline),
      moving_time: w.duration ? w.duration * 60 : undefined,
    };

    const data = await intervalsFetch(`/athlete/${id}/events`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return { statusCode: 200, headers: cors(), body: JSON.stringify(data) };
  } catch (e) {
    return { statusCode: 502, headers: cors(), body: JSON.stringify({ error: e.message }) };
  }
};

function mapType(discipline) {
  return { rolle: "Ride", rad: "Ride", lauf: "Run", schwimmen: "Swim", kraft: "WeightTraining" }[discipline] || "Workout";
}

function cors() {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
}
