# Caliper Configuration Guide for ConsentMD Blockchain Performance Analysis

## Overview

This guide provides comprehensive documentation for configuring Hyperledger Caliper benchmarks for the ConsentMD medical consent management blockchain network. The configuration system supports multiple load profiles, workflow scenarios, and network configurations.

## Table of Contents

1. [Configuration Structure](#configuration-structure)
2. [Network Configuration](#network-configuration)
3. [Benchmark Configuration](#benchmark-configuration)
4. [Load Profiles](#load-profiles)
5. [Workflow Scenarios](#workflow-scenarios)
6. [Monitoring Configuration](#monitoring-configuration)
7. [Example Configurations](#example-configurations)
8. [Troubleshooting](#troubleshooting)

## Configuration Structure

The Caliper configuration consists of three main components:

### 1. Network Configuration (`medical-consent-network.yaml`)

Defines the blockchain network topology, organizations, and connection profiles.

### 2. Benchmark Configuration (`config-*.yaml`)

Defines test scenarios, workload modules, and performance parameters.

### 3. Connection Profiles (`connection-org*.json`)

Contains detailed network connection information for each organization.

## Network Configuration

### Basic Structure

```yaml
name: Fabric Network
version: 2.0.0

caliper:
  blockchain: fabric

channels:
  mychannel:
    contracts:
      - id: "medicalconsent"
        version: "1"

organizations:
  - mspid: Org1MSP
    identities:
      certificates:
        - name: User1
          clientPrivateKey:
            path: /path/to/private/key
          clientSignedCert:
            path: /path/to/signed/cert
    connectionProfile:
      path: networks/fabric/connection-org1-caliper.json
```

### Key Configuration Elements

#### Channels

- **mychannel**: The primary channel for medical consent operations
- **contracts**: Defines the chaincode ID and version

#### Organizations

- **mspid**: Organization membership service provider ID
- **identities**: User certificates and private keys for authentication
- **connectionProfile**: Path to detailed connection configuration

### Certificate Configuration

Ensure certificate paths are correctly configured for your environment:

```yaml
clientPrivateKey:
  path: /absolute/path/to/keystore/priv_sk
clientSignedCert:
  path: /absolute/path/to/signcerts/cert.pem
```

**Important**: Update certificate paths to match your blockchain network deployment.

## Benchmark Configuration

### Basic Structure

```yaml
test:
  name: medical-consent-benchmark
  description: Performance benchmark for medical consent chaincode
  workers:
    type: local
    number: 2
  rounds:
    - label: functionName
      description: Function description
      txNumber: 50
      rateControl:
        type: fixed-rate
        opts:
          tps: 5
      workload:
        module: path/to/workload/module.js
        arguments: {}
```

### Configuration Parameters

#### Test Section

- **name**: Unique identifier for the benchmark
- **description**: Human-readable description
- **workers**: Defines worker configuration
  - **type**: Always "local" for single-machine testing
  - **number**: Number of concurrent workers (1-10 recommended)

#### Rounds Section

Each round represents a test phase for a specific chaincode function:

- **label**: Unique identifier for the test round
- **description**: Description of what the round tests
- **txNumber**: Total number of transactions to execute
- **rateControl**: Controls transaction submission rate
- **workload**: Specifies the workload module and parameters

### Rate Control Options

#### Fixed Rate

```yaml
rateControl:
  type: fixed-rate
  opts:
    tps: 5 # Transactions per second
```

#### Linear Rate

```yaml
rateControl:
  type: linear-rate
  opts:
    startingTps: 1
    finishingTps: 10
```

#### Composite Rate

```yaml
rateControl:
  type: composite-rate
  opts:
    weights:
      - 50 # 50% of transactions at first rate
      - 50 # 50% of transactions at second rate
    rateControllers:
      - type: fixed-rate
        opts:
          tps: 2
      - type: fixed-rate
        opts:
          tps: 8
```

## Load Profiles

### Light Load Profile

**File**: `config-light-load.yaml`

- **Workers**: 1-2
- **TPS Range**: 1-5
- **Transaction Count**: 15-60 per function
- **Use Case**: Basic functionality validation and baseline performance

### Medium Load Profile

**File**: `config-medium-load.yaml`

- **Workers**: 3-5
- **TPS Range**: 10-25
- **Transaction Count**: 50-200 per function
- **Use Case**: Normal operational load testing

### Heavy Load Profile

**File**: `config-heavy-load.yaml`

- **Workers**: 5-10
- **TPS Range**: 50-100
- **Transaction Count**: 200-1000 per function
- **Use Case**: High-volume performance testing

### Stress Test Profile

**File**: `config-stress-test.yaml`

- **Workers**: Progressive increase (1-15)
- **TPS Range**: Progressive increase (1-200)
- **Transaction Count**: Variable based on failure point
- **Use Case**: System limit identification

## Workflow Scenarios

### Patient Journey Workflow

**File**: `config-patient-journey-workflow.yaml`

Simulates complete patient-doctor interaction:

1. Doctor profile registration
2. Patient record creation
3. Consent granting
4. Record access and updates
5. Consent revocation

### Doctor Workflow

**File**: `config-doctor-workflow.yaml`

Focuses on doctor-centric operations:

1. Profile management
2. Medical record creation
3. Record updates and queries
4. Private note management

### Mixed Operations Workflow

**File**: `config-mixed-operations-workflow.yaml`

Tests concurrent read/write operations:

- Simultaneous record creation and queries
- Concurrent consent operations
- Mixed private and public data access

## Monitoring Configuration

### Prometheus Integration

```yaml
monitors:
  resource:
    - module: prometheus
      options:
        url: "http://localhost:9090"
        metrics:
          ignore: [prometheus, pushGateway, cadvisor]
          include:
            Avg Memory (MB): avg(container_memory_rss{name=~".+"}) by (name)
            CPU (%): avg(rate(container_cpu_usage_seconds_total{name=~".+"}[1m])) by (name)
            Network In (MB): avg(rate(container_network_receive_bytes_total{name=~".+"}[1m])) by (name)
            Network Out (MB): avg(rate(container_network_transmit_bytes_total{name=~".+"}[1m])) by (name)

observer:
  type: prometheus
  interval: 5
```

### Custom Metrics

Add custom metrics for specific monitoring needs:

```yaml
metrics:
  include:
    Transaction Latency: histogram_quantile(0.95, rate(fabric_transaction_duration_seconds_bucket[5m]))
    Endorsement Time: avg(fabric_endorsement_duration_seconds)
    Block Creation Rate: rate(fabric_blocks_total[1m])
```

## Example Configurations

### Minimal Configuration

```yaml
test:
  name: minimal-test
  description: Minimal configuration for quick testing
  workers:
    type: local
    number: 1
  rounds:
    - label: getMyId
      description: Basic identity verification
      txNumber: 10
      rateControl:
        type: fixed-rate
        opts:
          tps: 1
      workload:
        module: benchmarks/scenario/simple/medical-consent/getMyId.js
        arguments: {}
```

### Custom Function Testing

```yaml
test:
  name: custom-function-test
  description: Test specific chaincode functions
  workers:
    type: local
    number: 3
  rounds:
    - label: createPatientRecord
      description: Patient record creation performance
      txNumber: 100
      rateControl:
        type: linear-rate
        opts:
          startingTps: 1
          finishingTps: 10
      workload:
        module: benchmarks/scenario/simple/medical-consent/createPatientRecord.js
        arguments:
          recordType: "consultation"
          includeFiles: true
```

### Performance Comparison Configuration

```yaml
test:
  name: performance-comparison
  description: Compare read vs write operations
  workers:
    type: local
    number: 5
  rounds:
    # Write operations
    - label: write-operations
      description: Combined write operations
      txNumber: 200
      rateControl:
        type: composite-rate
        opts:
          weights: [40, 30, 30]
          rateControllers:
            - type: fixed-rate
              opts: { tps: 5 }
            - type: fixed-rate
              opts: { tps: 3 }
            - type: fixed-rate
              opts: { tps: 2 }
      workload:
        module: benchmarks/scenario/simple/medical-consent/createPatientRecord.js

    # Read operations
    - label: read-operations
      description: Combined read operations
      txNumber: 300
      rateControl:
        type: fixed-rate
        opts:
          tps: 15
      workload:
        module: benchmarks/scenario/simple/medical-consent/getRecordById.js
```

## Troubleshooting

### Common Configuration Issues

#### 1. Certificate Path Errors

**Error**: `Error: ENOENT: no such file or directory`

**Solution**: Verify certificate paths in network configuration:

```bash
# Check if certificate files exist
ls -la /path/to/crypto-config/peerOrganizations/org1.example.com/users/User1@org1.example.com/msp/keystore/
ls -la /path/to/crypto-config/peerOrganizations/org1.example.com/users/User1@org1.example.com/msp/signcerts/
```

**Fix**: Update paths in `medical-consent-network.yaml`:

```yaml
clientPrivateKey:
  path: /correct/absolute/path/to/keystore/priv_sk
clientSignedCert:
  path: /correct/absolute/path/to/signcerts/cert.pem
```

#### 2. Connection Profile Issues

**Error**: `Error: Failed to connect to peer`

**Solution**: Verify connection profile settings:

1. Check peer URLs and ports
2. Verify TLS certificate paths
3. Ensure network is running

**Fix**: Update connection profiles with correct network endpoints.

#### 3. Rate Control Problems

**Error**: `RateController error: Invalid rate configuration`

**Solution**: Verify rate control configuration:

```yaml
# Correct format
rateControl:
  type: fixed-rate
  opts:
    tps: 5

# Incorrect format (missing opts)
rateControl:
  type: fixed-rate
  tps: 5  # This will cause an error
```

#### 4. Worker Configuration Issues

**Error**: `Worker spawn error`

**Solution**:

- Reduce worker count if system resources are limited
- Ensure sufficient memory (minimum 2GB per worker)
- Check system ulimits

```bash
# Check system limits
ulimit -n  # File descriptors
ulimit -u  # Processes
```

#### 5. Workload Module Errors

**Error**: `Cannot find module 'workload/module.js'`

**Solution**: Verify workload module paths are relative to Caliper root:

```yaml
workload:
  module: benchmarks/scenario/simple/medical-consent/functionName.js # Correct
  # Not: ./functionName.js or /absolute/path/functionName.js
```

### Performance Troubleshooting

#### Low TPS Issues

1. **Check Network Latency**

   ```bash
   ping peer0.org1.example.com
   ping peer0.org2.example.com
   ```

2. **Monitor Resource Usage**

   - CPU utilization should be < 80%
   - Memory usage should be < 90%
   - Network bandwidth should not be saturated

3. **Adjust Configuration**
   - Reduce worker count
   - Lower TPS targets
   - Increase timeouts

#### High Error Rates

1. **Check Chaincode Logs**

   ```bash
   docker logs peer0.org1.example.com
   docker logs peer0.org2.example.com
   ```

2. **Verify Data Dependencies**

   - Ensure required records exist for update operations
   - Check consent relationships for access operations

3. **Adjust Test Parameters**
   - Reduce transaction rate
   - Increase timeout values
   - Add delays between dependent operations

### Environment Validation

Before running benchmarks, validate your environment:

```bash
# Run environment validation script
node scripts/validation/index.js

# Check network connectivity
node scripts/validation/networkValidator.js

# Verify chaincode deployment
node scripts/validation/chaincodeValidator.js
```

### Configuration Validation

Validate configuration files before execution:

```bash
# Validate YAML syntax
npx js-yaml config-light-load.yaml

# Test configuration with dry run
npx caliper launch manager --caliper-workspace ./ --caliper-networkconfig networks/fabric/medical-consent-network.yaml --caliper-benchconfig benchmarks/scenario/simple/medical-consent/config-light-load.yaml --caliper-flow-only-test
```

### Getting Help

1. **Check Caliper Documentation**: https://hyperledger.github.io/caliper/
2. **Review Fabric Documentation**: https://hyperledger-fabric.readthedocs.io/
3. **Examine Log Files**: Check `caliper.log` for detailed error information
4. **Use Debug Mode**: Set `CALIPER_LOG_LEVEL=debug` for verbose logging

For additional support, refer to the project's issue tracker or community forums.
