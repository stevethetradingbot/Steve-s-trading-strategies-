# Trading Bot Research Log

## Iteration 1 (2026-02-16)

### Research Done
1. ✅ Coinbase API documentation studied
2. ✅ SMA vs EMA comparison tested
3. ✅ Position sizing impact tested
4. ✅ Multiple SL/TP ratios optimized

### Key Findings

| Test | Result |
|------|--------|
| SMA vs EMA | **SMA wins** by 23.66% |
| Position Sizing (2%) | **Hurts performance** - limits gains too much |
| Best SL/TP | **10%/20%** on ETH |
| Best Coin | **ETH** (+22.33%) |

### Conclusion
- Keep using **SMA** (not EMA) - more stable
- Keep **full position** (no limit) - allows gains to compound
- Keep **10% SL / 20% TP** on **ETH**

---

## Iteration 2 (2026-02-16)

### Research Done
1. ✅ Volume Filter tested
2. ✅ Mean Reversion tested

### Key Findings

| Strategy | ETH | BTC | Verdict |
|----------|-----|-----|---------|
| **Baseline SMA** | **+24.05%** | **+10.03%** | ✅ **Still best** |
| Mean Reversion | -4.68% | +5.07% | ❌ Worse |
| Volume Filter | -3.29% | +2.49% | ❌ Worse |

### Conclusion
- **Baseline SMA(10/30) is still the winner**
- Volume filter hurts performance (misses good entries)
- Mean reversion alone underperforms crossover

---

## Current Best Settings
- Coin: ETH
- Indicator: SMA(10/30) crossover
- Stop Loss: 10%
- Take Profit: 20%
- Backtest Return: ~+24%

## Next Steps (Future Iterations)
- [ ] Test different coin pairs (SOL, DOT, etc.)
- [ ] Add trend confirmation (price above 200 MA)
- [ ] Test trailing stops
- [ ] Test MACD confirmation
