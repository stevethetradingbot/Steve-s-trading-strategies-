/**
 * ADVANCED TRADING BOT v3 - FIXED
 * - Simplified indicators
 * - Fixed position sizing
 * - Better signal logic
 */

const https = require('https');

// === CONFIG ===
const COINS = ["ETH", "SOL", "BTC", "AVAX", "LINK", "ATOM"];
const CURRENCY = "USD";

// Risk management
const STOP_LOSS_PCT = 5;       // 5% stop loss
const TAKE_PROFIT_PCT = 15;    // 15% take profit

// Indicators
const SMA_FAST = 10;
const SMA_SLOW = 30;

// === DATA FETCHER ===
function fetchData(coin, hours = 2000) {
    return new Promise((resolve) => {
        const url = `https://min-api.cryptocompare.com/data/v2/histohour?fsym=${coin}&tsym=${CURRENCY}&limit=${hours}`;
        
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

// === SIMPLE BACKTESTER ===
function backtest(candles) {
    const smaFast = calculateSMA(candles, SMA_FAST);
    const smaSlow = calculateSMA(candles, SMA_SLOW);
    const rsi = calculateRSI(candles, 14);
    
    const signals = candles.map((c, i) => ({
        time: c.time,
        close: c.close,
        high: c.high,
        low: c.low,
        sma_fast: smaFast[i],
        sma_slow: smaSlow[i],
        rsi: rsi[i],
        signal: 0
    }));
    
    // Generate signals - Simple SMA crossover with RSI filter
    for (let i = 1; i < signals.length; i++) {
        const curr = signals[i];
        const prev = signals[i-1];
        
        if (curr.sma_fast === null || curr.rsi === null) continue;
        
        // BUY: Fast crosses above slow + RSI not overbought
        if (prev.sma_fast <= prev.sma_slow && curr.sma_fast > curr.sma_slow && curr.rsi < 75) {
            curr.signal = 1;
        }
        
        // SELL: Fast crosses below slow + RSI not oversold
        if (prev.sma_fast >= prev.sma_slow && curr.sma_fast < curr.sma_slow && curr.rsi > 25) {
            curr.signal = -1;
        }
    }
    
    // Backtest
    const validSignals = signals.filter(s => s.sma_fast !== null);
    let balance = 10000;
    let position = 0;
    let entryPrice = 0;
    let qty = 0;
    const trades = [];
    let wins = 0;
    let losses = 0;
    
    for (let i = 0; i < validSignals.length; i++) {
        const row = validSignals[i];
        
        if (position === 1) {
            // Stop loss
            if (row.low <= entryPrice * (1 - STOP_LOSS_PCT / 100)) {
                const slPrice = entryPrice * (1 - STOP_LOSS_PCT / 100);
                const pnl = (slPrice - entryPrice) * qty;
                balance = qty * slPrice;
                position = 0;
                trades.push({ type: "STOP_LOSS", price: slPrice.toFixed(2), pnl: pnl.toFixed(2), time: row.time.toISOString().split('T')[0] });
                losses++;
                continue;
            }
            
            // Take profit
            if (row.high >= entryPrice * (1 + TAKE_PROFIT_PCT / 100)) {
                const tpPrice = entryPrice * (1 + TAKE_PROFIT_PCT / 100);
                const pnl = (tpPrice - entryPrice) * qty;
                balance = qty * tpPrice;
                position = 0;
                trades.push({ type: "TAKE_PROFIT", price: tpPrice.toFixed(2), pnl: pnl.toFixed(2), time: row.time.toISOString().split('T')[0] });
                wins++;
                continue;
            }
        }
        
        // Buy signal
        if (row.signal === 1 && position === 0) {
            qty = balance / row.close;
            balance = 0;
            position = 1;
            entryPrice = row.close;
            trades.push({ type: "BUY", price: row.close.toFixed(2), time: row.time.toISOString().split('T')[0] });
        }
        // Sell signal
        else if (row.signal === -1 && position === 1) {
            const pnl = (row.close - entryPrice) * qty;
            balance += qty * row.close;
            position = 0;
            trades.push({ type: "SELL", price: row.close.toFixed(2), pnl: pnl.toFixed(2), time: row.time.toISOString().split('T')[0] });
            if (pnl > 0) wins++;
            else losses++;
        }
    }
    
    // Close final position
    let finalValue = balance;
    if (position === 1) {
        finalValue = qty * validSignals[validSignals.length - 1].close;
    }
    
    const totalReturn = ((finalValue - 10000) / 10000) * 100;
    const winRate = (wins + losses) > 0 ? (wins / (wins + losses) * 100).toFixed(1) : 0;
    
    return {
        return: totalReturn.toFixed(2),
        finalValue: finalValue.toFixed(2),
        totalTrades: trades.length,
        wins,
        losses,
        winRate,
        trades: trades.slice(-15)
    };
}

// === MAIN ===
async function main() {
    console.log(`╔═══════════════════════════════════════════════════════╗`);
    console.log(`║        ADVANCED TRADING BOT v3 - FIXED                ║`);
    console.log(`║  SMA(${SMA_FAST})/SMA(${SMA_SLOW}) + RSI Filter + SL/TP           ║`);
    console.log(`╠═══════════════════════════════════════════════════════╣`);
    console.log(`║ Stop Loss: ${STOP_LOSS_PCT}% | Take Profit: ${TAKE_PROFIT_PCT}%`.padEnd(47) + `║`);
    console.log(`╚═══════════════════════════════════════════════════════╝\n`);
    
    const results = [];
    
    for (const coin of COINS) {
        process.stdout.write(`🪙 ${coin}... `);
        
        const candles = await fetchData(coin, 2000);
        if (!candles || candles.length < 100) {
            console.log(`❌`);
            continue;
        }
        
        const result = backtest(candles);
        
        results.push({
            coin,
            return: parseFloat(result.return),
            trades: result.totalTrades,
            wins: result.wins,
            losses: result.losses,
            winRate: result.winRate,
            finalValue: result.finalValue
        });
        
        const emoji = result.return > 0 ? '🟢' : '🔴';
        console.log(`${emoji} ${result.return}% | Win: ${result.winRate}% | Trades: ${result.totalTrades}`);
    }
    
    // Sort by return
    results.sort((a, b) => b.return - a.return);
    
    console.log(`\n`);
    console.log(`╔═══════════════════════════════════════════════════════╗`);
    console.log(`║              FINAL RANKINGS                          ║`);
    console.log(`╠═══════════════════════════════════════════════════════╣`);
    
    for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const emoji = r.return > 0 ? '🟢' : '🔴';
        console.log(`║ ${i+1}. ${emoji} ${r.coin.padEnd(6)} | Return: ${r.return > 0 ? '+' : ''}${r.return}%`.padEnd(48) + `║`);
        console.log(`║    Win Rate: ${r.winRate}% | Trades: ${r.trades} | Final: $${parseFloat(r.finalValue).toLocaleString()}`.padEnd(50) + `║`);
    }
    console.log(`╚═══════════════════════════════════════════════════════╝`);
    
    const best = results[0];
    console.log(`\n🏆 BEST: ${best.coin} with +${best.return}% return`);
    
    // Show sample trades for best coin
    const bestCandles = await fetchData(best.coin, 2000);
    const bestResult = backtest(bestCandles);
    console.log(`\n📊 Recent trades for ${best.coin}:`);
    for (const t of bestResult.trades) {
        const pnlStr = t.pnl ? ` | PnL: $${t.pnl}` : '';
        console.log(`   ${t.type} @ $${t.price} | ${t.time}${pnlStr}`);
    }
}

main();
