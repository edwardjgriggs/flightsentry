# IBM Bob build log

## Submission status

**Incomplete — do not claim IBM Bob compliance yet.**

The current implementation was scaffolded in Codex. The challenge requires IBM Bob as the primary development tool. Use the sessions below to recreate or materially iterate the project with Bob, then replace this status with evidence.

## Required evidence for each session

- Date and Bob account/workspace
- Goal and full prompt
- Screenshot or exported session reference
- Files Bob created or changed
- Tests Bob proposed or ran
- Manual corrections and why they were needed
- Commit or diff reference after human review

## Recommended Bob sessions

### Session 1 — Understand and verify the architecture

Prompt:

> Review README.md, docs/architecture.md, and the detector tests. Explain the trust boundaries, then identify any mismatch between the written architecture and implementation. Do not change files until you list the proposed edits.

### Session 2 — Improve the detector ensemble

Prompt:

> Inspect src/lib/detectors.ts and scripts/data_pipeline/train_ensemble.py. Add or improve parity tests for score normalization, fusion, and three-of-five persistence. Preserve the rule that both events trigger telemetry alerts while context determines disposition.

### Session 3 — Harden Granite integration

Prompt:

> Review src/lib/granite.ts, granite-prompt.ts, incident-contract.ts, and the API route. Add tests for invalid JSON, unsupported evidence, timeout fallback, retry limits, and ambiguous MONITOR responses. Never expose credentials or add command execution.

### Session 4 — Accessibility and demo polish

Prompt:

> Run the app and review the paired replay using keyboard-only navigation, reduced motion, 200% zoom, and mobile widths. Fix confirmed issues and record the exact validation commands and results.

## Session records

| Date | Session | Evidence | Files changed | Validation | Reviewer notes |
| --- | --- | --- | --- | --- | --- |
| 2026-08-13 | APPROVED WITH CHANGES resolution (items 1–4) | _Screenshot pending — add manually_ | See below | All gates pass | No manual corrections needed |
| 2026-08-13 | Session 2 — detector config artifact (deployment safety) | _Screenshot pending — add manually_ | See below | ESLint pass, TS pass, 54 Vitest, 25 Python, 4 Playwright, 0 vulns | No manual corrections needed |
| 2026-08-13 | Session 3 — Granite hardening and safety boundaries | _Screenshot pending — add manually_ | See below | ESLint pass, TS pass, 82 Vitest, 25 Python, 4 Playwright, 0 vulns | Review correction pass completed; final approved. |

---

## Session: 2026-08-13 — APPROVED WITH CHANGES resolution

### Goal

Implement edit-list items 1–4 from the prior architecture review to clear the "APPROVED WITH CHANGES" verdict. Resolve High findings H-1 (autoencoder documentation mismatch) and H-2 (normalization formula divergence), plus items 3 and 4.

### Prompt (abbreviated)

> Using your previous architecture review as the source of truth, implement edit-list items 1–4. Resolve H-1 (correct autoencoder documentation) and H-2 (eliminate normalization mismatch with parity tests). Also implement items 3 and 4. Preserve existing safety properties. Do not commit, push, deploy, or delete files.

### Files changed

| File | Change |
| --- | --- |
| `docs/architecture.md` | Distinguished bundled rank-2 linear ONNX demo model from nonlinear pipeline MLPRegressor 4-8-2-8-4; documented normalization formula `clip((z-1.5)/7, 0, 1)` |
| `docs/model-card.md` | Added autoencoder distinction section; added score normalization section with formula; split autoencoder table rows into demo and pipeline variants |
| `README.md` | Clarified the two autoencoder models in the Solution section |
| `scripts/data_pipeline/train_ensemble.py` | Removed inline `robust_normalize`; now imports from `normalize.py`; updated `model-provenance.json` to distinguish pipeline vs bundled model |
| `scripts/data_pipeline/normalize.py` | **New file** — shared `robust_normalize` with unified formula `clip((z-1.5)/7, 0, 1)` matching TypeScript; importable without heavy ML dependencies |
| `scripts/data_pipeline/build_demo_model.py` | Updated metadata to explicitly label artifact as demo, not source-data trained; added `distinction` and `architecture` fields |
| `scripts/data_pipeline/tests/test_normalization_parity.py` | **New file** — 8 parity tests verifying Python `robust_normalize` matches TypeScript `robustNormalize` on fixed inputs; includes regression guard for old `z/8` formula |
| `src/lib/detectors.test.ts` | Added `pyRobustNormalize` reference function and 5 new parity tests in `normalization parity — TypeScript vs Python` describe block |
| `src/lib/incident-contract.test.ts` | Added 5 new tests: MONITOR preserved for 609, MONITOR→INVESTIGATE for 618, ESCALATE preserved, empty-ID rejection, invalid-disposition rejection |
| `src/lib/granite-prompt.test.ts` | Added 4 new tests: system prompt requires MONITOR context, user content includes all evidence IDs, JSON with trailing prose, empty-string rejection |
| `src/components/technical-proof.tsx` | Autoencoder row label now reflects runtime: "Bundled linear autoencoder (ONNX)", "TypeScript PCA fallback", or "Bundled linear autoencoder" |
| `src/lib/scenarios.ts` | Evidence detail updated to "bundled rank-2 linear autoencoder" |
| `docs/validation.md` | Updated test counts; added session record |
| `docs/ibm-bob-build-log.md` | This file |

