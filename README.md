# btc-race-24h-20261117-0603 — slow long-only cbBTC bot

Entry for make.fun "Race a BTC trading bot live for 24 hours"
($250, 10 places paid; race window starts 15 minutes after the
12:03 UTC deadline on 17 Nov 2026).

## Strategy

Trade rarely on purpose. On the published dev window (1,440 1-minute
bars, BTC $63,874–$65,467, net +0.49%) every fast system loses money:
a round trip costs ~26 bps in fees, slippage and price impact, so
1-minute EMA crosses lose -$106 over 68 trades and RSI mean
reversion loses -$22. Only buy-once-and-hold variants end above $0.

- **Entry:** from batch 24, buy all cash the first time the trailing
  24-bar return is above -0.5%. On the dev window that is batch 24
  itself (return -0.11%).
- **Crash exit:** sell everything if the close falls 3% below the
  peak close since entry. The dev window's worst peak-to-trough slide
  is -2.12%, so the stop never fires there; in the race it caps a
  crash at about -3%.
- **Re-entry:** after an exit, buy again only when the close is 1%
  above the trough since the exit and the 24-bar return is positive.
- **Limits:** at most 8 round trips, no new entries after batch 1200.

## Files

- `main.ts` — the bot (Node 22, erasable TypeScript, standard library only).
- `vendor/makefun-bars.ts` — byte-identical copy of the kit's
  `sdk/makefun-bars.ts` shim; it owns the bars-replay/v1 wire protocol.
  (An earlier Python draft of the same logic is kept outside the repo
  at `../main.py.ref`; only main.ts is the entrypoint.)

## Local grade (dev window)

```
node cli/makefun.mjs grade-local --kit <kit> --bot <this repo> --driver process
```

Result: net PnL +$2.45, 1 trade, max drawdown 2.12%, guardrails met
(dev gate needs net PnL above $0). See NOTES.md.
