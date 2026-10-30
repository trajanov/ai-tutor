// Site adapters. Selectors are lists: the first match wins, so we can keep old and
// new layouts side by side as the sites change.
var HL = globalThis.HL || (globalThis.HL = {});

const SITES = {
  chatgpt: {
    host: /(^|\.)chatgpt\.com$|(^|\.)chat\.openai\.com$/,
    composer: ['#prompt-textarea', '.ProseMirror[contenteditable="true"]', 'textarea[name="prompt"]'],
    send: [
      '[data-testid="send-button"]',
      'form button[type="submit"]',
      'button[aria-label="Send"]',
      'button[aria-label="Send message"]',
    ],
    assistant: '[data-message-author-role="assistant"], [data-dil-source-message-id]',
    user: '[data-message-author-role="user"], [data-user-message-bubble]',
    stop: '[data-testid="stop-button"], button[aria-label*="Stop"]',
  },
  gemini: {
    host: /(^|\.)gemini\.google\.com$/,
    composer: ['rich-textarea .ql-editor[contenteditable="true"]', 'rich-textarea [contenteditable="true"]'],
    send: ['button[aria-label="Send message"]', 'button.send-button'],
    assistant: 'model-response',
    user: 'user-query',
    stop: 'button[aria-label*="Stop"]',
  },
};

const first = (sels, root = document) => {
  for (const s of sels) {
    const el = root.querySelector(s);
    if (el) return el;
  }
  return null;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

HL.getSite = function () {
  const entry = Object.entries(SITES).find(([, s]) => s.host.test(location.hostname));
  if (!entry) return null;
  const [name, cfg] = entry;

  return {
    name,

    composer() {
      return first(cfg.composer);
    },

    sendButton() {
      return first(cfg.send);
    },

    isSendButton(el) {
      return !!el.closest?.(cfg.send.join(','));
    },

    isInComposer(el) {
      const c = this.composer();
      return !!(c && el && (c === el || c.contains(el)));
    },

    getText() {
      const c = this.composer();
      if (!c) return '';
      return (c.value !== undefined ? c.value : c.innerText).replace(/ /g, ' ');
    },

    // Replaces the composer text through events the editor listens to, so the
    // site's own state (React/ProseMirror/Quill) sees the change.
    async setText(text) {
      const c = this.composer();
      if (!c) throw new Error('composer not found');
      c.focus();

      if (c.tagName === 'TEXTAREA') {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
        setter.call(c, text);
        c.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }

      const selectAll = () => {
        const range = document.createRange();
        range.selectNodeContents(c);
        const sel = getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      };

      // Paste keeps line breaks in both ProseMirror and Quill.
      selectAll();
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      c.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      await sleep(50);
      if (norm(this.getText()) === norm(text)) return;

      selectAll();
      document.execCommand('insertText', false, text);
      await sleep(50);
    },

    async submit() {
      for (let i = 0; i < 20; i++) {
        const b = this.sendButton();
        if (b && !b.disabled && b.getAttribute('aria-disabled') !== 'true') {
          b.click();
          return true;
        }
        await sleep(100);
      }
      return false;
    },

    assistantMessages() {
      return [...document.querySelectorAll(cfg.assistant)].filter(
        (el) => !el.parentElement?.closest(cfg.assistant)
      );
    },

    userMessages() {
      return [...document.querySelectorAll(cfg.user)].filter((el) => !el.parentElement?.closest(cfg.user));
    },

    isStreaming() {
      return !!document.querySelector(cfg.stop);
    },
  };
};

const norm = (s) => s.replace(/\s+/g, ' ').trim();
