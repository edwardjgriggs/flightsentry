import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function expectNoBlockingViolations(page: Page, context: string) {
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter((violation) =>
    ["serious", "critical"].includes(violation.impact ?? ""),
  );
  expect(blocking, `axe serious/critical violations in state: ${context}`).toEqual([]);
}

test("runs the paired incident workflow and reveals expert labels", async ({ page }) => {
  page.on("console", (message) => {
    if (message.type() === "error") console.log(`BROWSER ERROR: ${message.text()}`);
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /same signal/i })).toBeVisible();
  await page.getByRole("button", { name: "Run paired incident replay" }).click();
  await expect(page.getByText(/ONNX VERIFIED/)).toBeVisible({ timeout: 10_000 });

  const event609 = page.getByRole("article").filter({ hasText: "Event 609" });
  const event618 = page.getByRole("article").filter({ hasText: "Event 618" });
  await expect(event609.getByText("MONITOR", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  await expect(event618.getByText("INVESTIGATE", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("EVENT DETECTED", { exact: true })).toHaveCount(2);
  await expect(page.getByText("Latched peak detector scores", { exact: true })).toHaveCount(2);
  await expect(page.getByText("Subsystem impact analysis", { exact: true })).toHaveCount(2);
  await expect(page.getByText("Interactive investigation runbook", { exact: true })).toHaveCount(2);
  await expect(page.getByText("NOMINAL", { exact: true })).toHaveCount(0);

  // The strip charts mark where persistence first fired, in both panels.
  await expect(page.getByRole("article").getByText(/ALERT T\+/)).toHaveCount(2);
  // The fused ensemble cell is present in both panels.
  await expect(page.getByText("FUSED", { exact: true })).toHaveCount(2);

  await page.getByRole("button", { name: "Reveal expert annotations" }).click();
  await expect(page.getByText(/event 609 is categorized/i)).toBeVisible();
  await expect(page.getByText(/event 618 is categorized/i)).toBeVisible();
});

test("labels Granite provenance honestly in reference mode", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Run paired incident replay" }).click();
  const event609 = page.getByRole("article").filter({ hasText: "Event 609" });
  await expect(event609.getByText("MONITOR", { exact: true }).first()).toBeVisible({ timeout: 15_000 });

  // GRANITE_LIVE_ENABLED=false in the e2e server: the brief must visibly say so.
  await expect(page.getByText(/REFERENCE BRIEF/).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/REFERENCE MODE/).first()).toBeVisible();
  await expect(page.getByText("GRANITE REFERENCE MODE")).toBeVisible();
  // Ranked hypotheses with confidence are rendered from the validated brief.
  await expect(page.getByText("Ranked hypotheses").first()).toBeVisible();
  await expect(event609.getByText(/^H1$/).first()).toBeVisible();
});

test("proves the context decision with mode comparison and counterfactual evidence", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Run paired incident replay" }).click();
  const event609 = page.getByRole("article").filter({ hasText: "Event 609" });
  await expect(event609.getByText("MONITOR", { exact: true }).first()).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: /^Telemetry only/ }).click();
  await expect(event609.getByText("INVESTIGATE", { exact: true }).first()).toBeVisible();
  await expect(event609.getByText(/AI CONTEXT BRIEF GATED/i)).toBeVisible();

  await page.getByRole("button", { name: /^Trusted context/ }).click();
  await event609.getByRole("button", { name: "REMOVE COMMAND", exact: true }).click();
  await expect(event609.getByText(/COUNTERFACTUAL ACTIVE/i)).toBeVisible();
  await expect(event609.getByText("INVESTIGATE", { exact: true }).first()).toBeVisible();

  await event609.getByRole("button", { name: "RESTORE COMMAND", exact: true }).click();
  await expect(event609.getByText("MONITOR", { exact: true }).first()).toBeVisible();
  await expect(event609.getByText(/COUNTERFACTUAL ACTIVE/i)).toHaveCount(0);
});

test("downloads an auditable incident decision record", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Run paired incident replay" }).click();
  const event609 = page.getByRole("article").filter({ hasText: "Event 609" });
  const exportButton = event609.getByRole("button", { name: "Export JSON" });
  await expect(exportButton).toBeVisible({ timeout: 15_000 });
  await expect(exportButton).toBeEnabled({ timeout: 15_000 });

  const downloadPromise = page.waitForEvent("download");
  await exportButton.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("flightsentry-event-609-decision.json");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const record = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  expect(record).toMatchObject({
    schemaVersion: "3",
    investigation: { status: "IN_PROGRESS", resolved: 0, total: 3 },
  });
  expect(record.subsystemImpact).toHaveLength(3);
});

test("technical proof is keyboard reachable and labels evaluation scope", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Technical proof" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: /never controls the detection result/i })).toBeVisible();
  await expect(page.getByText(/not official ESA-ADB benchmark results/i).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: /real mission 2 source data/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /one unnecessary investigation prevented/i })).toBeVisible();
  await expect(page.getByText("100%", { exact: true })).toHaveCount(3);
  await expect(page.getByText(/retain bundled demo/i)).toBeVisible();
});

test("moves focus to the replay controls when the run starts", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Run paired incident replay" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeFocused();
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.getByRole("button", { name: "Run paired incident replay" })).toBeFocused();
});

test("pauses and seeks to the exact alert frame", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Run paired incident replay" }).click();
  await page.getByRole("button", { name: "Pause" }).click();
  await page.getByRole("button", { name: "Jump alert" }).click();

  await expect(page.getByRole("slider", { name: "Replay timeline cursor" })).toHaveValue("52");
  await expect(page.getByText("T+052", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("DETECTOR ALERT", { exact: true })).toHaveCount(2);
});

