(() => {
    const ANNOTATION_CHUNK_INITIAL_IMMEDIATE_COUNT = 2;
    const ANNOTATION_CHUNK_INITIAL_IMMEDIATE_MAX_STARTS = 50;
    const ANNOTATION_CHUNK_INITIAL_IMMEDIATE_BUDGET_MS = 6;
    const ANNOTATION_CHUNK_STEADY_IMMEDIATE_MAX_STARTS = 100;
    const ANNOTATION_CHUNK_STEADY_IMMEDIATE_BUDGET_MS = 12;
    const ANNOTATION_CHUNK_DEFERRED_MAX_STARTS = 120;
    const ANNOTATION_CHUNK_DEFERRED_BUDGET_MS = 14;
    const HINT_LABEL_TEMPLATE_CACHE_LIMIT = 512;
    const NAIVE_MODIFIER_DEFINITIONS = [
        { suffix: "ing", key: "ambileft_left" },
        { suffix: "es", key: "ambiright_right" },
        { suffix: "ed", key: "layer2_left", eEndingCompactSuffix: "d" },
        { suffix: "er", key: "layer2_right", eEndingCompactSuffix: "r" },
        { suffix: "s", key: "ambiright_right" }
    ];
    const MODIFIER_PSEUDO_ENTRY_CACHE = new Map();

    const STORAGE_KEYS = {
        parsedDictionary: "parsedDictionary",
        inputDisplayOverrides: "inputDisplayOverrides",
        settings: "settings"
    };

    const STATE = {
        dictionary: null,
        settings: CCHShared.defaultSettings(),
        containerObserver: null,
        promptObserver: null,
        observedPromptContainer: null,
        scheduled: false,
        scheduledForce: false,
        trackedParagraphs: [],
        promptRefreshTimer: null,
        lastPromptSignature: "",
        containerRebindTimer: null,
        maxLookupWordCount: 1,
        overlayRoot: null,
        overlayLabels: [],
        overlayOutlines: [],
        overlayRepositionFrame: null,
        overlayResizeObserver: null,
        exactWordLookup: null,
        exactEntrySelectionCache: new Map(),
        hintLabelTemplateCache: new Map(),
        hintLabelClickDelegationInstalled: false,
        annotationMeasurementCache: null,
        annotationWorkTimer: null,
        annotationPassToken: 0,
        lastLocationHref: location.href
    };

    const SITE_ADAPTERS = [
        {
            key: "entertrained",
            renderMode: "inline",
            refreshOnContainerRebind: true,
            premeasureInlineGeometry: true,
            cacheInlineWordRects: true,
            deferOffscreenParagraphs: true,
            matchesLocation() {
                return (
                    location.hostname === "entertrained.app" &&
                    location.pathname.startsWith("/prompt/")
                );
            },
            getPromptContainer() {
                const container = document.querySelector(".paragraphs");
                return container instanceof HTMLElement ? container : null;
            },
            getParagraphBoxes(container) {
                if (!(container instanceof HTMLElement)) return [];

                return Array.from(container.querySelectorAll(":scope > .p-box"))
                    .filter((el) => el instanceof HTMLElement)
                    .filter(isVisible);
            },
            getWordElements(paragraph) {
                if (!(paragraph instanceof HTMLElement)) return [];

                return Array.from(paragraph.querySelectorAll(":scope > p > .word"))
                    .filter((el) => el instanceof HTMLElement)
                    .filter(isVisible);
            },
            buildPromptSignature(paragraphs, wordLists = null) {
                const normalizedParagraphs = paragraphs.map((paragraph) =>
                    annotationFreeTextContent(paragraph)
                        .replace(/\s+/g, " ")
                        .trim()
                );

                const totalWords = Array.isArray(wordLists)
                    ? wordLists.reduce((sum, words) => sum + words.length, 0)
                    : paragraphs.reduce(
                        (sum, paragraph) => sum + this.getWordElements(paragraph).length,
                        0
                    );

                return JSON.stringify({
                    site: this.key,
                    paragraphCount: paragraphs.length,
                    totalWords,
                    text: normalizedParagraphs.join("\n")
                });
            },
            observerConfig() {
                return {
                    subtree: true,
                    childList: true,
                    characterData: false,
                    attributes: false
                };
            },
            promptRefreshDebounceMs() {
                return 20;
            },
            containerRebindDelayMs() {
                return 10;
            },
            annotationScheduleDelayMs() {
                return 0;
            },
            mutationIsRelevant(mutation) {
                return entertrainedMutationLooksStructural(mutation);
            }
        },
        {
            key: "monkeytype",
            renderMode: "overlay",
            matchesLocation() {
                return location.hostname === "monkeytype.com" && /^\/?$/.test(location.pathname);
            },
            getPromptContainer() {
                const container = document.querySelector("#wordsWrapper > #words, #wordWrapper > #words")
                    || document.querySelector("#typingTest #words")
                    || document.querySelector("#words");
                return container instanceof HTMLElement ? container : null;
            },
            getParagraphBoxes(container) {
                if (!(container instanceof HTMLElement) || !isVisible(container)) return [];
                return [container];
            },
            getWordElements(container) {
                if (!(container instanceof HTMLElement)) return [];

                const words = Array.from(container.querySelectorAll(":scope > .word"))
                    .filter((el) => el instanceof HTMLElement && el.isConnected);

                return filterWordsToFirstRows(words, 3);
            },
            buildPromptSignature(paragraphs, wordLists = null) {
                const container = paragraphs[0];
                if (!(container instanceof HTMLElement)) {
                    return JSON.stringify({
                        site: this.key,
                        visibleWordCount: 0,
                        text: ""
                    });
                }

                const words = Array.isArray(wordLists) && Array.isArray(wordLists[0])
                    ? wordLists[0]
                    : this.getWordElements(container);
                const texts = words.map((word) =>
                    wordRecordText(word)
                        .replace(/\s+/g, " ")
                        .trim()
                );

                const firstWordIndex = readMonkeytypeWordIndex(wordRecordElement(words[0]));
                const lastWordIndex = readMonkeytypeWordIndex(wordRecordElement(words[words.length - 1]));

                return JSON.stringify({
                    site: this.key,
                    visibleWordCount: words.length,
                    firstWordIndex,
                    lastWordIndex,
                    text: texts.join(" ")
                });
            },
            observerConfig() {
                return {
                    subtree: true,
                    childList: true,
                    characterData: false,
                    attributes: false
                };
            },
            mutationIsRelevant(mutation) {
                return Boolean(monkeytypeMutationRefreshMode(mutation));
            },
            mutationRefreshMode(mutation) {
                return monkeytypeMutationRefreshMode(mutation);
            }
        },
        {
            key: "keybr",
            renderMode() {
                return "overlay";
            },
            refreshOnContainerRebind: true,
            keybrHintLayout() {
                return ["consistent", "extra-spacing"].includes(STATE.settings.keybr_hint_layout)
                    ? STATE.settings.keybr_hint_layout
                    : "extra-spacing";
            },
            matchesLocation() {
                return location.hostname === "www.keybr.com" && /^\/?$/.test(location.pathname);
            },
            getPromptContainer() {
                const container = document.querySelector("div.VWtF2mmR6I");
                return container instanceof HTMLElement ? container : null;
            },
            getOverlayRootParent() {
                const parent = document.querySelector("div.d7mouSz05B");
                return parent instanceof HTMLElement ? parent : null;
            },
            getOverlayTypographyElement(container) {
                const prompt = container instanceof HTMLElement ? container : this.getPromptContainer();
                return prompt instanceof HTMLElement ? prompt : null;
            },
            getParagraphBoxes(container) {
                if (!(container instanceof HTMLElement) || !isVisible(container)) return [];
                container.classList.toggle("cch-keybr-prompt", this.keybrHintLayout() === "extra-spacing");
                return [container];
            },
            getWordElements(container) {
                if (!(container instanceof HTMLElement)) return [];

                return Array.from(container.querySelectorAll(":scope > span"))
                    .filter((el) => el instanceof HTMLElement)
                    .filter(isVisible)
                    .filter((el) => this.getWordText(el).length > 0);
            },
            getWordText(wordEl) {
                return annotationFreeTextContent(wordEl)
                    .replace(/\uE000/g, "")
                    .trim();
            },
            buildPromptSignature(paragraphs, wordLists = null) {
                const container = paragraphs[0];
                if (!(container instanceof HTMLElement)) {
                    return JSON.stringify({
                        site: this.key,
                        visibleWordCount: 0,
                        text: ""
                    });
                }

                const words = Array.isArray(wordLists) && Array.isArray(wordLists[0])
                    ? wordLists[0]
                    : this.getWordElements(container);
                const texts = words.map((word) =>
                    wordRecordText(word)
                        .replace(/\s+/g, " ")
                        .trim()
                );

                return JSON.stringify({
                    site: this.key,
                    visibleWordCount: words.length,
                    text: texts.join(" ")
                });
            },
            observerConfig() {
                return {
                    subtree: true,
                    childList: true,
                    characterData: true,
                    attributes: false
                };
            },
            mutationIsRelevant(mutation) {
                return mutation.type === "childList" || mutation.type === "characterData";
            },
            mutationRefreshMode(mutation) {
                if (mutation.type === "childList") {
                    if (mutation.target === STATE.observedPromptContainer) {
                        return "annotate";
                    }

                    const changedNodes = [
                        ...Array.from(mutation.addedNodes || []),
                        ...Array.from(mutation.removedNodes || [])
                    ];
                    const changedWords = changedNodes
                        .filter((node) => node instanceof Element)
                        .flatMap((node) => {
                            if (node.tagName === "SPAN") return [node];
                            return Array.from(node.querySelectorAll?.("span") || []);
                        });
                    if (changedWords.length > 2) {
                        return "annotate";
                    }
                }

                return "reposition";
            }
        }
    ];

    function log(...args) {
        if (!STATE.settings.debugLogging) return;
        console.log("[CCH]", ...args);
    }

    function logKeybrCompact(label, payload) {
        if (!STATE.settings.debugLogging) return;

        try {
            log(`[cch-keybr] ${label} ${JSON.stringify(payload)}`);
        } catch (error) {
            log(`[cch-keybr] ${label} <unserializable>`);
        }
    }

    function visibleDebugText(text) {
        return String(text || "")
            .replace(/\uE000/g, "<E000>")
            .replace(/\s+/g, " ")
            .trim();
    }

    function elapsedDebugMs(startTime) {
        const now = typeof performance?.now === "function" ? performance.now() : Date.now();
        return Math.round(now - startTime);
    }

    function nowMs() {
        return typeof performance?.now === "function" ? performance.now() : Date.now();
    }

    function indexRangeSummary(indexes, maxRanges = 16) {
        const safeIndexes = Array.from(new Set(
            (Array.isArray(indexes) ? indexes : [])
                .map((value) => Number(value))
                .filter((value) => Number.isFinite(value))
        )).sort((a, b) => a - b);

        if (!safeIndexes.length) {
            return {
                count: 0,
                ranges: [],
                truncated: false
            };
        }

        const ranges = [];
        let start = safeIndexes[0];
        let previous = safeIndexes[0];

        function pushRange() {
            ranges.push(start === previous ? `${start}` : `${start}-${previous}`);
        }

        for (let index = 1; index < safeIndexes.length; index += 1) {
            const value = safeIndexes[index];
            if (value === previous + 1) {
                previous = value;
                continue;
            }

            pushRange();
            start = value;
            previous = value;
        }

        pushRange();

        return {
            count: safeIndexes.length,
            ranges: ranges.slice(0, maxRanges),
            truncated: ranges.length > maxRanges
        };
    }

    function annotationBatchDebugSummary(entries, wordIndexKey = null) {
        const safeEntries = Array.isArray(entries) ? entries : [];
        return {
            paragraphIndexes: safeEntries.map((entry) => entry.index),
            paragraphCount: safeEntries.length,
            wordCount: safeEntries.reduce((sum, entry) => sum + (entry.words?.length || 0), 0),
            batchedWordCount: wordIndexKey
                ? safeEntries.reduce((sum, entry) => sum + (entry?.[wordIndexKey]?.length || 0), 0)
                : null,
            paragraphs: safeEntries.map((entry) => {
                const rect = entry?.paragraph?.getBoundingClientRect?.() || null;
                const batchedWordSummary = wordIndexKey
                    ? indexRangeSummary(entry?.[wordIndexKey])
                    : null;
                return {
                    paragraphIndex: entry.index,
                    wordCount: entry.words?.length || 0,
                    batchedWordCount: batchedWordSummary?.count ?? null,
                    batchedWordRanges: batchedWordSummary?.ranges ?? null,
                    batchedWordRangesTruncated: batchedWordSummary?.truncated ?? false,
                    top: rect ? Math.round(rect.top) : null,
                    bottom: rect ? Math.round(rect.bottom) : null,
                    inViewport: rect ? rectIntersectsViewport(rect) : false,
                    sampleText: visibleDebugText(annotationFreeTextContent(entry.paragraph)).slice(0, 160)
                };
            })
        };
    }

    function resetHintLabelTemplateCache(reason = "unspecified") {
        STATE.hintLabelTemplateCache.clear();
        void reason;
    }

    function keybrDebugNodeSummary(node) {
        if (!(node instanceof Element)) {
            return {
                nodeType: node?.nodeType ?? null,
                text: visibleDebugText(node?.textContent || "")
            };
        }

        return {
            tag: node.tagName,
            className: node.className || "",
            text: visibleDebugText(annotationFreeTextContent(node)),
            childTexts: Array.from(node.childNodes || []).map((child) => ({
                nodeType: child.nodeType,
                tag: child instanceof Element ? child.tagName : null,
                className: child instanceof Element ? (child.className || "") : "",
                text: visibleDebugText(child.textContent || "")
            }))
        };
    }

    function logKeybrPromptState(reason, container, words) {
        if (!STATE.settings.debugLogging) return;

        const adapter = currentSiteAdapter();
        if (adapter?.key !== "keybr" || !(container instanceof HTMLElement)) {
            return;
        }

        const wrappers = Array.from(container.querySelectorAll(":scope > span"))
            .filter((el) => el instanceof HTMLElement)
            .slice(0, 12)
            .map((wrapper, index) => ({
                wrapperIndex: index,
                rectLeft: Math.round(wrapper.getBoundingClientRect().left),
                rectWidth: Math.round(wrapper.getBoundingClientRect().width),
                text: visibleDebugText(annotationFreeTextContent(wrapper)),
                childTexts: Array.from(wrapper.querySelectorAll(":scope > span"))
                    .filter((child) => child instanceof HTMLElement)
                    .map((child, childIndex) => ({
                        childIndex,
                        rectLeft: Math.round(child.getBoundingClientRect().left),
                        rectWidth: Math.round(child.getBoundingClientRect().width),
                        text: visibleDebugText(annotationFreeTextContent(child))
                    }))
            }));

        const wordSummaries = (Array.isArray(words) ? words : [])
            .slice(0, 12)
            .map((word, index) => {
                const el = wordRecordElement(word);
                const rect = wordRecordRect(word, false);
                return {
                    wordIndex: index,
                    text: visibleDebugText(wordRecordText(word)),
                    className: el instanceof HTMLElement ? (el.className || "") : "",
                    rectLeft: rect ? Math.round(rect.left) : null,
                    rectWidth: rect ? Math.round(rect.width) : null
                };
            });

        logKeybrCompact(`prompt-state ${reason}`, {
            wrapperCount: container.querySelectorAll(":scope > span").length,
            wordCount: Array.isArray(words) ? words.length : 0,
            wrappers,
            words: wordSummaries
        });
    }

    function logKeybrMutationState(mutation, refreshMode) {
        if (!STATE.settings.debugLogging) return;

        const adapter = currentSiteAdapter();
        if (adapter?.key !== "keybr") {
            return;
        }

        logKeybrCompact("mutation", {
            refreshMode,
            type: mutation.type,
            target: keybrDebugNodeSummary(mutation.target),
            addedNodes: Array.from(mutation.addedNodes || []).slice(0, 6).map(keybrDebugNodeSummary),
            removedNodes: Array.from(mutation.removedNodes || []).slice(0, 6).map(keybrDebugNodeSummary)
        });
    }

    function logKeybrOverlayState(reason) {
        if (!STATE.settings.debugLogging) return;

        const adapter = currentSiteAdapter();
        if (adapter?.key !== "keybr") {
            return;
        }

        logKeybrCompact(`overlay-state ${reason}`, {
            labelCount: STATE.overlayLabels.length,
            labels: STATE.overlayLabels.slice(0, 12).map((record, index) => {
                const rect = wordRecordRect(record.word, false);
                return {
                    labelIndex: index,
                    wordText: visibleDebugText(wordRecordText(record.word)),
                    wordLeft: rect ? Math.round(rect.left) : null,
                    wordWidth: rect ? Math.round(rect.width) : null,
                    labelLeft: record.label?.style.left || "",
                    labelTop: record.label?.style.top || ""
                };
            })
        });
    }

    function getStorage(keys) {
        return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
    }

    function setStorage(values) {
        return new Promise((resolve) => chrome.storage.local.set(values, resolve));
    }

    function hydrateSettings(rawSettings) {
        const defaults = CCHShared.defaultSettings();
        const merged = {
            ...defaults,
            ...(rawSettings || {})
        };

        merged.specialTokenDescriptions = {
            ...CCHShared.defaultSpecialTokenDescriptions(),
            ...(merged.specialTokenDescriptions || {})
        };

        merged.enableSubstringHints = Boolean(merged.enableSubstringHints);
        merged.enableNaiveModifierHints = Boolean(merged.enableNaiveModifierHints);
        merged.suppressAffixMatchingInMiddleOfWords = Boolean(merged.suppressAffixMatchingInMiddleOfWords);
        merged.minimumWordLength = CCHShared.normalizeMinimumWordLength
            ? CCHShared.normalizeMinimumWordLength(merged.minimumWordLength)
            : Math.max(1, Math.floor(Number(merged.minimumWordLength)) || 3);
        merged.hintCharacterOrderMode = CCHShared.normalizeHintCharacterOrderMode
            ? CCHShared.normalizeHintCharacterOrderMode(merged.hintCharacterOrderMode)
            : (merged.hintCharacterOrderMode === "charachorder-default"
                ? "charachorder-default"
                : "best-match");
        merged.hint_position = ["left", "center"].includes(merged.hint_position)
            ? merged.hint_position
            : "left";
        merged.hint_display = ["always", "hover"].includes(merged.hint_display)
            ? merged.hint_display
            : merged.chordable_word_display === "highlight-only"
                ? "hover"
                : "always";
        merged.keybr_hint_layout = ["consistent", "extra-spacing"].includes(merged.keybr_hint_layout)
            ? merged.keybr_hint_layout
            : "extra-spacing";
        merged.toggleHintsHotkey = CCHShared.mergeHotkey
            ? CCHShared.mergeHotkey(merged.toggleHintsHotkey, defaults.toggleHintsHotkey)
            : (merged.toggleHintsHotkey || defaults.toggleHintsHotkey);
        merged.toggleHintDisplayHotkey = CCHShared.mergeHotkey
            ? CCHShared.mergeHotkey(merged.toggleHintDisplayHotkey, defaults.toggleHintDisplayHotkey)
            : (merged.toggleHintDisplayHotkey || defaults.toggleHintDisplayHotkey);
        delete merged.chordable_word_display;

        return merged;
    }

    function currentSiteAdapter() {
        return SITE_ADAPTERS.find((adapter) => adapter.matchesLocation()) || null;
    }

    function adapterDelayMs(propertyName, fallback, ...args) {
        const adapter = currentSiteAdapter();
        const rawValue = typeof adapter?.[propertyName] === "function"
            ? adapter[propertyName](...args)
            : adapter?.[propertyName];
        const value = Number(rawValue);
        return Number.isFinite(value) && value >= 0 ? value : fallback;
    }

    function adapterFlag(propertyName, fallback = false) {
        const adapter = currentSiteAdapter();
        const rawValue = typeof adapter?.[propertyName] === "function"
            ? adapter[propertyName]()
            : adapter?.[propertyName];
        return typeof rawValue === "boolean" ? rawValue : fallback;
    }

    function cancelScheduledAnnotationWork() {
        if (STATE.annotationWorkTimer != null) {
            window.clearTimeout(STATE.annotationWorkTimer);
            STATE.annotationWorkTimer = null;
        }
    }

    function adapterRenderMode(adapter = currentSiteAdapter()) {
        if (!adapter) return "inline";
        return typeof adapter.renderMode === "function"
            ? adapter.renderMode()
            : adapter.renderMode || "inline";
    }

    function isVisible(el) {
        if (!(el instanceof HTMLElement)) return false;
        if (!el.isConnected) return false;

        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
            return false;
        }

        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    function rectIntersectsViewport(rect) {
        return (
            rect.right > 0 &&
            rect.left < window.innerWidth &&
            rect.bottom > 0 &&
            rect.top < window.innerHeight
        );
    }

    function filterWordsToFirstRows(words, rowLimit) {
        const rowTolerance = 2;
        const rows = [];

        for (const word of words) {
            const rect = word.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) continue;

            let row = rows.find((candidate) => Math.abs(candidate.top - rect.top) <= rowTolerance);
            if (!row) {
                if (rows.length >= rowLimit) {
                    break;
                }

                row = {
                    top: rect.top,
                    words: []
                };
                rows.push(row);
            }

            row.words.push(word);
        }

        return rows
            .sort((a, b) => a.top - b.top)
            .slice(0, rowLimit)
            .flatMap((row) => row.words);
    }

    function annotationFreeTextContent(root) {
        if (!(root instanceof Node)) return "";

        let text = "";
        root.childNodes.forEach((child) => {
            if (child instanceof Element && child.classList.contains("cch-hint-label")) {
                return;
            }

            if (child.nodeType === Node.TEXT_NODE) {
                text += child.textContent || "";
                return;
            }

            text += annotationFreeTextContent(child);
        });

        return text;
    }

    function readMonkeytypeWordIndex(word) {
        if (!(word instanceof HTMLElement)) return null;

        const value = word.getAttribute("data-wordindex");
        if (value == null || value === "") return null;

        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : String(value);
    }

    function wordIndexListFromNodes(nodes) {
        const indexes = Array.from(nodes || [])
            .flatMap((node) => {
                if (!(node instanceof Element)) return [];

                if (node.classList.contains("word")) {
                    const index = readMonkeytypeWordIndex(node);
                    return index == null ? [] : [String(index)];
                }

                const word = node.closest(".word");
                if (word instanceof HTMLElement) {
                    const index = readMonkeytypeWordIndex(word);
                    return index == null ? [] : [String(index)];
                }

                return Array.from(node.querySelectorAll(".word"))
                    .map(readMonkeytypeWordIndex)
                    .filter((index) => index != null)
                    .map(String);
            })
            .filter((index, position, all) => all.indexOf(index) === position)
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

        return indexes;
    }

    function mutationTargetWord(mutation) {
        const target = mutation.target;
        if (!(target instanceof Element)) return null;
        if (target.classList.contains("word")) return target;
        const word = target.closest(".word");
        return word instanceof HTMLElement ? word : null;
    }

    function monkeytypeMutationRefreshMode(mutation) {
        if (mutation.type !== "childList") return false;

        const targetWord = mutationTargetWord(mutation);
        const targetWordIndex = readMonkeytypeWordIndex(targetWord);
        const addedIndexes = wordIndexListFromNodes(mutation.addedNodes);
        const removedIndexes = wordIndexListFromNodes(mutation.removedNodes);
        const changedIndexes = Array.from(new Set([...addedIndexes, ...removedIndexes]));
        const addedSignature = addedIndexes.join("|");
        const removedSignature = removedIndexes.join("|");

        if (targetWord?.classList.contains("active")) {
            if (!changedIndexes.length) return "reposition";

            if (
                targetWordIndex != null &&
                changedIndexes.every((index) => index === String(targetWordIndex))
            ) {
                return "reposition";
            }
        }

        if (addedSignature || removedSignature) {
            if (addedSignature !== removedSignature) return "annotate";
            if (addedIndexes.length <= 1 && removedIndexes.length <= 1) return false;
            return "reposition";
        }

        if (targetWord?.classList.contains("active")) return false;

        return "reposition";
    }

    function entertrainedMutationLooksStructural(mutation) {
        if (mutation.type !== "childList") return false;

        const target = mutation.target instanceof Element ? mutation.target : null;
        if (target === STATE.observedPromptContainer) {
            return true;
        }

        const changedNodes = [
            ...Array.from(mutation.addedNodes || []),
            ...Array.from(mutation.removedNodes || [])
        ].filter((node) => node instanceof Element);

        if (!changedNodes.length) {
            return false;
        }

        return changedNodes.some((node) => (
            node.classList.contains("p-box") ||
            node.classList.contains("word") ||
            node.querySelector?.(".p-box, .word")
        ));
    }

    function handleLocationChange(reason) {
        const nextHref = location.href;
        if (nextHref === STATE.lastLocationHref) {
            return;
        }

        const previousHref = STATE.lastLocationHref;
        STATE.lastLocationHref = nextHref;

        log("Location changed", {
            reason,
            previousHref,
            nextHref
        });

        ensurePromptObserverTarget();
        STATE.lastPromptSignature = "";
        scheduleAnnotation(true);
    }

    function installLocationObserver() {
        const notifyLocationChange = (reason) => {
            window.setTimeout(() => handleLocationChange(reason), 0);
        };

        const wrapHistoryMethod = (methodName) => {
            const original = history[methodName];
            if (typeof original !== "function") {
                return;
            }

            history[methodName] = function (...args) {
                const result = original.apply(this, args);
                notifyLocationChange(`history-${methodName}`);
                return result;
            };
        };

        wrapHistoryMethod("pushState");
        wrapHistoryMethod("replaceState");

        window.addEventListener("popstate", () => {
            notifyLocationChange("popstate");
        });

        window.addEventListener("hashchange", () => {
            notifyLocationChange("hashchange");
        });
    }

    function hexToRgba(hex, opacity) {
        const safeHex = String(hex || "").trim();
        const safeOpacity = Math.max(0, Math.min(1, Number(opacity) || 1));

        if (!/^#[0-9a-fA-F]{6}$/.test(safeHex)) {
            return `rgba(0, 0, 0, ${safeOpacity})`;
        }

        const r = parseInt(safeHex.slice(1, 3), 16);
        const g = parseInt(safeHex.slice(3, 5), 16);
        const b = parseInt(safeHex.slice(5, 7), 16);

        return `rgba(${r}, ${g}, ${b}, ${safeOpacity})`;
    }

    function applyAppearanceSettings() {
        const root = document.documentElement;
        const settings = STATE.settings;

        root.style.setProperty(
            "--cch-hint-box-dark-mode-color",
            hexToRgba(
                settings.hint_box_dark_mode_color,
                settings.hint_box_dark_mode_opacity
            )
        );

        root.style.setProperty(
            "--cch-hint-text-dark-mode-color",
            settings.hint_text_dark_mode_color
        );

        root.style.setProperty(
            "--cch-hint-box-light-mode-color",
            hexToRgba(
                settings.hint_box_light_mode_color,
                settings.hint_box_light_mode_opacity
            )
        );

        root.style.setProperty(
            "--cch-hint-text-light-mode-color",
            settings.hint_text_light_mode_color
        );

        const hintTextSizeValue = Number(
            settings.hint_text_font_size_value ?? settings.hint_text_font_size_em
        ) || 0.85;
        const hintTextSizeUnit = ["em", "px"].includes(settings.hint_text_font_size_unit)
            ? settings.hint_text_font_size_unit
            : "em";

        root.style.setProperty(
            "--cch-label-font-size",
            `${hintTextSizeValue}${hintTextSizeUnit}`
        );
    }

    function getPromptContainer() {
        const adapter = currentSiteAdapter();
        return adapter?.getPromptContainer() || null;
    }

    function getParagraphBoxes() {
        const adapter = currentSiteAdapter();
        if (!adapter) return [];

        const container = adapter.getPromptContainer();
        return adapter.getParagraphBoxes(container);
    }

    function getWordElements(paragraph) {
        const adapter = currentSiteAdapter();
        if (!adapter) return [];

        return adapter.getWordElements(paragraph);
    }

    function wordTextFromElement(wordEl) {
        const adapter = currentSiteAdapter();
        if (adapter?.getWordText) {
            return adapter.getWordText(wordEl);
        }

        return annotationFreeTextContent(wordEl).trim();
    }

    function wordRecordElement(word) {
        return word?.el instanceof HTMLElement ? word.el : word;
    }

    function wordRecordText(word) {
        if (typeof word?.text === "string") return word.text;
        return wordTextFromElement(wordRecordElement(word));
    }

    function wordRecordNormalizedText(word) {
        if (typeof word?.normalized === "string") return word.normalized;
        return CCHShared.normalizeTokenForLookup(wordRecordText(word));
    }

    function stripPromptEdgeSpecialCharacters(text) {
        return String(text || "")
            .replace(/^[^\p{L}\p{N}\s]+/gu, "")
            .replace(/[^\p{L}\p{N}\s]+$/gu, "");
    }

    function codePointsForText(text) {
        return Array.from(String(text || ""))
            .map((char) => char.codePointAt(0))
            .filter((code) => Number.isFinite(code));
    }

    function modifierPseudoEntry(modifierKey, suffixText) {
        const cacheKey = `${modifierKey}:${suffixText}`;
        const cached = MODIFIER_PSEUDO_ENTRY_CACHE.get(cacheKey);
        if (cached) {
            return cached;
        }

        const token = CCHShared.makePseudoSpecialToken(modifierKey, modifierKey);
        const entry = CCHShared.buildEntry({
            index: -1,
            inputSegments: [{
                index: 0,
                kind: "decoded",
                inputCodes: [],
                inputTokens: [token],
                rawInput: `(${modifierKey})`,
                editableText: "",
                sortText: `(${modifierKey})`
            }],
            outputCodes: codePointsForText(suffixText),
            status: 0,
            userFlags: { displayEnabled: true }
        });

        MODIFIER_PSEUDO_ENTRY_CACHE.set(cacheKey, entry);
        return entry;
    }

    function allowedModifierTexts(definition, baseEndsWithE) {
        const variants = [definition.suffix];
        if (baseEndsWithE && definition.eEndingCompactSuffix) {
            variants.push(definition.eEndingCompactSuffix);
        }
        return variants;
    }

    function shiftModifierChain(chain, offset) {
        return (Array.isArray(chain) ? chain : []).map((modifier) => ({
            ...modifier,
            start: modifier.start + offset,
            end: modifier.end + offset
        }));
    }

    function collectModifierChainsFromTrailingText(text, baseEndsWithE, memo = new Map()) {
        const safeText = String(text || "");
        const memoKey = `${baseEndsWithE ? "1" : "0"}:${safeText}`;
        if (memo.has(memoKey)) {
            return memo.get(memoKey);
        }

        if (!safeText) {
            const baseChains = [[]];
            memo.set(memoKey, baseChains);
            return baseChains;
        }

        const chains = [];
        NAIVE_MODIFIER_DEFINITIONS.forEach((definition) => {
            allowedModifierTexts(definition, baseEndsWithE).forEach((matchedText) => {
                if (!safeText.startsWith(matchedText)) {
                    return;
                }

                const remainder = safeText.slice(matchedText.length);
                collectModifierChainsFromTrailingText(remainder, baseEndsWithE, memo).forEach((remainderChain) => {
                    chains.push([
                        {
                            ...definition,
                            matchedText,
                            start: 0,
                            end: matchedText.length
                        },
                        ...shiftModifierChain(remainderChain, matchedText.length)
                    ]);
                });
            });
        });

        memo.set(memoKey, chains);
        return chains;
    }

    function compareModifierChains(left, right) {
        const leftModifiers = Array.isArray(left) ? left : [];
        const rightModifiers = Array.isArray(right) ? right : [];

        if (leftModifiers.length !== rightModifiers.length) {
            return leftModifiers.length - rightModifiers.length;
        }

        for (let index = 0; index < Math.min(leftModifiers.length, rightModifiers.length); index += 1) {
            const leftLength = leftModifiers[index]?.suffix?.length || 0;
            const rightLength = rightModifiers[index]?.suffix?.length || 0;
            if (leftLength !== rightLength) {
                return rightLength - leftLength;
            }
        }

        const leftKey = leftModifiers.map((modifier) => modifier.suffix).join("|");
        const rightKey = rightModifiers.map((modifier) => modifier.suffix).join("|");
        return leftKey.localeCompare(rightKey);
    }

    function compareNaiveModifierResolutions(left, right) {
        const leftBaseLength = String(left?.baseWord || "").length;
        const rightBaseLength = String(right?.baseWord || "").length;
        if (leftBaseLength !== rightBaseLength) {
            return rightBaseLength - leftBaseLength;
        }

        return compareModifierChains(left?.modifiers, right?.modifiers);
    }

    function modifierLabelsFromChain(modifiers, startOffset, wordLength) {
        return (Array.isArray(modifiers) ? modifiers : []).map((modifier) => ({
            entries: [modifierPseudoEntry(modifier.key, modifier.matchedText || modifier.suffix)],
            anchor: {
                type: "substring",
                start: startOffset + modifier.start,
                end: startOffset + modifier.end,
                wordLength
            }
        }));
    }

    function naiveModifierExactCandidates(baseCandidate) {
        if (!STATE.settings.enableNaiveModifierHints) {
            return [];
        }

        const lookupText = String(baseCandidate?.lookupKey || "");
        const matchNormalized = String(baseCandidate?.matchNormalized || "");
        if (!lookupText || !matchNormalized) {
            return [];
        }

        const words = lookupText.split(/\s+/u).filter(Boolean);
        if (!words.length) {
            return [];
        }

        const lastWord = words[words.length - 1];
        const prefixText = words.length > 1 ? `${words.slice(0, -1).join(" ")} ` : "";
        const baseOffset = Math.max(0, matchNormalized.indexOf(lookupText));
        const wordLength = matchNormalized.length;
        const resolutions = [];

        for (let splitIndex = 1; splitIndex < lastWord.length; splitIndex += 1) {
            const baseWord = lastWord.slice(0, splitIndex);
            const trailingText = lastWord.slice(splitIndex);
            const modifierChains = collectModifierChainsFromTrailingText(
                trailingText,
                baseWord.endsWith("e")
            ).filter((chain) => chain.length);

            modifierChains.forEach((chain) => {
                resolutions.push({
                    lookupKey: `${prefixText}${baseWord}`,
                    anchor: baseCandidate.anchor,
                    baseWord,
                    modifiers: chain,
                    labels: modifierLabelsFromChain(
                        chain,
                        baseOffset + prefixText.length + baseWord.length,
                        wordLength
                    )
                });
            });
        }

        return resolutions
            .filter((resolution) => resolution.lookupKey !== lookupText)
            .sort(compareNaiveModifierResolutions);
    }

    function exactLookupCandidatesForText(rawText, strictNormalized = null, allowAnchor = false) {
        const candidates = [];
        const safeStrictNormalized = typeof strictNormalized === "string"
            ? strictNormalized
            : CCHShared.normalizeTokenForLookup(rawText);

        if (safeStrictNormalized) {
            candidates.push({
                lookupKey: safeStrictNormalized,
                matchNormalized: safeStrictNormalized,
                anchor: null
            });
        }

        const edgeStrippedText = stripPromptEdgeSpecialCharacters(rawText);
        const edgeStrippedNormalized = CCHShared.normalizeTokenForLookup(edgeStrippedText);
        const strictWordCount = safeStrictNormalized
            ? safeStrictNormalized.split(/\s+/u).filter(Boolean).length
            : 0;
        const edgeStrippedWordCount = edgeStrippedNormalized
            ? edgeStrippedNormalized.split(/\s+/u).filter(Boolean).length
            : 0;
        if (
            edgeStrippedNormalized &&
            edgeStrippedWordCount === strictWordCount &&
            !candidates.some((candidate) => candidate.lookupKey === edgeStrippedNormalized)
        ) {
            const start = allowAnchor ? safeStrictNormalized.indexOf(edgeStrippedNormalized) : -1;
            candidates.push({
                lookupKey: edgeStrippedNormalized,
                matchNormalized: safeStrictNormalized,
                anchor: start >= 0
                    ? {
                        type: "substring",
                        start,
                        end: start + edgeStrippedNormalized.length,
                        wordLength: safeStrictNormalized.length
                    }
                    : null
            });
        }

        return candidates;
    }

    function wordRecordHasLookupText(word) {
        return Boolean(wordRecordNormalizedText(word));
    }

    function wordRecordRect(word, useCachedRect = true) {
        if (
            useCachedRect &&
            word?.rect &&
            typeof word.rect.width === "number" &&
            typeof word.rect.height === "number"
        ) {
            return word.rect;
        }

        const el = wordRecordElement(word);
        return el instanceof HTMLElement ? el.getBoundingClientRect() : null;
    }

    function wordRecordHasClass(word, className) {
        const el = wordRecordElement(word);
        return el instanceof HTMLElement && el.classList.contains(className);
    }

    function wordRecordIsWrappedInline(word) {
        if (word && typeof word === "object" && typeof word.wrappedInline === "boolean") {
            return word.wrappedInline;
        }

        const el = wordRecordElement(word);
        const wrappedInline = el instanceof HTMLElement && el.getClientRects().length > 1;
        if (word && typeof word === "object") {
            word.wrappedInline = wrappedInline;
        }
        return wrappedInline;
    }

    function hasActiveAnnotationMeasurementCache() {
        return STATE.annotationMeasurementCache instanceof WeakMap;
    }

    function createWordRecords(words, includeRects = false) {
        return words.map((el) => {
            const text = wordTextFromElement(el);
            return {
                el,
                text,
                normalized: CCHShared.normalizeTokenForLookup(text),
                rect: includeRects ? el.getBoundingClientRect() : null,
                wrappedInline: null
            };
        });
    }

    function buildPromptSignature(paragraphs = null, wordLists = null) {
        const adapter = currentSiteAdapter();
        if (!adapter) return "";

        const resolvedParagraphs = Array.isArray(paragraphs) ? paragraphs : getParagraphBoxes();
        return adapter.buildPromptSignature(resolvedParagraphs, wordLists);
    }

    function clearAnnotationsWithin(root, clearSiteClasses = false) {
        if (!(root instanceof Element)) return;

        if (clearSiteClasses) {
            root.classList.remove("cch-keybr-prompt");
        }
        root.querySelectorAll(".cch-word-outline").forEach((el) => el.remove());
        root.querySelectorAll(".cch-hint-label").forEach((el) => el.remove());

        root.querySelectorAll(".cch-host").forEach((el) => {
            el.classList.remove("cch-host");

            if (el.dataset.cchOriginalPosition) {
                el.style.position = el.dataset.cchOriginalPosition;
                delete el.dataset.cchOriginalPosition;
            } else {
                el.style.removeProperty("position");
            }

            delete el.dataset.cchAnnotated;
        });
    }

    function getOverlayRootParent() {
        const adapter = currentSiteAdapter();
        const parent = adapter?.getOverlayRootParent?.();
        if (parent instanceof HTMLElement) return parent;
        return document.body instanceof HTMLElement ? document.body : null;
    }

    function getOverlayRoot() {
        const parent = getOverlayRootParent();
        if (!parent) return null;

        if (STATE.overlayRoot?.isConnected && STATE.overlayRoot.parentElement === parent) {
            return STATE.overlayRoot;
        }

        STATE.overlayRoot?.remove();
        const root = document.createElement("div");
        root.className = "cch-overlay-root";
        if (parent !== document.body) {
            root.classList.add("cch-overlay-root-contained");
        }
        root.setAttribute("aria-hidden", "true");
        parent.appendChild(root);
        STATE.overlayRoot = root;
        return root;
    }

    function overlayPositionFromViewportRect(root, rect) {
        if (!(root instanceof HTMLElement) || !root.classList.contains("cch-overlay-root-contained")) {
            return {
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height
            };
        }

        const rootRect = root.getBoundingClientRect();
        const scaleX = root.offsetWidth > 0 ? rootRect.width / root.offsetWidth : 1;
        const scaleY = root.offsetHeight > 0 ? rootRect.height / root.offsetHeight : 1;
        const safeScaleX = Number.isFinite(scaleX) && scaleX > 0 ? scaleX : 1;
        const safeScaleY = Number.isFinite(scaleY) && scaleY > 0 ? scaleY : 1;

        return {
            left: (rect.left - rootRect.left) / safeScaleX,
            top: (rect.top - rootRect.top) / safeScaleY,
            width: rect.width / safeScaleX,
            height: rect.height / safeScaleY
        };
    }

    function syncOverlayTypography(root) {
        if (!(root instanceof HTMLElement)) return;

        const adapter = currentSiteAdapter();
        const promptContainer = adapter?.getPromptContainer?.();
        const typographyElement = adapter?.getOverlayTypographyElement?.(promptContainer);
        if (typographyElement instanceof HTMLElement) {
            root.style.fontSize = getComputedStyle(typographyElement).fontSize;
            return;
        }

        const typingTest = document.querySelector("#typingTest");
        if (typingTest instanceof HTMLElement) {
            root.style.fontSize = getComputedStyle(typingTest).fontSize;
            return;
        }

        root.style.removeProperty("font-size");
    }

    function clearOverlayAnnotations() {
        STATE.overlayLabels = [];
        STATE.overlayOutlines = [];
        if (STATE.overlayRoot?.isConnected) {
            STATE.overlayRoot.replaceChildren();
        }
    }

    function removeOverlayAnnotations() {
        window.cancelAnimationFrame(STATE.overlayRepositionFrame || 0);
        STATE.overlayRepositionFrame = null;
        STATE.overlayResizeObserver?.disconnect();
        STATE.overlayResizeObserver = null;
        STATE.overlayLabels = [];
        STATE.overlayOutlines = [];
        STATE.overlayRoot?.remove();
        STATE.overlayRoot = null;
    }

    function createOutlineElement() {
        const outline = document.createElement("span");
        outline.className = "cch-word-outline";
        outline.setAttribute("aria-hidden", "true");
        return outline;
    }

    function positionInlineOutline(outline, wordRect, rect) {
        if (!(outline instanceof HTMLElement) || !wordRect || !rect) {
            return false;
        }

        outline.style.left = `${rect.left - wordRect.left}px`;
        outline.style.top = `${rect.top - wordRect.top}px`;
        outline.style.width = `${rect.width}px`;
        outline.style.height = `${rect.height}px`;
        return true;
    }

    function positionOverlayOutline(record) {
        if (!record?.outline || !record.word) {
            return false;
        }

        const root = STATE.overlayRoot;
        if (!root?.isConnected) {
            return false;
        }

        const rect = outlineViewportRectForRecord(record);
        if (!rect || rect.width <= 0 || rect.height <= 0) {
            record.outline.style.display = "none";
            return false;
        }

        record.outline.style.removeProperty("display");
        const overlayPosition = overlayPositionFromViewportRect(root, rect);
        record.outline.style.left = `${overlayPosition.left}px`;
        record.outline.style.top = `${overlayPosition.top}px`;
        record.outline.style.width = `${overlayPosition.width}px`;
        record.outline.style.height = `${overlayPosition.height}px`;
        return true;
    }


    function positionOverlayLabel(record, overlayPosition = null) {
        if (!record || !record.label?.isConnected || !record.word) {
            return false;
        }

        const root = STATE.overlayRoot;
        if (!root?.isConnected) {
            return false;
        }

        const rect = wordRecordRect(record.word, false);
        if (!rect || rect.width <= 0 || rect.height <= 0) {
            record.label.style.display = "none";
            return false;
        }

        record.label.style.removeProperty("display");
        const nextOverlayPosition = overlayPosition || overlayPositionFromViewportRect(root, rect);
        const anchor = hintAnchorOffset(record.word, record.match, record.labelMatch, rect);
        record.label.style.left = STATE.settings.hint_position === "center"
            ? `${nextOverlayPosition.left + anchor.center}px`
            : `${nextOverlayPosition.left + anchor.left}px`;
        record.label.style.top = `${nextOverlayPosition.top}px`;
        return true;
    }

    function refreshOverlayPositions() {
        const root = STATE.overlayRoot;
        if (!root?.isConnected || (!STATE.overlayLabels.length && !STATE.overlayOutlines.length)) {
            return;
        }

        syncOverlayTypography(root);
        const nextLabelRecords = [];
        for (const record of STATE.overlayLabels) {
            if (!record?.label?.isConnected || !wordRecordElement(record.word)?.isConnected) {
                record?.label?.remove();
                continue;
            }

            if (positionOverlayLabel(record)) {
                nextLabelRecords.push(record);
            }
        }

        const nextOutlineRecords = [];
        for (const record of STATE.overlayOutlines) {
            if (!record?.outline?.isConnected || !wordRecordElement(record.word)?.isConnected) {
                record?.outline?.remove();
                continue;
            }

            if (positionOverlayOutline(record)) {
                nextOutlineRecords.push(record);
            }
        }

        STATE.overlayLabels = nextLabelRecords;
        STATE.overlayOutlines = nextOutlineRecords;
        logKeybrOverlayState("after-reposition");
    }

    function scheduleOverlayReposition() {
        if (adapterRenderMode() !== "overlay") {
            return;
        }

        if (!STATE.overlayRoot?.childElementCount || !STATE.overlayLabels.length) {
            return;
        }

        if (STATE.overlayRepositionFrame != null) {
            return;
        }

        STATE.overlayRepositionFrame = window.requestAnimationFrame(() => {
            STATE.overlayRepositionFrame = null;
            refreshOverlayPositions();
        });
    }

    function refreshOverlayTrackingObservers() {
        STATE.overlayResizeObserver?.disconnect();
        STATE.overlayResizeObserver = null;

        if (adapterRenderMode() !== "overlay") {
            return;
        }

        const adapter = currentSiteAdapter();
        const promptContainer = getPromptContainer();
        const overlayParent = adapter?.getOverlayRootParent?.() || null;
        const targets = [promptContainer, overlayParent].filter((target, index, all) => (
            target instanceof HTMLElement && all.indexOf(target) === index
        ));

        if (!targets.length || typeof ResizeObserver !== "function") {
            return;
        }

        STATE.overlayResizeObserver = new ResizeObserver(() => {
            scheduleOverlayReposition();
        });

        targets.forEach((target) => STATE.overlayResizeObserver.observe(target));
    }

    function is_left_variant(token_key) {
        return token_key.startsWith("left_") || token_key.endsWith("_left");
    }

    function is_right_variant(token_key) {
        return token_key.startsWith("right_") || token_key.endsWith("_right");
    }

    function specialTooltip(token) {
        const description = STATE.settings.specialTokenDescriptions?.[token.key] || "";
        if (STATE.settings.showExtendedSpecialDescriptions && description.trim()) {
            return `${token.label} — ${description.trim()}`;
        }
        return token.label;
    }

    function renderToken(token) {
        if (token.type === "char") {
            const el = document.createElement("span");
            el.className = "cch-token-char";
            el.textContent = token.char;
            return el;
        }

        if (token.type === "special") {
            const tooltip = specialTooltip(token);
            const el = document.createElement("span");
            el.className = `cch-token-special cch-token-${token.key}`;
            el.title = tooltip;
            el.setAttribute("aria-label", tooltip);

            const icon_url = chrome.runtime.getURL(
                CCHShared.ICON_FILE_MAP[token.key] || "icons/broken_image.svg"
            );
            el.style.setProperty("--cch-icon-url", `url("${icon_url}")`);

            if (is_left_variant(token.key)) el.classList.add("cch-token-hand-left");
            if (is_right_variant(token.key)) el.classList.add("cch-token-hand-right");

            const main = document.createElement("span");
            main.className = "cch-token-icon cch-token-icon-main";
            el.appendChild(main);

            if (is_left_variant(token.key) || is_right_variant(token.key)) {
                const ghost = document.createElement("span");
                ghost.className = "cch-token-icon cch-token-icon-ghost";
                ghost.setAttribute("aria-hidden", "true");
                el.appendChild(ghost);
            }

            return el;
        }

        const el = document.createElement("span");
        el.className = "cch-token-unknown";
        el.textContent = `(${token.label})`;
        el.title = token.label;
        return el;
    }

    function renderSegmentSeparator() {
        const el = renderToken(CCHShared.makePseudoSpecialToken("compound_marker", "compound chord separator"));
        el.classList.add("cch-token-separator");
        el.setAttribute("aria-hidden", "true");
        return el;
    }

    function displayTokensForSegment(segment, outputText) {
        const tokens = Array.isArray(segment?.inputTokens) ? segment.inputTokens : [];
        if (STATE.settings.hintCharacterOrderMode !== "best-match") {
            return tokens;
        }
        return CCHShared.reorderSegmentTokensForBestMatch(tokens, outputText);
    }

    function renderHintRows(entries, outputText) {
        const fragment = document.createDocumentFragment();

        for (const entry of entries) {
            const row = document.createElement("span");
            row.className = "cch-hint-row";

            const segments = CCHShared.entryInputSegments(entry);
            segments.forEach((segment, segmentIndex) => {
                if (segmentIndex > 0) {
                    row.appendChild(renderSegmentSeparator());
                }

                for (const token of displayTokensForSegment(segment, outputText)) {
                    row.appendChild(renderToken(token));
                }
            });

            fragment.appendChild(row);
        }

        return fragment;
    }

    function hintLabelTemplateKey(entries, outputText) {
        return JSON.stringify({
            outputText: STATE.settings.hintCharacterOrderMode === "best-match"
                ? String(outputText || "")
                : "",
            entries: (Array.isArray(entries) ? entries : []).map((entry) => String(entry?.rawInput || ""))
        });
    }

    function evictOldestHintLabelTemplateIfNeeded() {
        if (STATE.hintLabelTemplateCache.size < HINT_LABEL_TEMPLATE_CACHE_LIMIT) {
            return;
        }

        const oldestKey = STATE.hintLabelTemplateCache.keys().next().value;
        if (typeof oldestKey === "undefined") {
            return;
        }

        STATE.hintLabelTemplateCache.delete(oldestKey);
    }

    function cloneHintRows(entries, outputText) {
        const cacheKey = hintLabelTemplateKey(entries, outputText);
        const cachedTemplate = STATE.hintLabelTemplateCache.get(cacheKey);
        if (cachedTemplate instanceof HTMLTemplateElement) {
            STATE.hintLabelTemplateCache.delete(cacheKey);
            STATE.hintLabelTemplateCache.set(cacheKey, cachedTemplate);
            return cachedTemplate.content.cloneNode(true);
        }

        const template = document.createElement("template");
        template.content.appendChild(renderHintRows(entries, outputText));
        evictOldestHintLabelTemplateIfNeeded();
        STATE.hintLabelTemplateCache.set(cacheKey, template);
        return template.content.cloneNode(true);
    }

    function hintTextForLogs(entries) {
        return entries.map((entry) => entry.rawInput).join(" | ");
    }

    function refreshLookupMetadata() {
        const normalizedOutputs = Object.keys(STATE.dictionary?.byNormalizedOutput || {});
        STATE.maxLookupWordCount = Math.max(
            1,
            ...normalizedOutputs.map((key) => String(key).split(/\s+/u).filter(Boolean).length)
        );
        STATE.exactWordLookup = buildExactWordLookup();
        if (typeof ChordingCoreAdapter !== "undefined") {
            ChordingCoreAdapter.sync(STATE.dictionary);
        }
        STATE.exactEntrySelectionCache = new Map();
    }

    function exactEntrySelectionCacheKey(normalized) {
        return JSON.stringify({
            normalized: String(normalized || ""),
            selectionMode: STATE.settings.selectionMode,
            includeArpeggiates: Boolean(STATE.settings.includeArpeggiates),
            includeModifierStyle: Boolean(STATE.settings.includeModifierStyle),
            enableNaiveModifierHints: Boolean(STATE.settings.enableNaiveModifierHints)
        });
    }

    function chooseEntriesForNormalizedOutput(normalized) {
        const key = exactEntrySelectionCacheKey(normalized);
        if (STATE.exactEntrySelectionCache.has(key)) {
            return STATE.exactEntrySelectionCache.get(key);
        }

        const refs = STATE.dictionary?.byNormalizedOutput?.[normalized];
        const chosen = refs?.length
            ? CCHShared.chooseEntries(STATE.dictionary, refs, STATE.settings)
            : null;
        STATE.exactEntrySelectionCache.set(key, chosen);
        return chosen;
    }

    function minimumWordLength() {
        return CCHShared.normalizeMinimumWordLength
            ? CCHShared.normalizeMinimumWordLength(STATE.settings.minimumWordLength)
            : Math.max(1, Math.floor(Number(STATE.settings.minimumWordLength)) || 3);
    }

    function phraseMeetsMinimumLength(rawText) {
        const requiredLength = minimumWordLength();
        const parts = String(rawText || "")
            .split(/\s+/u)
            .map((part) => CCHShared.normalizeTokenForLookup(part))
            .filter(Boolean);

        if (!parts.length) {
            return false;
        }

        return parts.every((part) => Array.from(part).length >= requiredLength);
    }

    function buildExactWordLookup() {
        // chording-core cleanup: substring matching lives entirely in
        // ChordingCoreAdapter; only the exact-word set remains (used by the
        // exact-word-exists guard in findSubstringMatchForWord).
        const dictionary = STATE.dictionary;
        if (!dictionary?.byNormalizedOutput) {
            return { exactSingleWordMatches: new Set() };
        }

        const exactSingleWordMatches = new Set();
        Object.entries(dictionary.byNormalizedOutput).forEach(([normalized]) => {
            const safeNormalized = String(normalized || "");
            if (!safeNormalized || /\s/u.test(safeNormalized)) {
                return;
            }
            exactSingleWordMatches.add(safeNormalized);
        });

        return { exactSingleWordMatches };
    }

    function findSubstringMatchForWord(rawText, normalizedWord) {
        if (!STATE.settings.enableSubstringHints) {
            return { matched: false, reason: "substring-disabled", word: rawText, normalized: normalizedWord };
        }

        if (!phraseMeetsMinimumLength(rawText)) {
            return { matched: false, reason: "below-minimum-length", word: rawText, normalized: normalizedWord };
        }

        const requiredLength = minimumWordLength();

        if (STATE.exactWordLookup?.exactSingleWordMatches?.has(normalizedWord)) {
            return { matched: false, reason: "exact-word-exists", word: rawText, normalized: normalizedWord };
        }

        // chording-core: substring matching is entirely delegated to the
        // adapter (exhaustive Aho-Corasick + cost-model resolution).
        if (typeof ChordingCoreAdapter !== "undefined") {
            const adapterResult = ChordingCoreAdapter.matchWord(rawText, normalizedWord, {
                minimumWordLength: requiredLength
            });
            if (adapterResult && adapterResult.matched) {
                return adapterResult;
            }
            return { matched: false, reason: "no-substring-match", word: rawText, normalized: normalizedWord };
        }

        return { matched: false, reason: "adapter-unavailable", word: rawText, normalized: normalizedWord };
    }

    function findMatchFromWords(words, startIndex) {
        if (!wordRecordHasLookupText(words[startIndex])) {
            const rawText = wordRecordText(words[startIndex]);
            return { matched: false, reason: "empty-normalized", word: rawText };
        }

        const maxWordCount = Math.min(
            STATE.maxLookupWordCount || 1,
            words.length - startIndex
        );
        const phraseTexts = [];
        const strictNormalizedTexts = [];
        let phrase = "";

        for (let wordCount = 1; wordCount <= maxWordCount; wordCount += 1) {
            const text = wordRecordText(words[startIndex + wordCount - 1]);
            phrase = phrase ? `${phrase} ${text}` : text;
            phraseTexts[wordCount] = phrase;
            strictNormalizedTexts[wordCount] = wordCount === 1
                ? wordRecordNormalizedText(words[startIndex])
                : CCHShared.normalizeTokenForLookup(phrase);
        }

        for (let wordCount = maxWordCount; wordCount >= 1; wordCount -= 1) {
            if (!wordRecordHasLookupText(words[startIndex + wordCount - 1])) {
                continue;
            }

            const rawText = phraseTexts[wordCount];
            const strictNormalized = strictNormalizedTexts[wordCount];

            if (!strictNormalized) {
                continue;
            }

            if (wordCount === 1 && !phraseMeetsMinimumLength(rawText)) {
                continue;
            }

            const exactLookupCandidates = exactLookupCandidatesForText(rawText, strictNormalized, wordCount === 1);
            for (const candidate of exactLookupCandidates) {
                const chosen = chooseEntriesForNormalizedOutput(candidate.lookupKey);
                if (!chosen) {
                    continue;
                }
                if (!chosen.length) {
                    return {
                        matched: false,
                        reason: "filtered-out",
                        word: rawText,
                        normalized: candidate.matchNormalized,
                        wordCount
                    };
                }

                return {
                    matched: true,
                    word: rawText,
                    normalized: candidate.matchNormalized,
                    labels: [{ entries: chosen, anchor: candidate.anchor }],
                    wordCount,
                    isSubstringMatch: false
                };
            }

            for (const candidate of exactLookupCandidates.flatMap((item) => naiveModifierExactCandidates(item))) {
                const chosen = chooseEntriesForNormalizedOutput(candidate.lookupKey);
                if (!chosen) {
                    continue;
                }
                if (!chosen.length) {
                    return {
                        matched: false,
                        reason: "filtered-out",
                        word: rawText,
                        normalized: strictNormalized,
                        wordCount
                    };
                }

                return {
                    matched: true,
                    word: rawText,
                    normalized: strictNormalized,
                    labels: [
                        { entries: chosen, anchor: candidate.anchor },
                        ...(Array.isArray(candidate.labels) ? candidate.labels : [])
                    ],
                    wordCount,
                    isSubstringMatch: false
                };
            }
        }

        const rawText = phraseTexts[1] || "";
        const normalized = wordRecordNormalizedText(words[startIndex]);

        if (!normalized) {
            return { matched: false, reason: "empty-normalized", word: rawText };
        }

        const substringResult = findSubstringMatchForWord(rawText, normalized);
        if (substringResult.matched) {
            return substringResult;
        }

        return { matched: false, reason: substringResult.reason || "no-dictionary-match", word: rawText, normalized };
    }

    function hintAlignmentClass() {
        return STATE.settings.hint_position === "center" ? "cch-align-center" : "cch-align-left";
    }

    function hintDisplayClass() {
        return STATE.settings.hint_display === "hover" ? "cch-hover-reveal" : "cch-show-always";
    }

    function toggleHintDisplay(label) {
        if (!(label instanceof HTMLElement)) return;

        if (label.classList.contains("cch-force-visible")) {
            label.classList.remove("cch-force-visible");
            label.classList.add("cch-force-hidden");
            return;
        }

        if (label.classList.contains("cch-force-hidden")) {
            label.classList.remove("cch-force-hidden");
            return;
        }

        if (STATE.settings.hint_display === "hover") {
            label.classList.add("cch-force-visible");
        } else {
            label.classList.add("cch-force-hidden");
        }
    }

    function installHintLabelClickDelegation() {
        if (STATE.hintLabelClickDelegationInstalled) {
            return;
        }

        document.addEventListener("click", (event) => {
            const target = event.target instanceof Element
                ? event.target.closest(".cch-hint-label")
                : null;
            if (!(target instanceof HTMLElement)) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            toggleHintDisplay(target);
        }, true);
        STATE.hintLabelClickDelegationInstalled = true;
    }

    async function persistSettingsFromHotkey(nextSettings) {
        const hydrated = hydrateSettings(nextSettings);
        STATE.settings = hydrated;
        applyAppearanceSettings();
        resetHintLabelTemplateCache("hotkey-settings-change");
        scheduleAnnotation(true);
        await setStorage({ [STORAGE_KEYS.settings]: hydrated });
    }

    function handleGlobalHotkeyKeydown(event) {
        if (event.repeat || !currentSiteAdapter()) {
            return;
        }

        let nextSettings = null;
        if (CCHShared.hotkeyMatchesEvent(event, STATE.settings.toggleHintsHotkey)) {
            nextSettings = {
                ...STATE.settings,
                enabled: !STATE.settings.enabled
            };
        } else if (CCHShared.hotkeyMatchesEvent(event, STATE.settings.toggleHintDisplayHotkey)) {
            nextSettings = {
                ...STATE.settings,
                hint_display: STATE.settings.hint_display === "hover" ? "always" : "hover"
            };
        }

        if (!nextSettings) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        void persistSettingsFromHotkey(nextSettings).catch((error) => {
            console.error("[CCH] hotkey toggle failed", error);
        });
    }

    function installGlobalHotkeys() {
        window.addEventListener("keydown", handleGlobalHotkeyKeydown, true);
    }

    function createHintLabel(entries, outputText) {
        const label = document.createElement("span");
        label.className = "cch-hint-label";
        label.classList.add(hintAlignmentClass());
        label.classList.add(hintDisplayClass());
        if (entries.length > 1) {
            label.classList.add("cch-multiple");
        }
        label.appendChild(cloneHintRows(entries, outputText));
        return label;
    }

    function ensureRelativePositionHost(wordEl) {
        if (!(wordEl instanceof HTMLElement)) {
            return;
        }

        wordEl.classList.add("cch-host");
        wordEl.dataset.cchAnnotated = "true";

        if (getComputedStyle(wordEl).position === "static") {
            wordEl.dataset.cchOriginalPosition = "static";
            wordEl.style.position = "relative";
        }
    }

    function matchLabels(match) {
        if (Array.isArray(match?.labels) && match.labels.length) {
            return match.labels;
        }
        if (Array.isArray(match?.entries) && match.entries.length) {
            return [{ entries: match.entries, anchor: null }];
        }
        return [];
    }

    function matchEntries(match) {
        return matchLabels(match).flatMap((label) => label.entries || []);
    }

    function mapNormalizedOffsetsToRawOffsets(rawText, normalizedText, start, end) {
        const safeRawText = String(rawText || "");
        const safeNormalizedText = String(normalizedText || "");
        if (!safeRawText || !safeNormalizedText) {
            return null;
        }

        const normalizedToRaw = [];
        let rawIndex = 0;

        for (let normalizedIndex = 0; normalizedIndex < safeNormalizedText.length; normalizedIndex += 1) {
            const target = safeNormalizedText[normalizedIndex];
            let found = false;

            while (rawIndex < safeRawText.length) {
                if (safeRawText[rawIndex].toLocaleLowerCase() === target) {
                    normalizedToRaw[normalizedIndex] = rawIndex;
                    rawIndex += 1;
                    found = true;
                    break;
                }
                rawIndex += 1;
            }

            if (!found) {
                return null;
            }
        }

        if (start < 0 || end > safeNormalizedText.length || start >= end) {
            return null;
        }

        return {
            start: normalizedToRaw[start],
            end: normalizedToRaw[end - 1] + 1
        };
    }

    function measurementCacheKey(match, labelMatch) {
        const anchor = labelMatch?.anchor;
        return JSON.stringify({
            normalized: String(match?.normalized || ""),
            wordCount: Number(match?.wordCount) || 0,
            anchorType: anchor?.type || "",
            anchorStart: anchor?.type === "substring" ? Number(anchor.start) || 0 : null,
            anchorEnd: anchor?.type === "substring" ? Number(anchor.end) || 0 : null
        });
    }

    function cachedMeasurement(word, match, labelMatch) {
        if (!(STATE.annotationMeasurementCache instanceof WeakMap) || !word || typeof word !== "object") {
            return null;
        }

        let bucket = STATE.annotationMeasurementCache.get(word);
        if (!bucket) {
            bucket = new Map();
            STATE.annotationMeasurementCache.set(word, bucket);
        }

        const key = measurementCacheKey(match, labelMatch);
        if (!bucket.has(key)) {
            bucket.set(key, undefined);
        }

        return {
            bucket,
            key,
            value: bucket.get(key)
        };
    }

    function normalizedViewportRect(rect) {
        if (!rect || (!(rect.width > 0) && !(rect.height > 0))) {
            return null;
        }

        return {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height
        };
    }

    function matchedOutputTextForLabel(match, labelMatch) {
        const rawText = String(match?.word || "");
        const normalizedText = String(match?.normalized || "");
        if (!rawText || !normalizedText) {
            return rawText;
        }

        const anchor = labelMatch?.anchor;
        const start = anchor?.type === "substring"
            ? Math.max(0, Math.min(normalizedText.length, Number(anchor.start) || 0))
            : 0;
        const end = anchor?.type === "substring"
            ? Math.max(start, Math.min(normalizedText.length, Number(anchor.end) || start))
            : normalizedText.length;
        const rawOffsets = mapNormalizedOffsetsToRawOffsets(rawText, normalizedText, start, end);

        if (rawOffsets && rawOffsets.end > rawOffsets.start) {
            return rawText.slice(rawOffsets.start, rawOffsets.end);
        }

        return anchor?.type === "substring"
            ? normalizedText.slice(start, end)
            : normalizedText;
    }

    function entertrainedLetterSegments(wordEl) {
        if (!(wordEl instanceof HTMLElement)) {
            return [];
        }

        const segments = [];
        let searchableOffset = 0;

        Array.from(wordEl.children).forEach((child) => {
            if (!(child instanceof HTMLElement) || !child.classList.contains("letter")) {
                return;
            }

            const text = String(child.textContent || "").replace(/\uE000/g, "");
            if (!text) {
                return;
            }

            segments.push({
                element: child,
                text,
                start: searchableOffset,
                end: searchableOffset + text.length
            });
            searchableOffset += text.length;
        });

        return segments;
    }

    function entertrainedMeasuredGeometry(word, match, labelMatch) {
        if (currentSiteAdapter()?.key !== "entertrained" || Number(match?.wordCount) !== 1) {
            return null;
        }

        const safeMatchNormalized = String(match?.normalized || "");
        if (!safeMatchNormalized) {
            return null;
        }

        const wordEl = wordRecordElement(word);
        if (!(wordEl instanceof HTMLElement)) {
            return null;
        }

        const safeWordText = String(wordRecordText(word) || "").replace(/\uE000/g, "");
        if (!safeWordText) {
            return null;
        }

        const anchor = labelMatch?.anchor;
        const rawOffsets = anchor?.type === "substring"
            ? mapNormalizedOffsetsToRawOffsets(
                wordRecordText(word),
                safeMatchNormalized,
                Number(anchor.start) || 0,
                Number(anchor.end) || 0
            )
            : mapNormalizedOffsetsToRawOffsets(
                wordRecordText(word),
                safeMatchNormalized,
                0,
                safeMatchNormalized.length
            );
        if (!rawOffsets) {
            return null;
        }

        const segments = entertrainedLetterSegments(wordEl);
        if (!segments.length) {
            return null;
        }

        const liveSearchText = segments.map((segment) => segment.text).join("");
        const liveOffsets = liveSearchText.toLocaleLowerCase() === safeWordText.toLocaleLowerCase()
            ? rawOffsets
            : mapOriginalOffsetsToLiveOffsets(
                safeWordText,
                liveSearchText,
                rawOffsets.start,
                rawOffsets.end
            );
        if (!liveOffsets) {
            return null;
        }

        const matchedSegments = segments
            .filter((segment) => segment.end > liveOffsets.start && segment.start < liveOffsets.end)
            .map((segment) => ({
                ...segment,
                rect: normalizedViewportRect(segment.element.getBoundingClientRect())
            }));
        const rawClientRects = matchedSegments
            .flatMap((segment) => Array.from(segment.element.getClientRects()))
            .map(normalizedViewportRect)
            .filter(Boolean);
        const rects = rawClientRects.length
            ? mergeAdjacentClientRects(rawClientRects)
            : [];
        if (!rects.length) {
            return null;
        }

        return {
            rects,
            rect: rects[0] || null,
            anchorRect: rects[0] || null,
            labelHost: matchedSegments[0]?.element || null,
            outlineHosts: rects.map((rect) => {
                const hostSegment = matchedSegments.find((segment) => {
                    if (!segment.rect) {
                        return false;
                    }

                    return (
                        segment.rect.bottom >= rect.top - 2 &&
                        segment.rect.top <= rect.bottom + 2 &&
                        segment.rect.right > rect.left - 2 &&
                        segment.rect.left < rect.right + 2
                    );
                });

                return hostSegment?.element || matchedSegments[0]?.element || null;
            })
        };
    }

    function entertrainedInlineLabelPlacement(word, match, labelMatch) {
        if (currentSiteAdapter()?.key !== "entertrained") {
            return null;
        }

        const geometry = measuredSubstringGeometry(word, match, labelMatch);
        const hostElement = geometry?.labelHost instanceof HTMLElement
            ? geometry.labelHost
            : null;
        const anchorRect = normalizedViewportRect(geometry?.anchorRect);
        if (!hostElement || !anchorRect) {
            return null;
        }

        const hostRect = normalizedViewportRect(hostElement.getBoundingClientRect());
        if (!hostRect || hostRect.width <= 0 || hostRect.height <= 0) {
            return null;
        }

        return {
            hostElement,
            left: STATE.settings.hint_position === "center"
                ? anchorRect.left + anchorRect.width / 2 - hostRect.left
                : 0
        };
    }

    function entertrainedInlineOutlinePlacement(record) {
        if (currentSiteAdapter()?.key !== "entertrained") {
            return null;
        }

        const geometry = measuredSubstringGeometry(record?.word, record?.match, record?.labelMatch);
        const hostElement = geometry?.outlineHosts?.[record?.rectIndex ?? 0];
        return hostElement instanceof HTMLElement ? hostElement : null;
    }

    function collectRenderableTextSegments(root) {
        if (!(root instanceof HTMLElement)) {
            return [];
        }

        const segments = [];
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                if (!(node instanceof Text) || !node.nodeValue) {
                    return NodeFilter.FILTER_REJECT;
                }
                return node.parentElement?.closest(".cch-hint-label")
                    ? NodeFilter.FILTER_REJECT
                    : NodeFilter.FILTER_ACCEPT;
            }
        });

        let searchableOffset = 0;
        let currentNode = walker.nextNode();
        while (currentNode) {
            const value = currentNode.nodeValue || "";
            const boundaries = [0];
            let searchableText = "";
            let searchableLength = 0;

            for (let index = 0; index < value.length; index += 1) {
                if (value[index] === "") {
                    continue;
                }
                searchableLength += 1;
                searchableText += value[index];
                boundaries[searchableLength] = index + 1;
            }

            if (searchableLength > 0) {
                segments.push({
                    node: currentNode,
                    start: searchableOffset,
                    end: searchableOffset + searchableLength,
                    boundaries,
                    text: searchableText
                });
                searchableOffset += searchableLength;
            }

            currentNode = walker.nextNode();
        }

        return segments;
    }

    function searchableTextFromSegments(segments) {
        return (Array.isArray(segments) ? segments : [])
            .map((segment) => String(segment?.text || ""))
            .join("");
    }

    function locateTextPosition(segments, offset) {
        if (!segments.length) {
            return null;
        }

        const safeOffset = Math.max(0, Number(offset) || 0);
        for (const segment of segments) {
            if (safeOffset <= segment.end) {
                const localOffset = Math.max(
                    0,
                    Math.min(segment.boundaries.length - 1, safeOffset - segment.start)
                );
                return {
                    node: segment.node,
                    offset: segment.boundaries[localOffset] ?? segment.node.nodeValue.length
                };
            }
        }

        const lastSegment = segments[segments.length - 1];
        return {
            node: lastSegment.node,
            offset: lastSegment.node.nodeValue.length
        };
    }

    function measuredSubstringRange(word, match, labelMatch) {
        const anchor = labelMatch?.anchor;
        const safeMatchNormalized = String(match?.normalized || "");
        if (!safeMatchNormalized) {
            return null;
        }

        const wordEl = wordRecordElement(word);
        if (!(wordEl instanceof HTMLElement)) {
            return null;
        }

        const rawOffsets = anchor?.type === "substring"
            ? mapNormalizedOffsetsToRawOffsets(
                wordRecordText(word),
                safeMatchNormalized,
                Number(anchor.start) || 0,
                Number(anchor.end) || 0
            )
            : (
                Number(match?.wordCount) === 1
                    ? mapNormalizedOffsetsToRawOffsets(
                        wordRecordText(word),
                        safeMatchNormalized,
                        0,
                        safeMatchNormalized.length
                    )
                    : null
            );
        if (!rawOffsets) {
            return null;
        }

        const segments = collectRenderableTextSegments(wordEl);
        if (!segments.length) {
            return null;
        }

        const liveSearchText = searchableTextFromSegments(segments);
        const safeWordText = String(wordRecordText(word) || "").replace(/\uE000/g, "");
        const liveOffsets = liveSearchText.toLocaleLowerCase() === safeWordText.toLocaleLowerCase()
            ? rawOffsets
            : mapOriginalOffsetsToLiveOffsets(safeWordText, liveSearchText, rawOffsets.start, rawOffsets.end);
        if (!liveOffsets) {
            return null;
        }

        const rangeStart = locateTextPosition(segments, liveOffsets.start);
        const rangeEnd = locateTextPosition(segments, liveOffsets.end);
        if (!rangeStart || !rangeEnd) {
            return null;
        }

        const range = document.createRange();
        range.setStart(rangeStart.node, rangeStart.offset);
        range.setEnd(rangeEnd.node, rangeEnd.offset);
        return range;
    }

    function measuredGeometryDecision(word, match, labelMatch) {
        if (labelMatch?.anchor?.type === "substring") {
            return {
                required: true,
                reason: "substringMeasured"
            };
        }

        if (Number(match?.wordCount) !== 1) {
            return {
                required: false,
                reason: "multiWordWordRectBypass"
            };
        }

        if (currentSiteAdapter()?.key === "entertrained" && wordRecordIsWrappedInline(word)) {
            return {
                required: true,
                reason: "wrappedWordMeasured"
            };
        }

        return {
            required: false,
            reason: "wholeWordWordRectBypass"
        };
    }

    function measuredSubstringGeometry(word, match, labelMatch) {
        const cached = cachedMeasurement(word, match, labelMatch);
        if (cached && cached.value !== undefined) {
            return cached.value;
        }

        const geometryDecision = measuredGeometryDecision(word, match, labelMatch);
        if (!geometryDecision.required) {
            if (cached) {
                cached.bucket.set(cached.key, null);
            }
            return null;
        }

        let geometry = entertrainedMeasuredGeometry(word, match, labelMatch);
        if (!geometry) {
            const range = measuredSubstringRange(word, match, labelMatch);
            if (!range) {
                if (cached) {
                    cached.bucket.set(cached.key, null);
                }
                return null;
            }

            const rawClientRects = Array.from(range.getClientRects())
                .map(normalizedViewportRect)
                .filter(Boolean);
            const rects = rawClientRects.length
                ? mergeAdjacentClientRects(rawClientRects)
                : [];
            const boundingRect = normalizedViewportRect(range.getBoundingClientRect());
            geometry = {
                rects,
                rect: boundingRect || rects[0] || null,
                anchorRect: boundingRect || rects[0] || null
            };
        }

        if (cached) {
            cached.bucket.set(cached.key, geometry);
        }

        return geometry;
    }

    function mapOriginalOffsetsToLiveOffsets(originalText, liveText, start, end) {
        const safeOriginalText = String(originalText || "");
        const safeLiveText = String(liveText || "");
        if (!safeOriginalText || !safeLiveText) {
            return null;
        }

        const originalToLive = [];
        let liveIndex = 0;

        for (let originalIndex = 0; originalIndex < safeOriginalText.length; originalIndex += 1) {
            const target = safeOriginalText[originalIndex].toLocaleLowerCase();
            let found = false;

            while (liveIndex < safeLiveText.length) {
                if (safeLiveText[liveIndex].toLocaleLowerCase() === target) {
                    originalToLive[originalIndex] = liveIndex;
                    liveIndex += 1;
                    found = true;
                    break;
                }
                liveIndex += 1;
            }

            if (!found) {
                return null;
            }
        }

        if (start < 0 || end > safeOriginalText.length || start >= end) {
            return null;
        }

        return {
            start: originalToLive[start],
            end: originalToLive[end - 1] + 1
        };
    }

    function measuredSubstringViewportRects(word, match, labelMatch) {
        return measuredSubstringGeometry(word, match, labelMatch)?.rects || [];
    }

    function mergeAdjacentClientRects(rects) {
        const rowTolerance = 3;
        const gapTolerance = 2;
        const normalizedRects = rects
            .map((rect) => ({
                left: rect.left,
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
                width: rect.width,
                height: rect.height
            }))
            .sort((left, right) => (
                Math.abs(left.top - right.top) <= rowTolerance
                    ? left.left - right.left
                    : left.top - right.top
            ));

        const filteredRects = normalizedRects.filter((rect, index, all) => (
            !all.some((other, otherIndex) => {
                if (index === otherIndex) return false;
                return (
                    rect.left >= other.left - gapTolerance &&
                    rect.right <= other.right + gapTolerance &&
                    rect.top >= other.top - rowTolerance &&
                    rect.bottom <= other.bottom + rowTolerance &&
                    (
                        other.width > rect.width + gapTolerance ||
                        other.height > rect.height + rowTolerance
                    )
                );
            })
        ));

        const rows = [];
        filteredRects.forEach((rect) => {
            const row = rows.find((candidate) => (
                rect.top <= candidate.bottom + rowTolerance &&
                rect.bottom >= candidate.top - rowTolerance
            ));

            if (!row) {
                rows.push({
                    top: rect.top,
                    bottom: rect.bottom,
                    rects: [rect]
                });
                return;
            }

            row.top = Math.min(row.top, rect.top);
            row.bottom = Math.max(row.bottom, rect.bottom);

            const previous = row.rects[row.rects.length - 1];
            if (previous && rect.left <= previous.right + gapTolerance) {
                previous.right = Math.max(previous.right, rect.right);
                previous.top = Math.min(previous.top, rect.top);
                previous.bottom = Math.max(previous.bottom, rect.bottom);
                previous.width = previous.right - previous.left;
                previous.height = previous.bottom - previous.top;
                return;
            }

            row.rects.push(rect);
        });

        return rows
            .sort((left, right) => left.top - right.top)
            .flatMap((row) => row.rects);
    }

    function measuredSubstringViewportRect(word, match, labelMatch) {
        const geometry = measuredSubstringGeometry(word, match, labelMatch);
        return geometry?.anchorRect || geometry?.rect || null;
    }

    function proportionalHintAnchorOffset(labelMatch, wordRect) {
        const anchor = labelMatch?.anchor;
        if (!anchor || anchor.type !== "substring") {
            return {
                left: 0,
                width: wordRect.width,
                center: wordRect.width / 2
            };
        }

        const safeWordLength = Math.max(1, Number(anchor.wordLength) || 1);
        const safeStart = Math.max(0, Math.min(safeWordLength, Number(anchor.start) || 0));
        const safeEnd = Math.max(safeStart, Math.min(safeWordLength, Number(anchor.end) || safeStart));
        const left = (safeStart / safeWordLength) * wordRect.width;
        const right = (safeEnd / safeWordLength) * wordRect.width;
        return {
            left,
            width: Math.max(0, right - left),
            center: left + Math.max(0, right - left) / 2
        };
    }

    function hintAnchorOffset(word, match, labelMatch, wordRect) {
        const measuredRect = measuredSubstringViewportRect(word, match, labelMatch);
        if (measuredRect && measuredRect.width > 0) {
            const left = measuredRect.left - wordRect.left;
            return {
                left,
                width: measuredRect.width,
                center: left + measuredRect.width / 2
            };
        }

        return proportionalHintAnchorOffset(labelMatch, wordRect);
    }

    function summarizeMatch(words, startIndex, match) {
        const entries = matchEntries(match);
        const labels = matchLabels(match);
        return {
            matched: true,
            word: match.word,
            normalized: match.normalized,
            hint: hintTextForLogs(entries),
            matchCount: entries.length,
            labelCount: labels.length,
            wordCount: match.wordCount,
            substringMatch: Boolean(match.isSubstringMatch),
            active: words
                .slice(startIndex, startIndex + match.wordCount)
                .some((word) => wordRecordHasClass(word, "active"))
        };
    }

    function outlineViewportRectsForLabel(word, match, labelMatch) {
        const wordRect = wordRecordRect(word, hasActiveAnnotationMeasurementCache());
        if (!wordRect || wordRect.width <= 0 || wordRect.height <= 0) {
            return [];
        }

        if (labelMatch?.anchor?.type === "substring" || Number(match?.wordCount) === 1) {
            // chording-core fix: outline the anchor as ONE bounding rect.
            // getClientRects() splits on style runs (untyped/typed chars),
            // which made the dashed box split into segments.
            const geometry = measuredSubstringGeometry(word, match, labelMatch);
            if (geometry?.rect) {
                return [geometry.rect];
            }
            const measuredRects = measuredSubstringViewportRects(word, match, labelMatch);
            if (measuredRects.length) {
                return measuredRects;
            }

            if (labelMatch?.anchor?.type !== "substring") {
                return [wordRect];
            }

            const anchor = proportionalHintAnchorOffset(labelMatch, wordRect);
            if (anchor.width <= 0) {
                return [];
            }

            return [{
                left: wordRect.left + anchor.left,
                top: wordRect.top,
                width: anchor.width,
                height: wordRect.height
            }];
        }

        return [wordRect];
    }

    function outlineRecordsForMatch(words, startIndex, match, labelMatch) {
        if (match.wordCount > 1 && labelMatch?.anchor?.type !== "substring") {
            return words
                .slice(startIndex, startIndex + match.wordCount)
                .map((word) => ({
                    word,
                    match: null,
                    labelMatch: null,
                    rectIndex: 0
                }));
        }

        return outlineViewportRectsForLabel(words[startIndex], match, labelMatch)
            .map((_, rectIndex) => ({
                word: words[startIndex],
                match,
                labelMatch,
                rectIndex
            }));
    }

    function outlineViewportRectForRecord(record) {
        if (!record?.word) {
            return null;
        }

        const rects = outlineViewportRectsForLabel(record.word, record.match, record.labelMatch);
        return rects[record.rectIndex ?? 0] || null;
    }

    function appendInlineOutlines(words, startIndex, match, labelMatch) {
        if (!STATE.settings.showChordableWordOutlines) {
            return;
        }

        outlineRecordsForMatch(words, startIndex, match, labelMatch).forEach((record) => {
            const rect = outlineViewportRectForRecord(record);
            const hostEl = entertrainedInlineOutlinePlacement(record) || wordRecordElement(record.word);
            const hostRect = hostEl instanceof HTMLElement
                ? hostEl.getBoundingClientRect()
                : wordRecordRect(record.word, hasActiveAnnotationMeasurementCache());
            if (
                !(hostEl instanceof HTMLElement) ||
                !hostRect ||
                !rect ||
                rect.width <= 0 ||
                rect.height <= 0
            ) {
                return;
            }

            ensureRelativePositionHost(hostEl);
            const outline = createOutlineElement();
            if (!positionInlineOutline(outline, hostRect, rect)) {
                return;
            }
            hostEl.appendChild(outline);
        });
    }

    function appendOverlayOutlines(root, words, startIndex, match, labelMatch) {
        if (!STATE.settings.showChordableWordOutlines || !(root instanceof HTMLElement)) {
            return;
        }

        outlineRecordsForMatch(words, startIndex, match, labelMatch).forEach((record) => {
            const outline = createOutlineElement();
            const nextRecord = {
                ...record,
                outline
            };

            root.appendChild(outline);
            if (!positionOverlayOutline(nextRecord)) {
                outline.remove();
                return;
            }

            STATE.overlayOutlines.push(nextRecord);
        });
    }

    function appendOverlayLabel(root, word, match, labelMatch, overlayPosition = null) {
        if (!(root instanceof HTMLElement)) {
            return;
        }

        const label = createHintLabel(
            labelMatch.entries,
            matchedOutputTextForLabel(match, labelMatch)
        );
        const adapter = currentSiteAdapter();
        if (adapter?.key === "keybr" && adapter.keybrHintLayout?.() === "extra-spacing") {
            label.classList.add("cch-keybr-overlay-extra-spacing");
        }

        const record = {
            label,
            word,
            match,
            labelMatch
        };

        root.appendChild(label);
        if (!positionOverlayLabel(record, overlayPosition)) {
            label.remove();
            return;
        }

        STATE.overlayLabels.push(record);
    }

    function annotateInlineMatch(words, startIndex, match, includeDebugSummary = false) {
        const wordEl = wordRecordElement(words[startIndex]);
        if (!(wordEl instanceof HTMLElement)) {
            return includeDebugSummary ? summarizeMatch(words, startIndex, match) : null;
        }

        let inlineRect = null;
        let preparedInlineHost = false;

        function ensureInlineHost() {
            if (preparedInlineHost) {
                return inlineRect;
            }

            const rect = wordRecordRect(words[startIndex]);
            if (!rect || rect.width <= 0 || rect.height <= 0) {
                return null;
            }

            ensureRelativePositionHost(wordEl);
            wordEl.classList.add("cch-host");
            wordEl.dataset.cchAnnotated = "true";
            inlineRect = rect;
            preparedInlineHost = true;
            return inlineRect;
        }

        matchLabels(match).forEach((labelMatch) => {
            appendInlineOutlines(words, startIndex, match, labelMatch);

            const entertrainedPlacement = entertrainedInlineLabelPlacement(
                words[startIndex],
                match,
                labelMatch
            );
            const label = createHintLabel(
                labelMatch.entries,
                matchedOutputTextForLabel(match, labelMatch)
            );
            if (entertrainedPlacement) {
                ensureRelativePositionHost(entertrainedPlacement.hostElement);
                label.style.left = STATE.settings.hint_position === "center"
                    ? `${entertrainedPlacement.left}px`
                    : "0px";
                label.style.top = "0";
                entertrainedPlacement.hostElement.prepend(label);
                return;
            }

            const rect = ensureInlineHost();
            if (!rect) {
                return;
            }

            const anchor = hintAnchorOffset(words[startIndex], match, labelMatch, rect);
            label.style.left = STATE.settings.hint_position === "center"
                ? `${anchor.center}px`
                : `${anchor.left}px`;
            label.style.top = "0";
            wordEl.prepend(label);
        });

        if (!includeDebugSummary) {
            return null;
        }

        return summarizeMatch(words, startIndex, match);
    }

    function annotateOverlayMatch(words, startIndex, match, includeDebugSummary = false) {
        const root = getOverlayRoot();
        if (!root) return includeDebugSummary ? summarizeMatch(words, startIndex, match) : null;

        const rect = wordRecordRect(words[startIndex]);
        if (!rect || rect.width <= 0 || rect.height <= 0) {
            return includeDebugSummary ? summarizeMatch(words, startIndex, match) : null;
        }

        const overlayPosition = overlayPositionFromViewportRect(root, rect);
        matchLabels(match).forEach((labelMatch) => {
            appendOverlayOutlines(root, words, startIndex, match, labelMatch);
            appendOverlayLabel(root, words[startIndex], match, labelMatch, overlayPosition);
        });

        if (!includeDebugSummary) {
            return null;
        }

        return summarizeMatch(words, startIndex, match);
    }

    function annotateMatch(words, startIndex, match, renderMode, includeDebugSummary = false) {
        if (renderMode === "overlay") {
            return annotateOverlayMatch(words, startIndex, match, includeDebugSummary);
        }

        return annotateInlineMatch(words, startIndex, match, includeDebugSummary);
    }

    function allWordIndexes(words) {
        return (Array.isArray(words) ? words : []).map((_, index) => index);
    }

    function buildParagraphWordBatch(entry, deferOffscreenWords) {
        const words = Array.isArray(entry?.words) ? entry.words : [];
        const allIndexes = allWordIndexes(words);
        if (!deferOffscreenWords) {
            return {
                ...entry,
                immediateWordIndexes: allIndexes,
                deferredWordIndexes: [],
                wordRectProbeCount: 0
            };
        }

        const paragraphInViewport = typeof entry?.paragraphInViewport === "boolean"
            ? entry.paragraphInViewport
            : rectIntersectsViewport(entry?.paragraphRect || {});
        if (!paragraphInViewport) {
            return {
                ...entry,
                immediateWordIndexes: [],
                deferredWordIndexes: allIndexes,
                wordRectProbeCount: 0
            };
        }

        const immediateWordIndexes = [];
        const deferredWordIndexes = [];
        let wordRectProbeCount = 0;

        words.forEach((word, wordIndex) => {
            wordRectProbeCount += 1;
            const rect = wordRecordRect(word);
            if (rect && rectIntersectsViewport(rect)) {
                immediateWordIndexes.push(wordIndex);
                return;
            }

            deferredWordIndexes.push(wordIndex);
        });

        return {
            ...entry,
            immediateWordIndexes,
            deferredWordIndexes,
            wordRectProbeCount
        };
    }

    function ensureParagraphMatchPlan(entry, includeDebugSummary = false) {
        if (Array.isArray(entry?.matchPlans)) {
            return entry;
        }

        const words = Array.isArray(entry?.words) ? entry.words : [];
        const misses = includeDebugSummary ? [] : null;
        const matchPlans = [];
        let matchedCount = 0;
        let unmatchedCount = 0;
        const planningStartedAt = typeof performance?.now === "function" ? performance.now() : Date.now();

        for (let wordIndex = 0; wordIndex < words.length; wordIndex += 1) {
            const result = findMatchFromWords(words, wordIndex);
            if (result.matched) {
                matchedCount += 1;
                matchPlans.push({ wordIndex, result });
                wordIndex += result.wordCount - 1;
            } else {
                unmatchedCount += 1;
                if (includeDebugSummary) {
                    misses.push({
                        ...result,
                        wordIndex
                    });
                }
            }
        }

        entry.matchPlans = matchPlans;
        entry.matchedCount = matchedCount;
        entry.unmatchedCount = unmatchedCount;
        entry.misses = misses;
        entry.planningElapsedMs = elapsedDebugMs(planningStartedAt);
        return entry;
    }

    function renderPlannedParagraph(entry, renderMode, renderWordIndexes = null, includeDebugSummary = false) {
        const paragraph = entry?.paragraph;
        const paragraphIndex = entry?.index ?? -1;
        const words = Array.isArray(entry?.words) ? entry.words : [];
        const selectedWordIndexes = Array.isArray(renderWordIndexes)
            ? renderWordIndexes
            : allWordIndexes(words);
        const selectedIndexSet = new Set(selectedWordIndexes);
        const shouldPremeasureInlineGeometry =
            renderMode === "inline" &&
            adapterFlag("premeasureInlineGeometry");
        const selectedPlans = (Array.isArray(entry?.matchPlans) ? entry.matchPlans : [])
            .filter((plan) => selectedIndexSet.has(plan.wordIndex));
        const matches = includeDebugSummary ? [] : null;
        const selectedMisses = includeDebugSummary
            ? (Array.isArray(entry?.misses) ? entry.misses : []).filter((miss) => selectedIndexSet.has(miss.wordIndex))
            : null;
        const renderStartedAt = typeof performance?.now === "function" ? performance.now() : Date.now();

        if (shouldPremeasureInlineGeometry) {
            selectedPlans.forEach((plan) => {
                const word = words[plan.wordIndex];
                wordRecordRect(word);
                matchLabels(plan.result).forEach((labelMatch) => {
                    measuredSubstringGeometry(word, plan.result, labelMatch);
                });
            });
        }

        selectedPlans.forEach((plan) => {
            const matchSummary = annotateMatch(
                words,
                plan.wordIndex,
                plan.result,
                renderMode,
                includeDebugSummary
            );
            if (includeDebugSummary) {
                matches.push(matchSummary);
            }
        });

        const renderedWordSummary = indexRangeSummary(selectedWordIndexes);
        const summary = {
            site: currentSiteAdapter()?.key || "unknown",
            paragraphIndex,
            wordCount: words.length,
            matchedCount: entry?.matchedCount || 0,
            unmatchedCount: entry?.unmatchedCount || 0,
            renderedWordCount: renderedWordSummary.count,
            renderedWordRanges: renderedWordSummary.ranges,
            renderedWordRangesTruncated: renderedWordSummary.truncated,
            renderedMatchCount: selectedPlans.length,
            planningElapsedMs: entry?.planningElapsedMs ?? null,
            renderElapsedMs: elapsedDebugMs(renderStartedAt)
        };

        if (includeDebugSummary && paragraph instanceof HTMLElement) {
            summary.activeWordCount = words.filter((word) => wordRecordHasClass(word, "active")).length;
            summary.currentLetterCount = paragraph.querySelectorAll(".letter.current").length;
            summary.wordSample = selectedWordIndexes
                .slice(0, 12)
                .map((wordIndex) => wordRecordText(words[wordIndex]));
            summary.matchSample = matches.slice(0, 8).map((m) => ({
                word: m.word,
                hint: m.hint,
                active: m.active,
                matchCount: m.matchCount,
                wordCount: m.wordCount
            }));
            summary.missSample = selectedMisses.slice(0, 8).map((m) => ({
                wordIndex: m.wordIndex,
                word: m.word,
                normalized: m.normalized || "",
                reason: m.reason
            }));

            log("Paragraph annotation summary", summary);
        }

        return summary;
    }

    function scheduleAnnotationWorkChunk(callback, delayMs = 0) {
        cancelScheduledAnnotationWork();
        STATE.annotationWorkTimer = window.setTimeout(() => {
            STATE.annotationWorkTimer = null;
            callback();
        }, delayMs);
    }

    function isAnnotationPassStale(passToken, promptSignature) {
        return (
            STATE.annotationPassToken !== passToken ||
            STATE.lastPromptSignature !== promptSignature
        );
    }

    function uniqueSortedWordIndexes(indexes) {
        return Array.from(new Set(Array.isArray(indexes) ? indexes : []))
            .map((value) => Number(value))
            .filter((value) => Number.isInteger(value) && value >= 0)
            .sort((a, b) => a - b);
    }

    function defaultAnnotationChunkPolicy() {
        return {
            stage: "default",
            budgetMs: ANNOTATION_CHUNK_INITIAL_IMMEDIATE_BUDGET_MS,
            maxStarts: ANNOTATION_CHUNK_INITIAL_IMMEDIATE_MAX_STARTS
        };
    }

    function annotationChunkPolicyForQueue(queueState) {
        if (queueState?.phaseName === "deferred") {
            return {
                stage: "deferred-fill",
                budgetMs: ANNOTATION_CHUNK_DEFERRED_BUDGET_MS,
                maxStarts: ANNOTATION_CHUNK_DEFERRED_MAX_STARTS
            };
        }

        if ((queueState?.processedChunkCount || 0) < ANNOTATION_CHUNK_INITIAL_IMMEDIATE_COUNT) {
            return {
                stage: "first-paint",
                budgetMs: ANNOTATION_CHUNK_INITIAL_IMMEDIATE_BUDGET_MS,
                maxStarts: ANNOTATION_CHUNK_INITIAL_IMMEDIATE_MAX_STARTS
            };
        }

        return {
            stage: "immediate-fill",
            budgetMs: ANNOTATION_CHUNK_STEADY_IMMEDIATE_BUDGET_MS,
            maxStarts: ANNOTATION_CHUNK_STEADY_IMMEDIATE_MAX_STARTS
        };
    }

    function ensureChunkedParagraphPlanState(entry) {
        if (entry?.chunkedPlanState) {
            return entry.chunkedPlanState;
        }

        const chunkedPlanState = {
            nextWordIndex: 0,
            plannedThroughWordIndex: -1,
            complete: false,
            matchPlanMap: new Map()
        };
        entry.chunkedPlanState = chunkedPlanState;
        return chunkedPlanState;
    }

    function planChunkedParagraphTo(entry, targetWordIndex, budgetMs = ANNOTATION_CHUNK_INITIAL_IMMEDIATE_BUDGET_MS, maxStarts = ANNOTATION_CHUNK_INITIAL_IMMEDIATE_MAX_STARTS) {
        const words = Array.isArray(entry?.words) ? entry.words : [];
        const chunkedPlanState = ensureChunkedParagraphPlanState(entry);
        const numericTargetWordIndex = Number(targetWordIndex);
        const safeTargetWordIndex = words.length
            ? Math.min(
                Math.max(Number.isFinite(numericTargetWordIndex) ? numericTargetWordIndex : -1, -1),
                words.length - 1
            )
            : -1;

        if (
            safeTargetWordIndex < 0 ||
            chunkedPlanState.complete ||
            chunkedPlanState.plannedThroughWordIndex >= safeTargetWordIndex
        ) {
            return;
        }

        const planningStartedAt = nowMs();
        let plannedStartCount = 0;

        while (
            chunkedPlanState.nextWordIndex < words.length &&
            chunkedPlanState.nextWordIndex <= safeTargetWordIndex
        ) {
            const wordIndex = chunkedPlanState.nextWordIndex;
            const result = findMatchFromWords(words, wordIndex);

            if (result.matched) {
                chunkedPlanState.matchPlanMap.set(wordIndex, result);
                chunkedPlanState.nextWordIndex = wordIndex + result.wordCount;
            } else {
                chunkedPlanState.nextWordIndex = wordIndex + 1;
            }

            chunkedPlanState.plannedThroughWordIndex = chunkedPlanState.nextWordIndex - 1;
            plannedStartCount += 1;

            if (plannedStartCount >= maxStarts || (nowMs() - planningStartedAt) >= budgetMs) {
                break;
            }
        }

        chunkedPlanState.complete = chunkedPlanState.nextWordIndex >= words.length;

        void plannedStartCount;
    }

    function premeasureInlineMatchGeometry(words, startIndex, match, renderMode) {
        if (!(renderMode === "inline" && adapterFlag("premeasureInlineGeometry"))) {
            return;
        }

        const word = words[startIndex];
        const labelsNeedingMeasurement = matchLabels(match).filter((labelMatch) =>
            measuredGeometryDecision(word, match, labelMatch).required
        );

        if (!labelsNeedingMeasurement.length) {
            return;
        }

        wordRecordRect(word);
        labelsNeedingMeasurement.forEach((labelMatch) => {
            measuredSubstringGeometry(word, match, labelMatch);
        });
    }

    function createChunkedParagraphPhase(entry, wordIndexes) {
        const selectedWordIndexes = uniqueSortedWordIndexes(wordIndexes);
        return {
            entry,
            wordIndexes: selectedWordIndexes,
            cursor: 0
        };
    }

    function processChunkedParagraphPhase(phase, renderMode, chunkPolicy = defaultAnnotationChunkPolicy(), includeDebugSummary = false) {
        const entry = phase?.entry;
        const words = Array.isArray(entry?.words) ? entry.words : [];
        const chunkedPlanState = ensureChunkedParagraphPlanState(entry);
        const chunkStartedAt = nowMs();
        const chunkBudgetMs = Math.max(1, Number(chunkPolicy?.budgetMs) || defaultAnnotationChunkPolicy().budgetMs);
        const chunkMaxStarts = Math.max(1, Number(chunkPolicy?.maxStarts) || defaultAnnotationChunkPolicy().maxStarts);
        let processedWordCount = 0;

        while (phase.cursor < phase.wordIndexes.length) {
            const wordIndex = phase.wordIndexes[phase.cursor];
            const remainingBudgetMs = Math.max(1, chunkBudgetMs - (nowMs() - chunkStartedAt));

            if (!chunkedPlanState.complete && chunkedPlanState.plannedThroughWordIndex < wordIndex) {
                planChunkedParagraphTo(
                    entry,
                    wordIndex,
                    remainingBudgetMs,
                    chunkMaxStarts
                );

                if (!chunkedPlanState.complete && chunkedPlanState.plannedThroughWordIndex < wordIndex) {
                    break;
                }
            }

            const plan = chunkedPlanState.matchPlanMap.get(wordIndex);
            if (plan) {
                premeasureInlineMatchGeometry(words, wordIndex, plan, renderMode);
                annotateMatch(
                    words,
                    wordIndex,
                    plan,
                    renderMode,
                    includeDebugSummary
                );
            }

            phase.cursor += 1;
            processedWordCount += 1;

            if (
                processedWordCount >= chunkMaxStarts ||
                (nowMs() - chunkStartedAt) >= chunkBudgetMs
            ) {
                break;
            }
        }

        return {
            done: phase.cursor >= phase.wordIndexes.length
        };
    }

    function processAnnotationChunkQueue(queueState) {
        if (isAnnotationPassStale(queueState.passToken, queueState.promptSignature)) {
            return;
        }

        const phase = queueState.phases.shift();
        if (!phase) {
            queueState.onComplete();
            return;
        }

        const chunkPolicy = annotationChunkPolicyForQueue(queueState);
        const chunkStats = processChunkedParagraphPhase(
            phase,
            queueState.renderMode,
            chunkPolicy,
            queueState.includeDebugSummary
        );
        queueState.processedChunkCount += 1;

        if (chunkStats.done) {
            // Phase complete; continue to the next queued phase.
        } else {
            queueState.phases.push(phase);
        }

        if (isAnnotationPassStale(queueState.passToken, queueState.promptSignature)) {
            return;
        }

        if (!queueState.phases.length) {
            queueState.onComplete();
            return;
        }

        scheduleAnnotationWorkChunk(() => processAnnotationChunkQueue(queueState), 0);
    }

    function startChunkedAnnotationBatches({
        passToken,
        renderMode,
        promptSignature,
        immediateEntries,
        deferredEntries,
        includeDebugSummary
    }) {
        const immediatePhases = immediateEntries
            .map((entry) => createChunkedParagraphPhase(entry, entry.immediateWordIndexes))
            .filter((phase) => phase.wordIndexes.length);
        const deferredPhases = deferredEntries
            .map((entry) => createChunkedParagraphPhase(entry, entry.deferredWordIndexes))
            .filter((phase) => phase.wordIndexes.length);

        function startDeferredQueue() {
            const connectedDeferredPhases = deferredPhases.filter((phase) => phase.entry?.paragraph?.isConnected);
            if (!connectedDeferredPhases.length) {
                STATE.annotationMeasurementCache = null;
                return;
            }

            scheduleAnnotationWorkChunk(() => processAnnotationChunkQueue({
                passToken,
                promptSignature,
                phaseName: "deferred",
                renderMode,
                includeDebugSummary,
                phases: connectedDeferredPhases,
                processedChunkCount: 0,
                onComplete() {
                    STATE.annotationMeasurementCache = null;
                }
            }), 0);
        }

        if (!immediatePhases.length) {
            startDeferredQueue();
            return;
        }

        processAnnotationChunkQueue({
            passToken,
            promptSignature,
            phaseName: "immediate",
            renderMode,
            includeDebugSummary,
            phases: immediatePhases,
            processedChunkCount: 0,
            onComplete() {
                startDeferredQueue();
            }
        });
    }

    function runAnnotationPass(force = false) {
        STATE.scheduled = false;
        STATE.scheduledForce = false;
        cancelScheduledAnnotationWork();
        const passToken = ++STATE.annotationPassToken;
        const passStartedAt = nowMs();
        STATE.annotationMeasurementCache = new WeakMap();

        if (!STATE.settings.enabled || !STATE.dictionary) {
            STATE.trackedParagraphs.forEach((paragraph) => clearAnnotationsWithin(paragraph, true));
            STATE.trackedParagraphs = [];
            removeOverlayAnnotations();
            log("Annotation skipped", {
                enabled: STATE.settings.enabled,
                hasDictionary: Boolean(STATE.dictionary),
            });
            STATE.annotationMeasurementCache = null;
            return;
        }

        const adapter = currentSiteAdapter();
        if (!adapter) {
            STATE.trackedParagraphs.forEach((paragraph) => clearAnnotationsWithin(paragraph, true));
            STATE.trackedParagraphs = [];
            STATE.lastPromptSignature = "";
            removeOverlayAnnotations();
            log("No active site adapter for current page", {
                hostname: location.hostname,
                pathname: location.pathname
            });
            STATE.annotationMeasurementCache = null;
            return;
        }

        const renderMode = adapterRenderMode(adapter);
        const shouldDeferOffscreenParagraphs =
            renderMode === "inline" &&
            adapterFlag("deferOffscreenParagraphs");
        const paragraphs = getParagraphBoxes();
        STATE.trackedParagraphs = paragraphs;
        if (renderMode === "overlay") {
            clearOverlayAnnotations();
            syncOverlayTypography(getOverlayRoot());
            refreshOverlayTrackingObservers();
        } else {
            removeOverlayAnnotations();
        }

        const shouldCacheWordRects = renderMode === "overlay" || adapterFlag("cacheInlineWordRects");
        const paragraphEntries = paragraphs.map((paragraph, index) => {
            const paragraphRect = normalizedViewportRect(paragraph.getBoundingClientRect());
            return {
                paragraph,
                index,
                paragraphRect,
                paragraphInViewport: paragraphRect ? rectIntersectsViewport(paragraphRect) : false
            };
        });
        const wordLists = paragraphEntries.map((entry) => getWordElements(entry.paragraph));
        const wordRecordLists = paragraphEntries.map((entry, index) => {
            const includeRects = shouldCacheWordRects && (!shouldDeferOffscreenParagraphs || entry.paragraphInViewport);
            return createWordRecords(wordLists[index], includeRects);
        });
        const populatedParagraphEntries = paragraphEntries.map((entry, index) => ({
            ...entry,
            words: wordRecordLists[index],
            cachedWordRectCount: shouldCacheWordRects && (!shouldDeferOffscreenParagraphs || entry.paragraphInViewport)
                ? wordRecordLists[index].length
                : 0
        }));
        const nextPromptSignature = adapter.buildPromptSignature(paragraphs, wordRecordLists);

        if (adapter.key === "keybr") {
            paragraphs.forEach((paragraph, index) => {
                logKeybrPromptState(`annotation-pass paragraph ${index}`, paragraph, wordRecordLists[index]);
            });
        }

        if (STATE.settings.debugLogging) {
            log("Paragraph discovery", {
                site: adapter.key,
                paragraphCount: paragraphs.length,
                paragraphSamples: populatedParagraphEntries.slice(0, 5).map((entry) => ({
                    paragraphIndex: entry.index,
                    className: entry.paragraph.className || "",
                    wordCount: entry.words?.length || 0,
                    paragraphInViewport: entry.paragraphInViewport,
                    cachedWordRectCount: entry.cachedWordRectCount || 0,
                    top: entry.paragraphRect ? Math.round(entry.paragraphRect.top) : null,
                    bottom: entry.paragraphRect ? Math.round(entry.paragraphRect.bottom) : null,
                    sampleText: annotationFreeTextContent(entry.paragraph).trim().slice(0, 160)
                }))
            });
        }

        if (!paragraphs.length) {
            STATE.lastPromptSignature = nextPromptSignature;
            STATE.trackedParagraphs = [];
            clearOverlayAnnotations();
            log("No prompt containers/paragraphs found for current adapter", { site: adapter.key });
            STATE.annotationMeasurementCache = null;
            return;
        }

        let paragraphBatches = populatedParagraphEntries.map((entry) =>
            buildParagraphWordBatch(entry, shouldDeferOffscreenParagraphs)
        );
        let immediateEntries = paragraphBatches.filter((entry) => entry.immediateWordIndexes.length);
        let deferredEntries = paragraphBatches.filter((entry) => entry.deferredWordIndexes.length);
        let promotedAllParagraphsToImmediate = false;

        if (shouldDeferOffscreenParagraphs) {
            if (!immediateEntries.length) {
                paragraphBatches = populatedParagraphEntries.map((entry) => ({
                    ...entry,
                    immediateWordIndexes: allWordIndexes(entry.words),
                    deferredWordIndexes: [],
                    wordRectProbeCount: entry.wordRectProbeCount || 0
                }));
                immediateEntries = paragraphBatches;
                deferredEntries = [];
                promotedAllParagraphsToImmediate = true;
            }
        }
        paragraphs.forEach((paragraph) => clearAnnotationsWithin(paragraph));
        STATE.lastPromptSignature = nextPromptSignature;

        const shouldChunkAnnotationBatches = shouldDeferOffscreenParagraphs;

        if (shouldChunkAnnotationBatches) {
            startChunkedAnnotationBatches({
                passToken,
                renderMode,
                promptSignature: nextPromptSignature,
                immediateEntries,
                deferredEntries,
                includeDebugSummary: STATE.settings.debugLogging
            });
            return;
        }

        log("Annotation batch plan", {
            site: adapter.key,
            passToken,
            forced: force,
            renderMode,
            paragraphCount: paragraphBatches.length,
            immediateParagraphCount: immediateEntries.length,
            deferredParagraphCount: deferredEntries.length,
            promotedAllParagraphsToImmediate,
            shouldDeferOffscreenParagraphs,
            elapsedMs: elapsedDebugMs(passStartedAt)
        });

        const immediatePlanningStartedAt = typeof performance?.now === "function" ? performance.now() : Date.now();
        immediateEntries.forEach((entry) => ensureParagraphMatchPlan(entry, STATE.settings.debugLogging));
        const immediatePlanningElapsedMs = elapsedDebugMs(immediatePlanningStartedAt);

        log("Immediate paragraph batch starting", {
            site: adapter.key,
            passToken,
            renderMode,
            batch: annotationBatchDebugSummary(immediateEntries, "immediateWordIndexes"),
            planningElapsedMs: immediatePlanningElapsedMs,
            plannedMatchCount: immediateEntries.reduce((sum, entry) => sum + (entry.matchPlans?.length || 0), 0),
            elapsedMs: elapsedDebugMs(passStartedAt)
        });

        const summaries = immediateEntries.map((entry) =>
            renderPlannedParagraph(
                entry,
                renderMode,
                entry.immediateWordIndexes,
                STATE.settings.debugLogging
            )
        );
        const totalWords = summaries.reduce((sum, item) => sum + item.wordCount, 0);
        const totalMatches = summaries.reduce((sum, item) => sum + item.matchedCount, 0);
        const renderedWordCount = summaries.reduce((sum, item) => sum + item.renderedWordCount, 0);
        const renderedMatchCount = summaries.reduce((sum, item) => sum + item.renderedMatchCount, 0);

        if (adapter.key === "keybr") {
            logKeybrOverlayState("after-annotation");
        }

        log("Annotation pass complete", {
            site: adapter.key,
            passToken,
            paragraphCount: immediateEntries.length,
            totalWords,
            totalMatches,
            renderedWordCount,
            renderedMatchCount,
            entryCount: STATE.dictionary.entryCount,
            forced: force,
            deferredParagraphCount: deferredEntries.length,
            elapsedMs: elapsedDebugMs(passStartedAt)
        });
        STATE.annotationMeasurementCache = null;

        if (deferredEntries.length) {
            STATE.annotationWorkTimer = window.setTimeout(() => {
                STATE.annotationWorkTimer = null;

                if (
                    STATE.annotationPassToken !== passToken ||
                    STATE.lastPromptSignature !== nextPromptSignature
                ) {
                    log("Deferred paragraph batch skipped", {
                        site: adapter.key,
                        passToken,
                        reason: "stale-pass-or-signature-changed",
                        elapsedMs: elapsedDebugMs(passStartedAt)
                    });
                    return;
                }

                const connectedDeferredEntries = deferredEntries.filter((entry) => entry.paragraph.isConnected);
                log("Deferred paragraph batch starting", {
                    site: adapter.key,
                    passToken,
                    renderMode,
                    plannedBatch: annotationBatchDebugSummary(deferredEntries, "deferredWordIndexes"),
                    connectedBatch: annotationBatchDebugSummary(connectedDeferredEntries, "deferredWordIndexes"),
                    elapsedMs: elapsedDebugMs(passStartedAt)
                });

                STATE.annotationMeasurementCache = new WeakMap();
                const deferredPlanningStartedAt = typeof performance?.now === "function" ? performance.now() : Date.now();
                connectedDeferredEntries.forEach((entry) => ensureParagraphMatchPlan(entry, STATE.settings.debugLogging));
                const deferredPlanningElapsedMs = elapsedDebugMs(deferredPlanningStartedAt);
                const deferredSummaries = connectedDeferredEntries.map((entry) =>
                    renderPlannedParagraph(
                        entry,
                        renderMode,
                        entry.deferredWordIndexes,
                        STATE.settings.debugLogging
                    )
                );
                STATE.annotationMeasurementCache = null;

                const deferredWordCount = deferredSummaries.reduce((sum, item) => sum + item.wordCount, 0);
                const deferredMatchCount = deferredSummaries.reduce((sum, item) => sum + item.matchedCount, 0);
                const deferredRenderedWordCount = deferredSummaries.reduce((sum, item) => sum + item.renderedWordCount, 0);
                const deferredRenderedMatchCount = deferredSummaries.reduce((sum, item) => sum + item.renderedMatchCount, 0);

                log("Deferred paragraph annotation complete", {
                    site: adapter.key,
                    passToken,
                    paragraphCount: deferredSummaries.length,
                    totalWords: deferredWordCount,
                    totalMatches: deferredMatchCount,
                    renderedWordCount: deferredRenderedWordCount,
                    renderedMatchCount: deferredRenderedMatchCount,
                    planningElapsedMs: deferredPlanningElapsedMs,
                    entryCount: STATE.dictionary.entryCount,
                    forced: force,
                    elapsedMs: elapsedDebugMs(passStartedAt)
                });
            }, 0);
        }
    }

    function scheduleAnnotation(force = false) {
        if (STATE.scheduled) {
            STATE.scheduledForce = STATE.scheduledForce || force;
            return;
        }

        STATE.scheduled = true;
        STATE.scheduledForce = force;

        window.requestAnimationFrame(() => {
            const delayMs = adapterDelayMs("annotationScheduleDelayMs", 40, STATE.scheduledForce);
            if (delayMs <= 0) {
                runAnnotationPass(STATE.scheduledForce);
                return;
            }

            window.setTimeout(() => runAnnotationPass(STATE.scheduledForce), delayMs);
        });
    }

    async function loadState() {
        const stored = await getStorage([
            STORAGE_KEYS.parsedDictionary,
            STORAGE_KEYS.inputDisplayOverrides,
            STORAGE_KEYS.settings
        ]);
        STATE.dictionary = CCHShared.applyInputDisplayOverrides(
            stored[STORAGE_KEYS.parsedDictionary],
            stored[STORAGE_KEYS.inputDisplayOverrides]
        );
        refreshLookupMetadata();
        STATE.settings = hydrateSettings(stored[STORAGE_KEYS.settings]);
        applyAppearanceSettings();
        resetHintLabelTemplateCache("load-state");

        log("Loaded state", {
            hasDictionary: Boolean(STATE.dictionary),
            entryCount: STATE.dictionary?.entryCount ?? 0,
            settings: STATE.settings
        });
    }

    function handlePotentialPromptChange(reason) {
        window.clearTimeout(STATE.promptRefreshTimer);
        const delayMs = adapterDelayMs("promptRefreshDebounceMs", 140, reason);
        STATE.promptRefreshTimer = window.setTimeout(() => {
            const nextSignature = buildPromptSignature();

            if (nextSignature === STATE.lastPromptSignature) {
                log("Prompt-generation check produced no signature change", { reason });
                return;
            }

            log("Prompt content changed; refreshing hints", { reason });
            scheduleAnnotation(true);
        }, 140);
    }

    function isAnnotationNode(node) {
        return node instanceof Element && (
            node.classList.contains("cch-overlay-root") ||
            node.classList.contains("cch-hint-label") ||
            node.closest(".cch-overlay-root") !== null ||
            node.closest(".cch-hint-label") !== null
        );
    }

    function mutationOnlyTouchesAnnotations(mutation) {
        if (mutation.type !== "childList") return false;

        const changedNodes = [
            ...Array.from(mutation.addedNodes || []),
            ...Array.from(mutation.removedNodes || [])
        ];

        return changedNodes.length > 0 && changedNodes.every(isAnnotationNode);
    }

    function mutationTargetsObservedPromptContainer(mutation) {
        return (
            STATE.observedPromptContainer instanceof Node &&
            mutation.target instanceof Node &&
            STATE.observedPromptContainer.contains(mutation.target)
        );
    }

    function observePromptContainer(container) {
        if (STATE.promptObserver) {
            STATE.promptObserver.disconnect();
        }

        const adapter = currentSiteAdapter();
        if (!adapter || !(container instanceof HTMLElement)) {
            STATE.promptObserver = null;
            STATE.observedPromptContainer = null;
            return;
        }

        STATE.observedPromptContainer = container;

        if (adapter.observePromptMutations === false) {
            STATE.promptObserver = null;
            return;
        }

        STATE.promptObserver = new MutationObserver((mutations) => {
            let sawGenerationCandidate = false;
            let shouldAnnotateDirectly = false;
            let shouldRepositionOverlay = false;

            for (const mutation of mutations) {
                if (mutationOnlyTouchesAnnotations(mutation)) {
                    continue;
                }

                const refreshMode = adapter.mutationRefreshMode?.(mutation);
                if (adapter.key === "keybr") {
                    logKeybrMutationState(mutation, refreshMode || "none");
                }
                if (refreshMode === "annotate") {
                    sawGenerationCandidate = true;
                    shouldAnnotateDirectly = true;
                    break;
                }

                if (refreshMode === "reposition") {
                    shouldRepositionOverlay = true;
                    continue;
                }

                if (adapter.mutationIsRelevant(mutation)) {
                    sawGenerationCandidate = true;
                }
            }

            if (shouldAnnotateDirectly) {
                scheduleAnnotation(true);
                return;
            }

            if (sawGenerationCandidate) {
                handlePotentialPromptChange("prompt-container-mutation");
                return;
            }

            if (shouldRepositionOverlay) {
                scheduleOverlayReposition();
            }
        });

        STATE.promptObserver.observe(container, adapter.observerConfig());

        log("Observing prompt container", {
            site: adapter.key,
            container
        });
    }

    function ensurePromptObserverTarget() {
        const adapter = currentSiteAdapter();
        const nextContainer = getPromptContainer();

        if (!nextContainer) {
            if (STATE.observedPromptContainer) {
                log("Prompt container disappeared; disconnecting prompt observer");
            }
            STATE.promptObserver?.disconnect();
            STATE.promptObserver = null;
            STATE.observedPromptContainer = null;
            return;
        }

        if (nextContainer === STATE.observedPromptContainer) {
            return;
        }

        observePromptContainer(nextContainer);
        refreshOverlayTrackingObservers();
        if (adapter?.refreshOnContainerRebind) {
            scheduleAnnotation(true);
            return;
        }

        handlePotentialPromptChange("prompt-container-rebound");
    }

    function installContainerObserver() {
        if (STATE.containerObserver) return;

        STATE.containerObserver = new MutationObserver((mutations) => {
            let sawChildListChange = false;

            for (const mutation of mutations) {
                if (mutationOnlyTouchesAnnotations(mutation)) {
                    continue;
                }

                if (mutationTargetsObservedPromptContainer(mutation)) {
                    continue;
                }

                if (mutation.type === "childList") {
                    sawChildListChange = true;
                    break;
                }
            }

            if (!sawChildListChange) return;

            window.clearTimeout(STATE.containerRebindTimer);
            const delayMs = adapterDelayMs("containerRebindDelayMs", 50);
            STATE.containerRebindTimer = window.setTimeout(() => {
                ensurePromptObserverTarget();
            }, delayMs);
        });

        STATE.containerObserver.observe(document.documentElement, {
            subtree: true,
            childList: true,
            characterData: false,
            attributes: false
        });

        ensurePromptObserverTarget();
    }

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "local") return;

        if (changes[STORAGE_KEYS.parsedDictionary] || changes[STORAGE_KEYS.inputDisplayOverrides]) {
            const keysToReload = [STORAGE_KEYS.parsedDictionary, STORAGE_KEYS.inputDisplayOverrides];
            chrome.storage.local.get(keysToReload, (stored) => {
                STATE.dictionary = CCHShared.applyInputDisplayOverrides(
                    stored[STORAGE_KEYS.parsedDictionary],
                    stored[STORAGE_KEYS.inputDisplayOverrides]
                );
                refreshLookupMetadata();
                resetHintLabelTemplateCache("dictionary-change");
                log("Dictionary changed", {
                    entryCount: STATE.dictionary?.entryCount ?? 0
                });
                scheduleAnnotation(true);
            });
        }

        if (changes[STORAGE_KEYS.settings]) {
            STATE.settings = hydrateSettings(changes[STORAGE_KEYS.settings].newValue);
            applyAppearanceSettings();
            resetHintLabelTemplateCache("settings-change");
            log("Settings changed", STATE.settings);
            scheduleAnnotation(true);
        }
    });

    async function init() {
        await loadState();
        log("Active adapter at init", {
            site: currentSiteAdapter()?.key || null,
            hostname: location.hostname,
            pathname: location.pathname
        });
        installHintLabelClickDelegation();
        installGlobalHotkeys();
        installLocationObserver();
        installContainerObserver();
        scheduleAnnotation(true);

        window.addEventListener(
            "load",
            () => {
                ensurePromptObserverTarget();
                if (currentSiteAdapter()?.key === "entertrained") {
                    const nextSignature = buildPromptSignature();
                    if (nextSignature && nextSignature === STATE.lastPromptSignature) {
                        return;
                    }
                }
                scheduleAnnotation(true);
            },
            { once: true }
        );

        window.addEventListener("pageshow", () => {
            ensurePromptObserverTarget();
            handlePotentialPromptChange("pageshow");
        });

        window.addEventListener("resize", () => {
            scheduleOverlayReposition();
        });

        window.addEventListener("scroll", () => {
            scheduleOverlayReposition();
        }, true);
    }

    init().catch((error) => {
        console.error("[CCH] init failed", error);
    });
})();
