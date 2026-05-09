import React, { createContext, useContext, useEffect, useState } from 'react';
import { db, googleProvider } from '../firebase';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signOut, 
  User, 
  ConfirmationResult, 
  RecaptchaVerifier,
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signInWithCredential,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithPhoneNumber,
  PhoneAuthProvider,
  signInWithCustomToken
} from 'firebase/auth';

// Use the singleton auth from our firebase config
import { auth } from '../firebase';
import { doc, getDoc, setDoc, collection, query, where, getDocs, deleteDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { UserProfile } from '../types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  login: () => Promise<boolean>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  registerWithEmail: (email: string, pass: string, name: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signInWithPhone: (phoneNumber: string, recaptchaContainerId?: string) => Promise<void>;
  sendSmsOtp: (phoneNumber: string) => Promise<void>;
  verifySmsOtp: (phoneNumber: string, code: string) => Promise<void>;
  verifyOtp: (otp: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [recaptchaVerifier, setRecaptchaVerifier] = useState<any>(null);
  const [pendingPhoneNumber, setPendingPhoneNumber] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      if (user) {
        const docRef = doc(db, 'users', user.uid);
        
        // Listen to profile changes in real-time
        unsubscribeProfile = onSnapshot(docRef, async (docSnap) => {
          if (docSnap.exists()) {
            const existingProfile = docSnap.data() as UserProfile;
            const adminEmails = ["baselaljman@gmail.com", "maan500094210@gmail.com", "maan1@gmail.com"];
            
            // Force admin role if email matches and not already admin
            if (user.email && adminEmails.includes(user.email.toLowerCase()) && existingProfile.role !== 'admin') {
              const updatedProfile = { ...existingProfile, role: 'admin' as const };
              await updateDoc(docRef, { role: 'admin' });
              setProfile(updatedProfile);
            } else {
              setProfile(existingProfile);
            }
          } else {
            // Check if there's a pre-created profile by email (only if user has email)
            const userEmail = user.email?.toLowerCase();
            let querySnapshot: any = { empty: true };
            
            if (userEmail) {
              const q = query(collection(db, 'users'), where('email', '==', userEmail));
              querySnapshot = await getDocs(q);
            }
            
            if (!querySnapshot.empty) {
              const preCreatedDoc = querySnapshot.docs[0];
              const preCreatedData = preCreatedDoc.data();
              
              const newProfile: UserProfile = {
                ...preCreatedData as UserProfile,
                uid: user.uid,
                photoURL: user.photoURL || '',
              };
              
              await setDoc(docRef, newProfile);
              if (preCreatedDoc.id !== user.uid) {
                await deleteDoc(preCreatedDoc.ref);
              }
              setProfile(newProfile);
            } else {
              const adminEmails = ["baselaljman@gmail.com", "maan500094210@gmail.com", "maan1@gmail.com"];
              const role = (user.email && adminEmails.includes(user.email.toLowerCase())) ? 'admin' : 'user';
              const newProfile: UserProfile = {
                uid: user.uid,
                email: user.email || '',
                displayName: user.displayName || 'مسافر',
                phoneNumber: user.phoneNumber || '',
                role: role as any,
                photoURL: user.photoURL || '',
                createdAt: new Date().toISOString()
              };
              await setDoc(docRef, newProfile);
              setProfile(newProfile);
            }
          }
          setLoading(false);
        });
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  const login = async (): Promise<boolean> => {
    try {
      if (Capacitor.isNativePlatform()) {
        const result = await FirebaseAuthentication.signInWithGoogle();
        if (result.credential?.idToken) {
          const credential = GoogleAuthProvider.credential(result.credential.idToken);
          await signInWithCredential(auth, credential);
        }
      } else {
        await signInWithPopup(auth, googleProvider);
      }
      return true;
    } catch (error: any) {
      console.error('Login Error:', error);
      
      // Handle human-friendly messages for common errors
      if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
        // Return false instead of throwing to indicate a silent cancellation
        return false;
      } else if (error.code === 'auth/popup-blocked') {
        throw new Error('تم حظر النافذة المنبثقة بواسطة المتصفح. يرجى السماح بالنوافذ المنبثقة لهذا الموقع لتتمكن من تسجيل الدخول.');
      }
      
      throw error;
    }
  };

  const loginWithEmail = async (email: string, pass: string) => {
    await signInWithEmailAndPassword(auth, email, pass);
  };

  const registerWithEmail = async (email: string, pass: string, name: string) => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(userCredential.user, { displayName: name });
  };

  const logout = async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        await FirebaseAuthentication.signOut();
      }
      await signOut(auth);
    } catch (error) {
      console.error('Logout Error:', error);
    }
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  const setupRecaptcha = (containerId: string = 'recaptcha-container') => {
    try {
      console.log('Setting up Recaptcha for container:', containerId);
      
      // Ensure auth is defined
      if (!auth) {
        console.error('Auth instance is null or undefined in useAuth');
        throw new Error('مشكلة في تهيئة Firebase Auth');
      }

      // Check if container exists
      const element = document.getElementById(containerId);
      if (!element) {
        console.error(`Recaptcha container element not found: ${containerId}`);
        throw new Error('لم يتم العثور على عنصر التحقق (reCAPTCHA). يرجى التأكد من ظهور الحقل المخصص للتحقق.');
      }

      // Reset any existing verifier if possible
      if (recaptchaVerifier) {
        console.log('Clearing existing recaptcha verifier');
        try {
          recaptchaVerifier.clear();
        } catch (e) {
          console.warn('Error clearing old recaptcha verifier:', e);
        }
      }

      console.log('Creating new RecaptchaVerifier instance');
      const verifier = new RecaptchaVerifier(auth, element, {
        size: 'invisible',
        callback: (response: any) => {
          console.log('Recaptcha resolved successfully:', !!response);
        },
        'expired-callback': () => {
          console.log('Recaptcha expired');
          setRecaptchaVerifier(null);
        }
      });
      
      setRecaptchaVerifier(verifier);
      return verifier;
    } catch (error) {
      console.error('Error in setupRecaptcha:', error);
      throw error;
    }
  };

  const signInWithPhone = async (phoneNumber: string, recaptchaContainerId: string = 'recaptcha-container') => {
    try {
      const verifier = setupRecaptcha(recaptchaContainerId);
      const result = await signInWithPhoneNumber(auth, phoneNumber, verifier);
      setConfirmationResult(result);
      setPendingPhoneNumber(phoneNumber);
    } catch (error: any) {
      console.error('Phone Sign-In Error:', error);
      throw error;
    }
  };

  const verifyOtp = async (otp: string) => {
    try {
      if (!confirmationResult) {
        throw new Error('لم يتم إرسال كود التحقق بعد');
      }
      await confirmationResult.confirm(otp);
      setConfirmationResult(null);
    } catch (error: any) {
      console.error('OTP Verification Error:', error);
      throw new Error('كود التحقق غير صحيح أو انتهت صلاحيته');
    }
  };

  const sendSmsOtp = async (phoneNumber: string) => {
    await signInWithPhone(phoneNumber);
  };

  const verifySmsOtp = async (phoneNumber: string, code: string) => {
    await verifyOtp(code);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile, 
      loading, 
      login, 
      loginWithEmail, 
      registerWithEmail, 
      resetPassword, 
      signInWithPhone, 
      sendSmsOtp,
      verifySmsOtp,
      verifyOtp, 
      logout 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
