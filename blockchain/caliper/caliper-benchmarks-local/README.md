# ConsentMD Caliper Benchmark Suite

This directory contains Hyperledger Caliper benchmark tests for the ConsentMD consent management system built on Hyperledger Fabric.

## Project Structure

```
blockchain/caliper/caliper-benchmarks-local/
├── benchmarks/                          # Benchmark configuration files
│   ├── consent-management/              # Individual benchmark configs
│   │   ├── consent-granting-benchmark.yaml
│   │   ├── record-access-benchmark.yaml
│   │   ├── consent-revocation-benchmark.yaml
│   │   └── mixed-workload-benchmark.yaml
│   └── consent-management-suite.yaml    # Main benchmark suite
├── networks/                            # Network configuration
│   └── fabric/
│       ├── consent-management-network.yaml
│       └── connection-profiles/
│           ├── org1-connection-profile.yaml
│           └── org2-connection-profile.yaml
├── workloads/                           # Workload modules
│   ├── consent-granting.js
│   ├── record-access.js
│   ├── consent-revocation.js
│   └── mixed-workload.js
├── package.json                         # Node.js dependencies
└── README.md                           # This file
```

## Prerequisites

Before running the benchmarks, ensure you have the following:

### System Requirements

1. **Node.js**: Version 18.0.0 or higher
2. **npm**: Version 8.0.0 or higher
3. **Memory**: At least 4GB RAM available for benchmark execution
4. **Disk Space**: At least 1GB free space for results and logs

### Network Requirements

1. **Hyperledger Fabric Network**: The ConsentMD network must be running and accessible
2. **Chaincode**: The `medicalconsent` chaincode must be deployed on `mychannel`
3. **Network Connectivity**: Ensure all peers and orderers are reachable
4. **Certificates**: Valid crypto-config materials must be available

### Verification Steps

Before running benchmarks, verify your setup:

```bash
# Check Node.js version
node --version  # Should be >= 18.0.0

# Check npm version
npm --version   # Should be >= 8.0.0

# Verify Fabric network is running
docker ps | grep hyperledger  # Should show running containers

# Test chaincode connectivity (from fabric network directory)
peer chaincode query -C mychannel -n medicalconsent -c '{"function":"queryAllPatients","Args":[]}'
```

## Quick Start

### 1. Installation

Navigate to the benchmark directory and install dependencies:

```bash
cd blockchain/caliper/caliper-benchmarks-local
npm install
```

### 2. Network Setup Verification

Ensure your Fabric network is running and the chaincode is deployed:

```bash
# From the blockchain directory, start the network if not running
cd ../../
./scripts/start-network.sh  # Adjust path as needed

# Verify chaincode is deployed
peer chaincode list --installed
peer chaincode list --instantiated -C mychannel
```

### 3. Verify Setup (Recommended)

Before running benchmarks, verify your environment:

**Linux/macOS:**

```bash
chmod +x verify-setup.sh
./verify-setup.sh
```

**Windows:**

```cmd
verify-setup.bat
```

### 4. Run Benchmarks

#### Option A: Run All Benchmarks (Recommended)

Use the provided scripts to run the complete benchmark suite:

**Linux/macOS:**

```bash
chmod +x run-benchmarks.sh
./run-benchmarks.sh
```

**Windows:**

```cmd
run-benchmarks.bat
```

This will execute all four benchmark scenarios and generate comprehensive reports.

#### Option B: Run Single Benchmark

For testing specific scenarios or faster execution:

**Linux/macOS:**

```bash
chmod +x run-single-benchmark.sh
./run-single-benchmark.sh [benchmark-type]
```

**Windows:**

```cmd
run-single-benchmark.bat [benchmark-type]
```

Available benchmark types:

- `consent-granting` - Test consent creation performance
- `record-access` - Test record query performance
- `consent-revocation` - Test consent revocation performance
- `mixed-workload` - Test combined operations performance

### 5. View Results

After completion, results will be saved in the `results/` directory with timestamp:

- HTML reports for detailed analysis
- CSV data for further processing
- Performance metrics and charts
- Execution logs for troubleshooting

## Network Configuration

The benchmark is configured to work with the existing ConsentMD Fabric network:

