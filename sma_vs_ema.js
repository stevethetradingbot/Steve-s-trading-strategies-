/**
 * COMPARISON: SMA vs EMA + Position Sizing
 * Test both to see which performs better
 */

const https = require('https');

const COINS = ["ETH", "BTC", "SOL", "DOT"];
const CURRENCY = "USD";

// Test configs
const CONFIGS = [
    { name: "SMA 10/30", smaFast: 10, smaSlow: 30, useEMA: false },
    { name: "EMA 10/30", smaFast: 10, smaSlow: 30, useEMA: true },
    { name: "SMA 20/50", smaFast: 20, smaSlow: 50, useEMA: false },
    { name: "EMA 20/50", smaFast: 20, smaSlow: 50, useEMA: true },
];

const RISK_PER_TRADE = 0.02; // 2% max risk per trade
const STOP_LOSS_PCT = 10;
const TAKE_PROFIT_PCT = 20;

function fetchData(coin, hours = 2000) {
    return new Promise((resolve) => {
        const url = `https://min-api.cryptocompare.com/data/v2/histohour?fsym=${coin}&tsym=${CURRENCY}&limit=${hours}`;
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (!json.Response || json.Response !== 'Success') { resolve(null); return; }
                    const candles = json.Data.Data.map(d => ({
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

function calculateEMA(data, period) {
    const ema = [];
    const multiplier = 2 / (period + 1);
    for (let i = 0; i < data.length; i++) {
        if (i === 0) { ema.push(data[i].close); continue; }
        ema.push((data[i].close - ema[i-1]) * multiplier + ema[i-1]);
    }
    return ema;
}

function getIndicator(data, period, useEMA) {
    return useEMA ? calculateEMA(data, period) : calculateSMA(data, period);
}

function backtest(candles, config) {
    const fast = getIndicator(candles, config.smaFast, config.useEMA);
    const slow = getIndicator(candles, config.smaSlow, config.useEMA);
    
    const signals = candles.map((c, i) => ({
        close: c.close, high: c.high, low: c.low,
        fast: fast[i], slow: slow[i], signal: 0
    }));
    
    // Generate signals
    for (let i = 1; i < signals.length; i++) {
        if (signals[i].fast === null) continue;
        if (signals[i-1].fast <= signals[i-1].slow && signals[i].fast > signals[i].slow) signals[i].signal = 1;
        if (signals[i-1].fast >= signals[i-1].slow && signals[i].fast < signals[i].slow) signals[i].signal = -1;
    }
    
    const valid = signals.filter(s => s.fast !== null);
    let balance = 10000;
    let position = 0;
    let entryPrice = 0;
    let qty = 0;
    let wins = 0, losses = 0;
    
    for (const row of valid) {
        if (position === 1) {
            // Stop loss
            if (row.low <= entryPrice * (1 - STOP_LOSS_PCT/100)) {
                balance = qty * entryPrice * (1 - STOP_LOSS_PCT/100);
                position = 0;
                losses++;
                continue;
            }
            // Take profit
            if (row.high >= entryPrice * (1 + TAKE_PROFIT_PCT/100)) {
                balance = qty * entryPrice * (1 + TAKE_PROFIT_PCT/100);
                position = 0;
                wins++;
                continue;
            }
        }
        
        // Buy with position sizing (risk 2%)
        if (row.signal === 1 && position === 0) {
            const riskAmount = balance * RISK_PER_TRADE;
            const riskPerUnit = entryPrice * (STOP_LOSS_PCT/100);
            // Use smaller of: risk-based position or full balance
            const maxQtyByRisk = riskAmount / (entryPrice * STOP_LOSS_PCT/100);
            const maxQtyByBalance = balance / row.close;
            qty = Math.min(maxQtyByRisk * 3, maxQtyByBalance); // Allow 3x leverage for testing
            balance -= qty * row.close;
            position = 1;
            entryPrice = row.close;
        }
        // Sell
        else if (row.signal === -1 && position === 1) {
            const pnl = (row.close - entryPrice) * qty;
            balance += row.close * qty;
            position = 0;
            if (pnl > 0) wins++;
            else losses++;
        }
    }
    
    if (position === 1) balance = qty * valid[valid.length - 1].close;
    return { return: ((balance - 10000) / 10000) * 100, wins, losses, trades: wins + losses };
}

async function main() {
    console.log(`🔬 Testing SMA vs EMA with 2% position sizing...\n`);
    
    const allResults = [];
    
    for (const coin of COINS) {
        console.log(`🪙 ${coin}:`);
        const candles = await fetchData(coin);
        if (!candles) { console.log(`   ❌ Failed`); continue; }
        
        for (const config of CONFIGS) {
            const result = backtest(candles, config);
            allResults.push({ coin, config: config.name, ...result });
            const emoji = result.return > 0 ? '🟢' : '🔴';
            console.log(`   ${config.name}: ${emoji} ${result.return.toFixed(2)}% | ${result.wins}W/${result.losses}L`);
        }
    }
    
    allResults.sort((a, b) => b.return - a.return);
    
    console.log(`\n╔═══════════════════════════════════════════════╗`);
    console.log(`║         TOP 10 RESULTS                       ║`);
    console.log(`╠═══════════════════════════════════════════════╣`);
    
    for (let i = 0; i < 10; i++) {
        const r = allResults[i];
        const emoji = r.return > 0 ? '🟢' : '🔴';
        console.log(`║ ${i+1}. ${emoji} ${r.coin.padEnd(4)} ${r.config.padEnd(10)} ${r.return > 0 ? '+' : ''}${r.return.toFixed(2)}%`.padEnd(48) + `║`);
    }
    console.log(`╚═══════════════════════════════════════════════╝`);
    
    // Compare SMA vs EMA averages
    const smaResults = allResults.filter(r => r.config.includes("SMA"));
    const emaResults = allResults.filter(r => r.config.includes("EMA"));
    const smaAvg = smaResults.reduce((a,b) => a + b.return, 0) / smaResults.length;
    const emaAvg = emaResults.reduce((a,b) => a + b.return, 0) / emaResults.length;
    
    console.log(`\n📊 COMPARISON:`);
    console.log(`   SMA Average: ${smaAvg.toFixed(2)}%`);
    console.log(`   EMA Average: ${emaAvg.toFixed(2)}%`);
    console.log(`   ${emaAvg > smaAvg ? '✅ EMA wins!' : '✅ SMA wins!'} (by ${Math.abs(emaAvg - smaAvg).toFixed(2)}%)`);
}

main();
