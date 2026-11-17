// Real-footage walkthrough, screen-recorded with a CDP screencast.
// Needs: web on :3000, worker with SMARVII_TEST_MODE=1 ANALYSIS_PROVIDER=session_review (or a real Anthropic key),
// and the two private clips in fixtures/private. Output: demo-pilot/output-real/frames + timing.json.
import { chromium } from "@playwright/test";
import path from "node:path";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";

const base = "http://127.0.0.1:3000";
const here = path.dirname(new URL(import.meta.url).pathname);
const clips = path.resolve(here, "../../../fixtures/private");
const out = path.join(here, "output-real");
rmSync(out, { recursive: true, force: true });
mkdirSync(`${out}/frames`, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH, args: ["--autoplay-policy=no-user-gesture-required"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
const frames = [];
let n = 0;
cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
  const f = `${out}/frames/f${String(n++).padStart(5, "0")}.jpg`;
  writeFileSync(f, Buffer.from(data, "base64"));
  frames.push({ f, t: metadata.timestamp });
  try { await cdp.send("Page.screencastFrameAck", { sessionId }); } catch {}
});
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 85, maxWidth: 1280, maxHeight: 800, everyNthFrame: 1 });

const wait = (ms) => page.waitForTimeout(ms);
// Caption bar drawn into the page so it is part of the recording.
async function caption(text, sub = "") {
  await page.evaluate(([text, sub]) => {
    let el = document.getElementById("__demo_caption");
    if (!el) {
      el = document.createElement("div");
      el.id = "__demo_caption";
      el.style.cssText = "position:fixed;left:16px;right:16px;bottom:16px;z-index:99999;background:rgba(17,24,39,.92);color:#fff;font:600 17px/1.35 system-ui,sans-serif;padding:12px 16px;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.35);pointer-events:none";
      document.body.appendChild(el);
    }
    el.innerHTML = `${text}${sub ? `<div style="font-weight:400;font-size:14px;opacity:.85;margin-top:3px">${sub}</div>` : ""}`;
  }, [text, sub]);
}
async function card(title, lines, ms = 4500) {
  await page.setContent(`<html><body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#0f172a;color:#f8fafc;font-family:system-ui,sans-serif">
    <div style="max-width:980px;padding:40px"><h1 style="font-size:40px;margin:0 0 18px">${title}</h1>${lines.map((l) => `<p style="font-size:21px;line-height:1.5;margin:8px 0;color:#cbd5e1">${l}</p>`).join("")}</div></body></html>`);
  await wait(ms);
}

await card("Smarvii Sports: real glasses footage", [
  "Two real gym clips recorded on glasses, run through the full coach workflow.",
  "Analysis: Claude viewed sampled frames of each clip in the build session and marked every rep. The worker fed that through the normal pipeline.",
  "This is not a live API run yet. Once an Anthropic key is set, the same screens fill from the API automatically.",
], 7000);

// Coach account and program
await page.goto(`${base}/signup`);
await caption("1 · Coach signs up");
await page.fill("#name", "Coach Demo"); await page.fill("#email", `coach.${Date.now()}@demo-gym.test`); await page.fill("#password", "DemoGym2026!");
await wait(800);
await page.getByRole("button", { name: "Create account" }).click();
await page.waitForURL(/onboarding/);
await caption("Creates a gym program");
await page.fill("#name", "Demo Strength Gym"); await page.selectOption("#sport", "gym"); await page.fill("#team", "Kettlebell group");
await page.check('input[name="attest"]'); await page.check('input[name="notice"]');
await wait(1200);
await page.getByRole("button", { name: "Create program" }).click();
await page.waitForURL(/onboarding\/access/);
await page.fill('input[name="code"]', "LOCAL-PILOT-2026");
await page.getByRole("button", { name: "Continue" }).click();
await page.waitForURL(/dashboard/);

await page.goto(`${base}/app/roster`);
await caption("2 · Adds the athlete to the roster");
await page.fill("#display_name", "Demo Athlete"); await page.selectOption("#consent_status", "on_file");
await wait(900);
await page.getByRole("button", { name: "Add player" }).click();
await page.getByRole("heading", { name: "Demo Athlete" }).waitFor();
await wait(1000);

