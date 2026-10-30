// Floating panel + think-first dialog, rendered in a Shadow DOM so site CSS can't touch it.
var HL = globalThis.HL || (globalThis.HL = {});

const CSS = `
:host { all: initial; }
* { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
.panel, .dialog {
  --bg: #ffffff; --fg: #1d1d1f; --muted: #6b6b70; --line: #e3e3e8; --accent: #4f46e5; --accent-fg: #fff;
  --warn-bg: #fff7e6; --warn-line: #f5c26b; --good: #16a34a; --bad: #dc2626;
}
.panel {
  position: fixed; right: 16px; bottom: 120px; z-index: 2147483646; width: 260px;
  background: var(--bg); color: var(--fg); border: 1px solid var(--line); border-radius: 14px;
  box-shadow: 0 8px 28px rgba(0,0,0,.14); font-size: 13px; line-height: 1.4;
}
@media (prefers-color-scheme: dark) {
  .panel, .dialog { --bg: #232326; --fg: #f2f2f4; --muted: #a1a1a8; --line: #3a3a3f; --accent: #8b85ff; --accent-fg: #111;
    --warn-bg: #3a2f17; --warn-line: #8a6a2a; }
}
.head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; cursor: pointer; user-select: none; }
.title { font-weight: 650; flex: 1; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--good); }
.dot.off { background: var(--bad); }
.chev { color: var(--muted); }
.body { padding: 0 12px 12px; display: grid; gap: 10px; }
.panel.collapsed .body { display: none; }
.modes { display: grid; grid-template-columns: repeat(4, 1fr); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
.modes button { all: unset; text-align: center; padding: 7px 0; cursor: pointer; font-size: 12px; color: var(--fg); }
.modes button + button { border-left: 1px solid var(--line); }
.modes button.on { background: var(--accent); color: var(--accent-fg); font-weight: 600; }
.modes button.locked { opacity: .4; }
.modes button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.desc, .small { color: var(--muted); font-size: 12px; }
.meter { height: 6px; background: var(--line); border-radius: 3px; position: relative; overflow: hidden; }
.meter i { position: absolute; inset: 0 auto 0 0; background: var(--accent); border-radius: 3px; }
.meter b { position: absolute; top: 0; bottom: 0; left: 85%; width: 2px; background: var(--fg); opacity: .5; }
.row { display: flex; justify-content: space-between; gap: 8px; }
.notice { background: var(--warn-bg); border: 1px solid var(--warn-line); border-radius: 10px; padding: 8px 10px; display: grid; gap: 8px; }
.notice:empty { display: none; }
.btns { display: flex; gap: 6px; flex-wrap: wrap; }
.btn { all: unset; cursor: pointer; padding: 6px 10px; border-radius: 8px; border: 1px solid var(--line); font-size: 12px; color: var(--fg); background: var(--bg); }
.btn.primary { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); font-weight: 600; }
.btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }

.backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 2147483647; display: grid; place-items: center; padding: 16px; }
.dialog {
  background: var(--bg); color: var(--fg); width: min(520px, 100%); border-radius: 16px; padding: 18px; display: grid; gap: 12px;
  box-shadow: 0 20px 60px rgba(0,0,0,.3); font-size: 14px;
}
.dialog h2 { margin: 0; font-size: 17px; }
.dialog p { margin: 0; color: var(--muted); }
.q { background: color-mix(in srgb, var(--line) 50%, transparent); border-radius: 8px; padding: 8px 10px; max-height: 90px; overflow: auto; white-space: pre-wrap; font-size: 13px; }
textarea { width: 100%; min-height: 110px; resize: vertical; border: 1px solid var(--line); border-radius: 10px; padding: 10px;
  font-size: 14px; background: var(--bg); color: var(--fg); }
textarea:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
label { display: flex; gap: 8px; align-items: center; color: var(--muted); font-size: 13px; }
.err { color: var(--bad); font-size: 12px; min-height: 1em; }
.actions { display: flex; justify-content: flex-end; gap: 8px; }
`;

const ATTEMPT_COPY = {
  coach:   { h: 'Show your thinking first', p: 'Write what you think or have tried. The coach will respond to your reasoning with questions, not answers.', ph: 'My idea so far is…' },
  hint:    { h: 'Try first, then get a hint', p: 'Write your attempt or where you are stuck. You will get only the next step.', ph: 'I tried… / I think the first step is… / I am stuck at…' },
  explain: { h: 'Think first: what is your answer?', p: 'Commit to your own answer or guess before you see the explanation.', ph: 'My answer is… because…' },
  answer:  { h: 'Think first: what is your answer?', p: 'Commit to your own answer or guess before you see the solution. You will compare the two.', ph: 'My answer is… because…' },
};

const MIN_ATTEMPT_CHARS = 12;

