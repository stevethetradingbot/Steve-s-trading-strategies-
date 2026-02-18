// Backtest: Order Block + SMA Strategy
// Simplified version - look for engulfing patterns at key levels
const https = require('https');
const fs = require('fs');

const TEST_COINS = [
    { symbol: 'ETH', pair: 'ETHUSD' },
    { symbol: 'BTC', pair: 'XBTUSD' },
    { symbol: 'SOL', pair: 'SOLUSD' },
    { symbol: 'NEAR', pair: 'NEARUSD' }
];

const INITIAL_CAPITAL = 1000;
const POSITION_SIZE = 100;

// Simple OB detection: engulfing candle near SMA
const SMA_PERIOD = 24;
const SL_PCT = 2;
const TP_PCT = 4; // 1:2 risk/reward

function fetchOHLC(symbol, interval, limit = 200) {
    return new Promise((resolve) => {
        const url = `https://api.kraken.com/0/public/OHLC?pair=${symbol}&interval=${interval}&limit=${limit}`;
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.error && json.error.length > 0) { resolve(null); return; }
                    const pairKey = Object.keys(json.result).find(k => !k.startsWith('last'));
                    if (!pairKey) { resolve(null); return; }
                    const candles = json.result[pairKey].map(d => ({
                        time: d[0],
                        open: parseFloat(d[1]),
                        high: parseFloat(d[2]),
                        low: parseFloat(d[3]),
                        close: parseFloat(d[4]),
                        volume: parseFloat(d[6]) || 0
                    }));
                    resolve(candles);
                } catch (e) { resolve(null); }
            });
        }).on('error', () => resolve(null));
    });
}

function calculateSMA(data, period) {
    const sma = [];
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) sma.push(null);
        else { 
            let sum = 0; 
            for (let j = 0; j < period; j++) sum += data[i - j].close; 
            sma.push(sum / period); 
        }
    }
    return sma;
}

// Detect engulfing pattern
function isBullishEngulfing(prev, curr) {
    return prev.close < prev.open && // prev is bearish
           curr.close > curr.open && // curr is bullish
           curr.open < prev.close && // curr opens below prev close
           curr.close > prev.open;   // curr closes above prev open
}

function isBearishEngulfing(prev, curr) {
    return prev.close > prev.open && // prev is bullish
           curr.close < curr.open && // curr is bearish
           curr.open > prev.close && // curr opens above prev close
           curr.close < prev.open;   // curr closes below prev open
}

async function backtestOB(coin) {
    console.log(`\n📊 Backtesting OB+SMA on ${coin.symbol}...`);
    
    const data = await fetchOHLC(coin.pair, 60, 200);
    if (!data || data.length < 50) return null;
    
    const sma = calculateSMA(data, SMA_PERIOD);
    
    let capital = INITIAL_CAPITAL;
    let position = null;
    let entryPrice = 0;
    let wins = 0, losses = 0;
    
    for (let i = 20; i < data.length - 1; i++) {
        const curr = data[i];
        const prev = data[i-1];
        const price = curr.close;
        const smaVal = sma[i];
        
        if (smaVal === null) continue;
        
        // Bullish setup: price above SMA + bullish engulfing
        if (!position && price > smaVal && isBullishEngulfing(prev, curr)) {
            position = 'long';
            entryPrice = price;
        }
        
        // Check stops
        if (position === 'long') {
            const sl = entryPrice * (1 - SL_PCT / 100);
            const tp = entryPrice * (1 + TP_PCT / 100);
            
            if (price <= sl) {
                capital *= (1 - SL_PCT/100 * POSITION_SIZE/INITIAL_CAPITAL);
                losses++;
                position = null;
            } else if (price >= tp) {
                capital *= (1 + TP_PCT/100 * POSITION_SIZE/INITIAL_CAPITAL);
                wins++;
                position = null;
            }
        }
    }
    
    const totalTrades = wins + losses;
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
    const returnPct = ((capital - INITIAL_CAPITAL) / INITIAL_CAPITAL) * 100;
    
    console.log(`   ✅ ${coin.symbol}: ${totalTrades} trades | Win Rate: ${winRate.toFixed(1)}% | Return: ${returnPct.toFixed(2)}%`);
    
    return { symbol: coin.symbol, trades: totalTrades, wins, losses, winRate, returnPct };
}

async function main() {
    console.log(`\n🔬 Order Block + SMA Backtest`);
    console.log(`================================`);
    
    const results = [];
    
    for (const coin of TEST_COINS) {
        const r = await backtestOB(coin);
        if (r) results.push(r);
        await new Promise(r => setTimeout(r, 500));
    }
    
    console.log(`\n📊 SUMMARY:`);
    results.forEach(r => {
        console.log(`   ${r.symbol}: ${r.trades} trades | ${r.winRate.toFixed(1)}% WR | ${r.returnPct.toFixed(2)}%`);
    });
    
    const totalTrades = results.reduce((s, r) => s + r.trades, 0);
    const totalWins = results.reduce((s, r) => s + r.wins, 0);
    const avgReturn = results.reduce((s, r) => s + r.returnPct, 0) / results.length;
    
    console.log(`\n📈 Overall: ${totalTrades} trades | ${totalWins/totalTrades*100 || 0}% WR | ${avgReturn.toFixed(2)}% return`);
}

main().catch(console.error);
