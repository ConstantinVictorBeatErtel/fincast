'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { signIn } from 'next-auth/react';

export default function Portfolio() {
  const { data: session, status } = useSession();
  const [holdings, setHoldings] = useState([]);
  const [newTicker, setNewTicker] = useState('');
  const [newShares, setNewShares] = useState('');
  const [newAvgPrice, setNewAvgPrice] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (session) {
      fetchHoldings();
    }
  }, [session]);

  const fetchHoldings = async () => {
    try {
      const response = await fetch('/api/portfolio');
      if (response.ok) {
        const data = await response.json();
        setHoldings(data.holdings || []);
      }
    } catch (error) {
      console.error('Error fetching holdings:', error);
    }
  };

  const addHolding = async (e) => {
    e.preventDefault();
    if (!newTicker || !newShares || !newAvgPrice) {
      setError('Please fill in all fields');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/portfolio', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ticker: newTicker.toUpperCase(),
          shares: parseFloat(newShares),
          avgPrice: parseFloat(newAvgPrice),
        }),
      });

      if (response.ok) {
        setNewTicker('');
        setNewShares('');
        setNewAvgPrice('');
        fetchHoldings();
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to add holding');
      }
    } catch (error) {
      setError('An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const removeHolding = async (holdingId) => {
    try {
      const response = await fetch(`/api/portfolio/${holdingId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchHoldings();
      }
    } catch (error) {
      console.error('Error removing holding:', error);
    }
  };

  if (status === 'loading') {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full space-y-8">
          <div>
            <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
              Sign in to manage your portfolio
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              Track your investments and view upside potential
            </p>
          </div>
          <div className="mt-8 space-y-6">
            <button
              onClick={() => signIn()}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  const totalValue = holdings.reduce((sum, holding) => {
    return sum + (holding.shares * holding.avgPrice);
  }, 0);

  const totalUpside = holdings.reduce((sum, holding) => {
    const currentValue = holding.shares * holding.avgPrice;
    const potentialValue = holding.shares * (holding.latestValuation?.fairValue || holding.avgPrice);
    return sum + (potentialValue - currentValue);
  }, 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">My Portfolio</h1>
        <p className="mt-2 text-gray-600">Track your investments and upside potential</p>
      </div>

      {/* Portfolio Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900">Total Value</h3>
          <p className="text-3xl font-bold text-blue-600">${totalValue.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900">Total Upside</h3>
          <p className="text-3xl font-bold text-green-600">${totalUpside.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900">Holdings</h3>
          <p className="text-3xl font-bold text-gray-900">{holdings.length}</p>
        </div>
      </div>

      {/* Add New Holding */}
      <div className="bg-white rounded-lg shadow p-6 mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Add New Holding</h2>
        <form onSubmit={addHolding} className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label htmlFor="ticker" className="block text-sm font-medium text-gray-700">
              Ticker
            </label>
            <input
              type="text"
              id="ticker"
              value={newTicker}
              onChange={(e) => setNewTicker(e.target.value)}
              className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="AAPL"
              required
            />
          </div>
          <div>
            <label htmlFor="shares" className="block text-sm font-medium text-gray-700">
              Shares
            </label>
            <input
              type="number"
              id="shares"
              value={newShares}
              onChange={(e) => setNewShares(e.target.value)}
              className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="100"
              step="0.01"
              required
            />
          </div>
          <div>
            <label htmlFor="avgPrice" className="block text-sm font-medium text-gray-700">
              Avg Price
            </label>
            <input
              type="number"
              id="avgPrice"
              value={newAvgPrice}
              onChange={(e) => setNewAvgPrice(e.target.value)}
              className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="150.00"
              step="0.01"
              required
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {isLoading ? 'Adding...' : 'Add Holding'}
            </button>
          </div>
        </form>
        {error && (
          <p className="mt-2 text-red-600 text-sm">{error}</p>
        )}
      </div>

      {/* Holdings List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Holdings</h2>
        </div>
        {holdings.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-500">
            <p>No holdings yet. Add your first stock above.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ticker
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Shares
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Avg Price
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Current Value
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fair Value
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Upside
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {holdings.map((holding) => {
                  const currentValue = holding.shares * holding.avgPrice;
                  const fairValue = holding.latestValuation?.fairValue || holding.avgPrice;
                  const potentialValue = holding.shares * fairValue;
                  const upside = potentialValue - currentValue;
                  const upsidePercent = (upside / currentValue) * 100;

                  return (
                    <tr key={holding.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {holding.ticker}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {holding.shares.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        ${holding.avgPrice.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        ${currentValue.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        ${fairValue.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`font-medium ${upside >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {upside >= 0 ? '+' : ''}${upside.toLocaleString()} ({upsidePercent >= 0 ? '+' : ''}{upsidePercent.toFixed(1)}%)
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <button
                          onClick={() => removeHolding(holding.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
} 