- **Channel**: `mychannel`
- **Chaincode**: `medicalconsent`
- **Organizations**:
  - Org1MSP (Patient organization)
  - Org2MSP (Doctor organization)
- **Peers**:
  - peer0.org1.example.com:7051
  - peer0.org2.example.com:9051
- **Orderers**:
  - orderer.example.com:7050
  - orderer2.example.com:8050
  - orderer3.example.com:9050

## Running Benchmarks

### Using Execution Scripts

The easiest way to run all benchmarks is using the provided scripts:

**Linux/macOS:**

```bash
./run-benchmarks.sh
```

**Windows:**

```cmd
run-benchmarks.bat
```

### Manual Execution

You can also run individual benchmarks manually:

```bash
# Consent granting performance (5 minutes)
npx caliper launch manager \
  --caliper-workspace ./ \
  --caliper-networkconfig networks/fabric/fabric-network.yaml \
  --caliper-benchconfig benchmarks/consent-management/consent-granting-benchmark.yaml \
  --caliper-flow-only-test

# Record access performance (5 minutes)
npx caliper launch manager \
  --caliper-workspace ./ \
  --caliper-networkconfig networks/fabric/fabric-network.yaml \
  --caliper-benchconfig benchmarks/consent-management/record-access-benchmark.yaml \
  --caliper-flow-only-test

# Consent revocation performance (5 minutes)
npx caliper launch manager \
  --caliper-workspace ./ \
  --caliper-networkconfig networks/fabric/fabric-network.yaml \
  --caliper-benchconfig benchmarks/consent-management/consent-revocation-benchmark.yaml \
  --caliper-flow-only-test

# Mixed workload performance (5 minutes)
npx caliper launch manager \
  --caliper-workspace ./ \
  --caliper-networkconfig networks/fabric/fabric-network.yaml \
  --caliper-benchconfig benchmarks/consent-management/mixed-workload-benchmark.yaml \
  --caliper-flow-only-test
```

## Benchmark Configurations

### Individual Benchmark Tests (5 minutes each)

1. **Consent Granting Benchmark** (`consent-granting-benchmark.yaml`)

   - Duration: 5 minutes main test + setup/cleanup
   - Workers: 3
   - Rate: 50 TPS fixed-rate
   - Focus: Consent creation performance

2. **Record Access Benchmark** (`record-access-benchmark.yaml`)

   - Duration: 5 minutes main test + setup/cleanup
   - Workers: 3
   - Rate: 100 TPS fixed-rate
   - Focus: Authorized record query performance

3. **Consent Revocation Benchmark** (`consent-revocation-benchmark.yaml`)

   - Duration: 5 minutes main test + setup/cleanup
   - Workers: 2
   - Rate: 25 TPS fixed-rate
   - Focus: Consent revocation performance

4. **Mixed Workload Benchmark** (`mixed-workload-benchmark.yaml`)
   - Duration: 5 minutes main test + setup/cleanup
   - Workers: 3
   - Rate: 75 TPS fixed-rate
   - Focus: Combined operations (40% access, 30% granting, 20% creation, 10% revocation)

### Benchmark Phases

Each benchmark includes the following phases:

1. **Initialization**: Creates test patients, doctors, and medical records
2. **Setup**: Establishes consent relationships (where needed)
3. **Warmup**: Brief warmup phase to stabilize performance
4. **Main Test**: 5-minute performance measurement phase
5. **Cleanup**: Removes test data to enable repeatable tests

## Understanding Performance Results

### Key Performance Metrics

The benchmarks collect comprehensive performance data across multiple dimensions:

#### Transaction Metrics

- **Throughput (TPS)**: Actual transactions processed per second

  - _Target_: Should match or approach configured rate (50-100 TPS depending on test)
  - _Good_: Within 10% of target rate
  - _Concerning_: More than 20% below target rate

- **Success Rate**: Percentage of successful transactions
  - _Excellent_: >99% success rate
  - _Good_: 95-99% success rate
  - _Poor_: <95% success rate (investigate errors)

#### Latency Metrics

- **Average Latency**: Mean response time for transactions

  - _Consent Granting_: <2 seconds typical
  - _Record Access_: <1 second typical
  - _Consent Revocation_: <1.5 seconds typical

