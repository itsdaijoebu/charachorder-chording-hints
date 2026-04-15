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
    "dup_all": "icons/dup_all.svg",
    "dup_left": "icons/dup.svg",
    "dup_right": "icons/dup.svg",
    "left_shift": "icons/shift.svg",
    "right_shift": "icons/shift.svg",
    "arpeggiate": "icons/arpeggiate.svg"
  };

  function defaultSpecialTokenDescriptions() {
    return {
      "left_shift": "",
      "right_shift": "",
      "dup_right": "",
      "dup_all": "",
      "dup_left": "",
      "arpeggiate": ""
    };
  }

  function meaningfulInputCodes(inputCodes) {
    return inputCodes.filter((code) => code !== 0);
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
    return tokens.map((token) => tokenToRawDisplay(token)).join("");
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
    for (const code of outputCodes) {
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
    if (a.rawInput.length !== b.rawInput.length) return a.rawInput.length - b.rawInput.length;
    return a.index - b.index;
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
    const byNormalizedOutput = {};

    jsonValue.chords.forEach((pair, index) => {
      if (!Array.isArray(pair) || pair.length !== 2) return;
      const [inputCodes, outputCodes] = pair;
      if (!Array.isArray(inputCodes) || !Array.isArray(outputCodes)) return;

      const inputTokens = inputCodesToTokens(inputCodes);
      const rawInput = inputTokensToRawDisplay(inputTokens);
      const outputText = visibleOutputText(outputCodes);
      const normalizedOutput = normalizeOutputKey(outputText);
      const nonZeroInput = meaningfulInputCodes(inputCodes);

      const entry = {
        index,
        inputCodes,
        inputTokens,
        outputCodes,
        rawInput,
        outputText,
        normalizedOutput,
        flags: {
          hasArpeggiate: nonZeroInput.includes(1001),
          hasModifierLikeOutput: outputCodes.some((code) => code > 126),
          outputLooksWordLike: /^[\p{L}\p{N}][\p{L}\p{N}'’.-]*$/u.test(outputText || "")
        }
      };

      entries.push(entry);
      if (normalizedOutput) {
        byNormalizedOutput[normalizedOutput] ??= [];
        byNormalizedOutput[normalizedOutput].push(index);
      }
    });

    return {
      charaVersion: jsonValue.charaVersion ?? null,
      entryCount: entries.length,
      entries,
      byNormalizedOutput,
      savedAt: Date.now()
    };
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

      hint_text_font_size_em: 0.5,
    };
  }

  globalThis.CCHShared = {
    parseChordJson,
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
