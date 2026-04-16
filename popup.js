(() => {
    const STORAGE_KEYS = {
        settings: "cch_settings"
    };

    const els = {
        popupSyncButton: document.getElementById("popupSyncButton"),
        popupSaveButton: document.getElementById("popupSaveButton"),
        popupResetButton: document.getElementById("popupResetButton"),
        popupStatus: document.getElementById("popupStatus"),
        popupHintBoxDarkModeColor: document.getElementById("popupHintBoxDarkModeColor"),
        popupHintTextDarkModeColor: document.getElementById("popupHintTextDarkModeColor"),
        popupHintBoxDarkModeOpacity: document.getElementById("popupHintBoxDarkModeOpacity"),
        popupHintBoxLightModeColor: document.getElementById("popupHintBoxLightModeColor"),
        popupHintTextLightModeColor: document.getElementById("popupHintTextLightModeColor"),
        popupHintBoxLightModeOpacity: document.getElementById("popupHintBoxLightModeOpacity"),
        popupHintTextFontSizeValue: document.getElementById("popupHintTextFontSizeValue"),
        popupHintTextFontSizeUnit: document.getElementById("popupHintTextFontSizeUnit"),
        popupForceRefreshHotkeyDisplay: document.getElementById("popupForceRefreshHotkeyDisplay"),
        popupRecordForceRefreshHotkeyButton: document.getElementById("popupRecordForceRefreshHotkeyButton"),
        popupHotkeyCaptureStatus: document.getElementById("popupHotkeyCaptureStatus"),
        popupEnabledButton: document.getElementById("popupEnabledButton"),
        // popupEnabledButtonLabel: document.getElementById("popupEnabledButtonLabel")
    };

    let draftSettings = hydrateSettings(CCHShared.defaultSettings());
    let saveResetTimer = null;
    let stopHotkeyCapture = null;

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
        const rawHintTextSizeValue = settings.hint_text_font_size_value ?? settings.hint_text_font_size_em;
        settings.hint_text_font_size_value = clampNumber(rawHintTextSizeValue, 0.1, 64, 0.5);
        settings.hint_text_font_size_unit = settings.hint_text_font_size_unit === "px" ? "px" : "em";
        return settings;
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
        els.popupHintBoxDarkModeColor.value = settings.hint_box_dark_mode_color;
        els.popupHintTextDarkModeColor.value = settings.hint_text_dark_mode_color;
        els.popupHintBoxDarkModeOpacity.value = settings.hint_box_dark_mode_opacity;
        els.popupHintBoxLightModeColor.value = settings.hint_box_light_mode_color;
        els.popupHintTextLightModeColor.value = settings.hint_text_light_mode_color;
        els.popupHintBoxLightModeOpacity.value = settings.hint_box_light_mode_opacity;
        els.popupHintTextFontSizeValue.value = settings.hint_text_font_size_value ?? settings.hint_text_font_size_em;
        els.popupHintTextFontSizeUnit.value = settings.hint_text_font_size_unit || "em";
        els.popupForceRefreshHotkeyDisplay.textContent = CCHShared.hotkeyDisplay(settings.hotkeys.forceRefresh);
        updateEnabledButton(settings.enabled);
        clearHotkeyCaptureStatus();
    }

    function currentSettingsFromForm() {
        const defaults = CCHShared.defaultSettings();
        return hydrateSettings({
            ...draftSettings,
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

    function setHotkeyCaptureStatus(message, isError = false) {
        els.popupHotkeyCaptureStatus.textContent = message;
        els.popupHotkeyCaptureStatus.classList.toggle("error", Boolean(isError));
    }

    function clearHotkeyCaptureStatus() {
        setHotkeyCaptureStatus("Press “Change hotkey”, then press the new key combination. Press Escape to cancel.");
    }

    function startHotkeyCapture() {
        if (stopHotkeyCapture) {
            stopHotkeyCapture();
            stopHotkeyCapture = null;
        }

        const button = els.popupRecordForceRefreshHotkeyButton;
        const originalLabel = button.textContent;
        button.textContent = "Press keys…";
        button.classList.add("isRecording");
        setHotkeyCaptureStatus("Listening for a new hotkey…");

        const onKeyDown = (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (event.code === "Escape") {
                cleanup();
                clearHotkeyCaptureStatus();
                return;
            }

            const hotkey = CCHShared.eventToHotkey(event);
            if (!hotkey) {
                setHotkeyCaptureStatus("Use at least one non-modifier key.", true);
                return;
            }

            draftSettings.hotkeys = CCHShared.normalizeHotkeys({forceRefresh: hotkey});
            els.popupForceRefreshHotkeyDisplay.textContent = CCHShared.hotkeyDisplay(draftSettings.hotkeys.forceRefresh);
            cleanup();
            setHotkeyCaptureStatus(`New hotkey: ${CCHShared.hotkeyDisplay(hotkey)}`);
        };

        function cleanup() {
            document.removeEventListener("keydown", onKeyDown, true);
            button.textContent = originalLabel;
            button.classList.remove("isRecording");
            if (stopHotkeyCapture === cleanup) stopHotkeyCapture = null;
        }

        stopHotkeyCapture = cleanup;
        document.addEventListener("keydown", onKeyDown, true);
    }

    async function loadInitialState() {
        const stored = await getStorage([STORAGE_KEYS.settings]);
        draftSettings = hydrateSettings(stored[STORAGE_KEYS.settings]);
        applySettingsToForm(draftSettings);
    }

    async function saveSettings() {
        try {
            draftSettings = currentSettingsFromForm();
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
            await setStorage({[STORAGE_KEYS.settings]: draftSettings});
            setStatus("Defaults restored.");
        } catch (error) {
            console.error(error);
            setStatus("Failed to restore defaults.", true);
        }
    }

    els.popupSyncButton.addEventListener("click", () => {
        chrome.runtime.openOptionsPage();
    });

    els.popupSaveButton.addEventListener("click", saveSettings);
    els.popupResetButton.addEventListener("click", resetSettings);
    els.popupRecordForceRefreshHotkeyButton.addEventListener("click", startHotkeyCapture);
    els.popupEnabledButton.addEventListener("click", () => {
        draftSettings.enabled = !draftSettings.enabled;
        updateEnabledButton(draftSettings.enabled);
    });

    loadInitialState().catch((error) => {
        console.error(error);
        setStatus(error.message || String(error), true);
    });
})();
