const KEYS = ['requireAttempt', 'autoAdapt', 'guardLeaks'];

async function load() {
  const [settings, state, managed] = await Promise.all([
    HL.storage.getSettings(),
    HL.storage.getState(),
    HL.storage.getManaged(),
  ]);

  document.getElementById('mode').textContent =
    `${HL.MODE_INFO[settings.mode].label}: ${HL.MODE_INFO[settings.mode].desc}`;

  const rate = HL.adaptive.rate(state.history);
  document.getElementById('rate').textContent = rate === null ? 'no attempts yet' : `${Math.round(rate * 100)}%`;
  document.getElementById('bar').style.width = `${Math.round((rate ?? 0) * 100)}%`;

  const enabled = document.getElementById('enabled');
  enabled.checked = settings.enabled;
  enabled.disabled = settings.lockSettings;
  document.getElementById('enabledLabel').textContent = settings.enabled ? 'on' : 'off';
  document.getElementById('main').classList.toggle('off', !settings.enabled);

  for (const k of KEYS) {
    const box = document.getElementById(k);
    box.checked = !!settings[k];
    box.disabled = settings.lockSettings || managed[k] !== undefined;
  }
  document.getElementById('managed').hidden = !settings.managed;
  document.getElementById('reset').disabled = settings.lockSettings;
}

for (const k of KEYS) {
  document.getElementById(k).addEventListener('change', (e) => HL.storage.setSettings({ [k]: e.target.checked }));
}

document.getElementById('enabled').addEventListener('change', async (e) => {
  await HL.storage.setSettings({ enabled: e.target.checked });
  load();
});

document.getElementById('reset').addEventListener('click', async () => {
  await HL.storage.setState({ ...HL.DEFAULT_STATE });
  load();
});

load();
