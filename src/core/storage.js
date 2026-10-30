// Settings (user, overridable by enterprise policy) and learning state.
var HL = globalThis.HL || (globalThis.HL = {});

HL.DEFAULT_SETTINGS = {
  enabled: true,
  mode: 'hint',
  requireAttempt: true,
  autoAdapt: true,
  guardLeaks: true,
  maxHelpMode: 'answer',
  lockSettings: false,
};

HL.DEFAULT_STATE = {
  history: [],                // [{ s: 0..1, t: timestamp }]
  attemptsSinceEscalation: 0, // more help unlocks only after a new attempt
  gradedSinceAdapt: 0,
};

HL.storage = {
  async getManaged() {
    try {
      return (await chrome.storage.managed.get(null)) || {};
    } catch {
      return {}; // no policy installed
    }
  },

  async getSettings() {
    const [{ settings }, managed] = await Promise.all([
      chrome.storage.sync.get('settings'),
      this.getManaged(),
    ]);
    const s = { ...HL.DEFAULT_SETTINGS, ...settings };
    if (managed.defaultMode && !settings?.mode) s.mode = managed.defaultMode;
    for (const k of ['requireAttempt', 'autoAdapt', 'guardLeaks', 'maxHelpMode', 'lockSettings']) {
      if (managed[k] !== undefined) s[k] = managed[k];
    }
    s.managed = Object.keys(managed).length > 0;
    s.mode = HL.clampMode(s.mode, s.maxHelpMode);
    return s;
  },

  async setSettings(patch) {
    const { settings } = await chrome.storage.sync.get('settings');
    await chrome.storage.sync.set({ settings: { ...settings, ...patch } });
  },

  async getState() {
    const { state } = await chrome.storage.local.get('state');
    return { ...HL.DEFAULT_STATE, ...state };
  },

  async setState(state) {
    await chrome.storage.local.set({ state });
  },
};

HL.clampMode = function (mode, maxMode) {
  const i = HL.MODES.indexOf(mode);
  const max = HL.MODES.indexOf(maxMode);
  if (i < 0) return 'hint';
  return HL.MODES[Math.min(i, max < 0 ? HL.MODES.length - 1 : max)];
};
