# Hard Learn — Measuring the Tutor's Effect (Randomized Trial Plan)

Goal: find out, with a randomized controlled trial (an A/B test), whether the Hard Learn tutor improves **what students can do on their own**, and how it affects **satisfaction**. To do that, the extension reports performance and satisfaction data to a small study service.

This plan extends `PLAN.md`. Note that `PLAN.md` §5 says "no backend, no privacy issues". The study changes that, so §6 (privacy and ethics) is a hard requirement, not an extra.

---

## 1. Research questions and hypotheses

| # | Question | Hypothesis | Type |
|---|---|---|---|
| H1 | Do students who use the tutor score higher on an **unassisted** test of the course material? | Tutor > Control | **Primary** |
| H2 | Do they remember more 3–4 weeks later? | Tutor > Control on a delayed retention test | Secondary |
| H3 | How satisfied are students with the AI help? | Tutor ≥ Control − 0.3 SD (we accept a small drop) | Secondary / guardrail |
| H4 | Do they rely less on the AI and trust their own ability more? | Tutor > Control on self-efficacy, lower on AI-dependence | Secondary |
| H5 | Who benefits most? | The effect is larger for students with lower pre-test scores | Exploratory |

Why the primary outcome must be an **unassisted** test: Bastani et al. (2025) found that unrestricted GPT access raised scores *during practice* but lowered them on the later exam without AI. Practice scores and the in-tool `[[eval:…]]` tags measure performance *with* help, so they can't show learning. They're also only produced in the tutor arm. They're used as process measures only.

---

## 2. Experimental design

### 2.1 Arms

**Main trial: two arms, 1:1.**

| Arm | What the student gets | Extension config |
|---|---|---|
| **A: Control** | Normal ChatGPT/Gemini. The extension is installed but invisible: no wrapping, no gate, no blur. It only logs usage metadata and shows the same surveys. | `arm: "control"`, behaviour off, telemetry on |
| **B: Tutor** | The full Hard Learn experience: Hint as the default, think-first gate, earned escalation, leak guard, adaptive 85% rule. | `arm: "tutor"`, settings locked |

The control arm must have the extension installed too. Otherwise the two arms would differ in data collection, survey prompts and the "I'm in a study" feeling, and the comparison would be biased.

**Optional follow-up: a 2×2 factorial** that separates the two main ideas. Run it only if the sample allows (it needs about 2× the students):

|  | Adaptive off | Adaptive on |
|---|---|---|
| **Think-first gate off** | Hint mode only | Hint + adaptive |
| **Think-first gate on** | Hint + gate | Full tutor |

### 2.2 Unit of randomization

- **Default: individual students, stratified by class.** This gives the most power for the number of students. The risk is contamination, meaning control students see a classmate's tutor. That's mild here, because the treatment is a tool on the student's own device, not teaching.
- **Switch to cluster randomization (whole classes or sections)** if teachers will refer to the tool in class, or if a school asks for one experience per class. This needs many more students (§3).

### 2.3 Randomization procedure

- **Stratified permuted blocks** (block size 4, randomly 2 or 6 to keep it unpredictable). Strata are *class × pre-test tercile (low/mid/high)*.
- The **service assigns the arm at enrollment**, after consent is recorded and the pre-test is linked. The extension never decides the arm, and nobody can see the next assignment in advance (allocation concealment).
- The assignment, the timestamp and the seed or version of the allocation list are written to an append-only table. The arm can't be changed after that. A student who reinstalls gets the same arm back.

### 2.4 Blinding

- Students can't be blinded, because the tutor is visible. The consent text says "we compare two ways the AI helps you" without saying which one is expected to be better.
- **Graders** of open-ended test answers don't know the student's arm.
- **Analysts** run the main analysis on data with the arm hidden as `X`/`Y`. The labels are unmasked only after the analysis script is frozen.

### 2.5 Timeline (per cohort)

