/**
 * Carry Trade Monitor
 * Tracks Japanese yen carry trade health and risk signals
 * 
 * Signals:
 * - Carry Trade UNWINDING: Yen strengthens, risk assets falling
 * - Carry Trade SAFE: Yen stable/weak, risk assets rising
 */

const CACHE_FILE = '/home/matthewkania.mk/.openclaw/workspace/memory/carry_trade_cache.json';
const fs = require('fs');

// Simple cache
function getCache() {
    try {
        return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    } catch { return {}; }
}

function setCache(data) {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
}

async function getUSDJPY() {
    try {
        const res = await fetch('https://open.er-api.com/v6/latest/USD');
        const data = await res.json();
        return data.rates?.JPY || null;
    } catch {
        return null;
    }
}

async function getVIX() {
    try {
        const res = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX');
        const data = await res.json();
        if (data.chart?.result?.[0]?.meta?.regularMarketPrice) {
            return data.chart.result[0].meta.regularMarketPrice;
        }
    } catch { }
    return null;
}

async function getBTC() {
    try {
        const res = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
        const data = await res.json();
        return parseFloat(data.price);
    } catch { return null; }
}

async function run() {
    console.log('� Carry Trade Monitor');
    console.log('====================');
    
    const cache = getCache();
    const now = Date.now();
    
    // Get data
    const [usdJpy, vix, btc] = await Promise.all([getUSDJPY(), getVIX(), getBTC()]);
    
    if (!usdJpy) {
        console.log('❌ Could not fetch USD/JPY');
        return;
    }
    
    console.log(`💴 USD/JPY: ${usdJpy.toFixed(2)}`);
    console.log(`📊 VIX: ${vix ? vix.toFixed(2) : 'N/A'}`);
    console.log(`₿ BTC: $${btc ? btc.toFixed(0) : 'N/A'}`);
    
    // Analyze carry trade
    let signal = '🟢 SAFE';
    let reason = [];
    
    // Track changes
    const prevJpy = cache.usdJpy;
    const jpyChange = prevJpy ? ((usdJpy - prevJpy) / prevJpy * 100) : 0;
    
    console.log(`\n📈 Changes:`);
    console.log(`   JPY: ${prevJpy ? jpyChange.toFixed(2) + '%' : 'N/A'}`);
    
    // UNWINDING signals
    if (jpyChange < -2) {
        signal = '🔴 UNWINDING';
        reason.push('Yen strengthened >2%');
    }
    
    if (vix && vix > 30) {
        signal = '🔴 UNWINDING';
        reason.push('VIX > 30 (fear)');
    }
    
    if (vix && vix > 25) {
        reason.push('VIX elevated (>25)');
    }
    
    // Calculate carry attractiveness
    // Assume Japan rates ~0.25% now, US ~4.5%
    const japanRate = 0.25; // Approximate current BOJ rate
    const usRate = 4.5;
    const carrySpread = usRate - japanRate;
    
    console.log(`\n💰 Carry Trade:`);
    console.log(`   Spread: ~${carrySpread.toFixed(2)}% (US ${usRate}% - JP ${japanRate}%)`);
    console.log(`   Status: ${signal}`);
    
    if (reason.length > 0) {
        console.log(`   Warnings: ${reason.join(', ')}`);
    }
    
    // Risk assessment
    console.log(`\n🎯 Risk Assessment:`);
    
    if (signal === '🔴 UNWINDING') {
        console.log('   → Consider: Stop loss, reduce exposure, prepare for more downside');
        console.log('   → Crypto: Likely to drop further');
    } else if (carrySpread > 3) {
        console.log('   → Carry trade still profitable, but watch JPY movements');
    } else {
        console.log('   → Carry trade neutral, normal market conditions');
    }
    
    // Update cache
    setCache({ usdJpy, vix, btc, updated: new Date().toISOString() });
    
    console.log(`\n✅ Last updated: ${new Date().toISOString()}`);
}

run().catch(console.error);
