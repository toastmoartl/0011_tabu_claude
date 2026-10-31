# Augn zähln – Schafkopf-Trainer

Übe das schnelle Zählen der Augen beim Schafkopf (kurzes Blatt ab Neuner).
Vier Karten werden aufgedeckt, nach der eingestellten Zeit wieder verdeckt –
dann heißt es: **Wia vui Augn?**

| Karte | Augen |
|-------|------:|
| Sau   | 11 |
| Zehn  | 10 |
| König | 4 |
| Ober  | 3 |
| Unter | 2 |
| Neun  | 0 |

## Benutzen

`index.html` im Browser öffnen – fertig. Kein Build, kein Server nötig.
Alle Einstellungen und die Statistik werden im Browser (localStorage) gespeichert.

**Einstellungen:** Anzeigedauer (0,5–10 s) · alle Karten gleichzeitig oder nacheinander
(mit einstellbarer Pause) · Antwort als Zahl oder 4 Bierdeckel zum Tippen · feste
Rundenzahl oder endlos · Zeitdruck beim Antworten · Schwachstellen öfter üben ·
Ton · Vibration · Tag/Abend/Automatisch · Boarisch/Hochdeutsch.

Tastatur: `1`–`4` wählt eine Antwort, `Enter` geht weiter.

## Aufbau

| Datei | Inhalt |
|-------|--------|
| `index.html` | Seite & Wirtshaus-Design (CSS) |
| `js/logic.js` | Reine Spiellogik ohne DOM: Blatt, Ziehen (auch gewichtet), Antwortoptionen, Einstellungen, Zustandsmaschine, Statistik, Speicher-Migration, Texte |
| `assets/cards/` | 24 Karten des bayerischen Blatts als SVG (600×900), Dateinamen `Farbe_Schlag.svg` |
| `js/cards.js` | Einbindung der Kartenbilder (`<img>`), Kartenrückseite und Farbsymbole als Inline-SVG |
| `js/app.js` | Oberfläche, pausierbarer Timer, Ton (WebAudio), Vibration |

`?seed=123` in der URL macht die Kartenfolge reproduzierbar (für Tests).

## Tests

```bash
npm install                          # installiert Playwright
npx playwright install chromium      # einmalig
npm test                             # Unit- + Browser-Tests
npm run test:unit                    # nur Logik & Karten, mit Abdeckungs-Schwellen
npm run test:e2e                     # nur Browser-Tests
```

- **Unit-Tests** (`tests/unit`, `node:test`): Spiellogik und Kartendateien (vollständig, wohlgeformt, richtige Karte hinter dem Dateinamen, keine Skripte oder externen Verweise). Der Lauf
  schlägt fehl, wenn die Abdeckung unter 95 % Zeilen / 90 % Zweige / 95 % Funktionen fällt.
- **End-to-End-Tests** (`tests/e2e`, Playwright/Chromium): kompletter Spielablauf in
  beiden Eingabemodi, Zeitsteuerung (Anzeigedauer, Aufdecken nacheinander, Zeitdruck),
  Speichern/Laden, kaputter Speicher, Sprache, Optik, Statistik, Handy- und Desktop-Layout,
  Tastatur, Reproduzierbarkeit per Seed – und dass dabei kein JS-Fehler auftritt.

## Karten

Die Kartenbilder stammen aus dem mitgelieferten Set „Bayerisches Schafkopfblatt – SVG“ (neu gezeichnet, bayerisch inspiriert, keine 1:1-Reproduktion eines kommerziellen Blatts). Verwendet werden die 24 Karten des kurzen Blatts (Neun bis Sau); Sieben und Acht werden nicht gebraucht. Die Kartenrückseite ist eigens erzeugt, weil das Set keine enthält.

## Online stellen (GitHub Pages)

Der Workflow `.github/workflows/pages.yml` testet alles und veröffentlicht dann
Startseite und Schafkopf-Trainer – bei jedem Push auf `main`.
Veröffentlicht wird nur eine feste Auswahl (siehe `scripts/build-site.js`); das Tabu-Spiel im
Wurzelordner gehört nicht dazu.
Einmalig nötig: **Settings → Pages → Source: „GitHub Actions“**.
Die Seite liegt danach unter `https://<benutzer>.github.io/<repo>/`.

Lokal ausprobieren: `node scripts/build-site.js _site` baut dieselbe Mappe.

## Datenschutz & Schriften

Die Seite lädt nichts von Dritten: keine Schriften-Dienste, kein Tracking, keine externen Skripte.
Die Schriften **Kalam** und **UnifrakturMaguntia** liegen in `assets/fonts/` (SIL Open Font License 1.1,
Lizenztexte liegen daneben). Das Verhalten sichern Tests ab (keine externen Adressen im Code,
im Browser gehen alle Anfragen nur an die eigene Seite).
