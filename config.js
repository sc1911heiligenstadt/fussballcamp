// Die Version bleibt auf 1.0 stehen. Was sich ändert, kommt als eigener Block in
// APP_CHANGELOG dazu — die Nummer selbst wird nicht hochgezählt.
const APP_VERSION = "1.0";

// Öffentliche Adresse der App. Steht hier und NICHT nur im Worker, weil die
// Anmeldeseite ihren eigenen Link für die Bestätigungsmail nicht kennt — der
// Worker baut ihn aus seiner eigenen Konstante. Beide müssen zusammenpassen;
// siehe FC_APP_URL in admin-worker.js.
const APP_URL = "https://sc1911heiligenstadt.github.io/fussballcamp/";

// ---------- Werbeplakat je Camp ----------
//
// Adresse des Bildes. Der Worker liefert es unter einem GET-Pfad aus, damit ein
// <img src> es direkt laden kann und der Browser es behält. Die Bild-Kennung
// steht MIT in der Adresse: ein ausgetauschtes Bild bekommt dadurch eine neue
// Adresse und bleibt nie im Cache hängen.
//
// ⚠️ Dieselbe Adresse wird in `popup.js` noch einmal gebaut — das Skript läuft in
// der fremden Vereinsseite und kennt diese Datei nicht. Wer eine ändert, zieht
// die andere mit; die dritte Fassung steht im Worker (`handleFcBildGet`).
const CAMP_BILD_BASIS = "https://landingpage.michel-brunner.workers.dev/camp-bild/";

function campBildUrl(campToken, bildId) {
  if (!campToken || !bildId) return "";
  return CAMP_BILD_BASIS + encodeURIComponent(campToken) + "/" + encodeURIComponent(bildId);
}

// Verkleinert wird im Browser, BEVOR das Bild hochgeht. Michel lädt Plakate aus
// WhatsApp oder direkt aus Canva hoch — das sind schnell 4 MB, und die müssten
// sonst bei jedem Aufruf der Vereinsseite über die Leitung.
const CAMP_BILD_MAX_KANTE = 1400;              // längste Kante in Pixeln
const CAMP_BILD_QUALITAET = 0.82;              // JPEG-Qualität
// ⚠️ Muss zu FC_MAX_BILD_BYTES im Worker passen. Steht hier nur, damit die App
// eine verständliche Meldung zeigen kann statt eines 413 vom Server.
const CAMP_BILD_MAX_BYTES = 3 * 1024 * 1024;

// Zustände eines Camps. Die Reihenfolge ist zugleich der übliche Weg.
//
// ⚠️ Nur "offen" nimmt Anmeldungen an, und nur "offen" erscheint im Popup auf
// der Vereins-Homepage. "entwurf" ist bewusst unsichtbar — ein halb angelegtes
// Camp soll nicht schon beworben werden. Der Worker prüft das selbst; das hier
// ist nur die Beschriftung.
const CAMP_STATUS = [
  { id: "entwurf",      label: "Entwurf",      farbe: "#6b7280", hinweis: "Noch nicht sichtbar. Weder auf der Homepage noch für Anmeldungen." },
  { id: "offen",        label: "Anmeldung offen", farbe: "#1f9d55", hinweis: "Erscheint auf der Homepage und nimmt Anmeldungen an." },
  { id: "geschlossen",  label: "Geschlossen",  farbe: "#c9941f", hinweis: "Keine neuen Anmeldungen mehr. Bestehende bleiben, Jobs lassen sich weiter besetzen." },
  { id: "abgeschlossen", label: "Abgeschlossen", farbe: "#374151", hinweis: "Das Camp ist gelaufen. Ab hier läuft die Frist zum Aufräumen." }
];

