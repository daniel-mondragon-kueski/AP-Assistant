import React, { useState } from 'react';
import {
  Filter,
  Search,
  Calendar,
  ShieldAlert,
  Sparkles,
  RefreshCw,
  Sliders,
  Code,
  Tag,
  AtSign,
  Paperclip,
  Ban,
  Check,
  Flame,
  Zap,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  BookmarkCheck,
  Clock,
  Layers,
  Target,
  Scale,
  Globe,
  ShieldCheck,
  CheckSquare,
  FileText,
  Plus,
  X,
  FileCheck,
  CalendarDays,
  RotateCcw,
  CheckCircle2,
  Inbox,
  Trash2,
} from 'lucide-react';
import { EmailFilterCriteria, DraftTemplateConfig } from '../types';

interface CriteriaPanelProps {
  criteria: EmailFilterCriteria;
  setCriteria: React.Dispatch<React.SetStateAction<EmailFilterCriteria>>;
  templates?: DraftTemplateConfig[];
  onRunScan: () => void;
  isScanning: boolean;
  onLoadDemoData: () => void;
  ordersCount: number;
  isAuthenticated?: boolean;
  onResetToZero?: () => void;
  onClearRadarOrders?: () => void;
}

const DEFAULT_SUBJECT_KEYWORDS = [
  'PO',
  'OC',
  'Orden de Compra',
  'Purchase Order',
  'Factura',
  'Invoice',
  'Pago Urgente',
  'Anticipo',
  'Vencimiento',
];

const DEFAULT_EXCLUDE_KEYWORDS = ['newsletter', 'publicidad', 'promoción', 'spam'];

