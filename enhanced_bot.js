/**
 * Crypto Trading Bot - Enhanced with RSI + Volume + SMA Crossover
 * Relaxed filters to actually generate trades
 */

const https = require('https');

// === CONFIG ===
const COINS = ["BTC", "ETH", "SOL", "XRP", "ADA", "DOGE"];
const CURRENCY = "USD";
const HOURS = 2000;

// Strategy params
const SMA_FAST = 20;     // Faster SMA for more signals
const SMA_SLOW = 50;     // Shorter slow SMA
const RSI_PERIOD = 14;
const RSI_OVERSOLD = 30;  
const RSI_OVERBOUGHT = 70; 

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

function generateSignals(candles) {
    const smaFast = calculateSMA(candles, SMA_FAST);
    const smaSlow = calculateSMA(candles, SMA_SLOW);
    const rsi = calculateRSI(candles, RSI_PERIOD);
    
    const signals = candles.map((c, i) => ({
        time: c.time,
        close: c.close,
        volume: c.volume,
        sma_fast: smaFast[i],
        sma_slow: smaSlow[i],
        rsi: rsi[i],
        signal: 0,
        signal_change: 0
    }));
    
    // Generate signals - SMA crossover with RSI filter
    // Buy: Fast crosses above slow AND RSI not overbought (can still buy if neutral)
    // Sell: Fast crosses below slow AND RSI not oversold (can still sell if neutral)
    for (let i = 1; i < signals.length; i++) {
        const curr = signals[i];
        const prev = signals[i-1];
        
        if (curr.sma_fast === null || curr.rsi === null) continue;
        
        // Buy: SMA cross up + RSI < overbought (not too hot)
        const prevFastBelow = prev.sma_fast <= prev.sma_slow;
        const currFastAbove = curr.sma_fast > curr.sma_slow;
        const rsiNotHot = curr.rsi < 75;  // Not overbought
        
        if (prevFastBelow && currFastAbove && rsiNotHot) {
            curr.signal = 1;
            curr.signal_change = 2;
        }
        
        // Sell: SMA cross down + RSI > oversold (not too cold)
        const prevFastAbove = prev.sma_fast >= prev.sma_slow;
        const currFastBelow = curr.sma_fast < curr.sma_slow;
        const rsiNotCold = curr.rsi > 25;  // Not oversold
        
        if (prevFastAbove && currFastBelow && rsiNotCold) {
            curr.signal = -1;
            curr.signal_change = -2;
        }
    }
    
    return signals;
}

// === BACKTESTER ===
function backtest(signals, initialBalance = 10000) {
    const validSignals = signals.filter(s => s.sma_fast !== null && s.rsi !== null);
    
    let balance = initialBalance;
    let position = 0;
    let entryPrice = 0;
    let qty = 0;
    const trades = [];
    
    for (const row of validSignals) {
        if (row.signal_change === 2 && position === 0) {
            qty = balance / row.close;
            balance = 0;
            position = 1;
            entryPrice = row.close;
            trades.push({ type: "BUY", price: row.close, time: row.time.toISOString().split('T')[0], rsi: row.rsi.toFixed(1) });
            
        } else if (row.signal_change === -2 && position === 1) {
            const sellValue = qty * row.close;
            const pnl = sellValue - (qty * entryPrice);
            balance = sellValue;
            position = 0;
            trades.push({ type: "SELL", price: row.close, time: row.time.toISOString().split('T')[0], pnl: pnl.toFixed(2), rsi: row.rsi.toFixed(1) });
        }
    }
    
    let finalValue = balance;
    if (position === 1 && validSignals.length > 0) {
        finalValue = qty * validSignals[validSignals.length - 1].close;
    }
    
    const totalReturn = ((finalValue - initialBalance) / initialBalance) * 100;
    
    return {
        initialBalance,
        finalValue: finalValue.toFixed(2),
        totalReturnPct: totalReturn.toFixed(2),
        numTrades: trades.length,
        trades
    };
}

// === MAIN ===
async function main() {
    console.log(`🧪 Testing ${COINS.length} coins with relaxed RSI filter...\n`);
    
    const results = [];
    
    for (const coin of COINS) {
        process.stdout.write(`📊 ${coin}... `);
        
        const candles = await fetchCryptoCompareData(coin, CURRENCY, HOURS);
        if (!candles || candles.length < 100) {
            console.log(`❌ Failed to fetch`);
            continue;
        }
        
        const signals = generateSignals(candles);
        const result = backtest(signals);
        
        results.push({
            coin,
            return: parseFloat(result.totalReturnPct),
            trades: result.numTrades,
            finalValue: result.finalValue
        });
        
        console.log(`Return: ${result.totalReturnPct}% | Trades: ${result.numTrades}`);
    }
    
    // Sort by return
    results.sort((a, b) => b.return - a.return);
    
    console.log(`\n╔══════════════════════════════════════════════╗`);
    console.log(`║         RANKING (Best to Worst)             ║`);
    console.log(`╠══════════════════════════════════════════════╣`);
    
    for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const emoji = r.return > 0 ? '🟢' : '🔴';
        console.log(`║ ${i+1}. ${emoji} ${r.coin.padEnd(6)} | ${r.return > 0 ? '+' : ''}${r.return}%`.padEnd(42) + `║`);
        console.log(`║    Trades: ${r.trades} | Final: $${parseFloat(r.finalValue).toLocaleString()}`.padEnd(38) + `║`);
    }
    
    console.log(`╚══════════════════════════════════════════════╝`);
    
    const best = results[0];
    console.log(`\n🏆 Best performer: ${best.coin} with ${best.return > 0 ? '+' : ''}${best.return}% return`);
    console.log(`\n💡 Strategy: SMA(${SMA_FAST})/SMA(${SMA_SLOW}) crossover with RSI filter`);
    console.log(`   Buy when: Fast SMA crosses above slow SMA + RSI < 75`);
    console.log(`   Sell when: Fast SMA crosses below slow SMA + RSI > 25`);
}

main();
