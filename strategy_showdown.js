/**
 * STRATEGY SHOWDOWN: 5 Strategies Face-Off
 * Find which one performs best
 */

const https = require('https');

const COINS = ["ETH", "BTC"];
const INITIAL_BALANCE = 10000;

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
                        close: d.close, high: d.high, low: d.low
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

function calculateEMA(data, period) {
    const ema = [];
    const mul = 2 / (period + 1);
    for (let i = 0; i < data.length; i++) {
        if (i === 0) { ema.push(data[i].close); continue; }
        ema.push((data[i].close - ema[i-1]) * mul + ema[i-1]);
    }
    return ema;
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

function calculateMACD(data) {
    const ema12 = calculateEMA(data, 12);
    const ema26 = calculateEMA(data, 26);
    const macdLine = ema12.map((v, i) => v - ema26[i]);
    const signalLine = [];
    const mul = 2 / 10;
    for (let i = 0; i < macdLine.length; i++) {
        if (i < 9) { signalLine.push(null); continue; }
        if (i === 9) { let sum = 0; for (let j = 0; j < 9; j++) sum += macdLine[j]; signalLine.push(sum / 9); continue; }
        signalLine.push((macdLine[i] - signalLine[i-1]) * mul + signalLine[i-1]);
    }
    return { macd: macdLine, signal: signalLine };
}

function calculateBB(data, period = 20, std = 2) {
    const sma = calculateSMA(data, period);
    const upper = [], lower = [];
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) { upper.push(null); lower.push(null); continue; }
        let sum = 0;
        for (let j = 0; j < period; j++) sum += Math.pow(data[i - j].close - sma[i], 2);
        const sd = Math.sqrt(sum / period);
        upper.push(sma[i] + std * sd);
        lower.push(sma[i] - std * sd);
    }
    return { middle: sma, upper, lower };
}

// Strategy 1: SMA Crossover (10/30) - OUR STRATEGY
function strategySMA(data, sl = 10, tp = 20) {
    const sma10 = calculateSMA(data, 10);
    const sma30 = calculateSMA(data, 30);
    
    let balance = INITIAL_BALANCE, position = null;
    
    for (let i = 1; i < data.length; i++) {
        if (!sma10[i]) continue;
        if (position) {
            if (data[i].low <= position.entry * (1 - sl/100)) { balance += position.qty * position.entry * (1 - sl/100); position = null; continue; }
            if (data[i].high >= position.entry * (1 + tp/100)) { balance += position.qty * position.entry * (1 + tp/100); position = null; continue; }
        }
        const crossUp = sma10[i-1] <= sma30[i-1] && sma10[i] > sma30[i];
        const crossDown = sma10[i-1] >= sma30[i-1] && sma10[i] < sma30[i];
        if (crossUp && !position) { position = { qty: balance / data[i].close, entry: data[i].close }; balance = 0; }
        else if (crossDown && position) { balance += position.qty * data[i].close; position = null; }
    }
    let final = balance;
    if (position) final = position.qty * data[data.length - 1].close;
    return ((final - INITIAL_BALANCE) / INITIAL_BALANCE) * 100;
}

// Strategy 2: MACD Crossover
function strategyMACD(data, sl = 10, tp = 20) {
    const macd = calculateMACD(data);
    let balance = INITIAL_BALANCE, position = null;
    
    for (let i = 1; i < data.length; i++) {
        if (!macd.signal[i]) continue;
        if (position) {
            if (data[i].low <= position.entry * (1 - sl/100)) { balance += position.qty * position.entry * (1 - sl/100); position = null; continue; }
            if (data[i].high >= position.entry * (1 + tp/100)) { balance += position.qty * position.entry * (1 + tp/100); position = null; continue; }
        }
        const crossUp = macd.macd[i-1] <= macd.signal[i-1] && macd.macd[i] > macd.signal[i];
        const crossDown = macd.macd[i-1] >= macd.signal[i-1] && macd.macd[i] < macd.signal[i];
        if (crossUp && !position) { position = { qty: balance / data[i].close, entry: data[i].close }; balance = 0; }
        else if (crossDown && position) { balance += position.qty * data[i].close; position = null; }
    }
    let final = balance;
    if (position) final = position.qty * data[data.length - 1].close;
    return ((final - INITIAL_BALANCE) / INITIAL_BALANCE) * 100;
}

// Strategy 3: RSI Only (buy oversold, sell overbought)
function strategyRSI(data, sl = 5, tp = 15) {
    const rsi = calculateRSI(data, 14);
    let balance = INITIAL_BALANCE, position = null;
    
    for (let i = 1; i < data.length; i++) {
        if (!rsi[i]) continue;
        if (position) {
            if (data[i].low <= position.entry * (1 - sl/100)) { balance += position.qty * position.entry * (1 - sl/100); position = null; continue; }
            if (data[i].high >= position.entry * (1 + tp/100)) { balance += position.qty * position.entry * (1 + tp/100); position = null; continue; }
        }
        // Buy when RSI < 30 (oversold), Sell when RSI > 70 (overbought)
        if (rsi[i] < 30 && !position) { position = { qty: balance / data[i].close, entry: data[i].close }; balance = 0; }
        else if (rsi[i] > 70 && position) { balance += position.qty * data[i].close; position = null; }
    }
    let final = balance;
    if (position) final = position.qty * data[data.length - 1].close;
    return ((final - INITIAL_BALANCE) / INITIAL_BALANCE) * 100;
}

