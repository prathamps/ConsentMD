# CI/CD Integration Guide

This guide provides comprehensive instructions for integrating blockchain performance benchmarks into various CI/CD systems.

## Overview

The CI/CD integration scripts provide automated performance testing with:

- **Threshold validation** - Automatic pass/fail based on performance criteria
- **Failure detection** - Intelligent error handling and retry logic
- **Report publishing** - Automated report generation and distribution
- **Notifications** - Integration with Slack, email, and webhook systems
- **Regression detection** - Performance trend analysis and alerts

## Quick Start

### Basic CI Execution

```bash
# Install dependencies
cd scripts/execution
npm install

# Run light CI benchmark suite
npm run ci:light

# Run full CI benchmark suite with custom config
node ci-benchmark.js ci-full --config ci-config.json --fail-fast
```

### Docker-based Execution

```bash
# Run benchmarks in Docker container
./docker-ci.sh --suite ci-light --verbose

# Run with custom configuration
./docker-ci.sh --suite ci-full --config custom-config.json --fail-fast
```

## Configuration

### Performance Thresholds

Configure performance thresholds in `ci-thresholds.json`:

```json
{
	"global": {
		"maxLatencyMs": 5000,
		"minTPS": 1,
		"maxErrorRate": 0.05,
		"minSuccessRate": 0.95
	},
	"byFunction": {
		"createPatientRecord": {
			"maxLatencyMs": 3000,
			"minTPS": 5,
			"maxErrorRate": 0.02
		}
	},
	"byLoadType": {
		"light": {
			"maxLatencyMs": 2000,
			"minTPS": 5,
			"maxErrorRate": 0.01
		}
	}
}
```

### CI Configuration

Configure CI behavior in `ci-config.json`:

```json
{
	"thresholds": {
		/* threshold configuration */
	},
	"notifications": {
		"enabled": true,
		"type": "webhook",
		"config": {
			"url": "https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK"
		}
	},
	"publishing": {
		"enabled": true,
		"type": "file",
		"config": {
			"path": "./ci-reports"
		}
	},
	"failFast": true,
	"maxRetries": 2,
	"retryDelay": 30000
}
```

## CI/CD Platform Integration

### GitHub Actions

1. **Copy the workflow file:**

   ```bash
   cp scripts/execution/github-actions-workflow.yml .github/workflows/benchmark.yml
   ```

2. **Configure secrets in GitHub:**

   - `SLACK_WEBHOOK_URL` - For Slack notifications
   - Any other environment-specific secrets

3. **Customize the workflow:**
   - Modify trigger conditions
   - Adjust benchmark suites for different events
   - Configure artifact retention

### Jenkins

1. **Create a new Pipeline job**

2. **Use the provided Jenkinsfile:**

   ```bash
   cp scripts/execution/Jenkinsfile /path/to/jenkins/job/
   ```

3. **Configure Jenkins environment:**

   - Install Node.js plugin
   - Configure Docker if using containerized execution
   - Set up Slack/email notifications

4. **Set environment variables:**
   - `SLACK_WEBHOOK` - For notifications
   - `NODE_VERSION` - Node.js version to use

### GitLab CI

Create `.gitlab-ci.yml` in your project root:

```yaml
stages:
  - validate
  - benchmark
  - report

variables:
  NODE_VERSION: "18"

validate_environment:
  stage: validate
  image: node:${NODE_VERSION}
  script:
    - cd ConsentMD/blockchain/caliper/caliper-benchmarks-local/scripts/execution
    - npm install
    - node validateEnvironment.js

light_benchmarks:
  stage: benchmark
  image: node:${NODE_VERSION}
  script:
    - cd ConsentMD/blockchain/caliper/caliper-benchmarks-local/scripts/execution
    - npm install
    - npm run ci:light
  artifacts:
    paths:
      - ConsentMD/blockchain/caliper/caliper-benchmarks-local/reports/
      - ConsentMD/blockchain/caliper/caliper-benchmarks-local/logs/
    expire_in: 30 days
```

### Azure DevOps

Create `azure-pipelines.yml`:

