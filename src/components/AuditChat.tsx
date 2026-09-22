import React, { useState, useRef, useEffect } from 'react';
import Markdown from 'react-markdown';
import {
  Send,
  Paperclip,
  Bot,
  User,
  Sparkles,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
  RefreshCw,
  Copy,
  Check,
  Download,
  Layers,
  HelpCircle,
} from 'lucide-react';
import {
  PaymentOrder,
  ProposalAnalysisResult,
  AuditChatMessage,
} from '../types';
import { formatCurrencyMXN } from '../services/excelParser';
import { fetchBackendHealth, formatModelLabel, readApiError } from '../services/api';

interface AuditChatProps {
  radarOrders: PaymentOrder[];
  analysisResult: ProposalAnalysisResult | null;
  onFileUpload: (file: File) => void;
  onLoadDemo: () => void;
  onOpenDraftModal?: (order: PaymentOrder) => void;
  onSwitchToDashboard?: () => void;
}

const DEFAULT_PROMPTS = [
  {
    label: '🚨 ¿Qué pagos debo considerar?',
    prompt: '¿Qué pagos debo considerar para esta semana según el radar de correos y la propuesta?',
  },
  {
    label: '💳 ¿Ya se pagó Cisco o algo más?',
    prompt: '¿Ya se pagó la factura de Cisco Systems o qué órdenes ya fueron liquidadas?',
  },
  {
    label: '🔍 ¿Qué órdenes faltan en el Excel?',
    prompt: '¿Qué pagos críticos del radar faltan por incluir en las hojas del archivo Excel?',
  },
  {
    label: '💰 Totales SOFOM, INC y TECH',
    prompt: '¿Cuáles son los totales a cubrir desglosados para KUESKI SOFOM, KUESKI INC y KUESKI TECH?',
  },
  {
    label: '⚠️ ¿Hay anomalías o montos negativos?',
    prompt: '¿Hay alguna anomalía técnica, monto negativo o celda vacía en el archivo Excel?',
  },
  {
    label: '✉️ Redáctame el correo oficial',
    prompt: 'Redáctame el correo formal de aprobación con la estructura requerida para enviar al equipo.',
  },
];

