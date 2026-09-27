# Trainings-Dashboard

Statisches Dashboard (Fitness-Übersicht, Wochenplaner, Auto-Plan-Wizard, ERG-/GPX-Generierung)
mit Netlify Functions als Backend, Netlify Blobs als Speicher und optionaler intervals.icu-Anbindung.

## Architektur

```
public/index.html          → das Dashboard selbst (Vanilla JS, kein Build-Schritt)
netlify/functions/
  plan.js                  → GET/POST Wochenplan (Netlify Blobs)
  settings.js              → GET/POST FTP/HFmax (Netlify Blobs)
  intervals-fitness.js     → Proxy: CTL/ATL/TSB von intervals.icu
  intervals-activities.js  → Proxy: letzte Aktivitäten von intervals.icu
  intervals-push-event.js  → Proxy: geplantes Workout als Kalender-Event anlegen
  generate-plan.js         → lässt Claude einen Wochenplan vorschlagen (Trainingswissenschaft)
  lib/blobStore.js         → gemeinsamer Blob-Store-Zugriff
  lib/intervalsClient.js   → gemeinsamer intervals.icu-API-Client (hält den Key geheim)
```

Jede Function ist bewusst klein und eigenständig — neue Funktionen (z.B. Wetter-API,
Strava-Anbindung, mehrere Athleten) lassen sich als weitere Datei in `netlify/functions/`
ergänzen, ohne bestehende Dateien anzufassen.

## Setup

### 1. Voraussetzungen
- Ein kostenloser [Netlify](https://netlify.com)-Account
- Node.js (nur für die Netlify-CLI, nicht für das Dashboard selbst)
- Ein intervals.icu-Account mit API-Key (unter intervals.icu → Einstellungen → "Developer Settings")

### 2. Projekt deployen

Mit der Netlify-CLI (einmalig installieren: `npm install -g netlify-cli`):

```bash
cd trainings-dashboard
netlify login
netlify init          # neue Site anlegen, Fragen durchklicken
netlify deploy --prod
```

Alternativ: Projektordner als Git-Repo (z.B. auf GitHub) pushen und in der Netlify-Weboberfläche
"Add new site → Import an existing project" auswählen — dann deployt Netlify bei jedem `git push`
automatisch neu.

### 3. Umgebungsvariablen setzen

Im Netlify-Dashboard: Site settings → Environment variables → "Add a variable"

| Variable | Wert |
|---|---|
| `INTERVALS_API_KEY` | dein API-Key von intervals.icu |
| `INTERVALS_ATHLETE_ID` | deine Athlete-ID (z.B. `i123456`, steht in der intervals.icu-URL) |
| `ANTHROPIC_API_KEY` | dein API-Key von der Anthropic Console (console.anthropic.com → API Keys), nur nötig für "Mit Claude generieren" im Wizard |

Nach dem Setzen einmal neu deployen (`netlify deploy --prod`), damit die Functions die
Variablen sehen.

### 4. Blobs

Netlify Blobs ist automatisch aktiv, sobald die Site auf Netlify läuft — keine zusätzliche
Einrichtung nötig.

### 5. Auf dem iPhone installieren

Wie gehabt: die fertige URL (z.B. `https://dein-projekt.netlify.app`) in Safari öffnen →
Teilen-Symbol → "Zum Home-Bildschirm". Jetzt zeigen alle Geräte denselben Datenstand, weil
er zentral über die Functions/Blobs läuft statt lokal im Browser.

## Kosten-Hinweis

`INTERVALS_API_KEY`/`INTERVALS_ATHLETE_ID` sowie intervals.icu selbst sind kostenlos. Der
`ANTHROPIC_API_KEY` ist es nicht — die Claude API wird nach Nutzung (Tokens) abgerechnet, dafür
ist ein Zahlungsmittel im Anthropic-Console-Konto nötig. Ein einzelner Plan-Aufruf ist sehr
günstig (Bruchteile eines Cents bis niedrige Cent-Beträge), aber kein kostenloser Dienst wie
der Rest des Stacks. Aktuelle Preise: https://claude.com/pricing

## Erweitern

- **Neue Datenquelle anbinden** (z.B. Strava): neue Datei `netlify/functions/strava-activities.js`
  nach dem Vorbild von `intervals-activities.js`, eigene Umgebungsvariablen für den Strava-Key.
- **Mehr Nutzer/Athleten**: `plan.js`/`settings.js` derzeit mit festen Keys (`plan.json`,
  `settings.json`). Für mehrere Nutzer: Key um eine Nutzer-ID erweitern (z.B. via einfachem
  Passwort-Query-Parameter oder Netlify Identity für echte Logins).
  Andere Berechnung
  im Wizard (`generateAutoPlan`) lässt sich unabhängig anpassen.
- **Automatisch pushen statt manuell**: `intervals-push-event.js` wird aktuell nur per Klick
  aufgerufen — ließe sich auch an `persistPlan()` anhängen, um jedes neue Workout automatisch
  zu spiegeln.

## Hinweis zur intervals.icu-Authentifizierung

Der Client in `lib/intervalsClient.js` nutzt HTTP Basic Auth mit Nutzername `API_KEY` und dem
echten Key als Passwort — das ist die von der intervals.icu-Community am häufigsten dokumentierte
Methode. Falls sich das API-Verhalten ändert, prüfe die aktuelle Doku unter
https://intervals.icu/features/open-api/ bzw. https://forum.intervals.icu und passe
`authHeader()` entsprechend an.
