// Fußballcamp — Oberfläche.
//
// ⚠️ Diese App hält KEINEN eigenen Bestand, den sie zurückschreibt. Jede Änderung
// ist ein Worker-Aufruf, danach wird neu geladen (siehe Kopf von db.js). Der sonst
// übliche Debounce-Save mitsamt In-Flight-Guard entfällt deshalb — es gibt hier
// nichts, was zwischen zwei Tastendrücken verloren gehen könnte.
//
// Einzige Ausnahme ist der Verwaltungs-Tab: dort sammelt ein Formular mehrere
// Einstellungen und schickt sie auf Knopfdruck zusammen ab.

let daten = null;          // die letzte Antwort von ladeAlles()
let me = { username: "", isAdmin: false, canEdit: false, canAdmin: false };
let namen = {};            // username -> Anzeigename, kommt aus nutzer.json
let helferListe = [];      // für den Fremdeintrag, erst bei Bedarf geladen
let teilnehmerCache = {};  // campId -> Antwort von ladeTeilnehmer()
let aktiverTab = "camps";

// Zwischenspeicher der offenen Dialoge
let campEntwurf = null;
let jobEntwurf = null;
let anmEntwurf = null;
let personZiel = null;

// Die Kontoverbindung ist die einzige Stelle dieser App, an der ein Vertipper
// Geld kostet: sie steht in jeder Bestätigungsmail und auf der Bestätigungsseite,
// und die Eltern überweisen dorthin. Deshalb sind die vier Felder gesperrt und
// müssen vor einer Änderung erst freigegeben werden.
//
// ⚠️ Der Merker lebt NUR im Speicher und fängt bei jedem Neuladen wieder bei
// `false` an. Ein in localStorage aufgehobener Merker bliebe auf einem geteilten
// Rechner hängen, und das Schloss wäre ab dem zweiten Besuch nur noch Zierde.
let kontoFrei = false;
const KONTO_FELDER = ["e-kontoinhaber", "e-iban", "e-bic", "e-bank"];

// ============================================================
//  Start
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("app-version").textContent = APP_VERSION;
  renderChangelog();
  verdrahteBedienung();
  startApp();
});

async function startApp() {
  try {
    await ladeUndZeichne();
    document.getElementById("connect-screen").style.display = "none";
    document.getElementById("app-shell").style.display = "";
  } catch (e) {
    zeigeStartFehler(e);
  }
}

function zeigeStartFehler(e) {
  // ⚠️ Dieser Weg VERSTECKT die App nur (display:none) — alles zuletzt
  // Gezeichnete bliebe dahinter stehen. Und genau hier landet ein Sitzungs- oder
  // Rechteverlust im laufenden Betrieb: mitFehler() fängt NotLoggedInError ab und
  // ruft uns. applyAdminVisibility() läuft dabei NICHT mehr — ladeUndZeichne() ist
  // ja vorher abgebrochen. Also hier selbst räumen, sonst greift der Schutz aus
  // raeumeWasNichtMehrErlaubtIst() ausgerechnet im ernsten Fall nicht.
  raeumeWasNichtMehrErlaubtIst(false, false, false);

  const feld = document.getElementById("cloud-error");
  if (e instanceof NotLoggedInError) {
    document.getElementById("connect-message").textContent =
      "Bitte über die Tools-Übersicht anmelden, um die Camps zu sehen.";
    feld.textContent = "";
  } else {
    feld.textContent = e && e.message ? e.message : "Unbekannter Fehler beim Laden.";
  }
  document.getElementById("connect-screen").style.display = "";
  document.getElementById("app-shell").style.display = "none";
}

// Nach JEDER Änderung: neu laden und alles neu zeichnen. Das ist billiger als es
// aussieht (ein Worker-Aufruf) und schließt die Lücke, durch die sonst zwei
// Geräte auseinanderlaufen.
async function ladeUndZeichne() {
  const antwort = await ladeAlles();
  daten = antwort;
  me = antwort.me || me;
  namen = antwort.namen || {};
  teilnehmerCache = {};
  applyAdminVisibility();
  zeichneAlles();
}

// ============================================================
//  Rechte
// ============================================================

function canEdit()  { return !!(me.isAdmin || me.canEdit); }
function canAdmin() { return !!(me.isAdmin || me.canAdmin); }

// Ist der angemeldete Nutzer an mindestens einem Camp als Helfer eingetragen?
// Nur dann hat der Teilnehmer-Reiter überhaupt einen Inhalt.
//
// ⚠️ Das hier ist NUR die Anzeige-Entscheidung. Ob die Daten wirklich
// herausgegeben werden, prüft der Worker in fussballcamp-teilnehmer noch einmal
// selbst — der Reiter von Hand eingeblendet bringt niemandem Daten.
function istBetreuer() {
  if (!daten || !Array.isArray(daten.camps)) return false;
  return daten.camps.some((c) => campHatMich(c));
}

function campHatMich(camp) {
  return (camp.tage || []).some((t) =>
    (t.jobs || []).some((j) =>
      (j.besetzung || []).some((b) => b.username && b.username === me.username)));
}

// ⚠️ Verstecken ist nicht Räumen. Fällt einem Nutzer ein Recht weg, während die
// App offen ist (Michel nimmt ihn aus einer Gruppe, ein Passwortwechsel setzt die
// Sitzung zurück), dann versteckt `applyAdminVisibility` zwar die Reiter — der
// zuletzt gezeichnete Inhalt bleibt aber im DOM stehen. Und darin stehen
// Kindernamen, Eltern-Mailadressen und die Kontoverbindung des Vereins.
//
// Die vier betroffenen Zeichenfunktionen steigen bei fehlendem Recht als ERSTES
// aus (`if (!canEdit()) return;`) und kommen gar nicht mehr bis zu der Zeile, die
// den Inhalt setzt. Deshalb wird hier zentral geräumt statt in jeder einzelnen —
// von vier Stellen vergisst früher oder später eine den Fall, und man sieht es
// nicht.
//
// Der Server gibt die Daten nach dem Rechteverlust ohnehin nicht mehr heraus
// ([[f-ausblenden]]); das hier ist die zweite Hälfte davon — das, was schon im
// Browser liegt, muss auch weg.
function raeumeWasNichtMehrErlaubtIst(edit, admin, betreuer) {
  const leere = (id) => { const el = document.getElementById(id); if (el) el.innerHTML = ""; };
  const leereText = (id) => { const el = document.getElementById(id); if (el) el.textContent = ""; };

  if (!edit) {
    // Anmeldungen: Kindernamen, Geburtsdaten, Eltern-Mail, Beitragsstand.
    leere("anm-liste");
    leereText("anm-zusammenfassung");
    // Der Meldekasten nennt Kindernamen und was geändert wurde.
    leere("meldebox");
    // ⚠️ Der offene Dialog ist der schlimmere Fall: er liegt nicht nur im DOM,
    // er steht SICHTBAR auf dem Bildschirm. Der Titel ist der Kindname, der Rumpf
    // trägt die vollen Angaben. Zumachen allein reicht deshalb nicht -- der
    // Inhalt muss weg, sonst steht er beim nächsten Öffnen wieder da.
    schliesse("anm-modal");
    leereText("anm-modal-titel");
    leere("anm-modal-body");
    anmEntwurf = null;
  }
  if (!admin) {
    leere("aufraeum-box");
    // ⚠️ Kontoverbindung und Ansprechpartner stehen in Formularfeldern, nicht
    // im Markup — ein leeres innerHTML räumt sie NICHT weg.
    //
    // ⚠️ Über den CONTAINER, nicht über eine Liste von Feld-Ids. Eine Liste
    // veraltet lautlos: wer später ein Feld unter Verwaltung ergänzt, müsste
    // daran denken, es hier nachzutragen — und genau dieses eine bliebe dann
    // stehen. Zurück kommen die Werte ohnehin aus fuelleVerwaltung(), sobald das
    // Recht wieder da ist.
    document.querySelectorAll("#tab-verwaltung input, #tab-verwaltung textarea").forEach((el) => {
      if (el.type === "checkbox" || el.type === "radio") el.checked = false;
      else el.value = "";
    });
    // ⚠️ Eine offene Freigabe muss mit weg. Sonst stünde das Schloss nach
    // einem Rechteverlust weiter auf offen, und der nächste Nutzer an demselben
    // Browser fände die Kontofelder entsperrt vor.
    setzeKontoSchloss(false);
    leere("agb-archiv-liste");
    const archivBlock = document.getElementById("agb-archiv-block");
    if (archivBlock) archivBlock.classList.add("hidden");
    leere("katalog-liste");
  }
  if (!betreuer) {
    // Die Betreuer-Sicht trägt Allergien, Medikamente und Notfallnummern.
    leere("teilnehmer-liste");
    // ⚠️ Auch den Zwischenspeicher: sonst zeichnet der nächste Reiterwechsel die
    // Liste aus dem Speicher neu, ohne den Server noch einmal zu fragen.
    teilnehmerCache = {};
  }
}

// Geteiltes Flotten-Muster: .editor-only am Bearbeiten-Recht, .admin-only am
// Administrieren-Recht. Der Info-Reiter trägt bewusst keine der beiden Klassen
// und bleibt für alle sichtbar.
function applyAdminVisibility() {
  const edit = canEdit();
  const admin = canAdmin();
  const betreuer = edit || istBetreuer();

  document.querySelectorAll(".editor-only").forEach((el) => el.classList.toggle("hidden", !edit));
  document.querySelectorAll(".admin-only").forEach((el) => el.classList.toggle("hidden", !admin));
  document.querySelectorAll(".betreuer-only").forEach((el) => el.classList.toggle("hidden", !betreuer));

  raeumeWasNichtMehrErlaubtIst(edit, admin, betreuer);

  const wer = namen[me.username] || me.username || "";
  const stufe = admin ? "Administrieren" : (edit ? "Bearbeiten" : "Sehen");
  document.getElementById("header-user").textContent = wer ? `${wer} · ${stufe}` : stufe;

  // Steht der Nutzer gerade auf einem Reiter, den er nicht (mehr) sehen darf,
  // zurück auf die Camps. Sonst bliebe eine leere Seite stehen, ohne dass
  // erkennbar wäre, warum.
  const knopf = document.querySelector(`nav button[data-tab="${aktiverTab}"]`);
  if (knopf && knopf.classList.contains("hidden")) zeigeTab("camps");
}

// ============================================================
//  Reiter
// ============================================================

