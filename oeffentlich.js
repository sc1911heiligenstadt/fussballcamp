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

// `rollen` ist die Liste der Ausrichtungen, die das Camp anbietet (kommt vom
// Worker mit). Nur bei ZWEI Einträgen entsteht daraus eine Frage — bei einer
// steht die Antwort schon fest, und eine Frage mit genau einer möglichen
// Antwort ist keine Frage, sondern eine Stolperstelle.
//
// ⚠️ Der Parameter ist optional. Ein alter Aufruf ohne ihn verhält sich wie
// vorher; die Rollenfrage entfällt dann, und der Worker setzt „Feldspieler".
function baueFormular(ziel, konf, werte, rollen) {
  const w = werte || {};
  const felder = sichtbareFelder(konf);

  ziel.innerHTML = FELD_GRUPPEN.map((g) => {
    const drin = felder.filter((f) => f.gruppe === g.id);
    // ⚠️ Die Rollenfrage hängt an der Gruppe „Das Kind" und muss deshalb auch
    // dann eine Gruppe erzeugen, wenn dort sonst kein Feld eingeschaltet wäre.
    // Ohne diese Zeile fiele sie stillschweigend aus dem Formular heraus.
    const rollenHier = g.id === "kind" ? rollenHtml(rollen, w.rolle) : "";
    if (!drin.length && !rollenHier) return "";
    return `
      <fieldset class="anm-gruppe">
        <legend>${oEsc(g.label)}</legend>
        ${g.hinweis ? `<p class="anm-gruppen-hinweis">${oEsc(g.hinweis)}</p>` : ""}
        ${rollenHier}
        ${drin.map((f) => feldHtml(f, konf,
          // ⚠️ `janein_text` braucht BEIDE Werte. Würde hier nur der Text
          // durchgereicht, stünde beim Ändern einer Anmeldung nie ein Knopf
          // vorgewählt da — und die Familie müsste die Frage neu beantworten,
          // obwohl sie das längst getan hat.
          f.typ === "janein_text" ? { hat: w[f.id + "Hat"], text: w[f.id] } : w[f.id]
        )).join("")}
      </fieldset>`;
  }).join("");

  // ⚠️ Der Horcher wird HIER gesetzt, nicht in den beiden Seiten daneben:
  // `baueFormular` schreibt das Markup, also gehört das Verdrahten dazu.
  // Anmeldeseite und „Meine Anmeldung" bekommen es damit beide, ohne dass
  // jemand daran denken muss.
  ziel.querySelectorAll("[data-feld-hat]").forEach((k) => k.addEventListener("change", () => {
    const kasten = ziel.querySelector(`[data-detail-fuer="${CSS.escape(k.dataset.feldHat)}"]`);
    if (!kasten) return;
    const auf = k.value === "ja" && k.checked;
    kasten.classList.toggle("fc-hidden", !auf);
    // Beim Aufklappen die Schreibmarke gleich hineinsetzen -- sonst tippt
    // niemand los, sondern sucht erst das Feld.
    if (auf) { const t = kasten.querySelector("textarea"); if (t) t.focus(); }
  }));
}

