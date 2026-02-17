/**
 * FACE-OFF: Version 1 vs Version 2
 * Test on multiple coins
 */

const https = require('https');

const COINS = ["ETH", "BTC", "SOL", "DOT"];
const INITIAL_BALANCE = 10000;
const STOP_LOSS_PCT = 10;
const TAKE_PROFIT_PCT = 20;

// Version 1: Simple SMA(10/30)
function fetchData(coin, limit = 1500) {
    return new Promise((resolve) => {
        const url = `https://min-api.cryptocompare.com/data/v2/histohour?fsym=${coin}&tsym=USD&limit=${limit}`;
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (!json.Response) { resolve(null); return; }
                    resolve(json.Data.Data.map(d => ({
                        close: d.close, high: d.high, low: d.low, volume: d.volumefrom
                    })).reverse());
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

function calculateATR(data, period = 14) {
    const atr = [];
    for (let i = 0; i < data.length; i++) {
        if (i < period) { atr.push(null); continue; }
        let tr = Math.max(data[i].high - data[i].low, Math.abs(data[i].high - data[i-1].close), Math.abs(data[i].low - data[i-1].close));
        if (i === period) {
            let sum = 0;
            for (let j = 1; j <= period; j++) {
                const tr_j = Math.max(data[j].high - data[j].low, Math.abs(data[j].high - data[j-1].close), Math.abs(data[j].low - data[j-1].close));
                sum += tr_j;
            }
            atr.push(sum / period);
        } else {
            atr.push((atr[i-1] * (period - 1) + tr) / period);
        }
    }
    return atr;
}

function backtestV1(candles) {
    const smaFast = calculateSMA(candles, 10);
    const smaSlow = calculateSMA(candles, 30);
    
    let balance = INITIAL_BALANCE;
    let position = null;
    
    for (let i = 1; i < candles.length; i++) {
        if (smaFast[i] === null) continue;
        
        if (position) {
            const sl = position.entryPrice * (1 - STOP_LOSS_PCT/100);
            const tp = position.entryPrice * (1 + TAKE_PROFIT_PCT/100);
            if (candles[i].low <= sl) { balance += position.qty * sl; position = null; continue; }
            if (candles[i].high >= tp) { balance += position.qty * tp; position = null; continue; }
        }
        
        const crossUp = smaFast[i-1] <= smaSlow[i-1] && smaFast[i] > smaSlow[i];
        const crossDown = smaFast[i-1] >= smaSlow[i-1] && smaFast[i] < smaSlow[i];
        
        if (crossUp && !position) { position = { qty: balance / candles[i].close, entryPrice: candles[i].close }; balance = 0; }
        else if (crossDown && position) { balance += position.qty * candles[i].close; position = null; }
    }
    
    let final = balance;
    if (position) final = position.qty * candles[candles.length - 1].close;
    return ((final - INITIAL_BALANCE) / INITIAL_BALANCE) * 100;
}

function backtestV2(candles) {
    const smaFast = calculateSMA(candles, 20);
    const smaSlow = calculateSMA(candles, 50);
    const rsi = calculateRSI(candles, 14);
    const atr = calculateATR(candles, 14);
    
    let balance = INITIAL_BALANCE;
    let position = null;
    
    for (let i = 1; i < candles.length; i++) {
        if (smaFast[i] === null) continue;
        
        const crossUp = smaFast[i-1] <= smaSlow[i-1] && smaFast[i] > smaSlow[i];
        const crossDown = smaFast[i-1] >= smaSlow[i-1] && smaFast[i] < smaSlow[i];
        const rsiOk = rsi[i] < 70;
        
        if (position) {
            const sl = position.entryPrice - atr[i] * 2;
            const tp = position.entryPrice + atr[i] * 4;
            if (candles[i].low <= sl) { balance += position.qty * sl; position = null; continue; }
            if (candles[i].high >= tp) { balance += position.qty * tp; position = null; continue; }
        }
        
        if (crossUp && rsiOk && !position) { position = { qty: balance / candles[i].close, entryPrice: candles[i].close }; balance = 0; }
        else if (crossDown && position) { balance += position.qty * candles[i].close; position = null; }
    }
    
    let final = balance;
    if (position) final = position.qty * candles[candles.length - 1].close;
    return ((final - INITIAL_BALANCE) / INITIAL_BALANCE) * 100;
}

async function main() {
    console.log(`🥊 VERSION 1 (Simple) vs VERSION 2 (Advanced)\n`);
    
    const results = [];
    
    for (const coin of COINS) {
        process.stdout.write(`${coin}: `);
        const candles = await fetchData(coin);
        if (!candles) { console.log(`❌`); continue; }
        
        const v1 = backtestV1(candles);
        const v2 = backtestV2(candles);
        
        results.push({ coin, v1, v2 });
        const v1e = v1 > 0 ? '🟢' : '🔴';
        const v2e = v2 > 0 ? '🟢' : '🔴';
        console.log(`V1: ${v1e}${v1.toFixed(1)}% | V2: ${v2e}${v2.toFixed(1)}%`);
    }
    
    const v1Avg = results.reduce((a,b) => a + b.v1, 0) / results.length;
    const v2Avg = results.reduce((a,b) => a + b.v2, 0) / results.length;
    
    console.log(`\n📊 AVERAGE:`);
    console.log(`   Version 1 (Simple): ${v1Avg > 0 ? '🟢' : '🔴'}${v1Avg.toFixed(2)}%`);
    console.log(`   Version 2 (Advanced): ${v2Avg > 0 ? '🟢' : '🔴'}${v2Avg.toFixed(2)}%`);
    console.log(`\n🏆 WINNER: ${v1Avg > v2Avg ? 'VERSION 1 (Simple)!' : 'VERSION 2 (Advanced)!'}`);
}

main();
