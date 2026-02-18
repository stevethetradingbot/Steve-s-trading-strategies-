// 5-Minute BTC Backtester - PolyMarket Strategy
const https = require('https');
const fs = require('fs');

const RESULTS_FILE = '/home/matthewkania.mk/.openclaw/workspace/trading_bot/5m_backtest_results.json';

// Strategy settings - we'll test multiple
const CONFIGS = [
    { name: "SMA_12_26", fast: 12, slow: 26, sl: 1, tp: 2 },
    { name: "SMA_24_56", fast: 24, slow: 56, sl: 1, tp: 2 },
    { name: "PSAR_0.02", af: 0.02, sl: 1, tp: 2 },
    { name: "PSAR_0.05", af: 0.05, sl: 1, tp: 2 },
];

const INITIAL_CAPITAL = 1000;
const TRADING_FEE = 0.001; // 0.1% per trade

// ============ KRAKEN API ============
function fetch5min(symbol, limit = 500) {
    return new Promise((resolve) => {
        // interval: 5 = 5min
        const url = `https://api.kraken.com/0/public/OHLC?pair=${symbol}&interval=5&limit=${limit}`;
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.error && json.error.length > 0) { resolve(null); return; }
                    
                    const pairKey = Object.keys(json.result).find(k => !k.startsWith('last'));
                    if (!pairKey) { resolve(null); return; }
                    
                    // [time, open, high, low, close, vwap, volume, count]
                    const candles = json.result[pairKey].map(d => ({
                        time: d[0],
                        open: parseFloat(d[1]),
                        high: parseFloat(d[2]),
                        low: parseFloat(d[3]),
                        close: parseFloat(d[4])
                    })).reverse(); // oldest first
                    
                    resolve(candles);
                } catch (e) { resolve(null); }
            });
        }).on('error', () => resolve(null));
    });
}

// ============ INDICATORS ============
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

function calculatePSAR(data, af = 0.02) {
    const chronData = [...data].reverse();
    let sar = chronData[0].low;
    let ep = chronData[0].high;
    let trend = 1;
    let afVal = af;
    const results = [];
    
    for (let i = 1; i < chronData.length; i++) {
        sar = sar + afVal * (ep - sar);
        if (trend === 1) {
            if (chronData[i].low < sar) { trend = -1; sar = ep; ep = chronData[i].low; afVal = af; }
            else { if (chronData[i].high > ep) { ep = chronData[i].high; afVal = Math.min(afVal + af, 0.2); } }
        } else {
            if (chronData[i].high > sar) { trend = 1; sar = ep; ep = chronData[i].high; afVal = af; }
            else { if (chronData[i].low < ep) { ep = chronData[i].low; afVal = Math.min(afVal + af, 0.2); } }
        }
        results.push({ sar, trend, ep });
    }
    return results.reverse();
}

// ============ BACKTEST SMA ============
function backtestSMA(data, fast, slow, sl, tp) {
    const smaFast = calculateSMA(data, fast);
    const smaSlow = calculateSMA(data, slow);
    
    let capital = INITIAL_CAPITAL;
    let position = null;
    let trades = [];
    let wins = 0, losses = 0;
    
    for (let i = Math.max(fast, slow); i < data.length; i++) {
        const current = data[i];
        const prevFast = smaFast[i - 1];
        const prevSlow = smaSlow[i - 1];
        const currFast = smaFast[i];
        const currSlow = smaSlow[i];
        
        // Entry: golden cross
        if (!position && prevFast <= prevSlow && currFast > currSlow) {
            position = {
                entryPrice: current.close,
                entryTime: current.time,
                size: capital / current.close
            };
            capital = 0; // all in
            trades.push({ type: 'BUY', price: current.close, time: current.time });
        }
        // Exit: death cross
        else if (position && prevFast >= prevSlow && currFast < currSlow) {
            const proceeds = position.size * current.close * (1 - TRADING_FEE);
            const pnl = proceeds - (position.size * position.entryPrice);
            capital = proceeds;
            trades.push({ type: 'SELL', price: current.close, time: current.time, pnl });
            if (pnl > 0) wins++; else losses++;
            position = null;
        }
        // SL/TP
        else if (position) {
            const pnlPct = ((current.close - position.entryPrice) / position.entryPrice) * 100;
            if (pnlPct <= -sl || pnlPct >= tp) {
                const exitPrice = pnlPct >= tp ? position.entryPrice * (1 + tp/100) : position.entryPrice * (1 - sl/100);
                const proceeds = position.size * exitPrice * (1 - TRADING_FEE);
                const pnl = proceeds - (position.size * position.entryPrice);
                capital = proceeds;
                trades.push({ type: pnlPct >= tp ? 'TAKE_PROFIT' : 'STOP_LOSS', price: exitPrice, time: current.time, pnl });
                if (pnl > 0) wins++; else losses++;
                position = null;
            }
        }
    }
    
    // Close any open position
    if (position) {
        const last = data[data.length - 1];
        const proceeds = position.size * last.close * (1 - TRADING_FEE);
        capital = proceeds;
    }
    
    const totalReturn = ((capital - INITIAL_CAPITAL) / INITIAL_CAPITAL) * 100;
    return {
        strategy: `SMA(${fast}/${slow})`,
        config: { fast, slow, sl, tp },
        trades: trades.length,
        wins,
        losses,
        winRate: trades.length > 0 ? (wins / (wins + losses)) * 100 : 0,
        finalCapital: capital,
        totalReturn: totalReturn.toFixed(2) + '%'
    };
}

