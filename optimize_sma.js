// Backtest: Optimize SMA + MultiTF Strategy
// Find best parameters for our winning strategy
const https = require('https');
const fs = require('fs');

const TEST_COINS = [
    { symbol: 'ETH', pair: 'ETHUSD' },
    { symbol: 'BTC', pair: 'XBTUSD' },
    { symbol: 'ARB', pair: 'ARBUSD' },
    { symbol: 'SOL', pair: 'SOLUSD' },
    { symbol: 'NEAR', pair: 'NEARUSD' }
];

const INITIAL_CAPITAL = 1000;
const POSITION_SIZE = 100;

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

function calculatePSAR(data, af = 0.09) {
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

async function testSMA(coin, fastPeriod, slowPeriod, slPct, tpPct, useMultiTF) {
    const hourlyData = await fetchOHLC(coin.pair, 60, 200);
    const dailyData = await fetchOHLC(coin.pair, 1440, 50);
    
    if (!hourlyData || !dailyData || hourlyData.length < 100 || dailyData.length < 30) {
        return null;
    }
    
    // Get daily trend
    const dailyPSAR = calculatePSAR(dailyData);
    const dailyTrend = dailyPSAR[dailyPSAR.length - 1]?.trend === 1 ? "BULL" : "BEAR";
    
    const smaFast = calculateSMA(hourlyData, fastPeriod);
    const smaSlow = calculateSMA(hourlyData, slowPeriod);
    
    let capital = INITIAL_CAPITAL;
    let position = null;
    let entryPrice = 0;
    let wins = 0;
    let losses = 0;
    
    for (let i = Math.max(fastPeriod, slowPeriod) + 10; i < hourlyData.length - 1; i++) {
        const price = hourlyData[i].close;
        const fastSMA = smaFast[i];
        const slowSMA = smaSlow[i];
        const prevFast = smaFast[i-1];
        const prevSlow = smaSlow[i-1];
        
        if (fastSMA === null || slowSMA === null) continue;
        
        const bullishCross = prevFast <= prevSlow && fastSMA > slowSMA;
        const bearishCross = prevFast >= prevSlow && fastSMA < slowSMA;
        
        // MultiTF filter
        let canBuy = true, canSell = true;
        if (useMultiTF) {
            if (dailyTrend === 'BEAR') canBuy = false;
            if (dailyTrend === 'BULL') canSell = false;
        }
        
        // Check stops
        if (position === 'long') {
            const sl = entryPrice * (1 - slPct / 100);
            const tp = entryPrice * (1 + tpPct / 100);
            
            if (price <= sl) { capital *= (1 - slPct/100 * POSITION_SIZE/INITIAL_CAPITAL); losses++; position = null; }
            else if (price >= tp) { capital *= (1 + tpPct/100 * POSITION_SIZE/INITIAL_CAPITAL); wins++; position = null; }
        }
        
        // Entries
        if (!position) {
            if (bullishCross && canBuy) { position = 'long'; entryPrice = price; }
            else if (bearishCross && canSell) { position = 'short'; entryPrice = price; } // Not using shorts in this test
        }
    }
    
    const totalTrades = wins + losses;
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
    const returnPct = ((capital - INITIAL_CAPITAL) / INITIAL_CAPITAL) * 100;
    
    return { trades: totalTrades, wins, losses, winRate, returnPct };
}

async function main() {
    console.log(`\n🔬 SMA + MultiTF Optimization`);
    console.log(`============================`);
    
    const paramCombos = [
        // Fast/Slow periods, SL%, TP%, MultiTF
        { fast: 12, slow: 26, sl: 2, tp: 4, multitf: false },
        { fast: 12, slow: 26, sl: 2, tp: 4, multitf: true },
        { fast: 12, slow: 26, sl: 3, tp: 6, multitf: false },
        { fast: 12, slow: 26, sl: 3, tp: 6, multitf: true },
        { fast: 24, slow: 56, sl: 2, tp: 4, multitf: false },
        { fast: 24, slow: 56, sl: 2, tp: 4, multitf: true },
        { fast: 24, slow: 56, sl: 3, tp: 6, multitf: false },
        { fast: 24, slow: 56, sl: 3, tp: 6, multitf: true },
        { fast: 9, slow: 21, sl: 2, tp: 4, multitf: true },
        { fast: 10, slow: 30, sl: 2, tp: 5, multitf: true },
        { fast: 20, slow: 50, sl: 2, tp: 4, multitf: true },
    ];
    
    const results = [];
    
    for (const params of paramCombos) {
        console.log(`\nTesting SMA(${params.fast}/${params.slow}) SL:${params.sl}% TP:${params.tp}% MultiTF:${params.multitf}`);
        
        let totalTrades = 0, totalWins = 0, totalLosses = 0;
        let totalReturn = 0;
        
        for (const coin of TEST_COINS) {
            const r = await testSMA(coin, params.fast, params.slow, params.sl, params.tp, params.multitf);
            if (r) {
                totalTrades += r.trades;
                totalWins += r.wins;
                totalLosses += r.losses;
                totalReturn += r.returnPct;
            }
            await new Promise(r => setTimeout(r, 300));
        }
        
        const winRate = totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0;
        const avgReturn = totalReturn / TEST_COINS.length;
        
        console.log(`   Trades: ${totalTrades} | Win Rate: ${winRate.toFixed(1)}% | Return: ${avgReturn.toFixed(2)}%`);
        
        results.push({ ...params, trades: totalTrades, winRate, returnPct: avgReturn });
    }
    
    // Sort by return
    results.sort((a, b) => b.returnPct - a.returnPct);
    
    console.log(`\n📊 TOP RESULTS:`);
    console.log(`================`);
    results.slice(0, 5).forEach((r, i) => {
        console.log(`${i+1}. SMA(${r.fast}/${r.slow}) SL:${r.sl}% TP:${r.tp}% MTF:${r.multitf} | WR:${r.winRate.toFixed(1)}% | Return:${r.returnPct.toFixed(2)}%`);
    });
    
    fs.writeFileSync('/home/matthewkania.mk/.openclaw/workspace/trading_bot/optimization_results.json', JSON.stringify(results, null, 2));
    console.log(`\n💾 Saved to optimization_results.json`);
}

main().catch(console.error);
