// Polymarket Value Scanner - Finds mispriced markets
const https = require('https');
const fs = require('fs');

const OUTPUT_FILE = '/home/matthewkania.mk/.openclaw/workspace/trading_bot/polymarket_value.json';

function fetchMarkets() {
    return new Promise((resolve) => {
        const data = [];
        function getPage(offset = 0) {
            const url = `https://gamma-api.polymarket.com/markets?closed=false&limit=500&offset=${offset}`;
            https.get(url, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    try {
                        const markets = JSON.parse(body);
                        if (markets && markets.length > 0) {
                            data.push(...markets);
                            if (markets.length === 500) {
                                getPage(offset + 500);
                            } else {
                                resolve(data);
                            }
                        } else {
                            resolve(data);
                        }
                    } catch (e) { resolve(data); }
                });
            }).on('error', () => resolve(data));
        }
        getPage(0);
    });
}

function analyzeMarkets(markets) {
    const opportunities = [];
    const suspicious = [];
    
    // Group markets by event
    const events = {};
    for (const m of markets) {
        const q = m.question || '';
        let topic = 'Other';
        if (q.includes('NBA Finals') || q.includes('NBA')) topic = 'NBA';
        else if (q.includes('World Cup') || q.includes('FIFA')) topic = 'Soccer';
        else if (q.includes('Stanley Cup') || q.includes('NHL')) topic = 'NHL';
        else if (q.includes('Trump') || q.includes('Republican') || q.includes('Democratic')) topic = 'Politics';
        else if (q.includes('Harvey')) topic = 'HarveyWeinstein';
        else if (q.includes('Elon') || q.includes('budget')) topic = 'ElonBudget';
        
        if (!events[topic]) events[topic] = [];
        
        const prices = m.outcomePrices;
        let pricesArr = prices;
        if (typeof prices === 'string') {
            try { pricesArr = JSON.parse(prices); } catch { pricesArr = null; }
        }
        
        if (pricesArr && pricesArr.length >= 2) {
            const yesPrice = parseFloat(pricesArr[0]);
            const noPrice = parseFloat(pricesArr[1]);
            const volume = parseFloat(m.volume24hr || 0);
            
            events[topic].push({
                question: q,
                yes: yesPrice,
                no: noPrice,
                volume: volume,
                endDate: m.endDate,
                id: m.id
            });
        }
    }
    
    // Check each topic for mispricing
    for (const [topic, markets] of Object.entries(events)) {
        if (markets.length < 2) continue;
        
        const sum = markets.reduce((a, b) => a + b.yes * 100, 0);
        
        // Harvey Weinstein - already convicted
        if (topic === 'HarveyWeinstein') {
            const noPrison = markets.find(m => m.question.includes('no prison time'));
            if (noPrison && noPrison.yes > 0.20) {
                suspicious.push({
                    type: 'OVERPRICED',
                    question: noPrison.question,
                    current: (noPrison.yes * 100).toFixed(1) + '%',
                    fair: '<5%',
                    reason: 'Already convicted, will definitely go to prison',
                    volume: noPrison.volume,
                    bet: 'NO',
                    expectedReturn: ((1 - noPrison.yes) / noPrison.yes * 100).toFixed(0) + '%'
                });
            }
        }
        
        // Elon budget cuts
        if (topic === 'ElonBudget') {
            const cut5 = markets.find(m => m.question.includes('at least 5%'));
            if (cut5 && cut5.yes < 0.20) {
                suspicious.push({
                    type: 'UNDERPRICED',
                    question: cut5.question,
                    current: (cut5.yes * 100).toFixed(1) + '%',
                    fair: '90%+',
                    reason: 'DOGE has already cut billions publicly',
                    volume: cut5.volume,
                    bet: 'YES',
                    expectedReturn: ((1 - cut5.yes) / cut5.yes * 100).toFixed(0) + '%'
                });
            }
        }
        
        // NBA Finals sum check
        if (topic === 'NBA' && markets.length > 10) {
            if (Math.abs(sum - 100) > 15) {
                opportunities.push({
                    type: 'INEFFICIENT',
                    topic: 'NBA Finals 2026',
                    sum: sum.toFixed(1) + '%',
                    expected: '100%',
                    markets: markets.length
                });
            }
        }
    }
    
    // High volume + mid-range odds = potential value
    for (const m of markets) {
        if (m.volume > 5000 && m.yes > 0.08 && m.yes < 0.40) {
            opportunities.push({
                type: 'VOLUME_ODDS',
                question: m.question,
                odds: (m.yes * 100).toFixed(1) + '%',
                volume: m.volume,
                endDate: m.endDate
            });
        }
    }
    
    return { opportunities, suspicious };
}

async function main() {
    console.log('🔍 Polymarket Value Scanner');
    console.log('Fetching markets...\n');
    
    const markets = await fetchMarkets();
    console.log(`Found ${markets.length} markets`);
    
    const { opportunities, suspicious } = analyzeMarkets(markets);
    
    console.log('\n🚨 SUSPICIOUS PRICING:');
    console.log('='*80);
    if (suspicious.length === 0) {
        console.log('No obvious mispricing found');
    }
    for (const s of suspicious) {
        console.log(`\n[${s.type}] ${s.question}`);
        console.log(`  Current: ${s.current} | Fair: ${s.fair}`);
        console.log(`  BET: ${s.bet} | Expected Return: ${s.expectedReturn}`);
        console.log(`  Reason: ${s.reason}`);
        console.log(`  Volume: $${s.volume.toLocaleString()}`);
    }
    
    console.log('\n📊 TOP OPPORTUNITIES (High Vol + Mid Odds):');
    console.log('='*80);
    const volOpp = opportunities.filter(o => o.type === 'VOLUME_ODDS').slice(0, 10);
    for (const o of volOpp) {
        console.log(`${o.odds} | $${o.volume.toLocaleString()} | ${o.question.slice(0,50)}`);
    }
    
    // Save results
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify({
        timestamp: new Date().toISOString(),
        suspicious,
        opportunities: opportunities.slice(0, 20)
    }, null, 2));
    
    console.log(`\n💾 Saved to ${OUTPUT_FILE}`);
}

main().catch(console.error);
