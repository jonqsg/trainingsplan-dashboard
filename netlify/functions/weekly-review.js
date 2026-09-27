// Wochenrückblick: Claude wertet geplante vs. absolvierte Einheiten, RPE-Feedback,
// Tagesform und Fitnessverlauf einer Woche aus und gibt eine Empfehlung für die nächste.
const { askClaudeJSON } = require("./lib/claude");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors() };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: cors(), body: "Method not allowed" };

  try {
    const input = JSON.parse(event.body || "{}");
    const review = await askClaudeJSON(buildPrompt(input), 1500);
    if (!review || typeof review.summary !== "string") throw new Error("Unerwartetes Antwortformat von Claude.");
    return { statusCode: 200, headers: cors(), body: JSON.stringify(review) };
  } catch (e) {
    return { statusCode: 502, headers: cors(), body: JSON.stringify({ error: e.message }) };
  }
};

function buildPrompt({ week, days, fitness, season, stats }) {
  const lines = (days || []).map((d) => {
    const planned = (d.planned || []).map((w) =>
      `  • geplant: ${w.title} (${w.discipline}, ${w.zone}, ${w.duration} min) → ${w.done ? `absolviert${w.actualMin != null ? ` ${w.actualMin} min` : ""}` : "nicht absolviert"}${w.rpe ? `, RPE ${w.rpe}` : ""}${w.feel ? `, Gefühl ${w.feel}/5` : ""}${w.feedback ? `, Notiz: "${w.feedback}"` : ""}`);
    const extra = (d.unplanned || []).map((a) => `  • ungeplant: ${a.name} ${a.min} min${a.km ? `, ${a.km} km` : ""}${a.load ? `, Load ${a.load}` : ""}`);
    const ci = d.checkin ? `  • Check-in: Schlaf ${d.checkin.sleep}/5, Energie ${d.checkin.energy}/5, Muskelkater ${d.checkin.soreness}/5, Stress ${d.checkin.stress}/5` : null;
    return [`- ${d.date}:`, ...planned, ...extra, ...(ci ? [ci] : []), ...(!planned.length && !extra.length ? ["  • Ruhetag"] : [])].join("\n");
  }).join("\n");

  return `Du bist ein erfahrener, motivierender Ausdauersport-Trainer (Triathlon, polarisiertes Training nach Seiler).
Werte die Trainingswoche ab ${week} eines Athleten aus, der vom Handball kommt und Richtung Triathlon aufbaut.
${season && season.date ? `Saisonziel: ${season.name || "Triathlon"} am ${season.date}, noch ${season.weeks} Wochen, Phase "${season.phase}".` : ""}
Fitness: CTL ${fitness?.ctlStart} → ${fitness?.ctlEnd}, aktuelle Form (TSB) ${fitness?.tsb}.
Kennzahlen: ${stats?.done}/${stats?.planned} Einheiten, Erfüllung ${stats?.compliance}%, geplante Last ${stats?.load} TSS, Anteil locker ${stats?.lowPct}%.

Tage:
${lines}

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt, ohne Markdown oder Code-Fences, exakt in diesem Format (Deutsch, du-Form, konkret und knapp):
{"headline":"eine Zeile Fazit","summary":"2-3 Sätze Einordnung","good":["was gut lief", "..."],"improve":["was verbessert werden sollte", "..."],"nextWeek":["konkrete Empfehlung für nächste Woche", "..."]}`;
}

function cors() {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
}
