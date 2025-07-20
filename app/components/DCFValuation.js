'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function DCFValuation() {
  const [ticker, setTicker] = useState('');
  const [method, setMethod] = useState('dcf');
  const [selectedMultiple, setSelectedMultiple] = useState('auto');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [valuation, setValuation] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [feedbackLoading, setFeedbackLoading] = useState(false);

  // Debug effect to log valuation changes
  useEffect(() => {
    if (valuation) {
      console.log('Valuation state updated:', {
        valuation: valuation,
        analysis: valuation.analysis,
        projections: valuation.projections,
        assumptions: valuation.assumptions,
        hasExcelData: !!valuation.excelData
      });
    }
  }, [valuation]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setValuation(null);

    if (!ticker) {
      setError('Please enter a ticker symbol');
      setLoading(false);
      return;
    }

    try {
      console.log('Fetching valuation for:', { ticker, method, selectedMultiple });
      const response = await fetch(`/api/dcf-valuation?ticker=${ticker}&method=${method}&multiple=${selectedMultiple}`);
      let data;
      
      try {
        data = await response.json();
        console.log('Raw API Response:', data);
      } catch (jsonError) {
        console.error('Failed to parse JSON response:', jsonError);
        throw new Error('Unable to process server response. Please try again later.');
      }

      if (!response.ok) {
        // Handle specific error cases
        if (response.status === 404) {
          throw new Error(`Unable to find data for ${ticker}. Please verify the ticker symbol and try again.`);
        } else if (response.status === 429) {
          throw new Error('Too many requests. Please wait a minute and try again.');
        } else if (response.status === 500) {
          if (data.error?.includes('JSON')) {
            throw new Error('Unable to process the valuation data. Please try again.');
          } else {
            throw new Error(data.error || 'Server error occurred. Please try again later.');
          }
        } else {
          throw new Error(data.error || 'Failed to generate valuation. Please try again.');
        }
      }

      console.log('API Response:', data);

      // Log the detailed structure of the raw data
      console.log('Raw data structure:', {
        hasRawForecast: !!data.rawForecast,
        hasFinancialAnalysis: !!data.rawFinancialAnalysis,
        hasSections: !!data.sections,
        sections: Object.keys(data.sections || {}),
        companyName: data.companyName,
        method: data.method,
        fairValue: data.fairValue
      });

      // Validate the raw data structure
      if (!data.rawForecast) {
        console.error('Missing raw forecast data');
        throw new Error('Invalid data structure: Missing forecast data');
      }

      // Set the raw data directly
      setValuation(data);
    } catch (err) {
      console.error('Error in handleSubmit:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFeedbackSubmit = async (e) => {
    e.preventDefault();
    if (!feedback.trim()) {
      setError('Please provide feedback');
      return;
    }

    setFeedbackLoading(true);
    setError(null);

    try {
      console.log('Submitting feedback for:', { ticker, method, selectedMultiple, feedback });
      const response = await fetch(`/api/dcf-valuation?ticker=${ticker}&method=${method}&multiple=${selectedMultiple}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ feedback }),
      });

      let data;
      try {
        data = await response.json();
      } catch (jsonError) {
        throw new Error('Unable to process server response. Please try again later.');
      }

      if (!response.ok) {
        throw new Error(data.error || 'Failed to regenerate valuation with feedback');
      }

      // Set the new valuation - handle both direct response and nested response
      const newValuation = data.valuation || data;
      setValuation(newValuation);
      setFeedback('');
      setShowFeedbackForm(false);
    } catch (err) {
      console.error('Error in handleFeedbackSubmit:', err);
      setError(err.message);
    } finally {
      setFeedbackLoading(false);
    }
  };

  const downloadExcel = () => {
    if (!valuation) {
      console.error('No valuation data available');
      return;
    }

    console.log('Generating Excel with valuation data:', valuation);

    const workbook = XLSX.utils.book_new();
    
    // Create Summary sheet
    const summaryData = [
      ['Valuation Summary'],
      ['Company', valuation.companyName],
      ['Method', valuation.method],
      ['Fair Value', valuation.method === 'exit-multiple' 
        ? `$${valuation.fairValue?.toFixed(2)} per share`
        : `$${valuation.fairValue?.toLocaleString()} million`
      ],
      ['Upside', `${valuation.upside?.toFixed(1) || 0}%`],
      ['Upside CAGR', `${valuation.cagr?.toFixed(1) || 0}%`],
      ['Confidence', valuation.confidence || 'Medium'],
      []
    ];

    // Add method-specific data
    if (valuation.method === 'dcf') {
      summaryData.push(
        ['DCF Assumptions'],
        ['Discount Rate', `${valuation.discountRate}%`],
        ['Terminal Growth Rate', `${valuation.terminalGrowth}%`]
      );
    } else if (valuation.method === 'exit-multiple') {
      summaryData.push(
        ['Exit Multiple Assumptions'],
        ['Exit Multiple Type', valuation.exitMultipleType],
        ['Exit Multiple Value', `${valuation.exitMultipleValue}x`],
        ['Current Share Price', `$${valuation.currentSharePrice?.toFixed(2)}`]
      );
    }

    const sheets = [{
      name: 'Summary',
      data: summaryData
    }];

    // Create Projections sheet
    if (valuation.tableData && valuation.tableData.length > 0) {
      const projectionHeaders = ['Year', 'Revenue ($M)', 'Revenue Growth (%)', 'Gross Margin (%)', 'EBITDA Margin (%)', 'FCF Margin (%)', 'Net Income ($M)'];
      
      if (valuation.method === 'exit-multiple') {
        projectionHeaders.push('EPS');
      }
      
      const projectionData = valuation.tableData.map(row => {
        const baseRow = [
          row.year,
          row.revenue?.toLocaleString(),
          row.revenueGrowth?.toFixed(1),
          row.grossMargin?.toFixed(1),
          row.ebitdaMargin?.toFixed(1),
          row.fcfMargin?.toFixed(1),
          row.netIncome?.toLocaleString()
        ];
        
        if (valuation.method === 'exit-multiple') {
          baseRow.push(row.eps?.toFixed(2));
        }
        
        return baseRow;
      });

      sheets.push({
        name: 'Projections',
        data: [projectionHeaders, ...projectionData]
      });
    }

    // Create Analysis sheet
    const analysisData = [];
    
    if (valuation.sections?.financialAnalysis) {
      // Truncate financial analysis to first few lines
      const truncatedAnalysis = valuation.sections.financialAnalysis
        .split('\n')
        .slice(0, 10) // Take first 10 lines
        .join('\n');
      
      analysisData.push(
        ['Financial Analysis'],
        [truncatedAnalysis],
        []
      );
    }
    
    if (valuation.sections?.assumptions) {
      // Truncate assumptions to first few lines
      const truncatedAssumptions = valuation.sections.assumptions
        .split('\n')
        .slice(0, 8) // Take first 8 lines
        .join('\n');
      
      analysisData.push(
        ['Assumptions and Justifications'],
        [truncatedAssumptions]
      );
    }

    if (analysisData.length > 0) {
      sheets.push({
        name: 'Analysis',
        data: analysisData
      });
    }

    // Create Excel file
    sheets.forEach(sheet => {
      const worksheet = XLSX.utils.aoa_to_sheet(sheet.data);
      XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
    });

    // Download the file
    const fileName = `${valuation.companyName}_Valuation_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  // Helper function to safely access nested values
  const getNestedValue = (obj, path, defaultValue = 'N/A') => {
    try {
      const value = path.split('.').reduce((acc, part) => acc?.[part], obj);
      if (value === undefined || value === null) return defaultValue;
      
      // Convert numeric strings to numbers
      if (typeof value === 'string' && !isNaN(parseFloat(value))) {
        return parseFloat(value);
      }
      return value;
    } catch (error) {
      console.error(`Error accessing path ${path}:`, error);
      return defaultValue;
    }
  };

  // Helper function to format currency values
  const formatCurrency = (value) => {
    if (typeof value !== 'number' || isNaN(value)) return 'N/A';
    return `$${value.toFixed(2)}`;
  };

  // Helper function to format values in millions
  const formatMillions = (value) => {
    if (typeof value !== 'number' || isNaN(value)) return 'N/A';
    return `$${(value).toFixed(1)}M`;
  };

  // Helper function to format Fair EV values in millions (multiply by 1000 for dashboard display)
  const formatFairEVMillions = (value) => {
    if (typeof value !== 'number' || isNaN(value)) return 'N/A';
    return `$${(value * 1000).toFixed(1)}M`;
  };

  // Helper function to format Current EV values in millions
  const formatCurrentEVMillions = (value) => {
    if (typeof value !== 'number' || isNaN(value)) return 'N/A';
    return `$${(value).toFixed(1)}M`;
  };

  // Helper function to calculate CAGR
  const calculateCAGR = (currentPrice, fairValue, years = 5) => {
    if (!currentPrice || !fairValue || currentPrice <= 0 || fairValue <= 0) return 0;
    return (Math.pow(fairValue / currentPrice, 1 / years) - 1) * 100;
  };

  // Helper function to format percentage values
  const formatPercentage = (value) => {
    if (typeof value !== 'number' || isNaN(value)) return 'N/A';
    return `${value.toFixed(1)}%`;
  };

  // Helper function to format percentage values for DCF (expects decimal values)
  const formatDCFPercentage = (value) => {
    if (typeof value !== 'number' || isNaN(value)) return 'N/A';
    return `${(value * 100).toFixed(1)}%`;
  };

  // Helper function to format percentage values for exit-multiple (expects raw percentage values)
  const formatExitMultiplePercentage = (value) => {
    if (typeof value !== 'number' || isNaN(value)) return 'N/A';
    return `${value.toFixed(1)}%`;
  };

  // Helper function to format multiple values
  const formatMultiple = (value) => {
    if (typeof value !== 'number' || isNaN(value)) return 'N/A';
    return `${value.toFixed(1)}x`;
  };

  // Helper function to determine if we should show EV-based display
  const shouldShowEVDisplay = () => {
    return method === 'exit-multiple' && 
           valuation?.assumptions?.exitMultipleType && 
           (valuation.assumptions.exitMultipleType === 'EV/EBITDA' || 
            valuation.assumptions.exitMultipleType === 'EV/FCF');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
                <SelectItem value="auto">AI Decision (Standard)</SelectItem>
                <SelectItem value="P/E">P/E Multiple</SelectItem>
                <SelectItem value="EV/EBITDA">EV/EBITDA Multiple</SelectItem>
                <SelectItem value="EV/FCF">EV/FCF Multiple</SelectItem>
                <SelectItem value="EV/Sales">EV/Sales Multiple</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Button type="submit" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
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
        <div className="flex justify-center items-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
        </div>
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
                    {valuation.method === 'exit-multiple' 
                      ? `$${valuation.fairValue?.toFixed(2)} per share`
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
                {valuation.method === 'dcf' && (
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
                {valuation.method === 'exit-multiple' && (
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
              </div>
              
              {/* Add CAGR display */}
              <div className="mt-6 pt-6 border-t">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Upside CAGR</h3>
                    <p className="text-xl font-bold text-blue-600">
                      {valuation.cagr?.toFixed(1) || 0}%
                    </p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Confidence</h3>
                    <p className="text-xl font-bold">
                      {valuation.confidence || 'Medium'}
                    </p>
                  </div>
                </div>
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
                    {valuation.sections?.forecastTable && (
                      <div>
                        <h3 className="text-lg font-semibold mb-4 text-gray-800">Financial Projections</h3>
                        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-4 py-3 text-left font-medium text-gray-700">Year</th>
                                  <th className="px-4 py-3 text-right font-medium text-gray-700">Revenue ($M)</th>
                                  <th className="px-4 py-3 text-right font-medium text-gray-700">Growth (%)</th>
                                  <th className="px-4 py-3 text-right font-medium text-gray-700">Gross Margin (%)</th>
                                  <th className="px-4 py-3 text-right font-medium text-gray-700">EBITDA Margin (%)</th>
                                  <th className="px-4 py-3 text-right font-medium text-gray-700">FCF Margin (%)</th>
                                  <th className="px-4 py-3 text-right font-medium text-gray-700">Net Income ($M)</th>
                                  {valuation.method === 'exit-multiple' && (
                                    <th className="px-4 py-3 text-right font-medium text-gray-700">EPS</th>
                                  )}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200">
                                {valuation.tableData?.map((row, index) => (
                                  <tr key={index} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 text-left font-medium text-gray-900">{row.year}</td>
                                    <td className="px-4 py-3 text-right text-gray-900">{row.revenue?.toLocaleString()}</td>
                                    <td className="px-4 py-3 text-right text-gray-600">{row.revenueGrowth?.toFixed(1)}</td>
                                    <td className="px-4 py-3 text-right text-gray-600">{row.grossMargin?.toFixed(1)}</td>
                                    <td className="px-4 py-3 text-right text-gray-600">{row.ebitdaMargin?.toFixed(1)}</td>
                                    <td className="px-4 py-3 text-right text-gray-600">{row.fcfMargin?.toFixed(1)}</td>
                                    <td className="px-4 py-3 text-right text-gray-900">{row.netIncome?.toLocaleString()}</td>
                                    {valuation.method === 'exit-multiple' && (
                                      <td className="px-4 py-3 text-right text-gray-900">${row.eps?.toFixed(2)}</td>
                                    )}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {valuation.sections?.fairValueCalculation && valuation.method === 'dcf' && (
                      <div>
                        <h3 className="text-lg font-semibold mb-4 text-gray-800">Fair Value Calculation</h3>
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                          <div className="prose prose-sm max-w-none">
                            <div className="whitespace-pre-line text-gray-700">
                              {valuation.sections.fairValueCalculation}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {valuation.sections?.exitMultipleValuation && valuation.method === 'exit-multiple' && (
                      <div>
                        <h3 className="text-lg font-semibold mb-4 text-gray-800">Exit Multiple Valuation</h3>
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                          <div className="prose prose-sm max-w-none">
                            <div className="whitespace-pre-line text-gray-700">
                              {valuation.sections.exitMultipleValuation}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {valuation.sections?.assumptions && (
                      <div>
                        <h3 className="text-lg font-semibold mb-4 text-gray-800">Assumptions and Justifications</h3>
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                          <div className="prose prose-sm max-w-none">
                            <div className="text-gray-700 leading-relaxed">
                              {valuation.sections.assumptions.split('\n').map((line, index) => {
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
                    {valuation.sections?.financialAnalysis && (
                      <div>
                        <h3 className="text-lg font-semibold mb-4 text-gray-800">Historical Analysis & Projections</h3>
                        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                          <div className="prose prose-sm max-w-none">
                            {valuation.sections.financialAnalysis.split('\n').map((line, index) => {
                              if (line.startsWith('**') && line.endsWith('**')) {
                                // This is a header - make it bold and add spacing
                                return (
                                  <div key={index} className="mt-4 mb-2">
                                    <h4 className="font-semibold text-purple-800 text-base">
                                      {line.replace(/\*\*/g, '')}
                                    </h4>
                                  </div>
                                );
                              } else if (line.trim() === '') {
                                // Empty line - add spacing
                                return <div key={index} className="h-2"></div>;
                              } else {
                                // Regular text
                                return (
                                  <div key={index} className="text-gray-700 mb-1">
                                    {line}
                                  </div>
                                );
                              }
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

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