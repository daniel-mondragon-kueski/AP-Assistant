import React, { useState, useEffect } from 'react';
import { AuthBanner } from './components/AuthBanner';
import { CriteriaPanel } from './components/CriteriaPanel';
import { DuplicateAlertsBanner } from './components/DuplicateAlertsBanner';
import { OrderList } from './components/OrderList';
import { DraftModal } from './components/DraftModal';
import { TemplateManager } from './components/TemplateManager';
import { PaymentOrder, EmailFilterCriteria, DraftTemplateConfig, DuplicateAlert } from './types';
import { ProposalAuditor } from './components/ProposalAuditor';
import { DEFAULT_TEMPLATES } from './utils/draftTemplates';
import { detectDuplicates } from './utils/paymentMatcher';
import { parseStoredOrders } from './schemas/orders';
import {
  storedCriteriaSchema,
  parseStoredTemplates,
  readValidated,
  stripUndefined,
} from './schemas/storage';
import { SAMPLE_ORDERS } from './data/sampleOrders';
import {
  getCachedToken,
  setCachedToken,
  clearCachedToken,
  requestGmailToken,
  fetchRecentEmails,
  fetchRecentEmailsDetailed,
  FetchEmailsResult,
} from './services/gmail';
import { googleSignIn, logout, initAuth } from './services/firebaseAuth';
import { postAnalyzeEmails } from './services/api';
import type { User } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';
import {
  Bell,
  ShieldCheck,
  FileSpreadsheet,
  AlertTriangle,
  Clock,
  Layers,
  Settings2,
  Calendar,
  DollarSign,
  Flame,
  Zap,
  Search,
  CheckCircle2,
  XCircle,
  Info,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from 'lucide-react';

export default function App() {
  // Google OAuth credentials
  const defaultClientId =
    firebaseConfig.oAuthClientId ||
    '1005246902537-ul22q0bml5cbq97g4f0ed69k5mc92jj4.apps.googleusercontent.com';
  const [clientId, setClientId] = useState<string>(
    () => localStorage.getItem('google_client_id') || defaultClientId
  );
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userEmail, setUserEmail] = useState<string>(
    () => localStorage.getItem('google_user_email') || 'daniel.mondragon@kueski.com'
  );
  const [authError, setAuthError] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(() => getCachedToken());
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  // Clean step-by-step criteria (zero unnecessary filters, strictly Inbox only)
  const defaultCleanCriteria: EmailFilterCriteria = {
    searchQuery: 'in:inbox -in:drafts -is:draft subject:("ADELANTO DE PAGO")',
    onlyInbox: true,
    dateFilterMode: 'specific_date',
    startDate: '2026-09-20',
    endDate: '',
    daysLookback: 7,
    includeSpamTrash: false,
    subjectKeywords: ['[ADELANTO DE PAGO]'],
    excludeKeywords: [], // Zero exclusions
    senderFilter: '',
    hasAttachment: false,
    urgentDaysThreshold: 3,
    filterMode: 'broad',
    templateTolerance: 'flexible',
    minTemplateScore: 0,
    secondaryFilter: {
      enabled: false,
      includePaymentDates: false,
      includeDispersions: false,
      includeSpecificRequests: false,
      customKeywords: [],
    },
  };

  // Criteria with local storage persistence
  const [criteria, setCriteria] = useState<EmailFilterCriteria>(() => {
    // Validated on read: stored criteria may come from an older build or have
    // been hand-edited, and a wrong-shaped value here breaks the scan silently.
    const saved = readValidated('ap_filter_criteria', storedCriteriaSchema);
    if (!saved) return defaultCleanCriteria;

    return {
      ...defaultCleanCriteria,
      // stripUndefined keeps absent stored fields from clobbering the defaults.
      ...stripUndefined(saved),
      onlyInbox: true, // Always enforce Inbox only and exclude drafts
      // Always ensure zero unwanted exclusions when restarting
      excludeKeywords: (saved.excludeKeywords || []).filter((k) => k.toLowerCase() !== 'marketing'),
    };
  });

  // Orders State
  const [orders, setOrders] = useState<PaymentOrder[]>(() => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem('ap_saved_orders');
    } catch {
      raw = null;
    }
    if (!raw) return SAMPLE_ORDERS;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return SAMPLE_ORDERS;
    }

    // Records that no longer satisfy the schema are dropped individually, so a
    // single corrupt entry does not cost the user their whole saved radar.
    const validated = parseStoredOrders(parsed);
    if (!validated || validated.orders.length === 0) return SAMPLE_ORDERS;
    if (validated.discarded > 0) {
      console.warn(
        `ap_saved_orders: ${validated.discarded} orden(es) guardada(s) descartada(s) por formato inválido.`
      );
    }

    // If orders predate the current template subjects, refresh sample dataset
    const hasOldData = validated.orders.some(
      (o) => o.orderNumber === 'OC-2024-8891' || o.orderNumber === 'PO-9942'
    );
    return hasOldData ? SAMPLE_ORDERS : validated.orders;
  });

  const [isScanning, setIsScanning] = useState(false);
  const [scanStatusMessage, setScanStatusMessage] = useState<string | null>(null);

  interface ScanDiagnosticInfo {
    timestamp: string;
    queryExecuted: string;
    rawCount: number;
    emailsCount: number;
    emailsPreview: Array<{ id: string; subject: string; sender: string; date: string }>;
    ordersExtracted: number;
    marianaFoundInGmail: boolean;
    marianaSubject?: string;
    marianaSender?: string;
    marianaExtractedCount: number;
  }

  const [diagnostic, setDiagnostic] = useState<ScanDiagnosticInfo | null>(null);
  const [showDiagnosticDetails, setShowDiagnosticDetails] = useState(false);

  // Templates
  const [templates, setTemplates] = useState<DraftTemplateConfig[]>(() => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem('ap_draft_templates');
    } catch {
      raw = null;
    }
    if (!raw) return DEFAULT_TEMPLATES;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return DEFAULT_TEMPLATES;
    }

    const validated = parseStoredTemplates(parsed);
    if (!validated) return DEFAULT_TEMPLATES;

    // Check if it's the old version without SC/OC or with old subject
    const hasOldSubject = validated.some((t) =>
      t.subjectTemplate.includes('Autorización y Pago Inmediato')
    );
    return hasOldSubject ? DEFAULT_TEMPLATES : validated;
  });

  // Active Draft Modal
  const [activeDraftOrder, setActiveDraftOrder] = useState<PaymentOrder | null>(null);
  const [activeDraftType, setActiveDraftType] = useState<'urgent' | 'advance'>('urgent');
  const [isDraftModalOpen, setIsDraftModalOpen] = useState(false);

  // Active view tab in main view
  const [activeTab, setActiveTab] = useState<'auditor' | 'orders' | 'templates'>('auditor');

  // Persistence
  useEffect(() => {
    localStorage.setItem('ap_saved_orders', JSON.stringify(orders));
  }, [orders]);

  useEffect(() => {
    localStorage.setItem('ap_draft_templates', JSON.stringify(templates));
  }, [templates]);

  useEffect(() => {
    localStorage.setItem('ap_filter_criteria', JSON.stringify(criteria));
  }, [criteria]);

  useEffect(() => {
    localStorage.setItem('google_client_id', clientId);
  }, [clientId]);

  // Duplicates detection
  const { enrichedOrders, alerts } = detectDuplicates(orders);

  // Initialize Firebase Auth listener
  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setCurrentUser(user);
        if (user.email) {
          setUserEmail(user.email);
          localStorage.setItem('google_user_email', user.email);
        }
        setAccessToken(token);
        setCachedToken(token);
        setAuthError(null);
      },
      () => {
        // Unauthenticated or token invalidated
        setAccessToken(null);
      }
    );
    return () => unsubscribe();
  }, []);

  // Connect to Google
  const handleConnectGmail = async () => {
    setIsAuthLoading(true);
    setAuthError(null);
    try {
      // 1. Primary: Firebase Auth with Google Provider & Gmail scopes
      const { user, accessToken: token } = await googleSignIn();
      setCurrentUser(user);
      if (user.email) {
        setUserEmail(user.email);
        localStorage.setItem('google_user_email', user.email);
      }
      setAccessToken(token);
      setCachedToken(token);
      setAuthError(null);
    } catch (err: any) {
      console.warn('Firebase popup sign-in attempt finished with note:', err);
      // Fallback: Attempt Google Identity Services Token Client
      try {
        const token = await requestGmailToken(clientId);
        setAccessToken(token);
        setCachedToken(token);
        setAuthError(null);
      } catch (gisErr: any) {
        setAuthError(err.message || gisErr.message || 'No se pudo conectar con Google.');
      }
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleDisconnectGmail = async () => {
    try {
      await logout();
    } catch {
      // ignore
    }
    clearCachedToken();
    setAccessToken(null);
    setCurrentUser(null);
    setUserEmail('');
    localStorage.removeItem('google_user_email');
    setAuthError(null);
  };

  // Reusable Scan Executor
  const executeScanWithQuery = async (queryToUse: string, isTargetedMariana: boolean = false) => {
    if (!accessToken) {
      setScanStatusMessage('Iniciando conexión con Google para escanear correos de Gmail...');
      await handleConnectGmail();
      return;
    }

    const enforceInbox = criteria.onlyInbox !== false;
    let cleanQuery = queryToUse.replace(/\bin:drafts?\b/gi, '').replace(/\bis:draft\b/gi, '').trim();
    if (enforceInbox) {
      if (!/\bin:inbox\b/i.test(cleanQuery)) {
        cleanQuery = `in:inbox -in:drafts -is:draft ${cleanQuery}`.trim();
      } else if (!/\b-in:drafts\b/i.test(cleanQuery)) {
        cleanQuery = `${cleanQuery} -in:drafts -is:draft`.trim();
      }
    }

    setIsScanning(true);
    setScanStatusMessage(`Consultando únicamente en Bandeja de Recibidos (Inbox - sin borradores) con filtro: ${cleanQuery}...`);
    try {
      // 1. Fetch raw emails using query (up to 50 found, inspecting 40 in parallel chunks)
      const fetchedResult = await fetchRecentEmailsDetailed(accessToken, cleanQuery, 50, enforceInbox);
      const fetched = fetchedResult.emails;

      const marianaFound = fetched.find((e) =>
        /adelanto\s*(de\s*)?pago/i.test(e.subject) ||
        /mariana/i.test(e.sender) ||
        /mariana\s*herrera/i.test(e.subject)
      );

      if (fetched.length === 0) {
        setScanStatusMessage(`Gmail no devolvió correos con la consulta: "${queryToUse}".`);
        setDiagnostic({
          timestamp: new Date().toLocaleTimeString(),
          queryExecuted: fetchedResult.queryExecuted,
          rawCount: fetchedResult.rawCount,
          emailsCount: 0,
          emailsPreview: [],
          ordersExtracted: 0,
          marianaFoundInGmail: false,
          marianaExtractedCount: 0,
        });
        setIsScanning(false);
        return;
      }

      setScanStatusMessage(
        `Gmail devolvió ${fetched.length} correos. Procesando con IA (incluyendo tablas y lotes de adelantos)...`
      );

      // 2. Call server backend endpoint with Gemini using two-level filtration
      const data = await postAnalyzeEmails({
        emails: fetched,
        templates,
        filterOptions: {
          filterMode: criteria.filterMode || 'hybrid',
          templateTolerance: criteria.templateTolerance || 'flexible',
          minTemplateScore: criteria.minTemplateScore || 65,
          secondaryFilter: criteria.secondaryFilter || {
            enabled: true,
            includePaymentDates: true,
            includeDispersions: true,
            includeSpecificRequests: true,
            customKeywords: [],
          },
        },
      });

      const detectedOrders: PaymentOrder[] = data.orders.map((o, idx) => {
        // Match with original Gmail message metadata for exact deep linking
        const matchedEmail = fetched.find(
          (e) =>
            (o.emailId && e.id === o.emailId) ||
            (o.emailSubject && e.subject.toLowerCase().includes(o.emailSubject.toLowerCase().slice(0, 20))) ||
            (o.emailSender && e.sender.toLowerCase().includes(o.emailSender.toLowerCase().slice(0, 15)))
        ) || fetched[0];

        const realEmailId = (matchedEmail && matchedEmail.id) || o.emailId || '';
        // Gemini's response schema carries no threadId, so the Gmail message
        // metadata is the only source for it.
        const realThreadId = (matchedEmail && matchedEmail.threadId) || realEmailId;
        const realSubject = (matchedEmail && matchedEmail.subject) || o.emailSubject || '';
        const realSender = (matchedEmail && matchedEmail.sender) || o.emailSender || '';
        const realDate = (matchedEmail && matchedEmail.date) || o.emailDate || new Date().toLocaleDateString();

        return {
          id: `gmail-detected-${Date.now()}-${idx}`,
          orderNumber: o.orderNumber || `PO-${idx + 100}`,
          supplierName: o.supplierName || 'Proveedor no especificado',
          amount: typeof o.amount === 'number' ? o.amount : null,
          currency: o.currency || 'MXN',
          area: o.area,
          paymentDueDate: o.paymentDueDate || '',
          paymentTerm: o.paymentTerm || 'Contado',
          invoiceNumber: o.invoiceNumber,
          urgencyLevel: o.urgencyLevel || 'normal',
          summary: o.summary || 'Orden detectada en correo.',
          emailId: realEmailId,
          emailThreadId: realThreadId,
          emailSubject: realSubject,
          emailSender: realSender,
          emailDate: realDate,
          riskNotes: o.riskNotes,
          isProgrammed: false,
          status: 'pending',
          subjectMatch: o.subjectMatch ?? (realSubject ? /pago\s*urgente|adelanto\s*(de\s*)?pago/i.test(realSubject) : false),
          detectionSource: o.detectionSource || 'template_match',
          matchedTemplateName: o.matchedTemplateName,
          templateMatchScore: o.templateMatchScore,
          matchedFields: o.matchedFields,
          secondaryFilterTags: o.secondaryFilterTags,
        };
      });

      // Combine with existing non-duplicates
      setOrders((prev) => {
        const combined = [...detectedOrders, ...prev];
        const seen = new Set();
        return combined.filter((item) => {
          const key = `${item.orderNumber}_${item.emailId}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      });

      const marianaExtractedCount = detectedOrders.filter(
        (o) =>
          o.emailSubject?.toLowerCase().includes('mariana') ||
          o.emailSubject?.toLowerCase().includes('adelanto de pago') ||
          o.supplierName?.toLowerCase().includes('rtb house') ||
          o.supplierName?.toLowerCase().includes('singular labs') ||
          o.supplierName?.toLowerCase().includes('todovien') ||
          o.orderNumber?.startsWith('OC00015')
      ).length;

      setDiagnostic({
        timestamp: new Date().toLocaleTimeString(),
        queryExecuted: fetchedResult.queryExecuted,
        rawCount: fetchedResult.rawCount,
        emailsCount: fetched.length,
        emailsPreview: fetched.map((e) => ({
          id: e.id,
          subject: e.subject,
          sender: e.sender,
          date: e.date,
        })),
        ordersExtracted: detectedOrders.length,
        marianaFoundInGmail: !!marianaFound,
        marianaSubject: marianaFound?.subject,
        marianaSender: marianaFound?.sender,
        marianaExtractedCount,
      });

      // Surface what validation rejected or flagged. A dropped order is a
      // payment the user would otherwise never learn about, so it is reported
      // rather than logged and forgotten.
      const dataIssues: string[] = [];
      if (data.skipped.length > 0) {
        dataIssues.push(
          `${data.skipped.length} extracción(es) descartada(s) por datos incompletos`
        );
      }
      if (data.warnings.length > 0) {
        dataIssues.push(`${data.warnings.length} con monto ilegible (revisa el correo original)`);
      }
      const issuesSuffix = dataIssues.length ? ` ⚠️ ${dataIssues.join('; ')}.` : '';

      if (marianaFound && marianaExtractedCount > 0) {
        setScanStatusMessage(
          `¡Éxito! Se detectó el correo de Mariana Herrera y se extrajeron ${marianaExtractedCount} órdenes de compra al Radar.${issuesSuffix}`
        );
      } else if (marianaFound && marianaExtractedCount === 0) {
        setScanStatusMessage(
          `Se encontró el correo de Mariana en Gmail, pero las órdenes están siendo procesadas.${issuesSuffix}`
        );
      } else {
        setScanStatusMessage(
          `Escaneo completo: ${fetched.length} correos analizados, ${detectedOrders.length} compromisos de pago en el Radar.${issuesSuffix}`
        );
      }

      if (data.warnings.length > 0) {
        console.warn('Órdenes con monto ilegible:', data.warnings);
      }
    } catch (err: any) {
      console.error('Error durante el escaneo:', err);
      setScanStatusMessage(`Error en el escaneo: ${err.message || 'Falla de comunicación'}`);
    } finally {
      setIsScanning(false);
    }
  };

  // Run Standard Scan on Gmail
  const handleRunScan = async () => {
    let queryToUse = criteria.searchQuery || '';

    // Clean brackets inside quotes: "[ADELANTO DE PAGO]" -> "ADELANTO DE PAGO"
    // Gmail search syntax does NOT match literal brackets inside quotes!
    queryToUse = queryToUse
      .replace(/"\[([^\]]+)\]"/g, '"$1"')
      .replace(/'\[([^\]]+)\]'/g, '"$1"')
      .replace(/-"marketing"/gi, '')
      .replace(/-marketing\b/gi, '')
      .trim();

    if (!queryToUse || queryToUse === '()') {
      queryToUse = 'subject:("ADELANTO DE PAGO" OR "PAGO URGENTE" OR "ANTICIPO DE PAGO" OR pago OR OC OR PO)';
    }

    // Clean any existing temporal clauses to avoid conflicts
    queryToUse = queryToUse
      .replace(/\bnewer_than:\s*\d+d\b/gi, '')
      .replace(/\bafter:\s*\S+/gi, '')
      .replace(/\bbefore:\s*\S+/gi, '')
      .trim();

    if (criteria.dateFilterMode === 'specific_date' && criteria.startDate) {
      // Gmail format: after:YYYY/MM/DD
      const formattedStart = criteria.startDate.replace(/-/g, '/');
      queryToUse = `${queryToUse} after:${formattedStart}`;
      if (criteria.endDate) {
        const formattedEnd = criteria.endDate.replace(/-/g, '/');
        queryToUse = `${queryToUse} before:${formattedEnd}`;
      }
    } else if (criteria.daysLookback) {
      queryToUse = `${queryToUse} newer_than:${criteria.daysLookback}d`;
    }

    // Strictly enforce Inbox only and exclude drafts
    if (criteria.onlyInbox !== false) {
      queryToUse = queryToUse.replace(/\bin:drafts?\b/gi, '').replace(/\bis:draft\b/gi, '').trim();
      if (!/\bin:inbox\b/i.test(queryToUse)) {
        queryToUse = `in:inbox -in:drafts -is:draft ${queryToUse}`.trim();
      } else if (!/\b-in:drafts\b/i.test(queryToUse)) {
        queryToUse = `${queryToUse} -in:drafts -is:draft`.trim();
      }
    }

    await executeScanWithQuery(queryToUse);
  };

  // Target Scan specifically for Mariana / Adelanto de pago (Inbox only, no drafts)
  const handleRunScanTargeted = async () => {
    // Look for Adelanto de Pago or Mariana Herrera strictly in Inbox after 2026/09/20
    const targetQuery = 'in:inbox -in:drafts -is:draft subject:("ADELANTO DE PAGO") after:2026/09/20';
    await executeScanWithQuery(targetQuery, true);
  };

  // Clear orders currently in radar
  const handleClearRadarOrders = () => {
    setOrders([]);
    localStorage.removeItem('ap_saved_orders');
    setScanStatusMessage('Se han limpiado todas las órdenes del Radar. Puedes ejecutar un escaneo limpio solo en la bandeja de entrada.');
  };

  // Reset all criteria and filters to clean step 1 baseline
  const handleResetToZero = () => {
    localStorage.removeItem('ap_filter_criteria');
    setCriteria({ ...defaultCleanCriteria });
    setDiagnostic(null);
    setScanStatusMessage('✅ Se han eliminado todos los filtros y exclusiones. Listo para configurar paso a paso desde cero.');
  };

  // Load demo mock data
  const handleLoadDemoData = () => {
    setOrders(SAMPLE_ORDERS);
    setScanStatusMessage('Datos de muestra cargados: incluye órdenes urgentes, anticipos y alerta de duplicidad.');
    setTimeout(() => setScanStatusMessage(null), 5000);
  };

  // Mark as duplicate or distinct
  const handleMarkAsDuplicate = (orderId: string) => {
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: 'duplicate_alert', flaggedDuplicate: true } : o))
    );
  };

  const handleConfirmDifferent = (orderId: string) => {
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, flaggedDuplicate: false, status: 'pending' } : o))
    );
  };

  // Toggle programmed
  const handleToggleProgrammed = (orderId: string) => {
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              isProgrammed: !o.isProgrammed,
              status: !o.isProgrammed ? 'scheduled' : 'pending',
              programmedDate: !o.isProgrammed ? new Date().toISOString().split('T')[0] : undefined,
            }
          : o
      )
    );
  };

  // Toggle paid / historical completed payments
  const handleTogglePaid = (orderId: string) => {
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id === orderId) {
          const isPaid = o.isCompletedPayment || o.status === 'paid';
          return {
            ...o,
            isCompletedPayment: !isPaid,
            status: !isPaid ? 'paid' : 'pending',
            completedDate: !isPaid ? new Date().toISOString().split('T')[0] : undefined,
          };
        }
        return o;
      })
    );
  };

  const handleDeleteOrder = (orderId: string) => {
    setOrders((prev) => prev.filter((o) => o.id !== orderId));
  };

  // Open Draft Modal
  const handleSelectOrderForDraft = (order: PaymentOrder, draftType: 'urgent' | 'advance') => {
    setActiveDraftOrder(order);
    setActiveDraftType(draftType);
    setIsDraftModalOpen(true);
  };

  // Save template
  const handleSaveTemplate = (updated: DraftTemplateConfig) => {
    setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  };

  const handleResetDefaults = () => {
    setTemplates(DEFAULT_TEMPLATES);
  };

  // Key KPI metrics
  const totalOrders = orders.length;
  const urgentCount = orders.filter((o) => o.urgencyLevel === 'urgent' && !o.isCompletedPayment).length;
  const advanceCount = orders.filter((o) => o.urgencyLevel === 'advance' && !o.isCompletedPayment).length;
  const scheduledCount = orders.filter((o) => o.isProgrammed && !o.isCompletedPayment).length;
  const duplicatesCount = alerts.length;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans">
      {/* Header Navbar */}
      <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-30 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold shadow-xs">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-2">
                Asistente de Operaciones Financieras y Cuentas por Pagar (AP)
              </h1>
              <p className="text-[11px] text-slate-400">
                Auditoría Autónoma de Propuestas Semanales • Radar de Pagos Gmail • Redacción Exacta de Aprobación
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center space-x-1 bg-slate-800 p-1 rounded-lg">
            <button
              id="tab-nav-auditor"
              onClick={() => setActiveTab('auditor')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'auditor'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Auditoría Excel vs. Radar
            </button>
            <button
              id="tab-nav-orders"
              onClick={() => setActiveTab('orders')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'orders'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Radar Gmail ({totalOrders})
            </button>
            <button
              id="tab-nav-templates"
              onClick={() => setActiveTab('templates')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'templates'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Settings2 className="w-3.5 h-3.5" />
              Borradores Editables
            </button>
          </div>
        </div>
      </header>

      {/* Gmail Connection Bar */}
      <AuthBanner
        isAuthenticated={!!accessToken}
        clientId={clientId}
        setClientId={setClientId}
        onConnect={handleConnectGmail}
        onDisconnect={handleDisconnectGmail}
        isLoading={isAuthLoading}
        userEmail={userEmail}
        authError={authError}
        onClearError={() => setAuthError(null)}
      />

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 w-full space-y-6">
        {/* KPI Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Total Órdenes Detectadas</span>
              <FileSpreadsheet className="w-4 h-4 text-slate-400" />
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-2">{totalOrders}</p>
            <span className="text-[11px] text-slate-400">Extraídas de correos con PO / facturas</span>
          </div>

          <div className="bg-white rounded-xl p-4 border border-rose-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-rose-700 flex items-center gap-1">
                <Flame className="w-3.5 h-3.5" /> Pagos Urgentes
              </span>
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
            </div>
            <p className="text-2xl font-bold text-rose-600 mt-2">{urgentCount}</p>
            <span className="text-[11px] text-rose-600 font-medium">Vencimiento inminente o crítico</span>
          </div>

          <div className="bg-white rounded-xl p-4 border border-indigo-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-indigo-700 flex items-center gap-1">
                <Zap className="w-3.5 h-3.5" /> Adelantos de Pago
              </span>
              <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">
                Anticipos
              </span>
            </div>
            <p className="text-2xl font-bold text-indigo-700 mt-2">{advanceCount}</p>
            <span className="text-[11px] text-indigo-600">Requeridos para liberación</span>
          </div>

          <div className="bg-white rounded-xl p-4 border border-amber-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-700 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> Riesgo Duplicados
              </span>
              {duplicatesCount > 0 && (
                <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900">
                  {duplicatesCount} alerta(s)
                </span>
              )}
            </div>
            <p className="text-2xl font-bold text-amber-700 mt-2">{duplicatesCount}</p>
            <span className="text-[11px] text-amber-700">Prevención activa de doble pago</span>
          </div>
        </div>

        {/* Scan Status Toast / Notice */}
        {scanStatusMessage && (
          <div className="p-3.5 rounded-xl text-xs font-medium bg-slate-900 text-white shadow-md flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
              {scanStatusMessage}
            </span>
            <button
              onClick={() => setScanStatusMessage(null)}
              className="text-slate-400 hover:text-white text-xs underline shrink-0 ml-3"
            >
              Cerrar
            </button>
          </div>
        )}

        {/* Live Scan Diagnostic Card */}
        {diagnostic && (
          <div className="bg-slate-900 border border-slate-700/80 rounded-xl p-4 text-white shadow-lg space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-slate-200">
                  Diagnóstico en Tiempo Real del Escaneo de Gmail
                </span>
                <span className="text-[10px] text-slate-400 font-mono">({diagnostic.timestamp})</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowDiagnosticDetails(!showDiagnosticDetails)}
                  className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium cursor-pointer"
                >
                  {showDiagnosticDetails ? 'Ocultar correos brutos' : `Ver ${diagnostic.emailsCount} correos entregados por Gmail`}
                  {showDiagnosticDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="bg-slate-800/80 p-3 rounded-lg border border-slate-700/60">
                <span className="text-slate-400 block text-[11px] mb-1 font-medium">Consulta ejecutada en Gmail:</span>
                <code className="text-amber-300 font-mono text-[11px] break-all block bg-slate-950/60 p-1.5 rounded">
                  {diagnostic.queryExecuted}
                </code>
              </div>

              <div className="bg-slate-800/80 p-3 rounded-lg border border-slate-700/60 flex flex-col justify-between">
                <div>
                  <span className="text-slate-400 block text-[11px] font-medium">Correos devueltos por Gmail:</span>
                  <span className="text-lg font-bold text-white mt-1 block">
                    {diagnostic.emailsCount} analizados{' '}
                    <span className="text-xs font-normal text-slate-400">({diagnostic.rawCount} en total)</span>
                  </span>
                </div>
                <span className="text-[11px] text-slate-300 mt-2">
                  Órdenes extraídas al Radar: <strong className="text-emerald-400 font-bold">{diagnostic.ordersExtracted}</strong>
                </span>
              </div>

              <div
                className={`p-3 rounded-lg border flex flex-col justify-between ${
                  diagnostic.marianaFoundInGmail
                    ? 'bg-emerald-950/40 border-emerald-700/60 text-emerald-200'
                    : 'bg-amber-950/40 border-amber-700/60 text-amber-200'
                }`}
              >
                <div>
                  <div className="flex items-center gap-1.5 font-semibold text-xs">
                    {diagnostic.marianaFoundInGmail ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    )}
                    <span>
                      {diagnostic.marianaFoundInGmail
                        ? 'Correo [ADELANTO DE PAGO] Encontrado'
                        : 'Correo No Entregado por Gmail'}
                    </span>
                  </div>
                  <p className="text-[11px] mt-1.5 text-slate-300 leading-relaxed">
                    {diagnostic.marianaFoundInGmail
                      ? `"${diagnostic.marianaSubject}" detectado. Órdenes extraídas de la tabla: ${diagnostic.marianaExtractedCount}.`
                      : 'Gmail no devolvió este correo. Causa frecuente: la fecha de inicio es posterior al 21 de septiembre o la consulta es restrictiva.'}
                  </p>
                </div>
                {!diagnostic.marianaFoundInGmail && (
                  <button
                    type="button"
                    onClick={() => handleRunScanTargeted()}
                    disabled={isScanning}
                    className="mt-2.5 w-full py-1.5 px-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-xs font-semibold transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    <Search className="w-3.5 h-3.5" /> Forzar Búsqueda de Mariana ([ADELANTO DE PAGO])
                  </button>
                )}
              </div>
            </div>

            {/* List of raw emails returned by Gmail */}
            {showDiagnosticDetails && (
              <div className="mt-2 pt-3 border-t border-slate-800 text-xs">
                <span className="text-slate-400 block font-medium mb-1.5">
                  Lista de los {diagnostic.emailsPreview.length} correos entregados por Gmail para este análisis:
                </span>
                <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1 font-mono text-[11px]">
                  {diagnostic.emailsPreview.map((em, idx) => (
                    <div
                      key={em.id || idx}
                      className="p-2 bg-slate-800/90 rounded border border-slate-700/70 flex items-center justify-between gap-2"
                    >
                      <div className="truncate flex-1">
                        <span className="text-amber-200 font-semibold">{em.subject}</span>
                        <span className="text-slate-400 block text-[10px] font-sans truncate">{em.sender}</span>
                      </div>
                      <span className="text-slate-400 text-[10px] shrink-0 font-sans">{em.date}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'auditor' && (
          <ProposalAuditor
            radarOrders={orders}
            accessToken={accessToken}
            onOpenDraftModal={(order) =>
              handleSelectOrderForDraft(
                order,
                order.urgencyLevel === 'urgent' ? 'urgent' : 'advance'
              )
            }
          />
        )}

        {activeTab === 'orders' && (
          <>
            {/* Criteria & Search panel */}
            <CriteriaPanel
              criteria={criteria}
              setCriteria={setCriteria}
              templates={templates}
              onRunScan={handleRunScan}
              isScanning={isScanning}
              onLoadDemoData={handleLoadDemoData}
              ordersCount={orders.length}
              isAuthenticated={!!accessToken}
              onResetToZero={handleResetToZero}
            />

            {/* Duplicates Prevention Alerts */}
            <DuplicateAlertsBanner
              alerts={alerts}
              onDismissAlert={() => {}}
              onMarkAsDuplicate={handleMarkAsDuplicate}
              onConfirmDifferent={handleConfirmDifferent}
            />

            {/* List of Orders */}
            <OrderList
              orders={enrichedOrders}
              onToggleProgrammed={handleToggleProgrammed}
              onTogglePaid={handleTogglePaid}
              onDeleteOrder={handleDeleteOrder}
            />
          </>
        )}

        {activeTab === 'templates' && (
          <TemplateManager
            templates={templates}
            onSaveTemplate={handleSaveTemplate}
            onResetDefaults={handleResetDefaults}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 px-6 text-center text-xs text-slate-500">
        Agente de Gestión Financiera y Control de Pagos • Integrado con Gmail API y Gemini AI
      </footer>

      {/* Draft Generator & Compose Modal */}
      <DraftModal
        order={activeDraftOrder}
        initialType={activeDraftType}
        accessToken={accessToken}
        isOpen={isDraftModalOpen}
        onClose={() => setIsDraftModalOpen(false)}
        templates={templates}
        onUpdateTemplate={handleSaveTemplate}
      />
    </div>
  );
}
