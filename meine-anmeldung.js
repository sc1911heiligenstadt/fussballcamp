// „Meine Anmeldung" — die Eltern ändern oder sagen ab, OHNE Login. Ausweis ist
// der Token aus der Bestätigungsmail (?a=<token>).
//
// ⚠️ Der Token gehört genau EINER Anmeldung. Er ist kein Zugang zum Camp und
// kein Zugang zu anderen Anmeldungen — der Worker gibt darüber nur diese eine
// heraus und hält ein Zählwerk gegen Ausprobieren.
//
// ⚠️ Eine Änderung durch die Eltern erzeugt KEINE Mail an den Verein
// (Michel-Entscheidung). Damit sie trotzdem nicht untergeht, setzt der Worker in
// der Anmeldung eine Markierung, die in der App oben als Meldekasten erscheint.

let anmToken = "";
let stand = null;   // { camp, anmeldung, zahlung }

document.addEventListener("DOMContentLoaded", () => {
  anmToken = oQuery("a");
  document.getElementById("aendern-form").addEventListener("submit", speichern);
  document.getElementById("btn-absagen").addEventListener("click", absagen);
  lade();
});

async function lade() {
  if (!anmToken) {
    zeigeProblem("Der Link ist unvollständig",
      "In der Adresse fehlt die Kennung der Anmeldung. Bitte den Link aus der Bestätigungsmail vollständig öffnen.");
    return;
  }
  try {
    stand = await oeffAufruf({ action: "fussballcamp-meine-info", token: anmToken });
    zeige();
  } catch (e) {
    if (e.status === 404) {
      zeigeProblem("Diese Anmeldung gibt es nicht (mehr)",
        "Der Link führt ins Leere. Vielleicht ist er unvollständig kopiert worden, oder die Anmeldung wurde bereits entfernt.");
    } else if (e.status === 410) {
      zeigeProblem("Der Link ist abgelaufen", e.message);
    } else {
      zeigeProblem("Das hat nicht geklappt", e.message);
    }
  }
}

function zeigeProblem(titel, text) {
  document.getElementById("laden").classList.add("fc-hidden");
  document.getElementById("bereich").classList.add("fc-hidden");
  document.getElementById("problem").classList.remove("fc-hidden");
  document.getElementById("problem-titel").textContent = titel;
  document.getElementById("problem-text").textContent = text;
}