// Die Felder des Anmeldeformulars. Je Camp lässt sich jedes auf „pflicht",
// „optional" oder „aus" stellen (siehe FELD_STUFEN).
//
// ⚠️ Diese Liste ist die EINZIGE Wahrheit über die Formularfelder — Client und
// Worker leiten daraus ab, was gespeichert und angezeigt wird. Ein neues Feld
// gehört hierher UND in FC_FELDER in admin-worker.js; die beiden Fassungen sind
// gegeneinander geprüft. Steht ein Feld nur hier, wirft der Worker es weg.
//
// `gruppe` steuert nur die Überschrift im Formular. `sensibel` markiert die
// Felder, die in der Betreuer-Sicht mitkommen dürfen, aber nie in einem Export
// ohne Bearbeiten-Recht landen.
const FORMULAR_FELDER = [
  // Kind — Vor- und Nachname sind nicht abwählbar, ohne sie gibt es keine Anmeldung.
  { id: "kindVorname",     gruppe: "kind",        label: "Vorname des Kindes",   typ: "text",   fest: true,  maxLen: 60 },
  { id: "kindNachname",    gruppe: "kind",        label: "Nachname des Kindes",  typ: "text",   fest: true,  maxLen: 60 },
  { id: "geburtsdatum",    gruppe: "kind",        label: "Geburtsdatum",         typ: "datum",  maxLen: 10, hinweis: "Damit die Gruppen nach Alter eingeteilt werden können." },
  // ⚠️ `gruppen` statt einer flachen Liste: mit 21 Einträgen ist der Sprung von
  // 176 auf XS sonst nicht einzuordnen. `optionen` wird daraus abgeleitet (siehe
  // unter FORMULAR_FELDER), nicht ein zweites Mal gepflegt.
  { id: "trikotgroesse",   gruppe: "kind",        label: "Konfektionsgröße",     typ: "auswahl",
    gruppen: [
      { label: "Kindergrößen",      optionen: ["98", "104", "110", "116", "122", "128", "134", "140", "146", "152", "158", "164", "170", "176"] },
      { label: "Erwachsenengrößen", optionen: ["XS", "S", "M", "L", "XL", "XXL", "3XL"] }
    ],
    hinweis: "Für das Camp-Trikot." },
  { id: "verein",          gruppe: "kind",        label: "Verein",               typ: "text",   maxLen: 80, hinweis: "Leer lassen, wenn das Kind in keinem Verein spielt." },
  { id: "position",        gruppe: "kind",        label: "Lieblingsposition",    typ: "auswahl", optionen: ["Torwart", "Abwehr", "Mittelfeld", "Sturm", "egal"] },

  // Erziehungsberechtigte — die E-Mail ist nicht abwählbar, an sie geht die
  // Bestätigung samt Zahldaten und dem Link zum Ändern.
  { id: "elternName",      gruppe: "eltern",      label: "Name der Erziehungsberechtigten", typ: "text", fest: true, maxLen: 120 },
  { id: "elternEmail",     gruppe: "eltern",      label: "E-Mail",               typ: "email",  fest: true,  maxLen: 160, hinweis: "Hierhin geht die Bestätigung mit den Zahldaten." },
  { id: "elternTelefon",   gruppe: "eltern",      label: "Handy für Notfälle",   typ: "text",   maxLen: 60 },
  { id: "elternAnschrift", gruppe: "eltern",      label: "Anschrift",            typ: "text",   maxLen: 200 },

  // Gesundheit. ⚠️ Art. 9 DSGVO — nur erheben, was für das Camp gebraucht wird.
  //
  // ⚠️ `janein_text` statt eines nackten Textfeldes (Michel-Vorgabe 2026-09-03):
  // erst die Frage, und nur bei „Ja" öffnet sich das Feld für das Was. In ein
  // Pflicht-Textfeld „Allergien" schreiben die Eltern sonst „keine" — und dann
  // steht auf jeder Liste dieselbe Nicht-Information.
  //
  // ⚠️ Gespeichert werden ZWEI Werte: `<id>Hat` („ja"/„nein"/leer) und `<id>`
  // (der Text, nur bei „ja"). Ein einzelnes Feld könnte „nein" nicht von „noch
  // nicht beantwortet" unterscheiden — derselbe Grund wie bei `alleinNachHause`.
  //
  // `label` ist die Ja/Nein-Frage, `detail` die Beschriftung des Textfeldes
  // darunter. `hinweis` steht wie gehabt klein darunter.
  { id: "allergien",       gruppe: "gesundheit",  label: "Hat dein Kind Allergien?",   typ: "janein_text", detail: "Welche Allergien?", maxLen: 500, sensibel: true },
  { id: "medikamente",     gruppe: "gesundheit",  label: "Nimmt dein Kind Medikamente?", typ: "janein_text", detail: "Welche Medikamente, und wann?", maxLen: 500, sensibel: true },
  { id: "krankheiten",     gruppe: "gesundheit",  label: "Sollen wir sonst etwas über die Gesundheit wissen?", typ: "janein_text", detail: "Was sollen wir wissen?", maxLen: 500, sensibel: true, hinweis: "Asthma, Brille, Unverträglichkeiten — alles, was im Notfall zählt." },
  { id: "krankenkasse",    gruppe: "gesundheit",  label: "Krankenkasse",         typ: "text",   maxLen: 100, sensibel: true },

  // Verpflegung
  { id: "vegetarisch",     gruppe: "essen",       label: "Isst vegetarisch",     typ: "haken" },
  { id: "essenHinweis",    gruppe: "essen",       label: "Gibt es beim Essen etwas zu beachten?", typ: "janein_text", detail: "Was ist beim Essen zu beachten?", maxLen: 300, sensibel: true },

  // Heimweg. ⚠️ `alleinNachHause` ist bewusst KEIN Haken, sondern eine Ja/Nein-Frage.
  // Bei einem Haken wären „nein" und „vergessen anzukreuzen" derselbe Zustand — und
  // am letzten Camptag steht dann jemand vor der Frage, ob das Kind gehen darf, und
  // hat nur ein leeres Kästchen als Antwort. Als Pflichtfeld wäre ein Haken sogar
  // schlimmer: er ließe sich nur erfüllen, indem man JEDEM Kind erlaubt zu gehen.
  //
  // ⚠️ Hier stand bis 2026-08-21 ein Häkchen `einwilligungFoto`. Es ist entfallen
  // (Michel-Entscheidung): die Foto-Einwilligung regelt jetzt allein Punkt 16 der
  // Teilnahmebedingungen, und die sind Pflicht. Wer es zurückholt, holt sich den
  // Widerspruch zurück — zwei Stellen, die dasselbe unterschiedlich beantworten
  // können. Die Art.-13-Information auf anmeldung.html verweist stattdessen auf
  // Punkt 16; wer das eine ändert, zieht das andere mit.
  { id: "alleinNachHause",  gruppe: "heimweg", label: "Darf das Kind nach dem Camp allein nach Hause gehen?", typ: "janein", hinweis: "Wenn nein: bitte unten eintragen, wer es abholen darf." },
  { id: "abholberechtigt",  gruppe: "heimweg", label: "Wer darf das Kind abholen",                    typ: "mehrzeilig", maxLen: 300 },

  // Freitext
  { id: "bemerkung",       gruppe: "sonstiges",   label: "Bemerkung",            typ: "mehrzeilig", maxLen: 800 }
];

// Überschriften der Feldgruppen im Formular, in dieser Reihenfolge.
const FELD_GRUPPEN = [
  { id: "kind",         label: "Das Kind" },
  { id: "eltern",       label: "Erziehungsberechtigte" },
  { id: "gesundheit",   label: "Gesundheit",    hinweis: "Diese Angaben sehen nur die Verantwortlichen und die Betreuer im Camp." },
  { id: "essen",        label: "Verpflegung" },
  // Hieß bis 2026-08-21 „Einverständnis" — mit dem Wegfall des Foto-Häkchens
  // stehen hier nur noch die beiden Fragen zum Heimweg.
  { id: "heimweg",      label: "Abholung und Heimweg" },
  { id: "sonstiges",    label: "Sonstiges" }
];