// Strategy 4: Bollinger Bands (mean reversion)
function strategyBB(data, sl = 5, tp = 15) {
    const bb = calculateBB(data, 20, 2);
    let balance = INITIAL_BALANCE, position = null;
    
    for (let i = 1; i < data.length; i++) {
        if (!bb.upper[i]) continue;
        if (position) {
            if (data[i].low <= position.entry * (1 - sl/100)) { balance += position.qty * position.entry * (1 - sl/100); position = null; continue; }
            if (data[i].high >= position.entry * (1 + tp/100)) { balance += position.qty * position.entry * (1 + tp/100); position = null; continue; }
        }
        // Buy at lower band, sell at middle or upper
        if (data[i].close <= bb.lower[i] && !position) { position = { qty: balance / data[i].close, entry: data[i].close }; balance = 0; }
        else if (data[i].close >= bb.middle[i] && position) { balance += position.qty * data[i].close; position = null; }
    }
    let final = balance;
    if (position) final = position.qty * data[data.length - 1].close;
    return ((final - INITIAL_BALANCE) / INITIAL_BALANCE) * 100;
}

// Strategy 5: Dual SMA (50/200 - classic death/golden cross)
function strategyDualSMA(data, sl = 10, tp = 25) {
    const sma50 = calculateSMA(data, 50);
    const sma200 = calculateSMA(data, 200);
    
    let balance = INITIAL_BALANCE, position = null;
    
    for (let i = 1; i < data.length; i++) {
        if (!sma200[i]) continue;
        if (position) {
            if (data[i].low <= position.entry * (1 - sl/100)) { balance += position.qty * position.entry * (1 - sl/100); position = null; continue; }
            if (data[i].high >= position.entry * (1 + tp/100)) { balance += position.qty * position.entry * (1 + tp/100); position = null; continue; }
        }
        const crossUp = sma50[i-1] <= sma200[i-1] && sma50[i] > sma200[i];
        const crossDown = sma50[i-1] >= sma200[i-1] && sma50[i] < sma200[i];
        if (crossUp && !position) { position = { qty: balance / data[i].close, entry: data[i].close }; balance = 0; }
        else if (crossDown && position) { balance += position.qty * data[i].close; position = null; }
    }
    let final = balance;
    if (position) final = position.qty * data[data.length - 1].close;
    return ((final - INITIAL_BALANCE) / INITIAL_BALANCE) * 100;
}

async function main() {
    console.log(`⚔️ STRATEGY SHOWDOWN: 5 Strategies\n`);
    
    const results = [];
    
    for (const coin of COINS) {
        process.stdout.write(`${coin}: `);
        const data = await fetchData(coin);
        if (!data) { console.log(`❌`); continue; }
        
        const strategies = [
            { name: "SMA 10/30", fn: () => strategySMA(data) },
            { name: "MACD", fn: () => strategyMACD(data) },
            { name: "RSI Only", fn: () => strategyRSI(data) },
            { name: "Bollinger", fn: () => strategyBB(data) },
            { name: "SMA 50/200", fn: () => strategyDualSMA(data) },
        ];
        
        for (const s of strategies) {
            const ret = s.fn();
            results.push({ coin, strategy: s.name, return: ret });
            const e = ret > 0 ? '🟢' : '🔴';
            process.stdout.write(`${e}${ret.toFixed(0)}% `);
        }
        console.log(``);
    }
    
    // Average by strategy
    const byStrategy = {};
    for (const r of results) {
        if (!byStrategy[r.strategy]) byStrategy[r.strategy] = [];
        byStrategy[r.strategy].push(r.return);
    }
    
    console.log(`\n📊 AVERAGE BY STRATEGY:`);
    const averages = [];
    for (const [strat, rets] of Object.entries(byStrategy)) {
        const avg = rets.reduce((a,b) => a+b, 0) / rets.length;
        averages.push({ strategy: strat, avg });
        const e = avg > 0 ? '🟢' : '🔴';
        console.log(`   ${e} ${strat}: ${avg.toFixed(1)}%`);
    }
    
    averages.sort((a, b) => b.avg - a.avg);
    
    console.log(`\n🏆 RANKING:`);
    for (let i = 0; i < averages.length; i++) {
        const a = averages[i];
        const star = i === 0 ? '⭐' : '  ';
        const e = a.avg > 0 ? '🟢' : '🔴';
        console.log(`   ${star} ${i+1}. ${e} ${a.strategy}: ${a.avg.toFixed(1)}%`);
    }
    
    const winner = averages[0];
    console.log(`\n🏆 WINNER: ${winner.strategy} with ${winner.avg.toFixed(1)}% average return!`);
}

main();
