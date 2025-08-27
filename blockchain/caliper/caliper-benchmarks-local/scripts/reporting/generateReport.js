#!/usr/bin/env node

/**
 * Main script for generating enhanced performance reports
 * Usage: node generateReport.js [options]
 */

const fs = require("fs")
const path = require("path")
const { EnhancedReportGenerator } = require("./reportGenerator")
const { ComparativeAnalyzer } = require("./comparativeAnalyzer")

class ReportingCLI {
	constructor() {
		this.options = this.parseArguments()
		this.reportGenerator = new EnhancedReportGenerator({
			outputDir: this.options.outputDir,
			includeCharts: this.options.includeCharts,
			includeComparison: this.options.includeComparison,
			includeTrends: this.options.includeTrends,
		})
		this.comparativeAnalyzer = new ComparativeAnalyzer({
			reportsDir: this.options.outputDir,
		})
	}

	parseArguments() {
		const args = process.argv.slice(2)
		const options = {
			inputFile: null,
			outputDir: "./reports",
			includeCharts: true,
			includeComparison: true,
			includeTrends: true,
			compareHistorical: false,
			historicalLimit: 5,
			help: false,
		}

		for (let i = 0; i < args.length; i++) {
			const arg = args[i]
			switch (arg) {
				case "-i":
				case "--input":
					options.inputFile = args[++i]
					break
				case "-o":
				case "--output":
					options.outputDir = args[++i]
					break
				case "--no-charts":
					options.includeCharts = false
					break
				case "--no-comparison":
					options.includeComparison = false
					break
				case "--no-trends":
					options.includeTrends = false
					break
				case "-c":
				case "--compare":
					options.compareHistorical = true
					break
				case "-l":
				case "--limit":
					options.historicalLimit = parseInt(args[++i]) || 5
					break
				case "-h":
				case "--help":
					options.help = true
					break
				default:
					if (!options.inputFile && !arg.startsWith("-")) {
						options.inputFile = arg
					}
					break
			}
		}

		return options
	}

	showHelp() {
		console.log(`
Enhanced Blockchain Performance Report Generator

Usage: node generateReport.js [options] [input-file]

Options:
  -i, --input <file>     Input Caliper results file (JSON format)
  -o, --output <dir>     Output directory for reports (default: ./reports)
  -c, --compare          Generate comparative analysis of historical results
  -l, --limit <num>      Number of historical results to compare (default: 5)
  --no-charts            Disable chart generation
  --no-comparison        Disable comparative analysis
  --no-trends            Disable trend analysis
  -h, --help             Show this help message

Examples:
  # Generate report from specific results file
  node generateReport.js -i results.json

  # Generate report with comparison of last 3 historical results
  node generateReport.js -i results.json -c -l 3

  # Generate report without charts
  node generateReport.js -i results.json --no-charts

  # Compare historical results only
  node generateReport.js -c
        `)
	}

	async run() {
		try {
			if (this.options.help) {
				this.showHelp()
				return
			}

			console.log("🚀 Starting enhanced report generation...")

			if (this.options.compareHistorical && !this.options.inputFile) {
				// Compare historical results only
				await this.generateHistoricalComparison()
			} else if (this.options.inputFile) {
				// Generate report from specific file
				await this.generateSingleReport()

				if (this.options.compareHistorical) {
					await this.generateHistoricalComparison()
				}
			} else {
				// Try to find the latest Caliper report
				await this.generateFromLatestReport()
			}

			console.log("✅ Report generation completed successfully!")
		} catch (error) {
			console.error("❌ Error generating report:", error.message)
			process.exit(1)
		}
	}

	async generateSingleReport() {
		console.log(`📊 Generating report from: ${this.options.inputFile}`)

		if (!fs.existsSync(this.options.inputFile)) {
			throw new Error(`Input file not found: ${this.options.inputFile}`)
		}

		const results = this.loadResults(this.options.inputFile)
		const reportPath = await this.reportGenerator.generateReport(results, {
			title: `Performance Report - ${path.basename(
				this.options.inputFile,
				".json"
			)}`,
		})

		console.log(`📈 Enhanced report generated: ${reportPath}`)
		return reportPath
	}

