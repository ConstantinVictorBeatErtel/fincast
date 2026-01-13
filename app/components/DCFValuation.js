'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, Bar } from 'recharts';

export default function DCFValuation() {
  const [ticker, setTicker] = useState('');
  const [method, setMethod] = useState('exit-multiple');
  const [selectedMultiple, setSelectedMultiple] = useState('auto');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [valuation, setValuation] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [hasRetried, setHasRetried] = useState(false);
  const [retrying, setRetrying] = useState(false);

  // Agentic mode state
  const [analysisMode, setAnalysisMode] = useState('standard'); // 'standard' or 'agentic'
  const [agenticProgress, setAgenticProgress] = useState(null); // { step: 1-4, message: string }
  const [showResearchTrail, setShowResearchTrail] = useState(false);
  const loadingRef = useRef(false); // Ref for tracking loading state in async callbacks

  // Debug effect to log valuation changes
  useEffect(() => {
    if (valuation) {
      console.log('Valuation state updated:', {
        valuation: valuation,
        analysis: valuation.analysis,
        projections: valuation.projections,
        assumptions: valuation.assumptions,
        hasExcelData: !!valuation.excelData,
        fairValue: valuation.fairValue,
        currentSharePrice: valuation.currentSharePrice,
        sections: valuation.sections,
        hasFinancialAnalysis: !!valuation.sections?.financialAnalysis
      });
    } else {
      console.log('Valuation state cleared');
    }
  }, [valuation]);

  // Helper to check if critical info is missing
  const isValuationIncomplete = (data) => {
    if (!data) return true;
    // If we have parsed projections or rawForecast text, treat as complete for UI rendering
    if (Array.isArray(data.projections) && data.projections.length > 0) return false;
    if (typeof data.rawForecast === 'string' && data.rawForecast.trim().length > 0) return false;
    // Fallback to legacy completeness check
    return (!data.currentSharePrice || data.currentSharePrice === 0 || !data.fairValue || data.fairValue === 0);
  };

  const handleSubmit = async (e, isRetry = false) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError(null);
    setValuation(null);
    setAgenticProgress(null);
    if (!isRetry) setHasRetried(false);
    if (!ticker) {
      setError('Please enter a ticker symbol');
      setLoading(false);
      return;
    }

    try {
      // Route to agentic API if in agentic mode (pass method for DCF vs exit-multiple)
      const apiUrl = analysisMode === 'agentic'
        ? `/api/agentic-valuation?ticker=${ticker}&method=${method}`
        : `/api/dcf-valuation?ticker=${ticker}&method=${method}&multiple=${selectedMultiple}&llm=1`;

      // Set progress for agentic mode with simulated step progression
      loadingRef.current = true;
      if (analysisMode === 'agentic') {
        setAgenticProgress({ step: 1, message: 'Analyzing historical data...' });

        // Simulate progress through steps using ref to check if still loading
        const progressSteps = [
          { step: 2, message: 'Researching web for latest developments...', delay: 12000 },
          { step: 3, message: 'Generating financial projections...', delay: 35000 },
          { step: 4, message: 'Validating forecast assumptions...', delay: 70000 }
        ];

        progressSteps.forEach(({ step, message, delay }) => {
          setTimeout(() => {
            if (loadingRef.current) setAgenticProgress({ step, message });
          }, delay);
        });
      }

      const response = await fetch(apiUrl);
      let data;

      try {
        data = await response.json();
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
      // Agentic mode returns projections directly, standard mode returns rawForecast
      const isAgenticResponse = data.source === 'agentic' && Array.isArray(data.projections);
      if (!data.rawForecast && !isAgenticResponse) {
        console.error('Missing raw forecast data');
        throw new Error('Invalid data structure: Missing forecast data');
      }

      // Normalize projections array for charts/tables
      try {
        if (!Array.isArray(data.projections) || data.projections.length === 0) {
          // From tableData (backend older format)
          if (Array.isArray(data.tableData) && data.tableData.length > 0) {
            data.projections = data.tableData.map(row => {
              const revenue = Number(row.revenue || 0);
              const grossMargin = Number(row.grossMargin || 0);
              const ebitdaMargin = Number(row.ebitdaMargin || 0);
              const fcfMargin = Number(row.fcfMargin || 0);
              const netIncome = Number(row.netIncome || 0);
              return {
                year: String(row.year || ''),
                revenue,
                revenueGrowth: Number(row.revenueGrowth || 0),
                grossProfit: revenue * (grossMargin / 100),
                grossMargin,
                ebitda: revenue * (ebitdaMargin / 100),
                ebitdaMargin,
                freeCashFlow: revenue * (fcfMargin / 100),
                fcf: revenue * (fcfMargin / 100),
                fcfMargin,
                netIncome,
                netIncomeMargin: revenue > 0 ? (netIncome / revenue) * 100 : 0,
                eps: Number(row.eps || 0),
              };
            });
          } else if (typeof data.rawForecast === 'string') {
            // Fallback: parse rawForecast table text
            const lines = data.rawForecast.split('\n').map(l => l.trim()).filter(Boolean);
            let inTable = false;
            const parsed = [];
            for (const line of lines) {
              if (!inTable) {
                if (/^Year\s*\|/i.test(line)) { inTable = true; }
                continue;
              }
              if (/^-{2,}/.test(line)) continue;
              if (/^Fair Value Calculation:/i.test(line) || /^Exit Multiple Valuation:/i.test(line)) break;
              const cols = line.split('|').map(c => c.trim());
              if (!cols.length || isNaN(Number(cols[0].replace(/[^\d]/g, '')))) continue;
              const parseNum = (v) => {
                if (!v) return 0;
                const n = Number(String(v).replace(/[^\d.\-]/g, ''));
                return isNaN(n) ? 0 : n;
              };
              const year = cols[0];
              const revenue = parseNum(cols[1]);
              const revenueGrowth = parseNum(cols[2]);
              const grossMargin = parseNum(cols[3]);
              const ebitdaMargin = parseNum(cols[4]);
              const fcfMargin = parseNum(cols[5]);
              const netIncome = parseNum(cols[6]);
              const eps = parseNum(cols[7]);
              parsed.push({
                year,
                revenue,
                revenueGrowth,
                grossProfit: revenue * (grossMargin / 100),
                grossMargin,
                ebitda: revenue * (ebitdaMargin / 100),
                ebitdaMargin,
                freeCashFlow: revenue * (fcfMargin / 100),
                fcf: revenue * (fcfMargin / 100),
                fcfMargin,
                netIncome,
                netIncomeMargin: revenue > 0 ? (netIncome / revenue) * 100 : 0,
                eps,
              });
            }
            if (parsed.length > 0) data.projections = parsed;
          }
        }

        // Normalize agentic projections: compute derived fields from margins if missing
        if (data.source === 'agentic' && Array.isArray(data.projections)) {
          data.projections = data.projections.map(row => {
            const revenue = Number(row.revenue || 0);
            const grossMargin = Number(row.grossMargin || 0);
            const ebitdaMargin = Number(row.ebitdaMargin || 0);
            const fcfMargin = Number(row.fcfMargin || 0);
            const netIncome = Number(row.netIncome || 0);

            return {
              ...row,
              year: String(row.year || ''),
              revenue,
              revenueGrowth: Number(row.revenueGrowth || 0),
              // Compute gross profit from margin if not provided
              grossProfit: row.grossProfit || (revenue * (grossMargin / 100)),
              grossMargin,
              // Compute EBITDA from margin if not provided
              ebitda: row.ebitda || (revenue * (ebitdaMargin / 100)),
              ebitdaMargin,
              // Compute FCF from margin if not provided  
              freeCashFlow: row.freeCashFlow || row.fcf || (revenue * (fcfMargin / 100)),
              fcf: row.fcf || row.freeCashFlow || (revenue * (fcfMargin / 100)),
              fcfMargin,
              netIncome,
              // Compute net income margin if not provided
              netIncomeMargin: row.netIncomeMargin || (revenue > 0 ? (netIncome / revenue) * 100 : 0),
              eps: Number(row.eps || 0),
            };
          });
        }
      } catch (normErr) {
        console.warn('Projection normalization failed:', normErr);
      }

      // Align 2024 forecast row with historical FY2024 data so both views match
      try {
        if (Array.isArray(data.projections) && data.projections.length > 0 && Array.isArray(data.historicalFinancials)) {
          const hist24 = data.historicalFinancials.find(h => String(h.year).toUpperCase().includes('FY24') || String(h.year).includes('2024'));
          const idx2024 = data.projections.findIndex(p => String(p.year) === '2024');
          if (hist24 && idx2024 !== -1) {
            const rev = Number(hist24.revenue || 0);
            const gp = Number(hist24.grossProfit || 0);
            const ebitda = Number(hist24.ebitda || 0);
            const ni = Number(hist24.netIncome || 0);
            const fcf = Number(hist24.fcf || 0);
            const eps = Number(hist24.eps || 0);
            data.projections[idx2024] = {
              ...data.projections[idx2024],
              revenue: rev,
              grossProfit: gp,
              grossMargin: rev > 0 ? (gp / rev) * 100 : 0,
              ebitda: ebitda,
              ebitdaMargin: rev > 0 ? (ebitda / rev) * 100 : 0,
              freeCashFlow: fcf,
              fcf: fcf,
              fcfMargin: rev > 0 ? (fcf / rev) * 100 : 0,
              netIncome: ni,
              netIncomeMargin: rev > 0 ? (ni / rev) * 100 : 0,
              eps: eps,
              // Copy historical 2024 revenue growth if available
              revenueGrowth: typeof hist24.revenueGrowth === 'number' ? Number(hist24.revenueGrowth) : (data.projections[idx2024].revenueGrowth || 0)
            };
          }
        }
      } catch (alignErr) {
        console.warn('Failed to align 2024 projection with historical:', alignErr);
      }

      // Check for missing critical info and retry once if needed
      if (isValuationIncomplete(data) && !hasRetried) {
        setRetrying(true);
        setHasRetried(true);
        setTimeout(() => {
          handleSubmit(undefined, true); // retry without event
        }, 500); // short delay to avoid race
        return;
      }

      // Set the raw data directly
      setValuation(data);
      setRetrying(false);

    } catch (err) {
      console.error('Error in handleSubmit:', err);
      setError(err.message);
      setRetrying(false);
    } finally {
      loadingRef.current = false;
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
      // Route to appropriate API based on analysis mode
      const apiUrl = analysisMode === 'agentic'
        ? `/api/agentic-valuation?ticker=${ticker}&feedback=${encodeURIComponent(feedback)}`
        : `/api/dcf-valuation?ticker=${ticker}&method=${method}&multiple=${selectedMultiple}&llm=1`;

      const response = await fetch(apiUrl, {
        method: analysisMode === 'agentic' ? 'GET' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: analysisMode === 'agentic' ? undefined : JSON.stringify({ feedback }),
      });

      let data;
      try {
        data = await response.json();
      } catch (jsonError) {
        console.error('Failed to parse feedback response:', jsonError);
        throw new Error('Unable to process server response. Please try again later.');
      }

      if (!response.ok) {
        console.error('Feedback request failed:', response.status, data);
        throw new Error(data.error || 'Failed to regenerate valuation with feedback');
      }

      // Set the new valuation - handle both direct response and nested response
      const newValuation = data.valuation || data;

      // Normalize projections to ensure charts always render
      try {
        if (!Array.isArray(data.projections) || data.projections.length === 0) {
          if (Array.isArray(data.tableData) && data.tableData.length > 0) {
            data.projections = data.tableData.map(row => {
              const revenue = Number(row.revenue || 0);
              const grossMargin = Number(row.grossMargin || 0);
              const ebitdaMargin = Number(row.ebitdaMargin || 0);
              const fcfMargin = Number(row.fcfMargin || 0);
              const netIncome = Number(row.netIncome || 0);
              return {
                year: String(row.year || ''),
                revenue,
                revenueGrowth: Number(row.revenueGrowth || 0),
                grossProfit: revenue * (grossMargin / 100),
                grossMargin,
                ebitda: revenue * (ebitdaMargin / 100),
                ebitdaMargin,
                freeCashFlow: revenue * (fcfMargin / 100),
                fcf: revenue * (fcfMargin / 100),
                fcfMargin,
                netIncome,
                netIncomeMargin: revenue > 0 ? (netIncome / revenue) * 100 : 0,
                eps: Number(row.eps || 0),
              };
            });
          } else if (typeof data.rawForecast === 'string') {
            const lines = data.rawForecast.split('\n').map(l => l.trim()).filter(Boolean);
            let inTable = false;
            const parsed = [];
            for (const line of lines) {
              if (!inTable) {
                if (/^Year\s*\|/i.test(line)) { inTable = true; }
                continue;
              }
              if (/^-{2,}/.test(line)) continue;
              if (/^Fair Value Calculation:/i.test(line) || /^Exit Multiple Valuation:/i.test(line)) break;
              const cols = line.split('|').map(c => c.trim());
              if (!cols.length || isNaN(Number(cols[0].replace(/[^\d]/g, '')))) continue;
              const parseNum = (v) => {
                if (!v) return 0;
                const n = Number(String(v).replace(/[^\d.\-]/g, ''));
                return isNaN(n) ? 0 : n;
              };
              const year = cols[0];
              const revenue = parseNum(cols[1]);
              const revenueGrowth = parseNum(cols[2]);
              const grossMargin = parseNum(cols[3]);
              const ebitdaMargin = parseNum(cols[4]);
              const fcfMargin = parseNum(cols[5]);
              const netIncome = parseNum(cols[6]);
              const eps = parseNum(cols[7]);
              parsed.push({
                year,
                revenue,
                revenueGrowth,
                grossProfit: revenue * (grossMargin / 100),
                grossMargin,
                ebitda: revenue * (ebitdaMargin / 100),
                ebitdaMargin,
                freeCashFlow: revenue * (fcfMargin / 100),
                fcf: revenue * (fcfMargin / 100),
                fcfMargin,
                netIncome,
                netIncomeMargin: revenue > 0 ? (netIncome / revenue) * 100 : 0,
                eps,
              });
            }
            if (parsed.length > 0) data.projections = parsed;
          }
        }
      } catch (normErr) {
        console.warn('Projection normalization (feedback) failed:', normErr);
      }

      // Align 2024 forecast row with historical FY2024 data on feedback path
      try {
        if (Array.isArray(data.projections) && data.projections.length > 0 && Array.isArray(data.historicalFinancials)) {
          const hist24 = data.historicalFinancials.find(h => String(h.year).toUpperCase().includes('FY24') || String(h.year).includes('2024'));
          const idx2024 = data.projections.findIndex(p => String(p.year) === '2024');
          if (hist24 && idx2024 !== -1) {
            const rev = Number(hist24.revenue || 0);
            const gp = Number(hist24.grossProfit || 0);
            const ebitda = Number(hist24.ebitda || 0);
            const ni = Number(hist24.netIncome || 0);
            const fcf = Number(hist24.fcf || 0);
            const eps = Number(hist24.eps || 0);
            data.projections[idx2024] = {
              ...data.projections[idx2024],
              revenue: rev,
              grossProfit: gp,
              grossMargin: rev > 0 ? (gp / rev) * 100 : 0,
              ebitda: ebitda,
              ebitdaMargin: rev > 0 ? (ebitda / rev) * 100 : 0,
              freeCashFlow: fcf,
              fcf: fcf,
              fcfMargin: rev > 0 ? (fcf / rev) * 100 : 0,
              netIncome: ni,
              netIncomeMargin: rev > 0 ? (ni / rev) * 100 : 0,
              eps: eps,
              // Copy historical 2024 revenue growth if available
              revenueGrowth: typeof hist24.revenueGrowth === 'number' ? Number(hist24.revenueGrowth) : (data.projections[idx2024].revenueGrowth || 0)
            };
          }
        }
      } catch (alignErr) {
        console.warn('Failed to align 2024 projection with historical (feedback):', alignErr);
      }

      // Guard: only replace current valuation if feedback response is usable
      // Agentic mode returns projections array with source='agentic'
      const isAgenticUsable = newValuation?.source === 'agentic' &&
        Array.isArray(newValuation.projections) && newValuation.projections.length > 0;

      const hasUsableForecast = isAgenticUsable || (
        !!newValuation?.rawForecast &&
        (
          newValuation.rawForecast.includes('Year | Revenue') ||
          Array.isArray(newValuation.tableData) && newValuation.tableData.length > 0 ||
          (newValuation.sections && (
            !!newValuation.sections.forecastTable ||
            !!newValuation.sections.fairValueCalculation ||
            !!newValuation.sections.exitMultipleValuation ||
            !!newValuation.sections.assumptions ||
            !!newValuation.sections.financialAnalysis
          ))
        )
      );

      if (!hasUsableForecast) {
        console.warn('Feedback response missing usable forecast. Keeping existing results.');
        setError('Feedback applied, but the response was incomplete. Keeping previous results. Try again or refine feedback.');
        return; // Do not clear existing valuation
      }

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

    const workbook = XLSX.utils.book_new();

    // Create Summary sheet
    // Compute implied fair share price for exit multiple using backend upside
    const impliedFairSharePrice = (valuation.method === 'exit-multiple' && typeof valuation.currentSharePrice === 'number' && typeof valuation.upside === 'number')
      ? valuation.currentSharePrice * (1 + (valuation.upside / 100))
      : null;

    const summaryData = [
      ['Valuation Summary'],
      ['Company', valuation.companyName],
      ['Method', valuation.method],
      ['Fair Value', valuation.method === 'exit-multiple'
        ? (impliedFairSharePrice ? `$${impliedFairSharePrice.toFixed(2)} per share` : 'N/A')
        : `$${valuation.fairValue?.toLocaleString()} million`
      ],
      ['Upside', `${valuation.upside?.toFixed(1) || 0}%`],
      ['2029 Upside', `${valuation.upside?.toFixed(1) || 0}%`],
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

    // Combined Performance sheet (Historical + Forecast) similar to frontend
    try {
      const hist = Array.isArray(valuation.historicalFinancials) ? [...valuation.historicalFinancials] : [];
      // Sort historical ascending by year label (FYxx or YYYY)
      hist.sort((a, b) => {
        const ay = String(a.year || '').replace(/^FY/, '');
        const by = String(b.year || '').replace(/^FY/, '');
        return parseInt(ay, 10) - parseInt(by, 10);
      });
      const proj = Array.isArray(valuation.projections) ? valuation.projections : [];

      // Normalize year labels to FYXX format and de-duplicate 2024 between historical and projections
      const normalizeYearLabel = (y) => {
        const s = String(y || '');
        const m = s.match(/(20\d{2})/);
        if (m) {
          return `FY${m[1].slice(2)}`;
        }
        if (s.toUpperCase().startsWith('FY')) return s;
        return s;
      };
      const histLabels = hist.map(h => normalizeYearLabel(h.year));
      const histLabelSet = new Set(histLabels);
      const projFiltered = proj.filter(p => !histLabelSet.has(normalizeYearLabel(p.year)));

      const headers = ['Metric', ...histLabels, ...projFiltered.map(p => normalizeYearLabel(p.year))];

      const fmt1 = (v) => (typeof v === 'number' ? v.toFixed(1) : '');
      const fmt2 = (v) => (typeof v === 'number' ? v.toFixed(2) : '');

      const rowRevenue = ['Revenue ($M)', ...hist.map(h => fmt1(h.revenue)), ...projFiltered.map(p => fmt1(p.revenue))];
      const rowRevGrowth = ['Revenue Growth (%)', ...hist.map((h, i) => (i === 0 ? '/' : fmt1(h.revenueGrowth))), ...projFiltered.map(p => fmt1(p.revenueGrowth))];
      const rowGP = ['Gross Profit ($M)', ...hist.map(h => fmt1(h.grossProfit)), ...projFiltered.map(p => fmt1(p.grossProfit))];
      const rowGM = ['Gross Margin (%)', ...hist.map(h => fmt1(h.grossMargin)), ...projFiltered.map(p => fmt1(p.grossMargin))];
      const rowEBITDA = ['EBITDA ($M)', ...hist.map(h => fmt1(h.ebitda)), ...projFiltered.map(p => fmt1(p.ebitda))];
      const rowEBITDAM = ['EBITDA Margin (%)', ...hist.map(h => fmt1(h.ebitdaMargin)), ...projFiltered.map(p => fmt1(p.ebitdaMargin))];
      const rowNI = ['Net Income ($M)', ...hist.map(h => fmt1(h.netIncome)), ...projFiltered.map(p => fmt1(p.netIncome))];
      const rowNIM = ['Net Income Margin (%)', ...hist.map(h => fmt1(h.netIncomeMargin)), ...projFiltered.map(p => fmt1(p.netIncomeMargin))];
      const rowEPS = ['EPS ($)', ...hist.map(h => fmt2(h.eps)), ...projFiltered.map(p => fmt2(p.eps))];
      const rowFCF = ['FCF ($M)', ...hist.map(h => fmt1(h.fcf)), ...projFiltered.map(p => fmt1(p.fcf))];
      const rowFCFM = ['FCF Margin (%)', ...hist.map(h => fmt1(h.fcfMargin)), ...projFiltered.map(p => fmt1(p.fcfMargin))];

      sheets.push({
        name: 'Performance',
        data: [
          headers,
          rowRevenue,
          rowRevGrowth,
          rowGP,
          rowGM,
          rowEBITDA,
          rowEBITDAM,
          rowNI,
          rowNIM,
          rowEPS,
          rowFCF,
          rowFCFM,
        ]
      });
    } catch (e) {
      console.warn('Failed to build Performance sheet:', e);
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

    // Add Calculation Details into Summary sheet for clearer derivation to fair value
    try {
      const lastProj = (Array.isArray(valuation.projections) && valuation.projections.length)
        ? valuation.projections[valuation.projections.length - 1]
        : null;
      const calcRows = [];
      if (valuation.method === 'exit-multiple') {
        const type = valuation.exitMultipleType || 'P/E';
        const multiple = valuation.exitMultipleValue || 0;
        if (type === 'P/E' && lastProj) {
          const eps = Number(lastProj.eps || 0);
          const fair = eps * multiple;
          calcRows.push(['Calculation Details']);
          calcRows.push([`Fair Price = 2029 EPS × Multiple`]);
          calcRows.push([`= ${eps.toFixed(2)} × ${multiple} = $${fair.toFixed(2)} per share`]);
        } else if (type === 'EV/EBITDA' && lastProj) {
          const ebitda = Number(lastProj.ebitda || 0);
          const fairEV = ebitda * multiple;
          calcRows.push(['Calculation Details']);
          calcRows.push([`Fair EV ($M) = 2029 EBITDA × Multiple`]);
          calcRows.push([`= ${ebitda.toFixed(1)} × ${multiple} = $${fairEV.toFixed(1)}M`]);
          // Try to convert to per-share using current net debt
          const evM = Number(valuation.sourceMetrics?.enterpriseValue || 0); // $M
          const mktCap = Number(valuation.sourceMetrics?.marketCap || 0); // $
          const mktCapM = mktCap ? mktCap / 1_000_000 : 0;
          const netDebtM = (evM && mktCapM) ? (evM - mktCapM) : null;
          const shares = Number(valuation.sourceMetrics?.sharesOutstanding || 0);
          const sharesM = shares > 1000 ? shares / 1_000_000 : shares; // normalize
          if (netDebtM != null && sharesM > 0) {
            const equityM = fairEV - netDebtM;
            const price = (equityM * 1_000_000) / (sharesM * 1_000_000); // simplify -> equityM/sharesM
            calcRows.push([`Implied Equity ($M) = Fair EV − Net Debt = ${fairEV.toFixed(1)} − ${netDebtM.toFixed(1)} = ${equityM.toFixed(1)}M`]);
            calcRows.push([`Implied Price = Implied Equity / Shares = ${equityM.toFixed(1)}M / ${sharesM.toFixed(1)}M = $${price.toFixed(2)} per share`]);
          }
        } else if (type === 'EV/FCF' && lastProj) {
          const fcf = Number(lastProj.fcf || lastProj.freeCashFlow || 0);
          const fairEV = fcf * multiple;
          calcRows.push(['Calculation Details']);
          calcRows.push([`Fair EV ($M) = 2029 FCF × Multiple`]);
          calcRows.push([`= ${fcf.toFixed(1)} × ${multiple} = $${fairEV.toFixed(1)}M`]);
        }
      } else if (valuation.method === 'dcf' && lastProj) {
        // Provide simple DCF line if provided by server as fair value
        if (typeof valuation.fairValue === 'number') {
          calcRows.push(['Calculation Details']);
          calcRows.push([`DCF Fair Value ($M): ${valuation.fairValue.toFixed(1)} (see app for full breakdown)`]);
        }
      }
      if (calcRows.length) {
        // Append to Summary sheet
        sheets[0].data.push([]);
        sheets[0].data.push(...calcRows);
      }
    } catch (calcErr) {
      console.warn('Failed to add calculation details:', calcErr);
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

  // Helper: format one-decimal numbers for axes/tooltips
  const formatOneDecimal = (value) => {
    const num = Number(value);
    if (Number.isNaN(num)) return '0.0';
    return num.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  };

  // Helper: convert year to FY format (2025 -> FY25, "2025" -> FY25)
  const formatYearAsFY = (year) => {
    const s = String(year || '').trim();
    // If already "FY" format, return as-is
    if (s.toUpperCase().startsWith('FY')) return s;
    // Extract 4-digit year and convert to FY format
    const m = s.match(/(20\d{2})/);
    if (m) return `FY${m[1].slice(2)}`;
    return s;
  };

  // Helper: get year number for comparison (2025 from "2025" or "FY25")
  const getYearNumber = (year) => {
    const s = String(year || '').trim();
    if (s.toUpperCase().startsWith('FY')) {
      const num = parseInt(s.slice(2), 10);
      return num < 100 ? 2000 + num : num;
    }
    const m = s.match(/(20\d{2})/);
    return m ? parseInt(m[1], 10) : 0;
  };
  // Helper: sort historical by FY label or year ascending
  const getSortedHistorical = (arr) => {
    if (!Array.isArray(arr)) return [];
    const toYearNum = (y) => {
      const s = String(y || '').trim();
      if (s.startsWith('FY')) return parseInt(s.slice(2), 10) || 0;
      const m = s.match(/\d{4}/);
      if (m) return parseInt(m[0].slice(2), 10) || 0;
      return 0;
    };
    return [...arr].sort((a, b) => toYearNum(a.year) - toYearNum(b.year));
  };

  // Helper function to determine if we should show EV-based display
  const shouldShowEVDisplay = () => {
    return method === 'exit-multiple' &&
      valuation?.exitMultipleType &&
      (valuation.exitMultipleType === 'EV/EBITDA' ||
        valuation.exitMultipleType === 'EV/FCF');
  };

  // Helper to filter out unwanted sections from latestDevelopments
  const filterLatestDevelopments = (text) => {
    if (!text || typeof text !== 'string') return '';

    // Remove the unwanted sections completely
    let filtered = text;

    // Remove Historical Analysis & Projections section
    filtered = filtered.replace(/Historical\s+Analysis\s*&\s*Projections[\s\S]*?(?=\n\n|\n\*|\n$)/gi, '');

    // Remove Assumptions and Justifications section  
    filtered = filtered.replace(/Assumptions\s+and\s+Justifications[\s\S]*?(?=\n\n|\n\*|\n$)/gi, '');

    // Clean up any double newlines that might result
    filtered = filtered.replace(/\n\n\n+/g, '\n\n');

    return filtered.trim();
  };

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
                {valuation.source === 'agentic' && (
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

                {/* Agentic mode: Calculation breakdown */}
                {valuation.source === 'agentic' && valuation.exitMultipleCalculation && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <h4 className="text-sm font-medium text-gray-600 mb-3">Valuation Calculation</h4>
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

                        {valuation.exitMultipleCalculation.calculationMethod && (
                          <div className="bg-white p-3 rounded-lg border border-blue-100">
                            <div className="text-gray-500 text-xs font-medium uppercase mb-1">Calculation</div>
                            <div className="font-mono text-sm">{valuation.exitMultipleCalculation.calculationMethod}</div>
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

          {/* Research Trail - Agentic mode only */}
          {valuation.source === 'agentic' && valuation.research_trail && valuation.research_trail.length > 0 && (
            <Card className="mt-6">
              <CardHeader className="cursor-pointer" onClick={() => setShowResearchTrail(!showResearchTrail)}>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    🔍 Research Trail
                    <span className="text-sm font-normal text-gray-500">
                      ({valuation.research_trail.length} steps)
                    </span>
                  </span>
                  <span className="text-gray-400">{showResearchTrail ? '▼' : '▶'}</span>
                </CardTitle>
              </CardHeader>
              {showResearchTrail && (
                <CardContent>
                  <div className="space-y-4">
                    {valuation.research_trail.map((step, idx) => (
                      <div key={idx} className="border-l-4 border-blue-300 pl-4 py-2">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${step.step === 'analysis' ? 'bg-purple-100 text-purple-700' :
                            step.step === 'research' ? 'bg-blue-100 text-blue-700' :
                              step.step === 'forecast' ? 'bg-green-100 text-green-700' :
                                'bg-orange-100 text-orange-700'
                            }`}>
                            {step.step.charAt(0).toUpperCase() + step.step.slice(1)}
                          </span>
                          {step.metadata?.tokens_used && (
                            <span className="text-xs text-gray-400">
                              {step.metadata.tokens_used} tokens
                            </span>
                          )}
                        </div>

                        <p className="text-sm font-medium text-gray-700">{step.input}</p>

                        {step.step === 'research' && step.output?.findings && (
                          <div className="mt-2 text-sm text-gray-600 bg-gray-50 p-2 rounded">
                            <p className="line-clamp-3">{step.output.findings}</p>
                            {step.metadata?.sources && step.metadata.sources.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {step.metadata.sources.slice(0, 3).map((url, i) => (
                                  <a
                                    key={i}
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-blue-600 hover:underline truncate max-w-[200px]"
                                  >
                                    🔗 Source {i + 1}
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {step.step === 'analysis' && step.output?.research_questions && (
                          <ul className="mt-2 text-sm text-gray-600 list-disc list-inside">
                            {step.output.research_questions.slice(0, 3).map((q, i) => (
                              <li key={i}>{typeof q === 'string' ? q : q.question}</li>
                            ))}
                          </ul>
                        )}

                        {step.step === 'validation' && step.output?.issues_found && (
                          <div className="mt-2 text-sm">
                            {step.output.issues_found.length > 0 ? (
                              <ul className="text-orange-600 list-disc list-inside">
                                {step.output.issues_found.slice(0, 3).map((issue, i) => (
                                  <li key={i}>{issue}</li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-green-600">✓ No issues found</p>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          )}

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