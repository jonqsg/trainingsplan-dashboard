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

function buildPrompt({ days, ctl, atl, tsb, phaseLabel, phaseNote, season, readiness, recovery, feedback, lastWeek }) {
  const goal = season && season.date
    ? `Saisonziel: ${season.name || "Triathlon"}${season.type ? ` (${season.type})` : ""} am ${season.date} — noch ${season.weeks} Wochen, aktuelle Saisonphase "${season.phase}".`
    : "Ziel: Triathlon Frühjahr/Sommer 2027.";

  const context = [];
  if (readiness) context.push(`Tagesform heute: ${readiness.score}/100 (${readiness.level})${readiness.factors && readiness.factors.length ? ` — ${readiness.factors.join(", ")}` : ""}.`);
  const rec = recoveryText(recovery);
  if (rec) context.push(rec);
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
- Schlaf und Energie sind die wichtigsten Erholungsmarker: Bei Schlafdefizit (≥ 3 h in 7 Tagen oder Ø deutlich unter Bedarf) oder Energie klar unter dem Normalwert höchstens EINE intensive Einheit (sst/thr/vo2/ana) und Umfang um 10–20 % senken; bei deutlichem Defizit (Erholung "Erholung nötig") gar keine intensive Einheit
- Die ersten 1–2 Tage der Woche an die aktuelle Tagesform/Energie anpassen — keine harte Einheit, wenn Tagesform oder Energie heute niedrig sind; harte Einheiten eher auf spätere Tage legen und nie zwei harte Tage hintereinander
- Sind Schlaf und Energie gut und stabil, darf die Woche normal nach Phase geplant werden
- Wenn Schlaf/Energie eine Einheit beeinflusst haben, das im "goal" kurz erwähnen
- Nicht jeden verfügbaren Tag zwingend verplanen — Regenerationstage sind Teil eines guten Plans

Antworte AUSSCHLIESSLICH mit einem JSON-Array, keine Erklärung, kein Markdown, keine Code-Fences. Jedes Element exakt so:
{"dateKey":"YYYY-MM-DD","discipline":"rad|rolle|lauf|kraft|schwimmen","title":"kurzer Titel","duration":Minuten_als_Zahl,"zone":"z1|z2|z3|sst|thr|vo2|ana","goal":"1-2 Sätze physiologische Begründung, warum genau diese Einheit an diesem Tag sinnvoll ist"}`;
}

function recoveryText(r) {
  if (!r) return null;
  const lines = ["Erholung der letzten 7 Tage (Schlaf/Energie aus intervals.icu):"];
  if (r.sleepAvgH != null) lines.push(`- Schlaf Ø ${r.sleepAvgH} h bei ${r.sleepNeedH} h Bedarf (${r.nights} Nächte erfasst)${r.sleepDebtH ? `, kumuliertes Schlafdefizit ${r.sleepDebtH} h` : ""}${r.sleepBaseH != null ? `; Normalwert der Wochen davor ${r.sleepBaseH} h` : ""}.`);
  if (r.sleepScoreAvg != null) lines.push(`- Schlafscore Ø ${r.sleepScoreAvg}/100.`);
  if (r.lastNight) lines.push(`- Letzte Nacht: ${r.lastNight.hours != null ? `${r.lastNight.hours} h` : "Dauer unbekannt"}${r.lastNight.score != null ? `, Score ${r.lastNight.score}` : ""}.`);
  if (r.energyAvgPct != null) lines.push(`- Energie Ø ${r.energyAvgPct} % (0–100)${r.energyBasePct != null ? `, Normalwert ${r.energyBasePct} %` : ""}${r.energyTodayPct != null ? `, heute ${r.energyTodayPct} %` : ""}.`);
  if (r.energyAfterHardDay && Math.abs(r.energyAfterHardDay.delta) >= 5) lines.push(`- Nach harten Tagen (≥ ${r.energyAfterHardDay.hardMin} TSS) liegt die Energie am Folgetag im Schnitt ${r.energyAfterHardDay.delta} %-Punkte ${r.energyAfterHardDay.delta < 0 ? "niedriger" : "höher"}.`);
  if (r.score != null) lines.push(`- Erholungs-Score gesamt: ${r.score}/100 (${r.level}).`);
  if (Array.isArray(r.series) && r.series.length) lines.push(`- Verlauf: ${r.series.map((d) => `${d.day.slice(5)}: ${d.sleepH != null ? `${d.sleepH} h` : "–"}${d.energy != null ? `/${d.energy} %` : ""}`).join("; ")}`);
  return lines.length > 1 ? lines.join("\n") : null;
}

function cors() {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
}
