#!/bin/bash

# ConsentMD Blockchain Performance Benchmark Runner
# Optimized for Azure Standard B2ms (2 vCPUs, 8GB RAM)

set -e  # Exit on any error

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
REPORTS_DIR="$PROJECT_ROOT/reports"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Help function
show_help() {
    cat << EOF
ConsentMD Blockchain Performance Benchmark Runner

Usage: $0 [OPTIONS]

OPTIONS:
    -c, --config CONFIG_FILE    Benchmark configuration file (required)
    -n, --network NETWORK_FILE  Network configuration file (default: networks/fabric/medical-consent-network.yaml)
    -o, --output OUTPUT_FILE    Output report file (default: auto-generated)
    -t, --test-name TEST_NAME   Custom test name
    -h, --help                  Show this help message

EXAMPLES:
    # Run Azure-optimized benchmark
    $0 -c benchmarks/scenario/simple/medical-consent/config-azure-optimized.yaml

    # Run light load test with custom output
    $0 -c config-light-load.yaml -o my-test-report.html

    # Run with custom test name
    $0 -c config-medium-load.yaml -t "Production Load Test"

AZURE VM OPTIMIZATION:
    This script is optimized for Azure Standard B2ms VMs (2 vCPUs, 8GB RAM).
    It automatically sets appropriate memory limits and resource constraints.

EOF
}

# Parse command line arguments
CONFIG_FILE=""
NETWORK_FILE="networks/fabric/medical-consent-network.yaml"
OUTPUT_FILE=""
TEST_NAME=""

while [[ $# -gt 0 ]]; do
    case $1 in
        -c|--config)
            CONFIG_FILE="$2"
            shift 2
            ;;
        -n|--network)
            NETWORK_FILE="$2"
            shift 2
            ;;
        -o|--output)
            OUTPUT_FILE="$2"
            shift 2
            ;;
        -t|--test-name)
            TEST_NAME="$2"
            shift 2
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Validate required parameters
if [[ -z "$CONFIG_FILE" ]]; then
    error "Configuration file is required. Use -c or --config option."
    show_help
    exit 1
fi

# Set default output file if not provided
if [[ -z "$OUTPUT_FILE" ]]; then
    CONFIG_BASENAME=$(basename "$CONFIG_FILE" .yaml)
    OUTPUT_FILE="$REPORTS_DIR/${CONFIG_BASENAME}-${TIMESTAMP}.html"
fi

# Ensure reports directory exists
mkdir -p "$REPORTS_DIR"

# Change to project root directory
cd "$PROJECT_ROOT"

log "Starting ConsentMD Blockchain Performance Benchmark"
log "Configuration: $CONFIG_FILE"
log "Network: $NETWORK_FILE"
log "Output: $OUTPUT_FILE"

# Azure VM Optimization - Set Node.js memory limit
export NODE_OPTIONS="--max-old-space-size=4096"
log "Set Node.js heap size to 4GB for Azure Standard B2ms"

# Set Caliper environment variables
export CALIPER_WORKER_REMOTE=false
export CALIPER_LOG_LEVEL=info

# Validate environment before running
log "Validating environment..."

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    error "Node.js is not installed or not in PATH"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node --version | cut -d'v' -f2)
REQUIRED_VERSION="14.0.0"
if ! node -e "process.exit(process.version.slice(1).split('.').map(Number).reduce((a,b,i)=>(a*1000+b),0) >= '$REQUIRED_VERSION'.split('.').map(Number).reduce((a,b,i)=>(a*1000+b),0) ? 0 : 1)"; then
    error "Node.js version $NODE_VERSION is too old. Required: $REQUIRED_VERSION or higher"
    exit 1
fi

success "Node.js version $NODE_VERSION is compatible"

# Check if Docker is running
if ! docker info &> /dev/null; then
    error "Docker is not running or not accessible"
    exit 1
fi

success "Docker is running"

