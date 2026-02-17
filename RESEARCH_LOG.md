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

## Iteration 3 (2026-02-17)

### Research Done
1. ✅ Built Version 1 (Simple SMA 10/30)
2. ✅ Built Version 2 (Advanced: RSI + Volume + ATR + Multi-TF)
3. ✅ Head-to-head comparison on multiple coins

### Key Findings

| Version | Description | ETH | BTC | Average |
|---------|-------------|-----|-----|---------|
| V1 | Simple SMA(10/30) + 10% SL + 20% TP | +22.9% | +13.4% | **+18.15%** |
| V2 | Advanced: RSI filter + ATR stops + Volume | +18.3% | +4.8% | +11.58% |

### Conclusion
- **VERSION 1 (SIMPLE) WINS!**
- The advanced filters actually hurt performance
- Simpler = better for this market conditions

---

## Current Best Settings
- **Strategy:** Version 1 (Simple SMA 10/30)
- **Coin:** ETH
- **Indicator:** SMA(10/30) crossover
- **Stop Loss:** 10%
- **Take Profit:** 20%
- **Backtest Return:** ~+18-23%

## Paper Trading Status
- ✅ Active via cron job (hourly)
- ✅ Using live ETH price data
- ✅ Paper trading only (no real money)

## Next Steps (Future Iterations)
- [ ] Test on more coins (SOL, etc.)
- [ ] Try different timeframes
- [ ] Consider going live with small amount
