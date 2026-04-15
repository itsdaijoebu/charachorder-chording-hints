(() => {
  const STORAGE_KEYS = {
    parsedDictionary: "parsedDictionary",
    settings: "settings"
  };

  const PAGE_SIZE = 25;
  let currentPage = 1;
  let currentDictionary = null;

  const els = {
    jsonFile: document.getElementById("jsonFile"),
    jsonText: document.getElementById("jsonText"),
    importButton: document.getElementById("importButton"),
    clearButton: document.getElementById("clearButton"),
    importStatus: document.getElementById("importStatus"),
    selectionMode: document.getElementById("selectionMode"),
    enabled: document.getElementById("enabled"),
    includeArpeggiates: document.getElementById("includeArpeggiates"),
    includeModifierStyle: document.getElementById("includeModifierStyle"),
    showDebugOutline: document.getElementById("showDebugOutline"),
    debugLogging: document.getElementById("debugLogging"),
    pauseLiveRefresh: document.getElementById("pauseLiveRefresh"),
    showExtendedSpecialDescriptions: document.getElementById("showExtendedSpecialDescriptions"),
    descDupAll: document.getElementById("desc_dup_all"),
    descDupLeft: document.getElementById("desc_dup_left"),
    descDupRight: document.getElementById("desc_dup_right"),
    descLeftShift: document.getElementById("desc_left_shift"),
    descRightShift: document.getElementById("desc_right_shift"),
    descArpeggiate: document.getElementById("desc_arpeggiate"),
    saveSettingsButton: document.getElementById("saveSettingsButton"),
    settingsStatus: document.getElementById("settingsStatus"),
    metaVersion: document.getElementById("metaVersion"),
    metaCount: document.getElementById("metaCount"),
    metaSavedAt: document.getElementById("metaSavedAt"),
    loadedChordsEmpty: document.getElementById("loadedChordsEmpty"),
    loadedChordsPanel: document.getElementById("loadedChordsPanel"),
    loadedChordsTableBody: document.getElementById("loadedChordsTableBody"),
    prevPageButton: document.getElementById("prevPageButton"),
    nextPageButton: document.getElementById("nextPageButton"),
    pageStatus: document.getElementById("pageStatus"),

    hintBoxDarkModeColor: document.getElementById("hintBoxDarkModeColor"),
    hintBoxDarkModeOpacity: document.getElementById("hintBoxDarkModeOpacity"),
    hintTextDarkModeColor: document.getElementById("hintTextDarkModeColor"),
    hintBoxLightModeColor: document.getElementById("hintBoxLightModeColor"),
    hintBoxLightModeOpacity: document.getElementById("hintBoxLightModeOpacity"),
    hintTextLightModeColor: document.getElementById("hintTextLightModeColor"),
    hintTextFontSizeEm: document.getElementById("hintTextFontSizeEm"),

    hintPreviewDark: document.getElementById("hintPreviewDark"),
    hintPreviewLight: document.getElementById("hintPreviewLight")
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

  function setStatus(target, text, isError = false) {
    target.textContent = text;
    target.style.color = isError ? "#b91c1c" : "#1f2937";
  }

  function formatDate(value) {
    if (!value) return "—";
    return new Date(value).toLocaleString();
  }

  function clampNumber(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
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

    return settings;
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

  function refreshMeta(parsedDictionary) {
    els.metaVersion.textContent = parsedDictionary?.charaVersion ?? "—";
    els.metaCount.textContent = parsedDictionary?.entryCount ?? "—";
    els.metaSavedAt.textContent = parsedDictionary?.savedAt
        ? formatDate(parsedDictionary.savedAt)
        : "—";
  }

  function flagSummary(entry) {
    const flags = [];
    if (entry.flags.hasArpeggiate) flags.push("arpeggiate");
    if (entry.flags.hasModifierLikeOutput) flags.push("modifier-output");
    if (!flags.length) flags.push("—");
    return flags.join(", ");
  }

  function is_left_variant(token_key) {
    return token_key.startsWith("left_") || token_key.endsWith("_left");
  }

  function is_right_variant(token_key) {
    return token_key.startsWith("right_") || token_key.endsWith("_right");
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
          `url("${chrome.runtime.getURL(
              CCHShared.ICON_FILE_MAP[token.key] || "icons/broken_image.svg"
          )}")`
      );

      if (is_left_variant(token.key)) span.classList.add("cch-token-hand-left");
      if (is_right_variant(token.key)) span.classList.add("cch-token-hand-right");

      const main = document.createElement("span");
      main.className = "tokenIcon tokenIconMain";
      span.appendChild(main);

      if (is_left_variant(token.key) || is_right_variant(token.key)) {
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

  function renderInputPreview(entry, settings) {
    const wrapper = document.createElement("div");
    wrapper.className = "hintPreview";

    const row = document.createElement("div");
    row.className = "hintPreviewRow";

    const tokens = CCHShared.entryInputTokens(entry);
    for (const token of tokens) {
      row.appendChild(renderToken(token, settings));
    }

    wrapper.appendChild(row);
    return wrapper;
  }

  function renderLoadedChords(settings) {
    const entries = currentDictionary?.entries || [];
    if (!entries.length) {
      els.loadedChordsEmpty.hidden = false;
      els.loadedChordsPanel.hidden = true;
      els.loadedChordsTableBody.innerHTML = "";
      els.pageStatus.textContent = "";
      return;
    }

    els.loadedChordsEmpty.hidden = true;
    els.loadedChordsPanel.hidden = false;

    const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
    currentPage = Math.min(Math.max(1, currentPage), totalPages);

    const start = (currentPage - 1) * PAGE_SIZE;
    const pageEntries = entries.slice(start, start + PAGE_SIZE);

    els.loadedChordsTableBody.innerHTML = "";
    for (const entry of pageEntries) {
      const tr = document.createElement("tr");

      const tdIndex = document.createElement("td");
      tdIndex.textContent = String(entry.index);
      tr.appendChild(tdIndex);

      const tdInput = document.createElement("td");
      tdInput.appendChild(renderInputPreview(entry, settings));
      tr.appendChild(tdInput);

      const tdOutput = document.createElement("td");
      const outputCode = document.createElement("code");
      outputCode.textContent = entry.outputText || "";
      tdOutput.appendChild(outputCode);
      tr.appendChild(tdOutput);

      const tdNormalized = document.createElement("td");
      const normCode = document.createElement("code");
      normCode.textContent = entry.normalizedOutput || "";
      tdNormalized.appendChild(normCode);
      tr.appendChild(tdNormalized);

      const tdFlags = document.createElement("td");
      tdFlags.textContent = flagSummary(entry);
      tr.appendChild(tdFlags);

      els.loadedChordsTableBody.appendChild(tr);
    }

    els.pageStatus.textContent = `Page ${currentPage} of ${totalPages} · ${entries.length} total entries`;
    els.prevPageButton.disabled = currentPage <= 1;
    els.nextPageButton.disabled = currentPage >= totalPages;
  }

  function currentSettingsFromForm() {
    const defaults = CCHShared.defaultSettings();

    return {
      selectionMode: els.selectionMode.value,
      enabled: els.enabled.checked,
      includeArpeggiates: els.includeArpeggiates.checked,
      includeModifierStyle: els.includeModifierStyle.checked,
      showDebugOutline: els.showDebugOutline.checked,
      debugLogging: els.debugLogging.checked,
      pauseLiveRefresh: els.pauseLiveRefresh.checked,
      showExtendedSpecialDescriptions: els.showExtendedSpecialDescriptions.checked,

      hint_box_dark_mode_color:
          els.hintBoxDarkModeColor.value || defaults.hint_box_dark_mode_color,
      hint_box_dark_mode_opacity: clampNumber(
          els.hintBoxDarkModeOpacity.value,
          0,
          1,
          defaults.hint_box_dark_mode_opacity
      ),
      hint_text_dark_mode_color:
          els.hintTextDarkModeColor.value || defaults.hint_text_dark_mode_color,

      hint_box_light_mode_color:
          els.hintBoxLightModeColor.value || defaults.hint_box_light_mode_color,
      hint_box_light_mode_opacity: clampNumber(
          els.hintBoxLightModeOpacity.value,
          0,
          1,
          defaults.hint_box_light_mode_opacity
      ),
      hint_text_light_mode_color:
          els.hintTextLightModeColor.value || defaults.hint_text_light_mode_color,

      hint_text_font_size_em: clampNumber(
          els.hintTextFontSizeEm.value,
          0.4,
          2,
          defaults.hint_text_font_size_em
      ),

      specialTokenDescriptions: {
        dup_all: els.descDupAll.value,
        dup_left: els.descDupLeft.value,
        dup_right: els.descDupRight.value,
        left_shift: els.descLeftShift.value,
        right_shift: els.descRightShift.value,
        arpeggiate: els.descArpeggiate.value
      }
    };
  }

  function updateAppearancePreview(settings) {
    if (els.hintPreviewDark) {
      els.hintPreviewDark.style.background = hexToRgba(
          settings.hint_box_dark_mode_color,
          settings.hint_box_dark_mode_opacity
      );
      els.hintPreviewDark.style.color = settings.hint_text_dark_mode_color;
      els.hintPreviewDark.style.fontSize = `${settings.hint_text_font_size_em}em`;
    }

    if (els.hintPreviewLight) {
      els.hintPreviewLight.style.background = hexToRgba(
          settings.hint_box_light_mode_color,
          settings.hint_box_light_mode_opacity
      );
      els.hintPreviewLight.style.color = settings.hint_text_light_mode_color;
      els.hintPreviewLight.style.fontSize = `${settings.hint_text_font_size_em}em`;
    }
  }

  function applySettingsToForm(settings) {
    els.selectionMode.value = settings.selectionMode;
    els.enabled.checked = settings.enabled;
    els.includeArpeggiates.checked = settings.includeArpeggiates;
    els.includeModifierStyle.checked = settings.includeModifierStyle;
    els.showDebugOutline.checked = settings.showDebugOutline;
    els.debugLogging.checked = settings.debugLogging;
    els.pauseLiveRefresh.checked = settings.pauseLiveRefresh;
    els.showExtendedSpecialDescriptions.checked = settings.showExtendedSpecialDescriptions;

    els.hintBoxDarkModeColor.value = settings.hint_box_dark_mode_color || "#18181b";
    els.hintBoxDarkModeOpacity.value = settings.hint_box_dark_mode_opacity ?? 0.92;
    els.hintTextDarkModeColor.value = settings.hint_text_dark_mode_color || "#f5f5f5";

    els.hintBoxLightModeColor.value = settings.hint_box_light_mode_color || "#ffffff";
    els.hintBoxLightModeOpacity.value = settings.hint_box_light_mode_opacity ?? 0.96;
    els.hintTextLightModeColor.value = settings.hint_text_light_mode_color || "#111827";

    els.hintTextFontSizeEm.value = settings.hint_text_font_size_em ?? 0.85;

    els.descDupAll.value = settings.specialTokenDescriptions.dup_all || "";
    els.descDupLeft.value = settings.specialTokenDescriptions.dup_left || "";
    els.descDupRight.value = settings.specialTokenDescriptions.dup_right || "";
    els.descLeftShift.value = settings.specialTokenDescriptions.left_shift || "";
    els.descRightShift.value = settings.specialTokenDescriptions.right_shift || "";
    els.descArpeggiate.value = settings.specialTokenDescriptions.arpeggiate || "";

    updateAppearancePreview(settings);
  }

  async function loadInitialState() {
    const stored = await getStorage([STORAGE_KEYS.parsedDictionary, STORAGE_KEYS.settings]);
    currentDictionary = stored[STORAGE_KEYS.parsedDictionary] || null;
    const settings = hydrateSettings(stored[STORAGE_KEYS.settings]);

    applySettingsToForm(settings);
    refreshMeta(currentDictionary);
    renderLoadedChords(settings);
  }

  async function readChosenText() {
    const pasted = els.jsonText.value.trim();
    if (pasted) return pasted;

    const file = els.jsonFile.files?.[0];
    if (!file) {
      throw new Error("Choose a JSON file or paste JSON text first.");
    }

    return await file.text();
  }

  async function importJson() {
    try {
      const raw = await readChosenText();
      const parsed = JSON.parse(raw);
      const parsedDictionary = CCHShared.parseChordJson(parsed);

      await setStorage({ [STORAGE_KEYS.parsedDictionary]: parsedDictionary });
      currentDictionary = parsedDictionary;
      currentPage = 1;

      refreshMeta(parsedDictionary);
      renderLoadedChords(currentSettingsFromForm());
      setStatus(els.importStatus, `Saved ${parsedDictionary.entryCount} chord entries.`);

      console.log("[CCH options] Parsed and saved chord dictionary", {
        entryCount: parsedDictionary.entryCount,
        sample: parsedDictionary.entries.slice(0, 5)
      });
    } catch (error) {
      console.error(error);
      setStatus(els.importStatus, error.message || "Failed to parse chord JSON.", true);
    }
  }

  async function clearDictionary() {
    await removeStorage([STORAGE_KEYS.parsedDictionary]);
    currentDictionary = null;
    currentPage = 1;
    refreshMeta(null);
    renderLoadedChords(currentSettingsFromForm());
    updateAppearancePreview(currentSettingsFromForm());
    setStatus(els.importStatus, "Cleared saved dictionary.");
  }

  async function saveSettings() {
    const settings = currentSettingsFromForm();
    await setStorage({ [STORAGE_KEYS.settings]: settings });
    renderLoadedChords(settings);
    updateAppearancePreview(settings);
    setStatus(els.settingsStatus, "Settings saved.");
    console.log("[CCH options] Saved settings", settings);
  }

  els.importButton.addEventListener("click", importJson);
  els.clearButton.addEventListener("click", clearDictionary);
  els.saveSettingsButton.addEventListener("click", saveSettings);

  els.prevPageButton.addEventListener("click", () => {
    currentPage -= 1;
    renderLoadedChords(currentSettingsFromForm());
  });

  els.nextPageButton.addEventListener("click", () => {
    currentPage += 1;
    renderLoadedChords(currentSettingsFromForm());
  });

  [
    els.showExtendedSpecialDescriptions,
    els.descDupAll,
    els.descDupLeft,
    els.descDupRight,
    els.descLeftShift,
    els.descRightShift,
    els.descArpeggiate,
    els.hintBoxDarkModeColor,
    els.hintBoxDarkModeOpacity,
    els.hintTextDarkModeColor,
    els.hintBoxLightModeColor,
    els.hintBoxLightModeOpacity,
    els.hintTextLightModeColor,
    els.hintTextFontSizeEm
  ].forEach((el) => {
    el.addEventListener("input", () => {
      const settings = currentSettingsFromForm();
      renderLoadedChords(settings);
      updateAppearancePreview(settings);
    });

    el.addEventListener("change", () => {
      const settings = currentSettingsFromForm();
      renderLoadedChords(settings);
      updateAppearancePreview(settings);
    });
  });

  loadInitialState().catch((error) => {
    console.error(error);
    setStatus(els.importStatus, "Failed to load existing settings.", true);
  });
})();