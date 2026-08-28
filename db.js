// Persistenz über das zentrale ToolsUebersicht-Login-Gateway.
//
// ABWEICHUNG vom üblichen Gateway-Muster: diese App nutzt NICHT dav-load/dav-save.
// "fussballcamp" steht bewusst nicht in DAV_APPS des Workers — es gibt also gar
// keinen generischen Schreibweg auf die Datendatei. Vier Gründe, von denen jeder
// einzelne schon reicht:
//
//   1. Die Anmeldungen kommen von Eltern OHNE Login. Ein dav-save verlangt einen
//      Sitzungstoken; ein Formular auf der Vereins-Homepage hat keinen.
//   2. Platzzahl und Warteliste müssen serverseitig stimmen. Zwei Eltern, die
//      gleichzeitig auf „Absenden" tippen, dürfen nicht beide den letzten Platz
//      bekommen — das entscheidet nur, wer die Datei liest und schreibt.
//   3. Die Anmeldungen enthalten Gesundheitsangaben von Kindern (Art. 9 DSGVO).
//      Ein dav-load, das die ganze Datei ausliefert, hätte sie an jeden geschickt,
//      der das Tool sehen darf — Ausblenden im Client wäre keine Zurückhaltung.
//   4. Der Betreuer-Blick auf die Teilnehmer ist eine GEFILTERTE Sicht. Filtern
//      kann nur, wer die ungefilterten Daten gar nicht erst herausgibt.
//
// Jede Aktion hier hat ein Gegenstück in admin-worker.js, das Rechte, Belegung,
// Platzzahl und Zeitpunkt selbst prüft. Der Client hält keinen eigenen Bestand,
// den er zurückschreibt — nach jeder Änderung wird neu geladen. Der sonst übliche
// Debounce-Save mitsamt In-Flight-Guard entfällt deshalb.
const GATEWAY_URL = "https://landingpage.michel-brunner.workers.dev";
const TOKEN_STORAGE_KEY = "tu_session_token";
const GATEWAY_APP_ID = "fussballcamp";

class NotLoggedInError extends Error {
  constructor(message) {
    super(message || "Nicht angemeldet");
    this.name = "NotLoggedInError";
  }
}

class ConflictError extends Error {
  constructor(message) {
    super(message || "Daten wurden zwischenzeitlich von einem anderen Gerät geändert");
    this.name = "ConflictError";
  }
}

function getSessionToken() {
  try { return localStorage.getItem(TOKEN_STORAGE_KEY); } catch (_) { return null; }
}

async function gatewayRequest(payload) {
  const token = getSessionToken();
  if (!token) throw new NotLoggedInError();
  const resp = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify(payload)
  });
  if (resp.status === 401) throw new NotLoggedInError("Sitzung abgelaufen");
  // 409 trägt hier eine echte Begründung ("Das Camp ist voll", "Auf diesem Job
  // stehst du schon") und ist NICHT der Schreibkonflikt anderer Apps — deshalb
  // wird die Nachricht durchgereicht statt durch den generischen
  // ConflictError-Text ersetzt. Das gilt genauso für 400/403 aus dem Worker.
  if (!resp.ok) {
    let msg = `Gateway-Fehler (HTTP ${resp.status})`;
    try {
      const body = await resp.json();
      if (body && body.error) msg = body.error;
    } catch (_) { /* Antwort ohne JSON-Körper — Standardtext bleibt */ }
    if (resp.status === 409) throw new ConflictError(msg);
    throw new Error(msg);
  }
  return resp.json();
}

// ---------- Laden ----------

// Liefert { camps, jobKatalog, einstellungen, lauf, me, namen }.
//
// ⚠️ Was in `camps[].anmeldungen` steht, hängt am Recht des Aufrufers: mit
// Bearbeiten kommt die volle Liste, ohne Bearbeiten kommt das Feld GAR NICHT MIT
// (nicht etwa leer) — nur die Zahlen `belegt`, `warteliste` und `frei`. Die
// Betreuer-Sicht ist ein eigener Aufruf, siehe ladeTeilnehmer().
// `einstellungen` und `lauf` kommen nur mit Administrieren-Recht mit; die
// Kontoverbindung geht niemanden sonst etwas an.
async function ladeAlles() {
  return gatewayRequest({ action: "fussballcamp-load", app: GATEWAY_APP_ID });
}

// Gefilterte Teilnehmerliste eines Camps für die Betreuer.
//
// ⚠️ Das Gate ist NICHT canEdit, sondern „steht an diesem Camp auf mindestens
// einem Job" (Muster: schulsport-meldung). Der Worker stellt die Liste selbst
// zusammen und gibt nur die Felder aus FC_BETREUER_FELDER heraus — ohne
// Anschrift, ohne E-Mail, ohne Beitragsstand. Wer nicht eingetragen ist,
// bekommt 403 und keine Daten.
async function ladeTeilnehmer(campId) {
  return gatewayRequest({ action: "fussballcamp-teilnehmer", app: GATEWAY_APP_ID, campId });
}