export const CriteriaPanel: React.FC<CriteriaPanelProps> = ({
  criteria,
  setCriteria,
  templates = [],
  onRunScan,
  isScanning,
  onLoadDemoData,
  ordersCount,
  isAuthenticated = false,
  onResetToZero,
  onClearRadarOrders,
}) => {
  const [activeMode, setActiveMode] = useState<'step_by_step' | 'two_level' | 'visual' | 'query' | 'alert_rules'>('step_by_step');
  const [showExplanation, setShowExplanation] = useState(false);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState(false);
  const [newSecondaryKeyword, setNewSecondaryKeyword] = useState('');

  // Step-by-step assistant local state
  const [step1SubjectInput, setStep1SubjectInput] = useState<string>(() => {
    const match = (criteria.searchQuery || '').match(/subject:\(([^)]+)\)/i);
    if (match && match[1]) {
      return match[1].replace(/["']/g, '');
    }
    return 'ADELANTO DE PAGO';
  });

  const applyCleanSubject = (subjectText: string) => {
    const cleanText = subjectText.replace(/["'\[\]]/g, '').trim();
    const newQuery = cleanText
      ? `in:inbox -in:drafts -is:draft subject:("${cleanText}")`
      : 'in:inbox -in:drafts -is:draft';
    setCriteria(prev => ({
      ...prev,
      searchQuery: newQuery,
      onlyInbox: true,
      subjectKeywords: cleanText ? [cleanText] : [],
    }));
  };

  const handleApplyStep1 = () => {
    applyCleanSubject(step1SubjectInput);
  };

  let computedGmailQuery = criteria.searchQuery || '';
  if (criteria.onlyInbox !== false) {
    computedGmailQuery = computedGmailQuery.replace(/\bin:drafts?\b/gi, '').replace(/\bis:draft\b/gi, '').trim();
    if (!/\bin:inbox\b/i.test(computedGmailQuery)) {
      computedGmailQuery = `in:inbox -in:drafts -is:draft ${computedGmailQuery}`.trim();
    } else if (!/\b-in:drafts\b/i.test(computedGmailQuery)) {
      computedGmailQuery = `${computedGmailQuery} -in:drafts -is:draft`.trim();
    }
  }
  if (criteria.senderFilter) {
    computedGmailQuery += ` from:${criteria.senderFilter.trim()}`;
  }
  if (criteria.dateFilterMode === 'specific_date' && criteria.startDate) {
    computedGmailQuery += ` after:${criteria.startDate.replace(/-/g, '/')}`;
  } else if (criteria.daysLookback) {
    computedGmailQuery += ` newer_than:${criteria.daysLookback}d`;
  }
  if (criteria.hasAttachment) {
    computedGmailQuery += ' has:attachment';
  }
  if (criteria.excludeKeywords && criteria.excludeKeywords.length > 0) {
    criteria.excludeKeywords.forEach(k => {
      computedGmailQuery += ` -${k}`;
    });
  }

  // Two-level filtration helper handlers
  const filterMode = criteria.filterMode || 'hybrid';
  const templateTolerance = criteria.templateTolerance || 'flexible';
  const secondaryConfig = criteria.secondaryFilter || {
    enabled: true,
    includePaymentDates: true,
    includeDispersions: true,
    includeSpecificRequests: true,
    customKeywords: ['dispersión', 'SPEI', 'Tesorería', 'layout bancario', 'lote de pago'],
  };

  const handleSetFilterMode = (mode: 'strict_templates' | 'hybrid' | 'broad') => {
    setCriteria((prev) => ({
      ...prev,
      filterMode: mode,
    }));
  };

  const handleSetTolerance = (tol: 'strict' | 'balanced' | 'flexible') => {
    const scoreMap = { flexible: 65, balanced: 75, strict: 85 };
    setCriteria((prev) => ({
      ...prev,
      templateTolerance: tol,
      minTemplateScore: scoreMap[tol],
    }));
  };

  const handleToggleSecondaryFilter = (enabled: boolean) => {
    setCriteria((prev) => ({
      ...prev,
      secondaryFilter: {
        ...(prev.secondaryFilter || secondaryConfig),
        enabled,
      },
    }));
  };

  const handleToggleSecondaryOption = (
    key: 'includePaymentDates' | 'includeDispersions' | 'includeSpecificRequests'
  ) => {
    setCriteria((prev) => ({
      ...prev,
      secondaryFilter: {
        ...(prev.secondaryFilter || secondaryConfig),
        [key]: !prev.secondaryFilter?.[key],
      },
    }));
  };

  const handleAddSecondaryKeyword = () => {
    const trimmed = newSecondaryKeyword.trim();
    if (!trimmed) return;
    const currentList = criteria.secondaryFilter?.customKeywords || secondaryConfig.customKeywords;
    if (!currentList.includes(trimmed)) {
      const nextList = [...currentList, trimmed];
      setCriteria((prev) => ({
        ...prev,
        secondaryFilter: {
          ...(prev.secondaryFilter || secondaryConfig),
          customKeywords: nextList,
        },
      }));
    }
    setNewSecondaryKeyword('');
  };

  const handleRemoveSecondaryKeyword = (kwToRemove: string) => {
    const currentList = criteria.secondaryFilter?.customKeywords || secondaryConfig.customKeywords;
    const nextList = currentList.filter((k) => k !== kwToRemove);
    setCriteria((prev) => ({
      ...prev,
      secondaryFilter: {
        ...(prev.secondaryFilter || secondaryConfig),
        customKeywords: nextList,
      },
    }));
  };

  const handleSetPresetDate = (type: 'today' | 'month_start' | '7d' | '15d' | '30d' | 'prev_month') => {
    const today = new Date();
    let target = new Date();

    if (type === 'today') {
      target = today;
    } else if (type === 'month_start') {
      target = new Date(today.getFullYear(), today.getMonth(), 1);
    } else if (type === '7d') {
      target.setDate(today.getDate() - 7);
    } else if (type === '15d') {
      target.setDate(today.getDate() - 15);
    } else if (type === '30d') {
      target.setDate(today.getDate() - 30);
    } else if (type === 'prev_month') {
      target = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    }

    const dateStr = target.toISOString().split('T')[0];
    setCriteria((prev) => ({
      ...prev,
      dateFilterMode: 'specific_date',
      startDate: dateStr,
    }));
  };

  // Visual builder local states
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>(() => {
    return criteria.subjectKeywords || ['PO', 'OC', 'Orden de Compra', 'Factura', 'Pago Urgente', 'Anticipo'];
  });
  const [customKeywordInput, setCustomKeywordInput] = useState('');

  const [senderFilter, setSenderFilter] = useState(criteria.senderFilter || '');
  const [requireAttachment, setRequireAttachment] = useState(criteria.hasAttachment || false);

  const [excludeKeywords, setExcludeKeywords] = useState<string[]>(() => {
    return (criteria.excludeKeywords || ['newsletter', 'publicidad']).filter(k => k.toLowerCase() !== 'marketing');
  });
  const [customExcludeInput, setCustomExcludeInput] = useState('');

  const [urgentDays, setUrgentDays] = useState(criteria.urgentDaysThreshold || 3);

  // Quick preset queries (enforcing Inbox only, no drafts)
  const quickPresets = [
    {
      label: '[ADELANTO DE PAGO] & Urgentes (Solo Recibidos)',
      desc: 'Plantillas oficiales de adelantos y pagos urgentes en bandeja de entrada (sin borradores)',
      query: 'in:inbox -in:drafts -is:draft subject:("ADELANTO DE PAGO" OR "PAGO URGENTE" OR "ANTICIPO DE PAGO")',
      keywords: ['[ADELANTO DE PAGO]', '[PAGO URGENTE]', 'Adelanto de Pago', 'Anticipo'],
    },
    {
      label: 'Órdenes de Compra & POs (Solo Recibidos)',
      desc: 'Enfocado en números de PO y órdenes formales recibidas',
      query: 'in:inbox -in:drafts -is:draft subject:(PO OR "orden de compra" OR "purchase order" OR OC)',
      keywords: ['PO', 'OC', 'Orden de Compra', 'Purchase Order'],
    },
    {
      label: 'Facturas & Pagos Urgentes (Solo Recibidos)',
      desc: 'Detecta facturas por vencer o marcadas como urgentes recibidas',
      query: 'in:inbox -in:drafts -is:draft subject:(urgente OR factura OR vencer OR pago OR invoice)',
      keywords: ['Factura', 'Invoice', 'Pago Urgente', 'Vencimiento'],
    },
    {
      label: 'Anticipos & Adelantos (Solo Recibidos)',
      desc: 'Filtra pagos parciales requeridos antes de entrega en Inbox',
      query: 'in:inbox -in:drafts -is:draft subject:(adelanto OR anticipo OR "down payment")',
      keywords: ['Anticipo', 'Adelanto'],
    },
    {
      label: 'Auditoría Integral de Compras (Solo Recibidos)',
      desc: 'Criterio amplio para escanear todo el flujo de compras en Inbox',
      query: 'in:inbox -in:drafts -is:draft subject:(pago OR "orden de compra" OR PO OR OC OR factura OR anticipo)',
      keywords: ['PO', 'OC', 'Orden de Compra', 'Factura', 'Anticipo'],
    },
  ];

  // Helper to construct Gmail query from visual builder
  const buildQueryFromVisual = (
    keywords: string[],
    sender: string,
    attachment: boolean,
    excludes: string[]
  ) => {
    const parts: string[] = ['in:inbox', '-in:drafts', '-is:draft'];

    if (keywords.length > 0) {
      const kwFormatted = keywords.map((k) => (k.includes(' ') ? `"${k}"` : k)).join(' OR ');
      parts.push(`subject:(${kwFormatted})`);
    }

    if (sender.trim()) {
      parts.push(`from:${sender.trim()}`);
    }

    if (attachment) {
      parts.push('has:attachment');
    }

    if (excludes.length > 0) {
      excludes.forEach((ex) => {
        parts.push(`-${ex.includes(' ') ? `"${ex}"` : ex}`);
      });
    }

    return parts.join(' ');
  };

  // Sync visual updates into criteria
  const handleKeywordToggle = (keyword: string) => {
    let next: string[];
    if (selectedKeywords.includes(keyword)) {
      next = selectedKeywords.filter((k) => k !== keyword);
    } else {
      next = [...selectedKeywords, keyword];
    }
    setSelectedKeywords(next);
    const updatedQuery = buildQueryFromVisual(next, senderFilter, requireAttachment, excludeKeywords);
    setCriteria((prev) => ({
      ...prev,
      subjectKeywords: next,
      searchQuery: updatedQuery,
    }));
  };

  const handleAddCustomKeyword = () => {
    const trimmed = customKeywordInput.trim();
    if (trimmed && !selectedKeywords.includes(trimmed)) {
      const next = [...selectedKeywords, trimmed];
      setSelectedKeywords(next);
      setCustomKeywordInput('');
      const updatedQuery = buildQueryFromVisual(next, senderFilter, requireAttachment, excludeKeywords);
      setCriteria((prev) => ({
        ...prev,
        subjectKeywords: next,
        searchQuery: updatedQuery,
      }));
    }
  };

  const handleSenderChange = (val: string) => {
    setSenderFilter(val);
    const updatedQuery = buildQueryFromVisual(selectedKeywords, val, requireAttachment, excludeKeywords);
    setCriteria((prev) => ({
      ...prev,
      senderFilter: val,
      searchQuery: updatedQuery,
    }));
  };

  const handleAttachmentToggle = (checked: boolean) => {
    setRequireAttachment(checked);
    const updatedQuery = buildQueryFromVisual(selectedKeywords, senderFilter, checked, excludeKeywords);
    setCriteria((prev) => ({
      ...prev,
      hasAttachment: checked,
      searchQuery: updatedQuery,
    }));
  };

  const handleExcludeToggle = (word: string) => {
    let next: string[];
    if (excludeKeywords.includes(word)) {
      next = excludeKeywords.filter((w) => w !== word);
    } else {
      next = [...excludeKeywords, word];
    }
    setExcludeKeywords(next);
    const updatedQuery = buildQueryFromVisual(selectedKeywords, senderFilter, requireAttachment, next);
    setCriteria((prev) => ({
      ...prev,
      excludeKeywords: next,
      searchQuery: updatedQuery,
    }));
  };

  const handleAddCustomExclude = () => {
    const trimmed = customExcludeInput.trim();
    if (trimmed && !excludeKeywords.includes(trimmed)) {
      const next = [...excludeKeywords, trimmed];
      setExcludeKeywords(next);
      setCustomExcludeInput('');
      const updatedQuery = buildQueryFromVisual(selectedKeywords, senderFilter, requireAttachment, next);
      setCriteria((prev) => ({
        ...prev,
        excludeKeywords: next,
        searchQuery: updatedQuery,
      }));
    }
  };

  const handleApplyPreset = (preset: (typeof quickPresets)[0]) => {
    setSelectedKeywords(preset.keywords);
    setCriteria((prev) => ({
      ...prev,
      searchQuery: preset.query,
      subjectKeywords: preset.keywords,
    }));
  };

  const handleSaveAsDefault = () => {
    localStorage.setItem('ap_filter_criteria', JSON.stringify(criteria));
    setSaveSuccessNotice(true);
    setTimeout(() => setSaveSuccessNotice(false), 2500);
  };

  return (
    <div id="criteria-panel" className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
      {/* Top Header Bar */}
      <div className="p-5 border-b border-slate-200/80 bg-slate-50/50">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-lg">
                <Filter className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  Configuración de Criterios y Contexto para Alertas
                  <span className="text-[10px] uppercase font-semibold px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-full">
                    Filtro Activo
                  </span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Aquí defines exactamente qué correos extrae el Agente de Gmail para construir el contexto de auditoría, detectar pagos duplicados y alertar vencimientos.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Quick Date Control in Top Bar */}
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg p-1 text-xs shadow-2xs">
              <span className="text-[11px] font-semibold text-slate-600 pl-1 flex items-center gap-1">
                <CalendarDays className="w-3.5 h-3.5 text-indigo-600" />
                Fecha:
              </span>
              <select
                value={criteria.dateFilterMode || 'lookback_days'}
                onChange={(e) => {
                  const mode = e.target.value as 'specific_date' | 'lookback_days';
                  setCriteria((prev) => ({
                    ...prev,
                    dateFilterMode: mode,
                  }));
                }}
                className="text-xs bg-slate-50 border border-slate-200 rounded px-1.5 py-1 text-slate-700 font-medium focus:outline-none"
              >
                <option value="specific_date">A partir de fecha</option>
                <option value="lookback_days">Días recientes</option>
              </select>

              {criteria.dateFilterMode === 'specific_date' ? (
                <div className="flex items-center gap-1">
                  <input
                    type="date"
                    value={criteria.startDate || ''}
                    onChange={(e) => {
                      setCriteria((prev) => ({
                        ...prev,
                        startDate: e.target.value,
                      }));
                    }}
                    title="Escanear correos recibidos a partir de esta fecha (Gmail after:)"
                    className="text-xs bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-slate-800 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    title="Fijar fecha al 20 de septiembre (garantiza incluir correos de ayer de Mariana Herrera)"
                    onClick={() => {
                      setCriteria((prev) => ({
                        ...prev,
                        startDate: '2026-09-20',
                      }));
                    }}
                    className="px-1.5 py-0.5 text-[10px] bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded border border-indigo-200 font-medium cursor-pointer"
                  >
                    Sep 20
                  </button>
                </div>
              ) : (
                <select
                  value={criteria.daysLookback || 30}
                  onChange={(e) => {
                    setCriteria((prev) => ({
                      ...prev,
                      daysLookback: Number(e.target.value),
                    }));
                  }}
                  className="text-xs bg-slate-50 border border-slate-200 rounded px-1.5 py-1 text-slate-700 font-medium focus:outline-none"
                >
                  <option value={7}>Últimos 7 días</option>
                  <option value={15}>Últimos 15 días</option>
                  <option value={30}>Últimos 30 días</option>
                  <option value={60}>Últimos 60 días</option>
                  <option value={90}>Últimos 90 días</option>
                </select>
              )}
            </div>

            <button
              type="button"
              id="btn-toggle-criteria-help"
              onClick={() => setShowExplanation(!showExplanation)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
            >
              <HelpCircle className="w-3.5 h-3.5 text-indigo-600" />
              <span>¿Cómo funciona el contexto?</span>
              {showExplanation ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            <button
              type="button"
              id="btn-load-demo"
              onClick={onLoadDemoData}
              title="Carga correos y órdenes de compra de ejemplo para explorar las alertas y borradores inmediatamente"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 rounded-lg transition-colors border border-slate-200 shadow-2xs"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              Datos de Muestra
            </button>

            <button
              type="button"
              id="btn-run-scan"
              onClick={onRunScan}
              disabled={isScanning}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-all shadow-xs disabled:opacity-50"
            >
              {isScanning ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Analizando correos...
                </>
              ) : (
                <>
                  <Search className="w-3.5 h-3.5" />
                  {isAuthenticated ? `Escanear Bandeja (${ordersCount} registradas)` : 'Conectar Gmail y Escanear'}
                </>
              )}
            </button>
          </div>
        </div>

        {/* Informative Accordion */}
        {showExplanation && (
          <div className="mt-4 p-4 bg-indigo-50/70 border border-indigo-200/80 rounded-xl text-xs text-indigo-950 space-y-3">
            <div className="font-semibold text-indigo-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-600" />
              ¿Dónde y cómo se construye el contexto para chequeos y alertas?
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-white p-3 rounded-lg border border-indigo-100 shadow-2xs">
                <strong className="text-indigo-900 block mb-1">1. Filtro de Entrada en Gmail</strong>
                <p className="text-slate-600 text-[11px] leading-relaxed">
                  Los criterios de abajo (palabras clave, remitentes y fechas) se traducen en una consulta nativa de Gmail. Así el Agente solo descarga correos comerciales relevantes sin leer tu correo personal.
                </p>
              </div>
              <div className="bg-white p-3 rounded-lg border border-indigo-100 shadow-2xs">
                <strong className="text-indigo-900 block mb-1">2. Extracción de Contexto con IA</strong>
                <p className="text-slate-600 text-[11px] leading-relaxed">
                  Cada correo filtrado es procesado por Gemini AI para extraer: Número de PO/OC, Proveedor, Monto exacto, Moneda, Fecha Límite y Términos Comerciales.
                </p>
              </div>
              <div className="bg-white p-3 rounded-lg border border-indigo-100 shadow-2xs">
                <strong className="text-indigo-900 block mb-1">3. Motor de Chequeos y Alertas</strong>
                <p className="text-slate-600 text-[11px] leading-relaxed">
                  Con la base de conocimiento estructurada, el motor cruza las órdenes para emitir alertas de <strong>Duplicados (Doble Pago)</strong>, <strong>Pagos Urgentes</strong> y <strong>Anticipos</strong>.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mode Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200 px-5 pt-3 bg-white flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            id="tab-step-by-step"
            onClick={() => setActiveMode('step_by_step')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              activeMode === 'step_by_step'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            <span>Configurar Paso a Paso (Desde Cero)</span>
            <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded-full">
              Limpio / Desde Cero
            </span>
          </button>

          <button
            type="button"
            id="tab-two-level-filter"
            onClick={() => setActiveMode('two_level')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              activeMode === 'two_level'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Filtro en 2 Niveles</span>
          </button>

          <button
            type="button"
            id="tab-visual-builder"
            onClick={() => setActiveMode('visual')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              activeMode === 'visual'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Constructor Visual</span>
          </button>

          <button
            type="button"
            id="tab-query-mode"
            onClick={() => setActiveMode('query')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              activeMode === 'query'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            <span>Consulta Gmail</span>
          </button>

          <button
            type="button"
            id="tab-alert-rules"
            onClick={() => setActiveMode('alert_rules')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              activeMode === 'alert_rules'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Umbrales</span>
          </button>
        </div>

        {/* Save Default criteria & Reset to zero */}
        <div className="flex items-center gap-2 pb-2">
          {onClearRadarOrders && ordersCount > 0 && (
            <button
              type="button"
              onClick={onClearRadarOrders}
              title="Borra las órdenes actualmente en el Radar para hacer un escaneo limpio solo en recibidos"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 rounded-md transition-colors border border-amber-200 cursor-pointer"
            >
              <Trash2 className="w-3 h-3 text-amber-600" />
              Limpiar Radar ({ordersCount})
            </button>
          )}
          {onResetToZero && (
            <button
              type="button"
              onClick={onResetToZero}
              title="Borra todos los filtros, exclusiones y plantillas forzadas para dejar una hoja en blanco"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 rounded-md transition-colors border border-rose-200 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3 text-rose-600" />
              Restablecer a CERO
            </button>
          )}
          {saveSuccessNotice && (
            <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
              <Check className="w-3.5 h-3.5" /> Guardado
            </span>
          )}
          <button
            type="button"
            id="btn-save-criteria-default"
            onClick={handleSaveAsDefault}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors border border-slate-200 cursor-pointer"
            title="Guarda estos criterios para que siempre se apliquen al abrir la app"
          >
            <BookmarkCheck className="w-3.5 h-3.5" />
            Guardar como Predeterminado
          </button>
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="p-5">
        {/* MODE: STEP BY STEP CONFIGURATION FROM ZERO */}
        {activeMode === 'step_by_step' && (
          <div className="space-y-6">
            {/* Header info banner */}
            <div className="p-4 bg-gradient-to-r from-indigo-50/90 to-slate-50 border border-indigo-200/80 rounded-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 bg-indigo-600 text-white rounded-lg">
                      <Sparkles className="w-4 h-4" />
                    </span>
                    <h4 className="text-sm font-bold text-slate-900">
                      Configuración Paso a Paso (Construcción desde Cero)
                    </h4>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Hemos limpiado cualquier filtro viejo o exclusión que pudiera bloquear correos. Aquí configuramos únicamente lo esencial parte por parte:
                  </p>
                </div>
                {onResetToZero && (
                  <button
                    type="button"
                    onClick={onResetToZero}
                    className="px-3 py-1.5 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors shadow-2xs"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
                    Borrar Filtros y Empezar de Cero
                  </button>
                )}
              </div>
            </div>

            {/* Step 1: Asunto o Término Clave */}
            <div className="bg-white rounded-xl border-2 border-indigo-500/40 p-5 space-y-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center">
                    1
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Paso 1: ¿Qué asunto o término buscar en Gmail?</h4>
                    <p className="text-xs text-slate-500">
                      Define la palabra o frase del correo que queremos encontrar (ej. <code>ADELANTO DE PAGO</code>).
                    </p>
                  </div>
                </div>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                  Paso 1
                </span>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700 block">
                  Texto del Asunto (sin corchetes restrictivos):
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={step1SubjectInput}
                    onChange={(e) => setStep1SubjectInput(e.target.value)}
                    placeholder="Ej: ADELANTO DE PAGO o PAGO URGENTE"
                    className="flex-1 text-xs border border-slate-300 rounded-lg px-3 py-2 font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={handleApplyStep1}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Aplicar Asunto
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 pt-1 items-center">
                  <span className="text-[11px] text-slate-400 font-medium">Opciones directas:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setStep1SubjectInput('ADELANTO DE PAGO');
                      applyCleanSubject('ADELANTO DE PAGO');
                    }}
                    className="text-[11px] px-2.5 py-1 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-mono border border-indigo-200 cursor-pointer font-semibold"
                  >
                    "ADELANTO DE PAGO"
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStep1SubjectInput('PAGO URGENTE');
                      applyCleanSubject('PAGO URGENTE');
                    }}
                    className="text-[11px] px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono border border-slate-200 cursor-pointer"
                  >
                    "PAGO URGENTE"
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStep1SubjectInput('ANTICIPO');
                      applyCleanSubject('ANTICIPO');
                    }}
                    className="text-[11px] px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono border border-slate-200 cursor-pointer"
                  >
                    "ANTICIPO"
                  </button>
                </div>
              </div>
            </div>

            {/* Step 2: Rango de Fecha */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center">
                    2
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Paso 2: ¿A partir de qué fecha buscar?</h4>
                    <p className="text-xs text-slate-500">
                      Garantiza que el correo recibido el 21 de septiembre esté dentro del rango de búsqueda.
                    </p>
                  </div>
                </div>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                  Paso 2
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs">
                <div className="flex items-center gap-2">
                  <label className="font-semibold text-slate-700">Tipo de filtro:</label>
                  <select
                    value={criteria.dateFilterMode || 'specific_date'}
                    onChange={(e) => setCriteria((prev) => ({ ...prev, dateFilterMode: e.target.value as any }))}
                    className="border border-slate-300 rounded px-2.5 py-1.5 bg-slate-50 font-medium"
                  >
                    <option value="specific_date">A partir de fecha específica (Gmail after:)</option>
                    <option value="lookback_days">Días recientes (Gmail newer_than:)</option>
                  </select>
                </div>

                {criteria.dateFilterMode === 'specific_date' ? (
                  <div className="flex items-center gap-2">
                    <label className="font-semibold text-slate-700">Fecha de inicio:</label>
                    <input
                      type="date"
                      value={criteria.startDate || '2026-09-20'}
                      onChange={(e) => setCriteria((prev) => ({ ...prev, startDate: e.target.value }))}
                      className="border border-slate-300 rounded px-2.5 py-1 font-mono text-slate-800"
                    />
                    <button
                      type="button"
                      onClick={() => setCriteria((prev) => ({ ...prev, startDate: '2026-09-20' }))}
                      className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded border border-indigo-200 text-[11px] font-semibold cursor-pointer"
                    >
                      Fijar en 20 Sep (Recomendado)
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <label className="font-semibold text-slate-700">Días:</label>
                    <select
                      value={criteria.daysLookback || 7}
                      onChange={(e) => setCriteria((prev) => ({ ...prev, daysLookback: Number(e.target.value) }))}
                      className="border border-slate-300 rounded px-2 py-1 bg-slate-50"
                    >
                      <option value={3}>Últimos 3 días</option>
                      <option value={7}>Últimos 7 días</option>
                      <option value={15}>Últimos 15 días</option>
                      <option value={30}>Últimos 30 días</option>
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Step 3: Remitente (Opcional) */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center">
                    3
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Paso 3: Remitente (Opcional)</h4>
                    <p className="text-xs text-slate-500">
                      Puedes dejarlo en blanco para recibir correos de cualquier remitente, o especificarlo.
                    </p>
                  </div>
                </div>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                  Paso 3 (Opcional)
                </span>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={criteria.senderFilter || ''}
                  onChange={(e) => setCriteria((prev) => ({ ...prev, senderFilter: e.target.value }))}
                  placeholder="Dejar en blanco para cualquier remitente, o ej: mariana.herrera@kueski.com"
                  className="flex-1 text-xs border border-slate-300 rounded-lg px-3 py-2 font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {criteria.senderFilter && (
                  <button
                    type="button"
                    onClick={() => setCriteria((prev) => ({ ...prev, senderFilter: '' }))}
                    className="px-2.5 py-2 text-xs text-slate-500 hover:text-slate-800 underline cursor-pointer"
                  >
                    Quitar remitente
                  </button>
                )}
              </div>
            </div>

            {/* Step 4: Exclusiones (Opcional) */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center">
                    4
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Paso 4: Palabras Excluidas (Opcional)</h4>
                    <p className="text-xs text-slate-500">
                      Actualmente hay 0 palabras excluidas. No hay ninguna regla descartando tus correos.
                    </p>
                  </div>
                </div>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  0 Exclusiones
                </span>
              </div>

              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  <strong>Sin bloqueos:</strong> No hay exclusiones activas. Ni "marketing" ni ninguna otra palabra está bloqueando correos.
                </span>
              </div>
            </div>

            {/* Live Query Box and Direct Scan */}
            <div className="p-4 bg-slate-900 text-white rounded-xl space-y-3 shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Code className="w-3.5 h-3.5 text-amber-400" />
                  Consulta generada para Gmail (Limpia y transparente):
                </span>
                <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
                  Configuración Lista
                </span>
              </div>
              <code className="text-xs font-mono text-amber-300 block bg-slate-950 p-2.5 rounded border border-slate-800 break-all">
                {computedGmailQuery}
              </code>
              <div className="flex items-center justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={onRunScan}
                  disabled={isScanning}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg text-xs flex items-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                >
                  {isScanning ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Escaneando Gmail...
                    </>
                  ) : (
                    <>
                      <Search className="w-3.5 h-3.5" />
                      Probar Búsqueda en Gmail Ahora
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODE 0: TWO-LEVEL FILTER ENGINE (PRIMARY / CLEANEST FILTERING) */}
        {activeMode === 'two_level' && (
          <div className="space-y-6">
            {/* Header info banner */}
            <div className="p-4 bg-gradient-to-r from-indigo-50/80 to-slate-50 border border-indigo-100 rounded-xl">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 bg-indigo-600 text-white rounded-lg">
                      <Layers className="w-4 h-4" />
                    </span>
                    <h4 className="text-sm font-bold text-slate-900">
                      Arquitectura de Filtrado en 2 Niveles con Inteligencia Artificial
                    </h4>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed max-w-3xl">
                    <strong>Nivel 1 (Principal):</strong> Asegura un filtro limpio priorizando correos que cumplan con la estructura de las plantillas creadas, tolerando errores de escritura o variaciones.
                    <br />
                    <strong>Nivel 2 (Respaldo):</strong> Amplía opcionalmente el radar para correos sin plantilla que contengan fechas de pago específicas, transferencias SPEI, dispersiones o requerimientos puntuales.
                  </p>
                </div>
              </div>
            </div>

            {/* Global Filter Strategy Mode Selector */}
            <div>
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5 mb-2.5">
                <Target className="w-3.5 h-3.5 text-indigo-600" />
                Estrategia de Filtrado en Bandeja de Entrada:
              </label>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Option 1: Strict Templates */}
                <button
                  type="button"
                  id="filter-mode-strict"
                  onClick={() => handleSetFilterMode('strict_templates')}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    filterMode === 'strict_templates'
                      ? 'border-emerald-600 bg-emerald-50/50 ring-1 ring-emerald-600'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Target className="w-4 h-4 text-emerald-600" />
                      Solo Plantillas Creadas
                    </span>
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                      Filtro Limpio
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Descarta cualquier correo informal. Solo extrae correos que sigan la estructura de las plantillas definidas (tolerando typos y variaciones leves).
                  </p>
                </button>

                {/* Option 2: Hybrid (Recommended) */}
                <button
                  type="button"
                  id="filter-mode-hybrid"
                  onClick={() => handleSetFilterMode('hybrid')}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    filterMode === 'hybrid'
                      ? 'border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600 shadow-2xs'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Scale className="w-4 h-4 text-indigo-600" />
                      Híbrido (Recomendado)
                    </span>
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800">
                      Prioritario + Respaldo
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Toma como criterio principal las plantillas creadas. Activa el 2º filtro para no perder correos con dispersiones, transferencias o fechas de pago específicas.
                  </p>
                </button>

                {/* Option 3: Broad */}
                <button
                  type="button"
                  id="filter-mode-broad"
                  onClick={() => handleSetFilterMode('broad')}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    filterMode === 'broad'
                      ? 'border-slate-800 bg-slate-50 ring-1 ring-slate-800'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Globe className="w-4 h-4 text-slate-600" />
                      Modo Amplio
                    </span>
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                      Todo el Flujo
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Extrae cualquier correo que mencione pagos, órdenes de compra o facturas comerciales sin exigir coincidencia de plantilla.
                  </p>
                </button>
              </div>
            </div>

            {/* LEVEL 1: PRIMARY CRITERION - CREATED TEMPLATES WITH TYPO TOLERANCE */}
            <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center">
                    1
                  </span>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <FileCheck className="w-4 h-4 text-emerald-600" />
                      NIVEL 1: Criterio Principal — Filtro Exacto de Plantillas [PAGO URGENTE] y [ADELANTO DE PAGO]
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      <strong>1er Criterio:</strong> Asunto del correo (<code className="text-emerald-700 font-mono">[PAGO URGENTE]</code> o <code className="text-indigo-700 font-mono">[ADELANTO DE PAGO]</code>). 
                      <strong className="ml-1">2do Criterio:</strong> Detección inteligente de los campos oficiales (SC/OC, Proveedor, Monto, Fecha, Folio, CLABE, Área, Justificación).
                    </p>
                  </div>
                </div>

                {/* Tolerance selector */}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-slate-600">Tolerancia a ortografía y typos:</span>
                  <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 text-xs">
                    <button
                      type="button"
                      onClick={() => handleSetTolerance('flexible')}
                      className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                        templateTolerance === 'flexible'
                          ? 'bg-white text-emerald-700 font-bold shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                      title="Tolera faltas ortográficas, cambios o falta de letras en asunto o campos (ej: '[PAGO URGNETE]', 'Provedor', 'Num SC/OC')"
                    >
                      Flexible (65%)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetTolerance('balanced')}
                      className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                        templateTolerance === 'balanced'
                          ? 'bg-white text-indigo-700 font-bold shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                      title="Requiere que la mayoría de los campos clave y el asunto estén presentes"
                    >
                      Equilibrada (75%)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetTolerance('strict')}
                      className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                        templateTolerance === 'strict'
                          ? 'bg-white text-slate-900 font-bold shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                      title="Requiere coincidencia formal exacta en asunto y campos"
                    >
                      Estricta (85%)
                    </button>
                  </div>
                </div>
              </div>

              {/* Active Templates List */}
              <div>
                <span className="text-[11px] font-semibold text-slate-700 block mb-2">
                  Plantillas oficiales configuradas como filtro exacto ({templates.length > 0 ? templates.length : 2}):
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {(templates.length > 0
                    ? templates
                    : [
                        {
                          id: 'default-urgent',
                          name: 'Solicitud de Pago Urgente',
                          category: 'urgent',
                          subjectTemplate: '[PAGO URGENTE] - {ORDER_NUMBER} {SUPPLIER_NAME}',
                          description: 'Filtro para solicitudes prioritarias con documento SC/OC, proveedor, monto, factura, CLABE, área y justificación.',
                        },
                        {
                          id: 'default-advance',
                          name: 'Solicitud de Adelanto / Anticipo de Pago',
                          category: 'advance',
                          subjectTemplate: '[ADELANTO DE PAGO] - {ORDER_NUMBER} {SUPPLIER_NAME}',
                          description: 'Filtro para revisión y aprobación de adelantos correspondientes a un área con SC/OC y cuenta bancaria.',
                        },
                      ]
                  ).map((tpl: any) => (
                    <div
                      key={tpl.id}
                      className="p-3 rounded-lg border border-slate-200/90 bg-slate-50/70 flex items-start justify-between gap-2"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-slate-900">{tpl.name}</span>
                          <span
                            className={`text-[9px] uppercase font-bold px-1.5 py-0.2 rounded ${
                              tpl.type === 'urgent' || tpl.category === 'urgent'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-indigo-100 text-indigo-800'
                            }`}
                          >
                            {tpl.type === 'urgent' || tpl.category === 'urgent' ? 'Urgente' : 'Adelanto'}
                          </span>
                        </div>
                        {tpl.subjectTemplate && (
                          <div className="text-[10px] text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200 font-mono">
                            <span className="text-slate-400 font-sans">1er Criterio Asunto: </span>
                            <span className="font-semibold text-slate-800">{tpl.subjectTemplate}</span>
                          </div>
                        )}
                        <p className="text-[11px] text-slate-500">{tpl.description || 'Estructura oficial para validación.'}</p>
                      </div>
                      <span className="text-emerald-600 text-xs">
                        <ShieldCheck className="w-4 h-4" />
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Structural validation items */}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/80">
                <span className="text-[11px] font-semibold text-slate-700 block mb-1.5">
                  Campos estructurales que la IA analiza y valida con tolerancia:
                </span>
                <div className="flex flex-wrap gap-2 text-[11px] text-slate-600">
                  <span className="px-2 py-0.5 bg-white border border-slate-200 rounded font-mono">
                    ✓ Número de Orden (PO / OC)
                  </span>
                  <span className="px-2 py-0.5 bg-white border border-slate-200 rounded font-mono">
                    ✓ Proveedor / Beneficiario
                  </span>
                  <span className="px-2 py-0.5 bg-white border border-slate-200 rounded font-mono">
                    ✓ Monto Total & Moneda
                  </span>
                  <span className="px-2 py-0.5 bg-white border border-slate-200 rounded font-mono">
                    ✓ Fecha Límite / Vencimiento
                  </span>
                  <span className="px-2 py-0.5 bg-white border border-slate-200 rounded font-mono">
                    ✓ Factura / Folio Fiscal
                  </span>
                  <span className="px-2 py-0.5 bg-white border border-slate-200 rounded font-mono">
                    ✓ Datos Bancarios / CLABE
                  </span>
                  <span className="px-2 py-0.5 bg-white border border-slate-200 rounded font-mono">
                    ✓ Justificación / % Anticipo
                  </span>
                </div>
              </div>
            </div>

            {/* LEVEL 2: SECONDARY CRITERION - DISPERSIONS & SPECIFIC PAYMENT DATES */}
            <div className={`p-4 bg-white border rounded-xl space-y-4 transition-all ${
              secondaryConfig.enabled && filterMode !== 'strict_templates'
                ? 'border-indigo-200 bg-white'
                : 'border-slate-200 opacity-80'
            }`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-800 font-bold text-xs flex items-center justify-center">
                    2
                  </span>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-indigo-600" />
                      NIVEL 2: Criterio Secundario — Ampliación para Dispersiones y Fechas Específicas
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Permite modificar o ampliar los criterios para incluir correos que no sigan la plantilla pero aporten información crítica de pagos.
                    </p>
                  </div>
                </div>

                {/* Secondary filter toggle switch */}
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-slate-700 cursor-pointer flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={secondaryConfig.enabled && filterMode !== 'strict_templates'}
                      disabled={filterMode === 'strict_templates'}
                      onChange={(e) => handleToggleSecondaryFilter(e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Habilitar Segundo Filtro</span>
                  </label>
                </div>
              </div>

              {/* Sub-criterios toggles */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Sub-option 1: Payment Dates */}
                <div
                  onClick={() => handleToggleSecondaryOption('includePaymentDates')}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    secondaryConfig.includePaymentDates
                      ? 'border-indigo-300 bg-indigo-50/40'
                      : 'border-slate-200 bg-slate-50/60'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <input
                      type="checkbox"
                      readOnly
                      checked={secondaryConfig.includePaymentDates}
                      className="rounded text-indigo-600"
                    />
                    <span className="text-xs font-bold text-slate-900 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                      Fechas de Pago Específicas
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Detecta frases como <em>"programar para el viernes"</em>, <em>"pagar el 25"</em> o <em>"desembolso el 30"</em>.
                  </p>
                </div>

                {/* Sub-option 2: Dispersions & Banking */}
                <div
                  onClick={() => handleToggleSecondaryOption('includeDispersions')}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    secondaryConfig.includeDispersions
                      ? 'border-indigo-300 bg-indigo-50/40'
                      : 'border-slate-200 bg-slate-50/60'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <input
                      type="checkbox"
                      readOnly
                      checked={secondaryConfig.includeDispersions}
                      className="rounded text-indigo-600"
                    />
                    <span className="text-xs font-bold text-slate-900 flex items-center gap-1">
                      <Zap className="w-3.5 h-3.5 text-amber-600" />
                      Dispersiones y SPEI
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Identifica dispersión de fondos, lotes de transferencia SPEI, layouts bancarios y tesorería.
                  </p>
                </div>

                {/* Sub-option 3: Specific payment requests */}
                <div
                  onClick={() => handleToggleSecondaryOption('includeSpecificRequests')}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    secondaryConfig.includeSpecificRequests
                      ? 'border-indigo-300 bg-indigo-50/40'
                      : 'border-slate-200 bg-slate-50/60'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <input
                      type="checkbox"
                      readOnly
                      checked={secondaryConfig.includeSpecificRequests}
                      className="rounded text-indigo-600"
                    />
                    <span className="text-xs font-bold text-slate-900 flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5 text-emerald-600" />
                      Solicitudes Específicas
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Captura cobros directos de proveedores con monto o factura puntual, aunque no tengan formato estándar.
                  </p>
                </div>
              </div>

              {/* Custom secondary keywords manager */}
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1.5">
                  Términos y palabras clave adicionales para el 2º filtro:
                </label>
                <div className="flex flex-wrap items-center gap-1.5 mb-2">
                  {(secondaryConfig.customKeywords || []).map((kw) => (
                    <span
                      key={kw}
                      className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-900 border border-indigo-200"
                    >
                      <span>{kw}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveSecondaryKeyword(kw)}
                        className="hover:text-rose-600 text-indigo-400 p-0.5"
                        title={`Eliminar ${kw}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>

                <div className="flex items-center gap-2 max-w-md">
                  <input
                    type="text"
                    value={newSecondaryKeyword}
                    onChange={(e) => setNewSecondaryKeyword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddSecondaryKeyword()}
                    placeholder="Agregar término (ej: retención, layout, finanzas...)"
                    className="text-xs px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg flex-1 focus:outline-none focus:ring-1 focus:ring-indigo-600"
                  />
                  <button
                    type="button"
                    onClick={handleAddSecondaryKeyword}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Agregar
                  </button>
                </div>
              </div>
            </div>

            {/* TEMPORAL WINDOW: SCAN START DATE */}
            <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-blue-100 text-blue-700 rounded-lg">
                    <CalendarDays className="w-4 h-4" />
                  </span>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      Rango Temporal de Escaneo: ¿A partir de qué fecha buscar en Gmail?
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Define a partir de qué fecha revisar correos para que el radar se enfoque exactamente en el periodo deseado.
                    </p>
                  </div>
                </div>

                {/* Filter mode switcher: specific date vs lookback days */}
                <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 text-xs">
                  <button
                    type="button"
                    onClick={() => setCriteria((prev) => ({ ...prev, dateFilterMode: 'specific_date' }))}
                    className={`px-3 py-1 rounded-md font-semibold transition-all ${
                      criteria.dateFilterMode === 'specific_date'
                        ? 'bg-white text-indigo-700 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    📅 A partir de fecha específica
                  </button>
                  <button
                    type="button"
                    onClick={() => setCriteria((prev) => ({ ...prev, dateFilterMode: 'lookback_days' }))}
                    className={`px-3 py-1 rounded-md font-semibold transition-all ${
                      criteria.dateFilterMode !== 'specific_date'
                        ? 'bg-white text-indigo-700 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    ⏱️ Por días de antigüedad
                  </button>
                </div>
              </div>

              {criteria.dateFilterMode === 'specific_date' ? (
                <div className="space-y-3 pt-1">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-800 flex items-center gap-1 mb-1">
                        <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                        Escanear a partir de (Fecha de Inicio):
                      </label>
                      <input
                        type="date"
                        value={criteria.startDate || ''}
                        onChange={(e) => setCriteria((prev) => ({ ...prev, startDate: e.target.value }))}
                        className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-600 focus:bg-white font-mono"
                      />
                      <span className="text-[10px] text-slate-500 block mt-1">
                        Gmail buscará correos recibidos desde esta fecha en adelante (parámetro <code className="text-indigo-600 font-mono">after:{criteria.startDate ? criteria.startDate.replace(/-/g, '/') : 'YYYY/MM/DD'}</code>).
                      </span>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-800 flex items-center gap-1 mb-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        Hasta fecha (Opcional):
                      </label>
                      <input
                        type="date"
                        value={criteria.endDate || ''}
                        onChange={(e) => setCriteria((prev) => ({ ...prev, endDate: e.target.value }))}
                        className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-600 focus:bg-white font-mono"
                      />
                      <span className="text-[10px] text-slate-500 block mt-1">
                        {criteria.endDate
                          ? `Acotado hasta ${criteria.endDate} (parámetro before:${criteria.endDate.replace(/-/g, '/')})`
                          : 'Dejar vacío para escanear hasta el día de hoy.'}
                      </span>
                    </div>
                  </div>

                  {/* Quick Preset Buttons */}
                  <div>
                    <span className="text-[11px] font-semibold text-slate-600 block mb-1.5">
                      Accesos rápidos de fecha:
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleSetPresetDate('month_start')}
                        className="px-2.5 py-1 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors border border-slate-200"
                      >
                        Inicio de este mes
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetPresetDate('15d')}
                        className="px-2.5 py-1 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors border border-slate-200"
                      >
                        Hace 15 días
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetPresetDate('30d')}
                        className="px-2.5 py-1 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors border border-slate-200"
                      >
                        Hace 30 días
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetPresetDate('7d')}
                        className="px-2.5 py-1 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors border border-slate-200"
                      >
                        Hace 7 días
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetPresetDate('today')}
                        className="px-2.5 py-1 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors border border-slate-200"
                      >
                        Solo hoy
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetPresetDate('prev_month')}
                        className="px-2.5 py-1 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors border border-slate-200"
                      >
                        Inicio mes anterior
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 pt-1">
                  <div className="max-w-md">
                    <label className="text-xs font-semibold text-slate-800 flex items-center gap-1 mb-1">
                      <Clock className="w-3.5 h-3.5 text-indigo-600" />
                      Ventana de antigüedad:
                    </label>
                    <select
                      value={criteria.daysLookback || 30}
                      onChange={(e) => setCriteria((prev) => ({ ...prev, daysLookback: Number(e.target.value) }))}
                      className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-600 focus:bg-white"
                    >
                      <option value={7}>Últimos 7 días</option>
                      <option value={15}>Últimos 15 días</option>
                      <option value={30}>Últimos 30 días (Recomendado para AP)</option>
                      <option value={60}>Últimos 60 días</option>
                      <option value={90}>Últimos 90 días</option>
                    </select>
                    <span className="text-[10px] text-slate-500 block mt-1">
                      Gmail buscará correos recibidos en los últimos {criteria.daysLookback} días (parámetro <code className="text-indigo-600 font-mono">newer_than:{criteria.daysLookback}d</code>).
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Actions Footer */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
              <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>
                  Estrategia activa:{' '}
                  <strong className="text-slate-800">
                    {filterMode === 'strict_templates'
                      ? 'Solo Plantillas Creadas (Filtro Limpio)'
                      : filterMode === 'hybrid'
                      ? 'Híbrido (Plantillas Prioritarias + 2º Filtro Ampliado)'
                      : 'Modo Amplio'}
                  </strong>
                  {' · Tolerancia: '}
                  <strong className="text-slate-800">{templateTolerance}</strong>
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveAsDefault}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
                >
                  <BookmarkCheck className="w-3.5 h-3.5 text-indigo-600" />
                  Guardar Criterios
                </button>

                <button
                  type="button"
                  onClick={onRunScan}
                  disabled={isScanning}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-xs disabled:opacity-50"
                >
                  {isScanning ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Filtrando bandeja...
                    </>
                  ) : (
                    <>
                      <Search className="w-3.5 h-3.5" />
                      {isAuthenticated ? 'Escanear con este Filtro' : 'Conectar Gmail y Escanear'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODE 1: VISUAL RULE BUILDER */}
        {activeMode === 'visual' && (
          <div className="space-y-5">
            {/* Row 1: Keywords in subject */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-indigo-600" />
                  Palabras Clave en Asunto (selecciona o agrega tus términos):
                </label>
                <span className="text-[11px] text-slate-400">
                  Coincidencia OR (buscará correos con cualquiera de ellas)
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5 items-center">
                {DEFAULT_SUBJECT_KEYWORDS.map((kw) => {
                  const isSelected = selectedKeywords.includes(kw);
                  return (
                    <button
                      key={kw}
                      type="button"
                      onClick={() => handleKeywordToggle(kw)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                        isSelected
                          ? 'bg-indigo-600 text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3" />}
                      {kw}
                    </button>
                  );
                })}

                {/* Render any additional custom user keywords */}
                {selectedKeywords
                  .filter((k) => !DEFAULT_SUBJECT_KEYWORDS.includes(k))
                  .map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => handleKeywordToggle(k)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-indigo-600 text-white shadow-2xs"
                    >
                      <Check className="w-3 h-3" />
                      {k}
                    </button>
                  ))}

                {/* Input to add custom */}
                <div className="inline-flex items-center gap-1 ml-1">
                  <input
                    type="text"
                    value={customKeywordInput}
                    onChange={(e) => setCustomKeywordInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddCustomKeyword()}
                    placeholder="Otro término (ej. Solicitud)..."
                    className="text-xs px-2.5 py-1 bg-slate-50 border border-slate-300 rounded-lg w-44 focus:outline-none focus:ring-1 focus:ring-indigo-600 focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomKeyword}
                    className="px-2 py-1 text-xs font-semibold bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg"
                  >
                    + Agregar
                  </button>
                </div>
              </div>
            </div>

            {/* Row 2: Senders, Lookback & Attachment */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
              {/* Sender / Supplier Filter */}
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">
                  <span className="flex items-center gap-1.5">
                    <AtSign className="w-3.5 h-3.5 text-indigo-600" />
                    Filtrar por Remitente o Dominio (Opcional):
                  </span>
                </label>
                <input
                  type="text"
                  value={senderFilter}
                  onChange={(e) => handleSenderChange(e.target.value)}
                  placeholder="ej. compras@empresa.com o @proveedor.com"
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-600 focus:bg-white font-mono"
                />
                <span className="text-[10px] text-slate-400 block mt-1">
                  Vacío para buscar en todos los remitentes de tu buzón.
                </span>
              </div>

              {/* Date Filter Selection */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                    <CalendarDays className="w-3.5 h-3.5 text-indigo-600" />
                    Filtro de Fecha:
                  </label>
                  <div className="flex items-center gap-1 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setCriteria((prev) => ({ ...prev, dateFilterMode: 'specific_date' }))}
                      className={`px-1.5 py-0.5 rounded font-medium ${
                        criteria.dateFilterMode === 'specific_date'
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      A partir de
                    </button>
                    <button
                      type="button"
                      onClick={() => setCriteria((prev) => ({ ...prev, dateFilterMode: 'lookback_days' }))}
                      className={`px-1.5 py-0.5 rounded font-medium ${
                        criteria.dateFilterMode !== 'specific_date'
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Días
                    </button>
                  </div>
                </div>

                {criteria.dateFilterMode === 'specific_date' ? (
                  <div className="space-y-1.5">
                    <input
                      type="date"
                      value={criteria.startDate || ''}
                      onChange={(e) => setCriteria((prev) => ({ ...prev, startDate: e.target.value }))}
                      className="w-full text-xs px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-600 focus:bg-white font-mono"
                    />
                    <div className="flex items-center gap-1 flex-wrap">
                      <button
                        type="button"
                        onClick={() => handleSetPresetDate('month_start')}
                        className="text-[10px] px-1.5 py-0.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded"
                      >
                        Inicio mes
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetPresetDate('15d')}
                        className="text-[10px] px-1.5 py-0.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded"
                      >
                        -15d
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetPresetDate('30d')}
                        className="text-[10px] px-1.5 py-0.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded"
                      >
                        -30d
                      </button>
                    </div>
                  </div>
                ) : (
                  <select
                    id="select-days-lookback"
                    value={criteria.daysLookback || 30}
                    onChange={(e) => setCriteria((prev) => ({ ...prev, daysLookback: Number(e.target.value) }))}
                    className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-600 focus:bg-white"
                  >
                    <option value={7}>Últimos 7 días</option>
                    <option value={15}>Últimos 15 días</option>
                    <option value={30}>Últimos 30 días (Recomendado)</option>
                    <option value={60}>Últimos 60 días</option>
                    <option value={90}>Últimos 90 días</option>
                  </select>
                )}
                <span className="text-[10px] text-slate-400 block mt-1">
                  {criteria.dateFilterMode === 'specific_date' && criteria.startDate
                    ? `Gmail: after:${criteria.startDate.replace(/-/g, '/')}`
                    : `Gmail: newer_than:${criteria.daysLookback}d`}
                </span>
              </div>

              {/* Has Attachment Toggle */}
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">
                  <span className="flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5 text-indigo-600" />
                    Exigir Archivo Adjunto:
                  </span>
                </label>
                <label className="flex items-center gap-2.5 p-2 bg-slate-50 border border-slate-300 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={requireAttachment}
                    onChange={(e) => handleAttachmentToggle(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                  />
                  <div className="text-xs">
                    <span className="font-semibold text-slate-800 block">Solo correos con adjuntos</span>
                    <span className="text-[10px] text-slate-500">
                      Útil para filtrar correos con PDFs o XML de facturas
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {/* Row 3: Exclude terms */}
            <div className="pt-1">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                  <Ban className="w-3.5 h-3.5 text-rose-500" />
                  Excluir Correos con Términos No Deseados (Ruido):
                </label>
                <span className="text-[11px] text-slate-400">
                  Evita procesar publicidad, cancelaciones o boletines
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5 items-center">
                {DEFAULT_EXCLUDE_KEYWORDS.map((word) => {
                  const isExcluded = excludeKeywords.includes(word);
                  return (
                    <button
                      key={word}
                      type="button"
                      onClick={() => handleExcludeToggle(word)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                        isExcluded
                          ? 'bg-rose-100 text-rose-700 border border-rose-200'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200 border border-slate-200'
                      }`}
                    >
                      {isExcluded && <span>-</span>}
                      {word}
                    </button>
                  );
                })}

                <div className="inline-flex items-center gap-1 ml-1">
                  <input
                    type="text"
                    value={customExcludeInput}
                    onChange={(e) => setCustomExcludeInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddCustomExclude()}
                    placeholder="Excluir palabra (ej. recibo)..."
                    className="text-xs px-2.5 py-1 bg-slate-50 border border-slate-300 rounded-lg w-44 focus:outline-none focus:ring-1 focus:ring-rose-500 focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomExclude}
                    className="px-2 py-1 text-xs font-semibold bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg"
                  >
                    + Excluir
                  </button>
                </div>
              </div>
            </div>

            {/* Generated Query Preview Bar */}
            <div className="p-3 bg-slate-900 text-white rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-mono text-xs">
              <div className="flex items-center gap-2 overflow-x-auto">
                <span className="text-slate-400 font-sans text-xs shrink-0">Consulta Gmail generada:</span>
                <code className="text-amber-300 bg-slate-800 px-2 py-1 rounded border border-slate-700 truncate max-w-xl">
                  {criteria.searchQuery}{' '}
                  {criteria.dateFilterMode === 'specific_date' && criteria.startDate
                    ? `after:${criteria.startDate.replace(/-/g, '/')}${criteria.endDate ? ` before:${criteria.endDate.replace(/-/g, '/')}` : ''}`
                    : `newer_than:${criteria.daysLookback || 30}d`}
                </code>
              </div>
              <button
                type="button"
                onClick={() => setActiveMode('query')}
                className="text-indigo-300 hover:text-indigo-200 text-xs font-sans underline shrink-0"
              >
                Editar en modo libre
              </button>
            </div>
          </div>
        )}

        {/* MODE 2: DIRECT GMAIL QUERY */}
        {activeMode === 'query' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1">
                Consulta Personalizada de Búsqueda (Sintaxis Nativa de Gmail):
              </label>
              <div className="relative">
                <input
                  id="input-gmail-query"
                  type="text"
                  value={criteria.searchQuery}
                  onChange={(e) => setCriteria((prev) => ({ ...prev, searchQuery: e.target.value }))}
                  placeholder='subject:(pago OR "orden de compra" OR PO OR OC) has:attachment'
                  className="w-full text-xs font-mono px-3 py-2.5 pl-9 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-600 focus:bg-white"
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Puedes usar operadores nativos de Gmail como <code>from:</code>, <code>subject:()</code>, <code>has:attachment</code>, <code>filename:pdf</code>, <code>larger:100k</code>, etc.
              </p>
            </div>

            {/* Presets Grid */}
            <div>
              <span className="block text-xs font-semibold text-slate-700 mb-2">
                Plantillas y Criterios Preconfigurados (Aplica con 1 Clic):
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {quickPresets.map((preset, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleApplyPreset(preset)}
                    className="p-3 bg-slate-50 hover:bg-indigo-50/50 border border-slate-200 hover:border-indigo-300 rounded-lg text-left transition-all group"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-slate-800 group-hover:text-indigo-700">
                        {preset.label}
                      </span>
                      <span className="text-[10px] text-indigo-600 font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                        Aplicar →
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mb-1.5">{preset.desc}</p>
                    <code className="text-[10px] text-slate-600 bg-white px-1.5 py-0.5 rounded border border-slate-200 block truncate font-mono">
                      {preset.query}
                    </code>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* MODE 3: ALERT TRIGGERS & BUSINESS RULES */}
        {activeMode === 'alert_rules' && (
          <div className="space-y-4">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong className="font-semibold block">Reglas de Detección de Riesgo y Duplicidad:</strong>
                <span>
                  Estas reglas evalúan la información extraída de los correos para encender alertas preventivas antes de que se autorice un pago.
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Alert 1: Duplicate Prevention */}
              <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-2">
                <div className="flex items-center gap-2 text-amber-700 font-bold text-xs">
                  <ShieldAlert className="w-4 h-4" />
                  Alerta 1: Detección de Duplicados (Doble Pago)
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Compara número de PO o combinaciones de <strong>Proveedor + Monto exacto</strong> recibidas en correos diferentes dentro del período.
                </p>
                <div className="text-[11px] bg-amber-50 p-2 rounded text-amber-800 border border-amber-200">
                  ✓ Protege contra pagos duplicados por facturas reenviadas.
                </div>
              </div>

              {/* Alert 2: Urgent Payments */}
              <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-2">
                <div className="flex items-center gap-2 text-rose-700 font-bold text-xs">
                  <Flame className="w-4 h-4" />
                  Alerta 2: Pagos Urgentes y Críticos
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Clasifica como <strong>Urgente</strong> cualquier orden cuya fecha de vencimiento esté dentro de los próximos días configurados o ya haya vencido.
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <label className="text-xs text-slate-700 font-semibold">Umbral:</label>
                  <select
                    value={urgentDays}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setUrgentDays(v);
                      setCriteria((prev) => ({ ...prev, urgentDaysThreshold: v }));
                    }}
                    className="text-xs px-2 py-1 bg-slate-50 border border-slate-300 rounded font-semibold"
                  >
                    <option value={1}>Vence en 24 horas o menos</option>
                    <option value={3}>Vence en 3 días o menos (Estándar)</option>
                    <option value={5}>Vence en 5 días o menos</option>
                    <option value={7}>Vence en 7 días</option>
                  </select>
                </div>
              </div>

              {/* Alert 3: Advance Payments */}
              <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-2">
                <div className="flex items-center gap-2 text-indigo-700 font-bold text-xs">
                  <Zap className="w-4 h-4" />
                  Alerta 3: Identificación de Anticipos
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Detecta menciones como <em>"50% anticipo"</em>, <em>"pago previo a embarque"</em> o <em>"adelanto"</em> para priorizar la liberación comercial.
                </p>
                <div className="text-[11px] bg-indigo-50 p-2 rounded text-indigo-800 border border-indigo-200">
                  ✓ Sugiere automáticamente la plantilla de anticipo estructurada.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
