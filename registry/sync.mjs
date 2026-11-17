// Copies the capability registry into the worker package and the web app so both ship the same version.
// Run after editing registry/capabilities.v1.json. Tests in both packages fail if a copy drifts.
import { copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(root, "capabilities.v1.json");
for (const dest of ["../services/worker/src/smarvii_worker/capabilities.v1.json", "../apps/web/src/lib/capabilities.v1.json"]) {
  copyFileSync(src, path.join(root, dest));
  console.log(`copied → ${dest}`);
}
