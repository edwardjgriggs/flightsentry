import { chromium } from "playwright";

const baseUrl = process.env.FLIGHTSENTRY_CAPTURE_URL ?? "http://127.0.0.1:3000";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Run paired incident replay" }).click();

  const event609 = page.getByRole("article").filter({ hasText: "Event 609" });
  const event618 = page.getByRole("article").filter({ hasText: "Event 618" });
  await event609.getByText("Interactive investigation runbook", { exact: true }).waitFor({
    state: "visible",
    timeout: 20_000,
  });

  await event618
    .locator('section[aria-labelledby$="-impact-title"]')
    .screenshot({ path: "reports/review-evidence/21-s-tier-subsystem-impact.png" });

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
  const concernFinding = event609.getByLabel(
    "Operator finding for diagnostic check 3",
  );
  await concernFinding.fill("Attitude recovery needs an extended observation window.");
  await concernFinding.press("Home");

  await event609
    .locator('section[aria-labelledby$="-runbook-title"]')
    .screenshot({ path: "reports/review-evidence/22-s-tier-investigation-runbook.png" });
  await event609
    .locator("section.operator-checkpoint")
    .screenshot({ path: "reports/review-evidence/23-s-tier-concern-interlock.png" });
} finally {
  await browser.close();
}
