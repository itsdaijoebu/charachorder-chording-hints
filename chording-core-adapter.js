/**
 * Adapter: replaces the substring matching core of Charachorder Chording
 * Hints with chording-core (Aho-Corasick matcher + cost-model resolver +
 * settings-aware form generation).
 *
 * Loaded after chording-core.js (the IIFE bundle exposing
 * globalThis.ChordingCore) and before content.js.
 *
 * Mode: gated only. The reachability (B7) and physical-feasibility (B8)
 * gates plus settings-aware form/compound generation run against the
 * device state captured by the options page full sync (chord library +
 * settings + layout over the Serial API, SPEC-7). Without a device
 * state there is NO fallback: matching is disabled rather than run
 * permissively, so every match observed in testing reflects the real
 * device configuration.
 */
(function (global) {
  "use strict";

  const C = global.ChordingCore;
  const adapter = {
    dictionaryVersion: 0,
    compiled: null,
    formSource: null,
    suffixModifiers: [],
    mode: "no-device-state",
    reBindPending: false,
  };

  // SPEC-2 setting ids consumed by the verified decision core, read over
  // VAR B1 per SPEC-7 (hex id): 49 chording enable, 62 concatenation
  // style, 54 autocorrect attempts (hyperspace-boundary gate), 81
  // arpeggiates enable, 85 arpeggiates mode, 112 layer warp.
  const GATE_SETTING_IDS = [49, 54, 62, 81, 85, 112];

  // Mirrors chordRender.corePhrase (string layer; not itself verified).
  function corePhrase(output) {
    let s = "";
    for (const code of output) {
      if (code >= 33 && code <= 126) s += String.fromCharCode(code);
      else if (code === 32 || code === 544) s += " ";
    }
    return s;
  }

  function buildSuffixModifiers(chords, feasible) {
    const mods = [];
    for (const chord of chords) {
      if (!feasible.has(chord.sourceIndex)) continue;
      if (C.isModifierStyleOutput(chord.output) !== 1) continue;
      // Affix classification matches the extension's deriveAffixType:
      // output starting with JOIN (574) is a suffix modifier.
      if (chord.output[0] !== 574) continue;
      const text = corePhrase(chord.output);
      if (!text) continue;
      mods.push({ sourceIndex: chord.sourceIndex, text });
    }
    return mods;
  }

  adapter.sync = function (dictionary, deviceState) {
    const entries = Array.isArray(dictionary?.entries) ? dictionary.entries : [];
    const hasLayout = Boolean(
      deviceState &&
      Array.isArray(deviceState.layout) &&
      deviceState.layout.length > 0 &&
      deviceState.slotsPerLayer > 0
    );

    if (!hasLayout) {
      // No fallback by design: without a device-synced layout + settings
      // the reachability/feasibility gates cannot run, so matching is off.
      adapter.compiled = null;
      adapter.formSource = null;
      adapter.suffixModifiers = [];
      adapter.mode = "no-device-state";
      adapter.dictionaryVersion += 1;
      return;
    }

    const chords = [];
    const chordOutputs = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const input = Array.isArray(e?.inputCodes) ? e.inputCodes : undefined;
      const output = Array.isArray(e?.outputCodes) ? e.outputCodes : [];
      chordOutputs.push(output);
      chords.push({ input, output, notation: "", sourceIndex: i });
    }

    const ctx = {
      concatStyle: Number(deviceState.settings?.[62]) === 1 ? 1 : 0,
      layoutCodes: deviceState.layout,
      slotsPerLayer: deviceState.slotsPerLayer,
      chordOutputs,
      settings: deviceState.settings || {},
    };

    // Gated form generation: one call to the verified formsForChord per
    // chord (reachability, F-gate, space/capitalize modes).
    const formEntries = [];
    const formSource = [];
    const feasible = new Set();
    adapter.reBindPending = false;
    for (const chord of chords) {
      const result = C.formsForChord(chord.input, chord.output, ctx);
      if (result.reBind) adapter.reBindPending = true; // GTM/impulse scope cut
      if (result.forms.length > 0) feasible.add(chord.sourceIndex);
      for (const form of result.forms) {
        formEntries.push({
          phrase: form.phrase,
          notation: chord.notation,
          input: chord.input,
          variantInputs: form.variantInputs,
        });
        formSource.push(chord.sourceIndex);
      }
    }

    // Affix compounding, canonical to chordRender.buildCompoundEntries but
    // replicated here so each compound keeps its base-chord source index.
    const enable = ctx.settings[81] ?? 1;
    const mode85 = ctx.settings[85] ?? 0;
    const base = chords.filter((c) => C.isArpeggiateChordInput(c.input ?? []) === 0);
    const arps = chords.filter((c) => C.isArpeggiateChordInput(c.input ?? []) === 1);
    const mods = chords.filter(
      (c) => C.isArpeggiateChordInput(c.input ?? []) === 0 && C.isModifierStyleOutput(c.output) === 1
    );

    if (C.arpeggiateActive(enable, mode85, 2) === 1) {
      for (const b of base) {
        const bt = corePhrase(b.output);
        if (!bt) continue;
        for (const a of arps) {
          const at = corePhrase(a.output);
          if (!at) continue;
          formEntries.push({
            phrase: bt + at,
            notation: "",
            input: b.input,
            compoundInputs: a.input,
            variantInputs: { stateChange: 0, grammarAlt: a.output.includes(573) ? 1 : 0, hyperspaceAlt: 0 },
          });
          formSource.push(b.sourceIndex);
        }
      }
    }

    if (C.arpeggiateActive(enable, mode85, 1) === 1) {
      for (const b of base) {
        const bt = corePhrase(b.output);
        if (!bt) continue;
        for (const m of mods) {
          const mt = corePhrase(m.output);
          if (!mt) continue;
          formEntries.push({
            phrase: bt + mt,
            notation: "",
            input: b.input,
            compoundInputs: m.input,
            variantInputs: { stateChange: 0, grammarAlt: 0, hyperspaceAlt: 0 },
          });
          formSource.push(b.sourceIndex);
        }
      }
    }

    adapter.compiled = C.compileChordDictionary(formEntries);
    adapter.formSource = formSource;
    adapter.suffixModifiers = buildSuffixModifiers(chords, feasible);
    // sigma(54) > 0 = autocorrect on: chording deletes text since the
    // last hyperspace, so candidates must start at a hyperspace boundary.
    // sigma(54) = 0: output appends, no start constraint.
    adapter.autocorrectOn = Number(deviceState.settings?.[54]) !== 0;
    adapter.mode = "gated";
    adapter.dictionaryVersion += 1;
  };

  // Full-text match over an arbitrary stream (words, separators, phrases).
  // Returns per-choice spans in stream coordinates plus attached suffix
  // modifier labels. No word concept here; the caller maps spans to words.
  adapter.matchText = function (text) {
    if (!adapter.compiled) return null;
    const result = C.matchChordable(text, adapter.compiled);
    if (result.candidates.length === 0) return null;

    // Device mechanic [GT: CCOS-firmware e2e, autocorrect + prepended
    // fixtures]: with autocorrect on (sigma(54) > 0), chording deletes
    // recently typed text up to the last hyperspace (concatenator; space
    // by default) before the chord output. A candidate is then physically
    // valid only when the text from the previous hyperspace up to its
    // start is empty — its (space-trimmed) start must sit directly after
    // a hyperspace or at stream start. Mid-word starts would destroy the
    // preceding text and never reach the resolver. With autocorrect off
    // (sigma(54) = 0) the output appends, so no start constraint.
    if (adapter.autocorrectOn) {
      result.candidates = result.candidates.filter((candidate) => {
        let s = candidate.start;
        while (s < candidate.end && text[s] === " ") s += 1;
        return s === 0 || text[s - 1] === " ";
      });
    }
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

    // Modifier spans already claimed by a suffix-modifier label suppress the
    // plain chord choice at the same span (no duplicate hints).
    const modifierSpans = [];
    for (const choice of plan.choices) {
      for (const mod of adapter.suffixModifiers) {
        const modText = String(mod.text || "");
        if (!modText) continue;
        if (text.startsWith(modText, choice.end)) {
          modifierSpans.push([choice.end, choice.end + modText.length]);
          break;
        }
      }
    }

    const choices = [];
    for (const choice of plan.choices) {
      const coveredByModifier = modifierSpans.some(
        ([ms, me]) => choice.start === ms && choice.end === me
      );
      const item = {
        start: choice.start,
        end: choice.end,
        sourceIndex: adapter.formSource[choice.entryIndex] ?? choice.entryIndex,
        coveredByModifier,
        modifiers: []
      };
      // Suffix modifier chords shown with the hint: if the text right
      // after the matched chord starts with a modifier's output, attach a
      // modifier label (same-word only: modifier text has no spaces, so it
      // cannot cross a separator).
      for (const mod of adapter.suffixModifiers) {
        const modText = String(mod.text || "");
        if (!modText) continue;
        if (text.startsWith(modText, choice.end)) {
          item.modifiers.push({
            sourceIndex: mod.sourceIndex,
            start: choice.end,
            end: choice.end + modText.length
          });
          break; // one modifier per matched chord
        }
      }
      choices.push(item);
    }

    return { matched: choices.length > 0, choices };
  };

  global.ChordingCoreAdapter = adapter;
})(typeof globalThis !== "undefined" ? globalThis : window);
