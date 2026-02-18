// Multi-Coin Paper Trading Monitor - IMPROVED VERSION
// Features: Multi-timeframe confirmation, RSI filter, Volume filter, Trailing stops
const https = require('https');
const fs = require('fs');

const STATE_DIR = '/home/matthewkania.mk/.openclaw/workspace/trading_bot/states';
const SUMMARY_FILE = '/home/matthewkania.mk/.openclaw/workspace/trading_bot/paper_summary.json';

// Config - EXPANDED to 30 coins for more data
const COINS = [
    // Original 20
    { symbol: 'ETH', pair: 'ETHUSD', name: 'Ethereum' },
    { symbol: 'BTC', pair: 'XBTUSD', name: 'Bitcoin' },
    { symbol: 'SOL', pair: 'SOLUSD', name: 'Solana' },
    { symbol: 'XRP', pair: 'XRPUSD', name: 'Ripple' },
    { symbol: 'ADA', pair: 'ADAUSD', name: 'Cardano' },
    { symbol: 'ARB', pair: 'ARBUSD', name: 'Arbitrum' },
    { symbol: 'SUI', pair: 'SUIUSD', name: 'Sui' },
    { symbol: 'NEAR', pair: 'NEARUSD', name: 'Near' },
    { symbol: 'OP', pair: 'OPUSD', name: 'Optimism' },
    { symbol: 'UNI', pair: 'UNIUSD', name: 'Uniswap' },
    { symbol: 'DOT', pair: 'DOTUSD', name: 'Polkadot' },
    { symbol: 'LINK', pair: 'LINKUSD', name: 'Chainlink' },
    { symbol: 'AVAX', pair: 'AVAXUSD', name: 'Avalanche' },
    { symbol: 'MATIC', pair: 'MATICUSD', name: 'Polygon' },
    { symbol: 'ATOM', pair: 'ATOMUSD', name: 'Cosmos' },
    { symbol: 'LTC', pair: 'LTCUSD', name: 'Litecoin' },
    { symbol: 'XLM', pair: 'XLMUSD', name: 'Stellar' },
    { symbol: 'ALGO', pair: 'ALGOUSD', name: 'Algorand' },
    { symbol: 'VET', pair: 'VETUSD', name: 'VeChain' },
    { symbol: 'FIL', pair: 'FILUSD', name: 'Filecoin' },
    // New 10 coins
    { symbol: 'APT', pair: 'APTUSD', name: 'Aptos' },
    { symbol: 'INJ', pair: 'INJUSD', name: 'Injective' },
    { symbol: 'IMX', pair: 'IMXUSD', name: 'Immutable' },
    { symbol: 'STX', pair: 'STXUSD', name: 'Stacks' },
    { symbol: 'SAND', pair: 'SANDUSD', name: 'The Sandbox' },
    { symbol: 'MANA', pair: 'MANAUSD', name: 'Decentraland' },
    { symbol: 'AAVE', pair: 'AAVEUSD', name: 'Aave' },
    { symbol: 'PEPE', pair: 'PEPEUSD', name: 'Pepe' },
    { symbol: 'SHIB', pair: 'SHIBUSD', name: 'Shiba Inu' },
    { symbol: 'TRX', pair: 'TRXUSD', name: 'Tron' }
];

// IMPROVED Strategy settings
const SMA_FAST = 24;
const SMA_SLOW = 56;
const RSI_PERIOD = 14;
const VOLUME_SMA_PERIOD = 20;

// Stop loss / Take profit - TIGHTENED based on backtest
const SL_HOURLY = 2;
const TP_HOURLY = 4;
const TRAILING_STOP_PCT = 5; // Move stop loss up 5% when in profit
const AF = 0.09;
const SL_DAILY = 20;
const TP_DAILY = 40;

// ============ TRADE MANAGEMENT FEATURES ============
// Partial profit taking (from checklist)
const USE_PARTIAL_TP = true;
const PARTIAL_TP_PCT = 50; // Take 50% off at TP
const PARTIAL_TP_RR = 2; // At 2:1 risk/reward
const USE_BREAKEVEN = true;
const BREAKEVEN_RR = 1.0; // Move to breakeven at 1:1 profit

// Filters - Optimized based on backtest results
const USE_MULTITIMEFRAME_FILTER = true; // Only trade when hourly signals matching daily trend
const USE_RSI_FILTER = false; // Disabled - blocks too many trades
const USE_VOLUME_FILTER = false; // Disabled - blocks too many trades

// ============ RSI + MACD MEAN REVERSION STRATEGY ============
// Entry: RSI < 35 + MACD crosses above signal line (LONG)
// Entry: RSI > 65 + MACD crosses below signal line (SHORT)
// Exit: RSI > 65 / < 35 + MACD cross opposite
// SL: 2% | TP: 3% (adjusted from 1%/1.5% for less noise)

const RSI_MACD_SL = 2;
const RSI_MACD_TP = 3;

// ============ RSI-2 STRATEGY (Larry Connors) ============
// Famous mean reversion strategy
// Entry: RSI < 10 (extreme oversold) = BUY
// Exit: RSI > 70 = SELL
// Or use 5/95 levels for even more extreme

const RSI2_BUY_LEVEL = 10;
const RSI2_SELL_LEVEL = 90;
const RSI2_SL = 3;
const RSI2_TP = 5;

