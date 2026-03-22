import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, or } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { Booking, Trip } from '../types';
import { Calendar, MapPin, Ticket, User } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Profile() {
  const { user, profile } = useAuth();
  const [bookings, setBookings] = useState<(Booking & { trip?: Trip })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    // Query bookings by userId OR passengerEmail
    const q = query(
      collection(db, 'bookings'),
      or(
        where('userId', '==', user.uid),
        where('passengerEmail', '==', user.email)
      )
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const bookingsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking));
      
      // Fetch trip details for each booking
      const bookingsWithTrips = await Promise.all(bookingsData.map(async (booking) => {
        // We can optimize this by fetching trips in a separate listener or cache
        // For now, let's just get the trip data if possible
        // Note: In a real app, you'd probably want to fetch trips in bulk
        return { ...booking };
      }));

      // To get trip details, we need another listener or a different approach
      // Let's fetch all trips and match them
      setBookings(bookingsWithTrips);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'bookings');
      setLoading(false);
    });

    return unsubscribe;
  }, [user]);

  const [trips, setTrips] = useState<Record<string, Trip>>({});
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'trips'), (snapshot) => {
      const tripsMap: Record<string, Trip> = {};
      snapshot.docs.forEach(doc => {
        tripsMap[doc.id] = { id: doc.id, ...doc.data() } as Trip;
      });
      setTrips(tripsMap);
    });
    return unsubscribe;
  }, []);

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <User size={64} className="text-stone-300" />
        <h2 className="text-xl font-bold">يرجى تسجيل الدخول لعرض حجوزاتك</h2>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center gap-4">
        <div className="bg-emerald-100 p-4 rounded-full text-emerald-600">
          <User size={32} />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{profile?.displayName || 'مستخدم'}</h1>
          <p className="text-stone-500 text-sm">{user.email}</p>
        </div>
      </div>

      <section className="space-y-4">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Ticket className="text-emerald-600" />
          حجوزاتي
        </h2>

        {loading ? (
          <div className="text-center py-12 text-stone-400">جاري تحميل الحجوزات...</div>
        ) : bookings.length === 0 ? (
          <div className="card text-center py-12 text-stone-500">
            لا توجد حجوزات مرتبطة بحسابك حالياً.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {bookings.sort((a, b) => new Date(b.bookingDate).getTime() - new Date(a.bookingDate).getTime()).map(booking => {
              const trip = trips[booking.tripId];
              return (
                <motion.div 
                  key={booking.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="card flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
                >
                  <div className="flex gap-4 items-center">
                    <div className="bg-stone-100 p-3 rounded-xl text-stone-600">
                      <Calendar size={20} />
                    </div>
                    <div>
                      <h3 className="font-bold">
                        {trip ? `${trip.from} ← ${trip.to}` : 'رحلة غير معروفة'}
                      </h3>
                      <p className="text-xs text-stone-500">
                        {trip ? `${trip.date} - ${trip.time}` : ''}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap gap-4 items-center">
                    <div className="text-right">
                      <p className="text-[10px] text-stone-400 uppercase">الراكب</p>
                      <p className="text-sm font-bold">{booking.passengerName}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-stone-400 uppercase">رقم الجواز</p>
                      <p className="text-sm font-bold">{booking.passportNumber || '---'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-stone-400 uppercase">المقعد</p>
                      <p className="text-sm font-bold">{booking.seatNumber}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-stone-400 uppercase">الحالة</p>
                      <span className={`text-[10px] px-2 py-1 rounded-full font-bold ${
                        booking.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-600'
                      }`}>
                        {booking.status === 'confirmed' ? 'مؤكد' : booking.status}
                      </span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
