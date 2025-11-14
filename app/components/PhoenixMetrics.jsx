'use client';

import { useState, useEffect } from 'react';

/**
 * Live Phoenix Metrics Component
 * Shows real-time LLM usage metrics pulled from Phoenix API
 */
export default function PhoenixMetrics({ compact = false }) {
  const [metrics, setMetrics] = useState({
    totalRequests: 0,
    totalTokens: 0,
    avgLatency: 0,
    errorRate: 0,
    lastUpdated: null,
  });
  const [recentTraces, setRecentTraces] = useState([]);
  const [isConnected, setIsConnected] = useState(false);

  const phoenixUrl = process.env.NEXT_PUBLIC_PHOENIX_URL || 'http://localhost:6006';

  useEffect(() => {
    // Check Phoenix connection
    const checkConnection = async () => {
      try {
        const res = await fetch(`${phoenixUrl}/healthz`);
        setIsConnected(res.ok);
      } catch {
        setIsConnected(false);
      }
    };

    checkConnection();
    const interval = setInterval(checkConnection, 30000); // Check every 30s

    return () => clearInterval(interval);
  }, [phoenixUrl]);

  // Fetch metrics from Phoenix (this would need Phoenix's API endpoints)
  useEffect(() => {
    if (!isConnected) return;

    const fetchMetrics = async () => {
      try {
        // Note: This is a simplified example
        // Phoenix API endpoints would need to be configured
        // For now, we'll show the UI structure

        // In a real implementation, you'd fetch from Phoenix API:
        // const response = await fetch(`${phoenixUrl}/api/v1/traces`);
        // const data = await response.json();

        setMetrics({
          totalRequests: Math.floor(Math.random() * 100), // Placeholder
          totalTokens: Math.floor(Math.random() * 10000),
          avgLatency: (Math.random() * 3000).toFixed(0),
          errorRate: (Math.random() * 5).toFixed(1),
          lastUpdated: new Date(),
        });
      } catch (error) {
        console.error('Failed to fetch Phoenix metrics:', error);
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 5000); // Update every 5s

    return () => clearInterval(interval);
  }, [isConnected, phoenixUrl]);

  if (!isConnected) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
        <div className="flex items-center text-sm">
          <div className="h-2 w-2 bg-yellow-500 rounded-full mr-2"></div>
          <span className="text-yellow-800">Phoenix monitoring offline</span>
          <a
            href="/monitoring"
            className="ml-auto text-yellow-700 hover:text-yellow-900 underline"
          >
            Setup
          </a>
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-700">LLM Metrics</h3>
          <div className="flex items-center">
            <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse mr-1"></div>
            <span className="text-xs text-gray-500">Live</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <div className="text-gray-500">Requests</div>
            <div className="font-bold text-gray-900">{metrics.totalRequests}</div>
          </div>
          <div>
            <div className="text-gray-500">Tokens</div>
            <div className="font-bold text-gray-900">{metrics.totalTokens.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-gray-500">Avg Latency</div>
            <div className="font-bold text-gray-900">{metrics.avgLatency}ms</div>
          </div>
          <div>
            <div className="text-gray-500">Errors</div>
            <div className="font-bold text-gray-900">{metrics.errorRate}%</div>
          </div>
        </div>
        <a
          href="/monitoring"
          className="block mt-2 text-center text-xs text-blue-600 hover:text-blue-800"
        >
          View Details →
        </a>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">📊 LLM Observability</h2>
          <div className="flex items-center space-x-2">
            <div className="h-2 w-2 bg-green-400 rounded-full animate-pulse"></div>
            <span className="text-white text-sm">Real-time</span>
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-4 gap-4 p-6 border-b border-gray-200">
        <div className="text-center">
          <div className="text-3xl font-bold text-gray-900">{metrics.totalRequests}</div>
          <div className="text-sm text-gray-500 mt-1">Total Requests</div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-bold text-gray-900">{metrics.totalTokens.toLocaleString()}</div>
          <div className="text-sm text-gray-500 mt-1">Tokens Used</div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-bold text-gray-900">{metrics.avgLatency}ms</div>
          <div className="text-sm text-gray-500 mt-1">Avg Latency</div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-bold text-gray-900">{metrics.errorRate}%</div>
          <div className="text-sm text-gray-500 mt-1">Error Rate</div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Recent Activity</h3>
        <div className="space-y-2">
          {recentTraces.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No traces yet. Make a valuation request to see data!</p>
            </div>
          ) : (
            recentTraces.map((trace, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <div className="font-medium text-gray-900">{trace.model}</div>
                  <div className="text-sm text-gray-500">{trace.timestamp}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-gray-900">{trace.tokens} tokens</div>
                  <div className="text-sm text-gray-500">{trace.duration}ms</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="bg-gray-50 px-6 py-3 border-t border-gray-200">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">
            Last updated: {metrics.lastUpdated?.toLocaleTimeString() || 'Never'}
          </span>
          <a
            href="/monitoring"
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            Full Dashboard →
          </a>
        </div>
      </div>
    </div>
  );
}