async function analyzeRSI2(coin, hourlyData, dailyTrend) {
    if (!hourlyData || hourlyData.length < 30) return null;
    
    const rsi = calculateRSI(hourlyData, RSI_PERIOD);
    const current = hourlyData[hourlyData.length - 1];
    const prev = hourlyData[hourlyData.length - 2];
    const price = current.close;
    
    const rsiVal = rsi[rsi.length - 1];
    const prevRsi = rsi[rsi.length - 2];
    
    if (rsiVal === null || prevRsi === null) return null;
    
    // RSI-2 crossover detection
    const rsiCrossUp = prevRsi <= RSI2_BUY_LEVEL && rsiVal > RSI2_BUY_LEVEL;
    const rsiCrossDown = prevRsi >= RSI2_SELL_LEVEL && rsiVal < RSI2_SELL_LEVEL;
    
    const stateFile = `${STATE_DIR}/rsi2_${coin.symbol}.json`;
    let state = { position: null, entryPrice: null, entryTime: null };
    try { if (fs.existsSync(stateFile)) state = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch (e) {}
    
    let signal = null;
    let action = null;
    
    // Entry: RSI crosses above buy level (from extreme oversold)
    if (!state.position) {
        if (rsiCrossUp) {
            signal = "BUY";
        }
    }
    
    // Check stops
    if (state.position === 'long') {
        const sl = state.entryPrice * (1 - RSI2_SL / 100);
        const tp = state.entryPrice * (1 + RSI2_TP / 100);
        
        if (price <= sl) { signal = "STOP_LOSS"; action = "exit"; }
        else if (price >= tp) { signal = "TAKE_PROFIT"; action = "exit"; }
        // Exit if RSI reaches overbought
        else if (rsiVal >= RSI2_SELL_LEVEL - 10) { signal = "RSI_EXIT"; action = "exit"; }
    }
    
    // Execute
    if (signal === "BUY" && state.position !== 'long') {
        state = { position: 'long', entryPrice: price, entryTime: new Date().toISOString() };
        console.log(`[RSI-2 ${coin.symbol}] 🟢 ENTERED LONG at $${price.toFixed(2)} | RSI:${rsiVal.toFixed(1)} (extreme oversold)`);
    } else if ((signal === "STOP_LOSS" || signal === "TAKE_PROFIT" || signal === "RSI_EXIT") && state.position === 'long') {
        const pnl = price - state.entryPrice;
        const pnlPct = ((pnl / state.entryPrice) * 100).toFixed(2);
        console.log(`[RSI-2 ${coin.symbol}] ❌ EXITED ${signal} at $${price.toFixed(2)} | PnL: ${pnlPct}%`);
        action = "exit";
        state = { position: null, entryPrice: null, entryTime: null };
    } else {
        signal = state.position ? "HOLD" : "WAIT";
    }
    
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
    
    return {
        symbol: coin.symbol,
        strategy: "RSI-2",
        price: price.toFixed(2),
        rsi: rsiVal.toFixed(1),
        signal,
        position: state.position,
        entryPrice: state.entryPrice,
        action
    };
}

function calculateMACD(data, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    // Calculate EMAs
    const emaFast = [];
    const emaSlow = [];
    const kFast = 2 / (fastPeriod + 1);
    const kSlow = 2 / (slowPeriod + 1);
    
    // Initialize
    let sumFast = 0, sumSlow = 0;
    for (let i = 0; i < slowPeriod; i++) {
        sumFast += data[i].close;
        sumSlow += data[i].close;
        emaFast.push(null);
        emaSlow.push(null);
    }
    
    // First EMA values
    emaFast[slowPeriod - 1] = sumFast / fastPeriod;
    emaSlow[slowPeriod - 1] = sumSlow / slowPeriod;
    
    // Fill in remaining fast EMA
    for (let i = fastPeriod; i < slowPeriod; i++) {
        emaFast[i] = data[i].close * kFast + emaFast[i - 1] * (1 - kFast);
    }
    
    // Calculate both EMAs for remaining
    for (let i = slowPeriod; i < data.length; i++) {
        emaFast[i] = data[i].close * kFast + emaFast[i - 1] * (1 - kFast);
        emaSlow[i] = data[i].close * kSlow + emaSlow[i - 1] * (1 - kSlow);
    }
    
    // MACD line = Fast EMA - Slow EMA
    const macdLine = [];
    for (let i = 0; i < data.length; i++) {
        if (emaFast[i] === null || emaSlow[i] === null) {
            macdLine.push(null);
        } else {
            macdLine.push(emaFast[i] - emaSlow[i]);
        }
    }
    
    // Signal line = EMA of MACD
    const signalLine = [];
    const kSignal = 2 / (signalPeriod + 1);
    let sumMacd = 0;
    
    for (let i = 0; i < signalPeriod; i++) {
        if (macdLine[i] !== null) {
            sumMacd += macdLine[i];
        }
        signalLine.push(null);
    }
    
    const firstSignal = sumMacd / signalPeriod;
    signalLine[slowPeriod + signalPeriod - 2] = firstSignal;
    
    for (let i = slowPeriod + signalPeriod - 1; i < data.length; i++) {
        if (macdLine[i] !== null && signalLine[i - 1] !== null) {
            signalLine[i] = macdLine[i] * kSignal + signalLine[i - 1] * (1 - kSignal);
        } else {
            signalLine.push(null);
        }
    }
    
    // Histogram = MACD - Signal
    const histogram = [];
    for (let i = 0; i < data.length; i++) {
        if (macdLine[i] !== null && signalLine[i] !== null) {
            histogram.push(macdLine[i] - signalLine[i]);
        } else {
            histogram.push(null);
        }
    }
    
    return { macdLine, signalLine, histogram };
}

async function analyzeRSIMACD(coin, hourlyData, dailyTrend) {
    if (!hourlyData || hourlyData.length < 50) return null;
    
    const rsi = calculateRSI(hourlyData, RSI_PERIOD);
    const macd = calculateMACD(hourlyData);
    
    const current = hourlyData[hourlyData.length - 1];
    const prev = hourlyData[hourlyData.length - 2];
    const price = current.close;
    
    const rsiVal = rsi[rsi.length - 1];
    const prevRsi = rsi[rsi.length - 2];
    const macdVal = macd.macdLine[macd.macdLine.length - 1];
    const prevMacd = macd.macdLine[macd.macdLine.length - 2];
    const signalVal = macd.signalLine[macd.signalLine.length - 1];
    const prevSignal = macd.signalLine[macd.signalLine.length - 2];
    
    if (rsiVal === null || macdVal === null || signalVal === null) return null;
    
    // MACD crossover detection
    const macdCrossUp = prevMacd <= prevSignal && macdVal > signalVal;
    const macdCrossDown = prevMacd >= prevSignal && macdVal < signalVal;
    
    const stateFile = `${STATE_DIR}/rsimacd_${coin.symbol}.json`;
    let state = { position: null, entryPrice: null, entryTime: null };
    try { if (fs.existsSync(stateFile)) state = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch (e) {}
    
    let signal = null;
    let action = null;
    
    // Entry: RSI oversold + MACD crosses up = LONG
    // Entry: RSI overbought + MACD crosses down = SHORT
    if (!state.position) {
        if (rsiVal < 35 && macdCrossUp) {
            signal = "BUY";
        } else if (rsiVal > 65 && macdCrossDown) {
            signal = "SHORT";
        }
    }
    
    // Check stops
    if (state.position === 'long') {
        const sl = state.entryPrice * (1 - RSI_MACD_SL / 100);
        const tp = state.entryPrice * (1 + RSI_MACD_TP / 100);
        
        if (price <= sl) { signal = "STOP_LOSS"; action = "exit"; }
        else if (price >= tp) { signal = "TAKE_PROFIT"; action = "exit"; }
        // Exit if RSI reaches opposite extreme
        else if (rsiVal > 60) { signal = "RSI_EXIT"; action = "exit"; }
    }
    
    if (state.position === 'short') {
        const sl = state.entryPrice * (1 + RSI_MACD_SL / 100);
        const tp = state.entryPrice * (1 - RSI_MACD_TP / 100);
        
        if (price >= sl) { signal = "STOP_LOSS"; action = "exit"; }
        else if (price <= tp) { signal = "TAKE_PROFIT"; action = "exit"; }
        // Exit if RSI reaches opposite extreme
        else if (rsiVal < 40) { signal = "RSI_EXIT"; action = "exit"; }
    }
    
    // Execute
    if (signal === "BUY" && state.position !== 'long') {
        state = { position: 'long', entryPrice: price, entryTime: new Date().toISOString() };
        console.log(`[RSI+MACD ${coin.symbol}] 🟢 ENTERED LONG at $${price.toFixed(2)} | RSI:${rsiVal.toFixed(1)} | MACD:+`);
    } else if (signal === "SHORT" && state.position !== 'short') {
        state = { position: 'short', entryPrice: price, entryTime: new Date().toISOString() };
        console.log(`[RSI+MACD ${coin.symbol}] 🔴 ENTERED SHORT at $${price.toFixed(2)} | RSI:${rsiVal.toFixed(1)} | MACD:-`);
    } else if ((signal === "STOP_LOSS" || signal === "TAKE_PROFIT" || signal === "RSI_EXIT") && state.position === 'long') {
        const pnl = price - state.entryPrice;
        const pnlPct = ((pnl / state.entryPrice) * 100).toFixed(2);
        console.log(`[RSI+MACD ${coin.symbol}] ❌ EXITED ${signal} at $${price.toFixed(2)} | PnL: ${pnlPct}%`);
        action = "exit";
        state = { position: null, entryPrice: null, entryTime: null };
    } else if ((signal === "STOP_LOSS" || signal === "TAKE_PROFIT" || signal === "RSI_EXIT") && state.position === 'short') {
        const pnl = state.entryPrice - price;
        const pnlPct = ((pnl / state.entryPrice) * 100).toFixed(2);
        console.log(`[RSI+MACD ${coin.symbol}] ❌ COVERED ${signal} at $${price.toFixed(2)} | PnL: ${pnlPct}%`);
        action = "exit";
        state = { position: null, entryPrice: null, entryTime: null };
    } else {
        signal = state.position ? "HOLD" : "WAIT";
    }
    
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
    
    return {
        symbol: coin.symbol,
        strategy: "RSI+MACD",
        price: price.toFixed(2),
        rsi: rsiVal.toFixed(1),
        macd: macdVal.toFixed(4),
        signal,
        position: state.position,
        entryPrice: state.entryPrice,
        action
    };
}

if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR);

// ============ KRAKEN API - LIVE PRICES ============
const livePrices = {};

// Map Kraken pair names (our pair -> Kraken API pair)
const KRAKEN_PAIR_MAP = {
    'XBTUSD': 'XXBTZUSD',
    'ETHUSD': 'XETHZUSD',
    'SOLUSD': 'SOLUSD',
    'XRPUSD': 'XRPUSD',
    'ADAUSD': 'ADAUSD',
    'ARBUSD': 'ARBUSD',
    'SUIUSD': 'SUIUSD',
    'NEARUSD': 'NEARUSD',
    'OPUSD': 'OPUSD',
    'UNIUSD': 'UNIUSD',
    'DOTUSD': 'DOTUSD',
    'LINKUSD': 'LINKUSD',
    'AVAXUSD': 'AVAXUSD',
    'MATICUSD': 'MATICUSD',
    'ATOMUSD': 'ATOMUSD',
    'LTCUSD': 'LTCUSD',
    'XLMUSD': 'XLMUSD',
    'ALGOUSD': 'ALGOUSD',
    'VETUSD': 'VETUSD',
    'FILUSD': 'FILUSD',
    'APTUSD': 'APTUSD',
    'INJUSD': 'INJUSD',
    'IMXUSD': 'IMXUSD',
    'STXUSD': 'STXUSD',
    'SANDUSD': 'SANDUSD',
    'MANAUSD': 'MANAUSD',
    'AAVEUSD': 'AAVEUSD',
    'PEPEUSD': 'PEPEUSD',
    'SHIBUSD': 'SHIBUSD',
    'TRXUSD': 'TRXUSD'
};

// Build reverse map: Kraken key -> our symbol
console.log('[INIT] Building KRAKEN_TO_SYMBOL...');
const KRAKEN_TO_SYMBOL = {};
console.log('[INIT] Starting loop over', COINS.length, 'coins');
for (const coin of COINS) {
    console.log('[INIT] Processing coin:', coin.symbol, coin.pair);
    const krakenPair = KRAKEN_PAIR_MAP[coin.pair] || coin.pair;
    console.log('[INIT] Kraken pair:', krakenPair);
    KRAKEN_TO_SYMBOL[krakenPair] = coin.symbol;
}
console.log('[INIT] KRAKEN_TO_SYMBOL built:', KRAKEN_TO_SYMBOL);

async function fetchLivePrices(coins) {
    // For now, just fetch BTC and ETH to test
    const testUrl = 'https://api.kraken.com/0/public/Ticker?pair=XBTUSD,ETHUSD';
    
    return new Promise((resolve) => {
        https.get(testUrl, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    console.log('[DEBUG] Raw response:', data.substring(0, 200));
                    if (json.error && json.error.length > 0) { 
                        console.log('[DEBUG] API error:', json.error);
                        resolve({}); return; 
                    }
                    const result = json.result;
                    const prices = {};
                    // Handle both XXBTZUSD/XETHZUSD and direct keys
                    if (result['XXBTZUSD']) prices['BTC'] = parseFloat(result['XXBTZUSD'].c[0]);
                    if (result['XETHZUSD']) prices['ETH'] = parseFloat(result['XETHZUSD'].c[0]);
                    console.log('[DEBUG] Parsed prices:', prices);
                    resolve(prices);
                } catch (e) { 
                    console.log('[DEBUG] Error:', e.message); 
                    resolve({}); 
                }
            });
        }).on('error', (e) => {
            console.log('[DEBUG] Network error:', e.message);
            resolve({});
        });
    });
}

