// ==UserScript==
// @name         kn-forum
// @namespace    https://forum.knuddels.de/
// @version      1.08
// @description  Schaltet das Knuddels-Forum zwischen Originaldarstellung (Light) und einem dunklen Design im Stil des Extended Admincall um. Umschalter oben rechts, Auswahl wird gespeichert.
// @author       Kev
// @match        https://forum.knuddels.de/*
// @icon         https://forum.knuddels.de/favicon.ico
// @updateURL    https://raw.githubusercontent.com/kev2911/knuddels-skripts/refs/heads/main/kn-forum.user.js
// @downloadURL  https://raw.githubusercontent.com/kev2911/knuddels-skripts/refs/heads/main/kn-forum.user.js
// @run-at       document-start
// @grant        none
// ==/UserScript==

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
#kforumToggle {
    position: fixed;
    top: 10px;
    right: 12px;
    z-index: 99999;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    font-family: Verdana, Arial, sans-serif;
    font-size: 12px;
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

#kforumToggle:hover { background: rgba(175, 142, 232, 0.75); }
#kforumToggle:active { background: rgba(175, 142, 232, 0.45); }
#kforumToggle:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
#kforumToggle .kforumIcon { font-size: 14px; line-height: 1; }
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
   Nur auf Strukturelemente, damit Farben in Beiträgen erhalten bleiben. */
.${ROOT_CLASS} td,
.${ROOT_CLASS} th,
.${ROOT_CLASS} li,
.${ROOT_CLASS} label,
.${ROOT_CLASS} h1,
.${ROOT_CLASS} h2,
.${ROOT_CLASS} h3,
.${ROOT_CLASS} h4,
.${ROOT_CLASS} #content > div,
.${ROOT_CLASS} #ft div,
.${ROOT_CLASS} #ft li {
    color: var(--k-text) !important;
}

/* --- Links -------------------------------------------------------- */
.${ROOT_CLASS} a,
.${ROOT_CLASS} a:visited {
    color: var(--k-accent) !important;
    font-weight: bold;
}

.${ROOT_CLASS} a:hover { color: ${COLORS.linkHover} !important; }

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
.${ROOT_CLASS} tr:hover > td[class*="posttime"] {
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
.${ROOT_CLASS} td.subjecttable { background: var(--k-accent-soft) !important; }

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

/* --- Formulare ---------------------------------------------------- */
.${ROOT_CLASS} input[type="text"],
.${ROOT_CLASS} input[type="password"],
.${ROOT_CLASS} input[type="number"],
.${ROOT_CLASS} input[type="search"],
.${ROOT_CLASS} textarea,
.${ROOT_CLASS} select {
    background: var(--k-input) !important;
    color: var(--k-text) !important;
    border: 1px solid #444 !important;
}

.${ROOT_CLASS} input[type="checkbox"],
.${ROOT_CLASS} input[type="radio"] { accent-color: var(--k-accent); }

.${ROOT_CLASS} input[type="submit"],
.${ROOT_CLASS} input[type="button"],
.${ROOT_CLASS} button,
.${ROOT_CLASS} .form-button {
    background: var(--k-accent) !important;
    color: #fff !important;
    border: 1px solid transparent !important;
    border-radius: 3px;
    padding: 3px 10px;
    font-weight: bold;
    cursor: pointer;
}

.${ROOT_CLASS} input[type="submit"]:hover,
.${ROOT_CLASS} input[type="button"]:hover,
.${ROOT_CLASS} button:hover,
.${ROOT_CLASS} .form-button:hover { background: rgba(175, 142, 232, 0.7) !important; }

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
        if (document.getElementById('kforumToggle'))
            return;

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

        document.body.appendChild(button);

        updateButton();
    }

    // Eigenen Style ans Ende des <head> hängen, sobald die Forums-Stylesheets stehen
    function reorderStyle() {
        if (darkStyle && document.head && darkStyle.parentNode !== document.head)
            document.head.appendChild(darkStyle);
    }

    function start() {
        addStyle('kforumToggleStyle', toggleCss());
        reorderStyle();
        addButton();
        markUnreadRows();
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
