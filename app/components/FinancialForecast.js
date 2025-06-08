'use client';

import { useState } from 'react';

export default function FinancialForecast() {
  const [ticker, setTicker] = useState('');
  const [forecast, setForecast] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const generateForecast = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setForecast(null);

    try {
      // First, get historical data
      const historicalResponse = await fetch(`/api/company-data?ticker=${encodeURIComponent(ticker)}`);
      const historicalData = await historicalResponse.json();

      if (!historicalResponse.ok) {
        throw new Error(historicalData.error || 'Failed to fetch historical data');
      }

      // Call our API endpoint that will handle the Claude API call
      const response = await fetch('/api/generate-forecast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ticker,
          historicalData
        })
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to generate forecast');
      }

      setForecast(result.forecast);
    } catch (err) {
      console.error('Error generating forecast:', err);
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6 text-gray-900">AI Financial Forecast</h2>
      
      <form onSubmit={generateForecast} className="mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="Enter ticker symbol (e.g., AAPL)"
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 placeholder-gray-500"
          />
          <button
            type="submit"
            disabled={loading || !ticker}
            className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Generating Forecast...' : 'Generate Forecast'}
          </button>
        </div>
      </form>

      {error && (
        <div className="p-4 mb-6 text-red-800 bg-red-100 rounded-lg border border-red-200">
          <p className="font-semibold">Error:</p>
          <p>{error}</p>
        </div>
      )}

      {forecast && (
        <div className="space-y-6">
          {Object.entries(forecast).map(([year, data]) => (
            <div key={year} className="p-6 bg-gray-50 rounded-lg border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Year {year}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(data).map(([metric, value]) => (
                  <div key={metric} className="p-4 bg-white rounded-lg border border-gray-200">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">{metric}</h4>
                    <p className="text-xl font-bold text-gray-900">
                      ${(value.forecast / 1e9).toFixed(2)}B
                    </p>
                    <p className="text-sm text-gray-600 mt-2">{value.explanation}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
} 