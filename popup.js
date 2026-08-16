(() => {
    const STORAGE_KEYS = {
        parsedDictionary: "parsedDictionary",
        exportWordPreferences: "exportWordPreferences",
        exportFilterSettings: "exportFilterSettings",
        settings: "settings",
        optionsSyncIntent: "optionsSyncIntent"
    };
    const DEFAULT_EXPORT_FILTER_SETTINGS = CCHShared.defaultExportFilterSettings();

    const els = {
        popupSyncButton: document.getElementById("popupSyncButton"),
        popupSaveButton: document.getElementById("popupSaveButton"),
        popupResetButton: document.getElementById("popupResetButton"),
        popupStatus: document.getElementById("popupStatus"),
        popupThemeToggle: document.getElementById("popupThemeToggle"),
        popupUseSystemTheme: document.getElementById("popupUseSystemTheme"),
        popupHintBoxDarkModeColor: document.getElementById("popupHintBoxDarkModeColor"),
        popupHintTextDarkModeColor: document.getElementById("popupHintTextDarkModeColor"),
        popupHintBoxDarkModeOpacity: document.getElementById("popupHintBoxDarkModeOpacity"),
        popupHintBoxLightModeColor: document.getElementById("popupHintBoxLightModeColor"),
        popupHintTextLightModeColor: document.getElementById("popupHintTextLightModeColor"),
        popupHintBoxLightModeOpacity: document.getElementById("popupHintBoxLightModeOpacity"),
        popupHintTextFontSizeValue: document.getElementById("popupHintTextFontSizeValue"),
        popupHintTextFontSizeUnit: document.getElementById("popupHintTextFontSizeUnit"),
        popupHintPosition: document.getElementById("popupHintPosition"),
        popupHintDisplay: document.getElementById("popupHintDisplay"),
        popupEnableSubstringHints: document.getElementById("popupEnableSubstringHints"),
        popupShowChordableWordOutlines: document.getElementById("popupShowChordableWordOutlines"),
        popupMinimumWordLength: document.getElementById("popupMinimumWordLength"),
        popupHintCharacterOrderMode: document.getElementById("popupHintCharacterOrderMode"),
        popupLightPreviewHint: document.getElementById("popupLightPreviewHint"),
        popupDarkPreviewHint: document.getElementById("popupDarkPreviewHint"),
        popupLightPreviewWord: document.getElementById("popupLightPreviewWord"),
        popupDarkPreviewWord: document.getElementById("popupDarkPreviewWord"),
        popupEnabledButton: document.getElementById("popupEnabledButton"),
        popupAppearanceTab: document.getElementById("popupAppearanceTab"),
        popupHotkeysTab: document.getElementById("popupHotkeysTab"),
        popupChordableWordsTab: document.getElementById("popupChordableWordsTab"),
        popupAppearancePanel: document.getElementById("popupAppearancePanel"),
        popupHotkeysPanel: document.getElementById("popupHotkeysPanel"),
        popupChordableWordsPanel: document.getElementById("popupChordableWordsPanel"),
        popupRecordToggleHintsHotkeyButton: document.getElementById("popupRecordToggleHintsHotkeyButton"),
        popupRecordToggleHintDisplayHotkeyButton: document.getElementById("popupRecordToggleHintDisplayHotkeyButton"),
        popupMinimumExportLength: document.getElementById("popupMinimumExportLength"),
        popupExportNonAlphanumericMode: document.getElementById("popupExportNonAlphanumericMode"),
        popupExportRespectExportable: document.getElementById("popupExportRespectExportable"),
        popupExportWordsOutput: document.getElementById("popupExportWordsOutput"),
        popupCopyExportWordsButton: document.getElementById("popupCopyExportWordsButton"),
        popupExportTextFileButton: document.getElementById("popupExportTextFileButton"),
        popupExportCsvButton: document.getElementById("popupExportCsvButton")
    };

    const systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");

    let draftSettings = hydrateSettings(CCHShared.defaultSettings());
    let currentDictionary = null;
    let exportWordPreferences = {};
    let minimumExportLength = DEFAULT_EXPORT_FILTER_SETTINGS.minimumExportLength;
    let exportNonAlphanumericMode = DEFAULT_EXPORT_FILTER_SETTINGS.exportNonAlphanumericMode;
    let exportRespectExportable = DEFAULT_EXPORT_FILTER_SETTINGS.exportRespectExportable;
    let activeTab = "appearance";
    let saveResetTimer = null;
    let exportDataLoaded = false;
    let exportDataLoadingPromise = null;
    let resetConfirmTimer = null;
    let resetConfirmationArmed = false;
    let resetConfirmationCleanup = null;
    let recordingHotkeyTarget = null;
    const HOTKEY_BINDINGS = [
        ["toggleHintsHotkey", "popupRecordToggleHintsHotkeyButton"],
        ["toggleHintDisplayHotkey", "popupRecordToggleHintDisplayHotkeyButton"]
    ];

    function getStorage(keys) {
        return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
    }

    function setStorage(values) {
        return new Promise((resolve) => chrome.storage.local.set(values, resolve));
    }

    function clampNumber(value, min, max, fallback) {
        const number = Number(value);
        if (!Number.isFinite(number)) return fallback;
        return Math.min(max, Math.max(min, number));
    }

    function hexToRgba(hex, opacity) {
        const raw = String(hex || "").trim().replace(/^#/, "");
        if (!/^[0-9a-fA-F]{6}$/.test(raw)) {
            return hex || "transparent";
        }
        const red = parseInt(raw.slice(0, 2), 16);
        const green = parseInt(raw.slice(2, 4), 16);
        const blue = parseInt(raw.slice(4, 6), 16);
        const alpha = clampNumber(opacity, 0, 1, 1);
        return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
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
        const unit = els.popupHintTextFontSizeUnit.value === "px" ? "px" : "em";
        const max = unit === "px" ? 64 : 4;
        const min = unit === "px" ? 1 : 0.1;
        const step = unit === "px" ? 1 : 0.1;
        const currentValue = clampNumber(
            els.popupHintTextFontSizeValue.value,
            min,
            max,
            unit === "px" ? 14 : 0.5
        );

        els.popupHintTextFontSizeValue.min = String(min);
        els.popupHintTextFontSizeValue.max = String(max);
        els.popupHintTextFontSizeValue.step = String(step);
        els.popupHintTextFontSizeValue.value = unit === "px"
            ? String(Math.round(currentValue))
            : String(Math.round(currentValue * 10) / 10);
    }

    function getAppearancePreviewEmBasePx() {
        const previewAnchor = els.popupLightPreviewWord || els.popupDarkPreviewWord;
        const previewFontSize = Number.parseFloat(window.getComputedStyle(previewAnchor).fontSize);
        return Number.isFinite(previewFontSize) && previewFontSize > 0 ? previewFontSize : 16;
    }

    function convertHintTextSizeValueForUnitChange(previousUnit, nextUnit) {
        if (previousUnit === nextUnit) {
            return;
        }

        const currentValue = Number(els.popupHintTextFontSizeValue.value);
        if (!Number.isFinite(currentValue)) {
            return;
        }

        const previewEmBasePx = getAppearancePreviewEmBasePx();
        const convertedValue = previousUnit === "px"
            ? currentValue / previewEmBasePx
            : currentValue * previewEmBasePx;

        els.popupHintTextFontSizeValue.value = String(convertedValue);
    }

    function updateAppearancePreview() {
        const settings = currentSettingsFromForm();
        const fontSize = `${settings.hint_text_font_size_value}${settings.hint_text_font_size_unit}`;
        const alignClass = settings.hint_position === "center" ? "popupPreviewAlignCenter" : "popupPreviewAlignLeft";
        const revealOnHover = settings.hint_display === "hover";
        const hintOrderMode = settings.hintCharacterOrderMode === "charachorder-default"
            ? "charachorder-default"
            : "best-match";
        const previewHints = [els.popupDarkPreviewHint, els.popupLightPreviewHint];
        const previousDisplayMode = els.popupDarkPreviewHint.dataset.previewDisplayMode;

        if (previousDisplayMode && previousDisplayMode !== settings.hint_display) {
            previewHints.forEach((label) => {
                label.classList.remove("popupPreviewHintForceVisible", "popupPreviewHintForceHidden");
            });
        }

        previewHints.forEach((label) => {
            label.dataset.previewDisplayMode = settings.hint_display;
        });

        els.popupDarkPreviewHint.textContent = previewHintTextForWord("dark", hintOrderMode);
        els.popupLightPreviewHint.textContent = previewHintTextForWord("light", hintOrderMode);

        els.popupLightPreviewHint.style.background = hexToRgba(
            settings.hint_box_light_mode_color,
            settings.hint_box_light_mode_opacity
        );
        els.popupLightPreviewHint.style.color = settings.hint_text_light_mode_color;
        els.popupLightPreviewHint.style.setProperty("--cch-preview-hint-text-color", settings.hint_text_light_mode_color);
        els.popupLightPreviewHint.style.fontSize = fontSize;
        els.popupLightPreviewHint.classList.toggle("popupPreviewAlignLeft", alignClass === "popupPreviewAlignLeft");
        els.popupLightPreviewHint.classList.toggle("popupPreviewAlignCenter", alignClass === "popupPreviewAlignCenter");
        els.popupLightPreviewHint.classList.toggle("popupPreviewHintHoverReveal", revealOnHover);
        els.popupLightPreviewWord.classList.toggle("popupPreviewWordOutlined", settings.showChordableWordOutlines);
        els.popupLightPreviewWord.style.setProperty("--cch-preview-word-outline-color", settings.hint_box_light_mode_color);

        els.popupDarkPreviewHint.style.background = hexToRgba(
            settings.hint_box_dark_mode_color,
            settings.hint_box_dark_mode_opacity
        );
        els.popupDarkPreviewHint.style.color = settings.hint_text_dark_mode_color;
        els.popupDarkPreviewHint.style.setProperty("--cch-preview-hint-text-color", settings.hint_text_dark_mode_color);
        els.popupDarkPreviewHint.style.fontSize = fontSize;
        els.popupDarkPreviewHint.classList.toggle("popupPreviewAlignLeft", alignClass === "popupPreviewAlignLeft");
        els.popupDarkPreviewHint.classList.toggle("popupPreviewAlignCenter", alignClass === "popupPreviewAlignCenter");
        els.popupDarkPreviewHint.classList.toggle("popupPreviewHintHoverReveal", revealOnHover);
        els.popupDarkPreviewWord.classList.toggle("popupPreviewWordOutlined", settings.showChordableWordOutlines);
        els.popupDarkPreviewWord.style.setProperty("--cch-preview-word-outline-color", settings.hint_box_dark_mode_color);
    }

    function togglePreviewHintDisplay(label) {
        if (label.classList.contains("popupPreviewHintForceVisible")) {
            label.classList.remove("popupPreviewHintForceVisible");
            label.classList.add("popupPreviewHintForceHidden");
            return;
        }

        if (label.classList.contains("popupPreviewHintForceHidden")) {
            label.classList.remove("popupPreviewHintForceHidden");
            return;
        }

        if (currentSettingsFromForm().hint_display === "hover") {
            label.classList.add("popupPreviewHintForceVisible");
        } else {
            label.classList.add("popupPreviewHintForceHidden");
        }
    }

    function hydrateSettings(rawSettings) {
        const defaults = CCHShared.defaultSettings();
        const settings = {
            ...defaults,
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
        settings.hint_text_font_size_value = clampNumber(rawHintTextSizeValue, 0.1, 64, 0.5);
        settings.hint_text_font_size_unit = settings.hint_text_font_size_unit === "px" ? "px" : "em";
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

    function resolveTheme(themeMode) {
        if (themeMode === "dark") return "dark";
        if (themeMode === "light") return "light";
        return systemThemeQuery.matches ? "dark" : "light";
    }

    function themeModeFromControls() {
        if (els.popupUseSystemTheme.checked) {
            return "system";
        }
        return els.popupThemeToggle.checked ? "dark" : "light";
    }

    function syncThemeControls(themeMode) {
        const preference = themeMode || "system";
        const resolvedTheme = resolveTheme(preference);
        els.popupUseSystemTheme.checked = preference === "system";
        els.popupThemeToggle.checked = resolvedTheme === "dark";
        els.popupThemeToggle.disabled = preference === "system";
    }

    function applyPopupTheme(themeMode) {
        const preference = themeMode || "system";
        const resolvedTheme = resolveTheme(preference);
        document.documentElement.setAttribute("data-theme", resolvedTheme);
        document.documentElement.setAttribute("data-theme-preference", preference);
    }

    function setStatus(message, isError = false) {
        els.popupStatus.textContent = message || "";
        els.popupStatus.classList.toggle("error", Boolean(isError));
    }

    function flashSavedButton() {
        if (saveResetTimer) window.clearTimeout(saveResetTimer);
        els.popupSaveButton.textContent = "SAVED!";
        saveResetTimer = window.setTimeout(() => {
            els.popupSaveButton.textContent = "Save settings";
            saveResetTimer = null;
        }, 2000);
    }

    function setExportControlsDisabled(disabled) {
        const isDisabled = Boolean(disabled);
        els.popupMinimumExportLength.disabled = isDisabled;
        els.popupExportNonAlphanumericMode.disabled = isDisabled;
        els.popupExportRespectExportable.disabled = isDisabled;
        els.popupCopyExportWordsButton.disabled = isDisabled;
        els.popupExportTextFileButton.disabled = isDisabled;
        els.popupExportCsvButton.disabled = isDisabled;
    }

    function initializeExportTabState() {
        setExportControlsDisabled(true);
        els.popupExportWordsOutput.value = "";
        els.popupExportWordsOutput.placeholder = "Open this tab to load chordable words.";
    }

    async function ensureExportDataLoaded() {
        if (exportDataLoaded) {
            return;
        }

        if (exportDataLoadingPromise) {
            await exportDataLoadingPromise;
            return;
        }

        exportDataLoadingPromise = (async () => {
            const stored = await getStorage([
                STORAGE_KEYS.parsedDictionary,
                STORAGE_KEYS.exportWordPreferences,
                STORAGE_KEYS.exportFilterSettings
            ]);

            currentDictionary = hydrateDictionary(stored[STORAGE_KEYS.parsedDictionary]);
            exportWordPreferences = CCHShared.normalizeExportWordPreferences(stored[STORAGE_KEYS.exportWordPreferences]);
            exportWordPreferences = CCHShared.pruneExportWordPreferences(exportWordPreferences, currentDictionary);
            applyExportFilterSettings(stored[STORAGE_KEYS.exportFilterSettings]);
            renderExportWords();
            exportDataLoaded = true;
        })();

        try {
            await exportDataLoadingPromise;
        } finally {
            exportDataLoadingPromise = null;
        }
    }

    function clearResetConfirmation() {
        if (resetConfirmationCleanup) {
            resetConfirmationCleanup();
            resetConfirmationCleanup = null;
        }
        if (resetConfirmTimer) {
            window.clearTimeout(resetConfirmTimer);
            resetConfirmTimer = null;
        }
        resetConfirmationArmed = false;
        els.popupResetButton.textContent = "Revert to defaults";
        els.popupResetButton.classList.remove("popupResetButtonConfirming");
    }

    function armResetConfirmation() {
        if (resetConfirmTimer) {
            window.clearTimeout(resetConfirmTimer);
        }
        resetConfirmationArmed = true;
        els.popupResetButton.textContent = "Click to confirm reset";
        els.popupResetButton.classList.add("popupResetButtonConfirming");
        els.popupResetButton.focus();

        const clearPrompt = () => {
            clearResetConfirmation();
        };

        const onPointerDown = (event) => {
            if (!els.popupResetButton.contains(event.target)) {
                clearPrompt();
            }
        };

        const onFocusIn = (event) => {
            if (!els.popupResetButton.contains(event.target)) {
                clearPrompt();
            }
        };

        document.addEventListener("pointerdown", onPointerDown, true);
        document.addEventListener("focusin", onFocusIn, true);
        els.popupResetButton.addEventListener("click", clearPrompt, {once: true});
        resetConfirmationCleanup = () => {
            document.removeEventListener("pointerdown", onPointerDown, true);
            document.removeEventListener("focusin", onFocusIn, true);
            els.popupResetButton.removeEventListener("click", clearPrompt);
        };

        resetConfirmTimer = window.setTimeout(() => {
            clearResetConfirmation();
        }, 5000);
    }

    function applySettingsToForm(settings) {
        draftSettings = hydrateSettings(settings);
        syncThemeControls(settings.themeMode || "system");
        applyPopupTheme(settings.themeMode || "system");
        els.popupHintBoxDarkModeColor.value = settings.hint_box_dark_mode_color;
        els.popupHintTextDarkModeColor.value = settings.hint_text_dark_mode_color;
        els.popupHintBoxDarkModeOpacity.value = settings.hint_box_dark_mode_opacity;
        els.popupHintBoxLightModeColor.value = settings.hint_box_light_mode_color;
        els.popupHintTextLightModeColor.value = settings.hint_text_light_mode_color;
        els.popupHintBoxLightModeOpacity.value = settings.hint_box_light_mode_opacity;
        els.popupHintTextFontSizeValue.value = settings.hint_text_font_size_value ?? settings.hint_text_font_size_em;
        els.popupHintTextFontSizeUnit.value = settings.hint_text_font_size_unit || "em";
        els.popupHintTextFontSizeUnit.dataset.previousUnit = els.popupHintTextFontSizeUnit.value;
        els.popupHintPosition.value = settings.hint_position || "left";
        els.popupHintDisplay.value = settings.hint_display || "always";
        els.popupEnableSubstringHints.checked = settings.enableSubstringHints;
        els.popupShowChordableWordOutlines.checked = settings.showChordableWordOutlines;
        els.popupMinimumWordLength.value = settings.minimumWordLength;
        els.popupHintCharacterOrderMode.value = settings.hintCharacterOrderMode;
        updateHotkeyButtonLabels();
        syncHintTextSizeFieldBehavior();
        updateAppearancePreview();
        updateEnabledButton(settings.enabled);
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

    function currentSettingsFromForm() {
        const defaults = CCHShared.defaultSettings();
        return hydrateSettings({
            ...draftSettings,
            themeMode: themeModeFromControls(),
            hint_box_dark_mode_color: els.popupHintBoxDarkModeColor.value || defaults.hint_box_dark_mode_color,
            hint_text_dark_mode_color: els.popupHintTextDarkModeColor.value || defaults.hint_text_dark_mode_color,
            hint_box_dark_mode_opacity: clampNumber(els.popupHintBoxDarkModeOpacity.value, 0, 1, defaults.hint_box_dark_mode_opacity),
            hint_box_light_mode_color: els.popupHintBoxLightModeColor.value || defaults.hint_box_light_mode_color,
            hint_text_light_mode_color: els.popupHintTextLightModeColor.value || defaults.hint_text_light_mode_color,
            hint_box_light_mode_opacity: clampNumber(els.popupHintBoxLightModeOpacity.value, 0, 1, defaults.hint_box_light_mode_opacity),
            hint_text_font_size_value: clampNumber(
                els.popupHintTextFontSizeValue.value,
                0.1,
                els.popupHintTextFontSizeUnit.value === "px" ? 64 : 4,
                defaults.hint_text_font_size_value ?? defaults.hint_text_font_size_em
            ),
            hint_text_font_size_unit: els.popupHintTextFontSizeUnit.value === "px" ? "px" : "em",
            hint_text_font_size_em: els.popupHintTextFontSizeUnit.value === "em"
                ? clampNumber(els.popupHintTextFontSizeValue.value, 0.1, 4, defaults.hint_text_font_size_em)
                : defaults.hint_text_font_size_em,
            hint_position: els.popupHintPosition.value === "center" ? "center" : "left",
            hint_display: els.popupHintDisplay.value === "hover" ? "hover" : "always",
            enableSubstringHints: els.popupEnableSubstringHints.checked,
            showChordableWordOutlines: els.popupShowChordableWordOutlines.checked,
            minimumWordLength: CCHShared.normalizeMinimumWordLength
                ? CCHShared.normalizeMinimumWordLength(els.popupMinimumWordLength.value)
                : Math.max(1, Math.floor(Number(els.popupMinimumWordLength.value)) || defaults.minimumWordLength),
            hintCharacterOrderMode: CCHShared.normalizeHintCharacterOrderMode
                ? CCHShared.normalizeHintCharacterOrderMode(els.popupHintCharacterOrderMode.value)
                : (els.popupHintCharacterOrderMode.value === "charachorder-default"
                    ? "charachorder-default"
                    : "best-match"),
            enabled: draftSettings.enabled
        });
    }

    function hydrateDictionary(rawDictionary) {
        return CCHShared.hydrateParsedDictionary(rawDictionary);
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

        els.popupMinimumExportLength.value = String(minimumExportLength);
        els.popupExportNonAlphanumericMode.value = exportNonAlphanumericMode;
        els.popupExportRespectExportable.checked = exportRespectExportable;
    }

    async function saveExportFilterSettings() {
        await setStorage({[STORAGE_KEYS.exportFilterSettings]: currentExportFilterSettings()});
    }

    function saveExportFilterSettingsQuietly() {
        void saveExportFilterSettings().catch(console.error);
    }

    function exportedWordsForCurrentDictionary() {
        return CCHShared.buildExportedWords(currentDictionary, exportWordPreferences, currentExportFilterSettings());
    }

    function renderExportWords() {
        const exportedWords = exportedWordsForCurrentDictionary();
        const hasWords = exportedWords.length > 0;
        els.popupExportWordsOutput.value = CCHShared.buildExportWordsText(exportedWords);
        els.popupExportWordsOutput.placeholder = hasWords
            ? ""
            : "No chordable words to export yet.";
        setExportControlsDisabled(false);
        els.popupCopyExportWordsButton.disabled = !hasWords;
        els.popupExportTextFileButton.disabled = !hasWords;
        els.popupExportCsvButton.disabled = !hasWords;
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

    async function copyExportWordsToClipboard() {
        const text = els.popupExportWordsOutput.value || "";

        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
            } else {
                els.popupExportWordsOutput.focus();
                els.popupExportWordsOutput.select();
                document.execCommand("copy");
                els.popupExportWordsOutput.setSelectionRange(0, 0);
            }
            setStatus("Copied export words to clipboard.");
        } catch (error) {
            console.error(error);
            setStatus("Failed to copy export words.", true);
        }
    }

    function exportWordsToTextFile() {
        downloadBlob(
            "chordable-words.txt",
            CCHShared.buildExportWordsText(exportedWordsForCurrentDictionary()),
            "text/plain;charset=utf-8"
        );
        setStatus("Exported chordable words to text file.");
    }

    function exportWordsToCsvFile() {
        const csvContent = CCHShared.buildExportWordsCsv(exportedWordsForCurrentDictionary());
        downloadBlob("chordable-words.csv", csvContent, "text/csv;charset=utf-8");
        setStatus("Exported chordable words to CSV.");
    }

    function switchTab(tabName) {
        if (tabName === "hotkeys") {
            activeTab = "hotkeys";
        } else if (tabName === "chordable-words") {
            activeTab = "chordable-words";
        } else {
            activeTab = "appearance";
        }

        els.popupAppearanceTab.setAttribute("aria-selected", activeTab === "appearance" ? "true" : "false");
        els.popupHotkeysTab.setAttribute("aria-selected", activeTab === "hotkeys" ? "true" : "false");
        els.popupChordableWordsTab.setAttribute("aria-selected", activeTab === "chordable-words" ? "true" : "false");
        els.popupAppearancePanel.hidden = activeTab !== "appearance";
        els.popupHotkeysPanel.hidden = activeTab !== "hotkeys";
        els.popupChordableWordsPanel.hidden = activeTab !== "chordable-words";
    }

    async function openTab(tabName) {
        switchTab(tabName);
        if (activeTab !== "chordable-words") {
            return;
        }

        if (!exportDataLoaded) {
            els.popupExportWordsOutput.value = "";
            els.popupExportWordsOutput.placeholder = "Loading chordable words...";
            setExportControlsDisabled(true);
        }

        try {
            await ensureExportDataLoaded();
        } catch (error) {
            console.error(error);
            setExportControlsDisabled(true);
            els.popupExportWordsOutput.value = "";
            els.popupExportWordsOutput.placeholder = "Failed to load chordable words.";
            setStatus("Failed to load chordable words.", true);
        }
    }

    function beginHotkeyRecording(settingKey) {
        recordingHotkeyTarget = settingKey;
        updateHotkeyButtonLabels();
        setStatus("Press the hotkey combination you want to use. Press Escape to cancel.");
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
            setStatus("Hotkey recording cancelled.");
            return;
        }

        const hotkey = CCHShared.eventToHotkey(event);
        if (CCHShared.isModifierOnlyHotkey(hotkey)) {
            setStatus("Use at least one non-modifier key.", true);
            return;
        }

        draftSettings = hydrateSettings({
            ...draftSettings,
            [recordingHotkeyTarget]: hotkey
        });
        stopHotkeyRecording();
        setStatus(`Recorded ${CCHShared.formatHotkey(hotkey)}. Save settings to apply.`);
    }

    function updateEnabledButton(enabled) {
        els.popupEnabledButton.dataset.enabled = enabled ? "true" : "false";
        els.popupEnabledButton.setAttribute("aria-pressed", enabled ? "true" : "false");
        els.popupEnabledButton.setAttribute(
            "aria-label",
            enabled ? "Disable extension" : "Enable extension"
        );
        els.popupEnabledButton.title = enabled ? "Disable extension" : "Enable extension";
    }

    async function loadInitialState() {
        const stored = await getStorage([STORAGE_KEYS.settings]);
        draftSettings = hydrateSettings(stored[STORAGE_KEYS.settings]);
        applySettingsToForm(draftSettings);
        initializeExportTabState();
        switchTab("appearance");
    }

    async function saveThemeModePreference(themeMode) {
        clearResetConfirmation();
        const nextThemeMode = themeMode || "system";
        syncThemeControls(nextThemeMode);
        applyPopupTheme(nextThemeMode);

        try {
            const stored = await getStorage([STORAGE_KEYS.settings]);
            const savedSettings = hydrateSettings(stored[STORAGE_KEYS.settings]);
            const nextSettings = hydrateSettings({
                ...savedSettings,
                themeMode: nextThemeMode
            });

            draftSettings = {
                ...draftSettings,
                themeMode: nextSettings.themeMode
            };

            await setStorage({[STORAGE_KEYS.settings]: nextSettings});
            setStatus("");
        } catch (error) {
            console.error(error);
            setStatus("Failed to save theme preference.", true);
        }
    }

    async function saveEnabledPreference(enabled) {
        clearResetConfirmation();
        const nextEnabled = Boolean(enabled);
        updateEnabledButton(nextEnabled);

        try {
            const stored = await getStorage([STORAGE_KEYS.settings]);
            const savedSettings = hydrateSettings(stored[STORAGE_KEYS.settings]);
            const nextSettings = hydrateSettings({
                ...savedSettings,
                enabled: nextEnabled
            });

            draftSettings = {
                ...draftSettings,
                enabled: nextSettings.enabled
            };

            await setStorage({[STORAGE_KEYS.settings]: nextSettings});
            setStatus("");
        } catch (error) {
            console.error(error);
            updateEnabledButton(draftSettings.enabled);
            setStatus("Failed to update enabled state.", true);
        }
    }

    async function saveSettings() {
        clearResetConfirmation();
        try {
            stopHotkeyRecording();
            draftSettings = currentSettingsFromForm();
            applyPopupTheme(draftSettings.themeMode || "system");
            await setStorage({[STORAGE_KEYS.settings]: draftSettings});
            setStatus("");
            flashSavedButton();
        } catch (error) {
            console.error(error);
            setStatus("Failed to save settings.", true);
        }
    }

    async function resetSettings() {
        if (!resetConfirmationArmed) {
            armResetConfirmation();
            return;
        }

        clearResetConfirmation();
        try {
            stopHotkeyRecording();
            draftSettings = hydrateSettings(CCHShared.defaultSettings());
            const defaultExportFilterSettings = CCHShared.hydrateExportFilterSettings(DEFAULT_EXPORT_FILTER_SETTINGS);
            applySettingsToForm(draftSettings);
            applyPopupTheme(draftSettings.themeMode || "system");
            if (exportDataLoaded) {
                applyExportFilterSettings(defaultExportFilterSettings);
                renderExportWords();
            }
            await setStorage({
                [STORAGE_KEYS.settings]: draftSettings,
                [STORAGE_KEYS.exportFilterSettings]: defaultExportFilterSettings
            });
            setStatus("Defaults restored.");
        } catch (error) {
            console.error(error);
            setStatus("Failed to restore defaults.", true);
        }
    }

    els.popupSyncButton.addEventListener("click", async () => {
        await setStorage({
            [STORAGE_KEYS.optionsSyncIntent]: Date.now()
        });
        await chrome.runtime.openOptionsPage();
        window.close();
    });

    systemThemeQuery.addEventListener("change", () => {
        if (themeModeFromControls() === "system") {
            syncThemeControls("system");
            applyPopupTheme("system");
        }
    });

    document.addEventListener("keydown", handleHotkeyRecordingKeydown, true);

    function handleThemeControlsChanged() {
        const themeMode = themeModeFromControls();
        syncThemeControls(themeMode);
        applyPopupTheme(themeMode);
        void saveThemeModePreference(themeMode);
    }

    els.popupThemeToggle.addEventListener("change", handleThemeControlsChanged);
    els.popupUseSystemTheme.addEventListener("change", handleThemeControlsChanged);
    els.popupAppearanceTab.addEventListener("click", () => {
        void openTab("appearance");
    });
    els.popupHotkeysTab.addEventListener("click", () => {
        void openTab("hotkeys");
    });
    els.popupChordableWordsTab.addEventListener("click", () => {
        void openTab("chordable-words");
    });
    HOTKEY_BINDINGS.forEach(([settingKey, buttonKey]) => {
        const button = els[buttonKey];
        if (!button) return;
        button.addEventListener("click", () => {
            beginHotkeyRecording(settingKey);
        });
    });

    [
        els.popupHintBoxDarkModeColor,
        els.popupHintTextDarkModeColor,
        els.popupHintBoxDarkModeOpacity,
        els.popupHintBoxLightModeColor,
        els.popupHintTextLightModeColor,
        els.popupHintBoxLightModeOpacity,
        els.popupHintTextFontSizeValue,
        els.popupHintPosition,
        els.popupHintDisplay,
        els.popupHintCharacterOrderMode,
        els.popupShowChordableWordOutlines
    ].forEach((input) => {
        input.addEventListener("input", updateAppearancePreview);
        input.addEventListener("change", updateAppearancePreview);
    });

    els.popupHintTextFontSizeUnit.addEventListener("change", () => {
        const nextUnit = els.popupHintTextFontSizeUnit.value === "px" ? "px" : "em";
        const previousUnit = els.popupHintTextFontSizeUnit.dataset.previousUnit === "px" ? "px" : "em";
        convertHintTextSizeValueForUnitChange(previousUnit, nextUnit);
        syncHintTextSizeFieldBehavior();
        els.popupHintTextFontSizeUnit.dataset.previousUnit = nextUnit;
        updateAppearancePreview();
    });

    [els.popupLightPreviewHint, els.popupDarkPreviewHint].forEach((el) => {
        el.addEventListener("click", (event) => {
            event.preventDefault();
            togglePreviewHintDisplay(el);
        });
    });

    els.popupSaveButton.addEventListener("click", saveSettings);
    els.popupResetButton.addEventListener("click", resetSettings);
    els.popupEnabledButton.addEventListener("click", () => {
        const nextEnabled = !draftSettings.enabled;
        void saveEnabledPreference(nextEnabled);
    });
    els.popupMinimumExportLength.addEventListener("input", () => {
        minimumExportLength = CCHShared.hydrateExportFilterSettings({
            minimumExportLength: els.popupMinimumExportLength.value,
            exportNonAlphanumericMode,
            exportRespectExportable
        }).minimumExportLength;
        renderExportWords();
        saveExportFilterSettingsQuietly();
    });
    els.popupMinimumExportLength.addEventListener("change", () => {
        minimumExportLength = CCHShared.hydrateExportFilterSettings({
            minimumExportLength: els.popupMinimumExportLength.value,
            exportNonAlphanumericMode,
            exportRespectExportable
        }).minimumExportLength;
        els.popupMinimumExportLength.value = String(minimumExportLength);
        renderExportWords();
        saveExportFilterSettingsQuietly();
    });
    els.popupExportNonAlphanumericMode.addEventListener("change", () => {
        exportNonAlphanumericMode = CCHShared.hydrateExportFilterSettings({
            minimumExportLength,
            exportNonAlphanumericMode: els.popupExportNonAlphanumericMode.value,
            exportRespectExportable
        }).exportNonAlphanumericMode;
        els.popupExportNonAlphanumericMode.value = exportNonAlphanumericMode;
        renderExportWords();
        saveExportFilterSettingsQuietly();
    });
    els.popupExportRespectExportable.addEventListener("change", () => {
        exportRespectExportable = els.popupExportRespectExportable.checked;
        renderExportWords();
        saveExportFilterSettingsQuietly();
    });
    els.popupCopyExportWordsButton.addEventListener("click", () => {
        void copyExportWordsToClipboard();
    });
    els.popupExportTextFileButton.addEventListener("click", exportWordsToTextFile);
    els.popupExportCsvButton.addEventListener("click", exportWordsToCsvFile);

    loadInitialState().catch((error) => {
        console.error(error);
        setStatus(error.message || String(error), true);
    });
})();
