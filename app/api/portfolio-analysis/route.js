import { spawn } from 'child_process';
import { NextResponse } from 'next/server';
import yahooFinance from 'yahoo-finance2';

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

    const analysisResult = {
      correlationMatrix: correlationData.correlationMatrix,
      averageCorrelations: correlationData.averageCorrelations,
      topCorrelatedPairs: correlationData.topCorrelatedPairs,
      portfolioBeta: betaData.portfolioBeta,
      stockBetas: betaData.stockBetas,
      topBetaContributors: betaData.topBetaContributors,
      bottomBetaContributors: betaData.bottomBetaContributors,
      portfolioStats: portfolioStats,
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
    console.log(`Fetching historical data for ${tickers.length} tickers...`);

    // Use spawn to call Python script directly (like yfinance-data does)
    
    const isVercel = !!process.env.VERCEL_URL || process.env.VERCEL === '1';
    let pythonCmd, scriptPath, cmd, args;
    
    if (isVercel) {
      pythonCmd = 'python3';
      scriptPath = `${process.cwd()}/scripts/fetch_portfolio_prices.py`;
      cmd = pythonCmd;
      args = [scriptPath, ...tickers];
    } else {
      pythonCmd = `${process.cwd()}/venv/bin/python3`;
      scriptPath = `${process.cwd()}/scripts/fetch_portfolio_prices.py`;
      const isDarwin = process.platform === 'darwin';
      const isNodeRosetta = process.arch === 'x64';
      cmd = isDarwin && isNodeRosetta ? '/usr/bin/arch' : pythonCmd;
      args = isDarwin && isNodeRosetta ? ['-arm64', pythonCmd, scriptPath, ...tickers] : [scriptPath, ...tickers];
    }

    const pricesByTicker = await new Promise((resolve, reject) => {
      console.log(`Running Python script: ${cmd} ${args.join(' ')}`);
      
      const child = spawn(cmd, args, { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (d) => { stdout += d.toString(); });
      child.stderr.on('data', (d) => { stderr += d.toString(); });
      
      child.on('close', (code) => {
        console.log(`Python script exit code: ${code}`);
        if (stderr) console.log(`Python stderr: ${stderr.substring(0, 500)}`);
        
        if (code !== 0) {
          console.error('Python portfolio prices script exited non-zero:', code, stderr);
          return resolve({});
        }
        
        try {
          const json = JSON.parse(stdout);
          console.log(`Successfully fetched prices for ${Object.keys(json).length} tickers`);
          resolve(json);
        } catch (e) {
          console.error('Failed to parse python output:', e);
          resolve({});
        }
      });
      
      child.on('error', (err) => {
        console.error('Failed to start python process:', err);
        resolve({});
      });
    });

    // Convert to the format expected by the rest of the code
    const historicalData = {};
    Object.entries(pricesByTicker).forEach(([ticker, prices]) => {
      if (prices && prices.length > 0) {
        const priceData = {};
        prices.forEach(day => {
          if (day.close) {
            priceData[day.date] = day.close;
          }
        });
        historicalData[ticker] = priceData;
      }
    });

    return historicalData;
  } catch (error) {
    console.error('Error fetching historical data:', error);
    return {};
  }
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
    // Always use the yfinance-data endpoint for consistency
    console.log('Calculating portfolio beta using yfinance-data endpoint...');
    
    // Convert dates to YYYY-MM-DD format for API call
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    console.log(`Fetching SPY data from ${startDateStr} to ${endDateStr}`);
    
    // Use the yfinance-data endpoint to get SPY data
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : 'http://localhost:3000';
    
    const spyUrl = `${baseUrl}/api/yfinance-data?ticker=SPY&prices=1`;
    
    const internalHeaders = {};
    if (process.env.VERCEL_PROTECTION_BYPASS) {
      internalHeaders['x-vercel-protection-bypass'] = process.env.VERCEL_PROTECTION_BYPASS;
    }
    if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
      internalHeaders['x-vercel-automation-bypass'] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    }

    const response = await fetch(spyUrl, { headers: internalHeaders });
    if (!response.ok) {
      throw new Error(`SPY API request failed: ${response.status} ${response.statusText}`);
    }
    
    const spyData = await response.json();
    
    if (spyData.error) {
      throw new Error(`SPY API error: ${spyData.error}`);
    }
    
    console.log(`SPY API returned ${spyData.historicalData?.length || 0} data points`);
    
    // Process SPY data to calculate returns
    const spyHistoricalData = spyData.historicalData || [];
    const spyReturns = [];
    for (let i = 1; i < spyHistoricalData.length; i++) {
      const prevPrice = spyHistoricalData[i - 1].close;
      const currPrice = spyHistoricalData[i].close;
      if (prevPrice && currPrice && prevPrice > 0) {
        spyReturns.push((currPrice - prevPrice) / prevPrice);
      }
    }
    
    const marketVariance = calculateVariance(spyReturns);
    
    console.log(`SPY returns sample:`, spyReturns.slice(0, 5));
    console.log(`SPY variance from API: ${marketVariance}`);

    const tickers = Object.keys(returns).filter(key => key !== 'index');
    console.log(`DEBUG: Processing tickers: ${tickers.join(', ')}`);
    console.log(`DEBUG: Stock returns lengths:`, tickers.map(t => ({ticker: t, length: returns[t].length})));
    console.log(`DEBUG: SPY returns length: ${spyReturns.length}`);
    
    const stockBetas = {};
    const weightedBetas = {};

    // Calculate individual stock betas using API SPY data
    tickers.forEach((ticker, index) => {
      const stockReturns = returns[ticker];
      // Align stock returns with SPY returns (use shorter length)
      const minLength = Math.min(stockReturns.length, spyReturns.length);
      const alignedStockReturns = stockReturns.slice(0, minLength);
      const alignedSpyReturns = spyReturns.slice(0, minLength);
      
      // Debug: show some sample data
      console.log(`${ticker} sample data (first 5):`);
      console.log(`  Stock: ${alignedStockReturns.slice(0, 5).map(r => r.toFixed(4)).join(', ')}`);
      console.log(`  SPY:   ${alignedSpyReturns.slice(0, 5).map(r => r.toFixed(4)).join(', ')}`);
      
      // Calculate means for debugging
      const stockMean = alignedStockReturns.reduce((sum, val) => sum + val, 0) / alignedStockReturns.length;
      const spyMean = alignedSpyReturns.reduce((sum, val) => sum + val, 0) / alignedSpyReturns.length;
      console.log(`  Stock mean: ${stockMean.toFixed(6)}, SPY mean: ${spyMean.toFixed(6)}`);
      
      const covariance = calculateCovariance(alignedStockReturns, alignedSpyReturns);
      const beta = marketVariance === 0 ? 0 : covariance / marketVariance;
      
      console.log(`${ticker}: covariance=${covariance.toFixed(6)}, beta=${beta.toFixed(4)}, marketVariance=${marketVariance.toFixed(6)}`);
      
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
  const valuationReturns = {};
  let totalWeightedReturn = 0;

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const fetchWithRetry = async (url, options, attempts = 3, baseDelayMs = 800) => {
    for (let i = 0; i < attempts; i++) {
      const res = await fetch(url, options);
      if (res.ok) return res;
      if (![401, 429, 500, 502, 503, 504].includes(res.status)) return res;
      const delay = baseDelayMs * Math.pow(2, i);
      await sleep(delay);
    }
    return fetch(url, options);
  };

  const internalHeaders = {};
  if (process.env.VERCEL_PROTECTION_BYPASS) {
    internalHeaders['x-vercel-protection-bypass'] = process.env.VERCEL_PROTECTION_BYPASS;
  }
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
    internalHeaders['x-vercel-automation-bypass'] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  }
  
  // For local testing, always add a test bypass header
  if (!process.env.VERCEL_URL) {
    internalHeaders['x-vercel-automation-bypass'] = 'local-test-token';
  }
  
  console.log('Portfolio Analysis - Internal headers:', internalHeaders);

  for (const holding of holdings) {
    try {
      console.log(`Fetching ${method} valuation for ${holding.ticker} (sequential)...`);

      const baseUrl = process.env.VERCEL_URL 
        ? `https://${process.env.VERCEL_URL}` 
        : 'http://localhost:3000';

      const url = `${baseUrl}/api/dcf-valuation?ticker=${encodeURIComponent(holding.ticker)}&method=${method}`;
      const valuationResponse = await fetchWithRetry(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...internalHeaders },
      });

      if (!valuationResponse.ok) {
        console.error(`Failed to fetch ${method} valuation for ${holding.ticker}:`, valuationResponse.status);
        valuationReturns[holding.ticker] = {
          upside: 0,
          fairValue: 0,
          currentPrice: 0,
          error: `Failed to fetch valuation (${valuationResponse.status})`
        };
        continue;
      }

      const valuationData = await valuationResponse.json();
      if (!valuationData.fairValue || valuationData.upside === undefined || valuationData.upside === null) {
        console.error(`Invalid ${method} valuation data for ${holding.ticker}:`, valuationData);
        valuationReturns[holding.ticker] = {
          upside: 0,
          fairValue: 0,
          currentPrice: 0,
          error: 'Invalid valuation data'
        };
        continue;
      }

      let fairValuePerShare = valuationData.fairValue;
      if (valuationData.method === 'dcf' && valuationData.sourceMetrics?.sharesOutstanding > 0) {
        fairValuePerShare = (valuationData.fairValue * 1_000_000) / valuationData.sourceMetrics.sharesOutstanding;
      } else if (valuationData.method === 'exit-multiple' && valuationData.exitMultipleCalculation?.fairValue) {
        fairValuePerShare = valuationData.exitMultipleCalculation.fairValue;
      }

      valuationReturns[holding.ticker] = {
        upside: valuationData.upside,
        fairValue: fairValuePerShare,
        currentPrice: valuationData.currentSharePrice,
        method: valuationData.method
      };

      const weightedReturn = (holding.weight / 100) * valuationData.upside;
      totalWeightedReturn += weightedReturn;
      console.log(`${holding.ticker}: ${method.toUpperCase()} Upside ${valuationData.upside.toFixed(1)}%, Weighted Return ${weightedReturn.toFixed(2)}%`);

      // Small delay between calls to avoid provider rate limits
      await sleep(500);
    } catch (error) {
      console.error(`Error fetching ${method} data for ${holding.ticker}:`, error.message);
      valuationReturns[holding.ticker] = {
        upside: 0,
        fairValue: 0,
        currentPrice: 0,
        error: error.message
      };
    }
  }

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
