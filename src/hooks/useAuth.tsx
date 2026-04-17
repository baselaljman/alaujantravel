import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db, googleProvider, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, signInWithCredential, GoogleAuthProvider, sendPasswordResetEmail } from '../firebase';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, getDocs, deleteDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { UserProfile } from '../types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  login: () => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  registerWithEmail: (email: string, pass: string, name: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

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
            // Check if there's a pre-created profile by email
            const userEmail = user.email?.toLowerCase() || '';
            const q = query(collection(db, 'users'), where('email', '==', userEmail));
            const querySnapshot = await getDocs(q);
            
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

  const login = async () => {
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
    } catch (error) {
      console.error('Login Error:', error);
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

  return (
    <AuthContext.Provider value={{ user, profile, loading, login, loginWithEmail, registerWithEmail, resetPassword, logout }}>
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
