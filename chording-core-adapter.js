/**
 * Adapter: replaces the substring matching core of Charachorder Chording
 * Hints with chording-core (Aho-Corasick matcher + cost-model resolver +
 * settings-aware form generation).
 *
 * Loaded after chording-core.js (the IIFE bundle exposing
 * globalThis.ChordingCore) and before content.js.
 *
 * Differences from the original implementation, by design:
 * - Matching is exhaustive (all occurrences, overlaps included); the
 *   resolver picks a cost-minimal non-overlapping plan instead of
 *   coverage-maximization.
 * - Multi-word phrases are matchable (the original dropped them).
 * - Settings/layout gates run in permissive mode: this extension does not
 *   read the device settings/layout, so reachability/feasibility gating
 *   is skipped rather than guessed.
 */
(function (global) {
  "use strict";

  const C = global.ChordingCore;
  const adapter = { dictionaryVersion: 0, compiled: null, formIndex: null };

  const PERMISSIVE_CTX = {
    concatStyle: 0,
    layoutCodes: [],
    slotsPerLayer: 0,
    chordOutputs: [],
    settings: {},
  };

  adapter.sync = function (dictionary) {
    const entries = Array.isArray(dictionary?.entries) ? dictionary.entries : [];
    const coreEntries = [];
    const sourceIndex = [];
    const chordOutputs = [];

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const phrase = typeof e?.normalizedOutput === "string" ? e.normalizedOutput : "";
      const input = Array.isArray(e?.inputCodes) ? e.inputCodes : undefined;
      const output = Array.isArray(e?.outputCodes) ? e.outputCodes : [];
      if (!phrase) continue;
      chordOutputs.push(output);
      sourceIndex.push(i);
      coreEntries.push({ phrase, notation: "", input });
    }

    const ctx = Object.assign({}, PERMISSIVE_CTX, { chordOutputs });

    // Form expansion (permissive: no gates without a bound model).
    const formEntries = [];
    const formSource = [];
    for (let f = 0; f < coreEntries.length; f++) {
      const e = coreEntries[f];
      const base = { phrase: e.phrase, notation: e.notation, input: e.input };
      formEntries.push(base);
      formSource.push(sourceIndex[f]);
      // trailing-space form (concatenation) — the original matched bare words only
      formEntries.push({ phrase: e.phrase + " ", notation: e.notation, input: e.input });
      formSource.push(sourceIndex[f]);
    }
    // Affix compounds (arpeggiate chords available in this dictionary).
    for (let b = 0; b < coreEntries.length; b++) {
      const base = coreEntries[b];
      const baseText = base.phrase.replace(/\s+$/u, "");
      for (let a = 0; a < coreEntries.length; a++) {
        const arp = coreEntries[a];
        if (!(Array.isArray(arp.input) && arp.input.includes(1001))) continue;
        const punct = (arp.phrase || "").trim();
        if (!punct) continue;
        formEntries.push({
          phrase: baseText + punct,
          notation: "",
          input: base.input,
          compoundInputs: arp.input,
          variantInputs: { stateChange: 0, grammarAlt: arp.phrase.includes("\u0000") ? 1 : 0, hyperspaceAlt: 0 },
        });
        formSource.push(sourceIndex[b]);
      }
    }

    adapter.compiled = C.compileChordDictionary(formEntries);
    adapter.formSource = formSource;
    adapter.dictionaryVersion += 1;
  };

  adapter.matchWord = function (rawText, normalizedWord, opts) {
    if (!adapter.compiled) return null;
    const minLen = Number(opts?.minimumWordLength ?? 0) || 0;
    if (normalizedWord.length < minLen) return null;

    const result = C.matchChordable(normalizedWord, adapter.compiled);
    if (result.candidates.length === 0) return null;

    const plan = C.resolveChordable(result, adapter.compiled, {
      baseChordCost: 1,
      charCost: 1,
      switchCost: 0.25,
      widthCostPerExtraKey: 0.15,
      layerKeyCost: 0.5,
      modeToggleCost: 0.5,
      modifierMacroCost: 0.4,
      sequenceControlCost: 0.5,
      librarySwitchCost: 0.8,
      variantStateChangeCost: 0.5,
      variantGrammarCost: 0.4,
      variantHyperspaceCost: 0.1,
    });

    const labels = plan.choices.map((choice) => {
      const src = adapter.formSource[choice.entryIndex] ?? choice.entryIndex;
      return {
        entries: [src],
        anchor: {
          type: "substring",
          start: choice.start,
          end: choice.end,
          wordLength: normalizedWord.length,
        },
      };
    });

    return {
      matched: labels.length > 0,
      word: rawText,
      normalized: normalizedWord,
      labels,
      wordCount: 1,
      isSubstringMatch: true,
    };
  };

  global.ChordingCoreAdapter = adapter;
})(typeof globalThis !== "undefined" ? globalThis : window);
