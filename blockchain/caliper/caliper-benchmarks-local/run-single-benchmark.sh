#!/bin/bash

# ConsentMD Single Benchmark Execution Script
# Usage: ./run-single-benchmark.sh [benchmark-type]
# Available types: consent-granting, record-access, consent-revocation, mixed-workload

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
NETWORK_CONFIG="networks/fabric/fabric-network.yaml"
RESULTS_DIR="results/single-$(date +%Y%m%d_%H%M%S)"

# Available benchmarks
declare -A BENCHMARKS
BENCHMARKS["consent-granting"]="benchmarks/consent-management/consent-granting-benchmark.yaml"
BENCHMARKS["record-access"]="benchmarks/consent-management/record-access-benchmark.yaml"
BENCHMARKS["consent-revocation"]="benchmarks/consent-management/consent-revocation-benchmark.yaml"
BENCHMARKS["mixed-workload"]="benchmarks/consent-management/mixed-workload-benchmark.yaml"

# Function to display usage
show_usage() {
    echo -e "${BLUE}ConsentMD Single Benchmark Runner${NC}"
    echo ""
    echo "Usage: $0 [benchmark-type]"
    echo ""
    echo "Available benchmark types:"
    echo "  consent-granting     - Test consent creation performance"
    echo "  record-access        - Test record query performance"
    echo "  consent-revocation   - Test consent revocation performance"
    echo "  mixed-workload       - Test combined operations performance"
    echo ""
    echo "Examples:"
    echo "  $0 consent-granting"
    echo "  $0 mixed-workload"
    echo ""
}

# Check arguments
if [ $# -eq 0 ]; then
    show_usage
    exit 1
fi

BENCHMARK_TYPE=$1

# Validate benchmark type
if [ -z "${BENCHMARKS[$BENCHMARK_TYPE]}" ]; then
    echo -e "${RED}Error: Invalid benchmark type '$BENCHMARK_TYPE'${NC}"
    echo ""
    show_usage
    exit 1
fi

CONFIG_FILE="${BENCHMARKS[$BENCHMARK_TYPE]}"

# Create results directory
mkdir -p "$RESULTS_DIR"
LOG_FILE="$RESULTS_DIR/execution.log"

# Setup logging
exec 1> >(tee -a "$LOG_FILE")
exec 2> >(tee -a "$LOG_FILE" >&2)

echo -e "${BLUE}=== ConsentMD Single Benchmark Runner ===${NC}"
echo "Benchmark type: $BENCHMARK_TYPE"
echo "Configuration: $CONFIG_FILE"
echo "Results directory: $RESULTS_DIR"
echo "Execution log: $LOG_FILE"
echo ""

# Pre-flight checks
echo -e "${YELLOW}Performing pre-flight checks...${NC}"

if [ ! -f "$NETWORK_CONFIG" ]; then
    echo -e "${RED}Error: Network configuration not found: $NETWORK_CONFIG${NC}"
    exit 1
fi

if [ ! -f "$CONFIG_FILE" ]; then
    echo -e "${RED}Error: Benchmark configuration not found: $CONFIG_FILE${NC}"
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed or not in PATH${NC}"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo -e "${RED}Error: npm is not installed or not in PATH${NC}"
    exit 1
fi

echo -e "${GREEN}Pre-flight checks completed successfully${NC}"
echo ""

# Run the benchmark
START_TIME=$(date +%s)

echo -e "${BLUE}=== Running $BENCHMARK_TYPE Benchmark ===${NC}"
echo "Start time: $(date)"
echo ""

if npx caliper launch manager \
    --caliper-workspace ./ \
    --caliper-networkconfig "$NETWORK_CONFIG" \
    --caliper-benchconfig "$CONFIG_FILE" \
    --caliper-flow-only-test \
    --caliper-report-path "$RESULTS_DIR/${BENCHMARK_TYPE}-report.html"; then
    
    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))
    
    echo ""
    echo -e "${GREEN}✓ Benchmark completed successfully!${NC}"
    echo "Duration: ${DURATION} seconds"
    echo "Report saved to: $RESULTS_DIR/${BENCHMARK_TYPE}-report.html"
    echo ""
    echo -e "${YELLOW}Next Steps:${NC}"
    echo "1. Open the HTML report: $RESULTS_DIR/${BENCHMARK_TYPE}-report.html"
    echo "2. Review execution log: $LOG_FILE"
    echo "3. For analysis guidance: docs/performance-results-guide.md"
    
else
    echo ""
    echo -e "${RED}✗ Benchmark failed to complete${NC}"
    echo "Check the logs above for error details"
    echo "Troubleshooting guide: README.md"
    exit 1
fi