/**
 * VERSION 1: Our Simple Strategy
 * SMA(10/30) Crossover - Keep it simple
 */

const https = require('https');

const COIN = "ETH";
const CURRENCY = "USD";
const INITIAL_BALANCE = 10000;
const STOP_LOSS_PCT = 10;
const TAKE_PROFIT_PCT = 20;

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
                        time: d.time,
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

function runBacktest(candles) {
    // Add SMA
    const smaFast = calculateSMA(candles, 10);
    const smaSlow = calculateSMA(candles, 30);
    
    // Generate signals
    const signals = [];
    for (let i = 1; i < candles.length; i++) {
        if (smaFast[i] === null) continue;
        const prev = signals[signals.length - 1] || { signal: 0 };
        
        let signal = 0;
        // Golden Cross
        if (smaFast[i-1] <= smaSlow[i-1] && smaFast[i] > smaSlow[i]) signal = 1;
        // Death Cross
        if (smaFast[i-1] >= smaSlow[i-1] && smaFast[i] < smaSlow[i]) signal = -1;
        
        signals.push({ time: candles[i].time, close: candles[i].close, high: candles[i].high, low: candles[i].low, signal });
    }
    
    // Backtest
    let balance = INITIAL_BALANCE;
    let position = null;  // { qty, entryPrice }
    let trades = [];
    
    for (const bar of signals) {
        // Check stop loss / take profit if in position
        if (position) {
            const slPrice = position.entryPrice * (1 - STOP_LOSS_PCT / 100);
            const tpPrice = position.entryPrice * (1 + TAKE_PROFIT_PCT / 100);
            
            if (bar.low <= slPrice) {
                // Stop loss hit
                const sellPrice = slPrice;
                const pnl = (sellPrice - position.entryPrice) * position.qty;
                balance += position.qty * sellPrice;
                trades.push({ type: 'STOP_LOSS', price: sellPrice, pnl });
                position = null;
                continue;
            }
            if (bar.high >= tpPrice) {
                // Take profit hit
                const sellPrice = tpPrice;
                const pnl = (sellPrice - position.entryPrice) * position.qty;
                balance += position.qty * sellPrice;
                trades.push({ type: 'TAKE_PROFIT', price: sellPrice, pnl });
                position = null;
                continue;
            }
        }
        
        // Signal trading
        if (bar.signal === 1 && !position) {
            // Buy
            const qty = balance / bar.close;
            position = { qty, entryPrice: bar.close };
            balance = 0;
            trades.push({ type: 'BUY', price: bar.close });
        }
        else if (bar.signal === -1 && position) {
            // Sell
            const pnl = (bar.close - position.entryPrice) * position.qty;
            balance += position.qty * bar.close;
            trades.push({ type: 'SELL', price: bar.close, pnl });
            position = null;
        }
    }
    
    // Close final position at current price
    let finalValue = balance;
    if (position) {
        finalValue = position.qty * signals[signals.length - 1].close;
    }
    
    const totalReturn = ((finalValue - INITIAL_BALANCE) / INITIAL_BALANCE) * 100;
    const wins = trades.filter(t => t.pnl > 0).length;
    const losses = trades.filter(t => t.pnl < 0).length;
    
    return { return: totalReturn, trades: trades.length, wins, losses };
}

async function main() {
    console.log(`🏆 VERSION 1: Simple SMA(10/30) - The Contender\n`);
    
    const candles = await fetchData(1500);
    if (!candles) { console.log(`❌ Failed`); return; }
    
    const result = runBacktest(candles);
    console.log(`   Initial: $${INITIAL_BALANCE}`);
    console.log(`   Final: $${(INITIAL_BALANCE * (1 + result.return/100)).toFixed(2)}`);
    console.log(`   Return: ${result.return.toFixed(2)}%`);
    console.log(`   Trades: ${result.trades} (W: ${result.wins}, L: ${result.losses})`);
    console.log(`   Win Rate: ${result.trades > 0 ? (result.wins/result.trades*100).toFixed(1) : 0}%`);
    
    // Show last 5 trades
    console.log(`\n   Last 5 trades:`);
    const allTrades = []; // Would need to capture all trades
}

main();
