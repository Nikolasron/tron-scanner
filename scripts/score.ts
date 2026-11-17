import { readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";

const PAIRS = "state/pairs.json";
type Hist = Record<string, number[]>; // "from:to" -> unix seconds

const THRESHOLD = Number(process.env.VALUE_THRESHOLD_SUN ?? 1_000_000_000);
const PERIOD_TOL = 2 * 3600;
const PERIOD = 7 * 86400;

const EXCHANGES = new Set<string>([
  // "TXxxx...binance_hot",
]);

export function loadPairs(): Hist {
  try {
    return JSON.parse(readFileSync(PAIRS, "utf8"));
  } catch {
    return {};
  }
}

export function savePairs(h: Hist) {
  for (const k of Object.keys(h)) {
    h[k] = h[k].slice(-50);
    if (!h[k].length) delete h[k];
  }
  mkdirSync("state", { recursive: true });
  const tmp = PAIRS + ".tmp";
  writeFileSync(tmp, JSON.stringify(h));
  renameSync(tmp, PAIRS);
}

export function score(
  x: { from: string; to: string; amountSun: number },
  ts: number,
  h: Hist,
): string[] {
  const flags: string[] = [];
  if (x.amountSun >= THRESHOLD) flags.push("HIGH_VALUE");
  if (EXCHANGES.has(x.to)) flags.push("EXCHANGE_DEPOSIT");

  const key = `${x.from}:${x.to}`;
  const hist = (h[key] ??= []);

  if (hist.some((p) => Math.abs(ts - p - PERIOD) <= PERIOD_TOL)) {
    flags.push("PERIODIC_7D");
  } else if (hist.length >= 2) {
    flags.push("REPEAT_PAIR");
  }

  hist.push(ts);
  return flags;
}
