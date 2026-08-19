// CrazyGames SDK v3 wrapper — safe no-op fallbacks when SDK unavailable (local dev)
let sdk = null;
let inited = false;

export async function initSDK() {
  try {
    if (window.CrazyGames && window.CrazyGames.SDK) {
      await window.CrazyGames.SDK.init();
      sdk = window.CrazyGames.SDK;
      inited = true;
    }
  } catch (e) {
    console.warn('CrazyGames SDK init failed (local dev?)', e);
  }
  return inited;
}

export function sdkAvailable() { return inited; }

export function gameplayStart() {
  try { if (sdk) sdk.game.gameplayStart(); } catch (e) {}
}

export function gameplayStop() {
  try { if (sdk) sdk.game.gameplayStop(); } catch (e) {}
}

export function loadingStart() {
  try { if (sdk) sdk.game.loadingStart(); } catch (e) {}
}

export function loadingStop() {
  try { if (sdk) sdk.game.loadingStop(); } catch (e) {}
}

export function happytime() {
  try { if (sdk) sdk.game.happytime(); } catch (e) {}
}

// Returns a promise resolving to true if the ad finished (grant reward), false otherwise.
export function requestAd(type, { onStart, onFinish } = {}) {
  return new Promise((resolve) => {
    if (!sdk) { resolve(type !== 'rewarded'); return; } // local dev: midgame "succeeds", rewarded fails
    const callbacks = {
      adStarted: () => { if (onStart) onStart(); },
      adFinished: () => { if (onFinish) onFinish(); resolve(true); },
      adError: (e) => { if (onFinish) onFinish(); resolve(false); },
    };
    try { sdk.ad.requestAd(type, callbacks); }
    catch (e) { if (onFinish) onFinish(); resolve(false); }
  });
}

export function getMuteSetting() {
  try { return sdk ? !!sdk.game.settings.muteAudio : false; } catch (e) { return false; }
}

export function onSettingsChange(fn) {
  try { if (sdk) sdk.game.addSettingsChangeListener(fn); } catch (e) {}
}

// Persistent best score: SDK data module (cross-device) with localStorage fallback
export function loadBest() {
  try {
    if (sdk) {
      const v = sdk.data.getItem('bestScore');
      if (v != null) return parseInt(v, 10) || 0;
    }
  } catch (e) {}
  try { return parseInt(localStorage.getItem('skystack.best') || '0', 10) || 0; } catch (e) { return 0; }
}

export function saveBest(score) {
  try { if (sdk) sdk.data.setItem('bestScore', String(score)); } catch (e) {}
  try { localStorage.setItem('skystack.best', String(score)); } catch (e) {}
}
