import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, or, deleteDoc, getDocs, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { Booking, Trip, City } from '../types';
import { Calendar, Download, MapPin, Ticket, User, Loader2, Share as ShareIcon, Trash2, ShieldAlert } from 'lucide-react';
import { motion } from 'framer-motion';
import html2canvas from 'html2canvas';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export default function Profile() {
  const { user, profile, logout } = useAuth();
  const [bookings, setBookings] = useState<(Booking & { trip?: Trip })[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [cities, setCities] = useState<City[]>([]);
  const ticketRef = useRef<HTMLDivElement>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingProgress, setDeletingProgress] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    const unsubCities = onSnapshot(collection(db, 'cities'), (snap) => {
      setCities(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as City)));
    });
    return () => unsubCities();
  }, []);

  const getBookingPrice = (booking: Booking, trip: Trip) => {
    const fromCityName = booking.from || trip.from;
    const fromCity = cities.find(c => c.name === fromCityName);
    const isSyrianCurrency = fromCity?.country === 'سوريا';

    const bookingTo = booking.to || trip.to;
    if (bookingTo !== trip.to && trip.stops) {
      const matchedStop = trip.stops.find(s => s.cityName === bookingTo);
      if (matchedStop) {
        if (isSyrianCurrency) {
          return { value: matchedStop.priceSYP || 0, currency: 'ل.س' };
        } else {
          return { value: matchedStop.priceSAR || 0, currency: 'ريال' };
        }
      }
    }

    if (isSyrianCurrency) {
      return { value: trip.priceSYP || 0, currency: 'ل.س' };
    } else {
      return { value: trip.priceSAR || trip.price || 0, currency: 'ريال' };
    }
  };

  const formatDateArabic = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return new Intl.DateTimeFormat('ar-SA', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }).format(date);
    } catch (e) {
      return dateStr;
    }
  };

  const handleDownloadTicket = async (booking: Booking, trip?: Trip) => {
    if (!trip) return;
    setDownloadingId(booking.id);
    
    // Small delay to ensure the ticket is rendered in the hidden div
    setTimeout(async () => {
      try {
        const element = document.getElementById(`ticket-to-download-${booking.id}`);
        if (element) {
          const canvas = await html2canvas(element, {
            scale: 3,
            useCORS: true,
            allowTaint: false,
            backgroundColor: '#ffffff',
            onclone: (clonedDoc) => {
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

          const dataUrl = canvas.toDataURL('image/png');
          const fileName = `ticket-${booking.id.slice(0, 8)}.png`;

          if (Capacitor.isNativePlatform()) {
            try {
              // Save to device filesystem
              const savedFile = await Filesystem.writeFile({
                path: fileName,
                data: dataUrl,
                directory: Directory.Cache
              });

              // Share the file (allows saving to gallery or sending via WhatsApp)
              await Share.share({
                title: 'تذكرة العوجان للسياحة',
                text: 'إليك تذكرة سفرك من العوجان للسياحة',
                url: savedFile.uri,
                dialogTitle: 'حفظ أو مشاركة التذكرة'
              });
            } catch (nativeErr) {
              console.error('Error in native save/share:', nativeErr);
              // Fallback to web download if native fails
              const link = document.createElement('a');
              link.download = fileName;
              link.href = dataUrl;
              link.click();
            }
          } else {
            // Web download
            const link = document.createElement('a');
            link.download = fileName;
            link.href = dataUrl;
            link.click();
          }
        }
      } catch (error) {
        console.error('Error generating ticket:', error);
      } finally {
        setDownloadingId(null);
      }
    }, 100);
  };

  useEffect(() => {
    if (!user) return;

    // Query bookings by userId OR passengerEmail OR passengerPhone
    const constraints = [where('userId', '==', user.uid)];
    if (user.email) {
      constraints.push(where('passengerEmail', '==', user.email));
    }
    if (user.phoneNumber) {
      constraints.push(where('passengerPhone', '==', user.phoneNumber));
    }

    const q = constraints.length > 1 
      ? query(collection(db, 'bookings'), or(...constraints))
      : query(collection(db, 'bookings'), ...constraints);

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
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'trips');
    });
    return unsubscribe;
  }, []);

  const handleDeleteAccountCombined = async () => {
    if (!user) return;
    setDeletingProgress(true);
    setDeleteError(null);
    try {
      // 1. Delete Firestore user document
      const userDocRef = doc(db, 'users', user.uid);
      await deleteDoc(userDocRef);

      // 2. Delete Firestore bookings for this user
      const bookingsQuery = query(collection(db, 'bookings'), where('userId', '==', user.uid));
      try {
        const bookingsSnapshot = await getDocs(bookingsQuery);
        const deletePromises = bookingsSnapshot.docs.map(bDoc => deleteDoc(bDoc.ref));
        await Promise.all(deletePromises);
      } catch (bkErr) {
        console.warn('Could not delete some bookings:', bkErr);
      }

      // 3. Delete linked devices if any
      const devicesQuery = query(collection(db, 'devices'), where('userId', '==', user.uid));
      try {
        const devicesSnapshot = await getDocs(devicesQuery);
        const devicePromises = devicesSnapshot.docs.map(dDoc => deleteDoc(dDoc.ref));
        await Promise.all(devicePromises);
      } catch (devErr) {
        console.warn('Could not delete some devices:', devErr);
      }

      // 4. Attempt to delete Firebase Auth user account
      try {
        await user.delete();
      } catch (authErr: any) {
        console.warn('Firebase Auth user deletion failed:', authErr);
        // If it requires recent login, we must sign out since data is already deleted
        await logout();
        setDeleteModalOpen(false);
        alert('تم حذف بياناتك الشخصية وحجوزاتك بنجاح من قاعدة البيانات. لتجربة حذف الحساب بالكامل من نظام المصادقة، يرجى تسجيل الدخول مجدداً ثم إتمام العملية.');
        return;
      }

      setDeleteModalOpen(false);
    } catch (err: any) {
      console.error('Error deleting account:', err);
      setDeleteError(err.message || 'حدث خطأ أثناء حذف الحساب. يرجى المحاولة مرة أخرى.');
    } finally {
      setDeletingProgress(false);
    }
  };

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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-stone-150">
        <div className="flex items-center gap-4">
          <div className="bg-emerald-100 p-4 rounded-full text-emerald-600">
            <User size={32} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-stone-900">{profile?.displayName || 'مستخدم'}</h1>
            <p className="text-stone-500 text-sm">{user.email || user.phoneNumber}</p>
          </div>
        </div>
        <button
          onClick={() => setDeleteModalOpen(true)}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 font-medium rounded-xl transition-all duration-200 text-sm select-none"
        >
          <Trash2 size={16} />
          <span>حذف الحساب والبيانات</span>
        </button>
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
                        <p className="text-[10px] text-stone-400 uppercase">المقعد</p>
                        <p className="text-sm font-bold">{booking.seatNumber}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-stone-400 uppercase">الحالة</p>
                        <span className={`text-[10px] px-2 py-1 rounded-full font-bold ${
                          booking.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700' : 
                          booking.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                          booking.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                          'bg-stone-100 text-stone-600'
                        }`}>
                          {booking.status === 'confirmed' ? 'مؤكد' : 
                           booking.status === 'pending' ? 'قيد الانتظار' :
                           booking.status === 'cancelled' ? 'ملغي' :
                           booking.status === 'completed' ? 'مكتمل' : 
                           booking.status}
                        </span>
                      </div>
                      <button 
                        onClick={() => handleDownloadTicket(booking, trip)}
                        disabled={downloadingId === booking.id || !trip}
                        className="p-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50"
                        title="تحميل التذكرة"
                      >
                        {downloadingId === booking.id ? <Loader2 className="animate-spin" size={18} /> : <Download size={18} />}
                      </button>
                    </div>

                    {/* Hidden Ticket Template for Download */}
                    {trip && (
                      <div className="fixed -left-[9999px] top-0">
                        <div 
                          id={`ticket-to-download-${booking.id}`}
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
                            direction: 'rtl'
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
                              <p style={{ fontSize: '11px', color: '#a8a29e', margin: 0, lineHeight: 1 }}>تذكرة سفر دولية</p>
                              <p style={{ fontWeight: 'bold', color: '#065f46', margin: 0, fontSize: '16px' }}>العوجان للسياحة</p>
                            </div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                              <div><p style={{ fontSize: '10px', textTransform: 'uppercase', color: '#a8a29e', margin: 0 }}>الاسم</p><p style={{ fontWeight: 'bold', color: '#1c1917', margin: 0 }}>{booking.passengerName}</p></div>
                              <div><p style={{ fontSize: '10px', textTransform: 'uppercase', color: '#a8a29e', margin: 0 }}>رقم الجواز</p><p style={{ fontWeight: 'bold', color: '#1c1917', margin: 0 }}>{booking.passportNumber || '---'}</p></div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                              <div><p style={{ fontSize: '10px', textTransform: 'uppercase', color: '#a8a29e', margin: 0 }}>رقم الحجز</p><p style={{ fontFamily: 'monospace', fontSize: '12px', color: '#1c1917', margin: 0 }}>{booking.id.slice(0, 8)}</p></div>
                              <div><p style={{ fontSize: '10px', textTransform: 'uppercase', color: '#a8a29e', margin: 0 }}>رقم التتبع</p><p style={{ fontFamily: 'monospace', fontSize: '12px', color: '#059669', margin: 0 }}>{trip.trackingNumber}</p></div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                              <div><p style={{ fontSize: '10px', textTransform: 'uppercase', color: '#a8a29e', margin: 0 }}>الهاتف</p><p style={{ fontWeight: 'bold', fontSize: '12px', color: '#1c1917', margin: 0 }}>{booking.passengerPhone}</p></div>
                            </div>
                            <div style={{ backgroundColor: '#ecfdf5', padding: '16px', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxSizing: 'border-box' }}>
                              <div><p style={{ fontSize: '10px', textTransform: 'uppercase', color: '#059669', margin: 0 }}>من</p><p style={{ fontWeight: 'bold', fontSize: '18px', color: '#065f46', margin: 0 }}>{trip.from}</p></div>
                              <div style={{ color: '#6ee7b7' }}>←</div>
                              <div style={{ textAlign: 'left' }}>
                                <p style={{ fontSize: '10px', textTransform: 'uppercase', color: '#059669', margin: 0 }}>إلى</p>
                                <p style={{ fontWeight: 'bold', fontSize: '18px', color: '#065f46', margin: 0 }}>{trip.to}</p>
                              </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px', textAlign: 'center' }}>
                              <div><p style={{ fontSize: '10px', textTransform: 'uppercase', color: '#a8a29e', margin: 0 }}>التاريخ</p><p style={{ fontWeight: 'bold', fontSize: '12px', color: '#1c1917', margin: 0 }}>{formatDateArabic(trip.date)}</p></div>
                              <div><p style={{ fontSize: '10px', textTransform: 'uppercase', color: '#a8a29e', margin: 0 }}>الوقت</p><p style={{ fontWeight: 'bold', fontSize: '12px', color: '#1c1917', margin: 0 }}>{trip.time}</p></div>
                              <div><p style={{ fontSize: '10px', textTransform: 'uppercase', color: '#a8a29e', margin: 0 }}>المقعد</p><p style={{ fontWeight: 'bold', fontSize: '12px', color: '#1c1917', margin: 0 }}>{booking.seatNumber}</p></div>
                              <div>
                                <p style={{ fontSize: '10px', textTransform: 'uppercase', color: '#a8a29e', margin: 0 }}>السعر</p>
                                <p style={{ fontWeight: 'bold', fontSize: '12px', color: '#059669', margin: 0 }}>
                                  {(() => {
                                    const priceInfo = getBookingPrice(booking, trip);
                                    return `${priceInfo.value} ${priceInfo.currency}`;
                                  })()}
                                </p>
                              </div>
                            </div>
                            <div style={{ backgroundColor: '#f8fafc', padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                              <p style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold', margin: 0 }}>🧳 يسمح لكل راكب عدد حقيبتين سفر مجاناً</p>
                            </div>
                          </div>
                          <div style={{ borderTop: '2px dashed #e7e5e4', paddingTop: '16px', display: 'flex', justifyContent: 'center' }}>
                            <div style={{ backgroundColor: '#f5f5f4', height: '48px', width: '100%', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontFamily: 'monospace', color: '#a8a29e' }}>
                              BARCODE_{booking.id.slice(0, 6)}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                </motion.div>
              );
            })}
          </div>
        )}
      </section>

      {/* Delete Account Confirmation Modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-stone-150 animate-in fade-in zoom-in-95 duration-200" style={{ direction: 'rtl' }}>
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <div className="bg-red-50 p-2.5 rounded-full text-red-600">
                <Trash2 size={24} />
              </div>
              <h3 className="text-lg font-bold">حذف الحساب والبيانات الشخصية</h3>
            </div>
            
            <p className="text-stone-600 text-sm leading-relaxed mb-4">
              هل أنت متأكد من رغبتك في حذف حسابك نهائياً؟ هذا الإجراء سيقوم بـ:
            </p>
            
            <ul className="list-disc list-inside text-xs text-stone-500 space-y-2 mb-6 pr-2">
              <li>حذف ملفك الشخصي بالكامل من قاعدة البيانات.</li>
              <li>حذف جميع تذاكر السفر والحجوزات المرتبطة بحسابك نهائياً.</li>
              <li>مسح معلومات جهازك المسجلة لنظام الإشعارات.</li>
              <li>حذف بيانات الاعتمادات وتسجيل الدخول الخاص بك.</li>
            </ul>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-6 text-amber-800 text-xs flex gap-2">
              <div className="text-amber-600 shrink-0 mt-0.5">
                <ShieldAlert size={18} />
              </div>
              <span>
                <strong className="block mb-0.5">تنبيه هام جداً:</strong>
                هذا الإجراء نهائي ولا يمكن التراجع عنه أو استعادة التذاكر والحجوزات المحذوفة لاحقاً.
              </span>
            </div>

            {deleteError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs">
                {deleteError}
              </div>
            )}

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteModalOpen(false)}
                disabled={deletingProgress}
                className="flex-1 py-2.5 px-4 bg-stone-100 hover:bg-stone-200 text-stone-700 font-medium rounded-xl transition-colors text-sm disabled:opacity-50 select-none"
              >
                إلغاء
              </button>
              <button
                onClick={handleDeleteAccountCombined}
                disabled={deletingProgress}
                className="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white font-medium rounded-xl transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-50 select-none"
              >
                {deletingProgress ? (
                  <>
                    <Loader2 className="animate-spin" size={16} />
                    <span>جاري الحذف...</span>
                  </>
                ) : (
                  <span>نعم، احذف نهائياً</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
