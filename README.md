# Charachorder Chording Hints

Chrome extension that loads Charachorder chords to an internal library, either via serial connection to a CharaChorder device or JSON export, and shows matching chord hints above words. 

Currently works with:
- [Entertrained](https://www.entertrained.app)


## Installation
Getting it from the Chrome Web Store would be the easiest method that'll also keep the extension up-to-date, but it's currently undergoing submission review approval.

Until then, you can download the repo (unzipping it if necessary, depending on how you downloaded it). After that:

1. Open any chromium browser and go to your manage extensions page.
2. Turn on Developer Mode.
3. Click on `Load Unpacked` and select the now-unzipped extension.
4. Aaaaand, that should be it.

## Setup
1. Go to the extension's Options Menu (either via right-click menu or by clicking on the extension icon and clicking on the Sync Chords/Options Menu button there)
2. Click on the Sync Chords button
3. You'll be prompted to select your CCOS device (ex. CharaChorder 2.1, MasterForge, CharaChorder Lite, etc). Find and select it from the list.
4. Wait for your chord library to load

## Usage
1. Go to any supported website
2. Start a typing test
3. See the chording hints!
4. If you don't see the hints, click on the extension icon in your toolbar and make sure it's on (the Power button should be green).

## Troubleshooting
### Unable to connect to CCOS device to load chord library
If, for whatever reason, you can't connect to your CCOS device:
1. Export your chord library to a JSON format (likely from [the CharaChorder.io site](https://master.dev.charachorder.io/config/chords/)
2. From this extension's Options page, find your JSON chord file via the `Choose File` button next to the `Import JSON` button
3. `Import JSON` and wait for your chords to load.

## Bug Reports, Feature Requests, Etc.
If you have any issues, either use the tools that GitHub provides or find me on the official CharaChorder Discord channel.

____

<a href="https://ko-fi.com/itsdaijoebu"><img src="images/kofi_button.png" alt="Support me on Ko-Fi" width="160"></a>