### Normalization formula selected

```
normalized = clip((z - 1.5) / 7, 0, 1)
where z = (score - median(calibration)) / (MAD(calibration) * 1.4826)
```

- The 1.5 dead-band suppresses small nominal deviations.
- `/7` maps typical anomaly z-scores into the unit interval.
- Applied identically in `src/lib/detectors.ts` (`robustNormalize`) and `scripts/data_pipeline/normalize.py` (`robust_normalize`).
- The old Python formula `clip(z / 8, 0, 1)` has been replaced and the regression guard test confirms divergence.

### Validation results

| Gate | Result |
| --- | --- |
| ESLint | Pass, zero warnings |
| TypeScript | Pass |
| Vitest | **30 tests passed** (16 original + 5 normalization parity + 5 incident-contract + 4 granite-prompt) |
| Python pipeline safety | **11 tests passed** (3 existing + 8 new normalization parity) |
| Next.js production build | Pass |
| Playwright | 4/4 Chromium scenarios passed |
| axe-core | Zero serious or critical findings |
| npm audit | Zero known vulnerabilities |

### Manual corrections

None required. All tests passed after fixing the regression guard test to use `score=1.15` (keeping z≈2 so neither formula clips to 1.0, making the divergence visible).

### Screenshot / session evidence

_Pending — add screenshot of Bob session and terminal output manually._

### Safety property verification

- Both events (609 and 618) trigger telemetry alerts (confirmed by detector ensemble tests).
- Event 609 requires trusted telecommand AND planned-event context before MONITOR (confirmed by `incident-contract.test.ts` new test).
- Event 618 remains ESCALATE without a proven root cause (confirmed by `context.test.ts` and `incident-contract.test.ts`).
- No credentials exposed; no command execution added; no files deleted.

### Remaining risks

1. **Grid-search weights vs updated normalization**: The hardcoded browser weights `0.30/0.30/0.40` were set under the old Python formula. With the normalization formula now unified, a new grid-search run on ESA Mission 2 data may select different optimal weights. The bundled weights are demonstration values only and are safe to update after running `train_ensemble.py`.
2. **Build-demo model not regenerated**: The `.onnx` file in `public/models/` still exists from the prior build. The metadata `.json` sidecar does not update automatically; re-run `build_demo_model.py` to regenerate it with updated metadata.
3. **Single MAD median implementation difference**: Python's `np.median` and the JavaScript `median` implementation both handle even-length arrays by averaging the two middle values; confirmed consistent.

---

## Session: 2026-08-13 — Session 2: Detector configuration artifact (deployment safety)

### Goal

Remove the deployment hazard created by hardcoded ensemble configuration. Create one versioned detector configuration artifact that TypeScript imports at build time; validate all invariants at load time; surface active profile and provenance in the Technical Proof view; update the Python training pipeline to write a compatible artifact; add comprehensive tests.

### Prompt (abbreviated)

> Make the detector configuration and trained-pipeline output deployment-safe. Create one versioned detector configuration artifact that TypeScript imports at build time. Update train_ensemble.py so a successful source-data training run writes a compatible web configuration artifact. Make detectors.ts consume the versioned artifact instead of duplicating weights, threshold, persistence, or normalization constants. Make the Technical Proof view display the active configuration profile and provenance. Add tests covering valid bundled config, invalid weight sum, invalid threshold, invalid persistence values, normalization version mismatch, Python-generated artifact schema compatibility, and unchanged paired-event behavior.

