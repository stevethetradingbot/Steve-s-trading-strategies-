// Polymarket Monitor - Tracks interesting markets
const https = require('https');
const fs = require('fs');

const OUTPUT_FILE = '/home/matthewkania.mk/.openclaw/workspace/trading_bot/polymarket_markets.json';

// API endpoints
const API_BASE = 'https://gamma-api.polymarket.com';
const CLOB_BASE = 'https://clob.polymarket.com';

// Categories we care about
const INTERESTING_CATEGORIES = ['crypto', 'politics', 'elections', 'tech', 'ai', 'sports'];

// ============ API FUNCTIONS ============
function fetchJSON(url) {
    return new Promise((resolve) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) { resolve(null); }
            });
        }).on('error', () => resolve(null));
    });
}

async function getMarketsByCategory(category) {
    const url = `${API_BASE}/markets?category=${category}&closed=false&limit=50`;
    return await fetchJSON(url);
}

async function getCryptoMarkets() {
    // Get crypto price markets
    const url = `${API_BASE}/markets?category=crypto&closed=false&limit=50`;
    return await fetchJSON(url);
}

async function getMarketDetails(conditionId) {
    const url = `${CLOB_BASE}/markets?condition_id=${conditionId}`;
    return await fetchJSON(url);
}

async function getOrderBook(tokenId) {
    const url = `${CLOB_BASE}/orderbook?token_id=${tokenId}`;
    return await fetchJSON(url);
}

// ============ ANALYZE MARKETS ============
function analyzeMarket(market) {
    // API returns outcomePrices as JSON string, e.g. '["0.45","0.55"]'
    let prices = [];
    let outcomes = [];
    
    try {
        const pricesStr = market.outcomePrices;
        if (typeof pricesStr === 'string') {
            prices = JSON.parse(pricesStr);
        } else if (Array.isArray(pricesStr)) {
            prices = pricesStr;
        }
        outcomes = typeof market.outcomes === 'string' ? JSON.parse(market.outcomes) : market.outcomes;
    } catch (e) {
        return null;
    }
    
    if (prices.length < 2 || !Array.isArray(outcomes)) return null;
    
    const yesPrice = parseFloat(prices[0]) || 0;
    const noPrice = parseFloat(prices[1]) || 0;
    
    // Calculate implied probability
    const totalProb = yesPrice + noPrice;
    const yesProb = totalProb > 0 ? (yesPrice / totalProb * 100) : 0;
    const noProb = totalProb > 0 ? (noPrice / totalProb * 100) : 0;
    
    return {
        question: market.question,
        slug: market.slug,
        endDate: market.endDate,
        volume24hr: parseFloat(market.volume24hr) || 0,
        liquidity: parseFloat(market.liquidity) || 0,
        yesPrice,
        noPrice,
        yesProb: yesProb.toFixed(1),
        noProb: noProb.toFixed(1),
        outcomes: outcomes.map((o, i) => ({ outcome: o, price: parseFloat(prices[i] || 0) }))
    };
}

// ============ FIND OPPORTUNITIES ============
function findOpportunities(markets) {
    const opportunities = [];
    
    for (const market of markets) {
        const analysis = analyzeMarket(market);
        if (!analysis) continue;
        
        // Look for mispriced markets (outcomes add up to != 1)
        const totalPrice = analysis.yesPrice + analysis.noPrice;
        
        // Flag if there's significant mispricing
        if (Math.abs(totalPrice - 1) > 0.05) {
            opportunities.push({
                ...analysis,
                mispricing: ((totalPrice - 1) * 100).toFixed(1)
            });
        }
        
        // Flag high confidence markets (odds > 80%)
        if (analysis.yesProb > 80 || analysis.noProb > 80) {
            opportunities.push({
                ...analysis,
                type: 'high_confidence'
            });
        }
    }
    
    return opportunities;
}

// ============ MAIN ============
async function main() {
    console.log('🔍 Polymarket Monitor');
    console.log('='.repeat(50));
    
    const allMarkets = [];
    const categories = ['crypto', 'politics', 'elections', 'ai', 'tech'];
    
    for (const cat of categories) {
        console.log(`Fetching ${cat} markets...`);
        const markets = await getMarketsByCategory(cat);
        if (markets && Array.isArray(markets)) {
            allMarkets.push(...markets);
        }
    }
    
    console.log(`\nTotal markets found: ${allMarkets.length}`);
    
    // Analyze each market
    const analyzed = allMarkets.map(m => analyzeMarket(m)).filter(m => m !== null);
    
    // Find opportunities
    const opportunities = findOpportunities(allMarkets);
    
    // Save results
    const results = {
        timestamp: new Date().toISOString(),
        totalMarkets: allMarkets.length,
        analyzed: analyzed.length,
        opportunities: opportunities.slice(0, 20)
    };
    
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
    
    // Print summary
    console.log('\n📊 MARKET SUMMARY:');
    
    // Crypto markets
    const crypto = analyzed.filter(m => 
        m.question.toLowerCase().includes('btc') ||
        m.question.toLowerCase().includes('bitcoin') ||
        m.question.toLowerCase().includes('eth') ||
        m.question.toLowerCase().includes('crypto')
    );
    
    if (crypto.length > 0) {
        console.log('\n₿ CRYPTO MARKETS:');
        crypto.slice(0, 5).forEach(m => {
            console.log(`   ${m.yesPrice.toFixed(2)} / ${m.noPrice.toFixed(2)} | ${m.question.substring(0, 50)}`);
        });
    }
    
    // High confidence opportunities
    const highConf = opportunities.filter(o => o.type === 'high_confidence');
    if (highConf.length > 0) {
        console.log('\n🎯 HIGH CONFIDENCE (>80%):');
        highConf.slice(0, 5).forEach(m => {
            console.log(`   ${m.yesProb}% YES | ${m.question.substring(0, 45)}`);
        });
    }
    
    // Mispriced opportunities
    const mispriced = opportunities.filter(o => o.mispricing);
    if (mispriced.length > 0) {
        console.log('\n💰 MISPRICED MARKETS:');
        mispriced.slice(0, 5).forEach(m => {
            console.log(`   ${m.mispricing}% off | ${m.question.substring(0, 40)}`);
        });
    }
    
    console.log(`\n💾 Results saved to ${OUTPUT_FILE}`);
    
    return results;
}

main().catch(console.error);
