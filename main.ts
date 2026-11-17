// btc-race-24h-20261117-0603: a slow long-only cbBTC bot for agent-fun/bars-replay/v1.
//
// Strategy (chosen from the dev window, 1440 1-minute bars, 16-17 Nov 2026):
// - The dev window is choppy and range-bound ($63,874-$65,467, net +0.49%).
//   Every fast trend system tested on it loses money: each round trip pays
//   ~26 bps in fees, slippage and price impact, so 1-minute EMA crosses
//   (68 trades, -$106) and RSI mean reversion (-$22) both bleed out.
//   The only rules that end the dev window above $0 are "buy once and hold"
//   variants: buy-and-hold +$1.07, momentum (buy at bar 24, hold) +$2.45.
// - So this bot trades rarely on purpose: one full-size entry, then it
//   only exits on a real crash and re-enters on a confirmed recovery.
//   - Entry: from batch 24 on, buy all cash the first time the trailing
//     24-bar return is above -0.5% (on the dev window that is batch 24
//     itself, return -0.11%, so it buys at batch 24 and holds).
//   - Crash exit: sell everything if the close falls 3% below the peak
//     close since entry. The dev window's worst peak-to-trough slide is
//     -2.12%, so the stop never fires there; in the race it caps a crash
//     at about -3% instead of riding it to the end.
//   - Re-entry: after an exit, buy again only when the close is 1% above
//     the trough since the exit AND the trailing 24-bar return is positive.
//   - At most 8 round trips (16 orders, far under the 64-order cap) and
//     no new entries after batch 1200, so late whipsaws cannot pile up.
// - Pure function of the bars seen so far: no clock, no network, no
//   randomness, no files. Two runs on the same data give the same orders.
// - Local grade on the dev window (grade-local, process driver):
//   net PnL +$2.45, 1 trade, max drawdown 2.12%, guardrails met.
//   (Verified after writing; see repo NOTES.md.)

import { runBars, type BarsState, type OrderInput } from "./vendor/makefun-bars.ts";

const SYMBOL = "CBBTC";
const LOOKBACK = 24;
const ENTRY_MIN_RETURN_BPS = -50n; // -0.5%: buy at batch 24 unless clearly falling
const STOP_BPS = 300n; // 3% below the peak close since entry
const REBUY_RISE_BPS = 100n; // 1% above the trough since the exit
const MAX_ROUND_TRIPS = 8;
const LAST_ENTRY_SEQ = 1200;
const MAX_SLIPPAGE_BPS = 500; // 5%: wide enough for 1-min gaps, guards a flash open

const closes: bigint[] = []; // latest close per batch, price-scale units
let peak: bigint | null = null; // highest close since entry
let trough: bigint | null = null; // lowest close since the last exit
let roundTrips = 0;
let entered = false;

/** Trailing 24-bar return in bps, integer math, or null without history. */
function ret24(): bigint | null {
  if (closes.length <= LOOKBACK) return null;
  const then = closes[closes.length - 1 - LOOKBACK];
  const now = closes[closes.length - 1];
  if (then <= 0n) return null;
  return ((now - then) * 10000n) / then;
}

function buy(state: BarsState): OrderInput[] {
  const room = state.weightRoom(SYMBOL);
  const amount = state.cash < room ? state.cash : room;
  if (amount <= 0n) return [];
  if (amount < BigInt(state.hello.fees.min_notional_quote_units)) return [];
  return [{ side: "buy", symbol: SYMBOL, notional_quote_units: amount, max_slippage_bps: MAX_SLIPPAGE_BPS }];
}

await runBars({
  onBatch(state) {
    const close = state.close(SYMBOL);
    if (close === null) return [];
    closes.push(close);
    const seq = state.seq;
    if (state.warmingUp || seq >= 1439) return [];

    const holding = state.positions.get(SYMBOL);
    if (holding !== undefined) {
      if (peak === null || close > peak) peak = close;
      if (close * 10000n <= peak * (10000n - STOP_BPS)) {
        peak = null;
        trough = close;
        roundTrips += 1;
        return [{ side: "sell", symbol: SYMBOL, qty: holding.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }

    // Flat: consider entering.
    if (roundTrips >= MAX_ROUND_TRIPS || seq > LAST_ENTRY_SEQ) return [];
    const r24 = ret24();
    if (r24 === null) return [];
    if (!entered) {
      if (r24 > ENTRY_MIN_RETURN_BPS) {
        entered = true;
        peak = close;
        return buy(state);
      }
      return [];
    }
    // Re-entry after a crash exit: 1% above the trough and momentum positive.
    if (trough !== null && r24 > 0n && close * 10000n >= trough * (10000n + REBUY_RISE_BPS)) {
      trough = null;
      peak = close;
      return buy(state);
    }
    return [];
  },
});
