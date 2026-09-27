// Lässt Claude einen Wochenplan vorschlagen (Disziplin/Dauer/Zone/Titel/Ziel je Tag).
// Route-Generierung, ERG-Aufbau und Load-Berechnung bleiben bewusst lokal im
// Frontend (deterministisch, kein Modell nötig) — Claude entscheidet nur die
// trainingswissenschaftliche Verteilung.
const { askClaudeJSON } = require("./lib/claude");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors() };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: cors(), body: "Method not allowed" };

  try {
    const input = JSON.parse(event.body || "{}");
    const workouts = await askClaudeJSON(buildPrompt(input), 2000);
    if (!Array.isArray(workouts)) throw new Error("Unerwartetes Antwortformat von Claude.");
    return { statusCode: 200, headers: cors(), body: JSON.stringify({ workouts }) };
  } catch (e) {
    return { statusCode: 502, headers: cors(), body: JSON.stringify({ error: e.message }) };
  }
};

function buildPrompt({ days, ctl, atl, tsb, phaseLabel, phaseNote, season, readiness, feedback, lastWeek }) {
  const goal = season && season.date
    ? `Saisonziel: ${season.name || "Triathlon"}${season.type ? ` (${season.type})` : ""} am ${season.date} — noch ${season.weeks} Wochen, aktuelle Saisonphase "${season.phase}".`
    : "Ziel: Triathlon Frühjahr/Sommer 2027.";

  const context = [];
  if (readiness) context.push(`Tagesform heute: ${readiness.score}/100 (${readiness.level}).`);
  if (feedback && feedback.count) {
    context.push(`Rückmeldungen der letzten 14 Tage: ${feedback.count} Einheiten mit RPE, im Schnitt ${feedback.avgDelta > 0 ? "+" : ""}${feedback.avgDelta} RPE-Punkte gegenüber dem für die Zone Erwarteten.`);
    if (feedback.notes && feedback.notes.length) context.push(`Notizen des Athleten: ${feedback.notes.map((n) => `"${n}"`).join("; ")}`);
  }
  if (lastWeek && lastWeek.planned) context.push(`Letzte Woche: ${lastWeek.done}/${lastWeek.planned} Einheiten absolviert, Erfüllung ${lastWeek.compliance}%.`);

  return `Du bist ein erfahrener Ausdauersport-Trainer mit Fokus auf Trainingswissenschaft (polarisiertes Training nach Seiler, kontrollierte Ramp-Rate, Periodisierung).

Athlet: ${goal} Aktueller Fokus: Radfahren + etwas Laufen, Schwimmen kommt erst später dazu.
Hintergrund: kommt vom Handball — gut in kurzen, harten Intervallen, aber ungewohnt an kontinuierliche Dauerbelastung (v.a. Laufen).

Fitnessstand: CTL ${ctl}, ATL ${atl}, TSB ${tsb} → Trainingsphase "${phaseLabel}" (${phaseNote}).
${context.join("\n")}

Verfügbare Tage diese Woche (inkl. Wetterprognose, falls bekannt):
${(days || []).map((d) => `- ${d.key}: ${d.hours}h verfügbar${d.weather ? `, ${d.weather.high}°C, ${d.weather.precip}% Regenwahrscheinlichkeit` : ", keine Wettervorhersage verfügbar"}`).join("\n")}

Erstelle einen sportwissenschaftlich sinnvollen Wochenplan NUR für Tage mit mehr als 0 verfügbaren Stunden.

Regeln:
- Disziplin nur aus: "rad" (draußen), "rolle" (Rad Indoor-Trainer/Rolle), "lauf", "kraft", "schwimmen"
- Bei Regenwahrscheinlichkeit ≥ 50% oder Temperatur ≤ 3°C: "rolle" statt "rad" wählen
- Intensitätsverteilung passend zur genannten Trainingsphase (in der Grundlagenphase ca. 90/10 leicht/hart)
- Lauf-Einheiten konservativ als Run/Walk planen, wegen fehlender Laufbasis
- Wochenlast insgesamt an CTL ${ctl} orientiert verträglich halten, kein zu aggressiver Sprung
- Fühlten sich die letzten Einheiten härter an als geplant oder ist die Tagesform schlecht: Umfang/Intensität zurücknehmen
- Nicht jeden verfügbaren Tag zwingend verplanen — Regenerationstage sind Teil eines guten Plans

Antworte AUSSCHLIESSLICH mit einem JSON-Array, keine Erklärung, kein Markdown, keine Code-Fences. Jedes Element exakt so:
{"dateKey":"YYYY-MM-DD","discipline":"rad|rolle|lauf|kraft|schwimmen","title":"kurzer Titel","duration":Minuten_als_Zahl,"zone":"z1|z2|z3|sst|thr|vo2|ana","goal":"1-2 Sätze physiologische Begründung, warum genau diese Einheit an diesem Tag sinnvoll ist"}`;
}

function cors() {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
}
