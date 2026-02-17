// Daily Timeframe Trading Monitor - PSAR Strategy
// BEST STRATEGY FOUND!

const https = require('https');
const fs = require('fs');

const COIN = 'ETH';
const INITIAL_CAPITAL = 10000;
const STOP_LOSS_PCT = 20;
const TAKE_PROFIT_PCT = 40;
const AF = 0.09; // Acceleration factor

console.log('⏰', new Date().toISOString());

// Fetch DAILY price data
function fetchData() {
    return new Promise((resolve, reject) => {
        https.get(`https://min-api.cryptocompare.com/data/v2/histoday?fsym=${COIN}&tsym=USD&limit=100`, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve(json.Data.Data.reverse().map(d => ({
                        high: d.high,
                        low: d.low,
                        close: d.close
                    })));
                } catch(e) { reject(e); }
            });
        }).on('error', reject);
    });
}

// Calculate Parabolic SAR
function calculatePSAR(data) {
    let sar = data[0].low;
    let ep = data[0].high;
    let trend = 1;
    let af = AF;
    
    const results = [];
    
    for (let i = 1; i < data.length; i++) {
        const oldSar = sar;
        sar = sar + af * (ep - sar);
        
        if (trend === 1) {
            if (data[i].low < sar) {
                trend = -1;
                sar = ep;
                ep = data[i].low;
                af = AF;
            } else {
                if (data[i].high > ep) {
                    ep = data[i].high;
                    af = Math.min(af + AF, 0.2);
                }
            }
        } else {
            if (data[i].high > sar) {
                trend = 1;
                sar = ep;
                ep = data[i].high;
                af = AF;
            } else {
                if (data[i].low < ep) {
                    ep = data[i].low;
                    af = Math.min(af + AF, 0.2);
                }
            }
        }
        
        results.push({ sar, trend, ep });
    }
    
    return results;
}

// Load state
let state = { position: null, entryPrice: null };
try {
    const saved = JSON.parse(fs.readFileSync('paper_state_daily.json', 'utf8'));
    Object.assign(state, saved);
} catch(e) {}

async function main() {
    const data = await fetchData();
    const psar = calculatePSAR(data);
    
    const current = data[data.length - 1];
    const currentPSAR = psar[psar.length - 1];
    const prevPSAR = psar[psar.length - 2];
    
    console.log(`\n📊 ${COIN}/USD (DAILY):`);
    console.log(`   Price:     \$${current.close.toFixed(2)}`);
    console.log(`   PSAR:      \$${currentPSAR.sar.toFixed(2)}`);
    console.log(`   Trend:     ${currentPSAR.trend === 1 ? '🟢 BULL' : '🔴 BEAR'}`);
    
    // Signal detection
    const prevTrend = prevPSAR.trend;
    const currentTrend = currentPSAR.trend;
    
    // Check stop loss / take profit
    if (state.position) {
        const sl = state.entryPrice * (1 - STOP_LOSS_PCT / 100);
        const tp = state.entryPrice * (1 + TAKE_PROFIT_PCT / 100);
        
        if (current.low <= sl) {
            console.log(`\n🛑 STOP LOSS TRIGGERED at \$${sl.toFixed(2)}`);
            state = { position: null, entryPrice: null };
        } else if (current.high >= tp) {
            console.log(`\n🎯 TAKE PROFIT TRIGGERED at \$${tp.toFixed(2)}`);
            state = { position: null, entryPrice: null };
        }
    }
    
    // Entry signal: trend changes from -1 to 1 (bull trend starts)
    if (prevTrend === -1 && currentTrend === 1 && !state.position) {
        console.log(`\n🚀 SIGNAL: BUY at \$${current.close.toFixed(2)}`);
        state.position = true;
        state.entryPrice = current.close;
    }
    // Exit signal: trend changes from 1 to -1
    else if (prevTrend === 1 && currentTrend === -1 && state.position) {
        console.log(`\n📉 SIGNAL: SELL at \$${current.close.toFixed(2)}`);
        state = { position: null, entryPrice: null };
    } else {
        console.log(`\n🎯 SIGNAL: ${state.position ? 'HOLD' : 'WAIT'}`);
    }
    
    // Save state
    fs.writeFileSync('paper_state_daily.json', JSON.stringify(state));
}

main().catch(console.error);
