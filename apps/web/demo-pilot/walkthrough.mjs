// Clips: ffmpeg -f lavfi -i testsrc2=size=960x720:rate=30:duration=10 -c:v libx264 -pix_fmt yuv420p clip-gym.mp4 (likewise clip-hit.mp4, clip-pitch.mp4).
// Demo pilot walkthrough through the real UI. Analysis is the worker's test-mode mock (labelled in the app).
import { chromium } from "@playwright/test";
import path from "node:path";
import { mkdirSync } from "node:fs";

const base = "http://127.0.0.1:3000";
const here = path.dirname(new URL(import.meta.url).pathname);
const out = path.join(here, "output");
mkdirSync(`${out}/shots`, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH, slowMo: 120 });
const size = { width: 1280, height: 800 };
const shot = (p, n) => p.screenshot({ path: `${out}/shots/${n}.png`, fullPage: true });
const pause = (p, ms = 900) => p.waitForTimeout(ms);

const coachCtx = await browser.newContext({ viewport: size, recordVideo: { dir: `${out}/video-coach`, size } });
const page = await coachCtx.newPage();
const coach = { name: "Casey Morgan", email: "casey.morgan@demo-pilot.test", password: "DemoPilot2026!" };

await page.goto(base); await pause(page, 1500); await shot(page, "01-landing");
await page.goto(`${base}/signup`);
await page.fill("#name", coach.name); await page.fill("#email", coach.email); await page.fill("#password", coach.password);
await page.getByRole("button", { name: "Create account" }).click();
await page.waitForURL(/onboarding/);
await page.fill("#name", "Westfield Softball (Demo Pilot)"); await page.fill("#team", "Varsity");
await page.check('input[name="attest"]'); await page.check('input[name="notice"]');
await page.getByRole("button", { name: "Create program" }).click();
await page.waitForURL(/onboarding\/access/);
await page.fill('input[name="code"]', "LOCAL-PILOT-2026"); await pause(page);
await shot(page, "02-pilot-code");
await page.getByRole("button", { name: "Continue" }).click();
await page.waitForURL(/dashboard/); await pause(page, 1200);

const players = [["Jordan Rivera", "12", "SS"], ["Sam Patel", "7", "CF"], ["Riley Chen", "22", "P"]];
for (const [name, num, pos] of players) {
  await page.goto(`${base}/app/roster`);
  await page.fill("#display_name", name); await page.fill("#jersey_number", num); await page.fill("#position", pos);
  await page.selectOption("#consent_status", "on_file");
  await page.getByRole("button", { name: "Add player" }).click();
  await page.getByRole("heading", { name }).waitFor();
}
await page.goto(`${base}/app/roster`); await pause(page, 1200); await shot(page, "03-roster");

const uploads = [["Jordan Rivera", "gym_test", "clip-gym.mp4"], ["Sam Patel", "softball_hitting", "clip-hit.mp4"], ["Riley Chen", "softball_pitching", "clip-pitch.mp4"]];
const videoUrls = {};
for (const [player, drill, file] of uploads) {
  await page.goto(`${base}/app/upload`);
  await page.selectOption("#u-player", { label: player });
  await page.selectOption("#u-drill", drill);
  if (drill === "softball_pitching") { await page.fill("#u-pitch", "Drop ball"); await page.fill("#u-target", "Glove low and away"); }
  await page.setInputFiles("#u-files", path.join(here, file)); await pause(page, 600);
  if (drill === "softball_hitting") await shot(page, "04-upload");
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await page.getByText(/Analysis queued/).waitFor({ timeout: 90_000 });
  await page.getByRole("link", { name: "Open review" }).click();
  await page.waitForURL(/\/app\/videos\//);
  videoUrls[player] = page.url();
}

async function waitDraft() {
  for (let i = 0; i < 60; i++) {
    await page.reload();
    if (await page.getByText("Current draft provenance").count()) return;
    await page.waitForTimeout(1000);
  }
  throw new Error("draft never appeared");
}
async function approvePublish(player, feedback) {
  await page.fill("textarea >> nth=0", feedback).catch(() => undefined);
  await page.getByRole("button", { name: /^Approve/ }).click();
  await page.getByText(/Approved v1/).waitFor();
  await page.getByRole("button", { name: `Confirm it shows ${player}` }).click();
  await page.getByText(/Confirmed: this recording shows/).waitFor();
  await page.getByRole("button", { name: "Publish v1" }).click();
  await page.getByText(/Published v1/).waitFor(); await pause(page, 1200);
}

// Hitting: coach corrects the suggested outcome.
await page.goto(videoUrls["Sam Patel"]); await waitDraft(); await pause(page, 1500); await shot(page, "05-review-draft");
await page.getByRole("radio", { name: "Fair contact" }).first().click(); await pause(page, 1200);
await approvePublish("Sam Patel", "Good balance through the finish. Keep the stride short.");
await shot(page, "06-review-published");

// Gym and pitching: approve as reviewed.
await page.goto(videoUrls["Jordan Rivera"]); await waitDraft(); await approvePublish("Jordan Rivera", "Solid hinge pattern today.");
await page.goto(videoUrls["Riley Chen"]); await waitDraft();
await page.getByRole("radio", { name: "Target hit" }).first().click(); await pause(page, 800);
await approvePublish("Riley Chen", "Release looked consistent.");

await page.goto(`${base}/app/library`); await pause(page, 1500); await shot(page, "07-library");
await page.goto(`${base}/app/dashboard`); await pause(page, 1500); await shot(page, "08-dashboard");

// Invite Sam as an athlete.
await page.goto(`${base}/app/roster`);
await page.getByRole("link", { name: /Sam Patel/ }).first().click();
await page.fill("#invite-email", "sam.patel@demo-pilot.test");
await page.getByRole("button", { name: "Create invitation link" }).click();
const text = await page.getByText(/\/invite\//).textContent();
const invitePath = new URL(text.match(/https?:\/\/\S+\/invite\/[0-9a-f]+/)[0]).pathname;
await pause(page, 1200);
await page.goto(`${base}/app/roster/${videoUrls["Sam Patel"] ? "" : ""}`).catch(() => undefined);
await coachCtx.close();

const athCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, recordVideo: { dir: `${out}/video-athlete`, size: { width: 390, height: 844 } } });
const ap = await athCtx.newPage();
await ap.goto(`${base}/signup?next=${encodeURIComponent(invitePath)}`);
await ap.fill("#name", "Sam Patel"); await ap.fill("#email", "sam.patel@demo-pilot.test"); await ap.fill("#password", "DemoAthlete2026!");
await ap.getByRole("button", { name: "Create account" }).click();
await ap.waitForURL(/\/invite\//); await pause(ap, 1200);
await ap.getByRole("button", { name: "Accept invitation" }).click();
await ap.waitForURL(/\/athlete/); await pause(ap, 2000);
await ap.screenshot({ path: `${out}/shots/09-athlete.png`, fullPage: true });
await ap.mouse.wheel(0, 900); await pause(ap, 1500);
await athCtx.close();
await browser.close();
console.log(JSON.stringify(videoUrls));
