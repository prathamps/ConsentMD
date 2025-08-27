# Enhanced Blockchain Performance Reporting

This module provides comprehensive reporting and analytics capabilities for blockchain performance testing using Hyperledger Caliper. It generates enhanced HTML reports with advanced charts, performance analysis, comparative analysis between test runs, and trend analysis.

## Features

### 🚀 Enhanced Report Generation

- **Rich HTML Reports**: Interactive charts and visualizations using Chart.js
- **Comprehensive Metrics**: TPS, latency, success rates, error analysis
- **Professional Styling**: Modern, responsive design with gradient headers
- **Export Capabilities**: JSON data export for further analysis

### 📊 Performance Analysis

- **Bottleneck Identification**: Automatic detection of performance issues
- **Statistical Analysis**: Mean, median, standard deviation, variance calculations
- **Threshold Validation**: Configurable warning and critical thresholds
- **Error Categorization**: Network, chaincode, timeout, and authorization errors

### 📈 Comparative Analysis

- **Multi-Test Comparison**: Compare performance across multiple test runs
- **Trend Analysis**: Identify performance trends over time
- **Regression Detection**: Automatic detection of performance regressions
- **Historical Data Management**: Persistent storage of performance history

### 🎯 Recommendations Engine

- **Automated Recommendations**: Performance improvement suggestions
- **Best Practice Guidance**: Configuration and optimization tips
- **Scalability Insights**: Resource utilization and scaling recommendations

## Installation

```bash
# Install dependencies
npm install

# Make the CLI script executable (Linux/Mac)
chmod +x reporting/generateReport.js
```

## Usage

### Command Line Interface

```bash
# Generate report from specific results file
node reporting/generateReport.js -i results.json

# Generate report with comparison of last 3 historical results
node reporting/generateReport.js -i results.json -c -l 3

# Generate report without charts
node reporting/generateReport.js -i results.json --no-charts

# Compare historical results only
node reporting/generateReport.js -c

# Show help
node reporting/generateReport.js --help
```

### Programmatic Usage

```javascript
const { BlockchainPerformanceReporting } = require("./reporting")

// Initialize reporting with custom options
const reporting = new BlockchainPerformanceReporting({
	outputDir: "./custom-reports",
	thresholds: {
		tpsWarning: 15,
		tpsCritical: 8,
		latencyWarning: 800,
		latencyCritical: 3000,
	},
})

// Generate enhanced report
const reportPath = await reporting.generateReport(caliperResults)

// Get performance summary
const summary = reporting.getPerformanceSummary(caliperResults)

// Validate against thresholds
const validation = reporting.validatePerformance(caliperResults)

// Compare multiple test runs
const comparison = await reporting.compareTestRuns([
	results1,
	results2,
	results3,
])
```

### Individual Components

```javascript
const {
	EnhancedReportGenerator,
	PerformanceAnalyzer,
	ComparativeAnalyzer,
} = require("./reporting")

// Use individual components
const reportGenerator = new EnhancedReportGenerator()
const analyzer = new PerformanceAnalyzer()
const comparator = new ComparativeAnalyzer()

// Generate report
const reportPath = await reportGenerator.generateReport(results)

// Analyze performance
const analysis = await analyzer.analyzeResults(results)

// Compare test runs
const comparison = await comparator.compareTestRuns(testResults)
```

## Configuration Options

### Reporting Options

```javascript
{
    outputDir: './reports',                    // Output directory for reports
    templateDir: './templates',               // Custom template directory
    includeCharts: true,                      // Enable/disable charts
    includeComparison: true,                  // Enable/disable comparison
    includeTrends: true                       // Enable/disable trend analysis
}
```

### Performance Thresholds

```javascript
{
    thresholds: {
        tpsWarning: 10,                       // TPS warning threshold
        tpsCritical: 5,                       // TPS critical threshold
        latencyWarning: 1000,                 // Latency warning (ms)
        latencyCritical: 5000,                // Latency critical (ms)
        successRateWarning: 95,               // Success rate warning (%)
        successRateCritical: 90               // Success rate critical (%)
    }
}
```

### Historical Data Options

