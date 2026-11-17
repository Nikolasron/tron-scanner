import { readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { headBlock, getBlock, decode } from "./tron.js";
import { loadPairs, savePairs, score } from "./score.js";
import { alert } from "./alerter.js";

const CURSOR = "state/cursor.json";
const MAX_RUNTIME_MS = Number(process.env.MAX_RUNTIME_SEC ?? 420) * 1000;
const CONFIRMATIONS = Number(process.env.CONFIRMATIONS ?? 20);
const BATCH = 20;

// Only these flags trigger a Telegram message.
// REPEAT_PAIR alone is tracked silently to avoid spam.
const ALERT_FLAGS = new Set(["HIGH_VALUE", "PERIODIC_7D", "EXCHANGE_DEPOSIT"]);

function atomicWrite(path: string, data: string) {
  mkdirSync("state", { recursive: true });
  const tmp = path + ".tmp";
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}

function readCursor(): number {
  try {
    return JSON.parse(readFileSync(CURSOR, "utf8")).lastBlock ?? 0;
  } catch {
    return 0;
  }
}

function writeCursor(n: number) {
  atomicWrite(CURSOR, JSON.stringify({ lastBlock: n, updatedAt: new Date().toISOString() }));
}

async function main() {
  const deadline = Date.now() + MAX_RUNTIME_MS;
  const pairs = loadPairs();

  const head = await headBlock();
  const safeHead = head - CONFIRMATIONS;
  let cursor = readCursor();

  // First run, or chain reset: start a small window behind head.
  if (cursor === 0 || cursor > safeHead) {
    cursor = Math.max(1, safeHead - BATCH);
    console.log(`[init] cursor=${cursor} head=${head} safeHead=${safeHead}`);
  }

  let processed = 0;
  let alerted = 0;

  while (cursor < safeHead && Date.now() < deadline) {
    const end = Math.min(cursor + BATCH, safeHead);

    for (let n = cursor + 1; n <= end; n++) {
      const block = await getBlock(n);
      const ts = Math.floor((block?.block_header?.raw_data?.timestamp ?? 0) / 1000);
      const xfers = decode(block);

      for (const x of xfers) {
        const flags = score(x, ts, pairs);
        if (flags.some((f) => ALERT_FLAGS.has(f))) {
          await alert(x, flags);
          alerted++;
        }
      }

      // Crash-safe: advance cursor + persist history after every block.
      writeCursor(n);
      savePairs(pairs);
      processed++;

      if (Date.now() >= deadline) break;
    }

    cursor = end;
  }

  console.log(`[done] processed=${processed} alerts=${alerted} cursor=${cursor} head=${head}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
