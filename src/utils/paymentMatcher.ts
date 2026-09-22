import { PaymentOrder, DuplicateAlert } from '../types';

/**
 * Normalizes an order string for loose and strict matching
 */
export function normalizeOrderNumber(orderNum: string): string {
  return orderNum.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Identifies duplicate payment orders across orders
 */
export function detectDuplicates(orders: PaymentOrder[]): {
  enrichedOrders: PaymentOrder[];
  alerts: DuplicateAlert[];
} {
  const alerts: DuplicateAlert[] = [];
  const mapByOrderNum = new Map<string, PaymentOrder>();
  const mapBySupplierAndAmount = new Map<string, PaymentOrder>();

  // Clone list
  const enriched = orders.map((o) => ({ ...o }));

  for (let i = 0; i < enriched.length; i++) {
    const current = enriched[i];
    const cleanNum = normalizeOrderNumber(current.orderNumber);

    // Rule 1: Exact or normalized Order Number match with another entry
    if (cleanNum && cleanNum.length > 2 && mapByOrderNum.has(cleanNum)) {
      const original = mapByOrderNum.get(cleanNum)!;
      current.flaggedDuplicate = true;
      current.duplicateOfId = original.id;
      current.status = 'duplicate_alert';

      alerts.push({
        originalOrder: original,
        duplicateOrder: current,
        reason: `Mismo número de orden (${current.orderNumber}) detectado en múltiples correos.`,
        confidenceScore: 0.95,
      });
    } else if (cleanNum && cleanNum.length > 2) {
      mapByOrderNum.set(cleanNum, current);
    }

    // Rule 2: Same supplier + identical amount within similar time frame
    if (current.supplierName && current.amount && current.amount > 0) {
      const suppKey = `${current.supplierName.trim().toLowerCase()}_${current.amount}_${current.currency}`;
      if (mapBySupplierAndAmount.has(suppKey) && !current.flaggedDuplicate) {
        const original = mapBySupplierAndAmount.get(suppKey)!;
        // Verify it's not the exact same email
        if (original.emailId !== current.emailId) {
          current.flaggedDuplicate = true;
          current.duplicateOfId = original.id;
          current.status = 'duplicate_alert';

          alerts.push({
            originalOrder: original,
            duplicateOrder: current,
            reason: `Coincidencia de Proveedor ("${current.supplierName}") y Monto idéntico (${current.amount} ${current.currency}). Verifique si ya fue programada.`,
            confidenceScore: 0.82,
          });
        }
      } else {
        mapBySupplierAndAmount.set(suppKey, current);
      }
    }
  }

  return { enrichedOrders: enriched, alerts };
}

/**
 * Checks if a payment order is past due or due within next N days
 */
export function getPaymentDueStatus(dueDateStr: string): {
  isOverdue: boolean;
  isDueSoon: boolean;
  daysDiff: number;
  label: string;
} {
  if (!dueDateStr) {
    return { isOverdue: false, isDueSoon: false, daysDiff: 999, label: 'Sin fecha definida' };
  }

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const due = new Date(dueDateStr + 'T00:00:00');
  if (isNaN(due.getTime())) {
    return { isOverdue: false, isDueSoon: false, daysDiff: 999, label: dueDateStr };
  }

  const diffTime = due.getTime() - now.getTime();
  const daysDiff = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (daysDiff < 0) {
    return {
      isOverdue: true,
      isDueSoon: false,
      daysDiff,
      label: `Vencido hace ${Math.abs(daysDiff)} día(s)`,
    };
  } else if (daysDiff === 0) {
    return {
      isOverdue: false,
      isDueSoon: true,
      daysDiff,
      label: 'Vence HOY',
    };
  } else if (daysDiff <= 3) {
    return {
      isOverdue: false,
      isDueSoon: true,
      daysDiff,
      label: `Vence en ${daysDiff} día(s)`,
    };
  } else {
    return {
      isOverdue: false,
      isDueSoon: false,
      daysDiff,
      label: `En ${daysDiff} días (${dueDateStr})`,
    };
  }
}
