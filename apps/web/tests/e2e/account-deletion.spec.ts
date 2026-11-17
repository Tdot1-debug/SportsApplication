// Account deletion through the real UI: a personal-workspace user deletes their account from /account, is signed
// out, and can no longer sign in.
import { expect, test } from "@playwright/test";

const run = Date.now().toString(36);
const me = { name: "Dana Delete", email: `dana-${run}@example.test`, password: `pw-${run}-dana` };

test("a user can delete their own account and personal workspace", async ({ page }) => {
  await page.goto("/signup");
  await page.fill("#name", me.name);
  await page.fill("#email", me.email);
  await page.fill("#password", me.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/onboarding/);
  await page.getByRole("link", { name: /Just me: personal training/ }).click();
  await page.waitForURL(/\/onboarding\/personal/);
  await page.check('input[name="sports"][value="strength"]');
  await page.check('input[name="adult"]');
  await page.check('input[name="attest"]');
  await page.check('input[name="notice"]');
  await page.getByRole("button", { name: "Create my workspace" }).click();
  await page.waitForURL(/\/onboarding\/access/);
  await page.check('input[value="evaluation"]');
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/app\/dashboard/);

  await page.getByRole("link", { name: "Account" }).first().click();
  await page.waitForURL(/\/account/);
  await expect(page.getByRole("heading", { name: "Delete my account" })).toBeVisible();
  await page.fill("#confirm", "wrong@example.test");
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page.getByText(/Type your email address exactly/)).toBeVisible();

  await page.fill("#confirm", me.email);
  await page.getByRole("button", { name: "Delete my account" }).click();
  await page.waitForURL((u) => u.pathname === "/" && u.searchParams.has("account_deleted"));
  await expect(page.getByText("Your account has been deleted.")).toBeVisible();

  await page.goto("/login");
  await page.fill("#email", me.email);
  await page.fill("#password", me.password);
  await page.getByRole("button", { name: /Sign in/ }).click();
  await expect(page.getByText(/Invalid|incorrect|not/i).first()).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});
