# 🤖 Crypto Trading Bot

A simple, effective crypto trading bot using SMA crossover strategy. Built for paper trading and tested against historical data.

## 📊 Strategy

- **Indicator:** SMA(10/30) Crossover
- **Coin:** ETH (Ethereum)
- **Stop Loss:** 10%
- **Take Profit:** 20%
- **Timeframe:** Hourly

## 📈 Performance (Backtest)

| Metric | Value |
|--------|-------|
| Period | ~83 days |
| Return | +22-24% |
| Win Rate | ~37% |
| Trades | 15-25 |

## 🚀 Getting Started

### Prerequisites
- Node.js
- Internet connection (for price data)

### Install
```bash
cd trading_bot
npm install
```

### Run
```bash
# Paper trade (one check)
node live_monitor.js

# Or run the optimizer
node optimizer.js
```

## 📁 Files

| File | Description |
|------|-------------|
| `live_monitor.js` | Paper trading monitor (runs hourly) |
| `optimizer.js` | Finds best SL/TP settings |
| `advanced_bot_v3.js` | Main backtester |
| `research_cycle2.js` | Research experiments |
| `RESEARCH_LOG.md` | Research findings |

## ⚠️ Disclaimer

This bot is for **educational purposes only**. 
- Past performance ≠ future results
- Crypto is volatile — you could lose money
- Always do your own research
- Start with paper trading, then small amounts

## 📝 License

MIT — Use at your own risk!
