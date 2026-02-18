// Backtest: 5-EMA Scalp Strategy (Quant Science Style)
// Tests: 5 EMAs (5,10,20,50,200) + RSI on 15-minute data
const https = require('https');
const fs = require('fs');

const STATE_DIR = '/home/matthewkania.mk/.openclaw/workspace/trading_bot/states';
const BACKTEST_FILE = '/home/matthewkania.mk/.openclaw/workspace/trading_bot/backtest_5ema.json';

// Test configuration
const TEST_COINS = [
    { symbol: 'ETH', pair: 'ETHUSD' },
    { symbol: 'BTC', pair: 'XBTUSD' },
    { symbol: 'ARB', pair: 'ARBUSD' },
    { symbol: 'SOL', pair: 'SOLUSD' },
    { symbol: 'NEAR', pair: 'NEARUSD' }
];

const INITIAL_CAPITAL = 1000;
const POSITION_SIZE = 100; // $100 per trade

// 5-EMA Strategy params - WIDER STOPS (less noise)
const SL_PCT = 3;
const TP_PCT = 6;
const TRAIL_PCT = 3;

function fetchOHLC(symbol, interval, limit = 300) {
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

function calculateEMA(data, period) {
    const ema = [];
    const k = 2 / (period + 1);
    let sum = 0;
    
    // Fill null until we have enough data
    for (let i = 0; i < period; i++) {
        sum += data[i].close;
        ema.push(null);
    }
    
    // First EMA is SMA
    const firstEma = sum / period;
    ema[period - 1] = firstEma;
    
    // Calculate EMA for rest
    for (let i = period; i < data.length; i++) {
        ema.push(data[i].close * k + ema[i - 1] * (1 - k));
    }
    return ema;
}

function calculateRSI(data, period = 14) {
    const rsi = [];
    let gains = 0, losses = 0;
    
    // Fill null until we have enough data
    for (let i = 0; i < period; i++) {
        rsi.push(null);
    }
    
    // Calculate first RSI
    for (let j = 1; j <= period; j++) {
        const c = data[j].close - data[j-1].close;
        if (c > 0) gains += c; else losses += Math.abs(c);
    }
    gains /= period; losses /= period;
    
    let rs = losses === 0 ? 100 : gains / losses;
    rsi.push(100 - (100 / (1 + rs)));
    
    // Calculate RSI for rest
    for (let i = period + 1; i < data.length; i++) {
        const change = data[i].close - data[i-1].close;
        if (change > 0) { gains = (gains * (period - 1) + change) / period; losses = (losses * (period - 1)) / period; }
        else { losses = (losses * (period - 1) + Math.abs(change)) / period; gains = (gains * (period - 1)) / period; }
        rs = losses === 0 ? 100 : gains / losses;
        rsi.push(100 - (100 / (1 + rs)));
    }
    return rsi;
}

async function backtest5EMA(coin) {
    console.log(`\n📊 Backtesting 5-EMA on ${coin.symbol}...`);
    
    // Use 1-hour data instead of 15-min (less noise)
    const data = await fetchOHLC(coin.pair, 60, 500);
    if (!data || data.length < 250) {
        console.log(`   ❌ Not enough data for ${coin.symbol}`);
        return null;
    }
    
    const ema5 = calculateEMA(data, 5);
    const ema10 = calculateEMA(data, 10);
    const ema20 = calculateEMA(data, 20);
    const ema50 = calculateEMA(data, 50);
    const ema200 = calculateEMA(data, 200);
    const rsi = calculateRSI(data, 14);
    
    let capital = INITIAL_CAPITAL;
    let position = null;
    let entryPrice = 0;
    let trades = [];
    let wins = 0;
    let losses = 0;
    
    // Start after all indicators are valid (need at least 200 candles for EMA200)
    for (let i = 220; i < data.length - 1; i++) {
        const price = data[i].close;
        
        const e5 = ema5[i];
        const e10 = ema10[i];
        const e20 = ema20[i];
        
        // Skip if any indicator is null
        if (e5 === null || e10 === null || e20 === null) continue;
        
        const pe5 = ema5[i-1];
        const pe10 = ema10[i-1];
        const pe20 = ema20[i-1];
        
        // Skip if previous values are null
        if (pe5 === null || pe10 === null || pe20 === null) continue;
        const pe50 = ema50[i-1];
        const pe200 = ema200[i-1];
        
        const rsiVal = rsi[i];
        
        // SIMPLE EMA CROSSOVER: Just 5/20 crossover (like Quant Science simplified)
        // This is more practical - no need for all 5 EMAs aligned
        
        const emaFast = e5;
        const emaSlow = e20;
        const prevFast = pe5;
        const prevSlow = pe20;
        
        const bullishCrossover = prevFast <= prevSlow && emaFast > emaSlow;
        const bearishCrossover = prevFast >= prevSlow && emaFast < emaSlow;
        
        // Check stops if in position
        if (position === 'long') {
            const sl = entryPrice * (1 - SL_PCT / 100);
            const tp = entryPrice * (1 + TP_PCT / 100);
            
            if (price <= sl) {
                const pnl = (sl - entryPrice) / entryPrice;
                capital *= (1 + pnl * (POSITION_SIZE / INITIAL_CAPITAL));
                trades.push({ type: 'LONG', entry: entryPrice, exit: sl, pnl: pnl * 100 });
                if (pnl > 0) wins++; else losses++;
                position = null;
            } else if (price >= tp) {
                const pnl = (tp - entryPrice) / entryPrice;
                capital *= (1 + pnl * (POSITION_SIZE / INITIAL_CAPITAL));
                trades.push({ type: 'LONG', entry: entryPrice, exit: tp, pnl: pnl * 100 });
                if (pnl > 0) wins++; else losses++;
                position = null;
            }
        } else if (position === 'short') {
            const sl = entryPrice * (1 + SL_PCT / 100);
            const tp = entryPrice * (1 - TP_PCT / 100);
            
            if (price >= sl) {
                const pnl = (entryPrice - sl) / entryPrice;
                capital *= (1 + pnl * (POSITION_SIZE / INITIAL_CAPITAL));
                trades.push({ type: 'SHORT', entry: entryPrice, exit: sl, pnl: pnl * 100 });
                if (pnl > 0) wins++; else losses++;
                position = null;
            } else if (price <= tp) {
                const pnl = (entryPrice - tp) / entryPrice;
                capital *= (1 + pnl * (POSITION_SIZE / INITIAL_CAPITAL));
                trades.push({ type: 'SHORT', entry: entryPrice, exit: tp, pnl: pnl * 100 });
                if (pnl > 0) wins++; else losses++;
                position = null;
            }
        }
        
        // New entries - simple EMA crossover with RSI filter
        if (!position && capital > POSITION_SIZE) {
            if (bullishCrossover && rsiVal < 65) {
                position = 'long';
                entryPrice = price;
            } else if (bearishCrossover && rsiVal > 35) {
                position = 'short';
                entryPrice = price;
            }
        }
    }
    
    // Close any open position at final price
    if (position && data.length > 0) {
        const finalPrice = data[data.length - 1].close;
        if (position === 'long') {
            const pnl = (finalPrice - entryPrice) / entryPrice;
            capital *= (1 + pnl * (POSITION_SIZE / INITIAL_CAPITAL));
            trades.push({ type: 'LONG', entry: entryPrice, exit: finalPrice, pnl: pnl * 100, open: true });
        } else {
            const pnl = (entryPrice - finalPrice) / entryPrice;
            capital *= (1 + pnl * (POSITION_SIZE / INITIAL_CAPITAL));
            trades.push({ type: 'SHORT', entry: entryPrice, exit: finalPrice, pnl: pnl * 100, open: true });
        }
    }
    
    const totalTrades = wins + losses;
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
    const returnPct = ((capital - INITIAL_CAPITAL) / INITIAL_CAPITAL) * 100;
    
    console.log(`   ✅ ${coin.symbol}: ${totalTrades} trades | Win Rate: ${winRate.toFixed(1)}% | Return: ${returnPct.toFixed(2)}%`);
    
    return {
        symbol: coin.symbol,
        trades: totalTrades,
        wins,
        losses,
        winRate,
        returnPct,
        finalCapital: capital
    };
}

async function main() {
    console.log(`\n🔬 5-EMA Backtest (Quant Science Strategy)`);
    console.log(`=========================================`);
    console.log(`Initial Capital: $${INITIAL_CAPITAL}`);
    console.log(`Position Size: $${POSITION_SIZE}`);
    console.log(`Stop Loss: ${SL_PCT}% | Take Profit: ${TP_PCT}%`);
    
    const results = [];
    
    for (const coin of TEST_COINS) {
        const result = await backtest5EMA(coin);
        if (result) results.push(result);
        await new Promise(r => setTimeout(r, 500));
    }
    
    // Summary
    console.log(`\n📊 BACKTEST SUMMARY`);
    console.log(`===================`);
    
    let totalTrades = 0;
    let totalWins = 0;
    let totalLosses = 0;
    
    results.forEach(r => {
        totalTrades += r.trades;
        totalWins += r.wins;
        totalLosses += r.losses;
        console.log(`   ${r.symbol}: ${r.trades} trades | ${r.winRate.toFixed(1)}% WR | ${r.returnPct.toFixed(2)}% return`);
    });
    
    const overallWinRate = totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0;
    const avgReturn = results.reduce((sum, r) => sum + r.returnPct, 0) / results.length;
    
    console.log(`\n📈 OVERALL:`);
    console.log(`   Total Trades: ${totalTrades}`);
    console.log(`   Win Rate: ${overallWinRate.toFixed(1)}%`);
    console.log(`   Avg Return: ${avgReturn.toFixed(2)}%`);
    
    // Save results
    fs.writeFileSync(BACKTEST_FILE, JSON.stringify({
        timestamp: new Date().toISOString(),
        config: { SL_PCT, TP_PCT, TRAIL_PCT, INITIAL_CAPITAL, POSITION_SIZE },
        results
    }, null, 2));
    
    console.log(`\n💾 Results saved to ${BACKTEST_FILE}`);
}

main().catch(console.error);
