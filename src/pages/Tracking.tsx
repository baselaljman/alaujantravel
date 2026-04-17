import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, getDocs, doc, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Parcel, LiveLocation, Trip } from '../types';
import { Link } from 'react-router-dom';
import { Package, MapPin, Search, Truck, CheckCircle, Clock, Moon } from 'lucide-react';
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

const AujanIcon = L.divIcon({
  html: `
    <div style="display: flex; flex-direction: column; align-items: center;">
      <div style="width: 40px; height: 40px; border-radius: 50%; border: 2px solid #059669; background: white; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); overflow: hidden; display: flex; align-items: center; justify-content: center;">
        <img 
          src="https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0226720471.firebasestorage.app/o/logoaujan.png?alt=media" 
          referrerPolicy="no-referrer"
          style="width: 32px; height: 32px; object-fit: contain;" 
        />
      </div>
      <div style="background: #059669; color: white; font-size: 10px; font-weight: bold; padding: 2px 8px; border-radius: 9999px; margin-top: 4px; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05); white-space: nowrap;">
        العوجان
      </div>
    </div>
  `,
  className: '',
  iconSize: [40, 60],
  iconAnchor: [20, 50],
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
  const unsubscribeRef = React.useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, []);
  const [activeTrips, setActiveTrips] = useState<Trip[]>([]);
  const [scheduledTrips, setScheduledTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const qActive = query(collection(db, 'trips'), where('status', '==', 'active'));
    const unsubscribeActive = onSnapshot(qActive, (snapshot) => {
      const trips = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Trip));
      trips.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
      setActiveTrips(trips);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'trips');
    });

    const qScheduled = query(collection(db, 'trips'), where('status', '==', 'scheduled'));
    const unsubscribeScheduled = onSnapshot(qScheduled, (snapshot) => {
      const trips = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Trip));
      trips.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
      setScheduledTrips(trips);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'trips');
    });

    return () => {
      unsubscribeActive();
      unsubscribeScheduled();
    };
  }, []);

  const flattenedScheduledTrips = React.useMemo(() => {
    const result: Trip[] = [];
    scheduledTrips.forEach(trip => {
      // Add intermediate stops as independent trips
      if (trip.stops && Array.isArray(trip.stops) && trip.stops.length > 0) {
        trip.stops.forEach((stop, index) => {
          result.push({
            ...trip,
            id: `${trip.id}-stop-${index}`,
            to: stop.cityName,
            priceSAR: stop.priceSAR,
            priceSYP: stop.priceSYP,
            isStop: true,
            originalTripId: trip.id
          } as Trip);
        });
      }
      // Add the main destination
      result.push(trip);
    });
    return result;
  }, [scheduledTrips]);

  const handleTrack = async () => {
    if (!trackingNumber.trim()) return;
    setLoading(true);
    setError('');
    setParcel(null);
    setTrip(null);
    setLiveLocation(null);

    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    try {
      // Search in both collections simultaneously
      const [parcelSnap, tripSnap] = await Promise.all([
        getDocs(query(collection(db, 'parcels'), 
          where('waybillNumber', '==', trackingNumber.trim())
        )),
        getDocs(query(collection(db, 'trips'), where('trackingNumber', '==', trackingNumber.trim())))
      ]);

      // If no parcel found by waybillNumber, try searching by trip trackingNumber
      let parcelDocs = parcelSnap.docs;
      if (parcelSnap.empty) {
        const parcelByTripSnap = await getDocs(query(collection(db, 'parcels'), 
          where('trackingNumber', '==', trackingNumber.trim())
        ));
        parcelDocs = parcelByTripSnap.docs;
      }
      
      let foundParcel: Parcel | null = null;
      let foundTrip: Trip | null = null;

      if (parcelDocs.length > 0) {
        foundParcel = { id: parcelDocs[0].id, ...parcelDocs[0].data() } as Parcel;
        setParcel(foundParcel);
      }

      if (!tripSnap.empty) {
        foundTrip = { id: tripSnap.docs[0].id, ...tripSnap.docs[0].data() } as Trip;
        setTrip(foundTrip);
      } else if (foundParcel && foundParcel.tripId) {
        // If parcel found but trip not found by tracking number, fetch trip by ID
        const tripDoc = await getDoc(doc(db, 'trips', foundParcel.tripId));
        if (tripDoc.exists()) {
          foundTrip = { id: tripDoc.id, ...tripDoc.data() } as Trip;
          setTrip(foundTrip);
        }
      }

      if (foundTrip && foundTrip.status === 'active') {
        trackTrip(foundTrip.id);
      }

      if (!foundParcel && !foundTrip) {
        setError('رقم التتبع غير صحيح أو غير موجود.');
      }
    } catch (err) {
      console.error('Tracking error:', err);
      setError('حدث خطأ أثناء البحث.');
    } finally {
      setLoading(false);
    }
  };

  const trackTrip = (tripId: string) => {
    const locationRef = doc(db, 'locations', tripId);
    unsubscribeRef.current = onSnapshot(locationRef, (snapshot) => {
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
          تتبع الطرد والرحلات
        </h2>
        <div className="card flex gap-4">
          <input
            type="text"
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
            placeholder="أدخل رقم تتبع الرحلة (wa001) أو رقم بوليصة الشحن (00001)"
            className="flex-1 bg-stone-100 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button onClick={handleTrack} className="btn-primary flex items-center gap-2">
            <Search size={20} />
            تتبع
          </button>
        </div>

        <AnimatePresence mode="wait">
          {loading && <p key="loading" className="text-center text-stone-500">جاري البحث...</p>}
          {error && <p key="error" className="text-center text-red-500">{error}</p>}
          
          {trip && (
            <motion.div 
              key={`trip-${trip.id}`}
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
                    <Marker position={[liveLocation.lat, liveLocation.lng]} icon={AujanIcon}>
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

          {parcel && (
            <motion.div 
              key={`parcel-${parcel.id}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="card border-2 border-emerald-500 space-y-6"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-lg">طرد من {parcel.from} إلى {parcel.to}</h3>
                  <p className="text-sm text-stone-500">رقم بوليصة الشحن: {parcel.waybillNumber}</p>
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

      {/* Scheduled Trips Quick List */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Clock className="text-emerald-600" />
          الرحلات المجدولة القادمة
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {flattenedScheduledTrips.length === 0 && <p className="text-stone-500 col-span-2">لا توجد رحلات مجدولة حالياً.</p>}
          {flattenedScheduledTrips.map(trip => (
            <div 
              key={trip.id} 
              className={`card flex justify-between items-center transition-all ${
                trip.tripType === 'umrah' 
                  ? 'border-2 border-amber-400 bg-amber-50/30' 
                  : 'hover:border-emerald-500'
              }`}
            >
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold">{trip.from} ← {trip.to}</h3>
                  {trip.tripType === 'umrah' && (
                    <span className="text-[10px] bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                      <Moon size={10} />
                      رحلة عمرة
                    </span>
                  )}
                </div>
                <p className="text-xs text-stone-500 mt-1">
                  {new Date(trip.date).toLocaleDateString('ar-SA', { weekday: 'long', day: 'numeric', month: 'long' })} - {trip.time}
                </p>
              </div>
              <div className="text-right">
                <p className={`font-bold text-sm ${trip.tripType === 'umrah' ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {trip.priceSAR || trip.price} ريال
                </p>
                <Link 
                  to={`/booking?from=${trip.from}&to=${trip.to}&date=${trip.date}&type=${trip.tripType || 'international'}`}
                  className="text-[10px] text-stone-400 hover:text-emerald-600 underline"
                >
                  حجز الآن
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
