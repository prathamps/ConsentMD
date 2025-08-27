# Blockchain Network and Chaincode Validation

This module provides comprehensive validation capabilities for the ConsentMD blockchain network, including network connectivity checks, TLS certificate validation, and chaincode deployment verification.

## Features

### Network Validation

- **Peer Connectivity**: Tests connection to all peer nodes
- **Orderer Connectivity**: Validates orderer availability
- **Certificate Authority**: Checks CA endpoints
- **TLS Certificate Validation**: Verifies certificate files and validity
- **Connection Timeout Testing**: Configurable timeout settings

### Chaincode Validation

- **Deployment Verification**: Confirms chaincode installation and instantiation
- **Function Availability**: Tests all expected chaincode functions
- **Version Verification**: Validates chaincode version information
- **Cross-Organization Testing**: Tests from multiple organization perspectives
- **Health Monitoring**: Continuous monitoring capabilities

## Usage

### Command Line Interface

```bash
# Run complete validation suite
npm run validate

# Run only network validation
npm run validate:network

# Run only chaincode validation
npm run validate:chaincode

# Quick health check
npm run validate:quick

# Custom options
node scripts/validation/index.js --help
```

### Programmatic Usage

```javascript
const {
	ValidationSuite,
	NetworkValidator,
	ChaincodeValidator,
} = require("./scripts/validation")

// Complete validation
const suite = new ValidationSuite({
	networkConfigPath: "path/to/network-config.yaml",
	outputDir: "path/to/reports",
	exportResults: true,
})

const success = await suite.runValidation()

// Network validation only
const networkValidator = new NetworkValidator(
	"path/to/network-config.yaml",
	"path/to/connection-profiles"
)

const networkResults = await networkValidator.validateNetwork()

// Chaincode validation only
const chaincodeValidator = new ChaincodeValidator(
	"path/to/network-config.yaml",
	"path/to/connection-profiles"
)

const chaincodeResults = await chaincodeValidator.validateChaincode()
```

## Configuration

### Network Configuration

The validation system uses the existing Caliper network configuration files:

- `networks/fabric/medical-consent-network.yaml` - Main network configuration
- `networks/fabric/connection-org1-caliper.json` - Org1 connection profile
- `networks/fabric/connection-org2-caliper.json` - Org2 connection profile

### Expected Chaincode Functions

The validator checks for these medical consent chaincode functions:

- `registerDoctorProfile`
- `createPatientRecord`
- `createMedicalRecord`
- `updateRecordDetails`
- `archiveMedicalRecord`
- `removeFileFromRecord`
- `grantConsent`
- `revokeConsent`
- `getRecordById`
- `findAssetsByQuery`
- `getAssetHistory`
- `assetExistsByQuery`
- `addPrivateNoteToRecord`
- `getMyId`

## Output and Reporting

### Console Output

- Real-time validation progress
- Detailed status for each component
- Summary with pass/fail status
- Error details and recommendations

### JSON Reports

When `exportResults` is enabled, the system generates:

- `validation-report-{timestamp}.json` - Complete validation results
- `network-validation-{timestamp}.json` - Network-specific results
- `chaincode-validation-{timestamp}.json` - Chaincode-specific results

### Report Structure

```json
{
  "timestamp": "2024-01-01T00:00:00.000Z",
  "overall": true,
  "network": {
    "overall": true,
    "peers": {
      "peer0.org1.example.com": {
        "available": true,
        "url": "grpcs://localhost:7051",
        "responseTime": 45
      }
    },
    "orderers": { ... },
    "certificateAuthorities": { ... },
    "tlsCertificates": { ... }
  },
  "chaincode": {
    "overall": true,
    "chaincode": {
      "installed": true,
      "instantiated": true,
      "version": "1",
      "functions": {
        "registerDoctorProfile": {
          "available": true,
          "responseTime": 120
        }
      }
    }
  }
}
```

## Health Monitoring

### Continuous Monitoring

```javascript
const chaincodeValidator = new ChaincodeValidator(networkConfig, profilesPath)

// Start monitoring with 60-second intervals
const monitoringInterval = await chaincodeValidator.startHealthMonitoring(60000)

// Stop monitoring
clearInterval(monitoringInterval)
```

### Integration with CI/CD

The validation scripts return appropriate exit codes:

- `0` - All validations passed
- `1` - One or more validations failed

This makes them suitable for integration with CI/CD pipelines.

## Error Handling

### Common Issues and Solutions

1. **Connection Timeouts**

   - Check if blockchain network is running
   - Verify firewall settings
   - Confirm correct ports in configuration

2. **TLS Certificate Errors**

   - Verify certificate file paths
   - Check certificate validity dates
   - Ensure proper file permissions

3. **Chaincode Function Failures**

   - Confirm chaincode is deployed and instantiated
   - Check function names match exactly
   - Verify channel and contract configuration

4. **Authentication Errors**
   - Validate identity certificates and keys
   - Check MSP configuration
   - Ensure proper organization setup

## Dependencies

- `fabric-network` - Hyperledger Fabric SDK
- `fabric-ca-client` - Certificate Authority client
- `js-yaml` - YAML configuration parsing
- `tls` - TLS certificate validation
- `https` - HTTPS connections for CA testing

## Best Practices

1. **Pre-Benchmark Validation**: Always run validation before performance testing
2. **Regular Health Checks**: Use monitoring for production environments
3. **Comprehensive Logging**: Enable detailed logging for troubleshooting
4. **Timeout Configuration**: Adjust timeouts based on network conditions
5. **Certificate Management**: Regularly validate certificate expiration dates

## Troubleshooting

### Debug Mode

Set environment variable for detailed logging:

```bash
export DEBUG=validation:*
npm run validate
```

### Manual Testing

Test individual components:

```bash
# Test specific peer connection
node -e "
const { NetworkValidator } = require('./scripts/validation');
const validator = new NetworkValidator('networks/fabric/medical-consent-network.yaml');
validator.loadConfigurations().then(() => {
  // Manual testing code here
});
"
```

### Log Analysis

Check validation reports in the `reports/validation/` directory for detailed analysis of failures and performance metrics.
