'use client';

import { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  CircleDot,
  Clock3,
  Database,
  ExternalLink,
  FileSearch,
  GitBranch,
  Lightbulb,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

const PHASE_STYLES = {
  input: {
    label: 'Inputs',
    icon: Database,
    card: 'border-slate-200 bg-slate-50/90 hover:border-slate-300',
    badge: 'bg-slate-100 text-slate-600',
    iconBg: 'bg-slate-200 text-slate-600',
    dot: 'bg-slate-400',
  },
  analysis: {
    label: 'Analysis',
    icon: Lightbulb,
    card: 'border-violet-200 bg-violet-50/80 hover:border-violet-300',
    badge: 'bg-violet-100 text-violet-700',
    iconBg: 'bg-violet-200 text-violet-700',
    dot: 'bg-violet-500',
  },
  research: {
    label: 'Research',
    icon: Search,
    card: 'border-slate-200 bg-white hover:border-blue-300',
    badge: 'bg-blue-100 text-blue-700',
    iconBg: 'bg-blue-200 text-blue-700',
    dot: 'bg-blue-500',
  },
  forecast: {
    label: 'Forecast',
    icon: Sparkles,
    card: 'border-emerald-200 bg-emerald-50/80 hover:border-emerald-300',
    badge: 'bg-emerald-100 text-emerald-700',
    iconBg: 'bg-emerald-200 text-emerald-700',
    dot: 'bg-emerald-500',
  },
  validation: {
    label: 'Validation',
    icon: ShieldCheck,
    card: 'border-amber-200 bg-amber-50/80 hover:border-amber-300',
    badge: 'bg-amber-100 text-amber-700',
    iconBg: 'bg-amber-200 text-amber-700',
    dot: 'bg-amber-500',
  },
  valuation: {
    label: 'Valuation',
    icon: BarChart3,
    card: 'border-indigo-200 bg-indigo-50/80 hover:border-indigo-300',
    badge: 'bg-indigo-100 text-indigo-700',
    iconBg: 'bg-indigo-200 text-indigo-700',
    dot: 'bg-indigo-500',
  },
};

function titleCase(value = '') {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function compactText(value, maxLength = 108) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (!text) return 'No summary returned';
  return text.length > maxLength ? `${text.slice(0, maxLength).trim()}…` : text;
}

function cleanText(value) {
  return String(value)
    .replace(/\\r/g, '')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, ' ')
    .replace(/```[a-zA-Z0-9_-]*|```/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/^\s*#{1,6}\s*/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/\[(\d+(?:\s*,\s*\d+)*)\]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function readableLabel(value) {
  return titleCase(String(value).replace(/([a-z])([A-Z])/g, '$1 $2'));
}

function readablePayload(value, depth = 0) {
  if (value === undefined || value === null || value === '') return 'No structured return was recorded.';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        return readablePayload(JSON.parse(trimmed), depth);
      } catch {
        return cleanText(value);
      }
    }
    return cleanText(value);
  }
  if (typeof value !== 'object') return cleanText(value);

  if (Array.isArray(value)) {
    return value
      .map((item) => readablePayload(item, depth + 1))
      .filter(Boolean)
      .join('\n\n');
  }

  return Object.entries(value)
    .map(([key, item]) => {
      const label = readableLabel(key);
      const formatted = readablePayload(item, depth + 1);
      const isNested = item && typeof item === 'object';
      return isNested ? `${label}\n${formatted}` : `${label}: ${formatted}`;
    })
    .join('\n\n');
}

function getStepSummary(step) {
  const output = step?.output || {};
  return output.findings || output.summary || output.forecast_summary || output.validation_summary || step?.input || 'Completed this stage.';
}

