// Die Anmeldeseite für die Eltern. OHNE Login — Ausweis ist der Token im Link
// (?c=<token>), den die App zu jedem offenen Camp ausgibt.
//
// ⚠️ Diese Seite prüft NICHTS verbindlich. Sie füllt Felder, zeigt Fehler
// freundlich an und schickt ab; ob das Camp offen ist, ob noch ein Platz frei
// ist und ob die Pflichtfelder wirklich ausgefüllt sind, entscheidet allein der
// Worker. Zwei Familien, die gleichzeitig auf „Anmelden" tippen, dürfen nicht
// beide den letzten Platz bekommen — das lässt sich hier gar nicht erst
// zuverlässig feststellen.

let camp = null;
let campToken = "";
let letzteEltern = null;   // für den Geschwister-Knopf

document.addEventListener("DOMContentLoaded", () => {
  campToken = oQuery("c");
  document.getElementById("anmelde-form").addEventListener("submit", absenden);
  document.getElementById("btn-geschwister").addEventListener("click", nochEinKind);
  ladeCamp();
});

async function ladeCamp() {
  if (!campToken) {
    zeigeProblem("Der Link ist unvollständig",
      "In der Adresse fehlt die Kennung des Camps. Bitte den Link noch einmal von der Vereinsseite aus öffnen.");
    return;
  }

  try {
    const antwort = await oeffAufruf({ action: "fussballcamp-anmelde-info", token: campToken });
    camp = antwort.camp;
    zeigeCamp();
  } catch (e) {
    // Der Worker unterscheidet: 404 = Link kennt niemand, 410 = Camp zu oder
    // Fenster abgelaufen. Beides sind für die Eltern eigene Geschichten.
    if (e.status === 404) {
      zeigeProblem("Dieses Camp gibt es nicht (mehr)",
        "Der Link führt ins Leere. Vielleicht ist er unvollständig kopiert worden, oder das Camp wurde entfernt.");
    } else if (e.status === 410) {
      zeigeProblem("Die Anmeldung ist geschlossen", e.message);
    } else {
      zeigeProblem("Das hat nicht geklappt", e.message);
    }
  }
}

function zeigeProblem(titel, text) {
  document.getElementById("laden").classList.add("fc-hidden");
  document.getElementById("formular-bereich").classList.add("fc-hidden");
  document.getElementById("problem").classList.remove("fc-hidden");
  document.getElementById("problem-titel").textContent = titel;
  document.getElementById("problem-text").textContent = text;
}

