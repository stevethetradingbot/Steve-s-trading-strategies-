# Trading Systems - Complete Documentation

_Last updated: Feb 18, 2026_

---

## 🤖 CRYPTO TRADING BOT

### Files
- `combined_monitor.js` - Main trading monitor (30 coins, hourly)
- `blockchain_stats.js` - BTC network stats
- `ml_strategy.js` - ML-based trading signals
- `carry_trade_monitor.js` - Macro carry trade monitoring

### API Fallbacks (5-Way)
| Priority | Exchange | Status |
|----------|----------|--------|
| 1 | Kraken | ✅ Primary |
| 2 | Coinbase | ✅ Fallback |
| 3 | KuCoin | ✅ Fallback |
| 4 | Bybit | ⚠️ Blocked (region) |
| 5 | CoinGecko | ✅ Final fallback |

### Current Settings (OPTIMIZED)
```javascript
SMA_FAST = 24
SMA_SLOW = 56
SL = 2%  // Tightened from 10%
TP = 4%  // Tightened from 26%
USE_RSI_FILTER = false    // Disabled - blocks trades
USE_VOLUME_FILTER = false // Disabled - blocks trades  
USE_MULTITIMEFRAME_FILTER = true // KEEP - improves results
```

### Active Coins (30)
ETH, BTC, SOL, XRP, ADA, ARB, SUI, NEAR, OP, UNI, DOT, LINK, AVAX, MATIC, ATOM, LTC, XLM, ALGO, VET, FIL, APT, INJ, IMX, STX, SAND, MANA, AAVE, PEPE, SHIB, TRX

### Best Strategy: SMA + Multi-TF
- **Win Rate:** 85.7%
- **Return:** +19.5%
- **Timeframe:** Hourly with daily confirmation

---

## 📊 BTC NETWORK MONITOR

### Files
- `blockchain_stats.js` - Fetches from blockchain.info API
- `save_blockchain_stats.js` - Saves to JSON for dashboard
- `dashboard.html` - Web dashboard with all stats

### Dashboard Shows
- 💰 BTC price
- ⛏️ Hash rate (TH/s)
- 📝 24h transactions
- 🔲 Blocks mined
- ⏱️ Block time
- 🧠 Mempool TX count

---

## 🎰 POLYMARKET TRADING

### Files
- `polymarket_monitor.js` - Scans markets for opportunities
- `polymarket_value_scanner.js` - Finds mispriced markets
- `polymarket_paper.js` - Paper trading system

### Paper Trading Status
```
Balance: ~$900 / $1000
```

### Active Bets
- Elon 5% budget cuts (paper)
- Weinstein NO prison (paper)

---

## 🛠️ INSTALLED SKILLS

| Skill | Purpose |
|-------|---------|
| kalshi-trading | Kalshi prediction markets |
| github | GitHub CLI integration |
| weather | Weather data |
| slack | Slack messaging |
| polymarket-odds | Polymarket data |
| polyedge | Prediction market analysis |
| openbroker | Broker integration |

---

## ⚙️ CRON JOBS RUNNING

| Job | Frequency | Purpose |
|-----|-----------|---------|
| paper-trade-monitor | Every 2 hours | Crypto signals |
| polymarket-value-scan | Every 6 hours | Betting opportunities |
| trade-signal-alert | Every 2 hours | Position alerts |
| hourly-skill-retry | Every 1 hour | Install flagged skills |

---

## 📋 COMMANDS

### Run Monitor
```bash
cd /home/matthewkania.mk/.openclaw/workspace/trading_bot
node combined_monitor.js
```

### Update Blockchain Stats
```bash
node save_blockchain_stats.js
```

### Check Dashboard
Open `dashboard.html` in browser

---

## 🔑 KEY INSIGHTS

1. **Multi-TF filter is key** - Adds +10% improvement
2. **Filters kill performance** - RSI/Volume filters block all trades
3. **SOL outperforms** - +50% vs BTC +17% with same strategy
4. **Simple > Complex** - SMA beats complicated indicators
5. **5-way API fallback** - Never miss data
6. **Tight SL/TP works** - 2%/4% better than 10%/26%

---

## 📁 FILE STRUCTURE
```
/home/matthewkania.mk/.openclaw/workspace/trading_bot/
├── combined_monitor.js      # Main crypto monitor (30 coins)
├── blockchain_stats.js      # BTC network stats
├── ml_strategy.js          # ML-based signals
├── carry_trade_monitor.js # Macro monitoring
├── polymarket_monitor.js   # Market scanner
├── polymarket_value_scanner.js # Value finder
├── polymarket_paper.js    # Paper trading
├── dashboard.html          # Web dashboard
├── paper_summary.json      # Trade positions
├── polymarket_paper.json  # Betting history
└── states/                # Coin state files (100+)
```

---

## 🚀 ROADMAP

- [ ] Test kalshi-trading skill
- [ ] Add news aggregator
- [ ] Go live with $100-500
- [ ] Build 4-hour timeframe strategy

---

**Built with 🔥 by Steve & AI**
