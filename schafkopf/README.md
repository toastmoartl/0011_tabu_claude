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

**Richtig → sofort weiter:** Eine richtige Antwort bringt dich ohne Umweg in die nächste Runde
(Ton, Vibration, grünes Aufblitzen und der Serienzähler zeigen: richtig). Nur bei einer **falschen
Antwort** oder wenn die **Zeit abläuft** erscheint die Rückmeldung mit der Rechnung
(`11 + 10 + 3 + 0 = 24`). Die letzte richtige Antwort führt direkt zur Auswertung.

**Rückmeldung am Handy:** Richtig = kurzes Antippen (30 ms) und grünes Aufblitzen. Falsch (oder Zeit
abgelaufen) = ein deutlich längerer Brummer (300 ms) und rotes Aufblitzen – so lässt sich beides ohne
Hinsehen unterscheiden. Die Werte stehen als `VIBRATION` in `js/logic.js`; Vibration lässt sich in den
Einstellungen ausschalten.

## Realistische Stiche

Ein echter Stich besteht nicht aus vier zufälligen Karten: Es gilt **Bedienzwang**, und die **Trümpfe** gehören zusammen.
Darum wird die Auswahl (Einstellung „Realistische Stiche“, Standard: an) so gebildet, dass ein ganzes Spiel gespielt wird:

- 24 Karten werden an 4 Spieler zu je 6 verteilt, dann werden Stiche mit **regelgerechten, zufälligen Zügen** gespielt:
  Wer die ausgespielte Farbe (oder Trumpf) hat, muss sie zugeben, sonst darf er alles legen; der Stichgewinner spielt aus.
- Trumpf ist wie im **Sauspiel**: alle 4 Ober, alle 4 Unter und die Herz-Karten (im kurzen Blatt 12 von 24).
  Stärke: Eichel-, Gras-, Herz-, Schellen-Ober, dann ebenso die Unter, dann Herz Sau, 10, König, 9. Ein Ober gehört *nicht* zur Farbe seines Bildes.
- Aus den Stichen des Spiels (1. bis 6.) wird ein zufälliger gewählt. Mit „Schwachstellen öfter üben“ werden mehrere
  realistische Stiche gebildet und einer davon nach Gewicht gewählt – die Stiche bleiben also regelgerecht.

Gemessen an 200 000 Stichen (Zufall: vier Karten aus 24 gezogen):

| Art des Stichs | reiner Zufall | realistisch |
|---|---:|---:|
| 4 Trümpfe | 4,7 % | 26 % |
| 3 Trümpfe + 1 Farbkarte | 24,9 % | 13 % |
| 3 gleiche Farbkarten + 1 Trumpf | 1,4 % | 13,5 % |
| 4 gleiche Farbkarten | 0 % | 4 % |
| kein Trumpf | 4,6 % | 19 % |

**Grenzen:** Die Spieler spielen zufällig, aber regelgerecht – echte Spieler spielen mit Plan (Trumpf ziehen, schmieren,
Partner unterstützen). Die Zahlen stammen aus dieser Simulation, nicht aus echten Spielen. Es gilt nur das Sauspiel
(Trumpf = Ober, Unter, Herz); Solo, Wenz und Geier haben andere Trümpfe. Ausschalten ergibt wie bisher vier zufällige Karten.

## Kartenbilder im schlechten Netz

Auf der veröffentlichten Seite kommen die Kartenbilder übers Internet. Damit man nie eine „aufgedeckte“,
aber leere (grüne) Karte sieht:

- Karten werden **erst umgedreht, wenn alle vier Bilder geladen und gezeichnet sind**. Die Anzeigezeit zählt erst ab dann.
  Dauert das länger als 0,4 s, steht „Karten werden geladen …“ da.
- Schlägt ein Bild fehl, gibt es **einen zweiten Versuch**; klappt auch der nicht (oder nach 8 s), erscheint eine
  **Textkarte** („Sau / GRAS“), und das Spiel läuft weiter.
- Alle 24 Bilder werden beim Start vorgeladen; die Vorderseite hat eine cremefarbene Grundfläche statt eines „Lochs“.

## Bildschirmgrößen

Das Spiel ist für Handys im Hochformat gebaut, vor allem das Samsung Galaxy S23 (360×780 CSS-Pixel,
im Browser nach Abzug der Leisten etwa 360×680). **Jede Ansicht passt ohne Scrollen auf den Bildschirm** –
auch Querformat, Tablet und Desktop.

- Die Seite füllt genau die Bildschirmhöhe (`100dvh`); Karten, Tasten und Einstellungszeilen teilen sich den Platz.
- Karten richten sich nach dem freien Platz (Container-Abfrage) und stehen 2×2 oder 4 nebeneinander – je nachdem, was größer wird.
- Zahleneingabe über einen eigenen Ziffernblock, damit keine Handy-Tastatur die halbe Höhe wegnimmt.
- Querformat: Karten links, Antwort und Rückmeldung rechts; Einstellungen in zwei Spalten.
- Bei extrem kleinen Fenstern scrollt nur die Papier-Ansicht als Notbremse, nie die ganze Seite.

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
- **Stich-Tests** (`tests/unit/tricks.test.js`): Trumpf-Reihenfolge Paar für Paar, Bedienzwang, Stichgewinner, 1000 komplette Spiele auf Regelverstöße und die Häufigkeiten der Stich-Arten.
- **Netz-Test** (`tests/e2e/slow-network.e2e.test.js`): ein kleiner Test-Server simuliert langsame, ausgefallene und kurz unterbrochene Kartenbilder.
- **Layout-Test** (`tests/e2e/responsive.e2e.test.js`): 11 Bildschirmgrößen (S23 in zwei Höhen, iPhone, Tablet, Querformat, Laptop, Full HD) × 9 Ansichten – kein Scrollen, nichts über dem Rand, kein abgeschnittener Text, Bedienelemente groß genug, Karten gleich groß und ohne Überlappung.
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
