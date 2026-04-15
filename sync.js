(() => {
  const STORAGE_KEYS = {
    parsedDictionary: "parsedDictionary",
    inputDisplayOverrides: "inputDisplayOverrides"
  };

  const els = {
    syncNowButton: document.getElementById("syncNowButton"),
    closeButton: document.getElementById("closeButton"),
    syncStatus: document.getElementById("syncStatus")
  };

  function setStorage(values) {
    return new Promise((resolve) => chrome.storage.local.set(values, resolve));
  }

  function setStatus(message, isError = false) {
    els.syncStatus.textContent = message || "";
    els.syncStatus.classList.toggle("error", Boolean(isError));
  }

  function setBusy(isBusy) {
    els.syncNowButton.disabled = isBusy;
    els.syncNowButton.textContent = isBusy ? "Syncing..." : "Sync chords";
    els.closeButton.disabled = isBusy;
  }

  async function syncNow() {
    try {
      setBusy(true);
      setStatus("Preparing device sync...");
      const parsedDictionary = await CCHSerialSync.fetchSerialChordmapDictionary({
        onProgress: (message) => setStatus(message)
      });
      await setStorage({
        [STORAGE_KEYS.parsedDictionary]: parsedDictionary,
        [STORAGE_KEYS.inputDisplayOverrides]: {}
      });
      setStatus(`Saved ${parsedDictionary.entryCount} chord entries from connected Charachorder.`);
    } catch (error) {
      console.error(error);
      setStatus(error.message || "Failed to sync from connected Charachorder.", true);
    } finally {
      setBusy(false);
    }
  }

  els.syncNowButton.addEventListener("click", syncNow);
  els.closeButton.addEventListener("click", () => window.close());
})();