```
Week 0      Consent, pre-test (unassisted), baseline survey, install + enroll → randomized
Weeks 1–6   Normal coursework with AI available; extension logs events; micro-surveys
Week 6      Post-test (unassisted, proctored) + end-of-study survey      ← PRIMARY
Week 9–10   Delayed retention test (unassisted)                           ← H2
```

Before the main trial: a **2-week pilot** with about 20–30 students. It tests the telemetry end to end, survey wording, uninstall/heartbeat detection, and estimates the pre/post correlation and ICC used in §3. Pilot data isn't included in the main analysis.

---

## 3. Sample size

Assumptions: two-sided α = 0.05, power 0.80. The smallest effect worth detecting is **d = 0.25**, a modest effect for an educational intervention.

| Design | Calculation | Students needed |
|---|---|---|
| Individual, no covariate | 2·(1.96+0.84)² / 0.25² ≈ 251 per arm | **~500** |
| Individual + pre-test covariate (r ≈ 0.5, so variance × 0.75) | 251 × 0.75 ≈ 190 per arm | **~380** |
| + 15% attrition | 190 / 0.85 ≈ 225 per arm | **~450** |
| Cluster (classes of 25, ICC ≈ 0.15, design effect = 1 + 24·0.15 = 4.6) | ~190 × 4.6 ≈ 875 per arm | **~1,750 (≈ 70 classes)** |

So: **use individual randomization unless you have to cluster.** The pilot replaces r and the ICC with real values. If the available sample is smaller, report the minimum detectable effect you can achieve rather than running an underpowered trial without saying so. For example, 200 students in total gives MDE ≈ 0.35 with the covariate.

---

## 4. What we measure

### 4.1 Outcomes

| Outcome | Instrument | When | Source |
|---|---|---|---|
| **Primary: post-test score** | Unassisted, proctored test on the course content, standardized (z-score within course) | Week 6 | Teacher upload |
| Delayed retention | A parallel form of the post-test | Week 9–10 | Teacher upload |
| Pre-test (covariate + stratification) | Unassisted test of prior knowledge | Week 0 | Teacher upload |
| Satisfaction (overall) | 5-item scale, 1–7 (helpfulness, ease, would keep using, recommend, overall) | End | Survey |
| Satisfaction (in the moment) | 1-tap "How useful was this reply?" 1–5, shown after ~1 in 5 replies, max 3/day | During | Extension |
| Perceived learning | 3 items, 1–7 | End | Survey |
| Self-efficacy / AI-reliance | Short validated scale (e.g. adapted MSLQ self-efficacy items + 4 reliance items) | Week 0 and end | Survey |
| Usage / engagement | Sessions, messages, active days | During | Extension |

### 4.2 Process measures (tutor arm, or both arms where marked)

- Attempts submitted, attempt length (characters, not content), escalation requests (granted/refused)
- Mode over time, automatic mode changes, `[[eval:…]]` distribution
- Leak-detector triggers, "too much help" redo clicks
- Time from reply to the student's next action *(both arms)*
- **Exposure/compliance**: a daily heartbeat and an "extension disabled/uninstalled" signal *(both arms)*. These are needed for the compliance analysis in §7.

### 4.3 Guardrail metrics (watched during the trial)

- Uninstall/disable rate per arm. **Stop rule:** a difference of more than 15 percentage points by week 2 triggers a review.
- Satisfaction below 3/7 on average in either arm
- Telemetry loss above 10% (heartbeat gaps)

---

## 5. The study service (telemetry backend)

### 5.1 Responsibilities

1. **Enroll** a participant and **assign the arm** (§2.3).
2. **Send that arm's config** to the extension.
3. **Receive event batches** and survey answers.
4. **Import** pre-/post-/retention test scores from teachers.
5. **Export** a de-identified analysis dataset.
6. **Monitor** data quality and balance. The monitor doesn't show outcomes by arm (no peeking).

