import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

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
  await expect(page.getByText("NOMINAL", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Reveal expert annotations" }).click();
  await expect(page.getByText(/event 609 is categorized/i)).toBeVisible();
  await expect(page.getByText(/event 618 is categorized/i)).toBeVisible();
});

test("proves the context decision with mode comparison and counterfactual evidence", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Run paired incident replay" }).click();
  const event609 = page.getByRole("article").filter({ hasText: "Event 609" });
  await expect(event609.getByText("MONITOR", { exact: true }).first()).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Telemetry only", exact: true }).click();
  await expect(event609.getByText("INVESTIGATE", { exact: true }).first()).toBeVisible();
  await expect(event609.getByText(/AI CONTEXT BRIEF GATED/i)).toBeVisible();

  await page.getByRole("button", { name: "Trusted context", exact: true }).click();
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
  await expect(event609.getByRole("button", { name: "Export JSON" })).toBeVisible({ timeout: 15_000 });

  const downloadPromise = page.waitForEvent("download");
  await event609.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("flightsentry-event-609-decision.json");
});

test("technical proof is keyboard reachable and labels evaluation scope", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Technical proof" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: /signals first/i })).toBeVisible();
  await expect(page.getByText(/not official ESA-ADB benchmark results/i).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: /authentic data. staged deployment/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /one unnecessary investigation prevented/i })).toBeVisible();
  await expect(page.getByText("100%", { exact: true })).toHaveCount(3);
  await expect(page.getByText(/retain bundled demo/i)).toBeVisible();
});

test("has no serious or critical axe violations", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Run paired incident replay" }).click();
  await expect(page.getByText("6/6 PASS", { exact: true })).toBeVisible({ timeout: 15_000 });
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter((violation) =>
    ["serious", "critical"].includes(violation.impact ?? ""),
  );
  expect(blocking).toEqual([]);
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
  await page.getByRole("button", { name: "Technical proof" }).click();
  await expect(page.getByRole("heading", { name: /signals first/i })).toBeVisible();
});

test("keeps the paired replay usable with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "Run paired incident replay" }).click();
  await expect(page.getByText("6/6 PASS", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("article").filter({ hasText: "Event 618" }).getByText("INVESTIGATE", { exact: true }).first()).toBeVisible();
});
