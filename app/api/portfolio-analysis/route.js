import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import yahooFinance from 'yahoo-finance2';
import { GET as dcfValuationGET } from '../dcf-valuation/route.js';

export async function POST(request) {
  try {
    const { holdings, method = 'exit-multiple', correlationOnly = false } = await request.json();

    if (!holdings || !Array.isArray(holdings) || holdings.length < 2) {
      return NextResponse.json(
        { error: 'At least 2 holdings are required for correlation analysis' },
        { status: 400 }
      );
    }

    const tickers = holdings.map(h => h.ticker);
    const weights = holdings.map(h => h.weight / 100); // Convert percentages to decimals

    console.log(`Analyzing portfolio with ${tickers.length} holdings:`, tickers);

    // Fetch historical data for all tickers
    const historicalData = await fetchHistoricalData(tickers);

    // Debug: Check data for each ticker
    console.log('Historical data fetched for tickers:', Object.keys(historicalData));
    Object.keys(historicalData).forEach(ticker => {
      const data = historicalData[ticker];
      const dates = Object.keys(data);
      console.log(`${ticker}: ${dates.length} data points, first date: ${dates[0]}, last date: ${dates[dates.length - 1]}`);
    });

    if (!historicalData || Object.keys(historicalData).length === 0) {
      return NextResponse.json(
        { error: 'Failed to fetch historical data for the provided tickers' },
        { status: 500 }
      );
    }

    // Calculate returns
    const returns = calculateReturns(historicalData);

    // Calculate correlation matrix
    const correlationData = calculateCorrelationMatrix(returns);

    // Get the date range used for fetching data
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(endDate.getFullYear() - 5); // 5 years of data

    // Calculate portfolio beta with fallback
    let betaData;
    try {
      console.log('Attempting primary beta calculation...');
      betaData = await calculatePortfolioBeta(returns, weights, startDate, endDate);
      console.log('Primary beta calculation succeeded:', betaData);
    } catch (error) {
      console.error('Primary beta calculation failed, using fallback:', error.message);
      console.error('Error details:', error.stack);
      betaData = await calculatePortfolioBetaAlternative(returns, weights, startDate, endDate);
      console.log('Fallback beta calculation result:', betaData);
    }

    // If only correlation/beta is requested, return early with minimal payload
    if (correlationOnly) {
      const analysisResult = {
        correlationOnly: true,
        correlationMatrix: correlationData.correlationMatrix,
        averageCorrelations: correlationData.averageCorrelations,
        topCorrelatedPairs: correlationData.topCorrelatedPairs,
        portfolioBeta: betaData.portfolioBeta,
        stockBetas: betaData.stockBetas,
        topBetaContributors: betaData.topBetaContributors,
        bottomBetaContributors: betaData.bottomBetaContributors,
        dataPeriod: {
          startDate: returns.index[0],
          endDate: returns.index[returns.index.length - 1],
          totalDays: returns.index.length
        }
      };

      console.log('Correlation-only analysis complete.');
      return NextResponse.json(analysisResult);
    }

    // Calculate portfolio statistics (only for full analysis)
    const portfolioStats = calculatePortfolioStatistics(returns, weights);

    // Get valuation-based expected returns for more accurate forward-looking analysis
    const valuationExpectedReturns = await getValuationExpectedReturns(holdings, method);

    // Calculate portfolio CAGR from individual holdings
    // Weighted average of individual CAGR values (assuming we have them from valuation)
    let portfolioCagr = 0;

    // Calculate years to 2029 from today
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1; // 0-indexed, so add 1
    const yearsTo2029 = 2029 - currentYear + (12 - currentMonth) / 12;

    Object.entries(valuationExpectedReturns.individualReturns).forEach(([ticker, data]) => {
      const holding = holdings.find(h => h.ticker === ticker);
      const weight = holding ? holding.weight / 100 : 0;

      // Calculate CAGR from upside: CAGR = (1 + upside/100)^(1/yearsTo2029) - 1
      const upside = data.upside || 0;
      const cagr = upside > 0 ? (Math.pow(1 + upside / 100, 1 / yearsTo2029) - 1) : 0;
      portfolioCagr += weight * cagr;
    });

    // Calculate forward-looking Sharpe ratio using CAGR and historical volatility
    const riskFreeRate = 0.045; // 4.5% annually
    const excessReturn = portfolioCagr - riskFreeRate;
    const forwardSharpeRatio = portfolioStats.portfolioVolatility === 0 ? 0 : excessReturn / portfolioStats.portfolioVolatility;

    const analysisResult = {
      correlationMatrix: correlationData.correlationMatrix,
      averageCorrelations: correlationData.averageCorrelations,
      topCorrelatedPairs: correlationData.topCorrelatedPairs,
      portfolioBeta: betaData.portfolioBeta,
      stockBetas: betaData.stockBetas,
      topBetaContributors: betaData.topBetaContributors,
      bottomBetaContributors: betaData.bottomBetaContributors,
      portfolioStats: {
        ...portfolioStats,
        historicalReturn: portfolioStats.portfolioReturn, // Keep historical for reference
        portfolioReturn: portfolioCagr, // Use CAGR as annualized return
        portfolioSharpeRatio: forwardSharpeRatio // Use CAGR-based Sharpe with historical vol
      },
      valuationExpectedReturns: valuationExpectedReturns,
      valuationMethod: method,
      dataPeriod: {
        startDate: returns.index[0],
        endDate: returns.index[returns.index.length - 1],
        totalDays: returns.index.length
      }
    };

    console.log(`Portfolio analysis complete. Beta: ${betaData.portfolioBeta.toFixed(4)}`);

    return NextResponse.json(analysisResult);

  } catch (error) {
    console.error('Portfolio analysis error:', error);
    return NextResponse.json(
      { error: 'Failed to analyze portfolio: ' + error.message },
      { status: 500 }
    );
  }
}