// ---------- Camps (Bearbeiten) ----------

// Ohne `camp.id` wird angelegt; dabei erzeugt der Worker aus vonDatum/bisDatum
// die Camp-Tage und vergibt den öffentlichen Token für den Anmeldelink.
//
// ⚠️ `camp.tage` wird hier NICHT mitgeschickt — die Tage und die darauf
// besetzten Jobs gehören dem Worker. Ändert sich der Zeitraum, gleicht er die
// Tage selbst ab: neue Tage kommen dazu, wegfallende werden nur entfernt, wenn
// auf ihnen niemand eingetragen ist. Sonst lehnt er mit Begründung ab, statt
// jemandem stillschweigend den Job unter den Füßen wegzuziehen.
async function speichereCamp(camp) {
  return gatewayRequest({ action: "fussballcamp-camp-speichern", app: GATEWAY_APP_ID, camp });
}

// Das Werbeplakat ablegen, BEVOR das Camp gespeichert wird. Die Kennung erzeugt
// der Client selbst und reicht sie danach mit `speichereCamp` nach.
//
// ⚠️ Reihenfolge bindend: erst die Datei, dann der Eintrag. Bricht es dazwischen
// ab, liegt höchstens eine Bilddatei ohne Camp herum — die ist ohne den passenden
// Camp-Schlüssel gar nicht abrufbar. Andersherum stünde im Camp eine Kennung ohne
// Datei dahinter, und auf der Vereinsseite erschiene ein kaputtes Bild.
async function ladeBildHoch(id, contentType, dataBase64) {
  return gatewayRequest({ action: "fussballcamp-bild-put", app: GATEWAY_APP_ID, id, contentType, dataBase64 });
}

// Nur mit Administrieren-Recht, und nur solange das Camp keine Anmeldung trägt.
async function loescheCamp(id) {
  return gatewayRequest({ action: "fussballcamp-camp-loeschen", app: GATEWAY_APP_ID, id });
}

// Statuswechsel als eigene, schmale Aktion statt über speichereCamp: „Anmeldung
// öffnen" stellt das Camp auf die öffentliche Homepage, und dieser Schritt soll
// im Verlauf mit Zeitpunkt und Person stehen, nicht in einem Sammel-Speichern
// untergehen.
async function setzeCampStatus(id, status) {
  return gatewayRequest({ action: "fussballcamp-camp-status", app: GATEWAY_APP_ID, id, status });
}

// ---------- Camp-Tage und Jobs ----------

// Jobs eines einzelnen Camp-Tages setzen. `alleTage: true` legt denselben Job
// auf JEDEM Tag des Camps an — der Knopf „für alle Camp-Tage".
//
// Ein Job, auf dem noch jemand steht, lässt sich nicht mitsamt Besetzung
// entfernen; der Worker lehnt das mit Begründung ab.
async function speichereJob(campId, datum, job, alleTage) {
  return gatewayRequest({
    action: "fussballcamp-job-speichern", app: GATEWAY_APP_ID,
    campId, datum, job, alleTage: !!alleTage
  });
}

async function loescheJob(campId, datum, jobId) {
  return gatewayRequest({ action: "fussballcamp-job-loeschen", app: GATEWAY_APP_ID, campId, datum, jobId });
}

// `username` weglassen heißt „ich selbst". Ein fremder Name wird vom Worker nur
// akzeptiert, wenn der Aufrufer administriert — sonst 403. Der eigene Name kommt
// dort ohnehin aus dem Token und nie aus diesem Aufruf.
//
// `freierName` ist der Weg für Helfer ohne Vereinskonto: ein reiner Text ohne
// Nutzerbezug, ebenfalls nur mit Administrieren-Recht.
async function trageEin(campId, datum, jobId, username, freierName) {
  return gatewayRequest({
    action: "fussballcamp-eintragen", app: GATEWAY_APP_ID,
    campId, datum, jobId, username: username || "", freierName: freierName || ""
  });
}

async function trageAus(campId, datum, jobId, username, freierName) {
  return gatewayRequest({
    action: "fussballcamp-austragen", app: GATEWAY_APP_ID,
    campId, datum, jobId, username: username || "", freierName: freierName || ""
  });
}

// ---------- Job-Katalog (Administrieren) ----------

// Der Katalog ist eine VORLAGE. Eine Änderung hier fasst bestehende Camp-Tage
// nicht an — die tragen ihre eigene Kopie.
async function speichereKatalog(jobKatalog) {
  return gatewayRequest({ action: "fussballcamp-katalog-speichern", app: GATEWAY_APP_ID, jobKatalog });
}

// ---------- Anmeldungen (Bearbeiten) ----------

