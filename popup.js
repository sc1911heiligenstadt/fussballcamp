// Das Fenster auf der Vereins-Homepage.
//
// Wird dort EINMAL als <script src="…/popup.js" async> eingebaut und danach nie
// wieder angefasst. Welches Camp erscheint, holt sich dieses Skript zur Laufzeit
// vom Worker — der Status in der App entscheidet, nicht die Homepage.
//
// ⚠️ Drei Dinge, die dieses Skript NICHT tun darf, weil es in einer FREMDEN
// Seite läuft:
//
//   1. Kein globales CSS. Alle Regeln hängen an #fc-popup-wurzel; ein
//      `* { box-sizing: border-box }` würde das Layout der ganzen Vereinsseite
//      umbauen. Das CSS steht deshalb hier inline und nicht in oeffentlich.css.
//   2. Keine Cookies. Ob jemand das Fenster weggeklickt hat, merkt sich
//      localStorage — sonst bräuchte es eine Einwilligung im Cookie-Banner.
//   3. Nie einen Fehler nach außen lassen. Klemmt der Worker, passiert gar
//      nichts; eine kaputte Vereinsseite wäre der schlechtere Tausch.
//
// ⚠️ Damit das Fenster überhaupt erscheint, muss es in Borlabs Cookie
// freigegeben sein: Borlabs blockt fremde Skripte, und dieses kommt von
// sc1911heiligenstadt.github.io.

