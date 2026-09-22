import { DraftTemplateConfig } from '../types';

export const DEFAULT_TEMPLATES: DraftTemplateConfig[] = [
  {
    id: 'template-urgent',
    type: 'urgent',
    name: 'Solicitud de Pago Urgente',
    description: 'Para solicitudes prioritarias de autorización y dispersión de pago urgente referenciadas a orden SC/OC.',
    subjectTemplate: '[PAGO URGENTE] - {ORDER_NUMBER} {SUPPLIER_NAME}',
    bodyTemplate: `Estimado equipo de Cuentas por Pagar:

Por medio del presente correo solicito de manera PRIORITARIA la autorización y dispersión del pago urgente para la orden referenciada a continuación:

DATOS DE LA SOLICITUD DE PAGO URGENTE

• Número de documento (SC/OC): {ORDER_NUMBER}
• Proveedor: {SUPPLIER_NAME}
• Monto Total a Pagar: {AMOUNT} MXN
• Fecha Solicitada de Pago: {DUE_DATE}
• Folio / Factura: {INVOICE_NUMBER}
• Datos Bancarios / CLABE: {BANK_DETAILS}
• Área: {AREA}
• Justificación de Urgencia: {JUSTIFICATION}

Notas Adicionales / Impacto:
{ADDITIONAL_NOTES}

Agradezco su confirmación y el envío del comprobante de pago tan pronto quede efectuado.

Saludos,`,
  },
  {
    id: 'template-advance',
    type: 'advance',
    name: 'Solicitud de Adelanto / Anticipo de Pago',
    description: 'Para solicitar revisión y aprobación de adelantos o anticipos de pago correspondientes a un área.',
    subjectTemplate: '[ADELANTO DE PAGO] - {ORDER_NUMBER} {SUPPLIER_NAME}',
    bodyTemplate: `Estimado equipo de Cuentas por pagar:

Solicito su revisión y aprobación para procesar el siguiente adelanto de pago correspondiente al {AREA}, detallado a continuación:

DETALLES DEL ADELANTO DE PAGO

• Número de Documento (SC/OC): {ORDER_NUMBER}
• Proveedor: {SUPPLIER_NAME}
• Monto Total a Pagar: {AMOUNT} MXN
• Fecha Requerida: {DUE_DATE}
• Cuenta Bancaria / Destino: {BANK_DETAILS}
• Justificación: {JUSTIFICATION}

Quedo atento a su confirmación.

Saludos,`,
  },
];

export function fillTemplate(
  template: string,
  variables: Record<string, string>,
  replaceRemaining: boolean = true
): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = new RegExp(`{${key}}`, 'gi');
    result = result.replace(placeholder, value || `[COMPLETAR ${key}]`);
  }
  if (replaceRemaining) {
    // Automatically convert any unresolved custom tags like {AREA}, {DEPARTMENT}, etc. to [ESCRIBE_AQUÍ_...]
    result = result.replace(/\{([A-Z0-9_áéíóúÁÉÍÓÚñÑ]+)\}/gi, (_, key) => {
      return `[ESCRIBE_AQUÍ_${key.toUpperCase()}]`;
    });
  }
  return result;
}

export function generateUserBlankDraftUrl(
  template: DraftTemplateConfig,
  defaultRecipient: string = 'pagos@kueski.com'
): {
  url: string;
  subject: string;
  body: string;
} {
  const isUrgent = template.type === 'urgent';

  const blankVariables: Record<string, string> = {
    ORDER_NUMBER: '[ESCRIBE_AQUÍ_NÚMERO_DE_ORDEN]',
    SUPPLIER_NAME: '[ESCRIBE_AQUÍ_NOMBRE_PROVEEDOR]',
    AMOUNT: '[ESCRIBE_AQUÍ_MONTO]',
    CURRENCY: 'MXN',
    DUE_DATE: '[ESCRIBE_AQUÍ_FECHA_DE_PAGO_YYYY-MM-DD]',
    INVOICE_NUMBER: isUrgent ? '[ESCRIBE_AQUÍ_FOLIO_FACTURA_O_ANEXA_PDF]' : 'N/A',
    BANK_DETAILS: '[ESCRIBE_AQUÍ_BANCO_Y_CUENTA_CLABE]',
    AREA: '[ESCRIBE_AQUÍ_ÁREA_O_DEPARTAMENTO]',
    JUSTIFICATION: isUrgent
      ? '[ESCRIBE_AQUÍ_MOTIVO_DE_URGENCIA_O_RIESGO]'
      : '[ESCRIBE_AQUÍ_JUSTIFICACIÓN_DEL_ANTICIPO]',
    ADVANCE_PERCENTAGE: '50%',
    PAYMENT_TERMS: 'Anticipo para liberación de orden',
    ADDITIONAL_NOTES: '[NOTAS_O_INSTRUCCIONES_ADICIONALES]',
  };

  const subject = fillTemplate(template.subjectTemplate, blankVariables, true);
  const body = fillTemplate(template.bodyTemplate, blankVariables, true);

  const base = 'https://mail.google.com/mail/?view=cm&fs=1';
  const url = new URL(base);
  if (defaultRecipient) url.searchParams.set('to', defaultRecipient);
  url.searchParams.set('su', subject);
  url.searchParams.set('body', body);

  return {
    url: url.toString(),
    subject,
    body,
  };
}
