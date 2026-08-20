// Geteilte Bausteine der Seiten OHNE Login: anmeldung.html (neue Anmeldung),
// meine-anmeldung.html (ändern und absagen) und popup.js (Fenster auf der
// Vereins-Homepage).
//
// ⚠️ Diese Seiten haben KEINEN Sitzungstoken und dürfen auch keinen brauchen.
// Eltern sind keine Vereinsnutzer. Der Ausweis ist stattdessen der Token im
// Link — je Camp einer für die Anmeldung, je Anmeldung einer zum Ändern.
// Entsprechend halten die zugehörigen Worker-Aktionen ein eigenes Zählwerk gegen
// Ausprobieren (429) und geben nur heraus, was auf der Seite gebraucht wird.
//
// ⚠️ db.js wird hier NICHT eingebunden: dessen gatewayRequest() wirft ohne Token
// sofort NotLoggedInError. Die Trennung ist Absicht — was hier läuft, soll gar
// nicht erst versehentlich an einer eingeloggten Aktion landen.

const OEFF_GATEWAY_URL = "https://landingpage.michel-brunner.workers.dev";

async function oeffAufruf(payload) {
  let resp;
  try {
    resp = await fetch(OEFF_GATEWAY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (_) {
    throw new Error("Keine Verbindung. Bitte die Internetverbindung prüfen und es noch einmal versuchen.");
  }
  if (!resp.ok) {
    let msg = "Das hat leider nicht geklappt.";
    try { const b = await resp.json(); if (b && b.error) msg = b.error; } catch (_) { /* ohne JSON-Körper */ }
    if (resp.status === 429) msg = "Zu viele Versuche. Bitte ein paar Minuten warten.";
    const fehler = new Error(msg);
    fehler.status = resp.status;
    throw fehler;
  }
  return resp.json();
}

// ---------- Formular aus der Feldkonfiguration eines Camps bauen ----------

// `konf` ist camp.felder: { feldId: "aus" | "optional" | "pflicht" }.
// Feste Felder (f.fest) sind immer dabei und immer Pflicht.
function sichtbareFelder(konf) {
  return FORMULAR_FELDER.filter((f) => f.fest || (konf || {})[f.id] === "optional" || (konf || {})[f.id] === "pflicht");
}

function istPflicht(f, konf) {
  return !!f.fest || (konf || {})[f.id] === "pflicht";
}

function baueFormular(ziel, konf, werte) {
  const w = werte || {};
  const felder = sichtbareFelder(konf);

  ziel.innerHTML = FELD_GRUPPEN.map((g) => {
    const drin = felder.filter((f) => f.gruppe === g.id);
    if (!drin.length) return "";
    return `
      <fieldset class="anm-gruppe">
        <legend>${oEsc(g.label)}</legend>
        ${g.hinweis ? `<p class="anm-gruppen-hinweis">${oEsc(g.hinweis)}</p>` : ""}
        ${drin.map((f) => feldHtml(f, konf, w[f.id])).join("")}
      </fieldset>`;
  }).join("");
}

function feldHtml(f, konf, wert) {
  const pflicht = istPflicht(f, konf);
  const id = "f-" + f.id;
  const stern = pflicht ? ` <span class="pflicht-stern" aria-hidden="true">*</span>` : "";
  const req = pflicht ? " required" : "";
  const hinweis = f.hinweis ? `<span class="anm-hinweis">${oEsc(f.hinweis)}</span>` : "";

  if (f.typ === "haken") {
    return `
      <div class="anm-feld haken">
        <label for="${id}"><input type="checkbox" id="${id}" data-feld="${oEsc(f.id)}"${wert ? " checked" : ""}${req} />
          <span>${oEsc(f.label)}${stern}</span></label>
        ${hinweis}
      </div>`;
  }

  let eingabe;
  if (f.typ === "mehrzeilig") {
    eingabe = `<textarea id="${id}" data-feld="${oEsc(f.id)}" rows="2" maxlength="${f.maxLen || 500}"${req}>${oEsc(wert || "")}</textarea>`;
  } else if (f.typ === "auswahl") {
    eingabe = `<select id="${id}" data-feld="${oEsc(f.id)}"${req}>
        <option value="">— bitte wählen —</option>
        ${(f.optionen || []).map((o) => `<option value="${oEsc(o)}"${o === wert ? " selected" : ""}>${oEsc(o)}</option>`).join("")}
      </select>`;
  } else {
    const typ = f.typ === "datum" ? "date" : (f.typ === "email" ? "email" : "text");
    // inputmode="email" zusätzlich zum type: ältere iOS-Fassungen zeigen sonst
    // die normale Tastatur ohne @-Taste.
    const extra = f.typ === "email" ? ` inputmode="email" autocomplete="email"` : "";
    eingabe = `<input type="${typ}" id="${id}" data-feld="${oEsc(f.id)}" maxlength="${f.maxLen || 120}" value="${oEsc(wert || "")}"${extra}${req} />`;
  }

  return `<div class="anm-feld"><label for="${id}">${oEsc(f.label)}${stern}</label>${eingabe}${hinweis}</div>`;
}

// Liest zurück, was im Formular steht. Prüft NUR die Pflichtfelder — alles
// Weitere (Länge, Format, erlaubte Werte) prüft der Worker noch einmal selbst.
function leseFormular(wurzel, konf) {
  const daten = {};
  const fehlend = [];

  sichtbareFelder(konf).forEach((f) => {
    const el = wurzel.querySelector(`[data-feld="${CSS.escape(f.id)}"]`);
    if (!el) return;
    const v = f.typ === "haken" ? el.checked : String(el.value || "").trim();
    daten[f.id] = v;
    // Ein Pflicht-HAKEN muss gesetzt sein; ein Pflicht-FELD darf nicht leer sein.
    if (istPflicht(f, konf) && (f.typ === "haken" ? v !== true : v === "")) fehlend.push(f.label);
  });

  return { daten, fehlend };
}

// ---------- Kleine Helfer ----------

function oEsc(s) {
  return String(s === null || s === undefined ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function oEuro(cent) {
  return ((Number(cent) || 0) / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

function oDatum(iso) {
  if (!iso) return "";
  const t = String(iso).slice(0, 10).split("-");
  return t.length === 3 ? `${t[2]}.${t[1]}.${t[0]}` : String(iso);
}

function oDatumBereich(von, bis) {
  if (!von) return "";
  if (!bis || bis === von) return oDatum(von);
  return `${oDatum(von)} bis ${oDatum(bis)}`;
}

// IBAN in Vierergruppen — so steht sie auf jedem Überweisungsträger und lässt
// sich abtippen, ohne die Stelle zu verlieren.
function ibanLesbar(iban) {
  return String(iban || "").replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
}

function oQuery(name) {
  try { return new URLSearchParams(window.location.search).get(name) || ""; }
  catch (_) { return ""; }
}
