/**
 * 🎨 CREATIVE STRATEGY LAB
 * Think outside the box!
 */

const https = require('https');

const COINS = ["ETH", "BTC", "SOL", "DOT"];
const INITIAL = 10000;

function fetch(coin) {
    return new Promise(r => {
        https.get('https://min-api.cryptocompare.com/data/v2/histohour?fsym='+coin+'&tsym=USD&limit=1500', res => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => {
                try { r(JSON.parse(d).Data.Data.map(d => ({close: d.close, high: d.high, low: d.low, volume: d.volumefrom})).reverse()); } 
                catch(e) { r(null); }
            });
        }).on('error', () => r(null));
    });
}

// === INDICATORS ===

function SMA(data, p) {
    const r = [];
    for (let i = 0; i < data.length; i++) {
        if (i < p-1) r.push(null);
        else { let s = 0; for (let j = 0; j < p; j++) s += data[i-j].close; r.push(s/p); }
    }
    return r;
}

function EMA(data, p) {
    const r = [], m = 2/(p+1);
    for (let i = 0; i < data.length; i++) {
        if (i === 0) { r.push(data[i].close); continue; }
        r.push((data[i].close - r[i-1]) * m + r[i-1]);
    }
    return r;
}

function VWAP(data) {
    const r = [];
    let cumVol = 0, cumPV = 0;
    for (let i = 0; i < data.length; i++) {
        const typicalPrice = (data[i].high + data[i].low + data[i].close) / 3;
        cumPV += typicalPrice * data[i].volume;
        cumVol += data[i].volume;
        r.push(cumVol > 0 ? cumPV / cumVol : null);
    }
    return r;
}

function Stochastic(data, p=14) {
    const r = [];
    for (let i = 0; i < data.length; i++) {
        if (i < p) { r.push(null); continue; }
        let low = Infinity, high = -Infinity;
        for (let j = 0; j < p; j++) {
            low = Math.min(low, data[i-j].low);
            high = Math.max(high, data[i-j].high);
        }
        const k = high === low ? 50 : ((data[i].close - low) / (high - low)) * 100;
        r.push(k);
    }
    return r;
}

function ADX(data, p=14) {
    // Simplified - returns trend strength
    const r = [];
    for (let i = 0; i < data.length; i++) {
        if (i < p) { r.push(null); continue; }
        let plusDM = 0, minusDM = 0, tr = 0;
        for (let j = 0; j < p; j++) {
            const h = data[i-j].high - data[i-j-1]?.high || 0;
            const l = data[i-j-1]?.low - data[i-j].low || 0;
            plusDM = Math.max(plusDM, Math.max(h, 0));
            minusDM = Math.max(minusDM, Math.max(l, 0));
            tr += data[i-j].high - data[i-j].low;
        }
        const di = tr > 0 ? ((plusDM / tr) - (minusDM / tr)) / ((plusDM / tr) + (minusDM / tr)) * 100 : 50;
        r.push(Math.abs(di));
    }
    return r;
}

function Donchian(data, p=20) {
    const upper = [], lower = [];
    for (let i = 0; i < data.length; i++) {
        if (i < p-1) { upper.push(null); lower.push(null); continue; }
        let max = -Infinity, min = Infinity;
        for (let j = 0; j < p; j++) {
            max = Math.max(max, data[i-j].high);
            min = Math.min(min, data[i-j].low);
        }
        upper.push(max); lower.push(min);
    }
    return { upper, lower };
}

function Keltner(data, p=20) {
    const mid = SMA(data, p);
    const atr = [];
    for (let i = 0; i < data.length; i++) {
        if (i < p) { atr.push(null); continue; }
        let sum = 0;
        for (let j = 0; j < p; j++) {
            sum += Math.max(data[i-j].high - data[i-j].low, Math.abs(data[i-j].high - data[i-1-j]?.close || 0), Math.abs(data[i-j].low - data[i-1-j]?.close || 0));
        }
        atr.push(sum / p);
    }
    const upper = mid.map((m, i) => m && atr[i] ? m + 2 * atr[i] : null);
    const lower = mid.map((m, i) => m && atr[i] ? m - 2 * atr[i] : null);
    return { middle: mid, upper, lower };
}

// === STRATEGIES ===

// S1: VWAP Cross - price crosses VWAP
function stratVWAP(data) {
    const vwap = VWAP(data);
    let bal = INITIAL, pos = null;
    for (let i = 1; i < data.length; i++) {
        if (!vwap[i]) continue;
        if (pos) {
            if (data[i].low <= pos.entry * 0.90) { bal += pos.qty * pos.entry * 0.90; pos = null; continue; }
            if (data[i].high >= pos.entry * 1.20) { bal += pos.qty * pos.entry * 1.20; pos = null; continue; }
        }
        const crossUp = data[i-1].close <= vwap[i-1] && data[i].close > vwap[i];
        const crossDown = data[i-1].close >= vwap[i-1] && data[i].close < vwap[i];
        if (crossUp && !pos) { pos = {qty: bal/data[i].close, entry: data[i].close}; bal = 0; }
        else if (crossDown && pos) { bal += pos.qty * data[i].close; pos = null; }
    }
    return pos ? ((pos.qty * data[data.length-1].close - INITIAL) / INITIAL) * 100 : ((bal - INITIAL) / INITIAL) * 100;
}

