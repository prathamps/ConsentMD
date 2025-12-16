#!/bin/bash

# ConsentMD Benchmark Setup Verification Script
# This script verifies that all prerequisites are met before running benchmarks

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
CHECKS_PASSED=0
CHECKS_FAILED=0
WARNINGS=0

# Function to check and report status
check_requirement() {
    local description=$1
    local command=$2
    local expected_result=$3
    
    echo -n "Checking $description... "
    
    if eval "$command" >/dev/null 2>&1; then
        if [ -n "$expected_result" ]; then
            local result=$(eval "$command" 2>/dev/null)
            echo -e "${GREEN}✓ $result${NC}"
        else
            echo -e "${GREEN}✓ OK${NC}"
        fi
        ((CHECKS_PASSED++))
        return 0
    else
        echo -e "${RED}✗ FAILED${NC}"
        ((CHECKS_FAILED++))
        return 1
    fi
}

# Function to check version requirement
check_version() {
    local description=$1
    local command=$2
    local min_version=$3
    
    echo -n "Checking $description... "
    
    if command -v $(echo $command | cut -d' ' -f1) >/dev/null 2>&1; then
        local version=$(eval "$command" 2>/dev/null | head -1)
        echo -e "${GREEN}✓ $version${NC}"
        ((CHECKS_PASSED++))
        
        # Note: Version comparison would require more complex logic
        # For now, just report the version found
        return 0
    else
        echo -e "${RED}✗ NOT FOUND${NC}"
        ((CHECKS_FAILED++))
        return 1
    fi
}

# Function to check file existence
check_file() {
    local description=$1
    local filepath=$2
    
    echo -n "Checking $description... "
    
    if [ -f "$filepath" ]; then
        echo -e "${GREEN}✓ Found${NC}"
        ((CHECKS_PASSED++))
        return 0
    else
        echo -e "${RED}✗ Missing: $filepath${NC}"
        ((CHECKS_FAILED++))
        return 1
    fi
}

# Function to check directory existence
check_directory() {
    local description=$1
    local dirpath=$2
    
    echo -n "Checking $description... "
    
    if [ -d "$dirpath" ]; then
        local count=$(find "$dirpath" -type f | wc -l)
        echo -e "${GREEN}✓ Found ($count files)${NC}"
        ((CHECKS_PASSED++))
        return 0
    else
        echo -e "${RED}✗ Missing: $dirpath${NC}"
        ((CHECKS_FAILED++))
        return 1
    fi
}

echo -e "${BLUE}=== ConsentMD Benchmark Setup Verification ===${NC}"
echo "This script will verify that your environment is ready for benchmark execution."
echo ""

# System Requirements
echo -e "${YELLOW}=== System Requirements ===${NC}"
check_version "Node.js version" "node --version" "18.0.0"
check_version "npm version" "npm --version" "8.0.0"
check_requirement "Available memory (>4GB)" "[ \$(free -m | awk '/^Mem:/{print \$2}') -gt 4000 ]"
check_requirement "Available disk space (>1GB)" "[ \$(df . | tail -1 | awk '{print \$4}') -gt 1000000 ]"

echo ""

# Project Structure
echo -e "${YELLOW}=== Project Structure ===${NC}"
check_directory "Benchmark configurations" "benchmarks/consent-management"
check_directory "Network configurations" "networks/fabric"
check_directory "Workload modules" "workloads"
check_file "Package.json" "package.json"
check_file "Main README" "README.md"

echo ""

# Configuration Files
echo -e "${YELLOW}=== Configuration Files ===${NC}"
check_file "Network config" "networks/fabric/fabric-network.yaml"
check_file "Consent granting benchmark" "benchmarks/consent-management/consent-granting-benchmark.yaml"
check_file "Record access benchmark" "benchmarks/consent-management/record-access-benchmark.yaml"
check_file "Consent revocation benchmark" "benchmarks/consent-management/consent-revocation-benchmark.yaml"
check_file "Mixed workload benchmark" "benchmarks/consent-management/mixed-workload-benchmark.yaml"