# Check if blockchain network containers are running
REQUIRED_CONTAINERS=("peer0.org1.example.com" "peer0.org2.example.com" "orderer.example.com")
for container in "${REQUIRED_CONTAINERS[@]}"; do
    if ! docker ps --format "{{.Names}}" | grep -q "^${container}$"; then
        error "Required container '$container' is not running"
        log "Please start your blockchain network first"
        exit 1
    fi
done

success "All required blockchain containers are running"

# Check if configuration files exist
if [[ ! -f "$CONFIG_FILE" ]]; then
    error "Configuration file not found: $CONFIG_FILE"
    exit 1
fi

if [[ ! -f "$NETWORK_FILE" ]]; then
    error "Network configuration file not found: $NETWORK_FILE"
    exit 1
fi

success "Configuration files validated"

# Check system resources
AVAILABLE_MEMORY=$(free -m | awk 'NR==2{printf "%.0f", $7}')
if [[ $AVAILABLE_MEMORY -lt 2048 ]]; then
    warning "Available memory is low: ${AVAILABLE_MEMORY}MB. Consider closing other applications."
fi

CPU_CORES=$(nproc)
if [[ $CPU_CORES -lt 2 ]]; then
    warning "System has only $CPU_CORES CPU core(s). Performance may be limited."
fi

log "System resources: ${CPU_CORES} CPU cores, ${AVAILABLE_MEMORY}MB available memory"

# Run the benchmark
log "Starting Caliper benchmark..."
log "This may take several minutes depending on the configuration..."

# Create a temporary log file for this run
TEMP_LOG="$REPORTS_DIR/benchmark-${TIMESTAMP}.log"

# Run Caliper with error handling
if npx caliper launch manager \
    --caliper-workspace ./ \
    --caliper-networkconfig "$NETWORK_FILE" \
    --caliper-benchconfig "$CONFIG_FILE" \
    --caliper-report-path "$OUTPUT_FILE" 2>&1 | tee "$TEMP_LOG"; then
    
    success "Benchmark completed successfully!"
    log "Report generated: $OUTPUT_FILE"
    
    # Extract key metrics from the report
    if [[ -f "$OUTPUT_FILE" ]]; then
        log "Benchmark Summary:"
        # This is a simplified extraction - in practice, you'd parse the HTML report
        log "- Report file: $OUTPUT_FILE"
        log "- Log file: $TEMP_LOG"
        
        # Check if report file is not empty
        if [[ -s "$OUTPUT_FILE" ]]; then
            success "Report file created successfully ($(du -h "$OUTPUT_FILE" | cut -f1))"
        else
            warning "Report file is empty. Check the log for errors."
        fi
    fi
    
    # Cleanup temporary files
    log "Cleaning up temporary files..."
    
    # Archive the log file
    if [[ -f "$TEMP_LOG" ]]; then
        mv "$TEMP_LOG" "$REPORTS_DIR/logs/"
        mkdir -p "$REPORTS_DIR/logs/"
        mv "$TEMP_LOG" "$REPORTS_DIR/logs/benchmark-${TIMESTAMP}.log" 2>/dev/null || true
    fi
    
    log "Benchmark execution completed successfully!"
    log "Next steps:"
    log "1. Open the report: $OUTPUT_FILE"
    log "2. Analyze the results using the analysis scripts"
    log "3. Compare with previous benchmarks if available"
    
else
    error "Benchmark failed!"
    log "Check the log file for details: $TEMP_LOG"
    
    # Show last few lines of the log for immediate debugging
    if [[ -f "$TEMP_LOG" ]]; then
        log "Last 10 lines of the log:"
        tail -10 "$TEMP_LOG"
    fi
    
    exit 1
fi

# Optional: Open the report automatically if running in a desktop environment
if command -v xdg-open &> /dev/null && [[ -n "$DISPLAY" ]]; then
    log "Opening report in default browser..."
    xdg-open "$OUTPUT_FILE" &
fi

log "Benchmark script completed!"