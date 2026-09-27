// Proxy: Leistungskurve (Bestwerte je Dauer) aus intervals.icu.
// ?type=Ride&curves=84d  (curves z.B. "84d", "1y", mehrere kommagetrennt)
// Antwort: [{ id, label, secs:[...], watts:[...] }]
const { intervalsFetch, athleteId } = require("./lib/intervalsClient");

exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};
    const type = q.type || "Ride";
    const curves = q.curves || "84d";
    const data = await intervalsFetch(`/athlete/${athleteId()}/power-curves?type=${encodeURIComponent(type)}&curves=${encodeURIComponent(curves)}`);
    const list = Array.isArray(data) ? data : (data && data.list) || [];
    const mapped = list
      .map((c) => ({ id: c.id, label: c.label || c.id, secs: c.secs || [], watts: c.watts || c.values || [] }))
      .filter((c) => c.secs.length && c.watts.length);
    return { statusCode: 200, headers: cors(), body: JSON.stringify(mapped) };
  } catch (e) {
    return { statusCode: 502, headers: cors(), body: JSON.stringify({ error: e.message }) };
  }
};

function cors() {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
}
