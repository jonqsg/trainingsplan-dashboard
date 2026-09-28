// Einmalige Verbindung mit Strava (OAuth), damit das Dashboard die eigenen Strava-Aktivitäten
// lesen darf. Aufruf im Browser: /.netlify/functions/strava-auth
//   ohne Parameter   → Weiterleitung zu Strava ("Autorisieren")
//   ?code=…&state=…  → Rückkehr von Strava, Tokens werden in Netlify Blobs gespeichert
//   ?status=1        → JSON: { configured, connected, athlete }
//   ?disconnect=1    → Verbindung wieder entfernen (POST)
const crypto = require("crypto");
const { planStore } = require("./lib/blobStore");
const { configured, tokenRequest, saveToken, TOKEN_KEY } = require("./lib/strava");

const STATE_KEY = "strava-oauth-state.json";

exports.handler = async (event) => {
  const q = event.queryStringParameters || {};
  const store = planStore(event);
  try {
    if (q.status) {
      const t = await store.get(TOKEN_KEY, { type: "json" }).catch(() => null);
      const athlete = t && t.athlete ? [t.athlete.firstname, t.athlete.lastname].filter(Boolean).join(" ") : null;
      return json({ configured: configured(), connected: !!((t && t.refresh_token) || process.env.STRAVA_REFRESH_TOKEN), athlete });
    }
    if (q.disconnect) {
      if (event.httpMethod !== "POST") return json({ error: "POST erwartet" }, 405);
      await store.delete(TOKEN_KEY); await store.delete("strava-activities.json");
      return json({ ok: true });
    }
    if (!configured()) return page("Strava ist nicht eingerichtet", "Setze zuerst <code>STRAVA_CLIENT_ID</code> und <code>STRAVA_CLIENT_SECRET</code> in den Netlify-Umgebungsvariablen (siehe README) und deploye neu.");

    const redirect = `https://${event.headers.host}/.netlify/functions/strava-auth`;
    if (q.error) return page("Nicht verbunden", "Die Autorisierung bei Strava wurde abgebrochen.");
    if (!q.code) {
      const state = crypto.randomBytes(16).toString("hex");
      await store.setJSON(STATE_KEY, { state, createdAt: Date.now() });
      const url = `https://www.strava.com/oauth/authorize?${new URLSearchParams({
        client_id: process.env.STRAVA_CLIENT_ID, response_type: "code", redirect_uri: redirect,
        approval_prompt: "auto", scope: "read,activity:read_all", state,
      })}`;
      return { statusCode: 302, headers: { Location: url, "Cache-Control": "no-store" }, body: "" };
    }

    const saved = await store.get(STATE_KEY, { type: "json" }).catch(() => null);
    if (!saved || saved.state !== q.state || Date.now() - saved.createdAt > 15 * 60 * 1000)
      return page("Nicht verbunden", "Der Anmeldevorgang ist abgelaufen oder ungültig. Bitte in den Einstellungen erneut „Mit Strava verbinden“ tippen.");
    await store.delete(STATE_KEY);
    if (!/activity:read/.test(q.scope || "")) return page("Nicht verbunden", "Bitte beim Autorisieren den Zugriff auf deine Aktivitäten erlauben.");

    const t = await tokenRequest({ grant_type: "authorization_code", code: q.code });
    await saveToken(store, t, t.athlete ? { id: t.athlete.id, firstname: t.athlete.firstname, lastname: t.athlete.lastname } : null);
    await store.delete("strava-activities.json");
    return page("Mit Strava verbunden ✓", "Das Dashboard ergänzt ab jetzt Strava-Aktivitäten mit Dauer, Distanz, Herzfrequenz und Leistung. Du kannst dieses Fenster schließen und im Dashboard synchronisieren.", true);
  } catch (e) {
    return page("Fehler", String(e.message).replace(/[<>]/g, ""));
  }
};

function json(body, statusCode = 200) {
  return { statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(body) };
}
function page(title, text, ok = false) {
  return { statusCode: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    body: `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<body style="font-family:-apple-system,system-ui,sans-serif;max-width:480px;margin:15vh auto;padding:0 20px;line-height:1.5;color:#0F1115">
<h1 style="font-size:22px;color:${ok ? "#16A34A" : "#0F1115"}">${title}</h1><p>${text}</p><p><a href="/" style="color:#FF5B24;font-weight:600">Zurück zum Dashboard</a></p></body>` };
}