function zeigeTab(name) {
  aktiverTab = name;
  document.querySelectorAll("nav button[data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  document.querySelectorAll(".tab-section").forEach((s) => s.classList.toggle("active", s.id === "tab-" + name));
  if (name === "teilnehmer") zeichneTeilnehmer();
}

// ============================================================
//  Camps
// ============================================================

function zeichneAlles() {
  fuelleCampAuswahl();
  zeichneKennzahlen();
  zeichneMeldebox();
  zeichneAufraeumBox();
  zeichneCamps();
  zeichneJobs();
  zeichneAnmeldungen();
  fuelleVerwaltung();
}

function camps() { return (daten && Array.isArray(daten.camps)) ? daten.camps : []; }

function findeCamp(id) { return camps().find((c) => c.id === id) || null; }

// Camps mit dem nächstgelegenen zuerst; abgeschlossene ans Ende.
function sortierteCamps() {
  const rang = { offen: 0, geschlossen: 1, entwurf: 2, abgeschlossen: 3 };
  return camps().slice().sort((a, b) => {
    const ra = rang[a.status] ?? 9, rb = rang[b.status] ?? 9;
    if (ra !== rb) return ra - rb;
    return String(a.vonDatum || "").localeCompare(String(b.vonDatum || ""));
  });
}

function zeichneKennzahlen() {
  const ziel = document.getElementById("summary-cards");
  const offene = camps().filter((c) => c.status === "offen");
  const belegt = offene.reduce((s, c) => s + (c.belegt || 0), 0);
  const frei = offene.reduce((s, c) => s + Math.max(0, (c.plaetze || 0) - (c.belegt || 0)), 0);
  const warte = offene.reduce((s, c) => s + (c.warteliste || 0), 0);

  // ⚠️ Bei genau 1 muss die Beschriftung mitgehen: „1 Camps mit offener
  // Anmeldung" und „1 freie Plätze" standen so auf der Startseite.
  const ein = (n, einzahl, mehrzahl) => (n === 1 ? einzahl : mehrzahl);
  const karten = [
    { label: ein(offene.length, "Camp mit offener Anmeldung", "Camps mit offener Anmeldung"), wert: offene.length },
    { label: ein(belegt, "angemeldetes Kind", "angemeldete Kinder"), wert: belegt },
    { label: ein(frei, "freier Platz", "freie Plätze"), wert: frei, art: frei === 0 && offene.length ? "warn" : "" },
    { label: "auf der Warteliste", wert: warte, art: warte > 0 ? "warn" : "" }
  ];

  // Der Beitragsstand geht nur Bearbeiter etwas an — für alle anderen kommen die
  // Anmeldungen gar nicht erst vom Server, die Zahl wäre also immer 0 und damit
  // eine Falschaussage.
  if (canEdit()) {
    const offenerBeitrag = camps().reduce((s, c) => s + offeneBeitraege(c).length, 0);
    karten.push({ label: ein(offenerBeitrag, "Beitrag offen", "Beiträge offen"), wert: offenerBeitrag,
                  art: offenerBeitrag > 0 ? "warn" : "ok" });
  }

  ziel.innerHTML = karten.map((k) => `
    <div class="summary-card ${k.art || ""}">
      <div class="sc-value">${k.wert}</div>
      <div class="sc-label">${escapeHtml(k.label)}</div>
    </div>`).join("");
}

function offeneBeitraege(camp) {
  return (camp.anmeldungen || []).filter((a) => a.status === "angemeldet" && !a.bezahlt);
}

// Von den Eltern selbst geänderte oder abgesagte Anmeldungen. Ohne diesen Kasten
// bliebe eine Absage unbemerkt: die Eltern ändern über ihren Link, und es geht
// keine Mail an den Verein (Michel-Entscheidung, bewusst kein Meldeversand).
function zeichneMeldebox() {
  const box = document.getElementById("meldebox");
  if (!canEdit()) { box.classList.add("hidden"); return; }

  const posten = [];
  camps().forEach((c) => {
    (c.anmeldungen || []).forEach((a) => {
      if (!a.elternAenderung) return;
      posten.push({ campId: c.id, campName: c.name, anmeldungId: a.id, kind: kindName(a),
                    was: a.elternAenderung, felder: Array.isArray(a.elternAenderungFelder) ? a.elternAenderungFelder : [] });
    });
  });

  if (!posten.length) { box.classList.add("hidden"); box.innerHTML = ""; return; }

  box.classList.remove("hidden");
  box.innerHTML = `
    <h3>Die Eltern haben etwas geändert</h3>
    <ul>${posten.map((p) => `<li><strong>${escapeHtml(p.kind)}</strong> · ${escapeHtml(p.campName)} — ${escapeHtml(meldeSatz(p))}</li>`).join("")}</ul>
    <button type="button" class="btn small" id="btn-meldebox-gesehen">Zur Kenntnis genommen</button>`;

  document.getElementById("btn-meldebox-gesehen").addEventListener("click", async () => {
    // Je Camp ein Aufruf: die Aktion arbeitet auf einem Camp, und ein Sammelweg
    // über alle Camps würde die Prüfung im Worker verwässern.
    const nachCamp = {};
    posten.forEach((p) => { (nachCamp[p.campId] = nachCamp[p.campId] || []).push(p.anmeldungId); });
    await mitFehler(async () => {
      for (const campId of Object.keys(nachCamp)) await markiereGesehen(campId, nachCamp[campId]);
      await ladeUndZeichne();
      toast("Vermerkt.");
    });
  });
}

// Camps, deren Aufräum-Frist abgelaufen ist. ⚠️ Nur der Hinweis — gelöscht wird
// erst auf Klick, und auch dann fragt die App noch einmal nach.
function zeichneAufraeumBox() {
  const box = document.getElementById("aufraeum-box");
  if (!canAdmin()) { box.classList.add("hidden"); return; }

  const reif = camps().filter((c) => c.aufraeumenFaellig && !c.aufgeraeumtAm);
  // ⚠️ Der zweite Fall ist der leisere: das Camp ist lange vorbei, aber niemand
  // hat es je abgeschlossen. Dann wird `aufraeumenFaellig` nie true, der Kasten
  // bliebe für immer leer — und die Daten der Kinder stünden unbefristet in der
  // Datei, obwohl das Anmeldeformular den Eltern etwas anderes verspricht.
  const offen = camps().filter((c) => c.abschlussFaellig && !c.aufgeraeumtAm);
  if (!reif.length && !offen.length) { box.classList.add("hidden"); box.innerHTML = ""; return; }

  box.classList.remove("hidden");
  const teile = [];

  if (offen.length) {
    teile.push(`
      <h3>Diese Camps sind längst vorbei</h3>
      <ul>${offen.map((c) => `<li><strong>${escapeHtml(c.name)}</strong> — beendet am ${datumDe(c.bisDatum)}, ${(c.anmeldungen || []).length} Anmeldungen mit Namen und Gesundheitsangaben</li>`).join("")}</ul>
      <p class="muted" style="font-size:13px;margin-bottom:10px;">Setz sie auf <strong>abgeschlossen</strong> — danach lassen sie sich hier aufräumen. Solange das nicht passiert, bleiben die Daten der Kinder gespeichert.</p>`);
  }

  if (reif.length) {
    teile.push(`
      <h3>Diese Camps sind reif zum Aufräumen</h3>
      <ul>${reif.map((c) => `<li><strong>${escapeHtml(c.name)}</strong> — beendet am ${datumDe(c.bisDatum)}, ${(c.anmeldungen || []).length} Anmeldungen</li>`).join("")}</ul>
      <p class="muted" style="font-size:13px;margin-bottom:10px;">Aufräumen löscht Namen, Anschriften und Gesundheitsangaben. Die Zahlen für die Statistik bleiben. Das lässt sich nicht rückgängig machen.</p>
      ${reif.map((c) => `<button type="button" class="btn small warn" data-aufraeumen="${escapeAttr(c.id)}">„${escapeHtml(c.name)}" aufräumen</button>`).join(" ")}`);
  }

  box.innerHTML = teile.join("");

  box.querySelectorAll("[data-aufraeumen]").forEach((b) => {
    b.addEventListener("click", async () => {
      const camp = findeCamp(b.dataset.aufraeumen);
      if (!camp) return;
      if (!confirm(`Wirklich aufräumen?\n\nAus „${camp.name}" werden Namen, Anschriften, Kontaktdaten und Gesundheitsangaben von ${(camp.anmeldungen || []).length} Anmeldungen gelöscht.\n\nDas lässt sich nicht rückgängig machen.`)) return;
      await mitFehler(async () => {
        await raeumeAuf(camp.id);
        await ladeUndZeichne();
        toast("Aufgeräumt.");
      });
    });
  });
}

function zeichneCamps() {
  const ziel = document.getElementById("camp-liste");
  const leer = document.getElementById("camps-empty");
  const liste = sortierteCamps();

  document.getElementById("camps-hinweis").textContent = canEdit()
    ? "Ein neues Camp ist zuerst ein Entwurf und für niemanden sichtbar. Erst „Anmeldung öffnen“ stellt es auf die Homepage."
    : "Die Anmeldungen und die Daten der Kinder sind hier nicht sichtbar.";

  leer.classList.toggle("hidden", liste.length > 0);
  ziel.innerHTML = liste.map(campKarte).join("");

  ziel.querySelectorAll("[data-camp-bearbeiten]").forEach((b) =>
    b.addEventListener("click", () => oeffneCampDialog(b.dataset.campBearbeiten)));
  ziel.querySelectorAll("[data-camp-status]").forEach((b) =>
    b.addEventListener("click", () => wechsleStatus(b.dataset.campStatus, b.dataset.zielStatus)));
  ziel.querySelectorAll("[data-link-kopieren]").forEach((b) =>
    b.addEventListener("click", () => kopiere(b.dataset.linkKopieren, "Anmeldelink kopiert.")));
}

// Feld-Id → die Beschriftung, die auch im Formular steht.
//
// ⚠️ `agb` und `zusatzantwort` stehen NICHT in FORMULAR_FELDER — sie sind keine
// Formularfelder, werden aber gemeldet. Ohne die Sonderliste stünde im Kasten die
// nackte Feld-Id.
const SONDER_LABEL = {
  agb: "Teilnahmebedingungen neu bestätigt",
  zusatzantwort: "Antwort auf die Zusatzfrage"
};
function feldLabel(id) {
  const f = FORMULAR_FELDER.find((x) => x.id === id);
  return f ? f.label : (SONDER_LABEL[id] || id);
}

// Was im Meldekasten hinter dem Namen steht.
//
// ⚠️ Änderungen von vor dem 2026-08-25 tragen noch KEINE Feldliste. Dann bleibt es
// beim alten Satz — eine leere Aufzählung sähe aus, als sei gar nichts geändert
// worden, und das wäre schlechter als die alte, ungenaue Meldung.
function meldeSatz(p) {
  if (p.was === "abgesagt") return "hat abgesagt";
  if (!p.felder.length) return "hat die Angaben geändert";
  return "hat geändert: " + p.felder.map(feldLabel).join(", ");
}

function campKarte(c) {
  const status = CAMP_STATUS.find((s) => s.id === c.status) || CAMP_STATUS[0];
  const plaetze = c.plaetze || 0;
  const belegt = c.belegt || 0;
  const frei = Math.max(0, plaetze - belegt);
  const anteil = plaetze > 0 ? Math.min(100, Math.round((belegt / plaetze) * 100)) : 0;

  const zahlen = [
    { wert: belegt, label: "angemeldet" },
    { wert: frei, label: "frei", art: frei === 0 ? "warn" : "ok" },
    { wert: c.warteliste || 0, label: "Warteliste", art: (c.warteliste || 0) > 0 ? "warn" : "" },
    { wert: (c.jobsFrei || 0), label: "Aufgaben offen", art: (c.jobsFrei || 0) > 0 ? "warn" : "ok" }
  ];
  if (canEdit()) zahlen.push({ wert: offeneBeitraege(c).length, label: "Beitrag offen", art: offeneBeitraege(c).length > 0 ? "warn" : "ok" });

  // Der Anmeldelink steht nur bei einem Camp, das überhaupt jemand aufrufen
  // kann — bei einem Entwurf führte er ins Leere und würde trotzdem weitergegeben.
  const link = (c.status === "offen" || c.status === "geschlossen") && c.token
    ? `${APP_URL}anmeldung.html?c=${encodeURIComponent(c.token)}` : "";

  return `
  <div class="camp-karte ${escapeAttr(c.status)}">
    <div class="ck-kopf">
      <div>
        <div class="ck-titel">${escapeHtml(c.name || "Ohne Namen")}</div>
        <div class="ck-sub">${datumBereich(c.vonDatum, c.bisDatum)} · täglich ${escapeHtml(c.taeglichVon || "?")}–${escapeHtml(c.taeglichBis || "?")}${c.ort ? " · " + escapeHtml(c.ort) : ""}</div>
        <div class="ck-sub">${jahrgangText(c)} · ${beitragText(c)}${c.preisHinweis ? " · " + escapeHtml(c.preisHinweis) : ""}</div>
      </div>
      <span class="ck-status" style="background:${escapeAttr(status.farbe)}">${escapeHtml(status.label)}</span>
    </div>

    <div class="ck-zahlen">
      ${zahlen.map((z) => `<div class="ck-zahl ${z.art || ""}"><div class="z-wert">${z.wert}</div><div class="z-label">${escapeHtml(z.label)}</div></div>`).join("")}
    </div>
    <div class="ck-balken"><span class="${frei === 0 ? "voll" : ""}" style="width:${anteil}%"></span></div>

    ${link ? `<div class="ck-link"><span class="muted">Anmeldelink:</span><code>${escapeHtml(link)}</code>
      <button type="button" class="btn tiny ghost" data-link-kopieren="${escapeAttr(link)}">kopieren</button>
      <a class="btn tiny ghost" href="${escapeAttr(link)}" target="_blank" rel="noopener">ansehen</a></div>` : ""}

    ${kalenderZeile(c)}
    ${anmeldeFensterHinweis(c)}

    <div class="btn-row">
      ${canEdit() ? `<button type="button" class="btn small" data-camp-bearbeiten="${escapeAttr(c.id)}">Bearbeiten</button>` : ""}
      ${canEdit() ? statusKnoepfe(c) : ""}
    </div>
  </div>`;
}

function statusKnoepfe(c) {
  const knopf = (ziel, text, klasse) =>
    `<button type="button" class="btn small ${klasse}" data-camp-status="${escapeAttr(c.id)}" data-ziel-status="${ziel}">${text}</button>`;
  if (c.status === "entwurf")     return knopf("offen", "Anmeldung öffnen", "success");
  if (c.status === "offen")       return knopf("geschlossen", "Anmeldung schließen", "warn");
  if (c.status === "geschlossen") return knopf("offen", "Wieder öffnen", "ghost") + " " + knopf("abgeschlossen", "Camp abschließen", "ghost");
  return knopf("geschlossen", "Wieder aufmachen", "ghost");
}

// Der Beitrag eines Camps in einem Satz — mit Frühbucherfenster, wenn es eines
// gibt.
//
// ⚠️ `preisJetzt` kommt vom Worker, wird hier also NICHT selbst aus dem Datum
// gerechnet. Der Browser des Nutzers kann auf einem anderen Tag stehen als der
// Server, der den Betrag beim Anmelden festschreibt — und dann stünde in der
// Verwaltung ein anderer Preis, als die Eltern zahlen.
function beitragText(c) {
  const jetzt = (c.preisJetzt === undefined || c.preisJetzt === null) ? c.preis : c.preisJetzt;
  if (!c.preisFrueh || !c.preisFruehBis) return "Beitrag " + euro(c.preis);
  const nochFrueh = jetzt === c.preisFrueh;
  return nochFrueh
    ? `Beitrag ${euro(c.preisFrueh)} bis ${datumDe(c.preisFruehBis)}, danach ${euro(c.preis)}`
    : `Beitrag ${euro(c.preis)} (Frühbucher ${euro(c.preisFrueh)} lief am ${datumDe(c.preisFruehBis)} aus)`;
}

// Was DIESE Anmeldung schuldet — der beim Anmelden festgeschriebene Betrag.
//
// ⚠️ Der Rückfall auf den Camp-Preis gilt nur für Anmeldungen von vor dem
// 2026-08-25, die noch keinen Betrag tragen. 0 ist ein gültiger Betrag, deshalb
// ausdrücklich gegen undefined/null prüfen und nicht auf Wahrheitswert.
function anmBetrag(camp, a) {
  const roh = a ? a.betrag : undefined;
  return (roh === undefined || roh === null) ? (camp.preis || 0) : roh;
}

// Steht dieses Camp im Vereinskalender? Der Übertrag passiert von allein — beim
// Speichern, beim Statuswechsel und im nächtlichen Lauf des Workers.
//
// ⚠️ Nur für Bearbeiter: für alle anderen ist das eine Verwaltungsauskunft ohne
// Nutzen — sie sehen den Termin im Vereinskalender selbst.
//
// ⚠️ "kalenderUebertragen" heißt "es wurde ein Termin angelegt", nicht "er steht
// dort noch". Wer ihn im Vereinskalender von Hand löscht, bleibt ihn los — der
// Abgleich legt ihn bewusst nicht wieder an. Diese Zeile zeigt das dann falsch
// an; den Kalender bei jedem Laden mitzulesen wäre ein zweiter Weg zum Server
// für eine einzige Anzeigezeile.
function kalenderZeile(c) {
  if (!canEdit() || !c.kalenderSoll) return "";
  return c.kalenderUebertragen
    ? `<div class="ck-kalender ok">Steht im Vereinskalender</div>`
    : `<div class="ck-kalender">Noch nicht im Vereinskalender — kommt beim nächsten Speichern oder über Nacht dazu.</div>`;
}

// ⚠️ Gemeldet wird NUR der Fehlerfall. „Steht jetzt im Kalender" bei jedem
// Speichern wäre eine Meldung über etwas, das ohnehin passieren soll, und die
// Karte zeigt es ja. Ein AUSGEBLIEBENER Übertrag dagegen fällt sonst niemandem
// auf — genau die Art stiller Fehler, die man erst Wochen später bemerkt.
function kalenderZusatz(antwort) {
  return antwort && antwort.kalender === "fehler"
    ? " Der Termin im Vereinskalender ließ sich gerade nicht schreiben — der nächtliche Lauf holt ihn nach."
    : "";
}

// Warum ein Camp trotz Status "offen" keine Anmeldung annimmt — sonst sucht man
// den Fehler auf der Anmeldeseite, obwohl bloß das Datumsfenster zu ist.
function anmeldeFensterHinweis(c) {
  if (c.status !== "offen") return "";
  const heute = heuteIso();
  if (c.anmeldungVon && heute < c.anmeldungVon)
    return `<div class="hinweis">Die Anmeldung öffnet erst am ${datumDe(c.anmeldungVon)}. Bis dahin sieht man das Camp auf der Homepage, kann sich aber noch nicht anmelden.</div>`;
  if (c.anmeldungBis && heute > c.anmeldungBis)
    return `<div class="hinweis">Das Anmeldefenster ist am ${datumDe(c.anmeldungBis)} abgelaufen. Es kommen keine Anmeldungen mehr an.</div>`;
  if (!c.hatKonto)
    return `<div class="hinweis">Es ist noch keine <strong>IBAN</strong> hinterlegt. Die Eltern erfahren dann nicht, wohin der Beitrag soll — nachzutragen unter „Verwaltung“.</div>`;
  return "";
}

async function wechsleStatus(id, ziel) {
  const camp = findeCamp(id);
  if (!camp) return;
  if (ziel === "offen" && !camp.hatKonto &&
      !confirm("Es ist noch keine IBAN hinterlegt.\n\nDie Eltern bekommen dann keine Zahlungsangaben. Trotzdem öffnen?")) return;
  await mitFehler(async () => {
    const antwort = await setzeCampStatus(id, ziel);
    await ladeUndZeichne();
    let text = ziel === "offen" ? "Das Camp steht jetzt auf der Homepage." : "Status geändert.";
    // Der Statuswechsel ist der Moment, in dem der Termin entsteht oder
    // verschwindet — hier ist die Meldung eine Auskunft, keine Selbstdarstellung.
    if (antwort && antwort.kalender === "angelegt") text += " Der Termin steht im Vereinskalender.";
    if (antwort && antwort.kalender === "entfernt") text += " Der Termin im Vereinskalender ist wieder weg.";
    toast(text + kalenderZusatz(antwort));
  });
}

// ============================================================
//  Camp-Dialog
// ============================================================

function oeffneCampDialog(id) {
  const c = id ? findeCamp(id) : null;
  campEntwurf = c
    ? JSON.parse(JSON.stringify(c))
    : { id: "", name: "", ort: "", vonDatum: "", bisDatum: "", taeglichVon: "09:00", taeglichBis: "16:00",
        jahrgangVon: null, jahrgangBis: null, plaetze: 40, preis: 0, preisHinweis: "",
        anmeldungVon: "", anmeldungBis: "", kurzbeschreibung: "", beschreibung: "",
        zusatzfrage: "", bild: null, felder: Object.assign({}, DEFAULT_FELDER) };

  document.getElementById("camp-modal-titel").textContent = c ? "Camp bearbeiten" : "Neues Camp";
  setzeWert("c-name", campEntwurf.name);
  setzeWert("c-ort", campEntwurf.ort);
  setzeWert("c-von", campEntwurf.vonDatum);
  setzeWert("c-bis", campEntwurf.bisDatum);
  setzeWert("c-zeitvon", campEntwurf.taeglichVon);
  setzeWert("c-zeitbis", campEntwurf.taeglichBis);
  setzeWert("c-jahrgangvon", campEntwurf.jahrgangVon || "");
  setzeWert("c-jahrgangbis", campEntwurf.jahrgangBis || "");
  setzeWert("c-plaetze", campEntwurf.plaetze || "");
  setzeWert("c-preis", campEntwurf.preis ? centNachKomma(campEntwurf.preis) : "");
  setzeWert("c-preisfrueh", campEntwurf.preisFrueh ? centNachKomma(campEntwurf.preisFrueh) : "");
  setzeWert("c-preisfruehbis", campEntwurf.preisFruehBis || "");
  setzeWert("c-anmvon", campEntwurf.anmeldungVon);
  setzeWert("c-anmbis", campEntwurf.anmeldungBis);
  setzeWert("c-kurz", campEntwurf.kurzbeschreibung);
  setzeWert("c-beschreibung", campEntwurf.beschreibung);
  setzeWert("c-preishinweis", campEntwurf.preisHinweis);
  setzeWert("c-zusatzfrage", campEntwurf.zusatzfrage);

  zeichneFeldwahl();
  campBildZuruecksetzen();
  zeichneCampBild();
  // Löschen nur bei einem bestehenden Camp ohne Anmeldungen — der Worker prüft
  // das noch einmal, aber ein Knopf, der immer 409 gibt, ist eine Falle.
  const del = document.getElementById("btn-camp-loeschen");
  const loeschbar = !!c && canAdmin() && !((c.anmeldungen || []).length);
  del.classList.toggle("hidden", !loeschbar);

  oeffne("camp-modal");
}

function zeichneFeldwahl() {
  const ziel = document.getElementById("c-felder");
  const konf = campEntwurf.felder || {};

  ziel.innerHTML = FELD_GRUPPEN.map((g) => {
    const felder = FORMULAR_FELDER.filter((f) => f.gruppe === g.id);
    if (!felder.length) return "";
    return `
      <div class="feld-gruppe">
        <h4>${escapeHtml(g.label)}</h4>
        ${g.hinweis ? `<p class="muted" style="font-size:12px;margin-bottom:6px;">${escapeHtml(g.hinweis)}</p>` : ""}
        ${felder.map((f) => feldZeile(f, konf[f.id])).join("")}
      </div>`;
  }).join("") + `
    <div class="feld-gruppe">
      <h4>Immer dabei</h4>
      <div class="feld-zeile fest"><span class="fz-name">Einverständnis mit der Datenschutz-Information
        <span class="fz-hinweis">Pflicht nach Art. 13 DSGVO — nicht abschaltbar.</span></span><span>Pflicht</span></div>
    </div>`;

  ziel.querySelectorAll("select[data-feld]").forEach((s) =>
    s.addEventListener("change", () => { campEntwurf.felder[s.dataset.feld] = s.value; }));
}

function feldZeile(f, stufe) {
  if (f.fest) {
    return `<div class="feld-zeile fest"><span class="fz-name">${escapeHtml(f.label)}${f.hinweis ? `<span class="fz-hinweis">${escapeHtml(f.hinweis)}</span>` : ""}</span><span>Pflicht</span></div>`;
  }
  const wert = stufe || "aus";
  return `
    <div class="feld-zeile">
      <span class="fz-name">${escapeHtml(f.label)}${f.hinweis ? `<span class="fz-hinweis">${escapeHtml(f.hinweis)}</span>` : ""}</span>
      <select data-feld="${escapeAttr(f.id)}">
        ${FELD_STUFEN.map((s) => `<option value="${s.id}"${s.id === wert ? " selected" : ""}>${escapeHtml(s.label)}</option>`).join("")}
      </select>
    </div>`;
}

// ============================================================
//  Bild fürs Camp
// ============================================================

// Ein eben gewähltes, noch NICHT hochgeladenes Bild: { blob, contentType,
// vorschauUrl }. `campEntwurf.bild` trägt dagegen die Kennung dessen, was bereits
// in Nextcloud liegt. Beides getrennt zu halten ist der Grund, warum „Abbrechen"
// nichts hochlädt und „Entfernen" nichts kaputt macht.
let campBildNeu = null;

function campBildZuruecksetzen() {
  if (campBildNeu && campBildNeu.vorschauUrl) URL.revokeObjectURL(campBildNeu.vorschauUrl);
  campBildNeu = null;
  const datei = document.getElementById("c-bild-datei");
  // ⚠️ Ohne das Leeren feuert `change` beim erneuten Wählen DERSELBEN Datei
  // nicht — der Browser sieht keinen Wertwechsel. Wer versehentlich entfernt
  // hat, könnte das Bild dann nicht wieder auswählen.
  if (datei) datei.value = "";
}

function zeichneCampBild() {
  const ziel = document.getElementById("c-bild-vorschau");
  if (!ziel) return;
  const weg = document.getElementById("btn-camp-bild-weg");
  const waehlen = document.getElementById("btn-camp-bild-waehlen");

  const url = campBildNeu
    ? campBildNeu.vorschauUrl
    : campBildUrl(campEntwurf && campEntwurf.token, campEntwurf && campEntwurf.bild && campEntwurf.bild.id);

  if (url) {
    ziel.innerHTML = "";
    const img = document.createElement("img");
    img.alt = "Bild des Camps";
    // ⚠️ Kein kaputtes Bildsymbol stehen lassen: dann wüsste niemand, ob gar
    // kein Bild hinterlegt ist oder ob der Server gerade klemmt.
    img.addEventListener("error", () => {
      ziel.innerHTML = '<span class="fc-bild-leer">Bild lässt sich gerade nicht laden</span>';
    });
    img.src = url;
    ziel.appendChild(img);
  } else {
    ziel.innerHTML = '<span class="fc-bild-leer">kein Bild</span>';
  }
  if (weg) weg.classList.toggle("hidden", !url);
  if (waehlen) waehlen.textContent = url ? "Anderes Bild wählen" : "Bild auswählen";
}

// Ein Plakat aus Canva oder WhatsApp hat schnell 3000 Pixel Kantenlänge und
// mehrere Megabyte. Fürs Fenster auf der Vereinsseite reichen 1400 Pixel — und
// die Datei wandert bei jedem Aufruf der Homepage über die Leitung. Verkleinert
// wird IM BROWSER, bevor irgendetwas das Gerät verlässt.
function verkleinereCampBild(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.width;
      let h = img.height;
      if (!w || !h) { reject(new Error("Diese Datei ist kein Bild, das der Browser anzeigen kann.")); return; }
      if (w > CAMP_BILD_MAX_KANTE || h > CAMP_BILD_MAX_KANTE) {
        const f = CAMP_BILD_MAX_KANTE / Math.max(w, h);
        w = Math.round(w * f);
        h = Math.round(h * f);
      }
      const cv = document.createElement("canvas");
      cv.width = w;
      cv.height = h;
      const ctx = cv.getContext("2d");
      // Weißer Grund: ein transparentes PNG landete sonst als schwarze Fläche
      // im JPEG — und Vereinslogos kommen fast immer transparent.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      cv.toBlob((blob) => {
        if (!blob) { reject(new Error("Das Bild konnte nicht verarbeitet werden.")); return; }
        resolve({ blob, contentType: "image/jpeg" });
      }, "image/jpeg", CAMP_BILD_QUALITAET);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Diese Datei ist kein Bild, das der Browser anzeigen kann."));
    };
    img.src = url;
  });
}

function campBildBlobZuBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result || "");
      const komma = s.indexOf(",");
      resolve(komma >= 0 ? s.slice(komma + 1) : s);
    };
    r.onerror = () => reject(new Error("Das Bild konnte nicht gelesen werden."));
    r.readAsDataURL(blob);
  });
}

// ⚠️ Der Worker verlangt eine echte UUID-Form (FILE_ID_RE). `crypto.randomUUID`
// kennen die älteren iOS-Geräte der Flotte nicht — deshalb der Rückfallweg.
function campBildUuid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === "x" ? r : ((r & 0x3) | 0x8)).toString(16);
  });
}

async function campBildGewaehlt(file) {
  if (!file) return;
  try {
    const { blob, contentType } = await verkleinereCampBild(file);
    if (blob.size > CAMP_BILD_MAX_BYTES) {
      toast("Das Bild ist auch nach dem Verkleinern noch zu groß. Bitte ein kleineres wählen.", true);
      return;
    }
    if (campBildNeu && campBildNeu.vorschauUrl) URL.revokeObjectURL(campBildNeu.vorschauUrl);
    campBildNeu = { blob, contentType, vorschauUrl: URL.createObjectURL(blob) };
    zeichneCampBild();
    toast("Bild übernommen — es geht mit dem Speichern hoch.");
  } catch (e) {
    toast((e && e.message) || "Das Bild konnte nicht gelesen werden.", true);
  }
}

