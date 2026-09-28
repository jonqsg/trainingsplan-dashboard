# Trainings-Dashboard

Statisches Dashboard (Fitness-Übersicht, Wochenplaner, Auto-Plan-Wizard, ERG-/GPX-Generierung)
mit Netlify Functions als Backend, Netlify Blobs als Speicher und optionaler intervals.icu-Anbindung.

## Funktionen

- **Heute**: Form-Anzeige (TSB), Tagesform-Score aus HRV, Ruhepuls, Schlaf, Energie und Check-in, Karte „Schlaf & Energie“ (letzte Nacht, Energie heute, 7-Tage-Schlafdefizit, 14-Tage-Verlauf), Einheit des Tages mit Wetter-Hinweis
- **Plan**: Wochenplaner mit Workout-Bibliothek (Drag & Drop), Abgleich geplant vs. absolviert, Erfüllungsquote, Wochenrückblick von Claude
- **Auto-Plan**: regelbasiert oder mit Claude — berücksichtigt Saisonphase, Tagesform, Schlaf & Energie der letzten 7 Tage (Umfang runter / keine harten Intervalle bei Erholungsdefizit), RPE-Feedback und die 16-Tage-Wettervorhersage
- **Fortschritt**: Fitness/Ermüdung/Form mit Prognose, Schlaf- & Energieverlauf (inkl. Energie nach harten Tagen), Saisonplanung mit Form-Prognose für den Renntag, Leistungskurve, FTP-Verlauf
- **intervals.icu**: Workouts als strukturierte Workouts senden (→ Garmin/Wahoo/Zwift), optional automatisch
- **Offline-fähige PWA** mit täglicher Push-Erinnerung

## Architektur

```
public/index.html          → das Dashboard selbst (Vanilla JS, kein Build-Schritt)
public/sw.js               → Service Worker: Offline-Cache + Push-Benachrichtigungen
public/manifest.webmanifest→ PWA-Manifest (Home-Bildschirm)
netlify/functions/
  plan.js                  → GET/POST Wochenplan (Netlify Blobs)
  settings.js              → GET/POST Einstellungen: FTP, HFmax, Saisonziel, Standort …
  store.js                 → GET/POST ?key=library|journal (Vorlagen, Check-ins, Rückblicke)
  intervals-fitness.js     → Proxy: CTL/ATL/TSB + Wellness (HRV, Ruhepuls, Schlaf, Schlafscore, Energie/Body Battery) von intervals.icu
  intervals-activities.js  → Proxy: Aktivitäten inkl. Leistung, eFTP und Paarung mit Kalender-Events
  intervals-activity.js    → Proxy: Details einer Aktivität (Intervalle) für die Detailseite
  intervals-power-curve.js → Proxy: Leistungskurve (Bestwerte je Dauer)
  intervals-push-event.js  → Workout als (strukturiertes) Kalender-Event anlegen/aktualisieren/löschen
  generate-plan.js         → lässt Claude einen Wochenplan vorschlagen (Trainingswissenschaft)
  weekly-review.js         → Wochenrückblick von Claude
  push-subscribe.js        → Push-Abos verwalten (+ Testnachricht)
  daily-reminder.js        → geplante Function: morgendliche Push-Erinnerung (Zeitplan in netlify.toml)
  lib/blobStore.js         → gemeinsamer Blob-Store-Zugriff
  lib/intervalsClient.js   → gemeinsamer intervals.icu-API-Client (hält den Key geheim)
  lib/claude.js            → gemeinsamer Claude-API-Aufruf
  lib/push.js              → Web-Push-Versand (VAPID)
```

