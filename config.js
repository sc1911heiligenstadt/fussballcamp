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
  { id: "allergien",       gruppe: "gesundheit",  label: "Allergien",            typ: "mehrzeilig", maxLen: 500, sensibel: true },
  { id: "medikamente",     gruppe: "gesundheit",  label: "Medikamente",          typ: "mehrzeilig", maxLen: 500, sensibel: true },
  { id: "krankheiten",     gruppe: "gesundheit",  label: "Was wir sonst wissen sollten", typ: "mehrzeilig", maxLen: 500, sensibel: true, hinweis: "Asthma, Brille, Unverträglichkeiten — alles, was im Notfall zählt." },
  { id: "krankenkasse",    gruppe: "gesundheit",  label: "Krankenkasse",         typ: "text",   maxLen: 100, sensibel: true },

  // Verpflegung
  { id: "vegetarisch",     gruppe: "essen",       label: "Isst vegetarisch",     typ: "haken" },
  { id: "essenHinweis",    gruppe: "essen",       label: "Beim Essen beachten",  typ: "mehrzeilig", maxLen: 300, sensibel: true },

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

// Die Felder, die ein Betreuer über fussballcamp-teilnehmer zu sehen bekommt.
// ⚠️ Steht ZEICHENGENAU so auch als FC_BETREUER_FELDER im Worker — dort ist die
// Liste die wirksame; diese hier dient nur der Anzeige. Wer sie erweitert, muss
// beide anfassen, sonst kommt das Feld gar nicht erst an.
const BETREUER_FELDER = ["kindVorname", "kindNachname", "geburtsdatum", "allergien", "medikamente", "krankheiten", "essenHinweis", "elternTelefon", "alleinNachHause"];

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
    version: "1.18",
    groups: [
      {
        title: "Bei einer Absage steht jetzt da, wie viel Geld zurückgeht",
        items: [
          "Öffnet ihr eine abgesagte Anmeldung, steht unten der neue Abschnitt „Absage und Erstattung“: wann die Absage eingegangen ist, wie viele Tage vor Camp-Beginn das war, welche Stufe aus Punkt 4 der Teilnahmebedingungen greift — und der Betrag, den ihr zurücküberweisen müsst.",
          "Gerechnet wird mit dem Tag, an dem die Absage eingegangen ist, nicht mit dem heutigen. So steht dort auch drei Wochen später noch genau die Quote, die der Familie in der Absage-Mail zugesagt wurde.",
          "Zurück kann nur, was auch angekommen ist: ohne den Haken „bezahlt“ steht dort „nichts“ und der Grund dazu.",
          "Bei einem Freiplatz steht nichts über Geld.",
          "Fehlt dem Camp das Anfangsdatum, steht dort „nicht bestimmbar“ — ausdrücklich nicht „keine Erstattung“. Das sind zwei verschiedene Dinge, und das zweite kostet die Familie Geld.",
          "Habt ihr die Absage selbst eingetragen, wird keine Quote genannt, sondern „von Hand klären“. Punkt 4 gilt nur, wenn die Familie storniert; sagt der Verein ab, greift Punkt 11 und der Beitrag geht in voller Höhe zurück. Welcher Fall vorliegt, kann die App nicht wissen.",
          "Der Betrag ist eine Ablesehilfe, keine Anweisung: Punkt 4 erlaubt euch, bei kurzfristiger Neuvergabe des Platzes ganz oder teilweise zu verzichten. Dieser Hinweis steht direkt darunter."
        ]
      }
    ]
  },
  {
    version: "1.17",
    groups: [
      {
        title: "Absagen der Eltern werden jetzt per E-Mail bestätigt",
        items: [
          "Sagt eine Familie über ihren Link ab, bekommt sie sofort eine Bestätigung — vorher passierte nach dem Klick gar nichts, und niemand wusste, ob es angekommen ist.",
          "Die Mail sagt auch, was mit einem schon gezahlten Beitrag passiert. Sie richtet sich dabei nach Punkt 4 der Teilnahmebedingungen: bis 28 Tage vorher voll, bis 7 Tage vorher zur Hälfte, danach keine Erstattung.",
          "Sie verspricht bewusst nie einen konkreten Betrag zurück, sondern nennt die Regel und kündigt an, dass ihr euch meldet. Über die Rückzahlung entscheidet weiterhin ein Mensch.",
          "Bei einem Freiplatz steht gar nichts über Geld drin.",
          "Ein zweiter Klick auf „Absagen“ schickt keine zweite Mail.",
          "Die Absage-Mail trägt keinen Änderungs-Link mehr: Nach einer Absage lässt sich die Anmeldung ohnehin nicht mehr ändern. Stattdessen steht dort, dass man sich bei euch melden soll.",
          "Sagt ihr selbst in der Verwaltung ab, geht weiterhin keine Mail raus — das war so nicht bestellt."
        ]
      },
      {
        title: "Die Zahlungserinnerung kommt nicht mehr Monate zu früh",
        items: [
          "Bisher hing sie allein an „X Tage nach der Anmeldung“. Wer sich drei Monate vor dem Camp angemeldet hat, bekam nach zwei Wochen eine Zahlungsaufforderung — obwohl der Beitrag erst sieben Tage vor Camp-Beginn fällig ist.",
          "Jetzt müssen zwei Dinge zutreffen: Die eingestellten Tage seit der Anmeldung sind um, UND die Zahlungsfrist ist nah (drei Tage davor) oder schon vorbei. Die spätere von beiden entscheidet.",
          "Ist die Frist bereits abgelaufen, geht die Erinnerung erst recht raus.",
          "An der Einstellung unter Verwaltung ändert sich nichts — sie ist weiterhin die erste der beiden Bedingungen."
        ]
      }
    ]
  },
  {
    version: "1.16",
    groups: [
      {
        title: "Kontoverbindung: gesperrt, bis du sie freigibst",
        items: [
          "Kontoinhaber, IBAN, BIC und Bank sind jetzt gesperrt und grau. Ein Klick daneben oder ein versehentlicher Tastendruck ändert nichts mehr.",
          "Zum Ändern erst auf „Zum Ändern freigeben“ — dazu kommt eine Rückfrage, die erklärt, was daran hängt. Danach sind die vier Felder normal beschreibbar und der Kasten wird gelb.",
          "Vor dem Speichern siehst du alt und neu nebeneinander und musst noch einmal bestätigen.",
          "Nach dem Speichern schnappt das Schloss von allein wieder zu. Die Freigabe gilt für genau eine Änderung.",
          "Neu ist auch die Prüfziffer: Eine IBAN mit Zahlendreher wird jetzt abgelehnt. Vorher wurde nur die Form geprüft, und ein Dreher sah dabei völlig normal aus.",
          "Speicherst du den Reiter, ohne freizugeben, bleibt die Kontoverbindung unverändert stehen — auch dann, wenn die Felder gerade leer aussehen."
        ]
      }
    ]
  },
  {
    version: "1.15",
    groups: [
      {
        title: "Rechteverlust: auch der offene Dialog und der Anmeldebildschirm",
        items: [
          "Nachtrag zu 1.14. Dort wurde beim Rechteverlust der Bildschirm geräumt — aber nur, wenn die App danach noch normal weiterlief.",
          "Steht gerade ein Anmelde-Dialog offen, wird er jetzt geschlossen und geleert. Vorher blieb der Name des Kindes samt allen Angaben SICHTBAR stehen, obwohl das Recht schon weg war.",
          "Fällt die Sitzung ganz aus (abgemeldet, Passwort gewechselt, aus der Gruppe genommen), erscheint der Anmeldebildschirm. Auch dahinter wird jetzt geräumt — vorher stand dort alles weiter im Browser.",
          "Die Felder unter Verwaltung werden nicht mehr einzeln aufgezählt, sondern als Ganzes geleert. Ein Feld, das später dazukommt, ist damit von allein mit abgedeckt.",
          "Im Normalbetrieb ändert sich wieder nichts: Wer das Recht hat, sieht alles wie bisher."
        ]
      }
    ]
  },
  {
    version: "1.14",
    groups: [
      {
        title: "Durchsicht: zwei Sachen richtiggestellt",
        items: [
          "Fällt jemandem ein Recht weg, während er die App offen hat, wird jetzt auch weggeräumt, was schon auf dem Bildschirm steht. Vorher wurden die Reiter nur versteckt — die zuletzt geladenen Anmeldungen samt Kindernamen und die Kontoverbindung blieben im Browser stehen.",
          "Betroffen waren die Anmeldeliste, der Meldekasten, die Teilnehmerliste der Betreuer und die Felder unter Verwaltung.",
          "Im Normalbetrieb ändert sich dadurch nichts: Wer das Recht hat, sieht alles wie bisher.",
          "Die Zahlen oben auf der Startseite sagen bei genau eins jetzt „1 Camp mit offener Anmeldung“ und „1 freier Platz“ statt „1 Camps“ und „1 freie Plätze“."
        ]
      }
    ]
  },
  {
    version: "1.13",
    groups: [
      {
        title: "Zahlungsziel: eine Woche vor dem Camp",
        items: [
          "Bisher stand in der Bestätigungsmail „bitte überweise bis zum <erster Camp-Tag>“. Geld, das am Anreisetag eingeht, hilft bei der Planung nicht mehr.",
          "Jetzt steht dort der Tag genau eine Woche vor dem ersten Camp-Tag. Beispiel: Camp beginnt am 20.10. → Zahlungsziel ist der 13.10.",
          "Meldet sich jemand später an, als diese Frist liegt, steht stattdessen „möglichst umgehend“ — eine Frist zu nennen, die schon vorbei ist, wäre schlimmer als gar keine.",
          "Auf der Bestätigungsseite steht derselbe Satz wie in der Mail.",
          "Die Teilnahmebedingungen decken das ab: dort ist von „der in der Anmeldebestätigung genannten Zahlungsfrist“ die Rede."
        ]
      }
    ]
  },
  {
    version: "1.12",
    groups: [
      {
        title: "Alle Konfektionsgrößen zur Auswahl",
        items: [
          "Bisher standen nur 116, 128, 140, 152, 164, 176 und S bis XL zur Wahl — die Zwischengrößen fehlten alle, und für kleinere Kinder gab es gar nichts Passendes.",
          "Jetzt stehen dort alle Kindergrößen von 98 bis 176 in Zweierschritten (98, 104, 110, 116, 122, 128, 134, 140, 146, 152, 158, 164, 170, 176).",
          "Bei den Erwachsenengrößen sind XS, XXL und 3XL dazugekommen.",
          "Die Liste ist in „Kindergrößen“ und „Erwachsenengrößen“ unterteilt, damit man sich bei 21 Einträgen zurechtfindet.",
          "Bereits eingegangene Anmeldungen bleiben unverändert — eine alte Größe steht weiterhin genauso da, wie sie eingetragen wurde."
        ]
      }
    ]
  },
  {
    version: "1.11",
    groups: [
      {
        title: "Frühbucherpreis: bis Tag X günstiger",
        items: [
          "Im Camp-Dialog stehen jetzt zwei neue Felder: „Frühbucherpreis“ und „Frühbucher bis“. Beispiel: regulär 180,00 €, Frühbucher 160,00 € bis zum 30.09.",
          "Der günstigere Beitrag gilt bis EINSCHLIESSLICH des gewählten Tages. Am Tag danach kostet es den regulären Beitrag.",
          "Wichtig: Wer sich im Frühbucherfenster angemeldet hat, behält den günstigeren Beitrag — auch nach dem Stichtag. Der Betrag wird beim Anmelden festgehalten und ändert sich danach nicht mehr. Sonst stünde in der Bestätigungsmail einer Familie ein anderer Betrag als in deiner Liste.",
          "Beide Felder gehören zusammen. Steht nur eines davon da, gilt für alle der reguläre Beitrag — so kann kein halb eingerichteter Rabatt unbemerkt danebenstehen.",
          "Der Frühbucherpreis muss unter dem regulären liegen, sonst nimmt die App ihn nicht an.",
          "Sichtbar ist er im Fenster auf der Vereins-Homepage, oben auf der Anmeldeseite und auf der Camp-Karte — überall mit dem Datum, bis wann er gilt.",
          "In der Anmeldeliste wird die Beitragssumme jetzt Anmeldung für Anmeldung gerechnet, nicht mehr Anzahl mal Camp-Preis. Bei zwei verschiedenen Beträgen wäre die alte Rechnung falsch gewesen.",
          "Bei einer Anmeldung mit Frühbucherpreis steht das in der Detailansicht dabei.",
          "Camps ohne Frühbucherpreis verhalten sich genau wie bisher."
        ]
      }
    ]
  },
  {
    version: "1.10",
    groups: [
      {
        title: "Der Meldekasten sagt, WAS die Eltern geändert haben",
        items: [
          "Bisher stand dort nur „hat die Angaben geändert“ — du musstest die Anmeldung öffnen und suchen. Jetzt stehen die geänderten Felder beim Namen, zum Beispiel „hat geändert: Handy für Notfälle, Allergien“.",
          "In der Anmeldeliste zeigt der Zeiger auf „von Eltern geändert“ dieselbe Liste.",
          "Haben die Eltern die Teilnahmebedingungen neu bestätigt, steht auch das dabei.",
          "Wenn die Eltern speichern, ohne etwas geändert zu haben, kommt jetzt gar keine Meldung mehr. Vorher meldete jedes Absenden eine Änderung — auch das bloße Nachsehen.",
          "Meldungen, die vor dieser Änderung entstanden sind, zeigen weiterhin nur „hat die Angaben geändert“: für sie wurde damals nicht mitgeschrieben, welche Felder es waren.",
          "Was NICHT gespeichert wird: der alte Wert. Nur welches Feld angefasst wurde. Ein aufbewahrter alter Wert wäre eine zweite Kopie derselben Angabe über ein Kind, die keine Löschung mehr erwischt."
        ]
      }
    ]
  },
  {
    version: "1.9",
    groups: [
      {
        title: "Das Camp steht von allein im Vereinskalender",
        items: [
          "Sobald du ein Camp aus dem Entwurf holst („Anmeldung öffnen“), legt es sich selbst als Termin im Vereinskalender ab — mit Namen, Tagen, Ort, der täglichen Uhrzeit, den Jahrgängen und dem Anmeldelink. Du musst denselben Termin nicht mehr ein zweites Mal von Hand eintragen.",
          "Damit steht das Camp auch bei allen, die den Vereinskalender in ihrem eigenen Kalender abonniert haben — also im Handy der Trainer.",
          "Änderst du am Camp etwas, zieht der Termin nach. Stellst du es zurück auf Entwurf, ist er wieder weg. Ein Camp, dessen letzter Tag vorbei ist, verschwindet ebenfalls.",
          "An der Camp-Karte steht, ob das Camp im Vereinskalender angekommen ist. Camps, die es schon vor dieser Änderung gab, kommen in der nächsten Nacht von selbst dazu.",
          "Wenn du den Termin im Vereinskalender löschst, bleibt er gelöscht — er wird nicht wieder angelegt.",
          "Ein mehrtägiges Camp steht bewusst ohne Uhrzeit im Kalender: sonst zeigen Kalenderprogramme einen einzigen Block von Montag früh bis Freitag nachmittag, also durch die Nächte hindurch. Die tägliche Zeit steht stattdessen in der Notiz des Termins."
        ]
      }
    ]
  },
  {
    version: "1.8",
    groups: [
      {
        title: "Das Plakat am quer gehaltenen Handy",
        items: [
          "Auf der Anmeldeseite nimmt das Plakat jetzt höchstens knapp zwei Drittel der Bildschirmhöhe ein. Vorher war das eine feste Zahl — auf einem quer gehaltenen Handy wurde das Plakat damit anderthalb Bildschirme hoch, und man musste zweimal wischen, bis überhaupt der Name des Camps kam.",
          "Hochkant ändert sich nichts: dort bestimmt ohnehin die Breite des Bildschirms, wie groß das Plakat wird.",
          "Das Fenster auf der Vereins-Homepage hat schon vorher so gerechnet. Beide Stellen benutzen jetzt dieselbe Grenze."
        ]
      }
    ]
  },
  {
    version: "1.7",
    groups: [
      {
        title: "Ein Bild fürs Camp",
        items: [
          "Beim Anlegen und Bearbeiten eines Camps lässt sich jetzt ein Bild hochladen — zum Beispiel das Werbeplakat des Camps.",
          "Das Bild erscheint im Fenster auf der Vereins-Homepage über den Angaben zum Camp und noch einmal oben auf der Anmeldeseite. Am Schnipsel für die Homepage musst du nichts ändern: er lädt weiterhin nur eine Datei, das Bild kommt von selbst mit.",
          "Große Bilder werden im Browser verkleinert, bevor sie hochgehen (längste Kante 1400 Pixel). Ein Plakat aus WhatsApp oder Canva kannst du also einfach so auswählen.",
          "Ein Camp ohne Bild sieht aus wie bisher. Ein Bild lässt sich jederzeit austauschen oder wieder entfernen; das alte wird dabei gelöscht."
        ]
      }
    ]
  },
  {
    version: "1.6",
    groups: [
      {
        title: "Der Änderungs-Link geht nur noch per E-Mail",
        items: [
          "Wer ein Kind anmeldet, für das schon eine Anmeldung vorliegt, bekommt den Link zum späteren Ändern nicht mehr auf der Seite angezeigt. Er geht per E-Mail an die Adresse, die in der vorhandenen Anmeldung hinterlegt ist.",
          "Der Grund: Vor- und Nachname eines Kindes und die E-Mail-Adresse der Eltern sind im Verein bekannt. Wer sie kannte, bekam durch ein zweites Absenden des Formulars den Link — und über den Link Allergien, Medikamente, Anschrift und Telefonnummer einer fremden Familie. Das geht jetzt nicht mehr.",
          "Der normale Fall bleibt genauso: Bleibt die Anmeldung im Netz hängen und wird noch einmal abgeschickt, entsteht weiterhin keine zweite Anmeldung, der Platz bleibt derselbe, und die Bestätigung kommt erneut per E-Mail.",
          "Damit niemand ein fremdes Postfach mit Mails zudecken kann, wird der Link höchstens alle zehn Minuten einmal nachgeschickt."
        ]
      }
    ]
  },
  {
    version: "1.5",
    groups: [
      {
        title: "Datenschutz nachgeschärft",
        items: [
          "Die Datenschutz-Information im Anmeldeformular nennt jetzt die vollständige Anschrift des Vereins, die zuständige Aufsichtsbehörde und alle Dienstleister, über die die Anmeldung läuft — vorher verwies sie nur auf das Impressum und nannte den Serverdienst nicht.",
          "Sie sagt außerdem ehrlich, dass die Frage nach Allergien in der Regel ein Pflichtfeld ist. Vorher stand dort „Du kannst diese Felder leer lassen“ — das stimmte seit den neuen Pflichtangaben nicht mehr.",
          "Die Seite „Meine Anmeldung“ hat einen eigenen Datenschutz-Abschnitt bekommen. Sie ist für viele Eltern die einzige Seite, die sie nach der Anmeldung wiedersehen; bisher stand dort kein Wort dazu und keine Adresse, an die man sich wenden kann.",
          "Bei der Absage steht jetzt, was eine Absage tut und was nicht: sie gibt den Platz frei, löscht die Anmeldung aber nicht. Wer vorher gelöscht werden möchte, findet dort den Hinweis, sich zu melden."
        ]
      },
      {
        title: "Aufräum-Hinweis erwischt auch vergessene Camps",
        items: [
          "Der Kasten „reif zum Aufräumen“ erschien bisher nur für Camps im Status „abgeschlossen“. Blieb ein Camp nach dem letzten Tag einfach auf „offen“ stehen, wurde es nie fällig — und die Namen und Gesundheitsangaben der Kinder blieben unbefristet gespeichert.",
          "Jetzt meldet der Kasten zusätzlich Camps, die längst vorbei sind und noch Anmeldungen tragen, mit der Bitte, sie abzuschließen.",
          "Gelöscht wird weiterhin nichts von allein. Das Aufräumen bleibt ein bewusster Klick."
        ]
      },
      {
        title: "Keine Kindernamen mehr im Verlauf",
        items: [
          "Jedes Camp führt im Hintergrund einen Verlauf — wer wann was getan hat. Bei Anmeldungen stand darin bisher der volle Name des Kindes, obwohl der Verlauf nirgends angezeigt wird.",
          "Der Verlauf hält jetzt nur noch die laufende Nummer fest. Beim Löschen einer Anmeldung und beim Aufräumen eines Camps werden zusätzlich die alten Einträge von Namen befreit — sonst hätte eine Löschung nur die halbe Arbeit gemacht."
        ]
      }
    ]
  },
  {
    version: "1.4",
    groups: [
      {
        title: "Am Handy",
        items: [
          "Nach dem Absenden einer Anmeldung stand der Link zum späteren Ändern in voller Länge da und lief seitlich aus dem Bild — er ist 412 Pixel breit, das Handy hat 375. Die ganze Bestätigungsseite ließ sich dadurch nach rechts schieben, und der Link war nur zur Hälfte lesbar. Jetzt bricht er um.",
          "Im Fenster auf der Vereinsseite waren die beiden kleinen Knöpfe kaum zu treffen: das Kreuz zum Schließen maß 31 × 30 Pixel, „Nicht mehr anzeigen“ war 17 Pixel hoch. Beide haben jetzt 44 Pixel Fingerbreite. Sichtbar ändert sich nichts — das Kreuz bleibt gleich groß, nur die Fläche darum wächst.",
          "Geprüft, aber in Ordnung: die Anmeldeseite mit allen Feldern, „Meine Anmeldung“ mit Kontodaten, und die Verwaltung mit allen sechs Reitern nebeneinander. Überall 0 Pixel Überlauf bei 375 Pixel Breite."
        ]
      }
    ]
  },
  {
    version: "1.3",
    groups: [
      {
        title: "Fotos regeln allein die Teilnahmebedingungen",
        items: [
          "Das Häkchen „Fotos vom Camp dürfen veröffentlicht werden“ ist aus dem Anmeldeformular entfallen. Punkt 16 der Teilnahmebedingungen regelt das jetzt allein — und die müssen die Eltern ohnehin anerkennen.",
          "Grund: Es gab zwei Stellen, die dieselbe Frage unterschiedlich beantworten konnten. Wer die Bedingungen anerkannte, das Häkchen aber wegließ, hinterließ einen widersprüchlichen Datensatz.",
          "Die Datenschutz-Information im Formular nennt die Aufnahmen jetzt ausdrücklich und verweist für Einzelheiten und den Widerruf auf Punkt 16. Vorher stand dort gar nichts zu Fotos — das Häkchen war die einzige sichtbare Stelle.",
          "Der Abschnitt „Einverständnis“ im Formular heißt jetzt „Abholung und Heimweg“. Darin stehen nur noch die beiden Fragen dazu."
        ]
      }
    ]
  },
  {
    version: "1.2",
    groups: [
      {
        title: "Der richtige Vereinsname",
        items: [
          "Überall, wo der Verein genannt wird, steht jetzt „1. SC 1911 Heiligenstadt e.V.“ — so, wie er wirklich heißt. Vorher stand dort „1. SC 1911 e.V. Heilbad Heiligenstadt“.",
          "Betrifft die Anmeldeseite, die Seite „Meine Anmeldung“, den Fuß der Mails an die Eltern und die Datenschutz-Information. Gerade dort zählt es: die Information nach Art. 13 DSGVO muss den Verantwortlichen richtig benennen.",
          "⚠️ Der vorgeschlagene Kontoinhaber unter „Verwaltung“ heißt jetzt ebenfalls so. Prüfe beim Eintragen der IBAN, wie das Konto bei der Bank wirklich lautet — der Empfängername muss dazu passen, sonst kann eine Überweisung abgelehnt werden."
        ]
      }
    ]
  },
  {
    version: "1.1",
    groups: [
      {
        title: "Teilnahmebedingungen im Formular",
        items: [
          "Vor dem Absenden stehen die Teilnahmebedingungen des Vereins im Formular — aufklappbar, dazu ein eigenes Pflicht-Häkchen. Ohne dieses Häkchen nimmt der Server keine Anmeldung an.",
          "Der Text wird unter „Verwaltung → Teilnahmebedingungen“ gepflegt. Es braucht dafür keine Änderung am Programm; was dort steht, erscheint sofort im Formular.",
          "Bei jeder Anmeldung wird festgehalten, WELCHE Fassung die Eltern zugestimmt haben. Änderst du den Text später, bleibt für die früheren Anmeldungen die damals gültige Fassung erhalten und ist im Anmeldedialog nachlesbar — eine spätere Änderung wirkt nie rückwirkend.",
          "Ändern die Eltern ihre Anmeldung über den Link aus der Mail, müssen sie nur dann erneut zustimmen, wenn sich der Text seit ihrer Anmeldung geändert hat."
        ]
      },
      {
        title: "Pflichtangaben nach Vorgabe des Nachwuchsbereichs",
        items: [
          "Ein neues Camp fragt jetzt von sich aus verpflichtend: Name, Geburtsdatum, Konfektionsgröße, Allergien, „darf allein nach Hause“, E-Mail und Telefon der Erziehungsberechtigten. Bestehende Camps bleiben unverändert; je Camp lässt sich weiterhin alles umstellen.",
          "„Trikotgröße“ heißt jetzt „Konfektionsgröße“.",
          "„Wer darf das Kind abholen“ wird bei einem neuen Camp mit angeboten — vorher war das Feld standardmäßig aus."
        ]
      },
      {
        title: "„Darf allein nach Hause“ ist jetzt eine echte Frage",
        items: [
          "Aus dem Häkchen ist eine Ja/Nein-Frage geworden. Bei einem Häkchen waren „nein“ und „nicht angekreuzt“ derselbe Zustand — am letzten Camptag sah man dem leeren Kästchen nicht an, ob die Eltern es verneint oder schlicht übersehen haben.",
          "Als Pflichtfeld ging ein Häkchen ohnehin nicht: erfüllen ließe es sich nur, indem man jedem Kind erlaubt, allein zu gehen.",
          "In der Teilnehmerliste der Betreuer steht bei „nein“ jetzt ein sichtbarer roter Hinweis statt gar nichts."
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
          "Ein Camp bekommt Zeitraum, tägliche Uhrzeit, Ort, Altersspanne, Platzzahl und einen Preis. Aus dem Zeitraum entstehen sofort echte Camp-Tage — das ist die Grundlage für die Jobs und die Anwesenheit.",
          "Ein neues Camp ist zuerst ein Entwurf und damit für niemanden sichtbar. Erst „Anmeldung öffnen“ stellt es auf die Homepage und nimmt Anmeldungen an.",
          "Zu jedem Camp gehört ein Anmeldefenster mit Datum von und bis. Läuft es ab, schließt die Anmeldung von selbst — es muss niemand daran denken."
        ]
      },
      {
        title: "Auf der Vereins-Homepage",
        items: [
          "Die App liefert einen fertigen Schnipsel für die Homepage. Er wird einmal eingebaut und bleibt danach unangetastet: welches Camp dort erscheint, entscheidet allein der Status in dieser App.",
          "Auf der Homepage öffnet sich ein Fenster mit den offenen Camps und einem Knopf zur Anmeldung. Wer es wegklickt, bekommt es sieben Tage lang nicht wieder zu sehen.",
          "Zusätzlich gibt es zu jedem Camp einen normalen Link zum Weitergeben — für WhatsApp, Aushang oder Elternbrief."
        ]
      },
      {
        title: "Anmeldung",
        items: [
          "Die Eltern melden ohne Login an. Welche Felder gefragt werden, entscheidest du je Camp: nicht fragen, freiwillig oder Pflicht.",
          "Ein Kind je Anmeldung. Nach dem Absenden führt ein Knopf direkt zur nächsten Anmeldung, bei der die Elternangaben schon ausgefüllt sind.",
          "Ist das Camp voll, kommt die Anmeldung auf die Warteliste — mit Platznummer, sichtbar für die Eltern. Nachrücken lässt du selbst per Klick; die Zusage geht dann automatisch per Mail raus.",
          "Jede Bestätigung enthält einen persönlichen Link. Darüber ändern die Eltern ihre Angaben oder sagen ab. Beides wird in der App auffällig markiert, damit es dir nicht entgeht."
        ]
      },
      {
        title: "Beitrag",
        items: [
          "Ein Preis je Camp. Betrag, Kontoverbindung und Verwendungszweck stehen auf der Bestätigungsseite und in der Bestätigungsmail.",
          "Den Verwendungszweck baut die App selbst aus Campnamen und Kindernamen — damit auf dem Kontoauszug erkennbar ist, wofür das Geld kam.",
          "In der Anmeldeliste hakst du ab, wer bezahlt hat. Ein Filter zeigt die offenen Beiträge, und eine Erinnerungsmail lässt sich für alle Offenen auf einmal auslösen."
        ]
      },
      {
        title: "Aufgaben und Helfer",
        items: [
          "Der Job-Katalog wird einmal gepflegt: Name, Beschreibung, benötigte Personenzahl, Uhrzeit von und bis.",
          "Jobs hängen am einzelnen Camp-Tag. Ein Knopf legt einen Job auf allen Tagen des Camps auf einmal an — ausfüllen muss man ihn nur einmal.",
          "Wer Zugriff auf das Tool hat, trägt sich selbst ein und wieder aus. Ein voller Job nimmt niemanden mehr an; das prüft der Server, nicht nur die Oberfläche.",
          "Helfer ohne Vereinskonto trägst du als freien Namen ein. Am Job steht dann, wer den Eintrag vorgenommen hat.",
          "Anders als in der Spieltagscrew darf eine Person am selben Tag mehrere Jobs übernehmen — vormittags Betreuung, mittags Essensausgabe ist beim Camp der Normalfall."
        ]
      },
      {
        title: "Wer darf was",
        items: [
          "Sehen: Camps, Camp-Tage und Jobs. Anmeldungen und Kinderdaten sind hier nicht dabei.",
          "Betreuer: Wer an einem Camp auf mindestens einem Job steht, sieht für dieses Camp eine kurze Teilnehmerliste — Name, Alter, Allergien, Medikamente, Notfallnummer. Ohne Anschrift, ohne Beitragsstand. Diese Liste stellt der Server zusammen; wer nicht eingetragen ist, bekommt die Daten gar nicht erst geschickt.",
          "Bearbeiten: Camps und Camp-Tage pflegen, Anmeldungen einsehen und ändern, Beiträge abhaken, nachrücken lassen, Listen ausgeben.",
          "Administrieren: Kontoverbindung, Absender, Job-Katalog, Erinnerungen, Löschen und der Schnipsel für die Homepage.",
          "Der Reiter „Info“ ist für alle sichtbar."
        ]
      },
      {
        title: "Datenschutz",
        items: [
          "Auf der Anmeldeseite steht die Pflichtinformation nach Art. 13 DSGVO, und die Eltern müssen ihr Einverständnis ausdrücklich geben. Ohne diesen Haken nimmt der Server keine Anmeldung an.",
          "Gesundheitsangaben verlassen den Server nur an Bearbeiter und an die Betreuer des jeweiligen Camps.",
          "Nach dem Camp läuft eine Frist (Vorgabe: sechs Monate). Danach zeigt die App einen Hinweis mit einem Knopf zum Aufräumen: Namen, Anschriften und Gesundheitsangaben werden gelöscht, die reinen Zahlen für die Statistik bleiben.",
          "Die App löscht nie von allein. Das bleibt eine bewusste Entscheidung mit einem Klick."
        ]
      }
    ]
  }
];