### Files changed

| File | Change |
| --- | --- |
| `public/models/detector-config.json` | **New file** — versioned detector configuration artifact (bundled-demo-v1 profile); source of truth for all ensemble tuning values consumed by TypeScript at build time |
| `src/lib/detector-config.ts` | **New file** — typed schema, `validateConfig()` asserting all invariants at module-load time, exported `detectorConfig` object |
| `src/lib/detector-config.test.ts` | **New file** — 24 tests: valid bundled config, weight sum, threshold, persistence, normalization formula/version mismatch, Python-generated artifact schema compatibility, paired-event regression |
| `src/lib/detectors.ts` | Imports `detectorConfig` from artifact; eliminates hardcoded weights/threshold/persistence; exports `robustNormalize`; `detectorConfiguration` now includes `configProfile`, `scope`, and `provenance` |
| `src/components/technical-proof.tsx` | Calibration record panel now shows config profile, dynamic fusion weights from artifact, and weights source (provenance) |
| `scripts/data_pipeline/build_demo_model.py` | Added `_BUNDLED_DETECTOR_CONFIG` constant matching the JSON artifact schema; `build_model()` now also writes `detector-config.json` alongside the ONNX output |
| `scripts/data_pipeline/train_ensemble.py` | Added `--web-config` CLI argument; after grid search writes a `source-data-trained-v1` detector config artifact to `public/models/detector-config.json` with grid-search-selected weights, normalization constants, and training provenance |
| `scripts/data_pipeline/tests/test_detector_config_schema.py` | **New file** — 14 Python tests: `_BUNDLED_DETECTOR_CONFIG` validation, written JSON validation, all rejection invariants, `train_ensemble.py` config shape compatibility |
| `scripts/data_pipeline/tests/__init__.py` | **New file** — test package init so `unittest discover` finds all test modules |
| `docs/validation.md` | Updated test counts; added session record |
| `docs/ibm-bob-build-log.md` | This file |

### Configuration artifact schema

**Path:** `public/models/detector-config.json`

**Schema version:** `"1"`

Fields:

| Field | Type | Description |
| --- | --- | --- |
| `schemaVersion` | string | `"1"` — increment when schema structure changes |
| `configProfile` | string | `"bundled-demo-v1"` or `"source-data-trained-v1"` |
| `scope` | string | Explicit disclaimer of demonstration-only or source-data status |
| `weights.mad` | number | Rolling MAD ensemble weight |
| `weights.isolationForest` | number | Isolation Forest ensemble weight |
| `weights.autoencoder` | number | Autoencoder ensemble weight |
| `alertThreshold` | number | Fused score threshold in `[0, 1]` |
| `persistence.window` | integer | Temporal persistence window size |
| `persistence.requiredCount` | integer | Minimum alerts within window to trigger |
| `normalization.formula` | string | `"robust-z-clip"` — must match implementation |
| `normalization.version` | string | `"1"` — must match implementation |
| `normalization.deadBand` | number | 1.5 — dead-band subtracted from z |
| `normalization.scale` | number | 7 — range divisor after dead-band |
| `normalization.madMultiplier` | number | 1.4826 — consistency factor |
| `normalization.minScale` | number | 1e-6 — minimum scale to prevent division by zero |
| `modelType` | string | `"bundled-rank2-linear-onnx"` or `"source-data-nonlinear-onnx"` |
| `provenance.*` | string | source, weightsSource, thresholdSource, generatedBy, replacedBy |

### How a future ESA training run updates the browser configuration

1. Run `python -m scripts.data_pipeline.train_ensemble` with ESA Mission 2 scenario data in `data/work/scenarios/`.
2. The script runs grid search, selects optimal weights, then writes a `source-data-trained-v1` artifact to `public/models/detector-config.json`.
3. The next `npm run build` imports the new JSON; `validateConfig()` runs at module-load time and fails the build if any invariant is violated.
4. All downstream code (`detectors.ts`, `technical-proof.tsx`) automatically reflects the new weights and provenance with no TypeScript edits required.

### Model regeneration result

```
ONNX validation: PASS
IR version: 9
Nodes: ['MatMul', 'MatMul']
Sidecar name: FlightSentry bundled linear autoencoder (demo artifact)
Architecture: rank-2 linear: MatMul(encoder) + MatMul(decoder), no activation
Config profile: bundled-demo-v1
Config model type: bundled-rank2-linear-onnx
```