	async generateHistoricalComparison() {
		console.log(
			`📊 Generating historical comparison (last ${this.options.historicalLimit} results)...`
		)

		try {
			const comparison =
				await this.comparativeAnalyzer.compareHistoricalResults(
					this.options.historicalLimit
				)
			const comparisonPath = await this.saveComparisonReport(comparison)

			console.log(`📈 Comparative analysis generated: ${comparisonPath}`)
			return comparisonPath
		} catch (error) {
			console.warn(
				`⚠️  Could not generate historical comparison: ${error.message}`
			)
		}
	}

	async generateFromLatestReport() {
		console.log("🔍 Looking for latest Caliper report...")

		// Look for report.html or results.json in current directory
		const possibleFiles = [
			"./report.html",
			"./results.json",
			"./caliper-results.json",
		]

		let latestFile = null
		let latestTime = 0

		for (const file of possibleFiles) {
			if (fs.existsSync(file)) {
				const stats = fs.statSync(file)
				if (stats.mtime.getTime() > latestTime) {
					latestTime = stats.mtime.getTime()
					latestFile = file
				}
			}
		}

		if (!latestFile) {
			throw new Error(
				"No Caliper results found. Please specify input file with -i option."
			)
		}

		console.log(`📄 Found latest report: ${latestFile}`)

		if (latestFile.endsWith(".html")) {
			// Try to extract data from HTML report
			const results = this.extractFromHtmlReport(latestFile)
			const reportPath = await this.reportGenerator.generateReport(results)
			console.log(`📈 Enhanced report generated: ${reportPath}`)
		} else {
			// JSON file
			this.options.inputFile = latestFile
			await this.generateSingleReport()
		}
	}

	loadResults(filePath) {
		try {
			const content = fs.readFileSync(filePath, "utf8")

			if (filePath.endsWith(".json")) {
				return JSON.parse(content)
			} else if (filePath.endsWith(".html")) {
				return this.extractFromHtmlReport(filePath)
			} else {
				// Try to parse as JSON
				return JSON.parse(content)
			}
		} catch (error) {
			throw new Error(
				`Could not load results from ${filePath}: ${error.message}`
			)
		}
	}

	extractFromHtmlReport(htmlPath) {
		// This is a simplified extraction - in a real implementation,
		// you might want to use a proper HTML parser
		const content = fs.readFileSync(htmlPath, "utf8")

		// Look for embedded JSON data in the HTML
		const jsonMatch = content.match(/var\s+benchmarkData\s*=\s*({.*?});/s)
		if (jsonMatch) {
			try {
				return JSON.parse(jsonMatch[1])
			} catch (error) {
				console.warn("Could not extract JSON from HTML report")
			}
		}

		// Fallback: create minimal structure
		return {
			name: "Extracted from HTML Report",
			timestamp: new Date().toISOString(),
			rounds: [],
			dlt: "fabric",
		}
	}

	async saveComparisonReport(comparison) {
		const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
		const reportPath = path.join(
			this.options.outputDir,
			`comparison-report-${timestamp}.html`
		)

		const html = this.generateComparisonHtml(comparison)
		fs.writeFileSync(reportPath, html)

		// Also save JSON data
		const jsonPath = path.join(
			this.options.outputDir,
			`comparison-data-${timestamp}.json`
		)
		fs.writeFileSync(jsonPath, JSON.stringify(comparison, null, 2))

		return reportPath
	}

