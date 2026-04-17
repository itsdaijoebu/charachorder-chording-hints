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
        maxLookupWordCount: 1
    };

    const SITE_ADAPTERS = [
        {
            key: "entertrained",
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
            buildPromptSignature(paragraphs) {
                const normalizedParagraphs = paragraphs.map((paragraph) =>
                    (paragraph.textContent || "")
                        .replace(/\s+/g, " ")
                        .trim()
                );

                const totalWords = paragraphs.reduce(
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
                    characterData: true,
                    attributes: false
                };
            },
            mutationIsRelevant(mutation) {
                return mutation.type === "childList" || mutation.type === "characterData";
            }
        },
        {
            key: "monkeytype",
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
                    .filter((el) => el instanceof HTMLElement)
                    .filter(isVisible);

                return filterWordsToContainerViewport(words, container);
            },
            buildPromptSignature(paragraphs) {
                const container = paragraphs[0];
                if (!(container instanceof HTMLElement)) {
                    return JSON.stringify({
                        site: this.key,
                        visibleWordCount: 0,
                        text: ""
                    });
                }

                const words = this.getWordElements(container);
                const texts = words.map((word) =>
                    (word.textContent || "")
                        .replace(/\s+/g, " ")
                        .trim()
                );

                const firstWordIndex = readMonkeytypeWordIndex(words[0]);
                const lastWordIndex = readMonkeytypeWordIndex(words[words.length - 1]);

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
                return mutation.type === "childList";
            }
        }
    ];

    function log(...args) {
        if (!STATE.settings.debugLogging) return;
        console.log("[CCH]", ...args);
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

        return merged;
    }

    function currentSiteAdapter() {
        return SITE_ADAPTERS.find((adapter) => adapter.matchesLocation()) || null;
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

    function rectsIntersect(a, b) {
        return (
            a.right > b.left &&
            a.left < b.right &&
            a.bottom > b.top &&
            a.top < b.bottom
        );
    }

    function filterWordsToContainerViewport(words, container) {
        if (!(container instanceof HTMLElement)) return words;

        const containerRect = container.getBoundingClientRect();
        if (containerRect.width <= 0 || containerRect.height <= 0) {
            return [];
        }

        return words.filter((word) => rectsIntersect(word.getBoundingClientRect(), containerRect));
    }

    function readMonkeytypeWordIndex(word) {
        if (!(word instanceof HTMLElement)) return null;

        const candidates = [
            word.dataset.wordindex,
            word.dataset.wordIndex,
            word.dataset.woriindex,
            word.dataset.woriIndex,
            word.getAttribute("data-wordindex"),
            word.getAttribute("data-woriindex")
        ];

        for (const candidate of candidates) {
            if (candidate == null || candidate === "") continue;

            const parsed = Number(candidate);
            if (Number.isFinite(parsed)) return parsed;
            return String(candidate);
        }

        return null;
    }

    function parsePixelValue(value) {
        const parsed = Number.parseFloat(String(value ?? "").trim());
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function getMonkeytypeWordsWrapper() {
        const wrapper = document.querySelector("#wordsWrapper, #wordWrapper");
        return wrapper instanceof HTMLElement ? wrapper : null;
    }

    function ensureMonkeytypeLayoutReserveSpace() {
        const adapter = currentSiteAdapter();
        if (adapter?.key !== "monkeytype") return false;

        const wrapper = getMonkeytypeWordsWrapper();
        const container = adapter.getPromptContainer();

        if (!(wrapper instanceof HTMLElement) || !(container instanceof HTMLElement)) {
            return false;
        }

        const labels = Array.from(container.querySelectorAll(".cch-hint-label"))
            .filter((el) => el instanceof HTMLElement);

        const measuredLabelHeight = labels.length
            ? Math.max(...labels.map((label) => label.getBoundingClientRect().height))
            : 0;

        const reservePx = Math.max(0, Math.min(64, Math.ceil(measuredLabelHeight + 6)));
        const previouslyApplied = parsePixelValue(wrapper.dataset.cchReserveTopPx);

        if (Math.abs(previouslyApplied - reservePx) < 1) {
            return false;
        }

        if (wrapper.dataset.cchBasePaddingTopPx == null) {
            wrapper.dataset.cchBasePaddingTopPx = String(parsePixelValue(getComputedStyle(wrapper).paddingTop));
        }

        if (wrapper.dataset.cchBaseHeightPx == null) {
            wrapper.dataset.cchBaseHeightPx = String(parsePixelValue(getComputedStyle(wrapper).height));
        }

        const basePaddingTop = parsePixelValue(wrapper.dataset.cchBasePaddingTopPx);
        const baseHeight = parsePixelValue(wrapper.dataset.cchBaseHeightPx);

        wrapper.style.paddingTop = `${basePaddingTop + reservePx}px`;

        if (baseHeight > 0) {
            wrapper.style.height = `${baseHeight + reservePx}px`;
        }

        wrapper.dataset.cchReserveTopPx = String(reservePx);

        log("Adjusted Monkeytype wrapper layout", {
            reservePx,
            basePaddingTop,
            baseHeight
        });

        return true;
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

    function buildPromptSignature() {
        const adapter = currentSiteAdapter();
        if (!adapter) return "";

        const paragraphs = getParagraphBoxes();
        return adapter.buildPromptSignature(paragraphs);
    }

    function clearAnnotationsWithin(root) {
        if (!(root instanceof Element)) return;

        root.classList.remove("cch-debug-parent");
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

    function renderHintRows(entries) {
        const fragment = document.createDocumentFragment();

        for (const entry of entries) {
            const row = document.createElement("span");
            row.className = "cch-hint-row";

            const segments = CCHShared.entryInputSegments(entry);
            segments.forEach((segment, segmentIndex) => {
                if (segmentIndex > 0) {
                    row.appendChild(renderSegmentSeparator());
                }

                for (const token of segment.inputTokens) {
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
    }

    function wordText(wordEl) {
        return (wordEl?.textContent || "").trim();
    }

    function phraseText(words, startIndex, wordCount) {
        return words
            .slice(startIndex, startIndex + wordCount)
            .map(wordText)
            .join(" ");
    }

    function findMatchFromWords(words, startIndex) {
        const maxWordCount = Math.min(
            STATE.maxLookupWordCount || 1,
            words.length - startIndex
        );

        for (let wordCount = maxWordCount; wordCount >= 1; wordCount -= 1) {
            const rawText = phraseText(words, startIndex, wordCount);
            const normalized = CCHShared.normalizeTokenForLookup(rawText);

            if (!normalized) {
                continue;
            }

            const refs = STATE.dictionary?.byNormalizedOutput?.[normalized];
            if (!refs?.length) {
                continue;
            }

            const chosen = CCHShared.chooseEntries(STATE.dictionary, refs, STATE.settings);
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
                entries: chosen,
                wordCount
            };
        }

        const rawText = wordText(words[startIndex]);
        const normalized = CCHShared.normalizeTokenForLookup(rawText);

        if (!normalized) {
            return { matched: false, reason: "empty-normalized", word: rawText };
        }

        return { matched: false, reason: "no-dictionary-match", word: rawText, normalized };
    }

    function annotateMatch(words, startIndex, match) {
        const wordEl = words[startIndex];
        wordEl.querySelectorAll(":scope > .cch-hint-label").forEach((existing) => existing.remove());

        if (getComputedStyle(wordEl).position === "static") {
            wordEl.dataset.cchOriginalPosition = "static";
            wordEl.style.position = "relative";
        }

        const label = document.createElement("span");
        label.className = "cch-hint-label";
        if (match.entries.length > 1) {
            label.classList.add("cch-multiple");
        }
        label.appendChild(renderHintRows(match.entries));

        wordEl.classList.add("cch-host");
        wordEl.dataset.cchAnnotated = "true";
        wordEl.prepend(label);

        return {
            matched: true,
            word: match.word,
            normalized: match.normalized,
            hint: hintTextForLogs(match.entries),
            matchCount: match.entries.length,
            wordCount: match.wordCount,
            active: words
                .slice(startIndex, startIndex + match.wordCount)
                .some((word) => word.classList.contains("active"))
        };
    }

    function annotateParagraph(paragraph, paragraphIndex) {
        clearAnnotationsWithin(paragraph);

        if (STATE.settings.showDebugOutline) {
            paragraph.classList.add("cch-debug-parent");
        }

        const words = getWordElements(paragraph);
        const activeWords = words.filter((word) => word.classList.contains("active")).length;
        const letterCurrentCount = paragraph.querySelectorAll(".letter.current, letter.current").length;

        const matches = [];
        const misses = [];

        for (let wordIndex = 0; wordIndex < words.length; wordIndex += 1) {
            const result = findMatchFromWords(words, wordIndex);
            if (result.matched) {
                matches.push(annotateMatch(words, wordIndex, result));
                wordIndex += result.wordCount - 1;
            } else {
                misses.push(result);
            }
        }

        const summary = {
            site: currentSiteAdapter()?.key || "unknown",
            paragraphIndex,
            wordCount: words.length,
            activeWordCount: activeWords,
            currentLetterCount: letterCurrentCount,
            matchedCount: matches.length,
            unmatchedCount: misses.length,
            wordSample: words.slice(0, 12).map((word) => (word.textContent || "").trim()),
            matchSample: matches.slice(0, 8).map((m) => ({
                word: m.word,
                hint: m.hint,
                active: m.active,
                matchCount: m.matchCount,
                wordCount: m.wordCount
            })),
            missSample: misses.slice(0, 8).map((m) => ({
                word: m.word,
                normalized: m.normalized || "",
                reason: m.reason
            }))
        };

        log("Paragraph annotation summary", summary);
        return summary;
    }

    function runAnnotationPass(force = false) {
        STATE.scheduled = false;
        STATE.scheduledForce = false;

        if (!STATE.settings.enabled || !STATE.dictionary) {
            STATE.trackedParagraphs.forEach(clearAnnotationsWithin);
            STATE.trackedParagraphs = [];
            log("Annotation skipped", {
                enabled: STATE.settings.enabled,
                hasDictionary: Boolean(STATE.dictionary),
            });
            return;
        }

        const adapter = currentSiteAdapter();
        if (!adapter) {
            STATE.trackedParagraphs.forEach(clearAnnotationsWithin);
            STATE.trackedParagraphs = [];
            STATE.lastPromptSignature = "";
            log("No active site adapter for current page", {
                hostname: location.hostname,
                pathname: location.pathname
            });
            return;
        }

        const paragraphs = getParagraphBoxes();
        STATE.trackedParagraphs = paragraphs;

        log("Paragraph discovery", {
            site: adapter.key,
            paragraphCount: paragraphs.length,
            paragraphSamples: paragraphs.slice(0, 5).map((paragraph, index) => ({
                paragraphIndex: index,
                className: paragraph.className || "",
                wordCount: getWordElements(paragraph).length,
                sampleText: (paragraph.textContent || "").trim().slice(0, 160)
            }))
        });

        if (!paragraphs.length) {
            STATE.lastPromptSignature = buildPromptSignature();
            STATE.trackedParagraphs = [];
            log("No prompt containers/paragraphs found for current adapter", { site: adapter.key });
            return;
        }

        let summaries = paragraphs.map((paragraph, index) => annotateParagraph(paragraph, index));

        if (ensureMonkeytypeLayoutReserveSpace()) {
            const refreshedParagraphs = getParagraphBoxes();
            STATE.trackedParagraphs = refreshedParagraphs;
            summaries = refreshedParagraphs.map((paragraph, index) => annotateParagraph(paragraph, index));
        }

        const totalWords = summaries.reduce((sum, item) => sum + item.wordCount, 0);
        const totalMatches = summaries.reduce((sum, item) => sum + item.matchedCount, 0);

        STATE.lastPromptSignature = buildPromptSignature();

        log("Annotation pass complete", {
            site: adapter.key,
            paragraphCount: STATE.trackedParagraphs.length,
            totalWords,
            totalMatches,
            entryCount: STATE.dictionary.entryCount,
            forced: force
        });
    }

    function scheduleAnnotation(force = false) {
        if (STATE.scheduled) {
            STATE.scheduledForce = STATE.scheduledForce || force;
            return;
        }

        STATE.scheduled = true;
        STATE.scheduledForce = force;

        window.requestAnimationFrame(() => {
            window.setTimeout(() => runAnnotationPass(STATE.scheduledForce), 40);
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
        STATE.promptRefreshTimer = window.setTimeout(() => {
            const nextSignature = buildPromptSignature();

            if (nextSignature === STATE.lastPromptSignature) {
                log("Prompt-change check produced no signature change", { reason });
                return;
            }

            log("Prompt content changed; refreshing hints", { reason });
            scheduleAnnotation(true);
        }, 80);
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

        STATE.promptObserver = new MutationObserver((mutations) => {
            let sawRelevantChange = false;

            for (const mutation of mutations) {
                if (adapter.mutationIsRelevant(mutation)) {
                    sawRelevantChange = true;
                    break;
                }
            }

            if (!sawRelevantChange) return;
            handlePotentialPromptChange("prompt-container-mutation");
        });

        STATE.promptObserver.observe(container, adapter.observerConfig());

        STATE.observedPromptContainer = container;
        log("Observing prompt container", {
            site: adapter.key,
            container
        });
    }

    function ensurePromptObserverTarget() {
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
        handlePotentialPromptChange("prompt-container-rebound");
    }

    function installContainerObserver() {
        if (STATE.containerObserver) return;

        STATE.containerObserver = new MutationObserver((mutations) => {
            let sawChildListChange = false;

            for (const mutation of mutations) {
                if (mutation.type === "childList") {
                    sawChildListChange = true;
                    break;
                }
            }

            if (!sawChildListChange) return;

            window.clearTimeout(STATE.containerRebindTimer);
            STATE.containerRebindTimer = window.setTimeout(() => {
                ensurePromptObserverTarget();
            }, 50);
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
        const hotkey = CCHShared.normalizeHotkeys({ forceRefresh: rawHotkey }).forceRefresh;
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
        installContainerObserver();
        installHotkeys();
        scheduleAnnotation(true);

        window.addEventListener(
            "load",
            () => {
                ensurePromptObserverTarget();
                scheduleAnnotation(true);
            },
            { once: true }
        );

        window.addEventListener("pageshow", () => {
            ensurePromptObserverTarget();
            handlePotentialPromptChange("pageshow");
        });
    }

    init().catch((error) => {
        console.error("[CCH] init failed", error);
    });
})();
