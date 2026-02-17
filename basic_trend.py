#!/usr/bin/env python3
"""
Crypto Trading Bot - Basic Trend Following (SMA Crossover)
Start with the basics, then expand.
"""

import requests
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import json

# === CONFIG ===
SYMBOL = "BTCUSDT"  # Start with Bitcoin
INTERVAL = "1h"      # 1 hour candles
SMA_FAST = 50        # Fast SMA (short-term)
SMA_SLOW = 200       # Slow SMA (long-term)
START_DATE = "2024-01-01"

# === DATA FETCHER ===
def fetch_binance_data(symbol: str, interval: str, start_str: str, limit: int = 1000) -> pd.DataFrame:
    """Fetch historical klines/candles from Binance."""
    url = "https://api.binance.com/api/v3/klines"
    params = {
        "symbol": symbol,
        "interval": interval,
        "startTime": int(datetime.strptime(start_str, "%Y-%m-%d").timestamp() * 1000),
        "limit": limit
    }
    
    response = requests.get(url, params=params)
    data = response.json()
    
    # Parse into DataFrame
    df = pd.DataFrame(data, columns=[
        "open_time", "open", "high", "low", "close", "volume",
        "close_time", "quote_volume", "trades", "taker_buy_base", "taker_buy_quote", "ignore"
    ])
    
    # Convert to proper types
    df["open_time"] = pd.to_datetime(df["open_time"], unit="ms")
    df["close"] = df["close"].astype(float)
    df["high"] = df["high"].astype(float)
    df["low"] = df["low"].astype(float)
    df["open"] = df["open"].astype(float)
    df["volume"] = df["volume"].astype(float)
    
    return df[["open_time", "open", "high", "low", "close", "volume"]]

# === STRATEGY ===
def calculate_sma(df: pd.DataFrame, fast: int, slow: int) -> pd.DataFrame:
    """Calculate SMA indicators."""
    df = df.copy()
    df["sma_fast"] = df["close"].rolling(window=fast).mean()
    df["sma_slow"] = df["close"].rolling(window=slow).mean()
    return df

def generate_signals(df: pd.DataFrame) -> pd.DataFrame:
    """Generate buy/sell signals based on SMA crossover."""
    df = df.copy()
    df["signal"] = 0
    
    # Buy when fast crosses above slow
    df.loc[df["sma_fast"] > df["sma_slow"], "signal"] = 1
    # Sell when fast crosses below slow
    df.loc[df["sma_fast"] < df["sma_slow"], "signal"] = -1
    
    # Signal change (entry/exit points)
    df["signal_change"] = df["signal"].diff()
    
    return df

# === BACKTESTER ===
def backtest(df: pd.DataFrame, initial_balance: float = 10000) -> dict:
    """Run a simple backtest."""
    df = df.dropna()  # Remove rows with NaN (not enough data for SMA)
    
    balance = initial_balance
    position = 0  # 0 = no position, 1 = long
    entry_price = 0
    trades = []
    
    for i, row in df.iterrows():
        if row["signal_change"] == 2:  # Buy signal (fast crossed above slow)
            if position == 0:
                position = 1
                entry_price = row["close"]
                balance -= row["close"]  # Buy with all balance
                trades.append({"type": "BUY", "price": row["close"], "time": row["open_time"]})
                
        elif row["signal_change"] == -2:  # Sell signal (fast crossed below slow)
            if position == 1:
                position = 0
                pnl = (row["close"] - entry_price) * (initial_balance / entry_price)
                balance += row["close"]
                trades.append({"type": "SELL", "price": row["close"], "time": row["open_time"], "pnl": pnl})
    
    # Calculate final portfolio value
    final_value = balance + (position * df.iloc[-1]["close"] * (initial_balance / entry_price)) if position == 1 else balance
    
    total_return = ((final_value - initial_balance) / initial_balance) * 100
    
    return {
        "initial_balance": initial_balance,
        "final_value": final_value,
        "total_return_pct": total_return,
        "num_trades": len(trades),
        "trades": trades[-10:]  # Last 10 trades
    }

# === MAIN ===
if __name__ == "__main__":
    print(f"📈 Fetching {SYMBOL} data from {START_DATE}...")
    df = fetch_binance_data(SYMBOL, INTERVAL, START_DATE)
    print(f"   Got {len(df)} candles")
    
    print(f"📊 Calculating SMA({SMA_FAST}) / SMA({SMA_SLOW})...")
    df = calculate_sma(df, SMA_FAST, SMA_SLOW)
    df = generate_signals(df)
    
    print(f"🔄 Running backtest...")
    results = backtest(df)
    
    print(f"\n=== BACKTEST RESULTS ===")
    print(f"Initial Balance: ${results['initial_balance']:,.2f}")
    print(f"Final Value:     ${results['final_value']:,.2f}")
    print(f"Total Return:   {results['total_return_pct']:.2f}%")
    print(f"Total Trades:   {results['num_trades']}")
    
    if results["trades"]:
        print(f"\n=== LAST {len(results['trades'])} TRADES ===")
        for t in results["trades"]:
            print(f"  {t['type']} @ ${t['price']:,.2f} | {t['time']}")
            if "pnl" in t:
                print(f"    PnL: ${t['pnl']:,.2f}")
