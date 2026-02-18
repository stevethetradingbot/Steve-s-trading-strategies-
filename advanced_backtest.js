// Advanced Strategy Backtester - Tests multiple strategies and parameters
const https = require('https');
const fs = require('fs');

const RESULTS_FILE = '/home/matthewkania.mk/.openclaw/workspace/trading_bot/strategy_backtest.json';

const INITIAL_CAPITAL = 1000;
const TRADING_FEE = 0.001;

// ============ KRAKEN API ============
function fetchData(symbol, interval, limit = 500) {
    return new Promise((resolve) => {
        const url = `https://api.kraken.com/0/public/OHLC?pair=${symbol}&interval=${interval}&limit=${limit}`;
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    const pairKey = Object.keys(json.result).find(k => !k.startsWith('last'));
                    if (!pairKey) { resolve(null); return; }
                    const candles = json.result[pairKey].map(d => ({
                        time: d[0],
                        open: parseFloat(d[1]),
                        high: parseFloat(d[2]),
                        low: parseFloat(d[3]),
                        close: parseFloat(d[4]),
                        volume: parseFloat(d[6]) || 0
                    })).reverse();
                    resolve(candles);
                } catch (e) { resolve(null); }
            });
        }).on('error', () => resolve(null));
    });
}

// ============ INDICATORS ============
function SMA(data, period) {
    const r = [];
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) r.push(null);
        else { let s = 0; for (let j = 0; j < period; j++) s += data[i - j].close; r.push(s / period); }
    }
    return r;
}

function RSI(data, period = 14) {
    const r = [];
    let g = 0, l = 0;
    for (let i = 0; i < data.length; i++) {
        if (i < period) { r.push(null); continue; }
        const c = data[i].close - data[i-1].close;
        if (i === period) {
            for (let j = 1; j <= period; j++) {
                const ch = data[j].close - data[j-1].close;
                if (ch > 0) g += ch; else l += Math.abs(ch);
            }
            g /= period; l /= period;
        } else {
            if (c > 0) { g = (g * (period - 1) + c) / period; l = (l * (period - 1)) / period; }
            else { l = (l * (period - 1) + Math.abs(c)) / period; g = (g * (period - 1)) / period; }
        }
        const rs = l === 0 ? 100 : g / l;
        r.push(100 - (100 / (1 + rs)));
    }
    return r;
}

function VolumeSMA(data, period = 20) {
    const r = [];
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) r.push(null);
        else { let s = 0; for (let j = 0; j < period; j++) s += data[i - j].volume; r.push(s / period); }
    }
    return r;
}

function PSAR(data, af = 0.02) {
    const d = [...data].reverse();
    let sar = d[0].low, ep = d[0].high, tr = 1, afv = af, r = [];
    for (let i = 1; i < d.length; i++) {
        sar = sar + afv * (ep - sar);
        if (tr === 1) {
            if (d[i].low < sar) { tr = -1; sar = ep; ep = d[i].low; afv = af; }
            else { if (d[i].high > ep) { ep = d[i].high; afv = Math.min(afv + af, 0.2); } }
        } else {
            if (d[i].high > sar) { tr = 1; sar = ep; ep = d[i].high; afv = af; }
            else { if (d[i].low < ep) { ep = d[i].low; afv = Math.min(afv + af, 0.2); } }
        }
        r.push({ sar, trend: tr, ep });
    }
    return r.reverse();
}

