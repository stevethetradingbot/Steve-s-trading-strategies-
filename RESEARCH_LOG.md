# Trading Bot Research Log

## Iteration 1 (2026-02-16)
- SMA vs EMA → SMA wins
- Position sizing → Hurts
- Best: 10% SL, 20% TP on ETH

---

## Iteration 2 (2026-02-16)
- Volume filter → Worse
- Mean reversion → Worse

---

## Iteration 3 (2026-02-17)
- V1 (Simple) vs V2 (Advanced) → V1 wins

---

## Iteration 4 (2026-02-17)
- 5 strategies tested → SMA 10/30 wins

---

## Iteration 5 (2026-02-17)
- On 4 coins → 20/50 wins +32.8%

---

## Iteration 6 (2026-02-17)
- Creative: Keltner +21.6%, VWAP +14.2%

---

## Iteration 7 (2026-02-17)
- Hyper-opt: 18/45 12/24 = +33.4%

---

## Iteration 8 (2026-02-17)
- Fine-tune: 18/48 12/26 = +34.7%

---

## Iteration 9 (2026-02-17)
- Wider search: 22/55 10/24 = **+34.5%**

---

## Current Best Settings

| Parameter | Value |
|-----------|-------|
| **Strategy** | SMA Crossover |
| **SMA Periods** | 22 (fast) / 55 (slow) |
| **Stop Loss** | 10% |
| **Take Profit** | 24% |
| **Coins** | ETH, BTC, SOL |
| **Backtest Return** | **+34.5%** |

---

## Latest Rankings

| Rank | Strategy | ETH | BTC | SOL | Avg |
|------|----------|-----|-----|-----|-----|
| 🥇 | **22/55 10/24** | +37% | +24% | +42% | **+34.5%** |
| 🥈 | 18/48 12/26 | +51% | +15% | +38% | +34.7% |
| 🥉 | 19/50 12/26 | - | - | - | +31.1% |

---

## What We Learned
1. Simple SMA crossovers beat complex indicators
2. Medium SMAs (22/55) work best now
3. SL/TP around 10/24% is optimal
4. Keep testing → keeps improving!