```yaml
trigger:
  branches:
    include:
      - main
      - develop
  paths:
    include:
      - ConsentMD/blockchain/**

pool:
  vmImage: "ubuntu-latest"

variables:
  nodeVersion: "18"

stages:
  - stage: Validate
    jobs:
      - job: ValidateEnvironment
        steps:
          - task: NodeTool@0
            inputs:
              versionSpec: $(nodeVersion)
          - script: |
              cd ConsentMD/blockchain/caliper/caliper-benchmarks-local/scripts/execution
              npm install
              node validateEnvironment.js
            displayName: "Validate Environment"

  - stage: Benchmark
    jobs:
      - job: LightBenchmarks
        steps:
          - task: NodeTool@0
            inputs:
              versionSpec: $(nodeVersion)
          - script: |
              cd ConsentMD/blockchain/caliper/caliper-benchmarks-local/scripts/execution
              npm install
              npm run ci:light
            displayName: "Run Light Benchmarks"
          - task: PublishBuildArtifacts@1
            inputs:
              pathToPublish: "ConsentMD/blockchain/caliper/caliper-benchmarks-local/reports"
              artifactName: "benchmark-reports"
```

## Docker Integration

### Building CI Image

```bash
# Build the CI Docker image
docker build -f scripts/execution/Dockerfile.ci -t blockchain-benchmark-ci .

# Run benchmarks in container
docker run --rm \
  -v $(pwd)/reports:/app/reports \
  -v $(pwd)/logs:/app/logs \
  blockchain-benchmark-ci \
  node scripts/execution/ci-benchmark.js ci-light
```

### Docker Compose

Create `docker-compose.ci.yml`:

```yaml
version: "3.8"

services:
  benchmark-ci:
    build:
      context: .
      dockerfile: ConsentMD/blockchain/caliper/caliper-benchmarks-local/scripts/execution/Dockerfile.ci
    volumes:
      - ./reports:/app/reports
      - ./logs:/app/logs
    environment:
      - SLACK_WEBHOOK_URL=${SLACK_WEBHOOK_URL}
      - CI_ENVIRONMENT=docker-compose
    command: node scripts/execution/ci-benchmark.js ci-light --config ci-config.json
```

## Notification Integration

### Slack Integration

1. **Create a Slack webhook:**

   - Go to your Slack workspace settings
   - Create a new webhook URL
   - Configure the channel for notifications

2. **Configure in CI:**
   ```json
   {
   	"notifications": {
   		"enabled": true,
   		"type": "webhook",
   		"config": {
   			"url": "https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK",
   			"onSuccess": true,
   			"onFailure": true,
   			"includeMetrics": true
   		}
   	}
   }
   ```

### Email Notifications

Configure email notifications (implementation required):

```json
{
	"notifications": {
		"enabled": true,
		"type": "email",
		"config": {
			"smtp": {
				"host": "smtp.example.com",
				"port": 587,
				"secure": false,
				"auth": {
					"user": "your-email@example.com",
					"pass": "your-password"
				}
			},
			"recipients": ["team@example.com"],
			"onSuccess": false,
			"onFailure": true
		}
	}
}
```

## Report Publishing

### File-based Publishing

```json
{
	"publishing": {
		"enabled": true,
		"type": "file",
		"config": {
			"path": "./ci-reports",
			"includeReports": true,
			"includeSummary": true,
			"retention": {
				"enabled": true,
				"maxAge": "30d",
				"maxCount": 100
			}
		}
	}
}
```

### HTTP Publishing

```json
{
	"publishing": {
		"enabled": true,
		"type": "http",
		"config": {
			"endpoint": "https://api.example.com/benchmark-results",
			"method": "POST",
			"headers": {
				"Authorization": "Bearer YOUR_TOKEN",
				"Content-Type": "application/json"
			}
		}
	}
}
```

### S3 Publishing

```json
{
	"publishing": {
		"enabled": true,
		"type": "s3",
		"config": {
			"bucket": "benchmark-results",
			"region": "us-east-1",
			"prefix": "blockchain-benchmarks/",
			"credentials": {
				"accessKeyId": "YOUR_ACCESS_KEY",
				"secretAccessKey": "YOUR_SECRET_KEY"
			}
		}
	}
}
```

## Performance Monitoring

### Threshold Configuration

Define performance thresholds at multiple levels:

1. **Global thresholds** - Apply to all benchmarks
2. **Function-specific thresholds** - Apply to specific chaincode functions
3. **Load-type thresholds** - Apply to specific load profiles
4. **Workflow thresholds** - Apply to workflow scenarios

### Regression Detection

Enable regression detection to catch performance degradation:

```json
{
	"regression": {
		"enabled": true,
		"maxDegradation": 0.2,
		"baselineSource": "previous-run",
		"alertThreshold": 0.15
	}
}
```

