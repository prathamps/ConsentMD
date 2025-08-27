# Usage Guide for ConsentMD Blockchain Performance Analysis

## Overview

This guide provides step-by-step instructions for executing blockchain performance benchmarks using Hyperledger Caliper on the ConsentMD medical consent management network. It covers everything from basic setup to advanced analysis workflows.

## Table of Contents

1. [Quick Start Guide](#quick-start-guide)
2. [Step-by-Step Execution](#step-by-step-execution)
3. [Benchmark Scenarios](#benchmark-scenarios)
4. [Analysis Workflows](#analysis-workflows)
5. [Best Practices](#best-practices)
6. [Advanced Usage](#advanced-usage)

## Quick Start Guide

### Prerequisites

Before running benchmarks, ensure you have:

- Node.js 14+ installed
- Docker and Docker Compose running
- ConsentMD blockchain network deployed
- Caliper CLI installed globally

### 5-Minute Quick Test

1. **Navigate to benchmark directory**:

   ```bash
   cd ConsentMD/blockchain/caliper/caliper-benchmarks-local
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Validate environment**:

   ```bash
   node scripts/validation/index.js
   ```

4. **Run a simple benchmark**:

   ```bash
   npx caliper launch manager \
     --caliper-workspace ./ \
     --caliper-networkconfig networks/fabric/medical-consent-network.yaml \
     --caliper-benchconfig benchmarks/scenario/simple/medical-consent/config-light-load.yaml
   ```

5. **View results**:
   ```bash
   open report.html  # macOS
   # or
   xdg-open report.html  # Linux
   # or open report.html in your browser
   ```

## Step-by-Step Execution

### Step 1: Environment Preparation

#### 1.1 Verify System Requirements

```bash
# Check Node.js version (should be 14+)
node --version

# Check npm version
npm --version

# Check Docker status
docker --version
docker ps

# Check available memory (minimum 8GB recommended)
free -h
```

#### 1.2 Validate Blockchain Network

```bash
# Check if blockchain containers are running
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Expected containers:
# - peer0.org1.example.com
# - peer0.org2.example.com
# - orderer.example.com
# - ca.org1.example.com
# - ca.org2.example.com
```

#### 1.3 Test Network Connectivity

```bash
# Test peer connectivity
curl -k https://localhost:7051
curl -k https://localhost:8051

# Test orderer connectivity
curl -k https://localhost:7050
```

### Step 2: Configuration Setup

#### 2.1 Update Certificate Paths

Edit `networks/fabric/medical-consent-network.yaml`:

```yaml
organizations:
  - mspid: Org1MSP
    identities:
      certificates:
        - name: User1
          clientPrivateKey:
            path: /absolute/path/to/your/keystore/priv_sk
          clientSignedCert:
            path: /absolute/path/to/your/signcerts/cert.pem
```

**Find your certificate paths**:

```bash
# Find private key
find /path/to/crypto-config -name "*_sk" -type f

# Find signed certificate
find /path/to/crypto-config -name "cert.pem" -type f
```

#### 2.2 Verify Connection Profiles

Check `networks/fabric/connection-org1-caliper.json` and `connection-org2-caliper.json` for correct:

- Peer URLs and ports
- TLS certificate paths
- Channel and chaincode names

#### 2.3 Choose Benchmark Configuration

Select appropriate configuration based on your testing goals:

- **Light Load** (`config-light-load.yaml`): Basic functionality testing
- **Medium Load** (`config-medium-load.yaml`): Normal operational testing
- **Heavy Load** (`config-heavy-load.yaml`): High-volume testing
- **Stress Test** (`config-stress-test.yaml`): System limit testing

### Step 3: Benchmark Execution

#### 3.1 Basic Benchmark Execution

```bash
# Navigate to benchmark directory
cd ConsentMD/blockchain/caliper/caliper-benchmarks-local

# Run light load benchmark
npx caliper launch manager \
  --caliper-workspace ./ \
  --caliper-networkconfig networks/fabric/medical-consent-network.yaml \
  --caliper-benchconfig benchmarks/scenario/simple/medical-consent/config-light-load.yaml \
  --caliper-report-path ./reports/light-load-$(date +%Y%m%d-%H%M%S).html
```

#### 3.2 Benchmark with Custom Parameters

```bash
# Set custom worker count and logging
export CALIPER_WORKER_REMOTE=false
export CALIPER_LOG_LEVEL=info

npx caliper launch manager \
  --caliper-workspace ./ \
  --caliper-networkconfig networks/fabric/medical-consent-network.yaml \
  --caliper-benchconfig benchmarks/scenario/simple/medical-consent/config-medium-load.yaml \
  --caliper-report-path ./reports/medium-load-$(date +%Y%m%d-%H%M%S).html
```

#### 3.3 Workflow Scenario Execution

```bash
# Run complete patient journey workflow
npx caliper launch manager \
  --caliper-workspace ./ \
  --caliper-networkconfig networks/fabric/medical-consent-network.yaml \
  --caliper-benchconfig benchmarks/scenario/simple/medical-consent/config-patient-journey-workflow.yaml \
  --caliper-report-path ./reports/patient-journey-$(date +%Y%m%d-%H%M%S).html
```

### Step 4: Results Analysis

#### 4.1 Basic Report Review

1. **Open HTML Report**:

   ```bash
   # Open the generated report
   open reports/light-load-20240827-143022.html
   ```

2. **Key Metrics to Review**:
   - **Throughput (TPS)**: Transactions per second achieved
   - **Latency**: Min, max, average, and percentile response times
   - **Success Rate**: Percentage of successful transactions
   - **Resource Usage**: CPU, memory, and network utilization

#### 4.2 Advanced Analysis

```bash
# Generate comparative analysis
node scripts/reporting/comparativeAnalyzer.js \
  --baseline reports/light-load-20240827-143022.html \
  --comparison reports/medium-load-20240827-144533.html \
  --output reports/comparison-analysis.html

# Run statistical analysis
node scripts/reporting/statisticalAnalyzer.js \
  --input reports/light-load-20240827-143022.html \
  --output reports/statistical-analysis.json

# Generate performance recommendations
node scripts/reporting/bottleneckAnalyzer.js \
  --input reports/medium-load-20240827-144533.html \
  --output reports/bottleneck-analysis.txt
```

## Benchmark Scenarios

### Scenario 1: Function Performance Baseline

**Objective**: Establish baseline performance for each chaincode function

**Configuration**: `config-light-load.yaml`

**Execution**:

```bash
npx caliper launch manager \
  --caliper-workspace ./ \
  --caliper-networkconfig networks/fabric/medical-consent-network.yaml \
  --caliper-benchconfig benchmarks/scenario/simple/medical-consent/config-light-load.yaml \
  --caliper-report-path ./reports/baseline-$(date +%Y%m%d-%H%M%S).html
```

**Expected Results**:

- Individual function performance metrics
- Baseline TPS for each operation type
- Resource utilization patterns

**Analysis Focus**:

- Identify fastest/slowest functions
- Compare read vs write operation performance
- Establish performance baselines for regression testing

### Scenario 2: Load Scalability Testing

**Objective**: Determine optimal load levels and scaling characteristics

**Execution Sequence**:

```bash
# Light load
npx caliper launch manager \
  --caliper-workspace ./ \
  --caliper-networkconfig networks/fabric/medical-consent-network.yaml \
  --caliper-benchconfig benchmarks/scenario/simple/medical-consent/config-light-load.yaml \
  --caliper-report-path ./reports/scalability-light-$(date +%Y%m%d-%H%M%S).html

# Medium load
npx caliper launch manager \
  --caliper-workspace ./ \
  --caliper-networkconfig networks/fabric/medical-consent-network.yaml \
  --caliper-benchconfig benchmarks/scenario/simple/medical-consent/config-medium-load.yaml \
  --caliper-report-path ./reports/scalability-medium-$(date +%Y%m%d-%H%M%S).html

# Heavy load
npx caliper launch manager \
  --caliper-workspace ./ \
  --caliper-networkconfig networks/fabric/medical-consent-network.yaml \
  --caliper-benchconfig benchmarks/scenario/simple/medical-consent/config-heavy-load.yaml \
  --caliper-report-path ./reports/scalability-heavy-$(date +%Y%m%d-%H%M%S).html
```

**Analysis**:

```bash
# Compare all load levels
node scripts/reporting/comparativeAnalyzer.js \
  --reports reports/scalability-*.html \
  --output reports/scalability-analysis.html
```

### Scenario 3: Workflow Performance Testing

**Objective**: Test realistic user workflows and data dependencies

**Patient Journey Workflow**:

```bash
npx caliper launch manager \
  --caliper-workspace ./ \
  --caliper-networkconfig networks/fabric/medical-consent-network.yaml \
  --caliper-benchconfig benchmarks/scenario/simple/medical-consent/config-patient-journey-workflow.yaml \
  --caliper-report-path ./reports/patient-journey-$(date +%Y%m%d-%H%M%S).html
```

**Doctor Workflow**:

```bash
npx caliper launch manager \
  --caliper-workspace ./ \
  --caliper-networkconfig networks/fabric/medical-consent-network.yaml \
  --caliper-benchconfig benchmarks/scenario/simple/medical-consent/config-doctor-workflow.yaml \
  --caliper-report-path ./reports/doctor-workflow-$(date +%Y%m%d-%H%M%S).html
```

**Mixed Operations**:

```bash
npx caliper launch manager \
  --caliper-workspace ./ \
  --caliper-networkconfig networks/fabric/medical-consent-network.yaml \
  --caliper-benchconfig benchmarks/scenario/simple/medical-consent/config-mixed-operations-workflow.yaml \
  --caliper-report-path ./reports/mixed-operations-$(date +%Y%m%d-%H%M%S).html
```

### Scenario 4: Stress Testing

**Objective**: Determine system limits and failure points

**Progressive Stress Test**:

```bash
# Enable detailed logging for stress testing
export CALIPER_LOG_LEVEL=debug

npx caliper launch manager \
  --caliper-workspace ./ \
  --caliper-networkconfig networks/fabric/medical-consent-network.yaml \
  --caliper-benchconfig benchmarks/scenario/simple/medical-consent/config-stress-test.yaml \
  --caliper-report-path ./reports/stress-test-$(date +%Y%m%d-%H%M%S).html
```

**Monitor System During Stress Test**:

```bash
# In separate terminal, monitor system resources
watch -n 1 'docker stats --no-stream'

# Monitor network connections
watch -n 1 'netstat -an | grep :7051 | wc -l'
```

## Analysis Workflows

### Workflow 1: Performance Regression Detection

**Use Case**: Detect performance degradation after code changes

**Steps**:

1. **Run Baseline Test**:

   ```bash
   npx caliper launch manager \
     --caliper-workspace ./ \
     --caliper-networkconfig networks/fabric/medical-consent-network.yaml \
     --caliper-benchconfig benchmarks/scenario/simple/medical-consent/config-medium-load.yaml \
     --caliper-report-path ./reports/baseline-v1.0.html
   ```

2. **Make Code Changes** (chaincode updates, configuration changes, etc.)

3. **Run Comparison Test**:

   ```bash
   npx caliper launch manager \
     --caliper-workspace ./ \
     --caliper-networkconfig networks/fabric/medical-consent-network.yaml \
     --caliper-benchconfig benchmarks/scenario/simple/medical-consent/config-medium-load.yaml \
     --caliper-report-path ./reports/comparison-v1.1.html
   ```

4. **Analyze Regression**:
   ```bash
   node scripts/reporting/regressionDetector.js \
     --baseline reports/baseline-v1.0.html \
     --comparison reports/comparison-v1.1.html \
     --threshold 10 \
     --output reports/regression-analysis.json
   ```

### Workflow 2: Capacity Planning

**Use Case**: Determine system capacity for production deployment

**Steps**:

1. **Run Progressive Load Tests**:

   ```bash
   # Script to run multiple load levels
   for load in light medium heavy; do
     npx caliper launch manager \
       --caliper-workspace ./ \
       --caliper-networkconfig networks/fabric/medical-consent-network.yaml \
       --caliper-benchconfig benchmarks/scenario/simple/medical-consent/config-${load}-load.yaml \
       --caliper-report-path ./reports/capacity-${load}-$(date +%Y%m%d-%H%M%S).html
   done
   ```

2. **Analyze Capacity Limits**:

   ```bash
   node scripts/reporting/performanceAnalyzer.js \
     --reports reports/capacity-*.html \
     --analysis-type capacity \
     --output reports/capacity-analysis.json
   ```

3. **Generate Recommendations**:
   ```bash
   node scripts/reporting/bottleneckAnalyzer.js \
     --input reports/capacity-analysis.json \
     --output reports/capacity-recommendations.txt
   ```

### Workflow 3: Function-Specific Optimization

**Use Case**: Optimize specific chaincode functions

**Steps**:

1. **Create Custom Configuration** for specific function:

   ```yaml
   # config-function-optimization.yaml
   test:
     name: function-optimization-test
     description: Optimize createPatientRecord function
     workers:
       type: local
       number: 3
     rounds:
       - label: createPatientRecord-baseline
         description: Baseline performance
         txNumber: 200
         rateControl:
           type: fixed-rate
           opts:
             tps: 10
         workload:
           module: benchmarks/scenario/simple/medical-consent/createPatientRecord.js
   ```

2. **Run Optimization Test**:

   ```bash
   npx caliper launch manager \
     --caliper-workspace ./ \
     --caliper-networkconfig networks/fabric/medical-consent-network.yaml \
     --caliper-benchconfig config-function-optimization.yaml \
     --caliper-report-path ./reports/function-optimization-$(date +%Y%m%d-%H%M%S).html
   ```

3. **Analyze Function Performance**:
   ```bash
   node scripts/reporting/statisticalAnalyzer.js \
     --input reports/function-optimization-*.html \
     --focus-function createPatientRecord \
     --output reports/function-analysis.json
   ```

## Best Practices

### 1. Test Environment Management

#### Environment Isolation

```bash
# Use separate test data for each benchmark run
export TEST_DATA_PREFIX="test-$(date +%Y%m%d-%H%M%S)"

# Clean up test data after benchmarks
node scripts/validation/dataCleanup.js --prefix $TEST_DATA_PREFIX
```

#### Resource Monitoring

```bash
# Monitor system resources during benchmarks
# Start monitoring before benchmark
nohup docker stats --format "table {{.Container}}\t{{CPUPerc}}\t{{MemUsage}}" > system-stats.log &
STATS_PID=$!

# Run benchmark
npx caliper launch manager ...

# Stop monitoring
kill $STATS_PID
```

### 2. Configuration Management

#### Version Control Configurations

```bash
# Keep configurations in version control
git add benchmarks/scenario/simple/medical-consent/config-*.yaml
git commit -m "Add benchmark configurations for v1.2"
git tag benchmark-config-v1.2
```

#### Environment-Specific Configurations

```bash
# Use environment variables for paths
export CRYPTO_CONFIG_PATH="/path/to/your/crypto-config"
export NETWORK_CONFIG_PATH="/path/to/your/network-config"

# Update configurations programmatically
node scripts/config/updatePaths.js \
  --crypto-path $CRYPTO_CONFIG_PATH \
  --network-path $NETWORK_CONFIG_PATH
```

### 3. Result Management

#### Organized Result Storage

```bash
# Create organized directory structure
mkdir -p reports/{baseline,regression,capacity,optimization}
mkdir -p reports/archive/$(date +%Y-%m)

# Use descriptive naming
REPORT_NAME="baseline-v1.2-$(date +%Y%m%d-%H%M%S)"
npx caliper launch manager ... --caliper-report-path ./reports/baseline/${REPORT_NAME}.html
```

#### Result Backup and Archive

```bash
# Archive old results monthly
tar -czf reports/archive/$(date +%Y-%m)/reports-$(date +%Y%m%d).tar.gz reports/*.html
find reports/ -name "*.html" -mtime +30 -delete
```

### 4. Performance Optimization

#### Gradual Load Increase

```bash
# Start with minimal load and increase gradually
for tps in 1 2 5 10 20 50; do
  echo "Testing with $tps TPS"
  # Create temporary config with specific TPS
  sed "s/tps: [0-9]*/tps: $tps/" config-template.yaml > config-temp.yaml

  npx caliper launch manager \
    --caliper-benchconfig config-temp.yaml \
    --caliper-report-path ./reports/tps-${tps}-$(date +%Y%m%d-%H%M%S).html

  # Check if error rate is acceptable
  ERROR_RATE=$(node scripts/analysis/getErrorRate.js reports/tps-${tps}-*.html)
  if (( $(echo "$ERROR_RATE > 5.0" | bc -l) )); then
    echo "Error rate too high at $tps TPS: $ERROR_RATE%"
    break
  fi
done
```

#### Resource Optimization

```bash
# Optimize Node.js heap size based on available memory
AVAILABLE_MEMORY=$(free -m | awk 'NR==2{printf "%.0f", $7*0.8}')
export NODE_OPTIONS="--max-old-space-size=$AVAILABLE_MEMORY"

# Optimize worker count based on CPU cores
CPU_CORES=$(nproc)
OPTIMAL_WORKERS=$((CPU_CORES / 2))
echo "Using $OPTIMAL_WORKERS workers for $CPU_CORES CPU cores"
```

## Advanced Usage

### Custom Workload Development

#### Creating Custom Workload Module

1. **Create workload file**:

   ```javascript
   // benchmarks/scenario/simple/medical-consent/customFunction.js
   "use strict"

   const { WorkloadModuleBase } = require("@hyperledger/caliper-core")

   class CustomFunctionWorkload extends WorkloadModuleBase {
   	constructor() {
   		super()
   		this.txIndex = 0
   	}

   	async initializeWorkloadModule(
   		workerIndex,
   		totalWorkers,
   		roundIndex,
   		roundArguments
   	) {
   		await super.initializeWorkloadModule(
   			workerIndex,
   			totalWorkers,
   			roundIndex,
   			roundArguments
   		)
   		this.workerIndex = workerIndex
   		this.totalWorkers = totalWorkers
   		this.roundArguments = roundArguments
   	}

   	async submitTransaction() {
   		this.txIndex++

   		const args = {
   			customParam: `value-${this.workerIndex}-${this.txIndex}`,
   			timestamp: Date.now(),
   		}

   		const request = {
   			contractId: "medicalconsent",
   			contractFunction: "customFunction",
   			contractArguments: [JSON.stringify(args)],
   			readOnly: false,
   		}

   		return this.sutAdapter.sendRequests(request)
   	}
   }

   function createWorkloadModule() {
   	return new CustomFunctionWorkload()
   }

   module.exports.createWorkloadModule = createWorkloadModule
   ```

2. **Create configuration**:
   ```yaml
   # config-custom-function.yaml
   test:
     name: custom-function-test
     description: Test custom chaincode function
     workers:
       type: local
       number: 2
     rounds:
       - label: customFunction
         description: Custom function performance test
         txNumber: 100
         rateControl:
           type: fixed-rate
           opts:
             tps: 5
         workload:
           module: benchmarks/scenario/simple/medical-consent/customFunction.js
           arguments:
             customParam: "test-value"
   ```

### Automated Testing Pipeline

#### CI/CD Integration Script

```bash
#!/bin/bash
# scripts/ci/run-performance-tests.sh

set -e

echo "=== Performance Testing Pipeline ==="

# Environment validation
echo "Validating environment..."
node scripts/validation/index.js

# Run baseline tests
echo "Running baseline performance tests..."
npx caliper launch manager \
  --caliper-workspace ./ \
  --caliper-networkconfig networks/fabric/medical-consent-network.yaml \
  --caliper-benchconfig benchmarks/scenario/simple/medical-consent/config-light-load.yaml \
  --caliper-report-path ./reports/ci-baseline-$(date +%Y%m%d-%H%M%S).html

# Check performance thresholds
echo "Validating performance thresholds..."
node scripts/execution/ci-benchmark.js \
  --report reports/ci-baseline-*.html \
  --thresholds scripts/execution/ci-thresholds.json

# Generate summary report
echo "Generating CI summary..."
node scripts/reporting/ciSummary.js \
  --input reports/ci-baseline-*.html \
  --output reports/ci-summary.json

echo "=== Performance Testing Complete ==="
```

#### Performance Threshold Configuration

```json
{
	"thresholds": {
		"createPatientRecord": {
			"minTps": 2.0,
			"maxLatencyMs": 1000,
			"maxErrorRate": 1.0
		},
		"getRecordById": {
			"minTps": 8.0,
			"maxLatencyMs": 500,
			"maxErrorRate": 0.5
		},
		"grantConsent": {
			"minTps": 1.5,
			"maxLatencyMs": 1200,
			"maxErrorRate": 1.0
		}
	},
	"global": {
		"maxResourceUtilization": 80.0,
		"minSuccessRate": 99.0
	}
}
```

### Custom Analysis Scripts

#### Performance Trend Analysis

```javascript
// scripts/analysis/trendAnalysis.js
const fs = require("fs")
const path = require("path")

class TrendAnalyzer {
	constructor(reportDirectory) {
		this.reportDirectory = reportDirectory
		this.reports = this.loadReports()
	}

	loadReports() {
		const files = fs
			.readdirSync(this.reportDirectory)
			.filter((file) => file.endsWith(".html"))
			.sort()

		return files.map((file) => ({
			filename: file,
			timestamp: this.extractTimestamp(file),
			data: this.parseReport(path.join(this.reportDirectory, file)),
		}))
	}

	analyzeTrends() {
		const trends = {}

		this.reports.forEach((report) => {
			Object.keys(report.data.rounds).forEach((roundLabel) => {
				if (!trends[roundLabel]) {
					trends[roundLabel] = []
				}

				trends[roundLabel].push({
					timestamp: report.timestamp,
					tps: report.data.rounds[roundLabel].tps,
					latency: report.data.rounds[roundLabel].avgLatency,
					successRate: report.data.rounds[roundLabel].successRate,
				})
			})
		})

		return trends
	}

	detectRegressions(threshold = 10) {
		const trends = this.analyzeTrends()
		const regressions = []

		Object.keys(trends).forEach((roundLabel) => {
			const data = trends[roundLabel]
			if (data.length < 2) return

			const latest = data[data.length - 1]
			const previous = data[data.length - 2]

			const tpsChange = ((latest.tps - previous.tps) / previous.tps) * 100
			const latencyChange =
				((latest.latency - previous.latency) / previous.latency) * 100

			if (tpsChange < -threshold || latencyChange > threshold) {
				regressions.push({
					function: roundLabel,
					tpsChange: tpsChange.toFixed(2),
					latencyChange: latencyChange.toFixed(2),
					severity: this.calculateSeverity(tpsChange, latencyChange),
				})
			}
		})

		return regressions
	}
}

module.exports = TrendAnalyzer
```

This comprehensive usage guide provides detailed instructions for executing benchmarks, analyzing results, and implementing best practices for blockchain performance testing with the ConsentMD system.