// ============ COINBASE FALLBACK API ============
// Fallback when Kraken fails or gets rate limited
function fetchOHLCCoinbase(symbol, interval, limit = 100) {
    // Convert interval to Coinbase granularity
    const granularityMap = { 60: '60', 240: '240', 1440: '86400', 10080: '604800' };
    const granularity = granularityMap[interval] || '60';
    
    // Convert symbol to Coinbase format (e.g., ETHUSD -> ETH-USD)
    const pair = symbol.replace('USD', '-USD');
    const url = `https://api.exchange.coinbase.com/products/${pair}/candles?granularity=${granularity}`;
    
    return new Promise((resolve) => {
        const options = {
            headers: { 'CB-VERSION': '2024-01-01' }
        };
        https.get(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (Array.isArray(json) && json.length > 0) {
                        // Coinbase returns [timestamp, low, high, open, close, volume]
                        const candles = json.slice(0, limit).map(d => ({
                            time: d[0],
                            open: parseFloat(d[3]),
                            high: parseFloat(d[2]),
                            low: parseFloat(d[1]),
                            close: parseFloat(d[4]),
                            volume: parseFloat(d[5]) || 0
                        })).reverse(); // Oldest first
                        resolve(candles);
                    } else {
                        resolve(null);
                    }
                } catch (e) { resolve(null); }
            });
        }).on('error', () => resolve(null));
    });
}

// ============ COINBASE FALLBACK API ============
function fetchOHLCoinbase(symbol, interval, limit = 100) {
    const granularityMap = { 60: '60', 240: '240', 1440: '86400', 15: '60', 10080: '604800' };
    const granularity = granularityMap[interval] || '60';
    const pair = symbol.replace('USD', '-USD');
    const url = `https://api.exchange.coinbase.com/products/${pair}/candles?granularity=${granularity}`;
    
    return new Promise((resolve) => {
        const options = { headers: { 'CB-VERSION': '2024-01-01' } };
        https.get(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (Array.isArray(json) && json.length > 0) {
                        const candles = json.slice(0, limit).map(d => ({
                            time: d[0], open: parseFloat(d[3]), high: parseFloat(d[2]),
                            low: parseFloat(d[1]), close: parseFloat(d[4]), volume: parseFloat(d[5]) || 0
                        })).reverse();
                        resolve(candles);
                    } else { resolve(null); }
                } catch (e) { resolve(null); }
            });
        }).on('error', () => resolve(null));
    });
}

// ============ OHLC WRAPPER (5-Way Fallback: Kraken → Coinbase → KuCoin → Bybit → CoinGecko) ============
async function fetchOHLCWithFallback(symbol, interval, limit = 100) {
    // Try Kraken first
    let data = await fetchOHLC(symbol, interval, limit);
    if (data && data.length > 0) return data;
    
    // Fallback to Coinbase if Kraken fails
    console.log(`   [FALLBACK] Trying Coinbase for ${symbol}...`);
    data = await fetchOHLCoinbase(symbol, interval, limit);
    if (data && data.length > 0) return data;
    
    // Fallback to KuCoin
    console.log(`   [FALLBACK] Trying KuCoin for ${symbol}...`);
    const symbolOnly = symbol.replace('USD', '').replace('X', '');
    data = await fetchOHLCKuCoin(symbolOnly, interval === 1440 ? '1day' : '1hour', limit);
    if (data && data.length > 0) return data;
    
    // Fallback to Bybit
    console.log(`   [FALLBACK] Trying Bybit for ${symbol}...`);
    data = await fetchOHLCBybit(symbolOnly, interval === 1440 ? 'D' : '60', limit);
    if (data && data.length > 0) return data;
    
    // Final fallback to CoinGecko
    console.log(`   [FALLBACK] Trying CoinGecko for ${symbol}...`);
    data = await fetchOHLCCoinGecko(symbolOnly, 30);
    return data;
}

// ============ OHLC DATA ============
function fetchOHLC(symbol, interval, limit = 100) {
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

// ============ COINGECKO FALLBACK API ============
// CoinGecko free API - rate limited but reliable backup
const COINGECKO_IDS = {
    'ETH': 'ethereum', 'BTC': 'bitcoin', 'SOL': 'solana', 'XRP': 'ripple',
    'ADA': 'cardano', 'ARB': 'arbitrum', 'SUI': 'sui', 'NEAR': 'near',
    'OP': 'optimism', 'UNI': 'uniswap', 'DOT': 'polkadot', 'LINK': 'chainlink',
    'AVAX': 'avalanche-2', 'MATIC': 'matic-network', 'ATOM': 'cosmos',
    'LTC': 'litecoin', 'XLM': 'stellar', 'ALGO': 'algorand', 'VET': 'vechain',
    'FIL': 'filecoin', 'APT': 'aptos', 'INJ': 'injective-protocol',
    'IMX': 'immutable-x', 'STX': 'stacks', 'SAND': 'the-sandbox',
    'MANA': 'decentraland', 'AAVE': 'aave', 'PEPE': 'pepe', 'SHIB': 'shiba-inu',
    'TRX': 'tron'
};

function fetchOHLCCoinGecko(symbol, days = 30) {
    return new Promise((resolve) => {
        const id = COINGECKO_IDS[symbol];
        if (!id) { resolve(null); return; }
        const url = `https://api.coingecko.com/api/v3/coins/${id}/ohlc?vs_currency=usd&days=${days}`;
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (!Array.isArray(json)) { resolve(null); return; }
                    const candles = json.map(d => ({
                        time: d[0] / 1000,
                        open: d[1], high: d[2], low: d[3], close: d[4], volume: 0
                    }));
                    resolve(candles);
                } catch (e) { resolve(null); }
            });
        }).on('error', () => resolve(null));
    });
}

// ============ KUCOIN API ============
const KUCOIN_SYMBOLS = {
    'ETH': 'ETH-USDT', 'BTC': 'BTC-USDT', 'SOL': 'SOL-USDT', 'XRP': 'XRP-USDT',
    'ADA': 'ADA-USDT', 'ARB': 'ARB-USDT', 'SUI': 'SUI-USDT', 'NEAR': 'NEAR-USDT',
    'OP': 'OP-USDT', 'UNI': 'UNI-USDT', 'DOT': 'DOT-USDT', 'LINK': 'LINK-USDT',
    'AVAX': 'AVAX-USDT', 'MATIC': 'MATIC-USDT', 'ATOM': 'ATOM-USDT', 'LTC': 'LTC-USDT',
    'XLM': 'XLM-USDT', 'ALGO': 'ALGO-USDT', 'VET': 'VET-USDT', 'FIL': 'FIL-USDT',
    'APT': 'APT-USDT', 'INJ': 'INJ-USDT', 'IMX': 'IMX-USDT', 'STX': 'STX-USDT',
    'SAND': 'SAND-USDT', 'MANA': 'MANA-USDT', 'AAVE': 'AAVE-USDT', 'PEPE': 'PEPE-USDT',
    'SHIB': 'SHIB-USDT', 'TRX': 'TRX-USDT'
};

function fetchOHLCKuCoin(symbol, interval = '1hour', limit = 100) {
    return new Promise((resolve) => {
        const pair = KUCOIN_SYMBOLS[symbol];
        if (!pair) { resolve(null); return; }
        const type = interval === '1hour' ? '1hour' : '1day';
        const url = `https://api.kucoin.com/api/v1/market/candles?type=${type}&symbol=${pair}&limit=${limit}`;
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.code !== '200000' || !json.data) { resolve(null); return; }
                    const candles = json.data.reverse().map(d => ({
                        time: parseInt(d[0]),
                        open: parseFloat(d[1]), high: parseFloat(d[2]),
                        low: parseFloat(d[3]), close: parseFloat(d[4]),
                        volume: parseFloat(d[5]) || 0
                    }));
                    resolve(candles);
                } catch (e) { resolve(null); }
            });
        }).on('error', () => resolve(null));
    });
}

// ============ BYBIT API ============
const BYBIT_SYMBOLS = {
    'ETH': 'ETHUSDT', 'BTC': 'BTCUSDT', 'SOL': 'SOLUSDT', 'XRP': 'XRPUSDT',
    'ADA': 'ADAUSDT', 'ARB': 'ARBUSDT', 'SUI': 'SUIUSDT', 'NEAR': 'NEARUSDT',
    'OP': 'OPUSDT', 'UNI': 'UNIUSDT', 'DOT': 'DOTUSDT', 'LINK': 'LINKUSDT',
    'AVAX': 'AVAXUSDT', 'MATIC': 'MATICUSDT', 'ATOM': 'ATOMUSDT', 'LTC': 'LTCUSDT',
    'XLM': 'XLMUSDT', 'ALGO': 'ALGOUSDT', 'VET': 'VETUSDT', 'FIL': 'FILUSDT',
    'APT': 'APTUSDT', 'INJ': 'INJUSDT', 'IMX': 'IMXUSDT', 'STX': 'STXUSDT',
    'SAND': 'SANDUSDT', 'MANA': 'MANAUSDT', 'AAVE': 'AAVEUSDT', 'PEPE': 'PEPEUSDT',
    'SHIB': 'SHIBUSDT', 'TRX': 'TRXUSDT'
};

function fetchOHLCBybit(symbol, interval = '60', limit = 100) {
    return new Promise((resolve) => {
        const pair = BYBIT_SYMBOLS[symbol];
        if (!pair) { resolve(null); return; }
        const url = `https://api.bybit.com/v5/market/kline?category=spot&symbol=${pair}&interval=${interval}&limit=${limit}`;
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.retCode !== 0 || !json.result?.list) { resolve(null); return; }
                    const candles = json.result.list.reverse().map(d => ({
                        time: parseInt(d[0]) / 1000,
                        open: parseFloat(d[1]), high: parseFloat(d[2]),
                        low: parseFloat(d[3]), close: parseFloat(d[4]),
                        volume: parseFloat(d[5]) || 0
                    }));
                    resolve(candles);
                } catch (e) { resolve(null); }
            });
        }).on('error', () => resolve(null));
    });
}

// ============ INDICATORS ============
function calculateSMA(data, period) {
    const sma = [];
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) sma.push(null);
        else { let sum = 0; for (let j = 0; j < period; j++) sum += data[i - j].close; sma.push(sum / period); }
    }
    return sma;
}

