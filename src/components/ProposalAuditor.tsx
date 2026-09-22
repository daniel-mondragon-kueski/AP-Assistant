import React, { useState, useRef } from 'react';
import {
  FileSpreadsheet,
  Upload,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  FileCheck,
  Copy,
  ExternalLink,
  Mail,
  Download,
  Sparkles,
  Layers,
  ChevronRight,
  Calculator,
  RefreshCw,
  Search,
  Check,
  Info,
  MessageSquare,
  Bot,
} from 'lucide-react';
import {
  PaymentOrder,
  ProposalAnalysisResult,
  ExcelRowItem,
} from '../types';
import {
  analyzeProposalExcel,
  createDemoWeeklyProposalBuffer,
  formatCurrencyMXN,
  generateApprovalEmailBody,
} from '../services/excelParser';
import { createGmailDraft } from '../services/gmail';
import { AuditChat } from './AuditChat';
import { getGmailUrl } from './OrderList';

interface ProposalAuditorProps {
  radarOrders: PaymentOrder[];
  accessToken: string | null;
  onOpenDraftModal?: (order: PaymentOrder) => void;
}

export const ProposalAuditor: React.FC<ProposalAuditorProps> = ({
  radarOrders,
  accessToken,
  onOpenDraftModal,
}) => {
  const [analysisResult, setAnalysisResult] = useState<ProposalAnalysisResult | null>(null);
  const [auditorViewMode, setAuditorViewMode] = useState<'chat' | 'dashboard'>('chat');
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [customNotes, setCustomNotes] = useState('');
  const [activeSubTab, setActiveSubTab] = useState<'summary' | 'matches' | 'missing' | 'anomalies' | 'sheets'>('summary');
  const [copiedNotice, setCopiedNotice] = useState(false);
  const [isCreatingDraft, setIsCreatingDraft] = useState(false);
  const [draftSuccessNotice, setDraftSuccessNotice] = useState<string | null>(null);
  const [draftErrorNotice, setDraftErrorNotice] = useState<string | null>(null);
  const [fileErrorNotice, setFileErrorNotice] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Process array buffer from File or Demo
  const processExcelData = (buffer: ArrayBuffer, fileName: string) => {
    setIsProcessingFile(true);
    setFileErrorNotice(null);
    try {
      const result = analyzeProposalExcel(buffer, fileName, radarOrders, customNotes);
      setAnalysisResult(result);
      // If there are critical missing items, default tab to missing or summary
      if (result.criticalMissing.length > 0) {
        setActiveSubTab('missing');
      } else if (result.anomalies.length > 0) {
        setActiveSubTab('anomalies');
      } else {
        setActiveSubTab('summary');
      }
    } catch (err: any) {
      setFileErrorNotice(`Error al procesar el archivo Excel: ${err.message || 'Formato no reconocido'}`);
    } finally {
      setIsProcessingFile(false);
    }
  };

  // Upload file from chat or drag drop
  const handleUploadedFile = async (file: File) => {
    const buffer = await file.arrayBuffer();
    processExcelData(buffer, file.name);
  };

  // Handle file input change
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      const buffer = await file.arrayBuffer();
      processExcelData(buffer, file.name);
    }
  };

  // Handle Drag & Drop
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      const buffer = await file.arrayBuffer();
      processExcelData(buffer, file.name);
    }
  };

  // Load Demo Weekly Proposal
  const handleLoadDemoProposal = () => {
    const { buffer, fileName } = createDemoWeeklyProposalBuffer();
    processExcelData(buffer, fileName);
  };

  // Download Demo Excel file
  const handleDownloadDemoFile = () => {
    const { buffer, fileName } = createDemoWeeklyProposalBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Update notes in current analysis
  const handleNotesChange = (text: string) => {
    setCustomNotes(text);
    if (analysisResult) {
      const updatedEmail = generateApprovalEmailBody(
        analysisResult.targetDayOfWeek,
        analysisResult.targetDay,
        analysisResult.targetMonth,
        analysisResult.totals.sofom,
        analysisResult.totals.inc,
        analysisResult.totals.tech,
        text
      );
      setAnalysisResult({
        ...analysisResult,
        customNotes: text,
        formattedApprovalEmail: updatedEmail,
      });
    }
  };

  // Copy email text
  const handleCopyEmail = () => {
    if (!analysisResult) return;
    navigator.clipboard.writeText(analysisResult.formattedApprovalEmail);
    setCopiedNotice(true);
    setTimeout(() => setCopiedNotice(false), 2500);
  };

  // Create Gmail draft with official text
  const handleCreateGmailDraft = async () => {
    setDraftErrorNotice(null);
    setDraftSuccessNotice(null);
    if (!analysisResult) return;
    if (!accessToken) {
      setDraftErrorNotice('Debes conectar tu cuenta de Gmail en la barra superior para crear el borrador directamente.');
      return;
    }
    setIsCreatingDraft(true);
    try {
      const subject = `Propuesta de Pago - ${analysisResult.targetFullDateLabel}`;
      await createGmailDraft(accessToken, '', subject, analysisResult.formattedApprovalEmail);
      setDraftSuccessNotice(`¡Borrador creado exitosamente en tu Gmail con el asunto "${subject}"!`);
      setTimeout(() => setDraftSuccessNotice(null), 5000);
    } catch (err: any) {
      setDraftErrorNotice(`No se pudo crear el borrador en Gmail: ${err.message}`);
    } finally {
      setIsCreatingDraft(false);
    }
  };

  // Open Gmail web client with prefilled mailto
  const handleOpenGmailWeb = () => {
    if (!analysisResult) return;
    const subject = encodeURIComponent(`Propuesta de Pago - ${analysisResult.targetFullDateLabel}`);
    const body = encodeURIComponent(analysisResult.formattedApprovalEmail);
    window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${subject}&body=${body}`, '_blank');
  };

  // Auto-fill custom notes with findings
  const handleAutoInsertFindingsNotes = () => {
    if (!analysisResult) return;
    const notesParts: string[] = [];
    if (analysisResult.criticalMissing.length > 0) {
      const missingList = analysisResult.criticalMissing
        .map((m) => `• ${m.radarItem.orderNumber} (${m.radarItem.supplierName}): $${formatCurrencyMXN(m.radarItem.amount || 0)} MXN - ${m.radarItem.urgencyLevel === 'urgent' ? 'URGENTE' : 'Revisar'}`)
        .join('\n');
      notesParts.push(`Nota: Se identificaron las siguientes OCs del radar pendientes no incluidas en el archivo:\n${missingList}`);
    }
    if (analysisResult.anomalies.length > 0) {
      notesParts.push(`Se detectaron ${analysisResult.anomalies.length} anomalías/observaciones técnicas en las celdas del archivo que requieren revisión previa.`);
    }
    handleNotesChange(notesParts.join('\n\n'));
  };

  return (
    <div id="proposal-auditor-section" className="space-y-6">
      {/* Workflow Navigation Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 shadow-sm border border-slate-800">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-full text-xs font-semibold">
              <Calculator className="w-3.5 h-3.5" />
              Módulo de Propuestas de Pago Semanales
            </div>
            <h2 className="text-xl font-bold tracking-tight text-white">
              Cruce Autónomo de Propuestas de Pago (Excel vs. Radar Gmail)
            </h2>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              Carga el archivo semanal <code className="text-indigo-300 font-mono">"Propuesta de pago Semana X.xlsx"</code>. El asistente auditará automáticamente las pestañas <span className="font-semibold text-white">SOFOM</span>, <span className="font-semibold text-white">INC</span> y <span className="font-semibold text-white">TECH</span>, cotejará con el Radar de Pagos de Gmail, alertará faltantes críticos y calculará los totales exactos para redactar el correo de aprobación.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              id="btn-load-demo-proposal"
              onClick={handleLoadDemoProposal}
              disabled={isProcessingFile}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-slate-900 bg-amber-400 hover:bg-amber-300 rounded-xl transition-all shadow-sm disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4 text-slate-950" />
              <span>Cargar Propuesta Semana 38 (Demo)</span>
            </button>

            <button
              type="button"
              id="btn-download-demo-template"
              onClick={handleDownloadDemoFile}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 text-xs font-medium text-slate-200 bg-slate-800/80 hover:bg-slate-800 rounded-xl transition-colors border border-slate-700"
              title="Descargar archivo .xlsx de ejemplo con pestañas SOFOM, INC y TECH para inspección"
            >
              <Download className="w-3.5 h-3.5 text-indigo-400" />
              <span>Descargar .xlsx de Muestra</span>
            </button>
          </div>
        </div>

        {/* 4-Step Visual Flow */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-6 pt-5 border-t border-slate-800 text-xs">
          <div className="p-3 bg-slate-800/40 rounded-xl border border-slate-800">
            <span className="text-[10px] font-mono text-indigo-400 font-bold block mb-1">PASO 1</span>
            <strong className="text-white block font-semibold">Radar Gmail</strong>
            <span className="text-slate-400 text-[11px]">
              {radarOrders.length} solicitudes activas extraídas del correo
            </span>
          </div>

          <div className="p-3 bg-slate-800/40 rounded-xl border border-slate-800">
            <span className="text-[10px] font-mono text-indigo-400 font-bold block mb-1">PASO 2</span>
            <strong className="text-white block font-semibold">Recepción Excel</strong>
            <span className="text-slate-400 text-[11px]">
              Lectura de pestañas SOFOM, INC, TECH
            </span>
          </div>

          <div className="p-3 bg-slate-800/40 rounded-xl border border-slate-800">
            <span className="text-[10px] font-mono text-indigo-400 font-bold block mb-1">PASO 3</span>
            <strong className="text-white block font-semibold">Auditoría & Alertas</strong>
            <span className="text-slate-400 text-[11px]">
              Detección de faltantes críticos (🚨) y anomalías
            </span>
          </div>

          <div className="p-3 bg-slate-800/40 rounded-xl border border-slate-800">
            <span className="text-[10px] font-mono text-indigo-400 font-bold block mb-1">PASO 4</span>
            <strong className="text-white block font-semibold">Cálculo & Correo</strong>
            <span className="text-slate-400 text-[11px]">
              Totales por entidad y redacción formal exacta
            </span>
          </div>
        </div>
      </div>

      {/* View Switcher: Chat Interactivo vs Tablero Estructurado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-2.5 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
          <button
            id="btn-switch-auditor-chat"
            type="button"
            onClick={() => setAuditorViewMode('chat')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              auditorViewMode === 'chat'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Chat Asistente IA (Auditoría & Consultas)</span>
          </button>
          <button
            id="btn-switch-auditor-dashboard"
            type="button"
            onClick={() => setAuditorViewMode('dashboard')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              auditorViewMode === 'dashboard'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Tablero Estructurado & Correo Oficial</span>
            {analysisResult && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-indigo-100 text-indigo-800 font-mono font-semibold">
                ${formatCurrencyMXN(analysisResult.totals.overall)}
              </span>
            )}
          </button>
        </div>

        {/* Right side file badge if loaded */}
        {analysisResult && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded-xl text-xs text-indigo-900">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span className="font-semibold truncate max-w-[200px]">{analysisResult.fileName}</span>
            <span className="text-slate-500">• {analysisResult.targetFullDateLabel}</span>
          </div>
        )}
      </div>

      {/* RENDER ACTIVE MODE */}
      {auditorViewMode === 'chat' ? (
        <AuditChat
          radarOrders={radarOrders}
          analysisResult={analysisResult}
          onFileUpload={handleUploadedFile}
          onLoadDemo={handleLoadDemoProposal}
          onOpenDraftModal={onOpenDraftModal}
          onSwitchToDashboard={() => setAuditorViewMode('dashboard')}
        />
      ) : (
        <div className="space-y-6">
          {/* Top Quick Bar to return to Chat */}
          <div className="bg-indigo-900/10 border border-indigo-200 rounded-xl p-3.5 flex items-center justify-between text-xs text-indigo-950">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-indigo-600" />
              <span>
                ¿Deseas consultar pagos específicos, preguntar si algo ya se pagó o dialogar en lenguaje natural?
              </span>
            </div>
            <button
              onClick={() => setAuditorViewMode('chat')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition-colors"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Abrir Chat IA</span>
            </button>
          </div>

          {/* Upload Zone (PASO 2) */}
          <div
            id="excel-dropzone"
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
              dragActive
                ? 'border-indigo-500 bg-indigo-50/50 scale-[1.005]'
                : 'border-slate-300 hover:border-indigo-400 bg-white hover:bg-slate-50/50 shadow-xs'
            }`}
          >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx, .xls, .csv"
          onChange={handleFileChange}
          className="hidden"
          id="file-upload-excel"
        />

        <div className="max-w-md mx-auto space-y-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto shadow-2xs">
            <FileSpreadsheet className="w-6 h-6" />
          </div>

          <div>
            <h3 className="text-sm font-bold text-slate-900">
              {analysisResult
                ? `Archivo cargado: ${analysisResult.fileName}`
                : 'Arrastra y suelta tu archivo "Propuesta de pago Semana X.xlsx" aquí'}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Compatible con libros de Excel (.xlsx, .xls) con pestañas <span className="font-semibold text-slate-700">SOFOM</span>, <span className="font-semibold text-slate-700">INC</span> y <span className="font-semibold text-slate-700">TECH</span>.
            </p>
          </div>

          <div className="flex items-center justify-center gap-3 pt-1">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition-colors shadow-2xs">
              <Upload className="w-3.5 h-3.5" />
              Seleccionar archivo local
            </span>
            <span className="text-xs text-slate-400">o pulsa el botón Demo arriba</span>
          </div>

          {analysisResult && (
            <div className="pt-2 text-[11px] text-emerald-700 font-semibold flex items-center justify-center gap-1">
              <Check className="w-4 h-4 text-emerald-600" />
              Auditoría completada el {new Date(analysisResult.analyzedAt).toLocaleTimeString()}
            </div>
          )}
        </div>
      </div>

      {/* ANALYSIS RESULTS DASHBOARD (PASOS 3 Y 4) */}
      {analysisResult && (
        <div className="space-y-6">
          {/* Critical Alerts Banner (🚨) */}
          {analysisResult.criticalMissing.length > 0 && (
            <div className="p-5 bg-rose-50 border-2 border-rose-400 rounded-2xl shadow-xs space-y-3">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-rose-600 text-white rounded-xl shrink-0">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-rose-950 flex items-center gap-2">
                    <span>🚨 ALERTA CRÍTICA: {analysisResult.criticalMissing.length} Órdenes del Radar FALTANTES en la Propuesta</span>
                  </h3>
                  <p className="text-xs text-rose-800 mt-0.5 leading-relaxed">
                    Las siguientes órdenes de compra están registradas en tu Radar de Pagos de Gmail (marcadas como Urgentes o para la fecha de corte) pero <strong>NO fueron incluidas</strong> en ninguna de las pestañas del archivo Excel semanal:
                  </p>
                </div>
              </div>

              <div className="space-y-2 pt-1">
                {analysisResult.criticalMissing.map((missing, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 bg-white border border-rose-300 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          {missing.radarItem.orderNumber}
                        </span>
                        <strong className="text-xs text-slate-900">{missing.radarItem.supplierName}</strong>
                        {missing.isUrgent && (
                          <span className="text-[10px] font-bold px-2 py-0.5 bg-rose-100 text-rose-800 rounded-full">
                            URGENTE
                          </span>
                        )}
                        <span className="text-[11px] text-slate-500">
                          (Fecha esperada: {missing.expectedDate})
                        </span>
                      </div>
                      <p className="text-xs text-rose-700">{missing.reason}</p>
                      {missing.radarItem.summary && (
                        <p className="text-[11px] text-slate-500 italic">
                          Detalle correo: "{missing.radarItem.summary}"
                        </p>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      <div className="font-mono font-bold text-sm text-rose-900">
                        ${formatCurrencyMXN(missing.radarItem.amount || 0)} {missing.radarItem.currency}
                      </div>
                      <span className="text-[10px] text-rose-600 block">No encontrado en Excel</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Totals Summary Cards (PASO 4) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* KUESKI SOFOM */}
            <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">KUESKI SOFOM</span>
                <span className="text-[10px] font-mono px-2 py-0.5 bg-indigo-50 text-indigo-700 font-bold rounded">
                  Pestaña SOFOM
                </span>
              </div>
              <div className="text-xl font-bold font-mono text-slate-900 tracking-tight">
                ${formatCurrencyMXN(analysisResult.totals.sofom)} <span className="text-xs text-slate-500 font-normal">MXN</span>
              </div>
              <div className="text-[11px] text-slate-500">
                {analysisResult.sheets['SOFOM']?.items.length || 0} partidas registradas
              </div>
            </div>

            {/* KUESKI INC */}
            <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">KUESKI INC</span>
                <span className="text-[10px] font-mono px-2 py-0.5 bg-blue-50 text-blue-700 font-bold rounded">
                  Pestaña INC
                </span>
              </div>
              <div className="text-xl font-bold font-mono text-slate-900 tracking-tight">
                ${formatCurrencyMXN(analysisResult.totals.inc)} <span className="text-xs text-slate-500 font-normal">MXN</span>
              </div>
              <div className="text-[11px] text-slate-500">
                {analysisResult.sheets['INC']?.items.length || 0} partidas registradas
              </div>
            </div>

            {/* KUESKI TECH */}
            <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">KUESKI TECH</span>
                <span className="text-[10px] font-mono px-2 py-0.5 bg-teal-50 text-teal-700 font-bold rounded">
                  Pestaña TECH
                </span>
              </div>
              <div className="text-xl font-bold font-mono text-slate-900 tracking-tight">
                ${formatCurrencyMXN(analysisResult.totals.tech)} <span className="text-xs text-slate-500 font-normal">MXN</span>
              </div>
              <div className="text-[11px] text-slate-500">
                {analysisResult.sheets['TECH']?.items.length || 0} partidas registradas
              </div>
            </div>

            {/* TOTAL CONSOLIDADO */}
            <div className="p-5 bg-slate-900 text-white border border-slate-800 rounded-xl shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">TOTAL PROPUESTA</span>
                <span className="text-[10px] font-mono px-2 py-0.5 bg-emerald-500/20 text-emerald-300 font-bold rounded">
                  Consolidado
                </span>
              </div>
              <div className="text-xl font-bold font-mono text-emerald-400 tracking-tight">
                ${formatCurrencyMXN(analysisResult.totals.overall)} <span className="text-xs text-slate-400 font-normal">MXN</span>
              </div>
              <div className="text-[11px] text-slate-400">
                Suma exacta de las 3 entidades
              </div>
            </div>
          </div>

          {/* Sub Navigation Tabs */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="flex flex-wrap items-center justify-between border-b border-slate-200 px-5 pt-3 bg-slate-50/50">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveSubTab('summary')}
                  className={`inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
                    activeSubTab === 'summary'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Mail className="w-3.5 h-3.5" />
                  Redacción del Correo Final
                </button>

                <button
                  type="button"
                  onClick={() => setActiveSubTab('matches')}
                  className={`inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
                    activeSubTab === 'matches'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <FileCheck className="w-3.5 h-3.5 text-emerald-600" />
                  Aciertos Confirmados ({analysisResult.matches.length})
                </button>

                <button
                  type="button"
                  onClick={() => setActiveSubTab('missing')}
                  className={`inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
                    activeSubTab === 'missing'
                      ? 'border-rose-600 text-rose-600'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                  Faltantes Críticos ({analysisResult.criticalMissing.length})
                </button>

                <button
                  type="button"
                  onClick={() => setActiveSubTab('anomalies')}
                  className={`inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
                    activeSubTab === 'anomalies'
                      ? 'border-amber-600 text-amber-600'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  Anomalías Detectadas ({analysisResult.anomalies.length})
                </button>

                <button
                  type="button"
                  onClick={() => setActiveSubTab('sheets')}
                  className={`inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
                    activeSubTab === 'sheets'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5 text-slate-600" />
                  Detalle de Pestañas
                </button>
              </div>

              <div className="pb-2 text-xs text-slate-500 font-mono">
                {analysisResult.fileName}
              </div>
            </div>

            <div className="p-6">
              {/* SUBTAB 1: EXACT APPROVAL EMAIL DRAFT */}
              {activeSubTab === 'summary' && (
                <div className="space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-indigo-50/70 border border-indigo-200 rounded-xl">
                    <div>
                      <h4 className="text-xs font-bold text-indigo-950 uppercase tracking-wider">
                        Estructura Exacta del Correo de Aprobación
                      </h4>
                      <p className="text-xs text-indigo-800 mt-0.5">
                        El formato respeta estrictamente la plantilla solicitada, calculando los totales de cada entidad para{' '}
                        <strong className="font-semibold">{analysisResult.targetFullDateLabel}</strong>.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        id="btn-copy-approval-email"
                        onClick={handleCopyEmail}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-900 border border-slate-300 rounded-lg text-xs font-semibold transition-all shadow-2xs"
                      >
                        {copiedNotice ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-600" />}
                        <span>{copiedNotice ? '¡Copiado!' : 'Copiar Texto Exacto'}</span>
                      </button>

                      <button
                        type="button"
                        id="btn-create-approval-draft"
                        onClick={handleCreateGmailDraft}
                        disabled={isCreatingDraft || !accessToken}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-all shadow-2xs disabled:opacity-50"
                        title={accessToken ? 'Crear borrador en tu Gmail' : 'Conecta tu Gmail arriba para usar esta función'}
                      >
                        {isCreatingDraft ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5 text-indigo-300" />}
                        <span>Crear Borrador en Gmail</span>
                      </button>

                      <button
                        type="button"
                        id="btn-open-web-gmail"
                        onClick={handleOpenGmailWeb}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg text-xs transition-colors"
                        title="Abrir en Gmail Web en nueva pestaña"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {draftSuccessNotice && (
                    <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-semibold rounded-xl flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>{draftSuccessNotice}</span>
                    </div>
                  )}

                  {draftErrorNotice && (
                    <div className="p-3 bg-rose-50 border border-rose-300 text-rose-800 text-xs font-semibold rounded-xl flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>{draftErrorNotice}</span>
                    </div>
                  )}

                  {/* Pre-formatted Email Preview */}
                  <div className="bg-slate-900 text-slate-100 rounded-xl p-6 font-mono text-xs leading-relaxed shadow-xs border border-slate-800 whitespace-pre-wrap selection:bg-indigo-600 selection:text-white">
                    {analysisResult.formattedApprovalEmail}
                  </div>

                  {/* Custom Notes Input Field */}
                  <div className="space-y-2 pt-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                        <Info className="w-3.5 h-3.5 text-indigo-600" />
                        Notas adicionales requeridas (opcional):
                      </label>
                      <button
                        type="button"
                        onClick={handleAutoInsertFindingsNotes}
                        className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold"
                      >
                        + Insertar resumen de alertas detectadas
                      </button>
                    </div>
                    <textarea
                      rows={3}
                      value={customNotes}
                      onChange={(e) => handleNotesChange(e.target.value)}
                      placeholder="Si no se requiere ninguna nota, deja este campo vacío y la línea se omitirá automáticamente del correo final."
                      className="w-full text-xs p-3 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-600 focus:bg-white font-sans"
                    />
                    <span className="text-[11px] text-slate-400 block">
                      Cualquier texto aquí se insertará inmediatamente antes de "Saludos." respetando el estándar.
                    </span>
                  </div>
                </div>
              )}

              {/* SUBTAB 2: MATCHES CONFIRMED */}
              {activeSubTab === 'matches' && (
                <div className="space-y-3">
                  <div className="text-xs text-slate-600">
                    Se cruzaron las solicitudes de pago del Radar de Gmail con el archivo Excel. Se confirmaron{' '}
                    <strong className="font-semibold text-slate-900">{analysisResult.matches.length} coincidencias</strong>:
                  </div>

                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[10px]">
                        <tr>
                          <th className="py-2.5 px-3">OC / PO</th>
                          <th className="py-2.5 px-3">Proveedor</th>
                          <th className="py-2.5 px-3">Pestaña Excel</th>
                          <th className="py-2.5 px-3">Monto Excel</th>
                          <th className="py-2.5 px-3">Monto Radar</th>
                          <th className="py-2.5 px-3">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {analysisResult.matches.map((m, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                              <a
                                href={getGmailUrl(m.radarItem)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 hover:text-indigo-600 hover:underline cursor-pointer"
                                title="Abrir correo original en Gmail"
                              >
                                <span>{m.radarItem.orderNumber}</span>
                                <ExternalLink className="w-3 h-3 opacity-60 hover:opacity-100 text-indigo-600" />
                              </a>
                            </td>
                            <td className="py-2.5 px-3 font-medium text-slate-800">
                              {m.radarItem.supplierName}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 font-bold rounded text-[10px]">
                                {m.excelRow.sheetName}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-mono font-semibold text-slate-900">
                              ${formatCurrencyMXN(m.excelRow.amount)} {m.excelRow.currency}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-600">
                              ${formatCurrencyMXN(m.radarItem.amount || 0)} {m.radarItem.currency}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                Incluido
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* SUBTAB 3: CRITICAL MISSING (🚨) */}
              {activeSubTab === 'missing' && (
                <div className="space-y-4">
                  <div className="text-xs text-slate-600">
                    Órdenes extraídas del correo corporativo que <strong>no se encontraron</strong> en el archivo Excel semanal:
                  </div>

                  {analysisResult.criticalMissing.length === 0 ? (
                    <div className="p-8 text-center bg-emerald-50/50 border border-emerald-200 rounded-xl space-y-2">
                      <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                      <h4 className="text-xs font-bold text-emerald-950">¡Sin faltantes críticos!</h4>
                      <p className="text-xs text-emerald-800">
                        Todas las órdenes de compra urgentes o programadas del Radar de Pagos fueron encontradas en el archivo Excel.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {analysisResult.criticalMissing.map((missing, idx) => (
                        <div
                          key={idx}
                          className="p-4 bg-white border border-rose-300 rounded-xl shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <a
                                href={getGmailUrl(missing.radarItem)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-mono font-bold text-xs bg-rose-50 text-rose-900 px-2 py-0.5 rounded border border-rose-200 hover:bg-rose-100 hover:border-rose-300 inline-flex items-center gap-1 cursor-pointer"
                                title="Abrir correo original en Gmail"
                              >
                                <span>{missing.radarItem.orderNumber}</span>
                                <ExternalLink className="w-2.5 h-2.5 text-rose-600" />
                              </a>
                              <strong className="text-xs text-slate-900">{missing.radarItem.supplierName}</strong>
                              <span className="text-[10px] px-2 py-0.5 bg-rose-100 text-rose-800 font-bold rounded-full">
                                {missing.radarItem.urgencyLevel === 'urgent' ? '🚨 URGENTE' : 'PENDIENTE'}
                              </span>
                            </div>
                            <p className="text-xs text-rose-800">{missing.reason}</p>
                            <a
                              href={getGmailUrl(missing.radarItem)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] text-slate-500 hover:text-indigo-600 hover:underline inline-flex items-center gap-1 cursor-pointer group"
                              title="Abrir este correo en Gmail"
                            >
                              <Mail className="w-3 h-3 text-indigo-500 group-hover:scale-110 transition-transform" />
                              <span>Asunto correo: "{missing.radarItem.emailSubject}" ({missing.radarItem.emailDate})</span>
                              <ExternalLink className="w-2.5 h-2.5 opacity-60 group-hover:opacity-100" />
                            </a>
                          </div>

                          <div className="text-right shrink-0">
                            <div className="font-mono font-bold text-sm text-slate-900">
                              ${formatCurrencyMXN(missing.radarItem.amount || 0)} {missing.radarItem.currency}
                            </div>
                            <span className="text-[10px] text-rose-600 font-semibold block">
                              Faltante en SOFOM, INC y TECH
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* SUBTAB 4: ANOMALIES */}
              {activeSubTab === 'anomalies' && (
                <div className="space-y-4">
                  <div className="text-xs text-slate-600">
                    Revisión automática de calidad de datos en las celdas del archivo Excel:
                  </div>

                  {analysisResult.anomalies.length === 0 ? (
                    <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                      <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                      <h4 className="text-xs font-bold text-slate-900">Sin anomalías detectadas</h4>
                      <p className="text-xs text-slate-500">
                        No se detectaron montos negativos, celdas vacías en campos clave ni registros duplicados dentro del archivo.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {analysisResult.anomalies.map((ano) => (
                        <div
                          key={ano.id}
                          className="p-3.5 bg-amber-50/60 border border-amber-200 rounded-xl flex items-start gap-3 shadow-2xs"
                        >
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-xs text-amber-950 uppercase tracking-wide">
                                {ano.type === 'negative_amount' && 'Monto Negativo'}
                                {ano.type === 'missing_field' && 'Celdas Vacías en Campos Clave'}
                                {ano.type === 'duplicate_record' && 'Registro Duplicado'}
                              </span>
                              <span className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-900 rounded font-mono">
                                {ano.sheet}
                              </span>
                            </div>
                            <p className="text-xs text-amber-900">{ano.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* SUBTAB 5: SHEETS BREAKDOWN */}
              {activeSubTab === 'sheets' && (
                <div className="space-y-5">
                  {Object.entries(analysisResult.sheets).map(([key, sheet]) => (
                    <div key={key} className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                      <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <strong className="text-xs font-bold text-slate-900">{sheet.displayName}</strong>
                          <span className="text-[10px] text-slate-500">({sheet.items.length} partidas)</span>
                        </div>
                        <div className="font-mono font-bold text-xs text-slate-900">
                          Total: ${formatCurrencyMXN(sheet.total)} {sheet.currency}
                        </div>
                      </div>

                      <div className="max-h-60 overflow-y-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-white border-b border-slate-100 text-[10px] text-slate-500 uppercase">
                            <tr>
                              <th className="py-2 px-3">Fila</th>
                              <th className="py-2 px-3">OC / Folio</th>
                              <th className="py-2 px-3">Proveedor</th>
                              <th className="py-2 px-3 text-right">Monto</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {sheet.items.map((row) => (
                              <tr key={row.id} className="hover:bg-slate-50/50">
                                <td className="py-2 px-3 font-mono text-slate-400 text-[10px]">{row.rowNumber}</td>
                                <td className="py-2 px-3 font-mono font-semibold text-slate-800">{row.orderNumber}</td>
                                <td className="py-2 px-3 text-slate-700">{row.supplierName}</td>
                                <td className="py-2 px-3 font-mono text-slate-900 text-right">
                                  ${formatCurrencyMXN(row.amount)} {row.currency}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
        </div>
      )}
    </div>
  );
};
