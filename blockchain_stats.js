// Blockchain.info API - Free BTC stats
// Add to dashboard or run standalone

const https = require('https');

function fetchBlockchainStats() {
    return new Promise((resolve) => {
        const url = 'https://blockchain.info/stats?format=json';
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve({
                        marketPrice: json.market_price_usd,
                        hashRate: json.hash_rate,
                        nTx: json.n_tx,
                        totalBTC: json.totalbc / 1e8,
                        blocksMined: json.n_blocks_mined,
                        minutesBetweenBlocks: json.minutes_between_blocks,
                        difficulty: json.difficulty,
                        minersRevenue: json.miners_revenue_usd
                    });
                } catch (e) { resolve(null); }
            });
        }).on('error', () => resolve(null));
    });
}

function fetchMempoolStats() {
    return new Promise((resolve) => {
        const url = 'https://blockchain.info/mempool?format=json';
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    const fees = json.fees || {};
                    resolve({
                        mempoolCount: json.count,
                        totalValue: json.total_value_usd,
                        avgFee: fees.avg_fee || 0,
                        priorityFee: fees.priority_fee || 0
                    });
                } catch (e) { resolve(null); }
            });
        }).on('error', () => resolve(null));
    });
}

async function getBTCNetworkStats() {
    const [stats, mempool] = await Promise.all([
        fetchBlockchainStats(),
        fetchMempoolStats()
    ]);
    
    return { stats, mempool };
}

// Standalone test
if (require.main === module) {
    getBTCNetworkStats().then(data => {
        console.log('\n📊 BTC Network Stats\n' + '='.repeat(40));
        if (data.stats) {
            console.log(`💰 Market Price: $${data.stats.marketPrice.toLocaleString()}`);
            console.log(`⛏️  Hash Rate: ${(data.stats.hashRate / 1e12).toFixed(2)} TH/s`);
            console.log(`📝 24h Transactions: ${data.stats.nTx.toLocaleString()}`);
            console.log(`🔲 Blocks Mined: ${data.stats.blocksMined}`);
            console.log(`⏱️  Block Time: ${data.stats.minutesBetweenBlocks.toFixed(1)} min`);
            console.log(`🎯 Difficulty: ${(data.stats.difficulty / 1e12).toFixed(2)} T`);
        }
        if (data.mempool) {
            console.log(`\n🧠 Mempool:`);
            console.log(`   Pending TXs: ${data.mempool.mempoolCount.toLocaleString()}`);
            console.log(`   Avg Fee: ${data.mempool.avgFee.toFixed(0)} sat/vB`);
        }
        console.log('');
    });
}

module.exports = { getBTCNetworkStats, fetchBlockchainStats };
