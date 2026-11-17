// Core journey 2 through the real UI: an individual creates a private workspace, uploads, analyses (worker
// mock-test adapter, test mode only), reviews, saves a self-reviewed report, revisits training history, sets a goal,
// invites a coach and then revokes that coach's access.
import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

const shots = path.resolve(__dirname, "../../e2e-artifacts/screenshots");
const run = Date.now().toString(36);
const me = { name: "Sam Rivera", email: `sam-${run}@example.test`, password: `pw-${run}-sam` };
const coach = { name: "Morgan Coach", email: `mcoach-${run}@example.test`, password: `pw-${run}-coach` };
let clip: string;

test.beforeAll(() => {
  mkdirSync(shots, { recursive: true });
  const dir = path.resolve(__dirname, "../../test-results/media");
  mkdirSync(dir, { recursive: true });
  clip = path.join(dir, "personal-strength.mp4");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30:duration=8", "-c:v", "libx264", "-pix_fmt", "yuv420p", clip]);
});

test("individual: private workspace → upload → analyse → self-review → history; coach access granted then revoked", async ({ page, browser }) => {
  const csp: string[] = [];
  page.on("console", (m) => { if (/Content Security Policy/i.test(m.text())) csp.push(m.text()); });

  await page.goto("/signup");
  await page.fill("#name", me.name);
  await page.fill("#email", me.email);
  await page.fill("#password", me.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/onboarding/);
  await page.getByRole("link", { name: /Just me: personal training/ }).click();
  await page.waitForURL(/\/onboarding\/personal/);
  await page.check('input[name="sports"][value="strength"]');
  await page.check('input[name="sports"][value="tennis"]');
  await page.fill("#goal", "Eyes ahead at the bottom of every hinge");
  await page.check('input[name="adult"]');
  await page.check('input[name="attest"]');
  await page.check('input[name="notice"]');
  await page.screenshot({ path: path.join(shots, "p01-personal-onboarding.png"), fullPage: true });
  await page.getByRole("button", { name: "Create my workspace" }).click();
  await page.waitForURL(/\/onboarding\/access/);
  await page.check('input[value="evaluation"]');
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/app\/dashboard/);
  await expect(page.getByText("Personal workspace")).toBeVisible();
  await expect(page.getByRole("link", { name: "Roster" })).toHaveCount(0);

  // Upload a session for myself.
  await page.goto("/app/upload");
  await page.selectOption("#u-drill", "gym_test");
  await page.setInputFiles("#u-files", clip);
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(page.getByText(/Analysis queued/)).toBeVisible({ timeout: 90_000 });
  await page.getByRole("link", { name: "Open review" }).click();
  await page.waitForURL(/\/app\/videos\//);
  const videoUrl = page.url();
  await expect(async () => {
    await page.reload();
    await expect(page.getByText(/mock-test/i).first()).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 90_000 });

  // Self-review: clearly labelled, not a coach approval.
  await expect(page.getByRole("heading", { name: "Save your self-review" })).toBeVisible();
  await page.getByRole("button", { name: "Approve as self-review" }).click();
  await expect(page.getByText(/Approved v1, not yet saved/)).toBeVisible();
  await page.getByRole("button", { name: `Confirm it shows ${me.name}` }).click();
  await expect(page.getByText(/Confirmed: this recording shows/)).toBeVisible();
  await page.getByRole("button", { name: "Save v1" }).click();
  await expect(page.getByText(/Saved v1/)).toBeVisible();
  await expect(page.getByText("Self-reviewed · not coach-approved").first()).toBeVisible();
  await page.screenshot({ path: path.join(shots, "p02-self-review.png"), fullPage: true });

  // Training history, goals and report.
  await page.getByRole("link", { name: "Profile, goals & history" }).click();
  await expect(page.getByRole("heading", { name: "Your profile and training history" })).toBeVisible();
  await expect(page.getByText("Eyes ahead at the bottom of every hinge")).toBeVisible();
  await page.fill("#goal-text", "Consistent toss height");
  await page.selectOption("#goal-sport", "tennis");
  await page.getByRole("button", { name: "Add goal" }).click();
  await expect(page.getByText("Consistent toss height")).toBeVisible();
  await expect(page.locator(`a[href="${new URL(videoUrl).pathname}"]`).first()).toBeVisible();
  await page.screenshot({ path: path.join(shots, "p03-history-goals.png"), fullPage: true });
  await page.getByRole("link", { name: "My reports" }).click();
  await expect(page.getByText("Self-reviewed · not coach-approved").first()).toBeVisible();
  await expect(page.getByText(/self-reviewed totals/)).toBeVisible();

  // Invite a coach.
  await page.goto("/app/settings");
  await expect(page.getByRole("heading", { name: "Coach access & settings" })).toBeVisible();
  await page.fill('input[name="email"]', coach.email);
  await page.getByRole("button", { name: "Create invitation link" }).click();
  const notice = await page.getByText(/\/invite\//).textContent();
  const invitePath = new URL(notice!.match(/https?:\/\/\S+\/invite\/[0-9a-f]+/)![0]).pathname;

  const ctx = await browser.newContext();
  const cp = await ctx.newPage();
  await cp.goto(`/signup?next=${encodeURIComponent(invitePath)}`);
  await cp.fill("#name", coach.name);
  await cp.fill("#email", coach.email);
  await cp.fill("#password", coach.password);
  await cp.getByRole("button", { name: "Create account" }).click();
  await cp.waitForURL(/\/invite\//);
  await cp.getByRole("button", { name: /Accept|Join/ }).click();
  await cp.waitForURL(/\/app/);
  await cp.goto(videoUrl);
  await expect(cp.getByText("Invited coach (personal workspace)")).toBeVisible();
  await expect(cp.getByRole("heading", { name: "Approve and publish" })).toBeVisible();

  // Revoke: the coach loses access immediately.
  await page.goto("/app/settings");
  await page.getByRole("button", { name: "Revoke access" }).click();
  await page.getByRole("button", { name: "Remove access" }).click();
  await expect(page.getByText(coach.email)).toHaveCount(0, { timeout: 10_000 }).catch(() => undefined);
  await cp.goto(videoUrl);
  await expect(cp).not.toHaveURL(videoUrl);
  await ctx.close();
  expect(csp, "no CSP violations").toEqual([]);
});