- **95th Percentile**: 95% of transactions complete within this time

  - Should be <3x average latency
  - High values indicate performance bottlenecks

- **99th Percentile**: 99% of transactions complete within this time
  - Should be <5x average latency
  - Extreme outliers may indicate network issues

#### Resource Utilization

- **CPU Usage**: Processor utilization during tests
- **Memory Usage**: RAM consumption patterns
- **Network I/O**: Data transfer rates and patterns

### Interpreting Results by Benchmark Type

#### 1. Consent Granting Benchmark

**Expected Performance:**

- Throughput: 45-55 TPS (target: 50 TPS)
- Average Latency: 1-2 seconds
- Success Rate: >98%

**What to Look For:**

- Consistent throughput throughout 5-minute test
- Stable latency without significant spikes
- No authorization or validation errors

**Common Issues:**

- Low throughput: Network congestion or peer overload
- High latency: Slow endorsement or commit phases
- Failures: Identity/permission issues or chaincode errors

#### 2. Record Access Benchmark

**Expected Performance:**

- Throughput: 90-110 TPS (target: 100 TPS)
- Average Latency: 0.5-1 second
- Success Rate: >99%

**What to Look For:**

- Higher throughput than write operations (queries are faster)
- Lower latency variance
- Minimal failed transactions

**Common Issues:**

- Authorization failures: Consent not properly established
- Slow queries: State database performance issues
- Network timeouts: Peer connectivity problems

#### 3. Consent Revocation Benchmark

**Expected Performance:**

- Throughput: 20-30 TPS (target: 25 TPS)
- Average Latency: 1-1.5 seconds
- Success Rate: >97%

**What to Look For:**

- Consistent revocation processing
- Proper state transitions from granted to revoked
- Clean handling of already-revoked consents

**Common Issues:**

- State conflicts: Multiple workers trying to revoke same consent
- Validation errors: Attempting to revoke non-existent consents
- Performance degradation: Complex state updates

#### 4. Mixed Workload Benchmark

**Expected Performance:**

- Throughput: 70-80 TPS (target: 75 TPS)
- Average Latency: 1-2 seconds (varies by operation mix)
- Success Rate: >96%

**What to Look For:**

- Balanced performance across operation types
- No significant interference between operation types
- Realistic performance under mixed load

**Common Issues:**

- Uneven operation distribution
- Resource contention between different transaction types
- Cascading failures affecting multiple operation types

### Performance Analysis Workflow

#### 1. Quick Health Check

```bash
# Check overall success rates
grep -i "success rate" results/*/report.html

# Look for error patterns
grep -i "error\|fail" results/*/caliper.log
```

#### 2. Detailed Analysis

1. **Open HTML Reports**: Start with visual charts and summaries
2. **Check Transaction Details**: Look at per-transaction timing
3. **Analyze Resource Usage**: Correlate performance with system load
4. **Compare Across Tests**: Identify patterns and anomalies

#### 3. Troubleshooting Performance Issues

**Low Throughput:**

- Check network connectivity and peer health
- Verify endorsement policy requirements
- Monitor resource utilization on peers/orderers
- Review chaincode logic for bottlenecks

**High Latency:**

- Analyze endorsement vs commit time breakdown
- Check for network congestion
- Review state database performance
- Verify proper load balancing

**Transaction Failures:**

- Review error logs for specific failure reasons
- Check identity and permission configurations
- Verify chaincode logic and validation rules
- Test individual operations manually

### Benchmark Comparison Guidelines

When comparing results across different runs:

1. **Environment Consistency**: Ensure same network configuration
2. **Data Volume**: Use consistent test data sizes
3. **System Load**: Run tests under similar conditions
4. **Time Factors**: Account for network state and external load

### Performance Targets Summary

| Benchmark Type     | Target TPS | Expected Latency | Min Success Rate |
| ------------------ | ---------- | ---------------- | ---------------- |
| Consent Granting   | 50         | 1-2s             | 98%              |
| Record Access      | 100        | 0.5-1s           | 99%              |
| Consent Revocation | 25         | 1-1.5s           | 97%              |
| Mixed Workload     | 75         | 1-2s             | 96%              |

