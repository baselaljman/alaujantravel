import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, or } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { Booking, Trip } from '../types';
import { Calendar, Download, MapPin, Ticket, User, Loader2, Bell, RefreshCw, Send, Share as ShareIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import html2canvas from 'html2canvas';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export default function Profile() {
  const { user, profile } = useAuth();
  const [bookings, setBookings] = useState<(Booking & { trip?: Trip })[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const ticketRef = useRef<HTMLDivElement>(null);

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
              clonedDoc.head.appendChild(style);
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
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'trips');
    });
    return unsubscribe;
  }, []);

  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const handleTestPush = async () => {
    const token = (window as any).fcmToken || profile?.fcmToken;
    if (!token) {
      setTestResult('لم يتم العثور على رمز FCM. تأكد من منح الأذونات.');
      return;
    }

    setTestLoading(true);
    setTestResult(null);
    try {
      const response = await fetch('/api/send-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokens: [token],
          title: 'اختبار الإشعارات',
          body: 'هذا إشعار تجريبي من حسابك الشخصي.',
          data: { type: 'test' }
        })
      });

      if (response.ok) {
        setTestResult('تم إرسال طلب الإشعار بنجاح! انتظر وصوله.');
      } else {
        const err = await response.json();
        setTestResult(`فشل الإرسال: ${err.error}`);
      }
    } catch (e: any) {
      setTestResult(`خطأ: ${e.message}`);
    } finally {
      setTestLoading(false);
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
      <div className="flex items-center gap-4">
        <div className="bg-emerald-100 p-4 rounded-full text-emerald-600">
          <User size={32} />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{profile?.displayName || 'مستخدم'}</h1>
          <p className="text-stone-500 text-sm">{user.email}</p>
        </div>
      </div>

      {/* Notification Debug Section */}
      <div className="card bg-stone-50 border-stone-200">
        <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
          <Bell className="text-emerald-600" size={20} />
          إعدادات الإشعارات
        </h2>
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold">حالة الإشعارات</p>
              <p className="text-xs text-stone-500">
                {profile?.fcmToken ? 'مسجل بنجاح' : 'غير مسجل (تأكد من منح الأذونات)'}
              </p>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => window.location.reload()}
                className="btn-secondary py-2 px-4 text-xs flex items-center gap-2"
              >
                <RefreshCw size={14} />
                تحديث الحالة
              </button>
              <button 
                onClick={handleTestPush}
                disabled={testLoading || !profile?.fcmToken}
                className="btn-primary py-2 px-4 text-xs flex items-center gap-2"
              >
                {testLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                إرسال إشعار تجريبي
              </button>
            </div>
          </div>
          
          {testResult && (
            <div className={`p-3 rounded-xl text-xs ${testResult.includes('بنجاح') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
              {testResult}
            </div>
          )}

          {profile?.fcmToken && (
            <div className="bg-stone-100 p-3 rounded-xl">
              <p className="text-[10px] text-stone-400 uppercase mb-1">FCM Token (للمطورين)</p>
              <p className="text-[10px] font-mono break-all text-stone-600">{profile.fcmToken}</p>
            </div>
          )}
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
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <img src="https://xn--ogbhrq.vip/wp-content/uploads/2026/03/bus-svgrepo-com-1.svg" alt="Logo" style={{ width: '48px', height: '48px' }} />
                            <div style={{ textAlign: 'right' }}>
                              <p style={{ fontSize: '12px', color: '#a8a29e', margin: 0 }}>تذكرة سفر دولية</p>
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
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', textAlign: 'center' }}>
                              <div><p style={{ fontSize: '10px', textTransform: 'uppercase', color: '#a8a29e', margin: 0 }}>التاريخ</p><p style={{ fontWeight: 'bold', fontSize: '12px', color: '#1c1917', margin: 0 }}>{formatDateArabic(trip.date)}</p></div>
                              <div><p style={{ fontSize: '10px', textTransform: 'uppercase', color: '#a8a29e', margin: 0 }}>الوقت</p><p style={{ fontWeight: 'bold', fontSize: '12px', color: '#1c1917', margin: 0 }}>{trip.time}</p></div>
                              <div><p style={{ fontSize: '10px', textTransform: 'uppercase', color: '#a8a29e', margin: 0 }}>المقعد</p><p style={{ fontWeight: 'bold', fontSize: '12px', color: '#1c1917', margin: 0 }}>{booking.seatNumber}</p></div>
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
    </div>
  );
}
