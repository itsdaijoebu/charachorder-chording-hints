(() => {
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
        substringLookup: null,
        substringMatchCache: new Map(),
        exactEntrySelectionCache: new Map(),
        annotationMeasurementCache: null,
        deferredParagraphAnnotationTimer: null,
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

    function hydrateSettings(rawSettings) {
        const merged = {
            ...CCHShared.defaultSettings(),
            ...(rawSettings || {})
        };

        merged.specialTokenDescriptions = {
            ...CCHShared.defaultSpecialTokenDescriptions(),
            ...(merged.specialTokenDescriptions || {})
        };

        merged.hotkeys = CCHShared.normalizeHotkeys(merged.hotkeys);
        merged.enableSubstringHints = Boolean(merged.enableSubstringHints);
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

    function cancelDeferredParagraphAnnotation() {
        if (STATE.deferredParagraphAnnotationTimer != null) {
            window.clearTimeout(STATE.deferredParagraphAnnotationTimer);
            STATE.deferredParagraphAnnotationTimer = null;
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
                rect: includeRects ? el.getBoundingClientRect() : null
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

    function hintTextForLogs(entries) {
        return entries.map((entry) => entry.rawInput).join(" | ");
    }

    function refreshLookupMetadata() {
        const normalizedOutputs = Object.keys(STATE.dictionary?.byNormalizedOutput || {});
        STATE.maxLookupWordCount = Math.max(
            1,
            ...normalizedOutputs.map((key) => String(key).split(/\s+/u).filter(Boolean).length)
        );
        STATE.substringLookup = buildSubstringLookup();
        STATE.substringMatchCache = new Map();
        STATE.exactEntrySelectionCache = new Map();
    }

    function exactEntrySelectionCacheKey(normalized) {
        return JSON.stringify({
            normalized: String(normalized || ""),
            selectionMode: STATE.settings.selectionMode,
            includeArpeggiates: Boolean(STATE.settings.includeArpeggiates),
            includeModifierStyle: Boolean(STATE.settings.includeModifierStyle)
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

    function buildSubstringLookup() {
        const dictionary = STATE.dictionary;
        if (!dictionary?.byNormalizedOutput) {
            return {
                byFirstCharacter: new Map(),
                exactSingleWordMatches: new Set()
            };
        }

        const byFirstCharacter = new Map();
        const exactSingleWordMatches = new Set();

        Object.entries(dictionary.byNormalizedOutput).forEach(([normalized, refs]) => {
            const safeNormalized = String(normalized || "");
            if (!safeNormalized || /\s/u.test(safeNormalized)) {
                return;
            }

            exactSingleWordMatches.add(safeNormalized);

            const refsByAffix = {
                any: [],
                prefix: [],
                suffix: []
            };

            refs.forEach((ref) => {
                const entry = dictionary.entries?.[ref];
                const affixType = entry?.flags?.affixType || "any";
                if (affixType === "prefix") {
                    refsByAffix.prefix.push(ref);
                } else if (affixType === "suffix") {
                    refsByAffix.suffix.push(ref);
                } else {
                    refsByAffix.any.push(ref);
                }
            });

            const firstCharacter = safeNormalized[0];
            if (!firstCharacter) {
                return;
            }

            const bucket = byFirstCharacter.get(firstCharacter) || [];
            bucket.push({
                normalized: safeNormalized,
                length: safeNormalized.length,
                refsByAffix
            });
            byFirstCharacter.set(firstCharacter, bucket);
        });

        byFirstCharacter.forEach((bucket) => {
            bucket.sort((a, b) => {
                if (b.length !== a.length) return b.length - a.length;
                return a.normalized.localeCompare(b.normalized);
            });
        });

        return { byFirstCharacter, exactSingleWordMatches };
    }

    function substringCacheKey(normalizedWord) {
        return JSON.stringify({
            normalizedWord,
            selectionMode: STATE.settings.selectionMode,
            includeArpeggiates: Boolean(STATE.settings.includeArpeggiates),
            includeModifierStyle: Boolean(STATE.settings.includeModifierStyle)
        });
    }

    function applicableSubstringRefs(candidate, startIndex, endIndex, wordLength) {
        const refs = [];
        if (candidate.refsByAffix?.any?.length) {
            refs.push(...candidate.refsByAffix.any);
        }
        if (startIndex === 0 && candidate.refsByAffix?.prefix?.length) {
            refs.push(...candidate.refsByAffix.prefix);
        }
        if (endIndex === wordLength && candidate.refsByAffix?.suffix?.length) {
            refs.push(...candidate.refsByAffix.suffix);
        }
        return refs;
    }

    function compareSubstringSolutions(a, b) {
        if (a.coverage !== b.coverage) return a.coverage - b.coverage;
        if (a.longestSegment !== b.longestSegment) return a.longestSegment - b.longestSegment;
        if (a.segmentCount !== b.segmentCount) return b.segmentCount - a.segmentCount;
        return b.firstStart - a.firstStart;
    }

    function solveBestSubstringCoverage(candidates) {
        const sortedCandidates = candidates.slice().sort((a, b) => {
            if (a.start !== b.start) return a.start - b.start;
            if (b.length !== a.length) return b.length - a.length;
            return a.normalized.localeCompare(b.normalized);
        });

        const memo = new Map();

        function solve(index) {
            if (index >= sortedCandidates.length) {
                return {
                    coverage: 0,
                    longestSegment: 0,
                    segmentCount: 0,
                    firstStart: Number.POSITIVE_INFINITY,
                    segments: []
                };
            }

            if (memo.has(index)) {
                return memo.get(index);
            }

            const skip = solve(index + 1);
            const candidate = sortedCandidates[index];
            let nextIndex = index + 1;
            while (nextIndex < sortedCandidates.length && sortedCandidates[nextIndex].start < candidate.end) {
                nextIndex += 1;
            }

            const includeTail = solve(nextIndex);
            const include = {
                coverage: candidate.length + includeTail.coverage,
                longestSegment: Math.max(candidate.length, includeTail.longestSegment),
                segmentCount: 1 + includeTail.segmentCount,
                firstStart: candidate.start,
                segments: [candidate, ...includeTail.segments]
            };

            const best = compareSubstringSolutions(include, skip) >= 0 ? include : skip;
            memo.set(index, best);
            return best;
        }

        return solve(0).segments;
    }

    function findSubstringMatchForWord(rawText, normalizedWord) {
        if (!STATE.settings.enableSubstringHints) {
            return { matched: false, reason: "substring-disabled", word: rawText, normalized: normalizedWord };
        }

        if (!phraseMeetsMinimumLength(rawText)) {
            return { matched: false, reason: "below-minimum-length", word: rawText, normalized: normalizedWord };
        }

        if (STATE.substringLookup?.exactSingleWordMatches?.has(normalizedWord)) {
            return { matched: false, reason: "exact-word-exists", word: rawText, normalized: normalizedWord };
        }

        const cacheKey = substringCacheKey(normalizedWord);
        if (STATE.substringMatchCache.has(cacheKey)) {
            const cached = STATE.substringMatchCache.get(cacheKey);
            return cached
                ? {
                    matched: true,
                    word: rawText,
                    normalized: normalizedWord,
                    labels: cached,
                    wordCount: 1,
                    isSubstringMatch: true
                }
                : { matched: false, reason: "no-substring-match", word: rawText, normalized: normalizedWord };
        }

        const seenCandidates = new Set();
        const candidatePool = [];
        for (const character of new Set(Array.from(normalizedWord))) {
            const bucket = STATE.substringLookup?.byFirstCharacter?.get(character) || [];
            for (const candidate of bucket) {
                if (candidate.length >= normalizedWord.length) {
                    continue;
                }
                if (seenCandidates.has(candidate.normalized)) {
                    continue;
                }
                seenCandidates.add(candidate.normalized);
                candidatePool.push(candidate);
            }
        }

        const segments = [];
        for (const candidate of candidatePool) {
            let searchIndex = 0;
            while (searchIndex < normalizedWord.length) {
                const matchIndex = normalizedWord.indexOf(candidate.normalized, searchIndex);
                if (matchIndex === -1) {
                    break;
                }

                const endIndex = matchIndex + candidate.normalized.length;
                const refs = applicableSubstringRefs(candidate, matchIndex, endIndex, normalizedWord.length);
                if (refs.length) {
                    const chosen = CCHShared.chooseEntries(STATE.dictionary, refs, STATE.settings);
                    if (chosen.length) {
                        segments.push({
                            start: matchIndex,
                            end: endIndex,
                            length: candidate.normalized.length,
                            normalized: candidate.normalized,
                            entries: chosen
                        });
                    }
                }

                searchIndex = matchIndex + 1;
            }
        }

        const bestSegments = solveBestSubstringCoverage(segments).map((segment) => ({
            entries: segment.entries,
            normalized: segment.normalized,
            anchor: {
                type: "substring",
                start: segment.start,
                end: segment.end,
                wordLength: normalizedWord.length
            }
        }));

        STATE.substringMatchCache.set(cacheKey, bestSegments.length ? bestSegments : null);

        if (!bestSegments.length) {
            return { matched: false, reason: "no-substring-match", word: rawText, normalized: normalizedWord };
        }

        return {
            matched: true,
            word: rawText,
            normalized: normalizedWord,
            labels: bestSegments,
            wordCount: 1,
            isSubstringMatch: true
        };
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
        let phrase = "";

        for (let wordCount = 1; wordCount <= maxWordCount; wordCount += 1) {
            const text = wordRecordText(words[startIndex + wordCount - 1]);
            phrase = phrase ? `${phrase} ${text}` : text;
            phraseTexts[wordCount] = phrase;
        }

        for (let wordCount = maxWordCount; wordCount >= 1; wordCount -= 1) {
            if (!wordRecordHasLookupText(words[startIndex + wordCount - 1])) {
                continue;
            }

            const rawText = phraseTexts[wordCount];
            const normalized = wordCount === 1
                ? wordRecordNormalizedText(words[startIndex])
                : CCHShared.normalizeTokenForLookup(rawText);

            if (!normalized || !phraseMeetsMinimumLength(rawText)) {
                continue;
            }

            const chosen = chooseEntriesForNormalizedOutput(normalized);
            if (!chosen) {
                continue;
            }
            if (!chosen.length) {
                return {
                    matched: false,
                    reason: "filtered-out",
                    word: rawText,
                    normalized,
                    wordCount
                };
            }

            return {
                matched: true,
                word: rawText,
                normalized,
                labels: [{ entries: chosen, anchor: null }],
                wordCount,
                isSubstringMatch: false
            };
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

    function createHintLabel(entries, outputText) {
        const label = document.createElement("span");
        label.className = "cch-hint-label";
        label.classList.add(hintAlignmentClass());
        label.classList.add(hintDisplayClass());
        if (entries.length > 1) {
            label.classList.add("cch-multiple");
        }
        label.appendChild(renderHintRows(entries, outputText));
        label.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            toggleHintDisplay(label);
        });
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

    function measuredSubstringGeometry(word, match, labelMatch) {
        const cached = cachedMeasurement(word, match, labelMatch);
        if (cached && cached.value) {
            return cached.value;
        }

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
        const geometry = {
            rects,
            rect: boundingRect || rects[0] || null
        };

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
        return measuredSubstringGeometry(word, match, labelMatch)?.rect || null;
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
            const wordEl = wordRecordElement(record.word);
            const wordRect = wordRecordRect(record.word, hasActiveAnnotationMeasurementCache());
            if (
                !(wordEl instanceof HTMLElement) ||
                !wordRect ||
                !rect ||
                rect.width <= 0 ||
                rect.height <= 0
            ) {
                return;
            }

            ensureRelativePositionHost(wordEl);
            const outline = createOutlineElement();
            if (!positionInlineOutline(outline, wordRect, rect)) {
                return;
            }
            wordEl.appendChild(outline);
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

    function annotateInlineMatch(words, startIndex, match, includeDebugSummary = false) {
        const wordEl = wordRecordElement(words[startIndex]);
        if (!(wordEl instanceof HTMLElement)) {
            return includeDebugSummary ? summarizeMatch(words, startIndex, match) : null;
        }

        ensureRelativePositionHost(wordEl);

        const rect = wordRecordRect(words[startIndex]);
        if (!rect || rect.width <= 0 || rect.height <= 0) {
            return includeDebugSummary ? summarizeMatch(words, startIndex, match) : null;
        }

        wordEl.classList.add("cch-host");
        wordEl.dataset.cchAnnotated = "true";

        matchLabels(match).forEach((labelMatch) => {
            appendInlineOutlines(words, startIndex, match, labelMatch);
            const label = createHintLabel(
                labelMatch.entries,
                matchedOutputTextForLabel(match, labelMatch)
            );
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

        const adapter = currentSiteAdapter();
        const overlayPosition = overlayPositionFromViewportRect(root, rect);
        matchLabels(match).forEach((labelMatch) => {
            appendOverlayOutlines(root, words, startIndex, match, labelMatch);
            const label = createHintLabel(
                labelMatch.entries,
                matchedOutputTextForLabel(match, labelMatch)
            );
            if (adapter?.key === "keybr" && adapter.keybrHintLayout?.() === "extra-spacing") {
                label.classList.add("cch-keybr-overlay-extra-spacing");
            }

            const record = {
                label,
                word: words[startIndex],
                match,
                labelMatch
            };
            positionOverlayLabel(record, overlayPosition);
            root.appendChild(label);
            STATE.overlayLabels.push(record);
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

    function annotateParagraph(paragraph, paragraphIndex, discoveredWords = null, renderMode = "inline") {
        clearAnnotationsWithin(paragraph);

        const words = Array.isArray(discoveredWords) ? discoveredWords : getWordElements(paragraph);
        const includeDebugSummary = STATE.settings.debugLogging;
        const shouldPremeasureInlineGeometry =
            renderMode === "inline" &&
            adapterFlag("premeasureInlineGeometry");
        const matches = includeDebugSummary ? [] : null;
        const misses = includeDebugSummary ? [] : null;
        const matchPlans = [];
        let matchedCount = 0;
        let unmatchedCount = 0;

        for (let wordIndex = 0; wordIndex < words.length; wordIndex += 1) {
            const result = findMatchFromWords(words, wordIndex);
            if (result.matched) {
                matchedCount += 1;
                matchPlans.push({ wordIndex, result });
                wordIndex += result.wordCount - 1;
            } else {
                unmatchedCount += 1;
                if (includeDebugSummary) {
                    misses.push(result);
                }
            }
        }

        if (shouldPremeasureInlineGeometry) {
            matchPlans.forEach((plan) => {
                const word = words[plan.wordIndex];
                wordRecordRect(word);
                matchLabels(plan.result).forEach((labelMatch) => {
                    measuredSubstringGeometry(word, plan.result, labelMatch);
                });
            });
        }

        matchPlans.forEach((plan) => {
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

        const summary = {
            site: currentSiteAdapter()?.key || "unknown",
            paragraphIndex,
            wordCount: words.length,
            matchedCount,
            unmatchedCount
        };

        if (includeDebugSummary) {
            summary.activeWordCount = words.filter((word) => wordRecordHasClass(word, "active")).length;
            summary.currentLetterCount = paragraph.querySelectorAll(".letter.current").length;
            summary.wordSample = words.slice(0, 12).map(wordRecordText);
            summary.matchSample = matches.slice(0, 8).map((m) => ({
                word: m.word,
                hint: m.hint,
                active: m.active,
                matchCount: m.matchCount,
                wordCount: m.wordCount
            }));
            summary.missSample = misses.slice(0, 8).map((m) => ({
                word: m.word,
                normalized: m.normalized || "",
                reason: m.reason
            }));

            log("Paragraph annotation summary", summary);
        }

        return summary;
    }

    function annotateParagraphEntries(entries, renderMode) {
        return entries.map((entry) =>
            annotateParagraph(entry.paragraph, entry.index, entry.words, renderMode)
        );
    }

    function runAnnotationPass(force = false) {
        STATE.scheduled = false;
        STATE.scheduledForce = false;
        cancelDeferredParagraphAnnotation();
        const passToken = ++STATE.annotationPassToken;
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

        const paragraphs = getParagraphBoxes();
        STATE.trackedParagraphs = paragraphs;
        const renderMode = adapterRenderMode(adapter);
        if (renderMode === "overlay") {
            clearOverlayAnnotations();
            syncOverlayTypography(getOverlayRoot());
            refreshOverlayTrackingObservers();
        } else {
            removeOverlayAnnotations();
        }

        const shouldCacheWordRects = renderMode === "overlay" || adapterFlag("cacheInlineWordRects");
        const wordLists = paragraphs.map((paragraph) => getWordElements(paragraph));
        const wordRecordLists = wordLists.map((words) => createWordRecords(words, shouldCacheWordRects));
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
                paragraphSamples: paragraphs.slice(0, 5).map((paragraph, index) => ({
                    paragraphIndex: index,
                    className: paragraph.className || "",
                    wordCount: wordRecordLists[index]?.length || 0,
                    sampleText: annotationFreeTextContent(paragraph).trim().slice(0, 160)
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

        const paragraphEntries = paragraphs.map((paragraph, index) => ({
            paragraph,
            index,
            words: wordRecordLists[index]
        }));
        const shouldDeferOffscreenParagraphs =
            renderMode === "inline" &&
            adapterFlag("deferOffscreenParagraphs");
        let immediateEntries = paragraphEntries;
        let deferredEntries = [];

        if (shouldDeferOffscreenParagraphs) {
            immediateEntries = [];
            deferredEntries = [];

            paragraphEntries.forEach((entry) => {
                const rect = entry.paragraph.getBoundingClientRect();
                if (rectIntersectsViewport(rect)) {
                    immediateEntries.push(entry);
                    return;
                }

                deferredEntries.push(entry);
            });

            if (!immediateEntries.length) {
                immediateEntries = paragraphEntries;
                deferredEntries = [];
            }
        }

        const summaries = annotateParagraphEntries(immediateEntries, renderMode);
        const totalWords = summaries.reduce((sum, item) => sum + item.wordCount, 0);
        const totalMatches = summaries.reduce((sum, item) => sum + item.matchedCount, 0);

        STATE.lastPromptSignature = nextPromptSignature;

        if (adapter.key === "keybr") {
            logKeybrOverlayState("after-annotation");
        }

        log("Annotation pass complete", {
            site: adapter.key,
            paragraphCount: immediateEntries.length,
            totalWords,
            totalMatches,
            entryCount: STATE.dictionary.entryCount,
            forced: force,
            deferredParagraphCount: deferredEntries.length
        });
        STATE.annotationMeasurementCache = null;

        if (deferredEntries.length) {
            STATE.deferredParagraphAnnotationTimer = window.setTimeout(() => {
                STATE.deferredParagraphAnnotationTimer = null;

                if (
                    STATE.annotationPassToken !== passToken ||
                    STATE.lastPromptSignature !== nextPromptSignature
                ) {
                    return;
                }

                STATE.annotationMeasurementCache = new WeakMap();
                const deferredSummaries = annotateParagraphEntries(
                    deferredEntries.filter((entry) => entry.paragraph.isConnected),
                    renderMode
                );
                STATE.annotationMeasurementCache = null;

                const deferredWordCount = deferredSummaries.reduce((sum, item) => sum + item.wordCount, 0);
                const deferredMatchCount = deferredSummaries.reduce((sum, item) => sum + item.matchedCount, 0);

                log("Deferred paragraph annotation complete", {
                    site: adapter.key,
                    paragraphCount: deferredSummaries.length,
                    totalWords: deferredWordCount,
                    totalMatches: deferredMatchCount,
                    entryCount: STATE.dictionary.entryCount,
                    forced: force
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

    function isEditableTarget(target) {
        if (!(target instanceof HTMLElement)) return false;

        return (
            target.isContentEditable ||
            target.closest("[contenteditable='true']") !== null ||
            target.closest("input, textarea, select") !== null
        );
    }

    function hotkeyMatches(event, rawHotkey) {
        const hotkey = rawHotkey || CCHShared.defaultHotkeys().forceRefresh;
        return (
            event.altKey === hotkey.altKey &&
            event.ctrlKey === hotkey.ctrlKey &&
            event.metaKey === hotkey.metaKey &&
            event.shiftKey === hotkey.shiftKey &&
            event.code === hotkey.code
        );
    }

    function installHotkeys() {
        document.addEventListener(
            "keydown",
            (event) => {
                if (isEditableTarget(event.target)) {
                    return;
                }

                if (hotkeyMatches(event, STATE.settings.hotkeys?.forceRefresh)) {
                    event.preventDefault();
                    event.stopPropagation();
                    log("Forced refresh hotkey pressed", {
                        hotkey: CCHShared.hotkeyDisplay(STATE.settings.hotkeys?.forceRefresh)
                    });
                    scheduleAnnotation(true);
                }
            },
            true
        );
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
                log("Dictionary changed", {
                    entryCount: STATE.dictionary?.entryCount ?? 0
                });
                scheduleAnnotation(true);
            });
        }

        if (changes[STORAGE_KEYS.settings]) {
            STATE.settings = hydrateSettings(changes[STORAGE_KEYS.settings].newValue);
            applyAppearanceSettings();
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
        installLocationObserver();
        installContainerObserver();
        installHotkeys();
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
