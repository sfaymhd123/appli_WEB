#!/bin/bash

# HPHII Settat - Platform Management Script

# Stop on first error
set -e

function print_help {
    echo "Usage: ./run.sh [command]"
    echo ""
    echo "Commands:"
    echo "  start       Start the entire platform (infrastructure, gateway, web interface)"
    echo "  stop        Stop the infrastructure (shuts down Docker containers)"
    echo "  build       Build all application components (domain, gateway, web)"
    echo "  restart     Stop and then start the platform"
    echo "  infra:start Start only the infrastructure (Docker containers) in the background"
    echo "  setup       Run initial setup (infrastructure, database migrations, seeding)"
    echo "  help        Show this help message"
}

case "$1" in
    start)
        echo "🚀 Starting the entire platform..."
        # This will start Docker, run migrations/seeds, and run the backend & frontend
        npm run dev:up
        ;;
    stop)
        echo "🛑 Stopping the platform infrastructure..."
        npm run infra:down
        ;;
    restart)
        echo "🔄 Restarting the platform..."
        npm run infra:down
        npm run dev:up
        ;;
    build)
        echo "📦 Building all components..."
        echo "-> Building @hphii/fhir-domain..."
        npm run build:domain
        echo "-> Building @hphii/gateway..."
        npm run gateway:build
        echo "-> Building @hphii/web..."
        npm run web:build
        echo "✅ Build completed successfully!"
        ;;
    infra:start)
        echo "🐳 Starting infrastructure..."
        npm run infra:up
        ;;
    setup)
        echo "⚙️ Running setup (infra, db, seeds)..."
        npm run setup
        ;;
    help|*)
        print_help
        ;;
esac
