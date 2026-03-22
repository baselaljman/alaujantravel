import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, setDoc, updateDoc, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { Trip, LiveLocation } from '../types';
import { MapPin, Navigation, Power, PowerOff, Users, Play, Pause, CheckCircle, Clock } from 'lucide-react';
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
  const latestLocationRef = React.useRef<{ lat: number; lng: number } | null>(null);

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
    const q = query(collection(db, 'bookings'), where('tripId', '==', tripId));
    const snap = await getDocs(q);
    setPassengers(snap.docs.map(doc => doc.data()));
  };

  const updateTripStatus = async (tripId: string, status: Trip['status']) => {
    try {
      await updateDoc(doc(db, 'trips', tripId), { status });
      if (status === 'active') {
        setIsBroadcasting(true);
      } else if (status === 'completed' || status === 'cancelled') {
        setIsBroadcasting(false);
      }
    } catch (error) {
      console.error('Error updating trip status:', error);
    }
  };

  useEffect(() => {
    let watchId: number;
    let syncInterval: NodeJS.Timeout;

    const startTracking = async () => {
      if (!isBroadcasting || !activeTrip || !user) return;

      // 1. Start the Sync Interval (Every 10 seconds)
      syncInterval = setInterval(async () => {
        if (latestLocationRef.current && activeTrip && user) {
          const locationData: LiveLocation = {
            driverId: user.uid,
            tripId: activeTrip.id,
            lat: latestLocationRef.current.lat,
            lng: latestLocationRef.current.lng,
            lastUpdated: new Date().toISOString(),
          };
          try {
            await setDoc(doc(db, 'locations', activeTrip.id), locationData);
            console.log('Location synced to Firestore (10s interval)');
          } catch (err) {
            console.error('Error syncing location:', err);
          }
        }
      }, 10000);

      // 2. Start GPS Watcher
      const isNative = (window as any).Capacitor?.isNativePlatform();

      if (isNative) {
        try {
          const permissions = await Geolocation.requestPermissions();
          if (permissions.location !== 'granted') {
            alert('يرجى منح صلاحية الوصول للموقع لتمكين التتبع');
            return;
          }

          watcherIdRef.current = await BackgroundGeolocation.addWatcher(
            {
              backgroundMessage: "يتم تتبع موقع الحافلة الآن لتزويد الركاب بالمعلومات",
              backgroundTitle: "تتبع الموقع نشط",
              requestPermissions: true,
              stale: false,
              distanceFilter: 5 // Get updates every 5 meters to keep buffer fresh
            },
            (location, error) => {
              if (error) {
                console.error('Background Geolocation error:', error);
                return;
              }
              if (location) {
                latestLocationRef.current = {
                  lat: location.latitude,
                  lng: location.longitude
                };
              }
            }
          );
        } catch (err) {
          console.error('Failed to start background tracking:', err);
        }
      } else {
        watchId = navigator.geolocation.watchPosition(
          (pos) => {
            latestLocationRef.current = {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude
            };
          },
          (err) => console.error('Geolocation error:', err),
          { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
      }
    };

    startTracking();

    return () => {
      if (watchId) navigator.geolocation.clearWatch(watchId);
      if (syncInterval) clearInterval(syncInterval);
      if (watcherIdRef.current) {
        BackgroundGeolocation.removeWatcher({ id: watcherIdRef.current });
        watcherIdRef.current = null;
      }
    };
  }, [isBroadcasting, activeTrip, user]);

  if (profile?.role !== 'driver') {
    return <div className="text-center py-20">عذراً، هذه الصفحة مخصصة للسائقين فقط.</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
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
            <h3 className="font-bold flex items-center gap-2">
              <Users size={20} className="text-emerald-600" />
              كشف الركاب ({passengers.length})
            </h3>
            <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
              {passengers.map((p, idx) => (
                <div key={idx} className="flex flex-col gap-1 bg-stone-50 p-4 rounded-xl text-sm border border-stone-100">
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
