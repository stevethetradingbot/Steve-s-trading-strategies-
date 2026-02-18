# Trading Systems - Complete Documentation

_Last updated: Feb 17, 2026_

---

## 🤖 CRYPTO TRADING BOT

### Files
- `combined_monitor.js` - Main trading monitor (10 coins, hourly)
- `5min_backtest.js` - Short timeframe backtester
- `advanced_backtest.js` - Multi-strategy comparison

### Current Settings (OPTIMIZED)
```javascript
SMA_FAST = 24
SMA_SLOW = 56
SL = 2%  // Tightened from 10%
TP = 4%  // Tightened from 26%
USE_RSI_FILTER = false    // Disabled - blocks trades
USE_VOLUME_FILTER = false // Disabled - blocks trades  
USE_MULTITIMEFRAME_FILTER = false // Disabled - blocks trades
```

### Backtest Results (BTC)
| Strategy | Return | Win Rate |
|----------|--------|----------|
| SMA 24/56 (no filters) | +17.6% | 83% |
| SMA 12/26 baseline | +9.3% | 54% |
| With filters | 0% | - |

### Coin Performance (SMA 24/56)
| Coin | Return |
|------|--------|
| SOL | +50% 🎯 |
| ETH | +39% |
| BTC | +17% |
| ARB | +71% (historical) |

### Current Positions
- **SUI** - LONG @ $0.98 (just entered)
- **UNI** - LONG @ $3.57 (from earlier)

---

## 🎰 POLYMARKET TRADING

### Files
- `polymarket_monitor.js` - Scans markets for opportunities
- `polymarket_value_scanner.js` - Finds mispriced markets
- `polymarket_paper.js` - Paper trading system

### Paper Trading Status
```
Balance: $900 / $1000
```

### Active Bets
| Bet | Amount | Odds | Potential |
|-----|--------|------|-----------|
| Elon cuts 5% budget | $50 | 5.5% | $909 |
| Weinstein NO prison | $50 | 32.4% | $154 |

### Value Opportunities Found
1. **Elon 5% budget cut** - 5.5% → fair 90%+ (underpriced!)
2. **Weinstein NO prison** - 32% → fair <5% (overpriced!)

### Top Markets by Volume
1. 2028 Republican Nominee - $1.17M
2. 2028 Democratic Nominee - $1.08M
3. 2026 FIFA World Cup - $837K

---

## ⚙️ CRON JOBS RUNNING

| Job | Frequency | Purpose |
|-----|-----------|---------|
| paper-trade-monitor | Every 4 hours | Crypto signals |
| polymarket-value-scan | Every 6 hours | Betting opportunities |
| trade-signal-alert | Every 4 hours | Position alerts |

---

## 📋 COMMANDS

### Crypto
```bash
cd /home/matthewkania.mk/.openclaw/workspace/trading_bot
node combined_monitor.js          # Run monitor
node advanced_backtest.js        # Backtest strategies
```

### Polymarket
```bash
node polymarket_value_scanner.js # Find opportunities
node polymarket_paper.js status  # Check bets
node polymarket_paper.js bet <amount> <odds> <yes/no> "<market>"
node polymarket_paper.js resolve <id> won
```

---

## 🔑 KEY INSIGHTS

1. **Filters kill performance** - Backtest proved strict filters block all trades
2. **SOL outperforms** - +50% vs BTC +17% with same strategy
3. **Simple > Complex** - SMA 24/56 beats complicated indicators
4. **Polymarket inefficiency** - Low-volume bets can have edges
5. **Tight SL/TP works** - 2%/4% better than 10%/26%

---

## 📁 FILE STRUCTURE
```
/home/matthewkania.mk/.openclaw/workspace/trading_bot/
├── combined_monitor.js      # Main crypto monitor
├── polymarket_monitor.js    # Market scanner
├── polymarket_value_scanner.js # Value finder
├── polymarket_paper.js      # Paper trading
├── 5min_backtest.js        # Short TF backtest
├── advanced_backtest.js    # Strategy comparison
├── paper_summary.json       # Trade positions
├── polymarket_paper.json   # Betting history
└── strategy_backtest.json # Backtest results
```
