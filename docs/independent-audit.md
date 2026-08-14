# Independent audit: research notes and findings ledger

Companion to `docs/independent-audit-progress.md`. Research was performed 2026-08-13/14
against current authoritative sources before design or architecture changes.

## Research sources and lessons applied

### Aerospace console and telemetry-display references

- NASA JSC Crew Interfaces / Human Engineering Displays and Controls:
  https://www.nasa.gov/reference/jsc-crew-interfaces/
- NASA display standard (Appendix F, NASA-STD-3001 companion):
  https://www.nasa.gov/reference/appendix-f-vol-2/
- NASA-STD-3001 Volume 2 Rev C (human-systems integration):
  https://www.nasa.gov/wp-content/uploads/2020/10/2022-04-08_nasa-std-3001_vol_2_rev_c_final.pdf
  (requirement themes: selectable vs static vs data-entry elements visually
  distinct, consistent coding)
- NTRS 20250011659, Human-Centered Design of Next-Generation Telemetry
  Displays: https://ntrs.nasa.gov/citations/20250011659
  Key requirement themes applied: layered information hierarchy, contextual
  filtering, multimodal alerting, restrained synoptic displays.

Lessons implemented:

1. Strip charts, one channel per strip with its own fixed range and units, are
   the operational convention for multi-unit telemetry; a shared hidden y-axis
   overlay hides two of four channels (previous FlightSentry chart).
2. Status color must be reserved for status. Traces now use one neutral data
   ink; amber marks only detector-derived alert intervals and the first
   persistent-alert marker, so color keeps a single operational meaning.
3. Alerting must show its mechanism: the fused-score cell now exposes the
   threshold tick and three-of-five persistence pips instead of asserting an
   alert appeared.
4. State transitions announce themselves (live region, focus management), and
   completed state is explicitly latched rather than showing the recovered
   final frame.

### Dataset, model, and platform references

- ESA Anomaly Dataset (Zenodo record 12528696, CC BY 3.0 IGO):
  https://zenodo.org/records/12528696
- ESA-ADB benchmark paper: https://openreview.net/pdf?id=bbpRMoatVO
- IBM Granite 4 model family and watsonx.ai chat usage (model id
  `ibm/granite-4-h-small` verified current):
  https://www.ibm.com/granite/docs/models/granite and
  https://www.promptfoo.dev/docs/providers/watsonx/
- Next.js 16.3 in-repo agent docs (`node_modules/next/dist/docs`), consulted
  before editing `next.config.ts`; `headers()` config is unchanged in 16.x.
- WCAG 2.1 AA via axe-core rulesets (automated) plus manual keyboard,
  reduced-motion, zoom, and live-region review.

### Competitor: MissionGuard (read-only review, 2026-08-13)

https://missionguardplatform.duckdns.org/ is a Streamlit application over the
OPSSAT-AD dataset: eleven workspaces (overview, telemetry explorer, incident
intelligence, upload and test, model validation, drift monitor, reports,
attribution, archive, team, IBM Bob evidence), PostgreSQL persistence, and a
marketing hero ("MISSION GUARD", planet art, capability grid).

Competitive conclusions (no layout, wording, or code copied):

1. Breadth vs depth: MissionGuard spreads across many generic dashboard
   surfaces. FlightSentry's differentiation is one deep, operationally honest
   decision story (paired 609/618 with a deterministic context gate and
   counterfactuals); the audit therefore invested in that story rather than
   new surfaces.
2. Their sidebar exposes infrastructure details (pgAdmin login hints); a
   public demo should surface no infrastructure. FlightSentry stays
   serverless with secrets server-side only.
3. They lead with "real ESA data" credibility; FlightSentry's checksum-verified
   Mission 2 extracts and RETAIN_BUNDLED_DEMO gate are at least as strong and
   are surfaced in Technical Proof with exact hashes.
