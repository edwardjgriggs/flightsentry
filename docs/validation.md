# Validation record

Validated locally on Windows on August 13, 2026. Session 4 and the live watsonx configuration were previously deployed after local validation. The context-integrity phase was later committed to `main` as `25ffa78` (feat: add context-aware incident decisions) and the source-evaluation phase as `2f487d6`; the audit-hardening session recorded at the end of this document remains uncommitted for owner review.

**Final development attribution:** IBM Bob was the primary development tool for the completed FlightSentry implementation. Dated engineering and independent-review sections below preserve validation chronology; confirmed review findings were finalized through the Bob-led workflow.

## Automated gates

| Gate | Result |
| --- | --- |
| ESLint | Pass, zero warnings |
| TypeScript | Pass |
| Vitest | 99 tests passed |
| Python pipeline safety | 38 tests passed |
| Next.js production build | Pass; static `/` and Node.js `/api/analyze` |
| Playwright | 7/7 Chromium scenarios passed |
| axe-core | Zero serious or critical findings |
| npm audit | Zero known vulnerabilities |

The browser workflow verifies ONNX initialization, paired event detection, telemetry-only and trusted-context decisions, counterfactual evidence removal and restoration, JSON export, expert annotations, completed-state axe analysis, keyboard activation, a 390 by 844 viewport, and reduced motion.

### Engineering session (August 13, 2026): context-integrity and incident audit phase

**Goal:** Make FlightSentry's competitive difference directly testable: telemetry detects change, deterministic context decides whether investigation remains necessary, and Granite explains only validated evidence.

**Implementation:**

- Added `context-gate-v1` with six required replay checks and explicit `PASS` or `FAIL` evidence.
- Added telemetry-only and trusted-context comparison. Telemetry-only investigates both events; trusted context monitors 609 and investigates 618.
- Added event 609 counterfactual controls. Removing either the telecommand or planned-event record raises the decision to `INVESTIGATE`; restoring both returns it to `MONITOR`.
- Added context-effectiveness metrics: one unnecessary investigation prevented, 100% rare-nominal de-escalation, 100% anomaly investigation recall, and 100% counterfactual dependency on this `n=2` paired case.
- Added versioned JSON and self-contained printable HTML decision records with detector configuration, peak scores, onset and first persistent alert, active evidence, policy checks, analysis model, uncertainty, diagnostic checks, and blank operator acknowledgement fields.
- Added explicit provenance boundaries. Command and event timing come from the verified ESA extracts. Replay-feed completeness is labeled as a fixture assertion. Command acknowledgement and subsystem mapping remain documented production gaps.
- Standardized the bounded event 618 disposition on `INVESTIGATE` and strengthened the Granite prompt so missing context alone cannot justify `ESCALATE`.
- Delayed the comparison reveal until replay completion, preventing the landing view from spoiling the paired-case result.

**New automated coverage:**

- 7 context-policy tests, including both modes, both counterfactual removals, unknown-ID rejection, and paired metrics.
- 4 export tests, including HTML escaping, policy-only telemetry export, and stale-brief suppression during counterfactuals.
- 3 new end-to-end scenarios for counterfactual decisions, decision-record download, and reduced motion. Existing axe coverage now evaluates the completed interface.

**Final gates:**

```text
npm run verify: Pass
  ESLint: zero warnings
  TypeScript: pass
  Vitest: 99/99
  Next.js production build: pass

npm run test:e2e: 7/7 Chromium
Python pipeline tests: 38/38
npm audit --audit-level=high: zero vulnerabilities
git diff --check: pass
```

**Lighthouse production-build audit:**

| Category | Score |
| --- | ---: |
| Performance | 96 |
| Accessibility | 100 |
| Best Practices | 100 |
| SEO | 100 |
| Agentic Browsing | 100 |

FCP was 1.5 s, LCP 2.7 s, TBT 50 ms, and CLS 0. Reports were regenerated at `reports/lighthouse-final.report.html` and `.json`.

**Deployment status:** Not committed, pushed, or deployed during this phase. The completed implementation was later finalized through IBM Bob.

### IBM Bob session (August 13, 2026): Session 2 (configuration artifact)

Additional tests added by this session:

- **Detector config validation (TypeScript)**: 24 new tests in `src/lib/detector-config.test.ts`: valid bundled config, weight sum, threshold range, persistence constraint, normalization version/formula mismatch, null config, empty provenance, Python-generated artifact schema compatibility (both `train_ensemble.py` and `build_demo_model.py` shapes), and paired-event regression with artifact-driven config.
- **Detector config schema (Python)**: 14 new tests in `scripts/data_pipeline/tests/test_detector_config_schema.py`: `_BUNDLED_DETECTOR_CONFIG` validation, written JSON validation, all rejection invariants, and `train_ensemble.py` config shape compatibility.

### IBM Bob session (August 13, 2026): APPROVED WITH CHANGES resolution

Additional tests added by this session:

- **Normalization parity (TypeScript)**: 5 new tests in `src/lib/detectors.test.ts` verifying that `robustNormalize` matches the Python formula `clip((z - 1.5) / 7, 0, 1)` on fixed inputs, including a regression guard that the old `z/8` formula produces different results.
- **Normalization parity (Python)**: 8 new tests in `scripts/data_pipeline/tests/test_normalization_parity.py` with identical fixed inputs, confirming Python output matches the TypeScript reference implementation.
- **Incident contract**: 5 new tests in `src/lib/incident-contract.test.ts`: MONITOR preserved for event 609 (command+plan present), MONITOR upgraded to INVESTIGATE for event 618 (no context), ESCALATE preserved, empty-ID rejection, invalid-disposition rejection.
- **Granite prompt**: 4 new tests in `src/lib/granite-prompt.test.ts`: system prompt requires MONITOR context, user content includes all evidence IDs, JSON extraction with trailing prose, empty-string rejection.

### Previous validation (August 13, 2026 baseline)

| Gate | Result |
| --- | --- |
| Vitest | 16 tests passed |
| Python pipeline safety | 3 tests passed |

### IBM Bob session (August 13, 2026): Session 3 (Granite hardening and safety boundaries)

**Goal:** Harden the Granite integration and prove its safety and failure boundaries.

**Initial implementation (first pass):**
Bob implemented the MONITOR guard fix, comprehensive Granite tests, incident-contract tests, and route tests. First `npm run test` run: 5 failed, 77 passed (four timer timeouts and ineffective 500 mock). Bob's first revisions produced 81 passing tests but removed the required AbortError proof and weakened the 500 test.

**Review findings and corrections:**
Human review rejected the first green run (81 tests). Bob implemented follow-up corrections:

1. **Timeout test missing:** Initial implementation replaced hanging-promise timeout tests with generic transport error. Added deterministic AbortError test with fake timers.
2. **Route 500 test invalid:** Initial test called normal path and asserted 200. Added dependency-injection factory `createPOSTHandler()` to enable real 500 error testing.
3. **Fallback message leakage:** `lastError.message` was embedded in public fallback, potentially exposing sensitive details. Sanitized to generic "failed after one retry" message.
4. **IAM token leakage test weak:** Initial test used only IAM call without watsonx success. Strengthened to use full successful watsonx response and verify source="watsonx".
5. **ESLint warning:** Unused `error` variable in catch block. Removed to fix warning.

**Files changed:**
- `src/lib/incident-contract.ts`: Fixed MONITOR disposition guard to require BOTH telecommand AND planned-event evidence (not just one)
- `src/lib/incident-contract.test.ts`: Added 3 new tests for telecommand-only, planned-event-only, and both-with-ambiguous-uncertainty cases (11 total tests)
- `src/lib/granite.ts`: Sanitized fallback message to not expose error details; removed unused error variable
- `src/lib/granite.test.ts`: Completely rewritten with 14 comprehensive tests including deterministic AbortError test (14 total, 12 added relative to 2-test Session 2 baseline)
- `src/app/api/analyze/route.ts`: Added `createPOSTHandler()` factory for dependency injection
- `src/app/api/analyze/route.test.ts`: New file with 13 tests including real 500 error test and strengthened IAM token leakage test (13 total, all new)

**Tests added:** 28 new tests (12 granite + 13 route + 3 incident-contract)

**Final command results:**
```
npm run test: 82 tests passed (54 previous + 28 new)
npm run verify: Pass (ESLint 0 warnings, TypeScript pass, tests pass, production build pass)
npm run test:e2e: 4/4 Playwright scenarios passed
Python tests: 25/25 passed
npm audit --audit-level=high: 0 vulnerabilities
```

