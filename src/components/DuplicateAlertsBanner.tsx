import React from 'react';
import { DuplicateAlert, PaymentOrder } from '../types';
import { AlertOctagon, CheckCircle, Clock, AlertTriangle, ArrowRight, Ban, ExternalLink, Mail } from 'lucide-react';
import { getGmailUrl } from './OrderList';

interface DuplicateAlertsBannerProps {
  alerts: DuplicateAlert[];
  onDismissAlert: (alertIndex: number) => void;
  onMarkAsDuplicate: (orderId: string) => void;
  onConfirmDifferent: (orderId: string) => void;
}

export const DuplicateAlertsBanner: React.FC<DuplicateAlertsBannerProps> = ({
  alerts,
  onDismissAlert,
  onMarkAsDuplicate,
  onConfirmDifferent,
}) => {
  if (!alerts || alerts.length === 0) {
    return null;
  }

  return (
    <div id="duplicate-alerts-container" className="space-y-3 my-4">
      {alerts.map((alert, idx) => (
        <div
          key={idx}
          className="bg-amber-50 border border-amber-300 rounded-xl p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4"
        >
          <div className="flex items-start gap-3">
            <div className="p-2 bg-amber-100 text-amber-800 rounded-lg shrink-0 mt-0.5">
              <AlertOctagon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-900 px-2 py-0.5 bg-amber-200 rounded">
                  Alerta de Duplicidad Preventiva
                </span>
                <span className="text-xs text-amber-700 font-medium">
                  {Math.round(alert.confidenceScore * 100)}% coincidencia
                </span>
              </div>
              <p className="text-sm font-semibold text-slate-900 mt-1">
                {alert.reason}
              </p>
              <div className="text-xs text-slate-600 mt-1 flex flex-wrap items-center gap-3">
                <a
                  href={getGmailUrl(alert.originalOrder)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono bg-white px-2 py-0.5 rounded border border-amber-200 hover:border-amber-400 hover:text-amber-900 inline-flex items-center gap-1 cursor-pointer"
                  title="Ver correo de la orden previa en Gmail"
                >
                  <Mail className="w-3 h-3 text-amber-600" />
                  <span>Orden previa: <strong>{alert.originalOrder.orderNumber}</strong> ({alert.originalOrder.supplierName} -{' '}
                  {alert.originalOrder.amount ? `$${alert.originalOrder.amount.toLocaleString()} ${alert.originalOrder.currency}` : 'Monto N/A'})</span>
                  <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                </a>
                <ArrowRight className="w-3.5 h-3.5 text-amber-500" />
                <a
                  href={getGmailUrl(alert.duplicateOrder)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono bg-white px-2 py-0.5 rounded border border-amber-200 text-amber-900 font-bold hover:border-amber-400 hover:bg-amber-100/50 inline-flex items-center gap-1 cursor-pointer"
                  title="Ver correo de la orden detectada en Gmail"
                >
                  <Mail className="w-3 h-3 text-amber-600" />
                  <span>Orden detectada: <strong>{alert.duplicateOrder.orderNumber}</strong> ({alert.duplicateOrder.supplierName})</span>
                  <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                </a>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
            <button
              onClick={() => onMarkAsDuplicate(alert.duplicateOrder.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors shadow-xs"
              title="Marcar para no procesar ni programar dos veces"
            >
              <Ban className="w-3.5 h-3.5" />
              Bloquear como Duplicado
            </button>
            <button
              onClick={() => onConfirmDifferent(alert.duplicateOrder.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors"
              title="Confirmar que es una orden distinta o una factura diferente"
            >
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
              Confirmar Válida (Diferente)
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
