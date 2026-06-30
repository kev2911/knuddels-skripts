// ==UserScript==
// @name         kn-fotoadmin
// @namespace    https://photo.knuddels.de/
// @version      1.04
// @description  Fotoadministration-Helfer für Knuddels.de (KI-Check, neues Layout, Nick kopieren, Melden im Hintergrund)
// @author       Kev
// @match        https://photo.knuddels.de/photos-admin*
// @match        https://photo.knuddels.de/photos-profile*
// @icon         https://photo.knuddels.de/favicon-de.ico
// @updateURL    https://github.com/kev2911/knuddels-skripts/raw/refs/heads/main/kn-fotoadmin.user.js
// @downloadURL  https://github.com/kev2911/knuddels-skripts/raw/refs/heads/main/kn-fotoadmin.user.js
// @require      https://code.jquery.com/jquery-3.7.1.min.js
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// ==/UserScript==

/* =========================================================================
 *  Tampermonkey-Adapter  (automatisch erzeugt aus content.js)
 *  Bildet chrome.storage.local promise-kompatibel auf GM_getValue/GM_setValue ab.
 *  Der restliche Code ist mit der Browser-Extension identisch.
 * ========================================================================= */
const chrome = {
    storage: {
        local: {
            get: function (key) {
                return new Promise(function (resolve) {
                    const out = {};
                    const keys = Array.isArray(key) ? key : [key];
                    keys.forEach(function (k) {
                        const raw = (typeof GM_getValue === 'function') ? GM_getValue(k, null) : null;
                        if (raw != null) {
                            try { out[k] = JSON.parse(raw); } catch (e) { out[k] = raw; }
                        }
                    });
                    resolve(out);
                });
            },
            set: function (obj) {
                return new Promise(function (resolve) {
                    Object.keys(obj).forEach(function (k) {
                        if (typeof GM_setValue === 'function') GM_setValue(k, JSON.stringify(obj[k]));
                    });
                    resolve();
                });
            }
        }
    }
};

/**
 * Extended Photo Administration – Content Script (Manifest V3)
 *
 * Funktionen:
 *  - Toolbar oben mit aufklappbarem Einstellungs-Menü (⚙) und Funde-Übersicht
 *  - Einstellungen direkt im Menü: Auto-Prüfung, Delay, Retry-Delay,
 *    max. Versuche, Gelb-/Rot-Schwelle – werden gespeichert (chrome.storage)
 *  - Ampel-Übersicht (grün/gelb/rot + Fehler), Zähler klickbar → springt
 *    durch die jeweiligen Funde
 *  - automatisches Vorladen + KI-Prüfung aller Bilder, mit Pause + Retry
 *  - alle Original-Funktionen (Altersmarkierung, Bot-Makro, "Ok"-Klick, Proxy)
 *
 * jQuery wird über die Extension mitgeliefert (jquery.min.js läuft davor).
 */
