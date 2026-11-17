// Gym demo pilot walkthrough through the real UI (gym program, gym test + "any movement" uploads).
// Analysis here is the worker's labelled test-mode mock unless the worker runs with an Anthropic key.
// Clips: ffmpeg -f lavfi -i testsrc2=size=960x720:rate=30:duration=10 -c:v libx264 -pix_fmt yuv420p clip-gym.mp4 (likewise clip-hit.mp4, clip-pitch.mp4).
import { chromium } from "@playwright/test";
import path from "node:path";
import { mkdirSync } from "node:fs";

const base = "http://127.0.0.1:3000";
const here = path.dirname(new URL(import.meta.url).pathname);
const out = path.join(here, "output-gym");
mkdirSync(`${out}/shots`, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const shot = (p, n) => p.screenshot({ path: `${out}/shots/${n}.png`, fullPage: true });

await page.goto(`${base}/signup`);
await page.fill("#name", "Jamie Ortiz"); await page.fill("#email", "jamie.ortiz@demo-gym.test"); await page.fill("#password", "DemoGym2026!");
await page.getByRole("button", { name: "Create account" }).click();
await page.waitForURL(/onboarding/);
await page.fill("#name", "Iron Peak Strength (Demo Pilot)"); await page.selectOption("#sport", "gym"); await page.fill("#team", "Morning group");
await page.check('input[name="attest"]'); await page.check('input[name="notice"]');
await shot(page, "01-gym-onboarding");
await page.getByRole("button", { name: "Create program" }).click();
await page.waitForURL(/onboarding\/access/);
await page.fill('input[name="code"]', "LOCAL-PILOT-2026");
await page.getByRole("button", { name: "Continue" }).click();
await page.waitForURL(/dashboard/);

for (const name of ["Alex Kim", "Morgan Lee", "Taylor Brooks"]) {
  await page.goto(`${base}/app/roster`);
  await page.fill("#display_name", name); await page.selectOption("#consent_status", "on_file");
  await page.getByRole("button", { name: "Add player" }).click();
  await page.getByRole("heading", { name }).waitFor();
}
await page.goto(`${base}/app/roster`); await shot(page, "02-gym-clients");

const uploads = [
  ["Alex Kim", "gym_test", null, "clip-gym.mp4"],
  ["Morgan Lee", "general_movement", "Kettlebell swing; one rep = hips back, then stand tall at lockout", "clip-hit.mp4"],
  ["Taylor Brooks", "general_movement", "Goblet squat; one rep = hips below knees, then back to standing", "clip-pitch.mp4"],
];
const urls = {};
for (const [player, drill, desc, file] of uploads) {
  await page.goto(`${base}/app/upload`);
  await page.selectOption("#u-player", { label: player });
  await page.selectOption("#u-drill", drill);
  if (desc) await page.fill("#u-movement", desc);
  await page.setInputFiles("#u-files", path.join(here, file));
  if (player === "Morgan Lee") await shot(page, "03-any-movement-upload");
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await page.getByText(/Analysis queued/).waitFor({ timeout: 90_000 });
  await page.getByRole("link", { name: "Open review" }).click();
  await page.waitForURL(/\/app\/videos\//);
  urls[player] = page.url();
}
async function waitDraft() {
  for (let i = 0; i < 60; i++) { await page.reload(); if (await page.getByText("Current draft provenance").count()) return; await page.waitForTimeout(1000); }
  throw new Error("no draft");
}
for (const [player, , , ] of uploads) {
  await page.goto(urls[player]); await waitDraft();
  if (player === "Morgan Lee") await shot(page, "04-any-movement-review");
  await page.getByRole("button", { name: /^Approve/ }).click(); await page.getByText(/Approved v1/).waitFor();
  await page.getByRole("button", { name: `Confirm it shows ${player}` }).click(); await page.getByText(/Confirmed: this recording shows/).waitFor();
  await page.getByRole("button", { name: "Publish v1" }).click(); await page.getByText(/Published v1/).waitFor();
}
await page.goto(`${base}/app/library`); await shot(page, "05-gym-library");
await page.goto(`${base}/app/roster`); await page.getByRole("link", { name: /Morgan Lee/ }).first().click();
await page.getByRole("link", { name: "Player report" }).click(); await page.waitForTimeout(800); await shot(page, "06-gym-client-report");
await browser.close();
console.log(JSON.stringify(urls));