const FELD_STUFEN = [
  { id: "aus",      label: "nicht fragen" },
  { id: "optional", label: "fragen, freiwillig" },
  { id: "pflicht",  label: "fragen, Pflicht" }
];

// Beschriftung der Ja/Nein-Felder. Steht hier und nicht im Formularbauer, damit
// die Anmeldeseite, die Anmeldeliste und der Export dieselben Wörter benutzen.
const JANEIN = [
  { id: "ja",   label: "Ja" },
  { id: "nein", label: "Nein" }
];

// ---------- Feldspieler oder Torwart (seit 2026-09-03) ----------
//
// Am Camp steht, WAS angeboten wird; an der Anmeldung, WOFÜR dieses Kind kommt.
// Der Zweck ist die Personalplanung: ohne die Zahl der Torhüter weiß niemand,
// wie viele Torwarttrainer gebraucht werden.
//
// ⚠️ Das ist KEIN Eintrag in FORMULAR_FELDER, und das ist Absicht: ob die Frage
// im Anmeldeformular auftaucht, hängt nicht an einer Einstellung je Camp,
// sondern daran, ob das Camp beide Ausrichtungen anbietet. Bietet es nur eine
// an, wird nicht gefragt — die Antwort steht ja fest.
//
// ⚠️ Zeichengleich mit FC_ROLLEN / FC_ROLLEN_LABEL im Worker.
const ROLLEN = [
  { id: "feldspieler", label: "Feldspieler" },
  { id: "torwart",     label: "Torwart" }
];

function rolleLabel(id) {
  const r = ROLLEN.find((x) => x.id === id);
  return r ? r.label : "Feldspieler";
}

// ---------- Feedbackbogen (seit 2026-09-03) ----------
//
// ⚠️ Die WIRKSAME Liste ist FC_FEEDBACK_FRAGEN im Worker — er liefert sie zur
// Anzeige gleich mit und wirft beim Speichern alles weg, was dort nicht steht.
// Diese Fassung hier ist der Rückfall für die Auswertung in der App, damit die
// Überschriften auch dann stimmen, wenn gerade nichts geladen wurde.
const FEEDBACK_FRAGEN = [
  { id: "gesamt",       typ: "note",   frage: "Wie hat es deinem Kind insgesamt gefallen?" },
  { id: "training",     typ: "note",   frage: "Training und Betreuung durch die Trainer" },
  { id: "essen",        typ: "note",   frage: "Verpflegung und Essen" },
  { id: "organisation", typ: "note",   frage: "Organisation und Information vorab" },
  { id: "anlage",       typ: "note",   frage: "Plätze, Räume und Ausstattung" },
  { id: "wieder",       typ: "janein", frage: "Würdest du dein Kind wieder zu einem unserer Camps anmelden?" },
  { id: "gut",          typ: "text",   frage: "Was hat besonders gut gefallen?" },
  { id: "besser",       typ: "text",   frage: "Was sollen wir beim nächsten Mal besser machen?" }
];

// Schulnoten 1 bis 6 (Michel-Vorgabe 2026-09-03, vorher 1–5).
//
// ⚠️ Die Beschriftung steht an JEDEM Knopf, nicht nur an den Enden der Reihe.
// Eine nackte Skala beantwortet nicht, welche Seite gut ist — Schulnote und
// Sternchen laufen genau andersherum, und wer sich vertut, verdirbt seine
// Antwort, ohne es zu merken.
//
// ⚠️ Bewusst die echten Schulnoten-Wörter statt umgangssprachlicher („geht so",
// „gar nicht"). Sie sind in Deutschland jedem geläufig und lassen keinen Zweifel
// an der Richtung — genau darum geht es hier.
//
// ⚠️ Zeichengleich mit FC_FEEDBACK_NOTEN im Worker; der Prüfstand nagelt beide
// Fassungen gegeneinander fest.
const FEEDBACK_NOTEN = [
  { wert: 1, label: "sehr gut" },
  { wert: 2, label: "gut" },
  { wert: 3, label: "befriedigend" },
  { wert: 4, label: "ausreichend" },
  { wert: 5, label: "mangelhaft" },
  { wert: 6, label: "ungenügend" }
];

const FEEDBACK_TEXT_MAX = 1000;

// Obergrenze für den Tagesablauf am Camp. Muss zu FC_ABLAUF_MAX im Worker
// passen — steht hier nur, damit das Textfeld selbst schon begrenzt.
const ABLAUF_MAX = 4000;

// Die Felder, die ein Betreuer über fussballcamp-teilnehmer zu sehen bekommt.
// ⚠️ Steht ZEICHENGENAU so auch als FC_BETREUER_FELDER im Worker — dort ist die
// Liste die wirksame; diese hier dient nur der Anzeige. Wer sie erweitert, muss
// beide anfassen, sonst kommt das Feld gar nicht erst an.
//
// ⚠️ `trikotgroesse` steht seit 2026-09-03 dabei (Michel-Vorgabe): das ist die
// Liste, die die Trainer am letzten Camptag in der Hand halten, wenn das
// Material ausgegeben wird.
const BETREUER_FELDER = ["kindVorname", "kindNachname", "geburtsdatum", "trikotgroesse", "allergien", "medikamente", "krankheiten", "essenHinweis", "elternTelefon", "alleinNachHause"];