Wetter kommt direkt im Browser von [Open-Meteo](https://open-meteo.com) (kostenlos, kein API-Key).
Der Standort lässt sich in den Einstellungen ändern (Standard: München).

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
| `ANTHROPIC_API_KEY` | dein API-Key von der Anthropic Console (console.anthropic.com → API Keys), nur nötig für "Mit Claude" im Wizard und den Wochenrückblick |
| `VAPID_PUBLIC_KEY` | nur für die tägliche Push-Erinnerung (siehe unten) |
| `VAPID_PRIVATE_KEY` | nur für die tägliche Push-Erinnerung |
| `VAPID_SUBJECT` | optional, z.B. `mailto:du@example.com` |

**VAPID-Schlüssel erzeugen** (einmalig, lokal mit Node.js):

```bash
npx web-push generate-vapid-keys
```

Die beiden ausgegebenen Werte als `VAPID_PUBLIC_KEY` und `VAPID_PRIVATE_KEY` eintragen. Die
Erinnerung kommt täglich um 05:00 UTC (= 07:00 Sommerzeit / 06:00 Winterzeit) und nur, wenn für
den Tag etwas geplant ist. Uhrzeit ändern: `schedule` in `netlify.toml`.

Nach dem Setzen einmal neu deployen (`netlify deploy --prod`), damit die Functions die
Variablen sehen.

### 4. Blobs

Netlify Blobs ist automatisch aktiv, sobald die Site auf Netlify läuft — keine zusätzliche
Einrichtung nötig.

### 5. Auf dem iPhone installieren

Die fertige URL (z.B. `https://dein-projekt.netlify.app`) in Safari öffnen →
Teilen-Symbol → "Zum Home-Bildschirm". Alle Geräte zeigen denselben Datenstand, weil er zentral
über die Functions/Blobs läuft. Zusätzlich hält die App eine lokale Kopie: Ohne Netz lässt sie
sich weiter öffnen und bearbeiten, Änderungen werden nachgereicht, sobald der Server wieder
erreichbar ist. Push-Erinnerungen funktionieren auf dem iPhone (ab iOS 16.4) nur in der vom
Home-Bildschirm geöffneten App — dort in den Einstellungen "Tägliche Erinnerung" einschalten.

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
- **Automatisch pushen**: in den Einstellungen "Automatisch an intervals.icu senden" einschalten —
  neue und verschobene Workouts landen dann ohne Klick im intervals.icu-Kalender.

## Hinweis zur intervals.icu-Authentifizierung

Der Client in `lib/intervalsClient.js` nutzt HTTP Basic Auth mit Nutzername `API_KEY` und dem
echten Key als Passwort — das ist die von der intervals.icu-Community am häufigsten dokumentierte
Methode. Falls sich das API-Verhalten ändert, prüfe die aktuelle Doku unter
https://intervals.icu/features/open-api/ bzw. https://forum.intervals.icu und passe
`authHeader()` entsprechend an.

## Schlaf & Energie

Schlafdauer, Schlafscore/-qualität und Energie kommen aus den Wellness-Daten von intervals.icu.
Als Energie-Wert wird das Feld `energy` bzw. `bodyBattery` verwendet — oder jedes eigene Wellness-Feld,
dessen Name „energy“ oder „battery“ enthält. Die Skala (0–100, 1–10 oder 1–5) wird automatisch erkannt.
Der Schlafbedarf (Standard 8 h) lässt sich in den Einstellungen unter „Erholung“ anpassen.

## Aktivitäten & Verknüpfung mit dem Plan

Absolvierte Aktivitäten werden zuerst über die Paarung in intervals.icu mit dem geplanten Workout
verknüpft (Event-ID beim Senden an intervals.icu), sonst über Tag und Sportart. Jede Aktivität hat
eine Detailseite (Kennzahlen, Zonenverteilung, Intervalle, Vergleich geplant vs. absolviert).

**Strava-Hinweis:** Aktivitäten, die über Strava nach intervals.icu kommen, gibt die intervals.icu-API
wegen der Strava-Nutzungsbedingungen nur als Stub (ohne Dauer, Distanz, Name) heraus. Das Dashboard
erkennt sie und übernimmt Dauer/Last aus dem Plan. Für vollständige Daten Garmin/Wahoo/Zwift direkt
in intervals.icu verbinden.
