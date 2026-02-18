# Polymarket Builder Program Application Draft

## Project Name
**PolyAlpha** - Institutional-Grade Prediction Market Trading Bot

## Project Description
Automated trading system for prediction markets using quantitative strategies derived from institutional trading research:

- **Longshot Bias Fading**: Identify mispriced underdogs (contracts <15% undervalued by ~57% based on historical data)
- **Kelly Criterion Position Sizing**: 1/4 Kelly for sustainable risk management
- **Maker/Taker Analysis**: Targetmaker orders at 80/99 price levels where makers win +0.77% to +1.25%
- **Multi-Timeframe Trend Filters**: Confirm directional signals across 1H, 4H, and daily timeframes
- **Value vs. Odds Scanning**: Compare implied probability against fundamental research

## Website
https://github.com (or placeholder during development)

## Pitch

Our bot has identified significant edge in fading longshot contracts - specifically political propositions where public sentiment diverges from fundamentals. Current paper trading portfolio includes:
- Elon Musk budget cuts proposition (5.5% odds → 90%+ fair value based on DOGE cuts)
- Weinstein conviction fade (32% odds → <5% fair value)

## Technical Implementation
- Node.js with Kraken API for crypto execution
- Polymarket gamma-api and CLOB APIs for market data
- Real-time webhook alerts via Telegram
- Cron-scheduled position management (4-6hr rebalancing)

## Requested Support
- Builder API key for programmatic trading
- Access to 5-minute volatility markets for scalping strategies
- Documentation on relayer/gasless transactions

## Contact
- Email: [YOUR EMAIL]
- X: @[YOUR HANDLE]
- Telegram: @[YOUR HANDLE]
