# Troubleshooting Guide for ConsentMD Blockchain Performance Analysis

## Overview

This guide provides solutions to common issues encountered when running Caliper benchmarks for the ConsentMD blockchain network. Issues are organized by category with step-by-step resolution procedures.

## Table of Contents

1. [Environment Setup Issues](#environment-setup-issues)
2. [Network Configuration Problems](#network-configuration-problems)
3. [Certificate and Authentication Issues](#certificate-and-authentication-issues)
4. [Performance and Resource Issues](#performance-and-resource-issues)
5. [Workload Module Errors](#workload-module-errors)
6. [Data and State Issues](#data-and-state-issues)
7. [Monitoring and Reporting Problems](#monitoring-and-reporting-problems)
8. [Advanced Troubleshooting](#advanced-troubleshooting)

## Environment Setup Issues

### Issue: Node.js Version Compatibility

**Symptoms**:

```
Error: The engine "node" is incompatible with this module
Expected version ">=14.0.0"
```

**Diagnosis**:

```bash
node --version
npm --version
```

**Solution**:

1. Install Node.js 14 or higher:

   ```bash
   # Using nvm (recommended)
   nvm install 16
   nvm use 16

   # Or download from nodejs.org
   ```

2. Verify installation:

   ```bash
   node --version  # Should show v14.x.x or higher
   ```

3. Reinstall dependencies:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

### Issue: Caliper CLI Installation Problems

**Symptoms**:

```
caliper: command not found
```

**Solution**:

1. Install Caliper CLI globally:

   ```bash
   npm install -g @hyperledger/caliper-cli
   ```

2. Verify installation:

   ```bash
   caliper --version
   ```

3. If permission issues occur:

   ```bash
   # Use npx instead
   npx @hyperledger/caliper-cli --version

   # Or fix npm permissions
   npm config set prefix ~/.npm-global
   export PATH=~/.npm-global/bin:$PATH
   ```

### Issue: Missing Dependencies

**Symptoms**:

```
Error: Cannot find module '@hyperledger/caliper-core'
Module not found: fabric-network
```

**Solution**:

1. Install all dependencies:

   ```bash
   npm install
   ```

2. Install Fabric SDK specifically:

   ```bash
   npm install fabric-network fabric-ca-client
   ```

3. For development dependencies:
   ```bash
   npm install --dev
   ```

## Network Configuration Problems

### Issue: Blockchain Network Not Running

**Symptoms**:

```
Error: Failed to connect to peer peer0.org1.example.com:7051
Connection refused
```

**Diagnosis**:

```bash
# Check if containers are running
docker ps

# Check specific containers
docker ps | grep peer
docker ps | grep orderer
```

**Solution**:

1. Start the blockchain network:

   ```bash
   cd /path/to/blockchain/network
   ./network.sh up
   ```

2. Verify network status:

   ```bash
   docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
   ```

3. Check container logs if issues persist:
   ```bash
   docker logs peer0.org1.example.com
   docker logs orderer.example.com
   ```

### Issue: Incorrect Network Endpoints

**Symptoms**:

```
Error: 14 UNAVAILABLE: failed to connect to all addresses
grpc: connection timeout
```

**Diagnosis**:
Check connection profiles for correct URLs and ports.

**Solution**:

1. Verify peer endpoints:

   ```bash
   # Test connectivity
   telnet localhost 7051
   telnet localhost 8051
   ```

2. Update connection profiles:

   ```json
   {
   	"peers": {
   		"peer0.org1.example.com": {
   			"url": "grpcs://localhost:7051",
   			"grpcOptions": {
   				"ssl-target-name-override": "peer0.org1.example.com"
   			}
   		}
   	}
   }
   ```

3. Ensure port mapping in Docker:
   ```bash
   docker port peer0.org1.example.com
   ```

### Issue: Channel Configuration Problems

**Symptoms**:

```
Error: Channel 'mychannel' not found
Chaincode 'medicalconsent' not found on channel
```

**Solution**:

1. Verify channel exists:

   ```bash
   docker exec peer0.org1.example.com peer channel list
   ```

2. Check chaincode installation:

   ```bash
   docker exec peer0.org1.example.com peer lifecycle chaincode queryinstalled
   docker exec peer0.org1.example.com peer lifecycle chaincode querycommitted -C mychannel
   ```

3. Reinstall/redeploy if necessary:
   ```bash
   # Follow your network's chaincode deployment process
   ./deployChaincode.sh
   ```

## Certificate and Authentication Issues

### Issue: Certificate Path Errors

**Symptoms**:

```
Error: ENOENT: no such file or directory, open '/path/to/cert.pem'
Certificate file not found
```

**Diagnosis**:

```bash
# Check if certificate files exist
ls -la /path/to/crypto-config/peerOrganizations/org1.example.com/users/User1@org1.example.com/msp/keystore/
ls -la /path/to/crypto-config/peerOrganizations/org1.example.com/users/User1@org1.example.com/msp/signcerts/
```

**Solution**:

1. Find correct certificate paths:

   ```bash
   find /path/to/crypto-config -name "*.pem" -type f
   find /path/to/crypto-config -name "*_sk" -type f
   ```

2. Update network configuration:

   ```yaml
   organizations:
     - mspid: Org1MSP
       identities:
         certificates:
           - name: User1
             clientPrivateKey:
               path: /correct/path/to/keystore/priv_sk
             clientSignedCert:
               path: /correct/path/to/signcerts/cert.pem
   ```

3. Verify certificate validity:
   ```bash
   openssl x509 -in /path/to/cert.pem -text -noout
   ```

### Issue: TLS Certificate Problems

**Symptoms**:

```
Error: certificate verify failed
TLS handshake failure
```

**Solution**:

1. Check TLS certificate paths:

   ```bash
   ls -la /path/to/tlscacerts/
   ```

2. Update connection profile:

   ```json
   {
   	"peers": {
   		"peer0.org1.example.com": {
   			"tlsCACerts": {
   				"path": "/correct/path/to/tlscacerts/tlsca.org1.example.com-cert.pem"
   			}
   		}
   	}
   }
   ```

3. For development, disable TLS (not recommended for production):
   ```json
   {
   	"peers": {
   		"peer0.org1.example.com": {
   			"url": "grpc://localhost:7051"
   		}
   	}
   }
   ```

### Issue: MSP Configuration Errors

**Symptoms**:

```
Error: Identity not found in MSP
Invalid MSP configuration
```

**Solution**:

1. Verify MSP ID matches network configuration:

   ```bash
   docker exec peer0.org1.example.com peer channel list
   ```

2. Check MSP directory structure:

   ```bash
   ls -la /path/to/crypto-config/peerOrganizations/org1.example.com/msp/
   ```

3. Update organization configuration:
   ```yaml
   organizations:
     - mspid: Org1MSP # Must match network MSP ID
   ```

## Performance and Resource Issues

### Issue: Low Transaction Throughput

**Symptoms**:

- TPS significantly lower than expected
- High transaction latency
- Timeouts during benchmark execution

**Diagnosis**:

1. Check system resources:

   ```bash
   top
   htop
   docker stats
   ```

2. Monitor network latency:
   ```bash
   ping peer0.org1.example.com
   ping peer0.org2.example.com
   ```

**Solution**:

1. Reduce worker count:

   ```yaml
   workers:
     type: local
     number: 2 # Reduce from higher number
   ```

2. Lower TPS targets:

   ```yaml
   rateControl:
     type: fixed-rate
     opts:
       tps: 5 # Reduce from higher value
   ```

3. Increase timeouts:
   ```yaml
   # In connection profile
   "grpcOptions":
     {
       "grpc.keepalive_time_ms": 120000,
       "grpc.keepalive_timeout_ms": 5000,
       "grpc.keepalive_permit_without_calls": true,
       "grpc.http2.max_pings_without_data": 0,
       "grpc.http2.min_time_between_pings_ms": 10000,
       "grpc.http2.min_ping_interval_without_data_ms": 300000,
     }
   ```

### Issue: Memory Exhaustion

**Symptoms**:

```
Error: JavaScript heap out of memory
FATAL ERROR: Ineffective mark-compacts near heap limit
```

**Solution**:

1. Increase Node.js heap size:

   ```bash
   export NODE_OPTIONS="--max-old-space-size=4096"
   ```

2. Reduce concurrent operations:

   ```yaml
   workers:
     type: local
     number: 1 # Reduce worker count
   ```

3. Implement data cleanup:
   ```javascript
   // In workload modules
   async cleanupWorkloadModule() {
     // Clear large data structures
     this.largeDataArray = null;
     if (global.gc) {
       global.gc();
     }
   }
   ```

### Issue: High Error Rates

**Symptoms**:

- Success rate below 95%
- Frequent transaction failures
- Endorsement policy failures

**Diagnosis**:

1. Check error types in Caliper logs:

   ```bash
   grep -i error caliper.log
   ```

2. Examine blockchain logs:
   ```bash
   docker logs peer0.org1.example.com 2>&1 | grep -i error
   ```

**Solution**:

1. Reduce transaction rate:

   ```yaml
   rateControl:
     type: fixed-rate
     opts:
       tps: 2 # Start low and increase gradually
   ```

2. Add retry logic in workload modules:
   ```javascript
   async submitTransaction() {
     const maxRetries = 3;
     for (let i = 0; i < maxRetries; i++) {
       try {
         return await this.sutAdapter.sendRequests(request);
       } catch (error) {
         if (i === maxRetries - 1) throw error;
         await new Promise(resolve => setTimeout(resolve, 1000));
       }
     }
   }
   ```

## Workload Module Errors

### Issue: Module Not Found

**Symptoms**:

```
Error: Cannot find module 'benchmarks/scenario/simple/medical-consent/functionName.js'
Module resolution failed
```

**Solution**:

1. Verify file exists:

   ```bash
   ls -la benchmarks/scenario/simple/medical-consent/
   ```

2. Check path in configuration:

   ```yaml
   workload:
     module: benchmarks/scenario/simple/medical-consent/createPatientRecord.js # Correct path
   ```

3. Ensure proper file permissions:
   ```bash
   chmod +r benchmarks/scenario/simple/medical-consent/*.js
   ```

### Issue: Workload Module Syntax Errors

**Symptoms**:

```
SyntaxError: Unexpected token
ReferenceError: variable is not defined
```

**Solution**:

1. Validate JavaScript syntax:

   ```bash
   node -c benchmarks/scenario/simple/medical-consent/createPatientRecord.js
   ```

2. Check for common issues:

   - Missing semicolons
   - Undefined variables
   - Incorrect function declarations

3. Use linting tools:
   ```bash
   npm install -g eslint
   eslint benchmarks/scenario/simple/medical-consent/*.js
   ```

### Issue: Chaincode Function Errors

**Symptoms**:

```
Error: Chaincode function 'functionName' not found
Transaction proposal failed
```

**Solution**:

1. Verify chaincode functions:

   ```bash
   # Query chaincode metadata
   docker exec peer0.org1.example.com peer chaincode query -C mychannel -n medicalconsent -c '{"function":"org.hyperledger.fabric:GetMetadata","Args":[]}'
   ```

2. Check function names in workload modules:

   ```javascript
   const request = {
   	contractId: "medicalconsent",
   	contractFunction: "createPatientRecord", // Must match chaincode function
   	contractArguments: [args],
   	readOnly: false,
   }
   ```

3. Update chaincode if necessary and redeploy.

## Data and State Issues

### Issue: Data Consistency Problems

**Symptoms**:

- Transactions fail due to missing referenced data
- Inconsistent test results
- State conflicts between test rounds

**Solution**:

1. Implement proper data setup:

   ```yaml
   rounds:
     - label: data-setup
       description: Create required test data
       txNumber: 50
       workload:
         module: benchmarks/scenario/simple/medical-consent/createPatientRecord.js

     - label: dependent-operations
       description: Operations requiring existing data
       txNumber: 30
       workload:
         module: benchmarks/scenario/simple/medical-consent/updateRecordDetails.js
         arguments:
           useExistingRecords: true
   ```

2. Use data validation utilities:

   ```javascript
   // In workload modules
   const { validateDataExists } = require('./utils/dataValidator');

   async submitTransaction() {
     await validateDataExists('patientRecord', this.patientId);
     // Proceed with transaction
   }
   ```

3. Implement cleanup between tests:
   ```javascript
   async cleanupWorkloadModule() {
     await this.dataCleanup.resetTestData();
   }
   ```

### Issue: State Conflicts

**Symptoms**:

```
Error: MVCC_READ_CONFLICT
Transaction validation failed
```

**Solution**:

1. Reduce concurrent operations on same data:

   ```yaml
   workers:
     type: local
     number: 2 # Reduce concurrency
   ```

2. Use unique identifiers:

   ```javascript
   // Generate unique IDs per worker
   const workerId = this.workerIndex
   const recordId = `record-${workerId}-${Date.now()}`
   ```

3. Implement retry with backoff:
   ```javascript
   async submitTransaction() {
     const maxRetries = 5;
     for (let i = 0; i < maxRetries; i++) {
       try {
         return await this.sutAdapter.sendRequests(request);
       } catch (error) {
         if (error.message.includes('MVCC_READ_CONFLICT')) {
           const delay = Math.random() * 1000 * (i + 1);
           await new Promise(resolve => setTimeout(resolve, delay));
           continue;
         }
         throw error;
       }
     }
   }
   ```

## Monitoring and Reporting Problems

### Issue: Prometheus Connection Failed

**Symptoms**:

```
Error: connect ECONNREFUSED 127.0.0.1:9090
Prometheus metrics unavailable
```

**Solution**:

1. Verify Prometheus is running:

   ```bash
   curl http://localhost:9090/api/v1/status/config
   ```

2. Start Prometheus if not running:

   ```bash
   # Using Docker
   docker run -d -p 9090:9090 prom/prometheus

   # Or start existing container
   docker start prometheus
   ```

3. Update monitoring configuration:
   ```yaml
   monitors:
     resource:
       - module: prometheus
         options:
           url: "http://localhost:9090" # Verify URL
   ```

### Issue: Missing Metrics

**Symptoms**:

- Empty or incomplete performance reports
- Missing resource utilization data

**Solution**:

1. Check metric names:

   ```bash
   curl http://localhost:9090/api/v1/label/__name__/values
   ```

2. Verify metric queries:

   ```yaml
   metrics:
     include:
       Memory Usage: container_memory_usage_bytes{name=~".+"} # Verify metric exists
   ```

3. Increase observer interval:
   ```yaml
   observer:
     type: prometheus
     interval: 1 # More frequent sampling
   ```

### Issue: Report Generation Failures

**Symptoms**:

```
Error: Failed to generate HTML report
Template rendering failed
```

**Solution**:

1. Check report template:

   ```bash
   ls -la node_modules/@hyperledger/caliper-core/lib/common/utils/report/
   ```

2. Verify output directory permissions:

   ```bash
   mkdir -p reports
   chmod 755 reports
   ```

3. Use custom report generation:
   ```bash
   node scripts/reporting/generateReport.js --input caliper-results.json --output custom-report.html
   ```

## Advanced Troubleshooting

### Debug Mode

Enable detailed logging for troubleshooting:

```bash
export CALIPER_LOG_LEVEL=debug
export DEBUG=caliper*
```

### Network Analysis

Use network analysis tools:

```bash
# Monitor network traffic
sudo tcpdump -i any port 7051

# Check connection states
netstat -an | grep 7051

# Monitor DNS resolution
nslookup peer0.org1.example.com
```

### Container Debugging

Debug blockchain containers:

```bash
# Enter container for debugging
docker exec -it peer0.org1.example.com bash

# Check container resources
docker stats peer0.org1.example.com

# Examine container configuration
docker inspect peer0.org1.example.com
```

### Performance Profiling

Profile Node.js performance:

```bash
# Enable profiling
node --prof caliper.js

# Analyze profile
node --prof-process isolate-*.log > profile.txt
```

### Log Analysis

Analyze logs systematically:

```bash
# Extract error patterns
grep -E "(ERROR|FATAL|Exception)" caliper.log

# Analyze transaction patterns
grep "Transaction" caliper.log | awk '{print $1, $2}' | sort | uniq -c

# Monitor resource usage over time
grep "Memory\|CPU" caliper.log | tail -100
```

### Environment Validation Script

Create a comprehensive validation script:

```bash
#!/bin/bash
# validate-environment.sh

echo "=== Environment Validation ==="

# Check Node.js version
echo "Node.js version:"
node --version

# Check npm version
echo "npm version:"
npm --version

# Check Caliper installation
echo "Caliper version:"
npx @hyperledger/caliper-cli --version

# Check Docker
echo "Docker version:"
docker --version

# Check blockchain network
echo "Blockchain containers:"
docker ps --format "table {{.Names}}\t{{.Status}}"

# Check network connectivity
echo "Network connectivity:"
nc -zv localhost 7051
nc -zv localhost 8051
nc -zv localhost 7050

# Check certificate files
echo "Certificate validation:"
if [ -f "/path/to/cert.pem" ]; then
  openssl x509 -in /path/to/cert.pem -noout -dates
else
  echo "Certificate file not found"
fi

echo "=== Validation Complete ==="
```

### Getting Additional Help

1. **Enable Verbose Logging**:

   ```bash
   export CALIPER_LOG_LEVEL=debug
   export GRPC_VERBOSITY=DEBUG
   export GRPC_TRACE=all
   ```

2. **Collect System Information**:

   ```bash
   # System info
   uname -a
   cat /etc/os-release

   # Resource info
   free -h
   df -h
   lscpu
   ```

3. **Create Minimal Reproduction**:

   - Use single worker
   - Single transaction
   - Minimal configuration
   - Basic workload module

4. **Community Resources**:
   - Hyperledger Caliper documentation
   - Hyperledger Discord/Slack channels
   - GitHub issues and discussions
   - Stack Overflow with hyperledger-caliper tag

Remember to sanitize logs and configurations before sharing, removing any sensitive information like private keys or production endpoints.
