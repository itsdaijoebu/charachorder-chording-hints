(() => {
  const SERIAL_BAUD_RATE = 115200;
  const SERIAL_COUNT_TIMEOUT_MS = 4000;
  const SERIAL_ENTRY_TIMEOUT_MS = 2000;

  const SERIAL_OUTPUT_ACTION_LABELS = {
    256: "inhibit_concatenator",

    296: "enter",
    297: "escape",
    298: "backspace",
    299: "tab",

    313: "caps_lock",

    314: "f1",
    315: "f2",
    316: "f3",
    317: "f4",
    318: "f5",
    319: "f6",
    320: "f7",
    321: "f8",
    322: "f9",
    323: "f10",
    324: "f11",
    325: "f12",

    330: "home",
    331: "page_up",
    333: "end",
    334: "page_down",
    335: "kbright",
    336: "kbleft",
    337: "kbdown",
    338: "kbup",

    360: "f13",
    361: "f14",
    362: "f15",
    363: "f16",
    364: "f17",
    365: "f18",
    366: "f19",
    367: "f20",
    368: "f21",
    369: "f22",
    370: "f23",
    371: "f24",

    512: "left_ctrl",
    513: "left_shift",
    514: "left_alt",
    515: "left_gui",
    516: "right_ctrl",
    517: "right_shift",
    518: "right_alt",
    519: "right_gui",

    523: "press_next",
    524: "release_next",

    531: "vim",
    532: "gtm",
    533: "dup_right",
    534: "impulse",
    535: "dup_all",
    536: "dup_left",
    538: "spur",

    540: "ambileft_left",
    542: "ambiright_right",

    545: "hyperspace",
    547: "hyperspace_capture",

    548: "layer1_left",
    549: "layer1_right",
    550: "layer2_left",
    551: "layer2_right",
    552: "layer3_left",
    553: "layer3_right",
    554: "layer4_left",
    555: "layer4_right",

    558: "hold_compound",
    559: "release_compound",

    560: "mouse_backward_click",
    561: "mouse_forward_click",
    562: "mouse_left_click",
    563: "mouse_right_click",
    564: "mouse_middle_click",
    565: "mouse_moveright",
    566: "mouse_moveleft",
    567: "mouse_movedown",
    568: "mouse_moveup",
    569: "mouse_scrollright",
    570: "mouse_scrollleft",
    571: "mouse_scrolldown",
    572: "mouse_scrollup",

    573: "capitalize",
    574: "join",
    575: "quickfix",
    576: "active_quickfix",
    577: "delay_100",
    578: "delay_10",
    579: "delay_1",

    589: "spin_pan_north",
    590: "spin_pan_east",
    591: "spin_pan_south",
    592: "spin_pan_west",
    593: "spin_scroll_north",
    594: "spin_scroll_east",
    595: "spin_scroll_south",
    596: "spin_scroll_west",

    597: "delay_500",
    598: "delay_1000",

    650: "profile_a",
    651: "profile_b",
    652: "profile_c",

    1001: "arpeggiate",
    1002: "tapdance"
  };

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
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
      return { code, type: "empty" };
    }

    const specialMeta = CCHShared.SPECIAL_INPUT_META?.[code];
    if (specialMeta) {
      return { code, type: "special" };
    }

    if (code >= 32 && code <= 126) {
      return { code, type: "char" };
    }

    return { code, type: "unknown" };
  }

  function splitCompoundInputClustersFromPackedSlots(packedInputSlots) {
    const reversedSlots = (Array.isArray(packedInputSlots) ? packedInputSlots.slice() : []).reverse();

    while (reversedSlots.length && reversedSlots[0] === 0) reversedSlots.shift();
    while (reversedSlots.length && reversedSlots[reversedSlots.length - 1] === 0) reversedSlots.pop();

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
        try { writer.releaseLock(); } catch (_) {}
      }
    }

    await sleep(50);

    try {
      reader = port.readable.getReader();
      return await readSerialResponseLines(reader, timeoutMs, matchRegex, payload);
    } finally {
      if (reader) {
        try { await reader.cancel(); } catch (_) {}
        try { reader.releaseLock(); } catch (_) {}
      }
    }
  }

  async function closePortQuietly(port) {
    if (!port) return;
    try {
      await port.close();
    } catch (_) {}
  }

  async function fetchSerialChordmapDictionary({ onProgress } = {}) {
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

      onProgress?.("Fetching chordmap count from connected Charachorder...");
      const countLines = await sendSerialCommand(port, "CML C0", /^CML\s+C0\b/, SERIAL_COUNT_TIMEOUT_MS);
      const combinedCountLines = combineSplitCmlLines(countLines);
      const countLine = combinedCountLines.find((line) => /^CML\s+C0\b/.test(line));
      const entryCount = parseCmlC0Line(countLine);

      if (!Number.isFinite(entryCount) || entryCount < 0) {
        throw new Error("The device did not return a valid chordmap count.");
      }

      const entries = [];

      for (let index = 0; index < entryCount; index += 1) {
        if (index === 0 || index % 25 === 0 || index === entryCount - 1) {
          onProgress?.(`Syncing chordmap from device... ${index}/${entryCount}`);
        }

        const responsePattern = new RegExp(`^CML\\s+C1\\s+${index}\\b`);
        const lines = await sendSerialCommand(
          port,
          `CML C1 ${index}`,
          responsePattern,
          SERIAL_ENTRY_TIMEOUT_MS
        );

        const combinedLines = combineSplitCmlLines(lines);
        const line = combinedLines.find((candidate) => responsePattern.test(candidate));
        const parsed = parseCmlC1Line(line);

        if (!parsed) {
          throw new Error(`Failed to read chord entry ${index} from the device.`);
        }

        const decodedInput = decodeInputHex(parsed.inputHex);
        const outputCodes = decodeOutputCodesFromHex(parsed.outputHex);

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

      onProgress?.(`Saving ${entries.length} synced chords...`);
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

  window.CCHSerialSync = {
    fetchSerialChordmapDictionary
  };
})();
