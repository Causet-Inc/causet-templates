/**
 * Hello Causet — end-to-end demo script.
 *
 * Prerequisites: deploy this app's IR to your fork (see README.md).
 * Then: npm run dev --prefix app
 */

import { executeIntent, loadConfig, runQuery, sleep } from "./causet.js";

const cfg = loadConfig();
const greetingId = `greet-${Date.now()}`;

console.log("{{templateName}} — {{projectName}}");
console.log(`API ${cfg.apiUrl} · ${cfg.platform}/${cfg.application} · fork ${cfg.fork}`);
console.log();

async function main() {
  console.log("1) CREATE_GREETING");
  const created = await executeIntent(cfg, {
    streamId: "greeting_stream",
    entityId: greetingId,
    intentType: "CREATE_GREETING",
    payload: { greeting_id: greetingId, message: "Hello, Causet" },
  });
  console.log(JSON.stringify(created, null, 2));
  console.log();

  console.log("2) waiting briefly for projection worker…");
  await sleep(1500);

  console.log("3) get_greeting");
  const one = await runQuery(cfg, "get_greeting", { greeting_id: greetingId });
  console.log(JSON.stringify(one, null, 2));
  console.log();

  console.log("4) UPDATE_GREETING");
  const updated = await executeIntent(cfg, {
    streamId: "greeting_stream",
    entityId: greetingId,
    intentType: "UPDATE_GREETING",
    payload: { greeting_id: greetingId, message: "Hello again" },
  });
  console.log(JSON.stringify(updated, null, 2));
  console.log();

  await sleep(1500);

  console.log("5) get_greeting (after update)");
  const after = await runQuery(cfg, "get_greeting", { greeting_id: greetingId });
  console.log(JSON.stringify(after, null, 2));
  console.log();

  console.log("6) list_greetings");
  const list = await runQuery(cfg, "list_greetings");
  console.log(JSON.stringify(list, null, 2));
  console.log();
  console.log("Done. Try: causet inspect timeline --entity", greetingId, "--stream greeting_stream");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  console.error("\nMake sure the app is compiled and deployed (see README.md).");
  process.exit(1);
});
