// Simple Machine Learning Trading Strategy
// Uses a simple logistic regression approach for binary classification (up/down)
// Features: RSI, MACD, SMA, Volume, Price momentum

const https = require('https');

// Simple sigmoid function for logistic regression
function sigmoid(x) {
    return 1 / (1 + Math.exp(-x));
}

// Calculate features for ML model
function calculateFeatures(candles) {
    if (!candles || candles.length < 50) return null;
    
    const closes = candles.map(c => c.close);
    const volumes = candles.map(c => c.volume);
    
    // RSI (14)
    let gains = 0, losses = 0;
    for (let i = closes.length - 14; i < closes.length - 1; i++) {
        const change = closes[i + 1] - closes[i];
        if (change > 0) gains += change;
        else losses -= change;
    }
    const avgGain = gains / 14;
    const avgLoss = losses / 14;
    const rs = avgGain / (avgLoss || 0.001);
    const rsi = 100 - (100 / (1 + rs));
    
    // MACD (12, 26, 9)
    const ema12 = calculateEMA(closes, 12);
    const ema26 = calculateEMA(closes, 26);
    const macd = ema12 - ema26;
    const signal = calculateEMA([macd], 9);
    const macdHist = macd - signal;
    
    // SMA crossover
    const sma20 = calculateSMA(closes, 20);
    const sma50 = calculateSMA(closes, 50);
    const smaSignal = sma20 > sma50 ? 1 : 0;
    
    // Momentum (rate of change)
    const roc = ((closes[closes.length - 1] - closes[closes.length - 10]) / closes[closes.length - 10]) * 100;
    
    // Volume ratio
    const volSMA = calculateSMA(volumes, 20);
    const volRatio = volumes[volumes.length - 1] / (volSMA || 1);
    
    // Price position (where is price relative to 20 SMA)
    const pricePosition = (closes[closes.length - 1] - sma20) / sma20 * 100;
    
    // Volatility
    const volatility = calculateVolatility(closes);
    
    return {
        rsi,
        macd,
        macdHist,
        smaSignal,
        roc,
        volRatio,
        pricePosition,
        volatility,
        // Target: 1 if next candle is up, 0 if down
        target: closes[closes.length - 1] > closes[closes.length - 2] ? 1 : 0
    };
}

// Simple Moving Average
function calculateSMA(data, period) {
    if (data.length < period) return data[data.length - 1];
    const sum = data.slice(-period).reduce((a, b) => a + b, 0);
    return sum / period;
}

// Exponential Moving Average
function calculateEMA(data, period) {
    if (data.length < period) return data[data.length - 1];
    const multiplier = 2 / (period + 1);
    let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < data.length; i++) {
        ema = (data[i] - ema) * multiplier + ema;
    }
    return ema;
}

// Calculate volatility (standard deviation)
function calculateVolatility(data) {
    const returns = [];
    for (let i = 1; i < data.length; i++) {
        returns.push((data[i] - data[i-1]) / data[i-1]);
    }
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    return Math.sqrt(variance);
}

// Simple trained weights (in real ML, these would be learned from data)
// Based on common trading indicators that predict price movement
const WEIGHTS = {
    rsi: -0.3,      // Low RSI = buy signal
    macdHist: 0.4,  // Positive MACD histogram = bullish
    smaSignal: 0.3,  // Price above 50 SMA = bullish
    roc: 0.5,       // Positive momentum = bullish
    volRatio: 0.1,  // Higher volume = more conviction
    pricePosition: 0.2  // Price above 20 SMA = bullish
};

// Bias term
const BIAS = 0.1;

// ML-based prediction
function predict(features) {
    if (!features) return 0.5;
    
    let score = BIAS;
    score += WEIGHTS.rsi * ((50 - features.rsi) / 50);  // Normalize RSI (low is bullish)
    score += WEIGHTS.macdHist * Math.tanh(features.macdHist);
    score += WEIGHTS.smaSignal * (features.smaSignal - 0.5);
    score += WEIGHTS.roc * Math.tanh(features.roc / 10);
    score += WEIGHTS.volRatio * Math.tanh(features.volRatio);
    score += WEIGHTS.pricePosition * Math.tanh(features.pricePosition / 10);
    
    return sigmoid(score);
}

