import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
import path from "node:path";

// Local end-to-end run: real Next.js server, real local Supabase, real worker process in explicit
// test mode (SMARVII_TEST_MODE=1, ANALYSIS_PROVIDER=mock). The mock adapter is labelled "mock-test" in
// the database and never represents a model result.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const worker = path.resolve(__dirname, "../../services/worker/.venv/bin/smarvii-worker");

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  outputDir: "test-results",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    // Optional: point at a preinstalled Chromium (e.g. CI images) instead of `playwright install`.
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  webServer: [
    { command: "pnpm start --hostname 127.0.0.1 --port 3000", url: "http://127.0.0.1:3000/api/health", reuseExistingServer: true, timeout: 120_000 },
    {
      command: worker,
      url: "http://127.0.0.1:8089/",
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
        SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY ?? "",
        SMARVII_TEST_MODE: "1",
        ANALYSIS_PROVIDER: "mock",
        HEALTH_PORT: "8089",
        POLL_SECONDS: "1",
        WORKER_ID: "e2e-worker",
      },
    },
  ],
});
