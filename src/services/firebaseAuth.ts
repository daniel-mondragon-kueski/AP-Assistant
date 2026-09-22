import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { setCachedToken, getCachedToken, clearCachedToken } from './gmail';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

export const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
];

const provider = new GoogleAuthProvider();
SCOPES.forEach((scope) => provider.addScope(scope));
provider.setCustomParameters({
  prompt: 'consent',
  access_type: 'offline',
});

let isSigningIn = false;

// Initialize auth state listener
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      const token = getCachedToken();
      if (token) {
        if (onAuthSuccess) onAuthSuccess(user, token);
      } else if (!isSigningIn) {
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      clearCachedToken();
      if (onAuthFailure) onAuthFailure();
    }
  });
};

// Interactive sign-in with Google popup
export const googleSignIn = async (): Promise<{ user: User; accessToken: string }> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error(
        'Google completó el inicio de sesión, pero no devolvió el token de acceso para Gmail. Verifica los permisos de la aplicación.'
      );
    }

    const token = credential.accessToken;
    setCachedToken(token);
    return { user: result.user, accessToken: token };
  } catch (error: any) {
    console.error('Firebase Google Sign-In error:', error);
    if (error.code === 'auth/popup-blocked') {
      throw new Error(
        'La ventana emergente de Google fue bloqueada por tu navegador. Por favor permite popups para este sitio y vuelve a intentarlo.'
      );
    }
    if (error.code === 'auth/popup-closed-by-user') {
      throw new Error('Cerraste la ventana de inicio de sesión de Google antes de completarla.');
    }
    if (error.code === 'auth/cancelled-popup-request') {
      throw new Error('Solicitud de inicio de sesión cancelada.');
    }
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return getCachedToken();
};

/**
 * The signed-in user's Firebase ID token, sent to our own /api endpoints so
 * the server can verify who is calling and check them against ALLOWED_USERS.
 *
 * Distinct from the Gmail access token: that one goes to Google's APIs, this
 * one proves identity to this app's backend. Returns null when nobody is
 * signed in, so callers can surface "inicia sesión" instead of a 401.
 */
export const getIdToken = async (): Promise<string | null> => {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    // Refreshes automatically when the cached token is close to expiring.
    return await user.getIdToken();
  } catch (error) {
    console.error('No se pudo obtener el ID token de Firebase:', error);
    return null;
  }
};

export const setAccessTokenInMemory = (token: string | null) => {
  setCachedToken(token);
};

export const logout = async () => {
  await auth.signOut();
  clearCachedToken();
};
