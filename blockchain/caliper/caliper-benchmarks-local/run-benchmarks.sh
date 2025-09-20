#!/bin/bash

# ConsentMD Caliper Benchmark Execution Script
# This script runs individual benchmark configurations for consent management operations

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
NETWORK_CONFIG="networks/fabric/consent-management-network.yaml"
RESULTS_DIR="results/$(date +%Y%m%d_%H%M%S)"
LOG_FILE="$RESULTS_DIR/execution.log"

# Create results directory
mkdir -p "$RESULTS_DIR"

# Setup logging
exec 1> >(tee -a "$LOG_FILE")
exec 2> >(tee -a "$LOG_FILE" >&2)

echo -e "${BLUE}=== ConsentMD Caliper Benchmark Suite ===${NC}"
echo "Starting benchmark execution..."
echo "Results will be saved to: $RESULTS_DIR"
echo "Execution log: $LOG_FILE"
echo ""

# Pre-flight checks
echo -e "${YELLOW}Performing pre-flight checks...${NC}"

# Check if network config exists
if [ ! -f "$NETWORK_CONFIG" ]; then
    echo -e "${RED}Error: Network configuration not found: $NETWORK_CONFIG${NC}"
    echo "Please ensure the Fabric network configuration is properly set up."
    exit 1
fi

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed or not in PATH${NC}"
    exit 1
fi

# Check if npm is available
if ! command -v npm &> /dev/null; then
    echo -e "${RED}Error: npm is not installed or not in PATH${NC}"
    exit 1
fi

# Check if Caliper is available
if ! npm list @hyperledger/caliper-cli &> /dev/null; then
    echo -e "${YELLOW}Warning: Caliper CLI not found in local dependencies${NC}"
    echo "Attempting to use npx to run Caliper..."
fi

echo -e "${GREEN}Pre-flight checks completed successfully${NC}"
echo ""

# Function to run a benchmark
run_benchmark() {
    local benchmark_name=$1
    local config_file=$2
    local start_time=$(date +%s)
    
    echo ""
    echo -e "${BLUE}=== Running $benchmark_name Benchmark ===${NC}"
    echo "Configuration: $config_file"
    echo "Start time: $(date)"
    
    # Check if config file exists
    if [ ! -f "$config_file" ]; then
        echo -e "${RED}Error: Benchmark configuration not found: $config_file${NC}"
        return 1
    fi
    
    # Run the benchmark with error handling
    if npx caliper launch manager \
        --caliper-workspace ./ \
        --caliper-networkconfig "$NETWORK_CONFIG" \
        --caliper-benchconfig "$config_file" \
        --caliper-flow-only-test \
        --caliper-report-path "$RESULTS_DIR/${benchmark_name}-report.html"; then
        
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        echo -e "${GREEN}✓ Completed $benchmark_name benchmark successfully${NC}"
        echo "Duration: ${duration} seconds"
        echo "Report saved to: $RESULTS_DIR/${benchmark_name}-report.html"
        return 0
    else
        echo -e "${RED}✗ Failed to complete $benchmark_name benchmark${NC}"
        echo "Check the logs above for error details"
        return 1
    fi
}

# Track overall execution
TOTAL_START_TIME=$(date +%s)
FAILED_BENCHMARKS=()
SUCCESSFUL_BENCHMARKS=()

# Run individual benchmarks
echo ""
echo -e "${YELLOW}Starting individual benchmark tests...${NC}"

# 1. Consent Granting Benchmark (5 minutes)
if run_benchmark "consent-granting" "benchmarks/consent-management/consent-granting-benchmark.yaml"; then
    SUCCESSFUL_BENCHMARKS+=("consent-granting")
else
    FAILED_BENCHMARKS+=("consent-granting")
fi

# 2. Record Access Benchmark (5 minutes)  
if run_benchmark "record-access" "benchmarks/consent-management/record-access-benchmark.yaml"; then
    SUCCESSFUL_BENCHMARKS+=("record-access")
else
    FAILED_BENCHMARKS+=("record-access")
fi

# 3. Consent Revocation Benchmark (5 minutes)
if run_benchmark "consent-revocation" "benchmarks/consent-management/consent-revocation-benchmark.yaml"; then
    SUCCESSFUL_BENCHMARKS+=("consent-revocation")
else
    FAILED_BENCHMARKS+=("consent-revocation")
fi

# 4. Mixed Workload Benchmark (5 minutes)
if run_benchmark "mixed-workload" "benchmarks/consent-management/mixed-workload-benchmark.yaml"; then
    SUCCESSFUL_BENCHMARKS+=("mixed-workload")
else
    FAILED_BENCHMARKS+=("mixed-workload")
fi

# Summary
TOTAL_END_TIME=$(date +%s)
TOTAL_DURATION=$((TOTAL_END_TIME - TOTAL_START_TIME))

echo ""
echo -e "${BLUE}=== Benchmark Execution Summary ===${NC}"
echo "Total execution time: ${TOTAL_DURATION} seconds ($(date -d@${TOTAL_DURATION} -u +%H:%M:%S))"
echo "Results directory: $RESULTS_DIR"

if [ ${#SUCCESSFUL_BENCHMARKS[@]} -gt 0 ]; then
    echo -e "${GREEN}Successful benchmarks (${#SUCCESSFUL_BENCHMARKS[@]}):"
    for benchmark in "${SUCCESSFUL_BENCHMARKS[@]}"; do
        echo -e "  ✓ $benchmark"
    done
fi

if [ ${#FAILED_BENCHMARKS[@]} -gt 0 ]; then
    echo -e "${RED}Failed benchmarks (${#FAILED_BENCHMARKS[@]}):"
    for benchmark in "${FAILED_BENCHMARKS[@]}"; do
        echo -e "  ✗ $benchmark"
    done
fi

echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "1. Review HTML reports: open $RESULTS_DIR/*.html in your browser"
echo "2. Check execution log: cat $LOG_FILE"
echo "3. For detailed analysis, see: docs/performance-results-guide.md"

if [ ${#FAILED_BENCHMARKS[@]} -gt 0 ]; then
    echo -e "${RED}4. Investigate failed benchmarks using the troubleshooting guide in README.md${NC}"
    exit 1
else
    echo -e "${GREEN}All benchmarks completed successfully!${NC}"
    exit 0
fi