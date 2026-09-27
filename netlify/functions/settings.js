// GET/POST für FTP, HFmax und zukünftige Athleten-Einstellungen.
const { planStore } = require("./lib/blobStore");
const KEY = "settings.json";

exports.handler = async (event) => {
  const store = planStore(event);

  if (event.httpMethod === "GET") {
    const data = await store.get(KEY, { type: "json" });
    return { statusCode: 200, headers: cors(), body: JSON.stringify(data || { ftp: "", hrMax: "" }) };
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
