'use client';
import React from 'react';
import '../styles/forecast.css';

export default function ForecastDisplay({ forecast, metadata }) {
    if (!forecast) {
        return <div className="error p-4 bg-red-50 text-red-600 rounded">Failed to generate forecast data</div>;
    }

    const { validation, dataQuality, projections, dcf, key_drivers, assumptions } = forecast;
    const meta = metadata || {};

    // Sort projections by year
    const sortedYears = Object.keys(projections).sort();

    return (
        <div className="forecast-container font-sans text-gray-800">
            {/* Quality Indicators */}
            <div className="quality-banner">
                <div className="confidence-badge" data-level={meta.confidenceLevel || 'Low'}>
                    <span className="label text-sm opacity-80">Confidence</span>
                    <span className="score">{meta.confidenceScore || 0}/100</span>
                    <span className="level uppercase text-xs tracking-wider">{meta.confidenceLevel || 'LOW'}</span>
                </div>

                <div className="data-quality">
                    <span className="label text-sm opacity-80">Data Quality</span>
                    <span className="score">{dataQuality?.score || 0}/100</span>
                </div>

                <div className="generation-time">
                    <span className="label text-sm opacity-80">Generated in</span>
                    <span className="font-mono">{meta.duration?.toFixed(1) || 0}s</span>
                </div>
            </div>

            {/* Warnings Section */}
            {meta.warnings && meta.warnings.length > 0 && (
                <div className="warnings-section">
                    <h3 className="font-bold">⚠️ Attention Required</h3>
                    <ul className="list-disc pl-5">
                        {meta.warnings.map((warning, idx) => (
                            <li key={idx}>{warning}</li>
                        ))}
                    </ul>
                    <p className="recommendation">{meta.recommendation}</p>

                    {meta.confidenceScore < 50 && (
                        <button className="upgrade-button mt-4 px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded font-bold shadow hover:opacity-90 transition">
                            🔍 Try Agentic Analysis for More Accurate Forecast
                        </button>
                    )}
                </div>
            )}

            {/* Data Quality Issues */}
            {dataQuality?.issues?.length > 0 && (
                <div className="mb-6 p-4 bg-gray-50 rounded border border-gray-200">
                    <h4 className="font-bold text-gray-600 mb-2">Data Limitations:</h4>
                    <ul className="list-disc pl-5 text-sm text-gray-500">
                        {dataQuality.issues.map((issue, idx) => (
                            <li key={idx}>{issue}</li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Key Drivers */}
            <div className="key-drivers mb-8">
                <h3 className="text-xl font-bold mb-4 border-b pb-2">Key Value Drivers</h3>
                <div className="drivers-grid">
                    <div className="driver">
                        <h4>Growth 📈</h4>
                        <p className="text-sm mt-2">{key_drivers?.growth?.factor || 'N/A'}</p>
                        <span className={`confidence ${key_drivers?.growth?.confidence || 'Low'}`}>
                            {key_drivers?.growth?.confidence || 'Low'} Confidence
                        </span>
                    </div>
                    <div className="driver">
                        <h4>Profitability 💰</h4>
                        <p className="text-sm mt-2">{key_drivers?.profitability?.factor || 'N/A'}</p>
                        <span className={`confidence ${key_drivers?.profitability?.confidence || 'Low'}`}>
                            {key_drivers?.profitability?.confidence || 'Low'} Confidence
                        </span>
                    </div>
                    <div className="driver">
                        <h4>Key Risk ⚠️</h4>
                        <p className="text-sm mt-2">{key_drivers?.risk?.factor || 'N/A'}</p>
                        <span className={`confidence ${key_drivers?.risk?.confidence || 'Low'}`}>
                            {key_drivers?.risk?.confidence || 'Low'} Confidence
                        </span>
                    </div>
                </div>
            </div>

            {/* Projections Table */}
            <div className="projections-table">
                <h3 className="text-xl font-bold mb-4 px-2">Financial Projections</h3>
                <table>
                    <thead>
                        <tr>
                            <th>Year</th>
                            <th>Revenue ($M)</th>
                            <th>Growth %</th>
                            <th>EBITDA Margin %</th>
                            <th>Net Income ($M)</th>
                            <th>EPS</th>
                            <th>Confidence</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedYears.map((year) => {
                            const data = projections[year];
                            const isActual = year === new Date().getFullYear().toString() || data.confidence === undefined; // Heuristic
                            return (
                                <tr key={year} className={isActual ? 'actual-row' : ''}>
                                    <td>
                                        {year} {isActual && <span className="badge">Actual</span>}
                                    </td>
                                    <td>${Number(data.revenue / 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                    <td>{data.revenueGrowth !== null ? `${Number(data.revenueGrowth).toFixed(1)}%` : '-'}</td>
                                    <td>{Number(data.ebitdaMargin).toFixed(1)}%</td>
                                    <td>${Number(data.netIncome / 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                    <td>${Number(data.eps || 0).toFixed(2)}</td>
                                    <td>
                                        {data.confidence && (
                                            <span className={`badge ${data.confidence.toLowerCase()}`}>
                                                {data.confidence}
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Valuation */}
            <div className="valuation-section mb-8">
                <h3 className="text-xl font-bold mb-4 border-b pb-2">DCF Valuation</h3>
                <div className="valuation-grid">
                    <div className="val-item">
                        <span className="label">Fair Value Per Share</span>
                        <span className="value big">${Number(dcf.fairValuePerShare).toFixed(2)}</span>
                    </div>
                    <div className="val-item">
                        <span className="label">Current Price</span>
                        <span className="value">${Number(dcf.currentPrice).toFixed(2)}</span>
                    </div>
                    <div className="val-item">
                        <span className="label">Upside/Downside</span>
                        <span className={`value ${dcf.upsideDownside >= 0 ? 'positive' : 'negative'}`}>
                            {dcf.upsideDownside >= 0 ? '+' : ''}{Number(dcf.upsideDownside).toFixed(1)}%
                        </span>
                    </div>
                </div>

                <div className="dcf-assumptions">
                    <h4 className="font-bold mb-2">DCF Assumptions</h4>
                    <ul>
                        <li>Discount Rate (WACC): {Number(dcf.discountRate).toFixed(1)}%</li>
                        <li>Terminal Growth Rate: {Number(dcf.terminalGrowthRate).toFixed(1)}%</li>
                        <li>Terminal Value: {Number(dcf.terminalValuePercent).toFixed(0)}% of EV</li>
                        <li>Implied Forward P/E: {Number(dcf.impliedForwardPE).toFixed(1)}x</li>
                    </ul>
                </div>
            </div>

            {/* Assumptions Detail */}
            <div className="assumptions-section">
                <h3 className="text-xl font-bold mb-4 border-b pb-2">Key Assumptions</h3>
                <div className="assumptions-list">
                    {assumptions && assumptions.map((assumption, idx) => (
                        <div key={idx} className="assumption-card">
                            <h4 className="font-bold">{assumption.category}</h4>
                            <p className="text-gray-700 mt-1">{assumption.assumption}</p>
                            <div className="assumption-meta">
                                <span className="driver font-mono bg-gray-100 px-2 py-1 rounded">Driver: {assumption.driver}</span>
                                <span className={`confidence ${assumption.confidence.toLowerCase()}`}>
                                    {assumption.confidence} Confidence
                                </span>
                            </div>
                            {assumption.risk && (
                                <p className="risk mt-2 text-sm bg-yellow-50 text-yellow-800 p-2 rounded">⚠️ Risk: {assumption.risk}</p>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
