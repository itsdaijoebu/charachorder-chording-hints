const fs = require("fs");
const vm = require("vm");
const sandbox = { console };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync("chording-core.js", "utf8"), sandbox);
vm.runInContext(fs.readFileSync("chording-core-adapter.js", "utf8"), sandbox);
const A = sandbox.ChordingCoreAdapter;

// One-style layout: 3 layers x 90 slots. Layer 0 binds printable keys,
// modifiers and pseudo-actions; layers 1-2 empty (unbound).
const keyCount = 90;
const layer0 = new Array(keyCount).fill(0);
const bound = [32, 513, 517, 547, 574, 573, 256, 1001];
for (let c = 97; c <= 122; c++) bound.push(c); // a-z
for (let c = 65; c <= 90; c++) bound.push(c); // A-Z
for (let c = 48; c <= 57; c++) bound.push(c); // 0-9
for (let c = 33; c <= 47; c++) bound.push(c); // punctuation subset
for (let i = 0; i < bound.length && i < keyCount; i++) layer0[i] = bound[i];
const layout = layer0.concat(new Array(keyCount).fill(0), new Array(keyCount).fill(0));

const deviceState = {
  source: "serial",
  version: "3.0.0",
  id: { company: null, device: "ONE", chipset: "M0" },
  slotsPerLayer: keyCount,
  settings: { 49: 1, 62: 0, 81: 1, 85: 0, 112: 1 },
  layout,
};

const dict = {
  entries: [
    { index: 0, inputCodes: [103, 114, 101, 97, 116], outputCodes: [103, 114, 101, 97, 116] }, // great
    { index: 1, inputCodes: [101, 114], outputCodes: [574, 101, 114] }, // er modifier (JOIN prefix)
    { index: 2, inputCodes: [1001, 33], outputCodes: [574, 33] }, // arpeggiate chord "!"
    { index: 3, inputCodes: [999, 100], outputCodes: [122, 101, 100] }, // "zed" with UNBOUND input 999
  ],
};

let failures = 0;
function check(name, cond) {
  if (cond) console.log("PASS", name);
  else { console.log("FAIL", name); failures += 1; }
}

// 1. Fail closed without device state
A.sync(dict, null);
check("no-device-state: compiled null", A.compiled === null);
check("no-device-state: mode", A.mode === "no-device-state");
check("no-device-state: matchWord null", A.matchWord("great", "great", { minimumWordLength: 3 }) === null);

// 2. Gated mode compiles
A.sync(dict, deviceState);
check("gated: compiled", A.compiled !== null);
check("gated: mode", A.mode === "gated");

// 3. Bound chord matches; trailing-space form covers the bare word
const r1 = A.matchWord("great", "great", { minimumWordLength: 3 });
check("gated: great matches", r1 && r1.matched === true);
check("gated: great label span [0,5)", r1.labels.some((l) => l.anchor.start === 0 && l.anchor.end === 5));

// 4. 85=0 ("all"): base+modifier compound covers "greater" as one hint
const r2 = A.matchWord("greater", "greater", { minimumWordLength: 3 });
check("gated: 85=0 compound covers greater", r2.labels.some((l) => l.anchor.start === 0 && l.anchor.end === 7));

// 5. 85=2 (arpeggiate chords only): chord-modifier compounds off. A base
// chord with inhibit (256) has a bare form, so base + modifier split a word:
// "gr" [0,2) bare + "eat" modifier [2,5).
A.sync({
  entries: [
    { index: 0, inputCodes: [103, 114], outputCodes: [103, 114, 256] }, // "gr" bare (inhibit)
    { index: 1, inputCodes: [101, 97, 116], outputCodes: [574, 101, 97, 116] }, // "eat" modifier
  ],
}, { ...deviceState, settings: { ...deviceState.settings, 85: 2 } });
const r2b = A.matchWord("great", "great", { minimumWordLength: 3 });
check("gated: base+modifier labels", r2b.labels.some((l) => l.anchor.start === 0 && l.anchor.end === 2) && r2b.labels.some((l) => l.anchor.start === 2 && l.anchor.end === 5));

// 6. Unbound input chord is excluded by the gates
A.sync(dict, deviceState);
const r3 = A.matchWord("zed", "zed", { minimumWordLength: 3 });
check("gated: unbound input excluded", r3 === null);

// 7. Arpeggiate compound (base + arp chord, gated on 81/85)
const r4 = A.matchWord("great!", "great!", { minimumWordLength: 3 });
check("gated: arpeggiate compound", r4 && r4.labels.some((l) => l.anchor.start === 0 && l.anchor.end === 6));

// 8. Arpeggiates disabled (81=0) kills the compound
A.sync(dict, { ...deviceState, settings: { ...deviceState.settings, 81: 0 } });
const r5 = A.matchWord("great!", "great!", { minimumWordLength: 3 });
check("gated: 81=0 kills compound", r5 === null || !r5.labels.some((l) => l.anchor.end === 6));

// 9. Chording disabled (49=0) kills all forms
A.sync(dict, { ...deviceState, settings: { ...deviceState.settings, 49: 0 } });
check("gated: 49=0 kills matching", A.matchWord("great", "great", { minimumWordLength: 3 }) === null);

// 10. GTM scope cut flags reBind and drops forms
A.sync({ entries: [{ index: 0, inputCodes: [103], outputCodes: [532, 103] }] }, deviceState);
check("gated: GTM reBindPending", A.reBindPending === true);
check("gated: GTM no forms", A.matchWord("g", "g", { minimumWordLength: 1 }) === null);

process.exit(failures === 0 ? 0 : 1);