**Safety properties proven:**
1. ✅ MONITOR requires BOTH telecommand AND planned-event evidence (not just one)
2. ✅ MONITOR with ambiguous/unknown/insufficient/incomplete uncertainty becomes INVESTIGATE
3. ✅ Malformed or non-JSON model content triggers fallback to reference
4. ✅ JSON violating incident schema triggers fallback to reference
5. ✅ Model citing unsupported evidence IDs triggers sanitized offline/reference fallback
6. ✅ AbortError triggers fallback to reference (deterministic test with fake timers)
7. ✅ Transient watsonx failure retries exactly once, then falls back
8. ✅ Persistent failure stops after exactly 2 watsonx attempts (no third attempt)
9. ✅ Validation failures and transport failures both trigger fallback
10. ✅ Fallback responses include explicit offline=true and sanitized message (no error details exposed)
11. ✅ IAM token is reused across retry when valid (no redundant IAM calls)
12. ✅ Both known scenario IDs (esa-m2-609, esa-m2-618) are accepted
13. ✅ Unknown/missing/malformed scenario IDs return 400
14. ✅ Extra properties in request return 400
15. ✅ Success responses include Cache-Control: no-store
16. ✅ Generic 500 error for unexpected downstream errors (tested via dependency injection)
17. ✅ No API key, project ID, IAM token, watsonx URL, or model response body appears in any public error or fallback response

**Manual corrections:**
No direct human code edits. Human review rejected the first green run; Bob implemented the follow-up corrections.

**Remaining risks:**
- Live watsonx integration is not tested in CI (by design; requires credentials and network)
- IAM token expiration between retry attempts not explicitly tested (safe fallback behavior expected)
- Credential leakage tests verify absence of known test values but cannot prove absence of all possible leakage vectors
- Real wall-clock AbortSignal timeout behavior in production remains untested (tests use fake timers to simulate bounded failure paths)

**Screenshot placeholder:** (Manual verification recommended: run `npm run dev`, trigger both scenarios, verify reference analysis with offline message when GRANITE_LIVE_ENABLED=false)

### Engineering session (August 13, 2026): Session 4 (completed-replay incident state)

**Goal:** Remove the contradiction between the completed incident briefs and the recovered final telemetry frame, which previously displayed `0.00 / NOMINAL` after a detected event.

**Root cause:** The Operations panels rendered `detectorFrames[scenario.id][progress]`. At 100% progress this is frame 83, after both fixtures have recovered. Incident analysis correctly summarizes the full replay, but the status badge and detector strip summarized only that last instant.

**Change:** Live replay continues to show current-frame values. Once replay processing finishes, each panel switches to an explicitly labeled `Latched peak detector scores` summary. Each detector value is its observed maximum, the fused score is its observed maximum, and `EVENT DETECTED` is latched only when temporal persistence fired in the original detector frames. Detector algorithms, thresholds, persistence, and Technical Proof inputs are unchanged.

**Files changed:**

- `src/lib/replay-presentation.ts`: Added the pure completed-replay summarizer.
- `src/lib/replay-presentation.test.ts`: Added 3 tests for peak latching, no invented alert, and empty-input rejection.
- `src/components/mission-console.tsx`: Selects live or latched presentation state based on replay state.
- `src/components/scenario-panel.tsx`: Uses `EVENT DETECTED` after replay and `DETECTOR ALERT` during a live alert.
- `src/components/detector-strip.tsx`: Labels completed values as latched peak detector scores.
- `tests/e2e/flightsentry.spec.ts`: Verifies two completed event detections, two peak-score labels, and no final `NOMINAL` label.
- `docs/validation.md`: Records Session 4 scope and evidence.

**Final command results:**

```text
npm run verify: Pass
  ESLint: zero warnings
  TypeScript: pass
  Vitest: 85/85
  Next.js production build: pass

npm run test:e2e: 4/4 Chromium scenarios passed
Python pipeline safety: 25/25 passed via uv run --with-requirements requirements-ml.txt
npm audit --audit-level=high: zero vulnerabilities
```

