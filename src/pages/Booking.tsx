import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, addDoc, doc, updateDoc, getDoc, arrayUnion } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Trip, Booking } from '../types';
import { useAuth } from '../hooks/useAuth';
import { Calendar, Users, CheckCircle, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import html2canvas from 'html2canvas';

import { useSearchParams } from 'react-router-dom';

export default function BookingPage() {
  const { user, profile, login } = useAuth();
  const [searchParams] = useSearchParams();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [filteredTrips, setFilteredTrips] = useState<Trip[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [selectedSeats, setSelectedSeats] = useState<number[]>([]);
  const [step, setStep] = useState<'trips' | 'seats' | 'passengers' | 'contact' | 'payment' | 'success'>('trips');
  const [passengers, setPassengers] = useState<{ name: string; passport: string }[]>([]);
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'online' | 'later'>('online');
  const [loading, setLoading] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState<Booking[]>([]);

  const formatDateArabic = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      return date.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    } catch (e) {
      return dateStr;
    }
  };

  useEffect(() => {
    const q = query(collection(db, 'trips'), where('status', '==', 'scheduled'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tripsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Trip));
      setTrips(tripsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'trips');
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const date = searchParams.get('date');

    let filtered = trips;
    if (from) filtered = filtered.filter(t => t.from === from);
    if (to) filtered = filtered.filter(t => t.to === to);
    if (date) filtered = filtered.filter(t => t.date === date);
    
    setFilteredTrips(filtered);

    // Update selectedTrip if it's in the new list
    if (selectedTrip) {
      const updated = trips.find(t => t.id === selectedTrip.id);
      if (updated) setSelectedTrip(updated);
    }
  }, [trips, searchParams]);

  const [bookedSeats, setBookedSeats] = useState<number[]>([]);

  useEffect(() => {
    if (selectedTrip) {
      setBookedSeats(selectedTrip.bookedSeats || []);
    }
  }, [selectedTrip]);

  const handleBooking = async () => {
    if (!selectedTrip || selectedSeats.length === 0) return;
    setLoading(true);
    try {
      // Final check for seat availability right before booking
      const tripSnap = await getDoc(doc(db, 'trips', selectedTrip.id));
      if (!tripSnap.exists()) throw new Error('الرحلة غير موجودة');
      const latestBookedSeats = tripSnap.data().bookedSeats || [];
      const conflict = selectedSeats.filter(s => latestBookedSeats.includes(s));
      
      if (conflict.length > 0) {
        alert(`عذراً، المقاعد التالية تم حجزها قبل لحظات: ${conflict.join(', ')}. يرجى اختيار مقاعد أخرى.`);
        setSelectedSeats(selectedSeats.filter(s => !conflict.includes(s)));
        setStep('seats');
        setLoading(false);
        return;
      }

      const bookings: Booking[] = [];
      const tripRef = doc(db, 'trips', selectedTrip.id);

      for (let i = 0; i < selectedSeats.length; i++) {
        const bookingData: any = {
          tripId: selectedTrip.id,
          seatNumber: selectedSeats[i],
          status: paymentMethod === 'online' ? 'confirmed' : 'pending',
          paymentMethod: paymentMethod,
          bookingDate: new Date().toISOString(),
          userId: user ? user.uid : 'guest',
          passengerName: passengers[i].name || 'مسافر',
          passengerPhone: contactPhone || '',
          passengerEmail: contactEmail || (user?.email || ''),
          passportNumber: passengers[i].passport || '',
        };

        const docRef = await addDoc(collection(db, 'bookings'), bookingData);
        bookings.push({ id: docRef.id, ...bookingData } as Booking);
      }
      
      // Update trip available seats and bookedSeats array
      await updateDoc(tripRef, {
        availableSeats: Math.max(0, (selectedTrip.availableSeats || 0) - selectedSeats.length),
        bookedSeats: arrayUnion(...selectedSeats)
      });

      setBookingSuccess(bookings);
      setStep('success');
    } catch (error) {
      console.error("Booking error:", error);
      alert('حدث خطأ أثناء الحجز، يرجى المحاولة مرة أخرى.');
    } finally {
      setLoading(false);
    }
  };

  const toggleSeat = (seatNum: number) => {
    if (selectedSeats.includes(seatNum)) {
      setSelectedSeats(selectedSeats.filter(s => s !== seatNum));
    } else {
      if (selectedSeats.length < (selectedTrip?.availableSeats || 0)) {
        setSelectedSeats([...selectedSeats, seatNum]);
      } else {
        alert('لا يمكنك اختيار مقاعد أكثر من المتاحة');
      }
    }
  };

  const goToPassengers = () => {
    if (selectedSeats.length === 0) return;
    
    // Double check if any selected seat was booked by someone else in the meantime
    const alreadyBooked = selectedSeats.filter(s => bookedSeats.includes(s));
    if (alreadyBooked.length > 0) {
      alert(`عذراً، المقاعد التالية تم حجزها للتو: ${alreadyBooked.join(', ')}. يرجى اختيار مقاعد أخرى.`);
      setSelectedSeats(selectedSeats.filter(s => !alreadyBooked.includes(s)));
      return;
    }

    const initialPassengers = selectedSeats.map((_, i) => ({
      name: passengers[i]?.name || (i === 0 && user ? profile?.displayName || '' : ''),
      passport: passengers[i]?.passport || ''
    }));
    setPassengers(initialPassengers);
    setStep('passengers');
  };

  const goToContact = () => {
    if (passengers.some(p => !p.name || !p.passport)) {
      alert('يرجى إكمال بيانات جميع الركاب');
      return;
    }
    setStep('contact');
  };

  const downloadTicket = async () => {
    const element = document.getElementById('ticket-preview');
    if (!element) return;
    const canvas = await html2canvas(element);
    const link = document.createElement('a');
    link.download = `ticket-${bookingSuccess?.id}.png`;
    link.href = canvas.toDataURL();
    link.click();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <h1 className="text-3xl font-bold text-center">حجز رحلة دولية</h1>

      {step === 'trips' ? (
        <div className="grid grid-cols-1 gap-4">
          {filteredTrips.length === 0 && <p className="text-center text-stone-500">لا توجد رحلات تطابق بحثك حالياً.</p>}
          {filteredTrips.map(trip => (
            <motion.div 
              key={trip.id}
              whileHover={{ scale: 1.01 }}
              onClick={() => { setSelectedTrip(trip); setStep('seats'); }}
              className="card cursor-pointer hover:border-emerald-500 transition-colors flex justify-between items-center"
            >
              <div className="flex gap-6 items-center">
                <div className="bg-emerald-100 p-4 rounded-2xl text-emerald-600">
                  <Calendar size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-lg">{trip.from} ← {trip.to}</h3>
                  <p className="text-sm text-stone-500">{formatDateArabic(trip.date)} - {trip.time}</p>
                </div>
              </div>
              <div className="text-left">
                <p className="text-emerald-600 font-black text-xl">{trip.price} ريال</p>
                <p className="text-xs text-stone-400">حافلة رقم {trip.busNumber}</p>
              </div>
            </motion.div>
          ))}
        </div>
      ) : step === 'seats' && selectedTrip ? (
        <div className="space-y-6">
          <button onClick={() => setStep('trips')} className="text-emerald-600 font-bold mb-4">← العودة للرحلات</button>
          
          <div className="card grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h3 className="font-bold mb-4">اختر مقاعدك ({selectedSeats.length})</h3>
              <div className="grid grid-cols-4 gap-3">
                {Array.from({ length: selectedTrip.totalSeats || 45 }).map((_, i) => {
                  const seatNum = i + 1;
                  const isBooked = bookedSeats.includes(seatNum);
                  const isSelected = selectedSeats.includes(seatNum);
                  return (
                    <button
                      key={seatNum}
                      disabled={isBooked}
                      onClick={() => toggleSeat(seatNum)}
                      className={`h-10 rounded-lg flex items-center justify-center text-xs font-bold transition-all ${
                        isBooked ? 'bg-stone-200 text-stone-400 cursor-not-allowed' :
                        isSelected ? 'bg-emerald-600 text-white scale-110' :
                        'bg-white border-2 border-emerald-100 text-emerald-600 hover:border-emerald-500'
                      }`}
                    >
                      {seatNum}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bg-stone-50 p-6 rounded-2xl space-y-4">
              <h3 className="font-bold">ملخص الاختيار</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span>الوجهة:</span><span className="font-bold">{selectedTrip.from} إلى {selectedTrip.to}</span></div>
                <div className="flex justify-between"><span>التاريخ:</span><span className="font-bold">{formatDateArabic(selectedTrip.date)}</span></div>
                <div className="flex justify-between"><span>المقاعد:</span><span className="font-bold">{selectedSeats.length > 0 ? selectedSeats.join(', ') : 'لم يتم الاختيار'}</span></div>
                <hr />
                <div className="flex justify-between text-lg"><span>الإجمالي:</span><span className="font-black text-emerald-600">{selectedTrip.price * selectedSeats.length} ريال</span></div>
              </div>
              <button 
                disabled={selectedSeats.length === 0}
                onClick={goToPassengers}
                className="btn-primary w-full mt-4 disabled:opacity-50"
              >
                التالي: بيانات الركاب
              </button>
            </div>
          </div>
        </div>
      ) : step === 'passengers' && selectedTrip ? (
        <div className="space-y-6">
          <button onClick={() => setStep('seats')} className="text-emerald-600 font-bold mb-4">← العودة لاختيار المقاعد</button>
          <div className="card space-y-6">
            <h3 className="font-bold text-xl">بيانات الركاب</h3>
            {selectedSeats.map((seat, index) => (
              <div key={seat} className="p-4 border border-stone-100 rounded-2xl space-y-4">
                <h4 className="font-bold text-emerald-600">المقعد رقم {seat}</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs text-stone-500">اسم الراكب</label>
                    <input 
                      type="text" 
                      placeholder="الاسم الكامل" 
                      value={passengers[index]?.name || ''}
                      onChange={(e) => {
                        const newPassengers = [...passengers];
                        newPassengers[index] = { ...newPassengers[index], name: e.target.value };
                        setPassengers(newPassengers);
                      }}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-stone-500">رقم الجواز</label>
                    <input 
                      type="text" 
                      placeholder="رقم الجواز" 
                      value={passengers[index]?.passport || ''}
                      onChange={(e) => {
                        const newPassengers = [...passengers];
                        newPassengers[index] = { ...newPassengers[index], passport: e.target.value };
                        setPassengers(newPassengers);
                      }}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                </div>
              </div>
            ))}
            <button 
              onClick={goToContact}
              className="btn-primary w-full"
            >
              التالي: معلومات التواصل
            </button>
          </div>
        </div>
      ) : step === 'contact' && selectedTrip ? (
        <div className="space-y-6">
          <button onClick={() => setStep('passengers')} className="text-emerald-600 font-bold mb-4">← العودة لبيانات الركاب</button>
          <div className="card max-w-md mx-auto space-y-6">
            <h3 className="font-bold text-xl text-center">معلومات التواصل</h3>
            <p className="text-sm text-stone-500 text-center">يرجى إدخال بيانات التواصل معك بخصوص الرحلة</p>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs text-stone-500">رقم الهاتف</label>
                <input 
                  type="tel" 
                  placeholder="رقم الهاتف (مثال: 05XXXXXXXX)" 
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-stone-500">البريد الإلكتروني</label>
                <input 
                  type="email" 
                  placeholder="البريد الإلكتروني" 
                  value={contactEmail || (user?.email || '')}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
            </div>
            <div className="bg-emerald-50 p-4 rounded-2xl space-y-2 text-sm">
              <div className="flex justify-between"><span>عدد المقاعد:</span><span className="font-bold">{selectedSeats.length}</span></div>
              <div className="flex justify-between"><span>المبلغ الإجمالي:</span><span className="font-black text-emerald-600">{selectedTrip.price * selectedSeats.length} ريال</span></div>
            </div>
            <button 
              disabled={!contactPhone}
              onClick={() => setStep('payment')}
              className="btn-primary w-full disabled:opacity-50"
            >
              التالي: الدفع الإلكتروني
            </button>
          </div>
        </div>
      ) : step === 'payment' && selectedTrip ? (
        <div className="space-y-6">
          <button onClick={() => setStep('contact')} className="text-emerald-600 font-bold mb-4">← العودة لمعلومات التواصل</button>
          <div className="card max-w-md mx-auto space-y-6">
            <h3 className="font-bold text-xl text-center">طريقة الدفع</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={() => setPaymentMethod('online')}
                className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${
                  paymentMethod === 'online' ? 'border-emerald-500 bg-emerald-50' : 'border-stone-100 bg-stone-50'
                }`}
              >
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${paymentMethod === 'online' ? 'border-emerald-500' : 'border-stone-300'}`}>
                  {paymentMethod === 'online' && <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full" />}
                </div>
                <span className="font-bold text-sm">دفع إلكتروني</span>
              </button>
              <button 
                onClick={() => setPaymentMethod('later')}
                className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${
                  paymentMethod === 'later' ? 'border-emerald-500 bg-emerald-50' : 'border-stone-100 bg-stone-50'
                }`}
              >
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${paymentMethod === 'later' ? 'border-emerald-500' : 'border-stone-300'}`}>
                  {paymentMethod === 'later' && <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full" />}
                </div>
                <span className="font-bold text-sm">دفع عند السفر</span>
              </button>
            </div>

            <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100 flex justify-between items-center">
              <div>
                <p className="text-xs text-stone-500">المبلغ المطلوب</p>
                <p className="text-2xl font-black text-emerald-600">{selectedTrip.price * selectedSeats.length} ريال</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-stone-500">عدد التذاكر</p>
                <p className="font-bold">{selectedSeats.length}</p>
              </div>
            </div>

            {paymentMethod === 'online' ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs text-stone-500">رقم البطاقة</label>
                  <input 
                    type="text" 
                    placeholder="XXXX XXXX XXXX XXXX" 
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-mono"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs text-stone-500">تاريخ الانتهاء</label>
                    <input 
                      type="text" 
                      placeholder="MM/YY" 
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-stone-500">رمز الأمان CVV</label>
                    <input 
                      type="password" 
                      placeholder="***" 
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-mono"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-stone-500">اسم صاحب البطاقة</label>
                  <input 
                    type="text" 
                    placeholder="الاسم كما هو مكتوب على البطاقة" 
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
                <div className="flex items-center gap-2 text-[10px] text-stone-400 justify-center">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                  اتصال آمن ومشفر 256-bit
                </div>
              </div>
            ) : (
              <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 space-y-2">
                <p className="text-sm font-bold text-amber-800">ملاحظة هامة:</p>
                <p className="text-xs text-amber-700 leading-relaxed">
                  عند اختيار الدفع عند السفر، يرجى الحضور إلى المكتب قبل موعد الرحلة بـ 30 دقيقة على الأقل لتأكيد الحجز ودفع الرسوم. في حال التأخر قد يتم إلغاء الحجز تلقائياً.
                </p>
              </div>
            )}

            <button 
              disabled={loading}
              onClick={handleBooking}
              className="btn-primary w-full"
            >
              {loading ? 'جاري معالجة الطلب...' : paymentMethod === 'online' ? 'تأكيد الدفع وإتمام الحجز' : 'تأكيد الحجز'}
            </button>
          </div>
        </div>
      ) : (
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-6"
        >
          <div className="bg-emerald-100 p-6 rounded-full text-emerald-600">
            <CheckCircle size={64} />
          </div>
          <h2 className="text-2xl font-bold text-center">تم الحجز بنجاح!</h2>
          <p className="text-stone-500 text-center">لقد تم حجز {bookingSuccess.length} مقاعد بنجاح.</p>
          
          <div className="grid grid-cols-1 gap-6 w-full">
            {bookingSuccess.map((booking, idx) => (
              <div 
                key={booking.id} 
                id={`ticket-preview-${idx}`} 
                className="bg-white p-8 rounded-3xl shadow-xl border-2 border-emerald-500 w-full max-w-md mx-auto space-y-6 relative overflow-hidden"
                style={{ backgroundColor: '#ffffff', borderColor: '#10b981' }}
              >
                <div 
                  className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full -mr-12 -mt-12" 
                  style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)' }}
                />
                <div className="flex justify-between items-start">
                  <img src="https://xn--ogbhrq.vip/wp-content/uploads/2026/03/bus-svgrepo-com-1.svg" alt="Logo" className="w-12 h-12" />
                  <div className="text-right">
                    <p className="text-xs text-stone-400" style={{ color: '#a8a29e' }}>تذكرة سفر دولية</p>
                    <p className="font-bold text-emerald-800" style={{ color: '#065f46' }}>العوجان للسياحة</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div><p className="text-[10px] text-stone-400 uppercase" style={{ color: '#a8a29e' }}>الاسم</p><p className="font-bold">{booking.passengerName}</p></div>
                    <div><p className="text-[10px] text-stone-400 uppercase" style={{ color: '#a8a29e' }}>رقم الجواز</p><p className="font-bold">{booking.passportNumber || '---'}</p></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><p className="text-[10px] text-stone-400 uppercase" style={{ color: '#a8a29e' }}>رقم الحجز</p><p className="font-mono text-xs">{booking.id.slice(0, 8)}</p></div>
                    <div><p className="text-[10px] text-stone-400 uppercase" style={{ color: '#a8a29e' }}>الهاتف</p><p className="font-bold text-xs">{booking.passengerPhone}</p></div>
                  </div>
                  <div className="bg-emerald-50 p-4 rounded-xl flex justify-between items-center" style={{ backgroundColor: '#ecfdf5' }}>
                    <div><p className="text-[10px] text-emerald-600 uppercase" style={{ color: '#059669' }}>من</p><p className="font-bold text-lg">{selectedTrip?.from}</p></div>
                    <div className="text-emerald-300" style={{ color: '#6ee7b7' }}>←</div>
                    <div className="text-left">
                      <p className="text-[10px] text-emerald-600 uppercase" style={{ color: '#059669' }}>إلى</p>
                      <p className="font-bold text-lg">{selectedTrip?.to}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div><p className="text-[10px] text-stone-400 uppercase" style={{ color: '#a8a29e' }}>التاريخ</p><p className="font-bold text-xs">{formatDateArabic(selectedTrip?.date || '')}</p></div>
                    <div><p className="text-[10px] text-stone-400 uppercase" style={{ color: '#a8a29e' }}>الوقت</p><p className="font-bold text-xs">{selectedTrip?.time}</p></div>
                    <div><p className="text-[10px] text-stone-400 uppercase" style={{ color: '#a8a29e' }}>المقعد</p><p className="font-bold text-xs">{booking.seatNumber}</p></div>
                  </div>
                </div>
                <div className="border-t-2 border-dashed border-stone-200 pt-4 flex justify-center" style={{ borderColor: '#e7e5e4' }}>
                  <div className="bg-stone-100 h-12 w-full rounded flex items-center justify-center text-stone-400 text-[10px] font-mono" style={{ backgroundColor: '#f5f5f4', color: '#a8a29e' }}>
                    BARCODE_{booking.id.slice(0, 6)}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button 
            onClick={async () => {
              for (let i = 0; i < bookingSuccess.length; i++) {
                const element = document.getElementById(`ticket-preview-${i}`);
                if (element) {
                  const canvas = await html2canvas(element);
                  const link = document.createElement('a');
                  link.download = `ticket-${bookingSuccess[i].id}.png`;
                  link.href = canvas.toDataURL();
                  link.click();
                }
              }
            }} 
            className="btn-primary flex items-center gap-2"
          >
            <Download size={20} />
            تحميل جميع التذاكر كصور
          </button>
          <button onClick={() => { setSelectedTrip(null); setBookingSuccess([]); setSelectedSeats([]); setPassengers([]); setContactPhone(''); setStep('trips'); }} className="text-stone-500">حجز رحلة أخرى</button>
        </motion.div>
      )}
    </div>
  );
}
