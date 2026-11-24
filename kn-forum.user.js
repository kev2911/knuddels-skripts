// ==UserScript==
// @name         kn-forum
// @namespace    https://forum.knuddels.de/
// @version      3.01
// @description  Nutzt die hellen und dunklen Stile des Knuddels-Forums und ergaenzt sie: Umschalter oben rechts, Markierung ungelesener Themen und Beitraege, Rollen-Chips, Like ohne Zwischenseite, die gewohnten Antwort-Knoepfe und ein Einstellungsmenue.
// @author       Kev
// @match        https://forum.knuddels.de/*
// @icon         https://forum.knuddels.de/favicon.ico
// @updateURL    https://raw.githubusercontent.com/kev2911/knuddels-skripts/refs/heads/main/kn-forum.user.js
// @downloadURL  https://raw.githubusercontent.com/kev2911/knuddels-skripts/refs/heads/main/kn-forum.user.js
// @run-at       document-start
// @grant        GM_openInTab
// @grant        unsafeWindow
// ==/UserScript==

// Neu in 3.00 - das Forum bringt jetzt eigene Stile mit:
// 1) Das eingebaute Darkmode-Design ist entfallen. Das Forum liefert
//    "Knuddels Purple Dunkel" und "Knuddels Purple Hell" selbst; beide
//    werden vollständig übernommen.
// 2) Der Umschalter oben rechts setzt jetzt den Stil des Forums statt
//    eigenes CSS darüberzulegen. Die Wahl merkt sich das Forum am Konto.
// 3) Welcher Stil gerade läuft, wird an der Grundfläche gemessen. Alle
//    eigenen Kennzeichnungen passen sich daran an - auch an Stile, die
//    es heute noch nicht gibt.
// 4) Alle Funktionen bleiben: Rollen-Chips, Themenersteller, Markierung
//    ungelesener Beiträge, Like ohne Seitenwechsel, Reihenfolge und
//    Position der Antwort-Knöpfe, Spoiler-Kasten, eingeklappte
//    Beitragsicons, Pfad am Seitenende, Forenfilter und der Button für
//    alle ungelesenen Themen.

// Neu in 2.05:
// 1) Die Werkzeugleiste des Editors ist im Darkmode wieder lesbar. Sie
//    nutzt seit dem Update Font-Awesome-Zeichen statt der alten Grafiken;
//    das Aufhellen der Grafiken (invert) hat die hellen Zeichen dadurch
//    ins Dunkle gedreht. Jetzt helle Symbole, beim Überfahren hervor-
//    gehoben, mit sichtbaren Trennstrichen.
// 2) Die Auswahl "Beitragsicon" ist eingeklappt. Die Beschriftung zeigt
//    das gewählte Icon und klappt die Auswahl auf; nach der Wahl
//    schließt sie sich wieder.

// Neu in 2.04:
// 1) Spoiler stehen wieder in einem Kasten wie das Zitat, mit Kopfzeile
//    und dem Knopf direkt neben der Kennzeichnung. Das Forum vergibt dem
//    Spoilerkopf die Klasse "ubbcode-headerZZ", die in keinem Stylesheet
//    vorkommt - deshalb fehlte der Kasten. Der Knopf trug "post-buttons"
//    und wurde dadurch an den rechten Rand gefloatet.

// Neu in 2.03:
// 1) Ein über den Button geöffnetes Thema springt zum ersten ungelesenen
//    Beitrag statt an den Seitenanfang: Die Adresse bekommt die Sprung-
//    marke #UNREAD, und zusätzlich scrollt das Skript selbst dorthin,
//    falls die Marke beim Weiterleiten verlorengeht.

// Neu in 2.02:
// 1) Die Ungelesen-Markierung greift wieder nur auf die Themen- und
//    Forenzeile selbst. Die Tabellen des Forums sind ineinander
//    verschachtelt; dadurch galt auch die äußere Hüllzeile als ungelesen
//    und hat den ganzen Block eingefärbt.

// Neu in 2.01:
// 1) Mehr Luft zwischen Nick und Rollen-Chip.
// 2) Beitragsaktionen in fester Reihenfolge: Sofort-Zitat, Zitat,
//    Sofort-Antwort, Antwort, Ändern, Like. Die Anordnung wird erzwungen,
//    weil das Forum die Knöpfe nach rechts floatet und sich die
//    Reihenfolge dadurch sonst umdreht.
// 3) Like wirkt sofort: Knopf und die Zeile "... mag das" werden ohne
//    Neuladen aufgebaut beziehungsweise entfernt.
// 4) Seitenauswahl (Seite x von y) fügt sich im Darkmode ins Farbschema ein.
// 5) Neue Einstellung: Beitragsaktionen oben am Beitrag - dort sitzen sie
//    in derselben Zeile wie Nummer und Datum, die Angaben mittig, die
//    Aktionen rechts außen (Standard: unter dem Beitrag).
// 6) Neue Einstellung: Button, der alle ungelesenen Themen in eigenen Tabs
//    öffnet (Standard: aus). Von der Foren-Übersicht aus sucht er den Weg
//    Kategorie - Forum - Themen ab; die Tabs öffnet GM_openInTab, damit
//    der Pop-up-Blocker nicht greift.

// Neu in 2.00 - Anpassung an das große Forums-Update (UBB.threads):
// 1) Rollen (Forenadmin, Knuddels-Team, Moderator) wieder als dezente Chips
//    statt der kleinen Grafiken.
// 2) Navigation: "Foren" heißt wieder "Übersicht der Foren"; die Forums-
//    Administration lässt sich ausblenden (Standard: ausgeblendet).
// 3) Like/Unlike ohne Zwischenseite - ein Klick genügt, der Zähler wird
//    direkt am Knopf angezeigt.
// 4) Antworten wie früher: Sofort-Zitat und Sofort-Antwort schreiben unten
//    im Thread, Zitat und Antwort öffnen den Volltexteditor.
// 5) Der Stern des Themenerstellers wird als Chip neben dem Nick gezeigt.
// 6) Ungelesene Beiträge werden in Übersicht, Themenliste und Thread klar
//    gekennzeichnet (Akzentbalken, getönter Kopf, "neu"-Chip).
// 7) Darstellung für Smartphone und Tablet überarbeitet.

// Neu in 1.18:
// 1) Flächen sind jetzt neutral dunkel statt violett: Schaltflächen,
//    Tabellenköpfe und der Umschalter haben dunklen Grund, grauen Rahmen
//    und helle Schrift. Violett bleibt nur noch als Akzent für Links,
//    Markierungsbalken und Hinweise.

// Neu in 1.16:
// 1) Spoiler-Schaltflächen ("Anschauen") in Beiträgen passen sich dem
//    Design an. Sie stammen vom Forum (Klasse form-button), nicht vom
//    Verfasser - anders als die übrigen Bedienelemente in Beiträgen.

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

    // Welcher Stil des Forums gerade läuft - gemessen, nicht geraten
    var ROOT_CLASS   = 'kforumDark';     // Klasse am <html>, wenn dunkel
    var LIGHT_CLASS  = 'kforumLight';    // Klasse am <html>, wenn hell
    var UNREAD_CLASS = 'kforumUnread';   // Marker für Zeilen mit ungelesenen Beiträgen
    var POST_CLASS   = 'kforumPostLight';// Marker für Beitragsflächen mit eigenem hellen Grund
    var NEWPOST_CLASS = 'kforumNewPost'; // Kopfzeile eines ungelesenen Beitrags
    var NEWBODY_CLASS = 'kforumNewBody'; // zugehörige Inhaltszeile
    var FIRSTNEW_CLASS = 'kforumFirstNew';// erster ungelesener Beitrag eines Themas

    /* ------------------------------------------------------------------
     *  Farbpalette - hier anpassen
     * ----------------------------------------------------------------*/
    /* ------------------------------------------------------------------
     *  Farben der eigenen Elemente
     *  Das Forum bringt seine Stile selbst mit - hier stehen nur noch die
     *  Töne für die Zutaten dieses Skripts. Sie sind so gewählt, dass sie
     *  auf heller wie auf dunkler Fläche tragen.
     * ----------------------------------------------------------------*/
    var COLORS = {
        accent:     'rgb(140, 105, 205)',   // Akzent auf hellem Grund
        accentDark: 'rgb(186, 157, 240)',   // Akzent auf dunklem Grund
        panel:      '#ffffff',
        panelDark:  '#24202e',
        line:       'rgba(0, 0, 0, 0.18)',
        lineDark:   'rgba(255, 255, 255, 0.20)'
    };

    // Ab dieser Summe aus R+G+B gilt eine Fläche als hell
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
    color: #ffffff;
    background: ${COLORS.accent};
    border: 1px solid rgba(0, 0, 0, 0.25);
    border-radius: 14px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
    cursor: pointer;
    user-select: none;
}

