/**
 * RESEARCH CYCLE 2: Fixed
 */

const https = require('https');

const COINS = ["ETH", "BTC"];
const CURRENCY = "USD";

const STRATEGIES = [
    { name: "Baseline", type: "baseline", sl: 10, tp: 20 },
    { name: "Volume", type: "volume", sl: 10, tp: 20, volMult: 1.5 },
    { name: "MeanRev", type: "meanrev", sl: 5, tp: 10 },
];

function fetchData(coin, hours = 1500) {
    return new Promise((resolve) => {
        const url = `https://min-api.cryptocompare.com/data/v2/histohour?fsym=${coin}&tsym=${CURRENCY}&limit=${hours}`;
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (!json.Response) { resolve(null); return; }
                    const c = json.Data.Data.map(d => ({
                        time: d.time, close: d.close, high: d.high, low: d.low, volume: d.volumefrom
                    })).reverse();
                    resolve(c);
                } catch (e) { resolve(null); }
            });
        }).on('error', () => resolve(null));
    });
}

function calculateSMA(data, period) {
    const sma = [];
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) sma.push(null);
        else { let sum = 0; for (let j = 0; j < period; j++) sum += data[i - j].close; sma.push(sum / period); }
    }
    return sma;
}

function calculateRSI(data, period = 14) {
    const rsi = [];
    let gains = 0, losses = 0;
    for (let i = 0; i < data.length; i++) {
        if (i < period) { rsi.push(null); continue; }
        const change = data[i].close - data[i-1].close;
        if (i === period) {
            for (let j = 1; j <= period; j++) {
                const c = data[j].close - data[j-1].close;
                if (c > 0) gains += c; else losses += Math.abs(c);
            }
            gains /= period; losses /= period;
        } else {
            if (change > 0) { gains = (gains * (period - 1) + change) / period; losses = (losses * (period - 1)) / period; }
            else { losses = (losses * (period - 1) + Math.abs(change)) / period; gains = (gains * (period - 1)) / period; }
        }
        rsi.push(100 - (100 / (1 + (losses === 0 ? 100 : gains / losses))));
    }
    return rsi;
}

function backtest(candles, strategy) {
    const smaFast = calculateSMA(candles, 10);
    const smaSlow = calculateSMA(candles, 30);
    const rsi = calculateRSI(candles, 14);
    const volSMA = [];
    for (let i = 0; i < candles.length; i++) {
        if (i < 19) volSMA.push(null);
        else { let sum = 0; for (let j = 0; j < 20; j++) sum += candles[i - j].volume; volSMA.push(sum / 20); }
    }
    
    const valid = candles.map((c, i) => ({
        close: c.close, high: c.high, low: c.low, volume: c.volume,
        sma_fast: smaFast[i], sma_slow: smaSlow[i], rsi: rsi[i], vol_sma: volSMA[i],
        buySignal: false, sellSignal: false
    })).filter(d => d.sma_fast !== null);
    
    // Generate signals
    for (let i = 1; i < valid.length; i++) {
        const curr = valid[i], prev = valid[i-1];
        
        const crossUp = prev.sma_fast <= prev.sma_slow && curr.sma_fast > curr.sma_slow;
        const crossDown = prev.sma_fast >= prev.sma_slow && curr.sma_fast < curr.sma_slow;
        
        if (strategy.type === "baseline") {
            if (crossUp) curr.buySignal = true;
            if (crossDown) curr.sellSignal = true;
        } else if (strategy.type === "volume") {
            const volConfirm = curr.volume > curr.vol_sma * strategy.volMult;
            if (crossUp && volConfirm) curr.buySignal = true;
            if (crossDown) curr.sellSignal = true;
        } else if (strategy.type === "meanrev") {
            if (curr.rsi && curr.rsi < 30) curr.buySignal = true;
            if (curr.rsi && curr.rsi > 70) curr.sellSignal = true;
        }
    }
    
    // Run backtest
    let balance = 10000, position = 0, entryPrice = 0, qty = 0, wins = 0, losses = 0;
    
    for (let i = 0; i < valid.length; i++) {
        const row = valid[i];
        
        if (position === 1) {
            // Check stop loss
            const slPrice = entryPrice * (1 - strategy.sl/100);
            const tpPrice = entryPrice * (1 + strategy.tp/100);
            
            if (row.low <= slPrice) {
                balance = qty * slPrice;
                position = 0;
                losses++;
                continue;
            }
            if (row.high >= tpPrice) {
                balance = qty * tpPrice;
                position = 0;
                wins++;
                continue;
            }
        }
        
        // Buy
        if (row.buySignal && position === 0) {
            qty = balance / row.close;
            balance = 0;
            position = 1;
            entryPrice = row.close;
        }
        // Sell
        else if (row.sellSignal && position === 1) {
            const pnl = (row.close - entryPrice) * qty;
            balance += row.close * qty;
            position = 0;
            if (pnl > 0) wins++;
            else losses++;
        }
    }
    
    // Close final position at current price
    if (position === 1 && valid.length > 0) {
        balance = qty * valid[valid.length - 1].close;
    }
    
    const totalReturn = ((balance - 10000) / 10000) * 100;
    return { return: totalReturn, wins, losses, trades: wins + losses };
}

async function main() {
    console.log(`🔬 Research Cycle 2\n`);
    const allResults = [];
    
    for (const coin of COINS) {
        process.stdout.write(`${coin}: `);
        const candles = await fetchData(coin);
        if (!candles) { console.log(`❌`); continue; }
        
        for (const strat of STRATEGIES) {
            const result = backtest(candles, strat);
            allResults.push({ coin, strategy: strat.name, ...result });
            const e = result.return > 0 ? '🟢' : '🔴';
            process.stdout.write(`${e}${result.return.toFixed(1)}% `);
        }
        console.log(``);
    }
    
    allResults.sort((a, b) => b.return - a.return);
    
    console.log(`\n╔═══════════════════════════════════╗`);
    console.log(`║         RANKINGS                 ║`);
    console.log(`╠═══════════════════════════════════╣`);
    for (let i = 0; i < allResults.length; i++) {
        const r = allResults[i];
        const e = r.return > 0 ? '🟢' : '🔴';
        console.log(`║ ${i+1}. ${e} ${r.coin} ${r.strategy.padEnd(10)} ${r.return > 0 ? '+' : ''}${r.return.toFixed(2)}%`.padEnd(38) + `║`);
    }
    console.log(`╚═══════════════════════════════════╝`);
    
    const best = allResults[0];
    console.log(`\n🏆 BEST: ${best.coin} ${best.strategy} = +${best.return.toFixed(2)}%`);
}

main();