async function speichereCampAusDialog() {
  const c = campEntwurf;
  c.name = wert("c-name").trim();
  c.ort = wert("c-ort").trim();
  c.vonDatum = wert("c-von");
  c.bisDatum = wert("c-bis");
  c.taeglichVon = wert("c-zeitvon");
  c.taeglichBis = wert("c-zeitbis");
  c.jahrgangVon = zahlOderNull("c-jahrgangvon");
  c.jahrgangBis = zahlOderNull("c-jahrgangbis");
  c.plaetze = zahlOderNull("c-plaetze") || 0;
  c.preis = kommaNachCent(wert("c-preis"));
  c.preisFrueh = kommaNachCent(wert("c-preisfrueh"));
  c.preisFruehBis = wert("c-preisfruehbis");
  c.anmeldungVon = wert("c-anmvon");
  c.anmeldungBis = wert("c-anmbis");
  c.kurzbeschreibung = wert("c-kurz").trim();
  c.beschreibung = wert("c-beschreibung").trim();
  c.preishinweis = undefined;
  c.preisHinweis = wert("c-preishinweis").trim();
  c.zusatzfrage = wert("c-zusatzfrage").trim();

  // Nur das prüfen, was die App besser weiß als der Server (Reihenfolge der
  // Datumsangaben). Alles Weitere prüft der Worker — doppelt gehaltene
  // Regeln laufen früher oder später auseinander.
  if (!c.name) return toast("Das Camp braucht einen Namen.", true);
  if (!c.vonDatum || !c.bisDatum) return toast("Erster und letzter Tag fehlen.", true);
  if (c.bisDatum < c.vonDatum) return toast("Der letzte Tag liegt vor dem ersten.", true);
  if (c.anmeldungVon && c.anmeldungBis && c.anmeldungBis < c.anmeldungVon) return toast("Das Anmeldefenster endet vor seinem Beginn.", true);
  if (!c.plaetze) return toast("Wie viele Plätze hat das Camp?", true);

  await mitFehler(async () => {
    // ⚠️ Erst die Bilddatei, dann das Camp. Bricht es dazwischen ab, liegt
    // höchstens eine Bilddatei ohne Camp herum — ohne den passenden Camp-
    // Schlüssel ist sie gar nicht abrufbar. Andersherum stünde im Camp eine
    // Kennung ohne Datei, und auf der Vereinsseite erschiene ein kaputtes Bild.
    if (campBildNeu) {
      const bildId = campBildUuid();
      const daten = await campBildBlobZuBase64(campBildNeu.blob);
      await ladeBildHoch(bildId, campBildNeu.contentType, daten);
      c.bild = { id: bildId, contentType: campBildNeu.contentType };
    }
    const antwort = await speichereCamp(c);
    campBildZuruecksetzen();
    schliesse("camp-modal");
    await ladeUndZeichne();
    toast((antwort && antwort.tageGeaendert
      ? `Gespeichert. Die Camp-Tage wurden angepasst (${antwort.tageGeaendert}).`
      : "Gespeichert.") + kalenderZusatz(antwort));
  });
}

// ============================================================
//  Aufgaben (Jobs)
// ============================================================

function fuelleCampAuswahl() {
  const liste = sortierteCamps();
  ["jobs-camp", "teilnehmer-camp", "anm-camp"].forEach((id) => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const vorher = sel.value;
    sel.innerHTML = liste.map((c) => `<option value="${escapeAttr(c.id)}">${escapeHtml(c.name || "Ohne Namen")}</option>`).join("");
    // Die vorherige Auswahl gewinnt, solange es sie noch gibt — sonst springt der
    // Filter nach jedem Speichern auf das erste Camp zurück.
    if (vorher && liste.some((c) => c.id === vorher)) sel.value = vorher;
  });
}

function gewaehltesCamp(selId) { return findeCamp(document.getElementById(selId).value); }

function zeichneJobs() {
  const camp = gewaehltesCamp("jobs-camp");
  const gitterWrap = document.getElementById("jobs-gitter-wrap");
  const karten = document.getElementById("jobs-karten");
  const leer = document.getElementById("jobs-empty");
  const hinweis = document.getElementById("jobs-hinweis");

  if (!camp) {
    gitterWrap.innerHTML = ""; karten.innerHTML = "";
    leer.classList.remove("hidden");
    leer.textContent = "Es ist noch kein Camp angelegt.";
    hinweis.textContent = "";
    return;
  }

  const nurOffen = document.getElementById("jobs-nur-offen").checked;
  const tage = (camp.tage || []);
  const hatJobs = tage.some((t) => (t.jobs || []).length);

  leer.classList.toggle("hidden", hatJobs);
  leer.textContent = "Für dieses Camp ist noch keine Aufgabe angelegt.";
  hinweis.textContent = canEdit()
    ? "Ein Klick auf einen freien Platz trägt dich ein, ein Klick auf deinen Namen wieder aus. Anders als in der Spieltagscrew darfst du am selben Tag mehrere Aufgaben übernehmen."
    : "Zum Eintragen fehlt dir das Bearbeiten-Recht.";

  // Am Rechner das Gitter (Tage × Aufgaben), am Handy die Kartenliste. Welche
  // von beiden sichtbar ist, entscheidet die Medienabfrage in style.css — beide
  // werden immer gezeichnet, damit ein Drehen des Geräts nichts nachladen muss.
  gitterWrap.innerHTML = `<table class="gitter">${jobGitter(camp, nurOffen)}</table>`;
  karten.innerHTML = tage.map((t) => jobTagKarte(camp, t, nurOffen)).join("");

  verdrahteJobKlicks(camp);
}

// Spaltenköpfe sind die Aufgaben-NAMEN, nicht die einzelnen Job-Objekte: derselbe
// Job steht an fünf Tagen fünfmal mit eigener Id. Über den Namen fallen sie in
// eine Spalte zusammen, und man sieht auf einen Blick, an welchem Tag die
// Betreuung fehlt.
function jobGitter(camp, nurOffen) {
  const spalten = [];
  (camp.tage || []).forEach((t) => (t.jobs || []).forEach((j) => {
    if (!spalten.some((s) => s.name === j.name)) spalten.push({ name: j.name, von: j.von, bis: j.bis });
  }));
  if (!spalten.length) return "";

  const kopf = `<thead><tr><th class="spieltag-kopf">Tag</th>${spalten.map((s) =>
    `<th class="job-kopf">${escapeHtml(s.name)}<span class="jk-zeit">${escapeHtml(s.von || "")}–${escapeHtml(s.bis || "")}</span></th>`).join("")}</tr></thead>`;

  const zeilen = (camp.tage || []).map((t) => {
    const zellen = spalten.map((s) => {
      const job = (t.jobs || []).find((j) => j.name === s.name);
      if (!job) return `<td class="muted">—</td>`;
      if (nurOffen && (job.besetzung || []).length >= (job.anzahl || 1)) return `<td class="muted">✓</td>`;
      return `<td>${zelleInhalt(camp, t, job)}</td>`;
    }).join("");
    return `<tr><td class="spieltag-zelle"><strong>${wochentagKurz(t.datum)}</strong><br /><span class="muted">${datumDe(t.datum)}</span></td>${zellen}</tr>`;
  }).join("");

  return kopf + `<tbody>${zeilen}</tbody>`;
}

function zelleInhalt(camp, tag, job) {
  const soll = job.anzahl || 1;
  const bes = job.besetzung || [];
  const teile = bes.map((b) => `<button type="button" class="pz-name-btn" data-aus="${escapeAttr(camp.id)}|${escapeAttr(tag.datum)}|${escapeAttr(job.id)}|${escapeAttr(b.username || "")}|${escapeAttr(b.freierName || "")}" title="Austragen">${escapeHtml(besetzungName(b))}</button>`);
  for (let i = bes.length; i < soll; i++) {
    teile.push(`<button type="button" class="zelle-btn" data-ein="${escapeAttr(camp.id)}|${escapeAttr(tag.datum)}|${escapeAttr(job.id)}">frei</button>`);
  }
  return `<div class="zelle-namen">${teile.join("")}</div>`;
}

function jobTagKarte(camp, tag, nurOffen) {
  let jobs = (tag.jobs || []);
  if (nurOffen) jobs = jobs.filter((j) => (j.besetzung || []).length < (j.anzahl || 1));
  if (!jobs.length && nurOffen) return "";

  return `
  <div class="spieltag-karte">
    <div class="sk-kopf"><div class="sk-kopf-links">
      <div class="sk-titel">${wochentagLang(tag.datum)}</div>
      <div class="sk-sub">${datumDe(tag.datum)}</div>
    </div></div>
    <div class="sk-body">${jobs.map((j) => {
      const bes = j.besetzung || [];
      const soll = j.anzahl || 1;
      const voll = bes.length >= soll;
      return `
        <div class="posten-zeile ${voll ? "voll" : ""}">
          <div class="pz-links">
            <div class="pz-name">${escapeHtml(j.name)}</div>
            <div class="pz-zeit">${escapeHtml(j.von || "")}–${escapeHtml(j.bis || "")} · ${bes.length}/${soll}</div>
          </div>
          <div class="pz-rechts pz-besetzung">${zelleInhalt(camp, tag, j)}</div>
        </div>`;
    }).join("")}</div>
  </div>`;
}

