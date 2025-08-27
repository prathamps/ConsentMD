/**
 * Enhanced HTML Report Generator for Caliper Blockchain Performance Analysis
 * Provides comprehensive reporting with advanced charts, metrics, and comparative analysis
 */

const fs = require("fs")
const path = require("path")
const { PerformanceAnalyzer } = require("./performanceAnalyzer")

class EnhancedReportGenerator {
	constructor(options = {}) {
		this.options = {
			outputDir: options.outputDir || "./reports",
			templateDir: options.templateDir || "./scripts/reporting/templates",
			includeCharts: options.includeCharts !== false,
			includeComparison: options.includeComparison !== false,
			includeTrends: options.includeTrends !== false,
			...options,
		}

		this.analyzer = new PerformanceAnalyzer()
		this.ensureDirectories()
	}

	ensureDirectories() {
		if (!fs.existsSync(this.options.outputDir)) {
			fs.mkdirSync(this.options.outputDir, { recursive: true })
		}
		if (!fs.existsSync(this.options.templateDir)) {
			fs.mkdirSync(this.options.templateDir, { recursive: true })
		}
	}

	/**
	 * Generate enhanced HTML report from Caliper results
	 * @param {Object} results - Caliper benchmark results
	 * @param {Object} options - Report generation options
	 * @returns {string} Path to generated report
	 */
	async generateReport(results, options = {}) {
		const reportData = await this.processResults(results)
		const reportHtml = await this.buildHtmlReport(reportData, options)

		const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
		const reportPath = path.join(
			this.options.outputDir,
			`performance-report-${timestamp}.html`
		)

		fs.writeFileSync(reportPath, reportHtml)

		// Also create a latest report link
		const latestPath = path.join(this.options.outputDir, "latest-report.html")
		fs.writeFileSync(latestPath, reportHtml)

		console.log(`Enhanced report generated: ${reportPath}`)
		return reportPath
	}

	/**
	 * Process raw Caliper results into structured report data
	 */
	async processResults(results) {
		const processedData = {
			metadata: this.extractMetadata(results),
			summary: this.generateSummary(results),
			rounds: this.processRounds(results),
			charts: this.generateChartData(results),
			analysis: await this.analyzer.analyzeResults(results),
			timestamp: new Date().toISOString(),
		}

		return processedData
	}

	extractMetadata(results) {
		return {
			dlt: results.dlt || "fabric",
			name: results.name || "ConsentMD Performance Test",
			description:
				results.description || "Comprehensive blockchain performance analysis",
			version: results.version || "1.0.0",
			rounds: results.rounds ? results.rounds.length : 0,
			totalTransactions: this.calculateTotalTransactions(results),
			testDuration: this.calculateTestDuration(results),
		}
	}

	generateSummary(results) {
		const summary = {
			totalTPS: 0,
			avgLatency: 0,
			successRate: 0,
			totalErrors: 0,
			peakTPS: 0,
			minLatency: Infinity,
			maxLatency: 0,
		}

		if (!results.rounds) return summary

		let totalTransactions = 0
		let totalDuration = 0
		let totalSuccessful = 0
		let totalFailed = 0
		let latencySum = 0
		let latencyCount = 0

		results.rounds.forEach((round) => {
			if (round.performance) {
				const perf = round.performance
				totalTransactions += perf.throughput?.total || 0
				totalDuration += perf.throughput?.duration || 0
				totalSuccessful += perf.throughput?.successful || 0
				totalFailed += perf.throughput?.failed || 0

				if (perf.latency) {
					latencySum += perf.latency.avg || 0
					latencyCount++
					summary.minLatency = Math.min(
						summary.minLatency,
						perf.latency.min || 0
					)
					summary.maxLatency = Math.max(
						summary.maxLatency,
						perf.latency.max || 0
					)
				}

				const roundTPS = perf.throughput?.tps || 0
				summary.peakTPS = Math.max(summary.peakTPS, roundTPS)
			}
		})

		summary.totalTPS = totalDuration > 0 ? totalTransactions / totalDuration : 0
		summary.avgLatency = latencyCount > 0 ? latencySum / latencyCount : 0
		summary.successRate =
			totalTransactions > 0 ? (totalSuccessful / totalTransactions) * 100 : 0
		summary.totalErrors = totalFailed

		return summary
	}

