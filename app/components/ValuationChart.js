'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TrendingUp, BarChart3, DollarSign, Activity } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const METRICS = [
  { key: 'peRatio', label: 'P/E Ratio', icon: TrendingUp, color: '#8884d8' },
  { key: 'psRatio', label: 'P/Sales Ratio', icon: BarChart3, color: '#82ca9d' },
  { key: 'evEbitda', label: 'EV/EBITDA', icon: Activity, color: '#ffc658' },
  { key: 'fcfYield', label: 'FCF Yield (%)', icon: DollarSign, color: '#ff0000' }
];

export default function ValuationChart({ ticker, data, loading }) {
  const [selectedMetric, setSelectedMetric] = useState('peRatio');
  const [chartData, setChartData] = useState(null);

  useEffect(() => {
    if (data && data.length > 0) {
      processChartData();
    }
  }, [data, selectedMetric]);

  const processChartData = () => {
    if (!data || data.length === 0) return;

    const processedData = data.map(point => ({
      date: new Date(point.date).toLocaleDateString('en-US', {
        month: 'short',
        year: '2-digit'
      }),
      fullDate: point.date,
      [selectedMetric]: point[selectedMetric]
    }));

    setChartData(processedData);
  };

  const selectMetric = (metric) => {
    setSelectedMetric(metric);
  };

  const getMetricValue = (point, metric) => {
    const value = point[metric];
    if (value === null || value === undefined) return 'N/A';
    return value.toFixed(1);
  };

  const getMetricColor = (metric) => {
    const metricConfig = METRICS.find(m => m.key === metric);
    return metricConfig?.color || 'text-gray-600';
  };

  const getMetricIcon = (metric) => {
    const metricConfig = METRICS.find(m => m.key === metric);
    return metricConfig?.icon || TrendingUp;
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-6"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className="p-6">
        <h4 className="text-xl font-semibold mb-4">Historical Valuation - {ticker}</h4>
        <div className="text-center text-gray-500 py-8">
          No historical valuation data available
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h4 className="text-xl font-semibold">Historical Valuation - {ticker}</h4>
        <div className="text-sm text-gray-500">
          {data.length} data points
        </div>
      </div>

      {/* Metric Selection Buttons */}
      <div className="flex flex-wrap gap-2 mb-6">
        {METRICS.map(metric => {
          const Icon = metric.icon;
          const isSelected = selectedMetric === metric.key;

          return (
            <Button
              key={metric.key}
              onClick={() => selectMetric(metric.key)}
              variant={isSelected ? "default" : "outline"}
              size="sm"
              className={`flex items-center space-x-2 ${isSelected ? 'bg-blue-600 text-white' : ''
                }`}
            >
              <Icon className="w-4 h-4" />
              <span>{metric.label}</span>
            </Button>
          );
        })}
      </div>

      {/* Line Chart */}
      <div className="h-80 w-full">
        {chartData && chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="date"
                stroke="#6b7280"
                tick={{ fontSize: 12 }}
              />
              <YAxis
                stroke="#6b7280"
                tick={{ fontSize: 12 }}
                domain={['dataMin - 5', 'dataMax + 5']}
              />
              <Tooltip
                formatter={(value, name) => [value?.toFixed(2) || 'N/A', name]}
                labelFormatter={(label) => `Date: ${label}`}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey={selectedMetric}
                stroke={METRICS.find(m => m.key === selectedMetric)?.color || '#8884d8'}
                strokeWidth={2}
                dot={{ fill: METRICS.find(m => m.key === selectedMetric)?.color || '#8884d8', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, stroke: METRICS.find(m => m.key === selectedMetric)?.color || '#8884d8', strokeWidth: 2 }}
                name={METRICS.find(m => m.key === selectedMetric)?.label}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-center text-gray-500 py-8">
            No data available for selected metrics
          </div>
        )}
      </div>

      {/* Summary Statistics */}
      {chartData && chartData.length > 0 && (
        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <h5 className="font-semibold mb-3">Summary Statistics</h5>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {(() => {
              const values = chartData
                .map(point => point[selectedMetric])
                .filter(val => val !== null && val !== undefined && !isNaN(val));

              if (values.length === 0) return null;

              const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
              const min = Math.min(...values);
              const max = Math.max(...values);
              const current = values[values.length - 1];
              const metricConfig = METRICS.find(m => m.key === selectedMetric);

              return (
                <div className="text-center">
                  <div className="text-sm font-medium text-gray-600 mb-1">
                    {metricConfig?.label}
                  </div>
                  <div className="text-lg font-bold" style={{ color: metricConfig?.color }}>
                    {current.toFixed(1)}
                  </div>
                  <div className="text-xs text-gray-500">
                    Avg: {avg.toFixed(1)} | Range: {min.toFixed(1)}-{max.toFixed(1)}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </Card>
  );
}