	generateComparisonHtml(comparison) {
		return `
<!DOCTYPE html>
<html>
<head>
    <title>Performance Comparison Report</title>
    <meta charset="UTF-8">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.9.1/chart.min.js"></script>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px; margin-bottom: 30px; }
        .header h1 { margin: 0; font-size: 2.5em; }
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .metric-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .metric-card h3 { margin: 0 0 15px 0; color: #666; }
        .metric-value { font-size: 1.5em; font-weight: bold; color: #333; margin-bottom: 5px; }
        .metric-change { font-size: 0.9em; }
        .positive { color: #28a745; }
        .negative { color: #dc3545; }
        .neutral { color: #6c757d; }
        .chart-container { background: white; padding: 20px; margin-bottom: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .recommendations { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .recommendations ul { padding-left: 20px; }
        .recommendations li { margin-bottom: 10px; }
        .trends { background: white; padding: 20px; margin-bottom: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    </style>
</head>
<body>
    <div class="header">
        <h1>Performance Comparison Report</h1>
        <p>Generated on ${new Date(comparison.timestamp).toLocaleString()}</p>
        <p>Comparing ${comparison.metadata.testCount} test runs</p>
    </div>
    
    <div class="summary-grid">
        <div class="metric-card">
            <h3>TPS Performance</h3>
            <div class="metric-value">${comparison.summary.tps.best.toFixed(
							2
						)} TPS</div>
            <div class="metric-change ${
							comparison.summary.tps.improvement >= 0 ? "positive" : "negative"
						}">
                ${
									comparison.summary.tps.improvement >= 0 ? "+" : ""
								}${comparison.summary.tps.improvement.toFixed(1)}% change
            </div>
        </div>
        
        <div class="metric-card">
            <h3>Latency Performance</h3>
            <div class="metric-value">${comparison.summary.latency.best.toFixed(
							2
						)} ms</div>
            <div class="metric-change ${
							comparison.summary.latency.improvement >= 0
								? "positive"
								: "negative"
						}">
                ${
									comparison.summary.latency.improvement >= 0 ? "+" : ""
								}${comparison.summary.latency.improvement.toFixed(1)}% change
            </div>
        </div>
        
        <div class="metric-card">
            <h3>Success Rate</h3>
            <div class="metric-value">${comparison.summary.successRate.best.toFixed(
							1
						)}%</div>
            <div class="metric-change ${
							comparison.summary.successRate.improvement >= 0
								? "positive"
								: "negative"
						}">
                ${
									comparison.summary.successRate.improvement >= 0 ? "+" : ""
								}${comparison.summary.successRate.improvement.toFixed(
			1
		)}% change
            </div>
        </div>
        
        <div class="metric-card">
            <h3>Total Errors</h3>
            <div class="metric-value">${comparison.summary.errors.total}</div>
            <div class="metric-change neutral">
                Best: ${comparison.summary.errors.best}, Worst: ${
			comparison.summary.errors.worst
		}
            </div>
        </div>
    </div>
    
    <div class="trends">
        <h2>Performance Trends</h2>
        <ul>
            <li><strong>TPS:</strong> ${comparison.trends.tps.description}</li>
            <li><strong>Latency:</strong> ${
							comparison.trends.latency.description
						}</li>
            <li><strong>Success Rate:</strong> ${
							comparison.trends.successRate.description
						}</li>
            <li><strong>Errors:</strong> ${
							comparison.trends.errors.description
						}</li>
        </ul>
    </div>
    
    ${this.generateComparisonCharts(comparison.charts)}
    
    <div class="recommendations">
        <h2>Recommendations</h2>
        <ul>
            ${comparison.recommendations
							.map((rec) => `<li>${rec}</li>`)
							.join("")}
        </ul>
    </div>
</body>
</html>
        `
	}

	generateComparisonCharts(charts) {
		let chartsHtml = ""

		Object.entries(charts).forEach(([key, chart]) => {
			if (chart) {
				chartsHtml += `
                    <div class="chart-container">
                        <canvas id="chart-${key}"></canvas>
                    </div>
                    <script>
                        new Chart(document.getElementById('chart-${key}'), {
                            type: '${chart.type}',
                            data: {
                                labels: ${JSON.stringify(chart.labels)},
                                datasets: ${JSON.stringify(chart.datasets)}
                            },
                            options: {
                                responsive: true,
                                plugins: {
                                    legend: { display: ${chart.legend} },
                                    title: { display: true, text: '${
																			chart.title
																		}' }
                                }
                            }
                        });
                    </script>
                `
			}
		})

		return chartsHtml
	}
}

// Run the CLI if this script is executed directly
if (require.main === module) {
	const cli = new ReportingCLI()
	cli.run().catch((error) => {
		console.error("Fatal error:", error)
		process.exit(1)
	})
}

module.exports = { ReportingCLI }
