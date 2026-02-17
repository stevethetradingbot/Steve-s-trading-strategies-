/**
 * LIVE PAPER TRADING BOT - ETH
 * Monitors and generates signals - ready for execution
 * 
 * CONFIG: ETH | SMA(10/30) | Stop Loss: 5% | Take Profit: 15%
 */

const https = require('https');

// === CONFIG ===
const COIN = "ETH";
const CURRENCY = "USD";
const SMA_FAST = 10;
const SMA_SLOW = 30;
const STOP_LOSS_PCT = 5;
const TAKE_PROFIT_PCT = 15;

// === DATA FETCHER ===
function fetchLatestData(limit = 50) {
    return new Promise((resolve, reject) => {
        const url = `https://min-api.cryptocompare.com/data/v2/histohour?fsym=${COIN}&tsym=${CURRENCY}&limit=${limit}`;
        
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (!json.Response || json.Response !== 'Success') {
                        reject(new Error('API Error'));
                        return;
                    }
                    const candles = json.Data.Data.map(d => ({
                        time: new Date(d.time * 1000),
                        open: d.open,
                        high: d.high,
                        low: d.low,
                        close: d.close,
                        volume: d.volumefrom
                    }));
                    candles.reverse();
                    resolve(candles);
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

// === INDICATORS ===
function calculateSMA(data, period) {
    const sma = [];
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
            sma.push(null);
        } else {
            let sum = 0;
            for (let j = 0; j < period; j++) {
                sum += data[i - j].close;
            }
            sma.push(sum / period);
        }
    }
    return sma;
}

function calculateRSI(data, period = 14) {
    const rsi = [];
    let gains = 0;
    let losses = 0;
    
    for (let i = 0; i < data.length; i++) {
        if (i < period) {
            rsi.push(null);
            continue;
        }
        
        const change = data[i].close - data[i-1].close;
        
        if (i === period) {
            for (let j = 1; j <= period; j++) {
                const c = data[j].close - data[j-1].close;
                if (c > 0) gains += c;
                else losses += Math.abs(c);
            }
            gains /= period;
            losses /= period;
        } else {
            if (change > 0) {
                gains = (gains * (period - 1) + change) / period;
                losses = (losses * (period - 1)) / period;
            } else {
                losses = (losses * (period - 1) + Math.abs(change)) / period;
                gains = (gains * (period - 1)) / period;
            }
        }
        
        const rs = losses === 0 ? 100 : gains / losses;
        rsi.push(100 - (100 / (1 + rs)));
    }
    return rsi;
}

// === ANALYZER ===
async function analyze() {
    console.log(`\n⏰ ${new Date().toISOString()}`);
    console.log(`🔄 Fetching latest ${COIN} data...`);
    
    const candles = await fetchLatestData(100);
    const prices = candles.map(c => c.close);
    
    const smaFast = calculateSMA(candles, SMA_FAST);
    const smaSlow = calculateSMA(candles, SMA_SLOW);
    const rsi = calculateRSI(candles, 14);
    
    const currentPrice = prices[prices.length - 1];
    const currentSMAFast = smaFast[smaFast.length - 1];
    const currentSMASlow = smaSlow[smaSlow.length - 1];
    const currentRSI = rsi[rsi.length - 1];
    const prevSMAFast = smaFast[smaFast.length - 2];
    const prevSMASlow = smaSlow[smaSlow.length - 2];
    
    console.log(`\n📊 CURRENT STATUS:`);
    console.log(`   Price:     $${currentPrice.toLocaleString()}`);
    console.log(`   SMA(${SMA_FAST}):   $${currentSMAFast.toFixed(2)}`);
    console.log(`   SMA(${SMA_SLOW}):   $${currentSMASlow.toFixed(2)}`);
    console.log(`   RSI(14):   ${currentRSI.toFixed(1)}`);
    
    // Determine trend
    let trend = "NEUTRAL";
    if (currentSMAFast > currentSMASlow) trend = "🟢 BULLISH";
    else if (currentSMAFast < currentSMASlow) trend = "🔴 BEARISH";
    
    console.log(`   Trend:     ${trend}`);
    
    // Check for crossover
    let signal = null;
    let reason = "";
    
    // Golden Cross (BUY)
    if (prevSMAFast <= prevSMASlow && currentSMAFast > currentSMASlow) {
        if (currentRSI < 75) {
            signal = "BUY";
            reason = `Golden Cross (SMA ${SMA_FAST} crossed above ${SMA_SLOW}) + RSI OK (${currentRSI.toFixed(1)} < 75)`;
        }
    }
    
    // Death Cross (SELL)
    if (prevSMAFast >= prevSMASlow && currentSMAFast < currentSMASlow) {
        if (currentRSI > 25) {
            signal = "SELL";
            reason = `Death Cross (SMA ${SMA_FAST} crossed below ${SMA_SLOW}) + RSI OK (${currentRSI.toFixed(1)} > 25)`;
        }
    }
    
    if (signal) {
        console.log(`\n🎯 SIGNAL: ${signal}!`);
        console.log(`   Reason: ${reason}`);
        console.log(`\n   ⚠️  CONFIRM TRADE BEFORE EXECUTING!`);
        console.log(`   Stop Loss: ${STOP_LOSS_PCT}% ($${(currentPrice * (1 - STOP_LOSS_PCT/100)).toFixed(2)})`);
        console.log(`   Take Profit: ${TAKE_PROFIT_PCT}% ($${(currentPrice * (1 + TAKE_PROFIT_PCT/100)).toFixed(2)})`);
    } else {
        console.log(`\n💤 No signal - holding position`);
    }
    
    return { signal, currentPrice, currentRSI, reason };
}

// === PAPER TRADING STATE ===
let paperPosition = null;  // { entryPrice, entryTime, qty }

// Run analysis
analyze().then(result => {
    if (result.signal === "BUY" && !paperPosition) {
        console.log(`\n📝 PAPER TRADE: Would BUY at $${result.currentPrice.toLocaleString()}`);
    } else if (result.signal === "SELL" && paperPosition) {
        console.log(`\n📝 PAPER TRADE: Would SELL at $${result.currentPrice.toLocaleString()}`);
    }
}).catch(err => {
    console.error("Error:", err.message);
});

// For continuous monitoring, would use setInterval in production
// For now, this is a one-time check
