import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signInWithCredential,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithPhoneNumber,
  PhoneAuthProvider,
  signInWithCustomToken,
  RecaptchaVerifier,
  User,
  ConfirmationResult
} from 'firebase/auth';
import { 
  auth, 
  db, 
  googleProvider,
} from '../firebase';
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  deleteDoc, 
  updateDoc, 
  onSnapshot,
  Timestamp
} from 'firebase/firestore';
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
  const [recaptchaVerifier, setRecaptchaVerifier] = useState<RecaptchaVerifier | null>(null);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    // Set persistence language to Arabic for SMS and reCAPTCHA
    auth.languageCode = 'ar';

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

  const setupRecaptcha = async (containerId: string = 'recaptcha-container') => {
    try {
      console.log('--- setupRecaptcha Start ---');
      
      if (typeof window === 'undefined') return null;
      
      const element = document.getElementById(containerId);
      if (!element) {
        console.error(`Recaptcha container element not found: ${containerId}`);
        throw new Error(`لم يتم العثور على عنصر التحقق (reCAPTCHA) بالمعرف: ${containerId}`);
      }

      // If we have an existing verifier, try to clear it
      if (recaptchaVerifier) {
        console.log('Clearing existing verifier');
        try { recaptchaVerifier.clear(); } catch (e) {}
      }

      // Ensure dry element
      element.innerHTML = '';

      console.log('Creating new RecaptchaVerifier');
      // SIGNATURE: new RecaptchaVerifier(auth, element, parameters)
      const verifier = new RecaptchaVerifier(auth, element, {
        size: 'invisible',
        callback: (response: any) => {
          console.log('reCAPTCHA solved successfully', !!response);
        },
        'expired-callback': () => {
          console.log('reCAPTCHA expired');
          setRecaptchaVerifier(null);
        }
      });
      
      setRecaptchaVerifier(verifier);
      return verifier;
    } catch (error: any) {
      console.error('setupRecaptcha Error:', error);
      throw error;
    }
  };

  const signInWithPhone = async (phoneNumber: string, recaptchaContainerId: string = 'recaptcha-container') => {
    try {
      console.log('--- SignInWithPhone Start ---');
      
      // Clear any previous confirmation result to avoid stale state
      setConfirmationResult(null);
      
      let finalPhone = phoneNumber.replace(/\s+/g, '').replace(/[^0-9+]/g, '');
      if (!finalPhone.startsWith('+')) {
        finalPhone = `+${finalPhone}`;
      }
      
      if (finalPhone.length < 8) {
        throw new Error('رقم الهاتف غير صالح، يجب أن يبدأ بـ + ويتضمن مفتاح الدولة');
      }

      // Ensure we have a fresh verifier
      const verifier = await setupRecaptcha(recaptchaContainerId);
      if (!verifier) throw new Error('فشل تهيئة مدقق التحقق');
      
      console.log('Calling signInWithPhoneNumber with details:', {
        phone: finalPhone,
        verifierType: typeof verifier,
        isVerifierObject: !!verifier
      });
      const result = await signInWithPhoneNumber(auth, finalPhone, verifier);
      console.log('signInWithPhoneNumber Success');
      setConfirmationResult(result);
    } catch (error: any) {
      console.error('Phone Sign-In Error:', error);
      
      // Specialized cleanup for recaptcha errors
      if (error.code === 'auth/argument-error' || error.code === 'auth/invalid-app-credential') {
        console.log('Cleaning up verifier after specific error');
        if (recaptchaVerifier) {
          try { recaptchaVerifier.clear(); } catch(e) {}
        }
        setRecaptchaVerifier(null);
      }
      throw error;
    }
  };

  const verifyOtp = async (otp: string) => {
    try {
      console.log('--- verifyOtp Start ---');
      
      if (!otp) {
        throw new Error('يرجى إدخال رمز التحقق');
      }
      
      const trimmedOtp = otp.trim();
      if (trimmedOtp.length < 6) {
        throw new Error('رمز التحقق يجب أن يكون 6 أرقام');
      }
      
      if (!confirmationResult || typeof confirmationResult.confirm !== 'function') {
        console.error('confirmationResult is not valid:', confirmationResult);
        throw new Error('انتهت جلسة التحقق، يرجى إعادة طلب الرمز');
      }
      
      console.log('Attempting to confirm OTP');
      const result = await confirmationResult.confirm(trimmedOtp);
      console.log('Login successful, UID:', result.user?.uid);
      
      setConfirmationResult(null);
      return;
    } catch (error: any) {
      console.error('verifyOtp Error:', error);
      
      if (error.code === 'auth/invalid-verification-code') {
        throw new Error('رمز التحقق غير صحيح');
      }
      if (error.code === 'auth/code-expired') {
        throw new Error('انتهى مفعول رمز التحقق، اطلب رمزاً جديداً');
      }
      
      throw new Error(error.message || 'فشل التحقق من الرمز');
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
