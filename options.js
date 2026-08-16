(() => {
    const STORAGE_KEYS = {
        parsedDictionary: "parsedDictionary",
        inputDisplayOverrides: "inputDisplayOverrides",
        exportWordPreferences: "exportWordPreferences",
        exportFilterSettings: "exportFilterSettings",
        settings: "settings",
        optionsSyncIntent: "optionsSyncIntent",
        deviceState: "deviceState"
    };

    const PAGE_SIZE = 25;
    const SERIAL_BAUD_RATE = 115200;
    const SERIAL_COUNT_TIMEOUT_MS = 4000;
    const SERIAL_ENTRY_TIMEOUT_MS = 2000;
    const DEFAULT_EXPORT_FILTER_SETTINGS = CCHShared.defaultExportFilterSettings();

    let currentPage = 1;
    let currentRawDictionary = null;
    let currentDeviceState = null;
    let inputDisplayOverrides = {};
    let currentSort = {key: "output", direction: "asc"};
    let expandedEditorRows = new Set();
    let draftInputEdits = {};
    let hideBlankOutputs = true;
    let hideNonAlphanumericOutputs = true;
    let inputSearchQuery = "";
    let outputSearchQuery = "";
    let exportWordPreferences = {};
    let minimumExportLength = 2;
    let exportNonAlphanumericMode = "ignore-only";
    let exportRespectExportable = true;
    let draftSettings = hydrateSettings(CCHShared.defaultSettings());
    let recordingHotkeyTarget = null;
    let saveButtonsResetTimer = null;
    const systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const HOTKEY_BINDINGS = [
        ["toggleHintsHotkey", "recordToggleHintsHotkeyButton"],
        ["toggleHintDisplayHotkey", "recordToggleHintDisplayHotkeyButton"]
    ];

    applyOptionsTheme("system");

    const els = {
        jsonFile: document.getElementById("jsonFile"),
        optionsThemeToggle: document.getElementById("optionsThemeToggle"),
        optionsUseSystemTheme: document.getElementById("optionsUseSystemTheme"),
        importButton: document.getElementById("importButton"),
        syncDeviceButton: document.getElementById("syncDeviceButton"),
        clearButton: document.getElementById("clearButton"),
        importStatus: document.getElementById("importStatus"),

        enabled: document.getElementById("enabled"),
        enableSubstringHints: document.getElementById("enableSubstringHints"),
        showChordableWordOutlines: document.getElementById("showChordableWordOutlines"),
        minimumWordLength: document.getElementById("minimumWordLength"),
        hintCharacterOrderMode: document.getElementById("hintCharacterOrderMode"),
        debugLogging: document.getElementById("debugLogging"),
        showExtendedSpecialDescriptions: document.getElementById("showExtendedSpecialDescriptions"),
        keybrHintLayout: document.getElementById("keybrHintLayout"),

        hintBoxDarkModeColor: document.getElementById("hintBoxDarkModeColor"),
        hintBoxDarkModeOpacity: document.getElementById("hintBoxDarkModeOpacity"),
        hintTextDarkModeColor: document.getElementById("hintTextDarkModeColor"),
        hintBoxLightModeColor: document.getElementById("hintBoxLightModeColor"),
        hintBoxLightModeOpacity: document.getElementById("hintBoxLightModeOpacity"),
        hintTextLightModeColor: document.getElementById("hintTextLightModeColor"),
        hintTextFontSizeValue: document.getElementById("hintTextFontSizeValue"),
        hintTextFontSizeUnit: document.getElementById("hintTextFontSizeUnit"),
        hintPosition: document.getElementById("hintPosition"),
        hintDisplay: document.getElementById("hintDisplay"),

        hintPreviewDark: document.getElementById("hintPreviewDark"),
        hintPreviewLight: document.getElementById("hintPreviewLight"),
        hintPreviewWordDark: document.getElementById("hintPreviewWordDark"),
        hintPreviewWordLight: document.getElementById("hintPreviewWordLight"),

        recordToggleHintsHotkeyButton: document.getElementById("recordToggleHintsHotkeyButton"),
        recordToggleHintDisplayHotkeyButton: document.getElementById("recordToggleHintDisplayHotkeyButton"),

        saveSettingsButton: document.getElementById("saveSettingsButton"),
        saveSettingsButtonSecondary: document.getElementById("saveSettingsButtonSecondary"),
        returnToDefaultsButton: document.getElementById("returnToDefaultsButton"),
        returnToDefaultsButtonSecondary: document.getElementById("returnToDefaultsButtonSecondary"),
        settingsStatus: document.getElementById("settingsStatus"),

        metaSource: document.getElementById("metaSource"),
        metaVersion: document.getElementById("metaVersion"),
        metaCount: document.getElementById("metaCount"),
        metaDeviceCount: document.getElementById("metaDeviceCount"),
        metaSavedAt: document.getElementById("metaSavedAt"),

        loadedChordsEmpty: document.getElementById("loadedChordsEmpty"),
        loadedChordsPanel: document.getElementById("loadedChordsPanel"),
        loadedChordsTableBody: document.getElementById("loadedChordsTableBody"),
        saveInputOverrideButton: document.getElementById("saveInputOverrideButton"),
        revertInputOverrideButton: document.getElementById("revertInputOverrideButton"),
        hideBlankOutputsToggle: document.getElementById("hideBlankOutputsToggle"),
        hideNonAlphanumericOutputsToggle: document.getElementById("hideNonAlphanumericOutputsToggle"),
        inputSearchBox: document.getElementById("inputSearchBox"),
        outputSearchBox: document.getElementById("outputSearchBox"),
        editingStatus: document.getElementById("editingStatus"),
        sortInputButton: document.getElementById("sortInputButton"),
        sortOutputButton: document.getElementById("sortOutputButton"),
        toggleAllExportable: document.getElementById("toggleAllExportable"),
        prevPageButton: document.getElementById("prevPageButton"),
        nextPageButton: document.getElementById("nextPageButton"),
        pageJumpInput: document.getElementById("pageJumpInput"),
        pageJumpButton: document.getElementById("pageJumpButton"),
        pageStatus: document.getElementById("pageStatus"),

        minimumExportLength: document.getElementById("minimumExportLength"),
        exportNonAlphanumericMode: document.getElementById("exportNonAlphanumericMode"),
        exportRespectExportable: document.getElementById("exportRespectExportable"),
        exportWordsOutput: document.getElementById("exportWordsOutput"),
        copyExportWordsButton: document.getElementById("copyExportWordsButton"),
        exportTextFileButton: document.getElementById("exportTextFileButton"),
        exportCsvButton: document.getElementById("exportCsvButton")
    };

    const SERIAL_OUTPUT_ACTION_LABELS = {
        256: "inhibit_concatenator",

        296: "enter",
        297: "escape",
        298: "backspace",
        299: "tab",

        313: "caps_lock",

        314: "f1",
        315: "f2",
        316: "f3",
        317: "f4",
        318: "f5",
        319: "f6",
        320: "f7",
        321: "f8",
        322: "f9",
        323: "f10",
        324: "f11",
        325: "f12",

        330: "home",
        331: "page_up",
        333: "end",
        334: "page_down",
        335: "kbright",
        336: "kbleft",
        337: "kbdown",
        338: "kbup",

        360: "f13",
        361: "f14",
        362: "f15",
        363: "f16",
        364: "f17",
        365: "f18",
        366: "f19",
        367: "f20",
        368: "f21",
        369: "f22",
        370: "f23",
        371: "f24",

        512: "left_ctrl",
        513: "left_shift",
        514: "left_alt",
        515: "left_gui",
        516: "right_ctrl",
        517: "right_shift",
        518: "right_alt",
        519: "right_gui",

        523: "press_next",
        524: "release_next",

        531: "vim",
        532: "gtm",
        533: "dup_right",
        534: "impulse",
        535: "dup_all",
        536: "dup_left",
        538: "spur",

        540: "ambileft_left",
        542: "ambiright_right",

        545: "hyperspace",
        547: "hyperspace_capture",

        548: "layer1_left",
        549: "layer1_right",
        550: "layer2_left",
        551: "layer2_right",
        552: "layer3_left",
        553: "layer3_right",
        554: "layer4_left",
        555: "layer4_right",

        558: "hold_compound",
        559: "release_compound",

        560: "mouse_backward_click",
        561: "mouse_forward_click",
        562: "mouse_left_click",
        563: "mouse_right_click",
        564: "mouse_middle_click",
        565: "mouse_moveright",
        566: "mouse_moveleft",
        567: "mouse_movedown",
        568: "mouse_moveup",
        569: "mouse_scrollright",
        570: "mouse_scrollleft",
        571: "mouse_scrolldown",
        572: "mouse_scrollup",

        573: "capitalize",
        574: "join",
        575: "quickfix",
        576: "active_quickfix",
        577: "delay_100",
        578: "delay_10",
        579: "delay_1",

        589: "spin_pan_north",
        590: "spin_pan_east",
        591: "spin_pan_south",
        592: "spin_pan_west",
        593: "spin_scroll_north",
        594: "spin_scroll_east",
        595: "spin_scroll_south",
        596: "spin_scroll_west",

        597: "delay_500",
        598: "delay_1000",

        650: "profile_a",
        651: "profile_b",
        652: "profile_c",

        1001: "arpeggiate",
        1002: "tapdance"
    };


    function getStorage(keys) {
        return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
    }

    function setStorage(values) {
        return new Promise((resolve) => chrome.storage.local.set(values, resolve));
    }

    function removeStorage(keys) {
        return new Promise((resolve) => chrome.storage.local.remove(keys, resolve));
    }

    function sleep(ms) {
        return new Promise((resolve) => window.setTimeout(resolve, ms));
    }

    function setBusy(isBusy) {
        els.importButton.disabled = isBusy;
        els.syncDeviceButton.disabled = isBusy;
        els.clearButton.disabled = isBusy;
        els.saveSettingsButton.disabled = isBusy;
        if (els.saveSettingsButtonSecondary) els.saveSettingsButtonSecondary.disabled = isBusy;
        if (els.returnToDefaultsButton) els.returnToDefaultsButton.disabled = isBusy;
        if (els.returnToDefaultsButtonSecondary) els.returnToDefaultsButtonSecondary.disabled = isBusy;
        if (els.saveInputOverrideButton) els.saveInputOverrideButton.disabled = isBusy || els.saveInputOverrideButton.disabled;
        if (els.revertInputOverrideButton) els.revertInputOverrideButton.disabled = isBusy || els.revertInputOverrideButton.disabled;
        if (els.pageJumpButton) els.pageJumpButton.disabled = isBusy;
        if (els.pageJumpInput) els.pageJumpInput.disabled = isBusy;
    }

    function setStatus(target, text, isError = false) {
        target.textContent = text;
        target.style.color = isError ? "var(--cch-status-error, #ef4444)" : "var(--cch-status)";
    }

    function clampNumber(value, min, max, fallback) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return fallback;
        return Math.max(min, Math.min(max, parsed));
    }

    function formatDate(value) {
        if (!value) return "—";
        return new Date(value).toLocaleString();
    }

    function hydrateSettings(rawSettings) {
        const defaults = CCHShared.defaultSettings();
        const settings = {
            ...defaults,
            themeMode: "system",
            ...(rawSettings || {})
        };

        settings.specialTokenDescriptions = {
            ...CCHShared.defaultSpecialTokenDescriptions(),
            ...(settings.specialTokenDescriptions || {})
        };

        settings.enableSubstringHints = Boolean(settings.enableSubstringHints);
        settings.minimumWordLength = CCHShared.normalizeMinimumWordLength
            ? CCHShared.normalizeMinimumWordLength(settings.minimumWordLength)
            : Math.max(1, Math.floor(Number(settings.minimumWordLength)) || 3);
        settings.hintCharacterOrderMode = CCHShared.normalizeHintCharacterOrderMode
            ? CCHShared.normalizeHintCharacterOrderMode(settings.hintCharacterOrderMode)
            : (settings.hintCharacterOrderMode === "charachorder-default"
                ? "charachorder-default"
                : "best-match");

        if (!["system", "light", "dark"].includes(settings.themeMode)) {
            settings.themeMode = "system";
        }

        const rawHintTextSizeValue = settings.hint_text_font_size_value ?? settings.hint_text_font_size_em;
        settings.hint_text_font_size_value = clampNumber(rawHintTextSizeValue, 0.1, 64, 0.9);
        settings.hint_text_font_size_unit = ["em", "px"].includes(settings.hint_text_font_size_unit)
            ? settings.hint_text_font_size_unit
            : "em";
        settings.hint_text_font_size_em = settings.hint_text_font_size_unit === "em"
            ? settings.hint_text_font_size_value
            : settings.hint_text_font_size_em;
        settings.hint_position = ["left", "center"].includes(settings.hint_position)
            ? settings.hint_position
            : "left";
        settings.hint_display = ["always", "hover"].includes(settings.hint_display)
            ? settings.hint_display
            : settings.chordable_word_display === "highlight-only"
                ? "hover"
                : "always";
        settings.keybr_hint_layout = ["consistent", "extra-spacing"].includes(settings.keybr_hint_layout)
            ? settings.keybr_hint_layout
            : "extra-spacing";
        settings.toggleHintsHotkey = CCHShared.mergeHotkey
            ? CCHShared.mergeHotkey(settings.toggleHintsHotkey, defaults.toggleHintsHotkey)
            : (settings.toggleHintsHotkey || defaults.toggleHintsHotkey);
        settings.toggleHintDisplayHotkey = CCHShared.mergeHotkey
            ? CCHShared.mergeHotkey(settings.toggleHintDisplayHotkey, defaults.toggleHintDisplayHotkey)
            : (settings.toggleHintDisplayHotkey || defaults.toggleHintDisplayHotkey);
        delete settings.chordable_word_display;

        return settings;
    }

    function hydrateDictionary(rawDictionary) {
        return CCHShared.hydrateParsedDictionary(rawDictionary);
    }

    function hexToRgba(hex, opacity) {
        const safeHex = String(hex || "").trim();
        const safeOpacity = clampNumber(opacity, 0, 1, 1);

        if (!/^#[0-9a-fA-F]{6}$/.test(safeHex)) {
            return `rgba(0, 0, 0, ${safeOpacity})`;
        }

        const r = parseInt(safeHex.slice(1, 3), 16);
        const g = parseInt(safeHex.slice(3, 5), 16);
        const b = parseInt(safeHex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${safeOpacity})`;
    }

    function previewHintTextForWord(word, mode) {
        const safeWord = String(word || "").toLocaleLowerCase();
        if (mode === "best-match") {
            return safeWord;
        }
        return Array.from(safeWord)
            .sort((left, right) => left.localeCompare(right))
            .join("");
    }

    function syncHintTextSizeFieldBehavior() {
        const unit = els.hintTextFontSizeUnit.value === "px" ? "px" : "em";
        const max = unit === "px" ? 64 : 4;
        const min = unit === "px" ? 1 : 0.1;
        const step = unit === "px" ? 1 : 0.1;
        const currentValue = clampNumber(
            els.hintTextFontSizeValue.value,
            min,
            max,
            unit === "px" ? 14 : 0.5
        );

        els.hintTextFontSizeValue.min = String(min);
        els.hintTextFontSizeValue.max = String(max);
        els.hintTextFontSizeValue.step = String(step);
        els.hintTextFontSizeValue.value = unit === "px"
            ? String(Math.round(currentValue))
            : String(Math.round(currentValue * 10) / 10);
    }

    function getAppearancePreviewEmBasePx() {
        const previewAnchor = els.hintPreviewWordLight || els.hintPreviewWordDark;
        const previewFontSize = Number.parseFloat(window.getComputedStyle(previewAnchor).fontSize);
        return Number.isFinite(previewFontSize) && previewFontSize > 0 ? previewFontSize : 16;
    }

    function convertHintTextSizeValueForUnitChange(previousUnit, nextUnit) {
        if (previousUnit === nextUnit) {
            return;
        }

        const currentValue = Number(els.hintTextFontSizeValue.value);
        if (!Number.isFinite(currentValue)) {
            return;
        }

        const previewEmBasePx = getAppearancePreviewEmBasePx();
        const convertedValue = previousUnit === "px"
            ? currentValue / previewEmBasePx
            : currentValue * previewEmBasePx;

        els.hintTextFontSizeValue.value = String(convertedValue);
    }

    function refreshMeta(parsedDictionary) {
        els.metaSource.textContent = parsedDictionary?.source ?? "—";
        els.metaVersion.textContent = parsedDictionary?.charaVersion ?? "—";
        els.metaCount.textContent = parsedDictionary?.entryCount ?? "—";
        els.metaDeviceCount.textContent = parsedDictionary?.deviceEntryCount ?? "—";
        els.metaSavedAt.textContent = parsedDictionary?.savedAt ? formatDate(parsedDictionary.savedAt) : "—";
    }

    function applyCurrentDictionary() {
        currentDictionary = CCHShared.applyInputDisplayOverrides(currentRawDictionary, inputDisplayOverrides);
    }

    function entryByIndex(dictionary, entryIndex) {
        return dictionary?.entries?.find((entry) => entry.index === entryIndex) ?? null;
    }

    function isLeftVariant(tokenKey) {
        return tokenKey.startsWith("left_") || tokenKey.endsWith("_left");
    }

    function isRightVariant(tokenKey) {
        return tokenKey.startsWith("right_") || tokenKey.endsWith("_right");
    }

    function specialTooltip(token, settings) {
        const description = settings.specialTokenDescriptions?.[token.key] || "";
        if (settings.showExtendedSpecialDescriptions && description.trim()) {
            return `${token.label} — ${description.trim()}`;
        }
        return token.label;
    }

    function renderToken(token, settings) {
        if (token.type === "char") {
            const span = document.createElement("span");
            span.className = "tokenChar";
            span.textContent = token.char;
            return span;
        }

        if (token.type === "special") {
            const tooltip = specialTooltip(token, settings);
            const span = document.createElement("span");
            span.className = `tokenSpecial cch-token-${token.key}`;
            span.title = tooltip;
            span.setAttribute("aria-label", tooltip);
            span.style.setProperty(
                "--cch-icon-url",
                `url("${chrome.runtime.getURL(CCHShared.ICON_FILE_MAP[token.key] || "icons/broken_image.svg")}")`
            );

            if (isLeftVariant(token.key)) span.classList.add("cch-token-hand-left");
            if (isRightVariant(token.key)) span.classList.add("cch-token-hand-right");

            const main = document.createElement("span");
            main.className = "tokenIcon tokenIconMain";
            span.appendChild(main);

            if (isLeftVariant(token.key) || isRightVariant(token.key)) {
                const ghost = document.createElement("span");
                ghost.className = "tokenIcon tokenIconGhost";
                ghost.setAttribute("aria-hidden", "true");
                span.appendChild(ghost);
            }

            return span;
        }

        const span = document.createElement("span");
        span.className = "tokenUnknown";
        span.textContent = `(${token.label})`;
        span.title = token.label;
        return span;
    }

    function renderSegmentSeparator(settings) {
        const separator = renderToken(
            CCHShared.makePseudoSpecialToken("compound_marker", "compound chord separator"),
            settings
        );
        separator.classList.add("tokenSeparator");
        separator.setAttribute("aria-hidden", "true");
        return separator;
    }

    function displayTokensForSegment(segment, entry, settings) {
        const tokens = Array.isArray(segment?.inputTokens) ? segment.inputTokens : [];
        if (settings.hintCharacterOrderMode !== "best-match") {
            return tokens;
        }
        return CCHShared.reorderSegmentTokensForBestMatch(tokens, entry?.outputText || "");
    }

    function renderInputPreview(entry, settings) {
        const wrapper = document.createElement("div");
        wrapper.className = "hintPreview";

        const row = document.createElement("div");
        row.className = "hintPreviewRow";

        const segments = CCHShared.entryInputSegments(entry);
        segments.forEach((segment, segmentIndex) => {
            if (segmentIndex > 0) {
                row.appendChild(renderSegmentSeparator(settings));
            }

            for (const token of displayTokensForSegment(segment, entry, settings)) {
                row.appendChild(renderToken(token, settings));
            }
        });

        wrapper.appendChild(row);
        return wrapper;
    }

    function outputActionLabelForCode(code) {
        return SERIAL_OUTPUT_ACTION_LABELS[code] || "";
    }

    function outputTokenForCode(code) {
        if (code === 32) {
            return CCHShared.makePseudoSpecialToken("spacebar", "spacebar");
        }

        if (code >= 32 && code <= 126) {
            return {type: "char", char: String.fromCharCode(code)};
        }

        const label = outputActionLabelForCode(code);
        if (label) {
            return CCHShared.makePseudoSpecialToken(label, label);
        }

        return CCHShared.makePseudoSpecialToken("broken_image", `Action Code ${code}`);
    }

    function outputPreviewTokens(entry) {
        return (Array.isArray(entry?.outputCodes) ? entry.outputCodes : [])
            .map((code) => outputTokenForCode(code))
            .filter(Boolean);
    }

    function entryHasRenderableOutput(entry) {
        return outputPreviewTokens(entry).length > 0;
    }

    function visibleOutputCharacters(entry) {
        const tokens = outputPreviewTokens(entry);
        if (tokens.length) {
            return tokens
                .map((token) => {
                    if (token?.type === "char") return token.char;
                    if (token?.type === "special" && token.key === "spacebar") return " ";
                    if (token?.type === "special" && token.key === "hyperspace") return " ";
                    return "";
                })
                .join("");
        }

        return String(entry?.outputText || "");
    }

    function entryHasCharacterOutput(entry) {
        return visibleOutputCharacters(entry).length > 0;
    }

    function currentExportFilterSettings() {
        return {
            minimumExportLength,
            exportNonAlphanumericMode,
            exportRespectExportable
        };
    }

    function applyExportFilterSettings(settings) {
        const hydratedSettings = CCHShared.hydrateExportFilterSettings(settings);
        minimumExportLength = hydratedSettings.minimumExportLength;
        exportNonAlphanumericMode = hydratedSettings.exportNonAlphanumericMode;
        exportRespectExportable = hydratedSettings.exportRespectExportable;

        els.minimumExportLength.value = String(minimumExportLength);
        els.exportNonAlphanumericMode.value = exportNonAlphanumericMode;
        els.exportRespectExportable.checked = exportRespectExportable;
    }

    async function saveExportFilterSettings() {
        await setStorage({[STORAGE_KEYS.exportFilterSettings]: currentExportFilterSettings()});
    }

    function saveExportFilterSettingsQuietly() {
        void saveExportFilterSettings().catch(console.error);
    }

    function updateExportableHeaderCheckbox() {
        const uniqueKeys = Array.from(new Set(
            (currentDictionary?.entries || []).map((entry) => CCHShared.exportPreferenceKeyForEntry(entry))
        ));
        const exportableCount = uniqueKeys.filter((key) => CCHShared.isExportWordEnabled(exportWordPreferences, key)).length;

        els.toggleAllExportable.indeterminate = exportableCount > 0 && exportableCount < uniqueKeys.length;
        els.toggleAllExportable.checked = uniqueKeys.length > 0 && exportableCount === uniqueKeys.length;
        els.toggleAllExportable.disabled = uniqueKeys.length === 0;
    }

    function exportedWordsForCurrentDictionary() {
        return CCHShared.buildExportedWords(currentDictionary, exportWordPreferences, currentExportFilterSettings());
    }

    function renderExportWords() {
        const exportedWords = exportedWordsForCurrentDictionary();
        const hasExportWords = exportedWords.length > 0;
        els.exportWordsOutput.value = CCHShared.buildExportWordsText(exportedWords);
        els.copyExportWordsButton.disabled = !hasExportWords;
        els.exportTextFileButton.disabled = !hasExportWords;
        els.exportCsvButton.disabled = !hasExportWords;
    }

    function renderExportSection() {
        updateExportableHeaderCheckbox();
        renderExportWords();
    }

    function downloadBlob(filename, content, mimeType) {
        const blob = new Blob([content], {type: mimeType});
        const blobUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = blobUrl;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(blobUrl);
    }

    function exportWordsToTextFile() {
        downloadBlob(
            "chordable-words.txt",
            CCHShared.buildExportWordsText(exportedWordsForCurrentDictionary()),
            "text/plain;charset=utf-8"
        );
        setStatus(els.importStatus, "Exported chordable words to text file.");
    }

    function exportWordsToCsvFile() {
        const csvContent = CCHShared.buildExportWordsCsv(exportedWordsForCurrentDictionary());
        downloadBlob("chordable-words.csv", csvContent, "text/csv;charset=utf-8");
        setStatus(els.importStatus, "Exported chordable words to CSV.");
    }

    async function copyExportWordsToClipboard() {
        const text = els.exportWordsOutput.value || "";

        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
            } else {
                els.exportWordsOutput.focus();
                els.exportWordsOutput.select();
                document.execCommand("copy");
                els.exportWordsOutput.setSelectionRange(0, 0);
            }
            setStatus(els.importStatus, "Copied export words to clipboard.");
        } catch (error) {
            console.error(error);
            setStatus(els.importStatus, "Failed to copy export words.", true);
        }
    }

    function renderOutputPreview(entry, settings) {
        const wrapper = document.createElement("div");
        wrapper.className = "hintPreview";

        const row = document.createElement("div");
        row.className = "hintPreviewRow";

        const tokens = outputPreviewTokens(entry);
        if (hideNonAlphanumericOutputs) {
            const textNode = document.createElement("code");
            textNode.textContent = visibleOutputCharacters(entry);
            row.appendChild(textNode);
            wrapper.appendChild(row);
            return wrapper;
        }

        if (!tokens.length) {
            const fallbackText = String(entry.outputText || "");
            if (fallbackText) {
                const textNode = document.createElement("code");
                textNode.textContent = fallbackText;
                row.appendChild(textNode);
            }
        } else {
            tokens.forEach((token) => {
                row.appendChild(renderToken(token, settings));
            });
        }

        wrapper.appendChild(row);
        return wrapper;
    }

    function sortValueForEntry(entry, sortKey) {
        switch (sortKey) {
            case "input":
                return CCHShared.entryInputSortText(entry).toLowerCase();
            case "output":
                return String(entry.outputText || "").toLowerCase();
            case "index":
            default:
                return Number(entry.index) || 0;
        }
    }

    function compareEntriesForPreview(a, b) {
        const aValue = sortValueForEntry(a, currentSort.key);
        const bValue = sortValueForEntry(b, currentSort.key);

        if (aValue < bValue) {
            return currentSort.direction === "asc" ? -1 : 1;
        }
        if (aValue > bValue) {
            return currentSort.direction === "asc" ? 1 : -1;
        }
        return (a.index ?? 0) - (b.index ?? 0);
    }

    function setSort(sortKey) {
        if (currentSort.key === sortKey) {
            currentSort.direction = currentSort.direction === "asc" ? "desc" : "asc";
        } else {
            currentSort = {key: sortKey, direction: "asc"};
        }
        currentPage = 1;
        renderLoadedChords(currentSettingsFromForm());
    }

    function updateSortButtonLabels() {
        const labels = {
            input: "Input",
            output: "Visible output"
        };

        [
            [els.sortInputButton, "input"],
            [els.sortOutputButton, "output"]
        ].forEach(([button, key]) => {
            if (!button) return;
            const isActive = currentSort.key === key;
            const arrow = !isActive ? "" : (currentSort.direction === "asc" ? " ↑" : " ↓");
            button.textContent = `${labels[key]}${arrow}`;
            button.setAttribute("aria-pressed", isActive ? "true" : "false");
        });
    }

    function effectiveEntrySegments(entryIndex) {
        const effectiveEntry = entryByIndex(currentDictionary, entryIndex);
        return effectiveEntry ? CCHShared.entryEditableInputSegments(effectiveEntry).map((value) => String(value ?? "")) : [];
    }

    function baseEntrySegments(entryIndex) {
        const baseEntry = entryByIndex(currentRawDictionary, entryIndex);
        return baseEntry ? CCHShared.entryEditableInputSegments(baseEntry).map((value) => String(value ?? "")) : [];
    }

    function hasSavedOverrideForEntry(entryIndex) {
        return Array.isArray(inputDisplayOverrides[String(entryIndex)]);
    }

    function hasDraftForEntry(entryIndex) {
        return Array.isArray(draftInputEdits[String(entryIndex)]);
    }

    function currentDraftSegments(entryIndex) {
        if (hasDraftForEntry(entryIndex)) {
            return draftInputEdits[String(entryIndex)].map((value) => String(value ?? ""));
        }
        return effectiveEntrySegments(entryIndex);
    }

    function draftIsDirty(entryIndex) {
        if (!hasDraftForEntry(entryIndex)) return false;
        const draft = currentDraftSegments(entryIndex);
        const effective = effectiveEntrySegments(entryIndex);
        if (draft.length !== effective.length) return true;
        return draft.some((value, index) => value !== String(effective[index] ?? ""));
    }

    function dirtyDraftEntryIndices() {
        return Object.keys(draftInputEdits)
            .map((value) => Number(value))
            .filter((entryIndex) => Number.isFinite(entryIndex) && draftIsDirty(entryIndex));
    }

    function isRowExpanded(entryIndex) {
        return expandedEditorRows.has(entryIndex) || hasDraftForEntry(entryIndex);
    }

    function startEditingEntry(entryIndex) {
        const effectiveEntry = entryByIndex(currentDictionary, entryIndex);
        if (!effectiveEntry) return;

        expandedEditorRows.add(entryIndex);
        if (!hasDraftForEntry(entryIndex)) {
            draftInputEdits[String(entryIndex)] = CCHShared.entryEditableInputSegments(effectiveEntry).map((value) => String(value ?? ""));
        }
        renderLoadedChords(currentSettingsFromForm());
    }

    function collapseEditingEntry(entryIndex) {
        expandedEditorRows.delete(entryIndex);
        if (hasDraftForEntry(entryIndex) && !draftIsDirty(entryIndex)) {
            delete draftInputEdits[String(entryIndex)];
        }
        renderLoadedChords(currentSettingsFromForm());
    }

    function updateEditingSegment(entryIndex, segmentIndex, value) {
        if (!hasDraftForEntry(entryIndex)) {
            draftInputEdits[String(entryIndex)] = effectiveEntrySegments(entryIndex);
        }
        draftInputEdits[String(entryIndex)][segmentIndex] = value;
        updateEditingControls();
    }

    function updateEditingControls() {
        const dirtyIndices = dirtyDraftEntryIndices();
        const dirtyCount = dirtyIndices.length;
        const expandedCount = expandedEditorRows.size;

        els.saveInputOverrideButton.disabled = dirtyCount === 0;
        els.revertInputOverrideButton.disabled = dirtyCount === 0;

        if (!expandedCount && !dirtyCount) {
            els.editingStatus.textContent = "Click any input to edit multiple rows before saving.";
            return;
        }

        const expandedText = expandedCount ? `${expandedCount} row${expandedCount === 1 ? "" : "s"} open` : "";
        const dirtyText = dirtyCount ? `${dirtyCount} unsaved edit${dirtyCount === 1 ? "" : "s"}` : "no unsaved edits";
        els.editingStatus.textContent = [expandedText, dirtyText].filter(Boolean).join(" · ");
    }

    function sortedEntriesForPreview(entries = currentDictionary?.entries || []) {
        return entries.slice().sort(compareEntriesForPreview);
    }

    function normalizeSearchText(value) {
        return String(value || "").toLowerCase();
    }

    function normalizeInputSearchCharacters(value) {
        return normalizeSearchText(value).replace(/\s+/g, "");
    }

    function matchesInputSearch(entry) {
        const query = normalizeInputSearchCharacters(inputSearchQuery);
        if (!query) return true;

        const haystack = normalizeInputSearchCharacters(CCHShared.entryInputSortText(entry));
        const counts = new Map();
        for (const char of haystack) {
            counts.set(char, (counts.get(char) || 0) + 1);
        }
        for (const char of query) {
            const remaining = counts.get(char) || 0;
            if (remaining <= 0) {
                return false;
            }
            counts.set(char, remaining - 1);
        }
        return true;
    }

    function matchesOutputSearch(entry) {
        const query = normalizeSearchText(outputSearchQuery);
        if (!query) return true;
        return normalizeSearchText(entry.outputText || "").includes(query);
    }

    function filteredEntriesForPreview() {
        const entries = currentDictionary?.entries || [];
        return entries.filter((entry) => {
            if (hideBlankOutputs && !entryHasRenderableOutput(entry)) {
                return false;
            }
            if (hideNonAlphanumericOutputs && !entryHasCharacterOutput(entry)) {
                return false;
            }
            if (!matchesInputSearch(entry)) {
                return false;
            }
            if (!matchesOutputSearch(entry)) {
                return false;
            }
            return true;
        });
    }

    function goToPage(pageNumber) {
        const entries = filteredEntriesForPreview();
        const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
        currentPage = Math.min(Math.max(1, pageNumber), totalPages);
        renderLoadedChords(currentSettingsFromForm());
    }

    function renderEditableInput(entry, settings) {
        const wrapper = document.createElement("div");
        wrapper.className = "editableInputSegments";

        const segmentTexts = currentDraftSegments(entry.index);

        segmentTexts.forEach((segmentText, segmentIndex) => {
            if (segmentIndex > 0) {
                wrapper.appendChild(renderSegmentSeparator(settings));
            }

            const input = document.createElement("input");
            input.type = "text";
            input.className = "segmentEditInput";
            input.value = segmentText || "";
            input.placeholder = segmentIndex === 0 && entry.flags.hasUnknownCompoundSegment ? "unknown segment" : "segment";
            input.addEventListener("input", (event) => {
                updateEditingSegment(entry.index, segmentIndex, event.target.value);
            });
            wrapper.appendChild(input);
        });

        const actions = document.createElement("div");
        actions.className = "rowEditActions";

        const closeButton = document.createElement("button");
        closeButton.type = "button";
        closeButton.className = "miniButton";
        closeButton.textContent = "Close";
        closeButton.addEventListener("click", () => collapseEditingEntry(entry.index));
        actions.appendChild(closeButton);

        const resetButton = document.createElement("button");
        resetButton.type = "button";
        resetButton.className = "miniButton secondary";
        resetButton.textContent = "Reset row";
        resetButton.disabled = !hasSavedOverrideForEntry(entry.index) && !draftIsDirty(entry.index);
        resetButton.addEventListener("click", () => {
            resetSingleRow(entry.index);
        });
        actions.appendChild(resetButton);

        wrapper.appendChild(actions);
        return wrapper;
    }

    function setExportWordEnabled(exportKey, enabled) {
        exportWordPreferences = {
            ...exportWordPreferences,
            [String(exportKey ?? "")]: Boolean(enabled)
        };
        renderLoadedChords(currentSettingsFromForm());
        renderExportSection();
        void setStorage({[STORAGE_KEYS.exportWordPreferences]: exportWordPreferences}).catch(console.error);
    }

    function setAllEntriesExportable(exportable) {
        const uniqueKeys = Array.from(new Set(
            (currentDictionary?.entries || []).map((entry) => CCHShared.exportPreferenceKeyForEntry(entry))
        ));
        if (!uniqueKeys.length) {
            return;
        }

        const nextValue = Boolean(exportable);
        const nextPreferences = {...exportWordPreferences};
        uniqueKeys.forEach((key) => {
            nextPreferences[String(key ?? "")] = nextValue;
        });

        exportWordPreferences = nextPreferences;
        renderLoadedChords(currentSettingsFromForm());
        renderExportSection();
        void setStorage({[STORAGE_KEYS.exportWordPreferences]: exportWordPreferences}).catch(console.error);
    }

    function renderLoadedChords(settings) {
        const entries = currentDictionary?.entries || [];

        updateSortButtonLabels();
        updateEditingControls();

        if (!entries.length) {
            els.loadedChordsEmpty.hidden = false;
            els.loadedChordsPanel.hidden = true;
            els.loadedChordsTableBody.innerHTML = "";
            els.pageStatus.textContent = "";
            els.pageJumpInput.value = "1";
            return;
        }

        els.loadedChordsEmpty.hidden = true;
        els.loadedChordsPanel.hidden = false;

        const filteredEntries = filteredEntriesForPreview();
        const sortedEntries = sortedEntriesForPreview(filteredEntries);
        const totalPages = Math.max(1, Math.ceil(sortedEntries.length / PAGE_SIZE));
        currentPage = Math.min(Math.max(1, currentPage), totalPages);

        const start = (currentPage - 1) * PAGE_SIZE;
        const pageEntries = sortedEntries.slice(start, start + PAGE_SIZE);

        els.loadedChordsTableBody.innerHTML = "";

        if (!pageEntries.length) {
            const tr = document.createElement("tr");
            const td = document.createElement("td");
            td.colSpan = 3;
            td.className = "muted";
            td.textContent = "No rows match the current filters.";
            tr.appendChild(td);
            els.loadedChordsTableBody.appendChild(tr);
        }

        for (const entry of pageEntries) {
            const tr = document.createElement("tr");
            if (isRowExpanded(entry.index)) {
                tr.classList.add("editingRow");
            }
            if (draftIsDirty(entry.index)) {
                tr.classList.add("dirtyRow");
            }

            const tdInput = document.createElement("td");
            tdInput.className = "inputCell";

            if (isRowExpanded(entry.index)) {
                tdInput.appendChild(renderEditableInput(entry, settings));
            } else {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "inputPreviewButton";
                button.appendChild(renderInputPreview(entry, settings));
                button.addEventListener("click", () => startEditingEntry(entry.index));
                tdInput.appendChild(button);
            }
            tr.appendChild(tdInput);

            const tdOutput = document.createElement("td");
            tdOutput.appendChild(renderOutputPreview(entry, settings));
            tr.appendChild(tdOutput);

            const tdExportable = document.createElement("td");
            tdExportable.className = "exportableCell";
            const exportableToggle = document.createElement("input");
            exportableToggle.type = "checkbox";
            exportableToggle.checked = CCHShared.isEntryExportable(entry, exportWordPreferences);
            exportableToggle.setAttribute(
                "aria-label",
                `Toggle exportable for ${CCHShared.exportPreferenceKeyForEntry(entry) || entry.outputText || "entry"}`
            );
            exportableToggle.addEventListener("change", () => {
                setExportWordEnabled(CCHShared.exportPreferenceKeyForEntry(entry), exportableToggle.checked);
            });
            tdExportable.appendChild(exportableToggle);
            tr.appendChild(tdExportable);

            els.loadedChordsTableBody.appendChild(tr);
        }

        const baseCount = currentDictionary?.entries?.length || 0;
        els.pageStatus.textContent = `Page ${currentPage} of ${totalPages} · ${sortedEntries.length} shown${sortedEntries.length === baseCount ? "" : ` of ${baseCount}`}`;
        els.pageJumpInput.value = String(currentPage);
        els.prevPageButton.disabled = currentPage <= 1;
        els.nextPageButton.disabled = currentPage >= totalPages;
    }

    function currentSettingsFromForm() {
        const defaults = CCHShared.defaultSettings();

        return hydrateSettings({
            ...draftSettings,
            themeMode: themeModeFromControls(),
            enabled: els.enabled.checked,
            enableSubstringHints: els.enableSubstringHints.checked,
            showChordableWordOutlines: els.showChordableWordOutlines.checked,
            minimumWordLength: CCHShared.normalizeMinimumWordLength
                ? CCHShared.normalizeMinimumWordLength(els.minimumWordLength.value)
                : Math.max(1, Math.floor(Number(els.minimumWordLength.value)) || defaults.minimumWordLength),
            hintCharacterOrderMode: CCHShared.normalizeHintCharacterOrderMode
                ? CCHShared.normalizeHintCharacterOrderMode(els.hintCharacterOrderMode.value)
                : (els.hintCharacterOrderMode.value === "charachorder-default"
                    ? "charachorder-default"
                    : "best-match"),
            debugLogging: els.debugLogging.checked,
            showExtendedSpecialDescriptions: els.showExtendedSpecialDescriptions.checked,

            hint_box_dark_mode_color: els.hintBoxDarkModeColor.value || defaults.hint_box_dark_mode_color,
            hint_box_dark_mode_opacity: clampNumber(els.hintBoxDarkModeOpacity.value, 0, 1, defaults.hint_box_dark_mode_opacity),
            hint_text_dark_mode_color: els.hintTextDarkModeColor.value || defaults.hint_text_dark_mode_color,

            hint_box_light_mode_color: els.hintBoxLightModeColor.value || defaults.hint_box_light_mode_color,
            hint_box_light_mode_opacity: clampNumber(els.hintBoxLightModeOpacity.value, 0, 1, defaults.hint_box_light_mode_opacity),
            hint_text_light_mode_color: els.hintTextLightModeColor.value || defaults.hint_text_light_mode_color,

            hint_text_font_size_value: clampNumber(
                els.hintTextFontSizeValue.value,
                0.1,
                els.hintTextFontSizeUnit.value === "px" ? 64 : 4,
                defaults.hint_text_font_size_value ?? defaults.hint_text_font_size_em
            ),
            hint_text_font_size_unit: els.hintTextFontSizeUnit.value === "px" ? "px" : "em",
            hint_text_font_size_em: els.hintTextFontSizeUnit.value === "em"
                ? clampNumber(els.hintTextFontSizeValue.value, 0.1, 4, defaults.hint_text_font_size_em)
                : defaults.hint_text_font_size_em,
            hint_position: els.hintPosition.value === "center" ? "center" : "left",
            hint_display: els.hintDisplay.value === "hover" ? "hover" : "always",
            keybr_hint_layout: ["consistent", "extra-spacing"].includes(els.keybrHintLayout.value)
                ? els.keybrHintLayout.value
                : "extra-spacing",
            toggleHintsHotkey: draftSettings.toggleHintsHotkey,
            toggleHintDisplayHotkey: draftSettings.toggleHintDisplayHotkey
        });
    }

    
    function resolveTheme(themeMode) {
        if (themeMode === "dark") return "dark";
        if (themeMode === "light") return "light";
        return systemThemeQuery.matches ? "dark" : "light";
    }

    function themeModeFromControls() {
        if (els.optionsUseSystemTheme.checked) {
            return "system";
        }
        return els.optionsThemeToggle.checked ? "dark" : "light";
    }

    function syncThemeControls(themeMode) {
        const preference = themeMode || "system";
        const resolvedTheme = resolveTheme(preference);

        els.optionsUseSystemTheme.checked = preference === "system";
        els.optionsThemeToggle.checked = resolvedTheme === "dark";
        els.optionsThemeToggle.disabled = preference === "system";
    }

    function applyOptionsTheme(themeMode) {
        const preference = themeMode || "system";
        const resolvedTheme = resolveTheme(preference);

        document.documentElement.setAttribute("data-theme", resolvedTheme);
        document.documentElement.setAttribute("data-theme-preference", preference);
    }

    function applySettingsToForm(settings) {
        draftSettings = hydrateSettings(settings);
        syncThemeControls(settings.themeMode || "system");
        applyOptionsTheme(settings.themeMode || "system");
        els.enabled.checked = settings.enabled;
        els.enableSubstringHints.checked = settings.enableSubstringHints;
        els.showChordableWordOutlines.checked = settings.showChordableWordOutlines;
        els.minimumWordLength.value = settings.minimumWordLength;
        els.hintCharacterOrderMode.value = settings.hintCharacterOrderMode;
        els.debugLogging.checked = settings.debugLogging;
        els.showExtendedSpecialDescriptions.checked = settings.showExtendedSpecialDescriptions;

        els.hintBoxDarkModeColor.value = settings.hint_box_dark_mode_color || "#949ec5";
        els.hintBoxDarkModeOpacity.value = settings.hint_box_dark_mode_opacity ?? 0.92;
        els.hintTextDarkModeColor.value = settings.hint_text_dark_mode_color || "#15161e";

        els.hintBoxLightModeColor.value = settings.hint_box_light_mode_color || "#343b58";
        els.hintBoxLightModeOpacity.value = settings.hint_box_light_mode_opacity ?? 0.96;
        els.hintTextLightModeColor.value = settings.hint_text_light_mode_color || "#d0d1d7";

        els.hintTextFontSizeValue.value = settings.hint_text_font_size_value ?? settings.hint_text_font_size_em ?? 0.5;
        els.hintTextFontSizeUnit.value = settings.hint_text_font_size_unit || "em";
        els.hintTextFontSizeUnit.dataset.previousUnit = els.hintTextFontSizeUnit.value;
        els.hintPosition.value = settings.hint_position || "left";
        els.hintDisplay.value = settings.hint_display || "always";
        els.keybrHintLayout.value = settings.keybr_hint_layout || "extra-spacing";
        syncHintTextSizeFieldBehavior();
        updateHotkeyButtonLabels();

        updateAppearancePreview(settings);
    }

    function updateHotkeyButtonLabels() {
        HOTKEY_BINDINGS.forEach(([settingKey, buttonKey]) => {
            const button = els[buttonKey];
            if (!button) return;

            button.textContent = recordingHotkeyTarget === settingKey
                ? "Press hotkey..."
                : CCHShared.formatHotkey(draftSettings[settingKey]);
            button.classList.toggle("isRecording", recordingHotkeyTarget === settingKey);
        });
    }

    function beginHotkeyRecording(settingKey) {
        recordingHotkeyTarget = settingKey;
        updateHotkeyButtonLabels();
        setStatus(els.settingsStatus, "Press the hotkey combination you want to use. Press Escape to cancel.");
    }

    function stopHotkeyRecording() {
        recordingHotkeyTarget = null;
        updateHotkeyButtonLabels();
    }

    function handleHotkeyRecordingKeydown(event) {
        if (!recordingHotkeyTarget) return;

        event.preventDefault();
        event.stopPropagation();

        if (event.key === "Escape" && !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey) {
            stopHotkeyRecording();
            setStatus(els.settingsStatus, "Hotkey recording cancelled.");
            return;
        }

        const hotkey = CCHShared.eventToHotkey(event);
        if (CCHShared.isModifierOnlyHotkey(hotkey)) {
            setStatus(els.settingsStatus, "Use at least one non-modifier key.", true);
            return;
        }

        draftSettings = hydrateSettings({
            ...draftSettings,
            [recordingHotkeyTarget]: hotkey
        });
        stopHotkeyRecording();
        setStatus(
            els.settingsStatus,
            `Recorded ${CCHShared.formatHotkey(hotkey)}. Save settings to apply.`
        );
    }

    function updateAppearancePreview(settings) {
        const hintTextSizeValue = settings.hint_text_font_size_value ?? settings.hint_text_font_size_em ?? 0.5;
        const hintTextSizeUnit = ["em", "px"].includes(settings.hint_text_font_size_unit)
            ? settings.hint_text_font_size_unit
            : "em";
        const alignClass = settings.hint_position === "center" ? "previewAlignCenter" : "previewAlignLeft";
        const revealOnHover = settings.hint_display === "hover";
        const hintOrderMode = settings.hintCharacterOrderMode === "charachorder-default"
            ? "charachorder-default"
            : "best-match";
        const previewHints = [els.hintPreviewDark, els.hintPreviewLight];
        const previousDisplayMode = els.hintPreviewDark.dataset.previewDisplayMode;

        if (previousDisplayMode && previousDisplayMode !== settings.hint_display) {
            previewHints.forEach((label) => {
                label.classList.remove("previewHintForceVisible", "previewHintForceHidden");
            });
        }

        previewHints.forEach((label) => {
            label.dataset.previewDisplayMode = settings.hint_display;
        });

        els.hintPreviewDark.textContent = previewHintTextForWord("dark", hintOrderMode);
        els.hintPreviewLight.textContent = previewHintTextForWord("light", hintOrderMode);

        els.hintPreviewDark.style.background = hexToRgba(settings.hint_box_dark_mode_color, settings.hint_box_dark_mode_opacity);
        els.hintPreviewDark.style.color = settings.hint_text_dark_mode_color;
        els.hintPreviewDark.style.setProperty("--cch-preview-hint-text-color", settings.hint_text_dark_mode_color);
        els.hintPreviewDark.style.fontSize = `${hintTextSizeValue}${hintTextSizeUnit}`;
        els.hintPreviewDark.classList.toggle("previewAlignLeft", alignClass === "previewAlignLeft");
        els.hintPreviewDark.classList.toggle("previewAlignCenter", alignClass === "previewAlignCenter");
        els.hintPreviewDark.classList.toggle("previewHintHoverReveal", revealOnHover);
        els.hintPreviewWordDark.classList.toggle("previewWordOutlined", settings.showChordableWordOutlines);
        els.hintPreviewWordDark.style.setProperty("--cch-preview-word-outline-color", settings.hint_box_dark_mode_color);

        els.hintPreviewLight.style.background = hexToRgba(settings.hint_box_light_mode_color, settings.hint_box_light_mode_opacity);
        els.hintPreviewLight.style.color = settings.hint_text_light_mode_color;
        els.hintPreviewLight.style.setProperty("--cch-preview-hint-text-color", settings.hint_text_light_mode_color);
        els.hintPreviewLight.style.fontSize = `${hintTextSizeValue}${hintTextSizeUnit}`;
        els.hintPreviewLight.classList.toggle("previewAlignLeft", alignClass === "previewAlignLeft");
        els.hintPreviewLight.classList.toggle("previewAlignCenter", alignClass === "previewAlignCenter");
        els.hintPreviewLight.classList.toggle("previewHintHoverReveal", revealOnHover);
        els.hintPreviewWordLight.classList.toggle("previewWordOutlined", settings.showChordableWordOutlines);
        els.hintPreviewWordLight.style.setProperty("--cch-preview-word-outline-color", settings.hint_box_light_mode_color);
    }

    function togglePreviewHintDisplay(label) {
        if (label.classList.contains("previewHintForceVisible")) {
            label.classList.remove("previewHintForceVisible");
            label.classList.add("previewHintForceHidden");
            return;
        }

        if (label.classList.contains("previewHintForceHidden")) {
            label.classList.remove("previewHintForceHidden");
            return;
        }

        if (currentSettingsFromForm().hint_display === "hover") {
            label.classList.add("previewHintForceVisible");
        } else {
            label.classList.add("previewHintForceHidden");
        }
    }

    function parseHexBytes(hex) {
        const safeHex = String(hex || "").trim();
        if (!/^[0-9a-fA-F]*$/.test(safeHex) || safeHex.length % 2 !== 0) {
            throw new Error(`Invalid hex string: ${hex}`);
        }

        const bytes = [];
        for (let i = 0; i < safeHex.length; i += 2) {
            bytes.push(parseInt(safeHex.slice(i, i + 2), 16));
        }
        return bytes;
    }

    function decodeOutputCodesFromHex(outputHex) {
        const bytes = parseHexBytes(outputHex);
        const outputCodes = [];

        for (let i = 0; i < bytes.length; i += 1) {
            const hi = bytes[i];
            const lo = bytes[i + 1];
            const word = lo === undefined ? null : ((hi << 8) | lo);

            if (word !== null && Object.prototype.hasOwnProperty.call(SERIAL_OUTPUT_ACTION_LABELS, word)) {
                outputCodes.push(word);
                i += 1;
                continue;
            }

            outputCodes.push(hi);
        }

        return outputCodes;
    }

    function inputHexToBitString(inputHex) {
        const safeHex = String(inputHex || "").trim();
        if (!/^[0-9a-fA-F]{32}$/.test(safeHex)) {
            throw new Error(`Expected 32 hex characters for packed input, received: ${inputHex}`);
        }

        return safeHex
            .split("")
            .map((char) => parseInt(char, 16).toString(2).padStart(4, "0"))
            .join("");
    }

    function describeInputCode(code) {
        if (code === 0) {
            return {
                code,
                type: "empty",
                label: "empty",
                display: "·"
            };
        }

        const specialMeta = CCHShared.SPECIAL_INPUT_META?.[code];
        if (specialMeta) {
            return {
                code,
                type: "special",
                label: specialMeta.label,
                display: `(${specialMeta.label})`
            };
        }

        if (code >= 32 && code <= 126) {
            return {
                code,
                type: "char",
                label: String.fromCharCode(code),
                display: String.fromCharCode(code)
            };
        }

        return {
            code,
            type: "unknown",
            label: `code ${code}`,
            display: `(code ${code})`
        };
    }

    function splitInputClusters(packedInputSlots) {
        const clusters = [];
        let currentCluster = [];

        packedInputSlots.forEach((code, slotIndex) => {
            if (code === 0) {
                if (currentCluster.length) {
                    clusters.push(currentCluster);
                    currentCluster = [];
                }
                return;
            }

            currentCluster.push({
                slotIndex,
                ...describeInputCode(code)
            });
        });

        if (currentCluster.length) {
            clusters.push(currentCluster);
        }

        return clusters;
    }

    function renderClusterDisplay(cluster) {
        return cluster.map((item) => item.display).join(" ");
    }

    function analyzePackedInputSlots(packedInputSlots) {
        const slotValues = Array.isArray(packedInputSlots) ? packedInputSlots.slice() : [];
        const slotDescriptions = slotValues.map((code, slotIndex) => ({
            slotIndex,
            ...describeInputCode(code)
        }));

        const clusters = splitInputClusters(slotValues);
        const zeroSlotIndices = slotDescriptions
            .filter((slot) => slot.code === 0)
            .map((slot) => slot.slotIndex);

        return {
            slotDescriptions,
            zeroSlotIndices,
            clusters: clusters.map((cluster) => cluster.map((item) => ({
                slotIndex: item.slotIndex,
                code: item.code,
                label: item.label,
                display: item.display
            }))),
            hasInteriorZeroGap: clusters.length > 1,
            hasNonAsciiCodes: slotDescriptions.some((slot) => slot.code !== 0 && slot.type !== "char"),
            displayHypotheses: {
                storedClusterOrder: clusters.map((cluster) => renderClusterDisplay(cluster)),
                reversedClusterOrder: clusters.slice().reverse().map((cluster) => renderClusterDisplay(cluster)),
                reversedWithinClusters: clusters.map((cluster) => renderClusterDisplay(cluster.slice().reverse())),
                reversedClusterOrderAndWithin: clusters
                    .slice()
                    .reverse()
                    .map((cluster) => renderClusterDisplay(cluster.slice().reverse()))
            }
        };
    }

    function splitCompoundInputClustersFromPackedSlots(packedInputSlots) {
        const reversedSlots = (Array.isArray(packedInputSlots) ? packedInputSlots.slice() : []).reverse();

        while (reversedSlots.length && reversedSlots[0] === 0) {
            reversedSlots.shift();
        }
        while (reversedSlots.length && reversedSlots[reversedSlots.length - 1] === 0) {
            reversedSlots.pop();
        }

        const segments = [];
        let currentSegment = [];

        reversedSlots.forEach((code) => {
            if (code === 0) {
                if (currentSegment.length) {
                    segments.push(currentSegment);
                    currentSegment = [];
                }
                return;
            }
            currentSegment.push(code);
        });

        if (currentSegment.length) {
            segments.push(currentSegment);
        }

        return segments;
    }

    function isRenderableCompoundSegment(segmentCodes) {
        return (Array.isArray(segmentCodes) ? segmentCodes : []).every((code) => {
            const description = describeInputCode(code);
            return description.type === "char" || description.type === "special";
        });
    }

    function buildUnknownCompoundSegment(clusterCodes) {
        return {
            kind: "unknown_compound",
            inputCodes: Array.isArray(clusterCodes) ? clusterCodes.slice() : [],
            inputTokens: [CCHShared.makePseudoSpecialToken("broken_image", "unknown compound segment")],
            rawInput: CCHShared.UNKNOWN_COMPOUND_PLACEHOLDER,
            editableText: "",
            sortText: CCHShared.UNKNOWN_COMPOUND_PLACEHOLDER
        };
    }

    function buildDecodedSegment(clusterCodes) {
        if (isRenderableCompoundSegment(clusterCodes)) {
            return {
                kind: "decoded",
                inputCodes: Array.isArray(clusterCodes) ? clusterCodes.slice() : []
            };
        }

        return buildUnknownCompoundSegment(clusterCodes);
    }

    function findCompoundRenderableSuffixStart(rawClusters) {
        const safeClusters = Array.isArray(rawClusters) ? rawClusters : [];
        let trailingRenderableStart = safeClusters.length;

        while (trailingRenderableStart > 0 && isRenderableCompoundSegment(safeClusters[trailingRenderableStart - 1])) {
            trailingRenderableStart -= 1;
        }

        if (trailingRenderableStart <= 0 || trailingRenderableStart >= safeClusters.length) {
            return -1;
        }

        return trailingRenderableStart;
    }

    function extractCompoundHashDescriptorFromPackedSlots(packedInputSlots) {
        const rawClusters = splitCompoundInputClustersFromPackedSlots(packedInputSlots);
        const suffixStart = findCompoundRenderableSuffixStart(rawClusters);
        if (suffixStart === -1) {
            return null;
        }

        const hashClusters = rawClusters.slice(0, suffixStart);
        const tailCodes = rawClusters.slice(suffixStart).flat();
        if (!tailCodes.length || !isRenderableCompoundSegment(tailCodes)) {
            return null;
        }

        const parentHashChunks = [];
        hashClusters.forEach((cluster, clusterIndex) => {
            if (clusterIndex > 0) {
                parentHashChunks.push(0);
            }
            parentHashChunks.push(...cluster);
        });

        const normalizedHashChunks = parentHashChunks.slice(0, 3);
        while (normalizedHashChunks.length < 3) {
            normalizedHashChunks.push(0);
        }

        if (!normalizedHashChunks.some((code) => code !== 0)) {
            return null;
        }

        return {
            rawClusters,
            hashClusters,
            suffixStart,
            parentHashChunks: normalizedHashChunks,
            parentHash:
                normalizedHashChunks[0]
                + (normalizedHashChunks[1] << 10)
                + (normalizedHashChunks[2] << 20),
            tailCodes: tailCodes.slice()
        };
    }

    function buildDecodedInputSegments(decodedInput) {
        const rawClusters = splitCompoundInputClustersFromPackedSlots(decodedInput.packedInputSlots);
        if (rawClusters.length <= 1) {
            return [];
        }

        const suffixStart = findCompoundRenderableSuffixStart(rawClusters);
        if (suffixStart !== -1) {
            const unknownCodes = rawClusters.slice(0, suffixStart).flat();
            const tailCodes = rawClusters.slice(suffixStart).flat();

            return [
                buildUnknownCompoundSegment(unknownCodes),
                buildDecodedSegment(tailCodes)
            ].filter((segment) => Array.isArray(segment?.inputCodes) && segment.inputCodes.length);
        }

        return rawClusters.map((clusterCodes) => buildDecodedSegment(clusterCodes));
    }

    function extractSerializedInputActionCodes(packedInputSlots) {
        const compoundDescriptor = extractCompoundHashDescriptorFromPackedSlots(packedInputSlots);
        if (compoundDescriptor) {
            return {
                serializedActionCodes: compoundDescriptor.parentHashChunks.concat(compoundDescriptor.tailCodes),
                compoundDescriptor
            };
        }

        return {
            serializedActionCodes: (Array.isArray(packedInputSlots) ? packedInputSlots : [])
                .filter((code) => code !== 0)
                .slice()
                .reverse(),
            compoundDescriptor: null
        };
    }

    function decodeInputHex(inputHex) {
        const bits = inputHexToBitString(inputHex);
        const chainIndex = parseInt(bits.slice(0, 8), 2);
        const packedInputSlots = [];

        for (let offset = 8; offset < 128; offset += 10) {
            packedInputSlots.push(parseInt(bits.slice(offset, offset + 10), 2));
        }

        const nonZeroPackedCodes = packedInputSlots.filter((code) => code !== 0);
        const ascendingInputCodes = nonZeroPackedCodes.slice().reverse();
        const compoundInputSegments = buildDecodedInputSegments({packedInputSlots});
        const {serializedActionCodes, compoundDescriptor} = extractSerializedInputActionCodes(packedInputSlots);

        return {
            chainIndex,
            packedInputSlots,
            packedInputCodes: nonZeroPackedCodes,
            ascendingInputCodes,
            compoundInputSegments,
            serializedActionCodes,
            compoundDescriptor
        };
    }

    function parseCmlC0Line(line) {
        const match = String(line || "").trim().match(/^CML\s+C0\s+(\d+)$/);
        if (!match) return null;
        return Number.parseInt(match[1], 10);
    }

    // SPEC-2 setting ids consumed by the chording-core decision gates,
    // read over VAR B1 per SPEC-7: 49 chording enable, 62 concatenation
    // style, 81 arpeggiates enable, 85 arpeggiates mode, 112 layer warp.
    const GATE_SETTING_IDS = [49, 62, 81, 85, 112];

    // Key counts per device model (SPEC-7 §3).
    const DEVICE_KEY_COUNTS = {
        ONE: 90,
        TWO: 90,
        M4G: 90,
        M4GR: 90,
        LITE: 67,
        X: 256,
        ENGINE: 256,
        ZERO: 256,
        T4G: 7,
        CCB: 7
    };

    function parseVarB1Line(line) {
        const match = String(line || "").trim().match(/^VAR\s+B1\s+([0-9A-Fa-f]+)\s+(\d+)\s+(\d+)$/);
        if (!match) return null;
        return {
            hexId: match[1].toUpperCase(),
            value: Number.parseInt(match[2], 10),
            status: Number.parseInt(match[3], 10)
        };
    }

    function parseVarB3Line(line) {
        const match = String(line || "").trim().match(/^VAR\s+B3\s+([ABC][1-4])\s+(\d+)\s+(\d+)\s+(\d+)$/);
        if (!match) return null;
        return {
            layer: match[1].toUpperCase(),
            key: Number.parseInt(match[2], 10),
            position: Number.parseInt(match[3], 10),
            status: Number.parseInt(match[4], 10)
        };
    }

    function deviceCapabilities(idFields, version) {
        // SPEC-7 §3: profiles/layers gate on chipset and firmware version.
        const chipset = String(idFields?.[2] || "").toUpperCase();
        const model = String(idFields?.[1] || "").toUpperCase();
        const isM0 = chipset === "M0";
        const profiles = isM0 ? 1 : 3;
        const versionParts = String(version || "").split("-")[0].split(".").map((part) => Number.parseInt(part, 10) || 0);
        const atLeast220 = versionParts[0] > 2 || (versionParts[0] === 2 && versionParts[1] >= 2);
        const layers = isM0 ? 3 : (atLeast220 ? 4 : 3);
        const keyCount = DEVICE_KEY_COUNTS[model] ?? 90;
        return { profiles, layers, keyCount, chipset, model };
    }

    function parseCmlC1Line(line) {
        const match = String(line || "").trim().match(/^CML\s+C1\s+(\d+)\s+([0-9A-Fa-f]{32})\s+([0-9A-Fa-f]*)\s+(\d+)$/);
        if (!match) return null;

        return {
            index: Number.parseInt(match[1], 10),
            inputHex: match[2].toUpperCase(),
            outputHex: (match[3] || "").toUpperCase(),
            status: Number.parseInt(match[4], 10),
            rawLine: line
        };
    }

    function combineSplitCmlLines(lines) {
        const source = Array.isArray(lines) ? lines.map((line) => String(line || "").trim()).filter(Boolean) : [];
        const combined = [];

        for (let i = 0; i < source.length; i += 1) {
            const current = source[i];
            const next = source[i + 1];

            if ((current === "CML C0" || /^CML\s+C1\s+\d+$/.test(current)) && /^CML\b/.test(next || "")) {
                combined.push(`${current} ${next.replace(/^CML\s*/, "")}`.trim());
                i += 1;
                continue;
            }

            combined.push(current);
        }

        return combined;
    }

    function notifySerialSessionWaiters(session) {
        const waiters = session?.waiters?.splice(0) || [];
        waiters.forEach((resolve) => resolve());
    }

    function appendSerialSessionChunk(session, value, flush = false) {
        if (!session?.decoder) {
            return;
        }

        const chunk = value || new Uint8Array(0);
        session.buffer += session.decoder.decode(chunk, {stream: !flush});
        const parts = session.buffer.replaceAll(String.fromCharCode(13), "").split(String.fromCharCode(10));
        session.buffer = parts.pop() || "";

        let addedLine = false;
        for (const part of parts) {
            const line = part.trim();
            if (!line) continue;
            session.lines.push(line);
            addedLine = true;
        }

        if (flush) {
            const tail = session.buffer.trim();
            session.buffer = "";
            if (tail) {
                session.lines.push(tail);
                addedLine = true;
            }
        }

        if (addedLine) {
            notifySerialSessionWaiters(session);
        }
    }

    async function openSerialSession(port) {
        const reader = port.readable.getReader();
        const writer = port.writable.getWriter();
        const session = {
            reader,
            writer,
            decoder: new TextDecoder(),
            buffer: "",
            lines: [],
            waiters: [],
            closed: false,
            readError: null,
            readTask: null
        };

        session.readTask = (async () => {
            try {
                while (true) {
                    const {value, done} = await reader.read();
                    if (done) {
                        break;
                    }
                    if (!value) {
                        continue;
                    }
                    appendSerialSessionChunk(session, value);
                }
                appendSerialSessionChunk(session, new Uint8Array(0), true);
            } catch (error) {
                session.readError = error;
            } finally {
                session.closed = true;
                notifySerialSessionWaiters(session);
            }
        })();

        return session;
    }

    function waitForSerialSessionSignal(session, timeoutMs) {
        return new Promise((resolve) => {
            let settled = false;
            const waiter = () => {
                window.clearTimeout(timerId);
                finish(false);
            };
            const finish = (didTimeout) => {
                if (settled) {
                    return;
                }
                settled = true;
                resolve(didTimeout);
            };
            const timerId = window.setTimeout(() => {
                const index = session.waiters.indexOf(waiter);
                if (index >= 0) {
                    session.waiters.splice(index, 1);
                }
                finish(true);
            }, timeoutMs);
            session.waiters.push(waiter);
        });
    }

    async function readSerialResponseLines(session, startIndex, timeoutMs = 4000, matchRegex = null) {
        const deadline = Date.now() + timeoutMs;

        while (Date.now() < deadline) {
            const lines = session.lines.slice(startIndex);
            if (matchRegex && lines.some((line) => matchRegex.test(line))) {
                return lines;
            }
            if (session.readError) {
                throw session.readError;
            }
            if (session.closed) {
                return lines;
            }

            const remaining = Math.max(1, deadline - Date.now());
            const didTimeout = await waitForSerialSessionSignal(session, remaining);
            if (didTimeout) {
                break;
            }
        }

        if (session.readError) {
            throw session.readError;
        }
        return session.lines.slice(startIndex);
    }

    async function sendSerialCommand(session, payload, matchRegex, timeoutMs = 4000) {
        const encoded = new TextEncoder().encode(payload + String.fromCharCode(13, 10));
        const startIndex = session.lines.length;
        await session.writer.write(encoded);
        return readSerialResponseLines(session, startIndex, timeoutMs, matchRegex);
    }

    async function closeSerialSessionQuietly(session) {
        if (!session) {
            return;
        }

        try {
            await session.reader?.cancel?.();
        } catch (_) {
        }

        try {
            await session.readTask;
        } catch (_) {
        }

        try {
            session.reader?.releaseLock?.();
        } catch (_) {
        }

        try {
            session.writer?.releaseLock?.();
        } catch (_) {
        }
    }

    async function closePortQuietly(port) {
        if (port) {
            try {
                await port.close();
            } catch (_) {
            }
        }
    }


    function cloneInputSegment(segment) {
        if (!segment || typeof segment !== "object") {
            return null;
        }

        return {
            index: Number.isFinite(segment.index) ? segment.index : undefined,
            kind: typeof segment.kind === "string" ? segment.kind : "decoded",
            inputCodes: Array.isArray(segment.inputCodes) ? segment.inputCodes.slice() : [],
            inputTokens: Array.isArray(segment.inputTokens) ? segment.inputTokens.map((token) => ({...token})) : undefined,
            rawInput: typeof segment.rawInput === "string" ? segment.rawInput : undefined,
            editableText: typeof segment.editableText === "string" ? segment.editableText : undefined,
            sortText: typeof segment.sortText === "string" ? segment.sortText : undefined
        };
    }

    function cloneInputSegments(segments) {
        return (Array.isArray(segments) ? segments : [])
            .map((segment) => cloneInputSegment(segment))
            .filter(Boolean);
    }

    function defaultResolvedSegmentsForSerialEntry(serialEntry) {
        if (Array.isArray(serialEntry?.decodedInput?.compoundInputSegments) && serialEntry.decodedInput.compoundInputSegments.length) {
            return cloneInputSegments(serialEntry.decodedInput.compoundInputSegments);
        }

        if (Array.isArray(serialEntry?.decodedInput?.ascendingInputCodes) && serialEntry.decodedInput.ascendingInputCodes.length) {
            return [{
                kind: "decoded",
                inputCodes: serialEntry.decodedInput.ascendingInputCodes.slice()
            }];
        }

        return [];
    }

    function inputSegmentTokenCount(segments) {
        return (Array.isArray(segments) ? segments : []).reduce((total, segment) => {
            if (Array.isArray(segment?.inputTokens) && segment.inputTokens.length) {
                return total + segment.inputTokens.length;
            }

            if (Array.isArray(segment?.inputCodes) && segment.inputCodes.length) {
                return total + segment.inputCodes.length;
            }

            return total;
        }, 0);
    }

    function buildCompoundHashLookup(serialEntries) {
        const lookup = new Map();

        (Array.isArray(serialEntries) ? serialEntries : []).forEach((serialEntry) => {
            const serializedActionCodes = Array.isArray(serialEntry?.decodedInput?.serializedActionCodes)
                ? serialEntry.decodedInput.serializedActionCodes
                : [];

            if (!serializedActionCodes.length) {
                return;
            }

            const hash = CCHShared.hashChord(serializedActionCodes);
            serialEntry.serialInputHash = hash;

            if (!lookup.has(hash)) {
                lookup.set(hash, []);
            }

            lookup.get(hash).push(serialEntry);
        });

        return lookup;
    }

    function resolveSerialEntrySegments(serialEntry, hashLookup, memo = new Map(), resolutionStack = new Set()) {
        if (!serialEntry) {
            return [];
        }

        if (memo.has(serialEntry.index)) {
            return cloneInputSegments(memo.get(serialEntry.index));
        }

        if (resolutionStack.has(serialEntry.index)) {
            return defaultResolvedSegmentsForSerialEntry(serialEntry);
        }

        resolutionStack.add(serialEntry.index);

        let resolvedSegments = defaultResolvedSegmentsForSerialEntry(serialEntry);
        const compoundDescriptor = serialEntry.decodedInput?.compoundDescriptor || null;

        if (compoundDescriptor?.parentHash && Array.isArray(compoundDescriptor.tailCodes) && compoundDescriptor.tailCodes.length) {
            const candidates = (hashLookup.get(compoundDescriptor.parentHash) || [])
                .filter((candidate) => candidate && candidate.index !== serialEntry.index)
                .slice()
                .sort((a, b) => {
                    const aCount = inputSegmentTokenCount(defaultResolvedSegmentsForSerialEntry(a));
                    const bCount = inputSegmentTokenCount(defaultResolvedSegmentsForSerialEntry(b));
                    if (aCount !== bCount) {
                        return aCount - bCount;
                    }
                    return (a.index ?? 0) - (b.index ?? 0);
                });

            const parentEntry = candidates[0] || null;
            if (parentEntry) {
                const parentSegments = resolveSerialEntrySegments(parentEntry, hashLookup, memo, resolutionStack);
                if (parentSegments.length) {
                    resolvedSegments = parentSegments.concat([{
                        kind: "decoded",
                        inputCodes: compoundDescriptor.tailCodes.slice()
                    }]);
                }

                console.log("[CCH serial] resolved compound parent hash", {
                    index: serialEntry.index,
                    parentHash: compoundDescriptor.parentHash,
                    parentHashChunks: compoundDescriptor.parentHashChunks,
                    parentMatchIndex: parentEntry.index,
                    tailCodes: compoundDescriptor.tailCodes
                });
            } else {
                console.log("[CCH serial] unresolved compound parent hash", {
                    index: serialEntry.index,
                    parentHash: compoundDescriptor.parentHash,
                    parentHashChunks: compoundDescriptor.parentHashChunks,
                    tailCodes: compoundDescriptor.tailCodes
                });
            }
        }

        memo.set(serialEntry.index, cloneInputSegments(resolvedSegments));
        resolutionStack.delete(serialEntry.index);
        return cloneInputSegments(resolvedSegments);
    }

    async function fetchFullDeviceSync() {
        if (!navigator.serial) {
            throw new Error("Web Serial is not available in this browser context.");
        }

        let port = null;
        let session = null;

        try {
            port = await navigator.serial.requestPort();
            console.log("[CCH serial] selected port info", port.getInfo?.() || {});
            await port.open({baudRate: SERIAL_BAUD_RATE});
            console.log("[CCH serial] port opened for full device sync");
            await sleep(100);
            session = await openSerialSession(port);

            setStatus(els.importStatus, "Identifying connected Charachorder...");
            const cmdLines = await sendSerialCommand(session, "CMD", /^CMD\b/, SERIAL_ENTRY_TIMEOUT_MS);
            const cmdLine = (Array.isArray(cmdLines) ? cmdLines : [])
                .map((line) => String(line || "").trim())
                .find((line) => /^CMD\b/.test(line)) || "";
            const versionLines = await sendSerialCommand(session, "VERSION", /^VERSION\b/, SERIAL_ENTRY_TIMEOUT_MS);
            const versionLine = (Array.isArray(versionLines) ? versionLines : [])
                .map((line) => String(line || "").trim())
                .find((line) => /^VERSION\b/.test(line)) || "";
            const idLines = await sendSerialCommand(session, "ID", /^ID\b/, SERIAL_ENTRY_TIMEOUT_MS);
            const idLine = (Array.isArray(idLines) ? idLines : [])
                .map((line) => String(line || "").trim())
                .find((line) => /^ID\b/.test(line)) || "";
            await sleep(1);

            const version = versionLine ? versionLine.replace(/^VERSION\s+/, "").trim() : null;
            const idFields = idLine ? idLine.replace(/^ID\s+/, "").trim().split(/\s+/) : [];
            const caps = deviceCapabilities(idFields, version);
            const supportsVar = /\bVAR\b/.test(cmdLine);
            console.log("[CCH serial] device identity", { version, idFields, caps, cmdLine, supportsVar });

            if (!supportsVar) {
                throw new Error("This firmware does not expose VAR (settings/layout) commands. Full sync requires firmware that advertises VAR via CMD (3.0.0+).");
            }

            setStatus(els.importStatus, "Fetching chordmap count from connected Charachorder...");
            const countLines = await sendSerialCommand(session, "CML C0", /^CML\s+C0\b/, SERIAL_COUNT_TIMEOUT_MS);
            const combinedCountLines = combineSplitCmlLines(countLines);
            console.log("[CCH serial] combined CML C0 lines", combinedCountLines);
            const countLine = combinedCountLines.find((line) => /^CML\s+C0\b/.test(line));
            const entryCount = parseCmlC0Line(countLine);

            if (!Number.isFinite(entryCount) || entryCount < 0) {
                console.error("[CCH serial] invalid CML C0 response", combinedCountLines);
                throw new Error("The device did not return a valid chordmap count.");
            }

            console.log("[CCH serial] chordmap count", entryCount);
            const serialEntries = [];
            const debugSerialAnalysis = Boolean(els.debugLogging?.checked);

            for (let index = 0; index < entryCount; index += 1) {
                if (index === 0 || index % 25 === 0 || index === entryCount - 1) {
                    setStatus(els.importStatus, `Syncing chordmap from device. Please stay on this page until completed: ${index}/${entryCount}`);
                }

                const responsePattern = new RegExp(`^CML\\s+C1\\s+${index}\\b`);
                const lines = await sendSerialCommand(
                    session,
                    `CML C1 ${index}`,
                    responsePattern,
                    SERIAL_ENTRY_TIMEOUT_MS
                );

                const combinedLines = combineSplitCmlLines(lines);
                console.log("[CCH serial] combined CML C1 lines", {index, combinedLines});
                const line = combinedLines.find((candidate) => responsePattern.test(candidate));
                const parsed = parseCmlC1Line(line);

                if (!parsed) {
                    console.error("[CCH serial] missing or invalid CML C1 response", {index, combinedLines});
                    throw new Error(`Failed to read chord entry ${index} from the device.`);
                }

                const decodedInput = decodeInputHex(parsed.inputHex);
                const outputCodes = decodeOutputCodesFromHex(parsed.outputHex);
                if (debugSerialAnalysis) {
                    const inputAnalysis = analyzePackedInputSlots(decodedInput.packedInputSlots);
                    if (inputAnalysis.hasInteriorZeroGap || inputAnalysis.hasNonAsciiCodes) {
                        console.log("[CCH serial] packed input analysis", {
                            index: parsed.index,
                            inputHex: parsed.inputHex,
                            outputHex: parsed.outputHex,
                            chainIndex: decodedInput.chainIndex,
                            packedInputSlots: inputAnalysis.slotDescriptions,
                            zeroSlotIndices: inputAnalysis.zeroSlotIndices,
                            clusters: inputAnalysis.clusters,
                            displayHypotheses: inputAnalysis.displayHypotheses,
                            serializedActionCodes: decodedInput.serializedActionCodes,
                            compoundDescriptor: decodedInput.compoundDescriptor,
                            outputCodes,
                            visibleOutputText: CCHShared.visibleOutputText(outputCodes)
                        });
                    }
                }

                serialEntries.push({
                    index: parsed.index,
                    parsed,
                    decodedInput,
                    outputCodes
                });
            }


            const settings = {};
            setStatus(els.importStatus, "Reading device settings...");
            for (const id of GATE_SETTING_IDS) {
                const hexId = id.toString(16);
                const lines = await sendSerialCommand(session, `VAR B1 ${hexId}`, /^VAR\s+B1\b/, SERIAL_ENTRY_TIMEOUT_MS);
                await sleep(1);
                const line = (Array.isArray(lines) ? lines : [])
                    .map((candidate) => String(candidate || "").trim())
                    .find((candidate) => /^VAR\s+B1\b/.test(candidate));
                const parsed = parseVarB1Line(line);
                if (parsed && parsed.status === 0) {
                    settings[id] = parsed.value;
                } else {
                    console.warn("[CCH serial] VAR B1 read failed", { id, hexId, line });
                }
            }

            const layout = [];
            let layoutReadFailures = 0;
            setStatus(els.importStatus, "Reading device layout...");
            for (let layerIdx = 0; layerIdx < caps.layers; layerIdx += 1) {
                const layerTag = `A${layerIdx + 1}`;
                for (let key = 0; key < caps.keyCount; key += 1) {
                    if (key === 0 || key % 30 === 0 || key === caps.keyCount - 1) {
                        setStatus(els.importStatus, `Reading device layout: layer ${layerTag}, key ${key}/${caps.keyCount}`);
                    }
                    const lines = await sendSerialCommand(session, `VAR B3 ${layerTag} ${key}`, /^VAR\s+B3\b/, SERIAL_ENTRY_TIMEOUT_MS);
                    await sleep(1);
                    const line = (Array.isArray(lines) ? lines : [])
                        .map((candidate) => String(candidate || "").trim())
                        .find((candidate) => /^VAR\s+B3\b/.test(candidate));
                    const parsed = parseVarB3Line(line);
                    if (parsed && parsed.status === 0) {
                        layout.push(parsed.position);
                    } else {
                        layoutReadFailures += 1;
                        console.warn("[CCH serial] VAR B3 read failed", { layerTag, key, line });
                        layout.push(0); // fault tolerance: treat slot as unbound
                    }
                }
            }
            if (layoutReadFailures > 0) {
                setStatus(els.importStatus, `Layout read had ${layoutReadFailures} failures; affected slots treated as unbound.`, true);
            }

            const deviceState = {
                source: "serial",
                version,
                id: { company: idFields[0] || null, device: idFields[1] || null, chipset: idFields[2] || null },
                profiles: caps.profiles,
                layers: caps.layers,
                keyCount: caps.keyCount,
                slotsPerLayer: caps.keyCount,
                settings,
                layout,
                syncedAt: new Date().toISOString()
            };
            console.log("[CCH serial] device state read", {
                settings,
                layoutSlots: layout.length,
                layoutReadFailures
            });

            const hashLookup = buildCompoundHashLookup(serialEntries);
            const resolvedSegmentMemo = new Map();
            const entries = serialEntries.map((serialEntry) => CCHShared.buildEntry({
                index: serialEntry.parsed.index,
                inputCodes: serialEntry.decodedInput.ascendingInputCodes,
                inputSegments: resolveSerialEntrySegments(serialEntry, hashLookup, resolvedSegmentMemo),
                packedInputCodes: serialEntry.decodedInput.packedInputCodes,
                outputCodes: serialEntry.outputCodes,
                inputHex: serialEntry.parsed.inputHex,
                outputHex: serialEntry.parsed.outputHex,
                status: serialEntry.parsed.status,
                userFlags: {displayEnabled: true}
            }));

            const dictionary = CCHShared.buildParsedDictionary({
                entries,
                source: "serial",
                deviceEntryCount: entryCount,
                charaVersion: null
            });
            return { dictionary, deviceState };
        } finally {
            await closeSerialSessionQuietly(session);
            await closePortQuietly(port);
        }
    }

    async function saveParsedDictionary(parsedDictionary, deviceState, successMessage) {
        const nextExportWordPreferences = CCHShared.pruneExportWordPreferences(exportWordPreferences, parsedDictionary);
        const storageUpdate = {
            [STORAGE_KEYS.parsedDictionary]: parsedDictionary,
            [STORAGE_KEYS.inputDisplayOverrides]: {},
            [STORAGE_KEYS.exportWordPreferences]: nextExportWordPreferences
        };
        if (deviceState) {
            storageUpdate[STORAGE_KEYS.deviceState] = deviceState;
        }
        await setStorage(storageUpdate);
        if (!deviceState) {
            // No gated matching without a device state: fail closed.
            await removeStorage([STORAGE_KEYS.deviceState]);
        }
        currentDeviceState = deviceState || null;
        currentRawDictionary = parsedDictionary;
        inputDisplayOverrides = {};
        exportWordPreferences = nextExportWordPreferences;
        expandedEditorRows = new Set();
        draftInputEdits = {};
        currentPage = 1;
        applyCurrentDictionary();
        refreshMeta(currentDictionary);
        renderLoadedChords(currentSettingsFromForm());
        renderExportSection();
        setStatus(els.importStatus, successMessage);
    }

    async function readChosenText() {
        const file = els.jsonFile.files?.[0];
        if (!file) {
            throw new Error("Choose a JSON file first.");
        }

        return await file.text();
    }

    async function importJson() {
        try {
            setBusy(true);
            setStatus(els.importStatus, "Parsing JSON chordmap...");

            const raw = await readChosenText();
            const parsed = JSON.parse(raw);
            const parsedDictionary = CCHShared.parseChordJson(parsed);
            await saveParsedDictionary(parsedDictionary, null, `Saved ${parsedDictionary.entryCount} chord entries from JSON. Substring hints stay disabled until a full device sync.`);

            console.log("[CCH options] parsed and saved JSON chord dictionary", {
                source: parsedDictionary.source,
                entryCount: parsedDictionary.entryCount,
                sample: parsedDictionary.entries.slice(0, 5)
            });
        } catch (error) {
            console.error(error);
            setStatus(els.importStatus, error.message || "Failed to parse chord JSON.", true);
        } finally {
            setBusy(false);
        }
    }

    async function syncFromDevice() {
        try {
            setBusy(true);
            setStatus(els.importStatus, "Preparing device sync...");

            const { dictionary: parsedDictionary, deviceState } = await fetchFullDeviceSync();
            await saveParsedDictionary(parsedDictionary, deviceState, `Full sync saved ${parsedDictionary.entryCount} chord entries plus device settings and layout.`);

            console.log("[CCH options] parsed and saved full device state", {
                source: parsedDictionary.source,
                deviceEntryCount: parsedDictionary.deviceEntryCount,
                entryCount: parsedDictionary.entryCount,
                deviceState
            });
        } catch (error) {
            console.error(error);
            setStatus(els.importStatus, error.message || "Failed to sync from connected Charachorder.", true);
        } finally {
            setBusy(false);
        }
    }

    async function consumeSyncIntent() {
        const url = new URL(window.location.href);
        const wantsSync = url.searchParams.get("syncIntent") === "1";
        const stored = await getStorage([STORAGE_KEYS.optionsSyncIntent]);
        const hasStoredSyncIntent = Boolean(stored[STORAGE_KEYS.optionsSyncIntent]);

        if (!wantsSync && !hasStoredSyncIntent) return false;

        if (wantsSync) {
            url.searchParams.delete("syncIntent");
            const nextUrl =
                url.pathname +
                (url.searchParams.toString() ? `?${url.searchParams.toString()}` : "") +
                url.hash;

            history.replaceState(null, "", nextUrl);
        }

        if (hasStoredSyncIntent) {
            await removeStorage([STORAGE_KEYS.optionsSyncIntent]);
        }

        return true;
    }

    function showPendingSyncPrompt() {
        setStatus(
            els.importStatus,
            'Ready to sync. Click "Full sync: chords, settings, layout" and select your device from the menu.'
        );

        els.syncDeviceButton.classList.add("pendingSync");
        els.syncDeviceButton.focus();

        const clearPrompt = () => {
            els.syncDeviceButton.classList.remove("pendingSync");
            document.removeEventListener("pointerdown", onPointerDown, true);
            document.removeEventListener("focusin", onFocusIn, true);
            els.syncDeviceButton.removeEventListener("click", clearPrompt);
            setStatus(els.importStatus, "");
        };

        const onPointerDown = (event) => {
            if (!els.syncDeviceButton.contains(event.target)) {
                clearPrompt();
            }
        };

        const onFocusIn = (event) => {
            if (!els.syncDeviceButton.contains(event.target)) {
                clearPrompt();
            }
        };

        document.addEventListener("pointerdown", onPointerDown, true);
        document.addEventListener("focusin", onFocusIn, true);
        els.syncDeviceButton.addEventListener("click", clearPrompt, {once: true});
    }

    async function clearDictionary() {
        try {
            setBusy(true);
            await removeStorage([STORAGE_KEYS.parsedDictionary, STORAGE_KEYS.inputDisplayOverrides, STORAGE_KEYS.exportWordPreferences, STORAGE_KEYS.deviceState]);
            currentRawDictionary = null;
            currentDeviceState = null;
            currentDictionary = null;
            inputDisplayOverrides = {};
            exportWordPreferences = {};
            expandedEditorRows = new Set();
            draftInputEdits = {};
            currentPage = 1;
            refreshMeta(null);
            renderLoadedChords(currentSettingsFromForm());
            renderExportSection();
            setStatus(els.importStatus, "Cleared saved dictionary.");
        } finally {
            setBusy(false);
        }
    }

    async function resetSingleRow(entryIndex) {
        const nextOverrides = {...(inputDisplayOverrides || {})};
        delete nextOverrides[String(entryIndex)];
        inputDisplayOverrides = nextOverrides;
        delete draftInputEdits[String(entryIndex)];
        expandedEditorRows.delete(entryIndex);
        await setStorage({[STORAGE_KEYS.inputDisplayOverrides]: inputDisplayOverrides});
        applyCurrentDictionary();
        renderLoadedChords(currentSettingsFromForm());
        setStatus(els.importStatus, `Reset entry ${entryIndex} to the parsed device view.`);
    }

    async function saveEditedInputOverride() {
        const dirtyIndices = dirtyDraftEntryIndices();
        if (!dirtyIndices.length) return;

        const nextOverrides = {...(inputDisplayOverrides || {})};

        dirtyIndices.forEach((entryIndex) => {
            const baseTexts = baseEntrySegments(entryIndex);
            const draftTexts = currentDraftSegments(entryIndex).map((value) => String(value ?? ""));
            const matchesBase = draftTexts.length === baseTexts.length
                && draftTexts.every((value, index) => value === baseTexts[index]);

            if (matchesBase) {
                delete nextOverrides[String(entryIndex)];
            } else {
                nextOverrides[String(entryIndex)] = draftTexts;
            }
        });

        inputDisplayOverrides = nextOverrides;
        await setStorage({[STORAGE_KEYS.inputDisplayOverrides]: inputDisplayOverrides});
        applyCurrentDictionary();
        draftInputEdits = {};
        expandedEditorRows = new Set();
        renderLoadedChords(currentSettingsFromForm());
        setStatus(els.importStatus, `Saved ${dirtyIndices.length} edited input${dirtyIndices.length === 1 ? "" : "s"}.`);
    }

    async function revertEditedInputOverride() {
        const dirtyCount = dirtyDraftEntryIndices().length;
        if (!dirtyCount) return;

        draftInputEdits = {};
        expandedEditorRows = new Set();
        renderLoadedChords(currentSettingsFromForm());
        setStatus(els.importStatus, `Discarded ${dirtyCount} unsaved edit${dirtyCount === 1 ? "" : "s"}.`);
    }


    function setSaveButtonsLabel(label) {
        if (els.saveSettingsButton) els.saveSettingsButton.textContent = label;
        if (els.saveSettingsButtonSecondary) els.saveSettingsButtonSecondary.textContent = label;
    }

    function flashSavedButtons() {
        if (saveButtonsResetTimer) {
            window.clearTimeout(saveButtonsResetTimer);
        }
        setSaveButtonsLabel("SAVED!");
        saveButtonsResetTimer = window.setTimeout(() => {
            setSaveButtonsLabel("Save settings");
            saveButtonsResetTimer = null;
        }, 2000);
    }

    async function saveSettings() {
        try {
            stopHotkeyRecording();
            const settings = currentSettingsFromForm();
            draftSettings = settings;
            await setStorage({[STORAGE_KEYS.settings]: settings});
            renderLoadedChords(settings);
            setStatus(els.settingsStatus, "");
            flashSavedButtons();
            console.log("[CCH options] saved settings", settings);
        } catch (error) {
            console.error(error);
            setSaveButtonsLabel("Save settings");
            setStatus(els.settingsStatus, "Failed to save settings.", true);
        }
    }


    async function resetSettingsToDefaults() {
        const confirmed = window.confirm("Return all settings to their default values? This will overwrite your current saved settings.");
        if (!confirmed) return;

        try {
            setBusy(true);
            stopHotkeyRecording();
            const defaults = hydrateSettings(CCHShared.defaultSettings());
            const defaultExportFilterSettings = CCHShared.hydrateExportFilterSettings(DEFAULT_EXPORT_FILTER_SETTINGS);
            applySettingsToForm(defaults);
            applyExportFilterSettings(defaultExportFilterSettings);
            updateAppearancePreview(defaults);
            await setStorage({
                [STORAGE_KEYS.settings]: defaults,
                [STORAGE_KEYS.exportFilterSettings]: defaultExportFilterSettings
            });
            renderLoadedChords(defaults);
            renderExportSection();
            setStatus(els.settingsStatus, "Settings returned to defaults.");
        } catch (error) {
            console.error(error);
            setStatus(els.settingsStatus, error.message || String(error), true);
        } finally {
            setBusy(false);
        }
    }
    
    async function saveThemeModePreference(themeMode) {
        const nextThemeMode = themeMode || "system";
        syncThemeControls(nextThemeMode);
        applyOptionsTheme(nextThemeMode);

        try {
            const stored = await getStorage([STORAGE_KEYS.settings]);
            const savedSettings = hydrateSettings(stored[STORAGE_KEYS.settings]);
            const nextSettings = {
                ...savedSettings,
                themeMode: nextThemeMode
            };

            await setStorage({[STORAGE_KEYS.settings]: nextSettings});
            setStatus(els.settingsStatus, "");
        } catch (error) {
            console.error(error);
            setStatus(els.settingsStatus, "Failed to save theme preference.", true);
        }
    }


    function initializeCollapsibleSections() {
        const cards = Array.from(document.querySelectorAll("main > section.card"));
        cards.slice(1).forEach((section) => {
            if (section.dataset.collapsibleInitialized === "true") return;

            const heading = section.querySelector("h2");
            if (!heading) return;

            const toggle = document.createElement("button");
            toggle.type = "button";
            toggle.className = "collapseToggle";
            toggle.setAttribute("aria-expanded", "true");

            const label = document.createElement("span");
            label.className = "collapseLabel";
            if (heading.childNodes.length) {
                label.replaceChildren(...Array.from(heading.childNodes).map((node) => node.cloneNode(true)));
            } else {
                label.textContent = heading.textContent || "Section";
            }

            const chevron = document.createElement("span");
            chevron.className = "collapseChevron";
            chevron.setAttribute("aria-hidden", "true");
            chevron.textContent = "▾";

            toggle.append(label, chevron);
            heading.replaceWith(toggle);

            const body = document.createElement("div");
            body.className = "collapsibleSectionBody";
            while (toggle.nextSibling) {
                body.appendChild(toggle.nextSibling);
            }
            section.appendChild(body);

            toggle.addEventListener("click", () => {
                const isExpanded = toggle.getAttribute("aria-expanded") === "true";
                const nextExpanded = !isExpanded;
                toggle.setAttribute("aria-expanded", String(nextExpanded));
                body.hidden = !nextExpanded;
                section.classList.toggle("collapsedSection", !nextExpanded);
            });

            const defaultCollapsed = section.dataset.collapsedDefault === "true";
            if (defaultCollapsed) {
                toggle.setAttribute("aria-expanded", "false");
                body.hidden = true;
                section.classList.add("collapsedSection");
            }

            section.dataset.collapsibleInitialized = "true";
        });
    }

    async function loadInitialState() {
        const stored = await getStorage([
            STORAGE_KEYS.parsedDictionary,
            STORAGE_KEYS.inputDisplayOverrides,
            STORAGE_KEYS.exportWordPreferences,
            STORAGE_KEYS.exportFilterSettings,
            STORAGE_KEYS.settings,
            STORAGE_KEYS.deviceState
        ]);
        currentRawDictionary = hydrateDictionary(stored[STORAGE_KEYS.parsedDictionary]);
        currentDeviceState = stored[STORAGE_KEYS.deviceState] || null;
        inputDisplayOverrides = stored[STORAGE_KEYS.inputDisplayOverrides] || {};
        exportWordPreferences = CCHShared.normalizeExportWordPreferences(stored[STORAGE_KEYS.exportWordPreferences]);
        applyCurrentDictionary();
        exportWordPreferences = CCHShared.pruneExportWordPreferences(exportWordPreferences, currentDictionary);
        applyExportFilterSettings(stored[STORAGE_KEYS.exportFilterSettings]);
        const settings = hydrateSettings(stored[STORAGE_KEYS.settings]);

        applySettingsToForm(settings);
        refreshMeta(currentDictionary);
        renderLoadedChords(settings);
        renderExportSection();

        if (await consumeSyncIntent()) {
            showPendingSyncPrompt();
        }
    }

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "local") return;
        if (changes[STORAGE_KEYS.settings]?.newValue) {
            const settings = hydrateSettings(changes[STORAGE_KEYS.settings].newValue);
            applySettingsToForm(settings);
            renderLoadedChords(settings);
        }

        if (Object.prototype.hasOwnProperty.call(changes, STORAGE_KEYS.exportFilterSettings)) {
            applyExportFilterSettings(changes[STORAGE_KEYS.exportFilterSettings].newValue);
            renderExportSection();
        }

        if (!changes[STORAGE_KEYS.optionsSyncIntent]?.newValue) return;

        void removeStorage([STORAGE_KEYS.optionsSyncIntent]).catch(console.error);
        showPendingSyncPrompt();
    });

    systemThemeQuery.addEventListener("change", () => {
        const preference = themeModeFromControls();
        if (preference === "system") {
            syncThemeControls("system");
            applyOptionsTheme("system");
        }
    });

    document.addEventListener("keydown", handleHotkeyRecordingKeydown, true);
    
    els.importButton.addEventListener("click", importJson);
    els.syncDeviceButton.addEventListener("click", syncFromDevice);
    els.clearButton.addEventListener("click", clearDictionary);
    function handleThemeControlsChanged() {
        const themeMode = themeModeFromControls();
        syncThemeControls(themeMode);
        void saveThemeModePreference(themeMode);
    }

    els.optionsThemeToggle.addEventListener("change", handleThemeControlsChanged);
    els.optionsUseSystemTheme.addEventListener("change", handleThemeControlsChanged);
    HOTKEY_BINDINGS.forEach(([settingKey, buttonKey]) => {
        const button = els[buttonKey];
        if (!button) return;
        button.addEventListener("click", () => {
            beginHotkeyRecording(settingKey);
        });
    });
    els.saveSettingsButton.addEventListener("click", saveSettings);
    if (els.saveSettingsButtonSecondary) els.saveSettingsButtonSecondary.addEventListener("click", saveSettings);
    if (els.returnToDefaultsButton) els.returnToDefaultsButton.addEventListener("click", resetSettingsToDefaults);
    if (els.returnToDefaultsButtonSecondary) els.returnToDefaultsButtonSecondary.addEventListener("click", resetSettingsToDefaults);
    els.saveInputOverrideButton.addEventListener("click", saveEditedInputOverride);
    els.revertInputOverrideButton.addEventListener("click", revertEditedInputOverride);
    els.hideBlankOutputsToggle.checked = true;
    els.hideBlankOutputsToggle.addEventListener("change", () => {
        hideBlankOutputs = els.hideBlankOutputsToggle.checked;
        currentPage = 1;
        renderLoadedChords(currentSettingsFromForm());
    });

    els.hideNonAlphanumericOutputsToggle.checked = true;
    els.hideNonAlphanumericOutputsToggle.addEventListener("change", () => {
        hideNonAlphanumericOutputs = els.hideNonAlphanumericOutputsToggle.checked;
        currentPage = 1;
        renderLoadedChords(currentSettingsFromForm());
    });

    els.toggleAllExportable.addEventListener("change", () => {
        setAllEntriesExportable(els.toggleAllExportable.checked);
    });

    els.minimumExportLength.addEventListener("input", () => {
        minimumExportLength = CCHShared.hydrateExportFilterSettings({
            minimumExportLength: els.minimumExportLength.value,
            exportNonAlphanumericMode,
            exportRespectExportable
        }).minimumExportLength;
        renderExportSection();
        saveExportFilterSettingsQuietly();
    });

    els.minimumExportLength.addEventListener("change", () => {
        minimumExportLength = CCHShared.hydrateExportFilterSettings({
            minimumExportLength: els.minimumExportLength.value,
            exportNonAlphanumericMode,
            exportRespectExportable
        }).minimumExportLength;
        els.minimumExportLength.value = String(minimumExportLength);
        renderExportSection();
        saveExportFilterSettingsQuietly();
    });

    els.exportNonAlphanumericMode.addEventListener("change", () => {
        exportNonAlphanumericMode = CCHShared.hydrateExportFilterSettings({
            minimumExportLength,
            exportNonAlphanumericMode: els.exportNonAlphanumericMode.value,
            exportRespectExportable
        }).exportNonAlphanumericMode;
        els.exportNonAlphanumericMode.value = exportNonAlphanumericMode;
        renderExportSection();
        saveExportFilterSettingsQuietly();
    });

    els.exportRespectExportable.addEventListener("change", () => {
        exportRespectExportable = els.exportRespectExportable.checked;
        renderExportSection();
        saveExportFilterSettingsQuietly();
    });

    els.copyExportWordsButton.addEventListener("click", () => {
        void copyExportWordsToClipboard();
    });

    els.exportTextFileButton.addEventListener("click", () => {
        exportWordsToTextFile();
    });

    els.exportCsvButton.addEventListener("click", () => {
        exportWordsToCsvFile();
    });

    els.inputSearchBox.addEventListener("input", () => {
        inputSearchQuery = els.inputSearchBox.value || "";
        currentPage = 1;
        renderLoadedChords(currentSettingsFromForm());
    });
    els.outputSearchBox.addEventListener("input", () => {
        outputSearchQuery = els.outputSearchBox.value || "";
        currentPage = 1;
        renderLoadedChords(currentSettingsFromForm());
    });
    els.sortInputButton.addEventListener("click", () => setSort("input"));
    els.sortOutputButton.addEventListener("click", () => setSort("output"));

    els.prevPageButton.addEventListener("click", () => {
        goToPage(currentPage - 1);
    });

    els.nextPageButton.addEventListener("click", () => {
        goToPage(currentPage + 1);
    });

    els.pageJumpButton.addEventListener("click", () => {
        goToPage(Number.parseInt(els.pageJumpInput.value, 10) || 1);
    });

    els.pageJumpInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            goToPage(Number.parseInt(els.pageJumpInput.value, 10) || 1);
        }
    });

    [
        els.hintBoxDarkModeColor,
        els.hintBoxDarkModeOpacity,
        els.hintTextDarkModeColor,
        els.hintBoxLightModeColor,
        els.hintBoxLightModeOpacity,
        els.hintTextLightModeColor,
        els.hintTextFontSizeValue,
        els.hintPosition,
        els.hintDisplay,
        els.hintCharacterOrderMode,
        els.showChordableWordOutlines
    ].forEach((el) => {
        el.addEventListener("input", () => updateAppearancePreview(currentSettingsFromForm()));
        el.addEventListener("change", () => updateAppearancePreview(currentSettingsFromForm()));
    });

    els.hintTextFontSizeUnit.addEventListener("change", () => {
        const nextUnit = els.hintTextFontSizeUnit.value === "px" ? "px" : "em";
        const previousUnit = els.hintTextFontSizeUnit.dataset.previousUnit === "px" ? "px" : "em";
        convertHintTextSizeValueForUnitChange(previousUnit, nextUnit);
        syncHintTextSizeFieldBehavior();
        els.hintTextFontSizeUnit.dataset.previousUnit = nextUnit;
        updateAppearancePreview(currentSettingsFromForm());
    });

    [els.hintCharacterOrderMode].forEach((el) => {
        el.addEventListener("input", () => renderLoadedChords(currentSettingsFromForm()));
        el.addEventListener("change", () => renderLoadedChords(currentSettingsFromForm()));
    });

    [els.hintPreviewDark, els.hintPreviewLight].forEach((el) => {
        el.addEventListener("click", (event) => {
            event.preventDefault();
            togglePreviewHintDisplay(el);
        });
    });

    initializeCollapsibleSections();

    loadInitialState().catch((error) => {
        console.error(error);
        setStatus(els.importStatus, "Failed to load existing settings.", true);
    });
})();
