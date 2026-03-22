import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, getDocs, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Parcel, LiveLocation, Trip } from '../types';
import { Package, MapPin, Search, Truck, CheckCircle, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';

// Fix for default marker icon in Leaflet
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

function MapUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
}

export default function TrackingPage() {
  const [trackingNumber, setTrackingNumber] = useState('');
  const [parcel, setParcel] = useState<Parcel | null>(null);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [liveLocation, setLiveLocation] = useState<LiveLocation | null>(null);
  const [activeTrips, setActiveTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'trips'), where('status', '==', 'active'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setActiveTrips(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Trip)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'trips');
    });
    return unsubscribe;
  }, []);

  const handleTrack = async () => {
    if (!trackingNumber.trim()) return;
    setLoading(true);
    setError('');
    setParcel(null);
    setTrip(null);
    setLiveLocation(null);

    try {
      // Search in parcels
      const parcelQuery = query(collection(db, 'parcels'), where('trackingNumber', '==', trackingNumber.trim()));
      const parcelSnap = await getDocs(parcelQuery);
      
      if (!parcelSnap.empty) {
        setParcel({ id: parcelSnap.docs[0].id, ...parcelSnap.docs[0].data() } as Parcel);
      } else {
        // Search in trips
        const tripQuery = query(collection(db, 'trips'), where('trackingNumber', '==', trackingNumber.trim()));
        const tripSnap = await getDocs(tripQuery);
        
        if (!tripSnap.empty) {
          const tripData = { id: tripSnap.docs[0].id, ...tripSnap.docs[0].data() } as Trip;
          setTrip(tripData);
          if (tripData.status === 'active') {
            trackTrip(tripData.id);
          }
        } else {
          setError('رقم التتبع غير صحيح أو غير موجود.');
        }
      }
    } catch (err) {
      setError('حدث خطأ أثناء البحث.');
    } finally {
      setLoading(false);
    }
  };

  const trackTrip = (tripId: string) => {
    const locationRef = doc(db, 'locations', tripId);
    onSnapshot(locationRef, (snapshot) => {
      if (snapshot.exists()) {
        setLiveLocation(snapshot.data() as LiveLocation);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `locations/${tripId}`);
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-12">
      {/* Universal Tracking */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Search className="text-emerald-600" />
          تتبع الرحلات والطرود
        </h2>
        <div className="card flex gap-4">
          <input
            type="text"
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
            placeholder="أدخل رقم تتبع الرحلة (wa001) أو الطرد (AWJ-1234)"
            className="flex-1 bg-stone-100 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button onClick={handleTrack} className="btn-primary flex items-center gap-2">
            <Search size={20} />
            تتبع
          </button>
        </div>

        <AnimatePresence>
          {loading && <p className="text-center text-stone-500">جاري البحث...</p>}
          {error && <p className="text-center text-red-500">{error}</p>}
          
          {parcel && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="card border-2 border-emerald-500 space-y-6"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-lg">طرد من {parcel.from} إلى {parcel.to}</h3>
                  <p className="text-sm text-stone-500">رقم التتبع: {parcel.trackingNumber}</p>
                </div>
                <div className={`px-4 py-1 rounded-full text-xs font-bold ${
                  parcel.status === 'delivered' ? 'bg-emerald-100 text-emerald-600' :
                  parcel.status === 'shipped' ? 'bg-blue-100 text-blue-600' : 'bg-stone-100 text-stone-600'
                }`}>
                  {parcel.status === 'delivered' ? 'تم التسليم' : parcel.status === 'shipped' ? 'قيد الشحن' : 'بانتظار الشحن'}
                </div>
              </div>

              {/* Progress Bar */}
              <div className="relative flex justify-between items-center px-4">
                <div className="absolute top-1/2 left-0 w-full h-1 bg-stone-200 -translate-y-1/2 z-0" />
                <div className={`absolute top-1/2 left-0 h-1 bg-emerald-500 -translate-y-1/2 z-0 transition-all duration-1000 ${
                  parcel.status === 'delivered' ? 'w-full' : parcel.status === 'shipped' ? 'w-1/2' : 'w-0'
                }`} />
                {[
                  { icon: Clock, label: 'تم الاستلام' },
                  { icon: Truck, label: 'في الطريق' },
                  { icon: CheckCircle, label: 'تم التسليم' },
                ].map((step, idx) => (
                  <div key={idx} className="relative z-10 flex flex-col items-center gap-2">
                    <div className={`p-2 rounded-full ${
                      (idx === 0) || (idx === 1 && parcel.status !== 'pending') || (idx === 2 && parcel.status === 'delivered')
                        ? 'bg-emerald-500 text-white' : 'bg-stone-200 text-stone-400'
                    }`}>
                      <step.icon size={16} />
                    </div>
                    <span className="text-[10px] font-bold">{step.label}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {trip && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="card border-2 border-emerald-500 space-y-6"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-lg">رحلة {trip.from} ← {trip.to}</h3>
                  <p className="text-sm text-stone-500">رقم التتبع: <span className="font-mono font-bold text-emerald-600">{trip.trackingNumber}</span></p>
                </div>
                <div className={`px-4 py-1 rounded-full text-xs font-bold ${
                  trip.status === 'active' ? 'bg-emerald-100 text-emerald-600' :
                  trip.status === 'paused' ? 'bg-amber-100 text-amber-600' :
                  trip.status === 'completed' ? 'bg-blue-100 text-blue-600' : 'bg-stone-100 text-stone-600'
                }`}>
                  {trip.status === 'active' ? 'في الطريق الآن' : 
                   trip.status === 'paused' ? 'متوقفة مؤقتاً' : 
                   trip.status === 'completed' ? 'وصلت الوجهة' : 'مجدولة'}
                </div>
              </div>

              {trip.status === 'active' && liveLocation ? (
                <div className="card p-0 overflow-hidden h-96 relative">
                  <MapContainer 
                    center={[liveLocation.lat, liveLocation.lng]} 
                    zoom={13} 
                    scrollWheelZoom={false}
                    className="h-full w-full z-0"
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <Marker position={[liveLocation.lat, liveLocation.lng]}>
                      <Popup>
                        <div className="text-right">
                          <p className="font-bold">موقع الحافلة الحالي</p>
                          <p className="text-xs text-stone-500">آخر تحديث: {new Date(liveLocation.lastUpdated).toLocaleTimeString('ar-SA')}</p>
                        </div>
                      </Popup>
                    </Marker>
                    <MapUpdater center={[liveLocation.lat, liveLocation.lng]} />
                  </MapContainer>
                  <div className="absolute top-4 right-4 z-10 bg-white/90 backdrop-blur p-3 rounded-xl shadow-lg border border-stone-100">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                      <p className="text-xs font-bold text-stone-700">بث مباشر نشط</p>
                    </div>
                  </div>
                </div>
              ) : trip.status === 'active' ? (
                <div className="bg-stone-100 p-8 rounded-2xl text-center space-y-2">
                  <Clock size={32} className="mx-auto text-stone-400 animate-spin" />
                  <p className="text-sm text-stone-500">بانتظار استقبال إشارة الـ GPS من الحافلة...</p>
                </div>
              ) : (
                <div className="bg-stone-50 p-6 rounded-2xl text-center">
                  <p className="text-sm text-stone-500">تتبع الموقع المباشر متاح فقط عندما تكون الرحلة "في الطريق".</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* Active Trips Quick List */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <MapPin className="text-emerald-600" />
          الرحلات النشطة الآن
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {activeTrips.length === 0 && <p className="text-stone-500 col-span-2">لا توجد رحلات نشطة حالياً.</p>}
          {activeTrips.map(trip => (
            <div key={trip.id} className="card flex justify-between items-center hover:border-emerald-500 transition-colors cursor-pointer" onClick={() => { setTrackingNumber(trip.trackingNumber || ''); handleTrack(); }}>
              <div>
                <h3 className="font-bold">{trip.from} ← {trip.to}</h3>
                <p className="text-xs text-stone-400">رقم التتبع: {trip.trackingNumber}</p>
              </div>
              <div className="text-emerald-600 font-bold text-sm">تتبع</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
