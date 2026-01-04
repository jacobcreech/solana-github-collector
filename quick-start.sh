#!/bin/bash

# Quick Start Script for Local Development

set -e

echo "============================================"
echo "Solana GitHub Collector - Quick Start"
echo "============================================"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "Creating .env file from template..."
    cp .env.example .env
    echo ""
    echo "IMPORTANT: Please edit .env and add your GitHub tokens!"
    echo "Run: nano .env"
    echo ""
    read -p "Press enter to continue after you've added tokens, or Ctrl+C to exit..."
fi

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    echo "Error: docker-compose is not installed"
    echo "Please install Docker and Docker Compose first"
    exit 1
fi

echo "Starting services..."
echo ""

# Start the services
docker-compose -f docker-compose.dev.yml up -d

echo ""
echo "Services started! Waiting for health checks..."
echo ""

# Wait for services to be healthy
sleep 10

# Check if services are running
if docker-compose -f docker-compose.dev.yml ps | grep -q "Up"; then
    echo "✓ Services are running!"
    echo ""
    echo "============================================"
    echo "Access Points:"
    echo "============================================"
    echo "Application:     http://localhost:3000"
    echo "Health Check:    http://localhost:3000/health"
    echo "Stats:           http://localhost:3000/stats"
    echo "Metrics:         http://localhost:3000/metrics"
    echo ""
    echo "============================================"
    echo "Useful Commands:"
    echo "============================================"
    echo "View logs:       docker-compose -f docker-compose.dev.yml logs -f app"
    echo "Check health:    curl http://localhost:3000/health"
    echo "Trigger search:  curl -X POST http://localhost:3000/trigger/discovery"
    echo "Stop services:   docker-compose -f docker-compose.dev.yml down"
    echo ""
    echo "To start with pgAdmin for database management:"
    echo "docker-compose -f docker-compose.dev.yml --profile tools up -d"
    echo "Then access pgAdmin at http://localhost:5050"
    echo ""
else
    echo "Warning: Services may not have started correctly"
    echo "Check logs with: docker-compose -f docker-compose.dev.yml logs"
fi
