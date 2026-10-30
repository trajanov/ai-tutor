# Hard Learn — Chrome Extension Plan

A Chrome extension (Manifest V3) that sits on top of **chatgpt.com** and **gemini.google.com** and turns them into learning tools: hints before answers, think-first prompts, and adaptive difficulty.

Source concept: hint-first AI (Bastani et al., 2025), cognitive forcing functions (Buçinca et al., 2021), the 85% rule (Wilson et al., 2019), and "protective default, not opt-in."

---

## 1. What is technically possible

| Capability | Possible? | How | Reliability |
|---|---|---|---|
| Add a mode switcher (Answer / Explain / Hint / Coach) to the chat UI | Yes | Content script injects a floating toolbar near the composer | High |
| Rewrite the user's prompt before it is sent (wrap it in mode instructions) | Yes | Intercept Enter / send-button click, edit the composer text, then submit | Medium: depends on the site's editor DOM |
| Make the user write their own attempt first (think-first gate) | Yes | Block send until an "Your attempt / your guess" field is filled; prepend it to the prompt | High (it's our own UI) |
| Hide the AI's answer until the user commits to a judgement | Yes | MutationObserver on new assistant messages → blur/collapse until the user clicks "I've decided: …" | Medium-high |
| Check whether the AI leaked a full answer in Hint/Coach mode | Partly | Heuristics (code blocks, "the answer is", final numbers, length), plus a "too much help?" button that asks the model to redo it | Medium |
| Adaptive mode (aim for ~85% correct) | Yes | Track the user's self-reported or AI-graded correctness per topic in `chrome.storage`; move one mode up or down | Medium: grading by the model is imperfect |
| Make protection non-optional (school/enterprise) | Yes | Chrome Enterprise policy: force-install the extension + `chrome.storage.managed` schema to lock the minimum mode and hide the "Answer" option | High on managed Chromebooks/devices |
| Change the hidden system prompt / model behaviour directly | No | We can't touch the server side. Only option is per-message prompt wrapping (or the user's own Custom Instructions / Gems) | n/a |
| Stop users from bypassing (another browser, incognito, phone app) | No (unmanaged) / Mostly (managed) | Managed policy can block incognito and other browsers on school devices; on personal devices the extension can only help | n/a |

**Two ways to steer the model; we use both:**
1. **Per-message wrapping (main mechanism).** Every send gets a short, mode-specific instruction block. It's reapplied every turn, so it survives long chats and the model forgets less.
2. **One-time setup helper (optional).** Generate text the user can paste into ChatGPT Custom Instructions / a Project, or a Gemini Gem, as a second layer.

We deliberately **do not** intercept `fetch`/network requests to edit API payloads: it's brittle, closer to ToS grey areas, and DOM-level wrapping is visible and honest to the user.

---

## 2. Site integration details (to verify in a spike)

Selectors change often, so they live in one config file per site (`sites/chatgpt.js`, `sites/gemini.js`) with fallbacks.

- **ChatGPT** (`chatgpt.com`, `chat.openai.com`): composer is a ProseMirror `contenteditable` (historically `#prompt-textarea`); send button `[data-testid="send-button"]`; assistant messages `[data-message-author-role="assistant"]`.
- **Gemini** (`gemini.google.com`): composer is a Quill editor inside `rich-textarea` (`.ql-editor`); send button has an aria-label like "Send message"; responses live in `model-response` / `message-content` elements.

Text insertion into these editors has to go through events the editor listens to (`document.execCommand('insertText')` or a synthetic `InputEvent`/paste), not by setting `.innerText` directly. Otherwise the framework's state never sees the change. **That's the main technical risk, and the first spike should prove it on both sites.**

---

## 3. Learning modes (prompt templates)

Each mode wraps the user's message like this:

```
[LEARNING MODE: HINT]
You are a tutor. Rules: <mode rules>
Student's own attempt: <attempt or "none given">
Student's question: <original text>
```

| Mode | Model is told to… | Extension UI behaviour |
|---|---|---|
| **Answer** | Give the full solution. | Can be disabled by policy; asks for "your guess first" (think-first) before revealing. |
| **Explain** | Give the solution with worked reasoning, then end with one check question. | Think-first gate on. |
| **Hint** (default) | Give only the next step. Never the final answer. End by asking the student to try it. | An attempt is required before the first hint on each problem. |
| **Coach** | Only ask questions and give feedback on the student's reasoning. No solutions, no steps. | Attempt required; leak detector strictest. |

