#!/bin/bash
# Daily Polymarket scan - finds trending markets

echo "=== Polymarket Daily Scan ==="
echo "Time: $(date)"
echo ""

# Get trending markets by category
echo "📈 CRYPTO MARKETS:"
node /home/matthewkania.mk/.openclaw/workspace/skills/polymarket-odds/polymarket.mjs events --tag=crypto --limit=5 2>/dev/null

echo ""
echo "🏛️ POLITICS MARKETS:"
node /home/matthewkania.mk/.openclaw/workspace/skills/polymarket-odds/polymarket.mjs events --tag=politics --limit=5 2>/dev/null

echo ""
echo "🔍 SEARCHING FOR ELON:"
node /home/matthewkania.mk/.openclaw/workspace/skills/polymarket-odds/polymarket.mjs search "Elon" 2>/dev/null

echo ""
echo "🔍 SEARCHING FOR DOGE:"
node /home/matthewkania.mk/.openclaw/workspace/skills/polymarket-odds/polymarket.mjs search "DOGE" 2>/dev/null

echo ""
echo "=== Scan Complete ==="
