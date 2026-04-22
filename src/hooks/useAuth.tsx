import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db, googleProvider, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, signInWithCredential, GoogleAuthProvider, sendPasswordResetEmail, RecaptchaVerifier, signInWithPhoneNumber, PhoneAuthProvider } from '../firebase';
import { onAuthStateChanged, signInWithPopup, signOut, User, ConfirmationResult } from 'firebase/auth';
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
  verifyOtp: (otp: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [verificationId, setVerificationId] = useState<string | null>(null);
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

  const signInWithPhone = async (phoneNumber: string, recaptchaContainerId?: string) => {
    try {
      setPendingPhoneNumber(phoneNumber);
      if (Capacitor.isNativePlatform()) {
        console.log('Attempting Native Phone Auth for:', phoneNumber);
        
        // Ensure we clear any old verification IDs and pending numbers
        setVerificationId(null);

        // Standard native phone auth using the capacitor plugin
        // The -39 error is usually a Firebase configuration issue (Identity Platform/App Check)
        const listener = await FirebaseAuthentication.addListener('phoneCodeSent', (event: any) => {
          console.log('Native phoneCodeSent event (ID captured):', event.verificationId);
          if (event.verificationId) {
            setVerificationId(event.verificationId);
          }
          listener.remove();
        });

        const errorListener = await FirebaseAuthentication.addListener('phoneVerificationFailed', (event: any) => {
          console.error('Native phoneVerificationFailed event:', event);
          let userMessage = 'فشل إرسال الكود: ' + (event.message || 'خطأ غير معروف.');
          
          if (event.message?.includes('39') || event.message?.includes('INTERNAL_ERROR')) {
            userMessage = 'خطأ فني (-39): يجب تفعيل "Identity Platform" و "App Check" في Firebase.';
          } else if (event.message?.includes('17028') || event.message?.includes('not authorized')) {
            userMessage = 'خطأ في هوية التطبيق (17028): بصمة SHA-256 غير متطابقة أو Play Integrity API غير مفعّل في Google Cloud.';
          }
          
          alert(userMessage);
          errorListener.remove();
        });

        await FirebaseAuthentication.signInWithPhoneNumber({
          phoneNumber,
        });
      } else {
        if (!recaptchaContainerId) throw new Error('Recaptcha container ID is required for web');
        
        const container = document.getElementById(recaptchaContainerId);
        if (!container) throw new Error(`Container with ID ${recaptchaContainerId} not found`);
        
        // Use a persistent widget ID to avoid re-creation issues
        const widgetId = 'recaptcha-widget-main';
        let widget = document.getElementById(widgetId);
        if (!widget) {
          widget = document.createElement('div');
          widget.id = widgetId;
          container.innerHTML = '';
          container.appendChild(widget);
        }

        const verifier = new RecaptchaVerifier(auth, widgetId, {
          size: 'invisible',
          callback: () => {
            console.log('reCAPTCHA solved');
          },
          'expired-callback': () => {
            console.warn('reCAPTCHA expired');
          }
        });
        
        // Explicitly render to ensure verifier is initialized
        await verifier.render();
        
        const result = await signInWithPhoneNumber(auth, phoneNumber, verifier);
        setConfirmationResult(result);
      }
    } catch (error: any) {
      console.error('Detailed Phone Sign-In Error:', error);
      const errorCode = error.code || '';
      const errorMessage = error.message || String(error);
      
      if (errorMessage.includes('not authorized') || errorMessage.includes('17028')) {
        throw new Error('هذا التطبيق غير مصرح له باستخدام Firebase. يرجى التأكد من إضافة بصمات SHA-1 و SHA-256 ومطابقة الـ Package Name في Firebase Console.');
      } else if (errorMessage.includes('unauthorized-domain')) {
        throw new Error('هذا النطاق غير مصرح به في Firebase Console.');
      } else if (errorMessage.includes('invalid-phone-number')) {
        throw new Error('رقم الهاتف المدخل غير صحيح.');
      } else if (errorMessage.includes('-39') || errorCode.includes('internal-error')) {
        throw new Error('خطأ في إعدادات نظام الحماية (Error -39). تأكد من: 1- تفعيل Identity Platform. 2- إضافة SHA-256. 3- إضافة الـ Debug Token الموضح في سجل Logcat إلى Firebase Console.');
      }
      
      throw new Error(errorMessage);
    }
  };

  const verifyOtp = async (otp: string) => {
    try {
      if (Capacitor.isNativePlatform()) {
        if (!verificationId) throw new Error('لم يتم العثور على رمز التحقق الأصلي.');
        
        console.log('Verifying native OTP using hybrid approach:', otp);
        
        // Strategy: Use the Web SDK to verify the credential using the ID from the native layer.
        // This ensures the JS auth state (onAuthStateChanged) is correctly updated.
        const credential = PhoneAuthProvider.credential(verificationId, otp);
        const userCredential = await signInWithCredential(auth, credential);
        
        console.log('Hybrid Verification Success. UID:', userCredential.user.uid);
      } else {
        if (!confirmationResult) throw new Error('Confirmation result not found');
        await confirmationResult.confirm(otp);
      }
    } catch (error: any) {
      console.error('OTP Verification Error (Full):', error);
      const errorMessage = error.message || '';
      
      if (errorMessage.includes('invalid-verification-code')) {
        throw new Error('كود التحقق غير صحيح.');
      } else if (errorMessage.includes('session-expired')) {
        throw new Error('انتهت صلاحية الجلسة، اطلب كوداً جديداً.');
      }
      
      throw new Error('كود التحقق غير صحيح أو انتهت صلاحيته.');
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, login, loginWithEmail, registerWithEmail, resetPassword, signInWithPhone, verifyOtp, logout }}>
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
