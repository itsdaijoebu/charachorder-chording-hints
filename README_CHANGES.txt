Modified files for compound-input support in charachorder-chording-hints

Files included:
- shared.js
- options.js
- content.js
- options.css
- content.css

What changed:
- Added segmented input support in the shared entry model.
- Compound inputs can now round-trip as multiple segments and display as `segment1 + segment2`.
- JSON parsing is more permissive and now accepts flat arrays, nested arrays, strings like `them+slvs`, and several object-style input/output fields.
- Hint rendering in both the live overlay and options preview now inserts ` + ` between input segments.
- Added a `compound-input` flag in the options table for visibility.

Current assumption:
- Serial chain index remains metadata and is still ignored for hint display, per your clarification.

Additional serial fix:
- The `CML C1` parser now accepts entries whose output hex field is blank, so sync will not fail on lines like `... 001D0691A06700000000000000000000  0`.

Additional debug logging:
- Serial sync now logs the full 12 packed 10-bit input slots for entries that contain non-ASCII input codes or multiple non-zero clusters.
- The debug payload includes zero-gap indices, inferred non-zero clusters, and four display-order hypotheses so we can see whether zero runs are the real compound-chord separator.

Additional changes in this build:
- Added popup.html, popup.css, and popup.js for a toolbar popup settings UI.
- Added popup power-button styling via icons/power.svg.
- Added configurable hotkey support to shared.js, content.js, options.html, and options.js.

Note:
- The manifest.json file was not present in the provided code bundle, so the popup files are included here but I could not wire the browser-action popup entry directly in manifest.json from the files available in this workspace.
- In this build, the popup's “Sync from device” button opens the full options page, where the existing serial sync workflow already lives.
