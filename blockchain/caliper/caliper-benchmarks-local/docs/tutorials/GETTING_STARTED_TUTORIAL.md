# Getting Started Tutorial: ConsentMD Blockchain Performance Testing

## Overview

This tutorial will guide you through your first blockchain performance test using Hyperledger Caliper on the ConsentMD medical consent management network. By the end of this tutorial, you'll have successfully run a benchmark and analyzed the results.

## Prerequisites

- ConsentMD blockchain network running
- Node.js 14+ installed
- Basic familiarity with command line
- 30 minutes of time

## Important: Simulated Data Only

**🔒 All tests use simulated data - no real patient records are created in AWS or external systems!**

See [Data Simulation Explained](../DATA_SIMULATION_EXPLAINED.md) for complete details.

## Azure VM Users (Standard B2ms)

If you're using Azure Standard B2ms (2 vCPUs, 8GB RAM), use the Azure-optimized quick start:

```bash
# Quick start for Azure VMs
chmod +x scripts/azure-quickstart.sh
./scripts/azure-quickstart.sh
```

This automatically configures optimal settings for your VM specifications.

## Tutorial Steps

### Step 1: Environment Setup (5 minutes)

#### 1.1 Navigate to the Benchmark Directory

```bash
cd ConsentMD/blockchain/caliper/caliper-benchmarks-local
```

#### 1.2 Install Dependencies

```bash
npm install
```

You should see output similar to:

```
added 245 packages from 180 contributors and audited 245 packages in 15.234s
```

#### 1.3 Verify Your Blockchain Network

```bash
docker ps --format "table {{.Names}}\t{{.Status}}"
```

Expected output:

```
NAMES                     STATUS
peer0.org1.example.com    Up 2 hours
peer0.org2.example.com    Up 2 hours
orderer.example.com       Up 2 hours
ca.org1.example.com       Up 2 hours
ca.org2.example.com       Up 2 hours
```

If containers are not running, start your blockchain network:

```bash
# Navigate to your blockchain network directory
cd /path/to/your/blockchain/network
./network.sh up
```

### Step 2: Configuration Check (5 minutes)

#### 2.1 Validate Environment

Run the built-in validation script:

```bash
node scripts/validation/index.js
```

Expected output:

```
✓ Node.js version: v16.14.0
✓ Network connectivity: All peers accessible
✓ Chaincode deployment: medicalconsent v1 active
✓ Certificate paths: Valid
✓ Environment ready for benchmarking
```

#### 2.2 Update Certificate Paths (if needed)

If validation fails with certificate errors, update the paths in `networks/fabric/medical-consent-network.yaml`:

```bash
# Find your certificate paths
find /path/to/crypto-config -name "*_sk" -type f | head -2
find /path/to/crypto-config -name "cert.pem" -type f | head -2
```

Edit the network configuration file:

```bash
nano networks/fabric/medical-consent-network.yaml
```

Update the paths:

```yaml
organizations:
  - mspid: Org1MSP
    identities:
      certificates:
        - name: User1
          clientPrivateKey:
            path: /your/actual/path/to/keystore/priv_sk
          clientSignedCert:
            path: /your/actual/path/to/signcerts/cert.pem
```

### Step 3: Your First Benchmark (10 minutes)

#### 3.1 Run a Simple Test

Let's start with a light load test to verify everything works:

```bash
npx caliper launch manager \
  --caliper-workspace ./ \
  --caliper-networkconfig networks/fabric/medical-consent-network.yaml \
  --caliper-benchconfig benchmarks/scenario/simple/medical-consent/config-light-load.yaml \
  --caliper-report-path ./reports/my-first-test.html
```

#### 3.2 Understanding the Output

You'll see output like this:

```
2024-08-27T14:30:22.123Z - info: [caliper] [cli-launch-manager]    Set workspace path: /path/to/caliper-benchmarks-local
2024-08-27T14:30:22.456Z - info: [caliper] [cli-launch-manager]    Set benchmark configuration path: benchmarks/scenario/simple/medical-consent/config-light-load.yaml
2024-08-27T14:30:22.789Z - info: [caliper] [cli-launch-manager]    Set network configuration path: networks/fabric/medical-consent-network.yaml
2024-08-27T14:30:23.012Z - info: [caliper] [cli-launch-manager]    Set SUT adapter: fabric
2024-08-27T14:30:25.345Z - info: [caliper] [cli-launch-manager]    Benchmark finished in 45.678 seconds
```

#### 3.3 What Just Happened?

The benchmark just:

1. Connected to your blockchain network
2. Ran tests on 13 different chaincode functions
3. Measured performance metrics (TPS, latency, success rate)
4. Generated a detailed HTML report

### Step 4: Analyzing Your Results (10 minutes)

#### 4.1 Open the Report

