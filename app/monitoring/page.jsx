'use client';

import { useState, useEffect } from 'react';

export default function MonitoringPage() {
  const [phoenixAvailable, setPhoenixAvailable] = useState(false);
  const phoenixUrl = process.env.NEXT_PUBLIC_PHOENIX_URL || 'http://localhost:6006';

  useEffect(() => {
    // Check if Phoenix is available
    fetch(`${phoenixUrl}/healthz`)
      .then(res => {
        setPhoenixAvailable(res.ok);
      })
      .catch(() => setPhoenixAvailable(false));
  }, [phoenixUrl]);

  if (!phoenixAvailable) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-6">
        <div className="max-w-2xl w-full bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            📊 LLM Monitoring Dashboard
          </h1>

          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800">
                  Phoenix Server Not Running
                </h3>
                <div className="mt-2 text-sm text-yellow-700">
                  <p>Start the Phoenix server to view LLM traces and analytics.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Quick Start:</h2>
              <div className="bg-gray-900 rounded-lg p-4 mb-4">
                <code className="text-green-400 text-sm">
                  docker run -p 6006:6006 -p 4317:4317 arizephoenix/phoenix:latest
                </code>
              </div>
              <p className="text-sm text-gray-600 mb-2">Or without Docker:</p>
              <div className="bg-gray-900 rounded-lg p-4">
                <code className="text-green-400 text-sm">
                  pip install arize-phoenix && python -m phoenix.server.main serve
                </code>
              </div>
            </div>

            <div className="pt-4 border-t border-gray-200">
              <h3 className="text-md font-semibold text-gray-900 mb-2">What you'll see:</h3>
              <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                <li>Real-time LLM request traces</li>
                <li>Token usage and costs</li>
                <li>Response latencies</li>
                <li>Input/output analysis</li>
                <li>Error tracking</li>
              </ul>
            </div>

            <button
              onClick={() => window.location.reload()}
              className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
            >
              Retry Connection
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <a
              href="/"
              className="text-blue-600 hover:text-blue-800 transition-colors"
            >
              ← Back to Fincast
            </a>
            <h1 className="text-2xl font-bold text-gray-900">
              📊 LLM Monitoring Dashboard
            </h1>
          </div>
          <div className="flex items-center space-x-2">
            <div className="flex items-center">
              <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse mr-2"></div>
              <span className="text-sm text-gray-600">Phoenix Connected</span>
            </div>
            <a
              href={phoenixUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:text-blue-800 underline"
            >
              Open in New Tab
            </a>
          </div>
        </div>
      </div>

      {/* Phoenix iFrame */}
      <div className="flex-1 overflow-hidden">
        <iframe
          src={phoenixUrl}
          className="w-full h-full border-0"
          title="Phoenix LLM Monitoring"
          allow="fullscreen"
        />
      </div>
    </div>
  );
}
