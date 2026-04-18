(() => {
    const STORAGE_KEYS = {
        settings: "settings"
    };

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
        popupLightPreviewHint: document.getElementById("popupLightPreviewHint"),
        popupDarkPreviewHint: document.getElementById("popupDarkPreviewHint"),
        popupLightPreviewWord: document.getElementById("popupLightPreviewWord"),
        popupDarkPreviewWord: document.getElementById("popupDarkPreviewWord"),
        popupEnabledButton: document.getElementById("popupEnabledButton"),
        // popupEnabledButtonLabel: document.getElementById("popupEnabledButtonLabel")
    };

    const systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");

    let draftSettings = hydrateSettings(CCHShared.defaultSettings());
    let saveResetTimer = null;

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

    function updateAppearancePreview() {
        const settings = currentSettingsFromForm();
        const fontSize = `${settings.hint_text_font_size_value}${settings.hint_text_font_size_unit}`;
        const alignClass = settings.hint_position === "center" ? "popupPreviewAlignCenter" : "popupPreviewAlignLeft";
        const revealOnHover = settings.hint_display === "hover";

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
        const settings = {
            ...CCHShared.defaultSettings(),
            ...(rawSettings || {})
        };
        settings.specialTokenDescriptions = {
            ...CCHShared.defaultSpecialTokenDescriptions(),
            ...(settings.specialTokenDescriptions || {})
        };
        settings.hotkeys = CCHShared.normalizeHotkeys(settings.hotkeys);
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

    function applySettingsToForm(settings) {
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
        els.popupHintPosition.value = settings.hint_position || "left";
        els.popupHintDisplay.value = settings.hint_display || "always";
        syncHintTextSizeFieldBehavior();
        updateAppearancePreview();
        updateEnabledButton(settings.enabled);
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
            hotkeys: draftSettings.hotkeys,
            enabled: draftSettings.enabled
        });
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
    }

    async function saveThemeModePreference(themeMode) {
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
        try {
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
        const confirmed = window.confirm("Return all popup settings to their defaults?");
        if (!confirmed) return;
        try {
            draftSettings = hydrateSettings(CCHShared.defaultSettings());
            applySettingsToForm(draftSettings);
            applyPopupTheme(draftSettings.themeMode || "system");
            await setStorage({[STORAGE_KEYS.settings]: draftSettings});
            setStatus("Defaults restored.");
        } catch (error) {
            console.error(error);
            setStatus("Failed to restore defaults.", true);
        }
    }

    els.popupSyncButton.addEventListener("click", async () => {
        const url = chrome.runtime.getURL("options.html?syncIntent=1");
        await chrome.tabs.create({ url });
        window.close();
    });

    systemThemeQuery.addEventListener("change", () => {
        if (themeModeFromControls() === "system") {
            syncThemeControls("system");
            applyPopupTheme("system");
        }
    });

    function handleThemeControlsChanged() {
        const themeMode = themeModeFromControls();
        syncThemeControls(themeMode);
        applyPopupTheme(themeMode);
        void saveThemeModePreference(themeMode);
    }

    els.popupThemeToggle.addEventListener("change", handleThemeControlsChanged);
    els.popupUseSystemTheme.addEventListener("change", handleThemeControlsChanged);

    [
        els.popupHintBoxDarkModeColor,
        els.popupHintTextDarkModeColor,
        els.popupHintBoxDarkModeOpacity,
        els.popupHintBoxLightModeColor,
        els.popupHintTextLightModeColor,
        els.popupHintBoxLightModeOpacity,
        els.popupHintTextFontSizeValue,
        els.popupHintPosition,
        els.popupHintDisplay
    ].forEach((input) => {
        input.addEventListener("input", updateAppearancePreview);
        input.addEventListener("change", updateAppearancePreview);
    });

    els.popupHintTextFontSizeUnit.addEventListener("change", () => {
        syncHintTextSizeFieldBehavior();
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

    loadInitialState().catch((error) => {
        console.error(error);
        setStatus(error.message || String(error), true);
    });
})();
