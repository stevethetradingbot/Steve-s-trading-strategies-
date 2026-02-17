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

---

## Iteration 3 (2026-02-17)

### Research Done
1. ✅ Built Version 1 (Simple SMA 10/30)
2. ✅ Built Version 2 (Advanced: RSI + Volume + ATR + Multi-TF)
3. ✅ Head-to-head comparison

### Key Findings

| Version | Description | ETH | BTC | Average |
|---------|-------------|-----|-----|---------|
| V1 | Simple SMA(10/30) + 10% SL + 20% TP | +22.9% | +13.4% | **+18.15%** |
| V2 | Advanced: RSI + ATR + Volume | +18.3% | +4.8% | +11.58% |

### Conclusion
- **VERSION 1 (SIMPLE) WINS!**

---

## Iteration 4 (2026-02-17)

### Research Done
1. ✅ Tested 5 different strategies
2. ✅ Tested on multiple coins (ETH, BTC, SOL, DOT)

### Strategy Showdown Results

| Rank | Strategy | ETH | BTC | SOL | DOT | Average |
|------|----------|-----|-----|-----|-----|---------|
| 🥇 | **SMA 10/30** | +23% | +13% | +27% | +6% | +18.2% |
| 🥈 | MACD | +7% | +8% | - | - | +7.4% |
| 🥉 | Bollinger | -1% | +8% | - | - | +3.5% |
| 4 | RSI Only | -5% | +5% | - | - | +0.2% |
| 5 | SMA 50/200 | +10% | +14% | - | - | +11.9% |

---

## Iteration 5 (2026-02-17)

### Research Done
1. ✅ Tested SMA combinations across 4 coins
2. ✅ Found optimal crossover periods

### SMA Crossover Comparison

| Strategy | ETH | BTC | SOL | DOT | **Average** |
|----------|-----|-----|-----|-----|-------------|
| **10/30** | +23% | +13% | +27% | +6% | +17.4% |
| **20/50** | +41% | +16% | +40% | +34% | **+32.8%** ✅ |
| 50/200 | -5% | +2% | -13% | -17% | -8.4% |

### Key Finding
- **20/50 is the BEST** with +32.8% average return!
- Better than our original 10/30 (+17.4%)
- 50/200 loses money in current market

---

## Current Best Settings

| Parameter | Value |
|-----------|-------|
| **Strategy** | SMA Crossover (20/50) |
| **Coin** | ETH (or any of tested) |
| **Stop Loss** | 10% |
| **Take Profit** | 20% |
| **Backtest Return** | **+32.8%** |

---

## Paper Trading Status
- ✅ Active via cron job (hourly)
- ✅ Using live ETH price data
- ✅ Paper trading only (no real money)

---

## Next Steps
- [ ] Switch to 20/50 strategy for paper trading
- [ ] Test on even more coins
- [ ] Consider going live with small amount