The ONNX model still passes `onnx.checker.check_model()`. The sidecar correctly identifies it as the bundled rank-2 linear demo model.

### Validation results

| Gate | Result |
| --- | --- |
| ESLint | Pass, zero warnings |
| TypeScript | Pass |
| Vitest | **54 tests passed** (30 previous + 24 new detector-config) |
| Python pipeline safety | **25 tests passed** (11 previous + 14 new detector-config schema) |
| Next.js production build | Pass; static `/` and Node.js `/api/analyze` |
| Playwright | 4/4 Chromium scenarios passed |
| axe-core | Zero serious or critical findings (unchanged) |
| npm audit | Zero known vulnerabilities |

### Manual corrections

None required. All tests passed on first run.

### Screenshot / session evidence

_Pending — add screenshot of Bob session and terminal output manually._

### Safety property verification

- All Granite and incident-disposition safety behaviors preserved; no changes to context.ts, granite.ts, incident-contract.ts, or safety logic.
- Both events (609 and 618) trigger telemetry alerts (confirmed by detector ensemble and config regression tests).
- Hardcoded weights/threshold/persistence removed from detectors.ts; configuration is now traceable to a versioned artifact.
- ESA data was not downloaded; no credentials were exposed; no files were deleted; no deployment was performed.

### Remaining risks

1. **Bundled weights vs source-data optimal**: Bundled profile retains `0.30/0.30/0.40` selected before normalization unification. Running `train_ensemble.py` against ESA Mission 2 data replaces them with grid-search-calibrated values.
2. **Single test for paired-event behavior in new test file**: The behavioral regression tests in `detector-config.test.ts` exercise the full pipeline but use only two bundled scenarios. Broader coverage requires source data.
3. **Python test discovery requires explicit PYTHONPATH**: `unittest discover` must be invoked with `PYTHONPATH` set to the repo root for imports to resolve. This is consistent with prior sessions but should be documented in a Makefile or CI configuration for future contributors.




---

## Session: 2026-08-13 — Session 3: Granite hardening and safety boundaries

### Goal

Harden the Granite integration and prove its safety and failure boundaries. Ensure MONITOR requires both telecommand AND planned-event evidence, add comprehensive service boundary tests, expand incident contract tests, add route contract tests, and verify no credentials leak into public responses.

### Prompt (full)