// Die Frage „Feldspieler oder Torwart?" — als zwei Knöpfe, gleiche Bauform wie
// die Ja/Nein-Felder. Bewusst OHNE Vorauswahl: eine gesetzte Vorauswahl wäre bei
// den meisten Kindern zufällig richtig und bei den Torhütern zufällig falsch,
// und niemand merkt es.
function rollenHtml(rollen, gewaehlt) {
  const liste = Array.isArray(rollen) ? rollen : [];
  if (liste.length < 2) return "";
  return `
    <div class="anm-feld janein" role="group" aria-labelledby="f-rolle-frage" aria-required="true">
      <span class="janein-frage" id="f-rolle-frage">Nimmt dein Kind als Feldspieler oder als Torwart teil? <span class="pflicht-stern" aria-hidden="true">*</span></span>
      <div class="janein-knoepfe">
        ${liste.map((id) => `
          <label class="janein-knopf">
            <input type="radio" name="f-rolle" value="${oEsc(id)}" data-rolle="1"${id === gewaehlt ? " checked" : ""} />
            <span>${oEsc(rolleLabel(id))}</span>
          </label>`).join("")}
      </div>
      <span class="anm-hinweis">Danach richtet sich, wie viele Torwarttrainer wir einplanen.</span>
    </div>`;
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

  // Ja/Nein als zwei Knöpfe, nicht als Auswahlliste: eine Auswahlliste hat immer
  // einen sichtbaren ersten Eintrag, und der wirkt wie eine schon gegebene
  // Antwort. Hier soll man SEHEN, dass noch nichts gewählt ist.
  //
  // ⚠️ Ein alter Wert kann noch `true`/`false` aus der Häkchen-Zeit sein. `true`
  // wird zu „ja"; `false` wird NICHT zu „nein", sondern bleibt unbeantwortet —
  // ein nicht gesetztes Häkchen war nie eine belastbare Verneinung, sondern
  // konnte genauso gut übersehen worden sein.
  if (f.typ === "janein") {
    const gewaehlt = wert === true ? "ja" : (wert === "ja" || wert === "nein" ? wert : "");
    return `
      <div class="anm-feld janein" role="group" aria-labelledby="${id}-frage"${pflicht ? ' aria-required="true"' : ""}>
        <span class="janein-frage" id="${id}-frage">${oEsc(f.label)}${stern}</span>
        <div class="janein-knoepfe">
          ${JANEIN.map((o) => `
            <label class="janein-knopf">
              <input type="radio" name="${id}" value="${oEsc(o.id)}" data-feld="${oEsc(f.id)}"${o.id === gewaehlt ? " checked" : ""} />
              <span>${oEsc(o.label)}</span>
            </label>`).join("")}
        </div>
        ${hinweis}
      </div>`;
  }

  // Ja/Nein mit Nachfrage. ⚠️ Der Textkasten hängt an der Antwort: bei „nein"
  // ist er weg, bei „ja" da. Ein immer sichtbares Feld war genau das Problem —
  // die Eltern füllen es dann mit „keine".
  //
  // ⚠️ Zwei Datenhalter: `data-feld-hat` an den Knöpfen, `data-feld` am Text.
  // `leseFormular` liest beide.
  if (f.typ === "janein_text") {
    const hatWert = wert && wert.hat === "ja" ? "ja" : (wert && wert.hat === "nein" ? "nein" : "");
    const text = (wert && wert.text) || "";
    return `
      <div class="anm-feld janein jn-block" role="group" aria-labelledby="${id}-frage"${pflicht ? ' aria-required="true"' : ""}>
        <span class="janein-frage" id="${id}-frage">${oEsc(f.label)}${stern}</span>
        <div class="janein-knoepfe">
          ${JANEIN.map((o) => `
            <label class="janein-knopf">
              <input type="radio" name="${id}-hat" value="${oEsc(o.id)}" data-feld-hat="${oEsc(f.id)}"${o.id === hatWert ? " checked" : ""} />
              <span>${oEsc(o.label)}</span>
            </label>`).join("")}
        </div>
        <div class="jn-detail${hatWert === "ja" ? "" : " fc-hidden"}" data-detail-fuer="${oEsc(f.id)}">
          <label for="${id}">${oEsc(f.detail || "Was genau?")}</label>
          <textarea id="${id}" data-feld="${oEsc(f.id)}" rows="2" maxlength="${f.maxLen || 500}">${oEsc(text)}</textarea>
          ${f.hinweis ? `<span class="anm-hinweis">${oEsc(f.hinweis)}</span>` : ""}
        </div>
      </div>`;
  }

  let eingabe;
  if (f.typ === "mehrzeilig") {
    eingabe = `<textarea id="${id}" data-feld="${oEsc(f.id)}" rows="2" maxlength="${f.maxLen || 500}"${req}>${oEsc(wert || "")}</textarea>`;
  } else if (f.typ === "auswahl") {
    const opt = (o) => `<option value="${oEsc(o)}"${o === wert ? " selected" : ""}>${oEsc(o)}</option>`;
    // ⚠️ Trägt das Feld `gruppen`, wird nach Gruppen gerendert — sonst flach wie
    // bisher. Ein Feld wie "Lieblingsposition" braucht keine Untergliederung, und
    // eine leere optgroup-Hülle darum wäre nur Lärm im Markup.
    const inhalt = Array.isArray(f.gruppen)
      ? f.gruppen.map((g) => `<optgroup label="${oEsc(g.label)}">${(g.optionen || []).map(opt).join("")}</optgroup>`).join("")
      : (f.optionen || []).map(opt).join("");
    eingabe = `<select id="${id}" data-feld="${oEsc(f.id)}"${req}>
        <option value="">— bitte wählen —</option>
        ${inhalt}
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
    // Ja/Nein mit Nachfrage: zwei Werte, `<id>Hat` und `<id>`.
    if (f.typ === "janein_text") {
      const gewaehlt = wurzel.querySelector(`[data-feld-hat="${CSS.escape(f.id)}"]:checked`);
      const hat = gewaehlt ? String(gewaehlt.value) : "";
      const el = wurzel.querySelector(`[data-feld="${CSS.escape(f.id)}"]`);
      daten[f.id + "Hat"] = hat;
      // ⚠️ Bei „nein" wird KEIN Text mitgeschickt. Der Worker leert ihn ohnehin;
      // ihn hier schon wegzulassen hält beide Seiten bei derselben Aussage.
      daten[f.id] = hat === "ja" ? String((el && el.value) || "").trim() : "";
      if (istPflicht(f, konf) && !hat) fehlend.push(f.label);
      // ⚠️ „ja" ohne Text ist keine Antwort — unabhängig von der Pflichtstufe.
      // ⚠️ Das Fragezeichen weg: die Meldung setzt selbst einen Punkt
      // dahinter, sonst steht dort „Welche Allergien?.“
      if (hat === "ja" && !daten[f.id]) fehlend.push(String(f.detail || f.label).replace(/\?+$/, ""));
      return;
    }

    // ⚠️ Ja/Nein liegt als ZWEI Radio-Knöpfe vor. Ohne `:checked` läge hier immer
    // der erste von beiden — also stünde bei jeder Anmeldung „ja", auch wenn
    // niemand etwas angeklickt hat.
    if (f.typ === "janein") {
      const gewaehlt = wurzel.querySelector(`[data-feld="${CSS.escape(f.id)}"]:checked`);
      const v = gewaehlt ? String(gewaehlt.value) : "";
      daten[f.id] = v;
      if (istPflicht(f, konf) && !v) fehlend.push(f.label);
      return;
    }

    const el = wurzel.querySelector(`[data-feld="${CSS.escape(f.id)}"]`);
    if (!el) return;
    const v = f.typ === "haken" ? el.checked : String(el.value || "").trim();
    daten[f.id] = v;
    // Ein Pflicht-HAKEN muss gesetzt sein; ein Pflicht-FELD darf nicht leer sein.
    if (istPflicht(f, konf) && (f.typ === "haken" ? v !== true : v === "")) fehlend.push(f.label);
  });

  // Feldspieler oder Torwart. ⚠️ Steht die Frage gar nicht im Formular (Camp mit
  // nur einer Ausrichtung), wird auch nichts mitgeschickt — der Worker setzt den
  // Wert dann selbst. Nur wenn die Knöpfe DA sind und keiner gedrückt wurde,
  // ist das eine fehlende Pflichtangabe.
  const rollenGruppe = wurzel.querySelector("[data-rolle]");
  if (rollenGruppe) {
    const gewaehlt = wurzel.querySelector("[data-rolle]:checked");
    if (gewaehlt) daten.rolle = String(gewaehlt.value);
    else fehlend.push("Feldspieler oder Torwart");
  }

  return { daten, fehlend };
}

// ---------- Teilnahmebedingungen ----------

// Macht aus dem gepflegten Fließtext lesbares HTML: Leerzeile trennt Absätze,
// eine Zeile, die mit „* " oder „- " beginnt, wird zum Aufzählungspunkt, und
// eine kurze Zeile, die mit einer Ziffer und einem Punkt anfängt, zur Überschrift.
//
// ⚠️ ESCAPEN, bevor irgendetwas zusammengebaut wird. Der Text steht zwar nur
// Administratoren offen, landet aber ungeprüft auf einer Seite, die jeder
// aufruft, der einen Camp-Link hat.
function agbHtml(text) {
  const roh = String(text || "").replace(/\r\n?/g, "\n").trim();
  if (!roh) return "";

  return roh.split(/\n{2,}/).map((absatz) => {
    const zeilen = absatz.split("\n").map((z) => z.trim()).filter(Boolean);
    if (!zeilen.length) return "";

    // Ein Block aus lauter Aufzählungszeilen wird eine Liste.
    if (zeilen.every((z) => /^[*\-•]\s+/.test(z))) {
      return `<ul>${zeilen.map((z) => `<li>${oEsc(z.replace(/^[*\-•]\s+/, ""))}</li>`).join("")}</ul>`;
    }

    // „3. Teilnehmerbeitrag und Zahlung" — Nummer, kurze Zeile, kein Satzende.
    if (zeilen.length === 1 && /^\d+\.\s+\S/.test(zeilen[0]) && zeilen[0].length < 80 && !/[.!?]$/.test(zeilen[0])) {
      return `<h4>${oEsc(zeilen[0])}</h4>`;
    }

    return `<p>${zeilen.map(oEsc).join("<br />")}</p>`;
  }).join("");
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