(function () {
    'use strict';

    /**
     * Konfiguration / Konstanten
     */
    class Config {
        static PROXIES = [
            'https://proxy.hovida.de/?',
            'https://proxy.mein-chatserver.de/?',
            'https://quizgame.bplaced.net/proxy/index.php?url=',
            'https://hiveproxy.aquadev.de/moderate?url='
            // Eigene Proxys hier ergänzen (Vorlagen im Ordner proxy-vorlagen/), z. B.:
            // 'https://DEIN-WORKER.workers.dev/?url=',
            // 'https://DEIN-HOST/hiveproxy/index.php?url=',
        ];

        static AGE_THRESHOLD = 18;
        static AI_THRESHOLD_HIGH = 70;   // rot ab diesem Wert
        static AI_THRESHOLD_MEDIUM = 50; // gelb ab diesem Wert
        static BUTTON_COOLDOWN = 0;

        // ---- Einstellungen für das automatische Vorladen/Prüfen ----
        static AUTO_CHECK = false;    // beim Laden automatisch starten (Standard: aus, per Einstellung aktivierbar)
        static INITIAL_DELAY = 1500;  // Wartezeit nach Seitenaufbau (ms)
        static CHECK_DELAY = 2000;    // Pause zwischen zwei Bildern (ms)
        static MAX_RETRIES = 3;       // Versuche pro Bild bei Fehler
        static RETRY_DELAY = 2000;    // Wartezeit vor erneutem Versuch (ms)
        static USE_DROPDOWN = true;   // Kategorie als Dropdown (true) oder einzelne Buttons (false)
        static NEW_LAYOUT = true;     // neues Listen-Layout (Standard: an)
        // Im Buttons-Modus zuerst gezeigte Bewertungen (Rest hinter "+ mehr").
        // Treffer per Teilstring auf den Options-Wert (deckt Profil/Verify ab).
        static PRIMARY_VERDICTS = ['Ok', 'OpenSexually', 'GeneralTermsViolation', 'FakeAttempt'];
        // ------------------------------------------------------------

        static URLS = {
            // Regex-Kennungen: erkennen auch die "_submit"-Varianten der Seiten,
            // auf denen man nach einer Aktion landet (z. B. photos-admin-profile_submit.html).
            PROFILE_CONTROL: 'photos-admin-profilecontrol(_submit)?\\.html',
            ALBUM_CONTROL: 'photos-admin-albumcontrol(_submit)?\\.html',
            ALBUM_PHOTO: 'photos-admin-albumphoto(_submit)?\\.html',
            VERIFY_CONTROL: 'photos-admin-verifycontrol(_submit)?\\.html',
            PROFILE: 'photos-profile(_submit)?\\.html',
            ADMIN_PROFILE: 'photos-admin-profile(_submit)?\\.html'
        };

        static API_ENDPOINTS = {
            AI_DETECTION: 'https://plugin.hivemoderation.com/api/v1/image/ai_detection'
        };
    }

    // Standardwerte (für "Standard wiederherstellen"), in Config-Einheiten (ms / %)
    const DEFAULTS = {
        autoCheck: false,
        checkDelay: 2000,
        retryDelay: 2000,
        maxRetries: 3,
        thMedium: 50,
        thHigh: 70,
        useDropdown: true,
        newLayout: true
    };

    /**
     * Persistente Einstellungen via chrome.storage.local
     */
    class Settings {
        static available() {
            return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
        }

        static async load() {
            if (!this.available()) return;
            try {
                const data = await chrome.storage.local.get('epaSettings');
                const s = data.epaSettings;
                if (!s) return;
                if (typeof s.autoCheck === 'boolean') Config.AUTO_CHECK = s.autoCheck;
                if (s.checkDelay != null) Config.CHECK_DELAY = s.checkDelay;
                if (s.retryDelay != null) Config.RETRY_DELAY = s.retryDelay;
                if (s.maxRetries != null) Config.MAX_RETRIES = s.maxRetries;
                if (s.thMedium != null) Config.AI_THRESHOLD_MEDIUM = s.thMedium;
                if (s.thHigh != null) Config.AI_THRESHOLD_HIGH = s.thHigh;
                if (typeof s.useDropdown === 'boolean') Config.USE_DROPDOWN = s.useDropdown;
                if (typeof s.newLayout === 'boolean') Config.NEW_LAYOUT = s.newLayout;
            } catch (e) { /* Storage evtl. nicht verfügbar */ }
        }

        static async save() {
            if (!this.available()) return;
            try {
                await chrome.storage.local.set({
                    epaSettings: {
                        autoCheck: Config.AUTO_CHECK,
                        checkDelay: Config.CHECK_DELAY,
                        retryDelay: Config.RETRY_DELAY,
                        maxRetries: Config.MAX_RETRIES,
                        thMedium: Config.AI_THRESHOLD_MEDIUM,
                        thHigh: Config.AI_THRESHOLD_HIGH,
                        useDropdown: Config.USE_DROPDOWN,
                        newLayout: Config.NEW_LAYOUT
                    }
                });
            } catch (e) { /* ign?? */ }
        }
    }

    /**
     * Hilfsfunktionen
     */
    class Utils {
        static generateUUID() {
            return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c =>
                (+c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> +c / 4).toString(16)
            );
        }

        static extractAge(text) {
            return text.match(/\([^,]*,\s*([^)]+)\)/)?.[1] || null;
        }

        static extractName(text) {
            return text.split('(')[0].trim();
        }

        static isCurrentPage(pageIdentifier) {
            return new RegExp(pageIdentifier).test(window.location.href);
        }

        static sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        static clamp(v, min, max) {
            return Math.min(max, Math.max(min, v));
        }
    }

    /**
     * Proxy-Verwaltung (zufällige Auswahl)
     */
    class ProxyManager {
        getNextProxy(url) {
            const randomIndex = Math.floor(Math.random() * Config.PROXIES.length);
            const proxy = Config.PROXIES[randomIndex];
            return proxy + url;
        }

        // Alle Proxys in zufälliger Reihenfolge (für Fallback innerhalb einer Prüfung)
        shuffledProxies() {
            const arr = [...Config.PROXIES];
            for (let i = arr.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [arr[i], arr[j]] = [arr[j], arr[i]];
            }
            return arr;
        }
    }

    /**
     * URL- und Bildquellen-Anpassung
     */
    class UrlModifier {
        static modifySearchLinks() {
            $('a:contains("Yandex"), a:contains("Google")').each(function () {
                const href = $(this).attr("href");
                if (!href) return;
                const modifiedHref = href
                    .replace('pro0l', 'pro0vl')
                    .replace('pro0l', 'pro0vl');
                $(this).attr("href", modifiedHref);
            });
        }

        static modifyImageSources() {
            $('img').each(function () {
                const src = $(this).attr("src");
                if (!src) return;
                const modifiedSrc = src
                    .replace('pro0l', 'pro0vl')
                    .replace('pro0l4', 'pro0vl');
                $(this).attr("src", modifiedSrc);
            });
        }
    }

    /**
     * Altersmarkierung (Minderjährige hervorheben)
     */
    class AgeMarker {
        static markUnderAgeUsers() {
            if (Utils.isCurrentPage(Config.URLS.PROFILE_CONTROL)) {
                this.markProfileControlUsers();
            } else if (Utils.isCurrentPage(Config.URLS.ALBUM_CONTROL)) {
                this.markAlbumControlUsers();
            }
        }

        static markProfileControlUsers() {
            $('.user-info').each(function () {
                const age = Utils.extractAge($(this).text());
                if (age && Number(age) < Config.AGE_THRESHOLD) {
                    const container = $(this).parent().parent().find('.photo_cell_header').last();
                    AgeMarker.applyUnderAgeStyle($(this), container);
                }
            });
        }

        static markAlbumControlUsers() {
            $('.photo_content_wrapper .detaildata').each(function () {
                const age = Utils.extractAge($(this).text());
                if (age && Number(age) < Config.AGE_THRESHOLD) {
                    const container = $(this).parent();
                    AgeMarker.applyUnderAgeStyleSimple(container);
                }
            });
        }

        static applyUnderAgeStyle(userInfo, container) {
            const bgColor = "#F7BE81";
            container.parent().parent().css({ "background": bgColor, "background-color": bgColor });
            userInfo.css({ "background": bgColor, "background-color": bgColor });
            container.find('a').css({ "background": bgColor, "background-color": bgColor });
        }

        static applyUnderAgeStyleSimple(container) {
            const bgColor = "#F7BE81";
            container.css({ "background": bgColor, "background-color": bgColor, "backgroundColor": bgColor });
        }
    }

    /**
     * Admin-Aktionen je Mitglied: Bot/Scam-Makros + "Profilbild melden".
     * Läuft auf allen photos-admin*-Seiten (Fotokontrolle, Album, Verify, PHV …).
     */
    class AdminActions {
        static init() {
            // Nur in Admin-Bereichen, nicht in der öffentlichen Profilansicht
            if (!/photos-admin/i.test(window.location.href)) return;

            AdminActions.injectStyles();
            AdminActions.blocks = [];

            // Mitglieder über ihr Namens-Element finden (je nach Seite unterschiedlich)
            $('.user-info, .detaildata').each(function () {
                const $info = $(this);
                const name = Utils.extractName($info.text());
                if (!name) return;

                const block = AdminActions.findBlock($info);
                if (!block || block.length === 0) return;

                // Jeden Block nur einmal verarbeiten
                if (block.data('epaDone')) return;
                block.data('epaDone', true);
                AdminActions.blocks.push(block);

                AdminActions.addMacros(block, name);
                AdminActions.addReport(block, name);
            });

            AdminActions.bindMacroEvents();
        }

        // Kleinsten Vorfahren finden, der ein Bild UND einen Such-Link enthält
        static findBlock($info) {
            let $el = $info;
            let imgOnly = null;
            for (let i = 0; i < 6; i++) {
                $el = $el.parent();
                if (!$el || $el.length === 0 || $el.is('body')) break;
                const hasImg = $el.find('.userimage').length > 0;
                const hasLink = AdminActions.refLink($el).length > 0;
                if (hasImg && hasLink) return $el;
                if (hasImg && !imgOnly) imgOnly = $el; // Fallback merken
            }
            return imgOnly || $info.parent().parent();
        }

        // Vorhandene Such-/Aktions-Links (zum Anhängen + Farbe übernehmen)
        static refLink($block) {
            return $block.find('a').filter(function () {
                return /Administration|Yandex|Google/i.test($(this).text());
            });
        }

        static addMacros(block, name) {
            if (block.find('.epa-macro').length) return;

            const refs = AdminActions.refLink(block);
            const ref = refs.last();

            const bot = $('<a href="#" class="epa-macro" data-type="bot">Bot</a>').attr('data-nick', name);
            const scam = $('<a href="#" class="epa-macro" data-type="scam">Scam</a>').attr('data-nick', name);

            // Farbe vom vorhandenen Link übernehmen (z. B. das Rot von Yandex/Google)
            if (ref.length) {
                const col = ref.css('color');
                if (col) {
                    bot.css('color', col).attr('data-color', col);
                    scam.css('color', col).attr('data-color', col);
                }
            }

            if (ref.length) {
                ref.after(' ', bot, ' ', scam);
            } else {
                const host = block.find('.photo_cell_header').last();
                (host.length ? host : block).append(' ', bot, ' ', scam);
            }

            // Select für "Fake-Versuch" auf beiden Buttons merken (falls vorhanden)
            const sel = block.find('.select, select[name^="p"]').first();
            if (sel.length) {
                bot.data('select', sel);
                scam.data('select', sel);
            }
        }

        static addReport(block, name) {
            if (block.find('.epa-report').length) return;

            const img = block.find('.userimage').first();
            if (img.length === 0) return;

            const nick = name.toLowerCase();
            const url = `https://photo.knuddels.de/photos-comments.html?mode=report&where=${nick}-pro0l0p`;
            const btn = $('<a class="epa-report" target="_blank" rel="noopener">Profilbild melden</a>').attr('href', url);

            // Ans ENDE des Blocks (nach Nick/Geschlecht/Alter), damit nichts überdeckt wird
            block.append($('<div class="epa-report-row"></div>').append(btn));
        }

        static bindMacroEvents() {
            $('.epa-macro').off('click.epa').on('click.epa', function (e) {
                e.preventDefault();
                const el = $(this);
                const nick = el.attr('data-nick');
                const type = el.attr('data-type'); // 'bot' | 'scam'

                navigator.clipboard.writeText(`/macro ${type}:${nick}|Fotokontr.`);
                AdminActions.flash(el);

                // Bei Bot UND Scam die Kategorie auf "Fake-Versuch" setzen
                const sel = el.data('select');
                if (sel && sel.length) CategoryControls.setFake(sel);
                return false;
            });
        }

        static flash(el) {
            const orig = el.text();
            const col = el.attr('data-color');
            el.text('Kopiert!').css('color', '#22c55e');
            setTimeout(() => {
                el.text(orig).css('color', col || '');
            }, 1000);
        }

        static injectStyles() {
            if ($('#epa-action-styles').length) return;
            const css = `
                .epa-macro { display:inline; margin:0 2px; font-size:12px; cursor:pointer;
                    text-decoration:underline; white-space:nowrap; }
                .epa-macro:hover { opacity:.8; }
                .epa-report-row { display:block; clear:both; margin:8px 0 2px; }
                .epa-report { display:inline-block; padding:4px 10px; border-radius:5px;
                    background:#7c3aed; color:#fff !important; font-size:12px; text-decoration:none; }
                .epa-report:hover { filter:brightness(1.12); }
            `;
            $('<style id="epa-action-styles">').text(css).appendTo('head');
        }
    }

    /**
     * KI-Erkennung (Hive über Proxy)
     */
    class AIDetectionService {
        constructor() {
            this.proxyManager = new ProxyManager();
        }

        async checkImage(imageUrl) {
            // Bild einmalig direkt laden (kein Proxy nötig, same-origin)
            const response = await fetch(imageUrl);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const blob = await response.blob();

            // Proxys in zufälliger Reihenfolge durchprobieren – bei 429/Fehler zum nächsten
            const proxies = this.proxyManager.shuffledProxies();
            let lastError = null;

            for (const proxy of proxies) {
                try {
                    const formData = this.createFormData(blob); // pro Versuch neu (Body wird verbraucht)
                    const apiResponse = await fetch(proxy + Config.API_ENDPOINTS.AI_DETECTION, {
                        method: 'POST',
                        body: formData
                    });
                    if (!apiResponse.ok) {
                        throw new Error(`Proxy/API status ${apiResponse.status}`);
                    }
                    return this.processApiResponse(await apiResponse.json());
                } catch (error) {
                    lastError = error; // nächsten Proxy versuchen
                }
            }

            throw lastError || new Error('Alle Proxys fehlgeschlagen');
        }

        createFormData(blob) {
            const data = new FormData();
            const file = new File([blob], `temp_${Date.now()}.jpg`, { type: 'image/jpeg' });
            data.append('media', file);
            data.append('request_id', Utils.generateUUID());
            return data;
        }

        processApiResponse(apiData) {
            const classScores = {};
            apiData.data.classes.forEach(item => {
                classScores[item.class] = item.score;
            });

            const score = classScores.ai_generated;
            if (typeof score !== 'number') {
                throw new Error('Ungültige API-Antwort (kein ai_generated-Score)');
            }
            return { isAi: score, probability: score };
        }
    }

    /**
     * Toolbar oben: Menü (Einstellungen) + Funde-Übersicht
     */
    class Toolbar {
        constructor() {
            this.onStartStop = null;      // ()
            this.onRecheck = null;        // ()
            this.onSettingsChange = null; // (settings) – Werte in Config-Einheiten (ms/%)
            this.onJumpCategory = null;   // (category)
            this.el = null;
            this.refs = {};
            this.build();
        }

        build() {
            this.addStyles();

            const bar = $(`
                <div id="epa-toolbar">
                    <div class="epa-bar">
                        <span class="epa-title">🛡 Fotokontrolle</span>

                        <span class="epa-status">
                            <span class="epa-status-dot"></span>
                            <span class="epa-status-text">Bereit</span>
                        </span>
                        <span class="epa-progress-text"></span>

                        <span class="epa-amp-group">
                            <button type="button" class="epa-amp" data-cat="low">
                                <span class="epa-dot epa-green"></span>
                                <b class="epa-c-green">0</b>
                                <em class="epa-l-green"></em>
                            </button>
                            <button type="button" class="epa-amp" data-cat="medium">
                                <span class="epa-dot epa-yellow"></span>
                                <b class="epa-c-yellow">0</b>
                                <em class="epa-l-yellow"></em>
                            </button>
                            <button type="button" class="epa-amp" data-cat="high">
                                <span class="epa-dot epa-red"></span>
                                <b class="epa-c-red">0</b>
                                <em class="epa-l-red"></em>
                            </button>
                            <button type="button" class="epa-amp" data-cat="error">
                                <span class="epa-dot epa-err"></span>
                                <b class="epa-c-err">0</b>
                                <em>Fehler</em>
                            </button>
                            <span class="epa-amp epa-total" title="geprüft / gesamt">
                                <b class="epa-c-checked">0</b><span class="epa-slash">/</span><b class="epa-c-total">0</b>
                            </span>
                        </span>

                        <span class="epa-actions">
                            <button type="button" class="epa-btn epa-startstop">▶ Start</button>
                            <button type="button" class="epa-btn epa-ghost epa-recheck">↻ Alle neu</button>
                            <button type="button" class="epa-btn epa-ghost epa-settings-toggle">⚙ Einstellungen</button>
                        </span>
                    </div>

                    <div class="epa-panel" style="display:none;">
                        <div class="epa-panel-grid">
                            <label class="epa-set epa-set-check">
                                <input type="checkbox" data-key="autoCheck">
                                <span>Auto-Prüfung beim Laden</span>
                            </label>
                            <label class="epa-set epa-set-check">
                                <input type="checkbox" data-key="useDropdown">
                                <span>Kategorie als Dropdown</span>
                            </label>
                            <label class="epa-set epa-set-check">
                                <input type="checkbox" data-key="newLayout">
                                <span>Neues Layout</span>
                            </label>
                            <label class="epa-set">
                                <span>Delay zwischen Bildern (s)</span>
                                <input type="number" min="0" step="0.5" data-key="checkDelay">
                            </label>
                            <label class="epa-set">
                                <span>Retry-Delay (s)</span>
                                <input type="number" min="0" step="0.5" data-key="retryDelay">
                            </label>
                            <label class="epa-set">
                                <span>Max. Versuche</span>
                                <input type="number" min="1" step="1" data-key="maxRetries">
                            </label>
                            <label class="epa-set">
                                <span>Gelb ab (%)</span>
                                <input type="number" min="0" max="100" step="1" data-key="thMedium">
                            </label>
                            <label class="epa-set">
                                <span>Rot ab (%)</span>
                                <input type="number" min="0" max="100" step="1" data-key="thHigh">
                            </label>
                        </div>
                        <div class="epa-panel-actions">
                            <span class="epa-hint">Änderungen werden sofort übernommen &amp; gespeichert. Schwellen-Änderungen färben bereits geprüfte Bilder neu ein.</span>
                            <button type="button" class="epa-btn epa-ghost epa-reset">Standard wiederherstellen</button>
                        </div>
                    </div>
                </div>
            `);

            $('body').prepend(bar);
            this.el = bar;

            // Seiteninhalt nach unten schieben, damit die Leiste nichts verdeckt
            const barHeight = bar.find('.epa-bar').outerHeight() || 48;
            const cur = parseFloat(window.getComputedStyle(document.body).paddingTop) || 0;
            document.body.style.paddingTop = (cur + barHeight) + 'px';

            this.refs = {
                statusEl: bar.find('.epa-status'),
                statusText: bar.find('.epa-status-text'),
                progress: bar.find('.epa-progress-text'),
                green: bar.find('.epa-c-green'),
                yellow: bar.find('.epa-c-yellow'),
                red: bar.find('.epa-c-red'),
                err: bar.find('.epa-c-err'),
                checked: bar.find('.epa-c-checked'),
                total: bar.find('.epa-c-total'),
                lGreen: bar.find('.epa-l-green'),
                lYellow: bar.find('.epa-l-yellow'),
                lRed: bar.find('.epa-l-red'),
                startStop: bar.find('.epa-startstop'),
                recheck: bar.find('.epa-recheck'),
                settingsToggle: bar.find('.epa-settings-toggle'),
                panel: bar.find('.epa-panel'),
                reset: bar.find('.epa-reset'),
                inputs: {
                    autoCheck: bar.find('input[data-key="autoCheck"]'),
                    useDropdown: bar.find('input[data-key="useDropdown"]'),
                    newLayout: bar.find('input[data-key="newLayout"]'),
                    checkDelay: bar.find('input[data-key="checkDelay"]'),
                    retryDelay: bar.find('input[data-key="retryDelay"]'),
                    maxRetries: bar.find('input[data-key="maxRetries"]'),
                    thMedium: bar.find('input[data-key="thMedium"]'),
                    thHigh: bar.find('input[data-key="thHigh"]')
                }
            };

            // Eingabefelder aus aktueller Config befüllen
            this.setInputs({
                autoCheck: Config.AUTO_CHECK,
                checkDelay: Config.CHECK_DELAY,
                retryDelay: Config.RETRY_DELAY,
                maxRetries: Config.MAX_RETRIES,
                thMedium: Config.AI_THRESHOLD_MEDIUM,
                thHigh: Config.AI_THRESHOLD_HIGH,
                useDropdown: Config.USE_DROPDOWN,
                newLayout: Config.NEW_LAYOUT
            });
            this.updateThresholdLabels(Config.AI_THRESHOLD_MEDIUM, Config.AI_THRESHOLD_HIGH);

            // Events
            this.refs.startStop.on('click', () => { if (this.onStartStop) this.onStartStop(); });
            this.refs.recheck.on('click', () => { if (this.onRecheck) this.onRecheck(); });

            this.refs.settingsToggle.on('click', () => {
                this.refs.panel.slideToggle(120);
                this.refs.settingsToggle.toggleClass('epa-active');
            });

            this.refs.panel.find('input').on('change input', () => {
                if (this.onSettingsChange) this.onSettingsChange(this.readSettings());
            });

            this.refs.reset.on('click', () => {
                this.setInputs(DEFAULTS);
                if (this.onSettingsChange) this.onSettingsChange(this.readSettings());
            });

            bar.find('.epa-amp[data-cat]').on('click', (e) => {
                const cat = $(e.currentTarget).data('cat');
                if (this.onJumpCategory) this.onJumpCategory(cat);
            });
        }

        addStyles() {
            const styles = `
                #epa-toolbar {
                    position: fixed; top: 0; left: 0; right: 0; z-index: 2147483647;
                    font: 13px/1.4 system-ui, -apple-system, sans-serif; color: #f5f7fa;
                }
                #epa-toolbar .epa-bar {
                    display: flex; align-items: center; flex-wrap: wrap; gap: 14px;
                    padding: 8px 14px; box-sizing: border-box;
                    background: #0b1e3b; box-shadow: 0 2px 10px rgba(0,0,0,0.35);
                    border-bottom: 2px solid #2563eb;
                }
                #epa-toolbar .epa-title { font-weight: 700; letter-spacing: .2px; white-space: nowrap; }
                #epa-toolbar .epa-status { display: flex; align-items: center; gap: 7px; white-space: nowrap; }
                #epa-toolbar .epa-status-dot { width: 10px; height: 10px; border-radius: 50%; background: #94a3b8; }
                #epa-toolbar .epa-status.running .epa-status-dot { background: #2563eb; animation: epa-pulse 1s ease-in-out infinite; }
                #epa-toolbar .epa-status.done .epa-status-dot { background: #22c55e; animation: none; }
                @keyframes epa-pulse { 0%,100% { opacity: .35; } 50% { opacity: 1; } }
                #epa-toolbar .epa-progress-text { opacity: .8; font-variant-numeric: tabular-nums; white-space: nowrap; }

                #epa-toolbar .epa-amp-group { display: flex; align-items: center; gap: 6px; margin-left: auto; }
                #epa-toolbar .epa-amp {
                    display: flex; align-items: center; gap: 5px;
                    background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08);
                    color: #f5f7fa; font: inherit; padding: 4px 9px; border-radius: 6px;
                    cursor: pointer; transition: background .15s, border-color .15s; white-space: nowrap;
                }
                #epa-toolbar button.epa-amp:hover { background: rgba(255,255,255,.12); border-color: rgba(255,255,255,.2); }
                #epa-toolbar .epa-amp.epa-total { cursor: default; background: transparent; border: none; opacity: .8; }
                #epa-toolbar .epa-amp b { font-size: 14px; min-width: 12px; text-align: right; }
                #epa-toolbar .epa-amp em { opacity: .6; font-style: normal; font-size: 11px; }
                #epa-toolbar .epa-slash { opacity: .5; margin: 0 1px; }
                #epa-toolbar .epa-dot { width: 11px; height: 11px; border-radius: 50%; display: inline-block; }
                #epa-toolbar .epa-green { background: #22c55e; }
                #epa-toolbar .epa-yellow { background: #faab00; }
                #epa-toolbar .epa-red { background: #dc3545; }
                #epa-toolbar .epa-err { background: #94a3b8; }

                #epa-toolbar .epa-actions { display: flex; align-items: center; gap: 8px; }
                #epa-toolbar .epa-btn {
                    background: #2563eb; color: #fff; border: none; padding: 6px 12px;
                    border-radius: 6px; cursor: pointer; font: inherit; font-weight: 600;
                    transition: background .15s; white-space: nowrap;
                }
                #epa-toolbar .epa-btn:hover { background: #1d4ed8; }
                #epa-toolbar .epa-btn:disabled { background: #475569; cursor: not-allowed; }
                #epa-toolbar .epa-btn.epa-ghost { background: transparent; border: 1px solid #2563eb; color: #cfe0ff; }
                #epa-toolbar .epa-btn.epa-ghost:hover { background: rgba(37,99,235,.18); }
                #epa-toolbar .epa-btn.epa-ghost.epa-active { background: #2563eb; color: #fff; }
                #epa-toolbar .epa-btn.epa-stop { background: #dc3545; }
                #epa-toolbar .epa-btn.epa-stop:hover { background: #b02a37; }

                #epa-toolbar .epa-panel {
                    background: #0d244a; border-bottom: 2px solid #2563eb;
                    box-shadow: 0 8px 18px rgba(0,0,0,0.35); padding: 14px;
                }
                #epa-toolbar .epa-panel-grid {
                    display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
                    gap: 10px 22px; max-width: 1100px;
                }
                #epa-toolbar .epa-set {
                    display: flex; align-items: center; justify-content: space-between; gap: 10px;
                }
                #epa-toolbar .epa-set.epa-set-check { justify-content: flex-start; gap: 8px; }
                #epa-toolbar .epa-set span { opacity: .9; }
                #epa-toolbar .epa-set input[type="number"] {
                    width: 80px; padding: 5px 7px; border-radius: 5px;
                    border: 1px solid #334b73; background: #0f2748; color: #f5f7fa; font: inherit;
                }
                #epa-toolbar .epa-set input[type="checkbox"] { width: 16px; height: 16px; accent-color: #2563eb; }
                #epa-toolbar .epa-panel-actions {
                    display: flex; align-items: center; justify-content: space-between;
                    gap: 14px; margin-top: 12px; flex-wrap: wrap;
                }
                #epa-toolbar .epa-hint { opacity: .6; font-size: 12px; max-width: 720px; }

                /* --- Styles der Bild-Prüfung (unverändert) --- */
                .ai-image-wrapper { position: relative; display: inline-block; }
                .ai-check-button {
                    position: absolute; top: 5px; right: 5px;
                    background-color: #007bff; color: white; border: none;
                    padding: 4px 8px; font-size: 11px; border-radius: 3px;
                    cursor: pointer; z-index: 1000; transition: background-color 0.2s; opacity: 0.9;
                }
                .ai-check-button:hover { background-color: #0056b3; opacity: 1; }
                .ai-check-button:disabled { background-color: #6c757d; cursor: not-allowed; }
                .ai-check-button.ai-error { background-color: #dc3545; }
                .ai-result-container { position: absolute; top: 5px; right: 5px; z-index: 1000; }
                .ai-result { font-weight: bold; padding: 4px 8px; border-radius: 3px; display: inline-block; font-size: 11px; opacity: 0.9; }
                .ai-low { background-color: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
                .ai-medium { background-color: #fff3cd; color: #856404; border: 1px solid #ffeaa7; }
                .ai-high { background-color: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
                .ai-generated-image { border: 3px solid #dc3545 !important; box-shadow: 0 0 5px #dc3545; }
                .ai-modified-image { border: 3px solid #faab00 !important; box-shadow: 0 0 5px #faab00; }
                .epa-jump-highlight { outline: 4px solid #2563eb !important; outline-offset: 2px; }
            `;
            $('<style>').text(styles).appendTo('head');
        }

        setInputs(s) {
            this.refs.inputs.autoCheck.prop('checked', !!s.autoCheck);
            this.refs.inputs.useDropdown.prop('checked', s.useDropdown !== false);
            this.refs.inputs.newLayout.prop('checked', !!s.newLayout);
            this.refs.inputs.checkDelay.val(s.checkDelay / 1000);
            this.refs.inputs.retryDelay.val(s.retryDelay / 1000);
            this.refs.inputs.maxRetries.val(s.maxRetries);
            this.refs.inputs.thMedium.val(s.thMedium);
            this.refs.inputs.thHigh.val(s.thHigh);
        }

        readSettings() {
            const num = (key, def) => {
                const v = parseFloat(this.refs.inputs[key].val());
                return isNaN(v) ? def : v;
            };
            return {
                autoCheck: this.refs.inputs.autoCheck.is(':checked'),
                useDropdown: this.refs.inputs.useDropdown.is(':checked'),
                newLayout: this.refs.inputs.newLayout.is(':checked'),
                checkDelay: Math.max(0, num('checkDelay', 2)) * 1000,
                retryDelay: Math.max(0, num('retryDelay', 2)) * 1000,
                maxRetries: Math.max(1, Math.round(num('maxRetries', 3))),
                thMedium: Utils.clamp(Math.round(num('thMedium', 50)), 0, 100),
                thHigh: Utils.clamp(Math.round(num('thHigh', 70)), 0, 100)
            };
        }

        updateThresholdLabels(medium, high) {
            this.refs.lGreen.text(`< ${medium}%`);
            this.refs.lYellow.text(`${medium}–${Math.max(medium, high - 1)}%`);
            this.refs.lRed.text(`≥ ${high}%`);
            this.el.find('.epa-amp[data-cat="low"]').attr('title', `grün (< ${medium}%) – klicken zum Durchspringen`);
            this.el.find('.epa-amp[data-cat="medium"]').attr('title', `gelb (${medium}–${Math.max(medium, high - 1)}%) – klicken zum Durchspringen`);
            this.el.find('.epa-amp[data-cat="high"]').attr('title', `rot (≥ ${high}%) – klicken zum Durchspringen`);
            this.el.find('.epa-amp[data-cat="error"]').attr('title', `Fehler – klicken zum Durchspringen`);
        }

        setRunning(isRunning) {
            this.refs.recheck.prop('disabled', isRunning);
            this.refs.startStop
                .toggleClass('epa-stop', isRunning)
                .html(isRunning ? '⏹ Stop' : '▶ Start');
            this.refs.statusEl.toggleClass('running', isRunning).removeClass('done');
            if (isRunning) this.refs.statusText.text('Läuft…');
        }

        setIdle(text) {
            this.refs.statusEl.removeClass('running done');
            this.refs.statusText.text(text || 'Bereit');
            this.refs.progress.text('');
        }

        setStopped(processed, total) {
            this.refs.statusEl.removeClass('running done');
            this.refs.statusText.text('Gestoppt');
            this.refs.progress.text(`${processed}/${total} geprüft`);
        }

        setProgress(current, total) {
            this.refs.statusText.text(`Läuft… ${current}/${total}`);
            this.refs.progress.text('');
        }

        setFinished(total, failed) {
            const time = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
            this.refs.statusEl.removeClass('running').addClass('done');
            this.refs.statusText.text(`Fertig ✓ (${time})`);
            const ok = total - failed;
            this.refs.progress.text(failed > 0 ? `${ok}/${total} geprüft · ${failed} Fehler` : `${total} Bilder geprüft`);
        }

        /** Ampel-Zähler + geprüft/gesamt aus allen Einträgen neu berechnen */
        refreshCounts(entries) {
            let g = 0, y = 0, r = 0, e = 0;
            entries.forEach(en => {
                if (en.category === 'low') g++;
                else if (en.category === 'medium') y++;
                else if (en.category === 'high') r++;
                else if (en.category === 'error') e++;
            });
            this.refs.green.text(g);
            this.refs.yellow.text(y);
            this.refs.red.text(r);
            this.refs.err.text(e);
            this.refs.checked.text(g + y + r);
            this.refs.total.text(entries.length);
        }
    }

    /**
     * UI-Komponenten für die KI-Erkennung
     */
    class AIDetectionUI {
        constructor() {
            this.aiService = new AIDetectionService();
            this.entries = []; // { imgElement, button, resultContainer, getUrlFromLink, done, category, probability }
            this.toolbar = null;
            this._cycleIdx = {};
        }

        addImageButtons() {
            const config = this.getImageConfig();
            if (!config) return;

            config.imageElements.each((index, element) => {
                const $el = $(element);
                // bereits verarbeitete Bilder überspringen
                if ($el.parent().hasClass('ai-image-wrapper')) return;
                const entry = this.setupImageButton($el, config.getUrlFromLink);
                if (entry) this.entries.push(entry);
            });
        }

        // Einträge verwerfen und neu aufbauen (z. B. nach Layoutwechsel)
        rebuildEntries() {
            if (this.toolbar) this.toolbar.refreshCounts([]);
            this.entries = [];
            this._cycleIdx = {};
            this.addImageButtons();
            if (this.toolbar) this.toolbar.refreshCounts(this.entries);
        }

        getImageConfig() {
            // Neues Layout: KI-Check läuft auf den Hauptbildern der Zeilen
            if ($('.epa-ai-target').length) {
                const fromLink = Utils.isCurrentPage(Config.URLS.ALBUM_CONTROL);
                return { imageElements: $('.epa-ai-target'), getUrlFromLink: fromLink };
            }
            if (Utils.isCurrentPage(Config.URLS.PROFILE_CONTROL) || Utils.isCurrentPage(Config.URLS.ADMIN_PROFILE)) {
                return { imageElements: $('.new_photo .userimage'), getUrlFromLink: false };
            } else if (Utils.isCurrentPage(Config.URLS.ALBUM_PHOTO)) {
                return { imageElements: $('.new_photo .userimage'), getUrlFromLink: false };
            } else if (Utils.isCurrentPage(Config.URLS.ALBUM_CONTROL)) {
                return { imageElements: $('li.album_image:not(.upload_normal) .userimage'), getUrlFromLink: true };
            } else if (Utils.isCurrentPage(Config.URLS.VERIFY_CONTROL)) {
                // Verify-Kontrolle: Selektor ggf. an den echten DOM anpassen
                return { imageElements: $('.userimage'), getUrlFromLink: false };
            } else if (Utils.isCurrentPage(Config.URLS.PROFILE)) {
                return { imageElements: $('.large'), getUrlFromLink: false };
            }
            return null;
        }

        setupImageButton(imgElement, getUrlFromLink) {
            const imageWrapper = $('<div class="ai-image-wrapper"></div>');
            imgElement.wrap(imageWrapper);

            const aiCheckButton = $('<button class="ai-check-button">KI Check</button>');
            const aiResultContainer = $('<div class="ai-result-container" style="display: none;"></div>');

            imgElement.parent().append(aiCheckButton);
            imgElement.parent().append(aiResultContainer);

            const entry = {
                imgElement,
                button: aiCheckButton,
                resultContainer: aiResultContainer,
                getUrlFromLink,
                done: false,
                category: null,
                probability: null
            };

            aiCheckButton.on('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.disableAllButtons();
                await this.runCheckWithRetry(entry);
                this.scheduleButtonReactivation();
            });

            return entry;
        }

        async runCheckWithRetry(entry) {
            for (let attempt = 1; attempt <= Config.MAX_RETRIES; attempt++) {
                if (attempt > 1) {
                    this.setButtonState(entry.button, 'retry');
                    await Utils.sleep(Config.RETRY_DELAY);
                }
                const ok = await this.runCheck(entry);
                if (ok) return true;
            }
            entry.category = 'error';
            entry.probability = null;
            if (this.toolbar) this.toolbar.refreshCounts(this.entries);
            return false;
        }

        async runCheck(entry) {
            const { button, resultContainer, imgElement, getUrlFromLink } = entry;
            this.setButtonState(button, 'loading');
            this.resetResults(resultContainer, imgElement);

            try {
                const imgUrl = this.buildImageUrl(imgElement, getUrlFromLink);
                const result = await this.aiService.checkImage(imgUrl);

                entry.probability = result.probability * 100;
                entry.category = this.getCategory(entry.probability);
                entry.done = true;
                this.applyResultStyling(entry);
                if (this.toolbar) this.toolbar.refreshCounts(this.entries);
                return true;
            } catch (error) {
                console.error('AI detection error:', error);
                this.setButtonState(button, 'error');
                return false;
            }
        }

        buildImageUrl(imgElement, getUrlFromLink) {
            // Neues Layout hinterlegt die volle Bild-URL direkt am Element
            const direct = imgElement.attr('data-ai-url');
            if (direct) return direct;
            const baseUrl = 'https://photo.knuddels.de/';
            let imagePath;
            if (getUrlFromLink) {
                imagePath = imgElement.attr('alt').replace(/l(?!.*l)/, 'vl');
            } else {
                imagePath = imgElement.attr('src').replace(/(?<!v)l(?!.*l)/, 'vl');
            }
            return baseUrl + imagePath;
        }

        getCategory(probability) {
            if (probability >= Config.AI_THRESHOLD_HIGH) return 'high';
            if (probability >= Config.AI_THRESHOLD_MEDIUM) return 'medium';
            return 'low';
        }

        applyResultStyling(entry) {
            const { resultContainer, imgElement, button } = entry;
            if (entry.probability == null) return;
            const p = entry.probability;
            const cssClass = p >= Config.AI_THRESHOLD_HIGH ? 'ai-high'
                : p >= Config.AI_THRESHOLD_MEDIUM ? 'ai-medium' : 'ai-low';

            resultContainer.html(`<div class="ai-result ${cssClass}">${p.toFixed(2)}%</div>`).show();
            imgElement.removeClass('ai-generated-image ai-modified-image');
            if (p >= Config.AI_THRESHOLD_HIGH) imgElement.addClass('ai-generated-image');
            else if (p >= Config.AI_THRESHOLD_MEDIUM) imgElement.addClass('ai-modified-image');

            this.setButtonState(button, 'hidden');
        }

        /** Bereits geprüfte Bilder anhand neuer Schwellen neu einfärben/zählen */
        reclassifyAll() {
            this.entries.forEach(entry => {
                if (entry.probability == null) return;
                entry.category = this.getCategory(entry.probability);
                this.applyResultStyling(entry);
            });
            if (this.toolbar) this.toolbar.refreshCounts(this.entries);
        }

        /** Durch die Funde einer Kategorie springen */
        cycleCategory(category) {
            const matches = this.entries.filter(e => e.category === category);
            if (matches.length === 0) return;

            let idx = (this._cycleIdx[category] ?? -1) + 1;
            if (idx >= matches.length) idx = 0;
            this._cycleIdx[category] = idx;

            const img = matches[idx].imgElement;
            const node = img.get(0);
            if (node) node.scrollIntoView({ behavior: 'smooth', block: 'center' });
            img.addClass('epa-jump-highlight');
            setTimeout(() => img.removeClass('epa-jump-highlight'), 1300);
        }

        setButtonState(button, state) {
            switch (state) {
                case 'ready':
                    button.prop('disabled', false).text('KI Check').removeClass('ai-error').show();
                    break;
                case 'queued':
                    button.prop('disabled', true).text('Warteschlange…').removeClass('ai-error').show();
                    break;
                case 'loading':
                    button.prop('disabled', true).text('Prüfung…').removeClass('ai-error');
                    break;
                case 'retry':
                    button.prop('disabled', true).text('Neuer Versuch…').removeClass('ai-error');
                    break;
                case 'error':
                    button.prop('disabled', false).text('Fehler – erneut?').addClass('ai-error').show();
                    break;
                case 'hidden':
                    button.hide();
                    break;
            }
        }

        resetResults(resultContainer, imgElement) {
            resultContainer.empty().hide();
            imgElement.removeClass('ai-generated-image ai-modified-image');
        }

        disableAllButtons() {
            $('.ai-check-button').prop('disabled', true);
        }

        scheduleButtonReactivation() {
            setTimeout(() => {
                $('.ai-check-button:visible').prop('disabled', false);
            }, Config.BUTTON_COOLDOWN);
        }

        resetAll() {
            this._cycleIdx = {};
            this.entries.forEach(entry => {
                entry.done = false;
                entry.category = null;
                entry.probability = null;
                this.resetResults(entry.resultContainer, entry.imgElement);
                this.setButtonState(entry.button, 'ready');
            });
            if (this.toolbar) this.toolbar.refreshCounts(this.entries);
        }
    }

    /**
     * Warteschlange: prüft alle Bilder nacheinander
     */
    class AIDetectionQueue {
        constructor(ui) {
            this.ui = ui;
            this.cancelled = false;
        }

        cancel() {
            this.cancelled = true;
        }

        async start(initialDelay = 0) {
            const pending = this.ui.entries.filter(e => !e.done);
            if (pending.length === 0) return { total: 0, processed: 0, failed: 0, cancelled: false };

            pending.forEach(e => this.ui.setButtonState(e.button, 'queued'));
            if (this.ui.toolbar) this.ui.toolbar.setProgress(0, pending.length);

            if (initialDelay > 0) await Utils.sleep(initialDelay);

            let failed = 0;
            let processed = 0;
            for (let i = 0; i < pending.length; i++) {
                if (this.cancelled) break;
                if (this.ui.toolbar) this.ui.toolbar.setProgress(i + 1, pending.length);

                const ok = await this.ui.runCheckWithRetry(pending[i]);
                processed++;
                if (!ok) failed++;

                if (this.cancelled) break;
                if (i < pending.length - 1) {
                    await Utils.sleep(Config.CHECK_DELAY);
                }
            }

            // Noch nicht abgearbeitete Bilder wieder bedienbar machen (z. B. nach Stop)
            pending.forEach(e => {
                if (!e.done && e.category !== 'error') this.ui.setButtonState(e.button, 'ready');
            });

            return { total: pending.length, processed, failed, cancelled: this.cancelled };
        }
    }

    /**
     * Kategorie-Auswahl: Dropdown (Standard) oder einzelne Buttons (Einstellung)
     */
    class CategoryControls {
        static selects() {
            return $('select').filter('[name^="p"], .select');
        }

        static apply() {
            if (!/photos-admin/i.test(window.location.href)) return;
            CategoryControls.injectStyles();
            const inline = !Config.USE_DROPDOWN;
            CategoryControls.selects().each(function () {
                CategoryControls.render($(this), inline);
            });
        }

        static render($sel, inline) {
            const existing = $sel.data('epaInline');
            if (existing) { existing.remove(); $sel.removeData('epaInline'); }

            if (!inline) {
                $sel.show();
                return;
            }

            const $wrap = $('<div class="epa-cat"></div>');
            $sel.find('option').each(function () {
                const $o = $(this);
                const val = $o.val();
                const label = $o.text().trim();
                if ((val == null || val === '') && label === '') return;

                const $b = $('<button type="button" class="epa-cat-btn"></button>')
                    .text(label || val)
                    .attr('data-val', val);
                if ($sel.val() === val) $b.addClass('epa-cat-active');

                $b.on('click', function (e) {
                    e.preventDefault();
                    $sel.val(val);
                    $wrap.find('.epa-cat-btn').removeClass('epa-cat-active');
                    $b.addClass('epa-cat-active');
                });
                $wrap.append($b);
            });

            $sel.hide().after($wrap);
            $sel.data('epaInline', $wrap);
        }

        static reflect($sel) {
            const $wrap = $sel.data('epaInline');
            if (!$wrap) return;
            const v = $sel.val();
            $wrap.find('.epa-cat-btn').removeClass('epa-cat-active')
                .filter(function () { return $(this).attr('data-val') === v; })
                .addClass('epa-cat-active');
        }

        // Kategorie auf "Fake-Versuch" setzen (Label-Match, sonst bekannter Wert)
        static setFake($sel) {
            if (!$sel || $sel.length === 0) return;
            let val = null;
            $sel.find('option').each(function () {
                const t = $(this).text().trim().toLowerCase();
                if (t.includes('fake-versuch') || (t.includes('fake') && t.includes('versuch'))) {
                    val = $(this).val();
                    return false;
                }
            });
            if (val == null && $sel.find('option[value="FakeAttemptProfile"]').length) {
                val = 'FakeAttemptProfile';
            }
            if (val == null) return;

            $sel.val(val);
            CategoryControls.reflect($sel);
        }

        static injectStyles() {
            if ($('#epa-cat-styles').length) return;
            const css = `
                .epa-cat { display:flex; flex-wrap:wrap; gap:4px; margin-top:4px; }
                .epa-cat-btn { padding:3px 8px; font-size:12px; border:1px solid #b9c2cf;
                    border-radius:4px; background:#f3f4f6; color:#1f2937; cursor:pointer; line-height:1.3; }
                .epa-cat-btn:hover { background:#e5e7eb; }
                .epa-cat-btn.epa-cat-active { background:#2563eb; border-color:#2563eb; color:#fff; }
            `;
            $('<style id="epa-cat-styles">').text(css).appendTo('head');
        }
    }

    /**
     * Verdict: setzt einen Wert im Original-Select und meldet die Änderung
     * per Event, damit gespiegelte Buttons/Dropdowns synchron bleiben.
     */
    class Verdict {
        static set($select, value) {
            if (!$select || !$select.length) return;
            $select.val(value);
            $select.trigger('epa:verdict');
        }
        static fakeValue($select) {
            let v = null;
            if (!$select || !$select.length) return v;
            $select.find('option').each(function () {
                const t = $(this).text().trim().toLowerCase();
                if (t.indexOf('fake-versuch') !== -1 || (t.indexOf('fake') !== -1 && t.indexOf('versuch') !== -1)) {
                    v = $(this).val();
                    return false;
                }
            });
            if (v == null) {
                const cand = $select.find('option').filter(function () { return /FakeAttempt/i.test($(this).val()); }).first();
                if (cand.length) v = cand.val();
            }
            return v;
        }
    }

    /**
     * NewLayout: baut Profil-, Verify- und Albumkontrolle als ruhige Liste über
     * die volle Breite neu auf. Das Original-Formular bleibt unangetastet im DOM
     * (nur versteckt) – die neue Oberfläche spiegelt Auswahl, Checkboxen und Aktionen.
     */
    class NewLayout {
        static PAGE() {
            if (Utils.isCurrentPage(Config.URLS.PROFILE_CONTROL)) return 'profile';
            if (Utils.isCurrentPage(Config.URLS.VERIFY_CONTROL)) return 'verify';
            if (Utils.isCurrentPage(Config.URLS.ALBUM_CONTROL)) return 'album';
            if (Utils.isCurrentPage(Config.URLS.ALBUM_PHOTO)) return 'albumphoto';
            if (Utils.isCurrentPage(Config.URLS.ADMIN_PROFILE)) return 'adminprofile';
            return null;
        }

        static apply() {
            const page = NewLayout.PAGE();
            if (!page) return 0;
            NewLayout.injectStyles();
            NewLayout.setupHoverPreview();
            const n = (page === 'album') ? NewLayout.buildAlbum()
                : (page === 'albumphoto') ? NewLayout.buildAlbumPhoto()
                : (page === 'adminprofile') ? NewLayout.buildAdminProfile()
                : NewLayout.buildLines(page);
            if (n > 0) $('body').addClass('epa-nl');
            return n;
        }

        // Große Bildvorschau beim Überfahren mit der Maus.
        // Vorschau wird PRO Bild direkt gebunden, damit das native Mouseover/
        // Tooltip der Knuddels-Seite gezielt unterdrückt werden kann.
        static setupHoverPreview() {
            NewLayout.ensurePreviewEl();
        }

        static ensurePreviewEl() {
            if (NewLayout._$preview && NewLayout._$preview.parent().length) return NewLayout._$preview;
            const $p = $('<div class="epa-hover-preview"><img alt="" /></div>')
                .css('display', 'none').appendTo('body');
            NewLayout._$preview = $p;
            return $p;
        }

        // Bild zoombar machen: eigene Vorschau direkt binden. Das native Mouseover
        // der Seite hängt delegiert an „.userimage" – darum nehmen wir dem Bild diese
        // Klasse (eigene Klasse epa-uimg fürs Styling) und entfernen den title-Tooltip.
        static makeZoomable($img, largeUrl) {
            if (!$img || !$img.length) return;
            const el = $img.get(0);
            $img.removeClass('userimage').addClass('epa-uimg epa-zoomable');
            if (largeUrl) $img.attr('data-large', largeUrl);
            $img.removeAttr('title');
            if (el.__epaZoom) return;
            el.__epaZoom = true;

            const $p = NewLayout.ensurePreviewEl();
            const $pimg = $p.find('img');
            $img.on('mouseenter.epazoom', function () {
                const large = $(this).attr('data-large') || $(this).attr('src');
                if (!large) return;
                $pimg.attr('src', large);
                $p.css('display', 'block');
            });
            $img.on('mousemove.epazoom', function (e) {
                const pad = 20;
                const pw = $p.outerWidth() || 320;
                const ph = $p.outerHeight() || 320;
                let x = e.clientX + pad;
                let y = e.clientY + pad;
                if (x + pw > window.innerWidth) x = e.clientX - pw - pad;
                if (y + ph > window.innerHeight) y = window.innerHeight - ph - pad;
                if (x < pad) x = pad;
                if (y < pad) y = pad;
                $p.css({ left: x + 'px', top: y + 'px' });
            });
            $img.on('mouseleave.epazoom', function () {
                $p.css('display', 'none');
            });
        }

        static teardown() {
            $('select').off('epa:verdict.nl');
            $('.epa-csearch, .epa-lock, .epa-locklist, .epa-list, .epa-album, .epa-rfilter, .epa-cmt-del, .epa-verify-instr').remove();
            $('li.usercomment').removeData('epaCmtBtn');
            $('.previous_photos').removeData('epaRfilter').children('div').show();
            // Sperr-History-Originale wieder einblenden, Marker zurücksetzen
            $('.epa-lockorig').removeClass('epa-lockorig');
            $('h3').each(function () {
                const $b = $(this).closest('.h').length ? $(this).closest('.h') : $(this);
                $b.removeData('epaLockDone');
            });
            $('.manual_lock_duration').removeData('epaLock');
            $('.epa-nl-hidden').removeClass('epa-nl-hidden').show();
            // Galerie-Bilder (admin-profile/albumphoto) zurücksetzen
            $('img.epa-uimg.epa-zoomable').removeClass('epa-zoomable epa-uimg').addClass('userimage').removeAttr('data-large');
            $('.epa-verify-badge').remove();
            $('body').removeClass('epa-nl');
        }

        // ---- Profil + Verify (photo_cell_line) ----
        static buildLines(page) {
            const $form = $('#form-control');
            if (!$form.length) { console.warn('[kn-fotoadmin] ' + page + ': #form-control nicht gefunden'); return 0; }
            const $lis = $form.find('li.photo_cell_line');
            console.log('[kn-fotoadmin] ' + page + ': Zeilen gefunden =', $lis.length);
            if (!$lis.length) return 0;
            const $ul = $lis.first().closest('ul');
            const $list = $('<div class="epa-list"></div>');
            $ul.before($list);
            if (page === 'verify') NewLayout._verifyRowBanners = 0;
            let built = 0;
            $lis.each(function () {
                let row = null;
                try { row = NewLayout.buildLineRow($(this), page); }
                catch (e) { console.error('[kn-fotoadmin] Zeile übersprungen:', e); }
                if (row) { $list.append(row); built++; }
            });
            if (built === 0) { $list.remove(); return 0; }
            // Verify: steht die Geste übergeordnet (nicht je Zeile), oben einmal anzeigen
            if (page === 'verify' && !NewLayout._verifyRowBanners) {
                try {
                    const gl = NewLayout.verifyGestureLines($form);
                    if (gl.length) $list.before(NewLayout.buildVerifyInstrBanner(gl));
                } catch (e) { console.error('[kn-fotoadmin] verifyInstr form:', e); }
            }
            // Nur die nachgebauten Kontrollzeilen ausblenden – evtl. enthaltener
            // Verlauf (vorherige/abgelehnte Bilder) in derselben Liste bleibt sichtbar.
            $ul.find('li.photo_cell_line').addClass('epa-nl-hidden').hide();
            const restLeft = $ul.children().not('.epa-nl-hidden').length;
            if (!restLeft) $ul.addClass('epa-nl-hidden').hide();
            // Verlauf/Galerien (vorherige & abgelehnte Bilder), Sperr-History auch hier aufbereiten
            try { NewLayout.enhanceGalleries(null); } catch (e) { console.error('[kn-fotoadmin] galleries:', e); }
            try { NewLayout.enhanceRejectedFilter(); } catch (e) { console.error('[kn-fotoadmin] rfilter:', e); }
            try { NewLayout.prettifyLockHistory(); } catch (e) { console.error('[kn-fotoadmin] lockHistory:', e); }
            console.log('[kn-fotoadmin] ' + page + ': Zeilen gebaut =', built);
            return built;
        }

        static buildLineRow($li, page) {
            const $mainCell = $li.find('.photo_cell.new_photo').first();
            const $mainImg = $mainCell.find('.userimage').first();
            if (!$mainImg.length) return null;
            const $select = $li.find('select').first();
            const $isok = $li.find('input[name$="-isok"]').first();
            const $info = $li.find('.user-info').first();
            const nick = Utils.extractName($info.text()) || '';

            const $row = $('<div class="epa-row"></div>');

            // Bilder: Hauptbild + alle weiteren (vorher / Profilfoto / Verify-Foto)
            const $imgs = $('<div class="epa-imgs"></div>');
            const mainLabel = (page === 'verify') ? 'Verify-Foto'
                : (page === 'albumphoto') ? 'Albumbild' : 'Aktuelles Foto';
            $imgs.append(NewLayout.imageBlock($mainImg, mainLabel, true, false));
            $li.find('.userimage').each(function () {
                const $img = $(this);
                if ($img.is($mainImg)) return;
                // Bilder, die die Originalseite selbst ausblendet, NICHT anzeigen
                // (z. B. die alte „old_photo"-Spalte in der Einzel-Profiladministration).
                if ($img.is(':hidden')) return;
                const cs = window.getComputedStyle ? window.getComputedStyle(this) : null;
                if (cs && (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0)) return;
                const sig = ($img.attr('src') || '') + ' ' + ($img.attr('alt') || '');
                const isPro = /-pro/i.test(sig);
                const isVer = /-ver/i.test(sig);
                const inLastVerifyCell = ($img.closest('.photo_cell').text() || '').indexOf('Letztes Verify-Foto') > -1;
                let label, verify = false;
                if (isPro) {
                    // Profilfoto – auch wenn es in einer is_verify_photo-Zelle direkt neben dem letzten Verify-Foto steht
                    label = (page === 'verify' || page === 'albumphoto') ? 'Profilfoto' : 'Vorheriges Foto';
                } else if (isVer) {
                    verify = true;
                    label = inLastVerifyCell ? 'Letztes Verify-Foto' : 'Verify-Foto';
                } else if (page === 'albumphoto') {
                    label = 'Profilfoto';
                } else {
                    label = (page === 'verify') ? 'Profilfoto' : 'Vorheriges Foto';
                }
                $imgs.append(NewLayout.imageBlock($img, label, false, verify));
            });
            $row.append($imgs);

            $row.append(NewLayout.headNode($info));
            // Verify: vorherige Kontrolle (2. Instanz) + Ablehnungs-Verlauf
            if (page === 'verify') {
                try {
                    const $vp = NewLayout.buildVerifyPriorControl($mainCell);
                    if ($vp) $row.append($vp);
                } catch (e) { console.error('[kn-fotoadmin] verifyPrior:', e); }
                try {
                    const $rej = NewLayout.buildVerifyRejections($mainCell);
                    if ($rej) $row.append($rej);
                } catch (e) { console.error('[kn-fotoadmin] verifyRej:', e); }
            }
            $row.append(NewLayout.toolsBlock($li, $select, nick));
            $row.append(NewLayout.verdictBlock($select, $isok));
            // Verify: geforderte Geste („Code:") oben anzeigen – präzise aus dem <strong>Code:…</strong>
            if (page === 'verify') {
                try {
                    const code = NewLayout.verifyCode($mainCell);
                    const lines = code ? [code] : NewLayout.verifyGestureLines($li);
                    if (lines.length) {
                        $row.prepend(NewLayout.buildVerifyInstrBanner(lines));
                        NewLayout._verifyRowBanners = (NewLayout._verifyRowBanners || 0) + 1;
                    }
                } catch (e) { console.error('[kn-fotoadmin] verifyInstr row:', e); }
            }
            return $row;
        }

        // Liest „vorherige Kontrolle durch: NAME (DATUM)" (2. Instanz) aus der new_photo-Zelle.
        static verifyPriorControl($cell) {
            if (!$cell || !$cell.length) return null;
            let result = null;
            $cell.find('strong').each(function () {
                const s = this;
                // Vorheriger sichtbarer Text (über <br>/Leertext hinweg)
                let prev = '';
                for (let n = s.previousSibling; n; n = n.previousSibling) {
                    if (n.nodeType === 3) {
                        const t = (n.nodeValue || '').trim();
                        if (t) { prev = t; break; }
                    } else if (n.nodeType === 1 && /^br$/i.test(n.tagName)) {
                        continue;
                    } else if (n.nodeType === 1) {
                        break;
                    }
                }
                if (!/vorherige Kontrolle durch/i.test(prev)) return;
                const name = ($(s).text() || '').trim();
                let date = '';
                for (let f = s.nextSibling; f; f = f.nextSibling) {
                    if (f.nodeType === 3) {
                        const t = (f.nodeValue || '').trim();
                        if (t) { date = t; break; }
                    } else if (f.nodeType === 1 && /^br$/i.test(f.tagName)) {
                        break;
                    }
                }
                date = date.replace(/^[\(\s]+|[\)\s]+$/g, '').trim();
                if (name) { result = { name: name, date: date }; return false; }
            });
            return result;
        }

        static buildVerifyPriorControl($cell) {
            const d = NewLayout.verifyPriorControl($cell);
            if (!d || !d.name) return null;
            const $b = $('<div class="epa-vprior"></div>');
            $b.append($('<span class="epa-vprior-label">Vorherige Kontrolle</span>'));
            $b.append($('<span class="epa-vprior-val"></span>')
                .text(d.name + (d.date ? ' \u00b7 ' + d.date : '')));
            return $b;
        }

        // Liest die geforderte Geste exakt aus dem „Code:"-Strong der new_photo-Zelle.
        static verifyCode($cell) {
            let code = '';
            if (!$cell || !$cell.length) return code;
            $cell.find('strong').each(function () {
                const t = ($(this).text() || '').replace(/\s+/g, ' ').trim();
                const m = t.match(/^Code:\s*(.+)$/i);
                if (m && m[1]) { code = m[1].trim(); return false; }
            });
            return code;
        }

        // Baut den Ablehnungs-Verlauf (innerhalb 3 Wochen) als Karten mit Thumbnail + Hover-Vorschau.
        static buildVerifyRejections($cell) {
            if (!$cell || !$cell.length) return null;
            const cellText = ($cell.text() || '').replace(/\s+/g, ' ');
            const cm = cellText.match(/Ablehnungen innerhalb von[^:]*:\s*(\d+)/i);
            // Verlinkte abgelehnte Fotos: <a href="...jpg">photo.png</a> (kein Bild-Anchor, nicht im Header)
            const $links = $cell.find('a').filter(function () {
                const $a = $(this);
                if ($a.closest('.photo_cell_header').length) return false;
                if ($a.find('img').length) return false;
                return /\.jpe?g(\?|$)/i.test($a.attr('href') || '');
            });
            if (!cm && !$links.length) return null;

            const $box = $('<div class="epa-vrej"></div>');
            const cnt = cm ? cm[1] : String($links.length);
            $box.append($('<div class="epa-vrej-title"></div>')
                .text('\u26A0 Abgelehnt \u00B7 ' + cnt + ' in 3 Wochen'));

            $links.each(function () {
                const node = this;
                const href = $(node).attr('href') || '';
                // Datum: vorheriger Textknoten („… DATUM (")
                let date = '';
                for (let n = node.previousSibling; n; n = n.previousSibling) {
                    if (n.nodeType === 3 && n.nodeValue && n.nodeValue.trim()) { date = n.nodeValue.trim(); break; }
                    if (n.nodeType === 1 && /^br$/i.test(n.tagName)) break;
                }
                date = date.replace(/\(\s*$/, '').trim();
                // Grund: nächster nicht-leerer Textknoten nach „)" + <br>
                let reason = '';
                let hops = 0;
                for (let f = node.nextSibling; f && hops < 8; f = f.nextSibling, hops++) {
                    if (f.nodeType === 3) {
                        const t = (f.nodeValue || '').replace(/^\s*\)?\s*/, '').trim();
                        if (t) { reason = t; break; }
                    }
                }

                const $item = $('<div class="epa-vrej-item"></div>');
                const $img = $('<img class="epa-vrej-thumb" alt="abgelehntes Foto" />').attr('src', href);
                NewLayout.makeZoomable($img, href);   // Hover-Vorschau (groß) wie bei den übrigen Bildern
                const $thumb = $('<a class="epa-vrej-link" target="_blank" rel="noopener"></a>')
                    .attr('href', href).append($img);
                $item.append($thumb);
                const $meta = $('<div class="epa-vrej-meta"></div>');
                if (date) $meta.append($('<div class="epa-vrej-date"></div>').text(date));
                if (reason) $meta.append($('<div class="epa-vrej-reason"></div>').text(reason));
                $item.append($meta);
                $box.append($item);
            });
            return $box;
        }

        // Findet im angegebenen Bereich Anweisungs-/Gestentexte (z.B. „2 Finger an die Nase")
        // Heuristik: direkte Textknoten je Element, die Körperteil-/Gesten-Begriffe enthalten.
        static verifyGestureLines($scope) {
            const lines = [], seen = {};
            if (!$scope || !$scope.length) return lines;
            const rx = /(zeigefinger|mittelfinger|ringfinger|kleine(?:r|n)?\s*finger|daumen|finger|faust|handfl[äa]che|handr[üu]cken|h[äa]nde|hand|nase|wange|wangen|kinn|stirn|schl[äa]fe|ohr|ohren|mund|lippen?|z[äa]hne|zunge|auge|augen|augenbraue|braue|backe|kopf|hals|schulter|wink|peace|victory|zeigen|halten|legen|tippen|ber[üu]hren|formen|geste|pose)/i;
            const partRx = /(zeigefinger|mittelfinger|ringfinger|daumen|finger|faust|hand|h[äa]nde|nase|wange|kinn|stirn|schl[äa]fe|ohr|mund|lippen?|zunge|z[äa]hne|auge|augen|braue|backe|kopf|hals|schulter)/i;
            $scope.find('*').addBack().each(function () {
                if ($(this).closest('select, option, .formline, .stopcontrolling').length) return; // Dropdown/Steuerelemente ignorieren
                const ch = this.childNodes;
                if (!ch || !ch.length) return;
                let direct = '';
                for (let i = 0; i < ch.length; i++) {
                    if (ch[i].nodeType === 3) direct += ch[i].nodeValue;
                }
                direct = (direct || '').replace(/\s+/g, ' ').trim();
                if (direct.length < 6 || direct.length > 240) return;
                if (direct.split(' ').length < 2) return;          // Einzelwörter ignorieren (z.B. Nicknames)
                if (!partRx.test(direct)) return;                  // mind. ein Körperteil
                if (!rx.test(direct)) return;
                const key = direct.toLowerCase();
                if (!seen[key]) { seen[key] = 1; lines.push(direct); }
            });
            return lines;
        }

        static buildVerifyInstrBanner(lines) {
            const $b = $('<div class="epa-verify-instr"></div>');
            $b.append($('<div class="epa-vi-title">\u270B Geforderte Geste</div>'));
            (lines || []).forEach(function (t) {
                $b.append($('<div class="epa-vi-line"></div>').text(t));
            });
            return $b;
        }

        // ---- Album (gruppiert) ----
        static buildAlbum() {
            const $form = $('#form-control');
            if (!$form.length) { console.warn('[kn-fotoadmin] album: #form-control nicht gefunden'); return 0; }
            const $uls = $form.find('ul').filter(function () { return $(this).find('li.album_image').length > 0; });
            console.log('[kn-fotoadmin] album: Gruppen gefunden =', $uls.length);
            if (!$uls.length) return 0;
            let built = 0;
            $uls.each(function () {
                const $ul = $(this);
                let section = null;
                try { section = NewLayout.buildAlbumMember($ul); }
                catch (e) { console.error('[kn-fotoadmin] Album-Gruppe übersprungen:', e); }
                if (section) {
                    $ul.before(section);
                    $ul.addClass('epa-nl-hidden').hide();
                    $ul.prevAll('.metainfo').first().addClass('epa-nl-hidden').hide();
                    built++;
                }
            });
            if (built === 0) return 0;
            console.log('[kn-fotoadmin] album: Gruppen gebaut =', built);
            return built;
        }

        static buildAlbumMember($ul) {
            const $header = $ul.find('li.album_image.upload_normal').first();
            const $info = $header.find('.detaildata').first();
            if (!$info.length) return null;
            const nick = Utils.extractName($info.text()) || '';
            const $profileImg = $header.find('.userimage').first();
            const $metainfo = $ul.prevAll('.metainfo').first();
            const $albumIsok = $metainfo.find('input[name$="-isok"]').first();

            const $section = $('<div class="epa-album"></div>');

            // Kopf: Profilbild + Name/Geschlecht + Album-Links/„Album i.O." + Bot/Scam/Melden (einmal)
            const $head = $('<div class="epa-album-head"></div>');
            if ($profileImg.length) {
                const psrc = NewLayout.bestSrc($profileImg);
                const phref = $profileImg.closest('a').attr('href') || psrc;
                const $pic = $('<img />').attr('src', psrc);
                NewLayout.makeZoomable($pic, phref);
                $head.append($('<a class="epa-album-pic" target="_blank" rel="noopener"></a>')
                    .attr('href', phref).append($pic));
            }
            const $meta = $('<div class="epa-album-meta"></div>');
            $meta.append(NewLayout.headNode($info));
            const $sub = $('<div class="epa-album-sub"></div>');
            $metainfo.find('a').each(function () {
                $sub.append($('<a class="epa-btn epa-btn-sm" target="_blank" rel="noopener"></a>')
                    .attr('href', $(this).attr('href')).text($(this).text().trim()));
            });
            if ($albumIsok.length) {
                const $io = $('<button type="button" class="epa-io epa-io-sm">Album i.O.</button>');
                if ($albumIsok.is(':checked')) $io.addClass('epa-io-active');
                $io.on('click', function (e) {
                    e.preventDefault();
                    const c = !$albumIsok.is(':checked');
                    $albumIsok.prop('checked', c);
                    $io.toggleClass('epa-io-active', c);
                });
                $sub.append($io);
            }
            $meta.append($sub);

            // Album-Gesamtbewertung: Select aN (NICHT aN-pM). Wertet alle Bilder,
            // bei denen unten nichts Spezifisches gewählt ist. Das Genauere am Bild
            // gewinnt (native Server-Logik – wir reichen nur beide Felder ein).
            const isAlbumSel = function () { return /^a\d+$/.test($(this).attr('name') || ''); };
            let $albumSel = $metainfo.find('select').filter(isAlbumSel).first();
            if (!$albumSel.length) $albumSel = $header.find('select').filter(isAlbumSel).first();
            if (!$albumSel.length) $albumSel = $ul.find('select').filter(isAlbumSel).first();
            if (!$albumSel.length) $albumSel = $metainfo.find('select').first();   // Fallback: Select der Metainfo
            if ($albumSel.length) {
                const $vb = NewLayout.verdictBlock($albumSel, null);
                $vb.find('.epa-block-label').text('Ganzes Album bewerten');
                $vb.addClass('epa-album-verdict');
                $meta.append($vb);
            }

            $head.append($meta);
            $head.append($('<div class="epa-album-spacer"></div>'));
            $head.append(NewLayout.memberActions(nick));
            $section.append($head);

            // Fotos nebeneinander, Bewertung je Bild
            const $cards = $('<div class="epa-acards"></div>');
            let any = false;
            $ul.find('li.album_image').not('.upload_normal').each(function () {
                let card = null;
                try { card = NewLayout.buildAlbumPhotoCard($(this)); }
                catch (e) { console.error('[kn-fotoadmin] Albumfoto übersprungen:', e); }
                if (card) { $cards.append(card); any = true; }
            });
            if (!any) return null;
            $section.append($cards);
            return $section;
        }

        // Bot/Scam/Melden – einmal pro Mitglied (Nutzer-Ebene)
        static memberActions(nick) {
            const $row = $('<div class="epa-album-actions"></div>');
            const $bot = $('<button type="button" class="epa-btn epa-btn-bot">Bot</button>');
            const $scam = $('<button type="button" class="epa-btn epa-btn-scam">Scam</button>');
            $bot.on('click', function () { NewLayout.macro('bot', nick, null, $bot); });
            $scam.on('click', function () { NewLayout.macro('scam', nick, null, $scam); });
            $row.append($bot, $scam);
            if (nick) $row.append(NewLayout.reportButton(nick));
            return $row;
        }

        static buildAlbumPhotoCard($li) {
            const $img = $li.find('.userimage').first();
            if (!$img.length) return null;
            const $select = $li.find('select').first();
            const $isok = $li.find('input[name$="-isok"]').first();
            // Admin-Link dieses Albumbildes (Klick aufs Bild öffnet die Administration)
            const adminHref = $li.find('a[href*="albumphoto.html?id="]').first().attr('href') || null;
            const $card = $('<div class="epa-acard"></div>');
            $card.append(NewLayout.imageBlock($img, '', true, false, adminHref));
            // Bildbezogene Rückwärtssuche pro Foto (nativ, sonst aus Bild-URL aufbauen)
            const $y = $li.find('a').filter(function () { return /yandex/i.test($(this).text()); }).first();
            const $g = $li.find('a').filter(function () { return /google/i.test($(this).text()); }).first();
            let yHref = $y.length ? $y.attr('href') : null;
            let gHref = $g.length ? $g.attr('href') : null;
            if (!yHref || !gHref) {
                const su = NewLayout.searchUrls(NewLayout.mainSearchImageUrl($li));
                if (su) { if (!yHref) yHref = su.yandex; if (!gHref) gHref = su.google; }
            }
            if (yHref || gHref) {
                const $rs = $('<div class="epa-acard-rs"></div>');
                if (yHref) $rs.append($('<a class="epa-btn epa-btn-sm" target="_blank" rel="noopener">Yandex</a>').attr('href', yHref));
                if (gHref) $rs.append($('<a class="epa-btn epa-btn-sm" target="_blank" rel="noopener">Google</a>').attr('href', gHref));
                $card.append($rs);
            }
            $card.append(NewLayout.verdictBlock($select, $isok, true));
            return $card;
        }

        // ---- Einzel-Admin-Profilseite (photos-admin-profile.html) ----
        static buildAdminProfile() {
            let built = 0;
            const $vbox = NewLayout.findBox('Verifizierungsfoto');

            // 1) Alle Foto-Kontrollzeilen (Profilfoto + ggf. Verify) als saubere Zeilen
            const $lines = $('li.photo_cell_line');
            const uls = [];
            $lines.each(function () {
                const u = $(this).closest('ul')[0];
                if (u && uls.indexOf(u) === -1) uls.push(u);
            });
            NewLayout._verifyRowBanners = 0;
            uls.forEach(function (ulEl) {
                const $ul = $(ulEl);
                if ($ul.hasClass('epa-nl-hidden')) return;
                const inVerify = $vbox.length && $.contains($vbox[0], ulEl);
                const page = inVerify ? 'verify' : 'profile';
                const $list = $('<div class="epa-list epa-list-single"></div>');
                let any = false;
                $ul.find('li.photo_cell_line').each(function () {
                    let row = null;
                    try { row = NewLayout.buildLineRow($(this), page); }
                    catch (e) { console.error('[kn-fotoadmin] adminprofile Zeile übersprungen:', e); }
                    if (row) { $list.append(row); any = true; built++; }
                });
                if (any) { $ul.before($list); $ul.addClass('epa-nl-hidden').hide(); }
            });

            // 1b) Verify-Box: geforderte Geste anzeigen, falls übergeordnet hinterlegt
            if ($vbox.length && !NewLayout._verifyRowBanners) {
                try {
                    const gl = NewLayout.verifyGestureLines($vbox);
                    if (gl.length) {
                        const $banner = NewLayout.buildVerifyInstrBanner(gl);
                        const $anchor = $vbox.find('.epa-list, .mi').first();
                        if ($anchor.length) $anchor.before($banner);
                        else $vbox.find('h2').first().after($banner);
                    }
                } catch (e) { console.error('[kn-fotoadmin] verifyInstr box:', e); }
            }

            // 2) History-Galerien, Alben, Verify-Thumbs: Hover-Zoom aktivieren
            try { NewLayout.enhanceGalleries($vbox); } catch (e) { console.error('[kn-fotoadmin] galleries:', e); }
            try { NewLayout.enhanceRejectedFilter(); } catch (e) { console.error('[kn-fotoadmin] rfilter:', e); }
            try { NewLayout.enhanceCommentButtons(); } catch (e) { console.error("[kn-fotoadmin] cmtBtn:", e); }
            // 3) Sperrdauer-Steuerung + Sperr-History lesbar + Kommentar-Suche (unabhängig)
            try { NewLayout.enhanceLocks(); } catch (e) { console.error('[kn-fotoadmin] enhanceLocks:', e); }
            try { NewLayout.prettifyLockHistory(); } catch (e) { console.error('[kn-fotoadmin] lockHistory:', e); }
            try { CommentSearch.mount(); } catch (e) { console.error('[kn-fotoadmin] CommentSearch:', e); }

            const active = built > 0 || $('img.epa-uimg.epa-zoomable').length > 0;
            if (active) $('body').addClass('epa-nl');
            console.log('[kn-fotoadmin] adminprofile: Zeilen=' + built
                + ', Zoom-Bilder=' + $('img.epa-uimg.epa-zoomable').length);
            return active ? (built || 1) : 0;
        }

        static findBox(title) {
            const rx = new RegExp(title, 'i');
            return $('.box').filter(function () {
                return rx.test($(this).find('h2').first().text() || '');
            }).first();
        }

        // Macht übrige Seitenbilder (History/Alben/Verify) zoombar und markiert Verify-Bilder
        static enhanceGalleries($vbox) {
            $('img.userimage').each(function () {
                const $img = $(this);
                if ($img.closest('.epa-list').length) return;       // schon in einer Zeile
                if ($img.hasClass('epa-zoomable')) return;
                if ($img.hasClass('small_square')) return;          // Kommentar-Avatare überspringen
                const large = NewLayout.bestSrc($img);
                NewLayout.makeZoomable($img, large);                 // Vorschau + Seiten-Hover unterdrücken
                // Verify-Bilder grün markieren (Dateikennung -ver oder innerhalb der Verify-Box)
                const sig = ($img.attr('src') || '') + ' ' + ($img.attr('alt') || '');
                const inVerify = $vbox && $vbox.length && $.contains($vbox[0], this);
                if (/-ver/i.test(sig) || inVerify) {
                    if (!$img.next('.epa-verify-badge').length) {
                        $('<span class="epa-verify-badge">\u2713 Verify</span>').insertAfter($img);
                    }
                }
            });
        }

        // ---- Einzel-Albumfotoseite (photos-admin-albumphoto.html) ----
        static buildAlbumPhoto() {
            let built = 0;
            // 1) „Gewähltes Albumbild": photo_cell_line -> saubere Zeile
            try {
                $('li.photo_cell_line').each(function () {
                    const $li = $(this);
                    const $ul = $li.closest('ul');
                    if ($ul.hasClass('epa-nl-hidden')) return;
                    let row = null;
                    try { row = NewLayout.buildLineRow($li, 'albumphoto'); }
                    catch (e) { console.error('[kn-fotoadmin] albumphoto Zeile:', e); }
                    if (row) {
                        const $list = $('<div class="epa-list epa-list-single"></div>').append(row);
                        $ul.before($list); $ul.addClass('epa-nl-hidden').hide(); built++;
                    }
                });
            } catch (e) { console.error('[kn-fotoadmin] albumphoto Zeilen:', e); }
            // 2) „Übrige Bilder des Albums": Karten-Grid
            try { built += NewLayout.buildAlbumPhotoGrid(); } catch (e) { console.error('[kn-fotoadmin] albumphoto Grid:', e); }
            // 3) Sperrdauer + Sperr-History + Galerien + Suche (jeweils unabhängig)
            try { NewLayout.enhanceLocks(); } catch (e) { console.error('[kn-fotoadmin] enhanceLocks:', e); }
            try { NewLayout.prettifyLockHistory(); } catch (e) { console.error('[kn-fotoadmin] lockHistory:', e); }
            try { NewLayout.enhanceGalleries(null); } catch (e) { console.error('[kn-fotoadmin] galleries:', e); }
            try { NewLayout.enhanceRejectedFilter(); } catch (e) { console.error('[kn-fotoadmin] rfilter:', e); }
            try { NewLayout.enhanceCommentButtons(); } catch (e) { console.error("[kn-fotoadmin] cmtBtn:", e); }
            try { CommentSearch.mount(); } catch (e) { console.error('[kn-fotoadmin] CommentSearch:', e); }
            if (built > 0 || $('img.epa-uimg.epa-zoomable').length) $('body').addClass('epa-nl');
            console.log('[kn-fotoadmin] albumphoto: gebaut =', built);
            return built > 0 ? built : 1;
        }

        static buildAlbumPhotoGrid() {
            const $ul = $('ul.albumphoto').filter(function () {
                return $(this).find('li.album_image').length > 0;
            }).first();
            if (!$ul.length) return 0;

            const $section = $('<div class="epa-album"></div>');
            const $head = $('<div class="epa-album-head"></div>');
            const $meta = $('<div class="epa-album-meta"></div>');
            $meta.append($('<div class="epa-album-title">Übrige Bilder des Albums</div>'));
            const $a0 = $('select[name="a0"]').first();
            if ($a0.length) {
                const $vb = NewLayout.verdictBlock($a0, null);
                $vb.find('.epa-block-label').text('Ganzes Album bewerten');
                $meta.append($vb);
            }
            $head.append($meta);
            $section.append($head);

            const $cards = $('<div class="epa-acards"></div>');
            let any = false;
            $ul.find('li.album_image').each(function () {
                const $li = $(this);
                let card = null;
                try { card = NewLayout.buildAlbumPhotoCard($li); }
                catch (e) { console.error('[kn-fotoadmin] Albumfoto-Karte übersprungen:', e); }
                if (!card) return;
                const $open = $li.find('a.albumphoto[href*="albumphoto.html?id="]').first();
                const cmt = (($li.text() || '').match(/(\d+)\s*Kommentar/i) || [])[0] || '';
                const $foot = $('<div class="epa-acard-foot"></div>');
                if ($open.length) {
                    $foot.append($('<a class="epa-btn epa-btn-sm" target="_blank" rel="noopener">Öffnen</a>')
                        .attr('href', $open.attr('href')));
                }
                if (cmt) $foot.append($('<span class="epa-cmt-count"></span>').text(cmt));
                card.append($foot);
                $cards.append(card); any = true;
            });
            if (!any) return 0;
            $section.append($cards);
            $ul.before($section);
            $ul.addClass('epa-nl-hidden').hide();
            $ul.prevAll('.metainfo').first().addClass('epa-nl-hidden').hide();
            return 1;
        }

        // „Sperrdauer manuell ändern" als Toggle + Dropdown/Buttons
        static enhanceLocks() {
            $('.manual_lock_duration').each(function () {
                const $native = $(this);
                if ($native.data('epaLock')) return;
                const $chk = $native.find('input[name="manual_lock_duration"]').first();
                const $sel = $native.find('select[name="lock_duration"]').first();
                if (!$sel.length) return;
                $native.data('epaLock', true);

                const $block = $('<div class="epa-block epa-lock"></div>');
                $block.append($('<div class="epa-block-label">Sperrdauer</div>'));
                const $row = $('<div class="epa-decide"></div>');

                const $tog = $('<button type="button" class="epa-io">Manuell setzen</button>');
                const sync = function (on) {
                    $chk.prop('checked', on);
                    $sel.prop('disabled', !on);
                    try { $chk.trigger('change'); } catch (e) { /* ignore */ }
                    $tog.toggleClass('epa-io-active', on);
                    $block.toggleClass('epa-lock-on', on);
                };
                $tog.on('click', function (e) { e.preventDefault(); sync(!$chk.is(':checked')); });
                $row.append($tog);

                if (Config.USE_DROPDOWN) {
                    const $clone = $sel.clone().removeAttr('name').removeAttr('id').removeAttr('disabled').addClass('epa-select');
                    $clone.val($sel.val());
                    $clone.on('change', function () {
                        $sel.val($clone.val());
                        sync(true);   // Sperrdauer gewählt -> Uploadsperre automatisch aktivieren
                    });
                    $row.append($clone);
                } else {
                    const $btns = $('<div class="epa-btns"></div>');
                    $sel.find('option').each(function () {
                        const v = $(this).val();
                        const $b = $('<button type="button" class="epa-v"></button>').text($(this).text().trim()).attr('data-val', v);
                        if ($sel.val() === v) $b.addClass('epa-v-active');
                        $b.on('click', function (e) {
                            e.preventDefault();
                            $sel.val(v);
                            $btns.find('.epa-v').removeClass('epa-v-active');
                            $b.addClass('epa-v-active');
                            sync(true);   // Sperrdauer gewählt -> Uploadsperre automatisch aktivieren
                        });
                        $btns.append($b);
                    });
                    $row.append($btns);
                }
                $block.append($row);
                $native.addClass('epa-nl-hidden').hide().after($block);
                sync($chk.is(':checked'));
            });
        }

        // Sperr-/Ein-Ausblende-History lesbar machen (alle Einträge, Verstöße rot)
        static prettifyLockHistory() {
            const titleRx = /Uploadsperren|Ein-\s*und\s*Ausblendungen/i;
            $('h3').each(function () {
                const $h3 = $(this);
                if (!titleRx.test($h3.text() || '')) return;
                const $block = $h3.closest('.h').length ? $h3.closest('.h') : $h3;
                if ($block.data('epaLockDone')) return;

                const entries = [];
                let $node = $block.next();
                while ($node.length) {
                    if ($node.is('.h') || $node.find('h3').length) break;
                    const t = ($node.text() || '').replace(/\s+/g, ' ').trim();
                    if (t && /(Verstoß|Sperre|Lock|Stunde|Minute|Tag|durch)/i.test(t)) entries.push($node);
                    $node = $node.next();
                }
                if (!entries.length) return;
                $block.data('epaLockDone', true);

                const $list = $('<div class="epa-locklist"></div>');
                entries.forEach(function ($e) {
                    const line = ($e.text() || '').replace(/\s+/g, ' ').trim();
                    $list.append(NewLayout.lockLine(line));
                    $e.addClass('epa-nl-hidden epa-lockorig').hide();
                });
                $block.after($list);
            });
        }

        static lockLine(line) {
            const $row = $('<div class="epa-lockrow"></div>');
            const segs = line.split(/\s+-\s+/);
            const date = (segs.shift() || '').trim();
            if (date) $row.append($('<span class="epa-lock-date"></span>').text(date));
            segs.forEach(function (rawSeg) {
                let seg = (rawSeg || '').trim();
                let who = '';
                const dm = seg.split(/\s+durch\s+/i);
                if (dm.length > 1) { seg = dm[0].trim(); who = dm.slice(1).join(' durch ').trim(); }
                if (seg) {
                    if (/\d+\.\s*Verstoß/i.test(seg)) $row.append($('<span class="epa-lock-violation"></span>').text(seg));
                    else if (/Stunde|Minute|Tag|Permanent|Keine Sperre/i.test(seg)) $row.append($('<span class="epa-lock-dur"></span>').text(seg));
                    else $row.append($('<span class="epa-lock-type"></span>').text(seg));
                }
                if (who) $row.append($('<span class="epa-lock-by"></span>').text('durch ' + who));
            });
            return $row;
        }

        // Filter nach Löschgrund für „History bisher abgelehnter …"-Galerien.
        // Bietet nur Gründe an, die auch vorkommen.
        static enhanceRejectedFilter() {
            $('.previous_photos').each(function () {
                const $gal = $(this);
                if ($gal.data('epaRfilter')) return;
                const $entries = $gal.children('div').filter(function () {
                    return /Löschgrund/i.test($(this).text() || '');
                });
                if ($entries.length < 2) return;

                const reasons = [];
                $entries.each(function () {
                    const t = ($(this).text() || '').replace(/\s+/g, ' ');
                    const m = t.match(/Löschgrund:\s*(.+?)\s*(?:Albumtitel:|Prüfzeit:|Letzter Prüfer:|Albumtitel|$)/i);
                    const r = m ? m[1].trim() : '';
                    $(this).attr('data-epa-grund', r);
                    if (r && reasons.indexOf(r) === -1) reasons.push(r);
                });
                if (reasons.length < 2) return;
                $gal.data('epaRfilter', true);

                const $bar = $('<div class="epa-rfilter"></div>');
                $bar.append($('<span class="epa-rf-label">Löschgrund:</span>'));
                const $btns = [];
                const setActive = function ($b) {
                    $bar.find('.epa-rf-btn').removeClass('epa-rf-active');
                    $b.addClass('epa-rf-active');
                };
                const $all = $('<button type="button" class="epa-rf-btn epa-rf-active">Alle (' + $entries.length + ')</button>');
                $all.on('click', function () { setActive($all); $entries.show(); });
                $bar.append($all);

                reasons.forEach(function (r) {
                    const count = $entries.filter(function () { return $(this).attr('data-epa-grund') === r; }).length;
                    const $b = $('<button type="button" class="epa-rf-btn"></button>').text(r + ' (' + count + ')');
                    $b.on('click', function () {
                        setActive($b);
                        $entries.each(function () {
                            $(this).toggle($(this).attr('data-epa-grund') === r);
                        });
                    });
                    $bar.append($b);
                });

                $gal.before($bar);
            });
        }

        // Pro Fotokommentar einen Button: hakt dessen Lösch-Checkbox an und löst
        // direkt das „Ausführen" des Kommentar-Formulars aus (kein Scrollen nötig).
        static enhanceCommentButtons() {
            $('li.usercomment').each(function () {
                const $li = $(this);
                if ($li.data('epaCmtBtn')) return;
                const $cb = $li.find('input[name="commentId"]').first();
                if (!$cb.length) return;
                const $form = $li.closest('form');
                if (!$form.length) return;
                $li.data('epaCmtBtn', true);

                const $btn = $('<button type="button" class="epa-cmt-del" title="Diesen Kommentar anhaken und sofort löschen">Löschen</button>');
                $btn.on('click', function (e) {
                    e.preventDefault();
                    $cb.prop('checked', true);
                    try { $cb.trigger('change'); } catch (e2) { /* ignore */ }
                    // den echten Ausführen-Button des Formulars auslösen (native Logik)
                    const submitEl = $form.find('input[type="submit"]')[0]
                        || $form.find('.image-submit')[0]
                        || $form.find('.submit_profile')[0];
                    if (submitEl && typeof submitEl.click === 'function') submitEl.click();
                    else if ($form[0]) $form[0].submit();
                });

                const $target = $li.find('.comment').first();
                ($target.length ? $target : $li).append($btn);
            });
        }

        // ---- Bausteine ----
        static bestSrc($img) {
            const rx = /\.(jpe?g|png|webp|gif)(\?|$)/i;
            const href = $img.closest('a').attr('href');
            if (href && rx.test(href)) return href;
            const alt = $img.attr('alt');
            if (alt && rx.test(alt)) return alt;
            return $img.attr('src');
        }

        static imageBlock($img, label, isMain, verify, linkHref) {
            const rx = /\.(jpe?g|png|webp|gif)(\?|$)/i;
            const imgUrl = NewLayout.bestSrc($img);                 // immer eine Bild-URL
            const anchorHref = $img.closest('a').attr('href');
            // Wenn ein Admin-Link übergeben wird (Album-Bild), öffnet ein Klick die
            // Administration dieses Bildes; sonst das Bild selbst.
            const frameHref = linkHref ? linkHref
                : ((anchorHref && rx.test(anchorHref)) ? anchorHref : imgUrl);
            const alt = $img.attr('alt') || '';
            const $b = $('<div class="epa-img' + (isMain ? ' epa-img-main' : '') + '"></div>');
            const $a = $('<a class="epa-img-frame" target="_blank" rel="noopener"></a>').attr('href', frameHref);
            if (linkHref) $a.addClass('epa-img-admin').attr('title', 'In Administration öffnen');
            const $clone = $('<img class="userimage" />')
                .attr('src', imgUrl).attr('alt', alt);
            if (isMain) {
                $clone.addClass('epa-ai-target');
                try { $clone.attr('data-ai-url', new URL(imgUrl, document.baseURI).href); } catch (e) { /* ignore */ }
            }
            NewLayout.makeZoomable($clone, imgUrl);   // Hover-Vorschau + Seiten-Hover unterdrücken
            $a.append($clone);
            $b.append($a);
            if (label) {
                const $cap = $('<span class="epa-img-cap"></span>');
                if (verify) $cap.addClass('epa-cap-verify').text('\u2713 ' + label);
                else $cap.text(label);
                $b.append($cap);
            }
            return $b;
        }

        static headNode($info) {
            const name = Utils.extractName($info.text()) || '\u2014';
            const $head = $('<div class="epa-head"></div>');
            const $name = $('<button type="button" class="epa-name epa-name-copy"></button>')
                .attr('title', 'Klick: „/w +' + name + '" kopieren');
            const $txt = $('<span class="epa-name-text"></span>').text(name);
            $name.append($txt).append($('<span class="epa-copy-ic">\u29C9</span>'));
            $name.on('click', function (e) {
                e.preventDefault();
                NewLayout.copy('/w +' + name);
                $txt.text('Kopiert!');
                $name.addClass('epa-copied');
                setTimeout(function () { $txt.text(name); $name.removeClass('epa-copied'); }, 900);
            });
            $head.append($name);
            $head.append(NewLayout.genderNode($info));
            return $head;
        }

        static copy(text) {
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text);
                else { const $t = $('<textarea>').val(text).appendTo('body').select(); document.execCommand('copy'); $t.remove(); }
            } catch (e) { /* ignore */ }
        }

        // Melden ohne Tab: Melde-URL im Hintergrund aufrufen und Antwort auswerten
        static reportButton(nick) {
            const url = 'https://photo.knuddels.de/photos-comments.html?mode=report&where='
                + encodeURIComponent(nick.toLowerCase()) + '-pro0l0p';
            const $b = $('<button type="button" class="epa-btn epa-btn-report">Melden</button>');
            $b.on('click', function (e) { e.preventDefault(); NewLayout.report(url, $b); });
            return $b;
        }

        static report(url, $btn) {
            $btn.siblings('.epa-report-hint').remove();
            $btn.prop('disabled', true).text('Melde…');
            fetch(url, { credentials: 'include' })
                .then(function (r) { return r.text(); })
                .then(function (html) {
                    $btn.prop('disabled', false);
                    const noPhoto = /uuuups|nicht passieren sollen/i.test(html);
                    if (noPhoto) {
                        $btn.text('Melden').removeClass('epa-btn-ok');
                        $('<span class="epa-report-hint">Kein Foto vorhanden, bitte manuell melden.</span>').insertAfter($btn);
                    } else {
                        $btn.text('Gemeldet \u2713').addClass('epa-btn-ok');
                    }
                })
                .catch(function () {
                    $btn.prop('disabled', false).text('Melden');
                    $('<span class="epa-report-hint">Melden fehlgeschlagen \u2013 bitte manuell.</span>').insertAfter($btn);
                });
        }

        static genderNode($info) {
            const $wrap = $('<span class="epa-gender"></span>');
            const $icon = $info.children('div').first();
            if ($icon.length) $wrap.append($icon.clone().addClass('epa-gicon'));
            const cls = ($icon.attr('class') || '').toLowerCase();
            let label = cls.indexOf('female') !== -1 ? 'weiblich' : (cls.indexOf('male') !== -1 ? 'männlich' : '');
            if (cls.indexOf('divers') !== -1 || cls.indexOf('trans') !== -1) label = (label ? label + ' ' : '') + 'divers';
            if (!label) {
                const m = ($info.text() || '').match(/\(\s*([^,]+?)\s*,/);
                label = m ? m[1].trim() : '';
            }
            const age = Utils.extractAge($info.text());
            const txt = [label, age].filter(Boolean).join(' \u00b7 ');
            if (txt) $wrap.append($('<span class="epa-gtxt"></span>').text(txt));
            return $wrap;
        }

        // Bild-URL absolut machen + Query/Hash entfernen (für Reverse-Suche).
        static absPhotoUrl(u) {
            if (!u) return '';
            u = String(u).replace(/[?#].*$/, '').trim();
            if (!u) return '';
            if (/^https?:\/\//i.test(u)) return u;
            try { return new URL(u, document.baseURI || 'https://photo.knuddels.de/').href; }
            catch (e) { return 'https://photo.knuddels.de/' + u.replace(/^\/+/, ''); }
        }

        // Liefert die (möglichst große) Bild-URL des Hauptbildes eines Bereichs.
        static mainSearchImageUrl($scope) {
            const rx = /\.(jpe?g|png|webp)(\?|$)/i;
            let $img = $scope.find('.photo_cell.new_photo .userimage').first();
            if (!$img.length) $img = $scope.find('.userimage').first();
            if (!$img.length) $img = $scope.find('img.epa-uimg, img.epa-zoomable').first();
            if (!$img.length) return '';
            const anchorHref = $img.closest('a').attr('href');
            const raw = (anchorHref && rx.test(anchorHref)) ? anchorHref : NewLayout.bestSrc($img);
            return NewLayout.absPhotoUrl(raw);
        }

        // Reverse-Image-Such-URLs im selben Format wie die nativen Seiten-Links.
        static searchUrls(absUrl) {
            if (!absUrl) return null;
            return {
                yandex: 'https://yandex.com/images/search?url=' + absUrl + '&rpt=imageview',
                google: 'https://lens.google.com/uploadbyurl?url=' + absUrl
            };
        }

        static toolsBlock($scope, $select, nick) {
            const $block = $('<div class="epa-block"></div>');
            $block.append($('<div class="epa-block-label">1 \u00b7 Prüfen</div>'));
            const $btns = $('<div class="epa-btns"></div>');
            const $y = $scope.find('a').filter(function () { return /yandex/i.test($(this).text()); }).first();
            const $g = $scope.find('a').filter(function () { return /google/i.test($(this).text()); }).first();
            let yHref = $y.length ? $y.attr('href') : null;
            let gHref = $g.length ? $g.attr('href') : null;
            // Fallback: fehlen die nativen Such-Links (z. B. „Gewähltes Albumbild",
            // teils Profilbild), aus der Bild-URL selbst aufbauen – Format wie nativ.
            if (!yHref || !gHref) {
                const su = NewLayout.searchUrls(NewLayout.mainSearchImageUrl($scope));
                if (su) { if (!yHref) yHref = su.yandex; if (!gHref) gHref = su.google; }
            }
            if (yHref) $btns.append($('<a class="epa-btn" target="_blank" rel="noopener">Yandex</a>').attr('href', yHref));
            if (gHref) $btns.append($('<a class="epa-btn" target="_blank" rel="noopener">Google</a>').attr('href', gHref));
            const $bot = $('<button type="button" class="epa-btn epa-btn-bot">Bot</button>');
            const $scam = $('<button type="button" class="epa-btn epa-btn-scam">Scam</button>');
            $bot.on('click', function () { NewLayout.macro('bot', nick, $select, $bot); });
            $scam.on('click', function () { NewLayout.macro('scam', nick, $select, $scam); });
            $btns.append($bot, $scam);
            if (nick) $btns.append(NewLayout.reportButton(nick));
            $block.append($btns);
            return $block;
        }

        static verdictBlock($select, $isok, compact) {
            const $block = $('<div class="' + (compact ? 'epa-block-c' : 'epa-block epa-block-decide') + '"></div>');
            if (!compact) $block.append($('<div class="epa-block-label">2 \u00b7 Bewerten</div>'));
            const $row = $('<div class="epa-decide"></div>');

            if ($select && $select.length) {
                if (Config.USE_DROPDOWN) {
                    const $clone = $select.clone();
                    $clone.removeAttr('name').removeAttr('id').addClass('epa-select');
                    $clone.val($select.val());
                    $clone.on('change', function () { Verdict.set($select, $clone.val()); });
                    $select.on('epa:verdict.nl', function () { $clone.val($select.val()); });
                    $row.append($clone);
                } else {
                    const $btns = $('<div class="epa-btns"></div>');
                    const opts = [];
                    $select.find('option').each(function () {
                        const val = $(this).val();
                        if (val === '') return;
                        opts.push({ val: val, label: $(this).text().trim() });
                    });
                    const isPrimary = (val) => Config.PRIMARY_VERDICTS.some(function (p) {
                        return val.toLowerCase().indexOf(p.toLowerCase()) !== -1;
                    });
                    const mkBtn = (o) => {
                        const $b = $('<button type="button" class="epa-v"></button>').text(o.label).attr('data-val', o.val);
                        if ($select.val() === o.val) $b.addClass('epa-v-active');
                        $b.on('click', function (e) { e.preventDefault(); Verdict.set($select, o.val); });
                        return $b;
                    };
                    const primary = opts.filter((o) => isPrimary(o.val));
                    const rest = opts.filter((o) => !isPrimary(o.val));
                    (primary.length ? primary : opts).forEach((o) => $btns.append(mkBtn(o)));
                    if (primary.length && rest.length) {
                        const $more = $('<button type="button" class="epa-v epa-more">+ mehr</button>');
                        const $restWrap = $('<span class="epa-more-wrap" style="display:none;"></span>');
                        rest.forEach((o) => $restWrap.append(mkBtn(o)));
                        $more.on('click', function (e) {
                            e.preventDefault();
                            const vis = $restWrap.is(':visible');
                            $restWrap.toggle(!vis);
                            $more.text(vis ? '+ mehr' : '\u2212 weniger');
                        });
                        $btns.append($more).append($restWrap);
                    }
                    $select.on('epa:verdict.nl', function () {
                        const vv = $select.val();
                        $btns.find('.epa-v').not('.epa-more').each(function () {
                            $(this).toggleClass('epa-v-active', $(this).attr('data-val') === vv);
                        });
                    });
                    $row.append($btns);
                }
            }

            if ($isok && $isok.length) {
                const $io = $('<button type="button" class="epa-io">Foto i.O.</button>');
                if ($isok.is(':checked')) $io.addClass('epa-io-active');
                $io.on('click', function (e) {
                    e.preventDefault();
                    const c = !$isok.is(':checked');
                    $isok.prop('checked', c);
                    $io.toggleClass('epa-io-active', c);
                });
                $row.append($io);
            }

            $block.append($row);
            return $block;
        }

        static macro(type, nick, $select, $btn) {
            NewLayout.copy('/macro ' + type + ':' + nick + '|Fotokontr.');
            const v = Verdict.fakeValue($select);
            if (v != null) Verdict.set($select, v);
            const orig = $btn.text();
            $btn.text('Kopiert!').addClass('epa-btn-done');
            setTimeout(function () { $btn.text(orig).removeClass('epa-btn-done'); }, 1000);
        }

        static injectStyles() {
            if ($('#epa-nl-styles').length) return;
            const css = `
                body.epa-nl .epa-list { display:flex; flex-direction:column; gap:12px; padding:12px 0;
                    font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif; }
                .epa-row, .epa-album { background:#fff; border:1px solid #e5e7eb; border-radius:12px;
                    box-shadow:0 1px 3px rgba(0,0,0,.06); }
                .epa-row { padding:14px; display:flex; flex-direction:column; gap:12px; }
                .epa-imgs { display:flex; flex-wrap:wrap; gap:14px; align-items:flex-start; }
                .epa-img { display:flex; flex-direction:column; gap:5px; }
                .epa-img-frame { display:block; line-height:0; border-radius:10px; overflow:hidden;
                    background:#f3f4f6; position:relative; }
                .epa-img-frame .ai-image-wrapper { display:block !important; position:relative; }
                .epa-img img.epa-uimg { display:block; width:140px; height:140px; object-fit:cover; cursor:zoom-in; }
                .epa-img-main img.epa-uimg { width:172px; height:172px; }
                .epa-img-cap { font-size:11px; color:#6b7280; font-weight:500; }
                .epa-cap-verify { color:#15803d; background:#dcfce7; border:1px solid #86efac;
                    border-radius:999px; padding:2px 9px; display:inline-flex; align-items:center;
                    gap:4px; font-weight:600; align-self:flex-start; }
                .epa-head { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
                .epa-name { font-weight:600; font-size:15px; color:#111827; word-break:break-word; }
                .epa-name-copy { display:inline-flex; align-items:center; gap:5px; background:none;
                    border:none; padding:2px 5px; margin:-2px -5px; border-radius:6px; cursor:pointer;
                    font:inherit; color:#111827; }
                .epa-name-copy .epa-name-text { font-weight:600; font-size:15px; }
                .epa-name-copy .epa-copy-ic { font-size:13px; color:#9ca3af; opacity:0; transition:opacity .12s; }
                .epa-name-copy:hover { background:#f3f4f6; }
                .epa-name-copy:hover .epa-copy-ic { opacity:1; }
                .epa-name-copy.epa-copied { background:#dcfce7 !important; color:#15803d; }
                .epa-gender { display:inline-flex; align-items:center; gap:5px; font-size:13px; color:#6b7280; }
                .epa-gender .epa-gicon { margin:0 !important; float:none !important; display:inline-block; vertical-align:middle; }
                .epa-block-label { font-size:11px; font-weight:500; color:#9ca3af; margin-bottom:6px; }
                .epa-block-decide { border-top:1px solid #f1f5f9; padding-top:10px; }
                .epa-btns { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
                .epa-btn { padding:5px 11px; font-size:12px; border:1px solid #d1d5db; border-radius:7px;
                    background:#fff; color:#374151; text-decoration:none; cursor:pointer; line-height:1.4; }
                .epa-btn:hover { background:#f3f4f6; }
                .epa-btn-sm { padding:3px 9px; font-size:11px; }
                .epa-btn-bot { border-color:#2563eb; color:#2563eb; }
                .epa-btn-scam { border-color:#dc2626; color:#dc2626; }
                .epa-btn-report { border-color:#7c3aed; color:#7c3aed; }
                .epa-btn-ok { background:#16a34a !important; border-color:#16a34a !important; color:#fff !important; }
                .epa-report-hint { display:inline-block; font-size:11px; color:#b91c1c; background:#fee2e2;
                    border:1px solid #fecaca; border-radius:6px; padding:3px 8px; }
                .epa-btn-done { background:#16a34a !important; border-color:#16a34a !important; color:#fff !important; }
                .epa-decide { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
                .epa-v { padding:5px 11px; font-size:12px; border:1px solid #d1d5db; border-radius:7px;
                    background:#f9fafb; color:#374151; cursor:pointer; line-height:1.4; }
                .epa-v:hover { background:#eef2ff; border-color:#c7d2fe; }
                .epa-v-active { background:#2563eb !important; border-color:#2563eb !important; color:#fff !important; }
                .epa-select { padding:6px 10px; font-size:13px; border:1px solid #cbd5e1; border-radius:7px;
                    background:#fff; color:#111827; min-width:210px; }
                .epa-io { padding:5px 11px; font-size:12px; border:1px solid #d1d5db; border-radius:7px;
                    background:#f9fafb; color:#374151; cursor:pointer; }
                .epa-io-sm { padding:3px 9px; font-size:11px; }
                .epa-io-active { background:#16a34a !important; border-color:#16a34a !important; color:#fff !important; }
                .epa-more { background:#fff; color:#6b7280; border-style:dashed; }
                .epa-more-wrap { display:inline-flex; flex-wrap:wrap; gap:6px; }
                .epa-block-c { display:flex; width:100%; min-width:0; }
                .epa-block-c .epa-decide { flex-direction:column; align-items:stretch; gap:6px; width:100%; min-width:0; }
                .epa-block-c .epa-select { width:100%; min-width:0; max-width:100%; box-sizing:border-box; }
                .epa-block-c .epa-io { align-self:flex-start; }
                .epa-block-c .epa-btns { width:100%; }
                /* Album */
                .epa-album { padding:14px; margin:12px 0; display:flex; flex-direction:column; gap:14px; }
                .epa-album-head { display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
                .epa-album-spacer { flex:1 1 auto; }
                .epa-album-actions { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
                .epa-album-pic img { width:64px; height:64px; object-fit:cover; border-radius:10px;
                    border:1px solid #e5e7eb; display:block; cursor:zoom-in; }
                .epa-album-meta { display:flex; flex-direction:column; gap:6px; }
                .epa-album-sub { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
                .epa-album-verdict { margin-top:8px; border-top:none !important; padding-top:0 !important; }
                .epa-album-verdict .epa-block-label { color:#2563eb; font-weight:600; }
                .epa-acards { display:grid; grid-template-columns:repeat(auto-fill, minmax(150px, 1fr));
                    gap:12px; align-items:start; }
                .epa-acard { display:flex; flex-direction:column; gap:8px; padding:10px; min-width:0;
                    border:1px solid #eef1f5; border-radius:10px; background:#fbfcfe; }
                .epa-acard .epa-img { width:100%; }
                .epa-acard .epa-img-frame { width:100%; }
                .epa-acard .epa-img img.epa-uimg { width:100%; height:auto; aspect-ratio:1; object-fit:cover; }
                .epa-acard-rs { display:flex; gap:6px; }
                /* Hover-Vorschau (Sichtbarkeit per Inline-Style) */
                .epa-hover-preview { position:fixed; z-index:2147483600; pointer-events:none;
                    border:3px solid #fff; border-radius:12px; box-shadow:0 10px 40px rgba(0,0,0,.4); background:#fff; }
                .epa-hover-preview img { display:block; max-width:80vw; max-height:80vh; border-radius:9px; }
                /* --- Einzel-Admin-Profilseite --- */
                body.epa-nl .epa-list-single { padding:8px 0 4px; }
                body.epa-nl .previous_photos { display:flex; flex-wrap:wrap; gap:12px; }
                body.epa-nl .previous_photos > div { float:none !important; width:auto !important;
                    max-width:200px; background:#fff; border:1px solid #e5e7eb; border-radius:10px;
                    padding:8px; font-size:11px; line-height:1.45; color:#555;
                    font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif; }
                body.epa-nl .previous_photos img.epa-uimg { display:block; max-width:184px; height:auto;
                    border-radius:8px; border:1px solid #e5e7eb; cursor:zoom-in; margin-bottom:6px; }
                body.epa-nl .albumsbox .teaser img { border-radius:8px; cursor:zoom-in; }
                body.epa-nl .epa-verify-badge { display:inline-block; margin:4px 0 0; padding:2px 8px;
                    font:600 11px system-ui,-apple-system,'Segoe UI',Roboto,sans-serif; color:#047857;
                    background:#d1fae5; border:1px solid #6ee7b7; border-radius:999px; }
                /* --- Geforderte Geste (Verifizierung) --- */
                .epa-verify-instr { margin:0 0 12px; padding:12px 14px; border-radius:12px;
                    background:linear-gradient(135deg,#fef3c7,#fffbeb); border:1px solid #fcd34d;
                    box-shadow:0 1px 3px rgba(0,0,0,.06);
                    font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif; }
                .epa-row .epa-verify-instr { grid-column:1 / -1; }
                .epa-vi-title { font:700 12px system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
                    letter-spacing:.04em; text-transform:uppercase; color:#92400e; margin-bottom:6px; }
                .epa-vi-line { font:600 15px system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
                    color:#7c2d12; line-height:1.4; }
                .epa-vi-line + .epa-vi-line { margin-top:3px; }
                /* --- Ablehnungs-Verlauf (Verify) --- */
                .epa-vrej { margin:0; padding:10px 12px; border-radius:12px;
                    background:#fff1f2; border:1px solid #fecdd3;
                    font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif; }
                .epa-vrej-title { font:700 12px system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
                    letter-spacing:.03em; text-transform:uppercase; color:#be123c; margin-bottom:8px; }
                .epa-vrej-item { display:flex; align-items:flex-start; gap:10px; padding:6px 0;
                    border-top:1px solid #fecdd3; }
                .epa-vrej-item:first-of-type { border-top:none; }
                .epa-vrej-link { flex:0 0 auto; display:block; }
                .epa-vrej-thumb { display:block; width:54px; height:54px; object-fit:cover;
                    border-radius:8px; border:1px solid #fecdd3; cursor:zoom-in; }
                .epa-vrej-meta { flex:1 1 auto; min-width:0; }
                .epa-vrej-date { font:600 12px system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
                    color:#9f1239; }
                .epa-vrej-reason { font:500 13px system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
                    color:#7c2d12; line-height:1.4; margin-top:2px; }
                /* --- Vorherige Kontrolle (2. Instanz) --- */
                .epa-vprior { display:flex; align-items:baseline; gap:8px; flex-wrap:wrap;
                    padding:7px 11px; border-radius:10px; background:#eff6ff; border:1px solid #bfdbfe;
                    font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif; }
                .epa-vprior-label { font:700 11px system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
                    letter-spacing:.04em; text-transform:uppercase; color:#1d4ed8; }
                .epa-vprior-val { font:600 13px system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
                    color:#1e3a5f; }
                /* --- Sperrdauer-Steuerung --- */
                .epa-lock { opacity:.65; }
                .epa-lock.epa-lock-on { opacity:1; }
                /* --- Sperr-/Ein-Ausblende-History --- */
                .epa-locklist { display:flex; flex-direction:column; gap:6px;
                    font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif; }
                .epa-lockrow { display:flex; flex-wrap:wrap; gap:8px; align-items:center;
                    padding:6px 10px; background:#fff; border:1px solid #e5e7eb; border-radius:8px; font-size:12px; }
                .epa-lock-date { color:#6b7280; font-variant-numeric:tabular-nums; }
                .epa-lock-violation { font-weight:700; color:#b91c1c; background:#fee2e2;
                    border:1px solid #fecaca; border-radius:6px; padding:1px 8px; }
                .epa-lock-dur { font-weight:600; color:#1f2937; background:#f3f4f6;
                    border:1px solid #e5e7eb; border-radius:6px; padding:1px 8px; }
                .epa-lock-type { font-weight:600; color:#7c3aed; }
                .epa-lock-by { color:#6b7280; }
                /* --- Album-Grid-Zusätze --- */
                .epa-album-title { font-weight:700; font-size:14px; color:#111827; }
                .epa-acard-foot { display:flex; align-items:center; gap:8px; justify-content:space-between; }
                .epa-cmt-count { font-size:11px; color:#6b7280; }
                /* --- Kommentar-Suche --- */
                .epa-csearch { margin:12px 0; padding:14px; background:#fff; border:1px solid #e5e7eb;
                    border-radius:12px; box-shadow:0 1px 3px rgba(0,0,0,.06);
                    font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif; }
                .epa-cs-title { font-weight:700; font-size:15px; color:#111827; margin-bottom:10px; }
                .epa-cs-form { display:flex; flex-wrap:wrap; gap:10px; align-items:center; }
                .epa-cs-input { flex:1 1 240px; min-width:180px; padding:8px 12px; font-size:14px;
                    border:1px solid #d1d5db; border-radius:8px; }
                .epa-cs-scope { font-size:12px; color:#374151; display:flex; align-items:center; gap:5px; }
                .epa-cs-start { background:#2563eb; border-color:#2563eb; color:#fff; }
                .epa-cs-stop { background:#dc2626; border-color:#dc2626; color:#fff; }
                .epa-cs-status { margin-top:10px; font-size:12px; color:#6b7280; min-height:16px; }
                .epa-cs-hit { margin-top:10px; padding:12px; border:1px solid #fcd34d; background:#fffbeb;
                    border-radius:10px; }
                .epa-cs-hit-who { font-weight:700; font-size:13px; color:#92400e; margin-bottom:4px; }
                .epa-cs-hit-text { font-size:13px; color:#1f2937; margin-bottom:10px; white-space:pre-wrap; }
                .epa-cs-hit-btns { display:flex; flex-wrap:wrap; gap:8px; }
                .epa-cs-open { background:#16a34a; border-color:#16a34a; color:#fff; }
                .epa-img-admin { cursor:pointer; }
                .epa-img-admin img.epa-uimg { cursor:pointer; }
                .epa-img-admin::after { content:"In Administration öffnen"; position:absolute; left:0; right:0; bottom:0;
                    font:600 10px system-ui,-apple-system,'Segoe UI',Roboto,sans-serif; color:#fff;
                    background:rgba(37,99,235,.85); text-align:center; padding:3px 2px; opacity:0;
                    transition:opacity .12s; pointer-events:none; }
                .epa-img-admin:hover::after { opacity:1; }
                li.usercomment.epa-cmt-jump { outline:3px solid #f59e0b; outline-offset:2px;
                    background:#fffbeb !important; border-radius:8px; }
                /* --- Filter nach Löschgrund --- */
                .epa-rfilter { display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin:6px 0 12px;
                    font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif; }
                .epa-rf-label { font-size:12px; color:#6b7280; font-weight:600; margin-right:2px; }
                .epa-rf-btn { padding:4px 10px; font-size:12px; border:1px solid #d1d5db; border-radius:999px;
                    background:#f9fafb; color:#374151; cursor:pointer; line-height:1.4; }
                .epa-rf-btn:hover { background:#eef2ff; border-color:#c7d2fe; }
                .epa-rf-btn.epa-rf-active { background:#2563eb !important; border-color:#2563eb !important; color:#fff !important; }
                /* --- Kommentar löschen-Button --- */
                .epa-cmt-del { margin-left:8px; padding:2px 9px; font-size:11px; border:1px solid #dc2626;
                    border-radius:6px; background:#fee2e2; color:#b91c1c; cursor:pointer; vertical-align:middle;
                    font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif; font-weight:600; }
                .epa-cmt-del:hover { background:#dc2626; color:#fff; }
            `;
            $('<style id="epa-nl-styles">').text(css).appendTo('head');
        }
    }

    /**
     * Kommentar-Suche: durchsucht im Hintergrund alle Fotos (aktuelles Album,
     * optional weitere Alben) nach einem Suchbegriff in den Fotokommentaren.
     * Delay = KI-Prüf-Delay. Stoppt beim ersten Treffer; Anwender entscheidet.
     */
    class CommentSearch {
        static mount() {
            if ($('#epa-csearch').length) return;
            const $panel = $('<div id="epa-csearch" class="epa-csearch"></div>');
            $panel.append('<div class="epa-cs-title">Kommentar-Suche</div>');
            const $form = $('<div class="epa-cs-form"></div>');
            const $inp = $('<input type="text" class="epa-cs-input" placeholder="Suchbegriff im Kommentar oder Nick…" />');
            const $scope = $('<label class="epa-cs-scope"><input type="checkbox" class="epa-cs-all" checked /> auch weitere Alben durchsuchen</label>');
            const $start = $('<button type="button" class="epa-btn epa-cs-start">Suche starten</button>');
            const $stop = $('<button type="button" class="epa-btn epa-cs-stop" style="display:none;">Stopp</button>');
            $form.append($inp, $scope, $start, $stop);
            const $status = $('<div class="epa-cs-status"></div>');
            const $result = $('<div class="epa-cs-result"></div>');
            $panel.append($form, $status, $result);

            const cs = new CommentSearch($inp, $scope, $start, $stop, $status, $result);
            $start.on('click', function () { cs.start(); });
            $stop.on('click', function () { cs.stop(); });
            $inp.on('keydown', function (e) { if (e.which === 13) { e.preventDefault(); cs.start(); } });

            const $h1 = $('.box.h1box').first();
            const $albumBox = $('.box.albumphoto').first();
            if ($h1.length) $h1.after($panel);
            else if ($albumBox.length) $albumBox.before($panel);
            else $('#kmain .photo').first().prepend($panel);
        }

        constructor($inp, $scope, $start, $stop, $status, $result) {
            this.$inp = $inp; this.$scope = $scope; this.$start = $start; this.$stop = $stop;
            this.$status = $status; this.$result = $result;
            this.running = false; this.cancel = false;
            this.queue = []; this.resumeIndex = 0; this.checked = 0;
            this.seenPhotos = {}; this.lastTerm = null;
        }

        buildQueue() {
            const q = [];
            const push = function (url, type) {
                if (!url) return;
                try { q.push({ url: new URL(url, document.baseURI).href, type: type }); } catch (e) { /* ignore */ }
            };
            // aktuelle Seite (live im Dokument durchsuchen – kein erneuter GET,
            // wichtig u. a. auf der ..._submit-Seite)
            q.push({ url: location.href, type: 'self' });
            // Fotos des aktuellen Albums (Albumfoto-Seite)
            $('.box.albumphoto ul.albumphoto li.album_image a.albumphoto[href*="albumphoto.html?id="]').each(function () {
                push($(this).attr('href'), 'photo');
            });
            // weitere/alle Alben des Nutzers (Standard: an) – nur Album-Cover
            if (this.$scope.find('input').is(':checked')) {
                $('.albumsbox a[href*="albumphoto.html?id="], .albumCover a[href*="albumphoto.html?id="]').each(function () {
                    push($(this).attr('href'), 'album');
                });
            }
            const seen = {}; const out = [];
            q.forEach(function (t) {
                const key = t.url.split('#')[0];
                const k = (t.type === 'self' ? 'self' : 'p') + '|' + key;
                if (!seen[k]) { seen[k] = 1; out.push(t); }
            });
            return out;
        }

        async start() {
            const term = ((this.$inp.val() || '').trim()).toLowerCase();
            if (!term) { this.$status.text('Bitte einen Suchbegriff eingeben.'); return; }
            if (this.running) return;
            this.term = term;
            if (!this.queue.length || this.lastTerm !== term) {
                this.queue = this.buildQueue();
                this.resumeIndex = 0; this.checked = 0; this.seenPhotos = {}; this.lastTerm = term;
            }
            this.running = true; this.cancel = false;
            this.$start.hide(); this.$stop.show(); this.$result.empty();
            await this.run();
            this.running = false;
            this.$start.show(); this.$stop.hide();
        }

        stop() { this.cancel = true; this.$status.text('Wird gestoppt…'); }

        async run() {
            const delay = Config.CHECK_DELAY || 2000;
            while (this.resumeIndex < this.queue.length) {
                if (this.cancel) { this.$status.text('Gestoppt – ' + this.checked + ' Fotos durchsucht.'); return; }
                const task = this.queue[this.resumeIndex++];
                if (task.type === 'photo' && this.seenPhotos[task.url]) continue;

                this.$status.text('Durchsuche Foto ' + (this.checked + 1)
                    + ' … (' + (this.queue.length - this.resumeIndex) + ' in Warteschlange)');

                // Aktuelle Seite: direkt das geladene Dokument durchsuchen
                if (task.type === 'self') {
                    this.checked++;
                    const hit = this.findComment(document, location.href);
                    if (hit) { this.showHit(hit); return; }
                    if (this.resumeIndex < this.queue.length) await Utils.sleep(delay);
                    continue;
                }

                let html = null;
                try { const r = await fetch(task.url, { credentials: 'include' }); html = await r.text(); }
                catch (e) { html = null; }

                if (html) {
                    const doc = new DOMParser().parseFromString(html, 'text/html');
                    if (task.type === 'album') {
                        const photos = this.extractPhotos(doc, task.url);
                        const insert = photos.map(function (u) { return { url: u, type: 'photo' }; });
                        this.queue.splice(this.resumeIndex, 0, ...insert);
                    } else {
                        this.seenPhotos[task.url] = 1;
                        this.checked++;
                        const hit = this.findComment(doc, task.url);
                        if (hit) { this.showHit(hit); return; }
                    }
                }
                if (this.resumeIndex < this.queue.length) await Utils.sleep(delay);
            }
            this.$status.text('Fertig – kein (weiterer) Treffer (' + this.checked + ' Fotos durchsucht).');
        }

        extractPhotos(doc, baseUrl) {
            const urls = [];
            const nodes = doc.querySelectorAll('ul.albumphoto li.album_image a.albumphoto[href*="albumphoto.html?id="]');
            nodes.forEach(function (a) {
                try { urls.push(new URL(a.getAttribute('href'), baseUrl).href); } catch (e) { /* ignore */ }
            });
            urls.push(baseUrl); // ausgewähltes Foto der Albumseite selbst
            return urls;
        }

        findComment(doc, photoUrl) {
            const term = this.term;
            const items = doc.querySelectorAll('li.usercomment');
            for (let i = 0; i < items.length; i++) {
                const li = items[i];
                const unameEl = li.querySelector('.username');
                const who = (unameEl ? unameEl.textContent : '').replace(/\s+/g, ' ').trim();
                const cdiv = li.querySelector('.comment');
                let text = '';
                if (cdiv) {
                    const clone = cdiv.cloneNode(true);
                    clone.querySelectorAll('.timestamp, .deleter').forEach(function (n) { n.remove(); });
                    text = clone.textContent.replace(/\s+/g, ' ').trim();
                }
                if (text.toLowerCase().indexOf(term) !== -1 || who.toLowerCase().indexOf(term) !== -1) {
                    return { photoUrl: photoUrl, who: who, text: text };
                }
            }
            return null;
        }

        showHit(hit) {
            this.$status.text('Treffer gefunden – Suche pausiert.');
            const $box = $('<div class="epa-cs-hit"></div>');
            $box.append($('<div class="epa-cs-hit-who"></div>').text(hit.who || 'Kommentar'));
            $box.append($('<div class="epa-cs-hit-text"></div>').text(hit.text || ''));
            const $btns = $('<div class="epa-cs-hit-btns"></div>');
            // Öffnungs-URL mit Sprung-Marke: die geöffnete Seite scrollt zum Kommentar
            let openUrl = hit.photoUrl;
            try {
                const u = new URL(hit.photoUrl, document.baseURI);
                u.hash = 'epacmt=' + encodeURIComponent(JSON.stringify({
                    who: hit.who || '', q: (hit.text || '').slice(0, 60)
                }));
                openUrl = u.href;
            } catch (e) { /* ignore */ }
            $btns.append($('<a class="epa-btn epa-cs-open" target="_blank" rel="noopener">Bild mit Kommentar öffnen</a>')
                .attr('href', openUrl));
            const $cont = $('<button type="button" class="epa-btn epa-cs-continue">Weitersuchen</button>');
            const self = this;
            $cont.on('click', function () { self.$result.empty(); self.start(); });
            $btns.append($cont);
            $box.append($btns);
            this.$result.empty().append($box);
        }

        // Auf der geöffneten Seite: zum gesuchten Kommentar scrollen + markieren
        static applyJump() {
            const m = (location.hash || '').match(/epacmt=([^&]+)/);
            if (!m) return;
            let info = null;
            try { info = JSON.parse(decodeURIComponent(m[1])); } catch (e) { return; }
            const who = (info.who || '').toLowerCase();
            const q = (info.q || '').toLowerCase();
            const tryJump = function () {
                const items = document.querySelectorAll('li.usercomment');
                const read = function (li) {
                    const u = (li.querySelector('.username') ? li.querySelector('.username').textContent : '').replace(/\s+/g, ' ').trim().toLowerCase();
                    const cdiv = li.querySelector('.comment');
                    let text = '';
                    if (cdiv) { const c = cdiv.cloneNode(true); c.querySelectorAll('.timestamp, .deleter').forEach(function (n) { n.remove(); }); text = c.textContent.replace(/\s+/g, ' ').trim().toLowerCase(); }
                    return { u: u, text: text };
                };
                let exact = null, byText = null, byWho = null;
                for (let i = 0; i < items.length; i++) {
                    const r = read(items[i]);
                    const textMatch = q && r.text.indexOf(q) !== -1;
                    const whoMatch = who && r.u === who;
                    if (textMatch && (!who || whoMatch)) { exact = items[i]; break; }   // Text + (ggf.) Nutzer
                    if (textMatch && !byText) byText = items[i];                          // nur Text
                    if (whoMatch && !byWho) byWho = items[i];                             // nur Nutzer
                }
                const target = exact || byText || byWho;
                if (!target) return false;
                $(target).addClass('epa-cmt-jump');
                target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setTimeout(function () { $(target).removeClass('epa-cmt-jump'); }, 6000);
                return true;
            };
            // ggf. kurz warten, bis die Seite vollständig steht
            let tries = 0;
            const iv = setInterval(function () {
                if (tryJump() || ++tries > 10) clearInterval(iv);
            }, 400);
        }
    }

    /**
     * Bild-Klick: automatisch "Ok" im Select setzen
     */
    class ImageClickHandler {
        static addImageClickHandlers() {
            if (!Utils.isCurrentPage(Config.URLS.PROFILE_CONTROL)) return;

            $('.userimage').on('click', function (e) {
                e.preventDefault();
                ImageClickHandler.setSelectToOkay($(this));
            });
        }

        static setSelectToOkay(clickedImage) {
            const photoCell = clickedImage.closest('.photo_cell_line');
            const selectElement = photoCell.find('select[name^="p"]');
            if (selectElement.length > 0) {
                selectElement.val('Ok');
                CategoryControls.reflect(selectElement);
                ImageClickHandler.showFeedback(clickedImage);
            }
        }

        static showFeedback(image) {
            const originalBorder = image.css('border');
            image.css({ 'border': '3px solid #28a745', 'transition': 'border 0.3s ease' });
            setTimeout(() => image.css('border', originalBorder), 500);
        }
    }

    /**
     * Hauptanwendung
     */
    class PhotoAdministrationApp {
        constructor() {
            this.aiDetectionUI = new AIDetectionUI();
            this.toolbar = null;
            this.running = false;
            this.currentQueue = null;
        }

        init() {
            if (!Utils.isCurrentPage(Config.URLS.PROFILE)) {
                UrlModifier.modifySearchLinks();
                UrlModifier.modifyImageSources();
            }

            AgeMarker.markUnderAgeUsers();

            // Neues Listen-Layout (Profil/Verify/Album), falls aktiviert.
            // Wird VOR dem KI-Setup gebaut, damit der KI-Check auf den Listenbildern läuft.
            let built = 0;
            if (Config.NEW_LAYOUT) {
                try { built = NewLayout.apply(); }
                catch (e) { console.error('[kn-fotoadmin] Neues Layout fehlgeschlagen:', e); NewLayout.teardown(); built = 0; }
            }
            const newLayoutActive = built > 0;

            try { this.aiDetectionUI.addImageButtons(); }
            catch (e) { console.error('[kn-fotoadmin] addImageButtons:', e); }

            // Kommentar-Suche + Sperr-History sicher einhängen (auch falls der Seitenaufbau oben scheiterte)
            try {
                const p = NewLayout.PAGE();
                if (p === 'albumphoto' || p === 'adminprofile') {
                    if (Config.NEW_LAYOUT) NewLayout.injectStyles();
                    try { NewLayout.enhanceLocks(); } catch (e) { /* s.o. */ }
                    try { NewLayout.prettifyLockHistory(); } catch (e) { /* s.o. */ }
                    try { NewLayout.enhanceRejectedFilter(); } catch (e) { /* s.o. */ }
                    try { NewLayout.enhanceCommentButtons(); } catch (e) { /* s.o. */ }
                    CommentSearch.mount();
                    try { CommentSearch.applyJump(); } catch (e) { /* s.o. */ }
                }
            } catch (e) { console.error('[kn-fotoadmin] Nachzügler (init):', e); }

            if (!newLayoutActive) {
                AdminActions.init();
                CategoryControls.apply();
                ImageClickHandler.addImageClickHandlers();
            }

            if (this.aiDetectionUI.entries.length > 0) {
                this.toolbar = new Toolbar();
                this.aiDetectionUI.toolbar = this.toolbar;

                this.toolbar.onStartStop = () => this.toggleQueue();
                this.toolbar.onRecheck = () => this.recheckAll();
                this.toolbar.onJumpCategory = (cat) => this.aiDetectionUI.cycleCategory(cat);
                this.toolbar.onSettingsChange = (s) => this.applySettings(s);

                this.toolbar.refreshCounts(this.aiDetectionUI.entries);

                if (Config.AUTO_CHECK) this.startQueue(Config.INITIAL_DELAY);
            }
        }

        applySettings(s) {
            const layoutChanged = (s.newLayout !== Config.NEW_LAYOUT);
            const dropdownChanged = (s.useDropdown !== Config.USE_DROPDOWN);

            Config.AUTO_CHECK = s.autoCheck;
            Config.CHECK_DELAY = s.checkDelay;
            Config.RETRY_DELAY = s.retryDelay;
            Config.MAX_RETRIES = s.maxRetries;
            Config.AI_THRESHOLD_MEDIUM = s.thMedium;
            Config.AI_THRESHOLD_HIGH = s.thHigh;
            Config.USE_DROPDOWN = s.useDropdown;
            Config.NEW_LAYOUT = s.newLayout;

            this.aiDetectionUI.reclassifyAll();
            this.toolbar.updateThresholdLabels(Config.AI_THRESHOLD_MEDIUM, Config.AI_THRESHOLD_HIGH);
            this.toolbar.refreshCounts(this.aiDetectionUI.entries);

            const layoutActive = $('.epa-list, .epa-album').length > 0;
            if (layoutChanged && NewLayout.PAGE()) {
                this.switchLayout(s.newLayout);
            } else if (layoutActive && dropdownChanged) {
                // Bewertungs-UI (Buttons <-> Dropdown) im Listen-Layout neu aufbauen
                try { NewLayout.teardown(); NewLayout.apply(); this.aiDetectionUI.rebuildEntries(); }
                catch (e) { console.error('[kn-fotoadmin] Neuaufbau fehlgeschlagen:', e); }
            } else if (!layoutActive) {
                CategoryControls.apply();
            }
            Settings.save();
        }

        // Listen-Layout live ein-/ausschalten (Profil/Verify/Album)
        switchLayout(on) {
            try {
                if (on) {
                    const built = NewLayout.apply();
                    if (built > 0) this.aiDetectionUI.rebuildEntries();
                    else NewLayout.teardown();
                } else {
                    NewLayout.teardown();
                    AdminActions.init();
                    CategoryControls.apply();
                    ImageClickHandler.addImageClickHandlers();
                    this.aiDetectionUI.rebuildEntries();
                }
            } catch (e) {
                console.error('[kn-fotoadmin] Layoutwechsel fehlgeschlagen:', e);
                NewLayout.teardown();
            }
        }

        toggleQueue() {
            if (this.running) {
                if (this.currentQueue) this.currentQueue.cancel();
            } else {
                this.startQueue(0);
            }
        }

        recheckAll() {
            if (this.running) return;
            this.aiDetectionUI.resetAll();
            this.startQueue(0);
        }

        async startQueue(initialDelay = 0) {
            if (this.running) return;
            this.running = true;
            this.toolbar.setRunning(true);

            this.currentQueue = new AIDetectionQueue(this.aiDetectionUI);
            const result = await this.currentQueue.start(initialDelay);
            this.currentQueue = null;

            this.running = false;
            this.toolbar.setRunning(false);

            if (result.cancelled) {
                this.toolbar.setStopped(result.processed, result.total);
            } else if (result.total === 0) {
                this.toolbar.setIdle('Alles geprüft');
            } else {
                this.toolbar.setFinished(result.total, result.failed);
            }
        }
    }

    // Sicherstellen, dass jQuery vorhanden ist (wird mitgeliefert)
    if (typeof $ === 'undefined') {
        console.error('[kn-fotoadmin] jQuery wurde nicht geladen.');
        return;
    }

    // Erst gespeicherte Einstellungen laden, dann starten
    (async () => {
        await Settings.load();
        const app = new PhotoAdministrationApp();
        app.init();
    })();
})();
