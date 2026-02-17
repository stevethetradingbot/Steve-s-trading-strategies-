/**
 * LIVE PAPER TRADING MONITOR
 * Run hourly via cron
 * 
 * Best Settings: ETH | SMA(10/30) | SL: 10% | TP: 20%
 */

const https = require('https');
const fs = require('fs');

const COIN = "ETH";
const CURRENCY = "USD";
const SMA_FAST = 24;
const SMA_SLOW = 56;
const STOP_LOSS_PCT = 10;
const TAKE_PROFIT_PCT = 24;

// State file for position tracking
const STATE_FILE = '/home/matthewkania.mk/.openclaw/workspace/trading_bot/paper_state.json';

function fetchData(limit = 100) {
    return new Promise((resolve) => {
        const url = `https://min-api.cryptocompare.com/data/v2/histohour?fsym=${COIN}&tsym=${CURRENCY}&limit=${limit}`;
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (!json.Response || json.Response !== 'Success') { resolve(null); return; }
                    const candles = json.Data.Data.map(d => ({
                        time: new Date(d.time * 1000),
                        close: d.close, high: d.high, low: d.low
                    })).reverse();
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
        else { let sum = 0; for (let j = 0; j < period; j++) sum += data[i - j].close; sma.push(sum / period); }
    }
    return sma;
}

function getRSI(data, period = 14) {
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
        const rs = losses === 0 ? 100 : gains / losses;
        rsi.push(100 - (100 / (1 + rs)));
    }
    return rsi;
}

async function analyze() {
    console.log(`\n⏰ ${new Date().toISOString()}`);
    
    const candles = await fetchData(100);
    if (!candles) { console.log("❌ Failed to fetch data"); return; }
    
    const smaFast = calculateSMA(candles, SMA_FAST);
    const smaSlow = calculateSMA(candles, SMA_SLOW);
    const rsi = getRSI(candles, 14);
    
    const current = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    
    const price = current.close;
    const fastSMA = smaFast[smaFast.length - 1];
    const slowSMA = smaSlow[smaSlow.length - 1];
    const rsiVal = rsi[rsi.length - 1];
    
    const prevFast = smaFast[smaFast.length - 2];
    const prevSlow = smaSlow[smaSlow.length - 2];
    
    console.log(`\n📊 ${COIN}/USD:`);
    console.log(`   Price:     $${price.toLocaleString()}`);
    console.log(`   SMA(${SMA_FAST}):   $${fastSMA.toFixed(2)}`);
    console.log(`   SMA(${SMA_SLOW}):   $${slowSMA.toFixed(2)}`);
    console.log(`   RSI(14):   ${rsiVal.toFixed(1)}`);
    
    // Load state
    let state = { position: null, entryPrice: null, entryTime: null };
    try {
        if (fs.existsSync(STATE_FILE)) {
            state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        }
    } catch (e) {}
    
    // Check for signals
    let signal = null;
    let reason = "";
    
    // Golden Cross (BUY)
    if (prevFast <= prevSlow && fastSMA > slowSMA && rsiVal < 75) {
        signal = "BUY";
        reason = "Golden Cross + RSI OK";
    }
    
    // Death Cross (SELL)
    if (prevFast >= prevSlow && fastSMA < slowSMA && rsiVal > 25) {
        signal = "SELL";
        reason = "Death Cross + RSI OK";
    }
    
    // Check stop loss / take profit if in position
    if (state.position === 'long') {
        const changePct = ((price - state.entryPrice) / state.entryPrice) * 100;
        const slPrice = state.entryPrice * (1 - STOP_LOSS_PCT / 100);
        const tpPrice = state.entryPrice * (1 + TAKE_PROFIT_PCT / 100);
        
        console.log(`\n📋 POSITION: LONG`);
        console.log(`   Entry:    $${state.entryPrice.toFixed(2)}`);
        console.log(`   Current:  $${price.toFixed(2)} (${changePct.toFixed(2)}%)`);
        console.log(`   SL:       $${slPrice.toFixed(2)} (-${STOP_LOSS_PCT}%)`);
        console.log(`   TP:       $${tpPrice.toFixed(2)} (+${TAKE_PROFIT_PCT}%)`);
        
        if (price <= slPrice) {
            signal = "STOP_LOSS";
            reason = `Price hit stop loss ($${slPrice.toFixed(2)})`;
        } else if (price >= tpPrice) {
            signal = "TAKE_PROFIT";
            reason = `Price hit take profit ($${tpPrice.toFixed(2)})`;
        }
    }
    
    // Output signal
    console.log(`\n🎯 SIGNAL: ${signal || 'HOLD'}`);
    if (reason) console.log(`   Reason: ${reason}`);
    
    // Update state
    if (signal === "BUY" && state.position !== 'long') {
        state = { position: 'long', entryPrice: price, entryTime: new Date().toISOString() };
        console.log(`\n✅ ENTERED LONG at $${price.toFixed(2)}`);
    } else if ((signal === "SELL" || signal === "STOP_LOSS" || signal === "TAKE_PROFIT") && state.position === 'long') {
        const pnl = price - state.entryPrice;
        console.log(`\n❌ EXITED ${signal} at $${price.toFixed(2)} | PnL: $${pnl.toFixed(2)}`);
        state = { position: null, entryPrice: null, entryTime: null };
    }
    
    // Save state
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    
    // Return status for cron notification
    return { signal, price, rsi: rsiVal.toFixed(1), reason, position: state.position };
}

analyze().then(result => {
    if (result && result.signal && result.signal !== "HOLD") {
        console.log(`\n📨 ALERT: ${result.signal} signal detected!`);
    }
}).catch(console.error);
