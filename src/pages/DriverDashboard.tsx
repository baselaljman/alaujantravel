import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, setDoc, updateDoc, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { Trip, LiveLocation } from '../types';
import { MapPin, Navigation, Power, PowerOff, Users, Play, Pause, CheckCircle, Clock, AlertCircle, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { registerPlugin } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

// Define the background geolocation plugin interface
interface BackgroundGeolocationPlugin {
  addWatcher(options: any, callback: (location: any, error: any) => void): Promise<string>;
  removeWatcher(options: { id: string }): Promise<void>;
  openSettings(): Promise<void>;
}

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

export default function DriverDashboard() {
  const { user, profile } = useAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [passengers, setPassengers] = useState<any[]>([]);
  const watcherIdRef = React.useRef<string | null>(null);
  const lastSyncTimeRef = React.useRef<number>(0);
  const activeTripRef = React.useRef<Trip | null>(null);
  const userRef = React.useRef<any>(null);
  const [showBatteryWarning, setShowBatteryWarning] = useState(false);

  useEffect(() => {
    activeTripRef.current = activeTrip;
  }, [activeTrip]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    // Check if we are on Android to show battery warning
    const isAndroid = /Android/i.test(navigator.userAgent);
    if (isAndroid && isBroadcasting) {
      setShowBatteryWarning(true);
    }
  }, [isBroadcasting]);

  const openSettings = async () => {
    try {
      await BackgroundGeolocation.openSettings();
    } catch (err) {
      console.error('Could not open settings:', err);
    }
  };

  useEffect(() => {
    if (!user) return;
    
    // Fetch all trips assigned to this driver that are not completed or cancelled
    const q = query(
      collection(db, 'trips'), 
      where('driverId', '==', user.uid),
      where('status', 'in', ['scheduled', 'active', 'paused'])
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tripsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Trip));
      setTrips(tripsData);
      
      // Set active trip if any is currently 'active'
      const active = tripsData.find(t => t.status === 'active');
      setActiveTrip(active || null);
      if (active) {
        fetchPassengers(active.id);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'trips');
    });
    return unsubscribe;
  }, [user]);

  const fetchPassengers = async (tripId: string) => {
    try {
      const q = query(collection(db, 'bookings'), where('tripId', '==', tripId));
      const snap = await getDocs(q);
      setPassengers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'bookings');
    }
  };

  const updateTripStatus = async (tripId: string, status: Trip['status']) => {
    try {
      await updateDoc(doc(db, 'trips', tripId), { status });
      
      // Update associated parcels status automatically
      if (status === 'active' || status === 'completed') {
        const parcelsQuery = query(collection(db, 'parcels'), where('tripId', '==', tripId));
        const parcelsSnap = await getDocs(parcelsQuery);
        const newParcelStatus = status === 'active' ? 'shipped' : 'delivered';
        
        const updatePromises = parcelsSnap.docs.map(parcelDoc => 
          updateDoc(doc(db, 'parcels', parcelDoc.id), { status: newParcelStatus })
        );
        await Promise.all(updatePromises);
      }

      if (status === 'active') {
        // Manually update active trip locally to trigger tracking immediately
        const tripToStart = trips.find(t => t.id === tripId);
        if (tripToStart) {
          setActiveTrip({ ...tripToStart, status: 'active' });
        }
        setIsBroadcasting(true);
      } else if (status === 'completed' || status === 'cancelled') {
        setIsBroadcasting(false);
        setActiveTrip(null);
      }
    } catch (error) {
      console.error('Error updating trip status:', error);
    }
  };

  useEffect(() => {
    let watchId: number;

    const startTracking = async () => {
      if (!isBroadcasting || !activeTripRef.current || !userRef.current) return;

      const isNative = (window as any).Capacitor?.isNativePlatform();

      if (isNative) {
        try {
          const permissions = await Geolocation.requestPermissions();
          if (permissions.location !== 'granted') {
            alert('يرجى منح صلاحية الوصول للموقع لتمكين التتبع');
            return;
          }

          // Important: We only start the watcher once and use refs inside it
          if (!watcherIdRef.current) {
            console.log('Starting Background Watcher with aggressive settings...');
            watcherIdRef.current = await BackgroundGeolocation.addWatcher(
              {
                backgroundMessage: "يتم تتبع موقع الحافلة الآن لتزويد الركاب بالمعلومات. يرجى إبقاء التطبيق مفتوحاً في الخلفية.",
                backgroundTitle: "تتبع الموقع نشط - العوجان للسياحة",
                requestPermissions: true,
                stale: false,
                distanceFilter: 0, // Trigger on any movement
                interval: 5000,    // Hint 5s interval for Android
                fastestInterval: 3000,
                priority: 100,     // PRIORITY_HIGH_ACCURACY
                stopOnTerminate: false // Keep running even if app is swiped away
              },
              async (location: any, error: any) => {
                if (error) {
                  console.error('BG Watcher Error:', error);
                  return;
                }
                
                const currentTrip = activeTripRef.current;
                const currentUser = userRef.current;

                if (location && currentTrip && currentUser) {
                  const now = Date.now();
                  // Force sync every 10 seconds
                  if (now - lastSyncTimeRef.current >= 10000) {
                    const locationData: LiveLocation = {
                      driverId: currentUser.uid,
                      tripId: currentTrip.id,
                      lat: location.latitude,
                      lng: location.longitude,
                      lastUpdated: new Date().toISOString(),
                    };
                    
                    try {
                      // Note: Since offline persistence is disabled in firebase.ts,
                      // this write will only succeed if the device is currently online.
                      // It will NOT be stored to be sent later if offline.
                      await setDoc(doc(db, 'locations', currentTrip.id), locationData);
                      lastSyncTimeRef.current = now;
                      console.log(`[BG SYNC] ${new Date().toLocaleTimeString()}: ${location.latitude}, ${location.longitude}`);
                    } catch (err) {
                      console.error('BG Sync Error:', err);
                    }
                  }
                }
              }
            );
          }
        } catch (err) {
          console.error('Failed to start background tracking:', err);
        }
      } else {
        watchId = navigator.geolocation.watchPosition(
          async (pos) => {
            const now = Date.now();
            const currentTrip = activeTripRef.current;
            const currentUser = userRef.current;
            if (now - lastSyncTimeRef.current >= 10000 && currentTrip && currentUser) {
              const locationData: LiveLocation = {
                driverId: currentUser.uid,
                tripId: currentTrip.id,
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                lastUpdated: new Date().toISOString(),
              };
              await setDoc(doc(db, 'locations', currentTrip.id), locationData);
              lastSyncTimeRef.current = now;
            }
          },
          (err) => console.error('Geolocation error:', err),
          { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
      }
    };

    if (isBroadcasting) {
      startTracking();
    }

    return () => {
      if (watchId) navigator.geolocation.clearWatch(watchId);
      // We don't necessarily want to remove the watcher on every re-render
      // but we should clean up when broadcasting stops
      if (!isBroadcasting && watcherIdRef.current) {
        BackgroundGeolocation.removeWatcher({ id: watcherIdRef.current });
        watcherIdRef.current = null;
      }
    };
  }, [isBroadcasting, activeTrip?.id, user?.uid]); // Also depend on activeTrip to catch if it becomes available after broadcasting starts

  if (profile?.role !== 'driver') {
    return <div className="text-center py-20">عذراً، هذه الصفحة مخصصة للسائقين فقط.</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <AnimatePresence>
        {showBatteryWarning && (
          <motion.div 
            key="battery-warning"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-4 overflow-hidden"
          >
            <div className="flex gap-3">
              <AlertCircle className="text-amber-600 shrink-0" size={24} />
              <div className="space-y-2">
                <h4 className="font-bold text-amber-900">تنبيه هام لاستمرار التتبع</h4>
                <p className="text-sm text-amber-800 leading-relaxed">
                  لضمان عدم توقف التتبع عند إغلاق الشاشة، يرجى ضبط إعدادات البطارية للتطبيق على <strong>"غير مقيد" (Unrestricted)</strong>.
                </p>
                <div className="flex gap-3 mt-2">
                  <button 
                    onClick={openSettings}
                    className="bg-amber-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-amber-700 transition-colors"
                  >
                    فتح الإعدادات
                  </button>
                  <button 
                    onClick={() => setShowBatteryWarning(false)}
                    className="text-amber-600 text-xs font-bold"
                  >
                    فهمت ذلك
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">لوحة القائد</h1>
        {isBroadcasting && (
          <div className="flex items-center gap-2 bg-emerald-100 text-emerald-600 px-4 py-2 rounded-full text-xs font-bold animate-pulse">
            <div className="w-2 h-2 bg-emerald-600 rounded-full" />
            البث المباشر نشط
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Trips List */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Navigation size={20} className="text-emerald-600" />
            رحلاتي المجدولة
          </h2>
          
          <div className="space-y-4">
            {trips.length === 0 && (
              <div className="card text-center py-12 text-stone-400">
                لا توجد رحلات مجدولة حالياً.
              </div>
            )}
            {trips.map(trip => (
              <div key={trip.id} className={`card border-2 transition-all ${trip.status === 'active' ? 'border-emerald-500 shadow-lg' : 'border-stone-100'}`}>
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-bold text-lg">{trip.from} ← {trip.to}</h3>
                    <p className="text-xs text-stone-500">رقم التتبع: <span className="font-mono font-bold text-emerald-600">{trip.trackingNumber}</span></p>
                    <p className="text-xs text-stone-400 mt-1">{trip.date} - {trip.time}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${
                    trip.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                    trip.status === 'paused' ? 'bg-amber-100 text-amber-700' :
                    'bg-stone-100 text-stone-600'
                  }`}>
                    {trip.status === 'active' ? 'في الطريق' : 
                     trip.status === 'paused' ? 'متوقف مؤقتاً' : 
                     'مجدولة'}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {trip.status !== 'active' && (
                    <button 
                      onClick={() => updateTripStatus(trip.id, 'active')}
                      className="flex items-center justify-center gap-2 bg-emerald-600 text-white py-2 rounded-xl text-xs font-bold hover:bg-emerald-700 transition-colors"
                    >
                      <Play size={14} />
                      {trip.status === 'paused' ? 'استئناف' : 'بدء الرحلة'}
                    </button>
                  )}
                  {trip.status === 'active' && (
                    <button 
                      onClick={() => updateTripStatus(trip.id, 'paused')}
                      className="flex items-center justify-center gap-2 bg-amber-500 text-white py-2 rounded-xl text-xs font-bold hover:bg-amber-600 transition-colors"
                    >
                      <Pause size={14} />
                      توقف مؤقت
                    </button>
                  )}
                  <button 
                    onClick={() => updateTripStatus(trip.id, 'completed')}
                    className="flex items-center justify-center gap-2 bg-stone-800 text-white py-2 rounded-xl text-xs font-bold hover:bg-black transition-colors"
                  >
                    <CheckCircle size={14} />
                    إعلان وصول
                  </button>
                  <button 
                    onClick={() => fetchPassengers(trip.id)}
                    className="flex items-center justify-center gap-2 bg-stone-100 text-stone-600 py-2 rounded-xl text-xs font-bold hover:bg-stone-200 transition-colors"
                  >
                    <Users size={14} />
                    الركاب
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Active Trip Details & Passengers */}
        <div className="space-y-6">
          <div className="card bg-stone-900 text-white space-y-4">
            <h3 className="font-bold flex items-center gap-2">
              <Clock size={20} className="text-emerald-400" />
              الرحلة الحالية
            </h3>
            {activeTrip ? (
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-stone-400">من:</span>
                  <span className="font-bold">{activeTrip.from}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-stone-400">إلى:</span>
                  <span className="font-bold">{activeTrip.to}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-stone-400">رقم التتبع:</span>
                  <span className="font-mono text-emerald-400">{activeTrip.trackingNumber}</span>
                </div>
                <hr className="border-stone-800" />
                <div className="flex justify-between items-center">
                  <span className="text-xs text-stone-400">بث الموقع:</span>
                  <button 
                    onClick={() => setIsBroadcasting(!isBroadcasting)}
                    className={`p-2 rounded-lg transition-all ${isBroadcasting ? 'bg-emerald-500 text-white' : 'bg-stone-800 text-stone-500'}`}
                  >
                    {isBroadcasting ? <Power size={16} /> : <PowerOff size={16} />}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-stone-500 text-center py-4">لا توجد رحلة نشطة حالياً</p>
            )}
          </div>

          <div className="card space-y-4">
            <h3 className="font-bold flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Users size={20} className="text-emerald-600" />
                كشف الركاب ({passengers.length})
              </div>
              {activeTrip && (
                <span className="text-[10px] font-mono text-emerald-500 mr-7">رقم التتبع: {activeTrip.trackingNumber}</span>
              )}
            </h3>
            <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
              {passengers.map((p: any) => (
                <div key={p.id} className="flex flex-col gap-1 bg-stone-50 p-4 rounded-xl text-sm border border-stone-100">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-emerald-700">مقعد {p.seatNumber}</span>
                    <span className="text-xs bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full">مؤكد</span>
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <span className="font-bold">{p.passengerName}</span>
                    <span className="text-xs text-stone-500">{p.passengerPhone}</span>
                  </div>
                  <div className="flex justify-between items-center mt-1 pt-1 border-t border-stone-200">
                    <span className="text-[10px] text-stone-400 uppercase">رقم الجواز</span>
                    <span className="font-mono text-xs">{p.passportNumber || '---'}</span>
                  </div>
                </div>
              ))}
              {passengers.length === 0 && <p className="text-xs text-stone-400 text-center py-4">لا يوجد ركاب مسجلين بعد.</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
