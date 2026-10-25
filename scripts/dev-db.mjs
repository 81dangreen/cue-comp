// Local Postgres for development, so you don't need to install it.
// Data lives in .pgdata/ (git-ignored). Leave this running alongside `npm run dev`.
// Production uses a managed Postgres (Railway) via DATABASE_URL instead.
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";

const PORT = 5433;
const DATABASE = "cuemanager";
const dataDir = new URL("../.pgdata", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "postgres",
  password: "postgres",
  port: PORT,
  persistent: true,
  onLog: () => {},
});

if (!existsSync(dataDir)) await pg.initialise();
await pg.start();
try {
  await pg.createDatabase(DATABASE);
} catch {
  // Already exists.
}
console.log(`Postgres running: postgresql://postgres:postgres@localhost:${PORT}/${DATABASE}`);
console.log("Press Ctrl+C to stop.");

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
