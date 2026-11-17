// Full coach -> athlete flow through the real UI. Analysis uses the worker's mock-test adapter (test mode only).
import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

const shots = path.resolve(__dirname, "../../e2e-artifacts/screenshots");
const run = Date.now().toString(36);
const coach = { name: "Casey Coach", email: `coach-${run}@example.test`, password: `pw-${run}-coach` };
const athlete = { name: "Avery Athlete", email: `athlete-${run}@example.test`, password: `pw-${run}-athlete` };
let clip: string;

async function snap(page: Page, name: string) {
  for (const [label, size] of [["desktop", { width: 1366, height: 900 }], ["mobile", { width: 390, height: 844 }]] as const) {
    await page.setViewportSize(size);
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(shots, `${name}-${label}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1366, height: 900 });
}

test.beforeAll(() => {
  mkdirSync(shots, { recursive: true });
  const dir = path.resolve(__dirname, "../../test-results/media");
  mkdirSync(dir, { recursive: true });
  clip = path.join(dir, "practice-gym.mp4");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30:duration=8", "-c:v", "libx264", "-pix_fmt", "yuv420p", clip]);
});

test("coach uploads, reviews and publishes; athlete sees only the published report", async ({ page, browser }) => {
  const cspViolations: string[] = [];
  page.on("console", (m) => { if (/Content Security Policy/i.test(m.text())) cspViolations.push(m.text()); });
  await page.goto("/");
  await snap(page, "01-landing");

  // Sign up and create the program.
  await page.goto("/signup");
  await page.fill("#name", coach.name);
  await page.fill("#email", coach.email);
  await page.fill("#password", coach.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/onboarding/);
  await page.fill("#name", "Westfield Softball");
  await page.fill("#team", "Varsity");
  await page.check('input[name="attest"]');
  await page.check('input[name="notice"]');
  await snap(page, "02-onboarding");
  await page.getByRole("button", { name: "Create program" }).click();
  await page.waitForURL(/\/onboarding\/access/);
  await page.check('input[value="evaluation"]');
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/app\/dashboard/);
  await snap(page, "03-dashboard");

  // Roster.
  await page.goto("/app/roster");
  await page.fill("#display_name", "Jordan Rivera");
  await page.fill("#jersey_number", "12");
  await page.getByRole("button", { name: "Add player" }).click();
  await expect(page.getByRole("heading", { name: "Jordan Rivera" })).toBeVisible();
  await page.goto("/app/roster");
  await expect(page.getByRole("link", { name: /Jordan Rivera/ }).first()).toBeVisible();
  await snap(page, "04-roster");

  // Upload with analysis of the first 8 s.
  await page.goto("/app/upload");
  await page.selectOption("#u-player", { label: "Jordan Rivera" });
  await page.selectOption("#u-drill", "gym_test");
  // Attribution is confirmed later in review; automated analysis is requested here.
  await expect(page.getByRole("checkbox", { name: /Request automated analysis/ })).toBeChecked();
  await page.setInputFiles("#u-files", clip);
  await snap(page, "05-upload");
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(page.getByText(/Analysis queued/)).toBeVisible({ timeout: 90_000 });
  await page.getByRole("link", { name: "Open review" }).click();
  await page.waitForURL(/\/app\/videos\//);
  const videoUrl = page.url();

  // Wait for the worker to finish (mock-test adapter) and the draft to appear.
  await expect(async () => {
    await page.reload();
    await expect(page.getByText(/mock-test/i).first()).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 90_000 });
  await snap(page, "06-review");

  // Approve, confirm attribution, publish.
  await page.getByRole("button", { name: /^Approve/ }).click();
  await expect(page.getByText(/Approved v1/)).toBeVisible();
  await page.getByRole("button", { name: /Confirm it shows Jordan Rivera/ }).click();
  await expect(page.getByText(/Confirmed: this recording shows/)).toBeVisible();
  await page.getByRole("button", { name: "Publish v1" }).click();
  await expect(page.getByText(/Published v1/)).toBeVisible();
  await snap(page, "07-published");

  await page.goto("/app/library");
  await snap(page, "08-library");

  // Invite the athlete.
  await page.goto("/app/roster");
  await page.getByRole("link", { name: /Jordan Rivera/ }).first().click();
  await page.fill("#invite-email", athlete.email);
  await page.getByRole("button", { name: "Create invitation link" }).click();
  const notice = await page.getByText(/\/invite\//).textContent();
  const inviteUrl = notice!.match(/https?:\/\/\S+\/invite\/[0-9a-f]+/)![0];
  const invitePath = new URL(inviteUrl).pathname;
  await page.getByRole("link", { name: /Player report|Report/ }).first().click().catch(() => undefined);

  // Athlete signs up through the invitation.
  const ctx = await browser.newContext();
  const ap = await ctx.newPage();
  await ap.goto(`/signup?next=${encodeURIComponent(invitePath)}`);
  await ap.fill("#name", athlete.name);
  await ap.fill("#email", athlete.email);
  await ap.fill("#password", athlete.password);
  await ap.getByRole("button", { name: "Create account" }).click();
  await ap.waitForURL(/\/invite\//);
  await ap.getByRole("button", { name: /Accept|Join/ }).click();
  await ap.waitForURL(/\/athlete/);
  await expect(ap.getByText("1 coach-confirmed rep in this recording.")).toBeVisible();
  await snap(ap, "09-athlete");

  // The athlete cannot open the coach review page or drafts.
  await ap.goto(videoUrl);
  await expect(ap).not.toHaveURL(videoUrl);
  await ctx.close();
  expect(cspViolations, "no CSP violations during the coach flow").toEqual([]);
});
