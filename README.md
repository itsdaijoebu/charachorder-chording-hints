# Entertrained Charachorder Hints

Chrome extension that loads a Charachorder chord JSON export and shows matching chord hints above words on Entertrained prompt pages.

## Install

1. Download and unzip this project.
2. Open `chrome://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked**.
5. Select the unzipped `entertrained-charachorder-hints` folder.

## Use

1. Open the extension's options page.
2. Import your Charachorder chord JSON file, or paste the JSON directly.
3. Save any display settings you want.
4. Visit an Entertrained prompt page, such as a `/prompt/...` URL.

## Current page targeting

The content script currently targets Entertrained prompt markup shaped like this:

- paragraph container: `.p-box`
- words: `:scope > p > .word`
- letters inside words: `.letter`

## Special-token icons

Special input tokens are loaded from icon files inside the extension's `icons/` folder.

Current filename mapping:

- `dup_all` → `icons/dup_all.svg`
- `dup_left` → `icons/dup.svg`
- `dup_right` → `icons/dup.svg`
- `left_shift` → `icons/shift.svg`
- `right_shift` → `icons/shift.svg`
- `arpeggiate` → `icons/arpeggiate.svg`

To replace an icon, keep the same filename and swap in your own SVG file.

## Debugging

If you enable debug logging in the options page, the content script writes `[CCH]` logs to the page console.


## Icon coloring

Icons are rendered via CSS masks, so they inherit the current text color automatically.


Reference placeholder files may be present as dotfiles inside `icons/` (for example `.dup.svg`). These are just reminders of expected filenames and are not referenced by the code. The extension still expects the real non-dot filenames such as `dup.svg`, `shift.svg`, and `arpeggiate.svg` to exist when used.
