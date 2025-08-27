# Example Configurations for ConsentMD Blockchain Benchmarks

## Overview

This document provides detailed examples of Caliper configurations for different testing scenarios. Each example includes explanations of configuration choices and expected outcomes.

## Table of Contents

1. [Basic Function Testing](#basic-function-testing)
2. [Load Profile Examples](#load-profile-examples)
3. [Workflow Scenario Examples](#workflow-scenario-examples)
4. [Advanced Configuration Examples](#advanced-configuration-examples)
5. [Custom Monitoring Examples](#custom-monitoring-examples)

## Basic Function Testing

### Single Function Test

**Use Case**: Test a specific chaincode function in isolation

```yaml
test:
  name: single-function-test
  description: Test createPatientRecord function performance
  workers:
    type: local
    number: 1
  rounds:
    - label: createPatientRecord
      description: Create patient records with realistic data
      txNumber: 50
      rateControl:
        type: fixed-rate
        opts:
          tps: 2
      workload:
        module: benchmarks/scenario/simple/medical-consent/createPatientRecord.js
        arguments:
          recordType: "consultation"
          includeFiles: true
          generateRealisticData: true
```

**Configuration Explanation**:

- **Single worker**: Eliminates concurrency issues for baseline testing
- **Fixed rate (2 TPS)**: Consistent load for reliable measurements
- **50 transactions**: Sufficient for statistical significance
- **Workload arguments**: Customize data generation behavior

**Expected Results**:

- Baseline performance metrics for record creation
- Average latency: 200-500ms
- Success rate: 100% under normal conditions

### Function Comparison Test

**Use Case**: Compare performance between read and write operations

```yaml
test:
  name: read-write-comparison
  description: Compare read vs write operation performance
  workers:
    type: local
    number: 2
  rounds:
    # Write operation baseline
    - label: write-baseline
      description: Create records for read testing
      txNumber: 100
      rateControl:
        type: fixed-rate
        opts:
          tps: 3
      workload:
        module: benchmarks/scenario/simple/medical-consent/createPatientRecord.js
        arguments: {}

    # Read operation test
    - label: read-performance
      description: Read existing records
      txNumber: 200
      rateControl:
        type: fixed-rate
        opts:
          tps: 10
      workload:
        module: benchmarks/scenario/simple/medical-consent/getRecordById.js
        arguments:
          useExistingRecords: true

    # Write operation test
    - label: write-performance
      description: Create new records under load
      txNumber: 100
      rateControl:
        type: fixed-rate
        opts:
          tps: 3
      workload:
        module: benchmarks/scenario/simple/medical-consent/createMedicalRecord.js
        arguments: {}
```

**Configuration Explanation**:

- **Sequential rounds**: First creates data, then tests read/write performance
- **Different TPS rates**: Reflects typical read-heavy workload patterns
- **Comparative metrics**: Enables direct performance comparison

## Load Profile Examples

### Progressive Load Test

**Use Case**: Determine optimal TPS for a specific function

```yaml
test:
  name: progressive-load-test
  description: Find optimal TPS for createPatientRecord function
  workers:
    type: local
    number: 3
  rounds:
    - label: load-level-1
      description: Low load - 2 TPS
      txNumber: 60
      rateControl:
        type: fixed-rate
        opts:
          tps: 2
      workload:
        module: benchmarks/scenario/simple/medical-consent/createPatientRecord.js
        arguments: {}

    - label: load-level-2
      description: Medium load - 5 TPS
      txNumber: 150
      rateControl:
        type: fixed-rate
        opts:
          tps: 5
      workload:
        module: benchmarks/scenario/simple/medical-consent/createPatientRecord.js
        arguments: {}

    - label: load-level-3
      description: High load - 10 TPS
      txNumber: 300
      rateControl:
        type: fixed-rate
        opts:
          tps: 10
      workload:
        module: benchmarks/scenario/simple/medical-consent/createPatientRecord.js
        arguments: {}

    - label: load-level-4
      description: Stress load - 20 TPS
      txNumber: 400
      rateControl:
        type: fixed-rate
        opts:
          tps: 20
      workload:
        module: benchmarks/scenario/simple/medical-consent/createPatientRecord.js
        arguments: {}
```

**Analysis Guidelines**:

- Monitor success rate at each level
- Look for latency increases > 50% between levels
- Identify the highest TPS with < 1% error rate

### Burst Load Test

**Use Case**: Test system behavior under sudden load spikes

```yaml
test:
  name: burst-load-test
  description: Test system response to traffic bursts
  workers:
    type: local
    number: 5
  rounds:
    - label: baseline-load
      description: Normal operational load
      txNumber: 100
      rateControl:
        type: fixed-rate
        opts:
          tps: 5
      workload:
        module: benchmarks/scenario/simple/medical-consent/createPatientRecord.js
        arguments: {}

    - label: burst-load
      description: Sudden traffic spike
      txNumber: 200
      rateControl:
        type: linear-rate
        opts:
          startingTps: 5
          finishingTps: 50
      workload:
        module: benchmarks/scenario/simple/medical-consent/createPatientRecord.js
        arguments: {}

    - label: recovery-load
      description: Return to normal load
      txNumber: 100
      rateControl:
        type: fixed-rate
        opts:
          tps: 5
      workload:
        module: benchmarks/scenario/simple/medical-consent/createPatientRecord.js
        arguments: {}
```

**Key Metrics to Monitor**:

- Latency spike during burst
- Error rate during peak load
- Recovery time to baseline performance

## Workflow Scenario Examples

### Complete Patient Journey

**Use Case**: Test end-to-end patient-doctor interaction workflow

```yaml
test:
  name: patient-journey-workflow
  description: Complete patient-doctor interaction simulation
  workers:
    type: local
    number: 3
  rounds:
    # Step 1: Doctor registration
    - label: doctor-registration
      description: Register doctor profiles
      txNumber: 10
      rateControl:
        type: fixed-rate
        opts:
          tps: 2
      workload:
        module: benchmarks/scenario/simple/medical-consent/registerDoctorProfile.js
        arguments:
          specializations: ["cardiology", "neurology", "general"]

    # Step 2: Patient record creation
    - label: patient-record-creation
      description: Create initial patient records
      txNumber: 30
      rateControl:
        type: fixed-rate
        opts:
          tps: 3
      workload:
        module: benchmarks/scenario/simple/medical-consent/createPatientRecord.js
        arguments:
          recordTypes: ["consultation", "diagnosis", "treatment"]

    # Step 3: Consent granting
    - label: consent-granting
      description: Grant consent for doctor access
      txNumber: 25
      rateControl:
        type: fixed-rate
        opts:
          tps: 2
      workload:
        module: benchmarks/scenario/simple/medical-consent/grantConsent.js
        arguments:
          useExistingRecords: true
          useExistingDoctors: true

    # Step 4: Medical record creation by doctor
    - label: doctor-record-creation
      description: Doctor creates medical records
      txNumber: 20
      rateControl:
        type: fixed-rate
        opts:
          tps: 2
      workload:
        module: benchmarks/scenario/simple/medical-consent/createMedicalRecord.js
        arguments:
          useExistingPatients: true
          useExistingDoctors: true

    # Step 5: Record access and queries
    - label: record-access
      description: Access and query patient records
      txNumber: 50
      rateControl:
        type: fixed-rate
        opts:
          tps: 5
      workload:
        module: benchmarks/scenario/simple/medical-consent/getRecordById.js
        arguments:
          useExistingRecords: true

    # Step 6: Record updates
    - label: record-updates
      description: Update existing medical records
      txNumber: 15
      rateControl:
        type: fixed-rate
        opts:
          tps: 1
      workload:
        module: benchmarks/scenario/simple/medical-consent/updateRecordDetails.js
        arguments:
          useExistingRecords: true

    # Step 7: Private notes
    - label: private-notes
      description: Add private notes to records
      txNumber: 20
      rateControl:
        type: fixed-rate
        opts:
          tps: 2
      workload:
        module: benchmarks/scenario/simple/medical-consent/addPrivateNoteToRecord.js
        arguments:
          useExistingRecords: true

    # Step 8: Consent revocation
    - label: consent-revocation
      description: Revoke previously granted consent
      txNumber: 10
      rateControl:
        type: fixed-rate
        opts:
          tps: 1
      workload:
        module: benchmarks/scenario/simple/medical-consent/revokeConsent.js
        arguments:
          useExistingConsents: true
```

**Workflow Analysis**:

- Measure end-to-end workflow completion time
- Track data consistency across workflow steps
- Monitor resource utilization throughout the journey

### Concurrent Operations Workflow

**Use Case**: Test system behavior under mixed concurrent operations

```yaml
test:
  name: concurrent-operations
  description: Mixed read/write operations under concurrent load
  workers:
    type: local
    number: 6
  rounds:
    # Setup phase
    - label: data-setup
      description: Create initial data for concurrent testing
      txNumber: 100
      rateControl:
        type: fixed-rate
        opts:
          tps: 10
      workload:
        module: benchmarks/scenario/simple/medical-consent/createPatientRecord.js
        arguments: {}

    # Concurrent phase - multiple rounds running simultaneously
    - label: concurrent-reads
      description: Continuous read operations
      txNumber: 300
      rateControl:
        type: fixed-rate
        opts:
          tps: 15
      workload:
        module: benchmarks/scenario/simple/medical-consent/getRecordById.js
        arguments:
          useExistingRecords: true

    - label: concurrent-writes
      description: Continuous write operations
      txNumber: 100
      rateControl:
        type: fixed-rate
        opts:
          tps: 5
      workload:
        module: benchmarks/scenario/simple/medical-consent/createMedicalRecord.js
        arguments:
          useExistingPatients: true

    - label: concurrent-queries
      description: Complex query operations
      txNumber: 150
      rateControl:
        type: fixed-rate
        opts:
          tps: 8
      workload:
        module: benchmarks/scenario/simple/medical-consent/findAssetsByQuery.js
        arguments:
          queryComplexity: "medium"

    - label: concurrent-updates
      description: Record update operations
      txNumber: 50
      rateControl:
        type: fixed-rate
        opts:
          tps: 3
      workload:
        module: benchmarks/scenario/simple/medical-consent/updateRecordDetails.js
        arguments:
          useExistingRecords: true
```

**Concurrency Analysis**:

- Monitor lock contention and deadlocks
- Measure throughput degradation under concurrent load
- Analyze transaction ordering and consistency

## Advanced Configuration Examples

### Custom Rate Control

**Use Case**: Simulate realistic traffic patterns with variable load

```yaml
test:
  name: realistic-traffic-pattern
  description: Simulate daily traffic patterns in medical system
  workers:
    type: local
    number: 4
  rounds:
    # Morning rush (8-10 AM)
    - label: morning-rush
      description: High activity period - morning consultations
      txNumber: 200
      rateControl:
        type: composite-rate
        opts:
          weights: [30, 40, 30] # 30% low, 40% medium, 30% high
          rateControllers:
            - type: fixed-rate
              opts: { tps: 5 }
            - type: fixed-rate
              opts: { tps: 15 }
            - type: fixed-rate
              opts: { tps: 25 }
      workload:
        module: benchmarks/scenario/simple/medical-consent/createPatientRecord.js
        arguments:
          timeOfDay: "morning"

    # Midday lull (12-2 PM)
    - label: midday-lull
      description: Low activity period - lunch break
      txNumber: 50
      rateControl:
        type: linear-rate
        opts:
          startingTps: 10
          finishingTps: 2
      workload:
        module: benchmarks/scenario/simple/medical-consent/getRecordById.js
        arguments:
          timeOfDay: "midday"

    # Afternoon peak (3-5 PM)
    - label: afternoon-peak
      description: Peak activity period - afternoon appointments
      txNumber: 300
      rateControl:
        type: linear-rate
        opts:
          startingTps: 5
          finishingTps: 30
      workload:
        module: benchmarks/scenario/simple/medical-consent/createMedicalRecord.js
        arguments:
          timeOfDay: "afternoon"

    # Evening wind-down (6-8 PM)
    - label: evening-winddown
      description: Decreasing activity - end of day
      txNumber: 100
      rateControl:
        type: linear-rate
        opts:
          startingTps: 20
          finishingTps: 3
      workload:
        module: benchmarks/scenario/simple/medical-consent/updateRecordDetails.js
        arguments:
          timeOfDay: "evening"
```

### Multi-Organization Testing

**Use Case**: Test cross-organization operations and performance

```yaml
test:
  name: multi-org-operations
  description: Test operations across multiple organizations
  workers:
    type: local
    number: 4
  rounds:
    # Org1 operations
    - label: org1-operations
      description: Operations initiated by Org1 users
      txNumber: 100
      rateControl:
        type: fixed-rate
        opts:
          tps: 8
      workload:
        module: benchmarks/scenario/simple/medical-consent/createPatientRecord.js
        arguments:
          organization: "Org1MSP"
          crossOrgAccess: false

    # Org2 operations
    - label: org2-operations
      description: Operations initiated by Org2 users
      txNumber: 100
      rateControl:
        type: fixed-rate
        opts:
          tps: 8
      workload:
        module: benchmarks/scenario/simple/medical-consent/createPatientRecord.js
        arguments:
          organization: "Org2MSP"
          crossOrgAccess: false

    # Cross-organization consent
    - label: cross-org-consent
      description: Consent operations across organizations
      txNumber: 50
      rateControl:
        type: fixed-rate
        opts:
          tps: 3
      workload:
        module: benchmarks/scenario/simple/medical-consent/grantConsent.js
        arguments:
          crossOrganization: true
          sourceOrg: "Org1MSP"
          targetOrg: "Org2MSP"

    # Cross-organization queries
    - label: cross-org-queries
      description: Query operations across organizations
      txNumber: 80
      rateControl:
        type: fixed-rate
        opts:
          tps: 6
      workload:
        module: benchmarks/scenario/simple/medical-consent/findAssetsByQuery.js
        arguments:
          crossOrganization: true
          includePrivateData: false
```

## Custom Monitoring Examples

### Enhanced Resource Monitoring

**Use Case**: Detailed system resource monitoring during benchmarks

```yaml
monitors:
  resource:
    - module: prometheus
      options:
        url: "http://localhost:9090"
        metrics:
          ignore: [prometheus, pushGateway, cadvisor, grafana, node-exporter]
          include:
            # Memory metrics
            Container Memory Usage (MB): avg(container_memory_usage_bytes{name=~".+"}) by (name) / 1024 / 1024
            Container Memory Limit (MB): avg(container_spec_memory_limit_bytes{name=~".+"}) by (name) / 1024 / 1024
            Memory Utilization (%): avg(container_memory_usage_bytes{name=~".+"} / container_spec_memory_limit_bytes{name=~".+"} * 100) by (name)

            # CPU metrics
            Container CPU Usage (%): avg(rate(container_cpu_usage_seconds_total{name=~".+"}[1m]) * 100) by (name)
            Container CPU Throttling: avg(rate(container_cpu_cfs_throttled_seconds_total{name=~".+"}[1m])) by (name)

            # Network metrics
            Network Receive (MB/s): avg(rate(container_network_receive_bytes_total{name=~".+"}[1m])) by (name) / 1024 / 1024
            Network Transmit (MB/s): avg(rate(container_network_transmit_bytes_total{name=~".+"}[1m])) by (name) / 1024 / 1024
            Network Errors: avg(rate(container_network_receive_errors_total{name=~".+"}[1m]) + rate(container_network_transmit_errors_total{name=~".+"}[1m])) by (name)

            # Disk metrics
            Disk Read (MB/s): avg(rate(container_fs_reads_bytes_total{name=~".+"}[1m])) by (name) / 1024 / 1024
            Disk Write (MB/s): avg(rate(container_fs_writes_bytes_total{name=~".+"}[1m])) by (name) / 1024 / 1024

            # Fabric-specific metrics
            Fabric Blocks Created: rate(fabric_blocks_total[1m])
            Fabric Transaction Rate: rate(fabric_transactions_total[1m])
            Fabric Endorsement Duration: histogram_quantile(0.95, rate(fabric_endorsement_duration_seconds_bucket[5m]))

observer:
  type: prometheus
  interval: 2 # More frequent sampling for detailed analysis
```

### Application-Level Monitoring

**Use Case**: Monitor application-specific metrics and business logic performance

```yaml
monitors:
  resource:
    - module: prometheus
      options:
        url: "http://localhost:9090"
        metrics:
          include:
            # Chaincode-specific metrics
            Patient Records Created: increase(chaincode_patient_records_total[1m])
            Consent Operations: increase(chaincode_consent_operations_total[1m])
            Query Operations: increase(chaincode_query_operations_total[1m])

            # Error tracking
            Chaincode Errors: increase(chaincode_errors_total[1m])
            Authorization Failures: increase(chaincode_auth_failures_total[1m])
            Validation Errors: increase(chaincode_validation_errors_total[1m])

            # Performance metrics
            Average Transaction Size: avg(chaincode_transaction_size_bytes)
            Private Data Operations: increase(chaincode_private_data_ops_total[1m])

            # Business metrics
            Active Consents: chaincode_active_consents_gauge
            Total Patient Records: chaincode_patient_records_gauge
            Doctor Profiles: chaincode_doctor_profiles_gauge

observer:
  type: prometheus
  interval: 5
```

## Configuration Best Practices

### 1. Start Small and Scale Up

```yaml
# Begin with minimal configuration
test:
  name: baseline-test
  workers:
    type: local
    number: 1
  rounds:
    - label: single-function
      txNumber: 10
      rateControl:
        type: fixed-rate
        opts:
          tps: 1
```

### 2. Use Realistic Data Patterns

```yaml
workload:
  module: benchmarks/scenario/simple/medical-consent/createPatientRecord.js
  arguments:
    # Use realistic medical data
    generateRealisticData: true
    includeFileAttachments: true
    varyRecordSizes: true
    useRealMedicalTerminology: true
```

### 3. Monitor Key Metrics

```yaml
monitors:
  resource:
    - module: prometheus
      options:
        metrics:
          include:
            # Focus on key performance indicators
            Transaction Throughput: rate(fabric_transactions_total[1m])
            Average Latency: avg(fabric_transaction_duration_seconds)
            Error Rate: rate(fabric_transaction_errors_total[1m]) / rate(fabric_transactions_total[1m]) * 100
            Resource Utilization: avg(container_memory_usage_bytes) / avg(container_spec_memory_limit_bytes) * 100
```

### 4. Plan for Data Dependencies

```yaml
rounds:
  # Create data first
  - label: setup-data
    description: Create test data for dependent operations
    txNumber: 50
    workload:
      module: benchmarks/scenario/simple/medical-consent/createPatientRecord.js

  # Then test dependent operations
  - label: test-updates
    description: Test operations that depend on existing data
    txNumber: 30
    workload:
      module: benchmarks/scenario/simple/medical-consent/updateRecordDetails.js
      arguments:
        useExistingRecords: true
```

### 5. Include Cleanup Phases

```yaml
rounds:
  # Main test rounds...

  # Cleanup phase
  - label: cleanup
    description: Clean up test data
    txNumber: 1
    rateControl:
      type: fixed-rate
      opts:
        tps: 1
    workload:
      module: benchmarks/scenario/simple/medical-consent/utils/dataCleanup.js
      arguments:
        cleanupLevel: "full"
```

These examples provide a comprehensive foundation for creating custom benchmark configurations tailored to specific testing needs and scenarios.