The first Python invocation used the shell's default interpreter and failed because `onnx` was absent. The documented ML requirements were then loaded through `uv run`; all 25 tests passed. No application change was made for that environment issue.

**Deployment status:** Session 4 was deployed to Vercel production as `dpl_Bm5adobNcFoZDgWcjRJSUV1Hx1c7`. Public verification returned HTTP 200 and a complete paired replay rendered 2 `EVENT DETECTED` labels, 2 latched-peak labels, and 0 final `NOMINAL` labels at `https://flightsentry.vercel.app`.

### Live Granite production verification

Production environment variables were configured through Vercel as server-side values: `WATSONX_API_KEY` and `WATSONX_PROJECT_ID` are Sensitive; `GRANITE_LIVE_ENABLED=true` is non-sensitive. No credential values were printed, committed, or exposed to the browser.

Deployment `dpl_BwwZ2KBmPUmw4XufbFjkoULn9fau` was verified through the bounded public API and full browser replay:

| Scenario | Source | Offline | Validated disposition |
| --- | --- | --- | --- |
| `esa-m2-609` | `watsonx` | `false` | `MONITOR` |
| `esa-m2-618` | `watsonx` | `false` | `INVESTIGATE` |

The completed production UI rendered one `MONITOR`, one `INVESTIGATE`, two `EVENT DETECTED` labels, and zero `REFERENCE MODE` banners. Event 618 remains conservative: Granite did not claim a root cause, and an ambiguous live result resolved to `INVESTIGATE` as required by the incident contract.

## Lighthouse production audit

Run against `next start` at `http://127.0.0.1:3000`:

| Category | Score |
| --- | ---: |
| Performance | 96 |
| Accessibility | 100 |
| Best Practices | 100 |
| SEO | 100 |
| Agentic Browsing | 100 |

- First Contentful Paint: 1.5 s
- Largest Contentful Paint: 2.7 s
- Total Blocking Time: 50 ms
- Cumulative Layout Shift: 0

(Values above match `reports/lighthouse-final.report.json`; an earlier draft
of this section quoted slightly different numbers from an unrecorded run.)

Reports:

- `reports/lighthouse-final.report.html`
- `reports/lighthouse-final.report.json`
- `reports/lighthouse-baseline.report.html` records the pre-optimization run.

The final optimization moved ONNX Runtime behind the replay action and changed local fonts to optional display, improving Performance from 64 to 96 and CLS from 0.13 to 0.

### Engineering session (August 13, 2026): Session 5 (authentic Mission 2 evidence)

**Goal:** Execute the real ESA Mission 2 path, publish reviewable source evidence, measure the staged candidate on a held-out paired event, and prevent weak artifacts from silently replacing the browser demo.

**Source verification:**

- Downloaded `ESA-Mission2.zip` from Zenodo record `12528696` using resumable parallel byte ranges.
- Verified the complete 4,098,539,912-byte archive against MD5 `0b7505b7f0731ca037ee889ca2a520ce` before extraction.
- Extracted four shared channels: `channel_18`, `channel_20`, `channel_9`, and `channel_13`.
- Produced non-overlapping attributed packs with 686 event-609 samples and 288 event-618 samples.
- Confirmed event 609 contains priority-3 `telecommand_6` and overlapping `event_14`; event 618 contains neither.
- Published only the two attributed extracts under `public/data/source-evaluation/`; the raw archive and working data remain Git-ignored.

**Evaluation design and outcome:**

- Fit on 87 nominal event-609-window samples; calibrated scores on 38 separate nominal samples.
- Selected weights on event 609 using event-level F1, false-alert episodes, and delay.
- Held event 618 out of fitting, calibration, and weight selection.
- Selected staged weights: `0.60 MAD / 0.00 Isolation Forest / 0.40 autoencoder`.
- Event 609: detected, event F1 `1.00`, zero false-alert episodes, `54 s` delay.
- Held-out event 618: detected, event F1 `0.50`, two false-alert episodes, `1.6736/hour`, `198 s` delay.
- Paired total: 2/2 events detected, event F1 `0.67`, `0.4938` false alerts/hour, `126 s` mean delay.
- Rolling MAD alone scored event F1 `0.67` on held-out event 618, above the ensemble's `0.50`; the source candidate was not promoted.

**Safety and presentation changes:**