### 5.2 Architecture

```
Chrome extension ──HTTPS──▶  Study API  ──▶  Postgres
  telemetry.js               (FastAPI or Node/Express,     participants, assignments (append-only),
  offline queue in           single container, EU host)    events, surveys, scores, consent_log
  chrome.storage.local                 │
                                       ├─▶ Researcher console: enrollment, balance, data-quality
                                       └─▶ Nightly export → CSV/Parquet for R/Python analysis
Teacher ──CSV upload (participant_code, score)──▶ Study API
```

### 5.3 API (v1)

| Endpoint | Body | Returns |
|---|---|---|
| `POST /v1/enroll` | `study_code, participant_code, consent_version, ext_version` | `participant_id, arm, config, token` |
| `GET  /v1/config` | (token) | current arm config (so it can be changed in an emergency without a new release) |
| `POST /v1/events` | `[{event, ts, session_id, props}]` (batch of up to 50) | `202` |
| `POST /v1/survey` | `survey_id, answers` | `202` |
| `POST /v1/admin/scores` | CSV: `participant_code, test, score` | import report |
| `GET  /v1/admin/export` | | de-identified dataset |

The **participant_code** is a random code the teacher hands out (e.g. `HL-7KQ3-2M`). The teacher keeps the only list linking codes to real names. **The service never stores names or e-mails.**

### 5.4 Event schema (metadata only, no chat content by default)

```json
{ "event": "reply_finished", "ts": "2026-11-12T09:31:07Z", "session_id": "s_…", "arm": "tutor",
  "props": { "site": "chatgpt", "mode": "hint", "eval": "partial", "leak_reasons": ["very long reply"],
             "reply_chars": 812, "attempt_chars": 140 } }
```

