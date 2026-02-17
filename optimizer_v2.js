/**
 * OPTIMIZER v2 - More coins
 */

const https = require('https');

const COINS = ["ETH", "BTC", "SOL", "AVAX", "LINK", "ATOM", "MATIC", "DOT"];
const CURRENCY = "USD";

const COMBOS = [
    { sl: 5, tp: 15, name: "5%/15%" },
    { sl: 5, tp: 20, name: "5%/20%" },
    { sl: 10, tp: 20, name: "10%/20%" },
];

const SMA_FAST = 10;
const SMA_SLOW = 30;

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

function backtest(candles, sl, tp) {
    const smaFast = calculateSMA(candles, SMA_FAST);
    const smaSlow = calculateSMA(candles, SMA_SLOW);
    
    const signals = candles.map((c, i) => ({
        close: c.close, high: c.high, low: c.low,
        sma_fast: smaFast[i], sma_slow: smaSlow[i], signal: 0
    }));
    
    for (let i = 1; i < signals.length; i++) {
        if (signals[i].sma_fast === null) continue;
        if (signals[i-1].sma_fast <= signals[i-1].sma_slow && signals[i].sma_fast > signals[i].sma_slow) signals[i].signal = 1;
        if (signals[i-1].sma_fast >= signals[i-1].sma_slow && signals[i].sma_fast < signals[i].sma_slow) signals[i].signal = -1;
    }
    
    const valid = signals.filter(s => s.sma_fast !== null);
    let balance = 10000, position = 0, entryPrice = 0, qty = 0, wins = 0, losses = 0;
    
    for (const row of valid) {
        if (position === 1) {
            if (row.low <= entryPrice * (1 - sl/100)) { balance = qty * entryPrice * (1 - sl/100); position = 0; losses++; continue; }
            if (row.high >= entryPrice * (1 + tp/100)) { balance = qty * entryPrice * (1 + tp/100); position = 0; wins++; continue; }
        }
        if (row.signal === 1 && position === 0) { qty = balance / row.close; balance = 0; position = 1; entryPrice = row.close; }
        else if (row.signal === -1 && position === 1) { const pnl = (row.close - entryPrice) * qty; balance += row.close * qty; position = 0; if (pnl > 0) wins++; else losses++; }
    }
    
    if (position === 1) balance = qty * valid[valid.length - 1].close;
    return { return: ((balance - 10000) / 10000) * 100, wins, losses, trades: wins + losses };
}

async function main() {
    console.log(`🧪 Testing ${COINS.length} coins with 3 SL/TP combos...\n`);
    
    const allResults = [];
    
    for (const coin of COINS) {
        process.stdout.write(`${coin}... `);
        const candles = await fetchData(coin);
        if (!candles) { console.log(`❌`); continue; }
        
        for (const combo of COMBOS) {
            const result = backtest(candles, combo.sl, combo.tp);
            allResults.push({ coin, combo: combo.name, sl: combo.sl, tp: combo.tp, ...result });
        }
        console.log(`✅`);
    }
    
    allResults.sort((a, b) => b.return - a.return);
    
    console.log(`\n╔═══════════════════════════════════════════════╗`);
    console.log(`║         TOP 10 RESULTS                       ║`);
    console.log(`╠═══════════════════════════════════════════════╣`);
    
    for (let i = 0; i < 10; i++) {
        const r = allResults[i];
        const emoji = r.return > 0 ? '🟢' : '🔴';
        console.log(`║ ${i+1}. ${emoji} ${r.coin.padEnd(5)} ${r.combo.padEnd(8)} ${r.return > 0 ? '+' : ''}${r.return.toFixed(2)}%`.padEnd(48) + `║`);
    }
    console.log(`╚═══════════════════════════════════════════════╝`);
    
    const best = allResults[0];
    console.log(`\n🏆 BEST: ${best.coin} ${best.combo} = +${best.return.toFixed(2)}%`);
    
    // Save best to file for cron
    require('fs').writeFileSync('/home/matthewkania.mk/.openclaw/workspace/trading_bot/best_settings.json', JSON.stringify(best, null, 2));
    console.log(`💾 Saved best settings to best_settings.json`);
}

main();
