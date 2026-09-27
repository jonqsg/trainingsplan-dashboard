// Lässt Claude einen Wochenplan vorschlagen (Disziplin/Dauer/Zone/Titel/Ziel je Tag).
// Route-Generierung, ERG-Aufbau und Load-Berechnung bleiben bewusst lokal im
// Frontend (deterministisch, kein Modell nötig) — Claude entscheidet nur die
// trainingswissenschaftliche Verteilung.
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors() };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: cors(), body: "Method not allowed" };

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY ist nicht gesetzt (Netlify-Umgebungsvariable fehlt).");

    const { days, ctl, atl, tsb, phaseLabel, phaseNote } = JSON.parse(event.body || "{}");

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 2000,
        messages: [{ role: "user", content: buildPrompt({ days, ctl, atl, tsb, phaseLabel, phaseNote }) }],
      }),
    });

    if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);

    const data = await res.json();
    const text = (data.content || []).map((b) => b.text || "").join("");
    const cleaned = text.replace(/```json|```/g, "").trim();
    const workouts = JSON.parse(cleaned);

    if (!Array.isArray(workouts)) throw new Error("Unerwartetes Antwortformat von Claude.");

    return { statusCode: 200, headers: cors(), body: JSON.stringify({ workouts }) };
  } catch (e) {
    return { statusCode: 502, headers: cors(), body: JSON.stringify({ error: e.message }) };
  }
};

function buildPrompt({ days, ctl, atl, tsb, phaseLabel, phaseNote }) {
  return `Du bist ein erfahrener Ausdauersport-Trainer mit Fokus auf Trainingswissenschaft (polarisiertes Training nach Seiler, kontrollierte Ramp-Rate).

Athlet: baut Richtung Triathlon Frühjahr/Sommer 2027 auf. Aktueller Fokus: Radfahren + etwas Laufen, Schwimmen kommt erst später dazu.
Hintergrund: kommt vom Handball — gut in kurzen, harten Intervallen, aber ungewohnt an kontinuierliche Dauerbelastung (v.a. Laufen).

Fitnessstand: CTL ${ctl}, ATL ${atl}, TSB ${tsb} → Trainingsphase "${phaseLabel}" (${phaseNote}).

Verfügbare Tage diese Woche (inkl. Wetterprognose, falls bekannt):
${(days || []).map((d) => `- ${d.key}: ${d.hours}h verfügbar${d.weather ? `, ${d.weather.high}°C, ${d.weather.precip}% Regenwahrscheinlichkeit` : ", keine Wettervorhersage verfügbar"}`).join("\n")}

Erstelle einen sportwissenschaftlich sinnvollen Wochenplan NUR für Tage mit mehr als 0 verfügbaren Stunden.

Regeln:
- Disziplin nur aus: "rad" (draußen), "rolle" (Rad Indoor-Trainer/Rolle), "lauf", "kraft"
- Bei Regenwahrscheinlichkeit ≥ 50% oder Temperatur ≤ 3°C: "rolle" statt "rad" wählen
- Intensitätsverteilung passend zur genannten Trainingsphase (in der Grundlagenphase ca. 90/10 leicht/hart)
- Lauf-Einheiten konservativ als Run/Walk planen, wegen fehlender Laufbasis
- Wochenlast insgesamt an CTL ${ctl} orientiert verträglich halten, kein zu aggressiver Sprung
- Nicht jeden verfügbaren Tag zwingend verplanen — Regenerationstage sind Teil eines guten Plans

Antworte AUSSCHLIESSLICH mit einem JSON-Array, keine Erklärung, kein Markdown, keine Code-Fences. Jedes Element exakt so:
{"dateKey":"YYYY-MM-DD","discipline":"rad|rolle|lauf|kraft","title":"kurzer Titel","duration":Minuten_als_Zahl,"zone":"z1|z2|z3|sst|thr|vo2|ana","goal":"1-2 Sätze physiologische Begründung, warum genau diese Einheit an diesem Tag sinnvoll ist"}`;
}

function cors() {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
}