function besetzungName(b) {
  if (b.freierName) return b.freierName + " *";
  return namen[b.username] || b.username || "?";
}

function verdrahteJobKlicks(camp) {
  const wurzel = document.getElementById("tab-jobs");

  wurzel.querySelectorAll("[data-ein]").forEach((b) => b.addEventListener("click", async () => {
    const [campId, datum, jobId] = b.dataset.ein.split("|");
    // Mit Administrieren-Recht fragt die App, WEN — sonst trägt sich der Klick
    // immer selbst ein. Ein Dialog, der nur eine Wahl hat, ist ein Klick zu viel.
    if (canAdmin()) { oeffnePersonDialog(campId, datum, jobId); return; }
    await mitFehler(async () => { await trageEin(campId, datum, jobId); await ladeUndZeichne(); toast("Eingetragen."); });
  }));

  wurzel.querySelectorAll("[data-aus]").forEach((b) => b.addEventListener("click", async () => {
    const [campId, datum, jobId, username, freierName] = b.dataset.aus.split("|");
    const fremd = (username && username !== me.username) || freierName;
    if (fremd && !canAdmin()) return toast("Fremde Einträge kann nur die Verwaltung entfernen.", true);
    if (fremd && !confirm("Diesen Eintrag wirklich entfernen?")) return;
    await mitFehler(async () => { await trageAus(campId, datum, jobId, username, freierName); await ladeUndZeichne(); toast("Ausgetragen."); });
  }));

  // Aufgabe bearbeiten hängt am NAMEN in der Kartenliste, nicht an der ganzen
  // Zeile: ein Fehlklick soll den Dialog nicht aufreißen, während daneben die
  // Plätze zum Eintragen liegen. Im Gitter gibt es diesen Weg nicht — dort ist
  // jede Zelle ein Eintrage-Knopf.
  if (canEdit()) {
    wurzel.querySelectorAll(".karten-wrap .pz-name").forEach((el) => {
      const zeile = el.closest(".posten-zeile");
      const karte = el.closest(".spieltag-karte");
      if (!zeile || !karte) return;
      // Datum und Job-Id stehen schon an den Eintrage-Knöpfen derselben Zeile —
      // von dort abgelesen statt ein zweites Mal in das HTML geschrieben.
      const marker = zeile.querySelector("[data-ein], [data-aus]");
      if (!marker) return;
      const teile = (marker.dataset.ein || marker.dataset.aus).split("|");
      el.style.cursor = "pointer";
      el.title = "Aufgabe bearbeiten";
      el.addEventListener("click", () => oeffneJobDialog(teile[0], teile[1], teile[2]));
    });
  }
  void camp;
}

// ---------- Aufgaben-Dialog ----------

function oeffneJobDialog(campId, datum, jobId) {
  const camp = findeCamp(campId) || gewaehltesCamp("jobs-camp");
  if (!camp) return toast("Erst ein Camp anlegen.", true);

  const tag = (camp.tage || []).find((t) => t.datum === datum) || (camp.tage || [])[0];
  const job = tag ? (tag.jobs || []).find((j) => j.id === jobId) : null;

  jobEntwurf = job
    ? { campId: camp.id, datum: tag.datum, job: JSON.parse(JSON.stringify(job)) }
    : { campId: camp.id, datum: tag ? tag.datum : "", job: { id: "", name: "", beschreibung: "", anzahl: 1, von: camp.taeglichVon || "09:00", bis: camp.taeglichBis || "16:00" } };

  document.getElementById("job-modal-titel").textContent = job ? "Aufgabe bearbeiten" : "Neue Aufgabe";
  setzeWert("j-name", jobEntwurf.job.name);
  setzeWert("j-beschreibung", jobEntwurf.job.beschreibung);
  setzeWert("j-anzahl", jobEntwurf.job.anzahl || 1);
  setzeWert("j-von", jobEntwurf.job.von);
  setzeWert("j-bis", jobEntwurf.job.bis);

  const tagSel = document.getElementById("j-tag");
  tagSel.innerHTML = (camp.tage || []).map((t) =>
    `<option value="${escapeAttr(t.datum)}"${t.datum === jobEntwurf.datum ? " selected" : ""}>${wochentagLang(t.datum)}, ${datumDe(t.datum)}</option>`).join("");

  document.getElementById("j-alletage").checked = false;
  // Beim Bearbeiten wäre „auf allen Tagen" mehrdeutig: es würde die vorhandenen
  // Aufgaben gleichen Namens überschreiben, statt neue anzulegen. Deshalb nur beim Anlegen.
  document.getElementById("j-alletage").parentElement.classList.toggle("hidden", !!job);
  document.getElementById("btn-job-loeschen").classList.toggle("hidden", !job);

  oeffne("job-modal");
}

async function speichereJobAusDialog() {
  const j = jobEntwurf.job;
  j.name = wert("j-name").trim();
  j.beschreibung = wert("j-beschreibung").trim();
  j.anzahl = zahlOderNull("j-anzahl") || 1;
  j.von = wert("j-von");
  j.bis = wert("j-bis");
  const datum = wert("j-tag");
  const alle = document.getElementById("j-alletage").checked;

  if (!j.name) return toast("Die Aufgabe braucht einen Namen.", true);

  await mitFehler(async () => {
    const antwort = await speichereJob(jobEntwurf.campId, datum, j, alle);
    schliesse("job-modal");
    await ladeUndZeichne();
    toast(alle && antwort && antwort.angelegt ? `Auf ${antwort.angelegt} Tagen angelegt.` : "Gespeichert.");
  });
}

// ---------- Person auf eine Aufgabe setzen ----------

async function oeffnePersonDialog(campId, datum, jobId) {
  personZiel = { campId, datum, jobId };
  setzeWert("p-freiername", "");

  const sel = document.getElementById("p-person");
  sel.innerHTML = `<option value="">— bitte wählen —</option>`;
  oeffne("person-modal");

  // Erst bei Bedarf laden, dafür einmal je Sitzung behalten.
  if (!helferListe.length) {
    try {
      const antwort = await ladeMoeglicheHelfer();
      helferListe = (antwort && antwort.users) || [];
    } catch (_) { helferListe = []; }
  }
  sel.innerHTML = `<option value="">— bitte wählen —</option>` +
    helferListe.map((u) => `<option value="${escapeAttr(u.username)}">${escapeHtml(u.displayName || u.username)}</option>`).join("");
  // Sich selbst einzutragen ist der häufigste Fall — also vorbelegen.
  if (helferListe.some((u) => u.username === me.username)) sel.value = me.username;
}

async function setzePerson() {
  const username = wert("p-person");
  const freierName = wert("p-freiername").trim();
  if (!username && !freierName) return toast("Person wählen oder einen Namen eintragen.", true);
  if (username && freierName) return toast("Entweder eine Person oder ein freier Name — nicht beides.", true);

  await mitFehler(async () => {
    await trageEin(personZiel.campId, personZiel.datum, personZiel.jobId, username, freierName);
    schliesse("person-modal");
    await ladeUndZeichne();
    toast("Eingetragen.");
  });
}

// ============================================================
//  Teilnehmer (Betreuer-Sicht)
// ============================================================

async function zeichneTeilnehmer() {
  const camp = gewaehltesCamp("teilnehmer-camp");
  const ziel = document.getElementById("teilnehmer-liste");
  const leer = document.getElementById("teilnehmer-empty");
  const hinweis = document.getElementById("teilnehmer-recht-hinweis");

  hinweis.innerHTML = canEdit()
    ? "Du siehst hier die verkürzte Liste, wie sie auch die Betreuer bekommen. Die vollständigen Angaben stehen unter <strong>Anmeldungen</strong>."
    : "Du siehst diese Liste, weil du an diesem Camp auf mindestens einer Aufgabe stehst. Sie enthält nur, was am Platz gebraucht wird — keine Anschrift und keinen Beitragsstand.";

  if (!camp) { ziel.innerHTML = ""; leer.classList.remove("hidden"); leer.textContent = "Es ist noch kein Camp angelegt."; return; }

  ziel.innerHTML = `<p class="muted">Wird geladen …</p>`;
  leer.classList.add("hidden");

  let antwort = teilnehmerCache[camp.id];
  if (!antwort) {
    try {
      antwort = await ladeTeilnehmer(camp.id);
      teilnehmerCache[camp.id] = antwort;
    } catch (e) {
      ziel.innerHTML = `<div class="hinweis">${escapeHtml(e && e.message ? e.message : "Die Liste konnte nicht geladen werden.")}</div>`;
      return;
    }
  }

  const liste = (antwort && antwort.teilnehmer) || [];
  leer.classList.toggle("hidden", liste.length > 0);
  if (!liste.length) { ziel.innerHTML = ""; return; }

  ziel.innerHTML = liste.map((t) => {
    const hinweise = [
      t.allergien ? "Allergien: " + t.allergien : "",
      t.medikamente ? "Medikamente: " + t.medikamente : "",
      t.krankheiten ? t.krankheiten : "",
      t.essenHinweis ? "Essen: " + t.essenHinweis : ""
    ].filter(Boolean);

    return `
      <div class="anm-zeile">
        <div class="anm-name">${escapeHtml(t.kindVorname || "")} ${escapeHtml(t.kindNachname || "")}
          <span class="an-sub">${t.geburtsdatum ? alterText(t.geburtsdatum) : "Alter unbekannt"}${t.elternTelefon ? " · Notfall: " + escapeHtml(t.elternTelefon) : ""}</span>
          ${hinweise.length ? `<span class="an-sub"><strong>${escapeHtml(hinweise.join(" · "))}</strong></span>` : ""}
        </div>
        <div class="anm-marker">
          ${hinweise.length ? `<span class="marker gesundheit">beachten</span>` : ""}
          ${heimwegMarker(t.alleinNachHause)}
        </div>
      </div>`;
  }).join("");
}

// Der Heimweg-Marker in der Teilnehmerliste der Betreuer.
//
// ⚠️ Alle drei Zustände bekommen ihre EIGENE Anzeige, und das ist der Grund für
// den Umbau vom Häkchen zur Ja/Nein-Frage: Beim Häkchen stand bei „nein" und bei
// „nicht ausgefüllt" gleichermaßen nichts da. Wer am letzten Camptag vor der
// Frage steht, ob ein Kind gehen darf, braucht den Unterschied zwischen „die
// Eltern haben nein gesagt" und „wir wissen es nicht".
//
// `true` kommt von Anmeldungen aus der Häkchen-Zeit.
function heimwegMarker(wert) {
  if (wert === "ja" || wert === true) return `<span class="marker">darf allein gehen</span>`;
  if (wert === "nein") return `<span class="marker">wird abgeholt</span>`;
  return `<span class="marker warn">Heimweg ungeklärt</span>`;
}

// ============================================================
//  Anmeldungen (Bearbeiten)
// ============================================================

function zeichneAnmeldungen() {
  if (!canEdit()) return;
  const camp = gewaehltesCamp("anm-camp");
  const ziel = document.getElementById("anm-liste");
  const leer = document.getElementById("anm-empty");
  const zus = document.getElementById("anm-zusammenfassung");

  if (!camp) { ziel.innerHTML = ""; zus.textContent = ""; leer.classList.remove("hidden"); leer.textContent = "Es ist noch kein Camp angelegt."; return; }

  const alle = camp.anmeldungen || [];
  const filter = document.getElementById("anm-status").value;
  const suche = wert("anm-suche").trim().toLowerCase();

  let liste = alle.filter((a) => {
    if (filter === "aktiv") return a.status !== "abgesagt";
    if (filter === "offen") return a.status === "angemeldet" && !a.bezahlt;
    if (filter === "alle") return true;
    return a.status === filter;
  });
  if (suche) liste = liste.filter((a) => kindName(a).toLowerCase().includes(suche) || String(a.elternName || "").toLowerCase().includes(suche));

  // Angemeldete nach Eingang, Warteliste nach ihrer Position — die Zahl, die den
  // Eltern genannt wurde, muss auch hier die Reihenfolge sein.
  liste.sort((a, b) => {
    const rang = { angemeldet: 0, warteliste: 1, abgesagt: 2 };
    const r = (rang[a.status] ?? 9) - (rang[b.status] ?? 9);
    if (r) return r;
    return (a.nummer || 0) - (b.nummer || 0);
  });

  const bezahlt = alle.filter((a) => a.status === "angemeldet" && a.bezahlt).length;
  const offen = offeneBeitraege(camp).length;
  // ⚠️ Je Anmeldung summieren, nicht Anzahl mal Camp-Preis: mit einem
  // Frühbucherfenster schuldet nicht mehr jeder dasselbe.
  const angemeldete = alle.filter((a) => a.status === "angemeldet");
  const summe = angemeldete.reduce((s, a) => s + anmBetrag(camp, a), 0);
  const eingegangen = angemeldete.filter((a) => a.bezahlt).reduce((s, a) => s + anmBetrag(camp, a), 0);
  zus.textContent = `${angemeldete.length} angemeldet · ${camp.warteliste || 0} auf der Warteliste · ${bezahlt} bezahlt, ${offen} offen · ${euro(eingegangen)} von ${euro(summe)} eingegangen`;

  leer.classList.toggle("hidden", liste.length > 0);
  ziel.innerHTML = liste.map((a) => anmZeile(camp, a)).join("");

  ziel.querySelectorAll("[data-anm-oeffnen]").forEach((b) =>
    b.addEventListener("click", () => oeffneAnmDialog(camp.id, b.dataset.anmOeffnen)));
  ziel.querySelectorAll("[data-anm-bezahlt]").forEach((b) =>
    b.addEventListener("click", () => hakeBezahlt(camp.id, b.dataset.anmBezahlt, b.dataset.wert === "1")));
  ziel.querySelectorAll("[data-anm-nachruecken]").forEach((b) =>
    b.addEventListener("click", () => nachruecken(camp, b.dataset.anmNachruecken)));
}