// S2: Stochastic Cross (like RSI but different)
function stratStochastic(data) {
    const stoch = Stochastic(data, 14);
    let bal = INITIAL, pos = null;
    for (let i = 1; i < data.length; i++) {
        if (!stoch[i]) continue;
        if (pos) {
            if (data[i].low <= pos.entry * 0.90) { bal += pos.qty * pos.entry * 0.90; pos = null; continue; }
            if (data[i].high >= pos.entry * 1.20) { bal += pos.qty * pos.entry * 1.20; pos = null; continue; }
        }
        // Buy when stochastic < 20 (oversold), sell when > 80 (overbought)
        const buy = stoch[i-1] < 20 && stoch[i] >= 20;
        const sell = stoch[i-1] > 80 && stoch[i] <= 80;
        if (buy && !pos) { pos = {qty: bal/data[i].close, entry: data[i].close}; bal = 0; }
        else if (sell && pos) { bal += pos.qty * data[i].close; pos = null; }
    }
    return pos ? ((pos.qty * data[data.length-1].close - INITIAL) / INITIAL) * 100 : ((bal - INITIAL) / INITIAL) * 100;
}

// S3: ADX Trend Strength + SMA
function stratADX(data) {
    const sma20 = SMA(data, 20);
    const adx = ADX(data, 14);
    let bal = INITIAL, pos = null;
    for (let i = 1; i < data.length; i++) {
        if (!sma20[i] || !adx[i]) continue;
        if (pos) {
            if (data[i].low <= pos.entry * 0.90) { bal += pos.qty * pos.entry * 0.90; pos = null; continue; }
            if (data[i].high >= pos.entry * 1.20) { bal += pos.qty * pos.entry * 1.20; pos = null; continue; }
        }
        // Strong trend (ADX > 25) + price above SMA = buy
        const trendUp = adx[i] > 25 && data[i].close > sma20[i];
        const trendDown = adx[i] > 25 && data[i].close < sma20[i];
        if (trendUp && !pos) { pos = {qty: bal/data[i].close, entry: data[i].close}; bal = 0; }
        else if (trendDown && pos) { bal += pos.qty * data[i].close; pos = null; }
    }
    return pos ? ((pos.qty * data[data.length-1].close - INITIAL) / INITIAL) * 100 : ((bal - INITIAL) / INITIAL) * 100;
}

// S4: Donchian Breakout
function stratDonchian(data) {
    const dc = Donchian(data, 20);
    let bal = INITIAL, pos = null;
    for (let i = 1; i < data.length; i++) {
        if (!dc.upper[i]) continue;
        if (pos) {
            if (data[i].low <= pos.entry * 0.90) { bal += pos.qty * pos.entry * 0.90; pos = null; continue; }
            if (data[i].high >= pos.entry * 1.20) { bal += pos.qty * pos.entry * 1.20; pos = null; continue; }
        }
        // Breakout above upper band = buy, below lower = sell
        const breakUp = data[i-1].close <= dc.upper[i-1] && data[i].close > dc.upper[i];
        const breakDown = data[i-1].close >= dc.lower[i-1] && data[i].close < dc.lower[i];
        if (breakUp && !pos) { pos = {qty: bal/data[i].close, entry: data[i].close}; bal = 0; }
        else if (breakDown && pos) { bal += pos.qty * data[i].close; pos = null; }
    }
    return pos ? ((pos.qty * data[data.length-1].close - INITIAL) / INITIAL) * 100 : ((bal - INITIAL) / INITIAL) * 100;
}

// S5: Keltner Channel
function stratKeltner(data) {
    const kc = Keltner(data, 20);
    let bal = INITIAL, pos = null;
    for (let i = 1; i < data.length; i++) {
        if (!kc.upper[i]) continue;
        if (pos) {
            if (data[i].low <= pos.entry * 0.90) { bal += pos.qty * pos.entry * 0.90; pos = null; continue; }
            if (data[i].high >= pos.entry * 1.20) { bal += pos.qty * pos.entry * 1.20; pos = null; continue; }
        }
        // Buy at lower band, sell at upper
        const buy = data[i-1].close >= kc.lower[i-1] && data[i].close < kc.lower[i];
        const sell = data[i-1].close <= kc.upper[i-1] && data[i].close > kc.upper[i];
        if (buy && !pos) { pos = {qty: bal/data[i].close, entry: data[i].close}; bal = 0; }
        else if (sell && pos) { bal += pos.qty * data[i].close; pos = null; }
    }
    return pos ? ((pos.qty * data[data.length-1].close - INITIAL) / INITIAL) * 100 : ((bal - INITIAL) / INITIAL) * 100;
}

