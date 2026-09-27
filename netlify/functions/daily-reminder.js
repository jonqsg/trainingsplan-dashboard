// Geplante Function (Zeitplan in netlify.toml): schickt morgens eine Push-Nachricht
// mit den heute geplanten Einheiten an alle abonnierten Geräte.
const { planStore } = require("./lib/blobStore");
const { sendToAll } = require("./lib/push");

exports.handler = async (event) => {
  try {
    const store = planStore(event);
    const plan = (await store.get("plan.json", { type: "json" })) || {};
    const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
    const workouts = (plan[today] || []).filter((w) => !w.done);
    if (!workouts.length) return { statusCode: 200, body: "Kein Training geplant." };

    const title = workouts.length === 1 ? `Heute: ${workouts[0].title}` : `Heute: ${workouts.length} Einheiten`;
    const body = workouts.map((w) => `${w.title} · ${fmtDur(w.duration)}`).join("\n");
    const sent = await sendToAll(store, { title, body, url: "/" });
    return { statusCode: 200, body: `Erinnerung an ${sent} Gerät(e) gesendet.` };
  } catch (e) {
    return { statusCode: 500, body: e.message };
  }
};

function fmtDur(min) {
  min = Math.round(Number(min) || 0);
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h}:${String(m).padStart(2, "0")} h` : `${m} min`;
}
