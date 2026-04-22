import React, { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, query, where, addDoc, doc, updateDoc, getDoc, arrayUnion } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, auth } from '../firebase';
import { Trip, Booking, City } from '../types';
import { useAuth } from '../hooks/useAuth';
import { useCurrency } from '../hooks/useCurrency';
import { Calendar, Users, CheckCircle, Download, Globe, Moon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import html2canvas from 'html2canvas';

import { Capacitor } from '@capacitor/core';
import { useSearchParams } from 'react-router-dom';

export default function BookingPage() {
  const { user, profile, login, signInWithPhone, verifyOtp } = useAuth();
  const { formatPrice } = useCurrency();
  const [searchParams, setSearchParams] = useSearchParams();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [filteredTrips, setFilteredTrips] = useState<Trip[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [selectedSeats, setSelectedSeats] = useState<number[]>([]);
  const [step, setStep] = useState<'trips' | 'seats' | 'passengers' | 'contact' | 'payment' | 'success'>('trips');
  const [passengers, setPassengers] = useState<{ name: string; passport: string }[]>([]);
  const [contactPhone, setContactPhone] = useState('');
  const [countryCode, setCountryCode] = useState('+966');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);

  useEffect(() => {
    if (user?.phoneNumber) {
      setIsPhoneVerified(true);
      setContactPhone(user.phoneNumber.replace(/^\+966|^\+963/, '').replace(/^0+/, ''));
      setCountryCode(user.phoneNumber.startsWith('+963') ? '+963' : '+966');
    }
    if (profile?.email) {
      setContactEmail(profile.email);
    }
  }, [user, profile]);

  const [contactEmail, setContactEmail] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'online' | 'later'>('later');
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

    const unsubCities = onSnapshot(collection(db, 'cities'), (snapshot) => {
      const citiesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as City));
      setCities(citiesData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'cities');
    });

    return () => {
      unsubscribe();
      unsubCities();
    };
  }, []);

  useEffect(() => {
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const date = searchParams.get('date');
    const type = searchParams.get('type');

    let expandedTrips: Trip[] = [];
    
    trips.forEach(trip => {
      // Add the main trip
      expandedTrips.push(trip);
      
      // Add virtual trips for each stop
      if ((trip.tripType || 'international') === 'international' && trip.stops && trip.stops.length > 0) {
        trip.stops.forEach(stop => {
          expandedTrips.push({
            ...trip,
            id: `${trip.id}-stop-${stop.cityName}`,
            to: stop.cityName,
            priceSAR: stop.priceSAR,
            priceSYP: stop.priceSYP,
            isStop: true,
            originalTripId: trip.id
          });
        });
      }
    });

    let filtered = expandedTrips;
    if (from) filtered = filtered.filter(t => t.from === from);
    if (to) filtered = filtered.filter(t => t.to === to);
    if (date) filtered = filtered.filter(t => t.date === date);
    if (type) filtered = filtered.filter(t => (t.tripType || 'international') === type);
    
    setFilteredTrips(filtered);

    // Update selectedTrip if it's in the new list
    if (selectedTrip) {
      const updated = expandedTrips.find(t => t.id === selectedTrip.id);
      if (updated) setSelectedTrip(updated);
    }
  }, [trips, searchParams]);

  const getTripPrice = (trip: Trip) => {
    const fromCity = cities.find(c => c.name === trip.from);
    if (fromCity?.country === 'سوريا') {
      return { value: trip.priceSYP || 0, currency: 'ل.س' };
    }
    return { value: trip.priceSAR || trip.price || 0, currency: 'ريال' };
  };

  const formatTripPrice = (trip: Trip) => {
    const { value, currency } = getTripPrice(trip);
    return `${value.toLocaleString('ar-EG')} ${currency}`;
  };

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
      const actualTripId = selectedTrip.originalTripId || selectedTrip.id;
      // Final check for seat availability right before booking
      const tripSnap = await getDoc(doc(db, 'trips', actualTripId));
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
      const tripRef = doc(db, 'trips', actualTripId);

      for (let i = 0; i < selectedSeats.length; i++) {
        const bookingData: any = {
          tripId: actualTripId,
          from: selectedTrip.from,
          to: selectedTrip.to,
          seatNumber: selectedSeats[i],
          status: paymentMethod === 'online' ? 'confirmed' : 'pending',
          paymentMethod: paymentMethod,
          bookingDate: new Date().toISOString(),
          userId: user ? user.uid : 'guest',
          passengerName: passengers[i].name || 'مسافر',
          passengerPhone: `${countryCode}${contactPhone.replace(/^0+/, '')}`,
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

  const sendOTP = async () => {
    if (!contactPhone) return;
    
    setLoading(true);
    try {
      const phoneNumber = `${countryCode}${contactPhone.replace(/^0+/, '')}`;
      await signInWithPhone(phoneNumber, 'recaptcha-container');
      setOtpSent(true);
      alert('تم إرسال رمز التحقق إلى هاتفك');
    } catch (error: any) {
      console.error("OTP Error:", error);
      alert(error.message || 'حدث خطأ أثناء إرسال الرمز');
    } finally {
      setLoading(false);
    }
  };

  const verifyOTP = async () => {
    if (!otpCode) return;
    setLoading(true);
    try {
      await verifyOtp(otpCode);
      alert('تم التحقق من رقم الهاتف بنجاح');
    } catch (error: any) {
      console.error("Verification Error:", error);
      alert(error.message || 'رمز التحقق غير صحيح');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex flex-col items-center gap-6">
        <h1 className="text-3xl font-bold text-center">
          {searchParams.get('type') === 'umrah' ? 'حجز رحلة عمرة' : 
           searchParams.get('type') === 'international' ? 'حجز رحلة دولية' : 'جميع الرحلات المجدولة'}
        </h1>

        {step === 'trips' && (
          <div className="flex gap-2 p-1 bg-stone-100 rounded-2xl border border-stone-200">
            <button
              onClick={() => {
                const params = new URLSearchParams(searchParams);
                params.delete('type');
                setSearchParams(params);
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all ${
                !searchParams.get('type')
                  ? 'bg-stone-600 text-white shadow-md'
                  : 'text-stone-500 hover:bg-stone-200'
              }`}
            >
              الكل
            </button>
            <button
              onClick={() => {
                const params = new URLSearchParams(searchParams);
                params.set('type', 'international');
                setSearchParams(params);
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all ${
                searchParams.get('type') === 'international'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-stone-500 hover:bg-stone-200'
              }`}
            >
              <Globe size={18} />
              رحلات دولية
            </button>
            <button
              onClick={() => {
                const params = new URLSearchParams(searchParams);
                params.set('type', 'umrah');
                setSearchParams(params);
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all ${
                searchParams.get('type') === 'umrah'
                  ? 'bg-amber-500 text-white shadow-md'
                  : 'text-stone-500 hover:bg-stone-200'
              }`}
            >
              <Moon size={18} />
              رحلات عمرة
            </button>
          </div>
        )}
      </div>

      {step === 'trips' ? (
        <div className="grid grid-cols-1 gap-4">
          {filteredTrips.length === 0 && <p className="text-center text-stone-500">لا توجد رحلات تطابق بحثك حالياً.</p>}
          {filteredTrips.map(trip => (
            <motion.div 
              key={trip.id}
              whileHover={{ scale: 1.01 }}
              onClick={() => { setSelectedTrip(trip); setStep('seats'); }}
              className={`card cursor-pointer transition-all flex justify-between items-center ${
                trip.tripType === 'umrah' 
                  ? 'border-[3px] border-amber-400 hover:border-amber-500 bg-gradient-to-br from-amber-50/50 to-white shadow-amber-100 shadow-lg' 
                  : 'hover:border-emerald-500'
              }`}
            >
              <div className="flex gap-6 items-center">
                <div className={`p-4 rounded-2xl ${trip.tripType === 'umrah' ? 'bg-amber-500 text-white shadow-inner' : 'bg-emerald-100 text-emerald-600'}`}>
                  {trip.tripType === 'umrah' ? <Moon size={24} className="fill-current" /> : <Calendar size={24} />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-lg">{trip.from} ← {trip.to}</h3>
                    {trip.tripType === 'umrah' && (
                      <span className="text-[10px] bg-amber-500 text-white px-3 py-1 rounded-full font-black shadow-sm uppercase tracking-wider">رحلة عمرة</span>
                    )}
                  </div>
                  <p className="text-sm text-stone-500">{formatDateArabic(trip.date)} - {trip.time}</p>
                </div>
              </div>
              <div className="text-left">
                <p className={`font-black text-xl ${trip.tripType === 'umrah' ? 'text-amber-600' : 'text-emerald-600'}`}>{formatTripPrice(trip)}</p>
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
                {Array.from({ length: selectedTrip.totalSeats || 35 }).map((_, i) => {
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
                <div className="flex justify-between text-lg">
                  <span>الإجمالي:</span>
                  <span className="font-black text-emerald-600">
                    {(getTripPrice(selectedTrip).value * selectedSeats.length).toLocaleString('ar-EG')} {getTripPrice(selectedTrip).currency}
                  </span>
                </div>
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
                <div className="flex gap-2">
                  <input 
                    type="tel" 
                    placeholder="05xxxxxxxx" 
                    value={contactPhone}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      setContactPhone(val.startsWith('0') ? val.substring(1) : val);
                    }}
                    className="flex-1 bg-stone-50 border border-stone-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-left"
                    dir="ltr"
                  />
                  <select 
                    value={countryCode} 
                    onChange={(e) => setCountryCode(e.target.value)}
                    className="bg-stone-50 border border-stone-200 rounded-xl px-2 py-2 text-xs focus:ring-2 focus:ring-emerald-500 outline-none min-w-[120px]"
                  >
                    <option value="+966">السعودية 🇸🇦</option>
                    <option value="+971">الإمارات 🇦🇪</option>
                    <option value="+965">الكويت 🇰🇼</option>
                    <option value="+974">قطر 🇶🇦</option>
                    <option value="+973">البحرين 🇧🇭</option>
                    <option value="+968">عمان 🇴🇲</option>
                    <option value="+962">الأردن 🇯🇴</option>
                    <option value="+961">لبنان 🇱🇧</option>
                    <option value="+963">سوريا 🇸🇾</option>
                    <option value="+964">العراق 🇮🇶</option>
                    <option value="+967">اليمن 🇾🇪</option>
                  </select>
                </div>
              </div>

              {/* OTP section for verification */}
              {!otpSent && !isPhoneVerified && (
                <button 
                  onClick={sendOTP}
                  disabled={!contactPhone || loading}
                  className="w-full bg-emerald-50 text-emerald-600 py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-100 transition-colors disabled:opacity-50"
                >
                  {loading ? 'جاري الإرسال...' : 'إرسال رمز التحقق (OTP)'}
                </button>
              )}

              {otpSent && !isPhoneVerified && (
                <div className="space-y-4 p-4 bg-stone-50 rounded-2xl border border-stone-100">
                  <div className="space-y-2">
                    <label className="text-xs text-stone-500">أدخل رمز التحقق المرسل لهاتفك</label>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        maxLength={6}
                        placeholder="000000" 
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                        className="flex-1 bg-white border border-stone-200 rounded-xl px-4 py-3 text-center text-xl tracking-[0.5em] font-mono focus:ring-2 focus:ring-emerald-500 outline-none"
                      />
                      <button 
                        onClick={verifyOTP}
                        disabled={otpCode.length < 6 || loading}
                        className="bg-emerald-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-emerald-700 disabled:opacity-50 transition-all"
                      >
                        {loading ? '...' : 'تأكيد'}
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between items-center px-1">
                    <button 
                      onClick={sendOTP}
                      className="text-xs text-stone-400 hover:text-emerald-600 underline"
                    >
                      إعادة إرسال الرمز؟
                    </button>
                    <button 
                      onClick={() => { setOtpSent(false); setOtpCode(''); }}
                      className="text-xs text-stone-400 hover:text-red-500"
                    >
                      تغيير الرقم
                    </button>
                  </div>
                </div>
              )}

              {isPhoneVerified && (
                <div className="flex items-center gap-3 text-emerald-700 font-bold bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                  <div className="bg-emerald-500 text-white rounded-full p-1">
                    <CheckCircle size={16} />
                  </div>
                  <span>تم التحقق من رقم الهاتف بنجاح</span>
                </div>
              )}

              <div id="recaptcha-container" className="flex justify-center my-2 min-h-[78px]"></div>
            </div>
            <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100/50 space-y-2 text-sm">
              <div className="flex justify-between"><span>عدد المقاعد:</span><span className="font-bold">{selectedSeats.length}</span></div>
              <div className="flex justify-between"><span>المبلغ الإجمالي:</span><span className="font-black text-emerald-600">{formatPrice(getTripPrice(selectedTrip).value * selectedSeats.length)}</span></div>
            </div>
            <button 
              disabled={!isPhoneVerified || loading}
              onClick={() => setStep('payment')}
              className="btn-primary w-full disabled:opacity-50 py-4 text-lg"
            >
              التالي: تأكيد وعملية الدفع
            </button>
          </div>
        </div>
      ) : step === 'payment' && selectedTrip ? (
        <div className="space-y-6">
          <button onClick={() => setStep('contact')} className="text-emerald-600 font-bold mb-4">← العودة لمعلومات التواصل</button>
          <div className="card max-w-md mx-auto space-y-6">
            <h3 className="font-bold text-xl text-center">تأكيد الحجز</h3>
            
            <div className="p-4 rounded-2xl border-2 border-emerald-500 bg-emerald-50 flex flex-col items-center gap-2">
              <CheckCircle className="text-emerald-500" size={24} />
              <span className="font-bold text-sm">الدفع عند السفر</span>
            </div>

            <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100 flex justify-between items-center">
              <div>
                <p className="text-xs text-stone-500">المبلغ المطلوب</p>
                <p className="text-2xl font-black text-emerald-600">
                  {(getTripPrice(selectedTrip).value * selectedSeats.length).toLocaleString('ar-EG')} {getTripPrice(selectedTrip).currency}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-stone-500">عدد التذاكر</p>
                <p className="font-bold">{selectedSeats.length}</p>
              </div>
            </div>

            <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 space-y-2">
              <p className="text-sm font-bold text-amber-800">ملاحظة هامة:</p>
              <p className="text-xs text-amber-700 leading-relaxed">
                يرجى الحضور إلى المكتب قبل موعد الرحلة بـ 30 دقيقة على الأقل لتأكيد الحجز ودفع الرسوم. في حال التأخر قد يتم إلغاء الحجز تلقائياً.
              </p>
            </div>

            <button 
              disabled={loading}
              onClick={handleBooking}
              className="btn-primary w-full"
            >
              {loading ? 'جاري معالجة الطلب...' : 'تأكيد الحجز'}
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
                style={{ 
                  backgroundColor: '#ffffff', 
                  borderColor: '#10b981', 
                  borderWidth: '2px',
                  borderStyle: 'solid',
                  borderRadius: '24px',
                  padding: '32px',
                  width: '400px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '24px',
                  position: 'relative',
                  overflow: 'hidden',
                  boxSizing: 'border-box',
                  textAlign: 'right',
                  direction: 'rtl',
                  margin: '0 auto'
                }}
              >
                <div 
                  style={{ 
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    width: '96px',
                    height: '96px',
                    borderRadius: '9999px',
                    marginRight: '-48px',
                    marginTop: '-48px',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)' 
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <img 
                    src="https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0226720471.firebasestorage.app/o/logoaujan.png?alt=media" 
                    alt="Logo" 
                    referrerPolicy="no-referrer"
                    style={{ width: '48px', height: '48px', objectFit: 'contain' }} 
                  />
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '12px', color: '#a8a29e', margin: 0 }}>
                      {selectedTrip?.tripType === 'umrah' ? 'تذكرة رحلة عمرة' : 'تذكرة سفر دولية'}
                    </p>
                    <p style={{ fontWeight: 'bold', color: '#065f46', margin: 0 }}>العوجان للسياحة</p>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div><p style={{ fontSize: '10px', textTransform: 'uppercase', color: '#a8a29e', margin: 0 }}>الاسم</p><p style={{ fontWeight: 'bold', color: '#1c1917', margin: 0 }}>{booking.passengerName}</p></div>
                    <div><p style={{ fontSize: '10px', textTransform: 'uppercase', color: '#a8a29e', margin: 0 }}>رقم الجواز</p><p style={{ fontWeight: 'bold', color: '#1c1917', margin: 0 }}>{booking.passportNumber || '---'}</p></div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div><p style={{ fontSize: '10px', textTransform: 'uppercase', color: '#a8a29e', margin: 0 }}>رقم الحجز</p><p style={{ fontFamily: 'monospace', fontSize: '12px', color: '#1c1917', margin: 0 }}>{booking.id.slice(0, 8)}</p></div>
                    <div><p style={{ fontSize: '10px', textTransform: 'uppercase', color: '#a8a29e', margin: 0 }}>رقم التتبع</p><p style={{ fontFamily: 'monospace', fontSize: '12px', color: '#059669', margin: 0 }}>{selectedTrip?.trackingNumber}</p></div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div><p style={{ fontSize: '10px', textTransform: 'uppercase', color: '#a8a29e', margin: 0 }}>الهاتف</p><p style={{ fontWeight: 'bold', fontSize: '12px', color: '#1c1917', margin: 0 }}>{booking.passengerPhone}</p></div>
                  </div>
                  <div style={{ backgroundColor: '#ecfdf5', padding: '16px', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxSizing: 'border-box' }}>
                    <div><p style={{ fontSize: '10px', textTransform: 'uppercase', color: '#059669', margin: 0 }}>من</p><p style={{ fontWeight: 'bold', fontSize: '18px', color: '#065f46', margin: 0 }}>{booking.from || selectedTrip?.from}</p></div>
                    <div style={{ color: '#6ee7b7' }}>←</div>
                    <div style={{ textAlign: 'left' }}>
                      <p style={{ fontSize: '10px', textTransform: 'uppercase', color: '#059669', margin: 0 }}>إلى</p>
                      <p style={{ fontWeight: 'bold', fontSize: '18px', color: '#065f46', margin: 0 }}>{booking.to || selectedTrip?.to}</p>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', textAlign: 'center' }}>
                    <div><p style={{ fontSize: '10px', textTransform: 'uppercase', color: '#a8a29e', margin: 0 }}>التاريخ</p><p style={{ fontWeight: 'bold', fontSize: '12px', color: '#1c1917', margin: 0 }}>{formatDateArabic(selectedTrip?.date || '')}</p></div>
                    <div><p style={{ fontSize: '10px', textTransform: 'uppercase', color: '#a8a29e', margin: 0 }}>الوقت</p><p style={{ fontWeight: 'bold', fontSize: '12px', color: '#1c1917', margin: 0 }}>{selectedTrip?.time}</p></div>
                    <div><p style={{ fontSize: '10px', textTransform: 'uppercase', color: '#a8a29e', margin: 0 }}>المقعد</p><p style={{ fontWeight: 'bold', fontSize: '12px', color: '#1c1917', margin: 0 }}>{booking.seatNumber}</p></div>
                  </div>
                </div>
                <div style={{ borderTop: '2px dashed #e7e5e4', paddingTop: '16px', display: 'flex', justifyContent: 'center' }}>
                  <div style={{ backgroundColor: '#f5f5f4', height: '48px', width: '100%', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontFamily: 'monospace', color: '#a8a29e' }}>
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
                  const canvas = await html2canvas(element, {
                    scale: 2,
                    useCORS: true,
                    backgroundColor: '#ffffff',
                    onclone: (clonedDoc) => {
                      // Remove all existing stylesheets to prevent oklch parsing errors
                      const styles = clonedDoc.querySelectorAll('style, link[rel="stylesheet"]');
                      styles.forEach(s => s.remove());

                      const style = clonedDoc.createElement('style');
                      style.innerHTML = `
                        :root {
                          --color-emerald-500: #10b981 !important;
                          --color-emerald-600: #059669 !important;
                          --color-emerald-700: #047857 !important;
                          --color-stone-100: #f5f5f4 !important;
                          --color-stone-400: #a8a29e !important;
                          --color-stone-500: #78716c !important;
                          --color-stone-600: #57534e !important;
                        }
                      `;
                      clonedDoc.head?.appendChild(style);
                    }
                  });
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
