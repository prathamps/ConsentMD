#!/bin/bash

# Docker-based CI Script for Blockchain Performance Benchmarks
# Provides containerized execution environment for consistent testing

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
DOCKER_IMAGE="blockchain-benchmark-ci"
DOCKER_TAG="latest"
CONTAINER_NAME="benchmark-runner-$(date +%s)"

# Default values
BENCHMARK_SUITE="ci-light"
CONFIG_FILE="ci-config.json"
FAIL_FAST="true"
MAX_RETRIES="2"
CLEANUP="true"
VERBOSE="false"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Help function
show_help() {
    cat << EOF
Docker-based CI Script for Blockchain Performance Benchmarks

Usage: $0 [OPTIONS]

Options:
    -s, --suite SUITE           Benchmark suite to run (default: ci-light)
                               Available: ci-light, ci-medium, ci-heavy, ci-workflow, ci-full
    -c, --config FILE          Configuration file (default: ci-config.json)
    -f, --fail-fast            Fail fast on first error (default: true)
    -r, --max-retries NUM      Maximum retry attempts (default: 2)
    -t, --tag TAG              Docker image tag (default: latest)
    -n, --no-cleanup           Skip cleanup after execution
    -v, --verbose              Enable verbose output
    -h, --help                 Show this help message

Examples:
    $0 --suite ci-light
    $0 --suite ci-full --config custom-config.json --verbose
    $0 --suite ci-medium --fail-fast --max-retries 3

Environment Variables:
    DOCKER_REGISTRY           Docker registry for custom images
    SLACK_WEBHOOK_URL         Slack webhook for notifications
    CI_ENVIRONMENT            CI environment name (jenkins, github, gitlab, etc.)

EOF
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -s|--suite)
                BENCHMARK_SUITE="$2"
                shift 2
                ;;
            -c|--config)
                CONFIG_FILE="$2"
                shift 2
                ;;
            -f|--fail-fast)
                FAIL_FAST="true"
                shift
                ;;
            -r|--max-retries)
                MAX_RETRIES="$2"
                shift 2
                ;;
            -t|--tag)
                DOCKER_TAG="$2"
                shift 2
                ;;
            -n|--no-cleanup)
                CLEANUP="false"
                shift
                ;;
            -v|--verbose)
                VERBOSE="true"
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

# Validate prerequisites
validate_prerequisites() {
    log_info "Validating prerequisites..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed or not in PATH"
        exit 1
    fi
    
    # Check Docker daemon
    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running"
        exit 1
    fi
    
    # Check project structure
    if [[ ! -d "${PROJECT_ROOT}/benchmarks" ]]; then
        log_error "Benchmark directory not found: ${PROJECT_ROOT}/benchmarks"
        exit 1
    fi
    
    if [[ ! -f "${SCRIPT_DIR}/${CONFIG_FILE}" ]]; then
        log_warning "Configuration file not found: ${CONFIG_FILE}, using defaults"
    fi
    
    log_success "Prerequisites validation completed"
}

# Build Docker image
build_docker_image() {
    log_info "Building Docker image: ${DOCKER_IMAGE}:${DOCKER_TAG}"
    
    # Create Dockerfile if it doesn't exist
    local dockerfile="${SCRIPT_DIR}/Dockerfile.ci"
    if [[ ! -f "${dockerfile}" ]]; then
        create_dockerfile "${dockerfile}"
    fi
    
    # Build image
    docker build \
        -f "${dockerfile}" \
        -t "${DOCKER_IMAGE}:${DOCKER_TAG}" \
        "${PROJECT_ROOT}" \
        ${VERBOSE:+--progress=plain}
    
    log_success "Docker image built successfully"
}

