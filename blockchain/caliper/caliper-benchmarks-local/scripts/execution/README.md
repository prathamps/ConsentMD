# Blockchain Performance Benchmark Execution Scripts

This directory contains automated execution scripts for running blockchain performance benchmarks using Hyperledger Caliper.

## Overview

The execution scripts provide a comprehensive automation layer for running performance benchmarks with parameter validation, environment checking, logging, and error handling.

## Files

### Core Scripts

- **`runBenchmark.js`** - Main Node.js execution script with full automation capabilities
- **`validateEnvironment.js`** - Comprehensive environment validation script
- **`run-benchmark.bat`** - Windows batch script wrapper
- **`Run-Benchmark.ps1`** - PowerShell script with advanced Windows integration

### Configuration

- **`package.json`** - Node.js dependencies and script definitions
- **`README.md`** - This documentation file

## Prerequisites

- Node.js 14 or higher
- npm (Node Package Manager)
- Hyperledger Caliper CLI (`@hyperledger/caliper-cli`)
- js-yaml package for YAML configuration parsing

## Installation

1. Navigate to the execution scripts directory:

   ```bash
   cd scripts/execution
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Validate your environment:
   ```bash
   npm run validate
   ```

## Usage

### Node.js Script (Cross-platform)

#### Basic Commands

```bash
# List available configurations
node runBenchmark.js list

# Run a single benchmark
node runBenchmark.js run light

# Run a benchmark suite
node runBenchmark.js suite load-testing

# Show help
node runBenchmark.js help
```

#### Advanced Usage

```bash
# Run with custom parameters
node runBenchmark.js run heavy --workers 5 --tps 50 --report-name "heavy-load-test"

# Run suite with error handling
node runBenchmark.js suite full-suite --stop-on-error

# Run with custom report name
node runBenchmark.js run stress --report-name "stress-test-$(date +%Y%m%d)"
```

### Windows Batch Script

```cmd
REM Basic usage
run-benchmark.bat list
run-benchmark.bat run light
run-benchmark.bat suite load-testing

REM With parameters
run-benchmark.bat run heavy --workers 5 --tps 50
```

### PowerShell Script

```powershell
# Basic usage
.\Run-Benchmark.ps1 -Command list
.\Run-Benchmark.ps1 -Command run -Config light
.\Run-Benchmark.ps1 -Command suite -Config load-testing

# Advanced usage with parameters
.\Run-Benchmark.ps1 -Command run -Config heavy -Workers 5 -TPS 50 -ReportName "custom-test"
.\Run-Benchmark.ps1 -Command suite -Config full-suite -StopOnError -Verbose
```

## Available Configurations

### Individual Benchmarks

- **`light`** - Light load testing (1-2 workers, 1-5 TPS)
- **`medium`** - Medium load testing (3-5 workers, 10-25 TPS)
- **`heavy`** - Heavy load testing (5-10 workers, 50-100 TPS)
- **`stress`** - Stress testing (progressive load increase)
- **`basic`** - Basic configuration for simple testing

### Workflow Scenarios

- **`patient-journey`** - Complete patient workflow simulation
- **`doctor-workflow`** - Doctor-centric operations workflow
- **`mixed-operations`** - Mixed read/write operations

### Benchmark Suites

- **`load-testing`** - Light, Medium, Heavy load tests
- **`workflow-testing`** - All workflow scenarios
- **`stress-testing`** - Stress test configuration
- **`full-suite`** - All benchmark configurations

## Parameters

### Common Parameters

- **`--workers <number>`** - Number of concurrent workers (1-20)
- **`--tps <number>`** - Target transactions per second (1-1000)
- **`--report-name <name>`** - Custom name for the benchmark report
- **`--stop-on-error`** - Stop suite execution on first error

### PowerShell Specific

- **`-Verbose`** - Enable verbose logging and detailed error information

## Environment Validation

Before running benchmarks, validate your environment:

```bash
# Run comprehensive validation
node validateEnvironment.js

# Or use npm script
npm run validate
```

The validation script checks:

- Node.js and npm installation
- Caliper CLI availability
- Project structure integrity
- Network configuration validity
- Connection profiles
- Benchmark configurations
- Workload modules
- Required dependencies
- Output directories

## Output and Logging

### Log Files

- Execution logs are written to `../../logs/benchmark-YYYY-MM-DD.log`
- Logs include timestamps, levels, and detailed execution information

### Reports

- HTML reports are generated in `../../reports/`
- Report names include configuration and timestamp by default
- Custom report names can be specified with `--report-name`

### Console Output

- Real-time progress information
- Color-coded status messages (PowerShell)
- Error and warning notifications
- Execution summaries

## Error Handling

### Validation Errors

- Environment validation failures prevent execution
- Missing dependencies are clearly identified
- Configuration errors are reported with specific details

### Execution Errors

- Network connectivity issues are logged and reported
- Benchmark failures include detailed error information
- Suite execution can continue or stop on errors (configurable)

### Recovery

- Automatic retry logic for transient failures
- Graceful degradation on partial failures
- System recovery time measurement after stress tests

## Integration

### CI/CD Integration

The scripts are designed for integration with continuous integration systems:

```bash
# Example CI/CD usage
node validateEnvironment.js && node runBenchmark.js suite load-testing --stop-on-error
```

### Automated Scheduling

Scripts can be scheduled using system schedulers:

```bash
# Example cron job (Linux/macOS)
0 2 * * * cd /path/to/project && node scripts/execution/runBenchmark.js suite full-suite

# Example Windows Task Scheduler
schtasks /create /tn "Blockchain Benchmark" /tr "powershell.exe -File C:\path\to\Run-Benchmark.ps1 -Command suite -Config load-testing" /sc daily /st 02:00
```

## Troubleshooting

### Common Issues

1. **Node.js not found**

   - Ensure Node.js 14+ is installed and in PATH
   - Verify with `node --version`

2. **Caliper CLI not available**

   - Install with `npm install -g @hyperledger/caliper-cli`
   - Or use npx: `npx caliper --version`

3. **Configuration file not found**

   - Verify benchmark configurations exist in the correct directory
   - Check file names match expected patterns

4. **Network connectivity issues**

   - Validate network configuration with `node validateEnvironment.js`
   - Check blockchain network is running and accessible

5. **Permission errors (Windows)**
   - Run PowerShell as Administrator if needed
   - Check execution policy: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`

### Debug Mode

Enable verbose logging for troubleshooting:

```bash
# Node.js (set environment variable)
DEBUG=* node runBenchmark.js run light

# PowerShell
.\Run-Benchmark.ps1 -Command run -Config light -Verbose
```

## Best Practices

1. **Always validate environment before running benchmarks**
2. **Use appropriate load levels for your infrastructure**
3. **Monitor system resources during execution**
4. **Review reports after each benchmark run**
5. **Keep logs for historical analysis**
6. **Use custom report names for organized results**
7. **Test individual configurations before running full suites**

## Support

For issues or questions:

1. Check the troubleshooting section above
2. Review execution logs in the `logs/` directory
3. Validate environment with `validateEnvironment.js`
4. Consult the main project documentation