function calculateRSI(data, period = RSI_PERIOD) {
    const rsi = [];
    let gains = 0, losses = 0;
    for (let i = 0; i < data.length; i++) {
        if (i < period) { rsi.push(null); continue; }
        const change = data[i].close - data[i-1].close;
        if (i === period) {
            for (let j = 1; j <= period; j++) {
                const c = data[j].close - data[j-1].close;
                if (c > 0) gains += c; else losses += Math.abs(c);
            }
            gains /= period; losses /= period;
        } else {
            if (change > 0) { gains = (gains * (period - 1) + change) / period; losses = (losses * (period - 1)) / period; }
            else { losses = (losses * (period - 1) + Math.abs(change)) / period; gains = (gains * (period - 1)) / period; }
        }
        const rs = losses === 0 ? 100 : gains / losses;
        rsi.push(100 - (100 / (1 + rs)));
    }
    return rsi;
}

function calculateVolumeSMA(data, period = VOLUME_SMA_PERIOD) {
    const sma = [];
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) sma.push(null);
        else { 
            let sum = 0; 
            for (let j = 0; j < period; j++) sum += data[i - j].volume; 
            sma.push(sum / period); 
        }
    }
    return sma;
}

function calculatePSAR(data, af = AF) {
    const chronData = [...data].reverse();
    let sar = chronData[0].low;
    let ep = chronData[0].high;
    let trend = 1;
    let afVal = af;
    const results = [];
    for (let i = 1; i < chronData.length; i++) {
        sar = sar + afVal * (ep - sar);
        if (trend === 1) {
            if (chronData[i].low < sar) { trend = -1; sar = ep; ep = chronData[i].low; afVal = af; }
            else { if (chronData[i].high > ep) { ep = chronData[i].high; afVal = Math.min(afVal + af, 0.2); } }
        } else {
            if (chronData[i].high > sar) { trend = 1; sar = ep; ep = chronData[i].high; afVal = af; }
            else { if (chronData[i].low < ep) { ep = chronData[i].low; afVal = Math.min(afVal + af, 0.2); } }
        }
        results.push({ sar, trend, ep });
    }
    return results.reverse();
}

// ============ 5-EMA STRATEGY (Quant Science Style) ============
// 5 EMAs: 5, 10, 20, 50, 200 + RSI confirmation on 15-minute timeframe

function calculateEMA(data, period) {
    const ema = [];
    const k = 2 / (period + 1);
    let sum = 0;
    
    // First value is SMA
    for (let i = 0; i < period; i++) {
        sum += data[i].close;
    }
    ema.push(sum / period);
    
    // EMA for rest
    for (let i = period; i < data.length; i++) {
        ema.push(data[i].close * k + ema[i - 1] * (1 - k));
    }
    return ema;
}