# Create Dockerfile for CI
create_dockerfile() {
    local dockerfile="$1"
    
    log_info "Creating Dockerfile: ${dockerfile}"
    
    cat > "${dockerfile}" << 'EOF'
FROM node:18-alpine

# Install system dependencies
RUN apk add --no-cache \
    bash \
    curl \
    git \
    python3 \
    make \
    g++ \
    && rm -rf /var/cache/apk/*

# Set working directory
WORKDIR /app

# Copy package files
COPY ConsentMD/blockchain/caliper/caliper-benchmarks-local/package*.json ./
COPY ConsentMD/blockchain/caliper/caliper-benchmarks-local/scripts/execution/package*.json ./scripts/execution/

# Install dependencies
RUN npm ci && \
    npm install -g @hyperledger/caliper-cli && \
    cd scripts/execution && npm install

# Copy project files
COPY ConsentMD/blockchain/caliper/caliper-benchmarks-local/ ./

# Create directories
RUN mkdir -p logs reports analysis

# Set permissions
RUN chmod +x scripts/execution/*.js scripts/execution/*.sh

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node --version || exit 1

# Default command
CMD ["node", "scripts/execution/ci-benchmark.js", "--help"]
EOF
    
    log_success "Dockerfile created: ${dockerfile}"
}

# Run benchmark in Docker container
run_benchmark_container() {
    log_info "Starting benchmark container: ${CONTAINER_NAME}"
    
    # Prepare Docker run arguments
    local docker_args=(
        "run"
        "--name" "${CONTAINER_NAME}"
        "--rm"
        "-v" "${PROJECT_ROOT}/reports:/app/reports"
        "-v" "${PROJECT_ROOT}/logs:/app/logs"
    )
    
    # Add environment variables
    if [[ -n "${SLACK_WEBHOOK_URL:-}" ]]; then
        docker_args+=("-e" "SLACK_WEBHOOK_URL=${SLACK_WEBHOOK_URL}")
    fi
    
    if [[ -n "${CI_ENVIRONMENT:-}" ]]; then
        docker_args+=("-e" "CI_ENVIRONMENT=${CI_ENVIRONMENT}")
    fi
    
    # Add verbose flag if enabled
    if [[ "${VERBOSE}" == "true" ]]; then
        docker_args+=("-e" "DEBUG=*")
    fi
    
    # Prepare benchmark command
    local benchmark_cmd="node scripts/execution/ci-benchmark.js ${BENCHMARK_SUITE}"
    
    if [[ -f "${SCRIPT_DIR}/${CONFIG_FILE}" ]]; then
        docker_args+=("-v" "${SCRIPT_DIR}/${CONFIG_FILE}:/app/scripts/execution/${CONFIG_FILE}")
        benchmark_cmd+=" --config ${CONFIG_FILE}"
    fi
    
    if [[ "${FAIL_FAST}" == "true" ]]; then
        benchmark_cmd+=" --fail-fast"
    fi
    
    if [[ -n "${MAX_RETRIES}" ]]; then
        benchmark_cmd+=" --max-retries ${MAX_RETRIES}"
    fi
    
    # Add image and command
    docker_args+=("${DOCKER_IMAGE}:${DOCKER_TAG}")
    docker_args+=("sh" "-c" "${benchmark_cmd}")
    
    # Run container
    log_info "Executing: docker ${docker_args[*]}"
    
    if docker "${docker_args[@]}"; then
        log_success "Benchmark execution completed successfully"
        return 0
    else
        log_error "Benchmark execution failed"
        return 1
    fi
}

# Collect results
collect_results() {
    log_info "Collecting benchmark results..."
    
    local results_dir="${PROJECT_ROOT}/ci-results"
    mkdir -p "${results_dir}"
    
    # Copy reports
    if [[ -d "${PROJECT_ROOT}/reports" ]]; then
        cp -r "${PROJECT_ROOT}/reports"/* "${results_dir}/" 2>/dev/null || true
    fi
    
    # Copy logs
    if [[ -d "${PROJECT_ROOT}/logs" ]]; then
        cp -r "${PROJECT_ROOT}/logs"/* "${results_dir}/" 2>/dev/null || true
    fi
    
    # Generate summary
    local summary_file="${results_dir}/ci-summary.txt"
    cat > "${summary_file}" << EOF
Blockchain Performance Benchmark CI Results
==========================================

Date: $(date)
Suite: ${BENCHMARK_SUITE}
Config: ${CONFIG_FILE}
Fail Fast: ${FAIL_FAST}
Max Retries: ${MAX_RETRIES}
Docker Image: ${DOCKER_IMAGE}:${DOCKER_TAG}

Results Location: ${results_dir}

EOF
    
    # List generated files
    echo "Generated Files:" >> "${summary_file}"
    find "${results_dir}" -type f -name "*.html" -o -name "*.json" -o -name "*.log" | \
        sed 's|^|  - |' >> "${summary_file}"
    
    log_success "Results collected in: ${results_dir}"
    
    # Display summary
    if [[ "${VERBOSE}" == "true" ]]; then
        cat "${summary_file}"
    fi
}

# Send notifications
send_notifications() {
    local success="$1"
    
    if [[ -z "${SLACK_WEBHOOK_URL:-}" ]]; then
        log_info "No Slack webhook configured, skipping notifications"
        return 0
    fi
    
    log_info "Sending notifications..."
    
    local emoji="✅"
    local status="SUCCESS"
    local color="good"
    
    if [[ "${success}" != "0" ]]; then
        emoji="❌"
        status="FAILED"
        color="danger"
    fi
    
    local message="${emoji} Blockchain Benchmark CI ${status}"
    message+="\nSuite: ${BENCHMARK_SUITE}"
    message+="\nEnvironment: ${CI_ENVIRONMENT:-docker}"
    message+="\nTimestamp: $(date)"
    
    if command -v curl &> /dev/null; then
        curl -X POST \
            -H 'Content-type: application/json' \
            --data "{\"text\":\"${message}\"}" \
            "${SLACK_WEBHOOK_URL}" \
            --silent --show-error || log_warning "Failed to send Slack notification"
    else
        log_warning "curl not available, cannot send notifications"
    fi
}

# Cleanup function
cleanup() {
    if [[ "${CLEANUP}" == "true" ]]; then
        log_info "Cleaning up..."
        
        # Remove container if it exists
        if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
            docker rm -f "${CONTAINER_NAME}" &> /dev/null || true
        fi
        
        # Clean up temporary files
        find "${PROJECT_ROOT}" -name "*.tmp" -delete 2>/dev/null || true
        
        log_success "Cleanup completed"
    fi
}

# Trap cleanup on exit
trap cleanup EXIT

# Main execution
main() {
    log_info "Starting Docker-based CI benchmark execution"
    log_info "Project root: ${PROJECT_ROOT}"
    log_info "Script directory: ${SCRIPT_DIR}"
    
    parse_args "$@"
    
    log_info "Configuration:"
    log_info "  Suite: ${BENCHMARK_SUITE}"
    log_info "  Config: ${CONFIG_FILE}"
    log_info "  Fail Fast: ${FAIL_FAST}"
    log_info "  Max Retries: ${MAX_RETRIES}"
    log_info "  Docker Tag: ${DOCKER_TAG}"
    log_info "  Cleanup: ${CLEANUP}"
    log_info "  Verbose: ${VERBOSE}"
    
    validate_prerequisites
    build_docker_image
    
    local exit_code=0
    if ! run_benchmark_container; then
        exit_code=1
    fi
    
    collect_results
    send_notifications "${exit_code}"
    
    if [[ "${exit_code}" -eq 0 ]]; then
        log_success "CI benchmark execution completed successfully"
    else
        log_error "CI benchmark execution failed"
    fi
    
    exit "${exit_code}"
}

# Execute main function if script is run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi