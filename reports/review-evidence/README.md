# Independent audit evidence index

Visual and automated evidence for the 2026-08-13/14 audit-hardening session
and the subsequent S-tier product-capability pass. Captures 01 through 16 were
taken against the LOCAL PRODUCTION BUILD (`next start` at
http://127.0.0.1:3000 with `GRANITE_LIVE_ENABLED=false`). Captures 17 through
20 were taken against the local Next.js development server after the new
capabilities passed targeted browser tests. Chromium was used through
Playwright. Production at flightsentry.vercel.app was never modified.

Each entry: route and viewport, interaction sequence, expected vs actual, and
the related project-hardening requirement or finding from
`docs/independent-audit.md`.

| File | Route / viewport | Interaction | Expected | Actual |
| --- | --- | --- | --- | --- |
| `01-desktop-idle.png` | `/` 1440x1000 | Load only | Standby console: strip charts with baseline preview, zeroed detector cells, STANDBY gutters, no spoiled outcome | As expected |
| `02-desktop-replay-onset.png` | `/` 1440x1000 | Run replay, wait for the visible DETECTOR ALERT chip, Pause (landed at 67%) | Both panels in DETECTOR ALERT; amber alert bands and ALERT T+052 markers on strips; persistence pips 3/5; 609 timeline shows TC T+049 + PLAN T+048, 618 shows telemetry/model only | As expected |
| `03-desktop-complete.png` | `/` 1440x1000 | Replay to completion | Decision comparison appears immediately: telemetry-only 609+618 INVESTIGATE vs trusted context 609 MONITOR / 618 INVESTIGATE; EVENT DETECTED chips; latched peak scores | As expected |
| `04-telemetry-only.png` | `/` 1440x1000 | Completed replay, select Telemetry only | Both events INVESTIGATE; trusted-context card shows the alternative; detector results unchanged | As expected |
| `05-609-command-removed.png` | `/` 1440x1000 | Trusted context, REMOVE COMMAND on 609 | 609 gate 4/6 PASS, INVESTIGATE, COUNTERFACTUAL ACTIVE notice, Granite brief withheld; 618 unchanged beside it | As expected |
| `06-609-plan-removed.png` | `/` 1440x1000 | Restore command, REMOVE PLAN | 609 gate fails on plan checks, INVESTIGATE | As expected |
| `07-609-both-restored.png` | `/` 1440x1000 | RESTORE PLAN | 609 returns to 6/6 PASS MONITOR, counterfactual notice gone | As expected |
| `08-618-gate-fail.png` | `/` 1440x1000 | Completed replay, scroll to 618 gate | 3/6 PASS with explicit FAIL rows (no command precedes onset, no overlapping event, no evidence pair), INVESTIGATE | As expected |
| `09-reference-mode-brief.png` | `/` 1440x1000 | Completed replay without credentials | REFERENCE MODE banner plus provenance chip "REFERENCE BRIEF · STORED-REFERENCE-V1"; footer GRANITE REFERENCE MODE | As expected |
| `10-technical-proof-full.png` | `/` proof view, full page | Switch to Technical proof | Calibration record, ablation table with config-derived threshold labels, context-effectiveness metrics, source evaluation with RETAIN BUNDLED DEMO gate | As expected |
| `11-export-html-record.png` | exported record, full page | Export Printable HTML from 609, render the downloaded file | Decision record with gate table, active evidence, validated analysis, acknowledgement block | As expected |
| `flightsentry-event-609-decision.json` / `.html` | downloads | Export JSON + Printable HTML | Versioned record `flightsentry-esa-m2-609-*`, correct filenames | As expected |
| `12a-mobile-idle.png`, `12b-mobile-complete.png` | `/` 390x844 | Load; run replay | Single-column stack, mode cards with disposition chips, no horizontal overflow | As expected |
| `13-zoom-200.png` | `/` 720x1000 (1440 at 200% zoom equivalent) | Run replay to completion | Reflow without horizontal scroll (measured scrollWidth == clientWidth == 720) | As expected |
| `14a-keyboard-skip-link.png` | `/` 1440x1000 | Tab once | "Skip to mission console" link visible and focused | As expected |
| `14b-keyboard-focus-ring.png` | `/` 1440x1000 | Tab to controls | Mint focus ring visible on control | As expected |
| `15-reduced-motion-complete.png` | `/` 1440x1000, `prefers-reduced-motion: reduce` | Run replay to completion | Full workflow completes; animations neutralized by the global reduced-motion override | As expected |
| `16-error-endpoint-unavailable.png` | `/` 1440x1000, `/api/analyze` aborted | Run replay with the endpoint blocked | Deterministic gate and dispositions still render; briefs fall back with "Analysis endpoint unavailable" reference banner | As expected |
| `17-s-tier-causal-trace.png` | `/` 1440x1000 | Complete paired replay | Recalculating six-stage causal trace; 98% four-channel shape correlation; 3/3 detector flags in both cases; command and plan evidence diverge; 609 gate passes while 618 fails | As expected |
| `18-s-tier-operator-checkpoint.png` | `/` 1440x1000 | Complete replay, scroll to both context gates | Each event exposes a human decision checkpoint; only accepted or higher-severity outcomes are available; draft export remains available | As expected |
| `19-s-tier-mobile-trace.png` | `/` 390x844 | Complete replay, scroll to causal trace | Summary reflows to one column; three-column trace remains locally scrollable without widening the document | As expected |
| `20-s-tier-alert-inspection.png` | `/` 1440x1000 | Start replay, pause, jump to alert | Inspectable mission clock lands at T+052; both detector alerts, telemetry strips, threshold markers, and synchronized evidence are visible | As expected |
| `21-s-tier-subsystem-impact.png` | `/` 1440x1000 | Complete replay, event 618 impact section | Fixture-derived channel baseline, signed peak delta, peak time, and recovery across power, attitude-control, and thermal subsystems; no synthetic severity score | As expected |
| `22-s-tier-investigation-runbook.png` | `/` 1440x1000 | Event 609 runbook with two verified checks and one documented concern | Diagnostic guidance becomes accountable operator work with per-check result and finding capture | As expected |
| `23-s-tier-concern-interlock.png` | `/` 1440x1000 | Document event 609 concern, view checkpoint | MONITOR is unavailable; minimum accountable outcome is automatically raised to INVESTIGATE and rationale remains required | As expected |
| `lighthouse-review.report.html` / `.json` | `/` production build | Lighthouse 13.4.1, headless Chromium | See scores below | Performance 94, Accessibility 100, Best Practices 100, SEO 100 (FCP 1.7 s, LCP 3.0 s, TBT 40 ms, CLS 0, 290 KiB) |

Live Granite success state: not capturable locally (no watsonx credentials in
the local environment; only a Vercel OIDC token is present). The live path is
covered by mocked contract tests (`src/lib/granite.test.ts`) and by the
recorded production verification in `docs/validation.md` ("Live Granite
production verification": both scenarios returned `source: watsonx` with the
correct dispositions on deployment `dpl_BwwZ2KBmPUmw4XufbFjkoULn9fau`).

Automated evidence for the completed S-tier pass (exact commands in `docs/validation.md`):
`npm run verify` pass (ESLint 0 warnings, tsc, Vitest 124, production build),
`npx playwright test` 28/28 across chromium + mobile-chromium including a
six-state axe sweep with zero serious/critical findings, Python suite 39/39
via `uv run`, `npm audit --audit-level=high` zero vulnerabilities,
`npm run test:coverage` 94.46% statements / 84.66% branches / 97.98%
functions / 96.03% lines. Lighthouse was not rerun after the capability pass;
the production scores below are from the immediately preceding audit build.