// 5-EMA Strategy Analyzer for 15-minute data
async function analyze5EMA(coin, m15Data, dailyTrend) {
    if (!m15Data || m15Data.length < 220) return null;
    
    // Calculate 5 EMAs
    const ema5 = calculateEMA(m15Data, 5);
    const ema10 = calculateEMA(m15Data, 10);
    const ema20 = calculateEMA(m15Data, 20);
    const ema50 = calculateEMA(m15Data, 50);
    const ema200 = calculateEMA(m15Data, 200);
    const rsi = calculateRSI(m15Data, 14);
    
    const current = m15Data[m15Data.length - 1];
    const prev = m15Data[m15Data.length - 2];
    const price = current.close;
    
    const e5 = ema5[ema5.length - 1];
    const e10 = ema10[ema10.length - 1];
    const e20 = ema20[ema20.length - 1];
    const e50 = ema50[ema50.length - 1];
    const e200 = ema200[ema200.length - 1];
    const pe5 = ema5[ema5.length - 2];
    const pe10 = ema10[ema10.length - 2];
    const pe20 = ema20[ema20.length - 2];
    const pe50 = ema50[ema50.length - 2];
    const pe200 = ema200[ema200.length - 2];
    const rsiVal = rsi[rsi.length - 1];
    
    const stateFile = `${STATE_DIR}/ema5_${coin.symbol}.json`;
    let state = { position: null, entryPrice: null, entryTime: null, trailingStop: null };
    try { if (fs.existsSync(stateFile)) state = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch (e) {}
    
    // Entry conditions:
    // LONG: All 5 EMAs aligned bullish (5>10>20>50>200) + RSI < 70
    // SHORT: All 5 EMAs aligned bearish (5<10<20<50<200) + RSI > 30
    
    const bullishAligned = e5 > e10 && e10 > e20 && e20 > e50 && e50 > e200;
    const bearishAligned = e5 < e10 && e10 < e20 && e20 < e50 && e50 < e200;
    const prevBullish = pe5 > pe10 && pe10 > pe20 && pe20 > pe50 && pe50 > pe200;
    const prevBearish = pe5 < pe10 && pe10 < pe20 && pe20 < pe50 && pe50 < pe200;
    
    // Bullish crossover: prev not fully aligned, now aligned
    const bullishCrossover = !prevBullish && bullishAligned;
    const bearishCrossover = !prevBearish && bearishAligned;
    
    // Tight stop loss for scalping (1.5%)
    const SL_SCALP = 1.5;
    const TP_SCALP = 3;
    const TRAIL_SCALP = 2;
    
    let signal = null;
    let action = null;
    
    // Entry signals
    if (bullishCrossover && rsiVal < 70 && dailyTrend !== 'BEAR') {
        if (state.position !== 'long') signal = "BUY";
    } else if (bearishCrossover && rsiVal > 30 && dailyTrend !== 'BULL') {
        if (state.position !== 'short') signal = "SHORT";
    }
    
    // Check stops - LONG
    if (state.position === 'long') {
        const slPrice = state.entryPrice * (1 - SL_SCALP / 100);
        const tpPrice = state.entryPrice * (1 + TP_SCALP / 100);
        
        // Trailing stop
        const profitPct = ((price - state.entryPrice) / state.entryPrice) * 100;
        if (profitPct > TRAIL_SCALP) {
            const newTrailing = price * (1 - TRAIL_SCALP / 100);
            if (!state.trailingStop || newTrailing > state.trailingStop) {
                state.trailingStop = newTrailing;
            }
        }
        
        if (price <= slPrice) { signal = "STOP_LOSS"; action = "exit"; }
        else if (price >= tpPrice) { signal = "TAKE_PROFIT"; action = "exit"; }
        else if (state.trailingStop && price <= state.trailingStop) { signal = "TRAILING_STOP"; action = "exit"; }
    }
    
    // Check stops - SHORT
    if (state.position === 'short') {
        const slPrice = state.entryPrice * (1 + SL_SCALP / 100);
        const tpPrice = state.entryPrice * (1 - TP_SCALP / 100);
        
        const profitPct = ((state.entryPrice - price) / state.entryPrice) * 100;
        if (profitPct > TRAIL_SCALP) {
            const newTrailing = price * (1 + TRAIL_SCALP / 100);
            if (!state.trailingStop || newTrailing < state.trailingStop) {
                state.trailingStop = newTrailing;
            }
        }
        
        if (price >= slPrice) { signal = "STOP_LOSS"; action = "exit"; }
        else if (price <= tpPrice) { signal = "TAKE_PROFIT"; action = "exit"; }
    }
    
    // Execute
    if (signal === "BUY" && state.position !== 'long') {
        state = { position: 'long', entryPrice: price, entryTime: new Date().toISOString(), trailingStop: null };
        console.log(`[5EMA ${coin.symbol}] 🟢 ENTERED LONG at $${price.toFixed(2)} | RSI:${rsiVal.toFixed(1)} | Alignment:Bullish`);
    } else if (signal === "SHORT" && state.position !== 'short') {
        state = { position: 'short', entryPrice: price, entryTime: new Date().toISOString(), trailingStop: null };
        console.log(`[5EMA ${coin.symbol}] 🔴 ENTERED SHORT at $${price.toFixed(2)} | RSI:${rsiVal.toFixed(1)} | Alignment:Bearish`);
    } else if ((signal === "STOP_LOSS" || signal === "TAKE_PROFIT" || signal === "TRAILING_STOP") && state.position === 'long') {
        const pnl = price - state.entryPrice;
        const pnlPct = ((pnl / state.entryPrice) * 100).toFixed(2);
        console.log(`[5EMA ${coin.symbol}] ❌ EXITED ${signal} at $${price.toFixed(2)} | PnL: $${pnl.toFixed(2)} (${pnlPct}%)`);
        action = "exit";
        state = { position: null, entryPrice: null, entryTime: null, trailingStop: null };
    } else if (signal === "STOP_LOSS" && state.position === 'short') {
        const pnl = state.entryPrice - price;
        const pnlPct = ((pnl / state.entryPrice) * 100).toFixed(2);
        console.log(`[5EMA ${coin.symbol}] ❌ COVERED ${signal} at $${price.toFixed(2)} | PnL: $${pnl.toFixed(2)} (${pnlPct}%)`);
        action = "exit";
        state = { position: null, entryPrice: null, entryTime: null, trailingStop: null };
    } else if (signal === "TAKE_PROFIT" && state.position === 'short') {
        const pnl = state.entryPrice - price;
        const pnlPct = ((pnl / state.entryPrice) * 100).toFixed(2);
        console.log(`[5EMA ${coin.symbol}] ❌ COVERED ${signal} at $${price.toFixed(2)} | PnL: $${pnl.toFixed(2)} (${pnlPct}%)`);
        action = "exit";
        state = { position: null, entryPrice: null, entryTime: null, trailingStop: null };
    } else {
        signal = state.position ? "HOLD" : "WAIT";
    }
    
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
    
    return {
        symbol: coin.symbol,
        strategy: "5-EMA Scalp",
        price: price.toFixed(2),
        ema5: e5.toFixed(4),
        ema10: e10.toFixed(4),
        ema20: e20.toFixed(4),
        ema50: e50.toFixed(4),
        ema200: e200.toFixed(4),
        alignment: bullishAligned ? "BULLISH" : bearishAligned ? "BEARISH" : "NEUTRAL",
        rsi: rsiVal.toFixed(1),
        signal,
        position: state.position,
        entryPrice: state.entryPrice,
        action
    };
}

// ============ ANALYZE HOURLY WITH IMPROVEMENTS ============
async function analyzeHourly(coin, hourlyData, dailyTrend) {
    if (!hourlyData || hourlyData.length < 60) return null;

    const smaFast = calculateSMA(hourlyData, SMA_FAST);
    const smaSlow = calculateSMA(hourlyData, SMA_SLOW);
    const rsi = calculateRSI(hourlyData, RSI_PERIOD);
    const volumeSMA = calculateVolumeSMA(hourlyData, VOLUME_SMA_PERIOD);
    
    const current = hourlyData[hourlyData.length - 1];
    const prev = hourlyData[hourlyData.length - 2];
    const price = current.close;
    const fastSMA = smaFast[smaFast.length - 1];
    const slowSMA = smaSlow[smaSlow.length - 1];
    const prevFast = smaFast[smaFast.length - 2];
    const prevSlow = smaSlow[smaSlow.length - 2];
    const rsiVal = rsi[rsi.length - 1];
    const currentVolume = current.volume;
    const avgVolume = volumeSMA[volumeSMA.length - 1];
    
    const stateFile = `${STATE_DIR}/hourly_${coin.symbol}.json`;
    let state = { position: null, entryPrice: null, entryTime: null, trailingStop: null };
    try { if (fs.existsSync(stateFile)) state = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch (e) {}
    
    let signal = null;
    let action = null;
    let filters = { rsi: rsiVal, volume: currentVolume, avgVolume, dailyAlign: true, passed: true };
    
    // Check filters
    let canBuy = true;
    let canSell = true;
    
    // Multi-timeframe filter
    if (USE_MULTITIMEFRAME_FILTER) {
        if (dailyTrend === 'BEAR') canBuy = false; // Only sell in bear trend
        if (dailyTrend === 'BULL') canSell = false; // Only buy in bull trend
        filters.dailyAlign = dailyTrend === 'BULL' ? 'buy_ok' : 'sell_ok';
    }
    
    // RSI filter
    if (USE_RSI_FILTER) {
        if (canBuy && rsiVal > 35) canBuy = false; // Only buy when oversold
        if (canSell && rsiVal < 65) canSell = false; // Only sell when overbought
        filters.rsi = rsiVal.toFixed(1);
    }
    
    // Volume filter
    if (USE_VOLUME_FILTER) {
        if (currentVolume < avgVolume * 0.8) canBuy = canSell = false;
        filters.volumeOk = currentVolume > avgVolume * 0.8;
    }
    
    filters.passed = canBuy || canSell;
    
    // Entry signals - LONG: SMA bullish crossover OR RSI oversold in bull
    // Entry signals - SHORT: SMA bearish crossover OR RSI overbought in bear
    if (prevFast <= prevSlow && fastSMA > slowSMA) {
        if (canBuy) signal = "BUY";
        else signal = "BUY_BLOCKED";
    } else if (prevFast >= prevSlow && fastSMA < slowSMA) {
        if (canSell) signal = "SELL";
        else signal = "SELL_BLOCKED";
    }
    
    // RSI-based entries (NEW - for crash/rebound trading)
    if (rsiVal > 65 && dailyTrend === 'BEAR' && canSell && !signal) signal = "SHORT_ENTRY";
    if (rsiVal < 35 && dailyTrend === 'BULL' && canBuy && !signal) signal = "LONG_ENTRY";
    
    // Check stops (SL/TP/Trailing) - LONG positions
    if (state.position === 'long') {
        const slPrice = state.entryPrice * (1 - SL_HOURLY / 100);
        const tpPrice = state.entryPrice * (1 + TP_HOURLY / 100);
        const partialTPPrice = state.entryPrice * (1 + (TP_HOURLY * PARTIAL_TP_RR) / 100); // 2:1 for partial
        const breakevenPrice = state.entryPrice; // Move to breakeven
        
        const profitPct = ((price - state.entryPrice) / state.entryPrice) * 100;
        
        // Break-even stop: Move SL to entry at 1:1 profit
        if (USE_BREAKEVEN && profitPct >= BREAKEVEN_RR * SL_HOURLY && !state.breakeven) {
            state.breakeven = true;
            state.slAtBreakeven = true;
            console.log(`[HOURLY ${coin.symbol}] 🔒 Moved to BREAKEVEN at $${price.toFixed(2)}`);
        }
        
        // Partial take profit at 2:1
        if (USE_PARTIAL_TP && price >= partialTPPrice && !state.partialTaken) {
            state.partialTaken = true;
            state.partialExitPrice = price;
            const partialPnl = (price - state.entryPrice) * (PARTIAL_TP_PCT / 100);
            console.log(`[HOURLY ${coin.symbol}] 📊 Partial TP at $${price.toFixed(2)} (+${(profitPct * PARTIAL_TP_PCT / 100).toFixed(2)}%)`);
            // Continue with remaining position
        }
        
        // Update trailing stop
        if (profitPct > TRAILING_STOP_PCT) {
            const newTrailing = price * (1 - TRAILING_STOP_PCT / 100);
            if (!state.trailingStop || newTrailing > state.trailingStop) {
                state.trailingStop = newTrailing;
            }
        }
        
        // Determine effective SL (original or breakeven)
        const effectiveSL = state.slAtBreakeven ? breakevenPrice : slPrice;
        
        if (price <= effectiveSL) { 
            signal = state.partialTaken ? "STOP_LOSS_REMAINING" : "STOP_LOSS"; 
            action = "exit"; 
        }
        else if (price >= tpPrice) { signal = "TAKE_PROFIT"; action = "exit"; }
        else if (state.trailingStop && price <= state.trailingStop) { signal = "TRAILING_STOP"; action = "exit"; }
    }
    
    // Check stops (SL/TP/Trailing) - SHORT positions
    if (state.position === 'short') {
        const slPrice = state.entryPrice * (1 + SL_HOURLY / 100); // SL is ABOVE entry for shorts
        const tpPrice = state.entryPrice * (1 - TP_HOURLY / 100); // TP is BELOW entry for shorts
        const partialTPPrice = state.entryPrice * (1 - (TP_HOURLY * PARTIAL_TP_RR) / 100);
        const breakevenPrice = state.entryPrice;
        
        const profitPct = ((state.entryPrice - price) / state.entryPrice) * 100;
        
        // Break-even stop
        if (USE_BREAKEVEN && profitPct >= BREAKEVEN_RR * SL_HOURLY && !state.breakeven) {
            state.breakeven = true;
            state.slAtBreakeven = true;
            console.log(`[HOURLY ${coin.symbol}] 🔒 Moved to BREAKEVEN at $${price.toFixed(2)}`);
        }
        
        // Partial take profit
        if (USE_PARTIAL_TP && price <= partialTPPrice && !state.partialTaken) {
            state.partialTaken = true;
            console.log(`[HOURLY ${coin.symbol}] 📊 Partial TP at $${price.toFixed(2)}`);
        }
        
        // Update trailing stop
        if (profitPct > TRAILING_STOP_PCT) {
            const newTrailing = price * (1 + TRAILING_STOP_PCT / 100);
            if (!state.trailingStop || newTrailing < state.trailingStop) {
                state.trailingStop = newTrailing;
            }
        }
        
        const effectiveSL = state.slAtBreakeven ? breakevenPrice : slPrice;
        
        if (price >= effectiveSL) { signal = "STOP_LOSS"; action = "exit"; }
        else if (price <= tpPrice) { signal = "TAKE_PROFIT"; action = "exit"; }
    }
    
    // Execute
    if ((signal === "BUY" || signal === "LONG_ENTRY") && state.position !== 'long') {
        state = { 
            position: 'long', 
            entryPrice: price, 
            entryTime: new Date().toISOString(), 
            trailingStop: null,
            breakeven: false,
            slAtBreakeven: false,
            partialTaken: false,
            partialExitPrice: null
        };
        console.log(`[HOURLY ${coin.symbol}] ✅ ENTERED LONG at $${price.toFixed(2)} (RSI:${rsiVal.toFixed(1)}, Vol:${(currentVolume/avgVolume).toFixed(1)}x)`);
    } else if (signal === "SHORT_ENTRY" && state.position !== 'short') {
        state = { 
            position: 'short', 
            entryPrice: price, 
            entryTime: new Date().toISOString(), 
            trailingStop: null,
            breakeven: false,
            slAtBreakeven: false,
            partialTaken: false,
            partialExitPrice: null
        };
        console.log(`[HOURLY ${coin.symbol}] 🔻 ENTERED SHORT at $${price.toFixed(2)} (RSI:${rsiVal.toFixed(1)}, Vol:${(currentVolume/avgVolume).toFixed(1)}x)`);
    } else if ((signal === "SELL" || signal === "STOP_LOSS" || signal === "TAKE_PROFIT" || signal === "TRAILING_STOP") && state.position === 'long') {
        const pnl = price - state.entryPrice;
        const pnlPct = ((pnl / state.entryPrice) * 100).toFixed(2);
        console.log(`[HOURLY ${coin.symbol}] ❌ EXITED ${signal} at $${price.toFixed(2)} | PnL: $${pnl.toFixed(2)} (${pnlPct}%)`);
        action = "exit";
        state = { position: null, entryPrice: null, entryTime: null, trailingStop: null };
    } else if ((signal === "COVER" || signal === "STOP_LOSS" || signal === "TAKE_PROFIT") && state.position === 'short') {
        const pnl = state.entryPrice - price;
        const pnlPct = ((pnl / state.entryPrice) * 100).toFixed(2);
        console.log(`[HOURLY ${coin.symbol}] ❌ COVERED ${signal} at $${price.toFixed(2)} | PnL: $${pnl.toFixed(2)} (${pnlPct}%)`);
        action = "exit";
        state = { position: null, entryPrice: null, entryTime: null, trailingStop: null };
    } else if (signal && signal.includes("BLOCKED")) {
        signal = "WAIT";
    } else {
        signal = state.position ? "HOLD" : "WAIT";
    }
    
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
    
    return {
        symbol: coin.symbol,
        strategy: "Hourly SMA+",
        price: price.toFixed(2),
        rsi: rsiVal.toFixed(1),
        volumeRatio: (currentVolume / avgVolume).toFixed(2),
        signal,
        position: state.position,
        entryPrice: state.entryPrice,
        trailingStop: state.trailingStop?.toFixed(2),
        filters,
        action
    };
}

// ============ ANALYZE DAILY PSAR ============
async function analyzeDaily(coin, data) {
    if (!data || data.length < 30) return null;
    
    const psar = calculatePSAR(data);
    const current = data[data.length - 1];
    const currentPSAR = psar[psar.length - 1];
    const prevPSAR = psar[psar.length - 2];
    const price = current.close;
    
    const stateFile = `${STATE_DIR}/daily_${coin.symbol}.json`;
    let state = { position: null, entryPrice: null };
    try { if (fs.existsSync(stateFile)) state = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch (e) {}
    
    let signal = null;
    let action = null;
    
    // Check SL/TP
    if (state.position) {
        const sl = state.entryPrice * (1 - SL_DAILY / 100);
        const tp = state.entryPrice * (1 + TP_DAILY / 100);
        if (current.low <= sl) { signal = "STOP_LOSS"; action = "exit"; }
        else if (current.high >= tp) { signal = "TAKE_PROFIT"; action = "exit"; }
    }
    
    const prevTrend = prevPSAR.trend;
    const currentTrend = currentPSAR.trend;
    
    if (!signal) {
        if (prevTrend === -1 && currentTrend === 1 && !state.position) signal = "BUY";
        else if (prevTrend === 1 && currentTrend === -1 && state.position) signal = "SELL";
    }
    
    if (signal === "BUY" && !state.position) {
        state = { position: true, entryPrice: price };
        console.log(`[DAILY ${coin.symbol}] ✅ ENTERED LONG at $${price.toFixed(2)}`);
    } else if ((signal === "SELL" || signal === "STOP_LOSS" || signal === "TAKE_PROFIT") && state.position) {
        const pnl = price - state.entryPrice;
        const pnlPct = ((pnl / state.entryPrice) * 100).toFixed(2);
        console.log(`[DAILY ${coin.symbol}] ❌ EXITED ${signal} at $${price.toFixed(2)} | PnL: $${pnl.toFixed(2)} (${pnlPct}%)`);
        action = "exit";
        state = { position: null, entryPrice: null };
    } else {
        signal = state.position ? "HOLD" : "WAIT";
    }
    
    fs.writeFileSync(stateFile, JSON.stringify(state));
    
    return {
        symbol: coin.symbol,
        strategy: "Daily PSAR",
        price: price.toFixed(2),
        trend: currentTrend === 1 ? "BULL" : "BEAR",
        signal,
        position: state.position ? "LONG" : "FLAT",
        entryPrice: state.entryPrice,
        action
    };
}

// ============ MAIN ============
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
    console.log(`\n⏰ ${new Date().toISOString()}`);
    console.log(`📊 Monitoring: ${COINS.map(c => c.symbol).join(", ")}`);
    console.log(`⚙️ Filters: Multi-TF=${USE_MULTITIMEFRAME_FILTER}, RSI=${USE_RSI_FILTER}, Volume=${USE_VOLUME_FILTER}`);
    
    const results = { timestamp: new Date().toISOString(), hourly: [], daily: [] };
    let alerts = [];
    
    // First get daily trends for all coins
    const dailyTrends = {};
    for (const coin of COINS) {
        const dailyData = await fetchOHLCWithFallback(coin.pair, 1440, 30);
        if (dailyData && dailyData.length > 0) {
            const psar = calculatePSAR(dailyData);
            const trend = psar[psar.length - 1]?.trend === 1 ? "BULL" : "BEAR";
            dailyTrends[coin.symbol] = trend;
        }
        await sleep(200);
    }
    
    console.log(`\n📈 Daily Trends: ${Object.entries(dailyTrends).map(([k,v]) => `${k}:${v}`).join(', ')}`);
    
    // Analyze hourly
    for (const coin of COINS) {
        const hourlyData = await fetchOHLCWithFallback(coin.pair, 60, 100);
        if (hourlyData && hourlyData.length > 0) {
            const hr = await analyzeHourly(coin, hourlyData, dailyTrends[coin.symbol]);
            if (hr) {
                results.hourly.push(hr);
                if (hr.action) alerts.push(hr);
            }
        }
        await sleep(200);
    }
    
    // Analyze RSI + MACD Mean Reversion strategy
    console.log("\n📊 RSI+MACD Strategy (Mean Reversion):");
    for (const coin of COINS) {
        const hourlyData = await fetchOHLCWithFallback(coin.pair, 60, 100);
        if (hourlyData && hourlyData.length > 0) {
            const rsimacd = await analyzeRSIMACD(coin, hourlyData, dailyTrends[coin.symbol]);
            if (rsimacd) {
                const signal = rsimacd.signal || 'WAIT';
                const rsi = rsimacd.rsi || '-';
                console.log(`   ${coin.symbol}: $${rsimacd.price} | ${signal} | RSI:${rsi}`);
            }
        }
        await sleep(200);
    }
    
    // Analyze RSI-2 Strategy (Larry Connors)
    console.log("\n📊 RSI-2 Strategy (Larry Connors):");
    for (const coin of COINS) {
        const hourlyData = await fetchOHLCWithFallback(coin.pair, 60, 100);
        if (hourlyData && hourlyData.length > 0) {
            const rsi2 = await analyzeRSI2(coin, hourlyData, dailyTrends[coin.symbol]);
            if (rsi2) {
                const signal = rsi2.signal || 'WAIT';
                const rsi = rsi2.rsi || '-';
                console.log(`   ${coin.symbol}: $${rsi2.price} | ${signal} | RSI:${rsi}`);
            }
        }
        await sleep(200);
    }
    
    // Analyze 5-EMA strategy on 15-minute timeframe (Quant Science style)
    console.log("\n📊 5-EMA Strategy (15m timeframe):");
    for (const coin of COINS) {
        const m15Data = await fetchOHLCWithFallback(coin.pair, 15, 250);
        if (m15Data && m15Data.length > 0) {
            const ema5Result = await analyze5EMA(coin, m15Data, dailyTrends[coin.symbol]);
            if (ema5Result) {
                const signal = ema5Result.signal || 'WAIT';
                const align = ema5Result.alignment || '-';
                const rsi = ema5Result.rsi || '-';
                console.log(`   ${coin.symbol}: $${ema5Result.price} | ${signal} | ${align} | RSI:${rsi}`);
            }
        }
        await sleep(200);
    }
    
    // Fetch live prices
    console.log("\n⚡ Fetching live prices...");
    const prices = await fetchLivePrices(COINS);
    console.log("⚡ Got live prices:", Object.keys(prices).length);
    
    // Save summary
    fs.writeFileSync(SUMMARY_FILE, JSON.stringify(results, null, 2));
    
    // Print summary
    console.log("\n📊 SUMMARY (Hourly + Live):");
    results.hourly.forEach(h => {
        const rsi = h.rsi || '-';
        const vol = h.volumeRatio || '-';
        const live = prices[h.symbol] ? ` | LIVE: $${prices[h.symbol].toFixed(2)}` : '';
        console.log(`   ${h.symbol}: $${h.price} | ${h.signal} | RSI:${rsi} | Vol:${vol}x${live}`);
    });
    
    if (alerts.length > 0) {
        console.log("\n🚨 TRADE ALERTS:");
        alerts.forEach(a => console.log(`   ${a.symbol}: ${a.signal}`));
    }
}

main().catch(console.error);

// ============ ML STRATEGY (Simple Logistic Regression) ============
const USE_ML_STRATEGY = true;

// Simple ML signal based on multiple indicators
async function analyzeML(coin, hourlyData, dailyTrend) {
    if (!hourlyData || hourlyData.length < 50) return null;
    
    const closes = hourlyData.map(c => c.close);
    const rsi = calculateRSI(hourlyData, 14);
    const rsiVal = rsi[rsi.length - 1];
    
    // Simple SMA crossover
    const sma20 = calculateSMA(closes, 20);
    const sma50 = calculateSMA(closes, 50);
    const price = closes[closes.length - 1];
    
    // Momentum
    const roc = ((price - closes[closes.length - 10]) / closes[closes.length - 10]) * 100;
    
    // Score: -1 to 1
    let score = 0;
    
    // RSI (oversold = bullish)
    if (rsiVal < 35) score += 0.5;
    else if (rsiVal > 65) score -= 0.5;
    
    // Price vs SMA20
    if (price > sma20) score += 0.3;
    else score -= 0.3;
    
    // SMA crossover
    if (sma20 > sma50) score += 0.3;
    else score -= 0.3;
    
    // Momentum
    if (roc > 0) score += 0.2;
    else score -= 0.2;
    
    // Daily trend alignment
    if (dailyTrend === "BULL" && score > 0) score += 0.2;
    if (dailyTrend === "BEAR" && score < 0) score += 0.2;
    
    const confidence = Math.abs(score);
    const signal = score > 0.3 ? "LONG" : score < -0.3 ? "SHORT" : "NEUTRAL";
    
    return { signal, confidence, score, rsi: rsiVal };
}