async function fetchHistoricalData(tickers) {
  try {
    console.log(`Fetching historical data for ${tickers.length} tickers using Python...`);
    return await fetchPortfolioPricesDirect(tickers);
  } catch (error) {
    console.error('Error fetching historical data:', error);
    return {};
  }
}

async function fetchPortfolioPricesDirect(tickers) {
  const isVercel = !!process.env.VERCEL_URL || process.env.VERCEL === '1';

  // On Vercel: use HTTP to Python serverless function
  if (isVercel) {
    try {
      const baseUrl = `https://${process.env.VERCEL_URL}`;
      const response = await fetch(`${baseUrl}/api/portfolio-prices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers })
      });

      if (response.ok) {
        return await response.json();
      }
      throw new Error(`API returned ${response.status}`);
    } catch (e) {
      console.error('Vercel API fetch failed:', e);
      return {};
    }
  }

  // Locally: spawn Python script
  return new Promise((resolve, reject) => {
    const scriptPath = `${process.cwd()}/scripts/fetch_portfolio_prices.py`;
    let cmd = 'python3';
    // If inside venv locally
    if (require('fs').existsSync(`${process.cwd()}/venv/bin/python3`)) {
      cmd = `${process.cwd()}/venv/bin/python3`;
    }

    console.log(`Spawning: ${cmd} ${scriptPath} ${tickers.join(' ')}`);

    const python = spawn(cmd, [scriptPath, ...tickers]);

    let dataString = '';
    let errorString = '';

    python.stdout.on('data', (data) => {
      dataString += data.toString();
    });

    python.stderr.on('data', (data) => {
      errorString += data.toString();
    });

    python.on('close', (code) => {
      if (code !== 0) {
        console.error(`Python script exited with code ${code}: ${errorString}`);
        resolve({});
        return;
      }

      try {
        const result = JSON.parse(dataString);
        // Transform array format to object format
        const formatted = {};
        Object.keys(result).forEach(ticker => {
          const prices = {};
          result[ticker].forEach(p => {
            prices[p.date] = p.close;
          });
          formatted[ticker] = prices;
        });

        console.log(`Successfully fetched prices for ${Object.keys(formatted).length} tickers`);
        resolve(formatted);
      } catch (e) {
        console.error('Failed to parse Python output:', e);
        resolve({});
      }
    });

    python.on('error', (err) => {
      console.error('Failed to start python script:', err);
      resolve({});
    });
  });
}

function calculateReturns(historicalData) {
  const allDates = new Set();

  // Collect all unique dates
  Object.values(historicalData).forEach(data => {
    Object.keys(data).forEach(date => allDates.add(date));
  });

  const sortedDates = Array.from(allDates).sort();

  // Create aligned price matrix
  const alignedData = {};
  Object.keys(historicalData).forEach(ticker => {
    alignedData[ticker] = [];
    sortedDates.forEach(date => {
      alignedData[ticker].push(historicalData[ticker][date] || null);
    });
  });

  // Forward fill missing values
  Object.keys(alignedData).forEach(ticker => {
    for (let i = 1; i < alignedData[ticker].length; i++) {
      if (alignedData[ticker][i] === null) {
        alignedData[ticker][i] = alignedData[ticker][i - 1];
      }
    }
  });

  // Calculate returns
  const returns = {};
  Object.keys(alignedData).forEach(ticker => {
    returns[ticker] = [];
    for (let i = 1; i < alignedData[ticker].length; i++) {
      const prevPrice = alignedData[ticker][i - 1];
      const currPrice = alignedData[ticker][i];
      if (prevPrice && currPrice && prevPrice > 0) {
        returns[ticker].push((currPrice - prevPrice) / prevPrice);
      } else {
        returns[ticker].push(0);
      }
    }
  });

  // Add dates (excluding first date since we can't calculate return for it)
  returns.index = sortedDates.slice(1);

  return returns;
}

function calculateCorrelationMatrix(returns) {
  const tickers = Object.keys(returns).filter(key => key !== 'index');
  const correlationMatrix = {};
  const averageCorrelations = {};

  // Initialize correlation matrix
  tickers.forEach(ticker => {
    correlationMatrix[ticker] = {};
  });

  // Calculate correlations
  for (let i = 0; i < tickers.length; i++) {
    for (let j = 0; j < tickers.length; j++) {
      const ticker1 = tickers[i];
      const ticker2 = tickers[j];

      if (i === j) {
        correlationMatrix[ticker1][ticker2] = 1.0;
      } else {
        const correlation = calculateCorrelation(returns[ticker1], returns[ticker2]);
        correlationMatrix[ticker1][ticker2] = correlation;
      }
    }
  }

  // Calculate average correlations
  tickers.forEach(ticker => {
    const correlations = Object.values(correlationMatrix[ticker]).filter((val, idx) =>
      Object.keys(correlationMatrix[ticker])[idx] !== ticker
    );
    averageCorrelations[ticker] = correlations.reduce((sum, corr) => sum + corr, 0) / correlations.length;
  });

  // Find top correlated pairs
  const pairs = [];
  for (let i = 0; i < tickers.length; i++) {
    for (let j = i + 1; j < tickers.length; j++) {
      const ticker1 = tickers[i];
      const ticker2 = tickers[j];
      const correlation = correlationMatrix[ticker1][ticker2];
      pairs.push([ticker1, ticker2, correlation]);
    }
  }

  const topCorrelatedPairs = pairs
    .sort((a, b) => Math.abs(b[2]) - Math.abs(a[2]))
    .slice(0, 5);

  return {
    correlationMatrix,
    averageCorrelations,
    topCorrelatedPairs
  };
}

function calculateCorrelation(returns1, returns2) {
  if (returns1.length !== returns2.length || returns1.length === 0) {
    return 0;
  }

  const n = returns1.length;
  const sum1 = returns1.reduce((sum, val) => sum + val, 0);
  const sum2 = returns2.reduce((sum, val) => sum + val, 0);
  const sum1Sq = returns1.reduce((sum, val) => sum + val * val, 0);
  const sum2Sq = returns2.reduce((sum, val) => sum + val * val, 0);
  const pSum = returns1.reduce((sum, val, i) => sum + val * returns2[i], 0);

  const num = pSum - (sum1 * sum2 / n);
  const den = Math.sqrt((sum1Sq - sum1 * sum1 / n) * (sum2Sq - sum2 * sum2 / n));

  return den === 0 ? 0 : num / den;
}

async function calculatePortfolioBeta(returns, weights, startDate, endDate) {
  try {
    console.log('Calculating portfolio beta using Python for SPY data...');

    // Fetch SPY data using local Python script helper
    const prices = await fetchPortfolioPricesDirect(['SPY']);
    const spyData = prices['SPY'] || {};

    const sortedDates = Object.keys(spyData).sort();

    if (sortedDates.length === 0) {
      throw new Error('No SPY data available');
    }

    // Calculate SPY returns
    const spyReturns = [];
    for (let i = 1; i < sortedDates.length; i++) {
      const prevPrice = spyData[sortedDates[i - 1]];
      const currPrice = spyData[sortedDates[i]];
      if (prevPrice && currPrice && prevPrice > 0) {
        spyReturns.push((currPrice - prevPrice) / prevPrice);
      }
    }

    const marketVariance = calculateVariance(spyReturns);

    console.log(`SPY returns sample:`, spyReturns.slice(0, 5));
    console.log(`SPY variance: ${marketVariance}`);

    const tickers = Object.keys(returns).filter(key => key !== 'index');
    console.log(`Processing tickers for beta: ${tickers.join(', ')}`);

    const stockBetas = {};
    const weightedBetas = {};

    // Calculate individual stock betas
    tickers.forEach((ticker, index) => {
      const stockReturns = returns[ticker];
      // Align stock returns with SPY returns (use shorter length)
      const minLength = Math.min(stockReturns.length, spyReturns.length);
      const alignedStockReturns = stockReturns.slice(0, minLength);
      const alignedSpyReturns = spyReturns.slice(0, minLength);

      const covariance = calculateCovariance(alignedStockReturns, alignedSpyReturns);
      const beta = marketVariance === 0 ? 0 : covariance / marketVariance;

      stockBetas[ticker] = beta;
      weightedBetas[ticker] = beta * weights[index];
    });

    // Calculate portfolio beta
    const portfolioBeta = Object.values(weightedBetas).reduce((sum, beta) => sum + beta, 0);

    // Sort contributors by absolute value
    const sortedContributors = Object.entries(weightedBetas)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));

    const topBetaContributors = sortedContributors.slice(0, 5);
    const bottomBetaContributors = sortedContributors.slice(-5);

    console.log(`Portfolio beta calculated: ${portfolioBeta.toFixed(4)}`);

    return {
      portfolioBeta,
      stockBetas,
      topBetaContributors,
      bottomBetaContributors
    };

  } catch (error) {
    console.error('Error calculating portfolio beta:', error);
    return {
      portfolioBeta: 0,
      stockBetas: {},
      topBetaContributors: [],
      bottomBetaContributors: []
    };
  }
}


function calculateVariance(returns) {
  if (returns.length === 0) return 0;

  const mean = returns.reduce((sum, val) => sum + val, 0) / returns.length;
  const variance = returns.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / returns.length;

  console.log(`Variance calculation: mean=${mean.toFixed(6)}, variance=${variance.toFixed(6)}, length=${returns.length}`);

  return variance;
}

function calculateCovariance(returns1, returns2) {
  if (returns1.length !== returns2.length || returns1.length === 0) return 0;

  const mean1 = returns1.reduce((sum, val) => sum + val, 0) / returns1.length;
  const mean2 = returns2.reduce((sum, val) => sum + val, 0) / returns2.length;

  const covariance = returns1.reduce((sum, val, i) =>
    sum + (val - mean1) * (returns2[i] - mean2), 0) / returns1.length;

  console.log(`Covariance calculation: mean1=${mean1.toFixed(6)}, mean2=${mean2.toFixed(6)}, covariance=${covariance.toFixed(6)}, length=${returns1.length}`);

  return covariance;
}

function calculatePortfolioStatistics(returns, weights) {
  const tickers = Object.keys(returns).filter(key => key !== 'index');

  // Risk-free rate (10-year Treasury yield, approximately 4.5% annually)
  const riskFreeRate = 0.045; // 4.5% annually
  const dailyRiskFreeRate = riskFreeRate / 252; // Daily risk-free rate

  // Calculate individual stock statistics
  const stockStats = {};
  tickers.forEach(ticker => {
    const stockReturns = returns[ticker];
    const meanReturn = stockReturns.reduce((sum, val) => sum + val, 0) / stockReturns.length;
    const variance = calculateVariance(stockReturns);
    const volatility = Math.sqrt(variance);

    const annualizedReturn = meanReturn * 252;
    const annualizedVolatility = volatility * Math.sqrt(252);
    const excessReturn = annualizedReturn - riskFreeRate;

    stockStats[ticker] = {
      meanReturn: annualizedReturn,
      volatility: annualizedVolatility,
      sharpeRatio: annualizedVolatility === 0 ? 0 : excessReturn / annualizedVolatility
    };
  });

  // Calculate portfolio statistics
  const portfolioReturn = tickers.reduce((sum, ticker, index) =>
    sum + stockStats[ticker].meanReturn * weights[index], 0);

  // Calculate portfolio volatility using proper portfolio variance formula
  // Portfolio variance = sum of (wi^2 * var_i) + sum of (wi * wj * cov_ij) for all i != j
  let portfolioVariance = 0;

  // Add individual stock variances
  tickers.forEach((ticker, i) => {
    const dailyVariance = Math.pow(stockStats[ticker].volatility / Math.sqrt(252), 2);
    portfolioVariance += Math.pow(weights[i], 2) * dailyVariance;
  });

  // Add covariance terms (simplified - using correlation matrix if available)
  for (let i = 0; i < tickers.length; i++) {
    for (let j = i + 1; j < tickers.length; j++) {
      const ticker1 = tickers[i];
      const ticker2 = tickers[j];
      const returns1 = returns[ticker1];
      const returns2 = returns[ticker2];

      // Calculate correlation
      const correlation = calculateCorrelation(returns1, returns2);
      const vol1 = stockStats[ticker1].volatility / Math.sqrt(252);
      const vol2 = stockStats[ticker2].volatility / Math.sqrt(252);

      portfolioVariance += 2 * weights[i] * weights[j] * correlation * vol1 * vol2;
    }
  }

  const portfolioVolatility = Math.sqrt(portfolioVariance * 252); // Annualized
  const portfolioExcessReturn = portfolioReturn - riskFreeRate;
  const portfolioSharpeRatio = portfolioVolatility === 0 ? 0 : portfolioExcessReturn / portfolioVolatility;

  return {
    portfolioReturn,
    portfolioVolatility,
    portfolioSharpeRatio,
    riskFreeRate,
    stockStats
  };
}

async function getValuationExpectedReturns(holdings, method) {
  console.log('Running valuations in parallel for portfolio analysis...');

  // Process all holdings in parallel
  const valuationPromises = holdings.map(async (holding) => {
    try {
      console.log(`Starting valuation for ${holding.ticker}...`);

      // Create a mock request object for the dcf-valuation GET handler
      const mockUrl = new URL(`http://localhost/api/dcf-valuation?ticker=${encodeURIComponent(holding.ticker)}&method=${encodeURIComponent(method)}`);
      const mockRequest = { url: mockUrl.toString() };

      // Call the dcf-valuation GET function directly with timeout
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Valuation timeout')), 55000)
      );

      const valuationResponse = await Promise.race([
        dcfValuationGET(mockRequest),
        timeoutPromise
      ]);

      // Handle NextResponse object
      let valuationData;
      try {
        if (valuationResponse && typeof valuationResponse.json === 'function') {
          const responseClone = valuationResponse.clone();
          const responseText = await responseClone.text();

          if (responseText.trim().startsWith('<') || responseText.includes('An error occurred')) {
            throw new Error('Valuation request timed out or returned HTML error');
          }

          valuationData = await valuationResponse.json();
        } else if (valuationResponse && valuationResponse.body) {
          const text = await valuationResponse.text();
          if (text.trim().startsWith('<') || text.includes('An error occurred')) {
            throw new Error('Valuation request timed out or returned HTML error');
          }
          valuationData = JSON.parse(text);
        } else {
          throw new Error('Invalid response format');
        }
      } catch (parseError) {
        console.error(`Failed to parse valuation response for ${holding.ticker}:`, parseError.message);
        return {
          ticker: holding.ticker,
          upside: 0,
          fairValue: 0,
          currentPrice: 0,
          error: parseError.message.includes('timeout') ? 'Valuation timeout' : 'Invalid response format'
        };
      }

      if (!valuationData || !valuationData.fairValue || valuationData.upside === undefined || valuationData.upside === null) {
        console.error(`Invalid valuation data for ${holding.ticker}:`, valuationData);
        return {
          ticker: holding.ticker,
          upside: 0,
          fairValue: 0,
          currentPrice: 0,
          error: valuationData?.error || 'Invalid valuation data'
        };
      }

      let fairValuePerShare = valuationData.fairValue;
      if (valuationData.method === 'dcf' && valuationData.sourceMetrics?.sharesOutstanding > 0) {
        fairValuePerShare = (valuationData.fairValue * 1_000_000) / valuationData.sourceMetrics.sharesOutstanding;
      } else if (valuationData.method === 'exit-multiple' && valuationData.exitMultipleCalculation?.fairValue) {
        fairValuePerShare = valuationData.exitMultipleCalculation.fairValue;
      }

      return {
        ticker: holding.ticker,
        upside: valuationData.upside,
        fairValue: fairValuePerShare,
        currentPrice: valuationData.currentSharePrice,
        method: valuationData.method
      };
    } catch (error) {
      console.error(`Error processing ${holding.ticker}:`, error.message);
      return {
        ticker: holding.ticker,
        upside: 0,
        fairValue: 0,
        currentPrice: 0,
        error: error.message
      };
    }
  });

  // Wait for all valuations to complete
  const results = await Promise.all(valuationPromises);

  // Convert array to object and calculate total
  const valuationReturns = {};
  let totalWeightedReturn = 0;

  results.forEach((result, index) => {
    valuationReturns[result.ticker] = result;
    const weightedReturn = (holdings[index].weight / 100) * result.upside;
    totalWeightedReturn += weightedReturn;
    console.log(`${result.ticker}: ${method.toUpperCase()} Upside ${result.upside.toFixed(1)}%, Weighted Return ${weightedReturn.toFixed(2)}%`);
  });

  return {
    individualReturns: valuationReturns,
    portfolioExpectedReturn: totalWeightedReturn
  };
}


