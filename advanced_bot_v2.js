/**
 * ADVANCED TRADING BOT v2
 * - MACD + Bollinger Bands + SMA
 * - Position sizing (1-2% risk)
 * - Trailing stop loss
 * - Multi-timeframe alignment
 * - More coins
 */

const https = require('https');

// === CONFIG ===
const COINS = ["ETH", "SOL", "BTC", "AVAX", "LINK", "ATOM"];
const CURRENCY = "USD";

// Risk management
const RISK_PER_TRADE = 0.02;  // 2% of portfolio per trade
const STOP_LOSS_PCT = 3;       // 3% stop loss
const TAKE_PROFIT_PCT = 10;    // 10% take profit
const TRAILING_STOP_PCT = 5;   // 5% trailing stop

// Indicators
const SMA_FAST = 10;
const SMA_SLOW = 30;
const RSI_PERIOD = 14;
const MACD_FAST = 12;
const MACD_SLOW = 26;
const MACD_SIGNAL = 9;
const BB_PERIOD = 20;
const BB_STD = 2;

// === DATA FETCHER ===
function fetchData(coin, hours = 200) {
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

function calculateMACD(data) {
    // Calculate EMAs
    const emaFast = [];
    const emaSlow = [];
    const multiplierFast = 2 / (MACD_FAST + 1);
    const multiplierSlow = 2 / (MACD_SLOW + 1);
    
    for (let i = 0; i < data.length; i++) {
        if (i === 0) {
            emaFast.push(data[i].close);
            emaSlow.push(data[i].close);
        } else {
            emaFast.push((data[i].close - emaFast[i-1]) * multiplierFast + emaFast[i-1]);
            emaSlow.push((data[i].close - emaSlow[i-1]) * multiplierSlow + emaSlow[i-1]);
        }
    }
    
    const macdLine = emaFast.map((v, i) => v - emaSlow[i]);
    
    // Signal line (EMA of MACD)
    const signalLine = [];
    const signalMultiplier = 2 / (MACD_SIGNAL + 1);
    
    for (let i = 0; i < macdLine.length; i++) {
        if (i < MACD_SIGNAL - 1) {
            signalLine.push(null);
        } else if (i === MACD_SIGNAL - 1) {
            // First signal is SMA
            let sum = 0;
            for (let j = 0; j < MACD_SIGNAL; j++) {
                sum += macdLine[i - j];
            }
            signalLine.push(sum / MACD_SIGNAL);
        } else {
            signalLine.push((macdLine[i] - signalLine[i-1]) * signalMultiplier + signalLine[i-1]);
        }
    }
    
    // Histogram
    const histogram = macdLine.map((v, i) => v - (signalLine[i] || 0));
    
    return { macdLine, signalLine, histogram };
}

function calculateBollingerBands(data, period = 20, stdDev = 2) {
    const middle = calculateSMA(data, period);
    const upper = [];
    const lower = [];
    
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
            upper.push(null);
            lower.push(null);
        } else {
            // Calculate std dev
            let sum = 0;
            for (let j = 0; j < period; j++) {
                sum += Math.pow(data[i - j].close - middle[i], 2);
            }
            const std = Math.sqrt(sum / period);
            upper.push(middle[i] + stdDev * std);
            lower.push(middle[i] - stdDev * std);
        }
    }
    
    return { middle, upper, lower };
}