	processRounds(results) {
		if (!results.rounds) return []

		return results.rounds.map((round, index) => ({
			id: index + 1,
			label: round.label || `Round ${index + 1}`,
			description: round.description || "",
			performance: this.processRoundPerformance(round.performance),
			resource: round.resource || {},
			errors: this.categorizeErrors(round.errors || []),
		}))
	}

	processRoundPerformance(performance) {
		if (!performance) return {}

		return {
			throughput: {
				total: performance.throughput?.total || 0,
				successful: performance.throughput?.successful || 0,
				failed: performance.throughput?.failed || 0,
				tps: performance.throughput?.tps || 0,
				duration: performance.throughput?.duration || 0,
			},
			latency: {
				min: performance.latency?.min || 0,
				max: performance.latency?.max || 0,
				avg: performance.latency?.avg || 0,
				percentiles: {
					50: performance.latency?.percentile?.["50"] || 0,
					75: performance.latency?.percentile?.["75"] || 0,
					90: performance.latency?.percentile?.["90"] || 0,
					95: performance.latency?.percentile?.["95"] || 0,
					99: performance.latency?.percentile?.["99"] || 0,
				},
			},
		}
	}

	categorizeErrors(errors) {
		const categories = {
			network: [],
			chaincode: [],
			timeout: [],
			authorization: [],
			other: [],
		}

		errors.forEach((error) => {
			const errorMsg = error.message || error.toString()
			if (errorMsg.includes("timeout") || errorMsg.includes("TIMEOUT")) {
				categories.timeout.push(error)
			} else if (
				errorMsg.includes("network") ||
				errorMsg.includes("connection")
			) {
				categories.network.push(error)
			} else if (
				errorMsg.includes("chaincode") ||
				errorMsg.includes("endorsement")
			) {
				categories.chaincode.push(error)
			} else if (
				errorMsg.includes("authorization") ||
				errorMsg.includes("access")
			) {
				categories.authorization.push(error)
			} else {
				categories.other.push(error)
			}
		})

		return categories
	}

	generateChartData(results) {
		const charts = {}

		// TPS over time chart
		charts.tpsOverTime = this.generateTpsChart(results)

		// Latency distribution chart
		charts.latencyDistribution = this.generateLatencyChart(results)

		// Success rate chart
		charts.successRate = this.generateSuccessRateChart(results)

		// Resource utilization chart
		charts.resourceUtilization = this.generateResourceChart(results)

		return charts
	}

	generateTpsChart(results) {
		if (!results.rounds) return null

		const labels = results.rounds.map(
			(round, index) => round.label || `Round ${index + 1}`
		)
		const tpsData = results.rounds.map(
			(round) => round.performance?.throughput?.tps || 0
		)

		return {
			type: "line",
			title: "Transactions Per Second (TPS) Over Time",
			labels: labels,
			datasets: [
				{
					label: "TPS",
					data: tpsData,
					borderColor: "rgb(75, 192, 192)",
					backgroundColor: "rgba(75, 192, 192, 0.2)",
					tension: 0.1,
				},
			],
			legend: true,
		}
	}

	generateLatencyChart(results) {
		if (!results.rounds) return null

		const labels = results.rounds.map(
			(round, index) => round.label || `Round ${index + 1}`
		)
		const avgLatency = results.rounds.map(
			(round) => round.performance?.latency?.avg || 0
		)
		const p95Latency = results.rounds.map(
			(round) => round.performance?.latency?.percentile?.["95"] || 0
		)
		const p99Latency = results.rounds.map(
			(round) => round.performance?.latency?.percentile?.["99"] || 0
		)

		return {
			type: "bar",
			title: "Latency Distribution",
			labels: labels,
			datasets: [
				{
					label: "Average Latency (ms)",
					data: avgLatency,
					backgroundColor: "rgba(54, 162, 235, 0.5)",
					borderColor: "rgba(54, 162, 235, 1)",
					borderWidth: 1,
				},
				{
					label: "95th Percentile (ms)",
					data: p95Latency,
					backgroundColor: "rgba(255, 206, 86, 0.5)",
					borderColor: "rgba(255, 206, 86, 1)",
					borderWidth: 1,
				},
				{
					label: "99th Percentile (ms)",
					data: p99Latency,
					backgroundColor: "rgba(255, 99, 132, 0.5)",
					borderColor: "rgba(255, 99, 132, 1)",
					borderWidth: 1,
				},
			],
			legend: true,
		}
	}

