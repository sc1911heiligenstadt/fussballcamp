// Feedbackbogen nach dem Camp — die Eltern antworten OHNE Login und ANONYM.
// Ausweis ist der Token aus der Mail (?a=<token>), derselbe wie beim Ändern der
// Anmeldung.
//
// ⚠️ Der Token wird hier nur mitgeschickt, damit der Worker prüfen kann, ob
// diese Familie schon geantwortet hat. Was er danach damit macht, steht in
// handleFcFeedbackSenden: die Antwort wird OHNE jeden Verweis auf die Anmeldung
// abgelegt, ohne Uhrzeit und an zufälliger Stelle der Liste. Die Zusage „anonym"
// oben auf der Seite ist deshalb eine Zusage über Servercode — nicht über diese
// Datei. Wer sie prüfen will, muss dort nachsehen.
//
// ⚠️ Die Fragen kommen VOM SERVER, nicht aus config.js. Dort steht dieselbe
// Liste noch einmal, aber nur als Rückfall für die Auswertung in der App — der
// Worker wirft beim Speichern alles weg, was er selbst nicht kennt. Eine Frage
// nur im Client anzulegen bliebe also wirkungslos.

let fbToken = "";
let bogen = null;   // { campName, vonDatum, bisDatum, fragen, noten, textMax, schonBeantwortet }

document.addEventListener("DOMContentLoaded", () => {
  fbToken = oQuery("a");
  document.getElementById("bogen-form").addEventListener("submit", absenden);
  lade();
});