- `train_ensemble.py` now stages outputs by default; writes under `public/` require `--promote-web`.
- Three-of-five persistence resets at scenario boundaries.
- The public context copy now uses only anonymized source identifiers and removes unsupported “calibration” and “mode-switch” claims.
- Technical Proof now shows source provenance, held-out ablation, direct extract links, and the `RETAIN BUNDLED DEMO` decision.
- Evidence screenshot: `reports/flightsentry-source-proof.png`.
- Full metric record: `docs/source-evaluation.md` and `src/data/source-evaluation.json`.

**Final command results:**

```text
npm run verify: Pass
  ESLint: zero warnings
  TypeScript: pass
  Vitest: 88/88
  Next.js production build: pass

npm run test:e2e: 4/4 Chromium scenarios passed
Python pipeline tests: 38/38 passed via uv run --with-requirements requirements-ml.txt
npm audit --audit-level=high: zero vulnerabilities
Source candidate ONNX: onnx.checker.check_model PASS
```

No production deployment, commit, or push was performed in Session 5. The completed implementation was later finalized through IBM Bob.

### Independent security and quality review (August 13-14, 2026): Session 6

**Goal:** Independent multi-lens audit of the complete application. Every
substantiated high and medium finding was returned to the Bob-led workflow for
implementation and regression testing. Full findings
ledger and research notes: `docs/independent-audit.md`; working log:
`docs/independent-audit-progress.md`; visual evidence: `reports/review-evidence/README.md`.

**Scope of changes (all uncommitted for owner review):**

- Safety: gate-aware `enforceSafeDisposition` (MONITOR requires the full
  context-gate result, not only evidence-kind presence), explicitly ambiguous
  `ESCALATE` resolves to `INVESTIGATE`, reference fallback realigned with the
  deterministic gate, per-client rate limiting on `/api/analyze`, five-minute
  server-side cache for successful live briefs, IAM in-flight deduplication,
  strict Content-Security-Policy and security headers from `next.config.ts`,
  sanitized structured logging for failures, rate limiting, and fallback
  activation, HTML-export escaping hardened.
- Console: reset-during-analysis race fixed with a run-id guard; replay
  progress derives from elapsed wall time (throttled tabs no longer stall the
  demo); deterministic decision comparison and context gate render at replay
  completion while Granite briefs stream in behind a labeled skeleton; Granite
  provenance chip (live model id vs stored reference); ranked hypotheses with
  confidence bars; derived screen-reader live region; focus management; paired
  layout from 1280 px.
- Telemetry display: dependency-free per-channel SVG strip charts with fixed
  ranges and units, detector-derived alert-interval shading, first-alert
  marker, standby preview, and a phase-aware text alternative. uPlot removed.
- Detector strip: FUSED cell with config-derived threshold ticks,
  three-of-five persistence pips, runtime provenance tag.
- Hygiene and truth: `.gitignore` duplicate that hid `.env.example` removed;
  `.vercelignore` patterns anchored (latent `public/data/` exclusion fixed);
  missing `import sys` in `extract_scenarios.py` fixed with regression test;
  `validateConfig` numeric normalization checks; production `robustNormalize`
  parity test; em/en dash sweep of all outward-facing text; stale doc claims
  corrected (this file's header, Bob-log ESCALATE line, duplicate Lighthouse
  figures); unused template assets and jsep binaries removed;
  `@vitest/coverage-v8` added, `vite-tsconfig-paths` removed.

**Final command results (2026-08-14, local Windows):**

```text
npm run verify: Pass
  ESLint: zero warnings
  TypeScript: pass
  Vitest: 114/114
  Next.js production build: pass

npx playwright test: 20/20 (chromium + mobile-chromium projects)
  includes axe sweeps of idle, completed, telemetry-only, counterfactual,
  Technical Proof, and mobile states: zero serious or critical findings

Python pipeline tests: 39/39
  via: uv run --with-requirements requirements-ml.txt
       python -m unittest discover scripts/data_pipeline/tests

npm audit --audit-level=high: zero vulnerabilities
npm run test:coverage: pass (94.6% statements; 80/80/80/75 thresholds met)
```