function zeigeCamp() {
  document.getElementById("laden").classList.add("fc-hidden");
  document.getElementById("formular-bereich").classList.remove("fc-hidden");
  document.title = `Anmeldung: ${camp.name} — 1. SC 1911 Heilbad Heiligenstadt`;

  document.getElementById("camp-name").textContent = camp.name || "Fußballcamp";
  document.getElementById("camp-beschreibung").textContent = camp.beschreibung || "";

  const eck = [
    { t: "Wann", w: oDatumBereich(camp.vonDatum, camp.bisDatum) },
    { t: "Täglich", w: `${camp.taeglichVon || "?"} bis ${camp.taeglichBis || "?"} Uhr` },
    { t: "Wo", w: camp.ort || "wird noch bekannt gegeben" },
    { t: "Für wen", w: jahrgangText(camp) },
    { t: "Beitrag", w: oEuro(camp.preis) + (camp.preisHinweis ? "" : "") }
  ];
  if (camp.anmeldungBis) eck.push({ t: "Anmeldung bis", w: oDatum(camp.anmeldungBis) });

  document.getElementById("camp-eckdaten").innerHTML = eck
    .filter((e) => e.w)
    .map((e) => `<div class="fc-eck"><dt>${oEsc(e.t)}</dt><dd>${oEsc(e.w)}</dd></div>`).join("");

  // Warteliste ankündigen, BEVOR jemand das Formular ausfüllt — nicht erst
  // danach. Der Worker entscheidet am Ende trotzdem selbst; hier geht es nur
  // darum, niemanden in eine Erwartung laufen zu lassen.
  const warn = document.getElementById("camp-warnung");
  const teile = [];
  if (camp.preisHinweis) teile.push(`<div class="fc-hinweis">${oEsc(camp.preisHinweis)}</div>`);
  if (camp.voll) {
    teile.push(`<div class="fc-hinweis warn"><strong>Das Camp ist ausgebucht.</strong>
      Du kannst dein Kind trotzdem anmelden — es kommt dann auf die Warteliste${camp.warteliste ? ` (aktuell ${camp.warteliste} Kinder darauf)` : ""}.
      Sagt jemand ab, rücken wir nach und melden uns bei dir.</div>`);
  } else if (camp.frei !== undefined && camp.frei <= 5) {
    teile.push(`<div class="fc-hinweis warn"><strong>Nur noch ${camp.frei} ${camp.frei === 1 ? "Platz" : "Plätze"} frei.</strong></div>`);
  }
  warn.innerHTML = teile.join("");

  baueFormular(document.getElementById("felder"), camp.felder, letzteEltern || {});

  const zb = document.getElementById("zusatzfrage-bereich");
  if (camp.zusatzfrage) {
    zb.classList.remove("fc-hidden");
    document.getElementById("zusatzfrage-label").textContent = camp.zusatzfrage;
  } else {
    zb.classList.add("fc-hidden");
  }
}

function jahrgangText(c) {
  if (c.jahrgangVon && c.jahrgangBis) return `Jahrgänge ${c.jahrgangVon} bis ${c.jahrgangBis}`;
  if (c.jahrgangVon) return `ab Jahrgang ${c.jahrgangVon}`;
  if (c.jahrgangBis) return `bis Jahrgang ${c.jahrgangBis}`;
  return "alle Jahrgänge";
}