// ============ BACKTEST ENGINE ============
function backtest(hourlyData, config) {
    const { 
        fastPeriod, slowPeriod, 
        useRSI, rsiPeriod = 14, rsiOversold = 35, rsiOverbought = 65,
        useVolume, volumePeriod = 20,
        useMultiTF, dailyData,
        slPct, tpPct,
        strategy
    } = config;
    
    const smaFast = strategy === 'SMA' ? SMA(hourlyData, fastPeriod) : null;
    const smaSlow = strategy === 'SMA' ? SMA(hourlyData, slowPeriod) : null;
    const rsi = useRSI ? RSI(hourlyData, rsiPeriod) : null;
    const volSMA = useVolume ? VolumeSMA(hourlyData, volumePeriod) : null;
    const psar = strategy === 'PSAR' ? PSAR(hourlyData, 0.02) : null;
    
    // Daily PSAR for multi-timeframe
    let dailyPSAR = null;
    if (useMultiTF && dailyData && dailyData.length > 0) {
        dailyPSAR = PSAR(dailyData, 0.09);
    }
    
    let capital = INITIAL_CAPITAL;
    let position = null;
    let trades = [], wins = 0, losses = 0;
    
    const startIdx = dailyPSAR ? Math.max(0, dailyPSAR.length - hourlyData.length) : 0;
    const minIdx = Math.max(fastPeriod || 0, slowPeriod || 0, rsiPeriod || 0, volumePeriod || 0, 1);
    
    for (let i = minIdx; i < hourlyData.length; i++) {
        const bar = hourlyData[i];
        
        const prevFast = smaFast ? smaFast[i-1] : null;
        const currFast = smaFast ? smaFast[i] : null;
        const prevSlow = smaSlow ? smaSlow[i-1] : null;
        const currSlow = smaSlow ? smaSlow[i] : null;
        const rsiVal = rsi ? rsi[i] : 50;
        const vol = volSMA ? volSMA[i] : bar.volume;
        
        // Get daily trend
        let dailyTrend = 1;
        if (useMultiTF && dailyPSAR && dailyPSAR.length > 0) {
            const dailyIdx = startIdx + i;
            if (dailyIdx < dailyPSAR.length && dailyPSAR[dailyIdx]) {
                dailyTrend = dailyPSAR[dailyIdx].trend || 1;
            }
        }
        
        let buySignal = false, sellSignal = false;
        
        if (strategy === 'SMA') {
            if (prevFast && prevSlow && currFast && currSlow) {
                if (prevFast <= prevSlow && currFast > currSlow) buySignal = true;
                if (prevFast >= prevSlow && currFast < currSlow) sellSignal = true;
            }
        } else if (strategy === 'PSAR' && psar && psar[i] && psar[i-1]) {
            if (psar[i-1].trend === -1 && psar[i].trend === 1) buySignal = true;
            if (psar[i-1].trend === 1 && psar[i].trend === -1) sellSignal = true;
        }
        
        // Apply filters
        if (buySignal) {
            if (useRSI && rsiVal >= rsiOversold) buySignal = false;
            if (useVolume && vol > 0 && bar.volume < vol * 0.8) buySignal = false;
            if (useMultiTF && dailyTrend === -1) buySignal = false;
        }
        
        if (sellSignal) {
            if (useRSI && rsiVal <= rsiOverbought) sellSignal = false;
            if (useVolume && vol > 0 && bar.volume < vol * 0.8) sellSignal = false;
            if (useMultiTF && dailyTrend === 1) sellSignal = false;
        }
        
        // Entry/Exit
        if (buySignal && !position) {
            position = { entryPrice: bar.close, size: capital / bar.close };
            capital = 0;
            trades.push({ type: 'BUY', price: bar.close });
        } else if (position) {
            const pnlPct = ((bar.close - position.entryPrice) / position.entryPrice) * 100;
            const shouldExit = sellSignal || pnlPct <= -slPct || pnlPct >= tpPct;
            
            if (shouldExit) {
                const proceeds = position.size * bar.close * (1 - TRADING_FEE);
                const pnl = proceeds - (position.size * position.entryPrice);
                capital = proceeds;
                const exitType = pnlPct >= tpPct ? 'TAKE_PROFIT' : pnlPct <= -slPct ? 'STOP_LOSS' : 'SIGNAL';
                trades.push({ type: exitType, price: bar.close, pnl: pnl.toFixed(2) });
                if (pnl > 0) wins++; else losses++;
                position = null;
            }
        }
    }
    
    if (position && hourlyData.length > 0) {
        const proceeds = position.size * hourlyData[hourlyData.length-1].close * (1 - TRADING_FEE);
        capital = proceeds;
    }
    
    const totalReturn = ((capital - INITIAL_CAPITAL) / INITIAL_CAPITAL) * 100;
    return {
        trades: trades.length, wins, losses,
        winRate: trades.length > 0 ? (wins / (wins + losses)) * 100 : 0,
        returnPct: totalReturn.toFixed(2),
        finalCapital: capital.toFixed(2)
    };
}

