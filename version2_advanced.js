/**
 * VERSION 2: Advanced Strategy
 * Multi-timeframe + RSI + Volume + ATR Stop Loss
 */

const https = require('https');

const COIN = "ETH";
const CURRENCY = "USD";
const INITIAL_BALANCE = 10000;

// Strategy parameters
const SMA_FAST = 20;
const SMA_SLOW = 50;
const RSI_PERIOD = 14;
const VOLUME_SMA = 20;
const VOLUME_CONFIRM = 1.3;
const ATR_PERIOD = 14;
const ATR_MULT = 2;
const RR_RATIO = 2;

function fetchData(limit = 1500) {
    return new Promise((resolve) => {
        const url = `https://min-api.cryptocompare.com/data/v2/histohour?fsym=${COIN}&tsym=${CURRENCY}&limit=${limit}`;
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

function fetch4h() {
    return new Promise((resolve) => {
        const url = `https://min-api.cryptocompare.com/data/v2/histo4h?fsym=${COIN}&tsym=${CURRENCY}&limit=300`;
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (!json.Response) { resolve(null); return; }
                    resolve(json.Data.Data.map(d => ({ close: d.close, high: d.high, low: d.low })).reverse());
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
        let tr = Math.max(
            data[i].high - data[i].low,
            Math.abs(data[i].high - data[i-1].close),
            Math.abs(data[i].low - data[i-1].close)
        );
        if (i === period) {
            let sum = 0;
            for (let j = 1; j <= period; j++) {
                const tr_j = Math.max(
                    data[j].high - data[j].low,
                    Math.abs(data[j].high - data[j-1].close),
                    Math.abs(data[j].low - data[j-1].close)
                );
                sum += tr_j;
            }
            atr.push(sum / period);
        } else {
            atr.push((atr[i-1] * (period - 1) + tr) / period);
        }
    }
    return atr;
}

function calculateVolumeSMA(data, period = 20) {
    const sma = [];
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) sma.push(null);
        else { let sum = 0; for (let j = 0; j < period; j++) sum += data[i - j].volume; sma.push(sum / period); }
    }
    return sma;
}

function runBacktest(candles, data4h) {
    const smaFast = calculateSMA(candles, SMA_FAST);
    const smaSlow = calculateSMA(candles, SMA_SLOW);
    const rsi = calculateRSI(candles, RSI_PERIOD);
    const atr = calculateATR(candles, ATR_PERIOD);
    const volSMA = calculateVolumeSMA(candles, VOLUME_SMA);
    
    // 4h indicators
    let smaFast4h = null, smaSlow4h = null;
    if (data4h) {
        smaFast4h = calculateSMA(data4h, 20);
        smaSlow4h = calculateSMA(data4h, 50);
    }
    
    const signals = [];
    for (let i = 1; i < candles.length; i++) {
        if (smaFast[i] === null) continue;
        
        // 4h trend
        let trendAligned = true;
        if (data4h && smaFast4h) {
            const idx4h = Math.floor(i / 4);
            if (idx4h < smaFast4h.length && smaFast4h[idx4h] && smaSlow4h[idx4h]) {
                trendAligned = smaFast4h[idx4h] > smaSlow4h[idx4h];
            }
        }
        
        const crossUp = smaFast[i-1] <= smaSlow[i-1] && smaFast[i] > smaSlow[i];
        const crossDown = smaFast[i-1] >= smaSlow[i-1] && smaFast[i] < smaSlow[i];
        
        // Volume filter
        const volConfirm = candles[i].volume >= volSMA[i] * VOLUME_CONFIRM;
        
        // RSI filter
        const rsiOk = rsi[i] < 70;
        
        let signal = 0;
        if (crossUp && rsiOk && trendAligned) signal = 1;
        if (crossDown) signal = -1;
        
        signals.push({
            close: candles[i].close,
            high: candles[i].high,
            low: candles[i].low,
            atr: atr[i],
            signal
        });
    }
    
    // Backtest
    let balance = INITIAL_BALANCE;
    let position = null;
    
    for (const bar of signals) {
        if (position) {
            const stopPrice = position.entryPrice - (bar.atr * ATR_MULT);
            const profitTarget = position.entryPrice + (bar.atr * ATR_MULT * RR_RATIO);
            
            if (bar.low <= stopPrice) {
                balance += position.qty * stopPrice;
                position = null;
                continue;
            }
            if (bar.high >= profitTarget) {
                balance += position.qty * profitTarget;
                position = null;
                continue;
            }
        }
        
        if (bar.signal === 1 && !position) {
            position = { qty: balance / bar.close, entryPrice: bar.close };
            balance = 0;
        }
        else if (bar.signal === -1 && position) {
            balance += position.qty * bar.close;
            position = null;
        }
    }
    
    let finalValue = balance;
    if (position) {
        finalValue = position.qty * signals[signals.length - 1].close;
    }
    
    const totalReturn = ((finalValue - INITIAL_BALANCE) / INITIAL_BALANCE) * 100;
    return { return: totalReturn };
}

async function main() {
    console.log(`🏆 VERSION 2: Advanced Multi-Filter - The Challenger\n`);
    
    const candles = await fetchData(1500);
    const data4h = await fetch4h();
    
    if (!candles) { console.log(`❌ Failed`); return; }
    
    const result = runBacktest(candles, data4h);
    console.log(`   Initial: $${INITIAL_BALANCE}`);
    console.log(`   Final: $${(INITIAL_BALANCE * (1 + result.return/100)).toFixed(2)}`);
    console.log(`   Return: ${result.return.toFixed(2)}%`);
}

main();
