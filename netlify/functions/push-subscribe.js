// Verwaltung der Push-Abos für die tägliche Trainings-Erinnerung.
// GET    → { publicKey } (VAPID, fürs Abonnieren im Browser)
// POST   → { subscription } speichern  |  { test:true } sendet eine Testnachricht
// DELETE → { endpoint } entfernen
const { planStore } = require("./lib/blobStore");
const { loadSubs, saveSubs, sendToAll } = require("./lib/push");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors() };
  if (event.httpMethod === "GET") {
    return { statusCode: 200, headers: cors(), body: JSON.stringify({ publicKey: process.env.VAPID_PUBLIC_KEY || null }) };
  }

  try {
    const store = planStore(event);
    const body = JSON.parse(event.body || "{}");

    if (event.httpMethod === "POST" && body.test) {
      const sent = await sendToAll(store, { title: "Trainings-Dashboard", body: "Erinnerungen sind aktiv 💪", url: "/" });
      return { statusCode: 200, headers: cors(), body: JSON.stringify({ ok: true, sent }) };
    }

    const subs = await loadSubs(store);
    if (event.httpMethod === "POST") {
      const sub = body.subscription;
      if (!sub || !sub.endpoint) throw new Error("subscription fehlt.");
      await saveSubs(store, subs.filter((s) => s.endpoint !== sub.endpoint).concat([sub]));
      return { statusCode: 200, headers: cors(), body: JSON.stringify({ ok: true }) };
    }
    if (event.httpMethod === "DELETE") {
      await saveSubs(store, subs.filter((s) => s.endpoint !== body.endpoint));
      return { statusCode: 200, headers: cors(), body: JSON.stringify({ ok: true }) };
    }
    return { statusCode: 405, headers: cors(), body: "Method not allowed" };
  } catch (e) {
    return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: e.message }) };
  }
};

function cors() {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
}
