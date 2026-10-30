// 85% rule: keep the learner's success rate around 85% by moving one mode at a time.
var HL = globalThis.HL || (globalThis.HL = {});

HL.adaptive = {
  WINDOW: 10,
  MIN_SAMPLES: 4,
  TARGET: 0.85,
  HIGH: 0.9,  // above this the work is too easy -> less help
  LOW: 0.75,  // below this it is too hard -> more help

  score(tag) {
    return { correct: 1, partial: 0.5, wrong: 0 }[tag];
  },

  rate(history) {
    const recent = history.slice(-this.WINDOW);
    if (!recent.length) return null;
    return recent.reduce((a, h) => a + h.s, 0) / recent.length;
  },

  // Returns the mode to switch to, or null to stay. `sinceChange` is the number of
  // graded attempts since the last automatic change, so we don't flip-flop.
  recommend(history, mode, sinceChange, maxMode) {
    if (sinceChange < this.MIN_SAMPLES) return null;
    const r = this.rate(history);
    if (r === null) return null;
    const i = HL.MODES.indexOf(mode);
    if (r > this.HIGH && i > 0) return HL.MODES[i - 1];
    // Never auto-escalate to the full Answer mode.
    const cap = Math.min(HL.MODES.indexOf('explain'), HL.MODES.indexOf(maxMode));
    if (r < this.LOW && i < cap) return HL.MODES[i + 1];
    return null;
  },
};
