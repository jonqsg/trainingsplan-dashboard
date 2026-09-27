// Web-Push-Versand (VAPID). Abos liegen in Netlify Blobs unter "push.json".
const webpush = require("web-push");
const KEY = "push.json";

function configure() {
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:training@example.com", pub, priv);
  return true;
}

async function loadSubs(store) {
  const data = await store.get(KEY, { type: "json" });
  return (data && data.subscriptions) || [];
}

async function saveSubs(store, subscriptions) {
  await store.setJSON(KEY, { subscriptions });
}

// Schickt eine Nachricht an alle Abos und räumt abgelaufene (404/410) auf.
async function sendToAll(store, message) {
  if (!configure()) throw new Error("VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY sind nicht gesetzt.");
  const subs = await loadSubs(store);
  const payload = JSON.stringify(message);
  const alive = [];
  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub, payload);
      alive.push(sub);
    } catch (e) {
      if (e.statusCode !== 404 && e.statusCode !== 410) alive.push(sub);
    }
  }
  if (alive.length !== subs.length) await saveSubs(store, alive);
  return alive.length;
}

module.exports = { loadSubs, saveSubs, sendToAll };