// Get prediction for a coin
async function getMLPrediction(symbol, pair) {
    try {
        const candles = await fetchCandles(pair, '60', 100);
        if (!candles || candles.length < 50) return null;
        
        const features = calculateFeatures(candles);
        if (!features) return null;
        
        const prediction = predict(features);
        
        return {
            symbol,
            prediction: prediction,
            signal: prediction > 0.6 ? 'LONG' : prediction < 0.4 ? 'SHORT' : 'NEUTRAL',
            confidence: Math.abs(prediction - 0.5) * 2, // 0 to 1
            features
        };
    } catch (e) {
        console.error(`ML prediction error for ${symbol}:`, e.message);
        return null;
    }
}

// Fetch OHLCV data from Kraken
function fetchCandles(pair, interval, count) {
    return new Promise((resolve, reject) => {
        // Kraken pair mapping
        const KRAKEN_PAIRS = {
        'ETHUSD': 'XETHZUSD',
        'XBTUSD': 'XXBTZUSD',
        'SOLUSD': 'SOLUSD',
        'XRPUSD': 'XRPUSD',
        'ADAUSD': 'ADAUSD'
    };
    const krakenPair = KRAKEN_PAIRS[pair] || pair;
        
        const url = `https://api.kraken.com/0/public/OHLC?pair=${krakenPair}&interval=${interval}`;
        
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.error && json.error.length > 0) {
                        reject(new Error(json.error.join(', ')));
                        return;
                    }
                    const pairKey = Object.keys(json.result).find(k => k !== 'last');
                    if (!pairKey) {
                        reject(new Error('No pair data found'));
                        return;
                    }
                    const ohlcs = json.result[pairKey].map(c => ({
                        time: c[0],
                        open: parseFloat(c[1]),
                        high: parseFloat(c[2]),
                        low: parseFloat(c[3]),
                        close: parseFloat(c[4]),
                        volume: parseFloat(c[6])
                    })).slice(-count).reverse();
                    resolve(ohlcs);
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

// Main function to run ML predictions on all coins
async function runMLStrategy(coins) {
    console.log('🤖 Running ML Strategy Analysis...\n');
    
    const results = [];
    
    for (const coin of coins) {
        const prediction = await getMLPrediction(coin.symbol, coin.pair);
        if (prediction) {
            results.push(prediction);
            
            console.log(`${coin.symbol}: ${prediction.signal} (${(prediction.confidence * 100).toFixed(1)}% confidence)`);
            console.log(`  Prediction score: ${prediction.prediction.toFixed(3)}`);
            console.log(`  RSI: ${prediction.features.rsi.toFixed(1)} | ROC: ${prediction.features.roc.toFixed(2)}%`);
            console.log();
        }
    }
    
    // Sort by confidence
    results.sort((a, b) => b.confidence - a.confidence);
    
    console.log('\n🎯 Top ML Signals:');
    results.slice(0, 3).forEach((r, i) => {
        console.log(`  ${i + 1}. ${r.symbol}: ${r.signal} at ${(r.confidence * 100).toFixed(1)}% confidence`);
    });
    
    return results;
}

// Export for use in other modules
module.exports = { runMLStrategy, getMLPrediction, predict, calculateFeatures };

// Run if called directly
if (require.main === module) {
    const COINS = [
        { symbol: 'ETH', pair: 'ETHUSD' },
        { symbol: 'BTC', pair: 'XBTUSD' },
        { symbol: 'SOL', pair: 'SOLUSD' },
        { symbol: 'XRP', pair: 'XRPUSD' },
        { symbol: 'ADA', pair: 'ADAUSD' }
    ];
    
    runMLStrategy(COINS).then(results => {
        console.log(`\n✅ Analyzed ${results.length} coins with ML strategy`);
    }).catch(console.error);
}
