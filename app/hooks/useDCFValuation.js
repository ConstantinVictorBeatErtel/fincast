'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  isValuationIncomplete,
  prepareValuationResponse,
  hasUsableForecast,
} from '@/app/lib/dcf/valuationData';
import { downloadValuationExcel } from '@/app/lib/dcf/downloadValuationExcel';

export function useDCFValuation() {
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
  const [analysisMode, setAnalysisMode] = useState('agentic');
  const [agenticProgress, setAgenticProgress] = useState(null);
  const [showResearchTrail, setShowResearchTrail] = useState(false);
  const loadingRef = useRef(false);

  useEffect(() => {
    if (valuation) {
      console.log('Valuation state updated:', {
        valuation,
        analysis: valuation.analysis,
        projections: valuation.projections,
        assumptions: valuation.assumptions,
        hasExcelData: !!valuation.excelData,
        fairValue: valuation.fairValue,
        currentSharePrice: valuation.currentSharePrice,
        sections: valuation.sections,
        hasFinancialAnalysis: !!valuation.sections?.financialAnalysis,
      });
    } else {
      console.log('Valuation state cleared');
    }
  }, [valuation]);

  const handleSubmit = useCallback(
    async (e, isRetry = false) => {
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
        const apiUrl =
          analysisMode === 'agentic'
            ? `/api/agentic-valuation?ticker=${ticker}&method=${method}&multiple=${selectedMultiple}`
            : `/api/dcf-valuation?ticker=${ticker}&method=${method}&multiple=${selectedMultiple}&llm=1`;

        loadingRef.current = true;
        if (analysisMode === 'agentic') {
          setAgenticProgress({ step: 1, message: 'Analyzing historical data...' });
          const progressSteps = [
            { step: 2, message: 'Researching web for latest developments...', delay: 12000 },
            { step: 3, message: 'Generating financial projections...', delay: 35000 },
            { step: 4, message: 'Validating forecast assumptions...', delay: 70000 },
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
          if (response.status === 404) {
            throw new Error(`Unable to find data for ${ticker}. Please verify the ticker symbol and try again.`);
          }
          if (response.status === 429) {
            throw new Error('Too many requests. Please wait a minute and try again.');
          }
          if (response.status === 500) {
            if (data.error?.includes('JSON')) {
              throw new Error('Unable to process the valuation data. Please try again.');
            }
            throw new Error(data.error || 'Server error occurred. Please try again later.');
          }
          throw new Error(data.error || 'Failed to generate valuation. Please try again.');
        }

        console.log('Raw data structure:', {
          hasRawForecast: !!data.rawForecast,
          hasFinancialAnalysis: !!data.rawFinancialAnalysis,
          hasSections: !!data.sections,
          sections: Object.keys(data.sections || {}),
          companyName: data.companyName,
          method: data.method,
          fairValue: data.fairValue,
        });

        const isAgenticResponse = data.source === 'agentic' && Array.isArray(data.projections);
        if (!data.rawForecast && !isAgenticResponse) {
          console.error('Missing raw forecast data');
          throw new Error('Invalid data structure: Missing forecast data');
        }

        prepareValuationResponse(data);

        if (isValuationIncomplete(data) && !hasRetried && !isRetry) {
          setRetrying(true);
          setHasRetried(true);
          setTimeout(() => {
            handleSubmit(undefined, true);
          }, 500);
          return;
        }

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
    },
    [analysisMode, hasRetried, method, selectedMultiple, ticker]
  );

  const handleFeedbackSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      if (!feedback.trim()) {
        setError('Please provide feedback');
        return;
      }

      setFeedbackLoading(true);
      setError(null);

      try {
        const apiUrl =
          analysisMode === 'agentic'
            ? `/api/agentic-valuation?ticker=${ticker}&method=${method}&multiple=${selectedMultiple}&feedback=${encodeURIComponent(feedback)}`
            : `/api/dcf-valuation?ticker=${ticker}&method=${method}&multiple=${selectedMultiple}&llm=1`;

        const response = await fetch(apiUrl, {
          method: analysisMode === 'agentic' ? 'GET' : 'POST',
          headers: { 'Content-Type': 'application/json' },
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

        const newValuation = data.valuation || data;
        prepareValuationResponse(data);

        if (!hasUsableForecast(newValuation)) {
          console.warn('Feedback response missing usable forecast. Keeping existing results.');
          setError('Feedback applied, but the response was incomplete. Keeping previous results. Try again or refine feedback.');
          return;
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
    },
    [analysisMode, feedback, method, selectedMultiple, ticker]
  );

  const downloadExcel = useCallback(() => {
    downloadValuationExcel(valuation);
  }, [valuation]);

  return {
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
  };
}
