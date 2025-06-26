'use client';

import { useState, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

export default function FinancialData({ ticker }) {
  const [historicalData, setHistoricalData] = useState(null);
  const [forecastData, setForecastData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (ticker) {
      fetchData();
    }
  }, [ticker]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch historical data
      const historicalResponse = await fetch(`/api/company-data?ticker=${ticker}`);
      if (!historicalResponse.ok) {
        throw new Error('Failed to fetch historical data');
      }
      const historical = await historicalResponse.json();
      setHistoricalData(historical);

      // Fetch forecast data
      const forecastResponse = await fetch(`/api/generate-forecast?ticker=${ticker}`);
      if (!forecastResponse.ok) {
        throw new Error('Failed to fetch forecast data');
      }
      const forecast = await forecastResponse.json();
      setForecastData(forecast);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatPercent = (value) => {
    return `${value.toFixed(2)}%`;
  };

  const formatCurrency = (value) => {
    if (!value) return '$0';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      notation: 'compact',
      maximumFractionDigits: 1,
      minimumFractionDigits: 1
    }).format(value * 1000000); // Convert millions to actual dollars
  };

  const calculateGrowthRates = (data) => {
    const years = Object.keys(data).sort();
    const growthRates = {};
    
    for (let i = 1; i < years.length; i++) {
      const currentYear = years[i];
      const previousYear = years[i - 1];
      
      const revenueGrowth = (data[currentYear].Revenue - data[previousYear].Revenue) / data[previousYear].Revenue;
      const netIncomeGrowth = (data[currentYear]['Net Income'] - data[previousYear]['Net Income']) / data[previousYear]['Net Income'];
      
      growthRates[currentYear] = {
        'Revenue Growth': revenueGrowth,
        'Net Income Growth': netIncomeGrowth,
      };
    }
    
    return growthRates;
  };

  const calculateMargins = (data) => {
    const margins = {};
    
    Object.entries(data).forEach(([year, values]) => {
      margins[year] = {
        'Net Income Margin': values['Net Income'] / values.Revenue,
      };
    });
    
    return margins;
  };

  const prepareChartData = (data, type) => {
    if (!Array.isArray(data)) {
      console.error('Invalid data format:', data);
      return {
        labels: [],
        datasets: []
      };
    }

    // For historical data, use TTM metrics
    if (type === 'historical' && data.ttmMetrics) {
      const ttmData = data.ttmMetrics;
      return {
        labels: ['TTM'],
        datasets: [
          {
            label: 'Revenue',
            data: [ttmData.revenue],
            borderColor: 'rgb(75, 192, 192)',
            tension: 0.1
          },
          {
            label: 'Net Income',
            data: [ttmData.netIncome],
            borderColor: 'rgb(255, 99, 132)',
            tension: 0.1
          },
          {
            label: 'Free Cash Flow',
            data: [ttmData.freeCashFlow],
            borderColor: 'rgb(54, 162, 235)',
            tension: 0.1
          }
        ]
      };
    }

    // For forecast data, use the array directly
    const labels = data.map(item => item.date.substring(0, 4));
    const datasets = [
      {
        label: 'Revenue',
        data: data.map(item => item.revenue),
        borderColor: 'rgb(75, 192, 192)',
        tension: 0.1
      },
      {
        label: 'Net Income',
        data: data.map(item => item.netIncome),
        borderColor: 'rgb(255, 99, 132)',
        tension: 0.1
      },
      {
        label: 'Free Cash Flow',
        data: data.map(item => item.freeCashFlow),
        borderColor: 'rgb(54, 162, 235)',
        tension: 0.1
      }
    ];

    return { labels, datasets };
  };

  const prepareMarginChartData = (data, type) => {
    if (!Array.isArray(data)) {
      console.error('Invalid data format in prepareMarginChartData:', data);
      return {
        labels: [],
        datasets: []
      };
    }

    // For historical data, use TTM metrics
    if (type === 'historical' && data.ttmMetrics) {
      const ttmData = data.ttmMetrics;
      return {
        labels: ['TTM'],
        datasets: [
          {
            label: 'Net Income Margin',
            data: [(ttmData.netIncome / ttmData.revenue) * 100],
            borderColor: 'rgb(255, 99, 132)',
            tension: 0.1
          },
          {
            label: 'FCF Margin',
            data: [(ttmData.freeCashFlow / ttmData.revenue) * 100],
            borderColor: 'rgb(54, 162, 235)',
            tension: 0.1
          },
          {
            label: 'ROIC',
            data: [ttmData.roic * 100],
            borderColor: 'rgb(153, 102, 255)',
            tension: 0.1
          }
        ]
      };
    }

    // For forecast data, use the array directly
    const labels = data.map(item => item.date.substring(0, 4));
    const datasets = [
      {
        label: 'Net Income Margin',
        data: data.map(item => (item.netIncome / item.revenue) * 100),
        borderColor: 'rgb(255, 99, 132)',
        tension: 0.1
      },
      {
        label: 'FCF Margin',
        data: data.map(item => (item.freeCashFlow / item.revenue) * 100),
        borderColor: 'rgb(54, 162, 235)',
        tension: 0.1
      },
      {
        label: 'ROIC',
        data: data.map(item => item.roic * 100),
        borderColor: 'rgb(153, 102, 255)',
        tension: 0.1
      }
    ];

    return { labels, datasets };
  };

  const prepareGrowthChartData = (data) => {
    const years = Object.keys(data).sort();
    const revenueGrowthData = years.map(year => data[year]['Revenue Growth']);
    const netIncomeGrowthData = years.map(year => data[year]['Net Income Growth']);

    return {
      labels: years,
      datasets: [
        {
          label: 'Revenue Growth',
          data: revenueGrowthData,
          borderColor: 'rgb(75, 192, 192)',
          backgroundColor: 'rgba(75, 192, 192, 0.5)',
          tension: 0.1,
        },
        {
          label: 'Net Income Growth',
          data: netIncomeGrowthData,
          borderColor: 'rgb(255, 99, 132)',
          backgroundColor: 'rgba(255, 99, 132, 0.5)',
          tension: 0.1,
        },
      ],
    };
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        text: 'Financial Performance',
      },
    },
    scales: {
      y: {
        ticks: {
          callback: (value) => formatCurrency(value),
        },
      },
    },
  };

  const marginChartOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        text: 'Net Income Margin',
      },
    },
    scales: {
      y: {
        ticks: {
          callback: (value) => formatPercent(value),
        },
      },
    },
  };

  const growthChartOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        text: 'Growth Rates',
      },
    },
    scales: {
      y: {
        ticks: {
          callback: (value) => formatPercent(value),
        },
      },
    },
  };

  if (loading) {
    return <div className="text-center p-4">Loading...</div>;
  }

  if (error) {
    return <div className="text-red-500 p-4">{error}</div>;
  }

  if (!historicalData || !forecastData) {
    return null;
  }

  const historicalGrowthRates = calculateGrowthRates(historicalData);
  const forecastGrowthRates = calculateGrowthRates(forecastData);
  const historicalMargins = calculateMargins(historicalData);
  const forecastMargins = calculateMargins(forecastData);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Historical Data */}
        <Card>
          <CardHeader>
            <CardTitle>Historical Data (TTM)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="h-[300px]">
                <Line data={prepareChartData(historicalData, 'historical')} options={chartOptions} />
              </div>
              <div className="h-[300px]">
                <Line data={prepareMarginChartData(historicalData, 'historical')} options={marginChartOptions} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium">TTM Revenue</h4>
                  <p className="text-2xl font-bold">{formatCurrency(historicalData.ttmMetrics?.revenue)}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium">TTM Net Income</h4>
                  <p className="text-2xl font-bold">{formatCurrency(historicalData.ttmMetrics?.netIncome)}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium">TTM Free Cash Flow</h4>
                  <p className="text-2xl font-bold">{formatCurrency(historicalData.ttmMetrics?.freeCashFlow)}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium">TTM ROIC</h4>
                  <p className="text-2xl font-bold">{formatPercent(historicalData.ttmMetrics?.roic)}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium">Dividend Yield</h4>
                  <p className="text-2xl font-bold">{formatPercent(historicalData.ttmMetrics?.dividendYield)}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Forecast Data */}
        <Card>
          <CardHeader>
            <CardTitle>Forecast Data</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="h-[300px]">
                <Line data={prepareChartData(forecastData, 'forecast')} options={chartOptions} />
              </div>
              <div className="h-[300px]">
                <Line data={prepareMarginChartData(forecastData, 'forecast')} options={marginChartOptions} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium">Projected Revenue (5Y)</h4>
                  <p className="text-2xl font-bold">{formatCurrency(forecastData[forecastData.length - 1]?.revenue)}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium">Projected Net Income (5Y)</h4>
                  <p className="text-2xl font-bold">{formatCurrency(forecastData[forecastData.length - 1]?.netIncome)}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium">Projected FCF (5Y)</h4>
                  <p className="text-2xl font-bold">{formatCurrency(forecastData[forecastData.length - 1]?.freeCashFlow)}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium">Projected ROIC (5Y)</h4>
                  <p className="text-2xl font-bold">{formatPercent(forecastData[forecastData.length - 1]?.roic)}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
} 