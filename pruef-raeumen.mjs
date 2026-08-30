// Prueft, dass ein Rechte- oder Sitzungsverlust den Bildschirm wirklich raeumt.
//
//   node pruef-raeumen.mjs                # 36 Zusagen
//   node pruef-raeumen.mjs --mutation     # zeigt, dass die Zusagen rot werden koennen
//   node pruef-raeumen.mjs <pfad-zu-app.js>
//   APP_DATEI=<pfad> node pruef-raeumen.mjs
//
// ⚠️ Der Code wird AUS app.js GEZOGEN (new Function), nicht nachgebaut. Fehlt eine
// Marke, bricht der Lauf ab statt gruen zu melden.
//
// ⚠️ Die Liste der Verwaltungsfelder kommt AUS index.html, nicht aus dieser Datei.
// Sonst prueft der Pruefstand nur seine eigene Kopie mit -- und ein Feld, das
// jemand spaeter im HTML ergaenzt, faellt niemandem auf.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HIER = dirname(fileURLToPath(import.meta.url));
const APP = process.env.APP_DATEI
  || process.argv.find((a) => !a.startsWith("--") && a.endsWith(".js"))
  || join(HIER, "app.js");

const Q = readFileSync(APP, "utf8");
const HTML = readFileSync(join(HIER, "index.html"), "utf8");

function schneide(quelle, von, bis, name) {
  const a = quelle.indexOf(von);
  if (a < 0) { console.error("ABBRUCH: Anfangsmarke fehlt -- " + name); process.exit(2); }
  const b = quelle.indexOf(bis, a);
  if (b < 0) { console.error("ABBRUCH: Endmarke fehlt -- " + name); process.exit(2); }
  return quelle.slice(a, b);
}

const BLOCK_RAEUME = schneide(Q,
  "function raeumeWasNichtMehrErlaubtIst(edit, admin, betreuer) {",
  "// Geteiltes Flotten-Muster", "raeumeWasNichtMehrErlaubtIst");
const BLOCK_FEHLER = schneide(Q,
  "function zeigeStartFehler(e) {",
  "// Nach JEDER Änderung", "zeigeStartFehler");