export const AuditChat: React.FC<AuditChatProps> = ({
  radarOrders,
  analysisResult,
  onFileUpload,
  onLoadDemo,
  onOpenDraftModal,
  onSwitchToDashboard,
}) => {
  const [messages, setMessages] = useState<AuditChatMessage[]>(() => {
    return [
      {
        id: 'msg-welcome',
        sender: 'assistant',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        text: `¡Hola! Soy tu **Asistente de Operaciones Financieras y Auditoría AP** de Kueski.

Tengo sincronizado el **Radar de Pagos de Gmail** con **${radarOrders.length} compromisos registrados** (${radarOrders.filter((o) => o.urgencyLevel === 'urgent').length} urgentes, ${radarOrders.filter((o) => o.isCompletedPayment).length} en historial de pagos liquidados).

**¿Cómo puedo ayudarte?**
- Puedes **adjuntar o arrastrar tu archivo** \`Propuesta de pago Semana X.xlsx\` para auditarlo en segundos.
- Puedes preguntarme qué pagos debes programar o considerar.
- Puedes consultarme si algún proveedor o factura ya fue pagado previamente.
- Puedo cotejar discrepancias, montos negativos y redactar el correo de aprobación oficial.`,
        suggestedActions: DEFAULT_PROMPTS.slice(0, 4),
      },
    ];
  });

  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [modelLabel, setModelLabel] = useState('Gemini');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Report the model the backend is actually configured with, not a hardcoded name.
  useEffect(() => {
    let cancelled = false;
    fetchBackendHealth().then((health) => {
      if (!cancelled && health?.model) setModelLabel(formatModelLabel(health.model));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // When a new analysis result is loaded, post an automatic executive audit message
  useEffect(() => {
    if (!analysisResult) return;

    const criticalCount = analysisResult.criticalMissing.length;
    const anomaliesCount = analysisResult.anomalies.length;
    const totals = analysisResult.totals;

    const auditSummaryText = `📄 **Archivo auditado con éxito:** \`${analysisResult.fileName}\`
Destino: **${analysisResult.targetFullDateLabel}**

---
### 📊 Totales Calculados por Entidad:
- **KUESKI SOFOM:** $${formatCurrencyMXN(totals.sofom)} MXN (${analysisResult.sheets['SOFOM']?.items.length || 0} partidas)
- **KUESKI INC:** $${formatCurrencyMXN(totals.inc)} MXN (${analysisResult.sheets['INC']?.items.length || 0} partidas)
- **KUESKI TECH:** $${formatCurrencyMXN(totals.tech)} MXN (${analysisResult.sheets['TECH']?.items.length || 0} partidas)
- **Total Consolidado:** **$${formatCurrencyMXN(totals.overall)} MXN**

---
${
  criticalCount > 0
    ? `### 🚨 Faltantes Críticos Identificados (${criticalCount}):\n` +
      analysisResult.criticalMissing
        .map(
          (m) =>
            `- **${m.radarItem.orderNumber}** (${m.radarItem.supplierName}): **$${formatCurrencyMXN(
              m.radarItem.amount || 0
            )} MXN** (${m.isUrgent ? 'URGENTE' : 'Pendiente'}). *${m.reason}*`
        )
        .join('\n')
    : `✅ **No se detectaron faltantes críticos:** Todas las órdenes urgentes del radar fueron localizadas en el archivo.`
}

${
  anomaliesCount > 0
    ? `\n### ⚠️ Observaciones Técnicas (${anomaliesCount}):\n` +
      analysisResult.anomalies
        .slice(0, 3)
        .map((a) => `- [Pestaña ${a.sheet}, Fila ${a.rowNumber}] ${a.description}`)
        .join('\n') +
      (anomaliesCount > 3 ? `\n- *...y ${anomaliesCount - 3} anomalías más.*` : '')
    : `\n✅ Sin anomalías de formato, celdas vacías o montos negativos.`
}

¿Deseas que prepare el borrador de correo formal o tienes alguna pregunta específica sobre estas partidas?`;

    setMessages((prev) => [
      ...prev,
      {
        id: `audit-${Date.now()}`,
        sender: 'assistant',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        text: auditSummaryText,
        fileAttachment: {
          name: analysisResult.fileName,
        },
        suggestedActions: [
          {
            label: '✉️ Ver correo formal de aprobación',
            prompt: 'Muéstrame el correo formal con los totales desglosados y notas para enviarlo a aprobación.',
          },
          {
            label: '🚨 ¿Por qué falta Oracle Cloud?',
            prompt: 'Explícame el caso de Oracle Cloud y qué acción debemos tomar.',
          },
          {
            label: '💳 ¿Cisco ya fue pagado?',
            prompt: '¿Cisco Systems ya fue pagado? Confírmame los datos de su pago.',
          },
        ],
      },
    ]);
  }, [analysisResult?.analyzedAt]);

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || inputText).trim();
    if (!query || isLoading) return;

    const userMessage: AuditChatMessage = {
      id: `msg-user-${Date.now()}`,
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInputText('');
    setIsLoading(true);

    try {
      // Call server audit-chat API
      const res = await fetch('/api/audit-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({
            role: m.sender,
            content: m.text,
          })),
          radarOrders,
          analysisResult: analysisResult
            ? {
                fileName: analysisResult.fileName,
                targetFullDateLabel: analysisResult.targetFullDateLabel,
                totals: analysisResult.totals,
                sheets: analysisResult.sheets,
                criticalMissing: analysisResult.criticalMissing,
                anomalies: analysisResult.anomalies,
                matches: analysisResult.matches,
                formattedApprovalEmail: analysisResult.formattedApprovalEmail,
              }
            : null,
        }),
      });

      if (!res.ok) {
        throw await readApiError(res, 'Error al consultar el asistente');
      }

      const data = await res.json();
      const botReply = data.reply || 'No pude obtener una respuesta. Por favor intenta de nuevo.';

      setMessages((prev) => [
        ...prev,
        {
          id: `msg-bot-${Date.now()}`,
          sender: 'assistant',
          text: botReply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-bot-err-${Date.now()}`,
          sender: 'assistant',
          text: `⚠️ Lo siento, ocurrió un error al procesar tu solicitud: ${err.message || 'Error de conexión'}. Verifica que el servidor esté activo.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Drag & drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        onFileUpload(file);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `msg-err-${Date.now()}`,
            sender: 'assistant',
            text: '⚠️ El archivo seleccionado no tiene formato Excel válido. Por favor arrastra o selecciona un archivo con extensión `.xlsx` o `.xls` (por ejemplo, `Propuesta de pago Semana 38.xlsx`).',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      }
    }
  };

  const handleCopyText = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div
      id="audit-chat-container"
      className="flex flex-col h-[740px] bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden relative"
      onDragEnter={handleDrag}
    >
      {/* Drag Over Overlay */}
      {dragActive && (
        <div
          id="chat-drag-overlay"
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className="absolute inset-0 bg-indigo-900/90 backdrop-blur-xs z-50 flex flex-col items-center justify-center text-white border-2 border-dashed border-indigo-400 p-6 m-3 rounded-xl transition-all"
        >
          <FileSpreadsheet className="w-16 h-16 text-indigo-200 mb-3 animate-bounce" />
          <h3 className="text-lg font-bold">Suelta tu archivo Excel aquí</h3>
          <p className="text-xs text-indigo-200 mt-1 text-center">
            Se auditará automáticamente contra el Radar de Pagos y estará disponible en el chat.
          </p>
        </div>
      )}

      {/* Header Bar */}
      <div className="bg-slate-950/80 backdrop-blur-md px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-xs">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white tracking-tight">
                Chat Financiero AP • Auditoría Excel vs. Radar
              </h3>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {modelLabel}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Conectado a {radarOrders.length} órdenes en Radar Gmail • Historial de Pagos Efectuados activo
            </p>
          </div>
        </div>

        {/* Action Controls & Active File indicator */}
        <div className="flex items-center gap-2">
          {analysisResult ? (
            <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 bg-indigo-950/60 border border-indigo-500/30 rounded-lg text-xs text-indigo-200">
              <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-400" />
              <span className="font-medium max-w-[140px] truncate">{analysisResult.fileName}</span>
              <span className="text-[10px] bg-indigo-800/60 px-1.5 py-0.5 rounded text-indigo-300 font-mono">
                ${formatCurrencyMXN(analysisResult.totals.overall)}
              </span>
            </div>
          ) : (
            <button
              onClick={onLoadDemo}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/40 transition-colors"
              title="Cargar archivo Excel de ejemplo para probar el asistente"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Cargar Demo Semana 38</span>
            </button>
          )}

          {onSwitchToDashboard && (
            <button
              onClick={onSwitchToDashboard}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
              title="Ver el desglose en tablas, métricas y redactor de correo"
            >
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden md:inline">Ver Tablero Estructurado</span>
            </button>
          )}
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-slate-900/60">
        {messages.map((msg, index) => {
          const isAssistant = msg.sender === 'assistant';

          return (
            <div
              key={msg.id}
              className={`flex gap-3 max-w-4xl ${
                isAssistant ? 'mr-auto' : 'ml-auto flex-row-reverse'
              }`}
            >
              {/* Avatar */}
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-1 shadow-xs ${
                  isAssistant
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-700 text-slate-200'
                }`}
              >
                {isAssistant ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
              </div>

              {/* Bubble Body */}
              <div className="flex-1 space-y-2">
                <div
                  className={`rounded-2xl p-4 shadow-xs text-sm ${
                    isAssistant
                      ? 'bg-slate-800/90 border border-slate-700 text-slate-100 rounded-tl-xs'
                      : 'bg-indigo-600 text-white rounded-tr-xs ml-auto'
                  }`}
                >
                  {/* File badge if any */}
                  {msg.fileAttachment && (
                    <div className="mb-3 inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-indigo-950/70 border border-indigo-500/40 text-xs text-indigo-200">
                      <FileSpreadsheet className="w-4 h-4 text-indigo-400" />
                      <span className="font-semibold">{msg.fileAttachment.name}</span>
                      <span className="text-[10px] text-indigo-300">• Archivo adjuntado</span>
                    </div>
                  )}

                  {/* Message Content */}
                  <div className="prose prose-invert prose-sm max-w-none text-slate-100 leading-relaxed break-words">
                    <Markdown>{msg.text}</Markdown>
                  </div>

                  {/* Actions footer on assistant messages */}
                  {isAssistant && (
                    <div className="mt-3 pt-2.5 border-t border-slate-700/60 flex items-center justify-between text-[11px] text-slate-400">
                      <span>{msg.timestamp}</span>
                      <button
                        onClick={() => handleCopyText(msg.text, index)}
                        className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-200 transition-colors"
                        title="Copiar texto de la respuesta"
                      >
                        {copiedIndex === index ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span className="text-emerald-400">Copiado</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copiar</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {/* Suggested Action Chips on Assistant messages */}
                {isAssistant && msg.suggestedActions && msg.suggestedActions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {msg.suggestedActions.map((action, actionIdx) => (
                      <button
                        key={actionIdx}
                        onClick={() => handleSendMessage(action.prompt)}
                        className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors"
                      >
                        <span>{action.label}</span>
                        <ArrowRight className="w-3 h-3 text-indigo-400" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {isLoading && (
          <div className="flex gap-3 max-w-xl mr-auto">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Bot className="w-4 h-4 animate-spin" />
            </div>
            <div className="bg-slate-800/90 border border-slate-700 text-slate-300 rounded-2xl rounded-tl-xs p-4 flex items-center gap-2 text-xs">
              <Sparkles className="w-4 h-4 text-indigo-400 animate-pulse" />
              <span>Analizando radar de pagos y cotejando propuesta con Gemini...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Quick Questions Toolbar */}
      <div className="bg-slate-950/90 border-t border-slate-800/80 px-4 py-2 overflow-x-auto flex items-center gap-2 scrollbar-none">
        <span className="text-[11px] text-slate-400 font-medium shrink-0 flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-indigo-400" />
          Preguntas rápidas:
        </span>
        {DEFAULT_PROMPTS.map((p, idx) => (
          <button
            key={idx}
            onClick={() => handleSendMessage(p.prompt)}
            disabled={isLoading}
            className="shrink-0 px-2.5 py-1 text-xs rounded-lg bg-slate-900 hover:bg-indigo-950/80 text-slate-300 hover:text-indigo-200 border border-slate-800 hover:border-indigo-500/40 transition-colors disabled:opacity-50"
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Chat Input Bar */}
      <div className="bg-slate-950 p-3 sm:p-4 border-t border-slate-800">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-end gap-2"
        >
          {/* Hidden file input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                onFileUpload(e.target.files[0]);
              }
            }}
            accept=".xlsx,.xls"
            className="hidden"
          />

          {/* Attachment button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors shrink-0"
            title="Cargar archivo Excel de propuesta semanal (.xlsx)"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          {/* Input Textarea */}
          <div className="flex-1 relative">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                analysisResult
                  ? `Pregunta sobre "${analysisResult.fileName}", pagos a considerar, Cisco, totales o faltantes...`
                  : 'Escribe tu pregunta o adjunta tu archivo Excel de la propuesta semanal...'
              }
              rows={1}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 resize-none min-h-[42px] max-h-[120px]"
            />
          </div>

          {/* Send button */}
          <button
            type="submit"
            disabled={!inputText.trim() || isLoading}
            className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-medium transition-colors shrink-0 shadow-xs flex items-center justify-center"
            title="Enviar mensaje"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>

        {/* Input Footer Note */}
        <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400 px-1">
          <span>
            💡 Puedes arrastrar y soltar el archivo <code className="text-indigo-300">.xlsx</code> directamente aquí en la ventana.
          </span>
          <span>Presiona <kbd className="bg-slate-800 px-1 py-0.5 rounded text-[10px] text-slate-300">Enter</kbd> para enviar</span>
        </div>
      </div>
    </div>
  );
};
