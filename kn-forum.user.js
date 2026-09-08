// ==UserScript==
// @name         kn-forum
// @namespace    https://forum.knuddels.de/
// @version      1.15
// @description  Schaltet das Knuddels-Forum zwischen Originaldarstellung (Light) und einem dunklen Design im Stil des Extended Admincall um. Umschalter oben rechts, Auswahl wird gespeichert.
// @author       Kev
// @match        https://forum.knuddels.de/*
// @icon         https://forum.knuddels.de/favicon.ico
// @updateURL    https://raw.githubusercontent.com/kev2911/knuddels-skripts/refs/heads/main/kn-forum.user.js
// @downloadURL  https://raw.githubusercontent.com/kev2911/knuddels-skripts/refs/heads/main/kn-forum.user.js
// @run-at       document-start
// @grant        none
// ==/UserScript==

// Neu in 1.15:
// 1) Ungelesene Beiträge in der Themenansicht werden zuverlässig erkannt -
//    das Forum vergibt der Kopfzeile die Klasse "newsubjecttable"
//    (im hellen Original der rote Balken). Kennzeichnung: kräftiger
//    Akzentbalken links über Kopf- und Inhaltszeile, getönter Hintergrund.

// Neu in 1.13:
// 1) Ungelesene Themen werden auch dann erkannt, wenn sie angepinnt oder
//    geschlossen sind. Das Forum kennzeichnet solche Zeilen über das
//    Klassenpräfix "new-" (new-topicsubject ...), nicht über das Icon.

// Neu in 1.12:
// 1) Einstellungsfeld mit einklappbaren Bereichen, im Standard alles zu.
//    Die Foren stehen jetzt nach Kategorien gruppiert, jede Kategorie ist
//    eine eigene Klappbox mit eigenem Häkchen.

// Neu in 1.11:
// 1) Einstellungsfeld hinter dem Zahnrad neben dem Umschalter.
// 2) Pfad am Seitenende lässt sich dort abschalten (Standard: an).
// 3) Forenfilter: alle zugänglichen Foren stehen zur Auswahl, abgewählte
//    verschwinden aus den Übersichten. Die Liste stammt aus dem Auswahlfeld
//    "gehe zu folgendem Forum" und wird gespeichert.

// Neu in 1.10:
// 1) Der Pfad (Forum » Kategorie » Thema) wird zusätzlich über der Fußzeile
//    angezeigt - kein Hochscrollen mehr bei langen Themen.

// Neu in 1.09:
// 1) Innerhalb von Beiträgen wird keine Farbe mehr erzwungen (Überschriften,
//    Tabellen, Links, Formularelemente) - dort entscheidet allein die
//    Kontrastmessung. Beiträge mit eigenem CSS bleiben so erhalten.
// 2) Stark abgeblendete Bereiche (opacity) werden angehoben.

// Neu in 1.08:
// 1) Kopfleiste dunkel statt weiß - Logo, Maskottchen und der rote Balken
//    bleiben, nur ihre Fläche wechselt die Farbe.

// Neu in 1.07:
// 1) Lesbarkeit in Beiträgen wird jetzt gemessen statt geraten: für jeden
//    Text mit eigener Farbe wird der Kontrast zum tatsächlichen Hintergrund
//    berechnet und nur bei Bedarf aufgehellt oder abgedunkelt. Damit sind
//    auch UBBCode-Farben (<font color>) und HTML-Beiträge mit eigenem
//    hellem Grund abgedeckt.

// Neu in 1.05:
// 1) Helle Eck-Grafiken der Kopf- und Fußleiste (.hdbox/.ftbox .l und .r)
//    ausgeblendet - sie standen als graue Balken in den unteren Ecken.

// Neu in 1.04:
// 1) updateURL/downloadURL auf kn-forum.user.js korrigiert - der alte Pfad
//    ohne .user lieferte nach dem Umbenennen 404, Updates kamen nie an.

// Neu in 1.02:
// 1) Ungelesene Themen/Foren werden im Darkmode wieder deutlich markiert -
//    erkannt am Icon (newposts/newfolder), nicht mehr am Hintergrund.

// Neu in 1.01:
// 1) Auslieferung über GitHub (updateURL/downloadURL), Icon und Namespace gesetzt.
// 2) Scrollbar-Styling entfernt - es hat auf jedem Element gegriffen und die
//    Ecke (scrollbar-corner) hell stehen lassen. color-scheme: dark reicht.
// 3) Automatik gegen helle Restflächen (z. B. Markierung ungelesener Beiträge),
//    die aus Stylesheets kommen, die das Skript nicht kennt.
// 4) Textfarbe wird nicht mehr pauschal auf alles gesetzt - Farben in
//    Beiträgen bleiben erhalten.
// 5) Regeln für die Zusatz-Styles im Seitenkopf (Notizzeilen, Profil-Werdegang,
//    Statistiktabellen).