Escalation is **earned, not toggled**: "Give me more help" moves up one level only after the student has submitted a new attempt. That follows "protection cannot depend on user choice."

---

## 4. Adaptive help (85% rule)

1. **Diagnose:** on a new topic, the extension prompts the model to ask 2–3 quick check questions before helping.
2. **Track:** after each student attempt, the model ends its reply with a machine-readable tag such as `<<eval:correct>>`, `<<eval:partial>>` or `<<eval:wrong>>`. The content script parses the tag and hides it from view. Fallback: 👍/👎 self-report buttons.
3. **Adjust:** keep a rolling window (last ~10 attempts) per topic:
   - success > 90% → move toward **Coach** (less help, harder)
   - success < 75% → move toward **Explain** (more help)
   - otherwise stay put (target ≈ 85%)
4. Show a small "challenge meter" so the student sees *why* the help level changed.

---

## 5. Architecture

```
hard-learn-chrome/
  manifest.json            MV3; host_permissions for chatgpt.com, gemini.google.com
  src/
    content/
      main.js              boots the right site adapter, mounts the UI
      sites/chatgpt.js     selectors + insertText/submit/observeResponses
      sites/gemini.js      same interface
      composer-gate.js     intercepts send, shows think-first panel, wraps prompt
      response-guard.js    blur-until-commit, eval-tag parsing, leak heuristics
      ui/                  toolbar + panels (Shadow DOM so site CSS can't break it)
    core/
      modes.js             prompt templates per mode
      adaptive.js          rolling success rate → mode recommendation
      storage.js           chrome.storage.local + chrome.storage.managed merge
    options/               settings page (hidden/locked fields when policy-managed)
    popup/                 current mode, stats
  managed_schema.json      enterprise policy schema (minMode, allowAnswerMode, requireAttempt…)
```

Site adapter interface (same for every site, so adding Claude.ai / Copilot later is cheap):
`getComposer() · getText() · setText(t) · submit() · onSendAttempt(cb) · onAssistantMessage(cb)`

No backend for the MVP. Everything stays local, so there are no student-data privacy issues.

---

## 6. Phased roadmap

**Phase 0: Spike (1–2 days)**
- Prove on both sites: intercept send → rewrite text → submit, and detect new assistant messages.

**Phase 1: MVP**
- Mode toolbar (Hint is the default), prompt wrapping, think-first attempt panel, escalation only after a new attempt.

**Phase 2: Guarding**
- Blur-until-commit for Answer/Explain, a leak-detector heuristic, a "that was too much help" redo button.

**Phase 3: Adaptive**
- Eval tags, per-topic success tracking, auto mode selection, challenge meter.

**Phase 4: Institutional**
- `chrome.storage.managed` policy, locked settings, admin docs for the Google Admin console force-install.

**Phase 5 (optional)**
- More sites (claude.ai, Copilot), export of learning stats, teacher dashboard (this would need a backend and a privacy review).

---

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Site DOM changes break the extension | Isolated adapters, multiple fallback selectors, a "health check" that shows a warning badge if the composer isn't found |
| Model ignores "hint only" and gives the answer anyway | Instructions are re-sent every turn, leak heuristics + blur, redo button |
| Student deletes the wrapper text or pastes around it | The wrapper is added at send time (invisible while typing), so there's nothing to delete. In managed mode the gate can't be skipped |
| Student just turns the extension off | Unmanaged: accepted limitation. Managed: force-install + policy lock |
| Wrapped prompts show up in chat history | Keep the wrapper short and labelled (`[Learning mode: Hint]`), and optionally collapse it visually in the transcript |
| ToS concerns | Only automates what the user could type themselves; no scraping, no API abuse |

---

## 8. Open decisions

1. Target audience first: students (Hint default) or professionals (think-first/Answer with gate)?
2. Plain JS vs TypeScript + Vite build (recommend: TypeScript + Vite + `@crxjs/vite-plugin`)?
3. Is the institutional/managed-policy track in scope now or later?
