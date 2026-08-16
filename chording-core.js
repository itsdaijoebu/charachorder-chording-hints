(() => {
  var __defProp = Object.defineProperty;
  var __returnValue = (v) => v;
  function __exportSetter(name, newValue) {
    this[name] = __returnValue.bind(null, newValue);
  }
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, {
        get: all[name],
        enumerable: true,
        configurable: true,
        set: __exportSetter.bind(all, name)
      });
  };

  // src/chordCore.ts
  var exports_chordCore = {};
  __export(exports_chordCore, {
    semanticPenaltySum: () => semanticPenaltySum,
    inputWidth: () => inputWidth,
    inputCost: () => inputCost,
    classifyOverlap: () => classifyOverlap,
    classPenalty: () => classPenalty
  });
  function classifyOverlap(aStart, aEnd, bStart, bEnd) {
    if (aEnd <= bStart)
      return "noOverlap";
    if (aStart === bStart)
      return aEnd === bEnd ? "equal" : "prefix";
    if (aEnd === bEnd)
      return "suffix";
    return aEnd > bEnd ? "contains" : "crosses";
  }
  function classPenalty(code, layerKeyCost, modeToggleCost, modifierMacroCost, sequenceControlCost, librarySwitchCost) {
    if (code >= 548 && code <= 555)
      return layerKeyCost;
    if (code >= 531 && code <= 538 || code === 576)
      return modeToggleCost;
    if (code >= 620 && code <= 667)
      return modifierMacroCost;
    if (code === 523 || code === 524 || code === 545 || code === 547 || code >= 573 && code <= 579 || code === 597 || code === 598 || code === 1001 || code === 1002)
      return sequenceControlCost;
    if (code === 558 || code === 559)
      return librarySwitchCost;
    return 0;
  }
  function semanticPenaltySum(input, layerKeyCost, modeToggleCost, modifierMacroCost, sequenceControlCost, librarySwitchCost) {
    let sum = 0;
    let i = 0;
    while (i < input.length) {
      if (input[i] !== 0) {
        sum = sum + classPenalty(input[i], layerKeyCost, modeToggleCost, modifierMacroCost, sequenceControlCost, librarySwitchCost);
      }
      i = i + 1;
    }
    return sum;
  }
  function inputWidth(input) {
    let width = 0;
    let i = 0;
    while (i < input.length) {
      if (input[i] !== 0) {
        width = width + 1;
      }
      i = i + 1;
    }
    return width;
  }
  function inputCost(input, baseChordCost, widthCostPerExtraKey, layerKeyCost, modeToggleCost, modifierMacroCost, sequenceControlCost, librarySwitchCost) {
    const width = inputWidth(input);
    const extra = width - 2 > 0 ? width - 2 : 0;
    const semantic = semanticPenaltySum(input, layerKeyCost, modeToggleCost, modifierMacroCost, sequenceControlCost, librarySwitchCost);
    return baseChordCost + widthCostPerExtraKey * extra + semantic;
  }

  // src/chordMatcher.ts
  var exports_chordMatcher = {};
  __export(exports_chordMatcher, {
    matchChordable: () => matchChordable,
    compileChordDictionary: () => compileChordDictionary
  });
  function makeNode() {
    return { children: new Map, fail: null, outputs: [] };
  }
  function foldChar(ch) {
    const folded = ch.toLowerCase();
    return folded.length === 1 ? folded : null;
  }
  function compileChordDictionary(entries) {
    const root = makeNode();
    const excluded = [];
    for (let i = 0;i < entries.length; i++) {
      const phrase = entries[i].phrase;
      let node = root;
      let usable = phrase.length > 0;
      for (const ch of phrase) {
        const folded = foldChar(ch);
        if (folded === null) {
          usable = false;
          break;
        }
        let next = node.children.get(folded);
        if (next === undefined) {
          next = makeNode();
          node.children.set(folded, next);
        }
        node = next;
      }
      if (!usable) {
        excluded.push(i);
      } else {
        node.outputs.push(i);
      }
    }
    const queue = [];
    for (const child of root.children.values()) {
      child.fail = root;
      queue.push(child);
    }
    for (let head = 0;head < queue.length; head++) {
      const node = queue[head];
      for (const [ch, child] of node.children) {
        let f = node.fail;
        while (f !== null && !f.children.has(ch)) {
          f = f.fail;
        }
        child.fail = f === null ? root : f.children.get(ch);
        for (const output of child.fail.outputs) {
          child.outputs.push(output);
        }
        queue.push(child);
      }
    }
    return { entries, excluded, root };
  }
  function classifyOverlap2(a, b) {
    return classifyOverlap(a.start, a.end, b.start, b.end);
  }
  function computeOverlapStructure(candidates) {
    const n = candidates.length;
    const overlaps = [];
    const parent = new Array(n);
    for (let i = 0;i < n; i++)
      parent[i] = i;
    const find = (x) => {
      while (parent[x] !== x) {
        parent[x] = parent[parent[x]];
        x = parent[x];
      }
      return x;
    };
    const union = (x, y) => {
      const rx = find(x);
      const ry = find(y);
      if (rx !== ry)
        parent[ry] = rx;
    };
    for (let i = 0;i < n; i++) {
      const ci = candidates[i];
      for (let j = i + 1;j < n && candidates[j].start < ci.end; j++) {
        const kind = classifyOverlap2(ci, candidates[j]);
        if (kind !== "noOverlap") {
          overlaps.push({ a: i, b: j, kind });
          union(i, j);
        }
      }
    }
    const byRoot = new Map;
    for (let i = 0;i < n; i++) {
      const r = find(i);
      const members = byRoot.get(r);
      if (members !== undefined)
        members.push(i);
      else
        byRoot.set(r, [i]);
    }
    const groups = [];
    for (const members of byRoot.values()) {
      let minStart = Number.POSITIVE_INFINITY;
      let maxEnd = -1;
      for (const m of members) {
        if (candidates[m].start < minStart)
          minStart = candidates[m].start;
        if (candidates[m].end > maxEnd)
          maxEnd = candidates[m].end;
      }
      groups.push({ members, span: [minStart, maxEnd] });
    }
    groups.sort((g1, g2) => g1.span[0] - g2.span[0]);
    return { overlaps, groups };
  }
  function matchChordable(text, dict) {
    const candidates = [];
    let node = dict.root;
    for (let pos = 0;pos < text.length; pos++) {
      const folded = foldChar(text[pos]);
      if (folded === null) {
        node = dict.root;
        continue;
      }
      while (node !== dict.root && !node.children.has(folded)) {
        node = node.fail;
      }
      const next = node.children.get(folded);
      if (next !== undefined)
        node = next;
      for (const entryIndex of node.outputs) {
        const entry = dict.entries[entryIndex];
        candidates.push({
          entryIndex,
          phrase: entry.phrase,
          notation: entry.notation,
          start: pos - entry.phrase.length + 1,
          end: pos + 1
        });
      }
    }
    candidates.sort((a, b) => a.start - b.start || b.end - a.end);
    const { overlaps, groups } = computeOverlapStructure(candidates);
    return { text, candidates, overlaps, groups };
  }

  // src/chordResolver.ts
  var exports_chordResolver = {};
  __export(exports_chordResolver, {
    resolveChordable: () => resolveChordable,
    estimateInputCost: () => estimateInputCost,
    DEFAULT_RESOLUTION_CONFIG: () => DEFAULT_RESOLUTION_CONFIG
  });

  // src/chordTransform.ts
  var exports_chordTransform = {};
  __export(exports_chordTransform, {
    variantPenalty: () => variantPenalty,
    spaceModeGated: () => spaceModeGated,
    spaceMode: () => spaceMode,
    singleLayerExists: () => singleLayerExists,
    settingEffect: () => settingEffect,
    reachable: () => reachable,
    modeEffect: () => modeEffect,
    layersReferenced: () => layersReferenced,
    layerReferencedByInput: () => layerReferencedByInput,
    layerKeyTargetLayer: () => layerKeyTargetLayer,
    layerHoldFeasible: () => layerHoldFeasible,
    layerAfter: () => layerAfter,
    keyInInput: () => keyInInput,
    isModifierStyleOutput: () => isModifierStyleOutput,
    isArpeggiateChordInput: () => isArpeggiateChordInput,
    inputOkInLayer: () => inputOkInLayer,
    inputCodesBound: () => inputCodesBound,
    hasLayerKeyInput: () => hasLayerKeyInput,
    feasibilityClass: () => feasibilityClass,
    codeOkInLayer: () => codeOkInLayer,
    codeInLayer: () => codeInLayer,
    codeInArray: () => codeInArray,
    codeInAnyLayer: () => codeInAnyLayer,
    capitalizeModeGated: () => capitalizeModeGated,
    capitalizeMode: () => capitalizeMode,
    arpeggiateActive: () => arpeggiateActive,
    allNonLayerKeysInLayer: () => allNonLayerKeysInLayer,
    actionTextClass: () => actionTextClass
  });
  function actionTextClass(code) {
    if (code === 32 || code === 544)
      return 1;
    if (code >= 33 && code <= 126)
      return 0;
    if (code === 573)
      return 2;
    if (code === 574)
      return 3;
    if (code === 256)
      return 4;
    if (code === 545)
      return 5;
    if (code === 547)
      return 6;
    if (code === 575 || code === 576)
      return 7;
    if (code === 523 || code === 524)
      return 8;
    if (code >= 577 && code <= 579 || code === 597 || code === 598)
      return 9;
    if (code >= 548 && code <= 555)
      return 10;
    if (code >= 512 && code <= 519 || code === 313)
      return 11;
    if (code === 531 || code === 532 || code === 534 || code === 538)
      return 12;
    if (code === 558 || code === 559)
      return 13;
    if (code >= 620 && code <= 667)
      return 14;
    return 15;
  }
  function spaceMode(concatStyle, hasHyperspace, inhibitConcat) {
    if (inhibitConcat !== 0)
      return 0;
    if (hasHyperspace === 0) {
      return concatStyle === 0 ? 1 : 2;
    }
    return concatStyle === 0 ? 3 : 4;
  }
  function capitalizeMode(hasCapitalize, shiftHeld, capsLock) {
    if (capsLock !== 0)
      return 2;
    if (hasCapitalize !== 0 || shiftHeld !== 0)
      return 1;
    return 0;
  }
  function modeEffect(code) {
    if (code === 538)
      return 1;
    if (code === 531)
      return 2;
    if (code === 558)
      return 3;
    if (code === 559)
      return 4;
    if (code === 532)
      return 5;
    if (code === 534)
      return 6;
    return 0;
  }
  function layerAfter(layer, code) {
    if (code === 548 || code === 549)
      return 0;
    if (code === 550 || code === 551)
      return 1;
    if (code === 552 || code === 553)
      return 2;
    if (code === 554 || code === 555)
      return 3;
    return layer;
  }
  function variantPenalty(grammarAlt, hyperspaceAlt, grammarCost, hyperspaceCost) {
    if (grammarAlt === 0 && hyperspaceAlt === 0)
      return 0;
    if (grammarAlt === 0)
      return hyperspaceCost;
    if (hyperspaceAlt === 0)
      return grammarCost;
    return grammarCost + hyperspaceCost;
  }
  function codeInArray(code, arr) {
    let found = 0;
    let i = 0;
    while (i < arr.length) {
      if (arr[i] === code && found === 0) {
        found = 1;
      }
      i = i + 1;
    }
    return found;
  }
  function reachable(inLayout, inOutputs) {
    if (inLayout === 0 && inOutputs === 0)
      return 0;
    return 1;
  }
  function settingEffect(code) {
    if (code === 313)
      return 1;
    if (code === 650)
      return 2;
    if (code === 651)
      return 3;
    if (code === 652)
      return 4;
    return 0;
  }
  function spaceModeGated(concatStyle, hasHyperspace, inhibitConcat, captureReachable) {
    if (inhibitConcat !== 0)
      return 0;
    if (hasHyperspace === 0 || captureReachable === 0) {
      return concatStyle === 0 ? 1 : 2;
    }
    return concatStyle === 0 ? 3 : 4;
  }
  function capitalizeModeGated(hasCapitalize, shiftHeld, capsLock, shiftReachable) {
    if (capsLock !== 0)
      return 2;
    if (hasCapitalize !== 0 || shiftHeld !== 0 && shiftReachable !== 0)
      return 1;
    return 0;
  }
  function codeInLayer(code, layout, slotsPerLayer, layerIdx) {
    let found = 0;
    let i = 0;
    while (i < slotsPerLayer) {
      if (layout[layerIdx * slotsPerLayer + i] === code && found === 0) {
        found = 1;
      }
      i = i + 1;
    }
    return found;
  }
  function layerReferencedByInput(layerIdx, input, layout, slotsPerLayer) {
    let found = 0;
    let i = 0;
    while (i < input.length) {
      if (codeInLayer(input[i], layout, slotsPerLayer, layerIdx) === 1 && found === 0) {
        found = 1;
      }
      i = i + 1;
    }
    return found;
  }
  function layersReferenced(input, layout, slotsPerLayer) {
    let count = 0;
    let l = 0;
    while (l < 4) {
      if (layerReferencedByInput(l, input, layout, slotsPerLayer) === 1) {
        count = count + 1;
      }
      l = l + 1;
    }
    return count;
  }
  function hasLayerKeyInput(input) {
    let found = 0;
    let i = 0;
    while (i < input.length) {
      if (input[i] >= 548 && input[i] <= 555 && found === 0) {
        found = 1;
      }
      i = i + 1;
    }
    return found;
  }
  function layerKeyTargetLayer(code) {
    if (code === 548 || code === 549)
      return 0;
    if (code === 550 || code === 551)
      return 1;
    if (code === 552 || code === 553)
      return 2;
    if (code === 554 || code === 555)
      return 3;
    return 0;
  }
  function keyInInput(keyCode, input) {
    let found = 0;
    let i = 0;
    while (i < input.length) {
      if (input[i] === keyCode && found === 0) {
        found = 1;
      }
      i = i + 1;
    }
    return found;
  }
  function allNonLayerKeysInLayer(target, input, layout, slotsPerLayer) {
    let allIn = 1;
    let j = 0;
    while (j < input.length) {
      if (input[j] < 548 || input[j] > 555) {
        if (codeInLayer(input[j], layout, slotsPerLayer, target) === 0 && allIn === 1) {
          allIn = 0;
        }
      }
      j = j + 1;
    }
    return allIn;
  }
  function layerHoldFeasible(input, layout, slotsPerLayer) {
    let feasible = 0;
    let k = 0;
    while (k < 8) {
      if (feasible === 0 && keyInInput(548 + k, input) === 1) {
        let target = layerKeyTargetLayer(548 + k);
        if (allNonLayerKeysInLayer(target, input, layout, slotsPerLayer) === 1) {
          feasible = 1;
        }
      }
      k = k + 1;
    }
    return feasible;
  }
  function feasibilityClass(r, K, warpOn) {
    if (r <= 1)
      return 1;
    if (K === 1)
      return 2;
    if (warpOn === 1)
      return 3;
    return 4;
  }
  function codeInAnyLayer(code, layout, slotsPerLayer) {
    let inAny = 0;
    let l = 0;
    while (l < 4) {
      if (codeInLayer(code, layout, slotsPerLayer, l) === 1 && inAny === 0) {
        inAny = 1;
      }
      l = l + 1;
    }
    return inAny;
  }
  function inputCodesBound(input, layout, slotsPerLayer) {
    let bound = 1;
    let i = 0;
    while (i < input.length) {
      if (input[i] !== 0 && (input[i] < 600 || input[i] > 617)) {
        if (codeInAnyLayer(input[i], layout, slotsPerLayer) === 0 && bound === 1) {
          bound = 0;
        }
      }
      i = i + 1;
    }
    return bound;
  }
  function codeOkInLayer(code, layout, slotsPerLayer, layerIdx) {
    if (code === 0)
      return 1;
    if (code >= 600 && code <= 617)
      return 1;
    return codeInLayer(code, layout, slotsPerLayer, layerIdx);
  }
  function inputOkInLayer(layerIdx, input, layout, slotsPerLayer) {
    let allOk = 1;
    let i = 0;
    while (i < input.length) {
      if (codeOkInLayer(input[i], layout, slotsPerLayer, layerIdx) === 0 && allOk === 1) {
        allOk = 0;
      }
      i = i + 1;
    }
    return allOk;
  }
  function singleLayerExists(input, layout, slotsPerLayer) {
    let found = 0;
    let l = 0;
    while (l < 4) {
      if (inputOkInLayer(l, input, layout, slotsPerLayer) === 1 && found === 0) {
        found = 1;
      }
      l = l + 1;
    }
    return found;
  }
  function arpeggiateActive(enable, mode85, wantClass) {
    if (enable === 0)
      return 0;
    if (mode85 === 0 || mode85 === wantClass)
      return 1;
    return 0;
  }
  function isArpeggiateChordInput(input) {
    let found = 0;
    let i = 0;
    while (i < input.length) {
      if (input[i] === 1001 && found === 0) {
        found = 1;
      }
      i = i + 1;
    }
    return found;
  }
  function isModifierStyleOutput(output) {
    let found = 0;
    let i = 0;
    while (i < output.length) {
      if ((output[i] === 574 || output[i] === 573) && found === 0) {
        found = 1;
      }
      i = i + 1;
    }
    return found;
  }

  // src/chordResolver.ts
  var DEFAULT_RESOLUTION_CONFIG = {
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
    variantHyperspaceCost: 0.1
  };
  function estimateInputCost(entry, config) {
    const input = entry.input;
    if (!input) {
      return { inputCost: config.baseChordCost, width: null, semanticPenalty: 0 };
    }
    const width = inputWidth(input);
    const semantic = semanticPenaltySum(input, config.layerKeyCost, config.modeToggleCost, config.modifierMacroCost, config.sequenceControlCost, config.librarySwitchCost);
    const cost = inputCost(input, config.baseChordCost, config.widthCostPerExtraKey, config.layerKeyCost, config.modeToggleCost, config.modifierMacroCost, config.sequenceControlCost, config.librarySwitchCost);
    const vi = entry.variantInputs;
    const variant = variantPenalty(vi ? vi.grammarAlt : 0, vi ? vi.hyperspaceAlt : 0, config.variantGrammarCost, config.variantHyperspaceCost) + (vi && vi.stateChange === 1 ? config.variantStateChangeCost : 0);
    const compound = entry.compoundInputs && entry.compoundInputs.length > 0 ? inputCost(entry.compoundInputs, config.baseChordCost, config.widthCostPerExtraKey, config.layerKeyCost, config.modeToggleCost, config.modifierMacroCost, config.sequenceControlCost, config.librarySwitchCost) : 0;
    return {
      inputCost: cost + variant + compound,
      width,
      semanticPenalty: semantic
    };
  }
  function resolveChordable(result, dict, config = {}) {
    const cfg = { ...DEFAULT_RESOLUTION_CONFIG, ...config };
    const { text } = result;
    const candidates = [...result.candidates].sort((a, b) => a.start - b.start || b.end - a.end);
    const n = candidates.length;
    if (n === 0) {
      return {
        text,
        choices: [],
        typedRuns: text.length > 0 ? [{ start: 0, end: text.length }] : [],
        totalCost: cfg.charCost * text.length
      };
    }
    const dp = new Array(n);
    const parent = new Array(n);
    const inputCosts = new Array(n);
    const widths = new Array(n);
    const semanticPenalties = new Array(n);
    const byEnd = candidates.map((c, index) => ({ end: c.end, index })).sort((a, b) => a.end - b.end);
    let strictPtr = 0;
    let bestStrict = Number.POSITIVE_INFINITY;
    let bestStrictPred = -1;
    const bestAdjacent = new Map;
    for (let i = 0;i < n; i++) {
      const c = candidates[i];
      while (strictPtr < n && byEnd[strictPtr].end < c.start) {
        const j = byEnd[strictPtr].index;
        const value = dp[j] - cfg.charCost * candidates[j].end;
        if (value < bestStrict) {
          bestStrict = value;
          bestStrictPred = j;
        }
        strictPtr += 1;
      }
      let best = {
        value: cfg.charCost * c.start + (c.start > 0 ? cfg.switchCost : 0),
        predecessor: -1
      };
      const adjacent = bestAdjacent.get(c.start);
      if (adjacent !== undefined && adjacent.value < best.value) {
        best = adjacent;
      }
      if (bestStrict < Number.POSITIVE_INFINITY) {
        const strictValue = bestStrict + cfg.charCost * c.start + cfg.switchCost;
        if (strictValue < best.value) {
          best = { value: strictValue, predecessor: bestStrictPred };
        }
      }
      const est = estimateInputCost(dict.entries[c.entryIndex], cfg);
      inputCosts[i] = est.inputCost;
      widths[i] = est.width;
      semanticPenalties[i] = est.semanticPenalty;
      dp[i] = best.value + est.inputCost;
      parent[i] = best.predecessor;
      const existing = bestAdjacent.get(c.end);
      if (existing === undefined || dp[i] < existing.value) {
        bestAdjacent.set(c.end, { value: dp[i], predecessor: i });
      }
    }
    let bestTotal = cfg.charCost * text.length;
    let lastChoice = -1;
    for (let i = 0;i < n; i++) {
      const tail = text.length - candidates[i].end;
      const total = dp[i] + cfg.charCost * tail + (tail > 0 ? cfg.switchCost : 0);
      if (total < bestTotal) {
        bestTotal = total;
        lastChoice = i;
      }
    }
    const chosen = [];
    let cur = lastChoice;
    while (cur !== -1) {
      chosen.push(cur);
      cur = parent[cur];
    }
    chosen.reverse();
    const choices = chosen.map((i) => {
      const c = candidates[i];
      return {
        entryIndex: c.entryIndex,
        phrase: c.phrase,
        notation: c.notation,
        start: c.start,
        end: c.end,
        inputCost: inputCosts[i],
        width: widths[i],
        semanticPenalty: semanticPenalties[i]
      };
    });
    const typedRuns = [];
    let cursor = 0;
    for (const choice of choices) {
      if (choice.start > cursor) {
        typedRuns.push({ start: cursor, end: choice.start });
      }
      cursor = Math.max(cursor, choice.end);
    }
    if (cursor < text.length) {
      typedRuns.push({ start: cursor, end: text.length });
    }
    return { text, choices, typedRuns, totalCost: bestTotal };
  }

  // src/chordRender.ts
  var exports_chordRender = {};
  __export(exports_chordRender, {
    isReachable: () => isReachable,
    formsForChord: () => formsForChord,
    capturedConcatenator: () => capturedConcatenator,
    buildFormEntries: () => buildFormEntries,
    buildCompoundEntries: () => buildCompoundEntries
  });
  function isReachable(code, ctx) {
    if (codeInArray(code, ctx.layoutCodes) === 1)
      return true;
    for (const out of ctx.chordOutputs) {
      if (codeInArray(code, out) === 1)
        return true;
    }
    return false;
  }
  function capturedConcatenator(ctx) {
    for (const out of ctx.chordOutputs) {
      let sawCapture = false;
      for (const code of out) {
        if (code === 547) {
          sawCapture = true;
          continue;
        }
        if (sawCapture) {
          if (code >= 33 && code <= 126)
            return String.fromCharCode(code);
          if (code === 32 || code === 544)
            return " ";
          break;
        }
      }
    }
    return " ";
  }
  function corePhrase(output) {
    let s = "";
    for (const code of output) {
      if (code >= 33 && code <= 126)
        s += String.fromCharCode(code);
      else if (code === 32 || code === 544)
        s += " ";
    }
    return s;
  }
  function inputStateChange(input) {
    if (!input)
      return 0;
    for (const code of input) {
      const cls = actionTextClass(code);
      if (cls === 10)
        return 1;
    }
    return 0;
  }
  function formsForChord(input, output, ctx) {
    for (const code of output) {
      const eff = modeEffect(code);
      if (eff === 5 || eff === 6)
        return { forms: [], reBind: true };
    }
    const text = corePhrase(output);
    if (text.length === 0)
      return { forms: [], reBind: false };
    let hasHyperspace = 0;
    let inhibit = 0;
    let hasCapitalize = 0;
    let outStateChange = 0;
    for (const code of output) {
      if (code === 545)
        hasHyperspace = 1;
      if (code === 256)
        inhibit = 1;
      if (code === 573)
        hasCapitalize = 1;
      const eff = modeEffect(code);
      if (eff !== 0)
        outStateChange = 1;
    }
    const settingChange = (() => {
      for (const code of output) {
        if (settingEffect(code) !== 0)
          return 1;
      }
      return 0;
    })();
    const captureReachable = isReachable(547, ctx) ? 1 : 0;
    const shiftReachable = isReachable(513, ctx) || isReachable(517, ctx) ? 1 : 0;
    const chordingEnabled = ctx.settings[49] ?? 1;
    if (chordingEnabled === 0)
      return { forms: [], reBind: false };
    const inCodes = input ?? [];
    const r = layersReferenced(inCodes, ctx.layoutCodes, ctx.slotsPerLayer);
    const K = hasLayerKeyInput(inCodes);
    const warpOn = ctx.settings[112] ?? 0;
    const rEff = K === 0 && singleLayerExists(inCodes, ctx.layoutCodes, ctx.slotsPerLayer) === 1 ? 1 : r;
    const fclass = feasibilityClass(rEff, K, warpOn);
    if (inputCodesBound(inCodes, ctx.layoutCodes, ctx.slotsPerLayer) === 0) {
      return { forms: [], reBind: false };
    }
    if (fclass === 4)
      return { forms: [], reBind: false };
    if (fclass === 2 && layerHoldFeasible(inCodes, ctx.layoutCodes, ctx.slotsPerLayer) === 0) {
      return { forms: [], reBind: false };
    }
    const warpSpan = fclass === 3 ? 1 : 0;
    const space = spaceModeGated(ctx.concatStyle, hasHyperspace, inhibit, captureReachable);
    const cap = capitalizeModeGated(hasCapitalize, shiftReachable, 0, shiftReachable);
    const stateChange = inputStateChange(input) === 1 || outStateChange === 1 || settingChange === 1 || warpSpan === 1 ? 1 : 0;
    const grammarAlt = cap === 1 ? 1 : 0;
    const baseInputs = { stateChange, grammarAlt, hyperspaceAlt: 0 };
    const forms = [];
    switch (space) {
      case 0:
        forms.push({ phrase: text, variantInputs: baseInputs });
        break;
      case 1:
        forms.push({ phrase: text + " ", variantInputs: baseInputs });
        break;
      case 2:
        forms.push({ phrase: " " + text, variantInputs: baseInputs });
        break;
      case 3:
      case 4: {
        const alt = capturedConcatenator(ctx);
        if (alt !== " ") {
          const altInputs = { ...baseInputs, hyperspaceAlt: 1 };
          forms.push(space === 3 ? { phrase: text + alt, variantInputs: altInputs } : { phrase: alt + text, variantInputs: altInputs });
        }
        forms.push(space === 3 ? { phrase: text + " ", variantInputs: baseInputs } : { phrase: " " + text, variantInputs: baseInputs });
        break;
      }
      default:
        forms.push({ phrase: text, variantInputs: baseInputs });
    }
    return { forms, reBind: false };
  }
  function buildFormEntries(chords, ctx) {
    const entries = [];
    let reBind = false;
    for (const c of chords) {
      const r = formsForChord(c.input, c.output, ctx);
      if (r.reBind)
        reBind = true;
      for (const f of r.forms) {
        entries.push({ phrase: f.phrase, notation: c.notation, input: c.input, variantInputs: f.variantInputs });
      }
    }
    return { entries, reBind };
  }
  function buildCompoundEntries(chords, ctx) {
    const enable = ctx.settings[81] ?? 1;
    const mode85 = ctx.settings[85] ?? 0;
    const entries = [];
    const base = chords.filter((c) => isArpeggiateChordInput(c.input ?? []) === 0);
    const arps = chords.filter((c) => isArpeggiateChordInput(c.input ?? []) === 1);
    const mods = chords.filter((c) => isArpeggiateChordInput(c.input ?? []) === 0 && isModifierStyleOutput(c.output) === 1);
    if (arpeggiateActive(enable, mode85, 2) === 1) {
      for (const b of base) {
        const bt = corePhrase(b.output);
        if (bt.length === 0)
          continue;
        for (const a of arps) {
          const at = corePhrase(a.output);
          if (at.length === 0)
            continue;
          const cap = a.output.includes(573) ? 1 : 0;
          entries.push({
            phrase: bt + at,
            notation: `${b.notation}+${a.notation}`,
            input: b.input,
            compoundInputs: a.input,
            variantInputs: { stateChange: 0, grammarAlt: cap, hyperspaceAlt: 0 }
          });
        }
      }
    }
    if (arpeggiateActive(enable, mode85, 1) === 1) {
      for (const b of base) {
        const bt = corePhrase(b.output);
        if (bt.length === 0)
          continue;
        for (const m of mods) {
          const mt = corePhrase(m.output);
          if (mt.length === 0)
            continue;
          entries.push({
            phrase: bt + mt,
            notation: `${b.notation}+${m.notation}`,
            input: b.input,
            compoundInputs: m.input,
            variantInputs: { stateChange: 0, grammarAlt: 0, hyperspaceAlt: 0 }
          });
        }
      }
    }
    return entries;
  }

  // src/browser.ts
  globalThis.ChordingCore = {
    ...exports_chordCore,
    ...exports_chordMatcher,
    ...exports_chordResolver,
    ...exports_chordTransform,
    ...exports_chordRender
  };
})();
