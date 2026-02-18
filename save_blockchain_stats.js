// Save blockchain stats to JSON for dashboard
const fs = require('fs');
const { getBTCNetworkStats } = require('./blockchain_stats');

const OUTPUT_FILE = '/home/matthewkania.mk/.openclaw/workspace/trading_bot/blockchain_stats.json';

async function saveBlockchainStats() {
    try {
        const data = await getBTCNetworkStats();
        const output = {
            timestamp: new Date().toISOString(),
            ...data
        };
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
        console.log('✅ Blockchain stats saved');
    } catch (e) {
        console.log('❌ Blockchain stats failed:', e.message);
    }
}

saveBlockchainStats();
