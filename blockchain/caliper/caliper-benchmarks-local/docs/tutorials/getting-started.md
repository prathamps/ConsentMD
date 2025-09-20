# Getting Started with ConsentMD Benchmarks

This tutorial will guide you through running your first ConsentMD benchmark test from start to finish.

## Prerequisites

Before starting, ensure you have:

- Node.js 18.0.0 or higher
- npm 8.0.0 or higher
- A running Hyperledger Fabric network with the ConsentMD chaincode deployed
- At least 4GB of available RAM

## Step 1: Setup Verification

First, let's verify that your environment is properly configured:

### Linux/macOS:

```bash
cd blockchain/caliper/caliper-benchmarks-local
chmod +x verify-setup.sh
./verify-setup.sh
```

### Windows:

```cmd
cd blockchain\caliper\caliper-benchmarks-local
verify-setup.bat
```

If the verification script reports any failures, address those issues before proceeding.

## Step 2: Install Dependencies

Install the required npm packages:

```bash
npm install
```

This will install Hyperledger Caliper and all necessary dependencies.

## Step 3: Start Your Fabric Network

Ensure your ConsentMD Fabric network is running. The exact commands depend on your network setup, but typically:

```bash
# Navigate to your fabric network directory
cd ../../  # Adjust path as needed

# Start the network (example - adjust for your setup)
./scripts/start-network.sh

# Verify the network is running
docker ps | grep hyperledger
```

You should see containers for peers, orderers, and other Fabric components.

## Step 4: Run Your First Benchmark

Let's start with a simple single benchmark to test the setup:

### Linux/macOS:

```bash
chmod +x run-single-benchmark.sh
./run-single-benchmark.sh consent-granting
```

### Windows:

```cmd
run-single-benchmark.bat consent-granting
```

This will run the consent granting benchmark, which typically takes about 6-7 minutes including setup and cleanup.

## Step 5: Review the Results

After the benchmark completes, you'll find results in the `results/` directory:

```
results/
└── single-YYYYMMDD_HHMMSS/
    ├── consent-granting-report.html    # Main results report
    └── execution.log                   # Detailed execution log
```

### Opening the Report

Open the HTML report in your web browser:

**Linux/macOS:**

```bash
# Replace with your actual results directory
open results/single-*/consent-granting-report.html
```

**Windows:**

```cmd
REM Replace with your actual results directory
start results\single-*\consent-granting-report.html
```

### Understanding the Report

The HTML report contains several key sections:

1. **Test Summary**: Overview of the test configuration and results
2. **Performance Charts**: Visual representation of throughput and latency
3. **Detailed Metrics**: Comprehensive performance statistics
4. **Resource Utilization**: System resource usage during the test

## Step 6: Interpret Your Results

For the consent granting benchmark, look for:

- **Throughput**: Should be around 45-55 TPS (target: 50 TPS)
- **Average Latency**: Should be 1-2 seconds
- **Success Rate**: Should be >98%
- **95th Percentile Latency**: Should be <4 seconds

If your results are significantly different, check:

- Network connectivity and health
- System resource availability
- Chaincode deployment status

## Step 7: Run the Full Benchmark Suite

Once you've successfully run a single benchmark, try the full suite:

### Linux/macOS:

```bash
chmod +x run-benchmarks.sh
./run-benchmarks.sh
```

### Windows:

```cmd
run-benchmarks.bat
```

This will run all four benchmark scenarios:

1. Consent Granting (5 minutes)
2. Record Access (5 minutes)
3. Consent Revocation (5 minutes)
4. Mixed Workload (5 minutes)

Total execution time is approximately 25-30 minutes including setup and cleanup phases.

## Troubleshooting Common Issues

### Issue: "Network configuration not found"

**Solution**: Verify that `networks/fabric/consent-management-network.yaml` exists and contains correct network details.

### Issue: "Chaincode not found" errors

**Solution**: Ensure the `medicalconsent` chaincode is deployed on `mychannel`:

```bash
peer chaincode list --installed
peer chaincode list --instantiated -C mychannel
```

### Issue: Low throughput or high latency

**Solutions**:

- Check system resources (CPU, memory)
- Verify network connectivity to peers/orderers
- Reduce transaction rates in benchmark configurations
- Check peer and orderer logs for bottlenecks

### Issue: Transaction failures

**Solutions**:

- Verify identity configurations in connection profiles
- Check chaincode logs for validation errors
- Ensure proper permissions for patient/doctor identities

## Next Steps

After successfully running benchmarks:

1. **Analyze Results**: Use the [Performance Results Guide](../performance-results-guide.md) for detailed analysis
2. **Customize Tests**: Modify benchmark configurations for your specific requirements
3. **Automate Testing**: Set up regular benchmark runs to monitor performance over time
4. **Compare Results**: Track performance trends across different network configurations

## Advanced Usage

### Custom Benchmark Configuration

You can modify benchmark parameters by editing the YAML configuration files in `benchmarks/consent-management/`:

```yaml
# Example: Increase transaction rate
rateControl:
  type: fixed-rate
  opts:
    tps: 75 # Increased from 50
```

### Running with Debug Logging

For troubleshooting, enable debug logging:

```bash
DEBUG=caliper* npx caliper launch manager [options]
```

### Custom Test Data Volumes

Modify workload arguments to change test data sizes:

```yaml
workload:
  module: workloads/consent-granting.js
  arguments:
    patientCount: 200 # Increased from default
    doctorCount: 50 # Increased from default
```

## Getting Help

If you encounter issues:

1. Check the execution logs in `results/*/execution.log`
2. Review the troubleshooting section in the main README
3. Consult the [Performance Results Guide](../performance-results-guide.md)
4. Check Hyperledger Caliper documentation
5. Review Fabric network logs using `docker logs [container-name]`

## Conclusion

You've successfully run your first ConsentMD benchmark! The benchmark suite provides comprehensive performance testing capabilities for the consent management system. Regular benchmarking helps ensure your system meets performance requirements and identifies potential issues before they impact users.

For more advanced analysis and customization options, explore the additional documentation in the `docs/` directory.
