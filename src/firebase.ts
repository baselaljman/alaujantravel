import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User as FirebaseUser, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, signInWithCredential, sendPasswordResetEmail, RecaptchaVerifier, signInWithPhoneNumber, PhoneAuthProvider } from 'firebase/auth';
import { initializeFirestore, collection, doc, setDoc, getDoc, getDocs, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, Timestamp, getDocFromServer } from 'firebase/firestore';
// @ts-ignore
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase SDK
const app = initializeApp(firebaseConfig);

// Initialize App Check with reCAPTCHA Enterprise
if (typeof window !== 'undefined') {
  // Use the reCAPTCHA Enterprise site key provided by the user
  const RECAPTCHA_SITE_KEY = '6Lf7Z78sAAAAAHh4tiZJE6-C6dkx9YmrAcA0O0oy';
  
  // Enable debug mode for development and preview environments
  // @ts-ignore
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;

  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_SITE_KEY),
    isTokenAutoRefreshEnabled: true
  });
  console.log('App Check initialized with reCAPTCHA Enterprise in debug mode.');
}

// Use initializeFirestore with experimentalForceLongPolling to fix connection issues in some environments
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, firebaseConfig.firestoreDatabaseId);

// Offline Persistence disabled as per user request
/*
import { enableIndexedDbPersistence } from 'firebase/firestore';
if (typeof window !== 'undefined') {
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn('Multiple tabs open, persistence can only be enabled in one tab at a time.');
    } else if (err.code === 'unimplemented') {
      console.warn('The current browser does not support all of the features required to enable persistence');
    }
  });
}
*/

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Error handling for Firestore operations
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Test connection to Firestore
async function testConnection() {
  try {
    // Use a publicly readable path to test connection without permission issues
    await getDocFromServer(doc(db, 'trips', 'connection-test'));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('unavailable') || errorMessage.includes('failed to connect')) {
      console.error("Firestore Connection Error: Could not reach the backend. This might be a network issue or blocked WebSockets. Long polling is enabled to mitigate this.");
    } else if (errorMessage.includes('permission-denied') || errorMessage.includes('Missing or insufficient permissions')) {
      // This is actually a good sign for connection, just a permission issue
      console.log("Firestore Connection: Reached backend successfully (Permission denied as expected for test path).");
    } else {
      console.warn("Firestore Connection Test Notice:", errorMessage);
    }
  }
}
testConnection();

export { signInWithPopup, signOut, onAuthStateChanged, collection, doc, setDoc, getDoc, getDocs, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, Timestamp, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, signInWithCredential, GoogleAuthProvider, sendPasswordResetEmail, RecaptchaVerifier, signInWithPhoneNumber, PhoneAuthProvider };
export type { FirebaseUser };
