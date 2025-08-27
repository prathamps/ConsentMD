/**
 * Statistical Analysis Utilities for Performance Data
 * Provides advanced statistical functions for performance metrics analysis
 */

class StatisticalAnalyzer {
	constructor() {
		this.confidenceLevel = 0.95
	}

	/**
	 * Calculate comprehensive statistics for a dataset
	 * @param {Array} data - Array of numeric values
	 * @returns {Object} Statistical summary
	 */
	calculateStatistics(data) {
		if (!Array.isArray(data) || data.length === 0) {
			return this.getEmptyStats()
		}

		const validData = data.filter(
			(val) => typeof val === "number" && !isNaN(val)
		)
		if (validData.length === 0) {
			return this.getEmptyStats()
		}

		const sorted = [...validData].sort((a, b) => a - b)
		const n = validData.length

		return {
			count: n,
			sum: this.sum(validData),
			mean: this.mean(validData),
			median: this.median(sorted),
			mode: this.mode(validData),
			min: Math.min(...validData),
			max: Math.max(...validData),
			range: Math.max(...validData) - Math.min(...validData),
			variance: this.variance(validData),
			standardDeviation: this.standardDeviation(validData),
			coefficientOfVariation: this.coefficientOfVariation(validData),
			skewness: this.skewness(validData),
			kurtosis: this.kurtosis(validData),
			percentiles: this.calculatePercentiles(sorted),
			quartiles: this.calculateQuartiles(sorted),
			outliers: this.detectOutliers(validData),
			confidenceInterval: this.confidenceInterval(validData),
		}
	}

	getEmptyStats() {
		return {
			count: 0,
			sum: 0,
			mean: 0,
			median: 0,
			mode: [],
			min: 0,
			max: 0,
			range: 0,
			variance: 0,
			standardDeviation: 0,
			coefficientOfVariation: 0,
			skewness: 0,
			kurtosis: 0,
			percentiles: {},
			quartiles: {},
			outliers: [],
			confidenceInterval: { lower: 0, upper: 0 },
		}
	}

	// Basic statistical functions
	sum(data) {
		return data.reduce((acc, val) => acc + val, 0)
	}

	mean(data) {
		return data.length > 0 ? this.sum(data) / data.length : 0
	}

	median(sortedData) {
		const n = sortedData.length
		if (n === 0) return 0
		return n % 2 === 0
			? (sortedData[n / 2 - 1] + sortedData[n / 2]) / 2
			: sortedData[Math.floor(n / 2)]
	}

	mode(data) {
		const frequency = {}
		data.forEach((val) => (frequency[val] = (frequency[val] || 0) + 1))

		const maxFreq = Math.max(...Object.values(frequency))
		return Object.keys(frequency)
			.filter((key) => frequency[key] === maxFreq)
			.map(Number)
	}

	variance(data) {
		if (data.length <= 1) return 0
		const avg = this.mean(data)
		const squaredDiffs = data.map((val) => Math.pow(val - avg, 2))
		return this.sum(squaredDiffs) / (data.length - 1)
	}

	standardDeviation(data) {
		return Math.sqrt(this.variance(data))
	}

