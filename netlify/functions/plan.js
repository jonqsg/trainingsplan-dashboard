// GET  -> aktuellen Wochenplan lesen
// POST -> Wochenplan komplett überschreiben (Frontend schickt das gesamte plan-Objekt)
// Erweiterbar: PATCH für einzelne Tage, oder pro-Nutzer-Keys.
const { planStore } = require("./lib/blobStore");
const KEY = "plan.json";

exports.handler = async (event) => {
  const store = planStore();

  if (event.httpMethod === "GET") {
    const data = await store.get(KEY, { type: "json" });
    return { statusCode: 200, headers: cors(), body: JSON.stringify(data || {}) };
  }

  if (event.httpMethod === "POST") {
    try {
      const body = JSON.parse(event.body || "{}");
      await store.setJSON(KEY, body);
      return { statusCode: 200, headers: cors(), body: JSON.stringify({ ok: true }) };
    } catch (e) {
      return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: e.message }) };
    }
  }

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors() };

  return { statusCode: 405, headers: cors(), body: "Method not allowed" };
};

function cors() {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
}
