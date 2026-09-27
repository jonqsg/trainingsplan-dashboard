// GET/POST für weitere Datenbereiche, die wie plan.json komplett gespeichert werden:
//   ?key=library  → eigene Workout-Vorlagen
//   ?key=journal  → Tagesform-Check-ins und Wochenrückblicke
const { planStore } = require("./lib/blobStore");
const ALLOWED = new Set(["library", "journal"]);

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors() };
  const key = (event.queryStringParameters || {}).key;
  if (!ALLOWED.has(key)) return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: "Unbekannter key" }) };
  const store = planStore(event);

  if (event.httpMethod === "GET") {
    const data = await store.get(`${key}.json`, { type: "json" });
    return { statusCode: 200, headers: cors(), body: JSON.stringify(data ?? null) };
  }

  if (event.httpMethod === "POST") {
    try {
      await store.setJSON(`${key}.json`, JSON.parse(event.body || "null"));
      return { statusCode: 200, headers: cors(), body: JSON.stringify({ ok: true }) };
    } catch (e) {
      return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: e.message }) };
    }
  }

  return { statusCode: 405, headers: cors(), body: "Method not allowed" };
};

function cors() {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
}