const runs = [
  { file: "20261102172657258.MP4", title: "Clip 1 (25 s): mixed set", coach: "Coach count: 7 movements = 1 lunge + 6 hinges" },
  { file: "20261102172738437.MP4", title: "Clip 2 (14 s): hinge set", coach: "Coach count: 4 hinges (the opening pickup doesn't count)" },
];
const results = [];
for (const [i, r] of runs.entries()) {
  await page.goto(`${base}/app/upload`);
  await caption(`3 · Uploads ${r.title}`, "Real glasses footage, 1600×1200 at 30 fps. Drill: gym test.");
  await page.selectOption("#u-player", { label: "Demo Athlete" });
  await page.selectOption("#u-drill", "gym_test");
  await page.setInputFiles("#u-files", path.join(clips, r.file));
  await wait(1500);
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await page.getByText(/Analysis queued/).waitFor({ timeout: 120_000 });
  await caption("Uploaded. The worker checks the file, samples frames at 4 per second and runs the analysis.");
  await wait(1800);
  await page.getByRole("link", { name: "Open review" }).click();
  await page.waitForURL(/\/app\/videos\//);
  await caption("4 · Review screen while analysis runs");
  for (let k = 0; k < 90; k++) {
    if (await page.getByText("Current draft provenance").count()) break;
    await wait(1000); await page.reload(); await caption("4 · Review screen while analysis runs", "Probe → frame sampling → analysis windows → validation → merge");
  }
  await caption("5 · Suggested events are on the timeline", "Counted reps are included; setup, walking and idle time are kept but excluded.");
  await wait(3500);
  await page.getByRole("heading", { name: /^Events \(/ }).scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, -250);
  const evText = await page.getByRole("heading", { name: /^Events \(/ }).innerText();
  await caption(`5 · ${evText}`, r.coach);
  await wait(3000);
  // Jump to each event and play it.
  const rows = page.locator("ol > li");
  const count = await rows.count();
  let rep = 0;
  for (let j = 0; j < count; j++) {
    const row = rows.nth(j);
    const txt = (await row.innerText()).replace(/\s+/g, " ");
    const isRep = await row.locator('label:has-text("Count") input').first().isChecked();
    if (isRep) rep++;
    const label = await row.locator("span.font-medium").first().innerText();
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await row.locator("button.font-mono").first().click();
    await wait(250);
    await page.evaluate(() => document.querySelector("video")?.scrollIntoView({ block: "start" }));
    await caption(isRep ? `6 · Rep ${rep}: ${label}` : `6 · Not counted: ${label}`, txt.slice(0, 190));
    await page.evaluate(() => document.querySelector("video")?.play());
    await wait(isRep ? 1700 : 1100);
    await page.evaluate(() => document.querySelector("video")?.pause());
    await wait(500);
  }
  results.push({ ...r, events: evText, reps: rep });
  // Coach note, approve, confirm, publish.
  await page.getByLabel("New coach note").scrollIntoViewIfNeeded();
  await page.getByLabel("New coach note").fill(i === 0 ? "Good consistent depth on the hinges. Keep the back flat at the bottom." : "Steady tempo. Pickup excluded from the count.");
  await caption("7 · Coach adds a note and checks the draft notes");
  await wait(1500);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByText("Note added.").waitFor();
  await wait(1200);
  await caption("8 · Coach approves, confirms the athlete, and publishes", "Nothing reaches the athlete until the coach approves.");
  await page.getByRole("button", { name: /^Approve/ }).scrollIntoViewIfNeeded();
  await wait(1200);
  await page.getByRole("button", { name: /^Approve/ }).click(); await page.getByText(/Approved v1/).waitFor();
  await page.getByRole("button", { name: "Confirm it shows Demo Athlete" }).click(); await page.getByText(/Confirmed: this recording shows/).waitFor();
  await wait(800);
  await page.getByRole("button", { name: "Publish v1" }).click(); await page.getByText(/Published v1/).waitFor();
  await wait(1800);
}

await page.goto(`${base}/app/roster`);
await page.getByRole("link", { name: /Demo Athlete/ }).first().click();
await page.getByRole("link", { name: "Player report" }).click();
await wait(800);
await caption("9 · The athlete's report shows only coach-approved results");
await wait(3000);
await page.mouse.wheel(0, 500); await wait(2500);

writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 1));
await card("Result vs coach counts", [
  ...results.map((r) => `${r.title}: ${r.reps} reps suggested. ${r.coach}.`),
  "Caveat: Claude knew the coach counts before viewing, so this shows the workflow, not blind accuracy.",
  "Next: set ANTHROPIC_API_KEY to run the same clips through the live API, blind, with time and cost.",
], 8000);

await cdp.send("Page.stopScreencast");
await browser.close();
writeFileSync(`${out}/timing.json`, JSON.stringify(frames));
console.log(JSON.stringify(results), frames.length, "frames");
