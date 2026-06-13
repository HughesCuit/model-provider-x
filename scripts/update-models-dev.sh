#!/bin/bash

# Update Models.dev Data
# This script fetches the latest models.dev data and updates the local registry

set -e

echo "=== Updating Models.dev Data ==="
echo ""

# Check if we're in the project root
if [ ! -f "package.json" ]; then
  echo "❌ Error: Must run from project root"
  exit 1
fi

# Run the fetch script
echo "1. Fetching models.dev data..."
if ! npx tsx scripts/fetch-models-dev.ts; then
  echo "❌ Error: Failed to fetch models.dev data"
  exit 1
fi
echo "   ✅ Models.dev data fetched"

# Run tests to verify no breaking changes
echo ""
echo "2. Running tests..."
if ! npm test > /dev/null 2>&1; then
  echo "❌ Error: Tests failed after update"
  echo "   Please check the models.dev data format"
  exit 1
fi
echo "   ✅ Tests passed"

# Build to verify compilation
echo ""
echo "3. Building..."
if ! npm run build > /dev/null 2>&1; then
  echo "❌ Error: Build failed after update"
  exit 1
fi
echo "   ✅ Build passed"

# Show update summary
echo ""
echo "4. Update summary..."
MODELS_COUNT=$(node -p "JSON.parse(require('fs').readFileSync('src/data/models-dev.json', 'utf8')).providers ? Object.values(JSON.parse(require('fs').readFileSync('src/data/models-dev.json', 'utf8')).providers).reduce((acc, p) => acc + Object.keys(p.models || {}).length, 0) : 0")
PROVIDERS_COUNT=$(node -p "Object.keys(JSON.parse(require('fs').readFileSync('src/data/models-dev.json', 'utf8')).providers || {}).length")
echo "   Models: $MODELS_COUNT"
echo "   Providers: $PROVIDERS_COUNT"

echo ""
echo "=== Update complete ==="
echo ""
echo "Next steps:"
echo "  1. Review changes: git diff src/data/models-dev.json"
echo "  2. Commit: git add src/data/models-dev.json && git commit -m 'chore: update models.dev data'"