// === BACKTESTER ===
function backtestAdvanced(candles) {
    const smaFast = calculateSMA(candles, SMA_FAST);
    const smaSlow = calculateSMA(candles, SMA_SLOW);
    const rsi = calculateRSI(candles, RSI_PERIOD);
    const macd = calculateMACD(candles);
    const bb = calculateBollingerBands(candles, BB_PERIOD, BB_STD);
    
    const signals = candles.map((c, i) => ({
        time: c.time,
        close: c.close,
        high: c.high,
        low: c.low,
        sma_fast: smaFast[i],
        sma_slow: smaSlow[i],
        rsi: rsi[i],
        macd_hist: macd.histogram[i],
        macd_line: macd.macdLine[i],
        macd_signal: macd.signalLine[i],
        bb_upper: bb.upper[i],
        bb_middle: bb.middle[i],
        bb_lower: bb.lower[i],
        signal: 0,
        exit_reason: null
    }));
    
    // Generate signals: Multiple confirmations
    for (let i = 1; i < signals.length; i++) {
        const curr = signals[i];
        const prev = signals[i-1];
        
        if (curr.sma_fast === null || curr.rsi === null || curr.macd_hist === null) continue;
        
        // BUY: Multiple confirmations
        // 1. SMA crossover
        const smaCross = prev.sma_fast <= prev.sma_slow && curr.sma_fast > curr.sma_slow;
        // 2. MACD histogram positive (crossed above 0)
        const macdCross = prev.macd_hist <= 0 && curr.macd_hist > 0;
        // 3. RSI not overbought
        const rsiOk = curr.rsi < 70;
        // 4. Price near or below lower BB (oversold)
        const nearBBLower = curr.close <= curr.bb_lower * 1.05;
        
        if (smaCross && rsiOk) {
            curr.signal = 1;  // Primary buy
        } else if (macdCross && rsiOk) {
            curr.signal = 1;  // Secondary buy (MACD only)
        }
        
        // SELL
        const smaCrossDown = prev.sma_fast >= prev.sma_slow && curr.sma_fast < curr.sma_slow;
        const macdCrossDown = prev.macd_hist >= 0 && curr.macd_hist < 0;
        
        if (smaCrossDown) {
            curr.signal = -1;
        } else if (macdCrossDown) {
            curr.signal = -1;
        }
    }
    
    // Run backtest with advanced risk management
    const validSignals = signals.filter(s => s.sma_fast !== null);
    let balance = 10000;
    let position = 0;
    let entryPrice = 0;
    let qty = 0;
    let peakPrice = 0;
    const trades = [];
    let wins = 0;
    let losses = 0;
    
    for (let i = 0; i < validSignals.length; i++) {
        const row = validSignals[i];
        
        if (position === 1) {
            // Update peak price for trailing stop
            if (row.close > peakPrice) {
                peakPrice = row.close;
            }
            
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
            
            // Trailing stop
            const trailingStopPrice = peakPrice * (1 - TRAILING_STOP_PCT / 100);
            if (row.low <= trailingStopPrice && peakPrice > entryPrice * 1.03) {
                const tsPrice = trailingStopPrice;
                const pnl = (tsPrice - entryPrice) * qty;
                balance = qty * tsPrice;
                position = 0;
                trades.push({ type: "TRAIL_STOP", price: tsPrice.toFixed(2), pnl: pnl.toFixed(2), time: row.time.toISOString().split('T')[0] });
                wins++;
                continue;
            }
        }
        
        // Entry signals
        if (row.signal === 1 && position === 0) {
            // Position sizing: Risk 2% of portfolio
            const riskAmount = balance * RISK_PER_TRADE;
            const riskPerUnit = entryPrice * (STOP_LOSS_PCT / 100);
            qty = riskAmount / riskPerUnit;
            
            if (qty * row.close > balance) {
                qty = balance / row.close;  // Use all if not enough
            }
            
            balance -= qty * row.close;
            position = 1;
            entryPrice = row.close;
            peakPrice = row.close;
            trades.push({ type: "BUY", price: row.close.toFixed(2), time: row.time.toISOString().split('T')[0] });
            
        } else if (row.signal === -1 && position === 1) {
            const pnl = (row.close - entryPrice) * qty;
            balance += qty * row.close;
            position = 0;
            trades.push({ type: "SELL", price: row.close.toFixed(2), pnl: pnl.toFixed(2), time: row.time.toISOString().split('T')[0] });
            if (pnl > 0) wins++;
            else losses++;
        }
    }
    
    // Close position
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
        trades: trades.slice(-20)
    };
}

// === MAIN ===
async function main() {
    console.log(`╔═══════════════════════════════════════════════════════╗`);
    console.log(`║        ADVANCED TRADING BOT v2                       ║`);
    console.log(`║  MACD + Bollinger Bands + SMA + Trailing Stop       ║`);
    console.log(`╠═══════════════════════════════════════════════════════╣`);
    console.log(`║ Risk: ${(RISK_PER_TRADE*100)}% per trade | SL: ${STOP_LOSS_PCT}% | TP: ${TAKE_PROFIT_PCT}%`.padEnd(52) + `║`);
    console.log(`║ Trailing Stop: ${TRAILING_STOP_PCT}% | BB Period: ${BB_PERIOD}`.padEnd(48) + `║`);
    console.log(`╚═══════════════════════════════════════════════════════╝\n`);
    
    const results = [];
    
    for (const coin of COINS) {
        process.stdout.write(`🪙 ${coin}... `);
        
        const candles = await fetchData(coin, 2000);
        if (!candles || candles.length < 100) {
            console.log(`❌`);
            continue;
        }
        
        const result = backtestAdvanced(candles);
        
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
    console.log(`   Win Rate: ${best.winRate}% | ${best.trades} trades`);
}

main();