| Event | When (hook in `src/content/main.js`) | Arms |
|---|---|---|
| `session_start` / `heartbeat` | page load / every 24 h of activity | both |
| `message_sent` | `handleSend` / `sendWrapped` (control: the site's send) | both |
| `attempt_submitted` | attempt panel submitted | tutor |
| `mode_changed` | `changeMode` (with `reason: user|adaptive`, `granted`) | tutor |
| `reply_finished` | `finishReply` (eval tag, leak reasons, lengths) | both (control: lengths only) |
| `leak_flagged` / `redo_clicked` | leak notice / redo button | tutor |
| `micro_survey` | 1–5 rating after a reply | both |
| `extension_disabled` | detected from a missing heartbeat on the service side | both |

Chat text is **not** sent. If you later want to study *how* students ask questions, that's a separate, explicitly consented, opt-in add-on.

### 5.5 Extension changes

- `src/core/telemetry.js`: `HL.telemetry.track(event, props)`. Events are queued in `chrome.storage.local`, flushed every 30 s or at 50 events, retried with backoff, and dropped after 7 days.
- Enrollment screen in the popup: enter the participant code, show the consent summary, call `/v1/enroll`, store the token and arm.
- The arm config **overrides and locks** the settings, the same way `chrome.storage.managed` does now. In `storage.js` the merge order becomes `defaults < user < study arm < enterprise policy`.
- The control arm runs `main.js` in **observe-only mode**: no interception, no UI except micro-surveys.
- `manifest.json`: add the service origin to `host_permissions`. `managed_schema.json`: add `studyCode` and `studyEndpoint` so schools can pre-configure enrollment through policy.
- A "Leave study" button in the popup: stops telemetry and asks the service to delete the data (see §6).

---

## 6. Privacy, ethics and pre-registration

- **Ethics approval** from the faculty/university ethics committee before any data collection. If participants are under 18: parental consent + student assent.
- **Informed consent** recorded with its version (`consent_log`). Participation is voluntary and doesn't affect grades. Students can withdraw at any time, and their data is deleted on request.
- **Data protection (GDPR / North Macedonia's Law on Personal Data Protection):** pseudonymous codes, no chat content, an EU-hosted server, encryption in transit and at rest, a written retention period (e.g. destroy raw data 5 years after publication), and a DPIA because the subjects are students.
- **Fairness:** after the trial, control students get access to the tutor.
- **Pre-register** the hypotheses, primary outcome, analysis model, sample size and stopping rules (OSF or AsPredicted) **before randomizing the first student**.
- **Reporting** follows CONSORT, including a participant-flow diagram.

---

## 7. Analysis plan

1. **Primary (intention-to-treat):** everyone analysed in the arm they were assigned, whatever their usage.
   `post_z ~ arm + pre_z + stratum` (ANCOVA, robust SEs). For cluster randomization: a mixed model with a random intercept for class.
   Report the effect as Hedges' g with a 95% CI.
2. **Compliance-adjusted (secondary):** the effect for students who actually used the tutor (CACE), estimated with instrumental variables using assignment as the instrument. "Used" is defined in advance, e.g. ≥ 5 active days.
3. **Secondary outcomes:** the same model for retention, satisfaction, perceived learning and self-efficacy. Holm correction across the secondary family. Satisfaction is also tested as **non-inferiority** with a 0.3 SD margin (H3).
4. **Heterogeneity (exploratory):** an `arm × pre-test tercile` interaction, plus subject/course. Labelled as exploratory.
5. **Missing data:** report attrition by arm. Main analysis uses multiple imputation using pre-test, stratum and usage. Sensitivity checks: complete cases and worst-case bounds.
6. **Process analyses (tutor arm):** dose–response between attempts, escalations and outcome. This is correlational and clearly labelled as such.
7. **No interim efficacy peeking.** Only the guardrails in §4.3 are monitored, by someone outside the analysis team.

---

## 8. Threats to validity and mitigations

| Threat | Mitigation |
|---|---|
| Students bypass the tutor (another browser, phone, extension disabled) | ITT keeps the comparison fair. Heartbeat measures exposure for the CACE estimate. On managed devices, force-install and block incognito |
| Control students use AI however they like | That's the realistic comparison ("AI as is" vs "AI as tutor"), and usage is logged in both arms |
| Contamination between classmates | Individual randomization within class keeps it measurable. If it's a big concern, cluster instead |
| Novelty / Hawthorne effect | Both arms install the same extension and get the same surveys. The trial runs 6 weeks, not days |
| Test taken with AI | The post-test and retention test are proctored and unassisted |
| LLM eval tags are biased | They're never an outcome, only process data |
| Site DOM breaks mid-study | Health-check event + alert. Downtime is logged per arm and reported |

---

## 9. Work plan

| Step | Output | Est. |
|---|---|---|
| 1 | Pick the courses/classes, test instruments (pre/post/retention parallel forms), survey items | 2 wk |
| 2 | Ethics submission, consent forms, DPIA, pre-registration draft | 2–4 wk (in parallel) |
| 3 | Study service: enroll/assign, events, surveys, score import, export, console | 2 wk |
| 4 | Extension: `telemetry.js`, enrollment UI, arm config, observe-only control mode, micro-survey | 1–2 wk |
| 5 | Pilot (20–30 students, 2 wk) → fix, re-estimate r and ICC, finalize sample size | 3 wk |
| 6 | Freeze and submit the pre-registration → main trial (6 wk + retention test) | 10 wk |
| 7 | Blinded analysis → unmask → report | 3 wk |

---

## 10. Decisions needed

1. **Population and courses:** which courses and how many students are realistically available? That decides individual vs cluster randomization and whether the 2×2 factorial is possible.
2. **Control arm:** the "plain AI + invisible logging extension" recommended here, or a "no AI allowed" control? The latter answers a different question and is hard to enforce.
3. **Hosting:** university server vs an EU cloud VM for the study service.
4. **Chat content:** keep it out entirely (recommended), or add an opt-in substudy?