(function () {
  "use strict";

  var GATEWAY = "https://landingpage.michel-brunner.workers.dev";
  var BASIS = "https://sc1911heiligenstadt.github.io/fussballcamp/";
  var SPEICHER = "fc_popup_zu";
  var RUHE_TAGE = 7;

  // Zweimal eingebaut (etwa in Kopf- und Fußbereich der Vorlage) darf nicht
  // zwei Fenster erzeugen.
  if (window.__fcPopupLaeuft) return;
  window.__fcPopupLaeuft = true;

  function bereit(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }

  // Der Merkzettel hält fest, WELCHE Camps weggeklickt wurden. Ein neues Camp
  // ploppt dadurch wieder auf, auch wenn die Ruhefrist des alten noch läuft —
  // sonst verpasst man das nächste Camp, weil man das letzte weggeklickt hat.
  function gemerkt() {
    try {
      var roh = window.localStorage.getItem(SPEICHER);
      if (!roh) return { bis: 0, ids: [] };
      var o = JSON.parse(roh);
      return { bis: Number(o.bis) || 0, ids: Array.isArray(o.ids) ? o.ids : [] };
    } catch (_) { return { bis: 0, ids: [] }; }
  }

  function merken(ids) {
    try {
      window.localStorage.setItem(SPEICHER, JSON.stringify({
        bis: Date.now() + RUHE_TAGE * 86400000,
        ids: ids
      }));
    } catch (_) { /* privater Modus ohne Speicher — dann eben jedes Mal wieder */ }
  }

  function stilEinbauen() {
    if (document.getElementById("fc-popup-stil")) return;
    var s = document.createElement("style");
    s.id = "fc-popup-stil";
    s.textContent = [
      '#fc-popup-wurzel{position:fixed;inset:0;z-index:99999;background:rgba(20,26,40,.6);',
      'display:flex;align-items:center;justify-content:center;padding:16px;',
      'font-family:"Segoe UI",system-ui,sans-serif;line-height:1.5;color:#1e2330}',
      '#fc-popup-wurzel *{box-sizing:border-box;margin:0;padding:0}',
      '#fc-popup-wurzel .fc-pop{background:#fff;border-radius:14px;max-width:460px;width:100%;',
      'max-height:calc(100vh - 32px);overflow-y:auto;box-shadow:0 8px 40px rgba(0,0,0,.3);position:relative}',
      '#fc-popup-wurzel .fc-pop-kopf{background:#1a56a0;color:#fff;padding:18px 46px 18px 22px;border-radius:14px 14px 0 0}',
      '#fc-popup-wurzel .fc-pop-kopf h2{font-size:19px;margin:0;color:#fff;font-weight:600}',
      '#fc-popup-wurzel .fc-pop-body{padding:18px 22px 22px}',
      '#fc-popup-wurzel .fc-pop-camp{border-bottom:1px solid #dde1e8;padding-bottom:14px;margin-bottom:14px}',
      '#fc-popup-wurzel .fc-pop-camp:last-of-type{border-bottom:none;margin-bottom:0;padding-bottom:0}',
      '#fc-popup-wurzel .fc-pop-name{font-size:17px;font-weight:700;color:#1a56a0;margin-bottom:3px}',
      '#fc-popup-wurzel .fc-pop-zeit{font-size:13px;color:#6b7280;margin-bottom:7px}',
      '#fc-popup-wurzel .fc-pop-text{font-size:14px;margin-bottom:10px}',
      '#fc-popup-wurzel .fc-pop-frei{font-size:13px;color:#2d8c4e;font-weight:600;margin-bottom:10px}',
      '#fc-popup-wurzel .fc-pop-frei.voll{color:#c9941f}',
      '#fc-popup-wurzel .fc-pop-btn{display:inline-block;background:#2d8c4e;color:#fff;border:none;',
      'border-radius:8px;padding:11px 20px;font-size:15px;font-weight:600;text-decoration:none;cursor:pointer}',
      '#fc-popup-wurzel .fc-pop-btn:hover{filter:brightness(1.08)}',
      '#fc-popup-wurzel .fc-pop-zu{position:absolute;top:12px;right:14px;background:none;border:none;',
      'color:#fff;font-size:26px;line-height:1;cursor:pointer;padding:2px 8px}',
      '#fc-popup-wurzel .fc-pop-spaeter{display:block;margin-top:14px;background:none;border:none;color:#6b7280;',
      'font-size:13px;text-decoration:underline;cursor:pointer;font-family:inherit;padding:0}'
    ].join("");
    document.head.appendChild(s);
  }

  function esc(s) {
    return String(s === null || s === undefined ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function datum(iso) {
    if (!iso) return "";
    var t = String(iso).slice(0, 10).split("-");
    return t.length === 3 ? t[2] + "." + t[1] + "." + t[0] : String(iso);
  }

  function bereich(von, bis) {
    if (!von) return "";
    if (!bis || bis === von) return datum(von);
    return datum(von) + " bis " + datum(bis);
  }

  function euro(cent) {
    return ((Number(cent) || 0) / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
  }

  function zeigen(camps) {
    stilEinbauen();

    var wurzel = document.createElement("div");
    wurzel.id = "fc-popup-wurzel";
    wurzel.setAttribute("role", "dialog");
    wurzel.setAttribute("aria-modal", "true");
    wurzel.setAttribute("aria-label", "Anmeldung zum Fußballcamp");

    var ids = camps.map(function (c) { return c.token; });
    var mehrere = camps.length > 1;

    wurzel.innerHTML =
      '<div class="fc-pop">' +
        '<div class="fc-pop-kopf">' +
          '<h2>' + (mehrere ? "Unsere Fußballcamps" : "Unser Fußballcamp") + '</h2>' +
          '<button type="button" class="fc-pop-zu" aria-label="Schließen">&times;</button>' +
        '</div>' +
        '<div class="fc-pop-body">' +
          camps.map(function (c) {
            var voll = !!c.voll;
            return '<div class="fc-pop-camp">' +
              '<div class="fc-pop-name">' + esc(c.name) + '</div>' +
              '<div class="fc-pop-zeit">' + esc(bereich(c.vonDatum, c.bisDatum)) +
                (c.ort ? " &middot; " + esc(c.ort) : "") +
                (c.preis ? " &middot; " + esc(euro(c.preis)) : "") + '</div>' +
              (c.kurzbeschreibung ? '<div class="fc-pop-text">' + esc(c.kurzbeschreibung) + '</div>' : "") +
              '<div class="fc-pop-frei' + (voll ? ' voll' : '') + '">' +
                (voll ? "Ausgebucht &mdash; Anmeldung auf die Warteliste möglich"
                      : (c.frei !== undefined && c.frei <= 10 ? "Nur noch " + c.frei + (c.frei === 1 ? " Platz" : " Plätze") + " frei"
                                                              : "Anmeldung offen")) +
              '</div>' +
              '<a class="fc-pop-btn" href="' + esc(BASIS + "anmeldung.html?c=" + encodeURIComponent(c.token)) + '">' +
                (voll ? "Auf die Warteliste" : "Jetzt anmelden") + '</a>' +
            '</div>';
          }).join("") +
          '<button type="button" class="fc-pop-spaeter">Nicht mehr anzeigen</button>' +
        '</div>' +
      '</div>';

    function zu(dauerhaft) {
      if (dauerhaft) merken(ids);
      if (wurzel.parentNode) wurzel.parentNode.removeChild(wurzel);
      document.removeEventListener("keydown", beiTaste);
    }
    function beiTaste(ev) { if (ev.key === "Escape") zu(false); }

    wurzel.querySelector(".fc-pop-zu").addEventListener("click", function () { zu(false); });
    wurzel.querySelector(".fc-pop-spaeter").addEventListener("click", function () { zu(true); });
    // Klick auf den dunklen Rand schließt — aber nur dort, nicht auf dem Fenster.
    wurzel.addEventListener("click", function (ev) { if (ev.target === wurzel) zu(false); });
    document.addEventListener("keydown", beiTaste);

    document.body.appendChild(wurzel);
  }

  function los() {
    var merk = gemerkt();

    // POST statt GET: der Worker nimmt seine Aktionen als JSON im Körper
    // entgegen. Kein Authorization-Kopf — diese eine Aktion ist öffentlich.
    fetch(GATEWAY, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "fussballcamp-oeffentlich" })
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (antwort) {
        if (!antwort || !Array.isArray(antwort.camps) || !antwort.camps.length) return;

        // Nur Camps zeigen, die noch nicht weggeklickt wurden — oder deren
        // Ruhefrist abgelaufen ist.
        var frist = Date.now() < merk.bis;
        var zeigbar = antwort.camps.filter(function (c) {
          return !(frist && merk.ids.indexOf(c.token) !== -1);
        });
        if (!zeigbar.length) return;

        // Kurz warten: sonst springt das Fenster auf, bevor die Seite selbst
        // steht, und wirkt wie ein Werbebanner.
        setTimeout(function () { try { zeigen(zeigbar); } catch (_) { /* still */ } }, 1200);
      })
      .catch(function () { /* Worker nicht erreichbar — dann eben kein Fenster */ });
  }

  bereit(function () { try { los(); } catch (_) { /* still */ } });
})();