function normalizeSteps(valuation) {
  const trail = Array.isArray(valuation?.research_trail) ? valuation.research_trail : [];
  const historicalCount = Array.isArray(valuation?.historicalFinancials) ? valuation.historicalFinancials.length : 0;
  const inputNode = {
    id: 'inputs',
    phase: 'input',
    title: 'Load financial context',
    task: 'Combine reported financials, market data, and valuation settings.',
    input: `${historicalCount || 'Available'} historical periods and live market context`,
    output: {
      historical_periods: historicalCount,
      source: valuation?.source || 'agentic',
      method: valuation?.method || valuation?.valuationMethod || 'valuation',
    },
    metadata: { confidence: 'high' },
  };
  const trailNodes = [];

  trail.forEach((step, index) => {
    const phase = ['analysis', 'research', 'forecast', 'validation'].includes(step?.step) ? step.step : 'research';
    trailNodes.push({
      id: `${phase}-${index}`,
      phase,
      title: phase === 'research' ? `Research pass ${index + 1}` : titleCase(phase),
      task: step?.input || `Complete the ${phase} stage.`,
      input: step?.input || 'No prompt recorded.',
      output: step?.output,
      metadata: step?.metadata || {},
      original: step,
    });
  });

  const placeholder = (phase, task) => ({
    id: `${phase}-pending`,
    phase,
    title: titleCase(phase),
    task,
    input: 'This stage did not include a detailed trace in the returned response.',
    output: { status: 'completed', detail: 'The workflow completed without step-level payloads.' },
    metadata: { confidence: 'medium' },
  });
  const firstForPhase = (phase, fallbackTask) => trailNodes.find((node) => node.phase === phase) || placeholder(phase, fallbackTask);

  const valuationNode = {
    id: 'valuation',
    phase: 'valuation',
    title: `${titleCase(valuation?.method || valuation?.valuationMethod || 'DCF')} head`,
    task: 'Translate the validated forecast into a fair value estimate.',
    input: `Use the ${valuation?.method || valuation?.valuationMethod || 'selected'} valuation method.`,
    output: valuation?.dcfCalculation || valuation?.exitMultipleCalculation || {
      fairValue: valuation?.fairValue,
      upside: valuation?.upside,
      cagr: valuation?.cagr,
    },
    metadata: {
      confidence: valuation?.confidence || 'medium',
      total_cost: valuation?.total_cost,
      total_time_seconds: valuation?.total_time_seconds,
    },
  };

  return [
    inputNode,
    firstForPhase('analysis', 'Frame the company-specific questions the forecast needs to answer.'),
    ...trailNodes.filter((node) => node.phase === 'research'),
    firstForPhase('forecast', 'Synthesize the research into a year-by-year financial forecast.'),
    firstForPhase('validation', 'Challenge the forecast for internal consistency and credibility.'),
    valuationNode,
  ];
}

function PhaseIcon({ phase, size = 16 }) {
  const Icon = PHASE_STYLES[phase]?.icon || CircleDot;
  return <Icon size={size} strokeWidth={2.2} />;
}

function NodeCard({ node, selected, onSelect, compact = false }) {
  const style = PHASE_STYLES[node.phase] || PHASE_STYLES.research;
  const metadata = node.metadata || {};
  const isLowConfidence = ['low', 'medium'].includes(String(metadata.confidence || '').toLowerCase());

  return (
    <button
      type="button"
      onClick={() => onSelect(node)}
      aria-pressed={selected}
      className={`group relative w-full rounded-2xl border p-3 text-left shadow-sm transition-all duration-200 ${style.card} ${selected ? 'ring-2 ring-indigo-500 ring-offset-2 shadow-lg -translate-y-0.5' : 'hover:-translate-y-0.5 hover:shadow-md'}`}
    >
      <span className={`absolute -left-1.5 top-5 h-3 w-3 rounded-full border-2 border-white ${style.dot}`} />
      <div className="flex items-start gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${style.iconBg}`}>
          <PhaseIcon phase={node.phase} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className={`text-[10px] font-bold uppercase tracking-[0.16em] ${style.badge.split(' ')[1]}`}>
              {style.label}
            </span>
            <CheckCircle2 size={14} className="shrink-0 text-emerald-500" />
          </span>
          <span className="mt-1 block text-sm font-semibold text-slate-900">{node.title}</span>
          {!compact && <span className="mt-1 block text-xs leading-5 text-slate-600">{compactText(getStepSummary(node))}</span>}
        </span>
      </div>
      <span className="mt-3 flex items-center justify-between border-t border-black/5 pt-2 text-[11px] text-slate-500">
        <span>{metadata.tokens_used ? `${metadata.tokens_used.toLocaleString()} tokens` : 'Trace captured'}</span>
        <span className={isLowConfidence ? 'text-amber-600' : 'text-emerald-600'}>
          {metadata.confidence ? `${titleCase(metadata.confidence)} confidence` : 'Completed'}
        </span>
      </span>
    </button>
  );
}