```javascript
{
    historicalDataPath: './reports/historical', // Historical data storage
    maxComparisons: 10,                         // Max comparisons to store
    historicalLimit: 5                          // Default historical limit
}
```

## Report Structure

### Enhanced HTML Report Includes:

1. **Executive Summary**: Key performance metrics at a glance
2. **Performance Charts**: Interactive visualizations of TPS, latency, success rates
3. **Round-by-Round Analysis**: Detailed breakdown of each test round
4. **Error Analysis**: Categorized error reporting and analysis
5. **Performance Analysis**: Bottlenecks, recommendations, and insights
6. **Historical Trends**: Performance trends over time (if historical data available)

### Comparative Analysis Includes:

1. **Multi-Test Summary**: Performance comparison across test runs
2. **Trend Analysis**: Performance trends and regression detection
3. **Best Configuration Identification**: Highlighting top-performing configurations
4. **Improvement Recommendations**: Specific suggestions based on comparison

## File Structure

```
scripts/
├── reporting/
│   ├── index.js                    # Main module exports
│   ├── reportGenerator.js          # Enhanced HTML report generation
│   ├── performanceAnalyzer.js      # Performance analysis and recommendations
│   ├── comparativeAnalyzer.js      # Comparative analysis between test runs
│   ├── generateReport.js           # CLI interface
│   ├── templates/                  # Custom report templates (optional)
│   └── README.md                   # This file
├── package.json                    # Dependencies and scripts
└── reports/                        # Generated reports (created automatically)
    ├── historical/                 # Historical performance data
    ├── comparisons/                # Comparative analysis results
    └── *.html                      # Generated HTML reports
```

## Output Examples

### Performance Summary

```javascript
{
    totalRounds: 3,
    validRounds: 3,
    totalTransactions: 1500,
    avgTps: 25.67,
    avgLatency: 234.5,
    successRate: 98.2,
    totalErrors: 27
}
```

### Performance Validation

```javascript
{
    passed: true,
    warnings: [
        "TPS below warning threshold: 8.5 < 10"
    ],
    errors: [],
    summary: { /* performance summary */ }
}
```

### Analysis Results

```javascript
{
    bottlenecks: [
        "High latency variance in Round 2: 99th percentile (1250ms) is 5.2x average",
        "TPS performance concern in Round 3: 7.8 TPS (below 10)"
    ],
    recommendations: [
        "Consider increasing worker count or optimizing chaincode logic",
        "Review network configuration and ensure adequate peer resources"
    ],
    trends: "TPS showing positive trend: 12.5% improvement per test",
    statistics: { /* detailed statistics */ }
}
```

## Integration with CI/CD

The reporting module can be integrated into CI/CD pipelines for automated performance testing:

```bash
#!/bin/bash
# Run Caliper benchmark
npx caliper launch manager --caliper-workspace ./ --caliper-networkconfig networks/fabric/medical-consent-network.yaml --caliper-benchconfig benchmarks/scenario/simple/medical-consent/config.yaml

# Generate enhanced report
node scripts/reporting/generateReport.js -i report.html -c

# Check performance thresholds (exit with error if critical thresholds exceeded)
node -e "
const { validatePerformance } = require('./scripts/reporting');
const results = require('./results.json');
const validation = validatePerformance(results);
if (!validation.passed) {
    console.error('Performance validation failed:', validation.errors);
    process.exit(1);
}
console.log('Performance validation passed');
"
```

## Troubleshooting

### Common Issues

1. **No historical data for comparison**

   - Run multiple tests to build historical data
   - Check that `historicalDataPath` directory is writable

2. **Charts not displaying**

   - Ensure Chart.js CDN is accessible
   - Check browser console for JavaScript errors

3. **Memory issues with large datasets**

   - Reduce `historicalLimit` for comparisons
   - Consider data sampling for very large test results

4. **Permission errors**
   - Ensure output directories are writable
   - Check file permissions on existing reports

### Debug Mode

Enable debug logging by setting environment variable:

```bash
DEBUG=reporting:* node reporting/generateReport.js -i results.json
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

MIT License - see LICENSE file for details.