> You are implementing FlightSentry Session 3 in the current repository: harden the Granite integration and prove its safety and failure boundaries.
>
> Session 2 is approved. Current gates are 54 Vitest tests, 25 Python tests, 4 Playwright scenarios, a passing production build, zero ESLint warnings, and zero npm audit vulnerabilities. The application is a human-in-the-loop spacecraft incident-response demo. The public API accepts only esa-m2-609 and esa-m2-618. Live Granite is optional and must fall back to stored validated reference analyses.
>
> The architecture requires all of these properties:
> - Granite receives only a server-created trusted evidence packet.
> - Model output is schema-validated and every cited evidence ID must exist in that packet.
> - FlightSentry never executes spacecraft commands.
> - Ambiguous or incomplete evidence resolves to INVESTIGATE.
> - MONITOR is allowed only when BOTH trusted telecommand evidence AND trusted planned-event evidence are present.
> - Live generation makes at most one retry, then returns an explicit offline/reference response.
> - Credentials remain server-side and never appear in prompts, model request bodies, client responses, logs, fixtures, or error messages.
> - The API remains restricted to known scenario IDs.
>
> First inspect src/lib/granite.ts, src/lib/granite-prompt.ts, src/lib/incident-contract.ts, src/app/api/analyze/route.ts, their current tests, scenario fixtures, types, and relevant documentation. Implement only directly necessary changes.
>
> 1. Correct the disposition guard so MONITOR requires both a telecommand item and a planned-event item. A packet containing only one of those kinds is insufficient. Preserve ESCALATE. A MONITOR brief whose uncertainty is explicitly ambiguous, unknown, insufficient, or incomplete must become INVESTIGATE even when both context kinds exist.
>
> 2. Harden and test the Granite service boundary. Add deterministic Vitest coverage for:
> - malformed or non-JSON model content;
> - JSON that violates the incident schema;
> - a model response citing an unsupported evidence ID;
> - timeout or AbortError behavior;
> - one transient watsonx failure followed by success;
> - persistent failure stopping after exactly two watsonx attempts;
> - fallback after validation failures as well as transport failures;
> - explicit offline/reference metadata and message after final failure;
> - IAM token reuse across the retry when the token remains valid.
>
> Count IAM and watsonx calls separately in assertions so a third model attempt cannot hide behind aggregate fetch counts. Keep tests isolated from the module-level token cache and avoid real delays or network calls.
>
> 3. Expand incident-contract tests for all four MONITOR cases:
> - both telecommand and planned event present: MONITOR remains MONITOR when uncertainty is bounded;
> - telecommand only: INVESTIGATE;
> - planned event only: INVESTIGATE;
> - both present but uncertainty explicitly ambiguous: INVESTIGATE.
>
> 4. Add route contract tests that prove:
> - both known scenario IDs are accepted;
> - unknown IDs, missing IDs, malformed JSON, and extra properties return 400;
> - success responses use Cache-Control: no-store;
> - downstream unexpected errors return the generic 500 response;
> - no configured API key, project ID, IAM token, or upstream response body can appear in any public error or fallback response.
>
> 5. Keep credentials server-only. Do not add NEXT_PUBLIC_ secrets, client-side provider calls, arbitrary scenario input, command execution, or a live watsonx test. Do not weaken strict Zod schemas or evidence-reference validation. Keep production refactoring small and motivated by a tested behavior.
>
> 6. Update docs/validation.md and docs/ibm-bob-build-log.md with a full Session 3 record: goal, this full prompt, exact files changed, exact commands and results, manual corrections, safety properties proven, remaining risks, and a screenshot placeholder. Correct the README IBM Bob status only if the recorded Bob sessions now honestly justify the new wording; otherwise leave it incomplete.
>
> 7. Run the proportional validation suite:
> - npm run test
> - npm run verify
> - npm run test:e2e
> - Python unittest discovery using the repository virtual environment if present
> - npm audit --audit-level=high
>
> If a required dependency or browser is unavailable, report the exact blocker instead of changing unrelated configuration.

### Initial implementation (first pass)

Bob implemented the MONITOR guard fix, comprehensive Granite tests, incident-contract tests, and route tests. First `npm run test` run: 5 failed, 77 passed (four timer timeouts and ineffective 500 mock). Bob's first revisions produced 81 passing tests but removed the required AbortError proof and weakened the 500 test.

### Review findings and corrections

Human review rejected the first green run (81 tests). Bob implemented follow-up corrections:

1. **Timeout test missing:** Initial implementation replaced hanging-promise timeout tests with generic transport error. Added deterministic AbortError test with fake timers.
2. **Route 500 test invalid:** Initial test called normal path and asserted 200. Added dependency-injection factory `createPOSTHandler()` to enable real 500 error testing.
3. **Fallback message leakage:** `lastError.message` was embedded in public fallback, potentially exposing sensitive details. Sanitized to generic "failed after one retry" message.
4. **IAM token leakage test weak:** Initial test used only IAM call without watsonx success. Strengthened to use full successful watsonx response and verify source="watsonx".
5. **ESLint warning:** Unused `error` variable in catch block. Removed to fix warning.

### Files changed

| File | Change |
| --- | --- |
| `src/lib/incident-contract.ts` | Fixed `enforceSafeDisposition()` to require BOTH `telecommand` AND `planned-event` evidence for MONITOR (not just one) |
| `src/lib/incident-contract.test.ts` | Added 3 new tests: telecommand-only → INVESTIGATE, planned-event-only → INVESTIGATE, both-with-ambiguous-uncertainty → INVESTIGATE (11 total tests) |
| `src/lib/granite.ts` | Sanitized fallback message to not expose error details; removed unused error variable |
| `src/lib/granite.test.ts` | Complete rewrite with 14 comprehensive tests including deterministic AbortError test using fake timers and isolated module cache (14 total, 12 added relative to 2-test Session 2 baseline) |
| `src/app/api/analyze/route.ts` | Added `createPOSTHandler()` factory for dependency injection to enable 500 error testing |
| `src/app/api/analyze/route.test.ts` | **New file** — 13 tests including real 500 error test via dependency injection and strengthened IAM token leakage test (13 total, all new) |
| `docs/validation.md` | Added Session 3 record with initial implementation, review findings, corrections, exact test counts, and safety properties |
| `docs/ibm-bob-build-log.md` | This file |

