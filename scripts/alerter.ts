export async function alert(
  x: { from: string; to: string; amountSun: number; txid: string; type: string },
  flags: string[],
) {
  const icon =
    flags.includes("HIGH_VALUE")      ? "🐋" :
    flags.includes("PERIODIC_7D")     ? "🔁" :
    flags.includes("EXCHANGE_DEPOSIT")? "🏦" : "👀";

  const text =
    `${icon} <b>${flags.join(",")}</b>\n` +
    `<code>${x.from}</code>\n→ <code>${x.to}</code>\n` +
    `<b>${(x.amountSun / 1e6).toLocaleString()} ${x.type === "TRX" ? "TRX" : "tokens"}</b>\n` +
    `<a href="https://tronscan.org/#/transaction/${x.txid}">view tx</a>`;

  const r = await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: process.env.TELEGRAM_CHAT,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    },
  ).catch(() => null);

  if (r && r.status === 429) {
    const body = await r.json().catch(() => ({} as any));
    const wait = (body?.parameters?.retry_after ?? 3) * 1000;
    await new Promise((res) => setTimeout(res, wait));
  }
}
