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

      // Log the detailed structure of the valuation object
      console.log('Valuation structure:', {
        hasValuation: !!data.valuation,
        hasFairValue: !!data.valuation?.fairValue,
        hasCurrentPrice: !!data.valuation?.currentPrice,
        hasAnalysis: !!data.valuation?.analysis,
        hasProjections: !!data.valuation?.projections,
        hasAssumptions: !!data.valuation?.assumptions,
        analysisKeys: data.valuation?.analysis ? Object.keys(data.valuation.analysis) : [],
        projectionsLength: data.valuation?.projections?.length,
        assumptionsKeys: data.valuation?.assumptions ? Object.keys(data.valuation.assumptions) : []
      });

      // Ensure we have the correct data structure
      if (!data.valuation) {
        console.error('Missing valuation object');
        throw new Error('Invalid valuation data structure: Missing valuation object');
      }

      const { valuation } = data;
      
      if (!valuation.fairValue || !valuation.currentPrice) {
        console.error('Missing required valuation fields');
        throw new Error('Invalid valuation data structure: Missing required valuation fields');
      }

      if (!valuation.analysis || !valuation.analysis.companyOverview || !valuation.analysis.keyDrivers || !valuation.analysis.risks) {
        console.error('Missing required analysis fields');
        throw new Error('Invalid valuation data structure: Missing required analysis fields');
      }

      // Method-specific projections validation
      if (method === 'dcf' || method === 'exit-multiple') {
        if (!valuation.projections || !Array.isArray(valuation.projections) || valuation.projections.length === 0) {
          console.error('Missing or invalid projections');
          throw new Error('Invalid valuation data structure: Missing or invalid projections');
        }
      }

      // Set the valuation state with the correct structure
      setValuation(valuation);
    } catch (err) {
      console.error('Error in handleSubmit:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const downloadExcel = () => {
    if (!valuation?.excelData) {
      console.error('No Excel data available');
      return;
    }

    console.log('Generating Excel with data:', valuation.excelData);

    const workbook = XLSX.utils.book_new();
    
    valuation.excelData.forEach(sheet => {
      const worksheet = XLSX.utils.aoa_to_sheet(sheet.data);
      XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
    });

    XLSX.writeFile(workbook, `${ticker}_valuation.xlsx`);
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
    return `$${(value / 1000).toFixed(1)}M`;
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
              <CardTitle>Valuation Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
                <div>
                  <h3 className="text-sm font-medium text-gray-500">
                    {shouldShowEVDisplay() ? 'Fair EV' : 'Fair Value'}
                  </h3>
                  <p className="text-2xl font-bold">
                    {shouldShowEVDisplay() ? formatMillions(valuation.fairValue) : formatCurrency(valuation.fairValue)}
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">
                    {shouldShowEVDisplay() ? 'Current EV' : 'Current Price'}
                  </h3>
                  <p className="text-2xl font-bold">
                    {shouldShowEVDisplay() ? formatMillions(valuation.currentEV) : formatCurrency(valuation.currentPrice)}
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Upside</h3>
                  <p className="text-2xl font-bold">
                    {formatPercentage(valuation.upside)}
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Confidence</h3>
                  <p className="text-2xl font-bold capitalize">
                    {valuation.confidence}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="projections">
            <TabsList>
              <TabsTrigger value="projections">Projections</TabsTrigger>
              <TabsTrigger value="analysis">Analysis</TabsTrigger>
              <TabsTrigger value="assumptions">Assumptions</TabsTrigger>
            </TabsList>
            <TabsContent value="projections">
              <Card>
                <CardHeader>
                  <CardTitle>
                    Financial Projections
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr>
                          <th className="text-left">Year</th>
                          <th className="text-right">Revenue</th>
                          <th className="text-right">Free Cash Flow</th>
                          {method === 'dcf' ? (
                            <>
                              {valuation.projections?.[0]?.ebitda && (
                                <th className="text-right">EBITDA</th>
                              )}
                              {valuation.projections?.[0]?.capex && (
                                <th className="text-right">Capex</th>
                              )}
                              {valuation.projections?.[0]?.workingCapital && (
                                <th className="text-right">Working Capital</th>
                              )}
                            </>
                          ) : (
                            <>
                              {valuation.projections?.[0]?.ebitda && (
                                <th className="text-right">EBITDA</th>
                              )}
                              {valuation.projections?.[0]?.netIncome && (
                                <th className="text-right">Net Income</th>
                              )}
                              {valuation.projections?.[0]?.eps && (
                                <th className="text-right">EPS</th>
                              )}
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {valuation.projections?.map((projection) => (
                          <tr key={projection.year}>
                            <td>{projection.year}</td>
                            <td className="text-right">{formatMillions(projection.revenue)}</td>
                            <td className="text-right">{formatMillions(projection.fcf || projection.freeCashFlow)}</td>
                            {method === 'dcf' ? (
                              <>
                                {valuation.projections?.[0]?.ebitda && (
                                  <td className="text-right">{formatMillions(projection.ebitda)}</td>
                                )}
                                {valuation.projections?.[0]?.capex && (
                                  <td className="text-right">{formatMillions(projection.capex)}</td>
                                )}
                                {valuation.projections?.[0]?.workingCapital && (
                                  <td className="text-right">{formatMillions(projection.workingCapital)}</td>
                                )}
                              </>
                            ) : (
                              <>
                                {valuation.projections?.[0]?.ebitda && (
                                  <td className="text-right">{formatMillions(projection.ebitda)}</td>
                                )}
                                {valuation.projections?.[0]?.netIncome && (
                                  <td className="text-right">{formatMillions(projection.netIncome)}</td>
                                )}
                                {valuation.projections?.[0]?.eps && (
                                  <td className="text-right">${projection.eps?.toFixed(2) || 'N/A'}</td>
                                )}
                              </>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="analysis">
              <Card>
                <CardHeader>
                  <CardTitle>Company Analysis</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-medium mb-2">Overview</h3>
                      <p className="text-gray-600">{valuation.analysis.companyOverview}</p>
                    </div>
                    <div>
                      <h3 className="text-lg font-medium mb-2">Key Drivers</h3>
                      <ul className="list-disc list-inside space-y-1">
                        {valuation.analysis.keyDrivers?.map((driver, index) => (
                          <li key={index} className="text-gray-600">{driver}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h3 className="text-lg font-medium mb-2">Risks</h3>
                      <ul className="list-disc list-inside space-y-1">
                        {valuation.analysis.risks?.map((risk, index) => (
                          <li key={index} className="text-gray-600">{risk}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="assumptions">
              <Card>
                <CardHeader>
                  <CardTitle>Valuation Assumptions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-medium mb-2">Key Assumptions</h3>
                      <div className="grid grid-cols-2 gap-4">
                        {method === 'dcf' && (
                          <>
                            <div>
                              <p className="text-sm text-gray-500">Revenue Growth Rate</p>
                              <p className="text-lg font-medium">
                                {formatDCFPercentage(valuation.assumptions.revenueGrowthRate || 
                                                valuation.assumptions.fcfGrowthRate5yr ||
                                                (Array.isArray(valuation.assumptions.revenueGrowth) ? 
                                                 valuation.assumptions.revenueGrowth[0] : null))}
                              </p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-500">Terminal Growth Rate</p>
                              <p className="text-lg font-medium">
                                {formatDCFPercentage(valuation.assumptions.terminalGrowthRate)}
                              </p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-500">Discount Rate</p>
                              <p className="text-lg font-medium">
                                {formatDCFPercentage(valuation.assumptions.discountRate || valuation.assumptions.wacc)}
                              </p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-500">FCF Margin</p>
                              <p className="text-lg font-medium">
                                {formatDCFPercentage(valuation.assumptions.fcfMargin)}
                              </p>
                            </div>
                          </>
                        )}
                        {method === 'exit-multiple' && (
                          <>
                            <div>
                              <p className="text-sm text-gray-500">Exit Multiple</p>
                              <p className="text-lg font-medium">
                                {formatMultiple(valuation.assumptions.exitMultiple)}
                              </p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-500">Exit Multiple Type</p>
                              <p className="text-lg font-medium">
                                {valuation.assumptions.exitMultipleType || 'N/A'}
                              </p>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    <div>
                      <h3 className="text-lg font-medium mb-2">Sensitivity Analysis</h3>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <p className="text-sm text-gray-500">Bull Case</p>
                          <p className="text-lg font-medium">
                            {method === 'exit-multiple' && valuation.assumptions?.exitMultipleType && 
                             (valuation.assumptions.exitMultipleType === 'EV/EBITDA' || valuation.assumptions.exitMultipleType === 'EV/FCF') 
                             ? formatMillions(valuation.analysis.sensitivity.bullCase) 
                             : formatCurrency(valuation.analysis.sensitivity.bullCase)}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Base Case</p>
                          <p className="text-lg font-medium">
                            {method === 'exit-multiple' && valuation.assumptions?.exitMultipleType && 
                             (valuation.assumptions.exitMultipleType === 'EV/EBITDA' || valuation.assumptions.exitMultipleType === 'EV/FCF') 
                             ? formatMillions(valuation.analysis.sensitivity.baseCase) 
                             : formatCurrency(valuation.analysis.sensitivity.baseCase)}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Bear Case</p>
                          <p className="text-lg font-medium">
                            {method === 'exit-multiple' && valuation.assumptions?.exitMultipleType && 
                             (valuation.assumptions.exitMultipleType === 'EV/EBITDA' || valuation.assumptions.exitMultipleType === 'EV/FCF') 
                             ? formatMillions(valuation.analysis.sensitivity.bearCase) 
                             : formatCurrency(valuation.analysis.sensitivity.bearCase)}
                          </p>
                        </div>
                      </div>
                    </div>
                    {method === 'exit-multiple' && valuation.analysis.multipleExplanation && (
                      <div>
                        <h3 className="text-lg font-medium mb-2">Multiple Selection Reasoning</h3>
                        <p className="text-gray-600 whitespace-pre-wrap">
                          {valuation.analysis.multipleExplanation}
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {valuation && (
            <div className="flex justify-end">
              <Button onClick={downloadExcel}>
                Download Excel Model
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
} 