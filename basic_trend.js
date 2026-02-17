/**
 * Crypto Trading Bot - Basic Trend Following (SMA Crossover)
 * Using CryptoCompare API (free, no API key needed)
 */

const https = require('https');

// === CONFIG ===
const COIN = "BTC";
const CURRENCY = "USD";
const HOURS = 2000;  // Max allowed by CryptoCompare (~83 days)
const SMA_FAST = 50;
const SMA_SLOW = 200;

// === DATA FETCHER ===
function fetchCryptoCompareData(coin, currency, hours) {
    return new Promise((resolve, reject) => {
        const url = `https://min-api.cryptocompare.com/data/v2/histohour?fsym=${coin}&tsym=${currency}&limit=${hours}`;
        
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (!json.Response || json.Response !== 'Success') {
                        reject(new Error(json.Message || 'API Error'));
                        return;
                    }
                    // Format: { Data: { Data: [{time, high, low, open, close, volumefrom, volumeto}, ...] } }
                    const candles = json.Data.Data.map(d => ({
                        time: new Date(d.time * 1000),
                        open: d.open,
                        high: d.high,
                        low: d.low,
                        close: d.close,
                        volume: d.volumefrom
                    }));
                    // Reverse to chronological order
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

function generateSignals(candles) {
    const smaFast = calculateSMA(candles, SMA_FAST);
    const smaSlow = calculateSMA(candles, SMA_SLOW);
    
    const signals = candles.map((c, i) => ({
        time: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
        sma_fast: smaFast[i],
        sma_slow: smaSlow[i],
        signal: 0,
        signal_change: 0
    }));
    
    // Generate signals
    for (let i = 1; i < signals.length; i++) {
        if (signals[i].sma_fast !== null && signals[i].sma_slow !== null) {
            const prevFast = signals[i-1].sma_fast;
            const prevSlow = signals[i-1].sma_slow;
            const currFast = signals[i].sma_fast;
            const currSlow = signals[i].sma_slow;
            
            // Buy: fast crosses above slow
            if ((prevFast <= prevSlow) && (currFast > currSlow)) {
                signals[i].signal = 1;
                signals[i].signal_change = 2;
            }
            // Sell: fast crosses below slow
            else if ((prevFast >= prevSlow) && (currFast < currSlow)) {
                signals[i].signal = -1;
                signals[i].signal_change = -2;
            }
        }
    }
    
    return signals;
}

// === BACKTESTER ===
function backtest(signals, initialBalance = 10000) {
    // Remove null SMA values
    const validSignals = signals.filter(s => s.sma_fast !== null);
    
    let balance = initialBalance;
    let position = 0;
    let entryPrice = 0;
    let qty = 0;
    const trades = [];
    
    for (const row of validSignals) {
        if (row.signal_change === 2 && position === 0) {
            // BUY
            qty = balance / row.close;
            balance = 0;
            position = 1;
            entryPrice = row.close;
            trades.push({ type: "BUY", price: row.close, time: row.time.toISOString().split('T')[0], qty: qty.toFixed(6) });
            
        } else if (row.signal_change === -2 && position === 1) {
            // SELL
            const sellValue = qty * row.close;
            const pnl = sellValue - (qty * entryPrice);
            balance = sellValue;
            position = 0;
            trades.push({ type: "SELL", price: row.close, time: row.time.toISOString().split('T')[0], pnl: pnl.toFixed(2) });
        }
    }
    
    // Close final position if still open
    let finalValue = balance;
    if (position === 1 && validSignals.length > 0) {
        const lastPrice = validSignals[validSignals.length - 1].close;
        finalValue = qty * lastPrice;
    }
    
    const totalReturn = ((finalValue - initialBalance) / initialBalance) * 100;
    
    return {
        initialBalance,
        finalValue: finalValue.toFixed(2),
        totalReturnPct: totalReturn.toFixed(2),
        numTrades: trades.length,
        trades: trades.slice(-10)
    };
}

// === MAIN ===
async function main() {
    console.log(`📈 Fetching ${COIN}/${CURRENCY} data (last ${Math.round(HOURS/24)} days)...`);
    
    try {
        const candles = await fetchCryptoCompareData(COIN, CURRENCY, HOURS);
        console.log(`   Got ${candles.length} hourly candles`);
        console.log(`   Date range: ${candles[0].time.toISOString().split('T')[0]} to ${candles[candles.length-1].time.toISOString().split('T')[0]}`);
        
        console.log(`\n📊 Calculating SMA(${SMA_FAST}) / SMA(${SMA_SLOW})...`);
        const signals = generateSignals(candles);
        
        console.log(`🔄 Running backtest...`);
        const results = backtest(signals);
        
        console.log(`\n╔════════════════════════════════════════╗`);
        console.log(`║        BACKTEST RESULTS                ║`);
        console.log(`╠════════════════════════════════════════╣`);
        console.log(`║ Coin: ${COIN}/${CURRENCY}`.padEnd(32) + `║`);
        console.log(`║ Strategy: SMA(${SMA_FAST})/SMA(${SMA_SLOW}) Crossover`.padEnd(32) + `║`);
        console.log(`║ Period: ${Math.round(HOURS/24)} days`.padEnd(32) + `║`);
        console.log(`╠════════════════════════════════════════╣`);
        console.log(`║ Initial Balance: $${results.initialBalance.toLocaleString().padEnd(19)}║`);
        console.log(`║ Final Value:      $${parseFloat(results.finalValue).toLocaleString().padEnd(19)}║`);
        console.log(`║ Total Return:     ${results.totalReturnPct}%`.padEnd(22) + `║`);
        console.log(`║ Total Trades:     ${results.numTrades}`.padEnd(22) + `║`);
        console.log(`╚════════════════════════════════════════╝`);
        
        if (results.trades.length > 0) {
            console.log(`\n=== LAST ${results.trades.length} TRADES ===`);
            for (const t of results.trades) {
                const pnlStr = t.pnl ? ` | PnL: $${t.pnl}` : '';
                console.log(`  ${t.type} @ $${t.price.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})} | ${t.time}${pnlStr}`);
            }
        }
    } catch (err) {
        console.error("Error:", err.message);
    }
}

main();
