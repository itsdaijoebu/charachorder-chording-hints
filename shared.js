(() => {
  const SPECIAL_INPUT_META = {
    256: { key: "inhibit_concatenator", label: "inhibit_concatenator" },
    298: { key: "backspace", label: "backspace"},
    335: { key: "kbright", label: "kbright"},
    336: { key: "kbleft", label: "kbleft"},
    337: { key: "kbdown", label: "kbdown"},
    338: { key: "kbup", label: "kbup"},
    513: { key: "left_shift", label: "left_shift" },
    517: { key: "right_shift", label: "right_shift" },
    533: { key: "dup_right", label: "dup_right" },
    535: { key: "dup_all", label: "dup_all" },
    536: { key: "dup_left", label: "dup_left" },
    540: { key: "ambileft_left", label: "ambileft_left" },
    542: { key: "ambiright_right", label: "ambiright_right" },
    545: { key: "hyperspace", label: "hyperspace" },
    547: { key: "hyperspace_capture", label: "hyperspace_capture" },
    548: { key: "layer1_left", label: "layer1_left" },
    549: { key: "layer1_right", label: "layer1_right" },
    550: { key: "layer2_left", label: "layer2_left" },
    551: { key: "layer2_right", label: "layer2_right" },
    552: { key: "layer3_left", label: "layer3_left" },
    553: { key: "layer3_right", label: "layer3_right" },
    554: { key: "layer4_left", label: "layer4_left" },
    555: { key: "layer4_right", label: "layer4_right" },
    573: { key: "capitalize", label: "capitalize" },
    574: { key: "join", label: "join" },
    575: { key: "quickfix", label: "quickfix" },
    1001: { key: "arpeggiate", label: "arpeggiate" },
    1002: { key: "tapdance", label: "tapdance" },
  };

  const ICON_FILE_MAP = {
    dup_all: "icons/dup_all.svg",
    dup_left: "icons/dup.svg",
    dup_right: "icons/dup.svg",
    left_shift: "icons/shift.svg",
    right_shift: "icons/shift.svg",
    arpeggiate: "icons/arpeggiate.svg",
    broken_image: "icons/broken_image.svg",
    compound_marker: "icons/cmpd_marker.svg",
    ambileft_left: "icons/ambileft.svg",
    ambiright_right: "icons/ambiright.svg",
    backspace: "icons/backspace.svg",
    capitalize: "icons/capitalize.svg",
    hyperspace: "icons/hyperspace.svg",
    hyperspace_capture: "icons/hyperspace_capture.svg",
    inhibit_concatenator: "icons/inhibit_concatenator.svg",
    join: "icons/join.svg",
    kbdown: "icons/kbdown.svg",
    kbup: "icons/kbup.svg",
    kbleft: "icons/kbleft.svg",
    kbright: "icons/kbright.svg",
    layer1_left: "icons/layer1.svg",
    layer1_right: "icons/layer1.svg",
    layer2_left: "icons/layer2.svg",
    layer2_right: "icons/layer2.svg",
    layer3_left: "icons/layer3.svg",
    layer3_right: "icons/layer3.svg",
    layer4_left: "icons/layer4.svg",
    layer4_right: "icons/layer4.svg",
    quickfix: "icons/quickfix.svg",
    tapdance: "icons/tapdance.svg",
  };

  const INPUT_SEGMENT_SEPARATOR = " + ";
  const UNKNOWN_COMPOUND_PLACEHOLDER = "�";

  function defaultSpecialTokenDescriptions() {
    return {
      left_shift: "Left Shift",
      right_shift: "Right Shift",
      dup_right: "Repeat Last Character (Right)",
      dup_all: "Repeat Last Input",
      dup_left: "Repeat Last Character (Left)",
      arpeggiate: "Arpeggiate Chord",
      broken_image: "Unable to parse whatever this was supposed to be",
      compound_marker: "Compound or Dynamic Library Chord",
      ambileft_left: "Ambidextrous Throwover (Left)",
      ambiright_right: "Ambidextrous Throwover (Right)",
      backspace: "Backspace",
      capitalize: "Capitalize",
      hyperspace: "Hyperspace",
      hyperspace_capture: "Hyperspace Capture",
      inhibit_concatenator: "Inhibit Concatenator - prevents concatenate after this chord",
      join: "Join - delete the previous concatenator",
      kbdown: "Keyboard Down",
      kbup: "Keyboard Up",
      kbleft: "Keyboard Left",
      kbright: "Keyboard Right",
      layer1_left: "Layer 1 (Left)",
      layer1_right: "Layer 1 (Right)",
      layer2_left: "Layer 2 (Left)",
      layer2_right: "Layer 2 (Right)",
      layer3_left: "Layer 3 (Left)",
      layer3_right: "Layer 3 (Right)",
      layer4_left: "Layer 4 (Left)",
      layer4_right: "Layer 4 (Right)",
      quickfix: "Quickfix - delete last chord attempt",
      tapdance: "Tap Dance Chord",
    };
  }

  function meaningfulInputCodes(inputCodes) {
    return (Array.isArray(inputCodes) ? inputCodes : []).filter((code) => code !== 0);
  }

  function sanitizeCodeArray(values) {
    return (Array.isArray(values) ? values : [])
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));
  }

  function textToCodeArray(text) {
    return Array.from(String(text ?? ""))
      .map((char) => char.codePointAt(0))
      .filter((value) => Number.isFinite(value));
  }

  function parseCompoundInputString(inputText) {
    const safeText = String(inputText ?? "").trim();
    if (!safeText) return [];

    return safeText
      .split(/\s*\+\s*/u)
      .map((segmentText) => textToCodeArray(segmentText))
      .filter((segmentCodes) => segmentCodes.length);
  }

  function normalizeInputSegmentsValue(inputValue) {
    if (Array.isArray(inputValue)) {
      if (inputValue.every((value) => Number.isFinite(Number(value)))) {
        const codes = sanitizeCodeArray(inputValue);
        return codes.length ? [codes] : [];
      }

      const nestedSegments = [];
      for (const segmentValue of inputValue) {
        nestedSegments.push(...normalizeInputSegmentsValue(segmentValue));
      }
      return nestedSegments;
    }

    if (typeof inputValue === "string") {
      return parseCompoundInputString(inputValue);
    }

    if (inputValue && typeof inputValue === "object") {
      if (Array.isArray(inputValue.inputSegments)) {
        return normalizeInputSegmentsValue(inputValue.inputSegments);
      }

      if (Array.isArray(inputValue.segments)) {
        return normalizeInputSegmentsValue(inputValue.segments);
      }

      if (Array.isArray(inputValue.inputCodes)) {
        const codes = sanitizeCodeArray(inputValue.inputCodes);
        return codes.length ? [codes] : [];
      }

      if (Array.isArray(inputValue.codes)) {
        const codes = sanitizeCodeArray(inputValue.codes);
        return codes.length ? [codes] : [];
      }

      if (typeof inputValue.rawInput === "string") {
        return parseCompoundInputString(inputValue.rawInput);
      }

      if (typeof inputValue.text === "string") {
        return parseCompoundInputString(inputValue.text);
      }
    }

    return [];
  }

  function normalizeOutputCodesValue(outputValue) {
    if (Array.isArray(outputValue)) {
      return sanitizeCodeArray(outputValue);
    }

    if (typeof outputValue === "string") {
      return textToCodeArray(outputValue);
    }

    if (outputValue && typeof outputValue === "object") {
      if (Array.isArray(outputValue.outputCodes)) {
        return sanitizeCodeArray(outputValue.outputCodes);
      }

      if (Array.isArray(outputValue.codes)) {
        return sanitizeCodeArray(outputValue.codes);
      }

      if (typeof outputValue.outputText === "string") {
        return textToCodeArray(outputValue.outputText);
      }

      if (typeof outputValue.text === "string") {
        return textToCodeArray(outputValue.text);
      }

      if (typeof outputValue.word === "string") {
        return textToCodeArray(outputValue.word);
      }
    }

    return [];
  }

  function makePseudoSpecialToken(key, label) {
    return {
      type: "special",
      code: null,
      key,
      label
    };
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

  function normalizeInputToken(token) {
    if (!token || typeof token !== "object") {
      return makePseudoSpecialToken("broken_image", "unknown compound segment");
    }

    if (token.type === "char") {
      const char = typeof token.char === "string" && token.char ? token.char[0] : "";
      if (char) {
        return {
          type: "char",
          code: Number.isFinite(token.code) ? token.code : char.codePointAt(0),
          char
        };
      }
    }

    if (token.type === "special") {
      return {
        type: "special",
        code: Number.isFinite(token.code) ? token.code : null,
        key: typeof token.key === "string" ? token.key : "broken_image",
        label: typeof token.label === "string" ? token.label : "unknown compound segment"
      };
    }

    if (token.type === "unknown") {
      const code = Number.isFinite(token.code) ? token.code : null;
      return {
        type: "unknown",
        code,
        label: typeof token.label === "string" ? token.label : `code ${code ?? "?"}`
      };
    }

    return makePseudoSpecialToken("broken_image", "unknown compound segment");
  }

  function inputCodesToTokens(inputCodes) {
    return meaningfulInputCodes(inputCodes).map((code) => inputCodeToToken(code));
  }

  function tokenToRawDisplay(token) {
    if (token.type === "char") {
      return token.char;
    }
    if (token.type === "special" && token.key === "broken_image") {
      return UNKNOWN_COMPOUND_PLACEHOLDER;
    }
    if (token.type === "special" && token.key === "compound_marker") {
      return INPUT_SEGMENT_SEPARATOR;
    }
    return `(${token.label})`;
  }

  function inputTokensToRawDisplay(tokens) {
    return (Array.isArray(tokens) ? tokens : []).map((token) => tokenToRawDisplay(token)).join("");
  }

  function inputCodesToRawDisplay(inputCodes) {
    return inputTokensToRawDisplay(inputCodesToTokens(inputCodes));
  }

  function normalizeStoredInputSegments(inputSegments) {
    return (Array.isArray(inputSegments) ? inputSegments : [])
      .map((segment, index) => {
        const safeInputCodes = Array.isArray(segment)
          ? sanitizeCodeArray(segment)
          : sanitizeCodeArray(segment?.inputCodes);

        const kind = typeof segment?.kind === "string" ? segment.kind : "decoded";

        let inputTokens;
        if (Array.isArray(segment?.inputTokens) && segment.inputTokens.length) {
          inputTokens = segment.inputTokens.map((token) => normalizeInputToken(token));
        } else if (kind === "unknown_compound") {
          inputTokens = [makePseudoSpecialToken("broken_image", "unknown compound segment")];
        } else {
          inputTokens = inputCodesToTokens(safeInputCodes);
        }

        let rawInput = typeof segment?.rawInput === "string"
          ? segment.rawInput
          : inputTokensToRawDisplay(inputTokens);

        if (kind === "unknown_compound" && !rawInput) {
          rawInput = UNKNOWN_COMPOUND_PLACEHOLDER;
        }

        const editableText = typeof segment?.editableText === "string"
          ? segment.editableText
          : (kind === "unknown_compound" ? "" : rawInput);

        const sortText = typeof segment?.sortText === "string"
          ? segment.sortText
          : rawInput;

        if (!safeInputCodes.length && !inputTokens.length && !rawInput && !editableText && kind !== "unknown_compound") {
          return null;
        }

        return {
          index,
          kind,
          inputCodes: safeInputCodes,
          inputTokens,
          rawInput,
          editableText,
          sortText
        };
      })
      .filter(Boolean);
  }

  function inputSegmentsToRawDisplay(inputSegments) {
    return normalizeStoredInputSegments(inputSegments)
      .map((segment) => segment.rawInput)
      .join(INPUT_SEGMENT_SEPARATOR);
  }

  function entryInputSegments(entry) {
    if (Array.isArray(entry?.inputSegments)) {
      const normalizedSegments = normalizeStoredInputSegments(entry.inputSegments);
      if (normalizedSegments.length) {
        return normalizedSegments;
      }
    }

    if (Array.isArray(entry?.inputCodes)) {
      const inputCodes = sanitizeCodeArray(entry.inputCodes);
      const inputTokens = Array.isArray(entry?.inputTokens)
        ? entry.inputTokens.map((token) => normalizeInputToken(token))
        : inputCodesToTokens(inputCodes);

      return [{
        index: 0,
        kind: "decoded",
        inputCodes,
        inputTokens,
        rawInput: typeof entry?.rawInput === "string"
          ? entry.rawInput
          : inputTokensToRawDisplay(inputTokens),
        editableText: typeof entry?.rawInput === "string"
          ? entry.rawInput
          : inputTokensToRawDisplay(inputTokens),
        sortText: typeof entry?.rawInput === "string"
          ? entry.rawInput
          : inputTokensToRawDisplay(inputTokens)
      }];
    }

    if (typeof entry?.rawInput === "string" && entry.rawInput.trim()) {
      return normalizeStoredInputSegments(
        normalizeInputSegmentsValue(entry.rawInput)
      );
    }

    return [];
  }

  function entryInputTokens(entry) {
    return entryInputSegments(entry).flatMap((segment) => segment.inputTokens);
  }

  function entryEditableInputSegments(entry) {
    return entryInputSegments(entry).map((segment) => segment.editableText ?? segment.rawInput ?? "");
  }

  function entryInputSortText(entry) {
    return entryInputSegments(entry)
      .map((segment) => segment.sortText ?? segment.rawInput ?? "")
      .join(INPUT_SEGMENT_SEPARATOR);
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

  function buildEntry({
    index,
    inputCodes,
    inputSegments = null,
    rawInput = null,
    outputCodes,
    packedInputCodes = null,
    inputHex = null,
    outputHex = null,
    status = 0,
    userFlags = null
  }) {
    const derivedInputSegments = normalizeStoredInputSegments(
      Array.isArray(inputSegments) && inputSegments.length
        ? inputSegments
        : normalizeInputSegmentsValue(
            Array.isArray(inputCodes) && inputCodes.length
              ? inputCodes
              : rawInput
          )
    );

    const safeInputSegments = derivedInputSegments.length
      ? derivedInputSegments
      : normalizeStoredInputSegments([sanitizeCodeArray(inputCodes)]);

    const safeInputCodes = safeInputSegments.flatMap((segment) => segment.inputCodes);
    const inputTokens = safeInputSegments.flatMap((segment) => segment.inputTokens);
    const safeOutputCodes = Array.isArray(outputCodes) ? outputCodes.slice() : [];
    const outputText = visibleOutputText(safeOutputCodes);
    const normalizedOutput = normalizeOutputKey(outputText);
    const nonZeroInput = meaningfulInputCodes(safeInputCodes);

    return {
      index,
      inputCodes: safeInputCodes,
      inputSegments: safeInputSegments,
      inputTokens,
      outputCodes: safeOutputCodes,
      packedInputCodes: Array.isArray(packedInputCodes) ? packedInputCodes.slice() : null,
      inputHex,
      outputHex,
      status,
      rawInput: safeInputSegments.length
        ? inputSegmentsToRawDisplay(safeInputSegments)
        : (rawInput || inputTokensToRawDisplay(inputTokens)),
      outputText,
      normalizedOutput,
      userFlags: {
        displayEnabled: userFlags?.displayEnabled !== false
      },
      flags: {
        hasArpeggiate: nonZeroInput.includes(1001),
        hasModifierLikeOutput: safeOutputCodes.some((code) => code > 126),
        outputLooksWordLike: /^[\p{L}\p{N}][\p{L}\p{N}'’.-]*$/u.test(outputText || ""),
        isCompoundInput: safeInputSegments.length > 1,
        hasUnknownCompoundSegment: safeInputSegments.some((segment) => segment.kind === "unknown_compound")
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

  function normalizeChordPair(rawChord) {
    if (Array.isArray(rawChord) && rawChord.length >= 2) {
      const [rawInputValue, rawOutputValue] = rawChord;
      return {
        inputSegments: normalizeInputSegmentsValue(rawInputValue),
        outputCodes: normalizeOutputCodesValue(rawOutputValue),
        status: 0
      };
    }

    if (!rawChord || typeof rawChord !== "object") {
      return null;
    }

    const rawInputValue =
      rawChord.inputSegments ??
      rawChord.inputCodes ??
      rawChord.input ??
      rawChord.chord ??
      rawChord.keys ??
      rawChord.rawInput ??
      null;

    const rawOutputValue =
      rawChord.outputCodes ??
      rawChord.output ??
      rawChord.outputText ??
      rawChord.text ??
      rawChord.word ??
      null;

    return {
      inputSegments: normalizeInputSegmentsValue(rawInputValue),
      outputCodes: normalizeOutputCodesValue(rawOutputValue),
      status: Number.isFinite(rawChord.status) ? rawChord.status : 0
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

    jsonValue.chords.forEach((rawChord, index) => {
      const normalizedPair = normalizeChordPair(rawChord);
      if (!normalizedPair) return;
      if (!normalizedPair.inputSegments.length || !normalizedPair.outputCodes.length) return;

      entries.push(buildEntry({
        index,
        inputSegments: normalizedPair.inputSegments,
        outputCodes: normalizedPair.outputCodes,
        status: normalizedPair.status
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
          inputSegments: Array.isArray(entry?.inputSegments) ? entry.inputSegments : null,
          rawInput: typeof entry?.rawInput === "string" ? entry.rawInput : null,
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

  function buildOverrideSegments(baseEntry, segmentTexts) {
    const baseSegments = entryInputSegments(baseEntry);
    return baseSegments.map((baseSegment, segmentIndex) => {
      const overrideText = typeof segmentTexts?.[segmentIndex] === "string"
        ? segmentTexts[segmentIndex]
        : baseSegment.editableText;

      if (overrideText === "" && baseSegment.kind === "unknown_compound") {
        return {
          ...baseSegment,
          inputTokens: baseSegment.inputTokens.map((token) => normalizeInputToken(token))
        };
      }

      const overrideCodes = textToCodeArray(overrideText);
      return {
        index: baseSegment.index,
        kind: "override",
        inputCodes: overrideCodes,
        inputTokens: inputCodesToTokens(overrideCodes),
        rawInput: overrideText,
        editableText: overrideText,
        sortText: overrideText
      };
    });
  }

  function applyInputDisplayOverrides(dictionary, overrides) {
    const hydratedDictionary = hydrateParsedDictionary(dictionary);
    if (!hydratedDictionary) return null;

    const safeOverrides = overrides && typeof overrides === "object" ? overrides : {};
    const entries = hydratedDictionary.entries.map((entry) => {
      const overrideSegments = safeOverrides[String(entry.index)] ?? safeOverrides[entry.index];
      if (!Array.isArray(overrideSegments)) {
        return entry;
      }

      return buildEntry({
        index: entry.index,
        inputCodes: entry.inputCodes,
        inputSegments: buildOverrideSegments(entry, overrideSegments),
        outputCodes: entry.outputCodes,
        packedInputCodes: entry.packedInputCodes,
        inputHex: entry.inputHex,
        outputHex: entry.outputHex,
        status: entry.status,
        userFlags: entry.userFlags
      });
    });

    return buildParsedDictionary({
      entries,
      source: hydratedDictionary.source,
      charaVersion: hydratedDictionary.charaVersion,
      deviceEntryCount: hydratedDictionary.deviceEntryCount,
      savedAt: hydratedDictionary.savedAt
    });
  }

  function normalizeTokenForLookup(text) {
    return normalizeOutputKey(text);
  }

  function serializeActions(actions) {
    const safeActions = sanitizeCodeArray(actions).slice(0, 12);
    let serialized = 0n;

    for (let i = 1; i <= safeActions.length; i += 1) {
      serialized |= BigInt(safeActions[safeActions.length - i] & 0x3ff) << BigInt((12 - i) * 10);
    }

    return serialized;
  }

  function hashChord(actions) {
    const serialized = serializeActions(actions);
    const chord = new Uint8Array(16);
    const view = new DataView(chord.buffer);

    view.setBigUint64(0, serialized & 0xffff_ffff_ffff_ffffn, true);
    view.setBigUint64(8, serialized >> 64n, true);

    let hash = 2166136261;
    for (let i = 0; i < 16; i += 1) {
      hash = Math.imul(hash ^ view.getUint8(i), 16777619);
    }

    if ((hash & 0xff) === 0xff) {
      hash ^= 0xff;
    }

    return hash & 0x3fff_ffff;
  }


  function defaultHotkeys() {
    return {
      forceRefresh: {
        altKey: true,
        ctrlKey: false,
        metaKey: false,
        shiftKey: true,
        code: "KeyR"
      }
    };
  }

  function hotkeyLabelFromCode(code) {
    const safeCode = String(code || "");
    if (!safeCode) return "";
    if (/^Key[A-Z]$/.test(safeCode)) return safeCode.slice(3);
    if (/^Digit[0-9]$/.test(safeCode)) return safeCode.slice(5);
    const map = {
      Backquote: "`",
      Minus: "-",
      Equal: "=",
      BracketLeft: "[",
      BracketRight: "]",
      Backslash: "\\",

      Semicolon: ";",
      Quote: "'",
      Comma: ",",
      Period: ".",
      Slash: "/",
      Space: "Space",
      Escape: "Esc",
      Enter: "Enter",
      Tab: "Tab",
      Backspace: "Backspace",
      Delete: "Delete",
      Insert: "Insert",
      Home: "Home",
      End: "End",
      PageUp: "Page Up",
      PageDown: "Page Down",
      ArrowUp: "Up",
      ArrowDown: "Down",
      ArrowLeft: "Left",
      ArrowRight: "Right"
    };
    return map[safeCode] || safeCode;
  }

  function normalizeHotkey(rawHotkey, fallbackHotkey) {
    const fallback = fallbackHotkey || defaultHotkeys().forceRefresh;
    return {
      altKey: Boolean(rawHotkey?.altKey ?? fallback.altKey),
      ctrlKey: Boolean(rawHotkey?.ctrlKey ?? fallback.ctrlKey),
      metaKey: Boolean(rawHotkey?.metaKey ?? fallback.metaKey),
      shiftKey: Boolean(rawHotkey?.shiftKey ?? fallback.shiftKey),
      code: typeof rawHotkey?.code === "string" && rawHotkey.code ? rawHotkey.code : fallback.code
    };
  }

  function normalizeHotkeys(rawHotkeys) {
    const defaults = defaultHotkeys();
    return {
      forceRefresh: normalizeHotkey(rawHotkeys?.forceRefresh, defaults.forceRefresh)
    };
  }

  function hotkeyDisplay(rawHotkey) {
    const hotkey = normalizeHotkey(rawHotkey, defaultHotkeys().forceRefresh);
    const parts = [];
    if (hotkey.ctrlKey) parts.push("Ctrl");
    if (hotkey.altKey) parts.push("Alt");
    if (hotkey.shiftKey) parts.push("Shift");
    if (hotkey.metaKey) parts.push("Meta");
    const keyLabel = hotkeyLabelFromCode(hotkey.code);
    if (keyLabel) parts.push(keyLabel);
    return parts.join("+");
  }

  function eventToHotkey(event) {
    const code = String(event?.code || "");
    if (!code) return null;
    const modifierOnly = new Set([
      "ShiftLeft",
      "ShiftRight",
      "ControlLeft",
      "ControlRight",
      "AltLeft",
      "AltRight",
      "MetaLeft",
      "MetaRight"
    ]);
    if (modifierOnly.has(code)) return null;

    return normalizeHotkey({
      altKey: Boolean(event.altKey),
      ctrlKey: Boolean(event.ctrlKey),
      metaKey: Boolean(event.metaKey),
      shiftKey: Boolean(event.shiftKey),
      code
    });
  }

  function defaultSettings() {
    return {
      enabled: true,
      selectionMode: "shortest",
      includeArpeggiates: false,
      includeModifierStyle: false,
      showDebugOutline: false,
      debugLogging: false,
      showExtendedSpecialDescriptions: true,
      specialTokenDescriptions: defaultSpecialTokenDescriptions(),

      hint_box_dark_mode_color: "#949EC5",
      hint_box_dark_mode_opacity: 0.92,
      hint_text_dark_mode_color: "#15161e",

      hint_box_light_mode_color: "#343B58",
      hint_box_light_mode_opacity: 0.96,
      hint_text_light_mode_color: "#d0d1d7",

      hint_text_font_size_value: 0.5,
      hint_text_font_size_unit: "em",
      hint_text_font_size_em: 0.5,
      hotkeys: defaultHotkeys()
    };
  }

  globalThis.CCHShared = {
    parseChordJson,
    hydrateParsedDictionary,
    buildParsedDictionary,
    buildEntry,
    applyInputDisplayOverrides,
    defaultSettings,
    chooseEntries,
    normalizeTokenForLookup,
    meaningfulInputCodes,
    inputCodesToRawDisplay,
    inputCodesToTokens,
    inputTokensToRawDisplay,
    inputSegmentsToRawDisplay,
    entryInputTokens,
    entryInputSegments,
    entryEditableInputSegments,
    entryInputSortText,
    visibleOutputText,
    SPECIAL_INPUT_META,
    ICON_FILE_MAP,
    INPUT_SEGMENT_SEPARATOR,
    UNKNOWN_COMPOUND_PLACEHOLDER,
    defaultSpecialTokenDescriptions,
    defaultHotkeys,
    normalizeHotkeys,
    hotkeyDisplay,
    eventToHotkey,
    makePseudoSpecialToken,
    serializeActions,
    hashChord
  };
})();
