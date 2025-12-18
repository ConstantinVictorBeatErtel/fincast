'use client';
import React, { useState } from 'react';
import ForecastDisplay from '../components/ForecastDisplay';

export default function TestForecastPage() {
    const [ticker, setTicker] = useState('MSFT');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);

    const handleGenerate = async () => {
        setLoading(true);
        setError(null);
        setResult(null);

        try {
            const res = await fetch('/api/forecast', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ticker: ticker.toUpperCase(), companyName: '' })
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || data.details || 'Failed to generate forecast');
            }

            setResult(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-8 max-w-4xl mx-auto font-sans">
            <h1 className="text-3xl font-bold mb-6 text-gray-800">Test New Forecast Architecture</h1>

            <div className="bg-white p-6 rounded-lg shadow-md mb-8 border border-gray-200">
                <label className="block text-sm font-medium text-gray-700 mb-2">Ticker Symbol</label>
                <div className="flex gap-4">
                    <input
                        type="text"
                        value={ticker}
                        onChange={(e) => setTicker(e.target.value)}
                        className="flex-1 p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none uppercase"
                        placeholder="e.g. AAPL"
                    />
                    <button
                        onClick={handleGenerate}
                        disabled={loading}
                        className={`px-6 py-2 rounded text-white font-medium ${loading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'} transition`}
                    >
                        {loading ? 'Generating...' : 'Generate Standard Forecast'}
                    </button>
                </div>
                {loading && <p className="mt-2 text-sm text-gray-500">Calling Gemini Flash via OpenRouter...</p>}
                {error && <div className="mt-4 p-4 bg-red-50 text-red-700 rounded border border-red-200">{error}</div>}
            </div>

            {result && (
                <div className="animate-fade-in">
                    <h2 className="text-xl font-semibold mb-4 text-gray-700">Result (Metadata: Cost ${result.metadata?.cost?.toFixed(5)})</h2>
                    <ForecastDisplay forecast={result.forecast} metadata={result.metadata} />

                    <div className="mt-8 p-4 bg-gray-100 rounded text-xs font-mono overflow-auto max-h-64 border border-gray-300">
                        <h3 className="font-bold mb-2 text-gray-600">Raw JSON Response:</h3>
                        <pre>{JSON.stringify(result, null, 2)}</pre>
                    </div>
                </div>
            )}
        </div>
    );
}