// Korrektur einer bestehenden Anmeldung durch die Verwaltung — auch der
// Beitragshaken läuft hierüber. Die Feldwerte werden serverseitig gegen die
// Feldkonfiguration des Camps geprüft und gekappt.
async function speichereAnmeldung(campId, anmeldung) {
  return gatewayRequest({ action: "fussballcamp-anmeldung-speichern", app: GATEWAY_APP_ID, campId, anmeldung });
}

// Von der Warteliste auf einen freien Platz. Der Worker prüft, ob überhaupt
// einer frei ist, und verschickt danach die Zusage-Mail. Schlägt der Mailversand
// fehl, bleibt das Nachrücken trotzdem stehen (`sent: false` in der Antwort) —
// eine Zusage rückgängig zu machen, nur weil Brevo klemmt, wäre schlimmer.
async function rueckeNach(campId, anmeldungId) {
  return gatewayRequest({ action: "fussballcamp-nachruecken", app: GATEWAY_APP_ID, campId, anmeldungId });
}

// Absagen durch die Verwaltung. Der Platz wird frei; das Nachrücken bleibt ein
// eigener, bewusster Klick (Michel-Entscheidung) und passiert NICHT automatisch.
// ⚠️ `mail` wird als echtes true/false geschickt, nie weggelassen: der Worker
// verschickt nur bei ausdrücklichem `true`. Ein fehlendes Feld hieße dort
// "nicht benachrichtigen" — was richtig ist, aber dann käme die Entscheidung
// nicht von der Bedienenden, sondern aus einem vergessenen Parameter.
async function sageAb(campId, anmeldungId, grund, mail) {
  return gatewayRequest({
    action: "fussballcamp-absagen", app: GATEWAY_APP_ID,
    campId, anmeldungId, grund: grund || "", mail: mail === true
  });
}

// Endgültiges Entfernen einer einzelnen Anmeldung (Administrieren) — etwa nach
// einer Doppelanmeldung oder auf Verlangen der Eltern.
async function loescheAnmeldung(campId, anmeldungId) {
  return gatewayRequest({ action: "fussballcamp-anmeldung-loeschen", app: GATEWAY_APP_ID, campId, anmeldungId });
}

// Setzt die Markierung „von den Eltern geändert / abgesagt" zurück, nachdem sie
// zur Kenntnis genommen wurde. Ohne das bliebe der Hinweis für immer stehen.
async function markiereGesehen(campId, anmeldungIds) {
  return gatewayRequest({ action: "fussballcamp-gesehen", app: GATEWAY_APP_ID, campId, anmeldungIds });
}

// ---------- Einstellungen, Erinnerungen, Aufräumen (Administrieren) ----------

async function speichereEinstellungen(einstellungen) {
  return gatewayRequest({ action: "fussballcamp-einstellungen-speichern", app: GATEWAY_APP_ID, einstellungen });
}

// Erinnerung von Hand. Dieselbe Auswahl-Logik wie der nächtliche Lauf, nur
// sofort und mit sichtbarem Ergebnis — damit sich der Automatiklauf gegenprüfen
// lässt, ohne bis zum nächsten Morgen zu warten.
// `art`: "start" (Camp beginnt bald) oder "zahlung" (Beitrag offen).
async function erinnereJetzt(campId, art) {
  return gatewayRequest({ action: "fussballcamp-erinnern", app: GATEWAY_APP_ID, campId: campId || "", art: art || "" });
}

// Löscht die personenbezogenen Angaben aller Anmeldungen eines abgeschlossenen
// Camps und behält nur die Zahlen. ⚠️ Nicht rückgängig zu machen; der Client
// fragt vorher nach, der Worker prüft zusätzlich Status und Frist.
async function raeumeAuf(campId) {
  return gatewayRequest({ action: "fussballcamp-aufraeumen", app: GATEWAY_APP_ID, campId });
}

// ---------- Personen ----------

// Personenauswahl für den Fremdeintrag.
//
// ⚠️ list-tool-editors liefert nur Mitglieder von editGroupIds + adminGroupIds.
// Das ist hier RICHTIG so — anders als im Schulsport, wo die Übungsleiter kein
// Bearbeiten-Recht haben und deshalb eine eigene Personen-Aktion nötig war.
// In dieser App ist der Selbsteintrag selbst ein Schreibvorgang und hängt am
// Bearbeiten-Recht; wer sich eintragen darf, steht damit auch in dieser Liste.
async function ladeMoeglicheHelfer() {
  return gatewayRequest({ action: "list-tool-editors", app: GATEWAY_APP_ID });
}

// Kein eigenes fetchMe(): `fussballcamp-load` liefert `me` (inklusive canEdit
// und canAdmin) bereits mit, ohne dafür einen weiteren Nextcloud-Read zu
// brauchen. Ein zweiter Aufruf wäre ein Roundtrip für nichts.