HL.createUI = function ({ onModeClick, onReveal, onRedo }) {
  const host = document.createElement('hard-learn-root');
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${CSS}</style>
    <div class="panel" part="panel">
      <div class="head" role="button" tabindex="0" aria-expanded="true">
        <span class="dot" title="Connected to the chat"></span>
        <span class="title">Hard Learn</span>
        <span class="mode-label small"></span>
        <span class="chev">▾</span>
      </div>
      <div class="body">
        <div class="modes" role="radiogroup" aria-label="Learning mode">
          ${HL.MODES.map((m) => `<button role="radio" data-mode="${m}">${HL.MODE_INFO[m].label}</button>`).join('')}
        </div>
        <div class="desc"></div>
        <div>
          <div class="row small"><span>Success (last 10)</span><span class="rate">–</span></div>
          <div class="meter" title="Target: about 85%"><i></i><b></b></div>
        </div>
        <div class="notice" aria-live="polite"></div>
        <div class="small status"></div>
      </div>
    </div>`;

  // Keep keystrokes inside our UI from reaching the site's global shortcuts.
  for (const t of ['keydown', 'keyup', 'keypress', 'input', 'paste']) {
    root.addEventListener(t, (e) => e.stopPropagation());
  }

  const $ = (s) => root.querySelector(s);
  const panel = $('.panel');
  const head = $('.head');
  const toggle = () => {
    panel.classList.toggle('collapsed');
    head.setAttribute('aria-expanded', String(!panel.classList.contains('collapsed')));
  };
  head.addEventListener('click', toggle);
  head.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle()));

  $('.modes').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-mode]');
    if (b) onModeClick(b.dataset.mode);
  });

  document.documentElement.appendChild(host);

  let noticeTimer;

  return {
    host,

    render({ settings, state, connected }) {
      host.style.display = settings.enabled ? '' : 'none';
      const maxI = HL.MODES.indexOf(settings.maxHelpMode);
      root.querySelectorAll('.modes button').forEach((b) => {
        const i = HL.MODES.indexOf(b.dataset.mode);
        const on = b.dataset.mode === settings.mode;
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', String(on));
        b.hidden = i > maxI;
        b.classList.toggle('locked', i > HL.MODES.indexOf(settings.mode) && state.attemptsSinceEscalation < 1);
        b.title = HL.MODE_INFO[b.dataset.mode].desc;
      });
      $('.modes').style.gridTemplateColumns = `repeat(${maxI + 1}, 1fr)`;
      $('.mode-label').textContent = HL.MODE_INFO[settings.mode].label;
      $('.desc').textContent = HL.MODE_INFO[settings.mode].desc + (settings.autoAdapt ? ' · auto-adapting' : '');

      const recent = state.history.slice(-HL.adaptive.WINDOW);
      const rate = HL.adaptive.rate(state.history);
      $('.rate').textContent = rate === null ? 'no attempts yet' : `${Math.round(rate * 100)}% (${recent.length})`;
      $('.meter i').style.width = `${Math.round((rate ?? 0) * 100)}%`;

      $('.dot').classList.toggle('off', !connected);
      $('.dot').title = connected ? 'Connected to the chat' : 'Chat box not found: this page layout may not be supported yet';
      $('.status').textContent = settings.managed ? 'Settings managed by your organization' : '';
    },

    notice(html, { buttons = [], timeout } = {}) {
      clearTimeout(noticeTimer);
      const n = $('.notice');
      n.innerHTML = '';
      if (!html) return;
      const msg = document.createElement('div');
      msg.innerHTML = html;
      n.appendChild(msg);
      if (buttons.length) {
        const row = document.createElement('div');
        row.className = 'btns';
        for (const b of buttons) {
          const el = document.createElement('button');
          el.className = 'btn' + (b.primary ? ' primary' : '');
          el.textContent = b.label;
          el.addEventListener('click', () => {
            n.innerHTML = '';
            b.onClick();
          });
          row.appendChild(el);
        }
        n.appendChild(row);
      }
      panel.classList.remove('collapsed');
      if (timeout) noticeTimer = setTimeout(() => (n.innerHTML = ''), timeout);
    },

    leakNotice(reasons) {
      this.notice(`<b>This reply may give away the answer</b> (${reasons.join(', ')}). It is hidden so you can keep working on it yourself.`, {
        buttons: [
          { label: 'Ask for a hint only', primary: true, onClick: onRedo },
          { label: 'Show it anyway', onClick: onReveal },
        ],
      });
    },

    // Resolves to { attempt, inMessage } or null if cancelled.
    askAttempt({ mode, question }) {
      return new Promise((resolve) => {
        const copy = ATTEMPT_COPY[mode];
        const back = document.createElement('div');
        back.className = 'backdrop';
        back.innerHTML = `
          <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="hl-h">
            <h2 id="hl-h"></h2>
            <p class="lead"></p>
            <div class="q"></div>
            <textarea aria-label="Your attempt"></textarea>
            <label><input type="checkbox" class="inmsg"> My message above already shows my attempt</label>
            <div class="err" role="alert"></div>
            <div class="actions">
              <button class="btn cancel">Cancel</button>
              <button class="btn primary ok">Send to tutor</button>
            </div>
          </div>`;
        back.querySelector('#hl-h').textContent = copy.h;
        back.querySelector('.lead').textContent = copy.p;
        back.querySelector('.q').textContent = question;
        const ta = back.querySelector('textarea');
        ta.placeholder = copy.ph;
        const inMsg = back.querySelector('.inmsg');
        const err = back.querySelector('.err');

        const close = (val) => {
          back.remove();
          resolve(val);
        };
        const ok = () => {
          if (inMsg.checked) return close({ attempt: '', inMessage: true });
          if (ta.value.trim().length < MIN_ATTEMPT_CHARS) {
            err.textContent = 'Write a little more: a guess or where you are stuck is enough.';
            ta.focus();
            return;
          }
          close({ attempt: ta.value, inMessage: false });
        };

        back.querySelector('.ok').addEventListener('click', ok);
        back.querySelector('.cancel').addEventListener('click', () => close(null));
        back.addEventListener('click', (e) => e.target === back && close(null));
        back.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') close(null);
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) ok();
        });

        root.appendChild(back);
        setTimeout(() => ta.focus(), 0);
      });
    },
  };
};
