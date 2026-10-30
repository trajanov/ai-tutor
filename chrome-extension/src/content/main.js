// Wires the site adapter, the UI, and the learning rules together.
(async function () {
  const HL = globalThis.HL;
  const site = HL.getSite();
  if (!site || window.__hardLearnLoaded) return;
  window.__hardLearnLoaded = true;

  let settings = await HL.storage.getSettings();
  let state = await HL.storage.getState();

  let bypass = false;   // true while we submit our own wrapped prompt
  let busy = false;     // true while the think-first dialog is open
  let pending = null;   // { mode, before: WeakSet, sentAt } waiting for the tutor's reply
  const tags = new WeakMap(); // assistant element -> last eval tag seen
  const guarded = new Set();

  const ui = HL.createUI({
    onModeClick: changeMode,
    onReveal: () => {
      guarded.forEach((el) => el.classList.remove('hl-guarded'));
      guarded.clear();
    },
    onRedo: () =>
      sendWrapped({
        mode: 'hint',
        question: 'That reply gave away too much. Give me only a hint for the next step, without the answer.',
        attempt: '',
      }),
  });

  const render = () => ui.render({ settings, state, connected: !!site.composer() });
  const saveState = () => HL.storage.setState(state);
  render();

  chrome.storage.onChanged.addListener(async () => {
    settings = await HL.storage.getSettings();
    state = await HL.storage.getState();
    if (!settings.enabled) {
      // Switched off from the popup: stop watching for a reply and unhide anything we guarded.
      pending = null;
      guarded.forEach((el) => el.classList.remove('hl-guarded'));
      guarded.clear();
    }
    render();
  });

  // ---- Mode switching: less help is always allowed; more help is earned one step at a time.
  async function changeMode(target) {
    const cur = HL.MODES.indexOf(settings.mode);
    const next = HL.MODES.indexOf(target);
    if (next === cur) return;
    if (next > HL.MODES.indexOf(settings.maxHelpMode)) return;

    if (next > cur) {
      if (state.attemptsSinceEscalation < 1) {
        ui.notice('<b>Try first.</b> Send an attempt in this mode to unlock more help.', { timeout: 6000 });
        return;
      }
      if (next > cur + 1) {
        ui.notice(`<b>One step at a time.</b> Next level up is ${HL.MODE_INFO[HL.MODES[cur + 1]].label}.`, { timeout: 6000 });
        return;
      }
      state.attemptsSinceEscalation = 0;
      await saveState();
    }
    settings.mode = target;
    await HL.storage.setSettings({ mode: target });
    render();
  }

  // ---- Sending
  function shouldIntercept() {
    if (bypass || !settings.enabled) return false;
    if (busy) return true;
    const text = site.getText().trim();
    return text.length > 0 && !text.includes(HL.MARKER);
  }

  function block(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Enter' || e.shiftKey || e.altKey || e.isComposing) return;
      if (!site.isInComposer(e.target)) return;
      if (!shouldIntercept()) return;
      block(e);
      handleSend();
    },
    true
  );

  window.addEventListener(
    'click',
    (e) => {
      if (!(e.target instanceof Element) || !site.isSendButton(e.target)) return;
      if (!shouldIntercept()) return;
      block(e);
      handleSend();
    },
    true
  );

  async function handleSend() {
    if (busy) return;
    const question = site.getText().trim();
    const mode = settings.mode;
    let attempt = '';

    if (settings.requireAttempt) {
      busy = true;
      const res = await ui.askAttempt({ mode, question });
      busy = false;
      if (!res) {
        site.composer()?.focus();
        return;
      }
      attempt = res.attempt;
    }
    await sendWrapped({ mode, question, attempt });
  }

  async function sendWrapped({ mode, question, attempt }) {
    const prompt = HL.buildPrompt({
      mode,
      question,
      attempt,
      firstInChat: site.userMessages().length === 0,
    });

    try {
      await site.setText(prompt);
    } catch (err) {
      ui.notice('Could not write to the chat box on this page. ' + err.message);
      return;
    }

    pending = { mode, before: new WeakSet(site.assistantMessages()), sentAt: Date.now() };
    bypass = true;
    const ok = await site.submit();
    setTimeout(() => (bypass = false), 300);
    if (!ok) {
      pending = null;
      ui.notice('Could not find the send button. Your wrapped prompt is in the chat box: press send yourself.');
      return;
    }

    state.attemptsSinceEscalation += 1;
    await saveState();
    render();
  }

  // ---- Watching the conversation
  function collapseWrappers() {
    for (const msg of site.userMessages()) {
      if (!msg.textContent.includes(HL.MARKER)) continue;
      const m = msg.textContent.match(/⟦Hard Learn · (\w+) mode⟧/);
      if (m) msg.setAttribute('data-hl-mode', m[1]);

      const walker = document.createTreeWalker(msg, NodeFilter.SHOW_TEXT);
      let hiding = false;
      for (let n; (n = walker.nextNode()); ) {
        if (!hiding) {
          const i = n.nodeValue.indexOf(HL.MARKER);
          if (i < 0) continue;
          hiding = true;
          const before = n.nodeValue.slice(0, i).trimEnd();
          if (before) {
            n.nodeValue = before;
            continue;
          }
        }
        hideText(n);
      }
    }
  }

  function hideText(n) {
    const p = n.parentElement;
    if (p && p.childNodes.length === 1 && p.closest('[data-hl-mode]') !== p) p.classList.add('hl-hidden-line');
    else n.nodeValue = '';
  }

  // Removes [[eval:...]] tags from the rendered reply, even when streaming split them
  // across several text nodes. Returns the last tag found.
  function stripEvalTags(el) {
    const nodes = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n; (n = walker.nextNode()); ) nodes.push(n);
    const full = nodes.map((n) => n.nodeValue).join('');

    let last = null;
    const ranges = [];
    for (const m of full.matchAll(HL.EVAL_RE)) {
      last = m[1].toLowerCase();
      ranges.push([m.index, m.index + m[0].length]);
    }
    if (!ranges.length) return null;

    let pos = 0;
    for (const n of nodes) {
      const start = pos;
      const end = pos + n.nodeValue.length;
      pos = end;
      let v = n.nodeValue;
      for (const [a, b] of ranges.slice().reverse()) {
        if (b <= start || a >= end) continue;
        v = v.slice(0, Math.max(a, start) - start) + v.slice(Math.min(b, end) - start);
      }
      if (v !== n.nodeValue) n.nodeValue = v;
    }
    return last;
  }

  function scan() {
    collapseWrappers();
    for (const el of site.assistantMessages()) {
      const t = stripEvalTags(el);
      if (t) tags.set(el, t);
    }
  }

  let scanQueued = false;
  new MutationObserver(() => {
    if (scanQueued) return;
    scanQueued = true;
    setTimeout(() => {
      scanQueued = false;
      scan();
    }, 150);
  }).observe(document.body, { childList: true, subtree: true, characterData: true });

  // Poll for the tutor's reply to finish streaming, then grade and guard it.
  let lastText = '';
  let stableSince = 0;
  setInterval(() => {
    render();
    if (!pending) return;
    if (Date.now() - pending.sentAt > 180000) {
      pending = null;
      return;
    }
    const reply = site.assistantMessages().filter((el) => !pending.before.has(el)).pop();
    if (!reply) return;

    const text = reply.innerText;
    if (text !== lastText) {
      lastText = text;
      stableSince = Date.now();
      return;
    }
    if (!text.trim() || site.isStreaming() || Date.now() - stableSince < 1500) return;

    const p = pending;
    pending = null;
    lastText = '';
    finishReply(reply, text, p.mode);
  }, 500);

  async function finishReply(el, text, mode) {
    scan();
    const tag = tags.get(el);
    const s = HL.adaptive.score(tag);

    if (s !== undefined) {
      state.history = [...state.history, { s, t: Date.now() }].slice(-50);
      state.gradedSinceAdapt += 1;
      const label = { correct: 'correct ✓', partial: 'partly right', wrong: 'not right yet' }[tag];

      const rec = settings.autoAdapt
        ? HL.adaptive.recommend(state.history, settings.mode, state.gradedSinceAdapt, settings.maxHelpMode)
        : null;
      if (rec) {
        const easier = HL.MODES.indexOf(rec) > HL.MODES.indexOf(settings.mode);
        state.gradedSinceAdapt = 0;
        settings.mode = rec;
        await HL.storage.setSettings({ mode: rec });
        ui.notice(
          easier
            ? `This is tough right now: switched to <b>${HL.MODE_INFO[rec].label}</b> for more support.`
            : `You're doing well: switched to <b>${HL.MODE_INFO[rec].label}</b> to keep it challenging.`,
          { timeout: 9000 }
        );
      } else {
        ui.notice(`Tutor's check on your attempt: <b>${label}</b>`, { timeout: 6000 });
      }
      await saveState();
    }

    if (settings.guardLeaks && (mode === 'hint' || mode === 'coach')) {
      const reasons = HL.detectLeak(text);
      if (reasons.length) {
        el.classList.add('hl-guarded');
        guarded.add(el);
        ui.leakNotice(reasons);
      }
    }
    render();
  }

  scan();
  console.info('[HardLearn] active on', site.name);
})();