// --- Die Verwaltungsfelder aus dem echten HTML -------------------------------
const ABSCHNITT_VERWALTUNG = schneide(HTML, 'id="tab-verwaltung"', 'id="tab-info"', "tab-verwaltung");
const VERWALTUNGSFELDER = [...ABSCHNITT_VERWALTUNG.matchAll(/<(input|textarea)\b[^>]*\bid="([^"]+)"/g)]
  .map((m) => ({ tag: m[1], id: m[2], typ: (/\btype="([^"]+)"/.exec(m[0]) || [, "text"])[1] }));

if (VERWALTUNGSFELDER.length < 5) {
  console.error("ABBRUCH: nur " + VERWALTUNGSFELDER.length + " Verwaltungsfelder im HTML gefunden -- Struktur geaendert?");
  process.exit(2);
}

// Die Ids, die das Markup ausserhalb der Formularfelder traegt.
const LISTEN_IDS = ["anm-liste", "anm-zusammenfassung", "meldebox", "anm-modal", "anm-modal-titel",
  "anm-modal-body", "aufraeum-box", "agb-archiv-liste", "agb-archiv-block", "katalog-liste",
  "teilnehmer-liste", "cloud-error", "connect-message", "connect-screen", "app-shell"];

// --- Ein sehr kleines Papp-DOM ----------------------------------------------
function macheElement(id, typ) {
  const klassen = new Set();
  return {
    id, type: typ || "text", value: "", checked: false, innerHTML: "", textContent: "",
    style: {},
    classList: {
      add: (c) => klassen.add(c), remove: (c) => klassen.delete(c),
      contains: (c) => klassen.has(c), toggle: (c, an) => (an ? klassen.add(c) : klassen.delete(c))
    }
  };
}

function baueWelt() {
  const el = new Map();
  LISTEN_IDS.forEach((id) => el.set(id, macheElement(id)));
  VERWALTUNGSFELDER.forEach((f) => el.set(f.id, macheElement(f.id, f.typ)));

  const dokument = {
    getElementById: (id) => el.get(id) || null,
    querySelectorAll: (sel) => {
      // Nur der eine Selektor, den der Code benutzt -- alles andere waere geraten.
      if (sel === "#tab-verwaltung input, #tab-verwaltung textarea") {
        return VERWALTUNGSFELDER.map((f) => el.get(f.id));
      }
      throw new Error("Unbekannter Selektor im Pruefstand: " + sel);
    }
  };
  return { el, dokument };
}

// Alles vollmachen, wie es nach einem Zeichnen mit vollen Rechten aussaehe.
//
// ⚠️ `mod` MUSS mitkommen: der Zwischenspeicher liegt im Modul, nicht im DOM. Ohne
// ihn startet er leer -- dann ist "er wird geleert" auch dann gruen, wenn die Zeile
// gar nicht mehr dasteht. Genau so ist mir die Mutation zuerst durchgerutscht.
function fuelle(el, mod) {
  if (mod) mod.fuelleCache();
  el.get("anm-liste").innerHTML = "<div>Mia Musterkind &middot; mama@example.org</div>";
  el.get("anm-zusammenfassung").textContent = "12 angemeldet, 3 offen";
  el.get("meldebox").innerHTML = "<div>Mia Musterkind hat geaendert: Allergien</div>";
  el.get("anm-modal-titel").textContent = "Mia Musterkind";
  el.get("anm-modal-body").innerHTML = "<dt>Allergien</dt><dd>Erdnuss</dd>";
  el.get("aufraeum-box").innerHTML = "<div>Camp reif zum Aufraeumen</div>";
  el.get("agb-archiv-liste").innerHTML = "<li>Fassung vom 01.01.</li>";
  el.get("katalog-liste").innerHTML = "<li>Aufgabe</li>";
  el.get("teilnehmer-liste").innerHTML = "<div>Mia Musterkind &middot; Erdnussallergie</div>";
  VERWALTUNGSFELDER.forEach((f) => {
    const e = el.get(f.id);
    if (f.typ === "checkbox" || f.typ === "radio") e.checked = true;
    else e.value = f.id === "e-iban" ? "DE02 1203 0000 0000 2020 51" : "belegt";
  });
}

function lade(blockRaeume, blockFehler) {
  const { el, dokument } = baueWelt();
  const quelle =
    "let teilnehmerCache = {}; let anmEntwurf = { campId: 'c1', id: 'a1' };\n" +
    "class NotLoggedInError extends Error {}\n" +
    "function schliesse(id) { const e = document.getElementById(id); if (e) e.classList.add('hidden'); }\n" +
    // ⚠️ Attrappen für alles, was raeumeWasNichtMehrErlaubtIst SONST noch ruft.
    // Am 30.08.2026 fiel der Prüfstand um, weil eine andere Sitzung
    // setzeKontoSchloss() ergänzt hat. Die Liste holt man sich mit:
    //   sed -n '/function raeumeWasNichtMehrErlaubtIst/,/^}/p' app.js
    // Wer hier eine Attrappe ergänzt, prüft, ob die neue Zeile eine eigene
    // Zusage braucht — eine Attrappe macht sie sonst still wirkungslos.
    "let kontoSchlossZuletzt = null;\n" +
    "function setzeKontoSchloss(an) { kontoSchlossZuletzt = an; }\n" +
    "function fuelleVerwaltung() {}\n" +
    blockRaeume + blockFehler +
    "return { raeumeWasNichtMehrErlaubtIst, zeigeStartFehler,\n" +
    "         fuelleCache: () => { teilnehmerCache = { c1: [{ kind: 'Mia Musterkind' }] }; },\n" +
    "         stand: () => ({ cache: teilnehmerCache, entwurf: anmEntwurf }) };";
  const mod = new Function("document", quelle)(dokument);
  return { el, mod };
}

// --- Die Zusagen -------------------------------------------------------------
function verhalten(blockRaeume, blockFehler) {
  const z = [];
  const feldWert = (el, f) => (f.typ === "checkbox" || f.typ === "radio" ? el.get(f.id).checked : el.get(f.id).value);

  // A -- Bearbeiten-Recht weg
  {
    const { el, mod } = lade(blockRaeume, blockFehler);
    fuelle(el, mod);
    mod.raeumeWasNichtMehrErlaubtIst(false, true, true);
    z.push(["A1 Anmeldeliste ist leer", el.get("anm-liste").innerHTML === ""]);
    z.push(["A2 Zusammenfassung ist leer", el.get("anm-zusammenfassung").textContent === ""]);
    z.push(["A3 Meldekasten ist leer", el.get("meldebox").innerHTML === ""]);
    z.push(["A4 Der offene Dialog ist zu", el.get("anm-modal").classList.contains("hidden")]);
    z.push(["A5 Der Kindname im Dialogtitel ist weg", el.get("anm-modal-titel").textContent === ""]);
    z.push(["A6 Der Dialogrumpf ist leer", el.get("anm-modal-body").innerHTML === ""]);
    // ⚠️ NUR die vier Stellen, die am Bearbeiten-Recht haengen. Die
    // Teilnehmerliste traegt denselben Namen, bleibt hier aber zu Recht stehen:
    // der Betreuer-Status ist ja noch da. Eine Suche ueber ALLE Elemente war der
    // erste Anlauf und wurde rot -- an der Zusage lag es, nicht am Code.
    z.push(["A7 In den vier Bearbeiter-Stellen steht kein \"Musterkind\" mehr",
      ["anm-liste", "meldebox", "anm-modal-titel", "anm-modal-body"].every((id) => {
        const e = el.get(id);
        return !String(e.innerHTML).includes("Musterkind") && !String(e.textContent).includes("Musterkind");
      })]);
    z.push(["A8 Der Dialog-Entwurf ist vergessen", mod.stand().entwurf === null]);
    z.push(["A9 Die Kontoverbindung bleibt (Admin-Recht ist ja da)", el.get("e-iban").value !== ""]);
  }

  // B -- Administrieren-Recht weg
  {
    const { el, mod } = lade(blockRaeume, blockFehler);
    fuelle(el, mod);
    mod.raeumeWasNichtMehrErlaubtIst(true, false, true);
    z.push(["B1 JEDES Verwaltungsfeld ist leer", VERWALTUNGSFELDER.every((f) => {
      const w = feldWert(el, f);
      return w === "" || w === false;
    })]);
    z.push(["B2 Auch die IBAN", el.get("e-iban").value === ""]);
    z.push(["B3 Auch der Bedingungstext", el.get("e-agb").value === ""]);
    z.push(["B4 Aufraeum-Kasten leer", el.get("aufraeum-box").innerHTML === ""]);
    z.push(["B5 Archivliste leer und Block versteckt",
      el.get("agb-archiv-liste").innerHTML === "" && el.get("agb-archiv-block").classList.contains("hidden")]);
    z.push(["B6 Aufgabenkatalog leer", el.get("katalog-liste").innerHTML === ""]);
    z.push(["B7 Die Anmeldeliste bleibt (Bearbeiten ist ja da)", el.get("anm-liste").innerHTML !== ""]);
  }

  // C -- Betreuer-Status weg
  {
    const { el, mod } = lade(blockRaeume, blockFehler);
    fuelle(el, mod);
    mod.raeumeWasNichtMehrErlaubtIst(true, true, false);
    z.push(["C1 Teilnehmerliste leer", el.get("teilnehmer-liste").innerHTML === ""]);
    z.push(["C2 Auch der Zwischenspeicher ist leer",
      Object.keys(mod.stand().cache).length === 0]);
  }

  // D -- die Gegenprobe: mit vollen Rechten darf NICHTS verschwinden
  {
    const { el, mod } = lade(blockRaeume, blockFehler);
    fuelle(el, mod);
    mod.raeumeWasNichtMehrErlaubtIst(true, true, true);
    mod.raeumeWasNichtMehrErlaubtIst(true, true, true);   // auch zweimal hintereinander
    z.push(["D1 Anmeldeliste steht noch", el.get("anm-liste").innerHTML !== ""]);
    z.push(["D2 Teilnehmerliste steht noch", el.get("teilnehmer-liste").innerHTML !== ""]);
    z.push(["D3 IBAN steht noch", el.get("e-iban").value !== ""]);
    z.push(["D4 Der Dialog ist NICHT zugeklappt", !el.get("anm-modal").classList.contains("hidden")]);
    z.push(["D5 Dialogtitel steht noch", el.get("anm-modal-titel").textContent !== ""]);
    z.push(["D6 Der Zwischenspeicher steht noch", Object.keys(mod.stand().cache).length > 0]);
  }

  // E -- der Sitzungsverlust: der Login-Bildschirm muss ebenfalls raeumen
  {
    const { el, mod } = lade(blockRaeume, blockFehler);
    fuelle(el, mod);
    mod.zeigeStartFehler(new Error("Sitzung abgelaufen"));
    z.push(["E1 Anmeldeliste ist leer", el.get("anm-liste").innerHTML === ""]);
    z.push(["E2 Teilnehmerliste ist leer", el.get("teilnehmer-liste").innerHTML === ""]);
    z.push(["E3 IBAN ist leer", el.get("e-iban").value === ""]);
    z.push(["E4 Dialogrumpf ist leer", el.get("anm-modal-body").innerHTML === ""]);
    z.push(["E5 Nirgends steht noch \"Musterkind\"",
      ![...el.values()].some((e) => String(e.innerHTML).includes("Musterkind") || String(e.textContent).includes("Musterkind"))]);
    z.push(["E6 Der Login-Bildschirm steht da", el.get("connect-screen").style.display === ""]);
    z.push(["E7 Die App ist versteckt", el.get("app-shell").style.display === "none"]);
    z.push(["E8 Der Zwischenspeicher ist leer", Object.keys(mod.stand().cache).length === 0]);
  }

  return z;
}

function quelltext() {
  return [
    ["F1 Der Raeum-Aufruf haengt in applyAdminVisibility", /applyAdminVisibility\(\)[\s\S]{0,800}?raeumeWasNichtMehrErlaubtIst\(edit, admin, betreuer\);/.test(Q)],
    ["F2 Und im Fehlerweg mit allen Rechten auf false", Q.includes("raeumeWasNichtMehrErlaubtIst(false, false, false);")],
    // ⚠️ Die zweite Haelfte NUR im Rumpf der Raeum-Funktion suchen, nicht in der
    // ganzen Datei. Am 30.08.2026 wurde sie zu Unrecht rot: eine andere Sitzung
    // hat ein Konto-Schloss mit einer eigenen KONTO_FELDER-Liste gebaut, in der
    // dieselben Ids voellig legitim stehen. Ein zu weiter Suchraum meldet einen
    // Rueckfall, den es nicht gibt — genau die Falle wie beim Wort "verwaist".
    ["F3 Die Verwaltungsfelder gehen ueber den Container, nicht ueber eine Id-Liste",
      Q.includes('querySelectorAll("#tab-verwaltung input, #tab-verwaltung textarea")')
      && !/\["e-kontoinhaber"/.test(BLOCK_RAEUME)],
    ["F4 Alle geraeumten Ids gibt es auch wirklich im HTML",
      LISTEN_IDS.every((id) => HTML.includes('id="' + id + '"'))]
  ];
}

// ----------------------------------------------------------------------------
function melde(zeilen) {
  let rot = 0;
  for (const [name, ok] of zeilen) { if (!ok) rot++; console.log(`  ${ok ? "ok  " : "ROT "} ${name}`); }
  return rot;
}

if (process.argv.includes("--mutation")) {
  const MUT = [
    ["Anmeldeliste nicht mehr raeumen", (r, f) => [r.replace('leere("anm-liste");', ""), f]],
    ["Dialogrumpf nicht mehr raeumen", (r, f) => [r.replace('leere("anm-modal-body");', ""), f]],
    ["Verwaltungsfelder nicht mehr raeumen", (r, f) => [r.replace(/document\.querySelectorAll\("#tab-verwaltung[\s\S]*?\}\);\n/, ""), f]],
    ["Zwischenspeicher bleibt stehen", (r, f) => [r.replace("teilnehmerCache = {};", ""), f]],
    ["Admin-Zweig haengt am falschen Recht", (r, f) => [r.replace("if (!admin) {", "if (!edit) {"), f]],
    ["Raeumt IMMER, auch mit vollen Rechten", (r, f) => [r.replace("if (!edit) {", "if (true) {"), f]],
    ["Der Login-Bildschirm raeumt nicht mehr", (r, f) => [r, f.replace("raeumeWasNichtMehrErlaubtIst(false, false, false);", "")]],
    ["Login-Bildschirm raeumt mit vollen Rechten", (r, f) => [r, f.replace("raeumeWasNichtMehrErlaubtIst(false, false, false);", "raeumeWasNichtMehrErlaubtIst(true, true, true);")]]
  ];

  console.log("Datei: " + APP);
  console.log("unveraendert: " + verhalten(BLOCK_RAEUME, BLOCK_FEHLER).filter(([, ok]) => !ok).length + " rot (muss 0 sein)\n");

  let gefangen = 0, ungueltig = 0;
  for (const [name, f] of MUT) {
    const [r, fe] = f(BLOCK_RAEUME, BLOCK_FEHLER);
    if (r === BLOCK_RAEUME && fe === BLOCK_FEHLER) { ungueltig++; console.log(`  [Suchtext fehlt] ${name}`); continue; }
    let rot;
    try { rot = verhalten(r, fe).filter(([, ok]) => !ok).length; } catch { rot = 99; }
    if (rot > 0) gefangen++;
    console.log(`  ${rot > 0 ? "gefangen      " : "DURCHGERUTSCHT"} ${name}  (${rot} rot)`);
  }
  console.log(`\n${gefangen}/${MUT.length} gefangen, ${ungueltig} ungueltig`);
  process.exit(gefangen === MUT.length && ungueltig === 0 ? 0 : 1);
}

console.log("Datei:  " + APP);
console.log("Felder unter Verwaltung (aus index.html): " + VERWALTUNGSFELDER.length + "\n");
console.log("A–E — was beim Rechte- und Sitzungsverlust passiert");
const rot1 = melde(verhalten(BLOCK_RAEUME, BLOCK_FEHLER));
console.log("\nF — was im Quelltext stehen muss");
const rot2 = melde(quelltext());
const n = verhalten(BLOCK_RAEUME, BLOCK_FEHLER).length + quelltext().length;
console.log(`\n${n - rot1 - rot2}/${n} Zusagen gruen, ${rot1 + rot2} rot.`);
process.exit(rot1 + rot2 ? 1 : 0);
