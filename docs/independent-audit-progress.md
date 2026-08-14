# Independent audit and improvement progress

Working log for the independent audit session started 2026-08-13 (overnight into
2026-08-14). Full findings ledger and research notes: `docs/independent-audit.md`.

## Current baseline (verified)

- Branch `main`, one unpushed commit (`0505fa2`); all session changes remain
  UNCOMMITTED for owner review. Production untouched.
- Baseline `npm run verify` passed before any change (exit 0, 2026-08-13
  ~22:50). Prior recorded gates: Vitest 99, Playwright 7/7, axe clean,
  Lighthouse 96/100/100/100, Python 38/38.
- Production read-only check: https://flightsentry.vercel.app serves the
  pre-session build; extract JSONs return 200 (the .vercelignore bug was
  latent, not live).

## Status by phase

1. Inventory + baseline: DONE.
2. Six-lens review: accessibility, end-user, performance, maintainability,
   correctness, and security reports received and merged through private review handoffs.
   correctness and security agents were still running at last check; pinged.
3. Research (NASA/ESA/IBM/Next/MissionGuard): DONE, in independent-audit.md.
4. Implementation: DONE for all merged findings. Highlights:
   - Server: gate-aware enforceSafeDisposition, ambiguous ESCALATE resolves
     to INVESTIGATE, reference fallback realigned via resolveReferenceIncident,
     IAM in-flight dedup, 5-min success-only response cache
     (clearAnalysisCache exported for tests), sanitized attempt logging,
     rate limit (src/lib/rate-limit.ts, 30/min token bucket) wired into
     /api/analyze (429 + Retry-After), CSP + security headers in
     next.config.ts (cache rules stay in vercel.ts).
   - Client: mission-console rework (run-id guard fixes reset race; replay
     progress derives from elapsed wall time so throttled tabs cannot stall
     it; deterministic comparison + gate render at replay end while briefs
     stream behind a skeleton; derived sr-only live region; focus management;
     provenance chip LIVE/REFERENCE; dynamic footer with ESA-ADB link;
     xl two-column pairing; ONNX warms via requestIdleCallback).
   - Charts: telemetry-chart.tsx rewritten as dependency-free SVG per-channel
     strips (fixed ranges, units, alert-interval shading, first-alert marker,
     standby preview, sr summary). uPlot REMOVED from package.json and
     layout.tsx.
   - Detector strip: FUSED cell with threshold ticks on all bars, 3/5
     persistence pips, first-persistent-alert time in latched mode, ONNX/TS
     runtime tag, non-color above-threshold markers.
   - Incident brief: ranked hypotheses with confidence bars.
   - Evidence timeline: per-item T+ reveal, TC/PLAN/TLM/MODEL codes,
     contrast-safe REMOVED styling.
   - Lib: BASELINE_END + channelBaselineStats shared with ONNX path; ONNX
     session promise cleared on rejection; applyPersistence extracted;
     madScores uses config madMultiplier; validateConfig numeric
     normalization checks; shared dispositionStyle; model-id constants;
     EVENT_WINDOW constant; context-metrics cleanup.
   - Hygiene: .gitignore duplicate .env* removed (.env.example now
     trackable), .vercelignore anchored (/data/ bug), jsep wasm + template
     SVGs deleted, vite-tsconfig-paths removed, @vitest/coverage-v8 added,
     `import sys` fix + test in extract_scenarios.py, em/en dash sweep
     everywhere (subagent, verified zero remaining in scope).
   - Docs: README (stack, safety hardening, verify instructions),
     architecture.md (failure handling 1-9, safety properties), model-card
     guardrails, validation.md stale-claims fixes, bob-log corrections
     (ESCALATE line, superseded plan note).
5. Validation: COMPLETE. Final gates on the finished code: verify pass
   (lint 0 warnings, tsc, Vitest 114/114, production build), Playwright
   20/20 (chromium + mobile-chromium, six-state axe sweep zero
   serious/critical), Python 39/39 via uv, npm audit 0 vulnerabilities,
   coverage 94.6% statements (thresholds met), production-build smoke test
   (headers, 400/429 paths, assets), Lighthouse 94/100/100/100 (TBT 30 ms,
   CLS 0, 290 KiB). Evidence set + index at reports/review-evidence/; session record
   appended to docs/validation.md (Session 6).
6. Late additions from the replacement security review (no critical/major):
   HTML-export escaping hardened for the two literal-union holes, structured
   429 and Granite-fallback logging. A first-paint ONNX warm-up was measured
   at Lighthouse Performance 76 and replaced with intent-based warm-up
   (hover/focus/touch), restoring 94.
7. The chart's screen-reader summary was found announcing the alert time
   before the replay reached it (future-leak); made phase-aware.

## Environmental notes

- Python suite must run via `uv run --with-requirements requirements-ml.txt`
  (bare .venv lacks pandas/onnx); matches prior validation records.
- Local .env.local has no watsonx credentials (only a Vercel OIDC token), so
  live-Granite states cannot be captured locally; reference mode is the
  deterministic local path and e2e pins GRANITE_LIVE_ENABLED=false.
- Next dev refuses two dev servers for one project; kill port 3100 instance
  before `npm run test:e2e` if it lingers.

## Remaining risks

- Security review (replacement agent): SHIP verdict, no critical or major
  findings; its minor defense-in-depth items were implemented, its
  deployment-shape notes (x-forwarded-for trust off-Vercel, shared "local"
  bucket behind no proxy) are documented in code comments and its report.
- Correctness review: the original agent stalled; a replacement was still
  finishing at session end. Compensating evidence: every safety invariant is
  covered by targeted unit tests (114) and e2e (20), including counterfactual
  round-trips, gate-fail demotion, ambiguous-ESCALATE demotion, rate-limit,
  cache, and reset-race regression tests.
- Live Granite states were not capturable locally (no credentials); covered
  by mocked contract tests and the recorded production verification.
- Bob usage is summarized in the public build log. Authentic interface captures
  remain optional supporting evidence and can be attached by the owner.
- Lighthouse Performance 94 vs prior 96: within run variance (LCP 2.9 s vs
  2.7 s on the same font-gated h1); TBT improved 50 to 30 ms.