```bash
# On macOS
open reports/my-first-test.html

# On Linux
xdg-open reports/my-first-test.html

# On Windows
start reports/my-first-test.html
```

#### 4.2 Understanding the Report

The report contains several sections:

**1. Test Configuration Summary**

- Shows which tests were run
- Worker count and transaction rates
- Test duration and total transactions

**2. Performance Summary Table**
Look for these key metrics:

- **Succ**: Success rate (should be close to 100%)
- **Fail**: Failure count (should be 0 or very low)
- **Send Rate (TPS)**: Transactions per second sent
- **Max Latency (s)**: Highest response time
- **Min Latency (s)**: Lowest response time
- **Avg Latency (s)**: Average response time

**3. Performance Charts**

- Throughput over time
- Latency distribution
- Resource utilization

#### 4.3 Interpreting Your Results

**Good Results Look Like:**

- Success rate: 99-100%
- Consistent throughput (no major drops)
- Reasonable latency (< 2 seconds for most operations)

**Potential Issues:**

- Success rate < 95%: Network or configuration problems
- High latency (> 5 seconds): Performance bottlenecks
- Erratic throughput: Resource constraints

### Step 5: Running Different Test Scenarios (5 minutes)

#### 5.1 Try a Medium Load Test

```bash
npx caliper launch manager \
  --caliper-workspace ./ \
  --caliper-networkconfig networks/fabric/medical-consent-network.yaml \
  --caliper-benchconfig benchmarks/scenario/simple/medical-consent/config-medium-load.yaml \
  --caliper-report-path ./reports/medium-load-test.html
```

#### 5.2 Compare Results

Open both reports and compare:

- Did throughput scale with increased load?
- How did latency change?
- Did success rate remain high?

#### 5.3 Try a Workflow Test

```bash
npx caliper launch manager \
  --caliper-workspace ./ \
  --caliper-networkconfig networks/fabric/medical-consent-network.yaml \
  --caliper-benchconfig benchmarks/scenario/simple/medical-consent/config-patient-journey-workflow.yaml \
  --caliper-report-path ./reports/patient-journey-test.html
```

This test simulates a complete patient-doctor interaction workflow.

## Common Issues and Solutions

### Issue 1: "Cannot find module" Error

**Error**: `Error: Cannot find module '@hyperledger/caliper-core'`

**Solution**:

```bash
rm -rf node_modules package-lock.json
npm install
```

### Issue 2: Connection Refused

**Error**: `Error: connect ECONNREFUSED 127.0.0.1:7051`

**Solution**:

1. Check if blockchain network is running:
   ```bash
   docker ps | grep peer
   ```
2. If not running, start the network:
   ```bash
   cd /path/to/blockchain/network
   ./network.sh up
   ```

### Issue 3: Certificate Errors

**Error**: `Error: ENOENT: no such file or directory, open '/path/to/cert.pem'`

**Solution**:

1. Find correct certificate paths:
   ```bash
   find /path/to/crypto-config -name "cert.pem" -type f
   ```
2. Update `networks/fabric/medical-consent-network.yaml` with correct paths

### Issue 4: Low Performance

**Symptoms**: Very low TPS or high latency

**Solutions**:

1. Reduce worker count in configuration
2. Lower TPS targets
3. Check system resources:
   ```bash
   docker stats
   top
   ```

## Next Steps

Congratulations! You've successfully run your first blockchain performance test. Here's what to explore next:

### 1. Advanced Configurations

- Modify worker counts and TPS rates
- Create custom test scenarios
- Add monitoring and alerting

### 2. Analysis and Optimization

- Use the analysis scripts in `scripts/reporting/`
- Set up performance regression testing
- Implement continuous performance monitoring

### 3. Custom Workloads

- Create workload modules for new chaincode functions
- Implement realistic data generation
- Add business logic validation

### 4. Production Readiness

- Set up automated performance testing
- Define performance SLAs
- Implement performance monitoring dashboards

## Resources

- **Configuration Guide**: `docs/CONFIGURATION_GUIDE.md`
- **Usage Guide**: `docs/USAGE_GUIDE.md`
- **Troubleshooting**: `docs/TROUBLESHOOTING_GUIDE.md`
- **Example Configurations**: `docs/examples/EXAMPLE_CONFIGURATIONS.md`

## Getting Help

If you encounter issues:

1. Check the troubleshooting guide
2. Review the Caliper logs: `tail -f caliper.log`
3. Examine blockchain container logs: `docker logs peer0.org1.example.com`
4. Validate your environment: `node scripts/validation/index.js`

## Summary

In this tutorial, you:

- ✅ Set up the benchmarking environment
- ✅ Validated your blockchain network
- ✅ Ran your first performance test
- ✅ Analyzed the results
- ✅ Tried different test scenarios
- ✅ Learned troubleshooting basics

You're now ready to perform comprehensive blockchain performance analysis on the ConsentMD network!
