#!/bin/bash

echo "🚀 Deploying Kingdom Connects to Firebase Hosting..."
echo ""

# Use the service account JSON file
export GOOGLE_APPLICATION_CREDENTIALS="attached_assets/kc-service-account_1762737530761.json"

# Deploy to Firebase
npx firebase deploy --only hosting --non-interactive

echo ""
echo "✅ Deployment complete!"
echo "🌐 Live at: https://kingdom-commerce.web.app"
