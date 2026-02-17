/**
 * Crypto Trading Bot - Ultimate Version
 * Tests multiple SMA combos + Stop Loss + Paper Trade Ready
 */

const https = require('https');

// === CONFIG ===
const TEST_COINS = ["ETH", "SOL", "BTC"];
const CURRENCY = "USD";
const HOURS = 2000;

// SMA combinations to test
const SMA_COMBOS = [
    { fast: 10, slow: 30, name: "10/30" },
    { fast: 20, slow: 50, name: "20/50" },
    { fast: 50, slow: 200, name: "50/200" },
];

// Stop loss config
const STOP_LOSS_PCT = 5;  // 5% stop loss
const TAKE_PROFIT_PCT = 15;  // 15% take profit

// === DATA FETCHER ===
function fetchCryptoCompareData(coin, currency, hours) {
    return new Promise((resolve) => {
        const url = `https://min-api.cryptocompare.com/data/v2/histohour?fsym=${coin}&tsym=${currency}&limit=${hours}`;
        
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (!json.Response || json.Response !== 'Success') {
                        resolve(null);
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
                    resolve(null);
                }
            });
        }).on('error', () => resolve(null));
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

function calculateRSI(data, period) {
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

// === BACKTESTER WITH STOP LOSS ===
function backtestWithRiskMgmt(candles, smaFast, smaSlow) {
    const rsi = calculateRSI(candles, 14);
    
    const signals = candles.map((c, i) => ({
        time: c.time,
        close: c.close,
        high: c.high,
        low: c.low,
        sma_fast: smaFast[i],
        sma_slow: smaSlow[i],
        rsi: rsi[i],
        signal: 0,
        exit_reason: null
    }));
    
    // Generate signals
    for (let i = 1; i < signals.length; i++) {
        const curr = signals[i];
        const prev = signals[i-1];
        
        if (curr.sma_fast === null || curr.rsi === null) continue;
        
        // Buy
        if (prev.sma_fast <= prev.sma_slow && curr.sma_fast > curr.sma_slow && curr.rsi < 75) {
            curr.signal = 1;
        }
        // Sell
        if (prev.sma_fast >= prev.sma_slow && curr.sma_fast < curr.sma_slow && curr.rsi > 25) {
            curr.signal = -1;
        }
    }
    
    // Run backtest with stop loss & take profit
    const validSignals = signals.filter(s => s.sma_fast !== null);
    let balance = 10000;
    let position = 0;
    let entryPrice = 0;
    let qty = 0;
    const trades = [];
    let stopLossHits = 0;
    let takeProfitHits = 0;
    let crossoverSells = 0;
    
    for (let i = 0; i < validSignals.length; i++) {
        const row = validSignals[i];
        
        if (position === 1) {
            // Check stop loss
            const pctChange = ((row.close - entryPrice) / entryPrice) * 100;
            
            // Stop loss triggered (use low for the hour to simulate real stop)
            if (row.low <= entryPrice * (1 - STOP_LOSS_PCT / 100)) {
                const slPrice = entryPrice * (1 - STOP_LOSS_PCT / 100);
                const pnl = (slPrice - entryPrice) * qty;
                balance = qty * slPrice;
                position = 0;
                stopLossHits++;
                trades.push({ 
                    type: "STOP_LOSS", 
                    price: slPrice.toFixed(2), 
                    time: row.time.toISOString().split('T')[0], 
                    pnl: pnl.toFixed(2) 
                });
                continue;
            }
            
            // Take profit triggered
            if (row.high >= entryPrice * (1 + TAKE_PROFIT_PCT / 100)) {
                const tpPrice = entryPrice * (1 + TAKE_PROFIT_PCT / 100);
                const pnl = (tpPrice - entryPrice) * qty;
                balance = qty * tpPrice;
                position = 0;
                takeProfitHits++;
                trades.push({ 
                    type: "TAKE_PROFIT", 
                    price: tpPrice.toFixed(2), 
                    time: row.time.toISOString().split('T')[0], 
                    pnl: pnl.toFixed(2) 
                });
                continue;
            }
        }
        
        // Normal signals
        if (row.signal === 1 && position === 0) {
            qty = balance / row.close;
            balance = 0;
            position = 1;
            entryPrice = row.close;
            trades.push({ type: "BUY", price: row.close, time: row.time.toISOString().split('T')[0] });
            
        } else if (row.signal === -1 && position === 1) {
            const pnl = (row.close - entryPrice) * qty;
            balance = qty * row.close;
            position = 0;
            crossoverSells++;
            trades.push({ 
                type: "SELL", 
                price: row.close, 
                time: row.time.toISOString().split('T')[0], 
                pnl: pnl.toFixed(2) 
            });
        }
    }
    
    // Close position
    let finalValue = balance;
    if (position === 1) {
        finalValue = qty * validSignals[validSignals.length - 1].close;
    }
    
    const totalReturn = ((finalValue - 10000) / 10000) * 100;
    
    return {
        return: totalReturn.toFixed(2),
        finalValue: finalValue.toFixed(2),
        totalTrades: trades.length,
        stopLossHits,
        takeProfitHits,
        crossoverSells,
        trades: trades.slice(-20)
    };
}

// === MAIN ===
async function main() {
    console.log(`╔════════════════════════════════════════════════════╗`);
    console.log(`║      TRADING BOT - MULTI-STRATEGY TEST             ║`);
    console.log(`╠════════════════════════════════════════════════════╣`);
    console.log(`║ Risk Management:`.padEnd(50) + `║`);
    console.log(`║   Stop Loss: ${STOP_LOSS_PCT}%`.padEnd(47) + `║`);
    console.log(`║   Take Profit: ${TAKE_PROFIT_PCT}%`.padEnd(44) + `║`);
    console.log(`╚════════════════════════════════════════════════════╝\n`);
    
    const allResults = [];
    
    for (const coin of TEST_COINS) {
        console.log(`\n🪙 Testing ${coin}:`);
        
        const candles = await fetchCryptoCompareData(coin, CURRENCY, HOURS);
        if (!candles) {
            console.log(`   ❌ Failed to fetch`);
            continue;
        }
        
        for (const combo of SMA_COMBOS) {
            process.stdout.write(`   SMA ${combo.name}... `);
            
            const smaFast = calculateSMA(candles, combo.fast);
            const smaSlow = calculateSMA(candles, combo.slow);
            
            const result = backtestWithRiskMgmt(candles, smaFast, smaSlow);
            
            allResults.push({
                coin,
                combo: combo.name,
                return: parseFloat(result.return),
                trades: result.totalTrades,
                slHits: result.stopLossHits,
                tpHits: result.takeProfitHits,
                finalValue: result.finalValue
            });
            
            const emoji = result.return > 0 ? '🟢' : '🔴';
            console.log(`${emoji} ${result.return}% | SL: ${result.stopLossHits} | TP: ${result.takeProfitHits}`);
        }
    }
    
    // Sort by return
    allResults.sort((a, b) => b.return - a.return);
    
    console.log(`\n`);
    console.log(`╔════════════════════════════════════════════════════╗`);
    console.log(`║         FINAL RANKINGS (Top 5)                    ║`);
    console.log(`╠════════════════════════════════════════════════════╣`);
    
    for (let i = 0; i < Math.min(5, allResults.length); i++) {
        const r = allResults[i];
        const emoji = r.return > 0 ? '🟢' : '🔴';
        console.log(`║ ${i+1}. ${emoji} ${r.coin} SMA(${r.combo})`.padEnd(45) + `║`);
        console.log(`║    Return: ${r.return > 0 ? '+' : ''}${r.return}% | Trades: ${r.trades}`.padEnd(45) + `║`);
        console.log(`║    SL: ${r.slHits} | TP: ${r.tpHits} | Final: $${parseFloat(r.finalValue).toLocaleString()}`.padEnd(45) + `║`);
    }
    console.log(`╚════════════════════════════════════════════════════╝`);
    
    const best = allResults[0];
    console.log(`\n🏆 BEST: ${best.coin} with SMA(${best.combo}) = +${best.return}%`);
    console.log(`\n📋 RECOMMENDED SETTINGS FOR PAPER TRADING:`);
    console.log(`   Coin: ${best.coin}`);
    console.log(`   SMA: ${best.combo}`);
    console.log(`   Stop Loss: ${STOP_LOSS_PCT}%`);
    console.log(`   Take Profit: ${TAKE_PROFIT_PCT}%`);
}

main();
