# Azure VM Setup Guide for ConsentMD Performance Testing

## Your Environment: Azure Standard B2ms

**Specifications:**

- **vCPUs**: 2
- **RAM**: 8GB
- **Platform**: Linux (when you migrate from Windows)
- **Performance Testing**: Optimized configurations provided

## Quick Setup (Linux VM)

### 1. Make Scripts Executable

```bash
# After cloning/copying files to your Linux VM
cd ConsentMD/blockchain/caliper/caliper-benchmarks-local
chmod +x scripts/make-executable.sh
./scripts/make-executable.sh
```

### 2. Quick Start Test

```bash
# Run Azure-optimized benchmark
./scripts/azure-quickstart.sh
```

This will:

- Set optimal memory limits for your 8GB RAM
- Configure single worker for 2 vCPU system
- Run conservative TPS targets (2-5 TPS)
- Generate a performance report

## Important: Simulated Data Only

**🔒 Your tests are completely safe:**

- ✅ **No real patient data** - all data is simulated
- ✅ **No AWS calls** - everything runs locally in Docker
- ✅ **No external systems** - only your local blockchain network
- ✅ **No S3 uploads** - file references are simulated strings

See [Data Simulation Explained](DATA_SIMULATION_EXPLAINED.md) for complete details.

## Optimized Configurations for Your VM

### 1. Azure-Optimized Config (Recommended)

```bash
./scripts/execution/run-benchmark.sh \
  -c benchmarks/scenario/simple/medical-consent/config-azure-optimized.yaml
```

**Settings:**

- 1 worker (optimal for 2 vCPUs)
- 2-5 TPS targets
- Reduced transaction counts
- 10-second monitoring intervals

### 2. Light Load Config

```bash
./scripts/execution/run-benchmark.sh \
  -c benchmarks/scenario/simple/medical-consent/config-light-load.yaml
```

**Settings:**

- 2 workers maximum
- 1-5 TPS targets
- Good for baseline testing

### 3. Medium Load Config (Use Carefully)

```bash
./scripts/execution/run-benchmark.sh \
  -c benchmarks/scenario/simple/medical-consent/config-medium-load.yaml
```

**Warning:** May be resource-intensive for 2 vCPU system. Monitor performance.

## Resource Optimization

### Memory Settings

```bash
# Set before running tests
export NODE_OPTIONS="--max-old-space-size=4096"  # 4GB heap limit
```

### Docker Resource Limits

```bash
# Limit Docker memory usage (optional)
docker update --memory=6g --memory-swap=6g $(docker ps -q)
```

### System Monitoring

```bash
# Monitor resources during tests
watch -n 2 'free -h && echo && docker stats --no-stream'
```

## Expected Performance

### Realistic Expectations for Azure B2ms

**Typical Results:**

- **createPatientRecord**: 2-4 TPS, 300-800ms latency
- **getRecordById**: 4-8 TPS, 100-300ms latency
- **grantConsent**: 1-3 TPS, 400-1000ms latency

**Success Criteria:**

- Success rate: >95%
- System stability: No crashes or memory issues
- Consistent performance: Low variance in latency

## Troubleshooting

### Common Issues on Azure VMs

1. **Out of Memory Errors**

   ```bash
   # Reduce worker count and TPS
   # Use config-azure-optimized.yaml
   ```

2. **High CPU Usage**

   ```bash
   # Monitor with: top
   # Reduce concurrent operations
   ```

3. **Docker Issues**
   ```bash
   # Restart Docker service
   sudo systemctl restart docker
   ```

### Performance Issues

1. **Low TPS**

   - Expected for 2 vCPU system
   - Use azure-optimized configuration
   - Don't run multiple tests simultaneously

2. **High Latency**
   - Normal for resource-constrained environment
   - Focus on consistency rather than absolute performance

## File Structure

```
ConsentMD/blockchain/caliper/caliper-benchmarks-local/
├── scripts/
│   ├── azure-quickstart.sh              # Quick start for Azure VMs
│   ├── make-executable.sh               # Make scripts executable
│   ├── execution/
│   │   └── run-benchmark.sh             # Full benchmark runner
│   └── validation/
│       └── azure-vm-validator.sh        # Environment validator
├── benchmarks/scenario/simple/medical-consent/
│   ├── config-azure-optimized.yaml     # Azure VM optimized config
│   ├── config-light-load.yaml          # Light load config
│   └── config-medium-load.yaml         # Medium load config
├── docs/
│   ├── DATA_SIMULATION_EXPLAINED.md    # Explains simulated data
│   └── AZURE_VM_SETUP.md              # This file
└── reports/                            # Generated reports
```

## Next Steps

1. **Start with Quick Test**:

   ```bash
   ./scripts/azure-quickstart.sh
   ```

2. **Review Results**:

   - Open generated HTML report
   - Check success rates and latency
   - Verify system stability

3. **Run Additional Tests**:

   - Try different configurations
   - Compare results over time
   - Use analysis scripts

4. **Optimize if Needed**:
   - Adjust worker counts
   - Modify TPS targets
   - Tune system resources

## Support

- **Documentation**: See `docs/` directory for comprehensive guides
- **Troubleshooting**: Check `docs/TROUBLESHOOTING_GUIDE.md`
- **Examples**: Review `docs/examples/EXAMPLE_CONFIGURATIONS.md`

Your Azure Standard B2ms VM is well-suited for blockchain performance testing with the provided optimized configurations!
