import React, { useState } from 'react';
import {
  Mail,
  LogOut,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Shield,
  ExternalLink,
  Lock,
  Search,
  PenTool,
} from 'lucide-react';

interface AuthBannerProps {
  isAuthenticated: boolean;
  clientId: string;
  setClientId: (id: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  isLoading: boolean;
  userEmail?: string;
  authError?: string | null;
  onClearError?: () => void;
}

export const AuthBanner: React.FC<AuthBannerProps> = ({
  isAuthenticated,
  clientId,
  setClientId,
  onConnect,
  onDisconnect,
  isLoading,
  userEmail,
  authError,
  onClearError,
}) => {
  const [showGuide, setShowGuide] = useState(false);
  const [showAdvancedConfig, setShowAdvancedConfig] = useState(false);

  return (
    <div id="auth-banner" className="bg-white border-b border-slate-200 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 sm:gap-4">
          {/* Status & Title */}
          <div className="flex items-center space-x-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center border shrink-0 transition-colors ${
                isAuthenticated
                  ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                  : 'bg-red-50 text-red-600 border-red-100'
              }`}
            >
              <Mail className="w-5 h-5" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                  Conexión con Google Gmail
                </h2>

                {isAuthenticated ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    Conectado
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    No conectado
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-500 mt-0.5">
                {isAuthenticated ? (
                  <span>
                    Sesión iniciada con{' '}
                    <strong className="text-slate-800 font-medium font-mono">
                      {userEmail || 'tu cuenta de Google'}
                    </strong>
                    . Puedes escanear tu buzón de entrada o enviar borradores directamente.
                  </span>
                ) : (
                  <span>
                    Conecta tu cuenta para leer solicitudes de pago y crear borradores automáticamente.
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 shrink-0">
            {/* Guide Button */}
            <button
              type="button"
              id="btn-toggle-auth-guide"
              onClick={() => setShowGuide(!showGuide)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
            >
              <HelpCircle className="w-3.5 h-3.5 text-indigo-600" />
              <span>¿Cómo conectar?</span>
              {showGuide ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            {isAuthenticated ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  id="btn-disconnect-gmail"
                  onClick={onDisconnect}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-300 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5 text-slate-500" />
                  Cerrar Sesión
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {/* Official Sign In with Google styled button */}
                <button
                  type="button"
                  id="btn-connect-gmail"
                  onClick={onConnect}
                  disabled={isLoading}
                  className="inline-flex items-center gap-2.5 px-4 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 rounded-lg border border-slate-300 shadow-xs hover:shadow-sm transition-all disabled:opacity-50 active:scale-98"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-slate-600" />
                      <span>Iniciando ventana de Google...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" viewBox="0 0 24 24">
                        <path
                          fill="#4285F4"
                          d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                        />
                      </svg>
                      <span>Iniciar sesión con Google</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Error notification banner if any */}
        {authError && (
          <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <strong className="font-semibold block">Aviso de inicio de sesión:</strong>
                <span>{authError}</span>
                <p className="mt-1 text-[11px] text-rose-700">
                  Si tu navegador bloqueó la ventana emergente, busca el ícono de bloqueo en la barra de direcciones de tu navegador y selecciona "Permitir siempre ventanas emergentes".
                </p>
              </div>
            </div>
            {onClearError && (
              <button
                type="button"
                onClick={onClearError}
                className="text-rose-600 hover:text-rose-900 text-xs font-semibold px-2 py-0.5 rounded hover:bg-rose-100"
              >
                Cerrar
              </button>
            )}
          </div>
        )}

        {/* Step by step guide accordion */}
        {showGuide && (
          <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-indigo-600" />
                <span className="font-bold text-slate-900">
                  Guía Rápida: ¿Cómo conectar tu cuenta de Gmail?
                </span>
              </div>
              <span className="text-[11px] text-slate-500 font-medium">
                Protocolo Seguro OAuth 2.0 de Google
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-white p-3 rounded-lg border border-slate-200">
                <div className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 font-bold flex items-center justify-center mb-1.5 text-xs">
                  1
                </div>
                <div className="font-semibold text-slate-900 mb-1">
                  Haz clic en "Iniciar sesión con Google"
                </div>
                <p className="text-slate-600 text-[11px] leading-relaxed">
                  Se abrirá una ventana emergente nativa y segura de Google donde podrás elegir tu cuenta (por ejemplo, tu correo corporativo de empresa).
                </p>
              </div>

              <div className="bg-white p-3 rounded-lg border border-slate-200">
                <div className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 font-bold flex items-center justify-center mb-1.5 text-xs">
                  2
                </div>
                <div className="font-semibold text-slate-900 mb-1">
                  Autoriza los permisos requeridos
                </div>
                <p className="text-slate-600 text-[11px] leading-relaxed">
                  Google te solicitará permiso de <strong>lectura</strong> (para encontrar correos con palabras como 'pago' o 'PO') y de <strong>redacción de borradores</strong>.
                </p>
              </div>

              <div className="bg-white p-3 rounded-lg border border-slate-200">
                <div className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 font-bold flex items-center justify-center mb-1.5 text-xs">
                  3
                </div>
                <div className="font-semibold text-slate-900 mb-1">
                  ¡Listo! Escanea y redacta
                </div>
                <p className="text-slate-600 text-[11px] leading-relaxed">
                  Podrás presionar <strong>"Escanear Correos Recientes"</strong> para extraer órdenes con IA, y <strong>"Crear Borrador Directo"</strong> para guardar correos en tu Gmail.
                </p>
              </div>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 flex items-center gap-2 text-[11px] text-emerald-800">
              <Lock className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                <strong>Seguridad y Privacidad Garantizada:</strong> La aplicación nunca almacena contraseñas, no tiene permiso para borrar correos, y solo lee los mensajes filtrados por las palabras clave que tú configures.
              </span>
            </div>

            {/* Advanced Client ID details */}
            <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
              <button
                type="button"
                onClick={() => setShowAdvancedConfig(!showAdvancedConfig)}
                className="hover:text-slate-800 underline flex items-center gap-1"
              >
                {showAdvancedConfig ? 'Ocultar ajustes avanzados de Client ID' : 'Ver ajustes avanzados de Client ID de Google'}
              </button>
              <span>ID de Cliente provisionado automáticamente</span>
            </div>

            {showAdvancedConfig && (
              <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-2">
                <label className="block text-[11px] font-semibold text-slate-700">
                  Google OAuth Client ID:
                </label>
                <input
                  type="text"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="1005246902537-xxxx.apps.googleusercontent.com"
                  className="w-full text-xs font-mono px-3 py-1.5 border border-slate-300 rounded-lg text-slate-800 bg-slate-50"
                />
                <span className="text-[10px] text-slate-500 block">
                  Configurado con el proyecto de Google Cloud autorizado para los alcances <code>gmail.readonly</code> y <code>gmail.compose</code>.
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
