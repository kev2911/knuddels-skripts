// ==UserScript==
// @name         Extended Mentor
// @namespace    http://ps.addins.net/
// @version      1.10
// @author       Kev
// @description  Mentor-/Meldekontroll-Addon fuer das Knuddels Meldesystem. Laeuft eigenstaendig und parallel zum Extended Admincall.
// @include      /^https:\/\/[^\/]*?\.knuddels\.de[^\/]*?\/ac\/.*?$/
// @require      https://code.jquery.com/jquery-3.3.1.min.js
// @grant        GM_xmlhttpRequest
// @grant        GM_info
// @downloadURL  https://raw.githubusercontent.com/kev2911/knuddels-skripts/refs/heads/main/extended_mentor.user.js
// @updateURL    https://raw.githubusercontent.com/kev2911/knuddels-skripts/refs/heads/main/extended_mentor.user.js
// ==/UserScript==

(function () {
  'use strict';

  /* =========================================================================
   *  KONFIGURATION
   * =======================================================================*/

  // Format der Melde-ID im °>/meldung X<° Link.
  //   'dotted'  -> 1.419.375.440   (Standard)
  //   'starred' -> *1.419.375.440
  //   'plain'   -> 1419375440
  const MELDUNG_ID_FORMAT = 'dotted';

  // Auswaehlbare Anzahl zufaelliger Meldungen
  const RANDOM_COUNTS = [5, 10, 15, 20];

  // Maximale Anzahl Seiten, die fuer eine Zufallsauswahl nachgeladen werden
  // (Schutz davor, bei 80 Seiten den Server zu fluten)
  const MAX_PAGE_FETCH = 12;

  // Meldetypen-Kategorien. "match" prueft den im Suchergebnis angezeigten Typ-Text.
  // Es werden bewusst ASCII-Praefixe verwendet, damit Umlaut-Encoding keine Rolle spielt.
  // RwV-Typen werden grundsaetzlich IMMER beruecksichtigt (siehe typeMatches()).
  const REPORT_CATEGORIES = [
    // ANNAHME: "Allgemeines" mappe ich auf die allgemeine "Aussage melden" + "Fotokommentar".
    // Falls bei euch ein anderer Typ-Text dahintersteht, hier einfach anpassen.
    { key: 'allgemeines',   label: 'Allgemeines',                       match: t => t === 'Aussage melden' || t.startsWith('Fotokommentar') },
    { key: 'aussage',       label: 'Aussage melden',                    match: t => t === 'Aussage melden' },
    { key: 'profilbilder',  label: 'Profil- oder Albenbilder melden',   match: t => t.startsWith('Profilbilder melden') },
    { key: 'profilinhalt',  label: 'Profilinhalt oder Nickname melden', match: t => t.startsWith('Profilinhalt oder Nickname melden') },
    { key: 'extrem',        label: 'Extremistische Aussage melden',     match: t => t.startsWith('Extremistische Aussage') },
    { key: 'jugend',        label: 'Jugendgefährdende Aussage melden',  match: t => t.startsWith('Jugendgef') },
    { key: 'altergeschl',   label: 'Alters- / Geschlechtsangabe melden',match: t => t.startsWith('Alter / Geschlecht') },
    { key: 'sexbel',        label: 'Sexuelle Belästigung melden',       match: t => t.startsWith('Sexuelle Bel') },
    { key: 'spiel',         label: 'Spielverhalten melden',             match: t => t.startsWith('Spielverhalten') },
    { key: 'suizid',        label: 'Suizid-/Amokankündigung melden',    match: t => t.startsWith('Suizid') }
  ];

  // Rollen-Vorauswahl fuer Meldetypen. Bei Auswahl einer Rolle werden GENAU die
  // hinterlegten Typen angekreuzt und alle anderen geleert ("Ersetzen").
  // Die Werte sind die "key"-Felder aus REPORT_CATEGORIES.
  const ROLE_PRESETS = [
    { key: 'standard', label: 'Standard (alle Meldetypen)',
      types: REPORT_CATEGORIES.map(c => c.key) },
    { key: 'admin', label: 'Admin',
      types: ['allgemeines', 'aussage', 'profilinhalt', 'sexbel', 'spiel', 'suizid'] },
    { key: 'profilteam', label: 'Profil-Team',
      types: ['allgemeines', 'profilbilder', 'profilinhalt', 'altergeschl'] },
    { key: 'juschu', label: 'JuSchu-Team',
      types: ['allgemeines', 'aussage', 'profilinhalt', 'jugend', 'sexbel'] },
    { key: 'aeteam', label: 'AE-Team',
      types: ['allgemeines', 'aussage', 'extrem'] },
    { key: 'cm', label: 'CM',
      types: ['allgemeines', 'aussage', 'sexbel'] }
  ];

  // Standard-Textbausteine der Mentoren-Nachricht. Diese koennen vom Nutzer in den
  // Einstellungen ueberschrieben werden; hier stehen jeweils die Vorgabewerte.
  // Verfuegbare Platzhalter:
  //   {name}   -> Anrede des Schuetzlings (Name oder Nick)        [greeting]
  //   {n}      -> Anzahl                                          [bulk]
  //   {plural} -> "Meldung" / "Meldungen"                        [bulk]
  //   {mentor} -> eigener Name                                   [signature]
  const DEFAULT_TEXTS = {
    greeting: 'Hallo {name},',
    intro: 'es war mal wieder Zeit für die routinemäßige Stichprobenkontrolle, dabei ist mir folgendes aufgefallen:',
    positiveHeader: 'Positiv sind mir folgende Meldungen aufgefallen:',
    positiveBulk: 'Des Weiteren habe ich {n} weitere {plural} kontrolliert, zu denen ich keine Beanstandungen hatte. Das ist wirklich sehr gut!',
    outro: 'Bitte sehe das nicht als Kritik sondern als reines Verbesserungspotential. Wenn du Fragen hast, komme gerne auf mich zu.  :-)',
    signature: 'Liebe Grüße\n{mentor}'
  };

  // Reihenfolge/Beschriftung der Textfelder in den Einstellungen
  const TEXT_FIELDS = [
    { key: 'greeting',       label: 'Anrede',                 hint: 'Platzhalter: {name}' },
    { key: 'intro',          label: 'Einleitung',             hint: '' },
    { key: 'positiveHeader', label: 'Überschrift Positives',  hint: 'Vor den positiv kommentierten Meldungen' },
    { key: 'positiveBulk',   label: 'Sammelsatz Positives',   hint: 'Für „In Ordnung" ohne Kommentar. Platzhalter: {n}, {plural}' },
    { key: 'outro',          label: 'Schlusstext',            hint: '' },
    { key: 'signature',      label: 'Grußformel',             hint: 'Platzhalter: {mentor} (eigener Name). Leer = keine Grußformel' }
  ];

  /* =========================================================================
   *  HILFSFUNKTIONEN
   * =======================================================================*/

  function uuid() {
    return 'm-xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = crypto.getRandomValues(new Uint8Array(1))[0] & 15;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function enc(v) { return encodeURIComponent(String(v)).replace(/%20/g, '+'); }

  function normalizeNick(n) { return (n || '').trim().toLowerCase().replace(/\s+/g, ' '); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function formatReportNumber(id) {
    return '*' + Number(id).toLocaleString('de-DE');
  }

  function fmtMeldungId(reportNumber) {
    const num = String(reportNumber || '');
    switch (MELDUNG_ID_FORMAT) {
      case 'plain':   return num.replace(/[*.\s]/g, '');
      case 'starred': return num;
      case 'dotted':
      default:        return num.replace(/^\*/, '');
    }
  }

  function baseUri() { return window.location.origin; }
  function viewcaseUrl(reportId) {
    return baseUri() + '/ac/ac_viewcase.pl?domain=knuddels.de&id=' + reportId;
  }

  // Wandelt "TT.MM.JJJJ" oder "TT.MM.JJ" in ein Date (Tagesanfang). null bei ungueltig.
  function parseDateInput(str) {
    str = (str || '').trim();
    const m = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
    if (!m) return null;
    let y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    const d = new Date(y, parseInt(m[2], 10) - 1, parseInt(m[1], 10));
    return isNaN(d.getTime()) ? null : d;
  }

  // Datum aus einer Suchergebnis-Zeile ("26.06.26, 10:26") als Date. null bei ungueltig.
  function parseRowDate(str) {
    const m = (str || '').match(/(\d{2})\.(\d{2})\.(\d{2,4})/);
    if (!m) return null;
    let y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    const d = new Date(y, parseInt(m[2], 10) - 1, parseInt(m[1], 10));
    return isNaN(d.getTime()) ? null : d;
  }

  function fmtDateDE(d) {
    if (!d) return '';
    const p = n => (n < 10 ? '0' : '') + n;
    return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear();
  }

  // Neuestes bereits kontrolliertes Meldungsdatum eines Schuetzlings (Date oder null).
  // Aus den gespeicherten reportDate-Werten der Bewertungen abgeleitet.
  function lastControlledDate(protegeId) {
    let max = null;
    Store.reviewsFor(protegeId).forEach(r => {
      const d = parseRowDate(r.reportDate || '');
      if (d && (!max || d > max)) max = d;
    });
    return max;
  }

  // Effektive Untergrenze fuer die Zufallsstichprobe: die spaetere von
  // manuellem "Kontrolle ab Datum" und dem neuesten kontrollierten Datum.
  function effectiveFromDate(protege) {
    const manual = parseDateInput(protege.searchFrom);
    const last = lastControlledDate(protege.id);
    if (manual && last) return last > manual ? last : manual;
    return manual || last || null;
  }

  /* =========================================================================
   *  DATENMODELL
   * =======================================================================*/

  function Protege(o) {
    o = o || {};
    this.id = o.id || uuid();
    this.nick = o.nick || '';
    this.name = o.name || '';
    this.meldesystemLink = o.meldesystemLink || '';
    this.forumLink = o.forumLink || '';
    // Standard: KEINE Kategorie vorausgewaehlt -> bewusst anklicken
    this.reportTypes = o.reportTypes || [];
    // Datum (TT.MM.JJJJ), ab dem Meldungen beruecksichtigt werden (leer = keine Grenze)
    this.searchFrom = o.searchFrom || '';
  }

  function Review(o) {
    o = o || {};
    this.id = o.id || uuid();
    this.protegeId = o.protegeId;
    this.reportId = o.reportId;
    this.reportNumber = o.reportNumber || '';
    this.typeText = o.typeText || '';
    this.rating = o.rating || '';      // 'ok' | 'notok'
    this.comment = o.comment || '';
    this.sent = !!o.sent;
    this.date = o.date || Date.now();  // Zeitpunkt der Sichtung
    this.reportDate = o.reportDate || ''; // Datum der Meldung (Roh-Text aus der Suche)
  }

  function defaultSettings() {
    return { mentorName: '', texts: Object.assign({}, DEFAULT_TEXTS) };
  }

  const Store = {
    proteges: [],
    reviews: [],
    settings: defaultSettings(),
    queue: [],   // aus der nativen Suche vorgemerkte Meldungen (persistent)
    load() {
      try { this.proteges = (JSON.parse(localStorage.getItem('mentorProteges')) || []).map(p => new Protege(p)); }
      catch (e) { this.proteges = []; }
      try { this.reviews = (JSON.parse(localStorage.getItem('mentorReviews')) || []).map(r => new Review(r)); }
      catch (e) { this.reviews = []; }
      try {
        const s = JSON.parse(localStorage.getItem('mentorSettings')) || {};
        this.settings = defaultSettings();
        if (typeof s.mentorName === 'string') this.settings.mentorName = s.mentorName;
        // Fehlende Text-Schluessel mit Default auffuellen (vorwaertskompatibel)
        this.settings.texts = Object.assign({}, DEFAULT_TEXTS, s.texts || {});
      } catch (e) { this.settings = defaultSettings(); }
      try { this.queue = JSON.parse(localStorage.getItem('mentorQueue')) || []; }
      catch (e) { this.queue = []; }
    },
    save() {
      localStorage.setItem('mentorProteges', JSON.stringify(this.proteges));
      localStorage.setItem('mentorReviews', JSON.stringify(this.reviews));
      localStorage.setItem('mentorSettings', JSON.stringify(this.settings));
      localStorage.setItem('mentorQueue', JSON.stringify(this.queue));
    },
    // Liefert einen Textbaustein (Nutzerwert, sonst Default)
    text(key) {
      const t = this.settings.texts || {};
      return (t[key] != null && t[key] !== undefined) ? t[key] : DEFAULT_TEXTS[key];
    },
    protege(id) { return this.proteges.find(p => p.id === id); },
    reviewsFor(id) { return this.reviews.filter(r => r.protegeId === id); },
    findReview(protegeId, reportId) {
      return this.reviews.find(r => r.protegeId === protegeId && r.reportId === reportId);
    },
    // ---- Warteschlange (Vormerkungen aus der nativen Suche) ----
    queueFor(protegeId) { return this.queue.filter(q => q.protegeId === protegeId); },
    queueHas(protegeId, reportId) {
      return this.queue.some(q => q.protegeId === protegeId && q.reportId === reportId);
    },
    addToQueue(entry) {
      if (!this.queueHas(entry.protegeId, entry.reportId)) this.queue.push(entry);
    },
    removeFromQueue(protegeId, reportId) {
      this.queue = this.queue.filter(q => !(q.protegeId === protegeId && q.reportId === reportId));
    },
    clearQueueFor(protegeId) {
      this.queue = this.queue.filter(q => q.protegeId !== protegeId);
    }
  };

  function findProtegeByNick(nick) {
    const n = normalizeNick(nick);
    return Store.proteges.find(p => normalizeNick(p.nick) === n);
  }

  // Zerlegt eine kommagetrennte (oder zeilenweise) Nick-Liste in saubere Eintraege.
  // Doppelte (case-insensitiv) werden zusammengefasst; Reihenfolge bleibt erhalten.
  function parseNickList(str) {
    const out = [];
    const seen = new Set();
    (str || '').split(/[,;\n]+/).forEach(part => {
      const nick = part.trim();
      if (!nick) return;
      const key = normalizeNick(nick);
      if (seen.has(key)) return;
      seen.add(key);
      out.push(nick);
    });
    return out;
  }

  /* =========================================================================
   *  STYLING (gescopt unter #mentorRoot, Constructable Stylesheet -> wird
   *  von Extended Admincall NICHT ueberschrieben)
   * =======================================================================*/

  function buildCss() {
    return `
    #mentorRoot, #mentorRoot * { box-sizing: border-box; }
    #mentorRoot {
      --acc: 175,142,232;
      --bg: #1c1c1c; --panel: #242424; --panel2:#000; --text:#f2f2f2;
      --border:#000; --muted:#9a9a9a; --field:#000; --fieldtext:#fff;
      --row:#000; --rowalt:#1c1c1c;
      font-family: "Dosis", sans-serif; font-size:14px;
    }
    #mentorRoot.mentor-light {
      --bg:#fff; --panel:#fff; --panel2:#f7f7f7; --text:#222;
      --border:#e6e6e6; --muted:#777; --field:#fff; --fieldtext:#222;
      --row:#fff; --rowalt:#eee;
    }

    /* Overlay + Modal */
    #mentorRoot .mentor-overlay {
      display:none; position:fixed; inset:0; z-index:99999;
      background: rgba(0,0,0,.7); padding-top:60px;
    }
    #mentorRoot .mentor-overlay.open { display:block; }
    #mentorRoot .mentor-modal {
      background: var(--bg); color: var(--text);
      width: 880px; max-width: 95%; height: 86vh; margin:auto;
      border:1px solid #888; border-radius:10px; padding:18px 22px;
      position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
      display:flex; flex-direction:column;
      font-family:"Dosis", sans-serif; line-height:1.4; font-size:14px;
    }
    /* Ueberschriften-Reset: die rohe Knuddels-Seite gibt h2/h3/h4 einen festen
       Rahmen / Hintergrund / fixe Hoehe. Das hier neutralisiert das, damit der
       Titel auch OHNE das Extended-Admincall-Skript sauber aussieht. */
    #mentorRoot h1, #mentorRoot h2, #mentorRoot h3, #mentorRoot h4 {
      border: none !important; background: none !important; box-shadow: none !important;
      height: auto !important; min-height: 0 !important; max-height: none !important;
      width: auto !important; min-width: 0 !important; max-width: none !important;
      line-height: 1.35 !important; text-indent: 0 !important; text-align: left !important;
      text-transform: none !important; letter-spacing: normal !important;
      background-image: none !important; overflow: visible !important;
      font-family: "Dosis", sans-serif !important; color: var(--text);
    }
    #mentorRoot .mentor-head { display:flex; align-items:center; justify-content:space-between; flex:0 0 auto; padding:4px 0 6px; }
    #mentorRoot .mentor-head h2 {
      margin:0 !important; padding:2px 0 !important; font-size:22px !important; font-weight:bold;
      white-space:nowrap;
    }
    #mentorRoot .mentor-close {
      cursor:pointer; font-size:26px; font-weight:bold; color:#aaa; line-height:1;
      background:none; border:none; flex:0 0 auto;
    }
    #mentorRoot .mentor-close:hover { color: rgba(var(--acc),1); }

    /* Tabs */
    #mentorRoot .mentor-tabs { display:flex; gap:4px; margin:12px 0 0 0; }
    #mentorRoot .mentor-tab {
      padding:8px 14px; cursor:pointer; font-weight:bold; font-size:14px;
      background: rgba(var(--acc),.18); color:var(--text);
      border-top-left-radius:5px; border-top-right-radius:5px;
      border:1px solid rgba(0,0,0,.2); border-bottom:none;
    }
    #mentorRoot .mentor-tab.active { background: var(--panel); }
    #mentorRoot .mentor-body {
      flex:1; overflow-y:auto; overflow-x:hidden; padding:14px;
      background: var(--panel); border:1px solid rgba(0,0,0,.2);
      border-top:none; border-radius:0 0 6px 6px;
    }

    /* Cards */
    #mentorRoot .mwrap {
      border:1px solid var(--border); border-radius:5px; padding:12px; margin-bottom:12px;
      background: var(--panel2);
    }
    #mentorRoot .mwrap:hover { border-color: rgba(var(--acc),1); }
    #mentorRoot .mwrap.reviewed { border-left:4px solid #0A0; }
    #mentorRoot .mwrap.unsent  { border-left:4px solid DarkSalmon; }

    #mentorRoot h3 { margin:4px 0 12px; }
    #mentorRoot h4 { margin:14px 0 8px; }
    #mentorRoot a { color: rgba(var(--acc),1); font-weight:bold; text-decoration:none; }
    #mentorRoot a:hover { color:#ff5555; }
    #mentorRoot .muted { color: var(--muted); font-size:12px; }

    /* Buttons */
    #mentorRoot .mbtn {
      background: rgba(var(--acc),1); border:1px solid transparent !important; border-radius:3px !important;
      box-shadow: rgba(255,255,255,.4) 0 1px 0 0 inset; color:#fff; cursor:pointer;
      font-family:"Dosis",sans-serif !important; font-size:14px !important; font-weight:bold; line-height:1.15 !important;
      padding:5px 12px !important; margin:2px; white-space:nowrap; user-select:none;
      width:auto !important; height:auto !important; min-width:0 !important; text-transform:none !important;
      display:inline-block !important; vertical-align:middle;
    }
    #mentorRoot .mbtn:hover { background: rgba(var(--acc),.7); }
    #mentorRoot .mbtn:active { background: rgba(var(--acc),.3); box-shadow:none; }
    #mentorRoot .mbtn.alt { background: DarkSalmon; }
    #mentorRoot .mbtn.alt:hover { background: #e0937a; }
    #mentorRoot .mbtn.ok { background:#2e9e4f; }
    #mentorRoot .mbtn.ok:hover { background:#3cb863; }
    #mentorRoot .mbtn.bad { background:#c0392b; }
    #mentorRoot .mbtn.bad:hover { background:#d94e3f; }
    #mentorRoot .mbtn.ghost { background:transparent; color:var(--text); border:1px solid rgba(var(--acc),.6); box-shadow:none; }
    #mentorRoot .mbtn.ghost:hover { background: rgba(var(--acc),.15); }
    #mentorRoot .mbtn.sel { outline:3px solid rgba(var(--acc),.5); }

    /* Inputs */
    #mentorRoot input[type=text], #mentorRoot textarea, #mentorRoot select {
      background: var(--field); color: var(--fieldtext);
      border:1px solid rgba(var(--acc),.5); border-radius:4px;
      padding:5px 7px; font-family:"Dosis",sans-serif; font-size:14px;
    }
    #mentorRoot textarea { width:100%; min-height:60px; resize:vertical; }
    #mentorRoot label.cb { display:inline-flex; align-items:center; gap:5px; margin:3px 12px 3px 0; font-size:14px; cursor:pointer; }

    /* --- Absicherung gegen durchschlagende Standard-Styles der Knuddels-Seite ---
       Ohne den Extended Admincall faerbt die rohe Meldesystem-Seite (style0.css)
       globale Elemente wie td/th/select/Text hell bzw. mit dunkler Schrift. Diese
       Regeln koennen in unser Panel "durchschlagen", sodass dort graue/weisse
       oder schlecht lesbare Stellen entstehen (v.a. in Schuetzlinge, Eigene
       Einstellungen, Statistik). Die folgenden Regeln setzen die Farben INNERHALB
       des Panels explizit, damit es immer konsistent dunkel/lesbar bleibt - egal
       ob der Admincall laeuft oder nicht. Die Knuddels-Seite selbst wird NICHT
       angefasst. Steht bewusst VOR den .mtab-/Pill-Regeln, damit deren gewollte
       Akzentfarben erhalten bleiben. */
    #mentorRoot .mentor-body,
    #mentorRoot .mentor-body p, #mentorRoot .mentor-body div,
    #mentorRoot .mentor-body span, #mentorRoot .mentor-body b,
    #mentorRoot .mentor-body i, #mentorRoot .mentor-body small,
    #mentorRoot .mentor-body label, #mentorRoot .mentor-body li,
    #mentorRoot .mentor-body td, #mentorRoot .mentor-body th,
    #mentorRoot .mentor-body h3, #mentorRoot .mentor-body h4 {
      color: var(--text);
    }
    /* generische Tabellen ohne eigene Klasse nicht hell erben lassen */
    #mentorRoot .mentor-body table { background: transparent; border-collapse: collapse; }
    #mentorRoot .mentor-body tr,
    #mentorRoot .mentor-body td,
    #mentorRoot .mentor-body th { background-color: transparent; }
    /* alle Eingabefelder (ausser Haekchen) lesbar einfaerben */
    #mentorRoot .mentor-body input:not([type=checkbox]):not([type=radio]):not([type=file]),
    #mentorRoot .mentor-body select,
    #mentorRoot .mentor-body textarea {
      background: var(--field) !important; color: var(--fieldtext) !important;
    }

    /* Tabellen */
    #mentorRoot table.mtab {
      width:100% !important; border-collapse:collapse !important; font-size:14px;
      margin-top:6px; table-layout:auto !important; color:var(--text);
    }
    #mentorRoot table.mtab th {
      background: rgba(var(--acc),.5) !important; color:var(--text) !important;
      font-weight:bold; padding:6px 8px !important; text-align:left !important;
      border:none !important; height:auto !important; white-space:nowrap;
    }
    #mentorRoot table.mtab th:nth-child(even) { background: rgba(var(--acc),.65) !important; }
    #mentorRoot table.mtab td {
      padding:6px 8px !important; vertical-align:middle !important; color:var(--text) !important;
      border:none !important; border-bottom:1px solid rgba(128,128,128,.25) !important;
      background:transparent !important; height:auto !important; text-align:left !important;
    }
    #mentorRoot table.mtab tr:hover td { background: rgba(var(--acc),.12) !important; }
    #mentorRoot table.mtab tr.statsDetailRow:hover td { background: transparent !important; }
    #mentorRoot table.mtab tr.statsDetailRow > td { padding:0 !important; border-bottom:none !important; }
    #mentorRoot table.mtab tr.statsRow:hover td { background: rgba(var(--acc),.18) !important; }
    #mentorRoot table.mtab a { color: rgba(var(--acc),1) !important; text-decoration:underline; }

    #mentorRoot .pill {
      display:inline-block !important; font-size:11px; font-weight:bold;
      padding:2px 8px !important; border-radius:10px; margin-left:0; white-space:nowrap;
      border:none !important; line-height:1.4 !important;
    }
    #mentorRoot .pill.green { background:#0A0 !important; color:#fff !important; }
    #mentorRoot .pill.red { background:#c0392b !important; color:#fff !important; }
    #mentorRoot .pill.salmon { background:DarkSalmon !important; color:#fff !important; }
    #mentorRoot .pill.grey { background:#555 !important; color:#fff !important; }

    #mentorRoot .row-flex { display:flex; flex-wrap:wrap; gap:10px; align-items:center; }
    #mentorRoot .grow { flex:1 1 auto; }

    #mentorRoot .typebox { border:1px solid rgba(var(--acc),.4); border-radius:5px; padding:8px; margin:6px 0; }
    #mentorRoot iframe.preview { width:100%; height:560px; border:1px solid rgba(var(--acc),.5); border-radius:5px; margin-top:8px; background:#fff; }

    /* Toast */
    #mentorToastContainer { position:fixed; top:20px; right:20px; z-index:100001; }
    #mentorToastContainer .mt {
      background: rgba(50,50,50,.95); color:#fff; padding:12px 18px; border-radius:5px;
      box-shadow:0 3px 10px rgba(0,0,0,.3); margin-bottom:10px; font-family:"Dosis",sans-serif;
      font-size:14px; min-width:240px; max-width:360px; transform:translateX(420px); opacity:0;
      transition: transform .35s ease-out, opacity .3s ease-in;
    }
    #mentorToastContainer .mt.show { transform:translateX(0); opacity:1; }
    #mentorToastContainer .mt.hide { transform:translateX(420px); opacity:0; }
    #mentorToastContainer .mt a { color:#cbb6ff; text-decoration:none; }
    `;
  }

  let _fallbackStyleEl = null;
  function injectStyles() {
    const css = buildCss();
    try {
      if (typeof CSSStyleSheet !== 'undefined' && 'replaceSync' in CSSStyleSheet.prototype) {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(css);
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
        return;
      }
    } catch (e) { /* fall through */ }
    // Fallback (selten): eigenes <style>, das wir bei Bedarf neu befuellen
    _fallbackStyleEl = document.createElement('style');
    _fallbackStyleEl.id = 'mentorStyleFallback';
    _fallbackStyleEl.textContent = css;
    document.head.appendChild(_fallbackStyleEl);
  }
  function ensureStyles() {
    if (_fallbackStyleEl && !_fallbackStyleEl.textContent) {
      _fallbackStyleEl.textContent = buildCss();
    }
  }

  // WICHTIG: Wir laden Dosis BEWUSST NICHT selbst.
  // Der Extended Admincall laedt die Schrift ebenfalls nicht aktiv, sondern setzt
  // nur "font-family: Dosis, sans-serif" und nutzt das, was die Knuddels-Seite
  // bereitstellt. Wuerden wir Dosis hier per Google Fonts nachladen, saehe unser
  // Panel anders (schmaler/kleiner) aus als der Rest der Seite. Damit Mentor und
  // Admincall identisch aussehen, verlassen wir uns auf dieselbe Schrift-Aufloesung.
  function injectFont() {
    // Alten, von frueheren Versionen eingefuegten Font-Link wieder entfernen,
    // damit nach einem Update keine abweichende Schrift haengen bleibt.
    const old = document.getElementById('mentorFont');
    if (old) old.remove();
  }

  function currentTheme() {
    return (localStorage.getItem('reportStyle') || 'Dark') === 'Light' ? 'light' : 'dark';
  }

  /* =========================================================================
   *  TOAST
   * =======================================================================*/
  function toast(message, duration) {
    duration = duration || 5000;
    let c = document.getElementById('mentorToastContainer');
    if (!c) { c = document.createElement('div'); c.id = 'mentorToastContainer'; document.body.appendChild(c); }
    const $t = $('<div class="mt"></div>').html(message).appendTo(c);
    setTimeout(() => $t.addClass('show'), 50);
    setTimeout(() => { $t.removeClass('show').addClass('hide'); setTimeout(() => $t.remove(), 400); }, duration);
  }

  /* =========================================================================
   *  SUCHE / FETCH
   * =======================================================================*/

  function buildSearchUrl(nick, page) {
    const params = [
      ['domain', 'knuddels.de'], ['mode', 'search'], ['searchMyChannel', ''],
      ['page', page], ['involvednick', nick], ['involvementtype', '0'],
      ['involvedemail', ''], ['emailtype', '3'], ['excludednicks', ''],
      ['channels', ''], ['channeltype', '3'], ['state', '0']
    ];
    return baseUri() + '/ac/ac_search.pl?' + params.map(([k, v]) => enc(k) + '=' + enc(v)).join('&');
  }

  function gmGet(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET', url: url, timeout: 20000,
        overrideMimeType: 'text/html; charset=iso-8859-1',
        onload: r => resolve(r.responseText),
        onerror: () => reject(new Error('Netzwerkfehler')),
        ontimeout: () => reject(new Error('Timeout'))
      });
    });
  }

  function parseSearchRows(doc) {
    const rows = [];
    $(doc).find('table tr').each(function () {
      const $tds = $(this).children('td');
      if ($tds.length < 4) return;
      const $link = $tds.eq(0).find('a.blind');
      if (!$link.length) return;
      const href = $link.attr('href') || '';
      const idMatch = href.match(/id=(\d+)/);
      if (!idMatch) return;
      const reportId = idMatch[1];
      const reportNumber = $link.text().trim();
      const typeText = $tds.eq(1).text().trim();
      const $b = $tds.eq(2);
      const bearbeiter = $b.find('span').first().text().trim();
      let bewertung = '';
      const bm = $b.text().match(/Bewert\.:\s*(.+)/);
      if (bm) bewertung = bm[1].trim();
      const $s = $tds.eq(3);
      const spans = $s.find('span');
      const date = spans.eq(0).text().trim();
      const status = spans.eq(spans.length - 1).text().trim();
      rows.push({ reportId, reportNumber, typeText, bearbeiter, bewertung, date, status });
    });
    return rows;
  }

  function parseMaxPage(doc) {
    let max = 0;
    $(doc).find("a[href*='page=']").each(function () {
      const m = ($(this).attr('href') || '').match(/page=(\d+)/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return max; // hoechster verfuegbarer Seiten-Index (0-basiert)
  }

  function typeMatches(protege, typeText) {
    if (/^RwV/i.test(typeText)) return true; // RwV immer
    const cats = REPORT_CATEGORIES.filter(c => protege.reportTypes.includes(c.key));
    return cats.some(c => { try { return c.match(typeText); } catch (e) { return false; } });
  }

  // Liest aus dem HTML einer Meldungs-Detailseite (ac_viewcase.pl) den Nick
  // desjenigen, der die Meldung tatsaechlich BEWERTET hat.
  // Quelle: "HINWEIS: Meldung bereits bewertet (von: <b>NICK</b>, Berechtigt, ...)"
  // Gibt den Nick (String) oder '' zurueck, wenn nicht gefunden.
  function extractRaterNick(html) {
    try {
      const doc = $.parseHTML(html);
      let nick = '';

      // 1) Bevorzugt: der Hinweis "Meldung bereits bewertet (von: NICK, ...)"
      $(doc).find('p').each(function () {
        if (nick) return;
        const t = $(this).text().replace(/\s+/g, ' ').trim();
        const m = t.match(/Meldung bereits bewertet\s*\(von:\s*([^,]+?)\s*,/i);
        if (m) nick = m[1].trim();
      });
      if (nick) return nick;

      // 2) Fallback: gesamten Seitentext nach demselben Muster durchsuchen
      const whole = $(doc).text().replace(/\s+/g, ' ');
      const m2 = whole.match(/Meldung bereits bewertet\s*\(von:\s*([^,]+?)\s*,/i);
      if (m2) return m2[1].trim();

      return '';
    } catch (e) {
      return '';
    }
  }

  // Prueft per Detailseite, ob die Meldung vom Schuetzling bewertet wurde.
  // Cache, damit dieselbe Meldung nicht mehrfach geladen wird.
  const _raterCache = {};
  async function reportRatedByProtege(reportId, protege) {
    let rater = _raterCache[reportId];
    if (rater === undefined) {
      try {
        const html = await gmGet(viewcaseUrl(reportId));
        rater = extractRaterNick(html);
      } catch (e) {
        rater = '';
      }
      _raterCache[reportId] = rater;
    }
    if (!rater) return false;
    return normalizeNick(rater) === normalizeNick(protege.nick);
  }

  async function loadRandomReports(protege, count, onProgress) {
    const reviewedIds = new Set(Store.reviewsFor(protege.id).map(r => r.reportId));
    const fromDate = effectiveFromDate(protege);
    const candidates = [];
    const seen = new Set();

    // Vorauswahl aus der Suchliste: guenstige Filter (Status/Typ/Datum/bereits gesichtet).
    // Der angezeigte "letzte Bearbeiter" ist NICHT zuverlaessig der Bewerter, daher wird
    // er hier nur als grobe Vorauswahl genutzt und unten per Detailseite verifiziert.
    function collect(doc) {
      parseSearchRows(doc).forEach(row => {
        if (seen.has(row.reportId)) return;
        if (reviewedIds.has(row.reportId)) return;
        if (!/geschlossen/i.test(row.status)) return;
        if (!typeMatches(protege, row.typeText)) return;
        if (fromDate) {
          const rd = parseRowDate(row.date);
          if (!rd || rd < fromDate) return; // aelter als Startdatum -> raus
        }
        seen.add(row.reportId);
        candidates.push(row);
      });
    }

    if (onProgress) onProgress('Lade Seite 1 ...');
    const firstHtml = await gmGet(buildSearchUrl(protege.nick, 0));
    const firstDoc = $.parseHTML(firstHtml);
    const maxPage = parseMaxPage(firstDoc);
    collect(firstDoc);

    const pages = [];
    for (let p = 1; p <= maxPage; p++) pages.push(p);
    shuffle(pages);

    // Verifizierte Treffer: nur Meldungen, die der Schuetzling laut Detailseite
    // ("Meldung bereits bewertet (von: NICK ...)") wirklich bewertet hat.
    const verified = [];
    shuffle(candidates);

    async function verifyFrom(list) {
      for (let i = 0; i < list.length && verified.length < count; i++) {
        const row = list[i];
        if (onProgress) onProgress('Pruefe Meldungen ... (' + verified.length + ' von ' + count + ' bestaetigt)');
        if (await reportRatedByProtege(row.reportId, protege)) verified.push(row);
      }
    }

    await verifyFrom(candidates);

    let fetched = 1;
    // Solange noch nicht genug verifizierte gefunden: weitere Seiten laden und pruefen.
    while (verified.length < count && pages.length > 0 && fetched < MAX_PAGE_FETCH) {
      const p = pages.shift();
      if (onProgress) onProgress('Lade weitere Meldungen ... (' + verified.length + ' von ' + count + ' bestaetigt)');
      try {
        const before = candidates.length;
        const html = await gmGet(buildSearchUrl(protege.nick, p));
        collect($.parseHTML(html));
        const fresh = candidates.slice(before);
        shuffle(fresh);
        await verifyFrom(fresh);
      } catch (e) { /* Seite ueberspringen */ }
      fetched++;
    }

    // exhausted = alle Seiten gesehen und trotzdem weniger als gewuenscht bestaetigt
    const exhausted = (pages.length === 0) && (verified.length < count);
    return { reports: verified.slice(0, count), found: verified.length, exhausted };
  }

  // Liefert eine durchsuchbare Liste der Meldungen eines Schuetzlings (in Reihenfolge,
  // neueste zuerst). Inkl. bereits kontrollierter (markiert). Laedt seitenweise.
  // Liefert eine durchsuchbare Liste der Meldungen eines Schuetzlings (in Reihenfolge,
  // neueste zuerst). Bewusst OHNE Typ-/Datumsfilter: bei der manuellen Suche soll der
  // Nutzer ALLE abgeschlossenen Meldungen sehen (inkl. bereits kontrollierter) und frei
  // auswaehlen koennen. Die Filter gelten nur fuer die Zufalls-Stichprobe.
  async function browseReports(protege, maxPages, onProgress) {
    const prelim = [];
    const seen = new Set();

    // Vorauswahl: alle abgeschlossenen Meldungen einsammeln (der angezeigte
    // "letzte Bearbeiter" ist nicht zuverlaessig, daher hier nicht hart filtern).
    function collect(doc) {
      parseSearchRows(doc).forEach(row => {
        if (seen.has(row.reportId)) return;
        if (!/geschlossen/i.test(row.status)) return;
        seen.add(row.reportId);
        prelim.push(row);
      });
    }

    if (onProgress) onProgress('Lade Seite 1 ...');
    const firstHtml = await gmGet(buildSearchUrl(protege.nick, 0));
    const firstDoc = $.parseHTML(firstHtml);
    const maxPage = parseMaxPage(firstDoc);
    collect(firstDoc);

    const limit = Math.min(maxPages, maxPage);
    for (let p = 1; p <= limit; p++) {
      if (onProgress) onProgress('Lade Seite ' + (p + 1) + ' ... (' + prelim.length + ' gefunden)');
      try {
        const html = await gmGet(buildSearchUrl(protege.nick, p));
        collect($.parseHTML(html));
      } catch (e) { /* ueberspringen */ }
    }

    // Verifikation: nur Meldungen behalten, die der Schuetzling laut Detailseite
    // ("Meldung bereits bewertet (von: NICK ...)") tatsaechlich bewertet hat.
    const out = [];
    for (let i = 0; i < prelim.length; i++) {
      if (onProgress) onProgress('Pruefe Meldungen ... (' + out.length + ' bestaetigt, ' + (i + 1) + '/' + prelim.length + ')');
      if (await reportRatedByProtege(prelim[i].reportId, protege)) out.push(prelim[i]);
    }
    return out;
  }

  function parseManualInput(str) {
    str = (str || '').trim();
    if (!str) return null;
    let reportId = null;
    const m = str.match(/id=(\d+)/);
    if (m) reportId = m[1];
    else {
      const digits = str.replace(/[^\d]/g, '');
      if (digits.length >= 8) reportId = digits;
    }
    if (!reportId) return null;
    return {
      reportId, reportNumber: formatReportNumber(reportId),
      typeText: '(manuell)', bearbeiter: '', bewertung: '', date: '', status: 'geschlossen'
    };
  }

  /* =========================================================================
   *  NACHRICHT GENERIEREN
   * =======================================================================*/

  function generateMessage(protege) {
    const reviews = Store.reviewsFor(protege.id).filter(r => !r.sent);
    const negatives = reviews.filter(r => r.rating === 'notok');
    const positives = reviews.filter(r => r.rating === 'ok');
    const positivesWithText = positives.filter(r => (r.comment || '').trim());
    const positivesBulk = positives.filter(r => !(r.comment || '').trim());

    const block = list => list
      .map(r => '°>/meldung ' + fmtMeldungId(r.reportNumber) + '<° -\n' + (r.comment || '').trim())
      .join('\n\n');

    const parts = [];
    if (negatives.length) parts.push(block(negatives));

    // Positive mit eigenem Kommentar einzeln auffuehren
    if (positivesWithText.length) {
      const header = Store.text('positiveHeader').trim();
      parts.push((header ? header + '\n\n' : '') + block(positivesWithText));
    }

    // Positive ohne Kommentar als Sammelsatz
    if (positivesBulk.length) {
      const n = positivesBulk.length;
      const bulk = Store.text('positiveBulk')
        .replace(/\{n\}/g, n)
        .replace(/\{plural\}/g, n === 1 ? 'Meldung' : 'Meldungen')
        .trim();
      if (bulk) parts.push(bulk);
    }

    const body = parts.join('\n\n');

    const anrede = (protege.name || protege.nick);
    const greeting = Store.text('greeting').replace(/\{name\}/g, anrede);
    const intro = Store.text('intro').trim();
    const outro = Store.text('outro').trim();

    // Grußformel: nur wenn ein Name gesetzt ist UND die Vorlage nicht leer ist
    const mentorName = (Store.settings.mentorName || '').trim();
    const sigTpl = Store.text('signature');
    let signature = '';
    if (mentorName && sigTpl.trim()) {
      signature = '\n\n' + sigTpl.replace(/\{mentor\}/g, mentorName);
    }

    return greeting + '\n\n' +
      (intro ? intro + '\n\n' : '') +
      (body ? body + '\n\n' : '') +
      outro +
      signature;
  }

  function forumQuote(text) { return '[quote]\n' + text + '\n[/quote]'; }

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      ta.remove();
    }
  }

  /* =========================================================================
   *  UI
   * =======================================================================*/

  const state = {
    tab: 'control',          // 'control' | 'proteges' | 'settings' | 'stats'
    editProtege: null,       // Protege-Objekt im Formular (oder null)
    controlProtegeId: null,  // aktuell gewaehlter Schuetzling
    pending: [],             // aktuell geladene/zu sichtende Meldungen (nicht persistiert)
    loading: false,
    message: null,           // generierte Nachricht (Text)
    messageReviewIds: [],    // Reviews, die in der aktuellen Nachricht enthalten sind
    browseResults: null,     // Ergebnisliste der manuellen Suche (oder null)
    textsOpen: false,        // Textbausteine-Panel in Einstellungen aufgeklappt?
    statsOpen: {},           // ausgeklappte Schuetzlinge in der Statistik {id:true}
    compareResult: null      // Ergebnis des Schuetzlings-Abgleichs (Array oder null)
  };

  function buildShell() {
    if (document.getElementById('mentorRoot')) return;
    const root = document.createElement('div');
    root.id = 'mentorRoot';
    root.className = 'mentor-' + currentTheme();
    root.innerHTML = `
      <div class="mentor-overlay" id="mentorOverlay">
        <div class="mentor-modal">
          <div class="mentor-head">
            <h2>🎓 Mentoring</h2>
            <button class="mentor-close" id="mentorCloseBtn" title="Schließen">&times;</button>
          </div>
          <div class="mentor-tabs">
            <div class="mentor-tab" data-tab="control">🔍 Meldekontrolle</div>
            <div class="mentor-tab" data-tab="proteges">👥 Schützlinge</div>
            <div class="mentor-tab" data-tab="settings">⚙️ Eigene Einstellungen</div>
            <div class="mentor-tab" data-tab="stats">📊 Statistik</div>
          </div>
          <div class="mentor-body" id="mentorBody"></div>
        </div>
      </div>`;
    document.body.appendChild(root);

    $('#mentorCloseBtn').on('click', closeModal);
    $('#mentorOverlay').on('click', function (e) { if (e.target === this) closeModal(); });
    $(document).on('keydown', function (e) {
      if (e.key === 'Escape' && $('#mentorOverlay').hasClass('open')) closeModal();
    });
    $('#mentorRoot').on('click', '.mentor-tab', function () {
      state.tab = $(this).data('tab'); render();
    });
  }

  function openModal() {
    ensureStyles();
    $('#mentorRoot').attr('class', 'mentor-' + currentTheme());
    $('#mentorOverlay').addClass('open');
    render();
  }
  function closeModal() { $('#mentorOverlay').removeClass('open'); }

  function addNavLink() {
    const $navi = $('#navi');
    if (!$navi.length || $('#mentorNavLink').length) return;

    // Auf manchen Seiten (z. B. der Suche) endet die native Navigation bereits mit
    // einem " | "-Trenner. Wuerden wir nochmal " | " voranstellen, entstuenden zwei
    // Pipes. Daher: ein evtl. vorhandenes Trenner-Ende entfernen und genau einen
    // Separator setzen.
    let html = $navi.html().replace(/(\s*\|\s*)+$/, '');
    $navi.html(html + ' | <a href="#" id="mentorNavLink">Mentoring</a>');

    $(document).off('click.mentorNav').on('click.mentorNav', '#mentorNavLink', function (e) {
      e.preventDefault(); openModal();
    });
  }

  /* ---- Render-Verteiler ---- */
  function render() {
    $('#mentorRoot .mentor-tab').removeClass('active')
      .filter('[data-tab="' + state.tab + '"]').addClass('active');
    const $body = $('#mentorBody');
    if (state.tab === 'proteges') renderProteges($body);
    else if (state.tab === 'control') renderControl($body);
    else if (state.tab === 'settings') renderSettings($body);
    else renderStats($body);
  }

  /* ---- Tab: Schützlinge ---- */
  function renderProteges($body) {
    const editing = state.editProtege;
    let html = '<h3>👥 Schützlinge verwalten</h3>';

    // Formular
    const p = editing || new Protege();
    const isNew = !editing;
    html += '<div class="mwrap"><h4>' + (isNew ? 'Neuen Schützling anlegen' : 'Schützling bearbeiten') + '</h4>';
    html += '<table class="mtab" style="width:100%">';
    html += '<tr><td style="width:160px">Nickname</td><td><input type="text" id="pgNick" style="width:100%" value="' + esc(p.nick) + '"></td></tr>';
    html += '<tr><td>Name (Anrede)</td><td><input type="text" id="pgName" style="width:100%" value="' + esc(p.name) + '"></td></tr>';
    html += '<tr><td>Meldesystem-Link</td><td><div class="row-flex"><input type="text" id="pgMs" class="grow" placeholder="wird beim Speichern automatisch erzeugt, falls leer" value="' + esc(p.meldesystemLink) + '"><button class="mbtn ghost" id="pgGenMs">Aus Nick erzeugen</button></div></td></tr>';
    html += '<tr><td>Forum-Link</td><td><input type="text" id="pgForum" style="width:100%" value="' + esc(p.forumLink) + '"></td></tr>';
    html += '<tr><td>Kontrolle ab Datum</td><td><input type="text" id="pgFrom" style="width:160px" placeholder="TT.MM.JJJJ" value="' + esc(p.searchFrom) + '"> <span class="muted">Meldungen vor diesem Datum werden ignoriert (leer = keine Grenze)</span></td></tr>';
    html += '</table>';

    html += '<div class="typebox"><b>Berücksichtigte Meldetypen</b> <span class="muted">(RwV-Typen werden immer automatisch mit einbezogen)</span><br>';
    html += '<div class="row-flex" style="margin:6px 0 8px"><span>Vorauswahl nach Rolle:</span>' +
      '<select id="pgRolePreset"><option value="">– Rolle wählen –</option>';
    ROLE_PRESETS.forEach(r => { html += '<option value="' + r.key + '">' + esc(r.label) + '</option>'; });
    html += '</select><span class="muted">setzt genau die Typen der Rolle (überschreibt die Auswahl)</span></div>';
    REPORT_CATEGORIES.forEach(c => {
      const checked = p.reportTypes.includes(c.key) ? 'checked' : '';
      html += '<label class="cb"><input type="checkbox" class="pgType" value="' + c.key + '" ' + checked + '> ' + esc(c.label) + '</label>';
    });
    html += '</div>';
    html += '<div style="margin-top:8px"><button class="mbtn" id="pgSave">💾 Speichern</button>';
    if (!isNew) html += ' <button class="mbtn ghost" id="pgCancel">Abbrechen</button>';
    html += '</div></div>';

    // ----- Massen-Import (mehrere Nicks auf einmal) -----
    html += '<div class="mwrap"><h4>📋 Mehrere Schützlinge auf einmal anlegen</h4>';
    html += '<div class="muted" style="margin-bottom:6px">Nicknames mit Komma getrennt eingeben. Für jeden wird ein Schützling angelegt (Meldesystem-Suche wird automatisch erzeugt). ' +
      'Datum und Meldetypen unten gelten für alle. Bereits vorhandene bleiben erhalten – bei ihnen wird höchstens das Datum aktualisiert.</div>';
    html += '<textarea id="bulkNicks" placeholder="z. B.: MaxMuster, LisaMeier, TomSchmidt, AnnaKoch" style="min-height:70px"></textarea>';
    html += '<div class="row-flex" style="margin-top:8px"><div>Kontrolle ab Datum: <input type="text" id="bulkFrom" style="width:140px" placeholder="TT.MM.JJJJ"></div></div>';
    html += '<div class="typebox" style="margin-top:8px"><b>Meldetypen für alle</b> <span class="muted">(RwV immer automatisch)</span><br>';
    html += '<div class="row-flex" style="margin:6px 0 8px"><span>Vorauswahl nach Rolle:</span>' +
      '<select id="bulkRolePreset"><option value="">– Rolle wählen –</option>';
    ROLE_PRESETS.forEach(r => { html += '<option value="' + r.key + '">' + esc(r.label) + '</option>'; });
    html += '</select><span class="muted">setzt genau die Typen der Rolle (überschreibt die Auswahl)</span></div>';
    REPORT_CATEGORIES.forEach(c => {
      html += '<label class="cb"><input type="checkbox" class="bulkType" value="' + c.key + '"> ' + esc(c.label) + '</label>';
    });
    html += '</div>';
    html += '<div style="margin-top:8px"><button class="mbtn" id="bulkCreate">➕ Alle anlegen</button></div></div>';

    // ----- Abgleich (welche Schützlinge sind NICHT in der Liste?) -----
    html += '<div class="mwrap"><h4>🔄 Abgleich mit aktueller Liste</h4>';
    html += '<div class="muted" style="margin-bottom:6px">Aktuelle Nicks mit Komma getrennt eingeben. Angezeigt werden die vorhandenen Schützlinge, die <b>nicht</b> in deiner Liste stehen – z. B. weil sie nicht mehr kontrolliert werden müssen.</div>';
    html += '<textarea id="cmpNicks" placeholder="z. B.: MaxMuster, LisaMeier, TomSchmidt" style="min-height:60px"></textarea>';
    html += '<div style="margin-top:8px"><button class="mbtn ghost" id="cmpRun">🔍 Abgleichen</button></div>';
    if (state.compareResult) {
      const miss = state.compareResult;
      html += '<div style="margin-top:10px">';
      if (!miss.length) {
        html += '<div class="muted">Alle vorhandenen Schützlinge sind in deiner Liste enthalten. 👍</div>';
      } else {
        html += '<b>' + miss.length + ' nicht in deiner Liste:</b>';
        html += '<table class="mtab" style="margin-top:6px"><tr><th>Nick</th><th>Gesichtet</th><th>Aktion</th></tr>';
        miss.forEach(pr => {
          const revs = Store.reviewsFor(pr.id);
          html += '<tr><td><b>' + esc(pr.nick) + '</b>' + (pr.name ? ' <span class="muted">(' + esc(pr.name) + ')</span>' : '') + '</td>' +
            '<td>' + revs.length + '</td>' +
            '<td><button class="mbtn bad cmpDel" data-id="' + pr.id + '">❌ Löschen</button></td></tr>';
        });
        html += '</table>';
        html += '<div style="margin-top:8px"><button class="mbtn bad" id="cmpDelAll">❌ Alle ' + miss.length + ' löschen</button></div>';
      }
      html += '</div>';
    }
    html += '</div>';

    // Liste
    html += '<h4>Vorhandene Schützlinge (' + Store.proteges.length + ')</h4>';
    if (!Store.proteges.length) {
      html += '<div class="muted">Noch keine Schützlinge angelegt.</div>';
    } else {
      Store.proteges.forEach(pr => {
        const revs = Store.reviewsFor(pr.id);
        const pending = revs.filter(r => !r.sent).length;
        const typeLabels = REPORT_CATEGORIES.filter(c => pr.reportTypes.includes(c.key)).map(c => c.label);
        html += '<div class="mwrap">';
        html += '<div class="row-flex"><div class="grow"><b style="font-size:15px">' + esc(pr.nick) + '</b>';
        if (pr.name) html += ' <span class="muted">(' + esc(pr.name) + ')</span>';
        html += '<span class="pill grey">' + revs.length + ' gesichtet</span>';
        if (pending) html += '<span class="pill salmon">' + pending + ' Versand offen</span>';
        html += '</div>';
        html += '<div><button class="mbtn ghost pgEdit" data-id="' + pr.id + '">✏️ Bearbeiten</button>';
        html += ' <button class="mbtn bad pgDel" data-id="' + pr.id + '">❌</button></div></div>';
        html += '<div class="muted" style="margin-top:6px">Typen: ' + (typeLabels.length ? esc(typeLabels.join(', ')) : 'keine') + ' (+RwV)' + (pr.searchFrom ? ' &nbsp;•&nbsp; Kontrolle ab: ' + esc(pr.searchFrom) : '') + '</div>';
        const links = [];
        if (pr.meldesystemLink) links.push('<a href="' + esc(pr.meldesystemLink) + '" target="_blank">Meldesystem</a>');
        if (pr.forumLink) links.push('<a href="' + esc(pr.forumLink) + '" target="_blank">Forum</a>');
        if (links.length) html += '<div style="margin-top:4px">' + links.join(' &nbsp;|&nbsp; ') + '</div>';
        html += '</div>';
      });
    }

    $body.html(html);
    bindProtegesEvents();
  }

  function bindProtegesEvents() {
    // Setzt die Meldetypen-Checkboxen (Klasse cbClass) anhand einer Rolle.
    // "Ersetzen": genau die Typen der Rolle ankreuzen, alle anderen abwaehlen.
    function applyRolePreset(roleKey, cbClass) {
      const preset = ROLE_PRESETS.find(r => r.key === roleKey);
      if (!preset) return;
      const set = new Set(preset.types);
      $('.' + cbClass).each(function () {
        $(this).prop('checked', set.has($(this).val()));
      });
    }

    $('#pgRolePreset').on('change', function () {
      const key = $(this).val();
      if (!key) return;
      applyRolePreset(key, 'pgType');
    });

    $('#bulkRolePreset').on('change', function () {
      const key = $(this).val();
      if (!key) return;
      applyRolePreset(key, 'bulkType');
    });

    $('#pgGenMs').on('click', function () {
      const nick = $('#pgNick').val().trim();
      if (!nick) { toast('Bitte zuerst einen Nickname eingeben.'); return; }
      $('#pgMs').val(buildSearchUrl(nick, 0).replace('&involvementtype=0', '&involvementtype=3').replace('&state=0', '&state=2'));
    });

    $('#pgSave').on('click', function () {
      const nick = $('#pgNick').val().trim();
      if (!nick) { toast('Nickname ist ein Pflichtfeld.'); return; }
      const types = $('.pgType:checked').map(function () { return $(this).val(); }).get();
      let ms = $('#pgMs').val().trim();
      if (!ms) ms = buildSearchUrl(nick, 0).replace('&involvementtype=0', '&involvementtype=3').replace('&state=0', '&state=2');
      const from = $('#pgFrom').val().trim();
      if (from && !parseDateInput(from)) { toast('Datum bitte als TT.MM.JJJJ angeben.'); return; }

      if (state.editProtege) {
        const pr = state.editProtege;
        pr.nick = nick; pr.name = $('#pgName').val().trim();
        pr.meldesystemLink = ms; pr.forumLink = $('#pgForum').val().trim();
        pr.reportTypes = types; pr.searchFrom = from;
      } else {
        Store.proteges.push(new Protege({
          nick, name: $('#pgName').val().trim(), meldesystemLink: ms,
          forumLink: $('#pgForum').val().trim(), reportTypes: types, searchFrom: from
        }));
      }
      Store.save();
      state.editProtege = null;
      toast('Schützling gespeichert.');
      render();
    });

    $('#pgCancel').on('click', function () { state.editProtege = null; render(); });
    $('.pgEdit').on('click', function () { state.editProtege = Store.protege($(this).data('id')); render(); });
    $('.pgDel').on('click', function () {
      const pr = Store.protege($(this).data('id'));
      if (!pr) return;
      if (!confirm('Schützling "' + pr.nick + '" inkl. aller Sichtungen wirklich löschen?')) return;
      Store.proteges = Store.proteges.filter(x => x.id !== pr.id);
      Store.reviews = Store.reviews.filter(r => r.protegeId !== pr.id);
      Store.save(); toast('Gelöscht.'); render();
    });

    // ---- Massen-Import ----
    $('#bulkCreate').on('click', function () {
      const nicks = parseNickList($('#bulkNicks').val());
      if (!nicks.length) { toast('Bitte mindestens einen Nickname eingeben.'); return; }
      const from = $('#bulkFrom').val().trim();
      if (from && !parseDateInput(from)) { toast('Datum bitte als TT.MM.JJJJ angeben.'); return; }
      const types = $('.bulkType:checked').map(function () { return $(this).val(); }).get();

      let created = 0, updated = 0, untouched = 0;
      nicks.forEach(nick => {
        const existing = findProtegeByNick(nick);
        if (existing) {
          // Vorhandene bleiben erhalten; hoechstens das Datum aktualisieren
          if (from) { existing.searchFrom = from; updated++; }
          else untouched++;
        } else {
          const ms = buildSearchUrl(nick, 0)
            .replace('&involvementtype=0', '&involvementtype=3')
            .replace('&state=0', '&state=2');
          Store.proteges.push(new Protege({
            nick, name: '', meldesystemLink: ms, forumLink: '',
            reportTypes: types.slice(), searchFrom: from
          }));
          created++;
        }
      });
      Store.save();
      let msg = created + ' neu angelegt';
      if (updated) msg += ', ' + updated + ' Datum aktualisiert';
      if (untouched) msg += ', ' + untouched + ' unverändert';
      toast(msg + '.');
      render();
    });

    // ---- Abgleich ----
    $('#cmpRun').on('click', function () {
      const list = parseNickList($('#cmpNicks').val());
      if (!list.length) { toast('Bitte eine Vergleichsliste eingeben.'); return; }
      const inList = new Set(list.map(normalizeNick));
      state.compareResult = Store.proteges.filter(pr => !inList.has(normalizeNick(pr.nick)));
      if (!state.compareResult.length) toast('Alle vorhandenen Schützlinge sind in deiner Liste enthalten.');
      else toast(state.compareResult.length + ' Schützling(e) nicht in deiner Liste.');
      render();
    });

    $('.cmpDel').on('click', function () {
      const pr = Store.protege($(this).data('id'));
      if (!pr) return;
      if (!confirm('Schützling "' + pr.nick + '" inkl. aller Sichtungen wirklich löschen?')) return;
      Store.proteges = Store.proteges.filter(x => x.id !== pr.id);
      Store.reviews = Store.reviews.filter(r => r.protegeId !== pr.id);
      Store.clearQueueFor(pr.id);
      if (state.compareResult) state.compareResult = state.compareResult.filter(x => x.id !== pr.id);
      Store.save(); toast('Gelöscht.'); render();
    });

    $('#cmpDelAll').on('click', function () {
      const miss = state.compareResult || [];
      if (!miss.length) return;
      if (!confirm(miss.length + ' Schützling(e) inkl. aller Sichtungen wirklich löschen?')) return;
      const ids = new Set(miss.map(p => p.id));
      Store.proteges = Store.proteges.filter(x => !ids.has(x.id));
      Store.reviews = Store.reviews.filter(r => !ids.has(r.protegeId));
      Store.queue = Store.queue.filter(q => !ids.has(q.protegeId));
      state.compareResult = null;
      Store.save(); toast(ids.size + ' gelöscht.'); render();
    });
  }

  /* ---- Tab: Eigene Einstellungen ---- */
  function renderSettings($body) {
    let html = '<h3>⚙️ Eigene Einstellungen</h3>';

    // Eigener Name + Textbausteine
    html += '<div class="mwrap"><h4>Mentor / Nachricht</h4>';
    html += '<table class="mtab" style="width:100%"><tr><td style="width:160px">Eigener Name</td>' +
      '<td><input type="text" id="setMentorName" style="width:100%" placeholder="Wird in der Grußformel eingesetzt" value="' + esc(Store.settings.mentorName || '') + '">' +
      '<span class="muted">Wird über den Platzhalter {mentor} in der Grußformel eingesetzt. Leer = keine Grußformel.</span></td></tr></table>';

    html += '<details style="margin-top:10px"' + (state.textsOpen ? ' open' : '') + ' id="setTextsDetails">';
    html += '<summary style="cursor:pointer;font-weight:bold">✍️ Textbausteine der Nachricht anpassen</summary>';
    html += '<div class="muted" style="margin:6px 0">Standard ist bereits gesetzt – du kannst die Texte frei ändern. ' +
      'Platzhalter in geschweiften Klammern werden automatisch ersetzt.</div>';
    TEXT_FIELDS.forEach(f => {
      const val = Store.text(f.key);
      const rows = (f.key === 'intro' || f.key === 'outro' || f.key === 'positiveBulk') ? 3 : 2;
      html += '<div style="margin-top:8px"><label style="font-weight:bold">' + esc(f.label) + '</label>';
      if (f.hint) html += ' <span class="muted">(' + esc(f.hint) + ')</span>';
      html += '<textarea class="setText" data-key="' + f.key + '" rows="' + rows + '" style="width:100%;margin-top:3px">' + esc(val) + '</textarea></div>';
    });
    html += '</details>';

    html += '<div class="row-flex" style="margin-top:10px">' +
      '<button class="mbtn" id="setSave">💾 Einstellungen speichern</button>' +
      '<button class="mbtn ghost" id="setReset">↩️ Texte auf Standard zurücksetzen</button></div>';
    html += '</div>';

    // Sicherung (Komplett-Export/Import)
    html += '<div class="mwrap"><h4>💾 Sicherung</h4><div class="row-flex">' +
      '<button class="mbtn" id="mExport">⬇️ Sicherung exportieren</button>' +
      '<label class="mbtn ghost" for="mImport" style="cursor:pointer">⬆️ Sicherung importieren</label>' +
      '<input type="file" id="mImport" accept=".json" style="display:none"></div>' +
      '<div class="muted" style="margin-top:6px">Sichert <b>alles</b>: Schützlinge, alle Sichtungen/Bewertungen, Versandstatus, eigenen Namen und Textbausteine. ' +
      'Beim Import werden die aktuellen Daten ersetzt.</div></div>';

    $body.html(html);
    bindSettingsEvents();
  }

  function bindSettingsEvents() {
    $('#setTextsDetails').on('toggle', function () {
      state.textsOpen = this.open;
    });

    $('#setSave').on('click', function () {
      Store.settings.mentorName = $('#setMentorName').val().trim();
      // Textbausteine uebernehmen. Leeres Feld -> auf Default zuruecksetzen,
      // damit nie versehentlich ein komplett leerer Pflichttext entsteht.
      const texts = Object.assign({}, Store.settings.texts);
      $('.setText').each(function () {
        const key = $(this).data('key');
        const val = $(this).val();
        texts[key] = (val == null || val === '') ? DEFAULT_TEXTS[key] : val;
      });
      Store.settings.texts = texts;
      Store.save();
      toast('Einstellungen gespeichert.');
      render();
    });

    $('#setReset').on('click', function () {
      if (!confirm('Alle Textbausteine auf die Standardtexte zurücksetzen?\n(Dein eigener Name bleibt erhalten.)')) return;
      Store.settings.texts = Object.assign({}, DEFAULT_TEXTS);
      Store.save();
      state.textsOpen = true;
      toast('Textbausteine auf Standard zurückgesetzt.');
      render();
    });

    $('#mExport').on('click', function () {
      const data = {
        _type: 'ExtendedMentorBackup',
        _version: 1,
        _exportedAt: new Date().toISOString(),
        proteges: Store.proteges,
        reviews: Store.reviews,
        settings: Store.settings,
        queue: Store.queue
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const ts = new Date().toISOString().slice(0, 16).replace('T', '_').replace(/:/g, '-');
      a.download = 'mentor_sicherung_' + ts + '.json';
      a.click(); URL.revokeObjectURL(a.href);
      toast('Sicherung exportiert.');
    });

    $('#mImport').on('change', function () {
      const f = this.files[0]; if (!f) { return; }
      const input = this;
      const r = new FileReader();
      r.onload = e => {
        let data;
        try { data = JSON.parse(e.target.result); }
        catch (err) { toast('Import fehlgeschlagen: keine gültige JSON-Datei.'); input.value = ''; return; }
        if (!data || (!data.proteges && !data.reviews && !data.settings)) {
          toast('Import fehlgeschlagen: keine Mentor-Sicherung erkannt.'); input.value = ''; return;
        }
        const pCount = (data.proteges || []).length;
        const rCount = (data.reviews || []).length;
        if (!confirm('Sicherung importieren?\n\nSchützlinge: ' + pCount + '\nSichtungen: ' + rCount +
          '\n\nDie aktuellen Daten werden dadurch ersetzt.')) { input.value = ''; return; }
        try {
          Store.proteges = (data.proteges || []).map(p => new Protege(p));
          Store.reviews = (data.reviews || []).map(rv => new Review(rv));
          const s = data.settings || {};
          Store.settings = defaultSettings();
          if (typeof s.mentorName === 'string') Store.settings.mentorName = s.mentorName;
          Store.settings.texts = Object.assign({}, DEFAULT_TEXTS, s.texts || {});
          Store.queue = Array.isArray(data.queue) ? data.queue : [];
          Store.save(); toast('Sicherung erfolgreich importiert.'); render();
        } catch (err) { toast('Import fehlgeschlagen: ' + err.message); }
        input.value = '';
      };
      r.readAsText(f);
    });
  }

  /* ---- Tab: Meldekontrolle ---- */
  function renderControl($body) {
    let html = '<h3>🔍 Meldekontrolle</h3>';

    if (!Store.proteges.length) {
      html += '<div class="muted">Bitte zuerst im Tab „Schützlinge" einen Schützling anlegen.</div>';
      $body.html(html); return;
    }

    if (!state.controlProtegeId || !Store.protege(state.controlProtegeId)) {
      state.controlProtegeId = Store.proteges[0].id;
    }
    const protege = Store.protege(state.controlProtegeId);

    // Auswahl + Aktionen
    html += '<div class="mwrap"><div class="row-flex">';
    html += '<div>Schützling: <select id="ctlProtege">';
    Store.proteges.forEach(pr => {
      html += '<option value="' + pr.id + '"' + (pr.id === protege.id ? ' selected' : '') + '>' + esc(pr.nick) + (pr.name ? ' (' + esc(pr.name) + ')' : '') + '</option>';
    });
    html += '</select></div>';
    html += '<div class="grow"></div>';
    html += '<a href="' + esc(buildSearchUrl(protege.nick, 0)) + '" target="_blank" class="mbtn ghost" style="text-decoration:none">↗ Suche öffnen</a>';
    html += '</div>';

    html += '<div class="row-flex" style="margin-top:10px"><b>Zufällige Meldungen laden:</b>';
    html += '<button class="mbtn ghost ctlNone">Keine</button>';
    RANDOM_COUNTS.forEach(n => { html += '<button class="mbtn ctlRandom" data-n="' + n + '">' + n + '</button>'; });
    html += '<span class="muted">„Keine" leert die aktuelle Sichtung – du siehst dann direkt unten die offenen Befunde.</span>';
    html += '</div>';
    html += '<div class="row-flex" style="margin-top:8px"><input type="text" id="ctlManual" class="grow" placeholder="Meldung manuell hinzufügen: Nummer oder ac_viewcase-Link">';
    html += '<button class="mbtn ghost" id="ctlAddManual">+ Hinzufügen</button>';
    html += '<button class="mbtn ghost" id="ctlBrowse">🔎 Meldungen durchsuchen</button></div>';
    const revs = Store.reviewsFor(protege.id);
    const effFrom = effectiveFromDate(protege);
    const lastCtrl = lastControlledDate(protege.id);
    html += '<div class="muted" style="margin-top:6px">Bereits gesichtet (wird übersprungen): ' + revs.length + ' &nbsp;•&nbsp; Versand ausstehend: ' + revs.filter(r => !r.sent).length +
      (effFrom ? ' &nbsp;•&nbsp; Zufallssuche ab: <b>' + esc(fmtDateDE(effFrom)) + '</b>' + (lastCtrl && (!parseDateInput(protege.searchFrom) || lastCtrl >= parseDateInput(protege.searchFrom)) ? ' <span title="automatisch aus der letzten Kontrolle">(auto)</span>' : '') : '') +
      '</div>';
    html += '</div>';

    // Vorgemerkte Meldungen aus der nativen Suche
    const queued = Store.queueFor(protege.id);
    if (queued.length) {
      const notInPending = queued.filter(q => !state.pending.some(p => p.reportId === q.reportId));
      html += '<div class="mwrap" style="border:1px solid DarkSalmon">';
      html += '<div class="row-flex"><b class="grow">★ ' + queued.length + ' Meldung(en) aus der Suche vorgemerkt</b>';
      if (notInPending.length) html += '<button class="mbtn" id="ctlLoadQueue">→ In Kontrolle laden (' + notInPending.length + ')</button>';
      html += '<button class="mbtn ghost" id="ctlClearQueue">Vormerkungen verwerfen</button></div>';
      html += '<div class="muted" style="margin-top:4px">Diese hast du in der Knuddels-Suche vorgemerkt. Sie bleiben erhalten, bis du sie bewertest.</div>';
      html += '</div>';
    }

    // Ergebnisliste der manuellen Suche
    if (state.browseResults) {
      const done = state.browseResults.filter(r => Store.findReview(protege.id, r.reportId)).length;
      const open = state.browseResults.length - done;
      html += '<div class="mwrap"><div class="row-flex"><h4 style="margin:0" class="grow">🔎 Suchergebnis (' + state.browseResults.length + ')</h4>';
      html += '<button class="mbtn ghost" id="ctlBrowseClose">Schließen</button></div>';
      if (!state.browseResults.length) {
        html += '<div class="muted" style="margin-top:8px">Keine abgeschlossenen Meldungen für diesen Schützling gefunden.</div>';
      } else {
        html += '<div class="muted" style="margin-top:4px">Hier siehst du <b>alle</b> abgeschlossenen Meldungen dieses Schützlings ' +
          '(<span class="pill green" style="margin:0">✓ kontrolliert</span> ' + done + ' &nbsp;·&nbsp; ' +
          '<span class="pill grey" style="margin:0">offen</span> ' + open + '). ' +
          'Mit „→ In Kontrolle" nimmst du einen Eintrag in die aktuelle Sichtung – auch schon bewertete (zur Neubewertung).</div>';
        html += '<table class="mtab" style="margin-top:8px"><tr><th>Meldung</th><th>Typ</th><th>Datum</th><th>Status</th><th>Aktion</th></tr>';
        state.browseResults.forEach(row => {
          const rev = Store.findReview(protege.id, row.reportId);
          let badge = '<span class="pill grey">offen</span>';
          if (rev) {
            const cls = rev.rating === 'notok' ? 'red' : 'green';
            const lbl = (rev.rating === 'notok' ? '✗ negativ' : '✓ positiv') + (rev.sent ? ', versendet' : '');
            badge = '<span class="pill ' + cls + '">kontrolliert (' + lbl + ')</span>';
          }
          const inPending = state.pending.some(p => p.reportId === row.reportId);
          html += '<tr>' +
            '<td><a href="' + viewcaseUrl(row.reportId) + '" target="_blank">' + esc(row.reportNumber) + '</a></td>' +
            '<td>' + esc(row.typeText) + '</td>' +
            '<td style="white-space:nowrap">' + esc(row.date) + '</td>' +
            '<td>' + badge + '</td>' +
            '<td style="white-space:nowrap">' + (inPending
              ? '<span class="pill salmon">in Sichtung</span>'
              : '<button class="mbtn browseTake" data-id="' + row.reportId + '">→ In Kontrolle</button>') +
            '</td></tr>';
        });
        html += '</table>';
      }
      html += '</div>';
    }

    if (state.loading) {
      html += '<div class="mwrap" id="ctlLoading">⏳ ' + esc(state.loadingText || 'Lädt ...') + '</div>';
    }

    // Aktuelle Sichtung
    if (state.pending.length) {
      html += '<h4>Aktuelle Sichtung (' + state.pending.length + ')</h4>';
      state.pending.forEach((row, i) => { html += renderReviewCard(protege, row, i); });
    }

    // Offene Befunde + Nachricht
    const unsent = revs.filter(r => !r.sent);
    if (unsent.length) {
      html += '<h4>📋 Offene Befunde – Versand ausstehend (' + unsent.length + ')</h4>';
      unsent.forEach(r => {
        const cls = r.rating === 'notok' ? 'red' : 'green';
        const lbl = r.rating === 'notok' ? 'negativ' : 'positiv';
        html += '<div class="mwrap unsent"><div class="row-flex"><div class="grow">' +
          '<a href="' + viewcaseUrl(r.reportId) + '" target="_blank">' + esc(r.reportNumber) + '</a> ' +
          '<span class="pill ' + cls + '">' + lbl + '</span> <span class="muted">' + esc(r.typeText) + '</span></div>' +
          '<button class="mbtn ghost befundEdit" data-id="' + r.id + '">✏️</button>' +
          '<button class="mbtn bad befundDel" data-id="' + r.id + '">❌</button></div>' +
          '<div style="margin-top:4px;white-space:pre-wrap">' + esc(r.comment) + '</div></div>';
      });
      html += '<div style="margin-top:6px"><button class="mbtn" id="ctlGenMsg">✉️ Nachricht generieren</button></div>';
    }

    // Generierte Nachricht
    if (state.message != null) {
      const hasForum = !!(protege.forumLink && protege.forumLink.trim());
      html += '<div class="mwrap"><h4>✉️ Generierte Nachricht</h4>' +
        '<textarea id="ctlMsgText" style="min-height:240px">' + esc(state.message) + '</textarea>' +
        '<div class="row-flex" style="margin-top:8px">' +
        '<button class="mbtn" id="ctlCopyMsg">📋 Nachricht kopieren</button>' +
        (hasForum ? '<button class="mbtn ghost" id="ctlCopyForum">📋 Forum öffnen &amp; Text kopieren</button>' : '') +
        '<div class="grow"></div>' +
        '<button class="mbtn alt" id="ctlMarkSent">✅ Als versendet markieren</button>' +
        '</div><div class="muted" style="margin-top:6px">„Als versendet markieren" verschiebt die enthaltenen Befunde in die Statistik (kein Versand mehr ausstehend).</div></div>';
    }

    $body.html(html);
    bindControlEvents(protege);
  }

  function renderReviewCard(protege, row, idx) {
    const existing = Store.findReview(protege.id, row.reportId);
    const rating = existing ? existing.rating : '';
    const comment = existing ? existing.comment : '';
    const reviewedCls = existing ? ' reviewed' : '';

    let h = '<div class="mwrap' + reviewedCls + '" data-idx="' + idx + '">';
    h += '<div class="row-flex"><div class="grow">';
    h += '<a href="' + viewcaseUrl(row.reportId) + '" target="_blank">' + esc(row.reportNumber) + '</a> ';
    h += '<span class="muted">' + esc(row.typeText || '') + (row.date ? ' • ' + esc(row.date) : '') + '</span>';
    if (row.bewertung) h += ' <span class="pill grey">Bewert.: ' + esc(row.bewertung) + '</span>';
    if (existing) h += ' <span class="pill ' + (existing.rating === 'notok' ? 'red' : 'green') + '">gesichtet</span>';
    h += '</div>';
    h += '<button class="mbtn ghost rcPreview" data-idx="' + idx + '">👁 Vorschau</button></div>';
    h += '<div class="rcPreviewBox" data-idx="' + idx + '"></div>';
    h += '<div class="row-flex" style="margin-top:8px">';
    h += '<button class="mbtn ok rcRate' + (rating === 'ok' ? ' sel' : '') + '" data-idx="' + idx + '" data-r="ok">✅ In Ordnung</button>';
    h += '<button class="mbtn bad rcRate' + (rating === 'notok' ? ' sel' : '') + '" data-idx="' + idx + '" data-r="notok">❌ Nicht in Ordnung</button>';
    h += '</div>';
    h += '<textarea class="rcComment" data-idx="' + idx + '" placeholder="Begründung / Kommentar (bei „Nicht in Ordnung" Pflicht, bei „In Ordnung" optional)" style="margin-top:8px">' + esc(comment) + '</textarea>';
    h += '<div style="margin-top:6px"><button class="mbtn rcSave" data-idx="' + idx + '">💾 Bewertung speichern</button></div>';
    h += '</div>';
    return h;
  }

  function bindControlEvents(protege) {
    $('#ctlProtege').on('change', function () {
      state.controlProtegeId = $(this).val();
      state.pending = []; state.message = null; state.browseResults = null; render();
    });

    $('.ctlNone').on('click', function () {
      state.pending = []; state.message = null; render();
    });

    $('.ctlRandom').on('click', async function () {
      const n = parseInt($(this).data('n'), 10);
      if (state.loading) return;
      state.loading = true; state.loadingText = 'Starte Suche ...'; state.message = null;
      // Aktuelle Sichtung ersetzen, damit "5" auch wirklich genau 5 ergibt
      state.pending = [];
      render();
      try {
        const result = await loadRandomReports(protege, n, txt => {
          state.loadingText = txt;
          $('#ctlLoading').text('⏳ ' + txt);
        });
        state.pending = result.reports;
        state.loading = false;
        if (!result.reports.length) {
          toast('Keine neuen Meldungen mehr verfügbar – für diesen Schützling ist (ab dem Startdatum) alles kontrolliert. 🎉', 6000);
        } else if (result.exhausted) {
          toast('Es waren nur noch ' + result.reports.length + ' von ' + n + ' verfügbar – mehr gibt es ab dem Startdatum aktuell nicht.', 6000);
        } else {
          toast(result.reports.length + ' Meldung(en) geladen.');
        }
        render();
      } catch (e) {
        state.loading = false;
        toast('Fehler beim Laden: ' + e.message);
        render();
      }
    });

    $('#ctlAddManual').on('click', function () {
      const parsed = parseManualInput($('#ctlManual').val());
      if (!parsed) { toast('Konnte keine Melde-ID erkennen.'); return; }
      if (Store.findReview(protege.id, parsed.reportId)) { toast('Diese Meldung wurde bereits gesichtet.'); return; }
      if (state.pending.some(r => r.reportId === parsed.reportId)) { toast('Bereits in der Liste.'); return; }
      state.pending.unshift(parsed);
      render();
    });

    $('#ctlBrowse').on('click', async function () {
      if (state.loading) return;
      state.loading = true; state.loadingText = 'Durchsuche Meldungen ...'; render();
      try {
        const rows = await browseReports(protege, MAX_PAGE_FETCH, txt => {
          state.loadingText = txt;
          $('#ctlLoading').text('⏳ ' + txt);
        });
        state.browseResults = rows;
        state.loading = false;
        render();
      } catch (e) {
        state.loading = false;
        toast('Fehler bei der Suche: ' + e.message);
        render();
      }
    });

    $('#ctlBrowseClose').on('click', function () { state.browseResults = null; render(); });

    $('#ctlLoadQueue').on('click', function () {
      const queued = Store.queueFor(protege.id);
      let added = 0;
      queued.forEach(q => {
        if (state.pending.some(p => p.reportId === q.reportId)) return;
        state.pending.unshift({
          reportId: q.reportId, reportNumber: q.reportNumber, typeText: q.typeText,
          bearbeiter: q.bearbeiter, bewertung: q.bewertung, date: q.date,
          status: q.status || 'geschlossen'
        });
        added++;
      });
      toast(added ? added + ' vorgemerkte Meldung(en) geladen.' : 'Alle Vormerkungen sind bereits in der Sichtung.');
      render();
    });

    $('#ctlClearQueue').on('click', function () {
      if (!confirm('Alle Vormerkungen für „' + protege.nick + '" verwerfen?')) return;
      Store.clearQueueFor(protege.id);
      Store.save();
      toast('Vormerkungen verworfen.');
      render();
    });

    $('.browseTake').on('click', function () {
      const id = String($(this).data('id'));
      const row = (state.browseResults || []).find(r => r.reportId === id);
      if (!row) return;
      if (state.pending.some(r => r.reportId === id)) { toast('Bereits in der Sichtung.'); return; }
      state.pending.unshift(row);
      const rev = Store.findReview(protege.id, id);
      toast(rev ? 'In Kontrolle übernommen (vorhandene Bewertung wird angezeigt).' : 'In Kontrolle übernommen.');
      render();
    });

    $('.rcPreview').on('click', function () {
      const idx = $(this).data('idx');
      const $box = $('.rcPreviewBox[data-idx="' + idx + '"]');
      if ($box.children().length) { $box.empty(); return; }
      const row = state.pending[idx];
      $box.html('<iframe class="preview" src="' + viewcaseUrl(row.reportId) + '"></iframe>');
    });

    $('.rcRate').on('click', function () {
      const idx = $(this).data('idx');
      $('.rcRate[data-idx="' + idx + '"]').removeClass('sel');
      $(this).addClass('sel');
    });

    $('.rcSave').on('click', function () {
      const idx = $(this).data('idx');
      const row = state.pending[idx];
      const rating = $('.rcRate.sel[data-idx="' + idx + '"]').data('r');
      const comment = $('.rcComment[data-idx="' + idx + '"]').val().trim();
      if (!rating) { toast('Bitte „In Ordnung" oder „Nicht in Ordnung" wählen.'); return; }
      if (rating === 'notok' && !comment) { toast('Bei „Nicht in Ordnung" bitte eine Begründung angeben.'); return; }

      const existing = Store.findReview(protege.id, row.reportId);
      if (existing) {
        existing.rating = rating; existing.comment = comment;
        // Meldungsdatum nachtragen, falls noch nicht gesetzt (aeltere Bewertungen)
        if (!existing.reportDate && row.date) existing.reportDate = row.date;
      } else {
        Store.reviews.push(new Review({
          protegeId: protege.id, reportId: row.reportId, reportNumber: row.reportNumber,
          typeText: row.typeText, rating, comment, sent: false, reportDate: row.date || ''
        }));
      }
      Store.save();
      // Vormerkung (falls vorhanden) ist nun erledigt -> aus Queue entfernen
      Store.removeFromQueue(protege.id, row.reportId);
      Store.save();
      // aus pending entfernen -> landet in "Offene Befunde"
      state.pending.splice(idx, 1);
      toast('Bewertung gespeichert.');
      render();
    });

    $('.befundEdit').on('click', function () {
      const r = Store.reviews.find(x => x.id === $(this).data('id'));
      if (!r) return;
      // zurueck in pending zum Nachbearbeiten
      if (!state.pending.some(p => p.reportId === r.reportId)) {
        state.pending.unshift({ reportId: r.reportId, reportNumber: r.reportNumber, typeText: r.typeText, bewertung: '', date: r.reportDate || '', status: 'geschlossen' });
      }
      render();
    });
    $('.befundDel').on('click', function () {
      const id = $(this).data('id');
      const r = Store.reviews.find(x => x.id === id);
      if (!r) return;
      if (!confirm('Befund zu ' + r.reportNumber + ' wirklich löschen?')) return;
      Store.reviews = Store.reviews.filter(x => x.id !== id);
      Store.save(); render();
    });

    $('#ctlGenMsg').on('click', function () {
      const unsent = Store.reviewsFor(protege.id).filter(r => !r.sent);
      if (!unsent.length) { toast('Keine offenen Befunde vorhanden.'); return; }
      state.message = generateMessage(protege);
      state.messageReviewIds = unsent.map(r => r.id);
      render();
    });

    $('#ctlCopyMsg').on('click', function () {
      copyToClipboard($('#ctlMsgText').val());
      toast('Nachricht in die Zwischenablage kopiert.');
    });
    $('#ctlCopyForum').on('click', function () {
      // Erst Text in die Zwischenablage, dann das Forum im neuen Tab oeffnen.
      copyToClipboard(forumQuote($('#ctlMsgText').val()));
      const url = (protege.forumLink || '').trim();
      if (url) window.open(url, '_blank');
      toast('Forum-Kopie ([quote]) kopiert – Forum wird geöffnet.');
    });
    $('#ctlMarkSent').on('click', function () {
      if (!confirm('Die enthaltenen Befunde als versendet markieren?')) return;
      const ids = new Set(state.messageReviewIds);
      Store.reviews.forEach(r => { if (ids.has(r.id)) r.sent = true; });
      Store.save();
      state.message = null; state.messageReviewIds = [];
      toast('Als versendet markiert.');
      render();
    });
  }

  /* ---- Tab: Statistik ---- */
  function renderStats($body) {
    let html = '<h3>📊 Statistik</h3>';

    const all = Store.reviews;
    const totalOk = all.filter(r => r.rating === 'ok').length;
    const totalBad = all.filter(r => r.rating === 'notok').length;
    const totalPending = all.filter(r => !r.sent).length;
    const total = all.length;
    const quote = total ? Math.round((totalOk / total) * 100) : 0;

    html += '<div class="mwrap"><div class="row-flex">' +
      statBox('Gesichtet gesamt', total) +
      statBox('In Ordnung', totalOk, 'green') +
      statBox('Nicht in Ordnung', totalBad, 'red') +
      statBox('Versand ausstehend', totalPending, 'salmon') +
      statBox('OK-Quote', quote + '%') +
      '</div></div>';

    html += '<h4>Pro Schützling <span class="muted" style="font-weight:normal">(Zeile anklicken für Details)</span></h4>';
    if (!Store.proteges.length) {
      html += '<div class="muted">Keine Schützlinge.</div>';
    } else {
      html += '<table class="mtab"><tr><th></th><th>Schützling</th><th>Gesichtet</th><th>OK</th><th>Nicht OK</th><th>Quote</th><th>Versand offen</th></tr>';
      Store.proteges.forEach(pr => {
        const revs = Store.reviewsFor(pr.id);
        const ok = revs.filter(r => r.rating === 'ok').length;
        const bad = revs.filter(r => r.rating === 'notok').length;
        const pend = revs.filter(r => !r.sent).length;
        const q = revs.length ? Math.round((ok / revs.length) * 100) : 0;
        const col = q >= 90 ? '#0A0' : q >= 75 ? '#74DF00' : '#f00';
        const open = !!state.statsOpen[pr.id];
        const arrow = open ? '▾' : '▸';
        const cursor = revs.length ? 'cursor:pointer' : 'cursor:default;opacity:.6';
        html += '<tr class="statsRow" data-id="' + pr.id + '" style="' + cursor + '">' +
          '<td style="width:18px;text-align:center;font-weight:bold">' + (revs.length ? arrow : '') + '</td>' +
          '<td><b>' + esc(pr.nick) + '</b>' + (pr.name ? ' <span class="muted">(' + esc(pr.name) + ')</span>' : '') + '</td>' +
          '<td>' + revs.length + '</td>' +
          '<td style="color:#2e9e4f">' + ok + '</td>' +
          '<td style="color:#c0392b">' + bad + '</td>' +
          '<td style="color:' + col + ';font-weight:bold">' + (revs.length ? q + '%' : '–') + '</td>' +
          '<td>' + (pend ? '<span class="pill salmon">' + pend + '</span>' : '0') + '</td></tr>';

        // Detailzeile (aufgeklappt)
        if (open && revs.length) {
          html += '<tr class="statsDetailRow"><td></td><td colspan="6" style="padding:0">';
          html += renderStatsDetail(revs);
          html += '</td></tr>';
        }
      });
      html += '</table>';
    }

    // Reset-Bereich (nur wenn es überhaupt Auswertungen gibt)
    if (total) {
      html += '<div class="mwrap" style="margin-top:16px;border-color:#c0392b">' +
        '<h4 style="margin-top:0">🗑️ Statistik zurücksetzen</h4>' +
        '<div class="muted" style="margin-bottom:8px">Löscht alle ' + total + ' Auswertungen unwiderruflich und beginnt bei Null. ' +
        'Die Schützlinge selbst bleiben erhalten.</div>' +
        '<button class="mbtn bad" id="statsResetAll">🗑️ Gesamte Statistik zurücksetzen</button>' +
        '</div>';
    }

    $body.html(html);
    bindStatsEvents();
  }

  // Detailbereich: alle Bewertungen eines Schuetzlings (negativ zuerst, dann positiv)
  function renderStatsDetail(revs) {
    const order = { notok: 0, ok: 1 };
    const sorted = revs.slice().sort((a, b) => {
      const oa = order[a.rating] != null ? order[a.rating] : 2;
      const ob = order[b.rating] != null ? order[b.rating] : 2;
      if (oa !== ob) return oa - ob;
      return (b.date || 0) - (a.date || 0);
    });

    let h = '<div style="padding:8px 4px 12px">';
    h += '<table class="mtab" style="margin-top:0"><tr><th>Bewertung</th><th>Meldung</th><th>Typ</th><th>Kommentar</th><th>Versand</th><th></th></tr>';
    sorted.forEach(r => {
      const badge = r.rating === 'notok'
        ? '<span class="pill red">✗ nicht in Ordnung</span>'
        : '<span class="pill green">✓ in Ordnung</span>';
      const sent = r.sent ? '<span class="pill grey">versendet</span>' : '<span class="pill salmon">offen</span>';
      const dateStr = r.date ? new Date(r.date).toLocaleDateString('de-DE') : '';
      h += '<tr>' +
        '<td style="white-space:nowrap">' + badge + (dateStr ? '<div class="muted" style="margin-top:2px">' + esc(dateStr) + '</div>' : '') + '</td>' +
        '<td style="white-space:nowrap"><a href="' + viewcaseUrl(r.reportId) + '" target="_blank">' + esc(r.reportNumber || r.reportId) + '</a></td>' +
        '<td>' + esc(r.typeText || '') + '</td>' +
        '<td>' + (r.comment ? esc(r.comment) : '<span class="muted">–</span>') + '</td>' +
        '<td style="white-space:nowrap">' + sent + '</td>' +
        '<td style="white-space:nowrap;text-align:center"><button class="mbtn bad statsDelOne" data-id="' + r.id + '" title="Diese Auswertung löschen">❌</button></td>' +
        '</tr>';
    });
    h += '</table></div>';
    return h;
  }

  function bindStatsEvents() {
    $('.statsRow').on('click', function () {
      const id = $(this).data('id');
      if (!Store.reviewsFor(id).length) return; // nichts zum Aufklappen
      state.statsOpen[id] = !state.statsOpen[id];
      render();
    });

    // Einzelne Auswertung löschen (Klick darf die Zeile nicht auf-/zuklappen)
    $('.statsDelOne').on('click', function (e) {
      e.stopPropagation();
      const id = $(this).data('id');
      const r = Store.reviews.find(x => x.id === id);
      if (!r) return;
      if (!confirm('Diese Auswertung zu ' + (r.reportNumber || r.reportId) + ' wirklich aus der Statistik löschen?')) return;
      Store.reviews = Store.reviews.filter(x => x.id !== id);
      Store.save();
      toast('Auswertung gelöscht.');
      render();
    });

    // Gesamte Statistik zurücksetzen
    $('#statsResetAll').on('click', function () {
      const count = Store.reviews.length;
      if (!count) return;
      if (!confirm('Wirklich ALLE ' + count + ' Auswertungen löschen und die Statistik auf Null setzen?\n\nDie Schützlinge bleiben erhalten. Dieser Schritt kann nicht rückgängig gemacht werden.')) return;
      Store.reviews = [];
      Store.save();
      state.statsOpen = {};
      toast('Statistik wurde zurückgesetzt.');
      render();
    });
  }

  function statBox(label, value, color) {
    const c = color ? ({ green: '#2e9e4f', red: '#c0392b', salmon: 'DarkSalmon' }[color] || 'inherit') : 'inherit';
    return '<div style="flex:1;min-width:130px;text-align:center;padding:8px">' +
      '<div style="font-size:26px;font-weight:bold;color:' + c + '">' + esc(value) + '</div>' +
      '<div class="muted">' + esc(label) + '</div></div>';
  }

  /* =========================================================================
   *  INIT
   * =======================================================================*/
  /* =========================================================================
   *  NATIVE SUCHE ANREICHERN (ac_search.pl)
   *  Markiert bereits kontrollierte Meldungen und blendet bei Schuetzlingen
   *  einen "zur Kontrolle"-Button ein.
   * =======================================================================*/

  function isSearchPage() {
    return /ac_search\.pl/i.test(window.location.href);
  }

  // Kleiner Inline-Badge (die native Seite liegt NICHT unter #mentorRoot,
  // daher Inline-Styles statt CSS-Klassen).
  function nativeBadge(text, bg) {
    return '<span style="display:inline-block;background:' + bg + ';color:#fff;' +
      'font-size:11px;font-weight:bold;padding:1px 7px;border-radius:10px;' +
      'font-family:"Dosis", sans-serif;white-space:nowrap">' + text + '</span>';
  }

  function renderNativeRowMarker($cell, protege, row) {
    // vorhandenen Marker entfernen (Re-Render)
    $cell.find('.mentorNativeMarker').remove();

    const $wrap = $('<div class="mentorNativeMarker" style="margin-top:5px;line-height:1.6"></div>');
    const review = Store.findReview(protege.id, row.reportId);
    const queued = Store.queueHas(protege.id, row.reportId);

    if (review) {
      const bg = review.rating === 'notok' ? '#c0392b' : '#0A0';
      const lbl = (review.rating === 'notok' ? '\u2717 nicht i.O.' : '\u2713 in Ordnung') + (review.sent ? ', versendet' : '');
      $wrap.append(nativeBadge('kontrolliert (' + lbl + ')', bg));
    } else if (queued) {
      $wrap.append(nativeBadge('\u2605 vorgemerkt', 'DarkSalmon'));
    } else {
      const $btn = $('<button type="button" style="' +
        'background:rgb(175,142,232);color:#fff;border:1px solid transparent;border-radius:3px;' +
        'font-family:"Dosis", sans-serif;font-size:12px;font-weight:bold;padding:3px 9px;' +
        'cursor:pointer;white-space:nowrap">\u2192 zur Kontrolle</button>');
      $btn.on('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        Store.addToQueue({
          protegeId: protege.id, reportId: row.reportId, reportNumber: row.reportNumber,
          typeText: row.typeText, bearbeiter: row.bearbeiter, bewertung: row.bewertung,
          date: row.date, status: row.status
        });
        Store.save();
        renderNativeRowMarker($cell, protege, row);
        toast('Zur Kontrolle vorgemerkt (' + esc(protege.nick) + ').');
      });
      $wrap.append($btn);
    }
    $cell.append($wrap);
  }

  function augmentNativeSearch() {
    if (!isSearchPage()) return;

    $('table tr').each(function () {
      const $tr = $(this);
      const $tds = $tr.children('td');
      if ($tds.length < 4) return;
      const $link = $tds.eq(0).find('a.blind');
      if (!$link.length) return;
      const href = $link.attr('href') || '';
      const idMatch = href.match(/id=(\d+)/);
      if (!idMatch) return;

      const reportId = idMatch[1];
      const reportNumber = $link.text().trim();
      const typeText = $tds.eq(1).text().trim();
      const $b = $tds.eq(2);
      const bearbeiter = $b.find('span').first().text().trim();
      let bewertung = '';
      const bm = $b.text().match(/Bewert\.:\s*(.+)/);
      if (bm) bewertung = bm[1].trim();
      const $s = $tds.eq(3);
      const spans = $s.find('span');
      const date = spans.eq(0).text().trim();
      const status = spans.eq(spans.length - 1).text().trim();

      // Schnelle Heuristik fuer die LIVE-Suchseite: hier wird der angezeigte
      // "letzte Bearbeiter" genutzt, um nur bei Schuetzlingen einen Button
      // einzublenden. Ein Detailabruf pro Zeile waere hier zu langsam. Die
      // verlaessliche Bewerter-Pruefung (Detailseite) erfolgt in der Zufalls-
      // Stichprobe und der manuellen Suche im Mentor-Panel.
      const protege = findProtegeByNick(bearbeiter);
      if (!protege) return;

      renderNativeRowMarker($b, protege, { reportId, reportNumber, typeText, bearbeiter, bewertung, date, status });
    });
  }

  function init() {
    Store.load();
    injectFont();
    injectStyles();
    buildShell();
    addNavLink();
    // Falls Extended Admincall die Navigation spaeter umbaut, Link erneut setzen
    setTimeout(addNavLink, 1500);
    setTimeout(addNavLink, 3500);
    // Native Suchseite anreichern (mehrfach, falls die Seite spaeter umgebaut wird)
    augmentNativeSearch();
    setTimeout(augmentNativeSearch, 1200);
    setTimeout(augmentNativeSearch, 3000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
