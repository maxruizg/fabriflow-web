#!/bin/bash

# Script to start both magavi-be-v2 (Rust API) and magavi-v2 (Frontend) together
# Make sure you have the Rust toolchain installed and MongoDB running

echo "🚀 Starting Magavi development environment..."

# Check if MongoDB is running
if ! pgrep -x "mongod" > /dev/null; then
    echo "⚠️  MongoDB is not running. Please start MongoDB first:"
    echo "   brew services start mongodb/brew/mongodb-community"
    echo "   or"
    echo "   mongod --config /usr/local/etc/mongod.conf"
    exit 1
fi

# Start the Rust API in the background
echo "🦀 Starting Rust API (magavi-be-v2)..."
cd ../magavi-be-v2
cargo run &
RUST_API_PID=$!

# Wait a moment for the API to start
sleep 3

# Start the frontend
echo "⚛️  Starting Frontend (magavi-v2)..."
cd ../magavi-v2
npm run dev &
FRONTEND_PID=$!

echo "✅ Both services are starting..."
echo "🦀 Rust API: http://localhost:8080"
echo "⚛️  Frontend: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop both services"

# Function to cleanup processes on exit
cleanup() {
    echo ""
    echo "🛑 Stopping services..."
    kill $RUST_API_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    echo "✅ Services stopped"
    exit 0
}

# Set trap to cleanup on script exit
trap cleanup SIGINT SIGTERM

# Wait for either process to exit
wait $RUST_API_PID $FRONTEND_PID