import React, { useState, useEffect } from 'react';
import { PaymentOrder, DraftTemplateConfig } from '../types';
import { DEFAULT_TEMPLATES, fillTemplate } from '../utils/draftTemplates';
import { createGmailDraft, generateGmailComposeUrl } from '../services/gmail';
import { readApiError } from '../services/api';
import {
  X,
  Send,
  ExternalLink,
  Flame,
  Zap,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Edit3,
  RefreshCw,
  Share2,
  Link2,
} from 'lucide-react';

interface DraftModalProps {
  order: PaymentOrder | null;
  initialType: 'urgent' | 'advance';
  accessToken: string | null;
  isOpen: boolean;
  onClose: () => void;
  templates: DraftTemplateConfig[];
  onUpdateTemplate: (template: DraftTemplateConfig) => void;
}

export const DraftModal: React.FC<DraftModalProps> = ({
  order,
  initialType,
  accessToken,
  isOpen,
  onClose,
  templates,
  onUpdateTemplate,
}) => {
  if (!isOpen || !order) return null;

  const [draftType, setDraftType] = useState<'urgent' | 'advance'>(initialType);
  const [recipientEmail, setRecipientEmail] = useState('finanzas@empresa.com, pagos@empresa.com');
  const [orderNumber, setOrderNumber] = useState(order.orderNumber || '');
  const [supplierName, setSupplierName] = useState(order.supplierName || '');
  const [amount, setAmount] = useState(order.amount ? String(order.amount) : '');
  const [currency, setCurrency] = useState(order.currency || 'MXN');
  const [dueDate, setDueDate] = useState(order.paymentDueDate || '');
  const [invoiceNumber, setInvoiceNumber] = useState(order.invoiceNumber || '');
  const [bankDetails, setBankDetails] = useState('BBVA CLABE 012180001234567890 (Beneficiario: ' + (order.supplierName || '') + ')');
  const [advancePercentage, setAdvancePercentage] = useState('50%');
  const [justification, setJustification] = useState(
    draftType === 'urgent'
      ? 'Vencimiento el ' + (order.paymentDueDate || 'inmediato') + ' para evitar suspensión de suministro.'
      : 'Anticipo contractual requerido para liberación de embarque y producción.'
  );
  const [additionalNotes, setAdditionalNotes] = useState(order.riskNotes || 'Factura y OC anexas en el hilo de correos.');

  // Formatted subject & body
  const [generatedSubject, setGeneratedSubject] = useState('');
  const [generatedBody, setGeneratedBody] = useState('');
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [isCreatingDraft, setIsCreatingDraft] = useState(false);
  const [createdDraftLink, setCreatedDraftLink] = useState<string | null>(null);
  const [copiedSuccess, setCopiedSuccess] = useState(false);
  const [copiedShareUrl, setCopiedShareUrl] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Template active
  const currentTemplate = templates.find((t) => t.type === draftType) || DEFAULT_TEMPLATES[0];

  // Recalculate template fields
  const buildFromTemplate = (type: 'urgent' | 'advance') => {
    const tpl = templates.find((t) => t.type === type) || DEFAULT_TEMPLATES.find((t) => t.type === type)!;
    const vars: Record<string, string> = {
      ORDER_NUMBER: orderNumber || order.orderNumber,
      SUPPLIER_NAME: supplierName || order.supplierName,
      AMOUNT: amount || (order.amount ? String(order.amount) : ''),
      CURRENCY: currency,
      DUE_DATE: dueDate || order.paymentDueDate,
      INVOICE_NUMBER: invoiceNumber || order.invoiceNumber || 'Pendiente de emisión / recepción',
      BANK_DETAILS: bankDetails,
      AREA: '[ESCRIBE_AQUÍ_ÁREA_O_DEPARTAMENTO]',
      JUSTIFICATION: justification,
      ADVANCE_PERCENTAGE: advancePercentage,
      PAYMENT_TERMS: order.paymentTerm || 'Anticipo al colocar orden',
      ADDITIONAL_NOTES: additionalNotes,
    };

    setGeneratedSubject(fillTemplate(tpl.subjectTemplate, vars));
    setGeneratedBody(fillTemplate(tpl.bodyTemplate, vars));
  };

  useEffect(() => {
    buildFromTemplate(draftType);
  }, [
    draftType,
    orderNumber,
    supplierName,
    amount,
    currency,
    dueDate,
    invoiceNumber,
    bankDetails,
    advancePercentage,
    justification,
    additionalNotes,
  ]);

  // AI Assistant polish
  const handlePolishWithGemini = async () => {
    setIsAiGenerating(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/generate-draft-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: draftType,
          orderNumber,
          supplierName,
          amount: amount ? Number(amount) : null,
          currency,
          dueDate,
          bankDetails,
          reason: justification,
          notes: additionalNotes,
        }),
      });

      if (!res.ok) {
        throw await readApiError(res, 'Error al conectar con el asistente de IA');
      }

      const data = await res.json();
      if (data.subject && data.bodyText) {
        setGeneratedSubject(data.subject);
        setGeneratedBody(data.bodyText);
        setStatusMessage({ type: 'success', text: 'Borrador optimizado con IA exitosamente.' });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'No se pudo optimizar con IA' });
    } finally {
      setIsAiGenerating(false);
    }
  };

  // Generate web compose URL
  const composeWebUrl = generateGmailComposeUrl({
    to: recipientEmail,
    subject: generatedSubject,
    body: generatedBody,
  });

  // Direct Gmail API draft creation
  const handleCreateInGmailAccount = async () => {
    if (!accessToken) {
      // Fallback: directly open web compose link in Gmail
      window.open(composeWebUrl, '_blank');
      return;
    }

    setIsCreatingDraft(true);
    setStatusMessage(null);
    try {
      const result = await createGmailDraft(
        accessToken,
        recipientEmail,
        generatedSubject,
        generatedBody
      );
      // Link to Gmail drafts
      const draftUrl = `https://mail.google.com/mail/#drafts`;
      setCreatedDraftLink(draftUrl);
      setStatusMessage({
        type: 'success',
        text: `¡Borrador creado en tu bandeja de Gmail! (ID: ${result.draftId})`,
      });
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: `Error al guardar en Gmail: ${err.message}. Abriendo ventana de redacción directa...`,
      });
      window.open(composeWebUrl, '_blank');
    } finally {
      setIsCreatingDraft(false);
    }
  };

  const handleCopyClipboard = () => {
    const fullText = `Para: ${recipientEmail}\nAsunto: ${generatedSubject}\n\n${generatedBody}`;
    navigator.clipboard.writeText(fullText);
    setCopiedSuccess(true);
    setTimeout(() => setCopiedSuccess(false), 2500);
  };

  const handleCopyShareUrl = () => {
    navigator.clipboard.writeText(composeWebUrl);
    setCopiedShareUrl(true);
    setTimeout(() => setCopiedShareUrl(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-4 backdrop-blur-xs overflow-y-auto">
      <div
        id="draft-generator-modal"
        className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-6 max-h-[92vh]"
      >
        {/* Modal Top Bar */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-lg ${
                draftType === 'urgent' ? 'bg-rose-100 text-rose-700' : 'bg-indigo-100 text-indigo-700'
              }`}
            >
              {draftType === 'urgent' ? <Flame className="w-5 h-5" /> : <Zap className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Generador de Borrador de Correo para Gmail
              </h3>
              <p className="text-xs text-slate-500">
                Estructura prellenada con campos listos para revisión y enlace directo editable en Gmail.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* Draft Type Toggle */}
          <div className="flex items-center gap-3 p-1.5 bg-slate-100 rounded-xl max-w-md">
            <button
              onClick={() => {
                setDraftType('urgent');
                buildFromTemplate('urgent');
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
                draftType === 'urgent'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Flame className="w-4 h-4" />
              1. Solicitud de Pago Urgente
            </button>
            <button
              onClick={() => {
                setDraftType('advance');
                buildFromTemplate('advance');
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
                draftType === 'advance'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Zap className="w-4 h-4" />
              2. Solicitud de Adelanto de Pago
            </button>
          </div>

          {/* Form Fields Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Destinatarios (Para):
              </label>
              <input
                type="text"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-md focus:ring-1 focus:ring-slate-800"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Número de Orden / PO:
              </label>
              <input
                type="text"
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                className="w-full text-xs font-mono font-bold px-2.5 py-1.5 bg-white border border-slate-300 rounded-md focus:ring-1 focus:ring-slate-800"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Proveedor / Beneficiario:
              </label>
              <input
                type="text"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                className="w-full text-xs font-semibold px-2.5 py-1.5 bg-white border border-slate-300 rounded-md focus:ring-1 focus:ring-slate-800"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Monto del Pago:
              </label>
              <div className="flex gap-1.5">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-2/3 text-xs font-bold px-2.5 py-1.5 bg-white border border-slate-300 rounded-md focus:ring-1 focus:ring-slate-800"
                />
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-1/3 text-xs px-2 py-1.5 bg-white border border-slate-300 rounded-md"
                >
                  <option value="MXN">MXN</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Fecha Específica de Pago:
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-md focus:ring-1 focus:ring-slate-800"
              />
            </div>

            {draftType === 'urgent' ? (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Factura / Folio Fiscal:
                </label>
                <input
                  type="text"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="F-98231 o Pendiente"
                  className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-md focus:ring-1 focus:ring-slate-800"
                />
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  % Anticipo Solicitado:
                </label>
                <input
                  type="text"
                  value={advancePercentage}
                  onChange={(e) => setAdvancePercentage(e.target.value)}
                  placeholder="50% o 30%"
                  className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-md focus:ring-1 focus:ring-slate-800"
                />
              </div>
            )}

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Datos Bancarios / Cuenta CLABE:
              </label>
              <input
                type="text"
                value={bankDetails}
                onChange={(e) => setBankDetails(e.target.value)}
                placeholder="Banco, Cuenta, CLABE Interbancaria"
                className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-md focus:ring-1 focus:ring-slate-800"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Justificación del Pago:
              </label>
              <input
                type="text"
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-md focus:ring-1 focus:ring-slate-800"
              />
            </div>
          </div>

          {/* Assistant Actions Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-700">
                Estructura del Borrador Editable:
              </span>
              <button
                type="button"
                onClick={handlePolishWithGemini}
                disabled={isAiGenerating}
                className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg border border-purple-200 transition-colors disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                {isAiGenerating ? 'Redactando con IA...' : 'Optimizar Redacción con IA'}
              </button>
            </div>

            <button
              type="button"
              onClick={() => buildFromTemplate(draftType)}
              className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              Restablecer plantilla predeterminada
            </button>
          </div>

          {/* Subject preview */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Asunto del Correo:
            </label>
            <input
              type="text"
              value={generatedSubject}
              onChange={(e) => setGeneratedSubject(e.target.value)}
              className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-1 focus:ring-slate-800"
            />
          </div>

          {/* Body editor */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Cuerpo del Borrador (con campos estructurados):
            </label>
            <textarea
              rows={11}
              value={generatedBody}
              onChange={(e) => setGeneratedBody(e.target.value)}
              className="w-full text-xs font-mono p-3 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-1 focus:ring-slate-800 leading-relaxed"
            />
          </div>

          {/* Status Message */}
          {statusMessage && (
            <div
              className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}
        </div>

        {/* Modal Footer with Direct Links */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyClipboard}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              {copiedSuccess ? '¡Copiado!' : 'Copiar Texto'}
            </button>

            <button
              type="button"
              id="btn-copy-user-shareable-link"
              onClick={handleCopyShareUrl}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors"
              title="Copia el enlace directo a Gmail para enviárselo al usuario solicitante por Slack o Teams"
            >
              <Share2 className="w-3.5 h-3.5 text-indigo-600" />
              {copiedShareUrl ? '¡Enlace de Usuario Copiado!' : 'Copiar Enlace para Usuario'}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Direct Editable Link in Gmail (Opens standard web compose with all fields prefilled) */}
            <a
              id="link-open-gmail-compose"
              href={composeWebUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-800 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition-all shadow-xs"
              title="Abre directamente en Gmail en una nueva pestaña listo para editar y enviar"
            >
              <ExternalLink className="w-4 h-4 text-red-600" />
              Abrir Borrador Editable en Gmail
            </a>

            {/* Save directly as a Gmail Draft via API */}
            <button
              id="btn-save-gmail-api-draft"
              type="button"
              onClick={handleCreateInGmailAccount}
              disabled={isCreatingDraft}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-all shadow-sm disabled:opacity-50"
              title="Guarda este borrador directamente en la carpeta Borradores de tu cuenta de Gmail"
            >
              {isCreatingDraft ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Guardando en tu Gmail...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Crear Borrador en mi Gmail
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
