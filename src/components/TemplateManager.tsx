import React, { useState } from 'react';
import { DraftTemplateConfig } from '../types';
import {
  Edit3,
  Check,
  RotateCcw,
  Flame,
  Zap,
  Info,
  Link2,
  Copy,
  ExternalLink,
  Share2,
  MessageSquare,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { DEFAULT_TEMPLATES, generateUserBlankDraftUrl } from '../utils/draftTemplates';

interface TemplateManagerProps {
  templates: DraftTemplateConfig[];
  onSaveTemplate: (updated: DraftTemplateConfig) => void;
  onResetDefaults: () => void;
}

export const TemplateManager: React.FC<TemplateManagerProps> = ({
  templates,
  onSaveTemplate,
  onResetDefaults,
}) => {
  const [selectedType, setSelectedType] = useState<'urgent' | 'advance'>('urgent');
  const activeTemplate = templates.find((t) => t.type === selectedType) || DEFAULT_TEMPLATES[0];

  // Global recipient email for payment requests
  const [financeEmail, setFinanceEmail] = useState(() => {
    return localStorage.getItem('ap_finance_email') || 'finanzas@empresa.com, pagos@empresa.com';
  });

  const [subject, setSubject] = useState(activeTemplate.subjectTemplate);
  const [body, setBody] = useState(activeTemplate.bodyTemplate);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Copy state feedbacks
  const [copiedLinkType, setCopiedLinkType] = useState<string | null>(null);
  const [copiedSlackType, setCopiedSlackType] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Sync state when type changes
  const handleSelectType = (type: 'urgent' | 'advance') => {
    setSelectedType(type);
    const tpl = templates.find((t) => t.type === type) || DEFAULT_TEMPLATES.find((t) => t.type === type)!;
    setSubject(tpl.subjectTemplate);
    setBody(tpl.bodyTemplate);
  };

  const handleSave = () => {
    onSaveTemplate({
      ...activeTemplate,
      subjectTemplate: subject,
      bodyTemplate: body,
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const handleFinanceEmailChange = (newVal: string) => {
    setFinanceEmail(newVal);
    localStorage.setItem('ap_finance_email', newVal);
  };

  // Generate blank user draft URLs for both types
  const urgentTemplate = templates.find((t) => t.type === 'urgent') || DEFAULT_TEMPLATES[0];
  const advanceTemplate = templates.find((t) => t.type === 'advance') || DEFAULT_TEMPLATES[1];

  const urgentDraftInfo = generateUserBlankDraftUrl(urgentTemplate, financeEmail);
  const advanceDraftInfo = generateUserBlankDraftUrl(advanceTemplate, financeEmail);

  // Copy functions
  const copyToClipboard = (text: string, typeKey: string, isSlack: boolean = false) => {
    navigator.clipboard.writeText(text);
    if (isSlack) {
      setCopiedSlackType(typeKey);
      setTimeout(() => setCopiedSlackType(null), 2500);
    } else {
      setCopiedLinkType(typeKey);
      setTimeout(() => setCopiedLinkType(null), 2500);
    }
  };

  // Pre-formatted messages for Slack / Teams
  const getSlackShareMessage = (type: 'urgent' | 'advance') => {
    if (type === 'urgent') {
      return `🚨 *Solicitud de Pago Urgente a Proveedores*\nEquipo, si requieren solicitar la autorización y pago urgente de una orden de compra o factura con vencimiento crítico, hagan clic en el siguiente enlace:\n👉 ${urgentDraftInfo.url}\n\nSe abrirá directamente en su Gmail con la plantilla estructurada. Solo completen los campos marcados entre corchetes: número de orden (PO), proveedor, monto, fecha de pago y justificación.`;
    } else {
      return `💼 *Solicitud de Adelanto / Anticipo de Pago*\nEquipo, para tramitar un anticipo pactado de una orden de compra previa a producción o despacho, hagan clic en el siguiente enlace:\n👉 ${advanceDraftInfo.url}\n\nSe abrirá directamente en su Gmail con el formato prellenado listo para que completen el número de orden, porcentaje de anticipo, monto y cuenta CLABE.`;
    }
  };

  return (
    <div id="template-manager-section" className="space-y-6">
      {/* 1. SHAREABLE USER LINKS HERO CARD */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white rounded-2xl p-6 shadow-xl border border-slate-700">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-700/80">
          <div className="flex items-start gap-3">
            <div className="p-3 bg-red-600/30 text-red-400 border border-red-500/40 rounded-xl shrink-0 mt-0.5">
              <Share2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-tight">
                  Enlaces Directos para Compartir con Usuarios y Solicitantes
                </h2>
                <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 bg-red-500/20 text-red-300 border border-red-500/30 rounded-full">
                  Acceso Público para Gmail
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 max-w-3xl leading-relaxed">
                Los usuarios solicitantes no necesitan ingresar a esta plataforma. Comparte estos enlaces por Slack, Teams, correo o intranet corporativa. Al hacer clic, <strong>se abrirá instantáneamente en su cuenta de Gmail</strong> con el borrador editable y los campos predefinidos listos para completar.
              </p>
            </div>
          </div>

          {/* Target Recipient Config */}
          <div className="bg-slate-800/90 border border-slate-600/70 p-3 rounded-xl min-w-[280px] shrink-0">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
              Buzón Destino de Finanzas / Pagos:
            </label>
            <input
              type="text"
              value={financeEmail}
              onChange={(e) => handleFinanceEmailChange(e.target.value)}
              placeholder="finanzas@empresa.com, pagos@empresa.com"
              className="w-full text-xs font-mono px-2.5 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-1 focus:ring-red-400"
            />
            <span className="text-[10px] text-slate-400 block mt-1">
              Se prellenará automáticamente en el campo "Para:" del usuario.
            </span>
          </div>
        </div>

        {/* Both Cards Grid: Urgent vs Advance */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-6">
          {/* Card 1: Urgent Payment */}
          <div className="bg-slate-800/70 border border-rose-500/40 rounded-xl p-5 flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/10 rounded-full blur-2xl pointer-events-none" />
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-rose-500/20 text-rose-400 rounded-lg border border-rose-500/30">
                    <Flame className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-bold text-white">
                    1. Enlace para Solicitud de Pago Urgente
                  </h3>
                </div>
                <span className="text-[11px] px-2 py-0.5 rounded bg-rose-900/60 text-rose-300 font-semibold border border-rose-700/50">
                  Prioridad Alta
                </span>
              </div>

              <p className="text-xs text-slate-300 mb-3">
                Abre en el Gmail del usuario la estructura con campos para: <strong>número de orden, monto, fecha límite, folio de factura, cuenta CLABE y justificación de urgencia</strong>.
              </p>

              {/* Link Input View */}
              <div className="bg-slate-950/80 border border-slate-700 rounded-lg p-2.5 mb-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 truncate font-mono">
                    <Link2 className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    <span className="truncate">{urgentDraftInfo.url}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="space-y-2 pt-2 border-t border-slate-700/60">
              <div className="grid grid-cols-2 gap-2">
                <button
                  id="btn-copy-urgent-link"
                  onClick={() => copyToClipboard(urgentDraftInfo.url, 'urgent-link')}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-lg transition-all shadow-xs"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copiedLinkType === 'urgent-link' ? '¡Enlace Copiado!' : 'Copiar Enlace Directo'}
                </button>

                <a
                  href={urgentDraftInfo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-200 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors border border-slate-600"
                  title="Prueba cómo se abre en tu propio Gmail"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-rose-400" />
                  Probar en Gmail
                </a>
              </div>

              <button
                id="btn-copy-urgent-slack"
                onClick={() => copyToClipboard(getSlackShareMessage('urgent'), 'urgent-slack', true)}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700/80 rounded-lg transition-colors border border-slate-700"
              >
                <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                {copiedSlackType === 'urgent-slack'
                  ? '¡Mensaje para Slack/Teams copiado!'
                  : 'Copiar Mensaje Formateado para Slack / Teams'}
              </button>
            </div>
          </div>

          {/* Card 2: Advance Payment */}
          <div className="bg-slate-800/70 border border-indigo-500/40 rounded-xl p-5 flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-indigo-500/20 text-indigo-400 rounded-lg border border-indigo-500/30">
                    <Zap className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-bold text-white">
                    2. Enlace para Solicitud de Adelanto de Pago
                  </h3>
                </div>
                <span className="text-[11px] px-2 py-0.5 rounded bg-indigo-900/60 text-indigo-300 font-semibold border border-indigo-700/50">
                  Anticipo
                </span>
              </div>

              <p className="text-xs text-slate-300 mb-3">
                Abre en el Gmail del usuario la estructura con campos para: <strong>número de orden, porcentaje de anticipo, monto a dispersar, fecha requerida y términos comerciales</strong>.
              </p>

              {/* Link Input View */}
              <div className="bg-slate-950/80 border border-slate-700 rounded-lg p-2.5 mb-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 truncate font-mono">
                    <Link2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span className="truncate">{advanceDraftInfo.url}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="space-y-2 pt-2 border-t border-slate-700/60">
              <div className="grid grid-cols-2 gap-2">
                <button
                  id="btn-copy-advance-link"
                  onClick={() => copyToClipboard(advanceDraftInfo.url, 'advance-link')}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-all shadow-xs"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copiedLinkType === 'advance-link' ? '¡Enlace Copiado!' : 'Copiar Enlace Directo'}
                </button>

                <a
                  href={advanceDraftInfo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-200 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors border border-slate-600"
                  title="Prueba cómo se abre en tu propio Gmail"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-indigo-400" />
                  Probar en Gmail
                </a>
              </div>

              <button
                id="btn-copy-advance-slack"
                onClick={() => copyToClipboard(getSlackShareMessage('advance'), 'advance-slack', true)}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700/80 rounded-lg transition-colors border border-slate-700"
              >
                <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                {copiedSlackType === 'advance-slack'
                  ? '¡Mensaje para Slack/Teams copiado!'
                  : 'Copiar Mensaje Formateado para Slack / Teams'}
              </button>
            </div>
          </div>
        </div>

        {/* How it works note */}
        <div className="mt-4 pt-4 border-t border-slate-700/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              100% nativo de Google: Los usuarios no requieren credenciales ni acceso a este sistema. Solo dan clic y Gmail carga el borrador listo.
            </span>
          </div>
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="text-xs text-slate-300 hover:text-white underline flex items-center gap-1"
          >
            {showPreview ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {showPreview ? 'Ocultar vista previa del borrador' : 'Ver qué verá el usuario en su Gmail'}
          </button>
        </div>

        {/* Optional preview accordion */}
        {showPreview && (
          <div className="mt-4 p-4 bg-slate-950/90 border border-slate-700 rounded-xl space-y-3 font-mono text-xs text-slate-300">
            <div className="border-b border-slate-800 pb-2">
              <span className="text-slate-500">Destinatario (Para):</span> <span className="text-emerald-400">{financeEmail}</span>
            </div>
            <div className="border-b border-slate-800 pb-2">
              <span className="text-slate-500">Asunto ejemplo:</span> <span className="text-white font-semibold">{urgentDraftInfo.subject}</span>
            </div>
            <div>
              <span className="text-slate-500 block mb-1">Cuerpo del correo prellenado:</span>
              <pre className="whitespace-pre-wrap font-sans text-xs bg-slate-900 p-3 rounded-lg border border-slate-800 text-slate-200 leading-relaxed">
                {urgentDraftInfo.body}
              </pre>
            </div>
          </div>
        )}
      </div>

      {/* 2. TEMPLATE STRUCTURE EDITOR */}
      <div id="template-manager-card" className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <Edit3 className="w-5 h-5 text-indigo-600" />
              <h3 className="text-sm font-semibold text-slate-900">
                Personalizar Estructura y Redacción de las Plantillas
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Cualquier cambio que realices aquí actualizará de inmediato el texto y los campos que verán los usuarios al abrir sus enlaces de Gmail.
            </p>
          </div>

          <button
            onClick={onResetDefaults}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200 self-start sm:self-auto"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restablecer Plantillas Predeterminadas
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-3 mb-4">
          <button
            onClick={() => handleSelectType('urgent')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              selectedType === 'urgent'
                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Flame className="w-3.5 h-3.5 text-rose-600" />
            1. Plantilla: Pagos Urgentes
          </button>

          <button
            onClick={() => handleSelectType('advance')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              selectedType === 'advance'
                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-indigo-600" />
            2. Plantilla: Adelantos de Pago
          </button>
        </div>

        {/* Helper tags */}
        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 mb-4 text-xs">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-1.5 font-medium text-slate-700">
              <Info className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span>Variables dinámicas disponibles (haz clic para insertar en el cuerpo):</span>
            </div>
            <span className="text-[10px] text-slate-400 hidden sm:inline">
              Cualquier etiqueta <code className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200">{`{CAMPO}`}</code> se convertirá en <code className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200">[ESCRIBE_AQUÍ_CAMPO]</code>
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              '{ORDER_NUMBER}',
              '{SUPPLIER_NAME}',
              '{AMOUNT}',
              '{CURRENCY}',
              '{DUE_DATE}',
              '{INVOICE_NUMBER}',
              '{BANK_DETAILS}',
              '{AREA}',
              '{JUSTIFICATION}',
              '{ADVANCE_PERCENTAGE}',
              '{PAYMENT_TERMS}',
              '{ADDITIONAL_NOTES}',
            ].map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => {
                  setBody((prev) => `${prev} ${tag}`);
                }}
                className="text-[11px] bg-white hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300 border border-slate-300 text-slate-800 px-2 py-0.5 rounded font-mono transition-colors cursor-pointer"
                title={`Haz clic para insertar ${tag} en el cuerpo`}
              >
                {tag}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-500 mt-2 border-t border-slate-200/80 pt-1.5">
            💡 <strong>Tip:</strong> Si quieres que aparezca como instrucción para el usuario, puedes usar la variable <code className="bg-white px-1 rounded border font-mono">{`{AREA}`}</code> (que se convierte en <code className="bg-white px-1 rounded border font-mono">[ESCRIBE_AQUÍ_ÁREA_O_DEPARTAMENTO]</code>) o escribir directamente en el texto: <code className="bg-white px-1 rounded border font-mono">[ESCRIBE_AQUÍ_ÁREA]</code>.
          </p>
        </div>

        {/* Inputs */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Plantilla de Asunto:
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-1 focus:ring-slate-900"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Plantilla del Cuerpo del Correo:
            </label>
            <textarea
              rows={8}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full text-xs font-mono p-3 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-1 focus:ring-slate-900 leading-relaxed"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            {savedSuccess && (
              <span className="text-xs font-medium text-emerald-600 flex items-center gap-1">
                <Check className="w-4 h-4" />
                ¡Plantilla guardada y aplicada con éxito a los enlaces compartibles!
              </span>
            )}
            <button
              onClick={handleSave}
              className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-xs"
            >
              Guardar y Actualizar Enlaces Compartibles
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