	generateSuccessRateChart(results) {
		if (!results.rounds) return null

		const labels = results.rounds.map(
			(round, index) => round.label || `Round ${index + 1}`
		)
		const successRates = results.rounds.map((round) => {
			const perf = round.performance?.throughput
			if (!perf || !perf.total) return 0
			return (perf.successful / perf.total) * 100
		})

		return {
			type: "doughnut",
			title: "Success Rate Distribution",
			labels: labels,
			datasets: [
				{
					data: successRates,
					backgroundColor: [
						"rgba(75, 192, 192, 0.8)",
						"rgba(54, 162, 235, 0.8)",
						"rgba(255, 206, 86, 0.8)",
						"rgba(255, 99, 132, 0.8)",
						"rgba(153, 102, 255, 0.8)",
					],
				},
			],
			legend: true,
		}
	}

	generateResourceChart(results) {
		// Placeholder for resource utilization chart
		// This would require additional resource monitoring data
		return null
	}

	calculateTotalTransactions(results) {
		if (!results.rounds) return 0
		return results.rounds.reduce((total, round) => {
			return total + (round.performance?.throughput?.total || 0)
		}, 0)
	}

	calculateTestDuration(results) {
		if (!results.rounds) return 0
		return results.rounds.reduce((total, round) => {
			return total + (round.performance?.throughput?.duration || 0)
		}, 0)
	}

	async buildHtmlReport(reportData, options = {}) {
		const template = await this.loadTemplate("enhanced-report.html")

		// Replace template variables
		let html = template
			.replace(/{{TITLE}}/g, reportData.metadata.name)
			.replace(
				/{{TIMESTAMP}}/g,
				new Date(reportData.timestamp).toLocaleString()
			)
			.replace(/{{METADATA}}/g, JSON.stringify(reportData.metadata, null, 2))
			.replace(/{{SUMMARY}}/g, this.generateSummaryHtml(reportData.summary))
			.replace(/{{ROUNDS}}/g, this.generateRoundsHtml(reportData.rounds))
			.replace(/{{CHARTS}}/g, this.generateChartsHtml(reportData.charts))
			.replace(/{{ANALYSIS}}/g, this.generateAnalysisHtml(reportData.analysis))

		return html
	}

	async loadTemplate(templateName) {
		const templatePath = path.join(this.options.templateDir, templateName)

		if (fs.existsSync(templatePath)) {
			return fs.readFileSync(templatePath, "utf8")
		}

		// Return default template if file doesn't exist
		return this.getDefaultTemplate()
	}

	generateSummaryHtml(summary) {
		return `
            <div class="summary-grid">
                <div class="metric-card">
                    <h3>Total TPS</h3>
                    <div class="metric-value">${summary.totalTPS.toFixed(
											2
										)}</div>
                </div>
                <div class="metric-card">
                    <h3>Average Latency</h3>
                    <div class="metric-value">${summary.avgLatency.toFixed(
											2
										)} ms</div>
                </div>
                <div class="metric-card">
                    <h3>Success Rate</h3>
                    <div class="metric-value">${summary.successRate.toFixed(
											1
										)}%</div>
                </div>
                <div class="metric-card">
                    <h3>Peak TPS</h3>
                    <div class="metric-value">${summary.peakTPS.toFixed(
											2
										)}</div>
                </div>
                <div class="metric-card">
                    <h3>Total Errors</h3>
                    <div class="metric-value">${summary.totalErrors}</div>
                </div>
                <div class="metric-card">
                    <h3>Latency Range</h3>
                    <div class="metric-value">${summary.minLatency.toFixed(
											2
										)} - ${summary.maxLatency.toFixed(2)} ms</div>
                </div>
            </div>
        `
	}

