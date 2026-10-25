// Apply pending database migrations before the server starts (`npm start`).
// Retries for a while, because on a brand-new deploy the database can still be starting up.
import { spawnSync } from "node:child_process";

const ATTEMPTS = 12;
const DELAY_MS = 5000;

for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
  const { status } = spawnSync("npx", ["prisma", "migrate", "deploy"], { stdio: "inherit", shell: true });
  if (status === 0) process.exit(0);
  if (attempt < ATTEMPTS) {
    console.log(`Database not ready (attempt ${attempt}/${ATTEMPTS}); retrying in ${DELAY_MS / 1000}s…`);
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
  }
}
console.error("Giving up: could not apply database migrations.");
process.exit(1);
