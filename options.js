(() => {
  const STORAGE_KEYS = {
    parsedDictionary: "parsedDictionary",
    inputDisplayOverrides: "inputDisplayOverrides",
    settings: "settings"
  };

  const PAGE_SIZE = 25;
  const SERIAL_BAUD_RATE = 115200;
  const SERIAL_COUNT_TIMEOUT_MS = 4000;
  const SERIAL_ENTRY_TIMEOUT_MS = 2000;

  let currentPage = 1;
  let currentRawDictionary = null;
  let currentDictionary = null;
  let inputDisplayOverrides = {};
  let currentSort = { key: "index", direction: "asc" };
  let editingEntryIndex = null;
  let editingSegmentTexts = [];

  const els = {
    jsonFile: document.getElementById("jsonFile"),
    jsonText: document.getElementById("jsonText"),
    importButton: document.getElementById("importButton"),
    syncDeviceButton: document.getElementById("syncDeviceButton"),
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

    hintBoxDarkModeColor: document.getElementById("hintBoxDarkModeColor"),
    hintBoxDarkModeOpacity: document.getElementById("hintBoxDarkModeOpacity"),
    hintTextDarkModeColor: document.getElementById("hintTextDarkModeColor"),
    hintBoxLightModeColor: document.getElementById("hintBoxLightModeColor"),
    hintBoxLightModeOpacity: document.getElementById("hintBoxLightModeOpacity"),
    hintTextLightModeColor: document.getElementById("hintTextLightModeColor"),
    hintTextFontSizeEm: document.getElementById("hintTextFontSizeEm"),

    hintPreviewDark: document.getElementById("hintPreviewDark"),
    hintPreviewLight: document.getElementById("hintPreviewLight"),

    saveSettingsButton: document.getElementById("saveSettingsButton"),
    settingsStatus: document.getElementById("settingsStatus"),

    metaSource: document.getElementById("metaSource"),
    metaVersion: document.getElementById("metaVersion"),
    metaCount: document.getElementById("metaCount"),
    metaDeviceCount: document.getElementById("metaDeviceCount"),
    metaSavedAt: document.getElementById("metaSavedAt"),

    loadedChordsEmpty: document.getElementById("loadedChordsEmpty"),
    loadedChordsPanel: document.getElementById("loadedChordsPanel"),
    loadedSourceBadge: document.getElementById("loadedSourceBadge"),
    loadedChordsTableBody: document.getElementById("loadedChordsTableBody"),
    saveInputOverrideButton: document.getElementById("saveInputOverrideButton"),
    revertInputOverrideButton: document.getElementById("revertInputOverrideButton"),
    editingStatus: document.getElementById("editingStatus"),
    sortInputButton: document.getElementById("sortInputButton"),
    sortOutputButton: document.getElementById("sortOutputButton"),
    sortUnknownCompoundButton: document.getElementById("sortUnknownCompoundButton"),
    prevPageButton: document.getElementById("prevPageButton"),
    nextPageButton: document.getElementById("nextPageButton"),
    pageJumpInput: document.getElementById("pageJumpInput"),
    pageJumpButton: document.getElementById("pageJumpButton"),
    pageStatus: document.getElementById("pageStatus")
  };

  const SERIAL_OUTPUT_ACTION_LABELS = {
    256: "suppress_auto_space",
    298: "backspace",
    336: "left_arrow",
    513: "left_shift",
    517: "right_shift",
    533: "dup_right",
    535: "dup_all",
    536: "dup_left",
    573: "capitalize",
    574: "remove_preceding_space",
    1001: "arpeggiate"
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
    if (els.saveInputOverrideButton) els.saveInputOverrideButton.disabled = isBusy || els.saveInputOverrideButton.disabled;
    if (els.revertInputOverrideButton) els.revertInputOverrideButton.disabled = isBusy || els.revertInputOverrideButton.disabled;
    if (els.pageJumpButton) els.pageJumpButton.disabled = isBusy;
    if (els.pageJumpInput) els.pageJumpInput.disabled = isBusy;
  }

  function setStatus(target, text, isError = false) {
    target.textContent = text;
    target.style.color = isError ? "#b91c1c" : "#1f2937";
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

      for (const token of segment.inputTokens) {
        row.appendChild(renderToken(token, settings));
      }
    });

    wrapper.appendChild(row);
    return wrapper;
  }

  function sortValueForEntry(entry, sortKey) {
    switch (sortKey) {
      case "input":
        return CCHShared.entryInputSortText(entry).toLowerCase();
      case "output":
        return String(entry.outputText || "").toLowerCase();
      case "unknown_compound":
        return entry.flags.hasUnknownCompoundSegment ? "yes" : "no";
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
      currentSort = { key: sortKey, direction: sortKey === "unknown_compound" ? "desc" : "asc" };
    }
    currentPage = 1;
    renderLoadedChords(currentSettingsFromForm());
  }

  function updateSortButtonLabels() {
    const labels = {
      input: "Input",
      output: "Visible output",
      unknown_compound: "Unknown compound?"
    };

    [
      [els.sortInputButton, "input"],
      [els.sortOutputButton, "output"],
      [els.sortUnknownCompoundButton, "unknown_compound"]
    ].forEach(([button, key]) => {
      if (!button) return;
      const isActive = currentSort.key === key;
      const arrow = !isActive ? "" : (currentSort.direction === "asc" ? " ↑" : " ↓");
      button.textContent = `${labels[key]}${arrow}`;
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  function startEditingEntry(entryIndex) {
    const effectiveEntry = entryByIndex(currentDictionary, entryIndex);
    if (!effectiveEntry) return;

    editingEntryIndex = entryIndex;
    editingSegmentTexts = CCHShared.entryEditableInputSegments(effectiveEntry);
    renderLoadedChords(currentSettingsFromForm());
  }

  function updateEditingSegment(segmentIndex, value) {
    if (editingEntryIndex === null) return;
    editingSegmentTexts[segmentIndex] = value;
    updateEditingControls();
  }

  function editingEntryBaseSegments() {
    const baseEntry = entryByIndex(currentRawDictionary, editingEntryIndex);
    return baseEntry ? CCHShared.entryEditableInputSegments(baseEntry) : [];
  }

  function editingHasSavedOverride() {
    return editingEntryIndex !== null && Array.isArray(inputDisplayOverrides[String(editingEntryIndex)]);
  }

  function editingIsDirty() {
    if (editingEntryIndex === null) return false;
    const currentTexts = editingSegmentTexts.map((value) => String(value ?? ""));
    const effectiveEntry = entryByIndex(currentDictionary, editingEntryIndex);
    const effectiveTexts = effectiveEntry ? CCHShared.entryEditableInputSegments(effectiveEntry) : [];
    if (currentTexts.length !== effectiveTexts.length) return true;
    return currentTexts.some((value, index) => value !== String(effectiveTexts[index] ?? ""));
  }

  function updateEditingControls() {
    const isEditing = editingEntryIndex !== null;
    const dirty = editingIsDirty();
    const hasSavedOverride = editingHasSavedOverride();

    els.saveInputOverrideButton.disabled = !isEditing || !dirty;
    els.revertInputOverrideButton.disabled = !isEditing || (!dirty && !hasSavedOverride);

    if (!isEditing) {
      els.editingStatus.textContent = "Click an input to edit it.";
      return;
    }

    const suffix = dirty ? " (unsaved)" : (hasSavedOverride ? " (saved override)" : "");
    els.editingStatus.textContent = `Editing entry ${editingEntryIndex}${suffix}`;
  }

  function sortedEntriesForPreview() {
    return (currentDictionary?.entries || []).slice().sort(compareEntriesForPreview);
  }

  function goToPage(pageNumber) {
    const entries = currentDictionary?.entries || [];
    const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
    currentPage = Math.min(Math.max(1, pageNumber), totalPages);
    renderLoadedChords(currentSettingsFromForm());
  }

  function renderEditableInput(entry, settings) {
    const wrapper = document.createElement("div");
    wrapper.className = "editableInputSegments";

    const segmentTexts = editingEntryIndex === entry.index
      ? editingSegmentTexts
      : CCHShared.entryEditableInputSegments(entry);

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
        updateEditingSegment(segmentIndex, event.target.value);
      });
      wrapper.appendChild(input);
    });

    return wrapper;
  }

  function renderLoadedChords(settings) {
    const entries = currentDictionary?.entries || [];

    updateSortButtonLabels();
    updateEditingControls();

    if (!entries.length) {
      els.loadedChordsEmpty.hidden = false;
      els.loadedChordsPanel.hidden = true;
      els.loadedSourceBadge.textContent = "source: —";
      els.loadedChordsTableBody.innerHTML = "";
      els.pageStatus.textContent = "";
      els.pageJumpInput.value = "1";
      return;
    }

    els.loadedChordsEmpty.hidden = true;
    els.loadedChordsPanel.hidden = false;
    els.loadedSourceBadge.textContent = `source: ${currentDictionary.source || "unknown"}`;

    const sortedEntries = sortedEntriesForPreview();
    const totalPages = Math.max(1, Math.ceil(sortedEntries.length / PAGE_SIZE));
    currentPage = Math.min(Math.max(1, currentPage), totalPages);

    const start = (currentPage - 1) * PAGE_SIZE;
    const pageEntries = sortedEntries.slice(start, start + PAGE_SIZE);

    els.loadedChordsTableBody.innerHTML = "";

    for (const entry of pageEntries) {
      const tr = document.createElement("tr");
      if (editingEntryIndex === entry.index) {
        tr.classList.add("editingRow");
      }

      const tdInput = document.createElement("td");
      tdInput.className = "inputCell";

      if (editingEntryIndex === entry.index) {
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
      const output = document.createElement("code");
      output.textContent = entry.outputText || "";
      tdOutput.appendChild(output);
      tr.appendChild(tdOutput);

      const tdUnknown = document.createElement("td");
      tdUnknown.textContent = entry.flags.hasUnknownCompoundSegment ? "yes" : "no";
      tr.appendChild(tdUnknown);

      els.loadedChordsTableBody.appendChild(tr);
    }

    els.pageStatus.textContent = `Page ${currentPage} of ${totalPages} · ${sortedEntries.length} total entries`;
    els.pageJumpInput.value = String(currentPage);
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

      hint_box_dark_mode_color: els.hintBoxDarkModeColor.value || defaults.hint_box_dark_mode_color,
      hint_box_dark_mode_opacity: clampNumber(els.hintBoxDarkModeOpacity.value, 0, 1, defaults.hint_box_dark_mode_opacity),
      hint_text_dark_mode_color: els.hintTextDarkModeColor.value || defaults.hint_text_dark_mode_color,

      hint_box_light_mode_color: els.hintBoxLightModeColor.value || defaults.hint_box_light_mode_color,
      hint_box_light_mode_opacity: clampNumber(els.hintBoxLightModeOpacity.value, 0, 1, defaults.hint_box_light_mode_opacity),
      hint_text_light_mode_color: els.hintTextLightModeColor.value || defaults.hint_text_light_mode_color,

      hint_text_font_size_em: clampNumber(els.hintTextFontSizeEm.value, 0.4, 2, defaults.hint_text_font_size_em),

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

  function applySettingsToForm(settings) {
    els.selectionMode.value = settings.selectionMode;
    els.enabled.checked = settings.enabled;
    els.includeArpeggiates.checked = settings.includeArpeggiates;
    els.includeModifierStyle.checked = settings.includeModifierStyle;
    els.showDebugOutline.checked = settings.showDebugOutline;
    els.debugLogging.checked = settings.debugLogging;
    els.pauseLiveRefresh.checked = settings.pauseLiveRefresh;
    els.showExtendedSpecialDescriptions.checked = settings.showExtendedSpecialDescriptions;

    els.hintBoxDarkModeColor.value = settings.hint_box_dark_mode_color || "#949ec5";
    els.hintBoxDarkModeOpacity.value = settings.hint_box_dark_mode_opacity ?? 0.92;
    els.hintTextDarkModeColor.value = settings.hint_text_dark_mode_color || "#15161e";

    els.hintBoxLightModeColor.value = settings.hint_box_light_mode_color || "#343b58";
    els.hintBoxLightModeOpacity.value = settings.hint_box_light_mode_opacity ?? 0.96;
    els.hintTextLightModeColor.value = settings.hint_text_light_mode_color || "#d0d1d7";

    els.hintTextFontSizeEm.value = settings.hint_text_font_size_em ?? 0.5;

    els.descDupAll.value = settings.specialTokenDescriptions.dup_all || "";
    els.descDupLeft.value = settings.specialTokenDescriptions.dup_left || "";
    els.descDupRight.value = settings.specialTokenDescriptions.dup_right || "";
    els.descLeftShift.value = settings.specialTokenDescriptions.left_shift || "";
    els.descRightShift.value = settings.specialTokenDescriptions.right_shift || "";
    els.descArpeggiate.value = settings.specialTokenDescriptions.arpeggiate || "";

    updateAppearancePreview(settings);
  }

  function updateAppearancePreview(settings) {
    els.hintPreviewDark.style.background = hexToRgba(settings.hint_box_dark_mode_color, settings.hint_box_dark_mode_opacity);
    els.hintPreviewDark.style.color = settings.hint_text_dark_mode_color;
    els.hintPreviewDark.style.fontSize = `${settings.hint_text_font_size_em}em`;

    els.hintPreviewLight.style.background = hexToRgba(settings.hint_box_light_mode_color, settings.hint_box_light_mode_opacity);
    els.hintPreviewLight.style.color = settings.hint_text_light_mode_color;
    els.hintPreviewLight.style.fontSize = `${settings.hint_text_font_size_em}em`;
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

  function collapseCompoundClusters(clusters) {
    if (clusters.length <= 2) {
      return clusters;
    }

    let trailingRenderableStart = clusters.length;
    while (trailingRenderableStart > 0 && isRenderableCompoundSegment(clusters[trailingRenderableStart - 1])) {
      trailingRenderableStart -= 1;
    }

    if (trailingRenderableStart <= 0 || trailingRenderableStart >= clusters.length) {
      return clusters;
    }

    return [
      clusters.slice(0, trailingRenderableStart).flat(),
      clusters.slice(trailingRenderableStart).flat()
    ];
  }

  function buildDecodedInputSegments(decodedInput) {
    const rawClusters = splitCompoundInputClustersFromPackedSlots(decodedInput.packedInputSlots);
    if (rawClusters.length <= 1) {
      return [];
    }

    const clusters = collapseCompoundClusters(rawClusters);

    return clusters.map((clusterCodes) => {
      if (isRenderableCompoundSegment(clusterCodes)) {
        return {
          kind: "decoded",
          inputCodes: clusterCodes
        };
      }

      return {
        kind: "unknown_compound",
        inputCodes: clusterCodes,
        inputTokens: [CCHShared.makePseudoSpecialToken("broken_image", "unknown compound segment")],
        rawInput: CCHShared.UNKNOWN_COMPOUND_PLACEHOLDER,
        editableText: "",
        sortText: CCHShared.UNKNOWN_COMPOUND_PLACEHOLDER
      };
    });
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
    const compoundInputSegments = buildDecodedInputSegments({ packedInputSlots });

    return {
      chainIndex,
      packedInputSlots,
      packedInputCodes: nonZeroPackedCodes,
      ascendingInputCodes,
      compoundInputSegments
    };
  }

  function parseCmlC0Line(line) {
    const match = String(line || "").trim().match(/^CML\s+C0\s+(\d+)$/);
    if (!match) return null;
    return Number.parseInt(match[1], 10);
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

  async function readSerialResponseLines(reader, timeoutMs = 4000, matchRegex = null, logLabel = "serial") {
    const decoder = new TextDecoder();
    const deadline = Date.now() + timeoutMs;
    let buffer = "";
    const lines = [];

    console.log(`[CCH serial] [${logLabel}] read loop starting`, { timeoutMs, matchRegex: String(matchRegex || "") });

    while (Date.now() < deadline) {
      const remaining = Math.max(1, deadline - Date.now());
      const readPromise = reader.read();
      const timeoutPromise = new Promise((resolve) => {
        window.setTimeout(() => resolve({ timeout: true }), remaining);
      });

      const result = await Promise.race([readPromise, timeoutPromise]);
      if (result?.timeout) {
        console.log(`[CCH serial] [${logLabel}] read timed out waiting for bytes`);
        break;
      }

      const { value, done } = result;
      if (done) {
        console.log(`[CCH serial] [${logLabel}] reader returned done=true`);
        break;
      }

      if (!value) {
        console.log(`[CCH serial] [${logLabel}] read returned empty value`);
        continue;
      }

      const chunkText = decoder.decode(value, { stream: true });
      const chunkHex = Array.from(value).map((byte) => byte.toString(16).toUpperCase().padStart(2, "0")).join(" ");
      console.log(`[CCH serial] [${logLabel}] chunk`, { chunkText, chunkHex, byteLength: value.length });

      buffer += chunkText;
      const parts = buffer.replaceAll(String.fromCharCode(13), "").split(String.fromCharCode(10));
      buffer = parts.pop() || "";

      for (const part of parts) {
        const line = part.trim();
        if (!line) continue;
        lines.push(line);
        console.log(`[CCH serial] [${logLabel}] parsed line`, line);
      }

      if (matchRegex && lines.some((line) => matchRegex.test(line))) {
        console.log(`[CCH serial] [${logLabel}] matched expected line`);
        break;
      }
    }

    const tail = buffer.trim();
    if (tail) {
      lines.push(tail);
      console.log(`[CCH serial] [${logLabel}] trailing buffer`, tail);
    }

    console.log(`[CCH serial] [${logLabel}] final lines`, lines);
    return lines;
  }

  async function sendSerialCommand(port, payload, matchRegex, timeoutMs = 4000) {
    const encoded = new TextEncoder().encode(payload + String.fromCharCode(13, 10));
    let writer = null;
    let reader = null;

    try {
      writer = port.writable.getWriter();
      console.log("[CCH serial] sending command", { payload, bytes: Array.from(encoded) });
      await writer.write(encoded);
    } finally {
      if (writer) {
        try {
          writer.releaseLock();
        } catch (_) {
        }
      }
    }

    await sleep(50);

    try {
      reader = port.readable.getReader();
      return await readSerialResponseLines(reader, timeoutMs, matchRegex, payload);
    } finally {
      if (reader) {
        try {
          await reader.cancel();
        } catch (_) {
        }
        try {
          reader.releaseLock();
        } catch (_) {
        }
      }
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

  async function fetchSerialChordmapDictionary() {
    if (!navigator.serial) {
      throw new Error("Web Serial is not available in this browser context.");
    }

    let port = null;

    try {
      port = await navigator.serial.requestPort();
      console.log("[CCH serial] selected port info", port.getInfo?.() || {});
      await port.open({ baudRate: SERIAL_BAUD_RATE });
      console.log("[CCH serial] port opened for full chordmap sync");
      await sleep(100);

      setStatus(els.importStatus, "Fetching chordmap count from connected Charachorder...");
      const countLines = await sendSerialCommand(port, "CML C0", /^CML\s+C0\b/, SERIAL_COUNT_TIMEOUT_MS);
      const combinedCountLines = combineSplitCmlLines(countLines);
      console.log("[CCH serial] combined CML C0 lines", combinedCountLines);
      const countLine = combinedCountLines.find((line) => /^CML\s+C0\b/.test(line));
      const entryCount = parseCmlC0Line(countLine);

      if (!Number.isFinite(entryCount) || entryCount < 0) {
        console.error("[CCH serial] invalid CML C0 response", combinedCountLines);
        throw new Error("The device did not return a valid chordmap count.");
      }

      console.log("[CCH serial] chordmap count", entryCount);
      const entries = [];

      for (let index = 0; index < entryCount; index += 1) {
        if (index === 0 || index % 25 === 0 || index === entryCount - 1) {
          setStatus(els.importStatus, `Syncing chordmap from device... ${index}/${entryCount}`);
        }

        const lines = await sendSerialCommand(
          port,
          `CML C1 ${index}`,
          new RegExp(`^CML\\s+C1\\s+${index}\\b`),
          SERIAL_ENTRY_TIMEOUT_MS
        );

        const combinedLines = combineSplitCmlLines(lines);
        console.log("[CCH serial] combined CML C1 lines", { index, combinedLines });
        const line = combinedLines.find((candidate) => new RegExp(`^CML\\s+C1\\s+${index}\\b`).test(candidate));
        const parsed = parseCmlC1Line(line);

        if (!parsed) {
          console.error("[CCH serial] missing or invalid CML C1 response", { index, combinedLines });
          throw new Error(`Failed to read chord entry ${index} from the device.`);
        }

        const decodedInput = decodeInputHex(parsed.inputHex);
        const outputCodes = decodeOutputCodesFromHex(parsed.outputHex);
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
            outputCodes,
            visibleOutputText: CCHShared.visibleOutputText(outputCodes)
          });
        }

        entries.push(
          CCHShared.buildEntry({
            index: parsed.index,
            inputCodes: decodedInput.ascendingInputCodes,
            inputSegments: decodedInput.compoundInputSegments.length ? decodedInput.compoundInputSegments : null,
            packedInputCodes: decodedInput.packedInputCodes,
            outputCodes,
            inputHex: parsed.inputHex,
            outputHex: parsed.outputHex,
            status: parsed.status,
            userFlags: { displayEnabled: true }
          })
        );
      }

      return CCHShared.buildParsedDictionary({
        entries,
        source: "serial",
        deviceEntryCount: entryCount,
        charaVersion: null
      });
    } finally {
      await closePortQuietly(port);
    }
  }

  async function saveParsedDictionary(parsedDictionary, successMessage) {
    await setStorage({
      [STORAGE_KEYS.parsedDictionary]: parsedDictionary,
      [STORAGE_KEYS.inputDisplayOverrides]: {}
    });
    currentRawDictionary = hydrateDictionary(parsedDictionary);
    inputDisplayOverrides = {};
    editingEntryIndex = null;
    editingSegmentTexts = [];
    currentPage = 1;
    applyCurrentDictionary();
    refreshMeta(currentDictionary);
    renderLoadedChords(currentSettingsFromForm());
    setStatus(els.importStatus, successMessage);
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
      setBusy(true);
      setStatus(els.importStatus, "Parsing JSON chordmap...");

      const raw = await readChosenText();
      const parsed = JSON.parse(raw);
      const parsedDictionary = CCHShared.parseChordJson(parsed);
      await saveParsedDictionary(parsedDictionary, `Saved ${parsedDictionary.entryCount} chord entries from JSON.`);

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

      const parsedDictionary = await fetchSerialChordmapDictionary();
      await saveParsedDictionary(parsedDictionary, `Saved ${parsedDictionary.entryCount} chord entries from connected Charachorder.`);

      console.log("[CCH options] parsed and saved serial chord dictionary", {
        source: parsedDictionary.source,
        deviceEntryCount: parsedDictionary.deviceEntryCount,
        entryCount: parsedDictionary.entryCount,
        sample: parsedDictionary.entries.slice(0, 5)
      });
    } catch (error) {
      console.error(error);
      setStatus(els.importStatus, error.message || "Failed to sync from connected Charachorder.", true);
    } finally {
      setBusy(false);
    }
  }

  async function clearDictionary() {
    try {
      setBusy(true);
      await removeStorage([STORAGE_KEYS.parsedDictionary, STORAGE_KEYS.inputDisplayOverrides]);
      currentRawDictionary = null;
      currentDictionary = null;
      inputDisplayOverrides = {};
      editingEntryIndex = null;
      editingSegmentTexts = [];
      currentPage = 1;
      refreshMeta(null);
      renderLoadedChords(currentSettingsFromForm());
      setStatus(els.importStatus, "Cleared saved dictionary.");
    } finally {
      setBusy(false);
    }
  }

  async function saveEditedInputOverride() {
    if (editingEntryIndex === null) return;

    const baseEntry = entryByIndex(currentRawDictionary, editingEntryIndex);
    if (!baseEntry) return;

    const normalizedTexts = editingSegmentTexts.map((value) => String(value ?? ""));
    const baseTexts = CCHShared.entryEditableInputSegments(baseEntry).map((value) => String(value ?? ""));
    const nextOverrides = { ...(inputDisplayOverrides || {}) };

    const matchesBase = normalizedTexts.length === baseTexts.length
      && normalizedTexts.every((value, index) => value === baseTexts[index]);

    if (matchesBase) {
      delete nextOverrides[String(editingEntryIndex)];
    } else {
      nextOverrides[String(editingEntryIndex)] = normalizedTexts;
    }

    inputDisplayOverrides = nextOverrides;
    await setStorage({ [STORAGE_KEYS.inputDisplayOverrides]: inputDisplayOverrides });
    applyCurrentDictionary();
    editingSegmentTexts = CCHShared.entryEditableInputSegments(entryByIndex(currentDictionary, editingEntryIndex) || baseEntry);
    renderLoadedChords(currentSettingsFromForm());
    setStatus(els.importStatus, `Saved display override for entry ${editingEntryIndex}.`);
  }

  async function revertEditedInputOverride() {
    if (editingEntryIndex === null) return;

    const nextOverrides = { ...(inputDisplayOverrides || {}) };
    delete nextOverrides[String(editingEntryIndex)];
    inputDisplayOverrides = nextOverrides;
    await setStorage({ [STORAGE_KEYS.inputDisplayOverrides]: inputDisplayOverrides });
    applyCurrentDictionary();

    const baseEntry = entryByIndex(currentRawDictionary, editingEntryIndex);
    editingSegmentTexts = baseEntry ? CCHShared.entryEditableInputSegments(baseEntry) : [];
    renderLoadedChords(currentSettingsFromForm());
    setStatus(els.importStatus, `Reverted entry ${editingEntryIndex} to the parsed device view.`);
  }

  async function saveSettings() {

    try {
      const settings = currentSettingsFromForm();
      await setStorage({ [STORAGE_KEYS.settings]: settings });
      renderLoadedChords(settings);
      setStatus(els.settingsStatus, "Settings saved.");
      console.log("[CCH options] saved settings", settings);
    } catch (error) {
      console.error(error);
      setStatus(els.settingsStatus, "Failed to save settings.", true);
    }
  }

  async function loadInitialState() {
    const stored = await getStorage([
      STORAGE_KEYS.parsedDictionary,
      STORAGE_KEYS.inputDisplayOverrides,
      STORAGE_KEYS.settings
    ]);
    currentRawDictionary = hydrateDictionary(stored[STORAGE_KEYS.parsedDictionary]);
    inputDisplayOverrides = stored[STORAGE_KEYS.inputDisplayOverrides] || {};
    applyCurrentDictionary();
    const settings = hydrateSettings(stored[STORAGE_KEYS.settings]);

    applySettingsToForm(settings);
    refreshMeta(currentDictionary);
    renderLoadedChords(settings);
  }

  els.importButton.addEventListener("click", importJson);
  els.syncDeviceButton.addEventListener("click", syncFromDevice);
  els.clearButton.addEventListener("click", clearDictionary);
  els.saveSettingsButton.addEventListener("click", saveSettings);
  els.saveInputOverrideButton.addEventListener("click", saveEditedInputOverride);
  els.revertInputOverrideButton.addEventListener("click", revertEditedInputOverride);
  els.sortInputButton.addEventListener("click", () => setSort("input"));
  els.sortOutputButton.addEventListener("click", () => setSort("output"));
  els.sortUnknownCompoundButton.addEventListener("click", () => setSort("unknown_compound"));

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
    els.showExtendedSpecialDescriptions,
    els.descDupAll,
    els.descDupLeft,
    els.descDupRight,
    els.descLeftShift,
    els.descRightShift,
    els.descArpeggiate
  ].forEach((el) => {
    el.addEventListener("input", () => renderLoadedChords(currentSettingsFromForm()));
    el.addEventListener("change", () => renderLoadedChords(currentSettingsFromForm()));
  });

  [
    els.hintBoxDarkModeColor,
    els.hintBoxDarkModeOpacity,
    els.hintTextDarkModeColor,
    els.hintBoxLightModeColor,
    els.hintBoxLightModeOpacity,
    els.hintTextLightModeColor,
    els.hintTextFontSizeEm
  ].forEach((el) => {
    el.addEventListener("input", () => updateAppearancePreview(currentSettingsFromForm()));
    el.addEventListener("change", () => updateAppearancePreview(currentSettingsFromForm()));
  });

  loadInitialState().catch((error) => {
    console.error(error);
    setStatus(els.importStatus, "Failed to load existing settings.", true);
  });
})();
