import React from 'react';
import { PaymentOrder } from '../types';
import { getPaymentDueStatus } from '../utils/paymentMatcher';
import {
  Calendar,
  DollarSign,
  AlertCircle,
  FileText,
  Clock,
  CheckCircle2,
  ExternalLink,
  Flame,
  Zap,
  Tag,
  Mail,
  MoreVertical,
  Sparkles,
  ShieldCheck,
  Layers,
  Building2,
} from 'lucide-react';

interface OrderListProps {
  orders: PaymentOrder[];
  onToggleProgrammed: (orderId: string) => void;
  onTogglePaid?: (orderId: string) => void;
  onDeleteOrder: (orderId: string) => void;
}

export const getGmailUrl = (order: PaymentOrder): string => {
  // If we have a real Gmail message ID
  if (
    order.emailId &&
    !order.emailId.startsWith('demo') &&
    !order.emailId.startsWith('mock') &&
    !order.emailId.startsWith('sample')
  ) {
    const targetId = order.emailThreadId || order.emailId;
    return `https://mail.google.com/mail/u/0/#all/${targetId}`;
  }
  // If it's a search fallback
  if (order.emailSubject) {
    const cleanSubj = order.emailSubject.replace(/["']/g, '');
    return `https://mail.google.com/mail/u/0/#search/${encodeURIComponent('"' + cleanSubj + '"')}`;
  }
  if (order.orderNumber) {
    return `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(order.orderNumber)}`;
  }
  return 'https://mail.google.com/mail/u/0/#inbox';
};

export const OrderList: React.FC<OrderListProps> = ({
  orders,
  onToggleProgrammed,
  onTogglePaid,
  onDeleteOrder,
}) => {
  const [filterType, setFilterType] = React.useState<
    'all' | 'templates' | 'urgent_tpl' | 'advance_tpl' | 'secondary' | 'urgent' | 'advance' | 'scheduled' | 'paid' | 'duplicates'
  >('all');
  const [searchFilter, setSearchFilter] = React.useState('');

  const handleCardClick = (e: React.MouseEvent, order: PaymentOrder) => {
    // Avoid redirect if clicking directly on a button, link, or input inside the card
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('a') || target.closest('input')) {
      return;
    }
    const url = getGmailUrl(order);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const filteredOrders = orders.filter((order) => {
    if (filterType === 'templates' && order.detectionSource !== 'template_match') return false;
    if (filterType === 'urgent_tpl' && !(order.matchedTemplateName?.includes('URGENTE') || (order.detectionSource === 'template_match' && order.urgencyLevel === 'urgent'))) return false;
    if (filterType === 'advance_tpl' && !(order.matchedTemplateName?.includes('ADELANTO') || (order.detectionSource === 'template_match' && order.urgencyLevel === 'advance'))) return false;
    if (filterType === 'secondary' && order.detectionSource !== 'secondary_filter') return false;
    if (filterType === 'urgent' && order.urgencyLevel !== 'urgent') return false;
    if (filterType === 'advance' && order.urgencyLevel !== 'advance') return false;
    if (filterType === 'scheduled' && !order.isProgrammed) return false;
    if (filterType === 'paid' && !order.isCompletedPayment && order.status !== 'paid') return false;
    if (filterType === 'duplicates' && !order.flaggedDuplicate) return false;

    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase();
      const matchNum = order.orderNumber.toLowerCase().includes(q);
      const matchSup = order.supplierName.toLowerCase().includes(q);
      const matchSumm = order.summary.toLowerCase().includes(q);
      const matchArea = order.area?.toLowerCase().includes(q);
      const matchInv = order.invoiceNumber?.toLowerCase().includes(q);
      const matchSource = order.matchedTemplateName?.toLowerCase().includes(q);
      return matchNum || matchSup || matchSumm || !!matchArea || matchInv || !!matchSource;
    }
    return true;
  });

  return (
    <div id="orders-list-section" className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
      {/* Header controls */}
      <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              filterType === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            Radar Activo ({orders.filter(o => !o.isCompletedPayment && o.status !== 'paid').length})
          </button>
          <button
            onClick={() => setFilterType('templates')}
            className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              filterType === 'templates'
                ? 'bg-emerald-700 text-white'
                : 'bg-white text-emerald-800 hover:bg-emerald-50 border border-emerald-200'
            }`}
            title="Órdenes que cumplen con la estructura de las plantillas creadas (con tolerancia a errores de digitación)"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Cumplen Plantillas ({orders.filter((o) => o.detectionSource === 'template_match').length})
          </button>
          <button
            onClick={() => setFilterType('urgent_tpl')}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              filterType === 'urgent_tpl'
                ? 'bg-rose-700 text-white'
                : 'bg-white text-rose-800 hover:bg-rose-50 border border-rose-200'
            }`}
            title="Filtro exacto de correos con plantilla [PAGO URGENTE]"
          >
            <Flame className="w-3.5 h-3.5 text-rose-500" />
            [PAGO URGENTE] ({orders.filter((o) => o.matchedTemplateName?.includes('URGENTE') || (o.detectionSource === 'template_match' && o.urgencyLevel === 'urgent')).length})
          </button>
          <button
            onClick={() => setFilterType('advance_tpl')}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              filterType === 'advance_tpl'
                ? 'bg-indigo-700 text-white'
                : 'bg-white text-indigo-800 hover:bg-indigo-50 border border-indigo-200'
            }`}
            title="Filtro exacto de correos con plantilla [ADELANTO DE PAGO]"
          >
            <Zap className="w-3.5 h-3.5 text-indigo-500" />
            [ADELANTO DE PAGO] ({orders.filter((o) => o.matchedTemplateName?.includes('ADELANTO') || (o.detectionSource === 'template_match' && o.urgencyLevel === 'advance')).length})
          </button>
          <button
            onClick={() => setFilterType('secondary')}
            className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              filterType === 'secondary'
                ? 'bg-indigo-700 text-white'
                : 'bg-white text-indigo-800 hover:bg-indigo-50 border border-indigo-200'
            }`}
            title="Órdenes detectadas por el 2º filtro ampliado (fechas específicas o dispersiones/SPEI)"
          >
            <Sparkles className="w-3.5 h-3.5" />
            2º Filtro: Dispersión/Fecha ({orders.filter((o) => o.detectionSource === 'secondary_filter').length})
          </button>
          <button
            onClick={() => setFilterType('urgent')}
            className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              filterType === 'urgent'
                ? 'bg-rose-600 text-white'
                : 'bg-white text-rose-700 hover:bg-rose-50 border border-rose-200'
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            Urgentes ({orders.filter((o) => o.urgencyLevel === 'urgent' && !o.isCompletedPayment).length})
          </button>
          <button
            onClick={() => setFilterType('advance')}
            className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              filterType === 'advance'
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-indigo-700 hover:bg-indigo-50 border border-indigo-200'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            Adelantos ({orders.filter((o) => o.urgencyLevel === 'advance' && !o.isCompletedPayment).length})
          </button>
          <button
            onClick={() => setFilterType('scheduled')}
            className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              filterType === 'scheduled'
                ? 'bg-emerald-600 text-white'
                : 'bg-white text-emerald-700 hover:bg-emerald-50 border border-emerald-200'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Programadas ({orders.filter((o) => o.isProgrammed && !o.isCompletedPayment).length})
          </button>
          <button
            onClick={() => setFilterType('paid')}
            className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              filterType === 'paid'
                ? 'bg-teal-700 text-white'
                : 'bg-white text-teal-800 hover:bg-teal-50 border border-teal-200'
            }`}
            title="Historial de pagos efectuados almacenados para evitar duplicidad en futuras revisiones"
          >
            <Clock className="w-3.5 h-3.5" />
            Pagos Efectuados ({orders.filter((o) => o.isCompletedPayment || o.status === 'paid').length})
          </button>
          {orders.some((o) => o.flaggedDuplicate) && (
            <button
              onClick={() => setFilterType('duplicates')}
              className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                filterType === 'duplicates'
                  ? 'bg-amber-600 text-white'
                  : 'bg-white text-amber-700 hover:bg-amber-50 border border-amber-300'
              }`}
            >
              <AlertCircle className="w-3.5 h-3.5" />
              Duplicados ({orders.filter((o) => o.flaggedDuplicate).length})
            </button>
          )}
        </div>

        <div className="w-full sm:w-64">
          <input
            type="text"
            placeholder="Filtrar por PO, proveedor, factura..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full text-xs px-3 py-1.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
          />
        </div>
      </div>

      {/* Orders Grid / Table */}
      {filteredOrders.length === 0 ? (
        <div className="p-12 text-center">
          <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-700">No se encontraron órdenes con estos filtros.</p>
          <p className="text-xs text-slate-400 mt-1">
            Usa el botón "Escanear Bandeja" o "Cargar Datos de Muestra" para comenzar a poblar la lista.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {filteredOrders.map((order) => {
            const dueStatus = getPaymentDueStatus(order.paymentDueDate);

            return (
              <div
                key={order.id}
                onClick={(e) => handleCardClick(e, order)}
                title="Haz clic para abrir el correo original en Gmail"
                className={`p-4 transition-all cursor-pointer rounded-lg hover:bg-slate-50 hover:shadow-xs group border border-transparent hover:border-slate-200 ${
                  order.flaggedDuplicate ? 'bg-amber-50/30' : ''
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                  {/* Left info */}
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-900 text-white font-mono">
                        {order.orderNumber}
                      </span>
                      <h4 className="text-sm font-semibold text-slate-900">
                        {order.supplierName}
                      </h4>

                      {/* Status Badges */}
                      {order.isCompletedPayment || order.status === 'paid' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded bg-teal-100 text-teal-800 border border-teal-200">
                          <CheckCircle2 className="w-3 h-3 text-teal-600" />
                          Pagado / En Historial
                        </span>
                      ) : null}

                      {order.urgencyLevel === 'urgent' && !order.isCompletedPayment && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200">
                          <Flame className="w-3 h-3 text-rose-600" />
                          Urgente
                        </span>
                      )}
                      {order.urgencyLevel === 'advance' && !order.isCompletedPayment && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 border border-indigo-200">
                          <Zap className="w-3 h-3 text-indigo-600" />
                          Adelanto / Anticipo
                        </span>
                      )}
                      {order.isProgrammed && !order.isCompletedPayment ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          Pago Ya Programado
                        </span>
                      ) : !order.isCompletedPayment && order.status !== 'paid' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                          <Clock className="w-3 h-3 text-slate-400" />
                          Pendiente de Programar
                        </span>
                      ) : null}
                      {order.flaggedDuplicate && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                          <AlertCircle className="w-3 h-3 text-amber-700" />
                          Riesgo Duplicidad
                        </span>
                      )}

                      {/* 2-Level Detection Source Badge */}
                      {order.subjectMatch && (
                        <span
                          className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200"
                          title="Asunto oficial identificado: cumple con el patrón [PAGO URGENTE] o [ADELANTO DE PAGO]"
                        >
                          <CheckCircle2 className="w-3 h-3 text-blue-600" />
                          <span>Asunto Oficial Verificado</span>
                        </span>
                      )}

                      {order.detectionSource === 'template_match' ? (
                        <span
                          className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200"
                          title={`Validado contra ${order.matchedTemplateName || 'plantilla creada'} (${order.templateMatchScore || 85}% coincidencia)`}
                        >
                          <ShieldCheck className="w-3 h-3 text-emerald-600" />
                          <span>{order.matchedTemplateName || 'Cumple Plantilla'}</span>
                          {order.templateMatchScore && (
                            <span className="text-[10px] text-emerald-700 bg-emerald-100 px-1 py-0.2 rounded font-mono">
                              {order.templateMatchScore}%
                            </span>
                          )}
                        </span>
                      ) : order.detectionSource === 'secondary_filter' ? (
                        <span
                          className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded bg-purple-50 text-purple-800 border border-purple-200"
                          title="Detectado por el 2º filtro ampliado (fechas específicas o dispersiones bancarias)"
                        >
                          <Sparkles className="w-3 h-3 text-purple-600" />
                          <span>2º Filtro Ampliado</span>
                          {order.secondaryFilterTags && order.secondaryFilterTags.length > 0 && (
                            <span className="text-[10px] text-purple-700 bg-purple-100 px-1 py-0.2 rounded">
                              {order.secondaryFilterTags[0]}
                            </span>
                          )}
                        </span>
                      ) : null}
                    </div>

                    <p className="text-xs text-slate-600">{order.summary}</p>

                    {order.matchedFields && order.matchedFields.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1 text-[10px] text-slate-500 pt-0.5">
                        <span className="text-slate-400 font-medium">Campos validados:</span>
                        {order.matchedFields.map((f, i) => (
                          <span
                            key={i}
                            className="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded font-mono border border-slate-200"
                          >
                            ✓ {f}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 pt-0.5">
                      <span className="inline-flex items-center gap-1 font-semibold text-slate-900">
                        <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                        {order.amount
                          ? `${order.amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} ${order.currency}`
                          : 'Monto a determinar'}
                      </span>

                      {order.area && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-900 rounded text-[11px] font-medium border border-blue-200">
                          <Building2 className="w-3.5 h-3.5 text-blue-600" />
                          Área: <strong className="text-blue-950">{order.area}</strong>
                        </span>
                      )}

                      <span
                        className={`inline-flex items-center gap-1 font-medium ${
                          dueStatus.isOverdue
                            ? 'text-rose-600 font-semibold'
                            : dueStatus.isDueSoon
                            ? 'text-amber-700 font-semibold'
                            : 'text-slate-600'
                        }`}
                      >
                        <Calendar className="w-3.5 h-3.5" />
                        Fecha Estimada: {dueStatus.label}
                      </span>

                      {order.rawPaymentDateText && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded text-[11px]">
                          Cita en correo: <strong className="font-medium">"{order.rawPaymentDateText}"</strong>
                        </span>
                      )}

                      {order.paymentTerm && (
                        <span className="text-slate-500">
                          Condición: <strong>{order.paymentTerm}</strong>
                        </span>
                      )}

                      {order.invoiceNumber && (
                        <span className="text-slate-500">
                          Factura: <code className="text-slate-700">{order.invoiceNumber}</code>
                        </span>
                      )}
                    </div>

                    {order.riskNotes && (
                      <div className="text-[11px] text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-100 inline-block">
                        ⚠️ {order.riskNotes}
                      </div>
                    )}
                  </div>

                  {/* Actions right */}
                  <div className="flex flex-wrap items-center gap-2 pt-2 lg:pt-0 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(getGmailUrl(order), '_blank', 'noopener,noreferrer');
                      }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors border bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 hover:text-indigo-900 cursor-pointer shadow-2xs"
                      title="Abrir este correo directamente en Gmail"
                    >
                      <Mail className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Ver en Gmail</span>
                      <ExternalLink className="w-3 h-3 text-indigo-500" />
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleProgrammed(order.id);
                      }}
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors border cursor-pointer ${
                        order.isProgrammed
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                      title="Marcar si este pago ya fue registrado en tesorería o banca para alertar y evitar duplicados"
                    >
                      <CheckCircle2
                        className={`w-3.5 h-3.5 ${order.isProgrammed ? 'text-emerald-600' : 'text-slate-400'}`}
                      />
                      {order.isProgrammed ? 'Desprogramar' : 'Programado'}
                    </button>

                    {onTogglePaid && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onTogglePaid(order.id);
                        }}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors border cursor-pointer ${
                          order.isCompletedPayment || order.status === 'paid'
                            ? 'bg-teal-50 text-teal-800 border-teal-200 hover:bg-teal-100'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                        }`}
                        title="Registrar en el historial de pagos efectuados para evitar duplicidades en revisiones futuras"
                      >
                        <Clock
                          className={`w-3.5 h-3.5 ${
                            order.isCompletedPayment || order.status === 'paid' ? 'text-teal-600' : 'text-slate-400'
                          }`}
                        />
                        {order.isCompletedPayment || order.status === 'paid' ? 'En Historial' : 'Marcar Pagado'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Email origin footer */}
                <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                  <a
                    href={getGmailUrl(order)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1.5 truncate max-w-xl text-slate-600 hover:text-indigo-600 hover:underline transition-colors cursor-pointer group/link"
                    title="Haz clic para abrir este correo en Gmail"
                  >
                    <Mail className="w-3.5 h-3.5 text-indigo-500 shrink-0 group-hover/link:scale-110 transition-transform" />
                    <span className="font-medium text-slate-700 group-hover/link:text-indigo-700">
                      Origen en Gmail: "{order.emailSubject}"
                    </span>
                    <ExternalLink className="w-3 h-3 opacity-60 group-hover/link:opacity-100 shrink-0 text-indigo-600" />
                    <span className="text-slate-300">•</span>
                    <span>De: {order.emailSender}</span>
                  </a>
                  <span className="shrink-0">{order.emailDate}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