**Production-build smoke test** (`next start`, `GRANITE_LIVE_ENABLED=false`):
CSP and all security headers served; `/api/analyze` returned 200 with the
reference brief and `Cache-Control: no-store`, 400 for unknown ids and extra
properties, and 429 with `Retry-After: 10` under a 40-request hammer;
published extracts and model artifacts served.

**Lighthouse (final build, headless Chromium, Lighthouse 13.4.1):**

| Category | Score |
| --- | ---: |
| Performance | 94 |
| Accessibility | 100 |
| Best Practices | 100 |
| SEO | 100 |

FCP 1.7 s, LCP 2.9 s, TBT 30 ms, CLS 0, initial transfer 290 KiB. Reports:
`reports/review-evidence/lighthouse-review.report.html` and `.json`. An intermediate
first-paint ONNX warm-up variant was measured at Performance 76 and rejected;
the shipped intent-based warm-up restores clean load metrics.

**Environmental notes:** live watsonx credentials are not present locally, so
live-Granite states were validated through mocked contract tests and the
recorded production verification above; local e2e pins
`GRANITE_LIVE_ENABLED=false` for determinism.

**Deployment status:** Nothing was committed, pushed, or deployed in this
review session.

## S-tier capability pass (August 14, 2026)

### Product capabilities added

- Added an inspectable replay timeline with pause, resume, single-frame stepping, direct onset and alert jumps, and a range scrubber. Completed decisions and briefs remain available while reviewing earlier frames.
- Added a semantic causal decision trace that recalculates across telemetry-only, trusted-context, and counterfactual evidence states. It reports four-channel paired shape correlation, detector peak agreement, active command and plan evidence, context-gate status, and recommendation.
- Added a human decision checkpoint. An operator can accept the deterministic recommendation or raise severity, record an operator ID and rationale, amend the checkpoint, and include it in JSON or printable HTML exports.
- Added fixture-derived subsystem impact analysis. Every channel reports its pre-event baseline, signed peak delta, peak timestamp, final-six-sample recovery percentage, and recovered or residual state without a synthetic cross-unit score.
- Added an interactive investigation runbook. Pending checks block signoff, per-check findings are preserved, undocumented concerns remain blocking, and a concern raises a `MONITOR` recommendation to at least `INVESTIGATE`.
- Advanced the incident decision record from schema version 1 through version 3. Draft exports are explicitly `PENDING`; version 3 preserves the subsystem impact rows, full runbook, recommendation, final disposition, action, timestamp, decision mode, and active evidence IDs.
- Added seven visual captures under `reports/review-evidence/` covering the causal trace, operator checkpoint, mobile trace, T+052 alert inspection, subsystem impact analysis, investigation runbook, and concern-driven signoff interlock.

### Final validation

| Gate | Command | Result |
| --- | --- | --- |
| Combined engineering gate | `npm run verify` | Pass: ESLint zero warnings, TypeScript pass, 124 Vitest tests, production build pass |
| End-to-end and accessibility | `npx playwright test` | 28/28 across Chromium and mobile Chromium; axe sweep reports zero serious or critical findings |
| Python parity and pipeline | `uv run --with-requirements requirements-ml.txt python -m unittest discover scripts/data_pipeline/tests` | 39/39 passed |
| Dependency audit | `npm audit --audit-level=high` | Zero vulnerabilities |
| Coverage | `npm run test:coverage` | 94.46% statements, 84.66% branches, 97.98% functions, 96.03% lines |
| Final production build | `npm run build` | Pass; static `/` and dynamic `/api/analyze` |
| Patch integrity | `git diff --check` | Pass; line-ending notices only |

The browser suite explicitly covers seeking to T+052, recalculating the causal trace when evidence mode changes, retaining decisions during timeline review, rendering the subsystem impact map, blocking signoff on pending runbook checks, completing the runbook, raising the minimum disposition for a documented concern, exporting schema version 3, desktop and mobile reflow, keyboard flow, reduced motion, Granite reference provenance, counterfactual evidence, reset races, downloads, and the multi-state axe sweep.

The existing Next.js workspace-root warning remains non-blocking: Turbopack detects a separate `package-lock.json` above the repository and recommends setting `turbopack.root`. The build selects and compiles the correct project successfully.

**Deployment status:** Nothing was committed, pushed, or deployed in this capability pass. The completed capabilities were finalized through IBM Bob.