#kforumSettingsBtn { padding: 4px 9px; font-size: 14px; }

#kforumToggle:hover,
#kforumSettingsBtn:hover { filter: brightness(1.14); }
#kforumToggle:active,
#kforumSettingsBtn:active { filter: brightness(0.92); }

/* Hinweis, falls der Stilwechsel nicht greift */
#kforumToggle.kforumToggleHint { outline: 2px solid #f0a500; outline-offset: 2px; }

.${ROOT_CLASS} #kforumToggle,
.${ROOT_CLASS} #kforumSettingsBtn {
    color: #14101c;
    background: ${COLORS.accentDark};
    border-color: rgba(0, 0, 0, 0.45);
}
#kforumToggle:focus-visible,
#kforumSettingsBtn:focus-visible { outline: 2px solid ${COLORS.accent}; outline-offset: 2px; }
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
    color: #ece9f2;
    background: ${COLORS.panelDark};
    border-color: ${COLORS.lineDark};
}

.${ROOT_CLASS} #kforumPanel .kforumTools a { color: ${COLORS.accentDark}; }
.${ROOT_CLASS} #kforumPanel input[type="checkbox"] { accent-color: ${COLORS.accentDark}; }
`;
    }

    /* ------------------------------------------------------------------
     *  Style für beide Themes
     *  Betrifft Dinge, die das Forums-Update verändert hat und die in
     *  Light wie Dark gleich aussehen sollen: Rollen-Chips, der Stern des
     *  Themenerstellers, die Antwort-Knöpfe und die mobile Darstellung.
     * ----------------------------------------------------------------*/
    function forumCss() {
        return `
/* --- Rollen-Chips statt der kleinen Gruppen-Grafiken --------------- */
.kforumTag {
    display: inline-block;
    margin: 0 4px 2px 10px;
    padding: 1px 8px;
    font-family: Verdana, Arial, sans-serif;
    font-size: 10px;
    font-weight: bold;
    line-height: 1.6;
    letter-spacing: 0.2px;
    white-space: nowrap;
    border: 1px solid transparent;
    border-radius: 999px;
    vertical-align: middle;
}