// ============ MAIN ============
async function main() {
    console.log('🧪 Advanced Strategy Backtester');
    console.log('Testing multiple strategy combinations...\n');
    
    console.log('Fetching BTC data...');
    const hourlyData = await fetchData('XBTUSD', 60, 500);
    const dailyData = await fetchData('XBTUSD', 1440, 60);
    
    if (!hourlyData || !dailyData) {
        console.log('Failed to fetch data');
        return;
    }
    
    console.log(`Hourly: ${hourlyData.length} bars, Daily: ${dailyData.length} bars\n`);
    
    const results = [];
    
    const configs = [
        { fastPeriod: 12, slowPeriod: 26, useRSI: false, useVolume: false, useMultiTF: false, slPct: 2, tpPct: 4, strategy: 'SMA', name: 'SMA baseline' },
        { fastPeriod: 24, slowPeriod: 56, useRSI: false, useVolume: false, useMultiTF: false, slPct: 2, tpPct: 4, strategy: 'SMA', name: 'SMA slow' },
        { fastPeriod: 12, slowPeriod: 26, useRSI: true, rsiPeriod: 14, rsiOversold: 35, rsiOverbought: 65, useVolume: false, useMultiTF: false, slPct: 2, tpPct: 4, strategy: 'SMA', name: 'SMA + RSI' },
        { fastPeriod: 12, slowPeriod: 26, useRSI: false, useVolume: true, volumePeriod: 20, useMultiTF: false, slPct: 2, tpPct: 4, strategy: 'SMA', name: 'SMA + Volume' },
        { fastPeriod: 12, slowPeriod: 26, useRSI: false, useVolume: false, useMultiTF: true, slPct: 2, tpPct: 4, strategy: 'SMA', name: 'SMA + MultiTF' },
        { fastPeriod: 12, slowPeriod: 26, useRSI: true, rsiPeriod: 14, rsiOversold: 35, rsiOverbought: 65, useVolume: true, volumePeriod: 20, useMultiTF: true, slPct: 2, tpPct: 4, strategy: 'SMA', name: 'SMA + ALL filters' },
        { fastPeriod: 24, slowPeriod: 56, useRSI: true, rsiPeriod: 14, rsiOversold: 30, rsiOverbought: 70, useVolume: true, volumePeriod: 20, useMultiTF: true, slPct: 2, tpPct: 4, strategy: 'SMA', name: 'SMA slow + ALL' },
        { fastPeriod: 12, slowPeriod: 26, useRSI: true, rsiPeriod: 14, rsiOversold: 35, rsiOverbought: 65, useVolume: true, volumePeriod: 20, useMultiTF: true, slPct: 1, tpPct: 3, strategy: 'SMA', name: 'SMA tight SL/TP' },
        { fastPeriod: 12, slowPeriod: 26, useRSI: false, useVolume: false, useMultiTF: false, slPct: 2, tpPct: 4, strategy: 'PSAR', name: 'PSAR baseline' },
        { fastPeriod: 12, slowPeriod: 26, useRSI: true, rsiPeriod: 14, rsiOversold: 35, rsiOverbought: 65, useVolume: false, useMultiTF: false, slPct: 2, tpPct: 4, strategy: 'PSAR', name: 'PSAR + RSI' },
    ];
    
    for (const config of configs) {
        const result = backtest(hourlyData, { ...config, dailyData, rsiPeriod: 14, volumePeriod: 20 });
        results.push({ ...config, ...result });
    }
    
    results.sort((a, b) => parseFloat(b.returnPct) - parseFloat(a.returnPct));
    
    console.log('📊 RESULTS (sorted by return):\n');
    results.forEach((r, i) => {
        console.log(`${i+1}. ${r.name}`);
        console.log(`   Trades: ${r.trades} | Win: ${r.wins} Loss: ${r.losses} | Return: ${r.returnPct}%`);
    });
    
    fs.writeFileSync(RESULTS_FILE, JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2));
    console.log(`\n💾 Saved to ${RESULTS_FILE}`);
}

main().catch(console.error);
