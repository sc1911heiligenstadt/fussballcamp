# ⚽ Fußballcamp

Werkzeug des **1. SC 1911 Heiligenstadt e.V.** (Nachwuchsbereich), um
Fußballcamps anzulegen, auf der Vereinsseite zu bewerben, die Anmeldungen der Kinder
einzusammeln und die Aufgaben der Helfer zu verteilen.

Teil der Vereins-Werkzeugsammlung → [Tools-Übersicht](https://sc1911heiligenstadt.github.io/ToolsUebersicht/)

## Was es kann

**Camps anlegen.** Zeitraum, tägliche Uhrzeit, Ort, Altersspanne, Platzzahl und Beitrag.
Aus dem Zeitraum entstehen die Camp-Tage. Ein neues Camp ist zuerst ein Entwurf und für
niemanden sichtbar — erst „Anmeldung öffnen" stellt es auf die Homepage.

**Auf der Vereinsseite.** Die App liefert einen Schnipsel, der einmal in die Homepage
eingebaut wird. Danach erscheint dort von selbst ein Fenster mit den offenen Camps und
einem Knopf zur Anmeldung. Wer es wegklickt, bekommt es sieben Tage lang nicht wieder zu
sehen; ein neues Camp erscheint trotzdem.

**Anmeldung ohne Vereinskonto.** Die Eltern melden über einen Link an. Welche Felder
gefragt werden, wird je Camp eingestellt: nicht fragen, freiwillig oder Pflicht. Ist das
Camp voll, läuft eine Warteliste mit Platznummer.

**Beitrag.** Betrag, Kontoverbindung und ein automatisch gebildeter Verwendungszweck
stehen auf der Bestätigungsseite und in der Bestätigungsmail. In der Anmeldeliste wird
abgehakt, wer bezahlt hat.

**Selbst ändern.** Jede Bestätigungsmail enthält einen persönlichen Link. Darüber ändern
die Eltern ihre Angaben oder sagen ab.

**Aufgaben für die Helfer.** Ein Job-Katalog wird einmal gepflegt und beim Anlegen eines
Camps auf jeden Tag kopiert. Wer Zugriff hat, trägt sich selbst ein und wieder aus.

**Erinnerungen.** Vor dem Campbeginn und bei offenem Beitrag geht automatisch eine Mail
an die Eltern.

## Datenschutz

Die App verarbeitet **Gesundheitsangaben über Kinder** (Allergien, Medikamente). Deshalb:

- Auf der Anmeldeseite steht die vollständige Information nach Art. 13 DSGVO; ohne
  ausdrückliches Einverständnis nimmt der Server keine Anmeldung an.
- Die Angaben verlassen den Server nur an die Verantwortlichen und an die Betreuer des
  jeweiligen Camps — und die bekommen eine **verkürzte** Liste ohne Anschrift, ohne
  Kontaktdaten der Eltern und ohne Beitragsstand.
- Nach dem Camp läuft eine Frist (Vorgabe: sechs Monate). Danach schlägt die App das
  Aufräumen vor: Namen, Anschriften und Gesundheitsangaben werden gelöscht, nur die
  anonymen Zahlen bleiben. **Gelöscht wird nie automatisch**, sondern auf einen
  bewussten Klick.

## Technik

Vanilla JavaScript, kein Build-Step. Anmeldung und Datenhaltung laufen über den zentralen
Gateway-Worker der Tools-Übersicht; die Daten liegen in der Vereins-Nextcloud.

| Datei | Inhalt |
|---|---|
| `index.html`, `app.js`, `style.css`, `camp.css` | die App für angemeldete Nutzer |
| `config.js` | Formularfelder, Job-Vorschläge, Änderungsliste |
| `db.js` | Anbindung an den Gateway-Worker |
| `anmeldung.html`, `anmeldung.js` | Anmeldeseite für Eltern (ohne Login) |
| `meine-anmeldung.html`, `meine-anmeldung.js` | Anmeldung ändern oder absagen (ohne Login) |
| `oeffentlich.js`, `oeffentlich.css` | geteilte Bausteine der Seiten ohne Login |
| `popup.js` | das Fenster für die Vereins-Homepage |
| `popup-vorschau.html` | zeigt, wie das Fenster auf einer fremden Seite aussieht |

Die Gegenstücke der Worker-Aktionen (`fussballcamp-*`) liegen im Repo `ToolsUebersicht`.

## Einbau in die Vereins-Homepage

Der Schnipsel steht in der App unter **Verwaltung → Fenster auf der Vereins-Homepage**.
Zwei Dinge sind dabei zu beachten:

1. In WordPress als **Code-Block** einfügen, nicht als Text.
2. In **Borlabs Cookie** freigeben — Borlabs blockt fremde Skripte, und dieses kommt von
   `sc1911heiligenstadt.github.io`.

## Lizenz

Interne Vereinssoftware. Keine Freigabe zur Weiterverwendung.
