'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Plus, Trash2, Calculator, TrendingUp, DollarSign, BarChart3, Activity, Target } from 'lucide-react';

export default function PortfolioTool() {
  const [holdings, setHoldings] = useState([
    { id: 1, ticker: '', weight: '' }
  ]);
  const [results, setResults] = useState(null);
  const [analysisResults, setAnalysisResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [analysisMethod, setAnalysisMethod] = useState('exit-multiple');
  const [correlationOnly, setCorrelationOnly] = useState(false);

  const addHolding = () => {
    const newId = Math.max(...holdings.map(h => h.id), 0) + 1;
    setHoldings([...holdings, { id: newId, ticker: '', weight: '' }]);
  };

  const removeHolding = (id) => {
    if (holdings.length > 1) {
      setHoldings(holdings.filter(h => h.id !== id));
    }
  };

  const updateHolding = (id, field, value) => {
    setHoldings(holdings.map(h => 
      h.id === id ? { ...h, [field]: value } : h
    ));
  };

  const calculatePortfolio = async () => {
    // Validate inputs
    const validHoldings = holdings.filter(h => h.ticker.trim() && h.weight.trim());
    
    if (validHoldings.length === 0) {
      setError('Please add at least one ticker with a weight');
      return;
    }

    // Check if weights sum to 100%
    const totalWeight = validHoldings.reduce((sum, h) => sum + parseFloat(h.weight || 0), 0);
    if (Math.abs(totalWeight - 100) > 0.01) {
      setError('Weights must sum to 100%');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/portfolio-calculator', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          holdings: validHoldings.map(h => ({
            ticker: h.ticker.toUpperCase().trim(),
            weight: parseFloat(h.weight)
          })),
          method: analysisMethod
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to calculate portfolio');
      }

      const data = await response.json();
      setResults(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const analyzePortfolio = async (opts = { correlationOnly: false }) => {
    // Validate inputs
    const validHoldings = holdings.filter(h => h.ticker.trim() && h.weight.trim());
    
    if (validHoldings.length < 2) {
      setError('At least 2 stocks are required for correlation analysis');
      return;
    }

    // Check if weights sum to 100%
    const totalWeight = validHoldings.reduce((sum, h) => sum + parseFloat(h.weight || 0), 0);
    if (Math.abs(totalWeight - 100) > 0.01) {
      setError('Weights must sum to 100%');
      return;
    }

    // Hide any previous Calculate Returns result to avoid mixed signals
    setResults(null);
    setAnalysisLoading(true);
    setError('');

    try {
      const response = await fetch('/api/portfolio-analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          holdings: validHoldings.map(h => ({
            ticker: h.ticker.toUpperCase().trim(),
            weight: parseFloat(h.weight)
          })),
          method: analysisMethod,
          correlationOnly: opts.correlationOnly === true
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to analyze portfolio');
      }

      const data = await response.json();
      setAnalysisResults(data);
      setShowAnalysis(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setAnalysisLoading(false);
    }
  };


  const totalWeight = holdings.reduce((sum, h) => sum + parseFloat(h.weight || 0), 0);

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Input Section */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-semibold">Portfolio Holdings</h3>
          <Button onClick={addHolding} variant="outline" size="sm">
            <Plus className="w-4 h-4 mr-2" />
            Add Stock
          </Button>
        </div>

        {/* Valuation Method Selector */}
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Valuation Method for Analysis
          </label>
          <div className="flex space-x-4">
            <label className="flex items-center">
              <input
                type="radio"
                value="exit-multiple"
                checked={analysisMethod === 'exit-multiple'}
                onChange={(e) => setAnalysisMethod(e.target.value)}
                className="mr-2"
              />
              <span className="text-sm">Exit Multiple (Market-based)</span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                value="dcf"
                checked={analysisMethod === 'dcf'}
                onChange={(e) => setAnalysisMethod(e.target.value)}
                className="mr-2"
              />
              <span className="text-sm">DCF (Fundamental)</span>
            </label>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Exit Multiple uses market comparables, DCF uses discounted cash flow projections
          </p>
        </div>

        <div className="space-y-4">
          {holdings.map((holding) => (
            <div key={holding.id} className="flex items-center space-x-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ticker Symbol
                </label>
                <Input
                  value={holding.ticker}
                  onChange={(e) => updateHolding(holding.id, 'ticker', e.target.value)}
                  placeholder="AAPL"
                  className="uppercase"
                />
              </div>
              <div className="w-32">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Weight (%)
                </label>
                <Input
                  type="number"
                  value={holding.weight}
                  onChange={(e) => updateHolding(holding.id, 'weight', e.target.value)}
                  placeholder="25"
                  step="0.01"
                  min="0"
                  max="100"
                />
              </div>
              <div className="flex items-end">
                <Button
                  onClick={() => removeHolding(holding.id)}
                  variant="outline"
                  size="sm"
                  disabled={holdings.length === 1}
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Total Weight: <span className={`font-medium ${Math.abs(totalWeight - 100) < 0.01 ? 'text-green-600' : 'text-red-600'}`}>
              {totalWeight.toFixed(2)}%
            </span>
          </div>
          <div className="flex space-x-3">
            <Button 
              onClick={calculatePortfolio} 
              disabled={loading || Math.abs(totalWeight - 100) > 0.01}
              variant="outline"
            >
              <Calculator className="w-4 h-4 mr-2" />
              {loading ? 'Calculating...' : 'Calculate Returns'}
            </Button>
            <Button 
              onClick={() => analyzePortfolio({ correlationOnly: true })} 
              disabled={analysisLoading || Math.abs(totalWeight - 100) > 0.01 || holdings.filter(h => h.ticker.trim() && h.weight.trim()).length < 2}
              variant="outline"
            >
              <BarChart3 className="w-4 h-4 mr-2" />
              {analysisLoading ? 'Calculating...' : 'Calculate Correlation'}
            </Button>
            <Button 
              onClick={() => analyzePortfolio({ correlationOnly: false })} 
              disabled={analysisLoading || Math.abs(totalWeight - 100) > 0.01 || holdings.filter(h => h.ticker.trim() && h.weight.trim()).length < 2}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <BarChart3 className="w-4 h-4 mr-2" />
              {analysisLoading ? 'Analyzing...' : 'Full Portfolio Analysis'}
            </Button>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}
      </Card>

      {/* Results Section */}
      {results && !showAnalysis && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Portfolio Summary */}
          <Card className="p-6">
            <h3 className="text-xl font-semibold mb-4 flex items-center">
              <TrendingUp className="w-5 h-5 mr-2" />
              Portfolio Summary
            </h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Expected Return (2029)</span>
                <span className="text-2xl font-bold text-green-600">
                  {results.expectedReturn.toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Weighted Fair Value</span>
                <span className="text-lg font-semibold">
                  ${results.weightedFairValue.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Number of Holdings</span>
                <span className="text-lg font-semibold">
                  {results.holdings.length}
                </span>
              </div>
            </div>
          </Card>

          {/* Individual Holdings */}
          <Card className="p-6">
            <h3 className="text-xl font-semibold mb-4 flex items-center">
              <DollarSign className="w-5 h-5 mr-2" />
              Individual Holdings
            </h3>
            <div className="space-y-3">
              {results.holdings.map((holding, index) => (
                <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <div>
                    <span className="font-medium">{holding.ticker}</span>
                    <span className="text-gray-500 ml-2">({holding.weight}%)</span>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">${holding.fairValue.toFixed(2)}</div>
                    <div className={`text-sm ${holding.upside >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {holding.upside >= 0 ? '+' : ''}{holding.upside.toFixed(1)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Portfolio Analysis Results */}
      {showAnalysis && analysisResults && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-bold">{analysisResults.correlationOnly ? 'Portfolio Correlation' : 'Full Portfolio Analysis'}</h3>
            <Button 
              onClick={() => setShowAnalysis(false)} 
              variant="outline" 
              size="sm"
            >
              Hide Analysis
            </Button>
          </div>

          {/* Portfolio Statistics */}
          <div className={`grid grid-cols-1 ${analysisResults.correlationOnly ? 'md:grid-cols-1' : 'md:grid-cols-3'} gap-6`}>
            {/* Beta is always shown */}
            <Card className="p-6">
              <div className="flex items-center mb-4">
                <Activity className="w-5 h-5 mr-2 text-blue-600" />
                <h4 className="text-lg font-semibold">Portfolio Beta</h4>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600">
                  {analysisResults.portfolioBeta.toFixed(3)}
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  {analysisResults.portfolioBeta > 1 ? 'Higher risk than market' : 
                   analysisResults.portfolioBeta < 1 ? 'Lower risk than market' : 
                   'Same risk as market'}
                </p>
              </div>
            </Card>
            {/* Expected Return and Sharpe shown only for full analysis */}
            {!analysisResults.correlationOnly && (
            <>
            <Card className="p-6">
              <div className="flex items-center mb-4">
                <TrendingUp className="w-5 h-5 mr-2 text-green-600" />
                <h4 className="text-lg font-semibold">Expected Return (2029)</h4>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600">
                  {analysisResults.valuationExpectedReturns?.portfolioExpectedReturn ? 
                    analysisResults.valuationExpectedReturns.portfolioExpectedReturn.toFixed(1) + '%' :
                    (analysisResults.portfolioStats.portfolioReturn * 100).toFixed(1) + '%'
                  }
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  {analysisResults.valuationExpectedReturns?.portfolioExpectedReturn ? 
                    `${analysisResults.valuationMethod?.toUpperCase()}-based projection` : 'Historical average'
                  }
                </p>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center mb-4">
                <Target className="w-5 h-5 mr-2 text-purple-600" />
                <h4 className="text-lg font-semibold">Sharpe Ratio</h4>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-purple-600">
                  {analysisResults.portfolioStats.portfolioSharpeRatio.toFixed(2)}
                </div>
                <p className="text-sm text-gray-600 mt-2">Risk-adjusted return</p>
              </div>
            </Card>
            </>
            )}
          </div>

          {/* Correlation Matrix */}
          <Card className="p-6">
            <h4 className="text-xl font-semibold mb-4">Correlation Matrix</h4>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 font-medium">Stock</th>
                    {Object.keys(analysisResults.correlationMatrix).map(ticker => (
                      <th key={ticker} className="text-center py-2 px-3 font-medium">
                        {ticker}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(analysisResults.correlationMatrix).map(([ticker, correlations]) => (
                    <tr key={ticker} className="border-b">
                      <td className="py-2 px-3 font-medium">{ticker}</td>
                      {Object.entries(correlations).map(([otherTicker, correlation]) => (
                        <td key={otherTicker} className="text-center py-2 px-3">
                          <span className={`px-2 py-1 rounded text-sm font-medium ${
                            correlation > 0.7 ? 'bg-red-100 text-red-800' :
                            correlation > 0.3 ? 'bg-yellow-100 text-yellow-800' :
                            'bg-green-100 text-green-800'
                          }`}>
                            {correlation.toFixed(2)}
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 text-sm text-gray-600">
              <p><span className="inline-block w-3 h-3 bg-red-100 rounded mr-2"></span> High correlation (0.7+)</p>
              <p><span className="inline-block w-3 h-3 bg-yellow-100 rounded mr-2"></span> Medium correlation (0.3-0.7)</p>
              <p><span className="inline-block w-3 h-3 bg-green-100 rounded mr-2"></span> Low correlation (0-0.3)</p>
            </div>
          </Card>

          {/* Average Correlation to Portfolio */}
          <Card className="p-6">
            <h4 className="text-xl font-semibold mb-4">Average Correlation to Portfolio</h4>
            <div className="space-y-2">
              {Object.entries(analysisResults.averageCorrelations)
                .sort((a, b) => b[1] - a[1])
                .map(([ticker, avg], index, arr) => (
                <div key={ticker} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <div className="font-medium">
                    {ticker}
                    {index === 0 && (
                      <span className="ml-2 text-xs px-2 py-0.5 rounded bg-red-100 text-red-700">Most correlated</span>
                    )}
                    {index === arr.length - 1 && (
                      <span className="ml-2 text-xs px-2 py-0.5 rounded bg-green-100 text-green-700">Least correlated</span>
                    )}
                  </div>
                  <div className={`font-semibold ${avg > 0.7 ? 'text-red-600' : avg > 0.3 ? 'text-yellow-700' : 'text-green-600'}`}>
                    {avg.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Valuation Expected Returns */}
          {!analysisResults.correlationOnly && analysisResults.valuationExpectedReturns?.individualReturns && (
            <Card className="p-6">
              <h4 className="text-xl font-semibold mb-4">{analysisResults.valuationMethod?.toUpperCase()}-Based Expected Returns (2029)</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(analysisResults.valuationExpectedReturns.individualReturns).map(([ticker, data]) => (
                  <div key={ticker} className="p-4 bg-gray-50 rounded-lg">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium">{ticker}</span>
                      <span className="text-sm text-gray-500">
                        ({holdings.find(h => h.ticker.toUpperCase() === ticker)?.weight}%)
                      </span>
                    </div>
                    {data.error ? (
                      <div className="text-red-600 text-sm">{data.error}</div>
                    ) : (
                      <div>
                        <div className="text-lg font-semibold text-green-600">
                          {data.upside >= 0 ? '+' : ''}{data.upside.toFixed(1)}%
                        </div>
                        <div className="text-sm text-gray-600">
                          Fair Value: ${data.fairValue.toFixed(2)}
                        </div>
                        <div className="text-sm text-gray-600">
                          Current: ${data.currentPrice.toFixed(2)}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Beta Contributors */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="p-6">
              <h4 className="text-lg font-semibold mb-4">Top Beta Contributors</h4>
              <div className="space-y-3">
                {analysisResults.topBetaContributors.map(([ticker, contribution], index) => (
                  <div key={ticker} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                    <div>
                      <span className="font-medium">{ticker}</span>
                      <span className="text-gray-500 ml-2">({holdings.find(h => h.ticker.toUpperCase() === ticker)?.weight}%)</span>
                    </div>
                    <div className={`font-semibold ${contribution >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {contribution >= 0 ? '+' : ''}{contribution.toFixed(3)}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-6">
              <h4 className="text-lg font-semibold mb-4">Top Correlated Pairs</h4>
              <div className="space-y-3">
                {analysisResults.topCorrelatedPairs.map(([ticker1, ticker2, correlation], index) => (
                  <div key={`${ticker1}-${ticker2}`} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                    <div className="font-medium">
                      {ticker1} - {ticker2}
                    </div>
                    <div className={`font-semibold ${
                      correlation > 0.7 ? 'text-red-600' :
                      correlation > 0.3 ? 'text-yellow-600' :
                      'text-green-600'
                    }`}>
                      {correlation.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Data Period Info */}
          <Card className="p-6 bg-blue-50 border-blue-200">
            <h4 className="text-lg font-semibold text-blue-900 mb-2">Analysis Period</h4>
            <p className="text-blue-800 text-sm">
              Data analyzed from {new Date(analysisResults.dataPeriod.startDate).toLocaleDateString()} to {new Date(analysisResults.dataPeriod.endDate).toLocaleDateString()} 
              ({analysisResults.dataPeriod.totalDays} trading days)
            </p>
          </Card>
        </div>
      )}


      {/* Instructions */}
      <Card className="p-6 bg-blue-50 border-blue-200">
        <h3 className="text-lg font-semibold text-blue-900 mb-2">How to Use</h3>
        <ul className="text-blue-800 space-y-1 text-sm">
          <li>• Enter stock ticker symbols (e.g., AAPL, MSFT, GOOGL)</li>
          <li>• Set the weight percentage for each stock (must sum to 100%)</li>
          <li>• Click "Calculate Returns" to get estimated 2029 returns and fair values</li>
          <li>• Click "Analyze Portfolio" to get correlation matrix, beta analysis, and risk metrics</li>
          <li>• Analysis includes 5 years of historical data for correlation and beta calculations</li>
        </ul>
      </Card>
    </div>
  );
}