function anmZeile(camp, a) {
  const klassen = ["anm-zeile", a.status === "warteliste" ? "warteliste" : "", a.status === "abgesagt" ? "abgesagt" : "", a.elternAenderung ? "neu-geaendert" : ""].filter(Boolean).join(" ");
  const gesund = [a.allergien, a.medikamente, a.krankheiten, a.essenHinweis].some(Boolean);
  const frei = Math.max(0, (camp.plaetze || 0) - (camp.belegt || 0));

  return `
  <div class="${klassen}">
    <div class="anm-name">${escapeHtml(kindName(a))}
      <span class="an-sub">${a.geburtsdatum ? alterText(a.geburtsdatum) + " · " : ""}${escapeHtml(a.elternName || "")}${a.elternEmail ? " · " + escapeHtml(a.elternEmail) : ""}</span>
      <span class="an-sub">angemeldet am ${datumDe(a.erstelltAm)}${a.status === "warteliste" ? ` · Warteliste Platz ${a.wartePlatz || "?"}` : ""}</span>
    </div>
    <div class="anm-marker">
      ${a.elternAenderung ? `<span class="marker warteliste"${a.elternAenderung === "geaendert" && Array.isArray(a.elternAenderungFelder) && a.elternAenderungFelder.length
        ? ` title="${escapeAttr(a.elternAenderungFelder.map(feldLabel).join(", "))}"` : ""}>${a.elternAenderung === "abgesagt" ? "Eltern haben abgesagt" : "von Eltern geändert"}</span>` : ""}
      ${gesund ? `<span class="marker gesundheit">Gesundheit</span>` : ""}
      ${a.status === "warteliste" ? `<span class="marker warteliste">Warteliste</span>` : ""}
      ${a.status === "abgesagt" ? `<span class="marker">abgesagt</span>` : ""}
      ${a.status === "angemeldet" ? (a.bezahlt ? `<span class="marker bezahlt">bezahlt</span>` : `<span class="marker offen">Beitrag offen</span>`) : ""}
    </div>
    <div class="anm-aktionen">
      ${a.status === "angemeldet" ? `<button type="button" class="btn tiny ${a.bezahlt ? "ghost" : "success"}" data-anm-bezahlt="${escapeAttr(a.id)}" data-wert="${a.bezahlt ? "0" : "1"}">${a.bezahlt ? "nicht bezahlt" : "bezahlt"}</button>` : ""}
      ${a.status === "warteliste" && frei > 0 ? `<button type="button" class="btn tiny success" data-anm-nachruecken="${escapeAttr(a.id)}">nachrücken</button>` : ""}
      <button type="button" class="btn tiny ghost" data-anm-oeffnen="${escapeAttr(a.id)}">ansehen</button>
    </div>
  </div>`;
}

async function hakeBezahlt(campId, anmeldungId, bezahlt) {
  const camp = findeCamp(campId);
  const a = (camp.anmeldungen || []).find((x) => x.id === anmeldungId);
  if (!a) return;
  await mitFehler(async () => {
    await speichereAnmeldung(campId, { id: anmeldungId, bezahlt });
    await ladeUndZeichne();
    toast(bezahlt ? "Als bezahlt vermerkt." : "Haken entfernt.");
  });
}

async function nachruecken(camp, anmeldungId) {
  const a = (camp.anmeldungen || []).find((x) => x.id === anmeldungId);
  if (!a) return;
  if (!confirm(`${kindName(a)} von der Warteliste auf einen freien Platz nachrücken lassen?\n\nDie Eltern bekommen die Zusage per Mail, mit den Zahlungsangaben.`)) return;
  await mitFehler(async () => {
    const antwort = await rueckeNach(camp.id, anmeldungId);
    await ladeUndZeichne();
    toast(antwort && antwort.sent === false
      ? "Nachgerückt — die Zusage-Mail ging aber nicht raus. Bitte selbst Bescheid geben."
      : "Nachgerückt, Zusage ist verschickt.");
  });
}

function oeffneAnmDialog(campId, anmeldungId) {
  const camp = findeCamp(campId);
  const a = (camp.anmeldungen || []).find((x) => x.id === anmeldungId);
  if (!a) return;
  anmEntwurf = { campId, id: anmeldungId };

  document.getElementById("anm-modal-titel").textContent = kindName(a);
  document.getElementById("anm-modal-body").innerHTML = anmDetails(camp, a);

  document.getElementById("btn-anm-absagen").classList.toggle("hidden", a.status === "abgesagt");
  document.getElementById("btn-anm-loeschen").classList.toggle("hidden", !canAdmin());
  oeffne("anm-modal");
}

function anmDetails(camp, a) {
  const zeilen = [];
  const zeile = (label, wert) => { if (wert !== "" && wert !== null && wert !== undefined && wert !== false) zeilen.push(`<div class="detail-zeile"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(String(wert))}</dd></div>`); };

  zeile("Status", a.status === "warteliste" ? `Warteliste, Platz ${a.wartePlatz || "?"}` : (a.status === "abgesagt" ? "abgesagt" + (a.absageGrund ? " — " + a.absageGrund : "") : "angemeldet"));
  zeile("Anmeldung eingegangen", datumZeitDe(a.erstelltAm));
  if (a.geaendertAm) zeile("Zuletzt geändert", datumZeitDe(a.geaendertAm));

  FELD_GRUPPEN.forEach((g) => {
    const felder = FORMULAR_FELDER.filter((f) => f.gruppe === g.id && a[f.id] !== undefined && a[f.id] !== "" && a[f.id] !== false);
    if (!felder.length) return;
    zeilen.push(`<h3>${escapeHtml(g.label)}</h3>`);
    felder.forEach((f) => zeile(f.label, f.typ === "haken" ? "ja" : a[f.id]));
  });

  if (camp.zusatzfrage && a.zusatzantwort) {
    zeilen.push(`<h3>Zusatzfrage</h3>`);
    zeile(camp.zusatzfrage, a.zusatzantwort);
  }

  const vz = verwendungszweck(camp, a);
  zeilen.push(`<h3>Beitrag</h3>`);
  zeile("Betrag", euro(anmBetrag(camp, a)) +
    (camp.preisFrueh && anmBetrag(camp, a) === camp.preisFrueh ? " (Frühbucher)" : ""));
  zeile("Verwendungszweck", vz);
  zeile("Bezahlt", a.bezahlt ? "ja, vermerkt am " + datumDe(a.bezahltAm) : "nein");

  // Der Nachweis, worauf sich diese Familie eingelassen hat. Ein Eintrag ohne
  // `agbAm` stammt aus der Zeit vor den Teilnahmebedingungen — das steht dann
  // ausdrücklich da, statt die Zeile wegzulassen: eine fehlende Zeile liest sich
  // wie „nicht nachgeschaut", nicht wie „gab es damals nicht".
  zeilen.push(`<h3>Teilnahmebedingungen</h3>`);
  if (a.agbAm) {
    const aktuell = daten && daten.einstellungen && a.agbStand === daten.einstellungen.agbStand;
    zeile("Anerkannt am", datumZeitDe(a.agbAm) + (aktuell ? " (aktuelle Fassung)" : " (frühere Fassung, siehe Verwaltung)"));
  } else {
    zeile("Anerkannt am", "nicht erfasst — diese Anmeldung stammt aus der Zeit vor den Teilnahmebedingungen");
  }

  return `
    ${zeilen.join("")}
    <h3>Ändern</h3>
    <label class="inline-check"><input type="checkbox" id="ad-bezahlt" ${a.bezahlt ? "checked" : ""} /> Beitrag ist eingegangen</label>
    <label class="voll" style="margin-top:12px;">Interne Notiz <span class="muted">(sehen nur Bearbeiter, nie die Eltern)</span>
      <textarea id="ad-notiz" rows="2" maxlength="600">${escapeHtml(a.notiz || "")}</textarea>
    </label>`;
}

async function speichereAnmAusDialog() {
  await mitFehler(async () => {
    await speichereAnmeldung(anmEntwurf.campId, {
      id: anmEntwurf.id,
      bezahlt: document.getElementById("ad-bezahlt").checked,
      notiz: wert("ad-notiz")
    });
    schliesse("anm-modal");
    await ladeUndZeichne();
    toast("Gespeichert.");
  });
}

// ============================================================
//  Verwaltung
// ============================================================

// ---------- Schloss an der Kontoverbindung ----------

// Sperrt oder öffnet die vier Kontofelder. `zurueck` setzt beim Zusperren die
// gespeicherten Werte wieder ein — sonst bliebe eine halb getippte IBAN im Feld
// stehen und sähe aus, als wäre sie gespeichert.
function setzeKontoSchloss(frei, zurueck) {
  kontoFrei = !!frei;
  KONTO_FELDER.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.readOnly = !kontoFrei;
  });
  const zeile = document.getElementById("konto-schloss");
  const status = document.getElementById("konto-schloss-status");
  const knopf = document.getElementById("btn-konto-freigeben");
  if (zeile) zeile.classList.toggle("offen", kontoFrei);
  if (status) {
    status.textContent = kontoFrei
      ? "🔓 Freigegeben — Änderungen werden mit dem nächsten Speichern übernommen."
      : "🔒 Gesperrt — die Felder lassen sich erst nach einer Freigabe ändern.";
  }
  if (knopf) knopf.textContent = kontoFrei ? "Freigabe zurücknehmen" : "Zum Ändern freigeben";
  if (!kontoFrei && zurueck) fuelleKontofelder();
}

function fuelleKontofelder() {
  const e = (daten && daten.einstellungen) || {};
  setzeWert("e-kontoinhaber", e.kontoinhaber || "");
  setzeWert("e-iban", e.iban || "");
  setzeWert("e-bic", e.bic || "");
  setzeWert("e-bank", e.bank || "");
}

function kontoFreigabeUmschalten() {
  if (kontoFrei) return setzeKontoSchloss(false, true);
  const ok = confirm(
    "Kontoverbindung zum Ändern freigeben?\n\n"
    + "Diese Angaben stehen in JEDER Bestätigungsmail an die Eltern und auf der "
    + "Bestätigungsseite. Eine falsche IBAN leitet die Beiträge auf ein fremdes Konto.\n\n"
    + "Bereits verschickte Mails ändern sich nicht — wer die alte IBAN bekommen hat, "
    + "überweist weiter dorthin.\n\n"
    + "Nur freigeben, wenn du die neue Kontoverbindung schriftlich vorliegen hast."
  );
  if (ok) setzeKontoSchloss(true);
}

// IBAN-Prüfung mit Prüfziffer (Modulo 97, ISO 13616), nicht nur nach Form.
//
// ⚠️ Das ist der eigentliche Schutz. Die reine Formprüfung (zwei Buchstaben,
// dann Ziffern und Buchstaben) lässt jeden Zahlendreher durch — und genau der
// ist der Fall, der hier passiert und Geld kostet. Die Prüfziffer fängt ihn.
//
// ⚠️ Schrittweise Modulo statt einer großen Zahl: eine 34-stellige IBAN wird als
// Zahl länger, als Number sicher rechnen kann, und BigInt gibt es auf den alten
// iPhones in der Flotte nicht ([[f-alte-ios]]).
function ibanPruefzifferOk(iban) {
  const um = iban.slice(4) + iban.slice(0, 4);
  let rest = 0;
  for (let i = 0; i < um.length; i++) {
    const z = um.charAt(i);
    const stelle = z >= "0" && z <= "9" ? z : String(z.charCodeAt(0) - 55);
    for (let k = 0; k < stelle.length; k++) rest = (rest * 10 + Number(stelle.charAt(k))) % 97;
  }
  return rest === 1;
}