async function lade() {
  if (!fbToken) {
    zeigeProblem("Der Link ist unvollständig",
      "In der Adresse fehlt die Kennung. Bitte den Link aus der Mail nach dem Camp vollständig öffnen.");
    return;
  }
  try {
    bogen = await oeffAufruf({ action: "fussballcamp-feedback-info", token: fbToken });
    zeige();
  } catch (e) {
    if (e.status === 404) {
      zeigeProblem("Diesen Bogen gibt es nicht",
        "Der Link führt ins Leere. Vielleicht ist er unvollständig kopiert worden.");
    } else if (e.status === 410) {
      zeigeProblem("Der Bogen ist nicht offen", e.message);
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
  document.getElementById("laden").classList.add("fc-hidden");

  // Schon geantwortet: dann gar nicht erst das Formular zeigen. Ein Bogen, den
  // man ausfüllen kann und der beim Absenden abgelehnt wird, ist ärgerlicher als
  // ein klarer Hinweis vorher.
  if (bogen.schonBeantwortet) {
    document.getElementById("danke-bereich").classList.remove("fc-hidden");
    document.querySelector("#danke-bereich h2").textContent = "Schon beantwortet";
    document.querySelector("#danke-bereich p").textContent =
      "Für diese Anmeldung liegt uns bereits eine Antwort vor. Vielen Dank!";
    return;
  }

  document.getElementById("bereich").classList.remove("fc-hidden");
  document.title = `Feedback: ${bogen.campName} — 1. SC 1911 Heiligenstadt e.V.`;
  document.getElementById("kopf-titel").textContent = bogen.campName || "Fußballcamp";
  document.getElementById("kopf-zeitraum").textContent = oDatumBereich(bogen.vonDatum, bogen.bisDatum);

  document.getElementById("fragen").innerHTML = (bogen.fragen || []).map(frageHtml).join("");
}

// Eine Frage als HTML. Noten und Ja/Nein liegen als Knopfreihen vor — gleiche
// Bauform wie die Ja/Nein-Felder im Anmeldeformular.
//
// ⚠️ KEINE Vorauswahl, bei keiner Frage. Eine vorgewählte 3 („geht so") käme bei
// jedem durch, der eine Frage überspringt, und wäre dann keine Antwort, sondern
// eine erfundene. Wer nichts anklickt, hat nichts gesagt — das ist der ganze
// Unterschied.
function frageHtml(f) {
  const id = "fb-" + f.id;

  if (f.typ === "note") {
    // ⚠️ Die Beschriftung steht an JEDEM Knopf, nicht nur an den Enden. Eine
    // nackte Skala von 1 bis 5 beantwortet nicht, welche Seite gut ist —
    // Schulnote und Sternchen laufen genau andersherum.
    return `
      <div class="anm-feld janein fb-note" role="group" aria-labelledby="${id}-frage">
        <span class="janein-frage" id="${id}-frage">${oEsc(f.frage)}</span>
        <div class="janein-knoepfe fb-noten-reihe">
          ${(FEEDBACK_NOTEN || []).map((n) => `
            <label class="janein-knopf fb-note-knopf">
              <input type="radio" name="${oEsc(id)}" value="${oEsc(String(n.wert))}" data-frage="${oEsc(f.id)}" />
              <span><strong>${oEsc(String(n.wert))}</strong> ${oEsc(n.label)}</span>
            </label>`).join("")}
        </div>
      </div>`;
  }

  if (f.typ === "janein") {
    return `
      <div class="anm-feld janein" role="group" aria-labelledby="${id}-frage">
        <span class="janein-frage" id="${id}-frage">${oEsc(f.frage)}</span>
        <div class="janein-knoepfe">
          ${JANEIN.map((o) => `
            <label class="janein-knopf">
              <input type="radio" name="${oEsc(id)}" value="${oEsc(o.id)}" data-frage="${oEsc(f.id)}" />
              <span>${oEsc(o.label)}</span>
            </label>`).join("")}
        </div>
      </div>`;
  }

  return `
    <div class="anm-feld">
      <label for="${oEsc(id)}">${oEsc(f.frage)}</label>
      <textarea id="${oEsc(id)}" data-frage="${oEsc(f.id)}" rows="3" maxlength="${Number(bogen.textMax) || FEEDBACK_TEXT_MAX}"></textarea>
    </div>`;
}

async function absenden(ev) {
  ev.preventDefault();
  const fehlerBox = document.getElementById("form-fehler");
  const knopf = document.getElementById("btn-senden");
  fehlerBox.classList.add("fc-hidden");

  const antworten = {};
  let inhalt = 0;
  (bogen.fragen || []).forEach((f) => {
    if (f.typ === "text") {
      const el = document.querySelector(`textarea[data-frage="${CSS.escape(f.id)}"]`);
      const v = el ? String(el.value || "").trim() : "";
      if (v) { antworten[f.id] = v; inhalt++; }
      return;
    }
    // ⚠️ Ohne `:checked` läge hier immer der erste Knopf der Reihe — also bei
    // jeder Frage eine 1, auch wenn niemand etwas angeklickt hat. Genau dieselbe
    // Falle wie bei den Ja/Nein-Feldern im Anmeldeformular.
    const gewaehlt = document.querySelector(`input[data-frage="${CSS.escape(f.id)}"]:checked`);
    if (!gewaehlt) return;
    antworten[f.id] = f.typ === "note" ? Number(gewaehlt.value) : String(gewaehlt.value);
    inhalt++;
  });

  // Der Worker lehnt einen leeren Bogen ebenfalls ab — hier soll die Antwort nur
  // ohne Umweg über den Server kommen.
  if (!inhalt) {
    fehlerBox.textContent = "Bitte beantworte mindestens eine Frage.";
    fehlerBox.classList.remove("fc-hidden");
    fehlerBox.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  knopf.disabled = true;
  knopf.textContent = "Wird gesendet …";
  try {
    await oeffAufruf({ action: "fussballcamp-feedback-senden", token: fbToken, antworten });
    document.getElementById("bereich").classList.add("fc-hidden");
    document.getElementById("danke-bereich").classList.remove("fc-hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (e) {
    fehlerBox.textContent = e.message;
    fehlerBox.classList.remove("fc-hidden");
    fehlerBox.scrollIntoView({ behavior: "smooth", block: "center" });
  } finally {
    knopf.disabled = false;
    knopf.textContent = "Antworten absenden";
  }
}
