export interface PaymentOrder {
  id: string;
  orderNumber: string; // OC / PO
  supplierName: string;
  amount: number | null;
  currency: string;
  paymentDueDate: string; // YYYY-MM-DD
  rawPaymentDateText?: string; // e.g. "30 de septiembre", "hoy", "miércoles próximo"
  paymentTerm: string;
  invoiceNumber?: string;
  urgencyLevel: 'urgent' | 'advance' | 'normal';
  summary: string;
  emailId: string;
  emailThreadId?: string;
  emailSubject: string;
  emailSender: string;
  emailDate: string;
  riskNotes?: string;
  isProgrammed?: boolean;
  programmedDate?: string;
  status: 'pending' | 'scheduled' | 'paid' | 'duplicate_alert';
  flaggedDuplicate?: boolean;
  duplicateOfId?: string;
  isCompletedPayment?: boolean;
  completedDate?: string;
  // Multi-layer filter metadata
  area?: string;
  subjectMatch?: boolean;
  detectionSource?: 'template_match' | 'secondary_filter' | 'manual';
  matchedTemplateId?: string;
  matchedTemplateName?: string;
  templateMatchScore?: number; // 0 to 100
  matchedFields?: string[];
  secondaryFilterTags?: string[];
}

export interface SecondaryFilterConfig {
  enabled: boolean;
  includePaymentDates: boolean; // mentions specific payment due dates or weekdays
  includeDispersions: boolean; // mentions dispersiones bancarias, SPEI, Tesorería, transferencias
  includeSpecificRequests: boolean; // specific supplier invoice requests outside formal template
  customKeywords: string[]; // additional terms like "layout", "lote de pago", "retención"
}

export interface EmailFilterCriteria {
  searchQuery: string;
  daysLookback: number;
  dateFilterMode?: 'specific_date' | 'lookback_days'; // choose starting from a specific date or days back
  startDate?: string; // YYYY-MM-DD (e.g. 2026-09-01) for after:YYYY/MM/DD in Gmail
  endDate?: string; // YYYY-MM-DD (optional) for before:YYYY/MM/DD in Gmail
  includeSpamTrash: boolean;
  minAmount?: number;
  supplierFilter?: string;
  subjectKeywords?: string[];
  senderFilter?: string;
  hasAttachment?: boolean;
  excludeKeywords?: string[];
  urgentDaysThreshold?: number;
  onlyInbox?: boolean; // When true, limits scan strictly to Inbox and excludes drafts
  // Two-level filtration settings
  filterMode?: 'strict_templates' | 'hybrid' | 'broad';
  templateTolerance?: 'flexible' | 'balanced' | 'strict'; // tolerance to typos, missing letters, formatting
  minTemplateScore?: number; // e.g. 60, 75, 85
  secondaryFilter?: SecondaryFilterConfig;
}

export interface DraftTemplateConfig {
  id: string;
  type: 'urgent' | 'advance';
  name: string;
  description: string;
  subjectTemplate: string;
  bodyTemplate: string;
}

export interface DuplicateAlert {
  originalOrder: PaymentOrder;
  duplicateOrder: PaymentOrder;
  reason: string;
  confidenceScore: number;
}

export interface ExcelRowItem {
  id: string;
  sheetName: string; // 'SOFOM' | 'INC' | 'TECH' | etc.
  rowNumber: number;
  orderNumber: string; // OC / PO
  supplierName: string;
  amount: number;
  currency: string;
  raw: Record<string, any>;
}

export interface ProposalAnomaly {
  id: string;
  type: 'negative_amount' | 'missing_field' | 'duplicate_record';
  sheet: string;
  rowNumber: number;
  description: string;
  data?: any;
}

export interface ProposalMatch {
  radarItem: PaymentOrder;
  excelRow: ExcelRowItem;
  matchedBy: 'oc' | 'supplier';
}

export interface CriticalMissingAlert {
  radarItem: PaymentOrder;
  reason: string;
  isUrgent: boolean;
  expectedDate: string;
}

export interface AuditChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  fileAttachment?: {
    name: string;
    size?: number;
  };
  suggestedActions?: Array<{
    label: string;
    prompt: string;
  }>;
}

export interface ProposalAnalysisResult {
  fileName: string;
  analyzedAt: string;
  targetDayOfWeek: string;
  targetDay: string;
  targetMonth: string;
  targetFullDateLabel: string;
  totals: {
    sofom: number;
    inc: number;
    tech: number;
    overall: number;
  };
  sheets: {
    [sheetKey: string]: {
      displayName: string;
      total: number;
      currency: string;
      items: ExcelRowItem[];
    };
  };
  matches: ProposalMatch[];
  criticalMissing: CriticalMissingAlert[];
  anomalies: ProposalAnomaly[];
  customNotes: string;
  formattedApprovalEmail: string;
}
