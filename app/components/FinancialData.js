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
import { Card } from '@/components/ui/card';

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

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
  };

  const formatPercent = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'percent',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(value);
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
    const years = Object.keys(data).sort();
    const revenueData = years.map(year => data[year].Revenue);
    const netIncomeData = years.map(year => data[year]['Net Income']);

    return {
      labels: years,
      datasets: [
        {
          label: 'Revenue',
          data: revenueData,
          borderColor: 'rgb(75, 192, 192)',
          backgroundColor: 'rgba(75, 192, 192, 0.5)',
          tension: 0.1,
        },
        {
          label: 'Net Income',
          data: netIncomeData,
          borderColor: 'rgb(255, 99, 132)',
          backgroundColor: 'rgba(255, 99, 132, 0.5)',
          tension: 0.1,
        },
      ],
    };
  };

  const prepareMarginChartData = (data) => {
    const years = Object.keys(data).sort();
    const marginData = years.map(year => data[year]['Net Income Margin']);

    return {
      labels: years,
      datasets: [
        {
          label: 'Net Income Margin',
          data: marginData,
          borderColor: 'rgb(153, 102, 255)',
          backgroundColor: 'rgba(153, 102, 255, 0.5)',
          tension: 0.1,
        },
      ],
    };
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
      <Card className="p-6">
        <h2 className="text-2xl font-bold mb-4">Historical Data</h2>
        <div className="h-[400px] mb-4">
          <Line data={prepareChartData(historicalData, 'historical')} options={chartOptions} />
        </div>
        <div className="h-[400px] mb-4">
          <Line data={prepareMarginChartData(historicalMargins)} options={marginChartOptions} />
        </div>
        <div className="h-[400px] mb-4">
          <Line data={prepareGrowthChartData(historicalGrowthRates)} options={growthChartOptions} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          {Object.entries(historicalData).map(([year, data]) => (
            <div key={year} className="border p-4 rounded">
              <h3 className="font-bold">{year}</h3>
              <p>Revenue: {formatCurrency(data.Revenue)}</p>
              <p>Net Income: {formatCurrency(data['Net Income'])}</p>
              <p>Net Income Margin: {formatPercent(data['Net Income'] / data.Revenue)}</p>
              {historicalGrowthRates[year] && (
                <>
                  <p>Revenue Growth: {formatPercent(historicalGrowthRates[year]['Revenue Growth'])}</p>
                  <p>Net Income Growth: {formatPercent(historicalGrowthRates[year]['Net Income Growth'])}</p>
                </>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-2xl font-bold mb-4">Forecast Data</h2>
        <div className="h-[400px] mb-4">
          <Line data={prepareChartData(forecastData, 'forecast')} options={chartOptions} />
        </div>
        <div className="h-[400px] mb-4">
          <Line data={prepareMarginChartData(forecastMargins)} options={marginChartOptions} />
        </div>
        <div className="h-[400px] mb-4">
          <Line data={prepareGrowthChartData(forecastGrowthRates)} options={growthChartOptions} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          {Object.entries(forecastData).map(([year, data]) => (
            <div key={year} className="border p-4 rounded">
              <h3 className="font-bold">{year}</h3>
              <p>Revenue: {formatCurrency(data.Revenue)}</p>
              <p>Net Income: {formatCurrency(data['Net Income'])}</p>
              <p>Net Income Margin: {formatPercent(data['Net Income'] / data.Revenue)}</p>
              {forecastGrowthRates[year] && (
                <>
                  <p>Revenue Growth: {formatPercent(forecastGrowthRates[year]['Revenue Growth'])}</p>
                  <p>Net Income Growth: {formatPercent(forecastGrowthRates[year]['Net Income Growth'])}</p>
                </>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
} 