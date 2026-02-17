# Trading Bot Research Log

## Iteration 1 (2026-02-16)

### Research Done
1. ✅ Coinbase API documentation studied
2. ✅ SMA vs EMA comparison tested
3. ✅ Position sizing impact tested
4. ✅ Multiple SL/TP ratios optimized

### Key Findings
- SMA beats EMA by 23.66%
- Position sizing (2%) hurts performance
- Best: ETH, 10% SL, 20% TP

---

## Iteration 2 (2026-02-16)
- Volume filter tested → Worse
- Mean reversion tested → Worse

---

## Iteration 3 (2026-02-17)
- Built V1 (Simple) vs V2 (Advanced)
- V1 wins: +18.15% vs +11.58%

---

## Iteration 4 (2026-02-17)
- Strategy showdown: 5 strategies tested
- SMA 10/30 wins

---

## Iteration 5 (2026-02-17)
- Tested on 4 coins (ETH, BTC, SOL, DOT)
- **20/50 wins with +32.8%**

---

## Iteration 6 (2026-02-17)
### Creative Strategy Lab
| Strategy | Return |
|----------|--------|
| Keltner | +21.6% |
| VWAP | +14.2% |
| Dual EMA | +13.9% |
| SMA 20/50 | +32.8% |

---

## Iteration 7 (2026-02-17)
### Hyper-Optimization
| Settings | Return |
|----------|--------|
| 18/45 12/24 | +33.4% |
| 20/50 12/24 | +30.9% |
| 10/30 12/24 | +20.2% |

---

## Iteration 8 (2026-02-17)
### Fine-Tuning
| Settings | ETH | BTC | SOL | Average |
|----------|-----|-----|-----|---------|
| 18/45 12/26 | +51% | +14% | +27% | **+30.6%** |

---

## Current Best Settings

| Parameter | Value |
|-----------|-------|
| **Strategy** | SMA Crossover |
| **SMA Periods** | 18 (fast) / 45 (slow) |
| **Stop Loss** | 12% |
| **Take Profit** | 26% |
| **Coins** | ETH, BTC, SOL |
| **Backtest Return** | **+30-33%** |

---

## What We Learned
1. Simple SMA crossovers beat complex indicators
2. Faster SMAs (10/30) good, medium (18-20/45-50) better
3. SL/TP around 12/24-26% works best
4. Volume/RSI filters hurt more than help