async function calculatePortfolioBetaAlternative(returns, weights, startDate, endDate) {
  try {
    console.log('Using alternative beta calculation method...');
    console.log('Start date:', startDate, 'End date:', endDate);

    // Fetch SPY data using our yfinance-data endpoint
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

    const spyResponse = await fetch(`${baseUrl}/api/yfinance-data?ticker=SPY`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!spyResponse.ok) {
      throw new Error(`Failed to fetch SPY data: ${spyResponse.status}`);
    }

    const spyDataResult = await spyResponse.json();
    const spyData = spyDataResult.historicalData || [];

    console.log('SPY data fetched, length:', spyData?.length);

    if (!spyData || spyData.length === 0) {
      throw new Error('Failed to fetch SPY data for alternative calculation');
    }

    // Calculate SPY returns
    const spyReturns = [];
    for (let i = 1; i < spyData.length; i++) {
      const prevPrice = spyData[i - 1].close;
      const currPrice = spyData[i].close;
      if (prevPrice && currPrice && prevPrice > 0) {
        spyReturns.push((currPrice - prevPrice) / prevPrice);
      }
    }

    console.log(`Alternative SPY returns: ${spyReturns.length} points`);

    const tickers = Object.keys(returns).filter(key => key !== 'index');
    const stockBetas = {};
    const weightedBetas = {};

    // Calculate individual stock betas using the alternative method
    const marketVariance = calculateVariance(spyReturns);
    console.log(`Alternative market variance: ${marketVariance}`);

    tickers.forEach((ticker, index) => {
      const stockReturns = returns[ticker];
      console.log(`${ticker} stock returns length: ${stockReturns.length}`);
      console.log(`SPY returns length: ${spyReturns.length}`);

      // Use the shorter length to avoid index issues
      const minLength = Math.min(stockReturns.length, spyReturns.length);
      const alignedStockReturns = stockReturns.slice(0, minLength);
      const alignedSpyReturns = spyReturns.slice(0, minLength);

      console.log(`Aligned lengths - stock: ${alignedStockReturns.length}, SPY: ${alignedSpyReturns.length}`);

      const covariance = calculateCovariance(alignedStockReturns, alignedSpyReturns);
      const beta = marketVariance === 0 ? 0 : covariance / marketVariance;

      console.log(`${ticker} (alt): covariance=${covariance.toFixed(6)}, beta=${beta.toFixed(4)}, marketVariance=${marketVariance.toFixed(6)}`);

      stockBetas[ticker] = beta;
      weightedBetas[ticker] = beta * weights[index];
    });

    // Calculate portfolio beta
    const portfolioBeta = Object.values(weightedBetas).reduce((sum, beta) => sum + beta, 0);

    // Sort contributors by absolute value
    const sortedContributors = Object.entries(weightedBetas)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));

    const topBetaContributors = sortedContributors.slice(0, 5);
    const bottomBetaContributors = sortedContributors.slice(-5);

    return {
      portfolioBeta,
      stockBetas,
      topBetaContributors,
      bottomBetaContributors
    };

  } catch (error) {
    console.error('Error in alternative beta calculation:', error);
    console.error('Error details:', error.message, error.stack);
    return {
      portfolioBeta: 0,
      stockBetas: {},
      topBetaContributors: [],
      bottomBetaContributors: []
    };
  }
}
