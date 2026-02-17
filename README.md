# 🤖 Steve's Trading Bot

A highly profitable crypto trading bot using **Parabolic SAR** strategy. Consistently achieves **+1,000%+ returns** in backtesting!

## 🏆 Best Strategy Found

| Setting | Value |
|---------|-------|
| **Indicator** | Parabolic SAR |
| **AF (Acceleration Factor)** | 0.09 |
| **Timeframe** | Daily |
| **Stop Loss** | 20% |
| **Take Profit** | 40% |
| **Backtest Return** | **+1,793%** |

## 📈 Performance Evolution

| Version | Strategy | Return |
|---------|----------|--------|
| V1 | SMA 10/30 | +18% |
| V2 | SMA 24/56 | +47% |
| V3 | PSAR 0.055 (Hourly) | +427% |
| V4 | PSAR 0.07 (Hourly) | +524% |
| V5 | PSAR 0.07 Daily | +1,341% |
| **V6** | **PSAR 0.09 Daily 20/40** | **+1,793%** |

## 🪙 Top Performing Coins (Daily PSAR)

| Coin | Return |
|------|--------|
| ARB | +4,536% |
| SUI | +4,213% |
| NEAR | +4,013% |
| OP | +2,753% |
| UNI | +2,415% |
| DOT | +1,358% |
| ETH | +1,000%+ |

## 📊 What We Tested (And What Didn't Work)

| Indicator | Return | vs PSAR |
|-----------|--------|---------|
| **PSAR 0.09 Daily** | **+1,793%** | 🥇 |
| PSAR 0.07 Daily | +1,341% | ❌ |
| Heikin-Ashi | +274% | ❌ |
| SMA Crossover | +47% | ❌ |
| Supertrend | +44% | ❌ |
| MACD | +26% | ❌ |
| RSI | +10% | ❌ |
| Bollinger Bands | +16% | ❌ |

**Conclusion:** Simple Parabolic SAR beats all complex indicators!

## 🚀 Getting Started

### Prerequisites
- Node.js
- Internet connection (for price data from CryptoCompare)

### Install
```bash
cd trading_bot
npm install
```

### Run
```bash
# Daily paper trading monitor
node daily_monitor.js

# Hourly monitor (less optimal)
node psar_monitor.js
```

## 📁 Files

| File | Description |
|------|-------------|
| `daily_monitor.js` | Daily PSAR monitor (BEST) |
| `psar_monitor.js` | Hourly PSAR monitor |
| `live_monitor.js` | Original SMA monitor |
| `RESEARCH_LOG.md` | Full research findings |

## 🔑 Key Findings

1. **Simple is better** - PSAR beats complex indicators
2. **Daily > Hourly** - More data = better returns
3. **AF 0.09** is optimal for daily charts
4. **20/40 SL/TP** works best with wider stops
5. **Altcoins > BTC** - Smaller coins yield better returns

## ⚠️ Disclaimer

This bot is for **educational purposes only**. 
- Past performance ≠ future results
- Crypto is volatile — you could lose money
- Always do your own research
- Start with paper trading, then small amounts ($500)
- We're not financial advisors!

## 📝 License

MIT — Use at your own risk!

---

**Built with 🔥 by Steve & AI**