function zeige() {
  const camp = stand.camp, a = stand.anmeldung;
  document.getElementById("laden").classList.add("fc-hidden");
  document.getElementById("bereich").classList.remove("fc-hidden");

  const kind = `${a.kindVorname || ""} ${a.kindNachname || ""}`.trim();
  document.getElementById("kopf-titel").textContent = `${kind} — ${camp.name}`;
  document.title = `Anmeldung ${kind} — 1. SC 1911 Heiligenstadt e.V.`;

  const status = document.getElementById("kopf-status");
  if (a.status === "abgesagt") {
    status.innerHTML = `<div class="fc-hinweis warn"><strong>Diese Anmeldung ist abgesagt.</strong>
      Wenn das ein Versehen war, melde dich bitte direkt beim Verein.</div>`;
  } else if (a.status === "warteliste") {
    status.innerHTML = `<div class="fc-hinweis warn"><strong>Auf der Warteliste, Platz ${a.wartePlatz || "?"}.</strong>
      Das Camp ist ausgebucht. Sagt jemand ab, rücken wir nach und melden uns per E-Mail.
      <strong>Bitte überweise erst dann.</strong></div>`;
  } else {
    status.innerHTML = `<div class="fc-hinweis ok"><strong>Fester Platz im Camp.</strong>
      ${a.bezahlt ? "Der Beitrag ist bei uns eingegangen — vielen Dank." : "Der Beitrag ist bei uns noch nicht eingegangen."}</div>`;
  }

  const eck = [
    { t: "Wann", w: oDatumBereich(camp.vonDatum, camp.bisDatum) },
    { t: "Täglich", w: `${camp.taeglichVon || "?"} bis ${camp.taeglichBis || "?"} Uhr` },
    { t: "Wo", w: camp.ort || "wird noch bekannt gegeben" },
    // ⚠️ Der festgeschriebene Betrag aus dem Zahlungsblock, NICHT der aktuelle
    // Camp-Preis: wer im Frühbucherfenster angemeldet hat, schuldet weiterhin den
    // günstigeren Betrag, und genau der steht auch in seiner Bestätigungsmail.
    { t: "Beitrag", w: oEuro(stand.zahlung && stand.zahlung.betrag !== undefined && stand.zahlung.betrag !== null
        ? stand.zahlung.betrag : camp.preis) }
  ];
  document.getElementById("camp-eckdaten").innerHTML = eck.filter((e) => e.w)
    .map((e) => `<div class="fc-eck"><dt>${oEsc(e.t)}</dt><dd>${oEsc(e.w)}</dd></div>`).join("");

  // Zahlungsangaben nur zeigen, wenn sie gebraucht werden: nicht bei Warteliste,
  // nicht bei Absage, nicht wenn schon bezahlt ist.
  const zk = document.getElementById("zahlung-karte");
  const brauchtZahlung = a.status === "angemeldet" && !a.bezahlt && stand.zahlung && stand.zahlung.iban;
  if (brauchtZahlung) {
    const z = stand.zahlung;
    zk.classList.remove("fc-hidden");
    zk.innerHTML = `
      <h2>Der Beitrag</h2>
      <div class="fc-zahlung">
        <dl>
          <dt>Betrag</dt><dd>${oEsc(oEuro(z.betrag))}</dd>
          <dt>Empfänger</dt><dd>${oEsc(z.kontoinhaber || "1. SC 1911 Heiligenstadt e.V.")}</dd>
          <dt>IBAN</dt><dd>${oEsc(ibanLesbar(z.iban))}</dd>
          ${z.bic ? `<dt>BIC</dt><dd>${oEsc(z.bic)}</dd>` : ""}
          <dt>Verwendungszweck</dt><dd>${oEsc(z.verwendungszweck)}</dd>
        </dl>
      </div>
      <p class="fc-grau">Bitte den Verwendungszweck genau so angeben — sonst lässt sich die Zahlung nicht zuordnen.</p>`;
  } else {
    zk.classList.add("fc-hidden");
    zk.innerHTML = "";
  }

  // Eine abgesagte Anmeldung lässt sich weder ändern noch noch einmal absagen.
  const abgesagt = a.status === "abgesagt";
  document.getElementById("aendern-form").classList.toggle("fc-hidden", abgesagt);
  document.getElementById("absage-karte").classList.toggle("fc-hidden", abgesagt);
  if (abgesagt) return;

  baueFormular(document.getElementById("felder"), camp.felder, a);
  zeigeAgb();

  const zb = document.getElementById("zusatzfrage-bereich");
  if (camp.zusatzfrage) {
    zb.classList.remove("fc-hidden");
    document.getElementById("zusatzfrage-label").textContent = camp.zusatzfrage;
    document.getElementById("f-zusatz").value = a.zusatzantwort || "";
  } else {
    zb.classList.add("fc-hidden");
  }
}