function fuelleVerwaltung() {
  if (!canAdmin()) return;
  const e = (daten && daten.einstellungen) || DEFAULT_EINSTELLUNGEN;
  // ⚠️ Nach jedem Neuzeichnen wieder zugesperrt — und ladeUndZeichne() läuft
  // nach jedem Speichern. Die Freigabe gilt damit für genau einen
  // Speichervorgang und nicht für den Rest des Tages.
  fuelleKontofelder();
  setzeKontoSchloss(false);
  setzeWert("e-kontaktname", e.kontaktName || "");
  setzeWert("e-kontaktemail", e.kontaktEmail || "");
  document.getElementById("e-starterinnerung").checked = e.startErinnerung !== false;
  setzeWert("e-starterinnerungtage", e.startErinnerungTage || 3);
  document.getElementById("e-zahlerinnerung").checked = e.zahlErinnerung !== false;
  setzeWert("e-zahlerinnerungtage", e.zahlErinnerungTage || 14);
  setzeWert("e-aufraeumen", e.aufraeumenNachMonaten || 6);

  const lauf = daten && daten.lauf;
  document.getElementById("lauf-info").textContent = lauf && lauf.zuletztAm
    ? `Letzter nächtlicher Lauf: ${datumZeitDe(lauf.zuletztAm)} — ${lauf.ergebnis || "ohne Meldung"}`
    : "Der nächtliche Lauf ist noch nicht gelaufen.";

  // Der Server schickt hier den WIRKSAMEN Text — auch dann, wenn noch nichts
  // gespeichert wurde und die eingebaute Vorgabe gilt. Ein leeres Feld sähe aus,
  // als gäbe es gar keine Bedingungen.
  setzeWert("e-agb", e.agbText || "");
  document.getElementById("agb-vorgabe-hinweis").classList.toggle("hidden", !e.agbIstVorgabe);
  zeichneAgbArchiv();

  zeichneKatalog();
  document.getElementById("einbau-code").value = einbauCode();
}

// Die abgelösten Fassungen. Aufgehoben werden nur die, denen noch eine bestehende
// Anmeldung zugestimmt hat — deshalb ist die Liste meistens leer, und das ist
// kein Fehler.
function zeichneAgbArchiv() {
  const archiv = (daten && daten.agbArchiv) || [];
  const block = document.getElementById("agb-archiv-block");
  block.classList.toggle("hidden", !archiv.length);
  if (!archiv.length) return;

  document.getElementById("agb-archiv-liste").innerHTML = archiv.map((a) => `
    <details class="agb-fassung">
      <summary>Fassung bis ${escapeHtml(datumZeitDe(a.abgeloestAm) || "unbekannt")}</summary>
      <pre class="agb-alt">${escapeHtml(a.text || "")}</pre>
    </details>`).join("");
}

function zeichneKatalog() {
  const ziel = document.getElementById("katalog-liste");
  const katalog = (daten && daten.jobKatalog) || [];
  document.getElementById("btn-katalog-vorschlag").classList.toggle("hidden", katalog.length > 0);

  ziel.innerHTML = katalog.map((j, i) => `
    <div class="job-row" data-i="${i}">
      <input type="text" data-k="name" maxlength="80" value="${escapeAttr(j.name || "")}" />
      <input type="text" data-k="beschreibung" maxlength="200" value="${escapeAttr(j.beschreibung || "")}" />
      <input type="number" data-k="anzahl" min="1" max="50" value="${j.anzahl || 1}" />
      <input type="time" data-k="von" value="${escapeAttr(j.von || "")}" />
      <input type="time" data-k="bis" value="${escapeAttr(j.bis || "")}" />
      <button type="button" class="icon-btn" data-katalog-weg="${i}" title="Zeile entfernen">✕</button>
    </div>`).join("");

  ziel.querySelectorAll("[data-katalog-weg]").forEach((b) => b.addEventListener("click", () => {
    daten.jobKatalog.splice(Number(b.dataset.katalogWeg), 1);
    zeichneKatalog();
  }));
  ziel.querySelectorAll("input[data-k]").forEach((inp) => inp.addEventListener("input", () => {
    const i = Number(inp.closest(".job-row").dataset.i);
    const feld = inp.dataset.k;
    daten.jobKatalog[i][feld] = feld === "anzahl" ? (Number(inp.value) || 1) : inp.value;
  }));
}

// Der Schnipsel für die Vereins-Homepage. Ein einziges <script>-Tag: welches Camp
// erscheint, holt es sich zur Laufzeit vom Worker — die Homepage muss deshalb
// nach dem Einbau nie wieder angefasst werden.
function einbauCode() {
  return `<script src="${APP_URL}popup.js" async><\/script>`;
}

async function speichereVerwaltung() {
  // ⚠️ Gesperrte Kontofelder werden NICHT aus der Maske gelesen, sondern aus dem
  // zuletzt geladenen Stand übernommen. Sonst hinge die Kontoverbindung an dem,
  // was gerade im readonly-Feld steht — und das ist nach einem Rechteverlust
  // leer, weil raeumeWasNichtMehrErlaubtIst alle Felder unter Verwaltung leert.
  // Ein Speichern hätte die IBAN dann stillschweigend gelöscht.
  const kontoAlt = (daten && daten.einstellungen) || {};
  const konto = kontoFrei
    ? {
        kontoinhaber: wert("e-kontoinhaber").trim(),
        iban: wert("e-iban").replace(/\s+/g, "").toUpperCase(),
        bic: wert("e-bic").trim().toUpperCase(),
        bank: wert("e-bank").trim()
      }
    : {
        kontoinhaber: kontoAlt.kontoinhaber || "",
        iban: kontoAlt.iban || "",
        bic: kontoAlt.bic || "",
        bank: kontoAlt.bank || ""
      };

  const e = {
    kontoinhaber: konto.kontoinhaber,
    iban: konto.iban,
    bic: konto.bic,
    bank: konto.bank,
    kontaktName: wert("e-kontaktname").trim(),
    kontaktEmail: wert("e-kontaktemail").trim(),
    agbText: wert("e-agb"),
    startErinnerung: document.getElementById("e-starterinnerung").checked,
    startErinnerungTage: zahlOderNull("e-starterinnerungtage") || 3,
    zahlErinnerung: document.getElementById("e-zahlerinnerung").checked,
    zahlErinnerungTage: zahlOderNull("e-zahlerinnerungtage") || 14,
    aufraeumenNachMonaten: zahlOderNull("e-aufraeumen") || 6
  };
  if (e.iban && !/^[A-Z]{2}[0-9A-Z]{13,32}$/.test(e.iban)) return toast("Die IBAN sieht nicht richtig aus.", true);
  // ⚠️ Die Form allein sagt nichts. Ein Zahlendreher sieht formal einwandfrei aus
  // und ist genau der Fehler, der hier passiert. Die Prüfziffer fängt ihn.
  if (e.iban && !ibanPruefzifferOk(e.iban)) {
    return toast("Diese IBAN gibt es so nicht — die Prüfziffer passt nicht. Bitte Stelle für Stelle vergleichen.", true);
  }

  // Eine geänderte Kontoverbindung wird nicht nebenbei mitgespeichert: einmal
  // alt gegen neu gegenüberstellen. Gleiches Muster wie bei den
  // Teilnahmebedingungen weiter unten.
  if (kontoFrei) {
    const vorher = [kontoAlt.kontoinhaber || "", kontoAlt.iban || "", kontoAlt.bic || "", kontoAlt.bank || ""].join("|");
    const nachher = [e.kontoinhaber, e.iban, e.bic, e.bank].join("|");
    if (vorher !== nachher) {
      const zeile = (a, b) => (a === b ? "  " + (b || "(leer)") : "  " + (a || "(leer)") + "\n  ⟶ " + (b || "(leer)"));
      const ok = confirm(
        "Kontoverbindung wirklich ändern?\n\n"
        + "Kontoinhaber:\n" + zeile(kontoAlt.kontoinhaber || "", e.kontoinhaber) + "\n\n"
        + "IBAN:\n" + zeile(kontoAlt.iban || "", e.iban) + "\n\n"
        + "BIC:\n" + zeile(kontoAlt.bic || "", e.bic) + "\n\n"
        + "Bank:\n" + zeile(kontoAlt.bank || "", e.bank) + "\n\n"
        + "Ab dem Speichern steht die neue Verbindung in jeder neuen Bestätigungsmail. "
        + "Schon verschickte Mails ändern sich nicht."
      );
      if (!ok) return;
    }
  }
  if (e.kontaktEmail && !e.kontaktEmail.includes("@")) return toast("Die Kontakt-E-Mail sieht nicht richtig aus.", true);

  // Eine Änderung an den Bedingungen ist kein Nebenbei-Speichern: sie verlangt
  // von allen Eltern, die ihre Anmeldung später noch anfassen, eine neue
  // Zustimmung. Deshalb einmal nachfragen — aber nur, wenn sich der Text
  // wirklich geändert hat.
  const agbAlt = String((daten && daten.einstellungen && daten.einstellungen.agbText) || "").trim();
  if (e.agbText.trim() !== agbAlt) {
    if (!e.agbText.trim()) {
      return toast("Die Teilnahmebedingungen dürfen nicht leer sein — ohne sie kann sich niemand anmelden.", true);
    }
    if (!confirm("Die Teilnahmebedingungen wurden geändert.\n\nFür bestehende Anmeldungen bleibt die bisherige Fassung gültig — sie ist weiter nachlesbar.\nEltern, die ihre Anmeldung danach über den Link aus der Mail ändern, müssen der neuen Fassung einmal zustimmen.\n\nSpeichern?")) return;
  }

  await mitFehler(async () => {
    await speichereEinstellungen(e);
    await speichereKatalog((daten && daten.jobKatalog) || []);
    await ladeUndZeichne();
    toast("Gespeichert.");
  });
}

// ============================================================
//  Bedienung verdrahten
// ============================================================

