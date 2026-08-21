// Die Version bleibt auf 1.0 stehen. Was sich ändert, kommt als eigener Block in
// APP_CHANGELOG dazu — die Nummer selbst wird nicht hochgezählt.
const APP_VERSION = "1.0";

// Öffentliche Adresse der App. Steht hier und NICHT nur im Worker, weil die
// Anmeldeseite ihren eigenen Link für die Bestätigungsmail nicht kennt — der
// Worker baut ihn aus seiner eigenen Konstante. Beide müssen zusammenpassen;
// siehe FC_APP_URL in admin-worker.js.
const APP_URL = "https://sc1911heiligenstadt.github.io/fussballcamp/";

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
  { id: "trikotgroesse",   gruppe: "kind",        label: "Konfektionsgröße",     typ: "auswahl", optionen: ["116", "128", "140", "152", "164", "176", "S", "M", "L", "XL"], hinweis: "Für das Camp-Trikot." },
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

  // Einwilligungen. Ein HAKEN auf „pflicht" muss gesetzt sein — das passt nur für
  // eine echte Einwilligung, bei der „nein" gleichbedeutend mit „dann eben nicht
  // anmelden" ist.
  //
  // ⚠️ `alleinNachHause` ist deshalb bewusst KEIN Haken, sondern eine Ja/Nein-Frage.
  // Bei einem Haken wären „nein" und „vergessen anzukreuzen" derselbe Zustand — und
  // am letzten Camptag steht dann jemand vor der Frage, ob das Kind gehen darf, und
  // hat nur ein leeres Kästchen als Antwort. Als Pflichtfeld wäre ein Haken sogar
  // schlimmer: er ließe sich nur erfüllen, indem man JEDEM Kind erlaubt zu gehen.
  { id: "einwilligungFoto", gruppe: "einwilligung", label: "Fotos vom Camp dürfen veröffentlicht werden", typ: "haken", hinweis: "Vereinsseite, Zeitung, soziale Netzwerke." },
  { id: "alleinNachHause",  gruppe: "einwilligung", label: "Darf das Kind nach dem Camp allein nach Hause gehen?", typ: "janein", hinweis: "Wenn nein: bitte unten eintragen, wer es abholen darf." },
  { id: "abholberechtigt",  gruppe: "einwilligung", label: "Wer darf das Kind abholen",                    typ: "mehrzeilig", maxLen: 300 },

  // Freitext
  { id: "bemerkung",       gruppe: "sonstiges",   label: "Bemerkung",            typ: "mehrzeilig", maxLen: 800 }
];

// Überschriften der Feldgruppen im Formular, in dieser Reihenfolge.
const FELD_GRUPPEN = [
  { id: "kind",         label: "Das Kind" },
  { id: "eltern",       label: "Erziehungsberechtigte" },
  { id: "gesundheit",   label: "Gesundheit",    hinweis: "Diese Angaben sehen nur die Verantwortlichen und die Betreuer im Camp." },
  { id: "essen",        label: "Verpflegung" },
  { id: "einwilligung", label: "Einverständnis" },
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
  iban: "", bic: "", kontoinhaber: "1. SC 1911 e.V. Heilbad Heiligenstadt", bank: "",
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
  einwilligungFoto: "optional",
  alleinNachHause: "pflicht",
  abholberechtigt: "optional",
  bemerkung: "optional"
};

// Ab dieser Fensterbreite zeigt die Belegung das Gitter, darunter die
// Kartenliste. Der Wert steht doppelt — hier für die Logik, in style.css für
// die Darstellung; beide müssen zusammenpassen.
const GITTER_AB_PX = 768;

const APP_CHANGELOG = [
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
