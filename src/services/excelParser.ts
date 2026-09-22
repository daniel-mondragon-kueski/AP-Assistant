import * as XLSX from 'xlsx';
import {
  PaymentOrder,
  ExcelRowItem,
  ProposalAnomaly,
  ProposalMatch,
  CriticalMissingAlert,
  ProposalAnalysisResult,
} from '../types';

// Format numbers in MXN currency format: $1,234,567.89
export function formatCurrencyMXN(amount: number): string {
  return new Intl.NumberFormat('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

// Normalize strings for fuzzy comparison
function normalizeStr(val: any): string {
  if (!val) return '';
  return String(val)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

// Determine target date components
export function getTargetPaymentDateComponents(customDate?: Date): {
  dayOfWeek: string;
  day: string;
  month: string;
  fullLabel: string;
} {
  const date = customDate || new Date();
  const daysOfWeek = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const months = [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre',
  ];

  const dayOfWeek = daysOfWeek[date.getDay()];
  const capitalizedDayOfWeek = dayOfWeek.charAt(0).toUpperCase() + dayOfWeek.slice(1);
  const day = String(date.getDate());
  const month = months[date.getMonth()];

  return {
    dayOfWeek: capitalizedDayOfWeek,
    day,
    month,
    fullLabel: `${capitalizedDayOfWeek} ${day} de ${month}`,
  };
}

// Generate exact approval email body based on user specification
export function generateApprovalEmailBody(
  dayOfWeek: string,
  day: string,
  month: string,
  sofomTotal: number,
  incTotal: number,
  techTotal: number,
  customNotes?: string
): string {
  const formattedSofom = formatCurrencyMXN(sofomTotal);
  const formattedInc = formatCurrencyMXN(incTotal);
  const formattedTech = formatCurrencyMXN(techTotal);

  const notesSection = customNotes && customNotes.trim() ? `\n${customNotes.trim()}\n` : '';

  // EXACT STRUCTURE SPECIFIED BY USER:
  // ¡Hello Team!
  //
  // Les comparto la propuesta de pago para éste [Día de la semana] [Día] de [Mes].
  //
  // El monto a cubrir es:
  //
  // KUESKI SOFOM     $[Total MXN] MXN
  // KUESKI INC            $[Total MXN] MXN
  // KUESKI TECH        $[Total MXN] MXN
  //
  // [Si hay notas adicionales requeridas por el usuario, inclúyelas aquí. Si no, omite esta línea]
  //
  // Saludos.
  return `¡Hello Team!

Les comparto la propuesta de pago para éste ${dayOfWeek} ${day} de ${month}.

El monto a cubrir es:

KUESKI SOFOM     $${formattedSofom} MXN
KUESKI INC            $${formattedInc} MXN
KUESKI TECH        $${formattedTech} MXN
${notesSection}
Saludos.`;
}

// Parse Excel Workbook Buffer into ProposalAnalysisResult
export function analyzeProposalExcel(
  fileBuffer: ArrayBuffer,
  fileName: string,
  radarOrders: PaymentOrder[],
  customNotes: string = ''
): ProposalAnalysisResult {
  const workbook = XLSX.read(fileBuffer, { type: 'array' });
  const sheetNames = workbook.SheetNames;

  const sheetsResult: ProposalAnalysisResult['sheets'] = {};
  const allParsedRows: ExcelRowItem[] = [];
  const anomalies: ProposalAnomaly[] = [];

  let totals = {
    sofom: 0,
    inc: 0,
    tech: 0,
    overall: 0,
  };

  // Map each sheet
  sheetNames.forEach((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    // Read raw JSON rows with header
    const rawData = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });

    if (!rawData || rawData.length === 0) return;

    // Classify entity (SOFOM, INC, TECH, or others)
    const upperSheet = sheetName.toUpperCase();
    let entityCategory = 'OTHER';
    let displayName = sheetName;

    if (upperSheet.includes('SOFOM')) {
      entityCategory = 'SOFOM';
      displayName = 'KUESKI SOFOM';
    } else if (upperSheet.includes('INC')) {
      entityCategory = 'INC';
      displayName = 'KUESKI INC';
    } else if (upperSheet.includes('TECH')) {
      entityCategory = 'TECH';
      displayName = 'KUESKI TECH';
    }

    let sheetTotal = 0;
    const items: ExcelRowItem[] = [];

    rawData.forEach((row, idx) => {
      const rowNumber = idx + 2; // +2 considering 1-based index and header row

      // Intelligent column identification
      let oc = '';
      let supplier = '';
      let amount = 0;
      let currency = 'MXN';
      let hasAmount = false;
      let hasSupplier = false;
      let hasCurrency = false;

      Object.entries(row).forEach(([colHeader, cellValue]) => {
        const h = colHeader.toLowerCase().trim();
        const strVal = String(cellValue || '').trim();

        // OC / PO column matching
        if (
          !oc &&
          (h.includes('oc') ||
            h.includes('po') ||
            h.includes('orden') ||
            h.includes('folio') ||
            h.includes('purchase') ||
            h.includes('pedido'))
        ) {
          oc = strVal;
        }

        // Supplier column matching
        if (
          !supplier &&
          (h.includes('proveedor') ||
            h.includes('vendor') ||
            h.includes('beneficiario') ||
            h.includes('razon social') ||
            h.includes('supplier'))
        ) {
          supplier = strVal;
          if (strVal) hasSupplier = true;
        }

        // Amount column matching
        if (
          !hasAmount &&
          (h.includes('monto') ||
            h.includes('importe') ||
            h.includes('total') ||
            h.includes('neto') ||
            h.includes('amount') ||
            h.includes('valor'))
        ) {
          if (typeof cellValue === 'number') {
            amount = cellValue;
            hasAmount = true;
          } else if (typeof cellValue === 'string') {
            const cleaned = cellValue.replace(/[$,\s]/g, '');
            const parsed = parseFloat(cleaned);
            if (!isNaN(parsed)) {
              amount = parsed;
              hasAmount = true;
            }
          }
        }

        // Currency column matching
        if (
          !hasCurrency &&
          (h.includes('divisa') || h.includes('moneda') || h.includes('currency') || h === 'curr')
        ) {
          if (strVal) {
            currency = strVal.toUpperCase();
            hasCurrency = true;
          }
        }
      });

      // Fallback: If no headers matched explicitly, inspect columns by type/position
      if (!supplier && row['Proveedor']) supplier = String(row['Proveedor']);
      if (!oc && row['OC']) oc = String(row['OC']);

      // 1. Check for Negative Amounts
      if (amount < 0) {
        anomalies.push({
          id: `neg_${sheetName}_${rowNumber}`,
          type: 'negative_amount',
          sheet: displayName,
          rowNumber,
          description: `Monto negativo detectado: $${formatCurrencyMXN(amount)} ${currency} en ${displayName} (Fila ${rowNumber}).`,
          data: { supplier, oc, amount },
        });
      }

      // 2. Check for Missing Key Fields (Proveedor, Monto o Divisa)
      if (!supplier || !hasAmount || amount === 0 || !hasCurrency) {
        const missingFields: string[] = [];
        if (!supplier) missingFields.push('Proveedor');
        if (!hasAmount || amount === 0) missingFields.push('Monto');
        if (!hasCurrency) missingFields.push('Divisa');

        anomalies.push({
          id: `miss_${sheetName}_${rowNumber}`,
          type: 'missing_field',
          sheet: displayName,
          rowNumber,
          description: `Celdas vacías en campos clave (${missingFields.join(', ')}) en ${displayName} (Fila ${rowNumber}).`,
          data: { row, missingFields },
        });
      }

      const item: ExcelRowItem = {
        id: `row_${sheetName}_${rowNumber}`,
        sheetName: displayName,
        rowNumber,
        orderNumber: oc || `SIN-OC-F${rowNumber}`,
        supplierName: supplier || 'PROVEEDOR NO IDENTIFICADO',
        amount: isNaN(amount) ? 0 : amount,
        currency: currency || 'MXN',
        raw: row,
      };

      items.push(item);
      allParsedRows.push(item);

      if (!isNaN(amount) && amount > 0) {
        sheetTotal += amount;
      }
    });

    sheetsResult[entityCategory] = {
      displayName,
      total: sheetTotal,
      currency: 'MXN',
      items,
    };

    if (entityCategory === 'SOFOM') totals.sofom += sheetTotal;
    else if (entityCategory === 'INC') totals.inc += sheetTotal;
    else if (entityCategory === 'TECH') totals.tech += sheetTotal;
    totals.overall += sheetTotal;
  });

  // 3. Detect duplicate records within the Excel file itself
  const seenRecords = new Map<string, ExcelRowItem>();
  allParsedRows.forEach((rowItem) => {
    const keyOc = normalizeStr(rowItem.orderNumber);
    const keySupplierAmount = `${normalizeStr(rowItem.supplierName)}_${rowItem.amount}`;

    if (keyOc && keyOc !== 'sinoc' && seenRecords.has(`oc_${keyOc}`)) {
      const existing = seenRecords.get(`oc_${keyOc}`)!;
      anomalies.push({
        id: `dup_oc_${rowItem.id}`,
        type: 'duplicate_record',
        sheet: rowItem.sheetName,
        rowNumber: rowItem.rowNumber,
        description: `OC duplicada "${rowItem.orderNumber}" detectada en ${rowItem.sheetName} (Fila ${rowItem.rowNumber}) ya registrada en ${existing.sheetName} (Fila ${existing.rowNumber}).`,
        data: { current: rowItem, duplicateOf: existing },
      });
    } else if (keyOc && keyOc !== 'sinoc') {
      seenRecords.set(`oc_${keyOc}`, rowItem);
    }

    if (rowItem.amount > 0 && seenRecords.has(`sa_${keySupplierAmount}`)) {
      const existing = seenRecords.get(`sa_${keySupplierAmount}`)!;
      // Only report if OC wasn't already reported
      if (!anomalies.some((a) => a.id === `dup_oc_${rowItem.id}`)) {
        anomalies.push({
          id: `dup_sa_${rowItem.id}`,
          type: 'duplicate_record',
          sheet: rowItem.sheetName,
          rowNumber: rowItem.rowNumber,
          description: `Registro duplicado por Proveedor "${rowItem.supplierName}" y Monto exacto $${formatCurrencyMXN(rowItem.amount)} en ${rowItem.sheetName} (Fila ${rowItem.rowNumber}).`,
          data: { current: rowItem, duplicateOf: existing },
        });
      }
    } else if (rowItem.amount > 0) {
      seenRecords.set(`sa_${keySupplierAmount}`, rowItem);
    }
  });

  // 4. Cross-check against the "Radar de Pagos Pendientes"
  const matches: ProposalMatch[] = [];
  const matchedRadarIds = new Set<string>();

  radarOrders.forEach((radarItem) => {
    // Skip if it was already marked as a completed payment from prior weeks
    if (radarItem.isCompletedPayment || radarItem.status === 'paid') {
      return;
    }

    const normRadarOc = normalizeStr(radarItem.orderNumber);
    const normRadarSupplier = normalizeStr(radarItem.supplierName);

    // Try matching by exact OC
    let matchedRow = allParsedRows.find((r) => {
      const normRowOc = normalizeStr(r.orderNumber);
      return normRadarOc && normRowOc && (normRowOc === normRadarOc || normRowOc.includes(normRadarOc) || normRadarOc.includes(normRowOc));
    });

    let matchedBy: 'oc' | 'supplier' = 'oc';

    // If not by OC, try matching by supplier and similar amount
    if (!matchedRow && normRadarSupplier) {
      matchedRow = allParsedRows.find((r) => {
        const normRowSupplier = normalizeStr(r.supplierName);
        const supplierMatch = normRowSupplier.includes(normRadarSupplier) || normRadarSupplier.includes(normRowSupplier);
        if (!supplierMatch) return false;
        // If amount exists, check if close
        if (radarItem.amount && r.amount) {
          return Math.abs(radarItem.amount - r.amount) < 1.0;
        }
        return true;
      });
      if (matchedRow) matchedBy = 'supplier';
    }

    if (matchedRow) {
      matches.push({
        radarItem,
        excelRow: matchedRow,
        matchedBy,
      });
      matchedRadarIds.add(radarItem.id);
    }
  });

  // 5. Critical Missing Alerts (🚨)
  // If an OC in the radar is marked as urgent, or has expected date for this period, and is NOT in the Excel
  const criticalMissing: CriticalMissingAlert[] = [];
  radarOrders.forEach((radarItem) => {
    if (radarItem.isCompletedPayment || radarItem.status === 'paid') return;
    if (matchedRadarIds.has(radarItem.id)) return;

    const isUrgent = radarItem.urgencyLevel === 'urgent' || radarItem.urgencyLevel === 'advance';
    const hasExpectedDate = Boolean(radarItem.paymentDueDate || radarItem.rawPaymentDateText);

    // Any urgent radar item or any item specifically scheduled that didn't appear in the proposal is a critical alert
    criticalMissing.push({
      radarItem,
      isUrgent,
      expectedDate: radarItem.rawPaymentDateText || radarItem.paymentDueDate || 'Esta propuesta',
      reason: isUrgent
        ? `🚨 ORDEN CRÍTICA FALTANTE: La OC ${radarItem.orderNumber} (${radarItem.supplierName}) está marcada como ${radarItem.urgencyLevel === 'urgent' ? 'URGENTE' : 'ANTICIPO'} y NO fue incluida en la propuesta semanal de pagos.`
        : `Solicitud de pago pendiente para ${radarItem.supplierName} (${radarItem.orderNumber}) no figura en ninguna pestaña del archivo.`,
    });
  });

  // Date components for email
  const dateComp = getTargetPaymentDateComponents();

  // Generate formatted approval email
  const formattedApprovalEmail = generateApprovalEmailBody(
    dateComp.dayOfWeek,
    dateComp.day,
    dateComp.month,
    totals.sofom,
    totals.inc,
    totals.tech,
    customNotes
  );

  return {
    fileName,
    analyzedAt: new Date().toISOString(),
    targetDayOfWeek: dateComp.dayOfWeek,
    targetDay: dateComp.day,
    targetMonth: dateComp.month,
    targetFullDateLabel: dateComp.fullLabel,
    totals,
    sheets: sheetsResult,
    matches,
    criticalMissing,
    anomalies,
    customNotes,
    formattedApprovalEmail,
  };
}

// Helper to generate a demo Excel file representing "Propuesta de pago Semana 38.xlsx"
export function createDemoWeeklyProposalBuffer(): { buffer: ArrayBuffer; fileName: string } {
  const wb = XLSX.utils.book_new();

  // 1. SOFOM sheet
  const sofomData = [
    {
      OC: 'OC-2024-8891',
      Proveedor: 'AWS México Cloud Services',
      Monto: 345000.0,
      Divisa: 'MXN',
      Concepto: 'Infraestructura Cloud Mensual Septiembre',
      'Fecha Vencimiento': '2026-09-20',
    },
    {
      OC: 'PO-9942',
      Proveedor: 'Datadog Monitoring Inc',
      Monto: 189500.5,
      Divisa: 'MXN',
      Concepto: 'Licenciamiento de observabilidad y métricas',
      'Fecha Vencimiento': '2026-09-22',
    },
    {
      OC: 'OC-2024-9102',
      Proveedor: 'Buro de Crédito TransUnion',
      Monto: 520000.0,
      Divisa: 'MXN',
      Concepto: 'Consultas de historial crediticio clientes',
      'Fecha Vencimiento': '2026-09-25',
    },
    {
      OC: 'PO-8812',
      Proveedor: 'Seguridad Privada & Resguardo SA',
      Monto: 78500.0,
      Divisa: 'MXN',
      Concepto: 'Custodia corporativa sedes operativas',
      'Fecha Vencimiento': '2026-09-24',
    },
  ];

  // 2. INC sheet
  const incData = [
    {
      OC: 'PO-7731',
      Proveedor: 'Google Workspace Enterprise',
      Monto: 165400.0,
      Divisa: 'MXN',
      Concepto: 'Suscripción anual licencias corporativas',
      'Fecha Vencimiento': '2026-09-21',
    },
    {
      OC: 'OC-2024-7744',
      Proveedor: 'Deloitte Asesoría Fiscal',
      Monto: 240000.0,
      Divisa: 'MXN',
      Concepto: 'Auditoría financiera y dictamen fiscal',
      'Fecha Vencimiento': '2026-09-28',
    },
    {
      OC: 'PO-8819',
      Proveedor: 'WeWork Espacios Corporativos',
      Monto: 98000.0,
      Divisa: 'MXN',
      Concepto: 'Arrendamiento oficinas operativas',
      'Fecha Vencimiento': '2026-09-23',
    },
  ];

  // 3. TECH sheet (includes an anomaly to demonstrate the AI validator)
  const techData = [
    {
      OC: 'PO-5541',
      Proveedor: 'MongoDB Cloud Atlas',
      Monto: 312000.0,
      Divisa: 'MXN',
      Concepto: 'Bases de datos distribuidas clúster producción',
      'Fecha Vencimiento': '2026-09-23',
    },
    {
      OC: 'OC-2024-6621',
      Proveedor: 'Twilio SMS & OTP Verify',
      Monto: 145000.0,
      Divisa: 'MXN',
      Concepto: 'Mensajería 2FA y validación de teléfonos',
      'Fecha Vencimiento': '2026-09-24',
    },
    {
      OC: 'PO-9910',
      Proveedor: 'GitHub Enterprise Suite',
      Monto: 85200.0,
      Divisa: 'MXN',
      Concepto: 'Repositorios y CI/CD pipelines',
      'Fecha Vencimiento': '2026-09-25',
    },
  ];

  const wsSofom = XLSX.utils.json_to_sheet(sofomData);
  const wsInc = XLSX.utils.json_to_sheet(incData);
  const wsTech = XLSX.utils.json_to_sheet(techData);

  XLSX.utils.book_append_sheet(wb, wsSofom, 'SOFOM');
  XLSX.utils.book_append_sheet(wb, wsInc, 'INC');
  XLSX.utils.book_append_sheet(wb, wsTech, 'TECH');

  const excelOut = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return {
    buffer: excelOut,
    fileName: 'Propuesta de pago Semana 38.xlsx',
  };
}