// Vorschlag für den ersten Job-Katalog. Wird nur angeboten, solange gar kein
// Katalog existiert — danach ist der gepflegte Katalog die Wahrheit.
//
// ⚠️ Anders als in der Spieltagscrew sind `von`/`bis` ECHTE UHRZEITEN, keine
// Minuten relativ zu irgendwas: ein Camp hat keinen Anstoß, an dem sich etwas
// ausrichten ließe.
const DEFAULT_JOBS = [
  { name: "Campleitung",       beschreibung: "Ansprechpartner vor Ort, Tagesablauf, Notfälle", anzahl: 1, von: "08:00", bis: "16:30" },
  { name: "Gruppenbetreuung",  beschreibung: "Eine Gruppe über den Tag begleiten",             anzahl: 4, von: "08:30", bis: "16:00" },
  { name: "Empfang",           beschreibung: "Kinder annehmen und abmelden, Liste führen",      anzahl: 1, von: "08:00", bis: "09:30" },
  { name: "Mittagessen",       beschreibung: "Essen holen, ausgeben, abräumen",                 anzahl: 2, von: "11:30", bis: "13:30" },
  { name: "Getränke und Obst", beschreibung: "Versorgung an den Plätzen",                       anzahl: 1, von: "09:00", bis: "16:00" },
  { name: "Erste Hilfe",       beschreibung: "Sanitätskasten, kleine Blessuren",                anzahl: 1, von: "08:30", bis: "16:30" },
  { name: "Aufbau",            beschreibung: "Tore, Hütchen, Leibchen, Getränke stellen",       anzahl: 2, von: "07:30", bis: "08:30" },
  { name: "Abbau",             beschreibung: "Einsammeln, Platz herrichten, abschließen",       anzahl: 2, von: "16:00", bis: "17:00" }
];

// Vorgaben für eine noch leere Datei. Änderbar im Verwaltungs-Tab.
//
// ⚠️ `agbText` steht hier LEER, und das ist kein Versehen. Der wirksame Text ist
// FC_AGB_VORGABE im Worker; leer heißt „nimm die Vorgabe". Sonst stünde derselbe
// Rechtstext in zwei Dateien, und man änderte irgendwann die falsche.
const DEFAULT_EINSTELLUNGEN = {
  iban: "", bic: "", kontoinhaber: "1. SC 1911 Heiligenstadt e.V.", bank: "",
  kontaktName: "", kontaktEmail: "",
  agbText: "",
  startErinnerung: true, startErinnerungTage: 3,
  zahlErinnerung: true, zahlErinnerungTage: 14,
  // ⚠️ Der Feedbackbogen ist per Vorgabe AUS — anders als die beiden
  // Erinnerungen darüber. Er verschickt Post an Familien, deren Camp schon
  // gelaufen ist; das soll jemand bewusst einschalten.
  feedbackAktiv: false, feedbackTage: 2,
  aufraeumenNachMonaten: 6
};

// Obergrenze für den AGB-Text. Großzügig — die vorliegende Fassung liegt bei rund
// 5.000 Zeichen, und der Text wird bei jedem Aufruf der Anmeldeseite mitgeliefert.
const AGB_MAX_ZEICHEN = 30000;

// Standard-Feldeinstellung für ein neu angelegtes Camp: der Satz, den die
// meisten Camps brauchen. Alles, was hier fehlt, steht auf "aus".
//
// ⚠️ Die sechs Pflichtfelder sind eine Vorgabe des Nachwuchsbereichs (Michael Apel,
// 2026-08-21) und der Mindestsatz, ohne den ein Camp nicht durchführbar ist:
// Name (fest), Geburtsdatum, Konfektionsgröße, Allergien, „allein nach Hause",
// E-Mail (fest) und Telefon. Sie lassen sich je Camp weiterhin umstellen — das
// hier ist die Vorbelegung, keine Sperre.
const DEFAULT_FELDER = {
  geburtsdatum: "pflicht",
  trikotgroesse: "pflicht",
  verein: "optional",
  elternTelefon: "pflicht",
  allergien: "pflicht",
  medikamente: "optional",
  krankheiten: "optional",
  vegetarisch: "optional",
  essenHinweis: "optional",
  alleinNachHause: "pflicht",
  abholberechtigt: "optional",
  bemerkung: "optional"
};

// ---------- Erstattung nach Punkt 4 der Teilnahmebedingungen ----------
//
// Die Staffel, nach der sich richtet, wie viel Beitrag der Verein nach einer
// Absage der Familie zurückzahlt. Punkt 4 lautet:
//   bis einschließlich 28 Tage vor Campbeginn   -> 100 % des Beitrages
//   27 bis einschließlich 7 Tage vor Campbeginn ->  50 % des Beitrages
//   ab 6 Tage vor Campbeginn                    -> keine Erstattung
//
// ⚠️ Der Rechtstext ist die Quelle, nicht diese Zahlen. Und sie stehen ein
// ZWEITES Mal im Worker (`FC_ERSTATTUNG_VOLL_AB_TAGEN` / `_HALB_AB_TAGEN` in
// admin-worker.js): dort entscheiden sie, was in der Absage-Mail an die Eltern
// steht, hier, was der Verwaltung im Dialog angezeigt wird. Wer eine Seite
// ändert, MUSS die andere mitziehen — sonst nennt die Mail der Familie eine
// andere Quote als der Bildschirm, von dem aus überwiesen wird.
const FC_ERSTATTUNG_VOLL_AB_TAGEN = 28;
const FC_ERSTATTUNG_HALB_AB_TAGEN = 7;

// ⚠️ Genau der Text, den der Worker in `absageGrund` schreibt, wenn die ELTERN
// über ihren Link absagen (`handleFcMeineAbsagen`). Er ist der einzige Marker,
// der eine Eltern-Absage dauerhaft von einer Absage der Verwaltung trennt:
// `elternAenderung` räumt „Zur Kenntnis genommen" wieder weg, und der Verlauf
// mit seinem `quelle`-Feld verlässt den Server nie.
//
// ⚠️ Diese Unterscheidung ist keine Feinheit: Punkt 4 heißt „Rücktritt und
// Stornierung durch TEILNEHMENDE" und gilt nur, wenn die Familie storniert.
// Sagt der Verein ab, greift Punkt 11 (Erstattung grundsätzlich in voller
// Höhe). Der Absage-Knopf in der Verwaltung deckt beide Fälle ab — welcher
// vorliegt, weiß die App nicht, also darf sie dort keine Quote behaupten.
const FC_ABSAGE_GRUND_ELTERN = "von den Eltern abgesagt";