test("renders a recalculating causal decision trace", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Run paired incident replay" }).click();
  await expect(page.getByRole("heading", { name: /signal matches/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("3/3 FLAG", { exact: true })).toHaveCount(2);
  await expect(page.getByText("GATE PASS", { exact: true })).toHaveCount(1);
  await expect(page.getByText("GATE FAIL", { exact: true })).toHaveCount(1);

  await page.getByRole("button", { name: /^Telemetry only/ }).click();
  await expect(page.getByText("GATE FAIL", { exact: true })).toHaveCount(2);
  await expect(page.getByText(/MODE: TELEMETRY-ONLY/)).toBeVisible();

  await page.getByRole("button", { name: "Jump alert" }).click();
  await expect(page.getByText("TIMELINE REVIEW", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /signal matches/i })).toBeVisible();
  await expect(page.getByText("Human decision checkpoint")).toHaveCount(2);
});

test("records a human severity raise before export", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Run paired incident replay" }).click();
  const event609 = page.getByRole("article").filter({ hasText: "Event 609" });
  await expect(event609.getByText("MONITOR", { exact: true }).first()).toBeVisible({ timeout: 15_000 });

  const recordButton = event609.getByRole("button", { name: "Record operator decision" });
  await expect(recordButton).toBeDisabled();
  for (const checkNumber of [1, 2, 3]) {
    await event609
      .getByRole("group", { name: `Result for check ${checkNumber}` })
      .getByRole("button", { name: "Verified" })
      .click();
  }
  await expect(event609.getByText("COMPLETE", { exact: true })).toBeVisible();
  await expect(recordButton).toBeEnabled();
  await event609.getByText("Raise to INVESTIGATE", { exact: true }).click();
  await event609.getByLabel("Decision rationale").fill("Extend review until attitude recovery is confirmed.");
  await recordButton.click();

  await expect(event609.getByText("Operator checkpoint recorded")).toBeVisible();
  await expect(event609.getByText("FINAL INVESTIGATE")).toBeVisible();
});

test("raises the minimum accountable outcome when the runbook records a concern", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Run paired incident replay" }).click();
  const event609 = page.getByRole("article").filter({ hasText: "Event 609" });
  await expect(event609.getByText("MONITOR", { exact: true }).first()).toBeVisible({ timeout: 15_000 });

  for (const checkNumber of [1, 2]) {
    await event609
      .getByRole("group", { name: `Result for check ${checkNumber}` })
      .getByRole("button", { name: "Verified" })
      .click();
  }
  await event609
    .getByRole("group", { name: "Result for check 3" })
    .getByRole("button", { name: "Concern" })
    .click();

  const recordButton = event609.getByRole("button", { name: "Record operator decision" });
  await expect(recordButton).toBeDisabled();
  await event609
    .getByLabel("Operator finding for diagnostic check 3")
    .fill("Attitude recovery requires an extended observation window.");

  await expect(event609.getByText(/OPEN CONCERN · Minimum accountable outcome raised to INVESTIGATE/i)).toBeVisible();
  await expect(event609.getByText("Accept MONITOR", { exact: true })).toHaveCount(0);
  await expect(event609.getByText("Raise to INVESTIGATE", { exact: true })).toBeVisible();
  await expect(recordButton).toBeEnabled();
});

test("reset during Granite analysis stays reset", async ({ page }) => {
  // Slow the analyze endpoint so reset can race it.
  await page.route("**/api/analyze", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    await route.continue();
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Run paired incident replay" }).click();
  await expect(page.getByText("GRANITE ANALYZING", { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.getByText("SYSTEM READY")).toBeVisible();
  // The in-flight responses must not resurrect the completed state.
  await page.waitForTimeout(2_500);
  await expect(page.getByText("SYSTEM READY")).toBeVisible();
  await expect(page.getByText("EVENT DETECTED", { exact: true })).toHaveCount(0);
});

test("has no serious or critical axe violations across key states", async ({ page }) => {
  await page.goto("/");
  await expectNoBlockingViolations(page, "idle operations view");

  await page.getByRole("button", { name: "Run paired incident replay" }).click();
  await expect(page.getByText("6/6 PASS", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/REFERENCE BRIEF/).first()).toBeVisible({ timeout: 15_000 });
  await expectNoBlockingViolations(page, "completed replay, trusted context");

  await page.getByRole("button", { name: /^Telemetry only/ }).click();
  await expectNoBlockingViolations(page, "telemetry-only comparison");

  await page.getByRole("button", { name: /^Trusted context/ }).click();
  const event609 = page.getByRole("article").filter({ hasText: "Event 609" });
  await event609.getByRole("button", { name: "REMOVE COMMAND", exact: true }).click();
  await expect(event609.getByText(/COUNTERFACTUAL ACTIVE/i)).toBeVisible();
  await expectNoBlockingViolations(page, "counterfactual active");

  await page.getByRole("button", { name: "Technical proof" }).click();
  await expect(page.getByRole("heading", { name: /never controls the detection result/i })).toBeVisible();
  await expectNoBlockingViolations(page, "technical proof view");
});

test("keeps the mission controls usable at a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Run paired incident replay" })).toBeVisible();
  const widths = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client);
  await expectNoBlockingViolations(page, "mobile idle view");
  await page.getByRole("button", { name: "Technical proof" }).click();
  await expect(page.getByRole("heading", { name: /never controls the detection result/i })).toBeVisible();
});

test("keeps the paired replay usable with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "Run paired incident replay" }).click();
  await expect(page.getByText("6/6 PASS", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("article").filter({ hasText: "Event 618" }).getByText("INVESTIGATE", { exact: true }).first()).toBeVisible();
});
