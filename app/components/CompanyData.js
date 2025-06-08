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
      const response = await fetch(`/api/company-data?ticker=${ticker}`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch data');
      }

      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-xl font-semibold mb-4">Company Data</h2>
      
      <form onSubmit={fetchData} className="mb-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="Enter ticker symbol (e.g., AAPL)"
            className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={loading || !ticker}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Loading...' : 'Fetch Data'}
          </button>
        </div>
      </form>

      {error && (
        <div className="p-4 mb-4 text-red-700 bg-red-100 rounded-lg">
          {error}
        </div>
      )}

      {data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <h3 className="text-sm font-medium text-gray-500">Revenue</h3>
              <p className="text-2xl font-semibold">
                ${(data.revenue / 1e9).toFixed(2)}B
              </p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <h3 className="text-sm font-medium text-gray-500">Net Income</h3>
              <p className="text-2xl font-semibold">
                ${(data.net_income / 1e9).toFixed(2)}B
              </p>
            </div>
          </div>
          <p className="text-sm text-gray-500">
            Data for Q{data.quarter} {data.year}
          </p>
        </div>
      )}
    </div>
  );
} 