These targets are based on a research environment with moderate load. Production environments may require different thresholds based on specific requirements and infrastructure capabilities.

### Detailed Performance Analysis

For comprehensive guidance on interpreting benchmark results, see the [Performance Results Guide](docs/performance-results-guide.md). This guide covers:

- Detailed metric interpretation
- Benchmark-specific analysis guidelines
- Troubleshooting performance issues
- Comparative analysis techniques
- Report generation templates

## Test Data Management

- Test data uses worker-specific prefixes to avoid conflicts
- Deterministic data generation for repeatable tests
- Automatic cleanup after benchmark completion
- Separate initialization and cleanup phases

## Configuration

Benchmark parameters can be adjusted in the YAML configuration files:

- **Transaction rates**: Modify `rateControl.opts.tps` values
- **Test duration**: Adjust `txNumber` for each round
- **Worker count**: Change `workers.number` in the main config
- **Data volumes**: Modify workload arguments for patient/doctor counts

## Troubleshooting

### Common Issues and Solutions

#### Network Connection Issues

**Symptoms**: Connection timeouts, peer unreachable errors
**Solutions**:

```bash
# Check network status
docker ps | grep hyperledger

# Verify peer connectivity
peer channel list

# Test orderer connectivity
peer channel fetch config -c mychannel
```

#### Certificate and Identity Errors

**Symptoms**: Authentication failures, MSP validation errors
**Solutions**:

```bash
# Verify crypto materials exist
ls -la networks/fabric/crypto-config/

# Check identity configurations in connection profiles
cat networks/fabric/connection-profiles/org1-connection-profile.yaml
```

#### Chaincode Issues

**Symptoms**: Chaincode not found, function not implemented
**Solutions**:

```bash
# Verify chaincode deployment
peer chaincode list --installed
peer chaincode list --instantiated -C mychannel

# Test chaincode manually
peer chaincode invoke -C mychannel -n medicalconsent -c '{"function":"queryAllPatients","Args":[]}'
```

#### Performance Issues

**Symptoms**: Low throughput, high latency, timeouts
**Solutions**:

1. Reduce transaction rate in benchmark configs
2. Increase timeout values in network configuration
3. Check system resources (CPU, memory, disk I/O)
4. Monitor peer and orderer logs for bottlenecks

#### Benchmark Execution Errors

**Symptoms**: Caliper crashes, worker failures, incomplete tests
**Solutions**:

```bash
# Check Caliper logs
tail -f caliper.log

# Verify benchmark configuration syntax
npx caliper launch manager --caliper-workspace ./ --caliper-benchconfig benchmarks/consent-management-suite.yaml --caliper-flow-only-test --caliper-flow-skip-start

# Run with debug logging
DEBUG=caliper* npx caliper launch manager [options]
```

### Getting Help

1. **Check Logs**: Always review `caliper.log` for detailed error information
2. **Validate Configuration**: Use Caliper's validation tools before running tests
3. **Test Components**: Verify network, chaincode, and identities work independently
4. **Community Support**: Consult Hyperledger Caliper documentation and community forums

### Log Locations

- **Caliper Logs**: `./caliper.log`
- **Benchmark Results**: `./results/[timestamp]/`
- **Network Logs**: Check Docker container logs for peers/orderers
- **Chaincode Logs**: Available in peer container logs

## Additional Documentation

- **[Getting Started Tutorial](docs/tutorials/getting-started.md)**: Step-by-step guide for first-time users
- **[Performance Results Guide](docs/performance-results-guide.md)**: Comprehensive analysis and interpretation guide
- **[Error Handling Guide](docs/error-handling-guide.md)**: Troubleshooting and error resolution

## Development Status

This benchmark suite is feature-complete and ready for use. All planned tasks have been implemented:

- [x] Task 1: ✅ Set up basic Caliper project structure
- [x] Task 2: ✅ Create consent granting workload module
- [x] Task 3: ✅ Create record access workload module
- [x] Task 4: ✅ Create consent revocation workload module
- [x] Task 5: ✅ Create benchmark configuration files
- [x] Task 6: ✅ Create simple mixed workload module
- [x] Task 7: ✅ Add basic error handling and cleanup verification
- [x] Task 8: ✅ Create execution scripts and basic documentation
