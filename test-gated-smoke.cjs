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
    { index: 4, inputCodes: [116, 104, 101], outputCodes: [116, 104, 101] }, // the
    { index: 5, inputCodes: [113, 117, 105, 99, 107], outputCodes: [113, 117, 105, 99, 107] }, // quick
    { index: 6, inputCodes: [116, 113, 32], outputCodes: [116, 104, 101, 32, 113, 117, 105, 99, 107] }, // "the quick" phrase chord
  ],
};

let failures = 0;
function check(name, cond) {
  if (cond) console.log("PASS", name);
  else { console.log("FAIL", name); failures += 1; }
}
const span = (r, i) => (r && r.choices && r.choices[i]) ? [r.choices[i].start, r.choices[i].end] : null;

// 1. Fail closed without device state
A.sync(dict, null);
check("no-device-state: compiled null", A.compiled === null);
check("no-device-state: mode", A.mode === "no-device-state");
check("no-device-state: matchText null", A.matchText("great") === null);

// 2. Gated mode compiles
A.sync(dict, deviceState);
check("gated: compiled", A.compiled !== null);
check("gated: mode", A.mode === "gated");

// 3. Trailing-space form covers the bare word (stream " great " -> span [1,7))
const r1 = A.matchText(" great ");
check("gated: great matches", r1 && r1.matched === true);
check("gated: great span [1,7)", r1.choices.some((c) => c.start === 1 && c.end === 7));
check("gated: great source entry 0", r1.choices[0].sourceIndex === 0);
// 4. Multi-word phrase chord matches across the stream with exact offsets
const r2 = A.matchText("the quick brown fox");
check("gated: phrase chord matches", r2 && r2.matched);
const phraseChoice = (r2?.choices || []).find((c) => c.start === 0 && c.end === 10);
check("gated: phrase span [0,10) incl. concatenator", Boolean(phraseChoice));
check("gated: phrase source entry 6", phraseChoice?.sourceIndex === 6);

// 5. Resolver picks phrase chord over two single chords (one action vs two)
check("gated: resolver prefers phrase chord", (r2?.choices || []).length === 1);

// 6. 85=0 ("all"): base+modifier compound covers "greater" as one span
const r3 = A.matchText(" greater ");
check("gated: 85=0 compound covers greater", r3 && r3.choices.some((c) => c.start === 1 && c.end === 8));

// 7. 85=2 (arpeggiate chords only): chord-modifier compounds off. A base
// chord with inhibit (256) has a bare form, so base + modifier split a word.
A.sync({
  entries: [
    { index: 0, inputCodes: [103, 114], outputCodes: [103, 114, 256] }, // "gr" bare (inhibit)
    { index: 1, inputCodes: [101, 97, 116], outputCodes: [574, 101, 97, 116] }, // "eat" modifier
  ],
}, { ...deviceState, settings: { ...deviceState.settings, 85: 2 } });
const r4 = A.matchText(" great ");
check("gated: base+modifier base label", r4 && r4.choices.some((c) => c.start === 1 && c.end === 3 && !c.coveredByModifier));
check("gated: base+modifier modifier label", r4 && r4.choices.some((c) => c.modifiers.some((m) => m.start === 3 && m.end === 6)));

// 8. Unbound input chord is excluded by the gates
A.sync(dict, deviceState);
check("gated: unbound input excluded", A.matchText(" zed ") === null);


// 9. Arpeggiate compound (base + arp chord, gated on 81/85)
const r5 = A.matchText(" great! ");
check("gated: arpeggiate compound", r5 && r5.choices.some((c) => c.start === 1 && c.end === 7));

// 10. Arpeggiates disabled (81=0) kills the compound
A.sync(dict, { ...deviceState, settings: { ...deviceState.settings, 81: 0 } });
const r6 = A.matchText(" great! ");
check("gated: 81=0 kills compound", r6 === null || !r6.choices.some((c) => c.end === 7));

// 11. Chording disabled (49=0) kills all forms
A.sync(dict, { ...deviceState, settings: { ...deviceState.settings, 49: 0 } });
check("gated: 49=0 kills matching", A.matchText(" great ") === null);

// 12. GTM scope cut flags reBind and drops forms
A.sync({ entries: [{ index: 0, inputCodes: [103], outputCodes: [532, 103] }] }, deviceState);
check("gated: GTM reBindPending", A.reBindPending === true);
check("gated: GTM no forms", A.matchText(" g ") === null);

// 13. Hyperspace boundary gate [OWNER mechanic]: chording deletes text up
// to the last hyperspace, so a choice must start right after a space (or
// at stream start).
A.sync({
  entries: [
    { index: 0, inputCodes: [99, 111, 110], outputCodes: [99, 111, 110, 99, 101, 105, 118, 101, 100, 32, 111, 102] }, // "conceived of"
    { index: 1, inputCodes: [102, 111], outputCodes: [111, 102] }, // "of"
  ],
}, deviceState);
const r7 = A.matchText("(conceived of as) having no name");
check("boundary: paren-preceded phrase rejected", r7 && !r7.choices.some((c) => c.start === 1));
check("boundary: word-boundary 'of' kept", r7 && r7.choices.some((c) => c.start === 11 && c.end === 14));

const r8 = A.matchText("conceived of as) having no name");
check("boundary: stream-start phrase kept", r8 && r8.choices.some((c) => c.start === 0 && c.end === 13));

// internal-word bare chord rejected (would delete the typed prefix)
A.sync({
  entries: [{ index: 0, inputCodes: [112, 108, 97], outputCodes: [112, 108, 97, 99, 101, 256] }], // "place" bare
}, deviceState);
const rMid = A.matchText("hippoplacephobia");
check("boundary: mid-word bare chord rejected", !rMid || rMid.choices.length === 0);
const r9 = A.matchText(" place ");
check("boundary: word-start bare chord kept", r9 && r9.choices.some((c) => c.start === 1));

// 14. sigma(54)=0 (autocorrect off): output appends, so mid-word bare
// chords are admissible and the paren-prefixed phrase works.
const off54 = { ...deviceState, settings: { ...deviceState.settings, 54: 0 } };
A.sync({
  entries: [{ index: 0, inputCodes: [112, 108, 97], outputCodes: [112, 108, 97, 99, 101, 256] }], // "place" bare
}, off54);
const rMid2 = A.matchText("hippoplacephobia");
check("sigma54=0: mid-word bare chord allowed", rMid2 && rMid2.choices.some((c) => c.start === 5 && c.end === 10));
A.sync({
  entries: [
    { index: 0, inputCodes: [99, 111, 110], outputCodes: [99, 111, 110, 99, 101, 105, 118, 101, 100, 32, 111, 102] }, // "conceived of"
    { index: 1, inputCodes: [102, 111], outputCodes: [111, 102] },
  ],
}, off54);
const rParen = A.matchText("(conceived of as) having no name");
check("sigma54=0: paren-prefixed phrase allowed", rParen && rParen.choices.some((c) => c.start === 1 && c.end === 14));

process.exit(failures === 0 ? 0 : 1);
