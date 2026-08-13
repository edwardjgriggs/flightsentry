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

  await expect(page.getByText("MONITOR", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("ESCALATE", { exact: true })).toBeVisible();
  await expect(page.getByText("EVENT DETECTED", { exact: true })).toHaveCount(2);
  await expect(page.getByText("Latched peak detector scores", { exact: true })).toHaveCount(2);
  await expect(page.getByText("NOMINAL", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Reveal expert annotations" }).click();
  await expect(page.getByText(/event 609 is categorized/i)).toBeVisible();
  await expect(page.getByText(/event 618 is categorized/i)).toBeVisible();
});

test("technical proof is keyboard reachable and labels evaluation scope", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Technical proof" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: /signals first/i })).toBeVisible();
  await expect(page.getByText(/not official ESA-ADB benchmark results/i)).toBeVisible();
});

test("has no serious or critical axe violations", async ({ page }) => {
  await page.goto("/");
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
  await page.getByRole("button", { name: "Technical proof" }).click();
  await expect(page.getByRole("heading", { name: /signals first/i })).toBeVisible();
});