	coefficientOfVariation(data) {
		const avg = this.mean(data)
		return avg !== 0 ? this.standardDeviation(data) / avg : 0
	}
}
    skewness(data) {
        if (data.length < 3) return 0;
        
        const avg = this.mean(data);
        const stdDev = this.standardDeviation(data);
        
        if (stdDev === 0) return 0;
        
        const n = data.length;
        const skew = data.reduce((acc, val) => {
            return acc + Math.pow((val - avg) / stdDev, 3);
        }, 0);
        
        return (n / ((n - 1) * (n - 2))) * skew;
    }

    kurtosis(data) {
        if (data.length < 4) return 0;
        
        const avg = this.mean(data);
        const stdDev = this.standardDeviation(data);
        
        if (stdDev === 0) return 0;
        
        const n = data.length;
        const kurt = data.reduce((acc, val) => {
            return acc + Math.pow((val - avg) / stdDev, 4);
        }, 0);
        
        return ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * kurt - 
               (3 * Math.pow(n - 1, 2)) / ((n - 2) * (n - 3));
    }

    calculatePercentiles(sortedData) {
        if (sortedData.length === 0) return {};
        
        const percentiles = {};
        const percentileValues = [1, 5, 10, 25, 50, 75, 90, 95, 99];
        
        percentileValues.forEach(p => {
            percentiles[p] = this.percentile(sortedData, p);
        });
        
        return percentiles;
    }

    percentile(sortedData, p) {
        if (sortedData.length === 0) return 0;
        
        const index = (p / 100) * (sortedData.length - 1);
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        
        if (lower === upper) {
            return sortedData[lower];
        }
        
        const weight = index - lower;
        return sortedData[lower] * (1 - weight) + sortedData[upper] * weight;
    }

    calculateQuartiles(sortedData) {
        return {
            q1: this.percentile(sortedData, 25),
            q2: this.percentile(sortedData, 50), // median
            q3: this.percentile(sortedData, 75),
            iqr: this.percentile(sortedData, 75) - this.percentile(sortedData, 25)
        };
    }

    detectOutliers(data) {
        if (data.length < 4) return [];
        
        const sorted = [...data].sort((a, b) => a - b);
        const quartiles = this.calculateQuartiles(sorted);
        const iqr = quartiles.iqr;
        
        const lowerBound = quartiles.q1 - 1.5 * iqr;
        const upperBound = quartiles.q3 + 1.5 * iqr;
        
        return data.filter(val => val < lowerBound || val > upperBound);
    }

    confidenceInterval(data, confidenceLevel = this.confidenceLevel) {
        if (data.length < 2) return { lower: 0, upper: 0 };
        
        const avg = this.mean(data);
        const stdErr = this.standardDeviation(data) / Math.sqrt(data.length);
        
        // Using t-distribution for small samples
        const tValue = this.getTValue(data.length - 1, confidenceLevel);
        const margin = tValue * stdErr;
        
        return {
            lower: avg - margin,
            upper: avg + margin,
            margin: margin
        };
    }

    getTValue(degreesOfFreedom, confidenceLevel) {
        // Simplified t-table lookup for common confidence levels
        const tTable = {
            0.90: { 1: 6.314, 2: 2.920, 3: 2.353, 4: 2.132, 5: 2.015, 10: 1.812, 20: 1.725, 30: 1.697, 60: 1.671, 120: 1.658, Infinity: 1.645 },
            0.95: { 1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 10: 2.228, 20: 2.086, 30: 2.042, 60: 2.000, 120: 1.980, Infinity: 1.960 },
            0.99: { 1: 63.657, 2: 9.925, 3: 5.841, 4: 4.604, 5: 4.032, 10: 3.169, 20: 2.845, 30: 2.750, 60: 2.660, 120: 2.617, Infinity: 2.576 }
        };
        
        const table = tTable[confidenceLevel] || tTable[0.95];
        
        if (degreesOfFreedom <= 5) return table[degreesOfFreedom];
        if (degreesOfFreedom <= 10) return table[10];
        if (degreesOfFreedom <= 20) return table[20];
        if (degreesOfFreedom <= 30) return table[30];
        if (degreesOfFreedom <= 60) return table[60];
        if (degreesOfFreedom <= 120) return table[120];
        return table[Infinity];
    }

    /**
     * Perform correlation analysis between two datasets
     */
    correlation(dataX, dataY) {
        if (dataX.length !== dataY.length || dataX.length < 2) {
            return { coefficient: 0, strength: 'none', significance: 'not significant' };
        }
        
        const n = dataX.length;
        const meanX = this.mean(dataX);
        const meanY = this.mean(dataY);
        
        let numerator = 0;
        let sumXSquared = 0;
        let sumYSquared = 0;
        
        for (let i = 0; i < n; i++) {
            const deltaX = dataX[i] - meanX;
            const deltaY = dataY[i] - meanY;
            
            numerator += deltaX * deltaY;
            sumXSquared += deltaX * deltaX;
            sumYSquared += deltaY * deltaY;
        }
        
        const denominator = Math.sqrt(sumXSquared * sumYSquared);
        const coefficient = denominator === 0 ? 0 : numerator / denominator;
        
        return {
            coefficient: coefficient,
            strength: this.interpretCorrelationStrength(Math.abs(coefficient)),
            significance: this.assessCorrelationSignificance(coefficient, n)
        };
    }

    interpretCorrelationStrength(absCoeff) {
        if (absCoeff >= 0.9) return 'very strong';
        if (absCoeff >= 0.7) return 'strong';
        if (absCoeff >= 0.5) return 'moderate';
        if (absCoeff >= 0.3) return 'weak';
        return 'very weak';
    }

    assessCorrelationSignificance(coefficient, n) {
        if (n < 3) return 'not significant';
        
        const tStat = coefficient * Math.sqrt((n - 2) / (1 - coefficient * coefficient));
        const criticalValue = this.getTValue(n - 2, 0.95);
        
        return Math.abs(tStat) > criticalValue ? 'significant' : 'not significant';
    }

    /**
     * Perform trend analysis using linear regression
     */
    linearRegression(dataX, dataY) {
        if (dataX.length !== dataY.length || dataX.length < 2) {
            return { slope: 0, intercept: 0, rSquared: 0, trend: 'none' };
        }
        
        const n = dataX.length;
        const sumX = this.sum(dataX);
        const sumY = this.sum(dataY);
        const sumXY = dataX.reduce((acc, x, i) => acc + x * dataY[i], 0);
        const sumXSquared = dataX.reduce((acc, x) => acc + x * x, 0);
        
        const slope = (n * sumXY - sumX * sumY) / (n * sumXSquared - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;
        
        // Calculate R-squared
        const meanY = this.mean(dataY);
        const totalSumSquares = dataY.reduce((acc, y) => acc + Math.pow(y - meanY, 2), 0);
        const residualSumSquares = dataY.reduce((acc, y, i) => {
            const predicted = slope * dataX[i] + intercept;
            return acc + Math.pow(y - predicted, 2);
        }, 0);
        
        const rSquared = totalSumSquares === 0 ? 0 : 1 - (residualSumSquares / totalSumSquares);
        
        return {
            slope: slope,
            intercept: intercept,
            rSquared: rSquared,
            trend: this.interpretTrend(slope, rSquared)
        };
    }

    interpretTrend(slope, rSquared) {
        if (rSquared < 0.1) return 'no clear trend';
        if (Math.abs(slope) < 0.01) return 'stable';
        return slope > 0 ? 'increasing' : 'decreasing';
    }
}

module.exports = { StatisticalAnalyzer };