// Zeigt die Teilnahmebedingungen. Zwei Fälle, und der Unterschied ist der Punkt
// der ganzen Sache:
//
//   unverändert — die Eltern sehen GENAU die Fassung, der sie zugestimmt haben,
//                 samt Datum. Kein Häkchen: sie haben bereits zugestimmt.
//   geändert    — sie sehen die NEUE Fassung, deutlich als geändert markiert,
//                 und müssen ihr zustimmen, bevor sie speichern können.
//
// ⚠️ Was hier NICHT passieren darf: die neue Fassung stillschweigend zeigen und
// die alte Zustimmung weitergelten lassen. Dann stünde im Nachweis eine
// Zustimmung zu einem Text, den diese Eltern nie gesehen haben.
function zeigeAgb() {
  const agb = stand.agb;
  const bereich = document.getElementById("agb-bereich");
  const hakenFeld = document.getElementById("agb-haken-feld");

  if (!agb || !agb.text) {
    bereich.classList.add("fc-hidden");
    return;
  }

  bereich.classList.remove("fc-hidden");
  document.getElementById("agb-text").innerHTML = agbHtml(agb.text);

  const meldung = document.getElementById("agb-meldung");
  if (agb.geaendert) {
    hakenFeld.classList.remove("fc-hidden");
    document.getElementById("f-agb").checked = false;
    document.getElementById("agb-summary").textContent = "Die geänderten Teilnahmebedingungen lesen";
    meldung.innerHTML = `<div class="fc-hinweis warn"><strong>Die Teilnahmebedingungen haben sich geändert.</strong>
      Bitte lies sie durch und bestätige unten — sonst lässt sich hier nichts speichern.
      Deine Anmeldung bleibt davon unberührt und gilt weiter.</div>`;
  } else {
    hakenFeld.classList.add("fc-hidden");
    document.getElementById("agb-summary").textContent = "Die Teilnahmebedingungen nachlesen";
    meldung.innerHTML = agb.akzeptiertAm
      ? `<p class="fc-grau">Diesen Bedingungen hast du bei der Anmeldung am ${oEsc(oDatum(agb.akzeptiertAm))} zugestimmt.</p>`
      : "";
  }
}

async function speichern(ev) {
  ev.preventDefault();
  const fehlerBox = document.getElementById("form-fehler");
  const okBox = document.getElementById("form-ok");
  const knopf = document.getElementById("btn-speichern");
  fehlerBox.classList.add("fc-hidden");
  okBox.classList.add("fc-hidden");

  const { daten, fehlend } = leseFormular(document.getElementById("felder"), stand.camp.felder);
  if (stand.camp.zusatzfrage) daten.zusatzantwort = document.getElementById("f-zusatz").value.trim();

  const agbNeuNoetig = !!(stand.agb && stand.agb.geaendert);
  if (agbNeuNoetig && !document.getElementById("f-agb").checked) {
    fehlend.push("Anerkennung der geänderten Teilnahmebedingungen");
  }

  if (fehlend.length) {
    fehlerBox.textContent = `Bitte noch ausfüllen: ${fehlend.join(", ")}.`;
    fehlerBox.classList.remove("fc-hidden");
    fehlerBox.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  knopf.disabled = true;
  knopf.textContent = "Wird gespeichert …";
  try {
    await oeffAufruf({
      action: "fussballcamp-meine-speichern", token: anmToken, daten,
      agb: agbNeuNoetig ? true : undefined,
      agbStand: agbNeuNoetig ? stand.agb.stand : undefined
    });
    okBox.textContent = "Gespeichert. Vielen Dank — wir haben die Änderung.";
    okBox.classList.remove("fc-hidden");
    okBox.scrollIntoView({ behavior: "smooth", block: "center" });
    // Nach einer neuen Zustimmung ist der Stand ein anderer. Ohne Neuladen bliebe
    // die Warnung stehen, und das Häkchen würde beim nächsten Speichern erneut
    // verlangt, obwohl es gerade gesetzt wurde.
    if (agbNeuNoetig) await lade();
  } catch (e) {
    fehlerBox.textContent = e.message;
    fehlerBox.classList.remove("fc-hidden");
    fehlerBox.scrollIntoView({ behavior: "smooth", block: "center" });
  } finally {
    knopf.disabled = false;
    knopf.textContent = "Änderungen speichern";
  }
}

async function absagen() {
  const kind = `${stand.anmeldung.kindVorname || ""} ${stand.anmeldung.kindNachname || ""}`.trim();
  if (!confirm(`Die Anmeldung von ${kind} wirklich absagen?\n\nDer Platz geht dann an ein Kind von der Warteliste. Rückgängig machen kannst du das hier nicht.`)) return;

  const knopf = document.getElementById("btn-absagen");
  knopf.disabled = true;
  knopf.textContent = "Wird gesendet …";
  try {
    await oeffAufruf({ action: "fussballcamp-meine-absagen", token: anmToken });
    await lade();
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (e) {
    alert(e.message);
    knopf.disabled = false;
    knopf.textContent = "Anmeldung absagen";
  }
}