function Connector({ vertical = false }) {
  return (
    <div className={`flex shrink-0 items-center justify-center text-slate-300 ${vertical ? 'h-7' : 'w-9'}`} aria-hidden="true">
      {vertical ? <ArrowDown size={18} /> : <ArrowRight size={18} />}
    </div>
  );
}

function DetailPanel({ node }) {
  const style = PHASE_STYLES[node.phase] || PHASE_STYLES.research;
  const metadata = node.metadata || {};
  const sources = Array.isArray(metadata.sources) ? metadata.sources : [];

  return (
    <aside className="flex min-h-[540px] flex-col rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${style.badge}`}>
              {style.label}
            </span>
            <span className="text-xs text-slate-500">{node.id}</span>
          </div>
          <h4 className="text-lg font-semibold text-slate-900">{node.title}</h4>
          <p className="mt-1 text-xs leading-5 text-slate-600">{node.task}</p>
        </div>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${style.iconBg}`}>
          <PhaseIcon phase={node.phase} />
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 border-b border-slate-200 py-4 sm:grid-cols-4">
        <Metric label="Status" value="Complete" icon={<CheckCircle2 size={13} />} />
        <Metric label="Confidence" value={titleCase(metadata.confidence || 'medium')} icon={<ShieldCheck size={13} />} />
        <Metric label="Tokens" value={metadata.tokens_used ? metadata.tokens_used.toLocaleString() : '—'} icon={<Sparkles size={13} />} />
        <Metric label="Duration" value={metadata.duration_ms ? `${(metadata.duration_ms / 1000).toFixed(1)}s` : '—'} icon={<Clock3 size={13} />} />
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pt-4">
        <TraceBlock label="Task / prompt" value={node.input} />
        <TraceBlock label="Returned payload" value={readablePayload(node.output)} />
        {sources.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
              <FileSearch size={13} /> Sources used
            </div>
            <div className="space-y-2">
              {sources.map((source, index) => (
                <a
                  key={`${source}-${index}`}
                  href={source}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-blue-700 transition-colors hover:bg-blue-50 hover:text-blue-800"
                >
                  <ExternalLink size={13} />
                  <span className="truncate">{source}</span>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

function Metric({ label, value, icon }) {
  return (
    <div className="rounded-xl bg-slate-50 px-2.5 py-2">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-500">{icon}{label}</div>
      <div className="mt-1 truncate text-xs font-semibold text-slate-800">{value}</div>
    </div>
  );
}

function TraceBlock({ label, value }) {
  return (
    <div>
      <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="max-h-32 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-sm leading-6 text-slate-700 whitespace-pre-line">
        {value || 'No data recorded.'}
      </div>
    </div>
  );
}

export default function AgentFlowGraph({ valuation, isOpen = true, onToggle }) {
  const nodes = useMemo(() => normalizeSteps(valuation), [valuation]);
  const [selectedId, setSelectedId] = useState(nodes[nodes.length - 1]?.id);
  const selectedNode = nodes.find((node) => node.id === selectedId) || nodes[nodes.length - 1];
  const researchNodes = nodes.filter((node) => node.phase === 'research');
  const analysisNode = nodes.find((node) => node.phase === 'analysis');
  const forecastNode = nodes.find((node) => node.phase === 'forecast');
  const validationNode = nodes.find((node) => node.phase === 'validation');
  const inputNode = nodes.find((node) => node.phase === 'input');
  const valuationNode = nodes.find((node) => node.phase === 'valuation');

  if (!valuation || valuation.source !== 'agentic') return null;

  return (
    <section className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 border-b border-slate-100 px-5 py-5 text-left transition-colors hover:bg-slate-50 sm:px-7"
      >
        <span className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700">
            <GitBranch size={21} />
          </span>
          <span>
            <span className="block text-base font-bold text-slate-900">Agent execution graph</span>
            <span className="mt-1 block text-xs text-slate-500">Click any task to inspect its prompt, returned payload, confidence, and sources.</span>
          </span>
        </span>
        <span className="hidden items-center gap-2 text-xs font-semibold text-indigo-600 sm:flex">
          {nodes.length} nodes <span className="text-slate-300">·</span> {isOpen ? 'Hide graph' : 'Show graph'}
        </span>
      </button>

      {isOpen && (
        <div className="space-y-5 p-4 sm:p-6">
          <div className="min-w-0 overflow-x-auto rounded-2xl border border-slate-200 bg-[radial-gradient(#dbe4f0_1px,transparent_1px)] [background-size:18px_18px] p-5 sm:p-7">
            <div className="mb-5 flex min-w-[1080px] items-center justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Decision pipeline</div>
                <div className="mt-1 text-sm font-semibold text-slate-700">From raw context to an auditable valuation</div>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                <span className="h-2 w-2 rounded-full bg-emerald-500" /> Completed
              </div>
            </div>

            <div className="flex min-w-[1080px] items-center">
              <div className="w-[148px] shrink-0"><NodeCard node={inputNode} selected={selectedId === inputNode?.id} onSelect={(node) => setSelectedId(node.id)} /></div>
              <Connector />
              <div className="w-[148px] shrink-0"><NodeCard node={analysisNode} selected={selectedId === analysisNode?.id} onSelect={(node) => setSelectedId(node.id)} /></div>
              <Connector />
              <div className="flex w-[218px] shrink-0 flex-col items-center rounded-2xl border border-slate-200 bg-white p-3">
                <div className="mb-2 flex w-full items-center justify-between px-1">
                  <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Parallel research</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{researchNodes.length || 1} passes</span>
                </div>
                <div className="grid w-full gap-2">
                  {(researchNodes.length ? researchNodes : [{ id: 'research-empty', phase: 'research', title: 'Research trail', task: 'No detailed research pass was returned.', metadata: {} }]).map((node) => (
                    <NodeCard key={node.id} node={node} compact selected={selectedId === node.id} onSelect={(selected) => setSelectedId(selected.id)} />
                  ))}
                </div>
              </div>
              <Connector />
              <div className="w-[148px] shrink-0"><NodeCard node={forecastNode} selected={selectedId === forecastNode?.id} onSelect={(node) => setSelectedId(node.id)} /></div>
              <Connector />
              <div className="w-[148px] shrink-0"><NodeCard node={validationNode} selected={selectedId === validationNode?.id} onSelect={(node) => setSelectedId(node.id)} /></div>
              <Connector />
              <div className="w-[148px] shrink-0"><NodeCard node={valuationNode} selected={selectedId === valuationNode?.id} onSelect={(node) => setSelectedId(node.id)} /></div>
            </div>

            <div className="mt-5 flex min-w-[1080px] items-center justify-center gap-2 text-[11px] text-slate-400">
              <span className="h-px w-16 bg-slate-200" />
              <span>Every node is clickable</span>
              <span className="h-px w-16 bg-slate-200" />
            </div>
          </div>

          <DetailPanel node={selectedNode} />
        </div>
      )}
    </section>
  );
}
