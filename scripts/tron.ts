const BASE = "https://api.trongrid.io";

async function tron(path: string, body?: object, attempt = 0): Promise<any> {
  const r = await fetch(`${BASE}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      "TRON-PRO-API-KEY": process.env.TRONGRID_API_KEY!,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if ((r.status === 429 || r.status >= 500) && attempt < 5) {
    const retryAfter = Number(r.headers.get("retry-after") ?? 0) * 1000;
    const wait = retryAfter || 500 * 2 ** attempt;
    await new Promise((res) => setTimeout(res, wait));
    return tron(path, body, attempt + 1);
  }

  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`tron ${path} ${r.status} ${text}`);
  }
  return r.json();
}

export const headBlock = async (): Promise<number> =>
  (await tron("/wallet/getnowblock")).block_header.raw_data.number;

export const getBlock = (num: number) => tron("/wallet/getblockbynum", { num });

export type Xfer = {
  txid: string;
  from: string;
  to: string;
  amountSun: number;
  type: "TRX" | "TRC20";
};

// Official USDT contract address on Tron (in Hex format)
const USDT_CONTRACT_HEX = "41a614f803b6fd780986a42c78ec9c7f77e6ded13c";

export function decode(block: any): Xfer[] {
  const out: Xfer[] = [];
  for (const tx of block.transactions ?? []) {
    // skip reverted txs
    const ret = tx.ret?.[0]?.contractRet;
    if (ret && ret !== "SUCCESS") continue;

    for (const c of tx.raw_data.contract ?? []) {
      const v = c.parameter.value;

      // 1. Native TRX Transfers
      if (c.type === "TransferContract" && typeof v.amount === "number") {
        out.push({
          txid: tx.txID,
          from: v.owner_address,
          to: v.to_address,
          amountSun: v.amount,
          type: "TRX",
        });
      } 
      // 2. Smart Contract Transfers (TRC20)
      else if (c.type === "TriggerSmartContract") {
        
        // ONLY look at USDT. Skip all other tokens.
        if (v.contract_address !== USDT_CONTRACT_HEX) continue;

        const data: string = v.data ?? "";
        // transfer(address,uint256) selector
        if (data.startsWith("a9059cbb") && data.length >= 136) {
          const toAddr = "41" + data.slice(32, 72);          // last 20 bytes of word 1
          const amtHex = data.slice(72, 136);                 // word 2
          out.push({
            txid: tx.txID,
            from: v.owner_address,
            to: toAddr,
            amountSun: Number(BigInt("0x" + amtHex)), // Note: USDT uses 6 decimals
            type: "TRC20",
          });
        }
      }
    }
  }
  return out;
}