### Follow-up review prompt (full)

> Session 3 final documentation correction only. Do not change production code or tests.
>
> The final verified facts are:
> - `npm run test`: 82 total Vitest tests.
> - `src/lib/granite.test.ts`: 14 total tests, 12 added relative to the 2-test Session 2 baseline.
> - `src/app/api/analyze/route.test.ts`: 13 total tests, all new.
> - `src/lib/incident-contract.test.ts`: 11 total tests, 3 added relative to the 8-test Session 2 baseline.
> - Session 3 therefore added exactly 28 tests: 12 + 13 + 3. No "tests replaced" arithmetic is needed.
> - The real generic-500 path is now tested through `createPOSTHandler()` dependency injection.
> - Unsupported model evidence produces a sanitized reference fallback; the public message does NOT contain "Unsupported evidence reference" or the invented ID.
> - AbortError is simulated deterministically; real wall-clock AbortSignal timeout integration remains untested.
> - Final gates: ESLint zero warnings, TypeScript pass, Next.js build pass, 82 Vitest, 25 Python, 4 Playwright, zero serious/critical axe findings, npm audit zero vulnerabilities.
>
> Correct docs/validation.md and docs/ibm-bob-build-log.md everywhere these facts are stale or contradicted, including:
> 1. Update the top automated-gates Vitest row to 82 total (54 previous + 28 Session 3).
> 2. Replace every "15 Granite" or "15 comprehensive" with 14 total / 12 added as context requires.
> 3. Remove the incorrect "31 total, but 3 replaced" explanation.
> 4. Update the Session 3 table row from 81 to 82 and change reviewer notes from "No manual corrections needed" to "Review correction pass completed; final approved."
> 5. Replace the stale safety claim that unsupported evidence text appears in the message with the actual sanitized-fallback assertion.
> 6. Replace "descriptive message" with "sanitized offline/reference message."
> 7. Remove the stale remaining risk claiming the route 500 path is untested.
> 8. Temper "fully tested" and timeout claims: state that the bounded mocked failure paths are covered and that real wall-clock AbortSignal behavior remains a risk.
> 9. Record the iteration honestly:
>    - first `npm run test`: 5 failed, 77 passed (four timer timeouts and the ineffective 500 mock);
>    - Bob's first revisions produced 81 passing tests but removed the required AbortError proof and weakened the 500 test, so review did not approve;
>    - follow-up revisions added deterministic AbortError coverage, a real injected 500 test, sanitized public fallback errors, and produced 82 passing tests.
> 10. Under Manual corrections, state: "No direct human code edits. Human review rejected the first green run; Bob implemented the follow-up corrections." Do not claim everything passed first run.
> 11. Add the full prior follow-up review prompt from this resumed task to docs/ibm-bob-build-log.md under `### Follow-up review prompt (full)` so the Bob evidence is complete.
> 12. Add `/.bob/` to .gitignore as local Bob task metadata. Do not delete the existing `.bob` directory.
>
> Use exact wording and arithmetic. Do not rerun the validation suite because this pass changes documentation and .gitignore only; cite the immediately preceding verified results. Report the exact files changed and confirm no production code or tests changed in this pass. Do not commit, push, deploy, publish, or delete anything.

### Validation results (after corrections)

| Gate | Result |
| --- | --- |
| ESLint | Pass, zero warnings |
| TypeScript | Pass |
| Vitest | **82 tests passed** (54 previous + 28 new: 12 granite + 13 route + 3 incident-contract) |
| Python pipeline safety | **25 tests passed** (unchanged) |
| Next.js production build | Pass; static `/` and Node.js `/api/analyze` |
| Playwright | 4/4 Chromium scenarios passed |
| axe-core | Zero serious or critical findings (unchanged) |
| npm audit | Zero known vulnerabilities |

### Command results (after corrections)

```bash
npm run test
# 82 tests passed

npm run verify
# ESLint: 0 warnings
# TypeScript: Pass
# Tests: 82 passed
# Build: Pass

npm run test:e2e
# 4/4 Playwright scenarios passed

python -m unittest discover -s scripts/data_pipeline/tests -p "test_*.py" -v
# 25 tests passed

npm audit --audit-level=high
# 0 vulnerabilities
```

### Manual corrections

