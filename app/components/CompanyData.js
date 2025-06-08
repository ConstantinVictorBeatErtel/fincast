'use client';

import { useState } from 'react';

export default function CompanyData() {
  const [ticker, setTicker] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setData(null);

    try {
      console.log(`Fetching data for ticker: ${ticker}`);
      const response = await fetch(`/api/company-data?ticker=${encodeURIComponent(ticker)}`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `Failed to fetch data: ${response.status} ${response.statusText}`);
      }

      console.log('Received data:', result);
      setData(result);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6 text-gray-900">Company Data</h2>
      
      <form onSubmit={fetchData} className="mb-6">
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
            {loading ? 'Loading...' : 'Fetch Data'}
          </button>
        </div>
      </form>

      {error && (
        <div className="p-4 mb-6 text-red-800 bg-red-100 rounded-lg border border-red-200">
          <p className="font-semibold">Error:</p>
          <p>{error}</p>
        </div>
      )}

      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
            {Object.entries(data).map(([year, metrics]) => (
              <div key={year} className="p-6 bg-gray-50 rounded-lg border border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Year {year}</h3>
                <div className="space-y-2">
                  <div>
                    <p className="text-sm text-gray-600">Revenue</p>
                    <p className="text-xl font-bold text-gray-900">
                      ${(metrics.Revenue / 1e9).toFixed(2)}B
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Net Income</p>
                    <p className="text-xl font-bold text-gray-900">
                      ${(metrics['Net Income'] / 1e9).toFixed(2)}B
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-sm font-medium text-gray-700">
            Data for Q{data.quarter} {data.year}
          </p>
        </div>
      )}
    </div>
  );
} 