// ============ BACKTEST PSAR ============
function backtestPSAR(data, af, sl, tp) {
    const psar = calculatePSAR(data, af);
    
    let capital = INITIAL_CAPITAL;
    let position = null;
    let trades = [];
    let wins = 0, losses = 0;
    
    const startIdx = psar.length - data.length + 1;
    
    for (let i = Math.max(1, startIdx); i < data.length; i++) {
        const psarIdx = i - startIdx;
        if (psarIdx < 0 || psarIdx >= psar.length) continue;
        
        const current = data[i];
        const prevTrend = psar[psarIdx - 1]?.trend;
        const currTrend = psar[psarIdx]?.trend;
        
        if (prevTrend === undefined || currTrend === undefined) continue;
        
        // Entry: trend flip to bullish
        if (!position && prevTrend === -1 && currTrend === 1) {
            position = {
                entryPrice: current.close,
                entryTime: current.time,
                size: capital / current.close
            };
            capital = 0;
            trades.push({ type: 'BUY', price: current.close, time: current.time });
        }
        // Exit: trend flip to bearish
        else if (position && prevTrend === 1 && currTrend === -1) {
            const proceeds = position.size * current.close * (1 - TRADING_FEE);
            const pnl = proceeds - (position.size * position.entryPrice);
            capital = proceeds;
            trades.push({ type: 'SELL', price: current.close, time: current.time, pnl });
            if (pnl > 0) wins++; else losses++;
            position = null;
        }
        // SL/TP
        else if (position) {
            const pnlPct = ((current.close - position.entryPrice) / position.entryPrice) * 100;
            if (pnlPct <= -sl || pnlPct >= tp) {
                const exitPrice = pnlPct >= tp ? position.entryPrice * (1 + tp/100) : position.entryPrice * (1 - sl/100);
                const proceeds = position.size * exitPrice * (1 - TRADING_FEE);
                const pnl = proceeds - (position.size * position.entryPrice);
                capital = proceeds;
                trades.push({ type: pnlPct >= tp ? 'TAKE_PROFIT' : 'STOP_LOSS', price: exitPrice, time: current.time, pnl });
                if (pnl > 0) wins++; else losses++;
                position = null;
            }
        }
    }
    
    if (position) {
        const last = data[data.length - 1];
        const proceeds = position.size * last.close * (1 - TRADING_FEE);
        capital = proceeds;
    }
    
    const totalReturn = ((capital - INITIAL_CAPITAL) / INITIAL_CAPITAL) * 100;
    return {
        strategy: `PSAR(${af})`,
        config: { af, sl, tp },
        trades: trades.length,
        wins,
        losses,
        winRate: trades.length > 0 ? (wins / (wins + losses)) * 100 : 0,
        finalCapital: capital,
        totalReturn: totalReturn.toFixed(2) + '%'
    };
}

// ============ MAIN ============
async function main() {
    console.log('⏰ 5-Minute BTC Backtester');
    console.log('Fetching 500 candles of 5-min BTC data...\n');
    
    const data = await fetch5min('XBTUSD', 500);
    
    if (!data) {
        console.log('❌ Failed to fetch data');
        return;
    }
    
    console.log(`✅ Got ${data.length} candles`);
    console.log(`   Range: ${new Date(data[0].time * 1000).toISOString()} to ${new Date(data[data.length-1].time * 1000).toISOString()}`);
    console.log(`   Start: $${data[0].close} -> End: $${data[data.length-1].close}\n`);
    
    const results = [];
    
    // Test SMA configs
    for (const fast of [12, 24]) {
        for (const slow of [26, 56]) {
            for (const sl of [0.5, 1, 2]) {
                const result = backtestSMA(data, fast, slow, sl, sl * 2);
                results.push(result);
            }
        }
    }
    
    // Test PSAR configs
    for (const af of [0.01, 0.02, 0.05]) {
        for (const sl of [0.5, 1, 2]) {
            const result = backtestPSAR(data, af, sl, sl * 2);
            results.push(result);
        }
    }
    
    // Sort by return
    results.sort((a, b) => parseFloat(b.totalReturn) - parseFloat(a.totalReturn));
    
    console.log('📊 RESULTS (sorted by return):\n');
    results.forEach((r, i) => {
        console.log(`${i+1}. ${r.strategy} SL:${r.config.sl}% TP:${r.config.tp}%`);
        console.log(`   Trades: ${r.trades} | Win Rate: ${r.winRate.toFixed(1)}% | Return: ${r.totalReturn}`);
    });
    
    // Save results
    fs.writeFileSync(RESULTS_FILE, JSON.stringify({
        timestamp: new Date().toISOString(),
        dataPoints: data.length,
        timeRange: { start: data[0].time, end: data[data.length-1].time },
        results
    }, null, 2));
    
    console.log(`\n💾 Results saved to ${RESULTS_FILE}`);
}

main().catch(console.error);