echo ""

# Workload Modules
echo -e "${YELLOW}=== Workload Modules ===${NC}"
check_file "Consent granting workload" "workloads/consent-granting.js"
check_file "Record access workload" "workloads/record-access.js"
check_file "Consent revocation workload" "workloads/consent-revocation.js"
check_file "Mixed workload" "workloads/mixed-workload.js"

echo ""

# Execution Scripts
echo -e "${YELLOW}=== Execution Scripts ===${NC}"
check_file "Full benchmark script (Linux)" "run-benchmarks.sh"
check_file "Full benchmark script (Windows)" "run-benchmarks.bat"
check_file "Single benchmark script (Linux)" "run-single-benchmark.sh"
check_file "Single benchmark script (Windows)" "run-single-benchmark.bat"

echo ""

# Dependencies
echo -e "${YELLOW}=== Dependencies ===${NC}"
if [ -f "package.json" ]; then
    echo -n "Checking npm dependencies... "
    if npm list >/dev/null 2>&1; then
        echo -e "${GREEN}✓ All dependencies installed${NC}"
        ((CHECKS_PASSED++))
    else
        echo -e "${YELLOW}⚠ Some dependencies missing${NC}"
        echo "  Run 'npm install' to install missing dependencies"
        ((WARNINGS++))
    fi
else
    echo -e "${RED}✗ package.json not found${NC}"
    ((CHECKS_FAILED++))
fi

echo ""

# Network Connectivity (Optional checks)
echo -e "${YELLOW}=== Network Connectivity (Optional) ===${NC}"
echo -n "Checking Docker availability... "
if command -v docker >/dev/null 2>&1; then
    echo -e "${GREEN}✓ Docker found${NC}"
    ((CHECKS_PASSED++))
    
    echo -n "Checking for running Fabric containers... "
    if docker ps | grep -q hyperledger; then
        local container_count=$(docker ps | grep hyperledger | wc -l)
        echo -e "${GREEN}✓ Found $container_count Hyperledger containers${NC}"
        ((CHECKS_PASSED++))
    else
        echo -e "${YELLOW}⚠ No Hyperledger containers running${NC}"
        echo "  Start your Fabric network before running benchmarks"
        ((WARNINGS++))
    fi
else
    echo -e "${YELLOW}⚠ Docker not found${NC}"
    echo "  Docker is required for Fabric network"
    ((WARNINGS++))
fi

echo ""

# Summary
echo -e "${BLUE}=== Verification Summary ===${NC}"
echo "Checks passed: ${GREEN}$CHECKS_PASSED${NC}"
if [ $CHECKS_FAILED -gt 0 ]; then
    echo "Checks failed: ${RED}$CHECKS_FAILED${NC}"
fi
if [ $WARNINGS -gt 0 ]; then
    echo "Warnings: ${YELLOW}$WARNINGS${NC}"
fi

echo ""

if [ $CHECKS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ Setup verification completed successfully!${NC}"
    echo ""
    echo "Your environment appears ready for benchmark execution."
    echo ""
    echo "Next steps:"
    echo "1. Ensure your Fabric network is running"
    echo "2. Run benchmarks using:"
    echo "   - Full suite: ./run-benchmarks.sh"
    echo "   - Single test: ./run-single-benchmark.sh [type]"
    echo "3. Review results in the generated reports"
    
    exit 0
else
    echo -e "${RED}✗ Setup verification found issues that need to be resolved.${NC}"
    echo ""
    echo "Please address the failed checks above before running benchmarks."
    echo ""
    echo "Common solutions:"
    echo "- Install missing dependencies: npm install"
    echo "- Check file paths and project structure"
    echo "- Verify Node.js and npm versions"
    echo "- Ensure proper file permissions"
    
    exit 1
fi