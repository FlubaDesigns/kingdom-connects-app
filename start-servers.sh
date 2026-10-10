#!/bin/bash

# Kingdom Connects - Start both servers
# Runs Python web server (port 5000) and Node.js email server (port 3000)

# Set Firebase service account for Admin SDK
export GOOGLE_APPLICATION_CREDENTIALS="$(pwd)/firebase-service-account.json"

echo "Starting Kingdom Connects servers..."

# Start Node.js email server in background
echo "Starting email server on port 3000..."
node email-server.js &
EMAIL_PID=$!

# Wait a moment for email server to initialize
sleep 2

# Start Python web server (foreground)
echo "Starting web server on port 5000..."
python3 server.py

# If Python server exits, kill email server
kill $EMAIL_PID 2>/dev/null