// S6: Dual EMA Cross (like SMA but faster)
function stratDualEMA(data) {
    const ema10 = EMA(data, 10);
    const ema30 = EMA(data, 30);
    let bal = INITIAL, pos = null;
    for (let i = 1; i < data.length; i++) {
        if (!ema10[i]) continue;
        if (pos) {
            if (data[i].low <= pos.entry * 0.90) { bal += pos.qty * pos.entry * 0.90; pos = null; continue; }
            if (data[i].high >= pos.entry * 1.20) { bal += pos.qty * pos.entry * 1.20; pos = null; continue; }
        }
        const crossUp = ema10[i-1] <= ema30[i-1] && ema10[i] > ema30[i];
        const crossDown = ema10[i-1] >= ema30[i-1] && ema10[i] < ema30[i];
        if (crossUp && !pos) { pos = {qty: bal/data[i].close, entry: data[i].close}; bal = 0; }
        else if (crossDown && pos) { bal += pos.qty * data[i].close; pos = null; }
    }
    return pos ? ((pos.qty * data[data.length-1].close - INITIAL) / INITIAL) * 100 : ((bal - INITIAL) / INITIAL) * 100;
}

// S7: Volume Spike + SMA
function stratVolumeSMA(data) {
    const sma20 = SMA(data, 20);
    const volSMA = [];
    for (let i = 0; i < data.length; i++) {
        if (i < 19) { volSMA.push(null); continue; }
        let s = 0; for (let j = 0; j < 20; j++) s += data[i-j].volume;
        volSMA.push(s / 20);
    }
    let bal = INITIAL, pos = null;
    for (let i = 1; i < data.length; i++) {
        if (!sma20[i] || !volSMA[i]) continue;
        if (pos) {
            if (data[i].low <= pos.entry * 0.90) { bal += pos.qty * pos.entry * 0.90; pos = null; continue; }
            if (data[i].high >= pos.entry * 1.20) { bal += pos.qty * pos.entry * 1.20; pos = null; continue; }
        }
        const volSpike = data[i].volume > volSMA[i] * 1.5;
        const aboveSMA = data[i].close > sma20[i];
        if (volSpike && aboveSMA && !pos) { pos = {qty: bal/data[i].close, entry: data[i].close}; bal = 0; }
        else if (!aboveSMA && pos) { bal += pos.qty * data[i].close; pos = null; }
    }
    return pos ? ((pos.qty * data[data.length-1].close - INITIAL) / INITIAL) * 100 : ((bal - INITIAL) / INITIAL) * 100;
}

(async () => {
    console.log(`🎨 CREATIVE STRATEGY LAB\n`);
    const results = [];
    
    const strategies = [
        { name: "VWAP Cross", fn: stratVWAP },
        { name: "Stochastic", fn: stratStochastic },
        { name: "ADX+SMA", fn: stratADX },
        { name: "Donchian", fn: stratDonchian },
        { name: "Keltner", fn: stratKeltner },
        { name: "Dual EMA", fn: stratDualEMA },
        { name: "Vol+ SMA", fn: stratVolumeSMA },
    ];
    
    for (const coin of COINS) {
        process.stdout.write(`${coin}: `);
        const data = await fetch(coin);
        if (!data) { console.log('❌'); continue; }
        
        for (const s of strategies) {
            const ret = s.fn(data);
            results.push({ coin, strat: s.name, ret });
            const e = ret > 0 ? '🟢' : '🔴';
            process.stdout.write(`${e}${ret.toFixed(0)}% `);
        }
        console.log('');
    }
    
    const byStrat = {};
    for (const r of results) {
        if (!byStrat[r.strat]) byStrat[r.strat] = [];
        byStrat[r.strat].push(r.ret);
    }
    
    console.log('\n📊 AVERAGE:');
    const avgs = [];
    for (const [strat, rets] of Object.entries(byStrat)) {
        const avg = rets.reduce((a,b) => a+b, 0) / rets.length;
        avgs.push({ strat, avg });
        console.log(`   ${strat}: ${avg > 0 ? '🟢' : '🔴'}${avg.toFixed(1)}%`);
    }
    
    avgs.sort((a,b) => b.avg - a.avg);
    console.log('\n🏆 RANKING:');
    avgs.forEach((a,i) => console.log(`   ${i+1}. ${a.strat}: ${a.avg.toFixed(1)}%`));
    
    console.log('\n🏆 BEST: ' + avgs[0].strat + ' with ' + avgs[0].avg.toFixed(1) + '%');
})();
