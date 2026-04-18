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
        overlayRoot: null
    };

    const SITE_ADAPTERS = [
        {
            key: "entertrained",
            renderMode: "inline",
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
            observePromptMutations: false,
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
        return Array.from(nodes || [])
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
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
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

        const addedIndexes = wordIndexListFromNodes(mutation.addedNodes);
        const removedIndexes = wordIndexListFromNodes(mutation.removedNodes);
        const addedSignature = addedIndexes.join("|");
        const removedSignature = removedIndexes.join("|");

        if (addedSignature || removedSignature) {
            if (addedSignature !== removedSignature) return "annotate";
            if (addedIndexes.length <= 1 && removedIndexes.length <= 1) return false;
            return "check";
        }

        const word = mutationTargetWord(mutation);
        if (word?.classList.contains("active")) return false;

        return "check";
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

    function wordRecordHasLookupText(word) {
        return Boolean(CCHShared.normalizeTokenForLookup(wordRecordText(word)));
    }

    function wordRecordRect(word) {
        if (word?.rect && typeof word.rect.width === "number" && typeof word.rect.height === "number") {
            return word.rect;
        }

        const el = wordRecordElement(word);
        return el instanceof HTMLElement ? el.getBoundingClientRect() : null;
    }

    function wordRecordHasClass(word, className) {
        const el = wordRecordElement(word);
        return el instanceof HTMLElement && el.classList.contains(className);
    }

    function createWordRecords(words, includeRects = false) {
        return words.map((el) => ({
            el,
            text: wordTextFromElement(el),
            rect: includeRects ? el.getBoundingClientRect() : null
        }));
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
                width: rect.width
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
            width: rect.width / safeScaleX
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
        if (STATE.overlayRoot?.isConnected) {
            STATE.overlayRoot.replaceChildren();
        }
    }

    function removeOverlayAnnotations() {
        STATE.overlayRoot?.remove();
        STATE.overlayRoot = null;
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

        const rawText = phraseTexts[1] || "";
        const normalized = CCHShared.normalizeTokenForLookup(rawText);

        if (!normalized) {
            return { matched: false, reason: "empty-normalized", word: rawText };
        }

        return { matched: false, reason: "no-dictionary-match", word: rawText, normalized };
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

    function createHintLabel(entries) {
        const label = document.createElement("span");
        label.className = "cch-hint-label";
        label.classList.add(hintAlignmentClass());
        label.classList.add(hintDisplayClass());
        if (entries.length > 1) {
            label.classList.add("cch-multiple");
        }
        label.appendChild(renderHintRows(entries));
        label.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            toggleHintDisplay(label);
        });
        return label;
    }

    function summarizeMatch(words, startIndex, match) {
        return {
            matched: true,
            word: match.word,
            normalized: match.normalized,
            hint: hintTextForLogs(match.entries),
            matchCount: match.entries.length,
            wordCount: match.wordCount,
            active: words
                .slice(startIndex, startIndex + match.wordCount)
                .some((word) => wordRecordHasClass(word, "active"))
        };
    }

    function annotateInlineMatch(words, startIndex, match, includeDebugSummary = false) {
        const wordEl = wordRecordElement(words[startIndex]);
        if (!(wordEl instanceof HTMLElement)) {
            return includeDebugSummary ? summarizeMatch(words, startIndex, match) : null;
        }

        if (getComputedStyle(wordEl).position === "static") {
            wordEl.dataset.cchOriginalPosition = "static";
            wordEl.style.position = "relative";
        }

        const label = createHintLabel(match.entries);
        wordEl.classList.add("cch-host");
        wordEl.dataset.cchAnnotated = "true";
        wordEl.prepend(label);

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

        const label = createHintLabel(match.entries);
        const adapter = currentSiteAdapter();
        if (adapter?.key === "keybr" && adapter.keybrHintLayout?.() === "extra-spacing") {
            label.classList.add("cch-keybr-overlay-extra-spacing");
        }
        const overlayPosition = overlayPositionFromViewportRect(root, rect);
        label.style.left = STATE.settings.hint_position === "center"
            ? `${overlayPosition.left + overlayPosition.width / 2}px`
            : `${overlayPosition.left}px`;
        label.style.top = `${overlayPosition.top}px`;
        root.appendChild(label);

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

        if (STATE.settings.showDebugOutline) {
            paragraph.classList.add("cch-debug-parent");
        }

        const words = Array.isArray(discoveredWords) ? discoveredWords : getWordElements(paragraph);
        const includeDebugSummary = STATE.settings.debugLogging;
        const matches = includeDebugSummary ? [] : null;
        const misses = includeDebugSummary ? [] : null;
        let matchedCount = 0;
        let unmatchedCount = 0;

        for (let wordIndex = 0; wordIndex < words.length; wordIndex += 1) {
            const result = findMatchFromWords(words, wordIndex);
            if (result.matched) {
                matchedCount += 1;
                const matchSummary = annotateMatch(words, wordIndex, result, renderMode, includeDebugSummary);
                if (includeDebugSummary) {
                    matches.push(matchSummary);
                }
                wordIndex += result.wordCount - 1;
            } else {
                unmatchedCount += 1;
                if (includeDebugSummary) {
                    misses.push(result);
                }
            }
        }

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

    function runAnnotationPass(force = false) {
        STATE.scheduled = false;
        STATE.scheduledForce = false;

        if (!STATE.settings.enabled || !STATE.dictionary) {
            STATE.trackedParagraphs.forEach((paragraph) => clearAnnotationsWithin(paragraph, true));
            STATE.trackedParagraphs = [];
            removeOverlayAnnotations();
            log("Annotation skipped", {
                enabled: STATE.settings.enabled,
                hasDictionary: Boolean(STATE.dictionary),
            });
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
            return;
        }

        const paragraphs = getParagraphBoxes();
        STATE.trackedParagraphs = paragraphs;
        const renderMode = adapterRenderMode(adapter);
        if (renderMode === "overlay") {
            clearOverlayAnnotations();
            syncOverlayTypography(getOverlayRoot());
        } else {
            removeOverlayAnnotations();
        }

        const wordLists = paragraphs.map((paragraph) => getWordElements(paragraph));
        const wordRecordLists = wordLists.map((words) => createWordRecords(words, renderMode === "overlay"));
        const nextPromptSignature = adapter.buildPromptSignature(paragraphs, wordRecordLists);

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
            return;
        }

        const summaries = paragraphs.map((paragraph, index) =>
            annotateParagraph(paragraph, index, wordRecordLists[index], renderMode)
        );
        const totalWords = summaries.reduce((sum, item) => sum + item.wordCount, 0);
        const totalMatches = summaries.reduce((sum, item) => sum + item.matchedCount, 0);

        STATE.lastPromptSignature = nextPromptSignature;

        log("Annotation pass complete", {
            site: adapter.key,
            paragraphCount: paragraphs.length,
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
            let sawRelevantChange = false;
            let shouldAnnotateDirectly = false;

            for (const mutation of mutations) {
                if (mutationOnlyTouchesAnnotations(mutation)) {
                    continue;
                }

                const refreshMode = adapter.mutationRefreshMode?.(mutation);
                if (refreshMode) {
                    sawRelevantChange = true;
                    shouldAnnotateDirectly = refreshMode === "annotate";
                    break;
                }

                if (adapter.mutationIsRelevant(mutation)) {
                    sawRelevantChange = true;
                    break;
                }
            }

            if (!sawRelevantChange) return;
            if (shouldAnnotateDirectly) {
                scheduleAnnotation(true);
                return;
            }

            handlePotentialPromptChange("prompt-container-mutation");
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

        window.addEventListener("resize", () => {
            if (adapterRenderMode() === "overlay") {
                if (!STATE.overlayRoot?.childElementCount || !STATE.observedPromptContainer?.isConnected) {
                    return;
                }

                scheduleAnnotation(true);
            }
        });
    }

    init().catch((error) => {
        console.error("[CCH] init failed", error);
    });
})();
