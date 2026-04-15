(() => {
  const SPECIAL_INPUT_META = {
    513: { key: "left_shift", label: "left_shift" },
    517: { key: "right_shift", label: "right_shift" },
    533: { key: "dup_right", label: "dup_right" },
    535: { key: "dup_all", label: "dup_all" },
    536: { key: "dup_left", label: "dup_left" },
    1001: { key: "arpeggiate", label: "arpeggiate" }
  };

  const ICON_FILE_MAP = {
    dup_all: "icons/dup_all.svg",
    dup_left: "icons/dup.svg",
    dup_right: "icons/dup.svg",
    left_shift: "icons/shift.svg",
    right_shift: "icons/shift.svg",
    arpeggiate: "icons/arpeggiate.svg"
  };

  function defaultSpecialTokenDescriptions() {
    return {
      left_shift: "",
      right_shift: "",
      dup_right: "",
      dup_all: "",
      dup_left: "",
      arpeggiate: ""
    };
  }

  function meaningfulInputCodes(inputCodes) {
    return (Array.isArray(inputCodes) ? inputCodes : []).filter((code) => code !== 0);
  }

  function inputCodeToToken(code) {
    const special = SPECIAL_INPUT_META[code];
    if (special) {
      return {
        type: "special",
        code,
        key: special.key,
        label: special.label
      };
    }

    if (code >= 32 && code <= 126) {
      return {
        type: "char",
        code,
        char: String.fromCharCode(code)
      };
    }

    return {
      type: "unknown",
      code,
      label: `code ${code}`
    };
  }

  function inputCodesToTokens(inputCodes) {
    return meaningfulInputCodes(inputCodes).map((code) => inputCodeToToken(code));
  }

  function tokenToRawDisplay(token) {
    if (token.type === "char") {
      return token.char;
    }
    return `(${token.label})`;
  }

  function inputTokensToRawDisplay(tokens) {
    return (Array.isArray(tokens) ? tokens : []).map((token) => tokenToRawDisplay(token)).join("");
  }

  function inputCodesToRawDisplay(inputCodes) {
    return inputTokensToRawDisplay(inputCodesToTokens(inputCodes));
  }

  function entryInputTokens(entry) {
    if (Array.isArray(entry?.inputTokens)) {
      return entry.inputTokens;
    }
    if (Array.isArray(entry?.inputCodes)) {
      return inputCodesToTokens(entry.inputCodes);
    }
    return [];
  }

  function visibleOutputText(outputCodes) {
    const chars = [];
    for (const code of Array.isArray(outputCodes) ? outputCodes : []) {
      if (code >= 32 && code <= 126) {
        chars.push(String.fromCharCode(code));
      }
    }
    return chars.join("");
  }

  function normalizeOutputKey(text) {
    if (!text) return "";
    return text
      .trim()
      .replace(/^[^\p{L}\p{N}]+/gu, "")
      .replace(/[^\p{L}\p{N}]+$/gu, "")
      .toLowerCase();
  }

  function compareEntriesByShortest(a, b) {
    const aLen = meaningfulInputCodes(a.inputCodes).length;
    const bLen = meaningfulInputCodes(b.inputCodes).length;
    if (aLen !== bLen) return aLen - bLen;
    if ((a.rawInput || "").length !== (b.rawInput || "").length) {
      return (a.rawInput || "").length - (b.rawInput || "").length;
    }
    return (a.index ?? 0) - (b.index ?? 0);
  }

  function buildEntry({ index, inputCodes, outputCodes, packedInputCodes = null, inputHex = null, outputHex = null, status = 0, userFlags = null }) {
    const safeInputCodes = Array.isArray(inputCodes) ? inputCodes.slice() : [];
    const safeOutputCodes = Array.isArray(outputCodes) ? outputCodes.slice() : [];
    const inputTokens = inputCodesToTokens(safeInputCodes);
    const rawInput = inputTokensToRawDisplay(inputTokens);
    const outputText = visibleOutputText(safeOutputCodes);
    const normalizedOutput = normalizeOutputKey(outputText);
    const nonZeroInput = meaningfulInputCodes(safeInputCodes);

    return {
      index,
      inputCodes: safeInputCodes,
      inputTokens,
      outputCodes: safeOutputCodes,
      packedInputCodes: Array.isArray(packedInputCodes) ? packedInputCodes.slice() : null,
      inputHex,
      outputHex,
      status,
      rawInput,
      outputText,
      normalizedOutput,
      userFlags: {
        displayEnabled: userFlags?.displayEnabled !== false
      },
      flags: {
        hasArpeggiate: nonZeroInput.includes(1001),
        hasModifierLikeOutput: safeOutputCodes.some((code) => code > 126),
        outputLooksWordLike: /^[\p{L}\p{N}][\p{L}\p{N}'’.-]*$/u.test(outputText || "")
      }
    };
  }

  function buildByNormalizedOutput(entries) {
    const byNormalizedOutput = {};
    entries.forEach((entry, index) => {
      if (!entry.normalizedOutput) return;
      byNormalizedOutput[entry.normalizedOutput] ??= [];
      byNormalizedOutput[entry.normalizedOutput].push(index);
    });
    return byNormalizedOutput;
  }

  function buildParsedDictionary({ entries, source = "json", charaVersion = null, deviceEntryCount = null, savedAt = null }) {
    const safeEntries = Array.isArray(entries) ? entries : [];
    return {
      source,
      charaVersion,
      entryCount: safeEntries.length,
      deviceEntryCount: deviceEntryCount ?? safeEntries.length,
      entries: safeEntries,
      byNormalizedOutput: buildByNormalizedOutput(safeEntries),
      savedAt: savedAt ?? Date.now()
    };
  }

  function parseChordJson(jsonValue) {
    if (!jsonValue || typeof jsonValue !== "object") {
      throw new Error("Chord JSON must be an object.");
    }
    if (jsonValue.type !== "chords") {
      throw new Error("Expected a Charachorder chord export with type='chords'.");
    }
    if (!Array.isArray(jsonValue.chords)) {
      throw new Error("Expected a 'chords' array.");
    }

    const entries = [];

    jsonValue.chords.forEach((pair, index) => {
      if (!Array.isArray(pair) || pair.length !== 2) return;
      const [inputCodes, outputCodes] = pair;
      if (!Array.isArray(inputCodes) || !Array.isArray(outputCodes)) return;

      entries.push(buildEntry({
        index,
        inputCodes,
        outputCodes
      }));
    });

    return buildParsedDictionary({
      entries,
      source: "json",
      charaVersion: jsonValue.charaVersion ?? null
    });
  }

  function hydrateParsedDictionary(dictionary) {
    if (!dictionary || typeof dictionary !== "object") {
      return null;
    }

    const entries = Array.isArray(dictionary.entries)
      ? dictionary.entries.map((entry, index) => buildEntry({
          index: Number.isFinite(entry?.index) ? entry.index : index,
          inputCodes: Array.isArray(entry?.inputCodes) ? entry.inputCodes : [],
          outputCodes: Array.isArray(entry?.outputCodes) ? entry.outputCodes : [],
          packedInputCodes: Array.isArray(entry?.packedInputCodes) ? entry.packedInputCodes : null,
          inputHex: typeof entry?.inputHex === "string" ? entry.inputHex : null,
          outputHex: typeof entry?.outputHex === "string" ? entry.outputHex : null,
          status: Number.isFinite(entry?.status) ? entry.status : 0,
          userFlags: entry?.userFlags || null
        }))
      : [];

    return buildParsedDictionary({
      entries,
      source: dictionary.source || "json",
      charaVersion: dictionary.charaVersion ?? null,
      deviceEntryCount: Number.isFinite(dictionary.deviceEntryCount) ? dictionary.deviceEntryCount : entries.length,
      savedAt: dictionary.savedAt ?? Date.now()
    });
  }

  function dereferenceEntries(dictionary, refs) {
    if (!Array.isArray(refs) || !dictionary?.entries) return [];
    return refs.map((index) => dictionary.entries[index]).filter(Boolean);
  }

  function chooseEntries(dictionary, refs, settings) {
    const entries = dereferenceEntries(dictionary, refs);
    if (!entries.length) return [];

    const filtered = entries.filter((entry) => {
      if (!settings.includeArpeggiates && entry.flags.hasArpeggiate) return false;
      if (!settings.includeModifierStyle && entry.flags.hasModifierLikeOutput) return false;
      return true;
    });

    const usable = filtered.length ? filtered : entries;

    switch (settings.selectionMode) {
      case "all":
        return usable.slice().sort(compareEntriesByShortest);
      case "first":
        return usable.slice(0, 1);
      case "shortest":
      default:
        return usable.slice().sort(compareEntriesByShortest).slice(0, 1);
    }
  }

  function normalizeTokenForLookup(text) {
    return normalizeOutputKey(text);
  }

  function defaultSettings() {
    return {
      enabled: true,
      selectionMode: "shortest",
      includeArpeggiates: false,
      includeModifierStyle: false,
      showDebugOutline: false,
      debugLogging: true,
      pauseLiveRefresh: false,
      showExtendedSpecialDescriptions: true,
      specialTokenDescriptions: defaultSpecialTokenDescriptions(),

      hint_box_dark_mode_color: "#949EC5",
      hint_box_dark_mode_opacity: 0.92,
      hint_text_dark_mode_color: "#15161e",

      hint_box_light_mode_color: "#343B58",
      hint_box_light_mode_opacity: 0.96,
      hint_text_light_mode_color: "#d0d1d7",

      hint_text_font_size_em: 0.5
    };
  }

  globalThis.CCHShared = {
    parseChordJson,
    hydrateParsedDictionary,
    buildParsedDictionary,
    buildEntry,
    defaultSettings,
    chooseEntries,
    normalizeTokenForLookup,
    meaningfulInputCodes,
    inputCodesToRawDisplay,
    inputCodesToTokens,
    inputTokensToRawDisplay,
    entryInputTokens,
    visibleOutputText,
    SPECIAL_INPUT_META,
    ICON_FILE_MAP,
    defaultSpecialTokenDescriptions
  };
})();