async function absenden(ev) {
  ev.preventDefault();
  const fehlerBox = document.getElementById("form-fehler");
  const knopf = document.getElementById("btn-absenden");
  fehlerBox.classList.add("fc-hidden");

  const { daten, fehlend } = leseFormular(document.getElementById("felder"), camp.felder);
  if (camp.zusatzfrage) daten.zusatzantwort = document.getElementById("f-zusatz").value.trim();

  if (!document.getElementById("f-datenschutz").checked) fehlend.push("Einverständnis mit der Datenschutz-Information");

  if (fehlend.length) {
    fehlerBox.textContent = fehlend.length === 1
      ? `Bitte noch ausfüllen: ${fehlend[0]}.`
      : `Bitte noch ausfüllen: ${fehlend.join(", ")}.`;
    fehlerBox.classList.remove("fc-hidden");
    fehlerBox.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  // Doppelklick auf „Anmelden" darf nicht zwei Anmeldungen erzeugen. Der Worker
  // fängt das über den Namen zusätzlich ab, aber hier ist es billiger.
  knopf.disabled = true;
  knopf.textContent = "Wird gesendet …";

  try {
    const antwort = await oeffAufruf({
      action: "fussballcamp-anmelden",
      token: campToken,
      daten,
      datenschutz: true
    });
    letzteEltern = {
      elternName: daten.elternName, elternEmail: daten.elternEmail,
      elternTelefon: daten.elternTelefon, elternAnschrift: daten.elternAnschrift
    };
    zeigeFertig(antwort);
  } catch (e) {
    fehlerBox.textContent = e.message;
    fehlerBox.classList.remove("fc-hidden");
    fehlerBox.scrollIntoView({ behavior: "smooth", block: "center" });
  } finally {
    knopf.disabled = false;
    knopf.textContent = "Verbindlich anmelden";
  }
}

function zeigeFertig(a) {
  document.getElementById("formular-bereich").classList.add("fc-hidden");
  document.getElementById("fertig-bereich").classList.remove("fc-hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });

  const aufWarteliste = a.status === "warteliste";
  document.getElementById("fertig-kopf").innerHTML = aufWarteliste
    ? `<strong>${oEsc(a.kind)} steht auf der Warteliste.</strong>
       Das Camp ist im Moment ausgebucht — dein Kind steht auf Platz ${a.wartePlatz || "?"}.
       Sagt jemand ab, rücken wir nach und melden uns per E-Mail. <strong>Bitte überweise erst dann.</strong>`
    : `<strong>${oEsc(a.kind)} ist angemeldet.</strong>
       Wir haben die Anmeldung bekommen. Eine Bestätigung ist an ${oEsc(a.email || "deine E-Mail-Adresse")} unterwegs.`;

  // Zahlungsangaben nur bei einem echten Platz. Wer auf der Warteliste steht,
  // soll nicht überweisen — sonst muss der Verein Geld zurückbuchen.
  const zahl = document.getElementById("fertig-zahlung");
  if (!aufWarteliste && a.zahlung && a.zahlung.iban) {
    zahl.innerHTML = `
      <h3>Der Beitrag</h3>
      <p>Bitte überweise den Beitrag${a.zahlung.frist ? " bis zum " + oEsc(oDatum(a.zahlung.frist)) : ""} auf dieses Konto:</p>
      <div class="fc-zahlung">
        <dl>
          <dt>Betrag</dt><dd>${oEsc(oEuro(a.zahlung.betrag))}</dd>
          <dt>Empfänger</dt><dd>${oEsc(a.zahlung.kontoinhaber || "1. SC 1911 e.V. Heilbad Heiligenstadt")}</dd>
          <dt>IBAN</dt><dd>${oEsc(ibanLesbar(a.zahlung.iban))}</dd>
          ${a.zahlung.bic ? `<dt>BIC</dt><dd>${oEsc(a.zahlung.bic)}</dd>` : ""}
          <dt>Verwendungszweck</dt><dd>${oEsc(a.zahlung.verwendungszweck)}</dd>
        </dl>
      </div>
      <p class="fc-grau">Bitte den Verwendungszweck genau so angeben — sonst lässt sich die Zahlung nicht zuordnen.</p>`;
  } else if (!aufWarteliste) {
    // IBAN fehlt in den Einstellungen. Ehrlich sagen statt eine leere Tabelle
    // zeigen, mit der niemand etwas anfangen kann.
    zahl.innerHTML = `<h3>Der Beitrag</h3>
      <div class="fc-hinweis warn">Der Beitrag beträgt ${oEsc(oEuro(a.zahlung && a.zahlung.betrag))}.
      Die Kontoverbindung schicken wir dir mit der Bestätigungsmail nach.</div>`;
  } else {
    zahl.innerHTML = "";
  }

  const link = document.getElementById("fertig-link");
  link.innerHTML = a.aendernLink
    ? `<h3>Etwas ändern oder absagen</h3>
       <p>Über diesen Link kommst du jederzeit an deine Anmeldung. Er steht auch in der Bestätigungsmail:</p>
       <p><a href="${oEsc(a.aendernLink)}">${oEsc(a.aendernLink)}</a></p>
       <p class="fc-grau">Bitte gib den Link nicht weiter — wer ihn hat, sieht die Anmeldung.</p>`
    : "";
}

// Geschwisterkind: dasselbe Formular noch einmal, aber mit den Elternangaben
// schon ausgefüllt. Jedes Kind bleibt eine eigene Anmeldung mit eigenem Platz,
// eigenem Beitrag und eigener Warteliste (Michel-Entscheidung).
async function nochEinKind() {
  document.getElementById("fertig-bereich").classList.add("fc-hidden");
  document.getElementById("laden").classList.remove("fc-hidden");
  // Neu laden statt den alten Stand weiterzuverwenden: nach der eigenen
  // Anmeldung ist ein Platz weniger frei, und genau das soll oben stehen.
  await ladeCamp();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