.kforumTag-admin { color: #a6342b; background: rgba(166, 52, 43, 0.10); border-color: rgba(166, 52, 43, 0.30); }
.kforumTag-team  { color: #104e8b; background: rgba(16, 78, 139, 0.10); border-color: rgba(16, 78, 139, 0.30); }
.kforumTag-mod   { color: #1d7a3e; background: rgba(29, 122, 62, 0.10); border-color: rgba(29, 122, 62, 0.30); }
.kforumTag-other { color: #555555; background: rgba(0, 0, 0, 0.06); border-color: rgba(0, 0, 0, 0.18); }

.${ROOT_CLASS} .kforumTag-admin { color: #ff9b90; background: rgba(255, 155, 144, 0.12); border-color: rgba(255, 155, 144, 0.32); }
.${ROOT_CLASS} .kforumTag-team  { color: #8ab4f8; background: rgba(138, 180, 248, 0.12); border-color: rgba(138, 180, 248, 0.32); }
.${ROOT_CLASS} .kforumTag-mod   { color: #74d99f; background: rgba(116, 217, 159, 0.12); border-color: rgba(116, 217, 159, 0.32); }
.${ROOT_CLASS} .kforumTag-other { color: #bdbdbd; background: rgba(255, 255, 255, 0.07); border-color: rgba(255, 255, 255, 0.20); }

.author-groups { line-height: 1.8; }

/* --- Themenersteller ---------------------------------------------- */
.kforumOp {
    display: inline-block;
    margin-left: 10px;
    padding: 0 7px;
    font-family: Verdana, Arial, sans-serif;
    font-size: 10px;
    font-weight: bold;
    line-height: 1.7;
    white-space: nowrap;
    color: #8a6100;
    background: rgba(216, 160, 20, 0.14);
    border: 1px solid rgba(216, 160, 20, 0.34);
    border-radius: 999px;
    vertical-align: middle;
}

.${ROOT_CLASS} .kforumOp {
    color: #f0c260;
    background: rgba(240, 194, 96, 0.12);
    border-color: rgba(240, 194, 96, 0.32);
}

/* --- "neu"-Chip des Forums ---------------------------------------- */
.post-new {
    display: inline-block;
    padding: 0 7px;
    font-size: 10px;
    font-weight: bold;
    line-height: 1.7;
    border-radius: 999px;
    color: #7a4b00;
    background: rgba(254, 154, 46, 0.18);
    border: 1px solid rgba(254, 154, 46, 0.42);
}

.${ROOT_CLASS} .post-new {
    color: #ffc078;
    background: rgba(254, 154, 46, 0.16);
    border-color: rgba(254, 154, 46, 0.40);
}

/* --- Ungelesenes kennzeichnen --------------------------------------
   Liegt über dem Stil des Forums und funktioniert in hell wie dunkel:
   ein Balken am linken Rand, eine leichte Tönung, kräftigerer Titel. */
.kforumUnread > td {
    background-color: rgba(140, 105, 205, 0.09) !important;
}

.kforumUnread > td:first-child {
    box-shadow: inset 4px 0 0 ${COLORS.accent};
}

.kforumUnread td[class*="topicsubject"] > h1 > a,
.kforumUnread td[class*="topicsubject"] > a,
.kforumUnread td[class*="forumtitle"] > a {
    font-weight: 700;
}

.${ROOT_CLASS} .kforumUnread > td {
    background-color: rgba(186, 157, 240, 0.13) !important;
}

.${ROOT_CLASS} .kforumUnread > td:first-child {
    box-shadow: inset 4px 0 0 ${COLORS.accentDark};
}

/* Ungelesene Beiträge im Thema. Seit dem Forums-Update ist jeder Beitrag
   eine eigene Tabelle - der Balken läuft deshalb am Rahmen entlang. */
table.t_outer.kforumNewPost {
    border-left: 4px solid ${COLORS.accent} !important;
}

table.t_outer.kforumNewPost td.subjecttable,
table.t_outer.kforumNewPost td.newsubjecttable {
    background-color: rgba(140, 105, 205, 0.12) !important;
}

.${ROOT_CLASS} table.t_outer.kforumNewPost {
    border-left-color: ${COLORS.accentDark} !important;
}

.${ROOT_CLASS} table.t_outer.kforumNewPost td.subjecttable,
.${ROOT_CLASS} table.t_outer.kforumNewPost td.newsubjecttable {
    background-color: rgba(186, 157, 240, 0.16) !important;
}

/* Ältere Darstellung, bei der alle Beiträge in einer Tabelle stehen */
tr.kforumNewPost > td.subjecttable,
tr.kforumNewPost > td.newsubjecttable {
    background-color: rgba(140, 105, 205, 0.12) !important;
    box-shadow: inset 4px 0 0 ${COLORS.accent};
}

.${ROOT_CLASS} tr.kforumNewPost > td.subjecttable,
.${ROOT_CLASS} tr.kforumNewPost > td.newsubjecttable {
    background-color: rgba(186, 157, 240, 0.16) !important;
    box-shadow: inset 4px 0 0 ${COLORS.accentDark};
}

/* --- Trenner vor dem ersten ungelesenen Beitrag -------------------- */
.kforumNewDivider {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 14px 0 6px;
    font-family: Verdana, Arial, sans-serif;
    font-size: 10px;
    font-weight: bold;
    color: #a0772a;
}

.kforumNewDivider::before,
.kforumNewDivider::after {
    content: "";
    flex: 1 1 auto;
    height: 1px;
    background: rgba(216, 160, 20, 0.45);
}

.${ROOT_CLASS} .kforumNewDivider { color: #d9a94f; }

/* --- Beitragsaktionen: feste Reihenfolge -------------------------- */
.kforumButtons {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 2px 14px;
}

.kforumButtons > .kforumBtn { float: none !important; margin: 0 !important; }

/* --- Beitragsaktionen oben in der Zeile mit Nummer und Datum ------- */
.kforumMetaRow {
    display: flex !important;
    flex: 1 1 auto;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px 10px;
    min-width: 0;
}

/* linker Ausgleich, damit die vorhandenen Angaben mittig stehen */
.kforumMetaRow::before { content: ""; flex: 1 1 0; min-width: 0; }

.kforumMetaRow > * { float: none !important; }

.kforumMetaRow .kforumActionsTop {
    flex: 1 1 auto;
    justify-content: flex-end;
    margin: 0;
    padding: 0;
    border: none;
}

/* Steht keine Metazeile zur Verfügung, rutschen die Aktionen unter den
   Betreff statt mitten hinein */
td.subjecttable > .kforumActionsTop,
td.newsubjecttable > .kforumActionsTop {
    margin-top: 6px;
    padding-top: 5px;
    border-top: 1px solid rgba(128, 128, 128, 0.28);
}

/* --- Spoiler wieder als Kasten, wie das Zitat ---------------------- */
.kforumSpoiler {
    margin: 10px 0;
    padding-left: 0 !important;
    border: 1px solid rgba(128, 128, 128, 0.45);
    border-radius: 4px;
    overflow: hidden;
}

.kforumSpoilerHeader {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px 9px;
    padding: 5px 10px;
    font-weight: bold;
    background: rgba(128, 128, 128, 0.14);
    border-bottom: 1px solid rgba(128, 128, 128, 0.35);
}

/* Der Knopf wird vom Forum nach rechts gefloatet - hier bleibt er
   direkt neben der Kennzeichnung stehen */
.kforumSpoilerHeader input.post-buttons,
.kforumSpoilerHeader .post-buttons {
    float: none !important;
    margin: 0 !important;
}

.kforumSpoilerTag {
    padding: 0 7px;
    font-size: 10px;
    font-weight: bold;
    line-height: 1.7;
    border-radius: 999px;
    color: #7a4b00;
    background: rgba(254, 154, 46, 0.18);
    border: 1px solid rgba(254, 154, 46, 0.42);
}

.kforumSpoilerBody { padding: 0 10px; }
.kforumSpoilerBody > div { padding: 9px 0; }

.${ROOT_CLASS} .kforumSpoiler {
    background: #111111;
    border-color: #3a3a3a;
}

.${ROOT_CLASS} .kforumSpoilerHeader {
    background: #1b1b1b;
    border-bottom-color: #3a3a3a;
}

.${ROOT_CLASS} .kforumSpoilerTag {
    color: #ffc078;
    background: rgba(254, 154, 46, 0.16);
    border-color: rgba(254, 154, 46, 0.40);
}

/* --- Beitragsicon: eingeklappt ------------------------------------ */
.kforumIconSet .kforumIconBody { display: none; }
.kforumIconSet.kforumIconOpen .kforumIconBody { display: block; }

.kforumIconLegend {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    user-select: none;
}

.kforumIconLegend::before {
    content: "\\203A";
    display: inline-block;
    font-size: 15px;
    line-height: 1;
    opacity: 0.7;
    transition: transform 0.15s ease;
}

.kforumIconSet.kforumIconOpen .kforumIconLegend::before { transform: rotate(90deg); }
.kforumIconLegend:focus-visible { outline: 2px solid ${COLORS.accent}; outline-offset: 2px; }

.kforumIconPreview {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: normal;
    opacity: 0.85;
}

.kforumIconPreview img { vertical-align: middle; }

/* --- Button: alle ungelesenen Themen öffnen ----------------------- */
#kforumOpenAll {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    margin: 0 0 7px;
    padding: 5px 13px;
    font-family: Verdana, Arial, sans-serif;
    font-size: 12px;
    font-weight: bold;
    color: #ffffff;
    background: #6a4aad;
    border: 1px solid rgba(0, 0, 0, 0.25);
    border-radius: 5px;
    cursor: pointer;
}

#kforumOpenAll:hover { background: #7e5cc5; }
#kforumOpenAll:disabled { opacity: 0.55; cursor: default; }

.${ROOT_CLASS} #kforumOpenAll {
    color: #14101c;
    background: ${COLORS.accentDark};
    border-color: rgba(0, 0, 0, 0.45);
}

.${ROOT_CLASS} #kforumOpenAll:hover {
    filter: brightness(1.14);
}

#kforumOpenAllHint {
    display: block;
    margin: 0 0 8px;
    font-family: Verdana, Arial, sans-serif;
    font-size: 11px;
    opacity: 0.8;
}

/* --- Like-Knopf ---------------------------------------------------- */
a.kforumLiked { font-weight: bold; }
a.kforumBusy { opacity: 0.6; }

/* --- Mobil --------------------------------------------------------- */
@media (max-width: 820px) {
    #kforumBar { top: 8px; right: 8px; gap: 5px; }
    #kforumToggle .kforumLabel { display: none; }
    #kforumToggle, #kforumSettingsBtn { padding: 6px 10px; }
    #kforumPanel { width: min(92vw, 330px); max-height: 62vh; }

    /* Beiträge: nichts darf seitlich hinausragen */
    .post_inner { overflow-wrap: anywhere; word-break: break-word; }
    .post_inner img,
    .post_inner video,
    .post_inner iframe,
    .post_inner table { max-width: 100% !important; height: auto; }
    .post_inner pre { overflow-x: auto; }

    /* größere Tippflächen für die Beitragsaktionen */
    .post-buttons a { display: inline-block; padding: 4px 2px; }
    .post-options .fr { float: none !important; display: flex; flex-wrap: wrap;
        gap: 2px 12px; justify-content: flex-end; }
    td.navigation .navpage { display: inline-block; padding: 3px 0; }
}

@media (max-width: 520px) {
    #kforumBar { top: 6px; right: 6px; }
    .kforumTag, .kforumOp { font-size: 9px; padding: 0 6px; }
    .kforumTag { margin-left: 7px; }
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

        // Erkennung steckt in rowIsUnread: Klassenpräfix "new-" für
        // angepinnte und geschlossene Themen, sonst das Icon
        content.querySelectorAll('tr').forEach(function (row) {
            if (rowIsUnread(row))
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
            // Seit dem Forums-Update trägt der Kopf eines ungelesenen Beitrags
            // ein <span class="post-new">neu</span>. Die ältere Fassung nutzte
            // die Klasse "newsubjecttable" oder ein Bild - beides bleibt als
            // Rückfalllinie erhalten.
            var fresh = cell.classList.contains('newsubjecttable')
                     || !!cell.querySelector('.post-new');

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

            // Jeder Beitrag steht jetzt in einer eigenen Tabelle
            var table = cell.closest('table.t_outer');

            if (table) {
                table.classList.add(NEWPOST_CLASS);
                return;
            }

            var row = cell.closest('tr');

            if (!row)
                return;

            row.classList.add(NEWPOST_CLASS);

            var body = row.nextElementSibling;

            if (body && !body.querySelector('td.subjecttable'))
                body.classList.add(NEWBODY_CLASS);
        });

        markFromAnchor();
        markFirstNew();
    }

    // Zweiter, von Klassennamen unabhängiger Weg: Öffnet man ein Thema mit
    // gonew=1, setzt das Forum vor den ersten ungelesenen Beitrag den Anker
    // <a id="UNREAD">. Alles ab dort ist ungelesen - egal, wie das Forum den
    // Beitragskopf gerade benennt. Das hält die Kennzeichnung auch dann
    // stabil, wenn sich das Markup wieder ändert.
    function markFromAnchor() {
        var anchor = document.getElementById('UNREAD');

        if (!anchor)
            return;

        var posts = document.querySelectorAll('#content table.t_outer');
        var started = false;

        posts.forEach(function (table) {
            if (!started) {
                var after = anchor.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING;

                if (!after || !table.querySelector('td.subjecttable, td.newsubjecttable'))
                    return;

                started = true;
            }

            table.classList.add(NEWPOST_CLASS);
        });
    }

    // Vor dem ersten ungelesenen Beitrag steht der Anker <a id="UNREAD">.
    // Dort kommt ein ruhiger Trenner hin, damit beim Scrollen sofort
    // sichtbar ist, ab wo es weitergeht.
    function markFirstNew() {
        var anchor = document.getElementById('UNREAD');

        if (!anchor || document.querySelector('.kforumNewDivider'))
            return;

        var next = anchor.nextElementSibling;

        while (next && next.tagName !== 'TABLE')
            next = next.nextElementSibling;

        // Steht der Anker nicht auf derselben Ebene, den nächsten Beitrag
        // über seine Kopfzeile suchen
        if (!next) {
            var posts = document.querySelectorAll('table.t_outer');

            for (var i = 0; i < posts.length; i++) {
                if (posts[i].compareDocumentPosition(anchor) & Node.DOCUMENT_POSITION_PRECEDING
                    && posts[i].querySelector('td.subjecttable')) {
                    next = posts[i];
                    break;
                }
            }
        }

        if (!next)
            return;

        next.classList.add(NEWPOST_CLASS, FIRSTNEW_CLASS);

        var divider = document.createElement('div');

        divider.className = 'kforumNewDivider';
        divider.textContent = 'ab hier neu';

        next.parentNode.insertBefore(divider, next);
    }

    /* ------------------------------------------------------------------
     *  Zum ersten ungelesenen Beitrag springen
     *  Wird ein Thema mit gonew=1 geöffnet, liefert das Forum zwar die
     *  richtige Seite, aber nicht immer eine Sprungmarke. Dann bleibt die
     *  Ansicht oben stehen - hier wird nachgeholfen.
     * ----------------------------------------------------------------*/
    function scrollToFirstNew() {
        if (!/[?&]gonew=1/.test(location.search) && location.hash !== '#UNREAD')
            return;

        var target = document.querySelector('.kforumNewDivider')
                  || document.getElementById('UNREAD')
                  || document.querySelector('.' + FIRSTNEW_CLASS)
                  || document.querySelector('.' + NEWPOST_CLASS);

        if (!target)
            return;

        function jump() {
            var top = target.getBoundingClientRect().top + window.pageYOffset - 70;

            window.scrollTo(0, Math.max(0, top));
        }

        jump();

        // Bilder und Schriften verschieben den Inhalt oft noch nach dem
        // Seitenaufbau - deshalb ein zweiter Anlauf
        window.addEventListener('load', function () { setTimeout(jump, 60); }, { once: true });
    }

    /* ------------------------------------------------------------------
     *  Rollen als Chips
     *  Das Forums-Update zeigt Forenadmin, Knuddels-Team und Moderator als
     *  kleine Grafiken. Die werden hier durch beschriftete Chips ersetzt.
     * ----------------------------------------------------------------*/
    function groupInfo(img) {
        var file = (img.getAttribute('src') || '').split('/').pop().toLowerCase();
        var name = file.replace(/_15px(_\d+)?/, '').replace(/\.(png|gif|jpe?g)$/, '');
        var title = (img.getAttribute('title') || '').trim();

        if (name === 'admin' || /administrator/i.test(title))
            return { label: 'Forenadmin', kind: 'admin' };

        if (name === 'knuddelsteam' || /knuddelsteam|globale\s+moderator/i.test(title))
            return { label: 'Knuddels-Team', kind: 'team' };

        if (name === 'moderator' || /moderator/i.test(title))
            return { label: 'Moderator', kind: 'mod' };

        return title ? { label: title, kind: 'other' } : null;
    }

    function styleGroupTags() {
        document.querySelectorAll('img[src*="/images/groups/"]').forEach(function (img) {
            var info = groupInfo(img);

            if (!info || !img.parentNode)
                return;

            var tag = document.createElement('span');

            tag.className = 'kforumTag kforumTag-' + info.kind;
            tag.textContent = info.label;
            tag.title = img.getAttribute('title') || info.label;

            img.parentNode.replaceChild(tag, img);
        });

        // Stern des Themenerstellers lesbar beschriften
        document.querySelectorAll('.post-op').forEach(function (mark) {
            if (mark.classList.contains('kforumOp'))
                return;

            mark.classList.add('kforumOp');
            mark.textContent = '\u2605 Ersteller';
        });
    }

    // Schaltet die Position der Aktionen um, ohne die Seite neu zu laden
    function moveAllActions() {
        document.querySelectorAll('td.post-options').forEach(function (cell) {
            var table = cell.closest('table');

            if (!table)
                return;

            var host = table.querySelector('.kforumActionsTop');

            if (settings.actionsTop) {
                if (!host) {
                    var below = cell.querySelector('.fr');

                    if (below)
                        moveActionsUp(cell, below);
                }

                return;
            }

            if (!host)
                return;

            // zurück unter den Beitrag
            var meta = host.closest('.kforumMetaRow');

            host.classList.remove('kforumActionsTop');
            cell.appendChild(host);

            if (meta && !meta.querySelector('.kforumActionsTop'))
                meta.classList.remove('kforumMetaRow');

            var row = cell.closest('tr');

            if (row)
                row.style.display = '';
        });
    }

    /* ------------------------------------------------------------------
     *  Alle ungelesenen Themen öffnen
     *  In einer Themenliste werden die ungelesenen Themen direkt geöffnet.
     *  Auf der Foren-Übersicht gibt es keine Themen - dort durchsucht der
     *  Button zuerst die ungelesenen Foren im Hintergrund.
     * ----------------------------------------------------------------*/
    // Erkennt an Klassen und Icons, ob eine Zeile Ungelesenes enthält.
    // Arbeitet auch auf einem im Hintergrund geladenen Dokument.
    function rowIsUnread(row) {
        // Die Tabellen des Forums stecken ineinander. Eine Zeile, die
        // selbst wieder Zeilen enthält, ist nur die Hülle um eine Tabelle
        // und darf nicht als ungelesen gelten - sonst färbt sich der
        // ganze Block statt der einzelnen Zeile.
        if (row.querySelector('tr'))
            return false;

        if (row.querySelector('td[class^="new-"], td[class*=" new-"]'))
            return true;

        var unread = false;

        row.querySelectorAll('img').forEach(function (img) {
            var file = (img.getAttribute('src') || '').split('/').pop().toLowerCase();
            var hint = (img.getAttribute('title') || '') + ' ' + (img.getAttribute('alt') || '');

            if (/^new(posts|folder)/.test(file))
                unread = true;
            else if (/neue\s+beitr/i.test(hint) && !/keine/i.test(hint))
                unread = true;
        });

        return unread;
    }

    // Baut die Adresse eines Themas auf: absolut, damit ein neuer Tab sie
    // gegen das Forum auflöst und nicht gegen die Erweiterung, und mit
    // gesetztem gonew=1 - der Link bringt es manchmal schon mit.
    function topicUrl(href) {
        try {
            var url = new URL(href, location.href);

            url.searchParams.set('gonew', '1');

            // Sprungmarke des Forums vor dem ersten ungelesenen Beitrag
            url.hash = 'UNREAD';

            return url.href;
        }
        catch {
            return null;
        }
    }

    // Ungelesene Themen einer Themenliste - egal ob aus der offenen Seite
    // oder aus einer im Hintergrund geladenen
    function topicsIn(root, seen) {
        var found = [];

        root.querySelectorAll('tr').forEach(function (row) {
            var cell = row.querySelector('td[class*="topicsubject"]');

            if (!cell || !rowIsUnread(row))
                return;

            var link = cell.querySelector('a[href*="ubb=showflat"]');

            if (!link)
                return;

            var url = topicUrl(link.getAttribute('href') || '');

            if (!url || seen[url])
                return;

            seen[url] = true;

            found.push({
                url: url,
                title: (link.textContent || '').trim(),
                row: row
            });
        });

        return found;
    }

    // Kategorien und Foren, die als ungelesen gelten. Arbeitet auf der
    // offenen Seite wie auf einer im Hintergrund geladenen.
    function forumsIn(root, seen) {
        var found = [];

        root.querySelectorAll('tr').forEach(function (row) {
            var cell = row.querySelector('td[class*="forumtitle"]');

            if (!cell || !rowIsUnread(row))
                return;

            var link = cell.querySelector('a[href*="ubb=postlist"], a[href*="ubb=cfrm"]');

            if (!link)
                return;

            var href = link.getAttribute('href') || '';

            try { href = new URL(href, location.href).href; }
            catch { return; }

            if (seen[href])
                return;

            seen[href] = true;
            found.push({ url: href, row: row });
        });

        return found;
    }

    // Tampermonkey öffnet Tabs am Pop-up-Blocker vorbei. Nur wenn das
    // nicht zur Verfügung steht, bleibt window.open als Rückfalllinie.
    function canOpenTabs() {
        return typeof GM_openInTab === 'function';
    }

    function openTab(url) {
        if (canOpenTabs()) {
            GM_openInTab(url, { active: false, insert: true, setParent: true });
            return true;
        }

        return !!window.open(url, '_blank');
    }

    // Öffnet die gesammelten Themen in eigenen Tabs
    function openTopics(topics, button, bar) {
        var blocked = 0;

        topics.forEach(function (topic) {
            if (!openTab(topic.url))
                blocked++;
        });

        if (!blocked) {
            button.disabled = true;
            button.textContent = 'Geöffnet';
            return;
        }

        button.textContent = 'Pop-ups erlauben und erneut klicken';

        var hint = document.getElementById('kforumOpenAllHint') || document.createElement('span');

        hint.id = 'kforumOpenAllHint';
        hint.textContent = 'Der Browser hat ' + blocked + ' von ' + topics.length
            + ' Tabs blockiert. In der Adresszeile Pop-ups für forum.knuddels.de erlauben.';
        bar.appendChild(hint);
    }

    // Sucht von der Übersicht aus nach ungelesenen Themen und folgt dabei
    // dem ganzen Weg: Übersicht -> Kategorie -> Forum -> Themen. Die
    // Kategorieseiten enthalten selbst noch keine Themen, deshalb reicht
    // eine Ebene nicht aus.
    var SEARCH_MAX_PAGES = 60;
    var SEARCH_MAX_DEPTH = 3;

    function searchTopics(forums, button, bar, done) {
        var queue = forums.map(function (forum) { return { url: forum.url, depth: 1 }; });
        var seenPages = {};
        var seenForums = {};
        var seenTopics = {};
        var topics = [];
        var loaded = 0;

        forums.forEach(function (forum) { seenForums[forum.url] = true; });
        button.disabled = true;

        function finish() {
            button.disabled = false;

            if (!topics.length) {
                button.textContent = 'Keine ungelesenen Themen gefunden';
                return;
            }

            button.textContent = topics.length === 1
                ? '1 ungelesenes Thema öffnen'
                : topics.length + ' ungelesene Themen öffnen';

            done(topics);
        }

        function step() {
            if (!queue.length || loaded >= SEARCH_MAX_PAGES) {
                finish();
                return;
            }

            var page = queue.shift();

            if (seenPages[page.url]) {
                step();
                return;
            }

            seenPages[page.url] = true;
            loaded++;

            button.textContent = 'Suche \u2026 (' + loaded + ' Seiten, '
                + topics.length + ' gefunden)';

            fetch(page.url, { credentials: 'same-origin' })
                .then(function (response) { return response.text(); })
                .then(function (html) {
                    var doc = new DOMParser().parseFromString(html, 'text/html');

                    topicsIn(doc, seenTopics).forEach(function (topic) {
                        topics.push(topic);
                    });

                    // Enthält die Seite selbst wieder Kategorien oder Foren,
                    // geht es dort weiter
                    if (page.depth < SEARCH_MAX_DEPTH) {
                        forumsIn(doc, seenForums).forEach(function (forum) {
                            queue.push({ url: forum.url, depth: page.depth + 1 });
                        });
                    }
                })
                .catch(function () { /* eine Seite überspringen reicht */ })
                .then(step);
        }

        step();
    }

    function addOpenAllButton() {
        if (!settings.openAll || document.getElementById('kforumOpenAllBar'))
            return;

        var topics = topicsIn(document, {});
        var forums = topics.length ? [] : forumsIn(document, {});

        if (!topics.length && !forums.length)
            return;

        var anchorRow = (topics[0] || forums[0]).row;
        var table = anchorRow.closest('table.t_outer') || anchorRow.closest('table');

        if (!table || !table.parentNode)
            return;

        var bar = document.createElement('div');
        var button = document.createElement('button');

        bar.id = 'kforumOpenAllBar';
        button.id = 'kforumOpenAll';
        button.type = 'button';

        if (topics.length) {
            button.textContent = topics.length === 1
                ? '1 ungelesenes Thema öffnen'
                : topics.length + ' ungelesene Themen öffnen';

            button.addEventListener('click', function () {
                openTopics(topics, button, bar);
            });
        }
        else {
            button.textContent = 'Ungelesene Themen suchen und öffnen';

            button.addEventListener('click', function search() {
                searchTopics(forums, button, bar, function (found) {
                    // Mit Tampermonkey lassen sich die Tabs sofort öffnen.
                    // Ohne greift der Pop-up-Blocker, weil zwischen Klick
                    // und Öffnen nachgeladen wurde - dann ein zweiter Klick.
                    if (canOpenTabs()) {
                        openTopics(found, button, bar);
                        return;
                    }

                    button.removeEventListener('click', search);
                    button.addEventListener('click', function () {
                        openTopics(found, button, bar);
                    });
                });
            });
        }

        bar.appendChild(button);
        table.parentNode.insertBefore(bar, table);
    }

    /* ------------------------------------------------------------------
     *  Spoiler
     *  Das Forum liefert den Kopf mit der Klasse "ubbcode-headerZZ", zu
     *  der es kein Stylesheet gibt - der Kasten fehlt also. Hier bekommt
     *  der Spoiler denselben Aufbau wie ein Zitat: Kopfzeile mit
     *  Kennzeichnung und Knopf, darunter der Text.
     * ----------------------------------------------------------------*/
    function enhanceSpoilers() {
        document.querySelectorAll('.post_inner div.spoiler').forEach(function (body) {
            if (body.classList.contains('kforumSpoilerBody'))
                return;

            body.classList.add('kforumSpoilerBody');

            var box = body.parentElement;
            var header = null;

            if (box && !box.classList.contains('post_inner'))
                header = box.querySelector('[class*="ubbcode-header"]');

            // Ohne eigenen Rahmen um Kopf und Text bleibt nur die Kopfzeile
            if (!header) {
                header = body.previousElementSibling;
                box = null;
            }

            if (box)
                box.classList.add('kforumSpoiler');

            if (!header)
                return;

            header.classList.add('kforumSpoilerHeader');

            // Kennzeichnung ergänzen, wenn der Kopf sie nicht selbst nennt
            if (!/spoiler/i.test(header.textContent || '')) {
                var tag = document.createElement('span');

                tag.className = 'kforumSpoilerTag';
                tag.textContent = 'Spoiler';
                header.insertBefore(tag, header.firstChild);
            }
        });
    }

    /* ------------------------------------------------------------------
     *  Beitragsicon
     *  Die Auswahl steht beim Antworten immer offen und nimmt viel Platz.
     *  Hier wird sie eingeklappt; die Beschriftung zeigt das gewählte
     *  Icon und öffnet die Auswahl bei Bedarf.
     * ----------------------------------------------------------------*/
    function collapsePostIcons() {
        document.querySelectorAll('fieldset').forEach(function (group) {
            if (group.getAttribute('data-kforum-icons'))
                return;

            var legend = group.querySelector('legend');

            if (!legend || !/beitragsicon/i.test(legend.textContent || ''))
                return;

            if (!group.querySelector('input[name="Icon"]'))
                return;

            group.setAttribute('data-kforum-icons', '1');
            group.classList.add('kforumIconSet');

            // alles hinter der Beschriftung in einen eigenen Bereich
            var body = document.createElement('div');
            var node = legend.nextSibling;

            body.className = 'kforumIconBody';

            while (node) {
                var next = node.nextSibling;

                body.appendChild(node);
                node = next;
            }

            group.appendChild(body);

            legend.classList.add('kforumIconLegend');
            legend.setAttribute('role', 'button');
            legend.setAttribute('tabindex', '0');
            legend.setAttribute('aria-expanded', 'false');
            legend.title = 'Auswahl der Beitragsicons ein- und ausklappen';

            var preview = document.createElement('span');

            preview.className = 'kforumIconPreview';
            legend.appendChild(preview);

            function showChoice() {
                preview.textContent = '';

                var chosen = group.querySelector('input[name="Icon"]:checked');

                if (!chosen)
                    return;

                var label = group.querySelector('label[for="' + chosen.id + '"]');
                var image = label ? label.querySelector('img') : null;

                if (image)
                    preview.appendChild(image.cloneNode(true));
                else
                    preview.textContent = 'kein Icon';
            }

            function toggle() {
                var open = group.classList.toggle('kforumIconOpen');

                legend.setAttribute('aria-expanded', open ? 'true' : 'false');
            }

            legend.addEventListener('click', toggle);

            legend.addEventListener('keydown', function (event) {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    toggle();
                }
            });

            // Nach der Wahl schließt sich die Auswahl wieder
            body.addEventListener('change', function () {
                showChoice();

                group.classList.remove('kforumIconOpen');
                legend.setAttribute('aria-expanded', 'false');
            });

            showChoice();
        });
    }

    /* ------------------------------------------------------------------
     *  Navigation
     * ----------------------------------------------------------------*/
    function tweakNavigation() {
        document.querySelectorAll('td.navigation .navpage').forEach(function (item) {
            var link = item.querySelector('a');

            if (!link)
                return;

            if ((link.textContent || '').trim() === 'Foren')
                link.textContent = '\u00dcbersicht der Foren';

            if (/\/admin\//.test(link.getAttribute('href') || '')) {
                item.classList.add('kforumAdminLink');
                item.style.display = settings.hideAdminLink ? 'none' : '';
            }
        });
    }

    /* ------------------------------------------------------------------
     *  Like ohne Zwischenseite
     *  Der Knopf führt auf eine Seite mit einem Formular. Das Skript holt
     *  dieses Formular im Hintergrund, schickt es ab und schreibt das
     *  Ergebnis direkt an den Knopf.
     * ----------------------------------------------------------------*/
    // Liest aus einer Like-Seite heraus, wie es um den Beitrag steht:
    // task "down" heißt, der Beitrag ist bereits geliked.
    function readLikePage(html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var form = null;

        doc.querySelectorAll('form').forEach(function (candidate) {
            if (candidate.querySelector('input[name="ubb"][value="like"]'))
                form = candidate;
        });

        var total = null;

        doc.querySelectorAll('td').forEach(function (cell) {
            var text = (cell.textContent || '').replace(/\s+/g, ' ');

            if (!/Likes insgesamt/i.test(text))
                return;

            if (/niemand/i.test(text)) {
                total = 0;
                return;
            }

            var found = /Likes insgesamt\s*:?\s*(\d+)/i.exec(text);

            if (found)
                total = Number(found[1]);
        });

        // Zelle mit der Namensliste der Likenden. Über das Datum neben
        // jedem Nick gefunden - die Tabellen sind verschachtelt, deshalb
        // wird von innen nach außen gesucht statt umgekehrt.
        var marker = doc.querySelector('.likes-date');
        var names = marker ? marker.closest('td') : null;

        return {
            doc: doc,
            form: form,
            task: form ? (form.querySelector('input[name="task"]') || {}).value : null,
            count: total,
            names: names
        };
    }

    function setLikeLabel(link, liked, count) {
        var text = liked ? 'Unlike' : 'Like';

        if (typeof count === 'number' && count > 0)
            text += ' (' + count + ')';

        link.textContent = text;
        link.classList.toggle('kforumLiked', !!liked);
    }

    // Baut die Zeile "N Mitglieder mögen das." unter dem Beitrag auf,
    // die sonst erst nach einem Neuladen erscheint.
    function updateLikeRow(link, info) {
        var table = link.closest('table');

        if (!table)
            return;

        // Das Forum hängt die Zeile ans Ende des Beitrags - unabhängig
        // davon, ob die Aktionen oben oder unten stehen
        var holder = table.tBodies[0] || table;
        var existing = holder.querySelector('td.post-likes');
        var row = existing ? existing.closest('tr') : null;

        if (!info.count) {
            if (row)
                row.remove();

            return;
        }

        var cell;

        if (row) {
            cell = row.querySelector('td.post-likes');
            cell.textContent = '';
        }
        else {
            row = document.createElement('tr');
            cell = document.createElement('td');
            cell.className = 'alt-2 small post-likes';
            cell.setAttribute('colspan', '2');
            row.appendChild(cell);
            holder.appendChild(row);
        }

        var icon = document.createElement('i');

        icon.className = 'far fa-thumbs-up fa-fw';
        cell.appendChild(icon);
        cell.appendChild(document.createTextNode(' '));

        var summary = document.createElement('a');

        summary.href = link.getAttribute('href');
        summary.rel = 'nofollow';
        summary.textContent = info.count === 1
            ? '1 Mitglied mag das.'
            : info.count + ' Mitglieder mögen das.';

        cell.appendChild(summary);

        if (!info.names)
            return;

        cell.appendChild(document.createTextNode(': '));

        var first = true;

        info.names.querySelectorAll('a[href*="ubb=showprofile"]').forEach(function (entry) {
            if (!first)
                cell.appendChild(document.createTextNode(', '));

            first = false;
            cell.appendChild(document.importNode(entry, true));
        });
    }

    function runLike(link) {
        if (link.classList.contains('kforumBusy'))
            return;

        var before = link.textContent;
        var url = link.getAttribute('href');

        link.classList.add('kforumBusy');
        link.textContent = '\u2026';

        fetch(url, { credentials: 'same-origin' })
            .then(function (response) { return response.text(); })
            .then(function (html) {
                var info = readLikePage(html);

                if (!info.form)
                    throw new Error('Like-Formular nicht gefunden');

                var data = new URLSearchParams();

                info.form.querySelectorAll('input[name]').forEach(function (field) {
                    if (field.type !== 'submit')
                        data.append(field.name, field.value);
                });

                return fetch('/ubbthreads.php', {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: data.toString()
                });
            })
            // Danach den tatsächlichen Stand holen, statt ihn zu schätzen
            .then(function () { return fetch(url, { credentials: 'same-origin' }); })
            .then(function (response) { return response.text(); })
            .then(function (html) {
                var info = readLikePage(html);
                var liked = info.task === 'down';

                link.classList.remove('kforumBusy');
                setLikeLabel(link, liked, info.count);
                updateLikeRow(link, info);
            })
            .catch(function () {
                // Im Zweifel den gewohnten Weg gehen: Seite öffnen
                link.classList.remove('kforumBusy');
                link.textContent = before;
                window.location.href = url;
            });
    }

    function enhanceLikes() {
        document.querySelectorAll('a[href*="ubb=like"]').forEach(function (link) {
            if (link.getAttribute('data-kforum-like'))
                return;

            // Auf der Like-Seite selbst nichts abfangen
            if (!link.closest('.post-options, td.post-likes'))
                return;

            link.setAttribute('data-kforum-like', '1');

            link.addEventListener('click', function (event) {
                event.preventDefault();
                runLike(link);
            });
        });
    }

    /* ------------------------------------------------------------------
     *  Antworten wie vor dem Update
     *  Das Forum bietet nur noch die Sofort-Varianten an. Hier bekommen
     *  sie ihre alten Namen zurück und daneben kommen die Knöpfe für den
     *  Volltexteditor.
     * ----------------------------------------------------------------*/
    function renameButton(link, label) {
        var done = false;

        link.childNodes.forEach(function (node) {
            if (node.nodeType === 3 && node.nodeValue.trim() && !done) {
                node.nodeValue = ' ' + label;
                done = true;
            }
        });

        if (!done)
            link.appendChild(document.createTextNode(' ' + label));
    }

    function fullButton(label, href) {
        var span = document.createElement('span');
        var link = document.createElement('a');

        span.className = 'post-buttons nw kforumFullReply';
        link.href = href;
        link.textContent = label;
        span.appendChild(link);

        return span;
    }

    // Reihenfolge der Aktionen, wie sie vor dem Forums-Update war
    var BUTTON_ORDER = ['sofortzitat', 'zitat', 'sofortantwort', 'antwort', 'aendern', 'like'];

    function buttonKind(span) {
        var link = span.querySelector('a');

        if (!link)
            return null;

        var href = link.getAttribute('href') || '';
        var text = (link.textContent || '').toLowerCase();

        if (/ubb=like/.test(href))      return 'like';
        if (/ubb=editpost/.test(href))  return 'aendern';

        if (/quickReply\(/.test(href))
            return /quickReply\(\s*\d+\s*,/.test(href) ? 'sofortzitat' : 'sofortantwort';

        if (/ubb=newreply/.test(href))
            return /[?&]q=1/.test(href) ? 'zitat' : 'antwort';

        if (/sofort-zitat/.test(text))   return 'sofortzitat';
        if (/sofort-antwort/.test(text)) return 'sofortantwort';

        return null;
    }

    // Das Forum floatet die Knöpfe nach rechts; dadurch dreht sich die
    // Reihenfolge im Bild um. Deshalb wird die Leiste zu einer Flex-Zeile
    // gemacht und jeder Knopf bekommt seinen festen Platz zugewiesen -
    // unabhängig davon, wie er im Quelltext steht.
    function sortButtons(host) {
        host.classList.add('kforumButtons');

        Array.prototype.slice.call(host.children).forEach(function (child) {
            var kind = buttonKind(child);

            child.classList.add('kforumBtn');
            child.style.order = kind ? (BUTTON_ORDER.indexOf(kind) + 1) : 0;
        });
    }

    // Verschiebt die Aktionen in die Kopfzeile des Beitrags
    function moveActionsUp(cell, host) {
        var table = cell.closest('table');

        if (!table)
            return;

        var header = table.querySelector('td.subjecttable, td.newsubjecttable');

        if (!header)
            return;

        host.classList.add('kforumActionsTop');

        // Zeile mit Beitragsnummer, Teilen, Melden und Datum
        var meta = header.querySelector('.iblock');

        if (meta) {
            meta.classList.add('kforumMetaRow');
            meta.appendChild(host);
        }
        else {
            header.appendChild(host);
        }

        var row = cell.closest('tr');

        if (row && !row.textContent.trim())
            row.style.display = 'none';
    }

    function enhanceReplyButtons() {
        document.querySelectorAll('td.post-options').forEach(function (cell) {
            if (cell.getAttribute('data-kforum-reply'))
                return;

            var quickReply = null;
            var quickQuote = null;

            cell.querySelectorAll('.quickreplybutton a').forEach(function (link) {
                var call = link.getAttribute('href') || '';
                var args = /quickReply\(\s*(\d+)\s*(,[^)]*)?\)/.exec(call);

                if (!args)
                    return;

                if (args[2])
                    quickQuote = { link: link, id: args[1] };
                else
                    quickReply = { link: link, id: args[1] };
            });

            if (!quickReply && !quickQuote)
                return;

            cell.setAttribute('data-kforum-reply', '1');

            var id = (quickReply || quickQuote).id;
            var host = cell.querySelector('.fr') || cell;

            if (quickQuote)
                renameButton(quickQuote.link, 'Sofort-Zitat');

            if (quickReply)
                renameButton(quickReply.link, 'Sofort-Antwort');

            host.appendChild(fullButton('Zitat', '/ubbthreads.php?ubb=newreply&Number=' + id + '&q=1'));
            host.appendChild(fullButton('Antwort', '/ubbthreads.php?ubb=newreply&Number=' + id));

            sortButtons(host);

            if (settings.actionsTop)
                moveActionsUp(cell, host);
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

        // Nichts Deckendes gefunden - dann die Grundfläche der Seite
        return pageBackground() || parseRgb('rgb(255, 255, 255)');
    }

    function skipTag(el) {
        return el.tagName === 'IFRAME' || el.tagName === 'IMG' || el.tagName === 'BR'
            || el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'TEMPLATE';
    }

    // Elemente, die das Skript selbst einfärbt - die Messung würde sonst
    // die weiße Schrift auf der Akzentfarbe wieder abdunkeln
    var SKIP_CONTRAST = '.form-button, input[value="Anschauen"], '
                      + 'input[value="Verbergen"], input[value="Zeigen"], '
                      + '.kforumSpoilerHeader input, .kforumSpoilerTag';

    function ensureReadable(el) {
        if (skipTag(el) || el.getAttribute('data-kforum-fixed'))
            return;

        if (el.matches && el.matches(SKIP_CONTRAST))
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

    // Gilt eine Fläche als hell? Entscheidet, ob Text darauf dunkel
    // gesetzt werden muss.
    function isLight(color) {
        var parts = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(color || '');

        if (!parts)
            return false;

        // fast durchsichtige Flächen zählen nicht
        if (parts[4] !== undefined && parseFloat(parts[4]) < 0.25)
            return false;

        return (Number(parts[1]) + Number(parts[2]) + Number(parts[3])) > LIGHT_LIMIT;
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
        var copy = crumbs.cloneNode(true);

        // Postfach, Nickmenü und Stimmung gehören nur nach oben
        copy.querySelectorAll('.fr, #myspace_control, script').forEach(function (node) {
            node.remove();
        });

        // Überschriften zu schlichtem Text machen. Das Forum verschachtelt
        // zwei <h1> ineinander; der Browser trennt sie beim Einlesen auf,
        // deshalb werden alle eingesammelt statt nur die erste.
        copy.querySelectorAll('h1, h2, h3').forEach(function (heading) {
            var span = document.createElement('span');

            while (heading.firstChild)
                span.appendChild(heading.firstChild);

            heading.parentNode.replaceChild(span, heading);
        });

        // doppelte Kennungen vermeiden
        copy.querySelectorAll('[id]').forEach(function (node) {
            node.removeAttribute('id');
        });

        while (copy.firstChild)
            target.appendChild(copy.firstChild);

        anchor.parentNode.insertBefore(table, anchor);
    }

    /* ------------------------------------------------------------------
     *  Einstellungen
     * ----------------------------------------------------------------*/
    var SETTINGS_KEY = 'kforum_settings';
    var BOARDS_KEY   = 'kforum_boards';

    var settings = {
        bottomCrumbs:  true,   // Pfad auch am Seitenende
        hideAdminLink: true,   // Forums-Administration ausblenden
        actionsTop:    false,  // Antwort/Zitat oben statt unter dem Beitrag
        openAll:       false,  // Knopf "alle ungelesenen Themen öffnen"
        hiddenBoards:  []
    };
    var boards = [];

    function loadSettings() {
        try {
            var stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');

            if (typeof stored.bottomCrumbs === 'boolean')
                settings.bottomCrumbs = stored.bottomCrumbs;

            if (typeof stored.hideAdminLink === 'boolean')
                settings.hideAdminLink = stored.hideAdminLink;

            if (typeof stored.actionsTop === 'boolean')
                settings.actionsTop = stored.actionsTop;

            if (typeof stored.openAll === 'boolean')
                settings.openAll = stored.openAll;

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
          + '    <label class="kforumOption"><input type="checkbox" id="kforumOptAdmin">'
          + '    <span>Forums-Administration ausblenden</span></label>'
          + '    <label class="kforumOption"><input type="checkbox" id="kforumOptTop">'
          + '    <span>Antwort und Zitat oben am Beitrag</span></label>'
          + '    <label class="kforumOption"><input type="checkbox" id="kforumOptOpenAll">'
          + '    <span>Button: alle ungelesenen Themen öffnen</span></label>'
          + '    <div class="kforumHint">Der Button steht über der Liste und öffnet '
          + '    jedes ungelesene Thema in einem eigenen Tab. Auf der Foren-Übersicht '
          + '    sucht er die Themen zuerst in den ungelesenen Foren; ein zweiter '
          + '    Klick öffnet sie dann. Der Browser fragt beim ersten Mal nach einer '
          + '    Erlaubnis für Pop-ups.</div>'
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
        var adminBox = panel.querySelector('#kforumOptAdmin');
        var topBox = panel.querySelector('#kforumOptTop');
        var openBox = panel.querySelector('#kforumOptOpenAll');

        crumbBox.checked = settings.bottomCrumbs;
        adminBox.checked = settings.hideAdminLink;
        topBox.checked = settings.actionsTop;
        openBox.checked = settings.openAll;

        // Position der Aktionen: beim Umschalten die Seite neu aufbauen zu
        // lassen wäre aufwendig - ein Hinweis reicht, der Rest kommt beim
        // nächsten Seitenaufruf
        topBox.addEventListener('change', function () {
            settings.actionsTop = topBox.checked;
            saveSettings();
            moveAllActions();
        });

        openBox.addEventListener('change', function () {
            settings.openAll = openBox.checked;
            saveSettings();

            if (settings.openAll)
                addOpenAllButton();
            else
                document.getElementById('kforumOpenAllBar')?.remove();
        });

        adminBox.addEventListener('change', function () {
            settings.hideAdminLink = adminBox.checked;
            saveSettings();

            document.querySelectorAll('.kforumAdminLink').forEach(function (item) {
                item.style.display = settings.hideAdminLink ? 'none' : '';
            });
        });

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
    // Welcher Stil gerade läuft. Wird gemessen, damit auch Stile
    // erkannt werden, die es heute noch nicht gibt.
    var theme = 'light';

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

    // Erste nicht durchsichtige Grundfläche der Seite
    function pageBackground() {
        var node = document.body || document.documentElement;

        while (node) {
            var color = parseRgb(getComputedStyle(node).backgroundColor);

            if (color && color.a >= 0.5)
                return color;

            node = node.parentElement;
        }

        return null;
    }

    function detectTheme() {
        var color = pageBackground();

        if (color)
            return luminance(color) < 0.4 ? 'dark' : 'light';

        // Rückfalllinie, solange noch nichts gerendert ist: der Name des
        // Stylesheets, das das Forum einbindet
        var sheet = document.querySelector('link[href*="/styles/Knuddels_"]');
        var name = sheet ? sheet.getAttribute('href') : '';

        return /dunkel|dark|night/i.test(name) ? 'dark' : 'light';
    }

    function applyTheme() {
        if (!document.documentElement)
            return;

        theme = detectTheme();

        var root = document.documentElement.classList;

        root.toggle(ROOT_CLASS, theme === 'dark');
        root.toggle(LIGHT_CLASS, theme === 'light');

        updateButton();
    }

    /* ------------------------------------------------------------------
     *  Stil des Forums umschalten
     *  Die Stile stehen im Auswahlfeld im Seitenfuß. Der Umschalter setzt
     *  dort den jeweils anderen und löst dasselbe Ereignis aus wie eine
     *  Auswahl von Hand - das Forum merkt sich die Wahl am Konto.
     * ----------------------------------------------------------------*/
    function styleSelect() {
        return document.querySelector('select[name="style"]');
    }

    function styleChoices() {
        var select = styleSelect();
        var found = { dark: null, light: null };

        if (!select)
            return found;

        Array.prototype.forEach.call(select.options, function (option) {
            var label = (option.textContent || '').toLowerCase();

            if (!found.dark && /dunkel|dark|night/.test(label))
                found.dark = option.value;
            else if (!found.light && /hell|light|tag/.test(label))
                found.light = option.value;
        });

        return found;
    }

    function switchTheme(button) {
        var select = styleSelect();
        var choices = styleChoices();
        var target = theme === 'dark' ? choices.light : choices.dark;

        if (!select || !target) {
            showToggleHint(button, 'Kein zweiter Stil gefunden');
            return;
        }

        select.value = target;

        // Zuerst der direkte Weg des Forums, sonst über das Ereignis,
        // das auch eine Auswahl von Hand auslöst
        var direct = false;

        try {
            var page = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

            if (typeof page.changePrefs === 'function') {
                page.changePrefs('style', target);
                direct = true;
            }
        }
        catch { /* dann eben über das Ereignis */ }

        if (!direct)
            select.dispatchEvent(new Event('change', { bubbles: true }));

        // Lädt die Seite nicht neu, bekommt der Umschalter einen Hinweis
        setTimeout(function () {
            showToggleHint(button, 'Stil im Seitenfuß wählen');
        }, 2500);
    }

    function showToggleHint(button, text) {
        if (!button || !button.isConnected)
            return;

        button.title = text + ' - das Auswahlfeld steht ganz unten auf der Seite.';
        button.classList.add('kforumToggleHint');
    }

    function updateButton() {
        var button = document.getElementById('kforumToggle');

        if (!button)
            return;

        var dark = theme === 'dark';

        button.innerHTML = '<span class="kforumIcon">' + (dark ? '☀️' : '🌙') + '</span>'
                         + '<span class="kforumLabel">' + (dark ? 'Hell' : 'Dunkel') + '</span>';

        button.title = dark
            ? 'Auf den hellen Stil des Forums wechseln'
            : 'Auf den dunklen Stil des Forums wechseln';
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
            switchTheme(button);
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

    // Eigene Stylesheets ans Ende des <head>, damit sie über denen des
    // Forums liegen
    function reorderStyle() {
        ['kforumToggleStyle', 'kforumForumStyle'].forEach(function (id) {
            var sheet = document.getElementById(id);

            if (sheet && document.head && sheet.parentNode !== document.head)
                document.head.appendChild(sheet);
        });
    }

    function start() {
        // Jetzt steht die Seite - der gemessene Wert ist verlässlicher
        // als die Schätzung am Dateinamen beim Start
        applyTheme();

        loadSettings();
        harvestBoards();

        addStyle('kforumToggleStyle', toggleCss());
        addStyle('kforumForumStyle', forumCss());
        reorderStyle();
        addButton();

        if (settings.bottomCrumbs)
            addBottomCrumbs();

        applyBoardFilter();

        // Anpassungen an das Forums-Update - jede für sich abgesichert,
        // damit ein geänderter Seitenaufbau nicht alles Weitere stoppt
        each([styleGroupTags, tweakNavigation, enhanceLikes, enhanceReplyButtons,
              enhanceSpoilers, collapsePostIcons]);

        markUnreadRows();
        markNewPosts();
        each([addOpenAllButton, scrollToFirstNew, fixPostContrast]);
    }

    // führt eine Reihe von Schritten aus und protokolliert Fehler,
    // statt den ganzen Durchlauf abzubrechen
    function each(steps) {
        steps.forEach(function (step) {
            try { step(); }
            catch (error) { console.error('[kn-forum] ' + step.name + ':', error); }
        });
    }

    // Theme sofort setzen, damit beim Laden nichts weiß aufblitzt.
    // Je nach Browser läuft das Skript, bevor <html> überhaupt existiert -
    // dann wird kurz gewartet.
    function boot() {
        applyTheme();

        if (document.readyState === 'loading')
            document.addEventListener('DOMContentLoaded', start);
        else
            start();
    }

    if (document.documentElement)
        boot();
    else
        (function wait() {
            if (document.documentElement)
                boot();
            else
                setTimeout(wait, 0);
        })();

    // Den Stil merkt sich jetzt das Forum am Konto - ein Abgleich über
    // andere Tabs ist dafür nicht mehr nötig.
})();