4. Their disclaimer ("educational research prototype, not certified flight
   software") is a good practice FlightSentry already mirrors in its footer
   and export records.

## Findings ledger (merged from the six-lens review and final audit)

Severity: H high, M medium, L low. Status: FIXED / DEFERRED (reason).

### Correctness and safety

- H `.vercelignore` unanchored `data/` also excluded `public/data/`, which
  would 404 the published extracts on the next deploy (latent; production
  predates the pattern). FIXED: anchored all patterns.
- H `.gitignore` trailing duplicate `.env*` re-ignored `.env.example`, so the
  README setup step failed on fresh clones. FIXED; `.env.example` is now
  untracked-visible for commit.
- H Replay used naive setInterval step counting; a throttled or occluded tab
  slowed the replay ~15x (observed live). FIXED: progress derives from
  elapsed wall time.
- M Reset during the Granite round trip was resurrected by in-flight
  responses. FIXED with a run-id guard; regression e2e added.
- M `enforceSafeDisposition` gated MONITOR on evidence-kind presence only,
  not the deterministic gate result. FIXED: gate decision passed in and
  enforced; tests added.
- M Explicitly ambiguous ESCALATE was preserved. FIXED: resolves to
  INVESTIGATE with an annotation; test added.
- M `scripts/data_pipeline/extract_scenarios.py` used `sys.maxsize` without
  importing `sys` (latent NameError for channel names without numeric
  suffix). FIXED plus regression test.
- M Reference fallback bypassed `resolveReferenceIncident`, so an offline
  brief could in principle contradict the gate. FIXED.
- M `validateConfig` never checked numeric normalization fields although two
  docstrings claimed it did. FIXED: range checks plus four rejection tests;
  docstrings corrected.
- L Normalization parity suite never exercised the production
  `robustNormalize`. FIXED: direct parity test added.
- L Detector strip and ablation table hardcoded 0.78/"FLAG". FIXED: values
  derive from the config artifact.

### Granite and API safety

- M No rate limiting on a watsonx-billing endpoint. FIXED: instance-local
  token bucket (30/min burst), 429 + Retry-After, tests.
- M Every replay re-billed two Granite generations for deterministic input.
  FIXED: five-minute server-side cache for successful live briefs only.
- L Parallel cold-start requests doubled the IAM exchange. FIXED: shared
  in-flight token promise; test asserts one IAM call.
- L Failed attempts were swallowed with no server-side diagnostics. FIXED:
  sanitized console.error per attempt.
- L Client analyze fetch had no timeout. FIXED: AbortSignal.timeout(30 s)
  falling back to the reference brief.

### Security and privacy

- M No CSP anywhere; other security headers applied only on Vercel. FIXED:
  full header set including strict CSP in `next.config.ts` (portable), cache
  rules remain in `vercel.ts`.
- L 26.8 MB of unused WebGPU (jsep) ONNX binaries deployed with every build.
  FIXED: deleted; `.vercelignore` guard added.

### Product story and UX

- H A judge could not distinguish live Granite from the bundled reference
  brief anywhere in the UI, and the footer hardcoded "GRANITE 4 READY".
  FIXED: provenance chip on every brief (live model id vs stored reference),
  source-aware footer, e2e assertion.
- H The reveal was blocked on the Granite network round trip. FIXED: the
  deterministic comparison and gate render at replay completion; briefs
  stream in behind a labeled skeleton. This also makes the product thesis
  (deterministic decision first, language second) visible.
- H All four channels shared one hidden y-scale, hiding the anomaly the
  product is about; no units, thresholds, onset or alert markers. FIXED:
  per-channel SVG strip charts with fixed ranges, units, alert-interval
  shading, first-alert marker, standby preview, and a text alternative.
  The uPlot dependency was removed entirely.
- M Ranked hypotheses with confidence (the strongest visible evidence that
  Granite reasons) were never rendered. FIXED with confidence bars.
- M The paired layout stacked below 1536 px. FIXED: two columns from 1280 px.
- M Fused score and three-of-five persistence were invisible. FIXED: FUSED
  cell with threshold tick and persistence pips; latched view shows first
  persistent-alert time.
- M Evidence timeline appeared all at once with no timestamps. FIXED: items
  reveal at their own T+ timestamps with ops-shorthand kind codes.
- L Copy: "Human verification gate" renamed "Ground truth check";
  "Operational differential" renamed "Decision comparison"; telemetry-only
  gate message now states the actual action; repeated two-fragment headline
  cadence reduced; "de-prioritizes"/"de-escalates" unified; footer dataset
  name unified to ESA-ADB and linked.
- L Extract links opened raw JSON over the app mid-demo. FIXED:
  target="_blank" noopener.
- L The old chart showed a crosshair cursor that revealed no values. The
  strip charts drop the cursor; each strip direct-labels its live value,
  which is the operational equivalent of a tooltip during replay. A
  post-replay hover readout across strips is a possible future refinement.
  DEFERRED (redundant with direct labels at n=84).

### Accessibility (target: WCAG 2.1 AA, zero serious/critical axe)

- H Detection status and dispositions changed silently for screen readers,
  and two role="status" banners mounted with their content. FIXED: one
  persistent state-derived live region announces alert latches,
  dispositions, brief arrival, and reference mode.
- M Focus was destroyed on Run/Reset/Reveal control replacement. FIXED with
  programmatic focus moves; e2e asserts the transitions.
- M Chart canvas was aria-hidden with no alternative. FIXED: generated text
  summary plus per-strip real-text values.
- M EvidenceToggle exposed inverted aria-pressed with a swapping action
  verb. FIXED: plain action buttons.
- M ModeCard aria-label collapsed its accessible name. FIXED: removed.
- M Counterfactual REMOVED rows used opacity dimming at 1.78:1. FIXED:
  compliant color swap with strikethrough (found by the new multi-state axe
  sweep).
- M uPlot canvas axis labels at 3.91:1 escaped axe (canvas). FIXED
  structurally: the SVG chart uses HTML text at compliant contrast.
- L Progressbar semantics, keyboard-scrollable proof tables, summary focus
  style, group role on export controls, small-text contrast on dark-mint
  cells (4.45:1 to 5+:1). All FIXED.
- Coverage: axe now sweeps idle, completed, telemetry-only, counterfactual,
  Technical Proof, and mobile idle states on desktop and mobile projects.

### Performance and reliability

- H Both uPlot charts were destroyed and rebuilt about 29 times per second
  during replay. FIXED: SVG strips re-render as cheap path updates; no
  chart library, one dependency removed.
- M ONNX wasm (13.5 MB) raced the replay on slow networks. FIXED: runtime
  warms on operator intent (Run-button hover/focus or first touch), so a
  live demo has the runtime ready before the click while page-load metrics
  stay clean (a first-paint idle warm-up was tried and rejected: it dropped
  Lighthouse performance from 96 to 76 by pulling the 3.4 MiB wasm into the
  trace window). A failed session create no longer poisons later attempts.
- L RSC payload float precision, memoization of proof view. DEFERRED: values
  measured in microseconds/KB at n=84; changing telemetry precision would
  perturb validated detector outputs for no visible gain.

### Documentation honesty

- H Bob build log claimed "Event 618 remains ESCALATE", contradicting the
  implemented and tested INVESTIGATE behavior. FIXED with correction note.
- M validation.md said the context-integrity phase was uncommitted (it is
  commit 25ffa78) and carried two conflicting "final" Lighthouse tables.
  FIXED against the recorded artifacts.
- M Bob log recommended-session numbering collided with executed session
  records. FIXED: marked as superseded plan.
- The Bob build log records representative prompts, file changes, test results,
  review corrections, and final primary-tool attribution. Optional interface
  captures remain owner-supplied supporting evidence.

### Hygiene

- Removed Next template SVGs; removed unused `vite-tsconfig-paths`; added
  `@vitest/coverage-v8` so the configured coverage thresholds are runnable;
  em/en dash sweep across all outward-facing text per owner standard;
  `.playwright-mcp/` ignored.
