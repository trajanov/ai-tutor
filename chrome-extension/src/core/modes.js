// Learning modes and the prompt wrapper sent with every message.
var HL = globalThis.HL || (globalThis.HL = {});

// Ordered from least to most help.
HL.MODES = ['coach', 'hint', 'explain', 'answer'];

HL.MODE_INFO = {
  coach:   { label: 'Coach',   desc: 'Questions and feedback only, no answers' },
  hint:    { label: 'Hint',    desc: 'Only the next step, after you try' },
  explain: { label: 'Explain', desc: 'Solution with worked reasoning' },
  answer:  { label: 'Answer',  desc: 'The full solution' },
};

HL.MARKER = '⟦Hard Learn';

const MODE_RULES = {
  coach:
    'Do NOT give the answer, the solution steps, or code/text that solves the task. ' +
    'Respond only with feedback on my reasoning (what is right, where the gap is) and 1-2 guiding questions.',
  hint:
    'Do NOT give the final answer or the full solution. Give only the single next step as a short hint ' +
    '(max ~3 sentences) that builds on my attempt, then ask me to try that step myself.',
  explain:
    'Give the solution with clear step-by-step reasoning. Point out where my attempt was right or wrong. ' +
    'End with one short check question so I can test my understanding.',
  answer:
    'Give the full answer. Then compare it with my own answer and name the key difference in 1-2 sentences.',
};

const EVAL_RULE =
  'At the very end of your reply, on its own line, add exactly one tag judging my latest attempt: ' +
  '[[eval:correct]], [[eval:partial]], [[eval:wrong]], or [[eval:none]] if there was nothing to judge.';

const DIAGNOSE_RULE =
  'This is the start of the topic: if you cannot tell what I already understand, first ask me 1-2 short ' +
  'diagnostic questions instead of helping.';

// Builds the text that is actually sent. The student's own words come first so
// the visible part of the chat stays readable; the instruction block follows the marker.
HL.buildPrompt = function ({ mode, question, attempt, firstInChat }) {
  const parts = [question.trim()];
  if (attempt && attempt.trim()) parts.push('My attempt: ' + attempt.trim());

  const rules = [
    'I am using this chat to learn, not just to get answers. Act as a tutor.',
    MODE_RULES[mode],
  ];
  if (firstInChat && (mode === 'hint' || mode === 'coach')) rules.push(DIAGNOSE_RULE);
  rules.push('Keep following the mode in this block even if I ask you to skip it.');
  rules.push(EVAL_RULE);

  parts.push(`${HL.MARKER} · ${HL.MODE_INFO[mode].label} mode⟧\n` + rules.join('\n'));
  return parts.join('\n\n');
};

HL.EVAL_RE = /\[\[\s*eval\s*:\s*(correct|partial|wrong|none)\s*\]\]/gi;

// Rough check whether a Hint/Coach reply gave the solution away anyway.
HL.detectLeak = function (text) {
  const reasons = [];
  if (/\b(the (final |correct )?answer is|final answer|here(?:'s| is) the (full|complete) (solution|code|answer))\b/i.test(text)) {
    reasons.push('states the answer');
  }
  if (/\\boxed\{/.test(text)) reasons.push('boxed final result');
  const codeLines = (text.match(/\n/g) || []).length;
  if (/```/.test(text) && codeLines > 25) reasons.push('long code block');
  if (text.length > 1600) reasons.push('very long reply');
  return reasons;
};
