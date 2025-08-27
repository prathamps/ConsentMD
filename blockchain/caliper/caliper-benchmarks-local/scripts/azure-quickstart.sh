#!/bin/bash

# Azure VM Quick Start Script for ConsentMD Blockchain Performance Testing
# Optimized for Azure Standard B2ms (2 vCPUs, 8GB RAM)

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}=== ConsentMD Blockchain Performance Testing - Azure Quick Start ===${NC}"
echo -e "${YELLOW}Optimized for Azure Standard B2ms (2 vCPUs, 8GB RAM)${NC}"
echo

# Set Azure-optimized environment variables
export NODE_OPTIONS="--max-old-space-size=4096"
export CALIPER_WORKER_REMOTE=false
export CALIPER_LOG_LEVEL=info

echo -e "${GREEN}✓${NC} Set Node.js heap size to 4GB for Azure VM"
echo -e "${GREEN}✓${NC} Configured Caliper for local execution"
echo

# Navigate to project directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

echo -e "${BLUE}Project directory:${NC} $PROJECT_ROOT"
echo

# Create reports directory
mkdir -p reports/azure-tests
echo -e "${GREEN}✓${NC} Created reports directory"

# Run Azure-optimized benchmark
echo -e "${BLUE}Running Azure-optimized benchmark...${NC}"
echo -e "${YELLOW}This will take 5-10 minutes and uses SIMULATED data only${NC}"
echo

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
REPORT_FILE="reports/azure-tests/azure-optimized-${TIMESTAMP}.html"

npx caliper launch manager \
  --caliper-workspace ./ \
  --caliper-networkconfig networks/fabric/medical-consent-network.yaml \
  --caliper-benchconfig benchmarks/scenario/simple/medical-consent/config-azure-optimized.yaml \
  --caliper-report-path "$REPORT_FILE"

echo
echo -e "${GREEN}✓ Benchmark completed successfully!${NC}"
echo -e "${BLUE}Report saved to:${NC} $REPORT_FILE"
echo
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Open the HTML report to view results"
echo "2. Run additional tests with different configurations"
echo "3. Use analysis scripts for deeper insights"
echo
echo -e "${BLUE}Available configurations for Azure VM:${NC}"
echo "- config-azure-optimized.yaml (recommended)"
echo "- config-light-load.yaml"
echo "- config-medium-load.yaml (may be resource intensive)"
echo
echo -e "${GREEN}Quick Start completed!${NC}"