'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, Bar } from 'recharts';
import { useDCFValuation } from '@/app/hooks/useDCFValuation';
import { formatOneDecimal, formatYearAsFY, getYearNumber, getSortedHistorical } from '@/app/lib/dcf/formatters';
import AgentFlowGraph from '@/app/components/AgentFlowGraph';

export default function DCFValuation() {
  const {
    ticker,
    setTicker,
    method,
    setMethod,
    selectedMultiple,
    setSelectedMultiple,
    loading,
    error,
    valuation,
    feedback,
    setFeedback,
    showFeedbackForm,
    setShowFeedbackForm,
    feedbackLoading,
    retrying,
    analysisMode,
    setAnalysisMode,
    agenticProgress,
    showResearchTrail,
    setShowResearchTrail,
    handleSubmit,
    handleFeedbackSubmit,
    downloadExcel,
  } = useDCFValuation();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Usage Instructions */}
      <div className="mb-6 text-sm text-gray-600 bg-gray-50 p-4 rounded-lg">
        <p className="font-medium mb-1">How to use:</p>
        <p>Enter a stock ticker, select a valuation method, and click Generate. <strong>Standard Forecast</strong> uses AI + market data for quick analysis (~10s). <strong>Agentic Analysis</strong> researches the web and validates assumptions for deeper insights (~1-2 min).</p>
      </div>

      <form onSubmit={handleSubmit} className="mb-8">
        <div className="flex gap-4 flex-wrap">
          <Input
            type="text"
            placeholder="Enter ticker symbol (e.g., AAPL)"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            className="max-w-xs"
          />
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select method" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dcf">Discounted Cash Flow</SelectItem>
              <SelectItem value="exit-multiple">Exit Multiple DCF</SelectItem>
            </SelectContent>
          </Select>
          {method === 'exit-multiple' && (
            <Select value={selectedMultiple} onValueChange={setSelectedMultiple}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select multiple type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">AI Chooses Multiple Type</SelectItem>
                <SelectItem value="P/E">P/E Multiple</SelectItem>
                <SelectItem value="EV/EBITDA">EV/EBITDA Multiple</SelectItem>
                <SelectItem value="EV/FCF">EV/FCF Multiple</SelectItem>
                <SelectItem value="Price/Sales">Price/Sales Multiple</SelectItem>
              </SelectContent>
            </Select>
          )}
          {/* Analysis Mode Toggle */}
          <Select value={analysisMode} onValueChange={setAnalysisMode}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Analysis mode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="standard">Standard Forecast</SelectItem>
              <SelectItem value="agentic">Agentic Analysis</SelectItem>
            </SelectContent>
          </Select>

          <Button type="submit" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {analysisMode === 'agentic' ? 'Researching...' : 'Generating...'}
              </>
            ) : (
              'Generate Valuation'
            )}
          </Button>
        </div>
      </form>

      {error && (
        <Alert variant="destructive" className="mb-8">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading && (
        <div className="flex flex-col justify-center items-center py-8 space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-gray-500" />

          {/* Agentic progress indicator with step dots */}
          {analysisMode === 'agentic' && agenticProgress && (
            <div className="text-center space-y-3">
              <p className="text-sm font-medium text-gray-700">
                Step {agenticProgress.step}/4: {agenticProgress.message}
              </p>
              <div className="flex gap-2 justify-center">
                {[1, 2, 3, 4].map((step) => (
                  <div
                    key={step}
                    className={`w-3 h-3 rounded-full transition-all duration-500 ${step < agenticProgress.step
                      ? 'bg-green-500'
                      : step === agenticProgress.step
                        ? 'bg-blue-500 animate-pulse'
                        : 'bg-gray-300'
                      }`}
                  />
                ))}
              </div>
              <p className="text-xs text-gray-400">
                This may take 1-2 minutes
              </p>
            </div>
          )}
        </div>
      )}

      {retrying && (
        <Alert className="mt-4" variant="warning">
          <AlertTitle>Retrying...</AlertTitle>
          <AlertDescription>
            Some key information was missing. Retrying the valuation fetch one more time.
          </AlertDescription>
        </Alert>
      )}

      {valuation && (
        <div className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>Valuation Summary - {valuation.companyName}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Fair Value</h3>
                  <p className="text-2xl font-bold">
                    {valuation.source === 'agentic'
                      ? (typeof valuation.fairValue === 'number'
                        ? `$${valuation.fairValue.toFixed(2)} per share`
                        : 'N/A')
                      : valuation.method === 'exit-multiple'
                        ? (typeof valuation.currentSharePrice === 'number' && typeof valuation.upside === 'number'
                          ? `$${(valuation.currentSharePrice * (1 + (valuation.upside / 100))).toFixed(2)} per share`
                          : 'N/A')
                        : `$${valuation.fairValue?.toLocaleString()} million`
                    }
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Method</h3>
                  <p className="text-2xl font-bold capitalize">
                    {valuation.method}
                  </p>
                </div>
                {valuation.method === 'dcf' && valuation.source !== 'agentic' && (
                  <>
                    <div>
                      <h3 className="text-sm font-medium text-gray-500">Discount Rate</h3>
                      <p className="text-2xl font-bold">
                        {valuation.discountRate}%
                      </p>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-gray-500">Terminal Growth</h3>
                      <p className="text-2xl font-bold">
                        {valuation.terminalGrowth}%
                      </p>
                    </div>
                  </>
                )}
                {valuation.method === 'exit-multiple' && valuation.source !== 'agentic' && (
                  <>
                    <div>
                      <h3 className="text-sm font-medium text-gray-500">Exit Multiple</h3>
                      <p className="text-2xl font-bold">
                        {valuation.exitMultipleValue}x {valuation.exitMultipleType}
                      </p>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-gray-500">Current Price</h3>
                      <p className="text-2xl font-bold text-gray-600">
                        ${valuation.currentSharePrice?.toFixed(2)}
                      </p>
                    </div>
                  </>
                )}
                {valuation.source === 'agentic' && (
                  <>
                    {/* DCF mode: show WACC and Terminal Growth */}
                    {(valuation.method === 'dcf' || valuation.valuationMethod === 'dcf') ? (
                      <>
                        <div>
                          <h3 className="text-sm font-medium text-gray-500">WACC</h3>
                          <p className="text-2xl font-bold">
                            {valuation.dcfCalculation?.wacc?.toFixed(1) || '10.0'}%
                          </p>
                        </div>
                        <div>
                          <h3 className="text-sm font-medium text-gray-500">Terminal Growth</h3>
                          <p className="text-2xl font-bold">
                            {valuation.dcfCalculation?.terminalGrowthRate?.toFixed(1) || '2.5'}%
                          </p>
                        </div>
                      </>
                    ) : (
                      /* Exit Multiple mode: show multiple info */
                      <>
                        <div>
                          <h3 className="text-sm font-medium text-gray-500">Exit Multiple</h3>
                          <p className="text-2xl font-bold">
                            {valuation.exitMultipleValue || 'N/A'}x {valuation.exitMultipleType || 'P/E'}
                          </p>
                        </div>
                        <div>
                          <h3 className="text-sm font-medium text-gray-500">Current Price</h3>
                          <p className="text-2xl font-bold text-gray-600">
                            ${valuation.currentSharePrice?.toFixed(2) || 'N/A'}
                          </p>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>

              {/* Add CAGR display */}
              <div className="mt-6 pt-6 border-t">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Upside CAGR</h3>
                    <p className="text-xl font-bold text-blue-600">
                      {valuation.cagr?.toFixed(1) || 0}%
                    </p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">
                      {(() => {
                        // Get the last projection year for dynamic label
                        const lastProj = valuation.projections?.[valuation.projections?.length - 1];
                        const lastYear = lastProj?.year ? String(lastProj.year).replace('FY', '20') : '2029';
                        return `${lastYear.length === 2 ? '20' + lastYear : lastYear} Upside`;
                      })()}
                    </h3>
                    <p className="text-xl font-bold text-green-600">
                      {valuation.upside?.toFixed(1) || 0}%
                    </p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Confidence</h3>
                    <p className="text-xl font-bold">
                      {valuation.confidence || 'Medium'}
                    </p>
                  </div>
                </div>

                {/* Agentic mode: detailed confidence badges */}
                {valuation.source === 'agentic' && valuation.confidence_scores && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <h4 className="text-sm font-medium text-gray-600 mb-3">AI Confidence Scores</h4>
                    <div className="flex flex-wrap gap-3">
                      {Object.entries(valuation.confidence_scores).map(([metric, level]) => {
                        const colors = {
                          high: 'bg-green-100 text-green-800 border-green-300',
                          medium: 'bg-yellow-100 text-yellow-800 border-yellow-300',
                          low: 'bg-red-100 text-red-800 border-red-300'
                        };
                        const icons = { high: '🟢', medium: '🟡', low: '🔴' };
                        return (
                          <span
                            key={metric}
                            className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium border ${colors[level] || colors.medium}`}
                          >
                            {icons[level] || '🟡'} {metric.charAt(0).toUpperCase() + metric.slice(1)}: {level}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Agentic mode: DCF Calculation breakdown */}
                {valuation.source === 'agentic' && valuation.dcfCalculation && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <h4 className="text-sm font-medium text-gray-600 mb-3">DCF Valuation Calculation</h4>
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <div className="space-y-3 text-sm">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="bg-white p-3 rounded-lg">
                            <div className="text-gray-500 text-xs font-medium uppercase mb-1">WACC</div>
                            <div className="text-lg font-semibold">{valuation.dcfCalculation.wacc?.toFixed(1)}%</div>
                          </div>
                          <div className="bg-white p-3 rounded-lg">
                            <div className="text-gray-500 text-xs font-medium uppercase mb-1">Terminal Growth</div>
                            <div className="text-lg font-semibold">{valuation.dcfCalculation.terminalGrowthRate?.toFixed(1)}%</div>
                          </div>
                          <div className="bg-white p-3 rounded-lg">
                            <div className="text-gray-500 text-xs font-medium uppercase mb-1">Fair Value</div>
                            <div className="text-lg font-semibold text-green-600">${valuation.dcfCalculation.fairValue?.toFixed(2)}</div>
                          </div>
                          <div className="bg-white p-3 rounded-lg">
                            <div className="text-gray-500 text-xs font-medium uppercase mb-1">Current Price</div>
                            <div className="text-lg font-semibold text-gray-600">${valuation.dcfCalculation.currentPrice?.toFixed(2)}</div>
                          </div>
                        </div>

                        {valuation.dcfCalculation.pv_fcf_sum && (
                          <div className="bg-white p-3 rounded-lg border border-green-100">
                            <div className="text-gray-500 text-xs font-medium uppercase mb-2">DCF Breakdown</div>
                            <div className="space-y-1 font-mono text-sm">
                              <div>PV of FCFs: ${valuation.dcfCalculation.pv_fcf_sum?.toFixed(0)}M</div>
                              <div>+ PV of Terminal Value: ${valuation.dcfCalculation.pv_terminal_value?.toFixed(0)}M</div>
                              <div className="border-t pt-1">= Enterprise Value: ${valuation.dcfCalculation.enterprise_value?.toFixed(0)}M</div>
                              <div>− Net Debt: ${valuation.dcfCalculation.net_debt?.toFixed(0) || 0}M</div>
                              <div className="border-t pt-1">= Equity Value: ${valuation.dcfCalculation.equity_value?.toFixed(0)}M</div>
                              <div>÷ Shares: {(valuation.dcfCalculation.shares_outstanding / 1_000_000)?.toFixed(1)}M</div>
                              <div className="border-t pt-1 font-bold">= Fair Value/Share: ${valuation.dcfCalculation.fair_value_per_share?.toFixed(2)}</div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Agentic mode: Exit Multiple Calculation breakdown */}
                {valuation.source === 'agentic' && valuation.exitMultipleCalculation && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <h4 className="text-sm font-medium text-gray-600 mb-3">Exit Multiple Valuation</h4>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="space-y-3 text-sm">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="bg-white p-3 rounded-lg">
                            <div className="text-gray-500 text-xs font-medium uppercase mb-1">Terminal Year</div>
                            <div className="text-lg font-semibold">{valuation.exitMultipleCalculation.terminalYear}</div>
                          </div>
                          <div className="bg-white p-3 rounded-lg">
                            <div className="text-gray-500 text-xs font-medium uppercase mb-1">Exit Multiple</div>
                            <div className="text-lg font-semibold">{valuation.exitMultipleCalculation.exitMultipleValue}x {valuation.exitMultipleCalculation.exitMultipleType}</div>
                          </div>
                          <div className="bg-white p-3 rounded-lg">
                            <div className="text-gray-500 text-xs font-medium uppercase mb-1">Fair Value</div>
                            <div className="text-lg font-semibold text-green-600">${valuation.exitMultipleCalculation.fairValue?.toFixed(2)}</div>
                          </div>
                          <div className="bg-white p-3 rounded-lg">
                            <div className="text-gray-500 text-xs font-medium uppercase mb-1">Current Price</div>
                            <div className="text-lg font-semibold text-gray-600">${valuation.exitMultipleCalculation.currentPrice?.toFixed(2)}</div>
                          </div>
                        </div>

                        {/* EV-to-Share Bridge for EV-based multiples */}
                        {valuation.exitMultipleCalculation.isEVBased ? (
                          <div className="bg-white p-3 rounded-lg border border-blue-100">
                            <div className="text-gray-500 text-xs font-medium uppercase mb-2">EV to Per-Share Calculation</div>
                            <div className="space-y-1 font-mono text-sm">
                              <div>{valuation.exitMultipleCalculation.calculationMethod}</div>
                              <div className="border-t pt-1">Enterprise Value: ${valuation.exitMultipleCalculation.enterpriseValue?.toFixed(0)}M</div>
                              <div>− Net Debt: ${valuation.exitMultipleCalculation.netDebt?.toFixed(0)}M</div>
                              <div className="border-t pt-1">= Equity Value: ${valuation.exitMultipleCalculation.equityValue?.toFixed(0)}M</div>
                              <div>÷ Shares: {valuation.exitMultipleCalculation.sharesOutstandingMillions?.toFixed(1)}M</div>
                              <div className="border-t pt-1 font-bold">= Fair Value/Share: ${valuation.exitMultipleCalculation.fairValue?.toFixed(2)}</div>
                            </div>
                          </div>
                        ) : (
                          <div className="bg-white p-3 rounded-lg border border-blue-100">
                            <div className="text-gray-500 text-xs font-medium uppercase mb-1">Calculation</div>
                            <div className="font-mono text-sm">{valuation.exitMultipleCalculation.calculationMethod}</div>
                            <div className="font-mono text-sm mt-1">= Fair Value/Share: ${valuation.exitMultipleCalculation.fairValue?.toFixed(2)}</div>
                          </div>
                        )}

                        <div className="text-xs text-gray-500">
                          Terminal Revenue: ${valuation.exitMultipleCalculation.terminalRevenue?.toFixed(0)}M |
                          Terminal EBITDA: ${valuation.exitMultipleCalculation.terminalEbitda?.toFixed(0)}M |
                          Terminal FCF: ${valuation.exitMultipleCalculation.terminalFcf?.toFixed(0)}M
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Currency conversion info */}
                {valuation.currencyInfo && valuation.currencyInfo.converted_to_usd && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                      <div className="flex items-center text-sm text-yellow-800">
                        <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        <span>
                          <strong>Currency Conversion Applied:</strong> Financial data was converted from {valuation.currencyInfo.original_currency} to USD using exchange rate {valuation.currencyInfo.conversion_rate.toFixed(4)} (Source: {valuation.currencyInfo.exchange_rate_source})
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="forecast">
            <TabsList>
              <TabsTrigger value="forecast">Forecast</TabsTrigger>
              <TabsTrigger value="analysis">Financial Analysis</TabsTrigger>
            </TabsList>

            <TabsContent value="forecast">
              <Card>
                <CardHeader>
                  <CardTitle>Financial Forecast</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {(Array.isArray(valuation.projections) && valuation.projections.length > 0) && (() => {
                      // Get the latest historical year to filter projections to only future years
                      const historicalYears = (valuation.historicalFinancials || [])
                        .map(h => getYearNumber(h.year))
                        .filter(y => y > 0);
                      const latestHistoricalYear = historicalYears.length > 0 ? Math.max(...historicalYears) : 2024;

                      // Filter projections to only show years AFTER the latest historical year
                      // Also calculate first year growth from last historical year
                      const lastHistoricalFinancial = (valuation.historicalFinancials || [])
                        .sort((a, b) => getYearNumber(b.year) - getYearNumber(a.year))[0];
                      const lastHistoricalRevenue = lastHistoricalFinancial?.revenue || 0;

                      const filteredProjections = valuation.projections
                        .filter(p => getYearNumber(p.year) > latestHistoricalYear)
                        .map((p, index, arr) => {
                          let calculatedGrowth = p.revenueGrowth;

                          // For first projection year, calculate growth from last historical year
                          if (index === 0 && (calculatedGrowth === 0 || !calculatedGrowth) && lastHistoricalRevenue > 0 && p.revenue > 0) {
                            calculatedGrowth = ((p.revenue - lastHistoricalRevenue) / lastHistoricalRevenue) * 100;
                          }

                          return {
                            ...p,
                            revenueGrowth: calculatedGrowth,
                            yearLabel: formatYearAsFY(p.year) // Add FY formatted label
                          };
                        });

                      if (filteredProjections.length === 0) return null;

                      return (
                        <div>
                          <h3 className="text-lg font-semibold mb-4 text-gray-800">Financial Projections ({formatYearAsFY(filteredProjections[0]?.year)}-{formatYearAsFY(filteredProjections[filteredProjections.length - 1]?.year)})</h3>
                          <div className="bg-white border border-gray-200 rounded-lg p-6">
                            <div className="space-y-8">
                              {/* Revenue and Growth Chart */}
                              <div>
                                <h4 className="text-md font-semibold mb-3 text-gray-700">Revenue & Growth</h4>
                                <ResponsiveContainer width="100%" height={300}>
                                  <ComposedChart data={filteredProjections}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                    <XAxis dataKey="yearLabel" stroke="#6b7280" />
                                    <YAxis yAxisId="left" stroke="#3b82f6" />
                                    <YAxis yAxisId="right" orientation="right" stroke="#10b981" />
                                    <Tooltip
                                      formatter={(value, name) => [
                                        (typeof name === 'string' && name.toLowerCase().includes('growth')) ? `${formatOneDecimal(value)}%` : `$${formatOneDecimal(value)}M`,
                                        name
                                      ]}
                                    />
                                    <Legend />
                                    <Bar yAxisId="left" dataKey="revenue" fill="#3b82f6" name="Revenue ($M)" />
                                    <Line yAxisId="right" type="monotone" dataKey="revenueGrowth" stroke="#10b981" strokeWidth={2} name="Revenue Growth (%)" />
                                  </ComposedChart>
                                </ResponsiveContainer>
                              </div>

                              {/* Margins Chart */}
                              <div>
                                <h4 className="text-md font-semibold mb-3 text-gray-700">Margins (%)</h4>
                                <ResponsiveContainer width="100%" height={300}>
                                  <LineChart data={filteredProjections}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                    <XAxis dataKey="yearLabel" stroke="#6b7280" />
                                    <YAxis stroke="#6b7280" />
                                    <Tooltip formatter={(value) => [`${formatOneDecimal(value)}%`, '']} />
                                    <Legend />
                                    <Line type="monotone" dataKey="grossMargin" stroke="#8b5cf6" strokeWidth={2} name="Gross Margin" />
                                    <Line type="monotone" dataKey="ebitdaMargin" stroke="#f59e0b" strokeWidth={2} name="EBITDA Margin" />
                                    <Line type="monotone" dataKey="fcfMargin" stroke="#ef4444" strokeWidth={2} name="FCF Margin" />
                                  </LineChart>
                                </ResponsiveContainer>
                              </div>

                              {/* Profitability Chart */}
                              <div>
                                <h4 className="text-md font-semibold mb-3 text-gray-700">Profitability</h4>
                                <ResponsiveContainer width="100%" height={300}>
                                  <ComposedChart data={filteredProjections}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                    <XAxis dataKey="yearLabel" stroke="#6b7280" />
                                    <YAxis yAxisId="left" stroke="#3b82f6" />
                                    <YAxis yAxisId="right" orientation="right" stroke="#10b981" />
                                    <Tooltip
                                      formatter={(value, name) => [
                                        (typeof name === 'string' && name.toLowerCase().includes('margin')) ? `${formatOneDecimal(value)}%` : `$${formatOneDecimal(value)}M`,
                                        name
                                      ]}
                                    />
                                    <Legend />
                                    <Bar yAxisId="left" dataKey="netIncome" fill="#3b82f6" name="Net Income ($M)" />
                                    <Line yAxisId="right" type="monotone" dataKey="netIncomeMargin" stroke="#10b981" strokeWidth={2} name="Net Income Margin (%)" />
                                  </ComposedChart>
                                </ResponsiveContainer>
                              </div>

                              {/* Cash Flow Chart */}
                              <div>
                                <h4 className="text-md font-semibold mb-3 text-gray-700">Cash Flow</h4>
                                <ResponsiveContainer width="100%" height={300}>
                                  <ComposedChart data={filteredProjections}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                    <XAxis dataKey="yearLabel" stroke="#6b7280" />
                                    <YAxis yAxisId="left" stroke="#3b82f6" />
                                    <YAxis yAxisId="right" orientation="right" stroke="#10b981" />
                                    <Tooltip
                                      formatter={(value, name) => [
                                        (typeof name === 'string' && name.toLowerCase().includes('margin')) ? `${formatOneDecimal(value)}%` : `$${formatOneDecimal(value)}M`,
                                        name
                                      ]}
                                    />
                                    <Legend />
                                    <Bar yAxisId="left" dataKey="fcf" fill="#3b82f6" name="FCF ($M)" />
                                    <Line yAxisId="right" type="monotone" dataKey="fcfMargin" stroke="#10b981" strokeWidth={2} name="FCF Margin (%)" />
                                  </ComposedChart>
                                </ResponsiveContainer>
                              </div>

                              {/* EPS Chart */}
                              <div>
                                <h4 className="text-md font-semibold mb-3 text-gray-700">EPS</h4>
                                <ResponsiveContainer width="100%" height={300}>
                                  <LineChart data={filteredProjections}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                    <XAxis dataKey="yearLabel" stroke="#6b7280" />
                                    <YAxis stroke="#6b7280" />
                                    <Tooltip formatter={(value) => [`$${formatOneDecimal(value)}`, 'EPS']} />
                                    <Legend />
                                    <Line type="monotone" dataKey="eps" stroke="#ec4899" strokeWidth={2} name="EPS ($)" />
                                  </LineChart>
                                </ResponsiveContainer>
                              </div>

                              {/* Summary Table for Reference */}
                              <div className="mt-6">
                                <h4 className="text-md font-semibold mb-3 text-gray-700">Summary Table</h4>
                                <div className="overflow-x-auto">
                                  <table className="w-full text-sm border border-gray-200 rounded-lg">
                                    <thead className="bg-gray-50">
                                      <tr>
                                        <th className="px-3 py-2 text-left font-medium text-gray-700 border-b border-r">Metric</th>
                                        {filteredProjections.map((row) => (
                                          <th key={row.yearLabel} className="px-3 py-2 text-center font-medium text-gray-700 border-b border-r">
                                            {row.yearLabel}
                                          </th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                      {/* Revenue Row */}
                                      <tr className="hover:bg-gray-50">
                                        <td className="px-3 py-2 text-left font-medium text-gray-900 border-r bg-blue-50">Revenue ($M)</td>
                                        {filteredProjections.map((row) => (
                                          <td key={row.yearLabel} className="px-3 py-2 text-center text-gray-900 border-r">
                                            {row.revenue?.toFixed(1)}
                                          </td>
                                        ))}
                                      </tr>

                                      {/* Revenue Growth Row */}
                                      <tr className="hover:bg-gray-50">
                                        <td className="px-3 py-2 text-left font-medium text-gray-900 border-r bg-green-50">Revenue Growth (%)</td>
                                        {filteredProjections.map((row, index) => (
                                          <td key={row.yearLabel} className="px-3 py-2 text-center text-green-700 border-r">
                                            {index === 0 ? '-' : row.revenueGrowth?.toFixed(1)}
                                          </td>
                                        ))}
                                      </tr>

                                      {/* Gross Profit Row */}
                                      <tr className="hover:bg-gray-50">
                                        <td className="px-3 py-2 text-left font-medium text-gray-900 border-r bg-blue-50">Gross Profit ($M)</td>
                                        {filteredProjections.map((row) => (
                                          <td key={row.yearLabel} className="px-3 py-2 text-center text-gray-900 border-r">
                                            {row.grossProfit?.toFixed(1)}
                                          </td>
                                        ))}
                                      </tr>

                                      {/* Gross Margin Row */}
                                      <tr className="hover:bg-gray-50">
                                        <td className="px-3 py-2 text-left font-medium text-gray-900 border-r bg-green-50">Gross Margin (%)</td>
                                        {filteredProjections.map((row) => (
                                          <td key={row.yearLabel} className="px-3 py-2 text-center text-green-700 border-r">
                                            {row.grossMargin?.toFixed(1)}
                                          </td>
                                        ))}
                                      </tr>

                                      {/* EBITDA Row */}
                                      <tr className="hover:bg-gray-50">
                                        <td className="px-3 py-2 text-left font-medium text-gray-900 border-r bg-blue-50">EBITDA ($M)</td>
                                        {filteredProjections.map((row) => (
                                          <td key={row.yearLabel} className="px-3 py-2 text-center text-gray-900 border-r">
                                            {row.ebitda?.toFixed(1)}
                                          </td>
                                        ))}
                                      </tr>

                                      {/* EBITDA Margin Row */}
                                      <tr className="hover:bg-gray-50">
                                        <td className="px-3 py-2 text-left font-medium text-gray-900 border-r bg-green-50">EBITDA Margin (%)</td>
                                        {filteredProjections.map((row) => (
                                          <td key={row.yearLabel} className="px-3 py-2 text-center text-green-700 border-r">
                                            {row.ebitdaMargin?.toFixed(1)}
                                          </td>
                                        ))}
                                      </tr>

                                      {/* Net Income Row */}
                                      <tr className="hover:bg-gray-50">
                                        <td className="px-3 py-2 text-left font-medium text-gray-900 border-r bg-blue-50">Net Income ($M)</td>
                                        {filteredProjections.map((row) => (
                                          <td key={row.yearLabel} className="px-3 py-2 text-center text-gray-900 border-r">
                                            {row.netIncome?.toFixed(1)}
                                          </td>
                                        ))}
                                      </tr>

                                      {/* Net Income Margin Row */}
                                      <tr className="hover:bg-gray-50">
                                        <td className="px-3 py-2 text-left font-medium text-gray-900 border-r bg-green-50">Net Income Margin (%)</td>
                                        {filteredProjections.map((row) => (
                                          <td key={row.yearLabel} className="px-3 py-2 text-center text-green-700 border-r">
                                            {row.netIncomeMargin?.toFixed(1)}
                                          </td>
                                        ))}
                                      </tr>

                                      {/* EPS Row */}
                                      <tr className="hover:bg-gray-50">
                                        <td className="px-3 py-2 text-left font-medium text-gray-900 border-r bg-blue-50">EPS ($)</td>
                                        {filteredProjections.map((row) => (
                                          <td key={row.yearLabel} className="px-3 py-2 text-center text-gray-900 border-r">
                                            ${row.eps?.toFixed(2)}
                                          </td>
                                        ))}
                                      </tr>

                                      {/* FCF Row */}
                                      <tr className="hover:bg-gray-50">
                                        <td className="px-3 py-2 text-left font-medium text-gray-900 border-r bg-blue-50">FCF ($M)</td>
                                        {filteredProjections.map((row) => (
                                          <td key={row.yearLabel} className="px-3 py-2 text-center text-gray-900 border-r">
                                            {row.fcf?.toFixed(1)}
                                          </td>
                                        ))}
                                      </tr>

                                      {/* FCF Margin Row */}
                                      <tr className="hover:bg-gray-50">
                                        <td className="px-3 py-2 text-left font-medium text-gray-900 border-r bg-green-50">FCF Margin (%)</td>
                                        {filteredProjections.map((row) => (
                                          <td key={row.yearLabel} className="px-3 py-2 text-center text-green-700 border-r">
                                            {row.fcfMargin?.toFixed(1)}
                                          </td>
                                        ))}
                                      </tr>
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {valuation.method === 'dcf' && (
                      <div>
                        <h3 className="text-lg font-semibold mb-4 text-gray-800">DCF Valuation</h3>
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                          {(() => {
                            const discount = typeof valuation.discountRate === 'number' ? valuation.discountRate : null;
                            const terminal = typeof valuation.terminalGrowth === 'number' ? valuation.terminalGrowth : null;
                            const fairValueM = typeof valuation.fairValue === 'number' ? valuation.fairValue : null; // $M
                            const marketCap = valuation.sourceMetrics?.marketCap || 0; // $
                            const marketCapM = marketCap ? marketCap / 1_000_000 : 0; // $M
                            const upsidePct = typeof valuation.upside === 'number' ? valuation.upside : null;
                            const cagrPct = typeof valuation.cagr === 'number' ? valuation.cagr : null;
                            const currentPrice = typeof valuation.currentSharePrice === 'number' ? valuation.currentSharePrice : null;
                            const impliedPrice = currentPrice != null && upsidePct != null ? currentPrice * (1 + upsidePct / 100) : null;

                            if (fairValueM && marketCapM) {
                              return (
                                <div className="space-y-4">
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                    <div className="bg-white border border-blue-200 p-3 rounded-lg">
                                      <div className="text-gray-600 text-xs font-medium uppercase tracking-wide mb-1">Discount Rate</div>
                                      <div className="text-lg font-semibold text-gray-900">{discount != null ? `${discount.toFixed(1)}%` : '—'}</div>
                                    </div>
                                    <div className="bg-white border border-blue-200 p-3 rounded-lg">
                                      <div className="text-gray-600 text-xs font-medium uppercase tracking-wide mb-1">Terminal Growth</div>
                                      <div className="text-lg font-semibold text-gray-900">{terminal != null ? `${terminal.toFixed(1)}%` : '—'}</div>
                                    </div>
                                    <div className="bg-white border border-blue-200 p-3 rounded-lg">
                                      <div className="text-gray-600 text-xs font-medium uppercase tracking-wide mb-1">Fair Value</div>
                                      <div className="text-lg font-semibold text-gray-900">${fairValueM.toFixed(1)}M</div>
                                    </div>
                                    <div className="bg-white border border-blue-200 p-3 rounded-lg">
                                      <div className="text-gray-600 text-xs font-medium uppercase tracking-wide mb-1">Current Market Cap</div>
                                      <div className="text-lg font-semibold text-gray-900">${marketCapM.toFixed(1)}M</div>
                                    </div>
                                  </div>

                                  <div className="bg-blue-100 border border-blue-200 p-4 rounded-lg">
                                    <div className="text-blue-800 font-medium mb-2">Upside Calculation</div>
                                    <div className="text-sm text-blue-700 font-mono">
                                      <span>(${fairValueM.toFixed(1)}M − ${marketCapM.toFixed(1)}M) ÷ ${marketCapM.toFixed(1)}M × 100 = {upsidePct != null ? `${upsidePct.toFixed(1)}%` : '—'}</span>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                                    <div>
                                      <span className="text-gray-600">Upside:</span>
                                      <div className={`font-medium ${upsidePct != null && upsidePct >= 0 ? 'text-green-600' : 'text-red-600'}`}>{upsidePct != null ? `${upsidePct.toFixed(1)}%` : '—'}</div>
                                    </div>
                                    <div>
                                      <span className="text-gray-600">5-Year CAGR:</span>
                                      <div className="font-medium text-blue-600">{cagrPct != null ? `${cagrPct.toFixed(1)}%` : '—'}</div>
                                    </div>
                                    {impliedPrice != null && (
                                      <div>
                                        <span className="text-gray-600">Implied Fair Share Price:</span>
                                        <div className="font-medium text-green-700">${currentPrice.toFixed(2)} × {(1 + (upsidePct / 100)).toFixed(4)} = ${impliedPrice.toFixed(2)}</div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            }

                            // Fallback to server-provided text if numbers are missing
                            if (valuation.sections?.fairValueCalculation) {
                              return (
                                <div className="prose prose-sm max-w-none">
                                  <div className="whitespace-pre-line text-gray-700">
                                    {valuation.sections.fairValueCalculation.replace(/^Fair Value Calculation:\s*/i, '')}
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      </div>
                    )}

                    {valuation.sections?.exitMultipleValuation && valuation.method === 'exit-multiple' && (
                      <div>
                        <h3 className="text-lg font-semibold mb-4 text-gray-800">Exit Multiple Valuation</h3>
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                          {/* Show only the relevant calculation math */}
                          {valuation.exitMultipleCalculation && (
                            <div className="space-y-4">
                              <div className="bg-white border border-green-200 rounded-lg p-4">
                                <h4 className="font-semibold text-green-800 text-base mb-3">Calculation Breakdown</h4>
                                {/* Dynamic step-by-step based on multiple type */}
                                {(() => {
                                  const calc = valuation.exitMultipleCalculation;
                                  const type = calc?.type;
                                  const multiple = calc?.multiple;
                                  const proj = Array.isArray(valuation.projections) && valuation.projections.length > 0
                                    ? valuation.projections[valuation.projections.length - 1]
                                    : null;
                                  const currentEV = valuation.sourceMetrics?.enterpriseValue || 0; // in $M
                                  const currentPrice = valuation.currentSharePrice || 0;
                                  const upsidePct = typeof valuation.upside === 'number' ? valuation.upside : 0;
                                  const impliedPrice = currentPrice && (typeof upsidePct === 'number')
                                    ? currentPrice * (1 + upsidePct / 100)
                                    : 0;

                                  if (type === 'EV/EBITDA' && proj) {
                                    const metric = proj.ebitda || 0; // $M
                                    const fairEV = metric * (multiple || 0); // $M
                                    return (
                                      <div className="space-y-3 text-sm">
                                        <div className="grid grid-cols-2 gap-4">
                                          <div className="bg-gray-50 p-3 rounded-lg">
                                            <div className="text-gray-600 text-xs font-medium uppercase tracking-wide mb-1">2029 EBITDA</div>
                                            <div className="text-lg font-semibold text-gray-900">${metric.toFixed(1)}M</div>
                                          </div>
                                          <div className="bg-gray-50 p-3 rounded-lg">
                                            <div className="text-gray-600 text-xs font-medium uppercase tracking-wide mb-1">Multiple</div>
                                            <div className="text-lg font-semibold text-gray-900">{multiple}x</div>
                                          </div>
                                        </div>

                                        <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
                                          <div className="text-blue-800 font-medium mb-2">Fair Enterprise Value Calculation</div>
                                          <div className="text-sm text-blue-700">
                                            <span className="font-mono">${metric.toFixed(1)}M × {multiple} = ${fairEV.toFixed(1)}M</span>
                                          </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                          <div className="bg-gray-50 p-3 rounded-lg">
                                            <div className="text-gray-600 text-xs font-medium uppercase tracking-wide mb-1">Current EV</div>
                                            <div className="text-lg font-semibold text-gray-900">${currentEV.toFixed(1)}M</div>
                                          </div>
                                          <div className="bg-gray-50 p-3 rounded-lg">
                                            <div className="text-gray-600 text-xs font-medium uppercase tracking-wide mb-1">Upside</div>
                                            <div className={`text-lg font-semibold ${valuation.upside >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                              {valuation.upside?.toFixed(1)}%
                                            </div>
                                          </div>
                                        </div>

                                        <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
                                          <div className="text-green-800 font-medium mb-2">Implied Fair Share Price</div>
                                          <div className="text-sm text-green-700">
                                            <span className="font-mono">${currentPrice.toFixed(2)} × {(1 + (upsidePct / 100)).toFixed(4)} = ${impliedPrice.toFixed(2)}</span>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  }
                                  if (type === 'EV/FCF' && proj) {
                                    const metric = proj.freeCashFlow || 0; // $M
                                    const fairEV = metric * (multiple || 0); // $M
                                    return (
                                      <div className="space-y-3 text-sm">
                                        <div className="grid grid-cols-2 gap-4">
                                          <div className="bg-gray-50 p-3 rounded-lg">
                                            <div className="text-gray-600 text-xs font-medium uppercase tracking-wide mb-1">2029 FCF</div>
                                            <div className="text-lg font-semibold text-gray-900">${metric.toFixed(1)}M</div>
                                          </div>
                                          <div className="bg-gray-50 p-3 rounded-lg">
                                            <div className="text-gray-600 text-xs font-medium uppercase tracking-wide mb-1">Multiple</div>
                                            <div className="text-lg font-semibold text-gray-900">{multiple}x</div>
                                          </div>
                                        </div>

                                        <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
                                          <div className="text-blue-800 font-medium mb-2">Fair Enterprise Value Calculation</div>
                                          <div className="text-sm text-blue-700">
                                            <span className="font-mono">${metric.toFixed(1)}M × {multiple} = ${fairEV.toFixed(1)}M</span>
                                          </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                          <div className="bg-gray-50 p-3 rounded-lg">
                                            <div className="text-gray-600 text-xs font-medium uppercase tracking-wide mb-1">Current EV</div>
                                            <div className="text-lg font-semibold text-gray-900">${currentEV.toFixed(1)}M</div>
                                          </div>
                                          <div className="bg-gray-50 p-3 rounded-lg">
                                            <div className="text-gray-600 text-xs font-medium uppercase tracking-wide mb-1">Upside</div>
                                            <div className={`text-lg font-semibold ${valuation.upside >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                              {valuation.upside?.toFixed(1)}%
                                            </div>
                                          </div>
                                        </div>

                                        <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
                                          <div className="text-green-800 font-medium mb-2">Implied Fair Share Price</div>
                                          <div className="text-sm text-green-700">
                                            <span className="font-mono">${currentPrice.toFixed(2)} × {(1 + (upsidePct / 100)).toFixed(4)} = ${impliedPrice.toFixed(2)}</span>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  }
                                  if (type === 'P/E' && proj) {
                                    const eps = proj.eps || 0;
                                    const fairPrice = eps * (multiple || 0);
                                    return (
                                      <div className="space-y-3 text-sm">
                                        <div className="grid grid-cols-2 gap-4">
                                          <div className="bg-gray-50 p-3 rounded-lg">
                                            <div className="text-gray-600 text-xs font-medium uppercase tracking-wide mb-1">2029 EPS</div>
                                            <div className="text-lg font-semibold text-gray-900">${eps.toFixed(2)}</div>
                                          </div>
                                          <div className="bg-gray-50 p-3 rounded-lg">
                                            <div className="text-gray-600 text-xs font-medium uppercase tracking-wide mb-1">Multiple</div>
                                            <div className="text-lg font-semibold text-gray-900">{multiple}x</div>
                                          </div>
                                        </div>

                                        <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
                                          <div className="text-blue-800 font-medium mb-2">Fair Price Calculation</div>
                                          <div className="text-sm text-blue-700">
                                            <span className="font-mono">${eps.toFixed(2)} × {multiple} = ${fairPrice.toFixed(2)}</span>
                                          </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                          <div className="bg-gray-50 p-3 rounded-lg">
                                            <div className="text-gray-600 text-xs font-medium uppercase tracking-wide mb-1">Current Price</div>
                                            <div className="text-lg font-semibold text-gray-900">${currentPrice.toFixed(2)}</div>
                                          </div>
                                          <div className="bg-gray-50 p-3 rounded-lg">
                                            <div className="text-gray-600 text-xs font-medium uppercase tracking-wide mb-1">Upside</div>
                                            <div className={`text-lg font-semibold ${valuation.upside >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                              {valuation.upside?.toFixed(1)}%
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  }
                                  // Fallback to server-provided calculation text
                                  return (
                                    <div className="whitespace-pre-line text-sm text-gray-700 font-mono">
                                      {valuation.exitMultipleCalculation.calculationDetails}
                                    </div>
                                  );
                                })()}

                                {/* Key metrics summary */}
                                <div className="mt-4 pt-4 border-t border-green-200">
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                    <div>
                                      <span className="text-gray-600">Exit Multiple Type:</span>
                                      <div className="font-medium">{valuation.exitMultipleCalculation.type}</div>
                                    </div>
                                    <div>
                                      <span className="text-gray-600">Multiple Value:</span>
                                      <div className="font-medium">{valuation.exitMultipleCalculation.multiple}x</div>
                                    </div>
                                    <div>
                                      <span className="text-gray-600">Calculated Upside:</span>
                                      <div className="font-medium text-green-600">{valuation.upside?.toFixed(1)}%</div>
                                    </div>
                                    <div>
                                      <span className="text-gray-600">5-Year CAGR:</span>
                                      <div className="font-medium text-blue-600">{valuation.cagr?.toFixed(1)}%</div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Fallback to raw text if no calculation details */}
                          {!valuation.exitMultipleCalculation && (
                            <div className="prose prose-sm max-w-none">
                              <div className="whitespace-pre-line text-gray-700">
                                {valuation.sections.exitMultipleValuation
                                  .replace(/^Exit Multiple Valuation:\s*/i, '') // Remove header
                                }
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Only show assumptions here, not the full forecast text */}
                    {valuation.sections?.assumptions && (
                      <div>
                        <h3 className="text-lg font-semibold mb-4 text-gray-800">Assumptions and Justifications</h3>
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                          <div className="prose prose-sm max-w-none">
                            <div className="text-gray-700 leading-relaxed">
                              {valuation.sections.assumptions
                                .replace(/^Assumptions and Justifications:\s*/i, '') // Remove header
                                .split('\n').map((line, index) => {
                                  if (line.trim() === '') {
                                    return <div key={index} className="h-3"></div>;
                                  } else {
                                    return (
                                      <div key={index} className="mb-2">
                                        {line}
                                      </div>
                                    );
                                  }
                                })}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="analysis">
              <Card>
                <CardHeader>
                  <CardTitle>Financial Analysis</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {(valuation.sonar || valuation.latestDevelopments) && (
                      <div>
                        <h3 className="text-lg font-semibold mb-4 text-gray-800">Latest Developments & Insights</h3>
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                          <div className="prose prose-sm max-w-none">
                            <div className="text-gray-700 leading-relaxed">
                              {(() => {
                                const sonarText = valuation.sonar
                                  ? [valuation.sonar.mgmt_summary, valuation.sonar.guidance_summary, valuation.sonar.recent_developments]
                                    .filter(Boolean)
                                    .join('\n\n')
                                  : valuation.latestDevelopments || '';
                                return sonarText.split('\n').map((line, index) => (
                                  line.trim() === '' ? <div key={index} className="h-3"></div> : <div key={index} className="mb-2">{line}</div>
                                ));
                              })()}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Debug info removed */}

                    {/* Historical Financials Section */}
                    <div className="mt-8">
                      <h3 className="text-xl font-bold mb-4 text-gray-800">Historical Financials (FY21-FY24)</h3>

                      {/* Historical Charts */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                        {/* Revenue & Growth Chart */}
                        <div>
                          <h4 className="text-md font-semibold mb-3 text-gray-700">Revenue & Growth</h4>
                          <ResponsiveContainer width="100%" height={300}>
                            {(() => {
                              const histChartData = getSortedHistorical(valuation.historicalFinancials || []).map((h, i) => ({
                                ...h,
                                revenueGrowth: i === 0 ? undefined : h.revenueGrowth,
                              }));
                              return (
                                <ComposedChart data={histChartData}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                  <XAxis dataKey="year" stroke="#6b7280" />
                                  <YAxis yAxisId="left" stroke="#3b82f6" />
                                  <YAxis yAxisId="right" orientation="right" stroke="#10b981" />
                                  <Tooltip
                                    formatter={(value, name) => [
                                      (typeof name === 'string' && name.toLowerCase().includes('growth')) ? `${formatOneDecimal(value)}%` : `$${formatOneDecimal(value)}M`,
                                      name
                                    ]}
                                  />
                                  <Legend />
                                  <Bar yAxisId="left" dataKey="revenue" fill="#3b82f6" name="Revenue ($M)" />
                                  <Line yAxisId="right" type="monotone" dataKey="revenueGrowth" stroke="#10b981" strokeWidth={2} name="Revenue Growth (%)" />
                                </ComposedChart>
                              );
                            })()}
                          </ResponsiveContainer>
                        </div>

                        {/* Margins Chart */}
                        <div>
                          <h4 className="text-md font-semibold mb-3 text-gray-700">Margins (%)</h4>
                          <ResponsiveContainer width="100%" height={300}>
                            <LineChart data={getSortedHistorical(valuation.historicalFinancials)}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                              <XAxis dataKey="year" stroke="#6b7280" />
                              <YAxis stroke="#6b7280" />
                              <Tooltip formatter={(value, name) => [`${formatOneDecimal(value)}%`, name]} />
                              <Legend />
                              <Line type="monotone" dataKey="grossMargin" stroke="#8b5cf6" strokeWidth={2} name="Gross Margin (%)" />
                              <Line type="monotone" dataKey="ebitdaMargin" stroke="#f59e0b" strokeWidth={2} name="EBITDA Margin (%)" />
                              <Line type="monotone" dataKey="fcfMargin" stroke="#ef4444" strokeWidth={2} name="FCF Margin (%)" />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>

                        {/* Profitability Chart */}
                        <div>
                          <h4 className="text-md font-semibold mb-3 text-gray-700">Profitability</h4>
                          <ResponsiveContainer width="100%" height={300}>
                            <ComposedChart data={getSortedHistorical(valuation.historicalFinancials)}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                              <XAxis dataKey="year" stroke="#6b7280" />
                              <YAxis yAxisId="left" stroke="#3b82f6" />
                              <YAxis yAxisId="right" orientation="right" stroke="#10b981" />
                              <Tooltip
                                formatter={(value, name) => [
                                  (typeof name === 'string' && name.toLowerCase().includes('margin')) ? `${formatOneDecimal(value)}%` : `$${formatOneDecimal(value)}M`,
                                  name
                                ]}
                              />
                              <Legend />
                              <Bar yAxisId="left" dataKey="netIncome" fill="#3b82f6" name="Net Income ($M)" />
                              <Line yAxisId="right" type="monotone" dataKey="netIncomeMargin" stroke="#10b981" strokeWidth={2} name="Net Income Margin (%)" />
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>

                        {/* Cash Flow Chart */}
                        <div>
                          <h4 className="text-md font-semibold mb-3 text-gray-700">Cash Flow</h4>
                          <ResponsiveContainer width="100%" height={300}>
                            <ComposedChart data={getSortedHistorical(valuation.historicalFinancials)}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                              <XAxis dataKey="year" stroke="#6b7280" />
                              <YAxis yAxisId="left" stroke="#3b82f6" />
                              <YAxis yAxisId="right" orientation="right" stroke="#10b981" />
                              <Tooltip
                                formatter={(value, name) => [
                                  (typeof name === 'string' && name.toLowerCase().includes('margin')) ? `${formatOneDecimal(value)}%` : `$${formatOneDecimal(value)}M`,
                                  name
                                ]}
                              />
                              <Legend />
                              <Bar yAxisId="left" dataKey="fcf" fill="#3b82f6" name="FCF ($M)" />
                              <Line yAxisId="right" type="monotone" dataKey="fcfMargin" stroke="#10b981" strokeWidth={2} name="FCF Margin (%)" />
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>

                        {/* EPS Chart */}
                        <div>
                          <h4 className="text-md font-semibold mb-3 text-gray-700">EPS</h4>
                          <ResponsiveContainer width="100%" height={300}>
                            <LineChart data={getSortedHistorical(valuation.historicalFinancials)}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                              <XAxis dataKey="year" stroke="#6b7280" />
                              <YAxis stroke="#6b7280" />
                              <Tooltip formatter={(value) => [`$${formatOneDecimal(value)}`, 'EPS']} />
                              <Legend />
                              <Line type="monotone" dataKey="eps" stroke="#ec4899" strokeWidth={2} name="EPS ($)" />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* Historical Summary Table */}
                      <div className="mt-6">
                        <h4 className="text-lg font-semibold mb-3 text-gray-700">Historical Summary Table</h4>
                        <div className="overflow-x-auto">
                          <table className="min-w-full bg-white border border-gray-300 rounded-lg">
                            <thead>
                              <tr className="bg-gray-50">
                                <th className="px-3 py-2 text-left font-medium text-gray-900 border-r">Metric</th>
                                {getSortedHistorical(valuation.historicalFinancials)?.map((row, index) => (
                                  <th key={index} className="px-3 py-2 text-center font-medium text-gray-900 border-r">
                                    {row.year}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {/* Revenue Row */}
                              <tr>
                                <td className="px-3 py-2 text-left font-medium text-gray-900 border-r bg-blue-50">Revenue ($M)</td>
                                {getSortedHistorical(valuation.historicalFinancials)?.map((row, index) => (
                                  <td key={index} className="px-3 py-2 text-center border-r">
                                    {row.revenue?.toFixed(1)}
                                  </td>
                                ))}
                              </tr>

                              {/* Revenue Growth Row */}
                              <tr>
                                <td className="px-3 py-2 text-left font-medium text-gray-900 border-r bg-green-50">Revenue Growth (%)</td>
                                {getSortedHistorical(valuation.historicalFinancials)?.map((row, index) => (
                                  <td key={index} className="px-3 py-2 text-center border-r">
                                    {index === 0 ? 'NA' : row.revenueGrowth?.toFixed(1)}
                                  </td>
                                ))}
                              </tr>

                              {/* Gross Profit Row */}
                              <tr>
                                <td className="px-3 py-2 text-left font-medium text-gray-900 border-r bg-blue-50">Gross Profit ($M)</td>
                                {getSortedHistorical(valuation.historicalFinancials)?.map((row, index) => (
                                  <td key={index} className="px-3 py-2 text-center border-r">
                                    {row.grossProfit?.toFixed(1)}
                                  </td>
                                ))}
                              </tr>

                              {/* Gross Margin Row */}
                              <tr>
                                <td className="px-3 py-2 text-left font-medium text-gray-900 border-r bg-green-50">Gross Margin (%)</td>
                                {getSortedHistorical(valuation.historicalFinancials)?.map((row, index) => (
                                  <td key={index} className="px-3 py-2 text-center border-r">
                                    {row.grossMargin?.toFixed(1)}
                                  </td>
                                ))}
                              </tr>

                              {/* EBITDA Row */}
                              <tr>
                                <td className="px-3 py-2 text-left font-medium text-gray-900 border-r bg-blue-50">EBITDA ($M)</td>
                                {getSortedHistorical(valuation.historicalFinancials)?.map((row, index) => (
                                  <td key={index} className="px-3 py-2 text-center border-r">
                                    {row.ebitda?.toFixed(1)}
                                  </td>
                                ))}
                              </tr>

                              {/* EBITDA Margin Row */}
                              <tr>
                                <td className="px-3 py-2 text-left font-medium text-gray-900 border-r bg-green-50">EBITDA Margin (%)</td>
                                {getSortedHistorical(valuation.historicalFinancials)?.map((row, index) => (
                                  <td key={index} className="px-3 py-2 text-center border-r">
                                    {row.ebitdaMargin?.toFixed(1)}
                                  </td>
                                ))}
                              </tr>

                              {/* Net Income Row */}
                              <tr>
                                <td className="px-3 py-2 text-left font-medium text-gray-900 border-r bg-blue-50">Net Income ($M)</td>
                                {getSortedHistorical(valuation.historicalFinancials)?.map((row, index) => (
                                  <td key={index} className="px-3 py-2 text-center border-r">
                                    {row.netIncome?.toFixed(1)}
                                  </td>
                                ))}
                              </tr>

                              {/* Net Income Margin Row */}
                              <tr>
                                <td className="px-3 py-2 text-left font-medium text-gray-900 border-r bg-green-50">Net Income Margin (%)</td>
                                {getSortedHistorical(valuation.historicalFinancials)?.map((row, index) => (
                                  <td key={index} className="px-3 py-2 text-center border-r">
                                    {row.netIncomeMargin?.toFixed(1)}
                                  </td>
                                ))}
                              </tr>

                              {/* EPS Row */}
                              <tr>
                                <td className="px-3 py-2 text-left font-medium text-gray-900 border-r bg-blue-50">EPS ($)</td>
                                {getSortedHistorical(valuation.historicalFinancials)?.map((row, index) => (
                                  <td key={index} className="px-3 py-2 text-center border-r">
                                    {row.eps?.toFixed(2)}
                                  </td>
                                ))}
                              </tr>

                              {/* FCF Row */}
                              <tr>
                                <td className="px-3 py-2 text-left font-medium text-gray-900 border-r bg-blue-50">FCF ($M)</td>
                                {getSortedHistorical(valuation.historicalFinancials)?.map((row, index) => (
                                  <td key={index} className="px-3 py-2 text-center border-r">
                                    {row.fcf?.toFixed(1)}
                                  </td>
                                ))}
                              </tr>

                              {/* FCF Margin Row */}
                              <tr>
                                <td className="px-3 py-2 text-left font-medium text-gray-900 border-r bg-green-50">FCF Margin (%)</td>
                                {getSortedHistorical(valuation.historicalFinancials)?.map((row, index) => (
                                  <td key={index} className="px-3 py-2 text-center border-r">
                                    {row.fcfMargin?.toFixed(1)}
                                  </td>
                                ))}
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>

                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <AgentFlowGraph
            valuation={valuation}
            isOpen={showResearchTrail}
            onToggle={() => setShowResearchTrail(!showResearchTrail)}
          />

          <div className="flex gap-4">
            <Button onClick={downloadExcel} disabled={!valuation}>
              Download Excel
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowFeedbackForm(!showFeedbackForm)}
              disabled={!valuation}
            >
              Provide Feedback
            </Button>
          </div>

          {showFeedbackForm && (
            <Card>
              <CardHeader>
                <CardTitle>Provide Feedback</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleFeedbackSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Feedback (e.g., adjust growth rates, margins, assumptions)
                    </label>
                    <textarea
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      className="w-full p-3 border rounded-lg"
                      rows={4}
                      placeholder="Enter your feedback here..."
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" disabled={feedbackLoading}>
                      {feedbackLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Regenerating...
                        </>
                      ) : (
                        'Regenerate Valuation'
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowFeedbackForm(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
} 
