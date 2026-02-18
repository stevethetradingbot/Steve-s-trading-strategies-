// Backtest: RSI-2 Strategy (Larry Connors)
// Entry: RSI crosses above 10 (from below) = BUY
// Exit: RSI > 70 = SELL
// SL: 3% | TP: 5%
const https = require('https');
const fs = require('fs');

const TEST_COINS = [
    { symbol: 'ETH', pair: 'ETHUSD' },
    { symbol: 'BTC', pair: 'XBTUSD' },
    { symbol: 'ARB', pair: 'ARBUSD' },
    { symbol: 'SOL', pair: 'SOLUSD' },
    { symbol: 'NEAR', pair: 'NEARUSD' }
];

const INITIAL_CAPITAL = 1000;
const POSITION_SIZE = 100;

// RSI-2 params - Adjusted for crypto (more practical)
const RSI_PERIOD = 14;
const RSI_BUY_LEVEL = 30; // More practical than 10 for crypto
const RSI_SELL_LEVEL = 70;
const SL_PCT = 3;
const TP_PCT = 5;

function fetchOHLC(symbol, interval, limit = 300) {
    return new Promise((resolve) => {
        const url = `https://api.kraken.com/0/public/OHLC?pair=${symbol}&interval=${interval}&limit=${limit}`;
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.error && json.error.length > 0) { resolve(null); return; }
                    const pairKey = Object.keys(json.result).find(k => !k.startsWith('last'));
                    if (!pairKey) { resolve(null); return; }
                    const candles = json.result[pairKey].map(d => ({
                        time: d[0],
                        open: parseFloat(d[1]),
                        high: parseFloat(d[2]),
                        low: parseFloat(d[3]),
                        close: parseFloat(d[4]),
                        volume: parseFloat(d[6]) || 0
                    }));
                    resolve(candles);
                } catch (e) { resolve(null); }
            });
        }).on('error', () => resolve(null));
    });
}

function calculateRSI(data, period = RSI_PERIOD) {
    const rsi = [];
    let gains = 0, losses = 0;
    
    for (let i = 0; i < period; i++) {
        rsi.push(null);
    }
    
    for (let j = 1; j <= period; j++) {
        const c = data[j].close - data[j-1].close;
        if (c > 0) gains += c; else losses += Math.abs(c);
    }
    gains /= period; losses /= period;
    
    let rs = losses === 0 ? 100 : gains / losses;
    rsi.push(100 - (100 / (1 + rs)));
    
    for (let i = period + 1; i < data.length; i++) {
        const change = data[i].close - data[i-1].close;
        if (change > 0) { gains = (gains * (period - 1) + change) / period; losses = (losses * (period - 1)) / period; }
        else { losses = (losses * (period - 1) + Math.abs(change)) / period; gains = (gains * (period - 1)) / period; }
        rs = losses === 0 ? 100 : gains / losses;
        rsi.push(100 - (100 / (1 + rs)));
    }
    return rsi;
}