	generateRoundsHtml(rounds) {
		return rounds
			.map(
				(round) => `
            <div class="round-section">
                <h3>${round.label}</h3>
                <p>${round.description}</p>
                <div class="performance-table">
                    <table>
                        <tr>
                            <th>Metric</th>
                            <th>Value</th>
                        </tr>
                        <tr>
                            <td>Total Transactions</td>
                            <td>${round.performance.throughput.total}</td>
                        </tr>
                        <tr>
                            <td>Successful</td>
                            <td>${round.performance.throughput.successful}</td>
                        </tr>
                        <tr>
                            <td>Failed</td>
                            <td>${round.performance.throughput.failed}</td>
                        </tr>
                        <tr>
                            <td>TPS</td>
                            <td>${round.performance.throughput.tps.toFixed(
															2
														)}</td>
                        </tr>
                        <tr>
                            <td>Average Latency</td>
                            <td>${round.performance.latency.avg.toFixed(
															2
														)} ms</td>
                        </tr>
                        <tr>
                            <td>95th Percentile</td>
                            <td>${round.performance.latency.percentiles[
															"95"
														].toFixed(2)} ms</td>
                        </tr>
                    </table>
                </div>
            </div>
        `
			)
			.join("")
	}

	generateChartsHtml(charts) {
		let chartsHtml = ""

		Object.entries(charts).forEach(([key, chart]) => {
			if (chart) {
				chartsHtml += `
                    <div class="chart-container">
                        <canvas id="chart-${key}"></canvas>
                    </div>
                    <script>
                        plotChart('chart-${key}', '${JSON.stringify(
					chart
				).replace(/'/g, "\\'")}');
                    </script>
                `
			}
		})

		return chartsHtml
	}

	generateAnalysisHtml(analysis) {
		if (!analysis) return "<p>No analysis data available</p>"

		return `
            <div class="analysis-section">
                <h3>Performance Analysis</h3>
                ${
									analysis.bottlenecks
										? `
                    <div class="bottlenecks">
                        <h4>Identified Bottlenecks</h4>
                        <ul>
                            ${analysis.bottlenecks
															.map((b) => `<li>${b}</li>`)
															.join("")}
                        </ul>
                    </div>
                `
										: ""
								}
                
                ${
									analysis.recommendations
										? `
                    <div class="recommendations">
                        <h4>Recommendations</h4>
                        <ul>
                            ${analysis.recommendations
															.map((r) => `<li>${r}</li>`)
															.join("")}
                        </ul>
                    </div>
                `
										: ""
								}
                
                ${
									analysis.trends
										? `
                    <div class="trends">
                        <h4>Performance Trends</h4>
                        <p>${analysis.trends}</p>
                    </div>
                `
										: ""
								}
            </div>
        `
	}

	getDefaultTemplate() {
		return `
<!DOCTYPE html>
<html>
<head>
    <title>{{TITLE}}</title>
    <meta charset="UTF-8">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.9.1/chart.min.js"></script>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px; margin-bottom: 30px; }
        .header h1 { margin: 0; font-size: 2.5em; }
        .header p { margin: 10px 0 0 0; opacity: 0.9; }
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .metric-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; }
        .metric-card h3 { margin: 0 0 10px 0; color: #666; font-size: 0.9em; text-transform: uppercase; }
        .metric-value { font-size: 2em; font-weight: bold; color: #333; }
        .round-section { background: white; margin-bottom: 20px; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .performance-table table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        .performance-table th, .performance-table td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        .performance-table th { background-color: #f8f9fa; font-weight: 600; }
        .chart-container { background: white; padding: 20px; margin-bottom: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .analysis-section { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .bottlenecks, .recommendations, .trends { margin-bottom: 20px; }
        .bottlenecks h4, .recommendations h4, .trends h4 { color: #667eea; margin-bottom: 10px; }
        ul { padding-left: 20px; }
        li { margin-bottom: 5px; }
    </style>
    <script>
        function plotChart(divId, chartData) {
            const chartDetails = JSON.parse(chartData.replace(/&quot;/g, '"'));
            new Chart(document.getElementById(divId), {
                type: chartDetails.type,
                data: {
                    labels: chartDetails.labels,
                    datasets: chartDetails.datasets,
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: { display: chartDetails.legend },
                        title: { display: true, text: chartDetails.title }
                    }
                }
            });
        }
    </script>
</head>
<body>
    <div class="header">
        <h1>{{TITLE}}</h1>
        <p>Generated on {{TIMESTAMP}}</p>
    </div>
    
    <div class="content">
        <h2>Performance Summary</h2>
        {{SUMMARY}}
        
        <h2>Test Rounds</h2>
        {{ROUNDS}}
        
        <h2>Performance Charts</h2>
        {{CHARTS}}
        
        <h2>Analysis & Recommendations</h2>
        {{ANALYSIS}}
    </div>
</body>
</html>
        `
	}
}

module.exports = { EnhancedReportGenerator }