function verdrahteBedienung() {
  document.querySelectorAll("nav button[data-tab]").forEach((b) =>
    b.addEventListener("click", () => zeigeTab(b.dataset.tab)));

  document.getElementById("btn-camp-neu").addEventListener("click", () => oeffneCampDialog(null));
  document.getElementById("btn-camp-speichern").addEventListener("click", speichereCampAusDialog);
  // ⚠️ Abbrechen räumt das eben gewählte Bild mit weg. Ohne das hinge es am
  // nächsten geöffneten Camp und ginge dort beim Speichern mit hoch.
  document.getElementById("btn-camp-abbrechen").addEventListener("click", () => {
    campBildZuruecksetzen();
    schliesse("camp-modal");
  });

  // Das Dateifeld selbst ist versteckt — ein unformatiertes <input type="file">
  // sähe zwischen den übrigen Knöpfen aus wie ein Fremdkörper.
  document.getElementById("btn-camp-bild-waehlen").addEventListener("click", () => {
    document.getElementById("c-bild-datei").click();
  });
  document.getElementById("c-bild-datei").addEventListener("change", (ev) => {
    campBildGewaehlt(ev.target.files && ev.target.files[0]);
  });
  document.getElementById("btn-camp-bild-weg").addEventListener("click", () => {
    campBildZuruecksetzen();
    // Wirksam wird das Entfernen erst beim Speichern — bis dahin liegt das alte
    // Bild unverändert in Nextcloud, und Abbrechen nimmt alles zurück.
    if (campEntwurf) campEntwurf.bild = null;
    zeichneCampBild();
  });
  document.getElementById("btn-camp-loeschen").addEventListener("click", async () => {
    if (!campEntwurf || !campEntwurf.id) return;
    if (!confirm(`„${campEntwurf.name}" wirklich löschen?`)) return;
    await mitFehler(async () => {
      await loescheCamp(campEntwurf.id);
      schliesse("camp-modal");
      await ladeUndZeichne();
      toast("Gelöscht.");
    });
  });

  document.getElementById("jobs-camp").addEventListener("change", zeichneJobs);
  document.getElementById("jobs-nur-offen").addEventListener("change", zeichneJobs);
  document.getElementById("btn-job-neu").addEventListener("click", () => oeffneJobDialog(document.getElementById("jobs-camp").value, "", ""));
  document.getElementById("btn-job-speichern").addEventListener("click", speichereJobAusDialog);
  document.getElementById("btn-job-abbrechen").addEventListener("click", () => schliesse("job-modal"));
  document.getElementById("btn-job-loeschen").addEventListener("click", async () => {
    if (!jobEntwurf || !jobEntwurf.job.id) return;
    if (!confirm("Diese Aufgabe wirklich löschen?")) return;
    await mitFehler(async () => {
      await loescheJob(jobEntwurf.campId, jobEntwurf.datum, jobEntwurf.job.id);
      schliesse("job-modal");
      await ladeUndZeichne();
      toast("Gelöscht.");
    });
  });
  document.getElementById("btn-jobs-drucken").addEventListener("click", () => window.print());

  document.getElementById("btn-person-setzen").addEventListener("click", setzePerson);
  document.getElementById("btn-person-abbrechen").addEventListener("click", () => schliesse("person-modal"));

  document.getElementById("teilnehmer-camp").addEventListener("change", zeichneTeilnehmer);
  document.getElementById("btn-teilnehmer-drucken").addEventListener("click", () => window.print());

  ["anm-camp", "anm-status"].forEach((id) => document.getElementById(id).addEventListener("change", zeichneAnmeldungen));
  document.getElementById("anm-suche").addEventListener("input", zeichneAnmeldungen);
  document.getElementById("btn-anm-speichern").addEventListener("click", speichereAnmAusDialog);
  document.getElementById("btn-anm-abbrechen").addEventListener("click", () => schliesse("anm-modal"));
  document.getElementById("btn-anm-absagen").addEventListener("click", async () => {
    const grund = prompt("Grund der Absage (steht nur intern, geht nicht an die Eltern):", "");
    if (grund === null) return;
    await mitFehler(async () => {
      await sageAb(anmEntwurf.campId, anmEntwurf.id, grund);
      schliesse("anm-modal");
      await ladeUndZeichne();
      toast("Abgesagt. Der Platz ist frei — nachrücken lassen musst du selbst.");
    });
  });
  document.getElementById("btn-anm-loeschen").addEventListener("click", async () => {
    if (!confirm("Diese Anmeldung endgültig löschen?\n\nDamit sind auch die Angaben der Eltern weg. Das lässt sich nicht rückgängig machen.")) return;
    await mitFehler(async () => {
      await loescheAnmeldung(anmEntwurf.campId, anmEntwurf.id);
      schliesse("anm-modal");
      await ladeUndZeichne();
      toast("Gelöscht.");
    });
  });
  document.getElementById("btn-anm-export").addEventListener("click", exportiereAnmeldungen);
  document.getElementById("btn-anm-drucken").addEventListener("click", () => window.print());
  document.getElementById("btn-anm-zahlerinnerung").addEventListener("click", async () => {
    const camp = gewaehltesCamp("anm-camp");
    if (!camp) return;
    const wie = offeneBeitraege(camp).length;
    if (!wie) return toast("Es ist kein Beitrag offen.");
    if (!confirm(`Zahlungserinnerung an ${wie} Familie${wie === 1 ? "" : "n"} verschicken?`)) return;
    await mitFehler(async () => {
      const antwort = await erinnereJetzt(camp.id, "zahlung");
      toast(`Verschickt: ${(antwort && antwort.gesendet) || 0}.`);
    });
  });

  document.getElementById("btn-katalog-neu").addEventListener("click", () => {
    if (!daten.jobKatalog) daten.jobKatalog = [];
    daten.jobKatalog.push({ id: "", name: "", beschreibung: "", anzahl: 1, von: "09:00", bis: "16:00" });
    zeichneKatalog();
  });
  document.getElementById("btn-katalog-vorschlag").addEventListener("click", () => {
    daten.jobKatalog = DEFAULT_JOBS.map((j) => Object.assign({ id: "" }, j));
    zeichneKatalog();
    toast("Vorschlag übernommen — noch nicht gespeichert.");
  });
  document.getElementById("btn-einstellungen-speichern").addEventListener("click", speichereVerwaltung);
  document.getElementById("btn-konto-freigeben").addEventListener("click", kontoFreigabeUmschalten);
  document.getElementById("btn-code-kopieren").addEventListener("click", () => kopiere(einbauCode(), "Schnipsel kopiert."));
  document.getElementById("btn-popup-vorschau").addEventListener("click", () => window.open(APP_URL + "popup-vorschau.html", "_blank", "noopener"));
  document.getElementById("btn-test-start").addEventListener("click", async () => {
    await mitFehler(async () => { const a = await erinnereJetzt("", "start"); toast(`Verschickt: ${(a && a.gesendet) || 0}.`); });
  });
  document.getElementById("btn-test-zahlung").addEventListener("click", async () => {
    await mitFehler(async () => { const a = await erinnereJetzt("", "zahlung"); toast(`Verschickt: ${(a && a.gesendet) || 0}.`); });
  });

  // Klick auf den dunklen Rand schließt den Dialog — aber nur dort, nicht auf
  // dem Dialog selbst.
  document.querySelectorAll(".modal-overlay").forEach((ov) =>
    ov.addEventListener("click", (ev) => { if (ev.target === ov) ov.classList.add("hidden"); }));
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") document.querySelectorAll(".modal-overlay:not(.hidden)").forEach((ov) => ov.classList.add("hidden"));
  });
}

// Export als Excel-Datei. Bewusst als echte .xls-Tabelle im HTML-Format statt als
// CSV: Excel öffnet CSV je nach Ländereinstellung mit Semikolon oder Komma, und
// Umlaute kippen ohne BOM. Diese Fassung öffnet überall gleich.
function exportiereAnmeldungen() {
  const camp = gewaehltesCamp("anm-camp");
  if (!camp) return;
  const liste = (camp.anmeldungen || []).filter((a) => a.status !== "abgesagt");
  if (!liste.length) return toast("Keine Anmeldung zum Ausgeben.");

  const spalten = FORMULAR_FELDER.filter((f) => (camp.felder || {})[f.id] !== "aus" || f.fest);
  const kopf = ["Nr", "Status", "Bezahlt", "Verwendungszweck"].concat(spalten.map((f) => f.label));
  const zeilen = liste.map((a) => [
    a.nummer || "", a.status === "warteliste" ? "Warteliste" : "angemeldet", a.bezahlt ? "ja" : "nein", verwendungszweck(camp, a)
  ].concat(spalten.map((f) => {
    const v = a[f.id];
    if (f.typ === "haken") return v ? "ja" : "nein";
    return v === undefined || v === null ? "" : String(v);
  })));

  const tabelle = `<table><tr>${kopf.map((k) => `<th>${escapeHtml(k)}</th>`).join("")}</tr>` +
    zeilen.map((z) => `<tr>${z.map((c) => `<td>${escapeHtml(String(c))}</td>`).join("")}</tr>`).join("") + `</table>`;
  const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8" /></head><body>${tabelle}</body></html>`;

  const blob = new Blob(["﻿" + html], { type: "application/vnd.ms-excel" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Anmeldungen ${camp.name || "Camp"}.xls`.replace(/[\\/:*?"<>|]/g, "-");
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ============================================================
//  Kleine Helfer
// ============================================================

function wert(id) { const el = document.getElementById(id); return el ? el.value : ""; }
function setzeWert(id, v) { const el = document.getElementById(id); if (el) el.value = v === null || v === undefined ? "" : v; }
function zahlOderNull(id) { const v = Number(wert(id)); return Number.isFinite(v) && v !== 0 ? v : (wert(id) === "0" ? 0 : null); }
function oeffne(id) { document.getElementById(id).classList.remove("hidden"); }
function schliesse(id) { document.getElementById(id).classList.add("hidden"); }

function kindName(a) { return `${a.kindVorname || ""} ${a.kindNachname || ""}`.trim() || "Ohne Namen"; }

// Der Verwendungszweck steht in der Mail, auf der Bestätigungsseite und im
// Export. ⚠️ Muss zeichengenau zu fcVerwendungszweck() im Worker passen — sonst
// steht auf dem Kontoauszug etwas anderes als in der Liste, und der Abgleich
// von Hand wird zur Sucharbeit.
function verwendungszweck(camp, a) {
  return `${camp.name || "Camp"}, ${kindName(a)}`.slice(0, 140);
}

function euro(cent) {
  const c = Number(cent) || 0;
  return (c / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

// "60,00" und "60.00" und "60" führen alle zu 6000 Cent.
function kommaNachCent(text) {
  const s = String(text || "").replace(/\s|€/g, "").replace(",", ".");
  const v = Number(s);
  if (!Number.isFinite(v) || v < 0) return 0;
  return Math.round(v * 100);
}
function centNachKomma(cent) { return ((Number(cent) || 0) / 100).toFixed(2).replace(".", ","); }

function heuteIso() { return new Date().toLocaleDateString("sv-SE"); }

function datumDe(iso) {
  if (!iso) return "";
  const t = String(iso).slice(0, 10).split("-");
  return t.length === 3 ? `${t[2]}.${t[1]}.${t[0]}` : String(iso);
}

function datumZeitDe(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return datumDe(iso);
  return d.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function datumBereich(von, bis) {
  if (!von) return "";
  if (!bis || bis === von) return datumDe(von);
  return `${datumDe(von)} – ${datumDe(bis)}`;
}

const WOCHENTAGE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
function wochentagLang(iso) { const d = new Date(iso + "T12:00:00"); return isNaN(d.getTime()) ? "" : WOCHENTAGE[d.getDay()]; }
function wochentagKurz(iso) { return wochentagLang(iso).slice(0, 2); }

// Das Alter AM ERSTEN CAMPTAG wäre genauer, ist aber ohne Camp-Bezug nicht zu
// haben — hier steht das heutige Alter, und das reicht für die Gruppeneinteilung.
function alterText(geburtsdatum) {
  const d = new Date(String(geburtsdatum) + "T12:00:00");
  if (isNaN(d.getTime())) return "";
  const heute = new Date();
  let jahre = heute.getFullYear() - d.getFullYear();
  const m = heute.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && heute.getDate() < d.getDate())) jahre--;
  return `${jahre} Jahre`;
}

function jahrgangText(c) {
  if (c.jahrgangVon && c.jahrgangBis) return `Jahrgänge ${c.jahrgangVon}–${c.jahrgangBis}`;
  if (c.jahrgangVon) return `ab Jahrgang ${c.jahrgangVon}`;
  if (c.jahrgangBis) return `bis Jahrgang ${c.jahrgangBis}`;
  return "alle Jahrgänge";
}

function escapeHtml(s) {
  return String(s === null || s === undefined ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function escapeAttr(s) { return escapeHtml(s); }

function toast(text, fehler) {
  const el = document.getElementById("toast");
  el.textContent = text;
  el.classList.toggle("fehler", !!fehler);
  el.classList.add("sichtbar");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("sichtbar"), fehler ? 5200 : 2600);
}

async function kopiere(text, meldung) {
  try {
    await navigator.clipboard.writeText(text);
    toast(meldung || "Kopiert.");
  } catch (_) {
    // Ohne Zwischenablage-Recht (älteres iOS, kein HTTPS) bleibt der Weg über
    // ein markiertes Feld — sonst passiert auf den Klick gar nichts.
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); toast(meldung || "Kopiert."); }
    catch (_e) { toast("Kopieren geht hier nicht — bitte von Hand markieren.", true); }
    document.body.removeChild(ta);
  }
}

// Ein Fehler aus dem Worker ist eine Meldung an den Menschen, kein Absturz. Bei
// abgelaufener Sitzung zurück auf den Anmeldeschirm, sonst nur die Meldung.
async function mitFehler(fn) {
  const status = document.getElementById("save-status");
  status.textContent = "…";
  status.classList.remove("error");
  try {
    await fn();
    status.textContent = "";
  } catch (e) {
    status.textContent = "Fehler";
    status.classList.add("error");
    if (e instanceof NotLoggedInError) { zeigeStartFehler(e); return; }
    toast(e && e.message ? e.message : "Das hat nicht geklappt.", true);
  }
}

function renderChangelog() {
  const ziel = document.getElementById("changelog");
  ziel.innerHTML = APP_CHANGELOG.map((v) => `
    <div class="changelog-version">
      <h3>Version ${escapeHtml(v.version)}</h3>
      ${v.groups.map((g) => `
        <h4>${escapeHtml(g.title)}</h4>
        <ul>${g.items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`).join("")}
    </div>`).join("");
}