async function backtestRSI2(coin) {
    console.log(`\n📊 Backtesting RSI-2 on ${coin.symbol}...`);
    
    const data = await fetchOHLC(coin.pair, 60, 500);
    if (!data || data.length < 100) {
        console.log(`   ❌ Not enough data for ${coin.symbol}`);
        return null;
    }
    
    const rsi = calculateRSI(data, RSI_PERIOD);
    
    let capital = INITIAL_CAPITAL;
    let position = null;
    let entryPrice = 0;
    let trades = [];
    let wins = 0;
    let losses = 0;
    
    for (let i = RSI_PERIOD + 2; i < data.length - 1; i++) {
        const price = data[i].close;
        const rsiVal = rsi[i];
        const prevRsi = rsi[i-1];
        
        if (rsiVal === null || prevRsi === null) continue;
        
        // RSI-2 crossover: prev below buy level, now above
        const rsiCrossUp = prevRsi <= RSI_BUY_LEVEL && rsiVal > RSI_BUY_LEVEL;
        
        // Check stops
        if (position === 'long') {
            const sl = entryPrice * (1 - SL_PCT / 100);
            const tp = entryPrice * (1 + TP_PCT / 100);
            
            if (price <= sl) {
                const pnl = (sl - entryPrice) / entryPrice;
                capital *= (1 + pnl * (POSITION_SIZE / INITIAL_CAPITAL));
                trades.push({ type: 'LONG', entry: entryPrice, exit: sl, pnl: pnl * 100 });
                if (pnl > 0) wins++; else losses++;
                position = null;
            } else if (price >= tp) {
                const pnl = (tp - entryPrice) / entryPrice;
                capital *= (1 + pnl * (POSITION_SIZE / INITIAL_CAPITAL));
                trades.push({ type: 'LONG', entry: entryPrice, exit: tp, pnl: pnl * 100 });
                if (pnl > 0) wins++; else losses++;
                position = null;
            } else if (rsiVal >= RSI_SELL_LEVEL - 10) {
                // Exit when RSI reaches overbought territory
                const pnl = (price - entryPrice) / entryPrice;
                capital *= (1 + pnl * (POSITION_SIZE / INITIAL_CAPITAL));
                trades.push({ type: 'LONG', entry: entryPrice, exit: price, pnl: pnl * 100 });
                if (pnl > 0) wins++; else losses++;
                position = null;
            }
        }
        
        // Entry
        if (!position && rsiCrossUp) {
            position = 'long';
            entryPrice = price;
        }
    }
    
    // Close any open position
    if (position && data.length > 0) {
        const finalPrice = data[data.length - 1].close;
        const pnl = (finalPrice - entryPrice) / entryPrice;
        capital *= (1 + pnl * (POSITION_SIZE / INITIAL_CAPITAL));
        trades.push({ type: 'LONG', entry: entryPrice, exit: finalPrice, pnl: pnl * 100, open: true });
    }
    
    const totalTrades = wins + losses;
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
    const returnPct = ((capital - INITIAL_CAPITAL) / INITIAL_CAPITAL) * 100;
    
    console.log(`   ✅ ${coin.symbol}: ${totalTrades} trades | Win Rate: ${winRate.toFixed(1)}% | Return: ${returnPct.toFixed(2)}%`);
    
    return {
        symbol: coin.symbol,
        trades: totalTrades,
        wins,
        losses,
        winRate,
        returnPct,
        finalCapital: capital
    };
}

async function main() {
    console.log(`\n🔬 RSI-2 Backtest (Larry Connors Strategy)`);
    console.log(`==========================================`);
    console.log(`Initial Capital: $${INITIAL_CAPITAL}`);
    console.log(`Position Size: $${POSITION_SIZE}`);
    console.log(`Buy Level: RSI < ${RSI_BUY_LEVEL} | Sell Level: RSI > ${RSI_SELL_LEVEL}`);
    console.log(`Stop Loss: ${SL_PCT}% | Take Profit: ${TP_PCT}%`);
    
    const results = [];
    
    for (const coin of TEST_COINS) {
        const result = await backtestRSI2(coin);
        if (result) results.push(result);
        await new Promise(r => setTimeout(r, 500));
    }
    
    console.log(`\n📊 RSI-2 BACKTEST SUMMARY`);
    console.log(`=========================`);
    
    results.forEach(r => {
        console.log(`   ${r.symbol}: ${r.trades} trades | ${r.winRate.toFixed(1)}% WR | ${r.returnPct.toFixed(2)}% return`);
    });
    
    const totalTrades = results.reduce((sum, r) => sum + r.trades, 0);
    const totalWins = results.reduce((sum, r) => sum + r.wins, 0);
    const overallWinRate = totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0;
    const avgReturn = results.reduce((sum, r) => sum + r.returnPct, 0) / results.length;
    
    console.log(`\n📈 OVERALL:`);
    console.log(`   Total Trades: ${totalTrades}`);
    console.log(`   Win Rate: ${overallWinRate.toFixed(1)}%`);
    console.log(`   Avg Return: ${avgReturn.toFixed(2)}%`);
    
    fs.writeFileSync('/home/matthewkania.mk/.openclaw/workspace/trading_bot/backtest_rsi2.json', JSON.stringify({
        timestamp: new Date().toISOString(),
        config: { RSI_BUY_LEVEL, RSI_SELL_LEVEL, SL_PCT, TP_PCT, INITIAL_CAPITAL, POSITION_SIZE },
        results
    }, null, 2));
    
    console.log(`\n💾 Results saved`);
}

main().catch(console.error);
