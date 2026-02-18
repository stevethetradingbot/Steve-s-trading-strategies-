// Polymarket Paper Trading System
const fs = require('fs');

const STATE_FILE = '/home/matthewkania.mk/.openclaw/workspace/trading_bot/polymarket_paper.json';

// Starting balance
const STARTING_BALANCE = 1000; // USDC

function loadState() {
    if (fs.existsSync(STATE_FILE)) {
        return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
    return {
        balance: STARTING_BALANCE,
        bets: [],
        history: []
    };
}

function saveState(state) {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// Place a bet
// amount: USDC to bet
// odds: decimal odds (e.g., 0.055 = 5.5%)
// outcome: 'yes' or 'no'
// market: description of the bet
function bet(amount, odds, outcome, market) {
    const state = loadState();
    
    if (amount > state.balance) {
        console.log(`❌ Insufficient balance. Have: $${state.balance.toFixed(2)}`);
        return null;
    }
    
    const betRecord = {
        id: Date.now(),
        market,
        outcome,
        amount,
        odds,
        potentialWin: amount * (1/odds),
        timestamp: new Date().toISOString()
    };
    
    state.balance -= amount;
    state.bets.push(betRecord);
    saveState(state);
    
    console.log(`\n✅ BET PLACED:`);
    console.log(`   Market: ${market}`);
    console.log(`   Bet: $${amount} on ${outcome.toUpperCase()}`);
    console.log(`   Odds: ${(odds * 100).toFixed(1)}%`);
    console.log(`   Potential win: $${betRecord.potentialWin.toFixed(2)}`);
    console.log(`   Balance remaining: $${state.balance.toFixed(2)}`);
    
    return betRecord;
}

// Resolve a bet (mark as won or lost)
function resolve(betId, won) {
    const state = loadState();
    const betIndex = state.bets.findIndex(b => b.id === betId);
    
    if (betIndex === -1) {
        console.log('❌ Bet not found');
        return;
    }
    
    const bet = state.bets[betIndex];
    
    if (won) {
        state.balance += bet.potentialWin;
        console.log(`\n🎉 WON! Won $${(bet.potentialWin - bet.amount).toFixed(2)}`);
    } else {
        console.log(`\n😔 LOST. Lost $${bet.amount}`);
    }
    
    // Move to history
    state.history.push({
        ...bet,
        resolved: won ? 'WON' : 'LOST',
        resolvedAt: new Date().toISOString(),
        profit: won ? bet.potentialWin - bet.amount : -bet.amount
    });
    
    state.bets.splice(betIndex, 1);
    saveState(state);
    
    console.log(`   New balance: $${state.balance.toFixed(2)}`);
}

// Show current status
function status() {
    const state = loadState();
    
    console.log('\n📊 POLYMARKET PAPER TRADING STATUS');
    console.log('================================');
    console.log(`💰 Balance: $${state.balance.toFixed(2)} / $${STARTING_BALANCE}`);
    console.log(`📈 Total P/L: $${(state.balance - STARTING_BALANCE).toFixed(2)}`);
    
    if (state.bets.length > 0) {
        console.log(`\n🎫 ACTIVE BETS (${state.bets.length}):`);
        for (const b of state.bets) {
            console.log(`   - ${b.market}`);
            console.log(`     $${b.amount} on ${b.outcome} @ ${(b.odds*100).toFixed(1)}%`);
            console.log(`     Potential: $${b.potentialWin.toFixed(2)}`);
        }
    }
    
    if (state.history.length > 0) {
        const totalProfit = state.history.reduce((a, b) => a + b.profit, 0);
        console.log(`\n📜 HISTORY (${state.history.length} bets, $${totalProfit.toFixed(2)} profit):`);
        for (const h of state.history.slice(-5).reverse()) {
            console.log(`   ${h.resolved} | ${h.market} | $${h.amount} → $${h.profit >= 0 ? '+' : ''}${h.profit.toFixed(2)}`);
        }
    }
}

// Quick bet commands
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'status') {
    status();
} else if (cmd === 'bet' && args.length >= 5) {
    const amount = parseFloat(args[1]);
    const odds = parseFloat(args[2]);
    const outcome = args[3];
    const market = args.slice(4).join(' ');
    bet(amount, odds, outcome, market);
} else if (cmd === 'resolve' && args.length >= 3) {
    const betId = parseInt(args[1]);
    const won = args[2] === 'won';
    resolve(betId, won);
} else if (cmd === 'help') {
    console.log(`
 Polymarket Paper Trading Commands:
 
   node polymarket_paper.js status              - Show balance and bets
   node polymarket_paper.js bet <amount> <odds> <yes/no> "<market>"  - Place bet
   node polymarket_paper.js resolve <id> won   - Mark bet as won
   node polymarket_paper.js resolve <id> lost  - Mark bet as lost
   node polymarket_paper.js help               - Show this help
 
 Examples:
   node polymarket_paper.js bet 100 0.055 yes "Elon cuts budget 5%"
   node polymarket_paper.js resolve 123456789 won
`);
} else {
    status();
}
