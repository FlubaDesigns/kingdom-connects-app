#!/bin/bash
# Kingdom Connects - One-Button GitHub Push
# Usage: Run this from Replit shell or set it as a workflow

echo "🚀 Pushing Kingdom Connects to GitHub..."
echo ""

# Add all changes
git add -A
echo "✅ Staged all files"

# Commit with timestamp
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
git commit -m "Auto-push from Replit - $TIMESTAMP"
echo "✅ Committed changes"

# Push to main
git push origin main
echo "✅ Pushed to GitHub main branch"

echo ""
echo "🎉 Success! Your code is now on GitHub."