### Alerting

Configure different alert levels:

```json
{
	"alerts": {
		"criticalThresholds": {
			"maxLatencyMs": 10000,
			"minTPS": 0.5,
			"maxErrorRate": 0.2
		},
		"warningThresholds": {
			"maxLatencyMs": 7000,
			"minTPS": 1,
			"maxErrorRate": 0.1
		}
	}
}
```

## Best Practices

### CI/CD Pipeline Design

1. **Staged execution:**

   - Run light benchmarks on every commit
   - Run medium benchmarks on merge to main
   - Run full benchmarks on scheduled basis

2. **Fail-fast strategy:**

   - Enable fail-fast for critical pipelines
   - Use retry logic for transient failures
   - Implement circuit breakers for persistent issues

3. **Resource management:**
   - Use appropriate timeouts
   - Clean up resources after execution
   - Monitor resource usage

### Performance Testing Strategy

1. **Baseline establishment:**

   - Establish performance baselines
   - Update baselines with significant changes
   - Track performance trends over time

2. **Threshold management:**

   - Set realistic thresholds based on requirements
   - Adjust thresholds based on infrastructure changes
   - Review thresholds regularly

3. **Test environment:**
   - Use consistent test environments
   - Isolate performance tests from other workloads
   - Monitor infrastructure during tests

### Monitoring and Alerting

1. **Proactive monitoring:**

   - Set up performance dashboards
   - Monitor trends and patterns
   - Alert on threshold violations

2. **Incident response:**
   - Define escalation procedures
   - Implement automated rollback triggers
   - Maintain runbooks for common issues

## Troubleshooting

### Common Issues

1. **Environment validation failures:**

   ```bash
   # Check Node.js version
   node --version

   # Verify Caliper installation
   npx caliper --version

   # Validate project structure
   node validateEnvironment.js
   ```

2. **Benchmark execution failures:**

   ```bash
   # Check logs for detailed errors
   tail -f logs/ci-benchmark-*.log

   # Validate configuration
   node -e "console.log(JSON.parse(require('fs').readFileSync('ci-config.json')))"

   # Test individual components
   node runBenchmark.js run light --workers 1
   ```

3. **Threshold violations:**
   - Review performance trends
   - Check infrastructure changes
   - Validate threshold configuration
   - Analyze specific function performance

### Debug Mode

Enable debug mode for detailed troubleshooting:

```bash
# Enable debug logging
DEBUG=* node ci-benchmark.js ci-light

# Verbose Docker execution
./docker-ci.sh --suite ci-light --verbose

# Check environment validation details
node validateEnvironment.js --verbose
```

## Support and Maintenance

### Regular Maintenance

1. **Update dependencies:**

   ```bash
   npm update
   npm audit fix
   ```

2. **Review and update thresholds:**

   - Analyze performance trends
   - Adjust thresholds based on infrastructure changes
   - Update baseline measurements

3. **Monitor CI/CD pipeline health:**
   - Check execution success rates
   - Monitor execution times
   - Review notification effectiveness

### Getting Help

1. **Check logs:** Review execution logs for detailed error information
2. **Validate environment:** Run environment validation to check setup
3. **Test components:** Test individual components in isolation
4. **Review documentation:** Check this guide and script documentation
5. **Contact support:** Reach out to the development team for assistance

## Examples

### Complete CI Pipeline Example

```bash
#!/bin/bash
# Complete CI pipeline example

set -e

echo "Starting blockchain performance CI pipeline..."

# 1. Validate environment
cd scripts/execution
npm install
node validateEnvironment.js

# 2. Run appropriate benchmark suite based on trigger
if [[ "$CI_EVENT" == "push" ]]; then
    SUITE="ci-light"
elif [[ "$CI_EVENT" == "merge" ]]; then
    SUITE="ci-medium"
elif [[ "$CI_EVENT" == "schedule" ]]; then
    SUITE="ci-full"
else
    SUITE="ci-light"
fi

echo "Running benchmark suite: $SUITE"

# 3. Execute benchmarks with retry logic
node ci-benchmark.js "$SUITE" \
    --config ci-config.json \
    --thresholds ci-thresholds.json \
    --fail-fast \
    --max-retries 2

echo "CI pipeline completed successfully"
```

This comprehensive CI/CD integration provides automated, reliable performance testing for your blockchain application with intelligent failure detection, threshold validation, and comprehensive reporting.
