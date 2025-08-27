#!/bin/bash

# Azure VM Environment Validator for ConsentMD Blockchain Performance Testing
# Optimized for Azure Standard B2ms (2 vCPUs, 8GB RAM)

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[PASS]${NC} $1"; }
warning() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[FAIL]${NC} $1"; }

echo "=== Azure VM Environment Validation for ConsentMD ==="
echo "Optimized for Azure Standard B2ms (2 vCPUs, 8GB RAM)"
echo

# System specifications check
log "Checking system specifications..."
CPU_CORES=$(nproc)
TOTAL_MEMORY=$(free -m | awk 'NR==2{print $2}')
AVAILABLE_MEMORY=$(free -m | awk 'NR==2{print $7}')

echo "CPU Cores: $CPU_CORES"
echo "Total Memory: ${TOTAL_MEMORY}MB"
echo "Available Memory: ${AVAILABLE_MEMORY}MB"

if [[ $CPU_CORES -eq 2 ]] && [[ $TOTAL_MEMORY -ge 7000 ]] && [[ $TOTAL_MEMORY -le 9000 ]]; then
    success "System matches Azure Standard B2ms specifications"
else
    warning "System specs don't match expected Azure B2ms (2 vCPUs, ~8GB RAM)"
fi

# Node.js check
log "Checking Node.js installation..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    success "Node.js installed: $NODE_VERSION"
else
    error "Node.js not found. Please install Node.js 14+ first."
    exit 1
fi