No direct human code edits. Human review rejected the first green run; Bob implemented the follow-up corrections:
1. Added deterministic AbortError test with fake timers
2. Added dependency-injection factory for real 500 error testing
3. Sanitized fallback message to remove error detail leakage
4. Strengthened IAM token leakage test with full watsonx success path
5. Removed unused error variable to fix ESLint warning

### Safety properties proven

1. ✅ **MONITOR requires BOTH telecommand AND planned-event evidence** — Not just one. Tests verify telecommand-only → INVESTIGATE, planned-event-only → INVESTIGATE.
2. ✅ **MONITOR with ambiguous uncertainty → INVESTIGATE** — Even when both context types exist, if uncertainty contains "ambiguous", "unknown", "insufficient", or "incomplete", disposition is raised.
3. ✅ **Malformed or non-JSON model content triggers fallback** — Test verifies "This is not JSON at all" returns reference analysis with offline=true.
4. ✅ **JSON violating incident schema triggers fallback** — Test verifies invalid disposition enum returns reference analysis.
5. ✅ **Model citing unsupported evidence IDs triggers sanitized offline/reference fallback** — Test verifies "invented-evidence-id" returns reference analysis; public message does NOT contain "Unsupported evidence reference" or the invented ID.
6. ✅ **Transport errors trigger fallback** — Test verifies network errors return reference analysis.
7. ✅ **Transient watsonx failure retries exactly once** — Test verifies 503 on first attempt, success on second, with exactly 1 IAM + 2 watsonx calls.
8. ✅ **Persistent failure stops after exactly 2 watsonx attempts** — Test verifies two 500 responses result in exactly 1 IAM + 2 watsonx calls (no third attempt).
9. ✅ **Validation failures and transport failures both trigger fallback** — Multiple tests verify both paths.
10. ✅ **Fallback responses include explicit offline=true and sanitized offline/reference message** — All fallback tests verify `offline: true` and message matching `/failed after one retry/i` and `/reference brief/i`. Public message does not expose error details.
11. ✅ **IAM token is reused across retry when valid** — Test verifies 503 retry uses same token with exactly 1 IAM call + 2 watsonx calls.
12. ✅ **Both known scenario IDs accepted** — Route tests verify esa-m2-609 and esa-m2-618 return 200.
13. ✅ **Unknown/missing/malformed scenario IDs return 400** — Route tests verify "unknown-scenario", empty object, and malformed JSON all return 400.
14. ✅ **Extra properties in request return 400** — Route test verifies strict schema enforcement.
15. ✅ **Success responses include Cache-Control: no-store** — Route test verifies header presence.
16. ✅ **No credentials leak into public responses** — Route tests verify API key, project ID, watsonx URL, IAM token, and model response body do not appear in error or fallback responses.

### Remaining risks

1. **Live watsonx integration not tested in CI** — By design; requires credentials and network. Manual verification recommended before production deployment.
2. **Real wall-clock AbortSignal timeout behavior in production remains untested** — Tests use fake timers to simulate bounded failure paths; actual timeout edge cases (e.g., slow network) not covered.
3. **IAM token expiration between retry attempts** — Not explicitly tested. If token expires between first and second watsonx attempt, second attempt would fail IAM auth. Current implementation would fall back to reference (safe behavior).
4. **Credential leakage tests verify absence of known test values** — Cannot prove absence of all possible leakage vectors (e.g., stack traces in production logs). Recommend structured logging and error sanitization in production.
5. **No test for IAM token refresh when expired** — If cached token is expired, `getIamToken()` correctly fetches a new one, but this path is not explicitly tested.

### Screenshot / session evidence

_Pending — add screenshot of Bob session and terminal output manually._

### Behavioral changes

- **MONITOR disposition guard is now stricter**: Previously allowed MONITOR with either telecommand OR planned-event. Now requires BOTH. This affects only model-generated briefs that attempt MONITOR without full context; reference analyses already have correct context.
- **Granite service boundary**: Deterministic mocked failure and contract paths are covered (malformed JSON, schema violations, unsupported evidence, simulated timeouts, retries, fallback). Real wall-clock AbortSignal behavior, live watsonx behavior, unknown leakage vectors, and IAM refresh remain listed risks.
- **Route contract**: Deterministic mocked failure and contract paths are covered (input validation, error handling, cache headers, credential leakage prevention with known test values). Real wall-clock AbortSignal behavior, live watsonx behavior, unknown leakage vectors, and IAM refresh remain listed risks.

### Commit reference

_Pending — commit after human review of Session 3 changes._

