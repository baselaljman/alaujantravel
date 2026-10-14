import React, { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, query, where, addDoc, doc, updateDoc, getDoc, arrayUnion } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, auth } from '../firebase';
import { Trip, Booking, City } from '../types';
import { useAuth, registerDeviceToken } from '../hooks/useAuth';
import { useCurrency } from '../hooks/useCurrency';
import { Calendar, Users, CheckCircle, Download, Globe, Moon, Mail, Lock, User as UserIcon, Phone, Eye, EyeOff, LogIn, UserPlus, Chrome, AlertCircle, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import html2canvas from 'html2canvas';

import { Capacitor } from '@capacitor/core';
import { useSearchParams } from 'react-router-dom';

const PHONE_COUNTRIES = [
  { code: '+966', flag: '🇸🇦', name: 'السعودية', placeholder: '5xxxxxxxx' },
  { code: '+963', flag: '🇸🇾', name: 'سوريا', placeholder: '9xxxxxxxx' },
  { code: '+971', flag: '🇦🇪', name: 'الإمارات', placeholder: '5xxxxxxxx' },
  { code: '+965', flag: '🇰🇼', name: 'الكويت', placeholder: 'xxxxxxxx' },
  { code: '+974', flag: '🇶🇦', name: 'قطر', placeholder: 'xxxxxxxx' },
  { code: '+973', flag: '🇧🇭', name: 'البحرين', placeholder: 'xxxxxxxx' },
  { code: '+968', flag: '🇴🇲', name: 'عمان', placeholder: 'xxxxxxxx' },
  { code: '+962', flag: '🇯🇴', name: 'الأردن', placeholder: '7xxxxxxxx' },
  { code: '+961', flag: '🇱🇧', name: 'لبنان', placeholder: 'xxxxxxxx' },
  { code: '+964', flag: '🇮🇶', name: 'العراق', placeholder: '7xxxxxxxx' },
  { code: '+20', flag: '🇪🇬', name: 'مصر', placeholder: '1xxxxxxxxx' },
  { code: '+967', flag: '🇾🇪', name: 'اليمن', placeholder: '7xxxxxxxx' },
];

export default function BookingPage() {
  const { user, profile, login, loginWithEmail, registerWithEmail } = useAuth();
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

  const [contactEmail, setContactEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authTab, setAuthTab] = useState<'register' | 'login'>('register');
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    if (user) {
      if (profile?.phoneNumber) {
        const raw = profile.phoneNumber;
        const matched = PHONE_COUNTRIES.find(c => raw.startsWith(c.code));
        if (matched) {
          setCountryCode(matched.code);
          setContactPhone(raw.replace(matched.code, '').replace(/^0+/, ''));
        } else {
          setContactPhone(raw.replace(/^\+\d{1,4}/, '').replace(/^0+/, ''));
        }
      } else if (user.phoneNumber) {
        const raw = user.phoneNumber;
        const matched = PHONE_COUNTRIES.find(c => raw.startsWith(c.code));
        if (matched) {
          setCountryCode(matched.code);
          setContactPhone(raw.replace(matched.code, '').replace(/^0+/, ''));
        } else {
          setContactPhone(raw.replace(/^\+\d{1,4}/, '').replace(/^0+/, ''));
        }
      }

      if (user.email && !contactEmail) {
        setContactEmail(user.email);
      }
      if (profile?.displayName && !name) {
        setName(profile.displayName);
      }
    }
  }, [user, profile]);

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

      // Automatically register/link the active Android FCM token with the booking phone number
      try {
        const activeToken = localStorage.getItem('android_token') || (window as any).androidToken || (window as any).fcmToken;
        if (activeToken) {
          const mainPhone = `${countryCode}${contactPhone.replace(/^0+/, '')}`;
          const mainName = passengers[0]?.name || 'مسافر';
          const model = localStorage.getItem('android_model') || (window as any).androidModel;
          console.log('Linking Android Device to recent booking phone:', { activeToken, mainPhone, mainName });
          await registerDeviceToken(activeToken, model || undefined, user?.uid || undefined, mainPhone, mainName);
        }
      } catch (tokenErr) {
        console.error('Error auto-registering device token during checkout:', tokenErr);
      }

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
    if (passengers[0]?.name && !name) {
      setName(passengers[0].name);
    }
    // Pre-fill email if user is logged in
    if (user?.email && !contactEmail) {
      setContactEmail(user.email);
    }
    setStep('contact');
  };

  const handleRegisterAndProceed = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setAuthError('');

    const cleanPhone = contactPhone.trim().replace(/^0+/, '');
    if (!cleanPhone) {
      setAuthError('يرجى إدخال رقم الهاتف للتواصل');
      return;
    }
    if (!contactEmail || !contactEmail.includes('@')) {
      setAuthError('يرجى إدخال بريد إلكتروني صحيح');
      return;
    }
    if (!password || password.length < 6) {
      setAuthError('يرجى إدخال كلمة مرور تتكون من 6 خانات أو أكثر لحسابك');
      return;
    }

    setLoading(true);
    try {
      const customerName = name.trim() || passengers[0]?.name || 'مسافر';
      await registerWithEmail(contactEmail.trim(), password, customerName);
      
      const fullPhone = `${countryCode}${cleanPhone}`;
      if (auth.currentUser) {
        const userRef = doc(db, 'users', auth.currentUser.uid);
        await updateDoc(userRef, {
          phoneNumber: fullPhone,
          displayName: customerName,
          email: contactEmail.trim(),
        }).catch(async () => {
          // If doc doesn't exist yet, it's created by auth listener with setDoc
        });

        const activeToken = localStorage.getItem('android_token') || (window as any).androidToken;
        if (activeToken) {
          await registerDeviceToken(activeToken, undefined, auth.currentUser.uid, fullPhone, customerName);
        }
      }
      setStep('payment');
    } catch (err: any) {
      console.error('Registration error in contact step:', err);
      if (err.code === 'auth/email-already-in-use') {
        setAuthError('هذا البريد الإلكتروني مسجل مسبقاً. يمكنك التبديل لتبويب "تسجيل الدخول" وإدخال كلمة المرور.');
      } else if (err.code === 'auth/weak-password') {
        setAuthError('كلمة المرور ضعيفة جداً، يرجى اختيار كلمة سر من 6 خانات أو رموز على الأقل.');
      } else if (err.code === 'auth/invalid-email') {
        setAuthError('صيغة البريد الإلكتروني غير صالحة.');
      } else {
        setAuthError(err.message || 'حدث خطأ أثناء إنشاء الحساب، يرجى المحاولة مرة أخرى.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLoginAndProceed = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setAuthError('');

    const cleanPhone = contactPhone.trim().replace(/^0+/, '');
    if (!cleanPhone) {
      setAuthError('يرجى إدخال رقم الهاتف للتواصل');
      return;
    }
    if (!contactEmail || !contactEmail.includes('@')) {
      setAuthError('يرجى إدخال البريد الإلكتروني المسجل');
      return;
    }
    if (!password) {
      setAuthError('يرجى إدخال كلمة المرور');
      return;
    }

    setLoading(true);
    try {
      await loginWithEmail(contactEmail.trim(), password);
      const fullPhone = `${countryCode}${cleanPhone}`;
      if (auth.currentUser) {
        const userRef = doc(db, 'users', auth.currentUser.uid);
        await updateDoc(userRef, {
          phoneNumber: fullPhone,
        }).catch(() => {});

        const activeToken = localStorage.getItem('android_token') || (window as any).androidToken;
        if (activeToken) {
          await registerDeviceToken(activeToken, undefined, auth.currentUser.uid, fullPhone, passengers[0]?.name);
        }
      }
      setStep('payment');
    } catch (err: any) {
      console.error('Login error in contact step:', err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setAuthError('البريد الإلكتروني أو كلمة المرور غير صحيحة. يرجى التحقق أو اختيار "إنشاء حساب جديد".');
      } else {
        setAuthError(err.message || 'فشل تسجيل الدخول، يرجى التأكد من البيانات والمحاولة مجدداً.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLoginAndProceed = async () => {
    setAuthError('');
    setLoading(true);
    try {
      const success = await login();
      if (success) {
        const cleanPhone = contactPhone.trim().replace(/^0+/, '');
        if (cleanPhone && auth.currentUser) {
          const fullPhone = `${countryCode}${cleanPhone}`;
          const userRef = doc(db, 'users', auth.currentUser.uid);
          await updateDoc(userRef, {
            phoneNumber: fullPhone,
          }).catch(() => {});
        }
        setStep('payment');
      }
    } catch (err: any) {
      setAuthError(err.message || 'حدث خطأ أثناء الدخول بواسطة جوجل');
    } finally {
      setLoading(false);
    }
  };

  const handleProceedAsLoggedIn = async () => {
    setAuthError('');
    const cleanPhone = contactPhone.trim().replace(/^0+/, '');
    if (!cleanPhone) {
      setAuthError('يرجى إدخال رقم الهاتف للتواصل للمتابعة');
      return;
    }
    if (user) {
      const fullPhone = `${countryCode}${cleanPhone}`;
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        phoneNumber: fullPhone,
      }).catch(() => {});
    }
    setStep('payment');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 px-4 sm:px-6">
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
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-xl">بيانات الركاب</h3>
              <div className="bg-blue-50 text-blue-700 px-4 py-2 rounded-xl text-xs font-bold border border-blue-100">
                🧳 يسمح لكل راكب عدد حقيبتين سفر مجاناً
              </div>
            </div>
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
          <button onClick={() => setStep('passengers')} className="text-emerald-600 font-bold mb-4 flex items-center gap-1">
            <span>← العودة لبيانات الركاب</span>
          </button>
          
          <div className="card max-w-lg mx-auto space-y-6 shadow-xl border border-stone-100">
            <div className="text-center space-y-1">
              <h3 className="font-bold text-2xl text-emerald-900">معلومات التواصل والحساب</h3>
              <p className="text-xs text-stone-500">أدخل رقم هاتفك بدون كود تحقق، ثم سجل دخولك ببريدك وكلمة المرور لمتابعة الحجز</p>
            </div>

            {authError && (
              <div className="bg-red-50 text-red-700 p-3.5 rounded-2xl text-xs border border-red-200 flex items-start gap-2 text-right">
                <AlertCircle size={18} className="shrink-0 mt-0.5 text-red-500" />
                <span className="leading-relaxed">{authError}</span>
              </div>
            )}

            {/* Phone Number Input - Direct without OTP verification */}
            <div className="space-y-2 bg-stone-50/80 p-4 rounded-2xl border border-stone-200/80">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-stone-700 flex items-center gap-1.5">
                  <Phone size={14} className="text-emerald-600" />
                  <span>رقم الهاتف للتواصل</span>
                </label>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                  بدون كود تحقق SMS
                </span>
              </div>
              <div className="flex gap-2 items-center bg-white border border-stone-200 rounded-xl p-1 focus-within:ring-2 focus-within:ring-emerald-500 transition-all shadow-sm">
                <select 
                  value={countryCode} 
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="bg-stone-50 border-l border-stone-100 rounded-lg px-2 py-2.5 text-xs outline-none w-[115px] sm:w-[125px] shrink-0 font-bold mr-1"
                >
                  {PHONE_COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.code} {c.name}
                    </option>
                  ))}
                </select>
                <input 
                  type="tel" 
                  placeholder={PHONE_COUNTRIES.find(c => c.code === countryCode)?.placeholder || '5xxxxxxxx'}
                  value={contactPhone}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    setContactPhone(val.startsWith('0') ? val.substring(1) : val);
                  }}
                  className="flex-1 min-w-0 bg-transparent px-3 py-2.5 text-base outline-none text-left font-mono tracking-wider"
                  dir="ltr"
                />
              </div>
              <p className="text-[10px] text-stone-400">
                📱 سنستخدم هذا الرقم للتواصل وتأكيد موعد الرحلة وإرسال تفاصيل التذكرة عبر واتساب.
              </p>
            </div>

            {/* Account / Authentication Section */}
            {user ? (
              /* Already Logged In Card */
              <div className="space-y-4">
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-emerald-600 text-white p-2 rounded-xl">
                      <CheckCircle size={20} />
                    </div>
                    <div>
                      <p className="text-xs text-stone-500 font-medium">مسجل الدخول بحسابك:</p>
                      <p className="font-bold text-sm text-emerald-950">{user.email || profile?.displayName || 'حساب مفعل'}</p>
                    </div>
                  </div>
                  <span className="text-[10px] bg-emerald-600 text-white font-bold px-2.5 py-1 rounded-full">
                    مفعل ✓
                  </span>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-stone-500 font-bold">البريد الإلكتروني للتذاكر</label>
                  <input
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="email@example.com"
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>

                {/* Price summary */}
                <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200 space-y-2 text-sm">
                  <div className="flex justify-between"><span>عدد المقاعد:</span><span className="font-bold">{selectedSeats.length}</span></div>
                  <div className="flex justify-between"><span>المبلغ الإجمالي:</span><span className="font-black text-emerald-600">{formatPrice(getTripPrice(selectedTrip).value * selectedSeats.length)}</span></div>
                </div>

                <button 
                  disabled={!contactPhone.trim() || loading}
                  onClick={handleProceedAsLoggedIn}
                  className="btn-primary w-full disabled:opacity-50 py-3.5 text-base flex items-center justify-center gap-2 shadow-lg shadow-emerald-200"
                >
                  <span>التالي: تأكيد وعملية الدفع</span>
                  <ArrowRight size={18} className="rotate-180" />
                </button>
              </div>
            ) : (
              /* Not Logged In: Email & Password Registration/Login */
              <div className="space-y-4 pt-1">
                <div className="flex bg-stone-100 p-1.5 rounded-2xl">
                  <button
                    type="button"
                    onClick={() => { setAuthTab('register'); setAuthError(''); }}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                      authTab === 'register' ? 'bg-white shadow-sm text-emerald-700' : 'text-stone-500 hover:text-stone-800'
                    }`}
                  >
                    <UserPlus size={16} />
                    <span>إنشاء حساب جديد</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAuthTab('login'); setAuthError(''); }}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                      authTab === 'login' ? 'bg-white shadow-sm text-emerald-700' : 'text-stone-500 hover:text-stone-800'
                    }`}
                  >
                    <LogIn size={16} />
                    <span>تسجيل الدخول</span>
                  </button>
                </div>

                {authTab === 'register' ? (
                  <form onSubmit={handleRegisterAndProceed} className="space-y-3.5">
                    <div className="space-y-1">
                      <label className="text-xs text-stone-600 font-bold">الاسم الكامل</label>
                      <div className="relative">
                        <UserIcon className="absolute right-3.5 top-3 text-stone-400" size={16} />
                        <input
                          type="text"
                          placeholder="الاسم الكامل للعميل"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          required
                          className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 pr-10 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs text-stone-600 font-bold">البريد الإلكتروني للدخول</label>
                      <div className="relative">
                        <Mail className="absolute right-3.5 top-3 text-stone-400" size={16} />
                        <input
                          type="email"
                          placeholder="example@gmail.com"
                          value={contactEmail}
                          onChange={(e) => setContactEmail(e.target.value)}
                          required
                          className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 pr-10 text-sm outline-none focus:ring-2 focus:ring-emerald-500 text-left"
                          dir="ltr"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs text-stone-600 font-bold">اختر كلمة سر للدخول لحسابك</label>
                      <div className="relative">
                        <Lock className="absolute right-3.5 top-3 text-stone-400" size={16} />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          placeholder="كلمة مرور (6 خانات على الأقل)"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          minLength={6}
                          className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 pr-10 pl-10 text-sm outline-none focus:ring-2 focus:ring-emerald-500 text-left"
                          dir="ltr"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute left-3.5 top-3 text-stone-400 hover:text-stone-600"
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>

                    {/* Price summary */}
                    <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200 space-y-2 text-sm mt-3">
                      <div className="flex justify-between"><span>عدد المقاعد:</span><span className="font-bold">{selectedSeats.length}</span></div>
                      <div className="flex justify-between"><span>المبلغ الإجمالي:</span><span className="font-black text-emerald-600">{formatPrice(getTripPrice(selectedTrip).value * selectedSeats.length)}</span></div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading || !contactPhone.trim() || !contactEmail || !password}
                      className="btn-primary w-full py-3.5 text-base flex items-center justify-center gap-2 shadow-lg shadow-emerald-200 disabled:opacity-50"
                    >
                      {loading ? (
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <UserPlus size={18} />
                          <span>إنشاء حساب ومتابعة الحجز</span>
                        </>
                      )}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleLoginAndProceed} className="space-y-3.5">
                    <div className="space-y-1">
                      <label className="text-xs text-stone-600 font-bold">البريد الإلكتروني</label>
                      <div className="relative">
                        <Mail className="absolute right-3.5 top-3 text-stone-400" size={16} />
                        <input
                          type="email"
                          placeholder="example@gmail.com"
                          value={contactEmail}
                          onChange={(e) => setContactEmail(e.target.value)}
                          required
                          className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 pr-10 text-sm outline-none focus:ring-2 focus:ring-emerald-500 text-left"
                          dir="ltr"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs text-stone-600 font-bold">كلمة المرور</label>
                      <div className="relative">
                        <Lock className="absolute right-3.5 top-3 text-stone-400" size={16} />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          placeholder="أدخل كلمة مرورك"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 pr-10 pl-10 text-sm outline-none focus:ring-2 focus:ring-emerald-500 text-left"
                          dir="ltr"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute left-3.5 top-3 text-stone-400 hover:text-stone-600"
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>

                    {/* Price summary */}
                    <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200 space-y-2 text-sm mt-3">
                      <div className="flex justify-between"><span>عدد المقاعد:</span><span className="font-bold">{selectedSeats.length}</span></div>
                      <div className="flex justify-between"><span>المبلغ الإجمالي:</span><span className="font-black text-emerald-600">{formatPrice(getTripPrice(selectedTrip).value * selectedSeats.length)}</span></div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading || !contactPhone.trim() || !contactEmail || !password}
                      className="btn-primary w-full py-3.5 text-base flex items-center justify-center gap-2 shadow-lg shadow-emerald-200 disabled:opacity-50"
                    >
                      {loading ? (
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <LogIn size={18} />
                          <span>تسجيل الدخول ومتابعة الحجز</span>
                        </>
                      )}
                    </button>
                  </form>
                )}

                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-stone-200"></div>
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-white px-3 text-stone-400 font-medium">أو المتابعة السريعة</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleGoogleLoginAndProceed}
                  disabled={loading}
                  className="w-full border border-stone-200 bg-white hover:bg-stone-50 text-stone-700 py-3 rounded-xl font-bold flex items-center justify-center gap-2 text-sm transition-colors shadow-sm"
                >
                  <Chrome size={18} className="text-emerald-600" />
                  <span>المتابعة السريعة بواسطة حساب Google</span>
                </button>
              </div>
            )}
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
                  padding: '24px',
                  width: '100%',
                  maxWidth: '400px',
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', zIndex: 1 }}>
                  <img 
                    src="/logoaujantravel.jpeg" 
                    alt="Logo" 
                    referrerPolicy="no-referrer"
                    crossOrigin="anonymous"
                    style={{ 
                      width: '50px', 
                      height: '50px', 
                      objectFit: 'cover', 
                      borderRadius: '50%',
                      border: '2px solid white',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                      WebkitPrintColorAdjust: 'exact',
                      printColorAdjust: 'exact'
                    }} 
                  />
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '11px', color: '#a8a29e', margin: 0, lineHeight: 1 }}>
                      {selectedTrip?.tripType === 'umrah' ? 'تذكرة رحلة عمرة' : 'تذكرة سفر دولية'}
                    </p>
                    <p style={{ fontWeight: 'bold', color: '#065f46', margin: 0, fontSize: '16px' }}>العوجان للسياحة</p>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '12px' }}>
                    <div><p style={{ fontSize: '10px', textTransform: 'uppercase', color: '#a8a29e', margin: 0 }}>الاسم</p><p style={{ fontWeight: 'bold', color: '#1c1917', margin: 0, fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{booking.passengerName}</p></div>
                    <div><p style={{ fontSize: '10px', textTransform: 'uppercase', color: '#a8a29e', margin: 0 }}>رقم الجواز</p><p style={{ fontWeight: 'bold', color: '#1c1917', margin: 0, fontSize: '12px' }}>{booking.passportNumber || '---'}</p></div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '12px' }}>
                    <div><p style={{ fontSize: '10px', textTransform: 'uppercase', color: '#a8a29e', margin: 0 }}>رقم الحجز</p><p style={{ fontFamily: 'monospace', fontSize: '11px', color: '#1c1917', margin: 0 }}>{booking.id.slice(0, 8)}</p></div>
                    <div><p style={{ fontSize: '10px', textTransform: 'uppercase', color: '#a8a29e', margin: 0 }}>رقم التتبع</p><p style={{ fontFamily: 'monospace', fontSize: '11px', color: '#059669', margin: 0 }}>{selectedTrip?.trackingNumber}</p></div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '12px' }}>
                    <div><p style={{ fontSize: '10px', textTransform: 'uppercase', color: '#a8a29e', margin: 0 }}>الهاتف</p><p style={{ fontWeight: 'bold', fontSize: '11px', color: '#1c1917', margin: 0 }}>{booking.passengerPhone}</p></div>
                  </div>
                  <div style={{ backgroundColor: '#ecfdf5', padding: '12px', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxSizing: 'border-box' }}>
                    <div><p style={{ fontSize: '9px', textTransform: 'uppercase', color: '#059669', margin: 0 }}>من</p><p style={{ fontWeight: 'bold', fontSize: '16px', color: '#065f46', margin: 0 }}>{booking.from || selectedTrip?.from}</p></div>
                    <div style={{ color: '#6ee7b7' }}>←</div>
                    <div style={{ textAlign: 'left' }}>
                      <p style={{ fontSize: '9px', textTransform: 'uppercase', color: '#059669', margin: 0 }}>إلى</p>
                      <p style={{ fontWeight: 'bold', fontSize: '16px', color: '#065f46', margin: 0 }}>{booking.to || selectedTrip?.to}</p>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', textAlign: 'center' }}>
                    <div><p style={{ fontSize: '9px', textTransform: 'uppercase', color: '#a8a29e', margin: 0 }}>التاريخ</p><p style={{ fontWeight: 'bold', fontSize: '10px', color: '#1c1917', margin: 0 }}>{formatDateArabic(selectedTrip?.date || '').split('،')[1] || formatDateArabic(selectedTrip?.date || '')}</p></div>
                    <div><p style={{ fontSize: '9px', textTransform: 'uppercase', color: '#a8a29e', margin: 0 }}>الوقت</p><p style={{ fontWeight: 'bold', fontSize: '11px', color: '#1c1917', margin: 0 }}>{selectedTrip?.time}</p></div>
                    <div><p style={{ fontSize: '9px', textTransform: 'uppercase', color: '#a8a29e', margin: 0 }}>المقعد</p><p style={{ fontWeight: 'bold', fontSize: '11px', color: '#1c1917', margin: 0 }}>{booking.seatNumber}</p></div>
                  </div>
                  <div style={{ backgroundColor: '#f8fafc', padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                    <p style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold', margin:0 }}>🧳 يسمح لكل راكب عدد حقيبتين سفر مجاناً</p>
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
                    scale: 3, // Higher scale for better quality
                    useCORS: true,
                    allowTaint: false,
                    logging: false,
                    backgroundColor: '#ffffff',
                    onclone: (clonedDoc) => {
                      // Ensure images are visible in the clone
                      const images = clonedDoc.getElementsByTagName('img');
                      for (let img of images) {
                        img.style.visibility = 'visible';
                        img.style.opacity = '1';
                      }
                      
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