(function () {
    'use strict';

    var STORAGE_KEY  = 'kforum_theme';   // "light" | "dark"
    var ROOT_CLASS   = 'kdark';          // Klasse am <html>-Element im Darkmode
    var FIX_CLASS    = 'kforumLightFix'; // Marker für nachträglich abgedunkelte Flächen
    var UNREAD_CLASS = 'kforumUnread';   // Marker für Zeilen mit ungelesenen Beiträgen
    var POST_CLASS   = 'kforumPostLight';// Marker für Beitragsflächen mit eigenem hellen Grund
    var NEWPOST_CLASS = 'kforumNewPost'; // Kopfzeile eines ungelesenen Beitrags
    var NEWBODY_CLASS = 'kforumNewBody'; // zugehörige Inhaltszeile

    /* ------------------------------------------------------------------
     *  Farbpalette - hier anpassen
     * ----------------------------------------------------------------*/
    var COLORS = {
        accent:     'rgb(175, 142, 232)',
        accentSoft: 'rgba(175, 142, 232, 0.30)',
        accentHead: 'rgba(175, 142, 232, 0.50)',
        accentDark: 'rgb(82, 65, 110)',
        bg:         '#1c1c1c',
        panel:      '#242424',
        row1:       '#1f1f1f',
        row2:       '#262626',
        text:       '#f2f2f2',
        muted:      '#a0a0a0',
        border:     '#000000',
        inputBg:    '#000000',
        linkHover:  '#ff6b6b',
        modName:    '#8ab4f8'   // Ersatz für das dunkle #104e8b der Moderatoren-Nicks
    };

    // Ab dieser Summe aus R+G+B gilt ein Hintergrund als zu hell für den Darkmode
    var LIGHT_LIMIT = 360;

    /* ------------------------------------------------------------------
     *  Style, der immer aktiv ist (nur der Umschalter selbst)
     * ----------------------------------------------------------------*/
    function toggleCss() {
        return `
#kforumBar {
    position: fixed;
    top: 10px;
    right: 12px;
    z-index: 99999;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
    font-family: Verdana, Arial, sans-serif;
    font-size: 12px;
}

#kforumButtons { display: flex; gap: 6px; }

#kforumToggle,
#kforumSettingsBtn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    font-weight: bold;
    line-height: 1.4;
    color: #fff;
    background: ${COLORS.accent};
    border: 1px solid rgba(0, 0, 0, 0.35);
    border-radius: 14px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
    cursor: pointer;
    user-select: none;
}

#kforumSettingsBtn { padding: 4px 9px; font-size: 14px; }

#kforumToggle:hover,
#kforumSettingsBtn:hover { background: rgba(175, 142, 232, 0.75); }
#kforumToggle:active,
#kforumSettingsBtn:active { background: rgba(175, 142, 232, 0.45); }
#kforumToggle:focus-visible,
#kforumSettingsBtn:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
#kforumToggle .kforumIcon { font-size: 14px; line-height: 1; }

#kforumPanel {
    width: 300px;
    max-height: 70vh;
    overflow-y: auto;
    padding: 10px 12px;
    color: #1f2937;
    background: #ffffff;
    border: 1px solid #d1d5db;
    border-radius: 10px;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
    text-align: left;
}

#kforumPanel details.kforumGroup { border-top: 1px solid rgba(128, 128, 128, 0.3); }
#kforumPanel > details.kforumGroup:first-child { border-top: none; }

#kforumPanel summary {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 6px 0;
    font-weight: bold;
    cursor: pointer;
    list-style: none;
}

#kforumPanel summary::-webkit-details-marker { display: none; }

#kforumPanel summary::before {
    content: "\\203A";
    display: inline-block;
    font-size: 15px;
    line-height: 1;
    opacity: 0.7;
    transition: transform 0.15s ease;
}

#kforumPanel details[open] > summary::before { transform: rotate(90deg); }
#kforumPanel .kforumBody { padding: 0 0 8px 15px; }
#kforumPanel .kforumTools { margin: 0 0 5px; font-size: 11px; }
#kforumPanel .kforumTools a { color: ${COLORS.accent}; text-decoration: none; }
#kforumPanel .kforumHint { margin: 0 0 7px; font-size: 11px; opacity: 0.75; line-height: 1.45; }

#kforumPanel .kforumOption,
#kforumPanel .kforumBoard {
    display: flex;
    align-items: flex-start;
    gap: 7px;
    padding: 3px 0;
    line-height: 1.4;
    cursor: pointer;
}

#kforumPanel input[type="checkbox"] { margin: 2px 0 0; accent-color: ${COLORS.accent}; }
#kforumPanel .kforumDepth2 { padding-left: 14px; opacity: 0.9; }
#kforumPanel .kforumDepth3 { padding-left: 28px; opacity: 0.85; }

.${ROOT_CLASS} #kforumPanel {
    color: ${COLORS.text};
    background: ${COLORS.panel};
    border-color: #000000;
}
`;
    }

    /* ------------------------------------------------------------------
     *  Darkmode
     *  Alle Regeln hängen an html.kdark - dadurch höhere Spezifität als
     *  die Forums-Stylesheets, und Light bleibt komplett unangetastet.
     * ----------------------------------------------------------------*/
    function darkCss() {
        return `
.${ROOT_CLASS} {
    --k-accent:      ${COLORS.accent};
    --k-accent-soft: ${COLORS.accentSoft};
    --k-accent-head: ${COLORS.accentHead};
    --k-accent-dark: ${COLORS.accentDark};
    --k-bg:          ${COLORS.bg};
    --k-panel:       ${COLORS.panel};
    --k-row1:        ${COLORS.row1};
    --k-row2:        ${COLORS.row2};
    --k-text:        ${COLORS.text};
    --k-muted:       ${COLORS.muted};
    --k-border:      ${COLORS.border};
    --k-input:       ${COLORS.inputBg};

    /* regelt Scrollbalken, Auswahlfelder und Ecken ohne eigenes Styling */
    color-scheme: dark;
}

/* --- Grundflächen ------------------------------------------------- */
.${ROOT_CLASS},
.${ROOT_CLASS} body {
    background: var(--k-bg) !important;
    color: var(--k-text) !important;
}

.${ROOT_CLASS} #kbody,
.${ROOT_CLASS} #kdoc,
.${ROOT_CLASS} #bd1,
.${ROOT_CLASS} #bd2,
.${ROOT_CLASS} #bd3,
.${ROOT_CLASS} #yui-main,
.${ROOT_CLASS} #yui-main-content,
.${ROOT_CLASS} #kmain,
.${ROOT_CLASS} .forum,
.${ROOT_CLASS} #content,
.${ROOT_CLASS} #footer,
.${ROOT_CLASS} #ft,
.${ROOT_CLASS} #kft,
.${ROOT_CLASS} .ftbox .content,
.${ROOT_CLASS} .ftoutside,
.${ROOT_CLASS} #scrollenforcer,
.${ROOT_CLASS} td.body_col,
.${ROOT_CLASS} table.controlcontainer {
    background: transparent !important;
    color: var(--k-text) !important;
}

.${ROOT_CLASS} #yui-main-border .border { background: transparent !important; }

/* Kopfleiste: die weiße Fläche rund um Logo und Maskottchen dunkel setzen.
   Logo (.logo), Maskottchen (.mascot1/.mascot2) und der rote Balken (.hr)
   bleiben unangetastet - nur ihr Untergrund wechselt. */
.${ROOT_CLASS} #hd,
.${ROOT_CLASS} #khd,
.${ROOT_CLASS} #khd .hdbox,
.${ROOT_CLASS} #khd .hdbox > .content {
    background-color: var(--k-bg) !important;
    background-image: none !important;
    box-shadow: none !important;
    border: none !important;
}

/* Eck-Grafiken der Kopf-/Fußleiste: helle Bilder aus dem Original-Layout,
   die im Darkmode als graue Balken in den unteren Ecken stehen bleiben */
.${ROOT_CLASS} #khd .hdbox > .l,
.${ROOT_CLASS} #khd .hdbox > .r,
.${ROOT_CLASS} #kft .ftbox > .l,
.${ROOT_CLASS} #kft .ftbox > .r,
.${ROOT_CLASS} #kft .ftbox,
.${ROOT_CLASS} #kft .ftoutside {
    background-image: none !important;
    background-color: transparent !important;
    box-shadow: none !important;
    border: none !important;
}

/* --- Textfarbe ----------------------------------------------------
   Nur auf Strukturelemente des Forums. Innerhalb von Beiträgen wird
   nichts erzwungen - dort regelt die Kontrastmessung die Lesbarkeit,
   damit eigenes CSS der Beiträge erhalten bleibt. */
.${ROOT_CLASS} td:not(.post_inner *),
.${ROOT_CLASS} th:not(.post_inner *),
.${ROOT_CLASS} li:not(.post_inner *),
.${ROOT_CLASS} label:not(.post_inner *),
.${ROOT_CLASS} h1:not(.post_inner *),
.${ROOT_CLASS} h2:not(.post_inner *),
.${ROOT_CLASS} h3:not(.post_inner *),
.${ROOT_CLASS} h4:not(.post_inner *),
.${ROOT_CLASS} #content > div,
.${ROOT_CLASS} #ft div,
.${ROOT_CLASS} #ft li {
    color: var(--k-text) !important;
}

/* --- Links -------------------------------------------------------- */
.${ROOT_CLASS} a:not(.post_inner *),
.${ROOT_CLASS} a:visited:not(.post_inner *) {
    color: var(--k-accent) !important;
    font-weight: bold;
}

.${ROOT_CLASS} a:hover:not(.post_inner *) { color: ${COLORS.linkHover} !important; }

/* Moderatoren-Nicks: #104e8b ist auf dunklem Grund nicht lesbar */
.${ROOT_CLASS} .modname,
.${ROOT_CLASS} .globalmodname,
.${ROOT_CLASS} span[style*="#104E8B"],
.${ROOT_CLASS} span[style*="#104e8b"] {
    color: ${COLORS.modName} !important;
}

/* --- Rahmen der Inhaltsblöcke ------------------------------------- */
.${ROOT_CLASS} table.t_outer,
.${ROOT_CLASS} table.t_standard {
    background: var(--k-panel) !important;
    border: 1px solid var(--k-border) !important;
    border-radius: 6px;
}

.${ROOT_CLASS} table.t_inner { background: transparent !important; }

/* --- Tabellenköpfe ------------------------------------------------ */
.${ROOT_CLASS} th,
.${ROOT_CLASS} .tdheader,
.${ROOT_CLASS} td.tdheader,
.${ROOT_CLASS} th.category {
    background: var(--k-accent-head) !important;
    color: #fff !important;
    font-weight: bold;
}

.${ROOT_CLASS} th:nth-child(even) { background: var(--k-accent-dark) !important; }
.${ROOT_CLASS} .tdheader a { color: #fff !important; }
.${ROOT_CLASS} .tdheader a:hover { color: #1c1c1c !important; }

/* --- Zeilen (das Forum wechselt zwischen "alt-*" und "topic*") ----- */
.${ROOT_CLASS} td[class*="alt-1"],
.${ROOT_CLASS} td.newintopic,
.${ROOT_CLASS} td.topicicon,
.${ROOT_CLASS} td.topicsubject,
.${ROOT_CLASS} td.topicreplies,
.${ROOT_CLASS} td.topicviews,
.${ROOT_CLASS} td.topictime {
    background: var(--k-row1) !important;
}

.${ROOT_CLASS} td[class*="alt-2"],
.${ROOT_CLASS} td.alt-newintopic,
.${ROOT_CLASS} td.alt-topicicon,
.${ROOT_CLASS} td.alt-topicsubject,
.${ROOT_CLASS} td.alt-topicreplies,
.${ROOT_CLASS} td.alt-topicviews,
.${ROOT_CLASS} td.alt-topictime {
    background: var(--k-row2) !important;
}

/* Hover nur in den Listen, nicht über ganzen Beiträgen */
.${ROOT_CLASS} tr:hover > td[class*="topic"],
.${ROOT_CLASS} tr:hover > td[class*="forumtitle"],
.${ROOT_CLASS} tr:hover > td[class*="newinforum"],
.${ROOT_CLASS} tr:hover > td[class*="threadtotal"],
.${ROOT_CLASS} tr:hover > td[class*="posttotal"],
.${ROOT_CLASS} tr:hover > td[class*="posttime"],
.${ROOT_CLASS} tr:hover > td.inline_selector {
    background: var(--k-accent-soft) !important;
}

/* --- Markierungen ungelesener Beiträge ---------------------------- */
.${ROOT_CLASS} .newtotal {
    background: transparent !important;
    color: #FE9A2E !important;
}

/* Zeilen mit neuen Beiträgen: eigener Grundton + Balken links + kräftiger Titel.
   Die Klasse setzt das Skript anhand des Icons (newposts/newfolder). */
.${ROOT_CLASS} tr.${UNREAD_CLASS} > td {
    background: #2b2440 !important;
}

.${ROOT_CLASS} tr.${UNREAD_CLASS} > td:first-child {
    box-shadow: inset 4px 0 0 var(--k-accent);
}

.${ROOT_CLASS} tr.${UNREAD_CLASS} .topicsubject a,
.${ROOT_CLASS} tr.${UNREAD_CLASS} .alt-topicsubject a,
.${ROOT_CLASS} tr.${UNREAD_CLASS} .forumtitle > a,
.${ROOT_CLASS} tr.${UNREAD_CLASS} h1 a {
    color: #ffffff !important;
    font-weight: 700 !important;
}

.${ROOT_CLASS} tr.${UNREAD_CLASS} .forumdescript,
.${ROOT_CLASS} tr.${UNREAD_CLASS} .small,
.${ROOT_CLASS} tr.${UNREAD_CLASS} .date {
    color: #b9b3c9 !important;
}

.${ROOT_CLASS} .new,
.${ROOT_CLASS} .newpost,
.${ROOT_CLASS} .unread,
.${ROOT_CLASS} td.newinforum,
.${ROOT_CLASS} td.alt-newinforum {
    color: var(--k-text) !important;
}

/* Zeilen mit Notizen: helle Streifengrafik durch einen Balken ersetzen */
.${ROOT_CLASS} tr.notepad_notes_exist td {
    background-image: none !important;
}

.${ROOT_CLASS} tr.notepad_notes_exist td:first-child {
    box-shadow: inset 3px 0 0 var(--k-accent);
}

/* Neue Beiträge in der Themenansicht: kräftiger Balken links über den ganzen
   Beitrag, getönte Kopfzeile - im hellen Original ist das der rote Balken */
.${ROOT_CLASS} tr.${NEWPOST_CLASS} > td.subjecttable,
.${ROOT_CLASS} tr.${NEWPOST_CLASS} > td.newsubjecttable {
    background: #33294d !important;
    box-shadow: inset 5px 0 0 var(--k-accent);
}

.${ROOT_CLASS} tr.${NEWPOST_CLASS} > td > b {
    color: #ffffff !important;
}

.${ROOT_CLASS} tr.${NEWBODY_CLASS} > td {
    background: #241f33 !important;
}

.${ROOT_CLASS} tr.${NEWBODY_CLASS} > td:first-child {
    box-shadow: inset 5px 0 0 var(--k-accent);
}

/* --- Navigation, Brotkrumen, Fußzeile ----------------------------- */
.${ROOT_CLASS} td.navigation,
.${ROOT_CLASS} div.navigation {
    background: var(--k-accent-soft) !important;
    border-color: #3a3a3a !important;
}

.${ROOT_CLASS} td.breadcrumbs,
.${ROOT_CLASS} td.footer {
    background: var(--k-panel) !important;
}

/* --- Beiträge ----------------------------------------------------- */
.${ROOT_CLASS} td.subjecttable,
.${ROOT_CLASS} td.newsubjecttable { background: var(--k-accent-soft) !important; }

.${ROOT_CLASS} td.author-content,
.${ROOT_CLASS} td.post_top_link,
.${ROOT_CLASS} td.post-options {
    background: var(--k-row1) !important;
}

.${ROOT_CLASS} td.post-content,
.${ROOT_CLASS} .post_inner {
    background: transparent !important;
    color: var(--k-text) !important;
}

/* Zitate und Codeblöcke des UBB-Markups */
.${ROOT_CLASS} .ubbcode-block,
.${ROOT_CLASS} .ubbcode-header,
.${ROOT_CLASS} .ubbcode-body,
.${ROOT_CLASS} blockquote,
.${ROOT_CLASS} pre {
    background: #111 !important;
    border: 1px solid #3a3a3a !important;
    color: var(--k-text) !important;
}

/* Von Usern gesetzte schwarze Schrift im Beitragstext aufhellen */
.${ROOT_CLASS} .post_inner [style*="color: #000000"],
.${ROOT_CLASS} .post_inner [style*="color:#000000"],
.${ROOT_CLASS} .post_inner [style*="color: #000;"],
.${ROOT_CLASS} .post_inner [style*="color:#000;"],
.${ROOT_CLASS} .post_inner [style*="color: black"],
.${ROOT_CLASS} .post_inner [style*="color:black"] {
    color: var(--k-text) !important;
}

/* HTML-Beiträge mit eigenem hellen Hintergrund: dort bleibt die Schrift dunkel.
   Die Klasse setzt das Skript, wenn ein Element im Beitrag selbst eine helle
   Fläche mitbringt - sonst stünde helle Schrift auf hellem Grund. */
.${ROOT_CLASS} .${POST_CLASS} {
    color: #1a1a1a !important;
}

.${ROOT_CLASS} .${POST_CLASS} [style*="color: #000000"],
.${ROOT_CLASS} .${POST_CLASS} [style*="color:#000000"],
.${ROOT_CLASS} .${POST_CLASS} [style*="color: #000;"],
.${ROOT_CLASS} .${POST_CLASS} [style*="color:#000;"],
.${ROOT_CLASS} .${POST_CLASS} [style*="color: black"],
.${ROOT_CLASS} .${POST_CLASS} [style*="color:black"] {
    color: #1a1a1a !important;
}

/* --- Zusatz-Styles, die das Forum im Seitenkopf mitliefert -------- */
.${ROOT_CLASS} .profile_career {
    background-color: var(--k-panel) !important;
    border-color: #3a3a3a !important;
}

.${ROOT_CLASS} table.statistiktable td { border-top-color: #3a3a3a !important; }
.${ROOT_CLASS} abbr { border-bottom-color: #666 !important; }

/* --- Kleintext ---------------------------------------------------- */
.${ROOT_CLASS} .small,
.${ROOT_CLASS} .date,
.${ROOT_CLASS} .forumdescript,
.${ROOT_CLASS} .forum_extras,
.${ROOT_CLASS} .subforum_moderators {
    color: var(--k-muted) !important;
}

/* --- Popup-Menüs (Mein Bereich, Suche, Forumsoptionen) ------------ */
.${ROOT_CLASS} table.popup_menu,
.${ROOT_CLASS} .popup_menu_content,
.${ROOT_CLASS} .popup_menu_header {
    background: var(--k-panel) !important;
    border: 1px solid var(--k-border) !important;
    color: var(--k-text) !important;
}

.${ROOT_CLASS} .popup_menu_content:hover { background: var(--k-accent-soft) !important; }

/* --- Beitragseditor ----------------------------------------------- */
.${ROOT_CLASS} table.markup_panel,
.${ROOT_CLASS} .markup_panel_popup,
.${ROOT_CLASS} .markup_panel_unselect_text {
    background: var(--k-panel) !important;
    color: var(--k-text) !important;
    border-color: #3a3a3a !important;
}

.${ROOT_CLASS} .markup_panel_unselect_text:hover { background: var(--k-accent-soft) !important; }
.${ROOT_CLASS} .markup_panel_normal_button { filter: invert(88%); }

/* Farbwähler behält seine Originalfarben */
.${ROOT_CLASS} #colors-table td { background-image: none; }

/* --- Formulare ----------------------------------------------------
   Bedienelemente innerhalb von Beiträgen bleiben so, wie ihr Verfasser
   sie gestaltet hat (z. B. eigene Reiter mit aktivem Zustand). */
.${ROOT_CLASS} input[type="text"]:not(.post_inner *),
.${ROOT_CLASS} input[type="password"]:not(.post_inner *),
.${ROOT_CLASS} input[type="number"]:not(.post_inner *),
.${ROOT_CLASS} input[type="search"]:not(.post_inner *),
.${ROOT_CLASS} textarea:not(.post_inner *),
.${ROOT_CLASS} select:not(.post_inner *) {
    background: var(--k-input) !important;
    color: var(--k-text) !important;
    border: 1px solid #444 !important;
}

.${ROOT_CLASS} input[type="checkbox"],
.${ROOT_CLASS} input[type="radio"] { accent-color: var(--k-accent); }

.${ROOT_CLASS} input[type="submit"]:not(.post_inner *),
.${ROOT_CLASS} input[type="button"]:not(.post_inner *),
.${ROOT_CLASS} button:not(.post_inner *),
.${ROOT_CLASS} .form-button:not(.post_inner *) {
    background: var(--k-accent) !important;
    color: #fff !important;
    border: 1px solid transparent !important;
    border-radius: 3px;
    padding: 3px 10px;
    font-weight: bold;
    cursor: pointer;
}

.${ROOT_CLASS} input[type="submit"]:hover:not(.post_inner *),
.${ROOT_CLASS} input[type="button"]:hover:not(.post_inner *),
.${ROOT_CLASS} button:hover:not(.post_inner *),
.${ROOT_CLASS} .form-button:hover:not(.post_inner *) { background: rgba(175, 142, 232, 0.7) !important; }

/* --- Sonstiges ---------------------------------------------------- */
.${ROOT_CLASS} hr { border-color: #333 !important; }

/* Graue Steuer-Grafiken invertieren, farbige Icons und Smileys bleiben */
.${ROOT_CLASS} img[src*="toggle_open"],
.${ROOT_CLASS} img[src*="toggle_closed"],
.${ROOT_CLASS} img[src*="ascend"],
.${ROOT_CLASS} img[src*="descend"],
.${ROOT_CLASS} img[src*="page.gif"],
.${ROOT_CLASS} img[src*="option_bracket"],
.${ROOT_CLASS} img[src*="smaller.gif"],
.${ROOT_CLASS} img[src*="bigger.gif"] {
    filter: invert(85%);
}

/* Flächen, die aus fremden Stylesheets hell geblieben sind */
.${ROOT_CLASS} .${FIX_CLASS} {
    background-color: var(--k-row2) !important;
    color: var(--k-text) !important;
    border-color: #3a3a3a !important;
}
`;
    }

    /* ------------------------------------------------------------------
     *  Ungelesene Beiträge erkennen
     *  Das Forum unterscheidet die Zeilen über das Icon: newposts.gif /
     *  newfolder.gif = neu, nonewposts.gif / nonewfolder.gif = gelesen.
     *  Das ist eindeutiger als die Hintergrundfarbe und funktioniert in
     *  Kategorie-, Foren- und Themenlisten gleichermaßen.
     * ----------------------------------------------------------------*/
    function markUnreadRows() {
        var content = document.getElementById('content');

        if (!content)
            return;

        // Weg 1: Klassen der Zellen. Ungelesene Zeilen tragen das Präfix
        // "new-" (new-topicsubject, new-newintopic ...) statt "alt-" oder
        // gar keinem. Das greift auch bei angepinnten und geschlossenen
        // Themen, wo das Icon ein Schloss oder eine Pinnnadel ist.
        content.querySelectorAll('td[class^="new-"], td[class*=" new-"]').forEach(function (cell) {
            var row = cell.closest('tr');

            if (row)
                row.classList.add(UNREAD_CLASS);
        });

        // Weg 2: das Icon - deckt die Foren- und Kategorieübersichten ab
        content.querySelectorAll('img').forEach(function (img) {
            var file = (img.getAttribute('src') || '').split('/').pop().toLowerCase();
            var hint = (img.getAttribute('title') || '') + ' ' + (img.getAttribute('alt') || '');
            var unread = /^new(posts|folder)/.test(file);

            // Zusatzweg über den Tooltip - "Keine neuen Beiträge" zählt nicht
            if (!unread && /neue\s+beitr/i.test(hint) && !/keine/i.test(hint))
                unread = true;

            if (!unread)
                return;

            var row = img.closest('tr');

            if (row)
                row.classList.add(UNREAD_CLASS);
        });
    }

    /* ------------------------------------------------------------------
     *  Neue Beiträge in der Themenansicht
     *  Das Forum setzt im Beitragskopf ein kleines "NEW"-Bild. Daran
     *  hängt die Kennzeichnung des ganzen Beitrags.
     * ----------------------------------------------------------------*/
    function markNewPosts() {
        var content = document.getElementById('content');

        if (!content)
            return;

        content.querySelectorAll('td.subjecttable, td.newsubjecttable').forEach(function (cell) {
            // Das Forum vergibt für ungelesene Beiträge eine eigene Klasse -
            // im hellen Original ist das der rote Balken
            var fresh = cell.classList.contains('newsubjecttable')
                     || !!cell.querySelector('#UNREAD');

            if (!fresh) {
                cell.querySelectorAll('img').forEach(function (img) {
                    var file = (img.getAttribute('src') || '').split('/').pop().toLowerCase();
                    var hint = (img.getAttribute('alt') || '') + ' ' + (img.getAttribute('title') || '');

                    if (/^new/.test(file) || /\b(neu|new)\b/i.test(hint))
                        fresh = true;
                });
            }

            if (!fresh)
                return;

            var row = cell.closest('tr');

            if (!row)
                return;

            row.classList.add(NEWPOST_CLASS);

            // die folgende Zeile trägt Verfasser und Text desselben Beitrags
            var body = row.nextElementSibling;

            if (body && !body.querySelector('td.subjecttable'))
                body.classList.add(NEWBODY_CLASS);
        });
    }

    /* ------------------------------------------------------------------
     *  Beiträge mit eigenem Layout
     *  Manche Beiträge bringen komplettes HTML samt eigener Farben mit,
     *  andere setzen Farben über UBBCode (<font color>). Statt einzelne
     *  Farbwerte zu raten, wird hier der tatsächliche Kontrast gemessen
     *  und nur dort nachgebessert, wo Text sonst unlesbar wäre.
     *  Hintergründe bleiben unangetastet - der Beitrag sieht aus wie von
     *  seinem Verfasser gedacht.
     * ----------------------------------------------------------------*/
    var MIN_CONTRAST = 4.0;   // ab hier gilt Text als lesbar
    var AIM_CONTRAST = 4.5;   // so weit wird nachgebessert

    function parseRgb(value) {
        var parts = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(value || '');

        if (!parts)
            return null;

        return {
            r: Number(parts[1]),
            g: Number(parts[2]),
            b: Number(parts[3]),
            a: parts[4] === undefined ? 1 : parseFloat(parts[4])
        };
    }

    // relative Helligkeit nach WCAG
    function luminance(color) {
        var channel = function (v) {
            v = v / 255;
            return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        };

        return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
    }

    function contrast(a, b) {
        var la = luminance(a);
        var lb = luminance(b);

        return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    }

    function mix(from, to, amount) {
        return {
            r: Math.round(from.r + (to.r - from.r) * amount),
            g: Math.round(from.g + (to.g - from.g) * amount),
            b: Math.round(from.b + (to.b - from.b) * amount),
            a: 1
        };
    }

    // erste nicht durchsichtige Fläche über dem Element
    function effectiveBackground(el) {
        var node = el;

        while (node && node.nodeType === 1) {
            var color = parseRgb(getComputedStyle(node).backgroundColor);

            if (color && color.a >= 0.5)
                return color;

            node = node.parentElement;
        }

        return parseRgb(COLORS.bg.replace('#', '').length === 6
            ? 'rgb(28, 28, 28)'
            : 'rgb(28, 28, 28)');
    }

    function skipTag(el) {
        return el.tagName === 'IFRAME' || el.tagName === 'IMG' || el.tagName === 'BR'
            || el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'TEMPLATE';
    }

    function ensureReadable(el) {
        if (skipTag(el) || el.getAttribute('data-kforum-fixed'))
            return;

        var style = getComputedStyle(el);

        // Abgeblendete Bereiche (z. B. "inaktiv" mit opacity) verschwinden auf
        // dunklem Grund fast völlig - etwas anheben, die Abstufung bleibt
        var opacity = parseFloat(style.opacity);

        if (opacity >= 0.1 && opacity < 0.75) {
            el.style.setProperty('opacity', '0.85', 'important');
            el.setAttribute('data-kforum-faded', '1');
        }

        var parent = el.parentElement;

        // nur Elemente prüfen, die eine eigene Farbe mitbringen -
        // geerbte Farben hat das Elternelement bereits geklärt
        if (parent && getComputedStyle(parent).color === style.color)
            return;

        var text = parseRgb(style.color);
        var background = effectiveBackground(el);

        if (!text || !background || contrast(text, background) >= MIN_CONTRAST)
            return;

        // heller Grund -> Richtung Schwarz, dunkler Grund -> Richtung Weiß
        var target = luminance(background) > 0.4
            ? { r: 0, g: 0, b: 0 }
            : { r: 255, g: 255, b: 255 };

        var result = text;

        for (var step = 0.15; step <= 1.001; step += 0.15) {
            result = mix(text, target, step);

            if (contrast(result, background) >= AIM_CONTRAST)
                break;
        }

        el.style.setProperty('color', 'rgb(' + result.r + ', ' + result.g + ', ' + result.b + ')', 'important');
        el.setAttribute('data-kforum-fixed', '1');
    }

    function fixPostContrast() {
        if (theme !== 'dark')
            return;

        document.querySelectorAll('.post_inner').forEach(function (post) {
            var nodes = post.querySelectorAll('*');

            // Erst die hellen Flächen markieren - davon hängt ab, welche
            // Schriftfarbe die Kindelemente erben
            nodes.forEach(function (node) {
                if (skipTag(node) || node.classList.contains(POST_CLASS))
                    return;

                if (isLight(getComputedStyle(node).backgroundColor))
                    node.classList.add(POST_CLASS);
            });

            nodes.forEach(ensureReadable);
        });
    }

    // beim Umschalten auf Light alle Eingriffe zurücknehmen
    function clearPostContrast() {
        document.querySelectorAll('[data-kforum-fixed]').forEach(function (node) {
            node.style.removeProperty('color');
            node.removeAttribute('data-kforum-fixed');
        });

        document.querySelectorAll('[data-kforum-faded]').forEach(function (node) {
            node.style.removeProperty('opacity');
            node.removeAttribute('data-kforum-faded');
        });

        document.querySelectorAll('.' + POST_CLASS).forEach(function (node) {
            node.classList.remove(POST_CLASS);
        });
    }

    /* ------------------------------------------------------------------
     *  Nachbesserung: helle Restflächen finden
     *  Deckt Markierungen ab, die aus Stylesheets kommen, deren
     *  Klassennamen hier nicht bekannt sind.
     * ----------------------------------------------------------------*/
    function isLight(color) {
        var parts = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(color || '');

        if (!parts)
            return false;

        // fast durchsichtige Flächen stören nicht
        if (parts[4] !== undefined && parseFloat(parts[4]) < 0.25)
            return false;

        return (Number(parts[1]) + Number(parts[2]) + Number(parts[3])) > LIGHT_LIMIT;
    }

    function fixLightSpots() {
        var content = document.getElementById('content');

        if (theme !== 'dark' || !content)
            return;

        // Beitragsinhalte und Farbwähler bleiben außen vor - dort sind helle
        // Flächen gewollt und vom Verfasser gesetzt
        var skip = '.post_inner, #colors-table, .markup_panel, .markup_panel_popup, [bgcolor]';

        content.querySelectorAll('td, th, div, span, li').forEach(function (node) {
            if (node.classList.contains(FIX_CLASS) || node.closest(skip))
                return;

            if (isLight(getComputedStyle(node).backgroundColor))
                node.classList.add(FIX_CLASS);
        });
    }

    /* ------------------------------------------------------------------
     *  Pfad am Seitenende
     *  Der Verlauf (Forum » Kategorie » Thema) steht nur ganz oben. Bei
     *  langen Themen ist das weit weg, deshalb kommt er zusätzlich über
     *  die Fußzeile. Aufbau mit den Forumsklassen, damit er in Light und
     *  Dark genauso aussieht wie das Original.
     * ----------------------------------------------------------------*/
    function addBottomCrumbs() {
        if (document.getElementById('kforumCrumbs'))
            return;

        var crumbs = document.querySelector('td.breadcrumbs');

        if (!crumbs)
            return;

        var footerCell = document.querySelector('td.footer');
        var anchor = footerCell ? footerCell.closest('table.t_outer') : null;

        if (!anchor || !anchor.parentNode)
            return;

        var table = document.createElement('table');

        table.id = 'kforumCrumbs';
        table.className = 't_outer';
        table.setAttribute('width', '100%');
        table.setAttribute('cellpadding', '0');
        table.setAttribute('cellspacing', '0');
        table.style.marginBottom = '6px';

        table.innerHTML = '<tr><td><table width="100%" class="t_inner" cellpadding="0" '
                        + 'cellspacing="1"><tr><td class="breadcrumbs"></td></tr></table></td></tr>';

        var target = table.querySelector('td.breadcrumbs');

        target.innerHTML = crumbs.innerHTML;

        // die Überschrift des Themas nicht ein zweites Mal als h1 ausgeben
        target.querySelectorAll('h1').forEach(function (heading) {
            var span = document.createElement('span');

            span.innerHTML = heading.innerHTML;
            heading.parentNode.replaceChild(span, heading);
        });

        anchor.parentNode.insertBefore(table, anchor);
    }

    /* ------------------------------------------------------------------
     *  Einstellungen
     * ----------------------------------------------------------------*/
    var SETTINGS_KEY = 'kforum_settings';
    var BOARDS_KEY   = 'kforum_boards';

    var settings = { bottomCrumbs: true, hiddenBoards: [] };
    var boards = [];

    function loadSettings() {
        try {
            var stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');

            if (typeof stored.bottomCrumbs === 'boolean')
                settings.bottomCrumbs = stored.bottomCrumbs;

            if (Array.isArray(stored.hiddenBoards))
                settings.hiddenBoards = stored.hiddenBoards;
        }
        catch { /* Standardwerte behalten */ }

        try { boards = JSON.parse(localStorage.getItem(BOARDS_KEY) || '[]') || []; }
        catch { boards = []; }
    }

    function saveSettings() {
        try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }
        catch { /* Speicher nicht verfügbar */ }
    }

    /* ------------------------------------------------------------------
     *  Forenliste
     *  Quelle ist das Auswahlfeld "gehe zu folgendem Forum" - es enthält
     *  genau die Foren, auf die der angemeldete Account Zugriff hat.
     *  Einmal eingelesen, wird die Liste gespeichert und steht auch auf
     *  Seiten ohne dieses Feld zur Verfügung.
     * ----------------------------------------------------------------*/
    function harvestBoards() {
        var select = document.querySelector('select[name="board"]');

        if (!select)
            return;

        var found = [];

        select.querySelectorAll('option').forEach(function (option) {
            var value = option.value || '';
            var text = (option.textContent || '').replace(/\u00a0/g, ' ');
            var indent = (text.match(/^ +/) || [''])[0].length;
            var name = text.trim().replace(/\s*-{3,}\s*$/, '').trim();

            if (!value || !name)
                return;

            found.push({
                id: value.indexOf('c:') === 0 ? value.replace('c:', 'c:') : value,
                name: name,
                depth: value.indexOf('c:') === 0 ? 0 : Math.max(1, Math.floor(indent / 3))
            });
        });

        if (!found.length)
            return;

        boards = found;

        try { localStorage.setItem(BOARDS_KEY, JSON.stringify(boards)); }
        catch { /* Speicher nicht verfügbar */ }
    }

    // Forums- bzw. Kategorie-Kennung aus einer Adresse lesen
    function boardIdFromHref(href) {
        if (!href)
            return null;

        var board = /[?&]Board=(\d+)/i.exec(href);

        if (board)
            return board[1];

        var category = /[?&]c=(\d+)/i.exec(href);

        if (category)
            return 'c:' + category[1];

        return null;
    }

    // abgewählte Foren aus den Listen nehmen
    function applyBoardFilter() {
        var hidden = settings.hiddenBoards || [];

        document.querySelectorAll('#content td[class*="forumtitle"]').forEach(function (cell) {
            var link = cell.querySelector('a[href]');
            var row = cell.closest('tr');

            if (!link || !row)
                return;

            var id = boardIdFromHref(link.getAttribute('href'));

            if (!id)
                return;

            row.style.display = hidden.indexOf(id) !== -1 ? 'none' : '';
        });

        // Verweise auf Unterforen in den Zeilen darüber
        document.querySelectorAll('#content .forum_extras a[href]').forEach(function (link) {
            var id = boardIdFromHref(link.getAttribute('href'));

            link.style.display = (id && hidden.indexOf(id) !== -1) ? 'none' : '';
        });
    }

    /* ------------------------------------------------------------------
     *  Einstellungsfeld
     * ----------------------------------------------------------------*/
    function makeBoardBox(board) {
        var box = document.createElement('input');

        box.type = 'checkbox';
        box.checked = settings.hiddenBoards.indexOf(board.id) === -1;

        box.addEventListener('change', function () {
            var index = settings.hiddenBoards.indexOf(board.id);

            if (box.checked && index !== -1)
                settings.hiddenBoards.splice(index, 1);
            else if (!box.checked && index === -1)
                settings.hiddenBoards.push(board.id);

            saveSettings();
            applyBoardFilter();
        });

        return box;
    }

    function renderBoardList(container) {
        container.innerHTML = '';

        if (!boards.length) {
            container.innerHTML = '<div class="kforumHint">Noch keine Foren bekannt. '
                                + 'Öffne einmal ein Forum oder ein Thema - dort liest das Skript '
                                + 'die Liste aus dem Auswahlfeld am Seitenende ein.</div>';
            return;
        }

        var body = null;

        boards.forEach(function (board) {
            // Kategorie: eigene Klappbox, das Häkchen sitzt in der Überschrift
            if (board.depth === 0) {
                var group = document.createElement('details');

                group.className = 'kforumGroup';

                var summary = document.createElement('summary');
                var box = makeBoardBox(board);

                // Klick auf das Häkchen darf die Klappbox nicht öffnen
                box.addEventListener('click', function (event) {
                    event.stopPropagation();
                });

                var name = document.createElement('span');

                name.textContent = board.name;

                summary.appendChild(box);
                summary.appendChild(name);
                group.appendChild(summary);

                body = document.createElement('div');
                body.className = 'kforumBody';
                group.appendChild(body);

                container.appendChild(group);
                return;
            }

            var row = document.createElement('label');

            row.className = 'kforumBoard kforumDepth' + Math.min(board.depth, 3);
            row.appendChild(makeBoardBox(board));

            var text = document.createElement('span');

            text.textContent = board.name;
            row.appendChild(text);

            (body || container).appendChild(row);
        });
    }

    function setAllBoards(visible, container) {
        settings.hiddenBoards = visible ? [] : boards.map(function (b) { return b.id; });

        saveSettings();
        renderBoardList(container);
        applyBoardFilter();
    }

    function buildPanel() {
        var panel = document.createElement('div');

        panel.id = 'kforumPanel';
        panel.style.display = 'none';

        panel.innerHTML =
            '<details class="kforumGroup kforumTop"><summary>Anzeige</summary>'
          + '  <div class="kforumBody">'
          + '    <label class="kforumOption"><input type="checkbox" id="kforumOptCrumbs">'
          + '    <span>Pfad auch am Seitenende</span></label>'
          + '  </div>'
          + '</details>'
          + '<details class="kforumGroup kforumTop"><summary>Foren</summary>'
          + '  <div class="kforumBody">'
          + '    <div class="kforumTools"><a href="#" id="kforumAll">alle</a> · '
          + '    <a href="#" id="kforumNone">keins</a></div>'
          + '    <div class="kforumHint">Abgewählte Foren verschwinden aus den Übersichten.</div>'
          + '    <div id="kforumBoards"></div>'
          + '  </div>'
          + '</details>';

        var list = panel.querySelector('#kforumBoards');
        var crumbBox = panel.querySelector('#kforumOptCrumbs');

        crumbBox.checked = settings.bottomCrumbs;

        crumbBox.addEventListener('change', function () {
            settings.bottomCrumbs = crumbBox.checked;
            saveSettings();

            if (settings.bottomCrumbs)
                addBottomCrumbs();
            else
                document.getElementById('kforumCrumbs')?.remove();
        });

        panel.querySelector('#kforumAll').addEventListener('click', function (event) {
            event.preventDefault();
            setAllBoards(true, list);
        });

        panel.querySelector('#kforumNone').addEventListener('click', function (event) {
            event.preventDefault();
            setAllBoards(false, list);
        });

        renderBoardList(list);

        return panel;
    }

    /* ------------------------------------------------------------------
     *  Umschaltlogik
     * ----------------------------------------------------------------*/
    var theme = readTheme();
    var darkStyle = null;

    function readTheme() {
        try { return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light'; }
        catch { return 'light'; }
    }

    function saveTheme() {
        try { localStorage.setItem(STORAGE_KEY, theme); }
        catch { /* z. B. bei blockierten Cookies - dann gilt die Auswahl nur für diese Seite */ }
    }

    function addStyle(id, css) {
        var style = document.getElementById(id);

        if (style)
            return style;

        style = document.createElement('style');
        style.id = id;
        style.textContent = css;

        (document.head || document.documentElement).appendChild(style);

        return style;
    }

    function applyTheme() {
        if (theme === 'dark') {
            document.documentElement.classList.add(ROOT_CLASS);

            if (!darkStyle)
                darkStyle = addStyle('kforumDarkStyle', darkCss());

            fixLightSpots();
            fixPostContrast();
        }
        else {
            document.documentElement.classList.remove(ROOT_CLASS);

            clearPostContrast();

            darkStyle?.remove();
            darkStyle = null;
        }

        updateButton();
    }

    function updateButton() {
        var button = document.getElementById('kforumToggle');

        if (!button)
            return;

        var dark = theme === 'dark';

        button.innerHTML = '<span class="kforumIcon">' + (dark ? '☀️' : '🌙') + '</span>'
                         + '<span>' + (dark ? 'Light' : 'Dark') + '</span>';

        button.title = dark
            ? 'Zurück zur Originaldarstellung des Forums'
            : 'Forum im dunklen Design anzeigen';
    }

    function addButton() {
        if (document.getElementById('kforumBar'))
            return;

        var bar = document.createElement('div');

        bar.id = 'kforumBar';

        var button = document.createElement('div');

        button.id = 'kforumToggle';
        button.setAttribute('role', 'button');
        button.setAttribute('tabindex', '0');

        button.addEventListener('click', function () {
            theme = theme === 'dark' ? 'light' : 'dark';

            saveTheme();
            applyTheme();
        });

        button.addEventListener('keydown', function (event) {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                button.click();
            }
        });

        var gear = document.createElement('div');

        gear.id = 'kforumSettingsBtn';
        gear.setAttribute('role', 'button');
        gear.setAttribute('tabindex', '0');
        gear.title = 'Einstellungen';
        gear.textContent = '\u2699';

        var panel = buildPanel();

        gear.addEventListener('click', function () {
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        });

        gear.addEventListener('keydown', function (event) {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                gear.click();
            }
        });

        var row = document.createElement('div');

        row.id = 'kforumButtons';
        row.appendChild(button);
        row.appendChild(gear);

        bar.appendChild(row);
        bar.appendChild(panel);

        document.body.appendChild(bar);

        updateButton();
    }

    // Eigenen Style ans Ende des <head> hängen, sobald die Forums-Stylesheets stehen
    function reorderStyle() {
        if (darkStyle && document.head && darkStyle.parentNode !== document.head)
            document.head.appendChild(darkStyle);
    }

    function start() {
        loadSettings();
        harvestBoards();

        addStyle('kforumToggleStyle', toggleCss());
        reorderStyle();
        addButton();

        if (settings.bottomCrumbs)
            addBottomCrumbs();

        applyBoardFilter();
        markUnreadRows();
        markNewPosts();
        fixLightSpots();
        fixPostContrast();
    }

    // Theme sofort setzen, damit beim Laden nichts weiß aufblitzt
    applyTheme();

    if (document.readyState === 'loading')
        document.addEventListener('DOMContentLoaded', start);
    else
        start();

    // In anderen Tabs geänderte Auswahl übernehmen
    window.addEventListener('storage', function (event) {
        if (event.key !== STORAGE_KEY)
            return;

        theme = readTheme();
        applyTheme();
    });
})();