// Ab dieser Fensterbreite zeigt die Belegung das Gitter, darunter die
// Kartenliste. Der Wert steht doppelt — hier für die Logik, in style.css für
// die Darstellung; beide müssen zusammenpassen.
const GITTER_AB_PX = 768;

// ⚠️ `optionen` wird aus `gruppen` ABGELEITET, nie zweimal gepflegt. Zwei Listen
// für dieselbe Sache laufen auseinander, sobald jemand eine Größe ergänzt — und
// dann steht sie zwar im Formular, wird beim Anzeigen aber nicht mehr
// wiedererkannt. Felder ohne `gruppen` bleiben unberührt.
FORMULAR_FELDER.forEach((f) => {
  if (Array.isArray(f.gruppen)) f.optionen = f.gruppen.reduce((alle, g) => alle.concat(g.optionen || []), []);
});

const APP_CHANGELOG = [
  {
    version: "1.7",
    groups: [
      {
        title: "Allergien und Medikamente: erst die Frage, dann das Feld",
        items: [
          "Im Anmeldeformular stehen Allergien, Medikamente, Essenshinweise und „Was wir sonst wissen sollten“ jetzt als Frage mit Ja und Nein. Erst bei „Ja“ geht darunter ein Feld auf, in das geschrieben wird, worum es geht.",
          "Damit gibt es kein „keine“ mehr auf den Listen — die Eltern klicken „Nein“ und fertig.",
          "„Nein“ ist eine richtige Antwort: sie erfüllt auch ein Pflichtfeld und steht so in der Anmeldung. Vorher war „nicht beantwortet“ und „nichts vorhanden“ nicht zu unterscheiden.",
          "Wer „Ja“ ankreuzt, muss auch sagen was — sonst nimmt der Server die Anmeldung nicht an.",
          "Wechselt jemand von „Ja“ auf „Nein“, wird der Text mit gelöscht. Sonst stünde in der Anmeldung „Nein“ und daneben eine Allergie.",
          "Bestehende Anmeldungen bleiben, wie sie sind. Wer eine ändert, beantwortet die Frage einmal mit."
        ]
      }
    ]
  },
  {
    version: "1.6",
    groups: [
      {
        title: "Das Bearbeiten-Formular sieht aus wie der Rest",
        items: [
          "Die Felder stehen jetzt in zwei Spalten statt in einer langen Liste — dasselbe Raster wie im Camp-Dialog. Am Handy bleibt es eine Spalte.",
          "Lange Angaben wie Anschrift, Allergien oder Bemerkung gehen über die volle Breite, kurze teilen sich eine Zeile.",
          "Die Ausrichtung (Feldspieler/Torwart) steht jetzt bei „Das Kind“ statt allein über der ersten Überschrift.",
          "Der Dialog ist etwas breiter, damit alle Knöpfe in eine Zeile passen — vorher rutschte „Endgültig löschen“ allein in eine zweite."
        ]
      }
    ]
  },
  {
    version: "1.5",
    groups: [
      {
        title: "Anmeldung nachträglich ändern",
        items: [
          "Im Anmeldungs-Dialog steht ein Knopf „Angaben bearbeiten“. Damit lassen sich alle Angaben der Eltern korrigieren — Name, Geburtsdatum, Konfektionsgröße, Telefon, Allergien, alles was das Camp fragt. Bisher ging nur der Beitrags-Haken und die interne Notiz.",
          "Der Dialog bleibt beim Öffnen zum Ansehen. Erst der Knopf macht die Felder änderbar — sonst überschreibt man beim Nachschlagen schnell einmal eine Gesundheitsangabe.",
          "Wird etwas geändert, steht im Verlauf des Camps, wer wann welche Felder angefasst hat. Was vorher drinstand, wird bewusst nicht aufbewahrt.",
          "Die Eltern bekommen darüber keine Nachricht — sie ändern über ihren eigenen Link weiter selbst."
        ]
      }
    ]
  },
  {
    version: "1.4",
    groups: [
      {
        title: "Teilnehmerliste: nur noch das, was wirklich zählt",
        items: [
          "Schreiben Eltern bei Allergien oder Medikamenten „keine“, steht das auf der Teilnehmerliste nicht mehr. Vorher stand bei fast jedem Kind „Allergien: Keine · Medikamente: Keine“, und dazwischen ging die eine echte Angabe unter.",
          "Der Merker „beachten“ erscheint nur noch, wenn wirklich etwas zu beachten ist — eine Allergie, ein Medikament, ein Essenshinweis oder eine Bemerkung. Vorher leuchtete er bei allen und sagte damit nichts mehr.",
          "Dasselbe gilt für den Merker „Gesundheit“ in der Anmeldeliste.",
          "Gespeichert bleibt alles: Im Anmeldungs-Dialog unter „Anmeldungen“ steht weiter, was die Eltern geschrieben haben — „keine“ ist eine beantwortete Frage und etwas anderes als ein leeres Feld.",
          "Eine echte Angabe wird nie verschluckt: „keine Nüsse“ oder „keine Medikamente, aber Asthmaspray“ bleiben stehen. Ausgeblendet wird nur, was als Ganzes nichts sagt."
        ]
      }
    ]
  },
  {
    version: "1.3",
    groups: [
      {
        title: "Feedbackbogen: Schulnoten 1 bis 6",
        items: [
          "Der Bogen fragt jetzt in Schulnoten von 1 bis 6 statt bis 5 — mit den gewohnten Wörtern von „sehr gut“ bis „ungenügend“. Damit ist klar, welche Seite gut ist.",
          "Die Knöpfe stehen in einem gleichmäßigen Raster: am Rechner zweimal drei, am Handy dreimal zwei. Vorher stand die letzte Note allein in einer Zeile und zog sich über die ganze Breite."
        ]
      }
    ]
  },
  {
    version: "1.2",
    groups: [
      {
        title: "Alle E-Mails an einer Stelle",
        items: [
          "Unter Verwaltung stehen jetzt alle neun Mails, die die App an die Eltern verschickt — mit Betreff, vollem Text und dem Hinweis, wann sie rausgeht. Aufklappen und nachlesen, ohne dass jemand im Programm nachsehen muss.",
          "Jeden Text kannst du ändern. Gespeichert wird zusammen mit den übrigen Einstellungen; ein Programm-Update braucht es dafür nicht.",
          "Bausteine in geschweiften Klammern werden beim Verschicken ersetzt — zum Beispiel {kind} für den Namen des Kindes oder {zahlungsblock} für Betrag, Konto und Verwendungszweck. Neben jeder Mail steht, welche es dort gibt.",
          "Ein paar Bausteine sind Pflicht: die Kontoverbindung, der persönliche Link zur Anmeldung und die Erstattungsregel bei einer Absage. Ohne sie nimmt der Server die Vorlage nicht an — sonst stünden die Eltern ohne Zahlungsangaben oder ohne Weg zu ihrer Anmeldung da.",
          "Jede Mail hat einen Knopf „Auf die mitgelieferte Fassung zurücksetzen“. Ein leeres Feld bedeutet dasselbe."
        ]
      },
      {
        title: "Feedbackbogen ansehen",
        items: [
          "Unter Verwaltung steht neben „Jetzt auslösen“ ein Knopf „Bogen ansehen“. Er öffnet den Feedbackbogen so, wie ihn die Eltern nach dem Camp bekommen — mit einem deutlichen Hinweis oben, dass nichts gespeichert und nichts verschickt wird.",
          "Es ist dieselbe Seite, die auch die Eltern sehen, nur ohne Anmeldung dahinter. Der persönliche Link einer Familie lässt sich nämlich nicht nachschlagen: er verlässt den Server nie, auch nicht für dich."
        ]
      }
    ]
  },
  {
    version: "1.1",
    groups: [
      {
        title: "Feldspieler oder Torwart",
        items: [
          "Beim Anlegen eines Camps kreuzt du an, für wen es ist: Feldspieler, Torwart oder beides. Mindestens eines von beiden muss dastehen.",
          "Bietet ein Camp beides an, fragt das Anmeldeformular die Eltern, als was ihr Kind kommt — dann steht in der Anmeldeliste und auf der Teilnehmerliste, wer Torwart ist, und oben steht, wie viele es sind. So lässt sich planen, wie viele Torwarttrainer gebraucht werden.",
          "Bietet ein Camp nur eine Ausrichtung an, wird nicht gefragt: die Antwort steht ja schon fest. Bestehende Camps gelten als Feldspieler-Camp und ändern sich nicht von selbst."
        ]
      },
      {
        title: "Das Camp schließt sich selbst",
        items: [
          "Ist der Anmeldeschluss vorbei, springt das Camp in der Nacht darauf von „Anmeldung offen“ auf „Geschlossen“. Bisher nahm es zwar keine Anmeldung mehr an, stand in der Liste aber weiter auf offen.",
          "Der Anmeldelink verschwindet dabei auch aus dem Termin im Vereinskalender — er führte danach nur noch auf eine Seite, die die Anmeldung ablehnt."
        ]
      },
      {
        title: "Mail, wenn der Beitrag da ist",
        items: [
          "Hakst du in der Anmeldeliste jemanden als bezahlt ab, geht an die Eltern automatisch eine Bestätigung — mit dem Betrag und dem Ablauf des Camps.",
          "Den Ablauf schreibst du beim Anlegen des Camps in ein eigenes Feld und kannst ihn jederzeit nachpflegen. Steht dort nichts, kommt die Mail trotzdem, nur ohne diesen Teil.",
          "Die Mail geht höchstens einmal je Anmeldung. Den Haken kannst du also gefahrlos hin und her stellen, ohne dass eine Familie dreimal dieselbe Bestätigung bekommt."
        ]
      },
      {
        title: "Feedbackbogen nach dem Camp",
        items: [
          "Ein paar Tage nach dem letzten Camptag bekommen die Eltern eine Mail mit einem Link zu einem kurzen Bogen: Gesamteindruck, Training, Essen, Organisation, Ausstattung, dazu zwei Freitextfelder.",
          "Die Antworten sind anonym. Wir merken uns, WER geantwortet hat, damit niemand zweimal abstimmt — die Antwort selbst wird ohne Namen, ohne Uhrzeit und an zufälliger Stelle abgelegt, sodass sie sich nicht zurückverfolgen lässt.",
          "Unter „Feedback“ steht die Auswertung je Camp: Durchschnitt und Verteilung je Frage sowie die Freitexte.",
          "Der Bogen ist von sich aus AUS und muss unter Verwaltung eingeschaltet werden. Danach gilt er nur für Camps, deren letzter Tag höchstens drei Wochen zurückliegt — sonst bekämen beim Einschalten alle Eltern aller alten Camps eine Mail."
        ]
      },
      {
        title: "Kleinigkeiten",
        items: [
          "Auf der Teilnehmerliste — der Liste, die die Betreuer am Platz sehen — steht jetzt auch die Konfektionsgröße. Sie wird gebraucht, wenn das Material ausgegeben wird."
        ]
      }
    ]
  },
  {
    version: "1.0",
    groups: [
      {
        title: "Ein Camp anlegen",
        items: [
          "Ein Camp bekommt Zeitraum, tägliche Uhrzeit, Ort, Altersspanne, Platzzahl und einen Beitrag. Aus dem Zeitraum entstehen sofort echte Camp-Tage — das ist die Grundlage für die Aufgaben und die Teilnehmerlisten.",
          "Ein neues Camp ist zuerst ein Entwurf und damit für niemanden sichtbar. Erst „Anmeldung öffnen“ stellt es auf die Homepage und nimmt Anmeldungen an.",
          "Zu jedem Camp gehört ein Anmeldefenster mit Datum von und bis. Läuft es ab, schließt die Anmeldung von selbst — es muss niemand daran denken.",
          "Zu jedem Camp lässt sich ein Bild hochladen, zum Beispiel das Werbeplakat. Große Bilder verkleinert der Browser vor dem Hochladen, ein Plakat aus WhatsApp oder Canva kannst du also einfach so auswählen. Ein Camp ohne Bild sieht schlicht aus wie jedes andere.",
          "Welche Felder das Anmeldeformular fragt, entscheidest du je Camp: nicht fragen, freiwillig oder Pflicht. Ein neues Camp fragt von sich aus verpflichtend nach Name, Geburtsdatum, Konfektionsgröße, Allergien, „darf allein nach Hause“ sowie E-Mail und Telefon der Erziehungsberechtigten."
        ]
      },
      {
        title: "Auf der Vereins-Homepage und im Vereinskalender",
        items: [
          "Die App liefert einen fertigen Schnipsel für die Homepage. Er wird einmal eingebaut und bleibt danach unangetastet: welches Camp dort erscheint, entscheidet allein der Status in dieser App. Eine Vorschau zeigt vorher, wie das Fenster auf einer fremden Seite aussieht.",
          "Auf der Homepage öffnet sich ein Fenster mit den offenen Camps, dem Plakat und einem Knopf zur Anmeldung. Wer es wegklickt, bekommt es sieben Tage lang nicht wieder zu sehen; ein neues Camp erscheint trotzdem.",
          "Zusätzlich gibt es zu jedem Camp einen normalen Link zum Weitergeben — für WhatsApp, Aushang oder Elternbrief.",
          "Sobald du ein Camp aus dem Entwurf holst, legt es sich selbst als Termin im Vereinskalender ab — mit Namen, Tagen, Ort, täglicher Uhrzeit, Jahrgängen und Anmeldelink. Damit steht das Camp auch bei allen, die den Vereinskalender abonniert haben, also im Handy der Trainer.",
          "Änderst du am Camp etwas, zieht der Termin nach. Stellst du es zurück auf Entwurf, ist er wieder weg. An der Camp-Karte steht, ob der Termin im Vereinskalender angekommen ist. Löschst du ihn dort von Hand, bleibt er gelöscht."
        ]
      },
      {
        title: "Anmeldung",
        items: [
          "Die Eltern melden ohne Vereinskonto an, über einen Link oder das Fenster auf der Homepage.",
          "Ein Kind je Anmeldung. Nach dem Absenden führt ein Knopf direkt zur nächsten Anmeldung, bei der die Elternangaben schon ausgefüllt sind.",
          "Ist das Camp voll, kommt die Anmeldung auf die Warteliste — mit Platznummer, sichtbar für die Eltern. Nachrücken lässt du selbst per Klick; die Zusage geht dann automatisch per Mail raus.",
          "Bei der Konfektionsgröße stehen alle Kindergrößen von 98 bis 176 in Zweierschritten sowie XS bis 3XL zur Wahl, nach Kinder- und Erwachsenengrößen getrennt.",
          "„Darf allein nach Hause“ ist eine Ja/Nein-Frage, kein Häkchen. Bei einem Häkchen wären „nein“ und „nicht angekreuzt“ derselbe Zustand — am letzten Camptag ist das ein Unterschied, der zählt.",
          "Vor dem Absenden stehen die Teilnahmebedingungen im Formular, aufklappbar und mit eigenem Pflicht-Häkchen. Ohne dieses Häkchen nimmt der Server keine Anmeldung an. Der Text wird unter „Verwaltung → Teilnahmebedingungen“ gepflegt und erscheint sofort im Formular.",
          "Bei jeder Anmeldung wird festgehalten, welche Fassung der Bedingungen die Eltern anerkannt haben. Änderst du den Text später, bleibt für die früheren Anmeldungen die damals gültige Fassung erhalten und ist im Anmeldedialog nachlesbar."
        ]
      },
      {
        title: "Beitrag",
        items: [
          "Ein Beitrag je Camp. Betrag, Kontoverbindung und Verwendungszweck stehen auf der Bestätigungsseite und in der Bestätigungsmail. Den Verwendungszweck baut die App selbst aus Camp- und Kindernamen, damit auf dem Kontoauszug erkennbar ist, wofür das Geld kam.",
          "Ein Camp kann einen Frühbucherpreis mit Stichtag haben. Der günstigere Beitrag gilt bis einschließlich des gewählten Tages und wird bei der Anmeldung festgehalten — wer im Frühbucherfenster gebucht hat, behält ihn auch danach. Sichtbar ist er im Fenster auf der Homepage, auf der Anmeldeseite und auf der Camp-Karte, überall mit dem Datum, bis wann er gilt.",
          "Als Zahlungsziel nennt die Bestätigung den Tag genau eine Woche vor dem ersten Camp-Tag. Wer sich später anmeldet, wird um umgehende Zahlung gebeten — eine Frist zu nennen, die schon vorbei ist, hilft niemandem.",
          "In der Anmeldeliste hakst du ab, wer bezahlt hat. Ein Filter zeigt die offenen Beiträge, und eine Zahlungserinnerung lässt sich für alle Offenen auf einmal auslösen. Sie geht erst raus, wenn die eingestellte Wartezeit um ist UND die Zahlungsfrist naht oder vorbei ist.",
          "Kontoinhaber, IBAN, BIC und Bank sind gesperrt und grau. Zum Ändern erst auf „Zum Ändern freigeben“, dann siehst du alt und neu nebeneinander und bestätigst noch einmal. Danach schnappt das Schloss von allein wieder zu. Die IBAN wird über ihre Prüfziffer geprüft, ein Zahlendreher wird also abgelehnt."
        ]
      },
      {
        title: "Ändern und Absagen",
        items: [
          "Jede Bestätigung enthält einen persönlichen Link. Darüber ändern die Eltern ihre Angaben oder sagen ab. Der Link geht ausschließlich per E-Mail an die hinterlegte Adresse und wird nie auf der Seite angezeigt.",
          "Der Meldekasten nennt beim Namen, WAS die Eltern geändert haben, zum Beispiel „hat geändert: Handy für Notfälle, Allergien“. Wer speichert, ohne etwas zu ändern, löst gar keine Meldung aus.",
          "Sagt eine Familie über ihren Link ab, bekommt sie sofort eine Bestätigung per Mail. Sie nennt die Erstattungsregel aus den Teilnahmebedingungen, verspricht aber nie einen konkreten Betrag — über die Rückzahlung entscheidet weiterhin ein Mensch. Bei einem Freiplatz steht nichts über Geld darin.",
          "Sagst du selbst ab, öffnet sich ein Fenster mit dem Grund und einem Häkchen „Eltern per E-Mail benachrichtigen“. Das Häkchen ist vorbelegt; für eine Dublette oder einen Testeintrag nimmst du es heraus. Ohne hinterlegte E-Mail-Adresse ist es grau, und daneben steht warum. Der Absagegrund bleibt in jedem Fall intern.",
          "Zu jeder abgesagten Anmeldung zeigt die App den Abschnitt „Absage und Erstattung“: Eingangstag der Absage, Abstand zum Camp-Beginn, die greifende Stufe der Teilnahmebedingungen und den zurückzuzahlenden Betrag. Gerechnet wird mit dem Eingangstag, nicht mit dem heutigen. Ohne Haken „bezahlt“ steht dort „nichts“ samt Grund, bei fehlendem Anfangsdatum „nicht bestimmbar“, und bei einer Absage durch den Verein „von Hand klären“. Der Betrag ist eine Ablesehilfe, keine Anweisung."
        ]
      },
      {
        title: "Aufgaben und Helfer",
        items: [
          "Der Aufgaben-Katalog wird einmal gepflegt: Name, Beschreibung, benötigte Personenzahl, Uhrzeit von und bis.",
          "Aufgaben hängen am einzelnen Camp-Tag. Beim Anlegen setzt ein Häkchen dieselbe Aufgabe auf allen Tagen des Camps auf einmal — ausfüllen muss man sie nur einmal.",
          "Wer Zugriff auf das Werkzeug hat, trägt sich selbst ein und wieder aus. Eine volle Aufgabe nimmt niemanden mehr an; das prüft der Server, nicht nur die Oberfläche.",
          "Helfer ohne Vereinskonto trägst du als freien Namen ein. An der Aufgabe steht dann, wer den Eintrag vorgenommen hat.",
          "Anders als in der Spieltagscrew darf eine Person am selben Tag mehrere Aufgaben übernehmen — vormittags Betreuung, mittags Essensausgabe ist beim Camp der Normalfall."
        ]
      },
      {
        title: "Listen zum Ausdrucken",
        items: [
          "Der Aufgabenplan eines Camps lässt sich als Ganzes ausdrucken — mit allen Tagen, Zeiten und eingetragenen Helfern.",
          "Die Teilnehmerliste der Betreuer ist auf das Nötige verkürzt: Name, Alter, Allergien, Medikamente, Notfallnummer. Bei einem Kind, das nicht allein nach Hause darf, steht ein sichtbarer roter Hinweis.",
          "Die vollständige Anmeldeliste lässt sich drucken oder als Excel-Datei ausgeben — mit Nummer, Status, Zahlungsstand, Verwendungszweck und allen Feldern, die dieses Camp abfragt."
        ]
      },
      {
        title: "Wer darf was",
        items: [
          "Sehen: Camps, Camp-Tage und Aufgaben. Anmeldungen und Kinderdaten sind hier nicht dabei.",
          "Betreuer: Wer an einem Camp auf mindestens einer Aufgabe steht, sieht für dieses Camp die kurze Teilnehmerliste. Ohne Anschrift, ohne Beitragsstand. Diese Liste stellt der Server zusammen; wer nicht eingetragen ist, bekommt die Daten gar nicht erst geschickt.",
          "Bearbeiten: Camps und Camp-Tage pflegen, Anmeldungen einsehen und ändern, Beiträge abhaken, nachrücken lassen, Listen ausgeben.",
          "Administrieren: Kontoverbindung, Ansprechpartner, Aufgaben-Katalog, Erinnerungen, Teilnahmebedingungen, Löschen und der Schnipsel für die Homepage.",
          "Der Reiter „Info“ ist für alle sichtbar.",
          "Fällt jemandem ein Recht weg, während er die App offen hat, verschwinden nicht nur die Reiter: Anmeldeliste, Meldekasten, Teilnehmerliste und die Felder der Verwaltung werden geräumt, ein offener Anmelde-Dialog wird geschlossen und geleert."
        ]
      },
      {
        title: "Datenschutz",
        items: [
          "Auf der Anmeldeseite steht die Pflichtinformation nach Art. 13 DSGVO mit Anschrift des Vereins, Aufsichtsbehörde und allen beteiligten Dienstleistern. Die Eltern müssen ihr Einverständnis ausdrücklich geben; ohne diesen Haken nimmt der Server keine Anmeldung an. Die Seite „Meine Anmeldung“ hat einen eigenen Datenschutz-Abschnitt.",
          "Gesundheitsangaben verlassen den Server nur an Bearbeiter und an die Betreuer des jeweiligen Camps.",
          "Aufnahmen vom Camp regeln allein die Teilnahmebedingungen. Zwei Stellen, die dieselbe Frage unterschiedlich beantworten können, gibt es bewusst nicht.",
          "Der Verlauf eines Camps hält bei Anmeldungen nur die laufende Nummer fest, keine Kindernamen.",
          "Nach dem Camp läuft eine Frist (Vorgabe: sechs Monate). Danach zeigt die App einen Hinweis mit einem Knopf zum Aufräumen: Namen, Anschriften und Gesundheitsangaben werden gelöscht, die reinen Zahlen für die Statistik bleiben. Gemeldet werden auch Camps, die längst vorbei sind und noch auf „offen“ stehen.",
          "Die App löscht nie von allein. Das bleibt eine bewusste Entscheidung mit einem Klick."
        ]
      }
    ]
  }
];
