# Data Simulation in Caliper Performance Tests

## Important: All Tests Use Simulated Data

**🔒 No Real Data is Created or Modified**

All Caliper performance tests use **simulated data only**. Here's what this means:

### What Happens During Tests

✅ **Simulated Transactions**: Tests send simulated transactions to your blockchain network
✅ **Local Blockchain Only**: Data is stored only in your local blockchain network (Docker containers)
✅ **No External Systems**: No data is sent to AWS, databases, or external services
✅ **Temporary Test Data**: All test data is temporary and can be cleaned up

### What Does NOT Happen

❌ **No Real Patient Records**: No actual patient data is created
❌ **No AWS S3 Storage**: No files are uploaded to AWS S3 or any cloud storage
❌ **No External APIs**: No calls to external medical systems or APIs
❌ **No Production Data**: No interaction with production systems

## How Simulation Works

### 1. Blockchain Network Simulation

```
Your Computer/VM
├── Docker Containers (Local Blockchain Network)
│   ├── peer0.org1.example.com
│   ├── peer0.org2.example.com
│   ├── orderer.example.com
│   └── chaincode (medicalconsent)
└── Caliper Test Runner
    └── Sends simulated transactions to local blockchain
```

### 2. Simulated Data Examples

When tests run `createPatientRecord`, they generate fake data like:

```javascript
// Example simulated data (NOT real patient data)
{
  patientId: "patient-test-1234567890",
  fileName: "test-medical-report-20240827.pdf",
  condition: "test-condition",
  fileSize: 5000,
  s3ObjectKey: "test/uploads/patient-test/report-test.pdf",
  fileHash: "sha256-test-hash-1234567890abcdef",
  details: "Simulated medical consultation for testing"
}
```

### 3. Test Data Lifecycle

```
1. Test Starts → Generate fake data
2. Send Transaction → Store in local blockchain
3. Measure Performance → Record metrics (TPS, latency)
4. Test Ends → Data remains in local blockchain
5. Optional Cleanup → Remove test data from local blockchain
```

## Azure VM Considerations

### Resource Usage on Azure Standard B2ms

Your Azure VM (2 vCPUs, 8GB RAM) will use resources for:

✅ **Local Docker containers** (blockchain network)
✅ **Node.js processes** (Caliper test runner)
✅ **Simulated transaction processing**
✅ **Performance metric collection**

❌ **NOT for external API calls or cloud storage**

### Optimized Settings for Azure B2ms

```yaml
# Recommended configuration for Azure Standard B2ms
test:
  workers:
    number: 1 # Single worker for 2 vCPU system
  rounds:
    - txNumber: 20-50 # Reduced transaction count
      rateControl:
        opts:
          tps: 2-5 # Conservative TPS for 2 vCPU
```

## Data Cleanup

### Automatic Cleanup Options

1. **Container Restart**: Restart Docker containers to reset blockchain state
2. **Network Reset**: Use `./network.sh down && ./network.sh up`
3. **Selective Cleanup**: Use cleanup scripts to remove specific test data

### Manual Cleanup Script

```bash
#!/bin/bash
# cleanup-test-data.sh

echo "Cleaning up Caliper test data..."

# Stop blockchain network
cd /path/to/your/blockchain/network
./network.sh down

# Remove Docker volumes (optional - removes all blockchain data)
docker volume prune -f

# Restart network with clean state
./network.sh up

echo "Test data cleanup completed"
```

## Performance Testing Scope

### What Performance Tests Measure

✅ **Blockchain Transaction Throughput** (TPS)
✅ **Transaction Latency** (response time)
✅ **System Resource Usage** (CPU, memory)
✅ **Network Performance** (between blockchain nodes)
✅ **Chaincode Execution Performance**

### What Tests Do NOT Measure

❌ **External API Performance** (AWS, databases)
❌ **File Upload Performance** (S3, storage)
❌ **Network Latency to Cloud Services**
❌ **Real-world Data Processing**

## Security and Privacy

### No Sensitive Data Exposure

- **No PHI/PII**: No real patient health information is used
- **No Credentials**: No real AWS credentials or API keys needed for testing
- **Local Only**: All data stays within your VM/local environment
- **Temporary**: Test data is temporary and disposable

### Safe for Development

- **Development Environment**: Perfect for development and testing
- **No Compliance Issues**: No HIPAA or privacy concerns with simulated data
- **Isolated Testing**: Complete isolation from production systems

## Common Misconceptions

### ❌ "Tests create real medical records"

**✅ Reality**: Tests create simulated blockchain transactions with fake medical data

### ❌ "Files are uploaded to AWS S3"

**✅ Reality**: S3 object keys are simulated strings, no actual files are uploaded

### ❌ "Tests affect production systems"

**✅ Reality**: Tests only interact with local Docker containers

### ❌ "Need real AWS credentials"

**✅ Reality**: No external credentials needed, everything runs locally

## Verification Steps

### Confirm No External Calls

1. **Monitor Network Traffic**:

   ```bash
   # Monitor outbound connections during tests
   sudo netstat -tupln | grep :443  # Should show no AWS connections
   ```

2. **Check Docker Logs**:

   ```bash
   # Verify only local blockchain activity
   docker logs peer0.org1.example.com
   ```

3. **AWS Console Check**:
   - Log into AWS console
   - Check S3 buckets - no new files should appear during tests
   - Check CloudTrail - no API calls should be logged during tests

## Summary

**Caliper performance tests are completely safe and isolated:**

- ✅ **Simulated data only** - no real patient information
- ✅ **Local blockchain network** - runs in Docker containers on your VM
- ✅ **No external connections** - no AWS, S3, or external API calls
- ✅ **Temporary test data** - can be easily cleaned up
- ✅ **Performance focused** - measures blockchain performance, not external systems
- ✅ **Development safe** - perfect for development and testing environments

You can run these tests confidently knowing that no real data is created, modified, or transmitted to external systems.
