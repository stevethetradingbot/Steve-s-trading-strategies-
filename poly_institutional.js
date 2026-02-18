/**
 * Institutional Strategy Analyzer
 * Analyzes Polymarket data using hedge fund strategies:
 * 1. Longshot Bias - Fade low probability contracts
 * 2. Calibration Analysis - Find mispriced markets
 * 3. Maker/Taker Edge - Identify liquidity providing opportunities
 */

const fs = require('fs');

const DATA_FILE = '/home/matthewkania.mk/.openclaw/workspace/trading_bot/polymarket_markets.json';

function loadMarkets() {
    try {
        const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        return data.opportunities || [];
    } catch {
        return [];
    }
}

// Strategy 1: Longshot Bias Detection
// Research shows: 1-cent contracts win 0.43% vs 1% implied = -57% mispricing
// But this means the NO side is underpriced!
function findLongshotOpportunities(markets) {
    const opportunities = [];
    
    for (const market of markets) {
        const yesPrice = market.yesPrice || 0.5;
        const noPrice = market.noPrice || 0.5;
        
        // Longshot: YES < 15%
        if (yesPrice < 0.15) {
            opportunities.push({
                type: 'LONGSHOT_FADE',
                market: market.question,
                yesPrice,
                noPrice,
                edge: 'NO side underpriced due to longshot bias',
                recommendation: 'Consider buying NO (selling the longshot)',
                confidence: 'high',
                historicalEdge: '+57%' // Based on research
            });
        }
        
        // Longshot: NO < 15%
        if (noPrice < 0.15) {
            opportunities.push({
                type: 'LONGSHOT_FADE',
                market: market.question,
                yesPrice,
                noPrice,
                edge: 'YES side underpriced due to longshot bias',
                recommendation: 'Consider buying YES (selling the longshot)',
                confidence: 'high',
                historicalEdge: '+57%'
            });
        }
    }
    
    return opportunities;
}

// Strategy 2: High Confidence Markets (>80%)
// When odds >80%, research shows some inefficiency on the other side
function findHighConfidenceOpportunities(markets) {
    const opportunities = [];
    
    for (const market of markets) {
        const yesPrice = market.yesPrice || 0.5;
        const noPrice = market.noPrice || 0.5;
        
        if (yesPrice > 0.80) {
            opportunities.push({
                type: 'HIGH_CONFIDENCE',
                market: market.question,
                yesPrice,
                noPrice,
                edge: 'Market pricing in high probability - check if fair',
                recommendation: 'Verify fundamentals match 80%+ probability',
                confidence: 'medium'
            });
        }
        
        if (noPrice > 0.80) {
            opportunities.push({
                type: 'HIGH_CONFIDENCE', 
                market: market.question,
                yesPrice,
                noPrice,
                edge: 'Market pricing in high probability - check if fair',
                recommendation: 'Verify fundamentals match 80%+ probability',
                confidence: 'medium'
            });
        }
    }
    
    return opportunities;
}

// Strategy 3: Value Bets (Probability vs Implied)
// Look for situations where you have private information edge
function findValueOpportunities(markets) {
    const opportunities = [];
    
    for (const market of markets) {
        const yesPrice = market.yesPrice || 0.5;
        const noPrice = market.noPrice || 0.5;
        
        // Mid-range: 40-60% - could be mispriced either way
        if (yesPrice >= 0.40 && yesPrice <= 0.60) {
            opportunities.push({
                type: 'MAKER_SPREAD',
                market: market.question,
                yesPrice,
                noPrice,
                edge: 'Near 50/50 - could be either direction',
                recommendation: 'If you have info edge, bet your conviction. Otherwise, spread trade.',
                confidence: 'low',
                spread: Math.abs(yesPrice - 0.5)
            });
        }
    }
    
    return opportunities;
}

// Kelly Criterion Calculator
function calculateKelly(position, bankroll, winProb, odds) {
    const b = odds - 1; // Net odds
    const p = winProb;
    const q = 1 - p;
    
    const kelly = (p * b - q) / b;
    const fractional = kelly * 0.25; // Use 1/4 Kelly
    
    const stake = bankroll * fractional;
    
    return {
        kellyPct: (kelly * 100).toFixed(2),
        stake: stake.toFixed(2),
        recommended: kelly > 0 && stake > 0
    };
}

function run() {
    console.log('🏛️ INSTITUTIONAL STRATEGY ANALYZER');
    console.log('==================================');
    console.log('Based on: 400M trade dataset research\n');
    
    const markets = loadMarkets();
    
    if (markets.length === 0) {
        console.log('❌ No market data. Run polymarket_monitor.js first.');
        return;
    }
    
    console.log(`📊 Analyzing ${markets.length} markets...\n`);
    
    // Apply strategies
    const longshots = findLongshotOpportunities(markets);
    const highConf = findHighConfidenceOpportunities(markets);
    const value = findValueOpportunities(markets);
    
    // Summary
    console.log('='.repeat(50));
    console.log('📈 STRATEGY RESULTS');
    console.log('='.repeat(50));
    
    console.log(`\n🎯 LONGSHOT BIAS (Fade low prob): ${longshots.length}`);
    for (const opp of longshots.slice(0, 3)) {
        console.log(`   ${opp.yesPrice < 0.15 ? 'YES' : 'NO'} @ ${(Math.max(opp.yesPrice, opp.noPrice) * 100).toFixed(1)}%`);
        console.log(`   → ${opp.recommendation}`);
    }
    
    console.log(`\n📊 HIGH CONFIDENCE (>80%): ${highConf.length}`);
    for (const opp of highConf.slice(0, 3)) {
        console.log(`   ${opp.yesPrice > 0.8 ? 'YES' : 'NO'} @ ${(Math.max(opp.yesPrice, opp.noPrice) * 100).toFixed(1)}%`);
    }
    
    console.log(`\n💰 VALUE/SPREAD (40-60%): ${value.length}`);
    
    // Kelly example
    console.log('\n' + '='.repeat(50));
    console.log('💸 KELLY CRITERION EXAMPLE');
    console.log('='.repeat(50));
    
    const kelly = calculateKelly(100, 1000, 0.55, 2.0);
    console.log(`Bankroll: $1000 | Odds: 2.0 (50%) | Your edge: 55%`);
    console.log(`Kelly: ${kelly.kellyPct}% | Stake: $${kelly.stake}`);
    console.log(`→ Use 1/4 Kelly for safety: $${kelly.stake}`);
    
    console.log('\n' + '='.repeat(50));
    console.log('📋 KEY TAKEAWAYS');
    console.log('='.repeat(50));
    console.log(`
1. LONGSHOT BIAS: Contracts <15% underperform by ~57%
   → Sell longshots / fade low odds
   
2. MAKER EDGE: Takers lose at 80/99 price levels
   → Provide liquidity, collect spread
   
3. KELLY SIZING: Never use full Kelly!
   → Use 1/4 to 1/2 Kelly for safety
   
4. MONTE CARLO: Size for 95th percentile drawdown
   → Don't risk ruin on unlikely sequences
`);
    
    console.log('✅ Analysis complete');
}

run();
