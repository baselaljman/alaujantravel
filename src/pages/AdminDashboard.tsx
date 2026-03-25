import React, { useState, useEffect } from 'react';
import { 
  collection, onSnapshot, addDoc, updateDoc, doc, deleteDoc, 
  query, where, runTransaction, getDocs 
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Trip, UserProfile, Booking, Bus, City, Banner, Parcel } from '../types';
import { useAuth } from '../hooks/useAuth';
import { useCurrency } from '../hooks/useCurrency';
import { 
  Plus, Trash2, Edit, Bus as BusIcon, Users, Package, 
  Calendar, Shield, UserCheck, Settings, LayoutDashboard,
  CreditCard, MapPin, Clock, AlertCircle, X, Printer, Download,
  Image as ImageIcon, DollarSign
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import AdminCities from './AdminCities';
import html2canvas from 'html2canvas';

type AdminTab = 'dashboard' | 'trips' | 'bookings' | 'drivers' | 'buses' | 'staff' | 'cities' | 'banners' | 'parcels';

export default function AdminDashboard() {
  const { profile } = useAuth();
  const { currency, formatPrice, toBaseCurrency } = useCurrency();
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  
  // Data States
  const [trips, setTrips] = useState<Trip[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<{ coll: string, id: string, label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Form States
  const [newTrip, setNewTrip] = useState<Partial<Trip>>({
    from: '', to: '', date: '', time: '', 
    busNumber: '', price: 0, priceSAR: 300, priceSYP: 1000000, busType: 'Standard', 
    totalSeats: 45, status: 'scheduled'
  });
  const [newBus, setNewBus] = useState<Partial<Bus>>({
    plateNumber: '', busNumber: '', model: '', 
    capacity: 45, type: 'Standard', status: 'active',
    driverId: ''
  });
  const [newUser, setNewUser] = useState({
    displayName: '', email: '', phoneNumber: '', role: 'driver' as any
  });
  const [newBanner, setNewBanner] = useState<Partial<Banner>>({
    imageUrl: '', link: '', order: 0, active: true
  });
  const [newParcel, setNewParcel] = useState<Partial<Parcel>>({
    senderName: '', senderPhone: '', receiverName: '', receiverPhone: '',
    from: '', to: '', tripId: '', trackingNumber: '', note: '', price: 0, 
    currency: 'SAR', status: 'pending'
  });

  // Booking Management States
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);

  const formatDateArabic = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return new Intl.DateTimeFormat('ar-EG', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }).format(date);
    } catch (e) {
      return dateStr;
    }
  };

  const handlePrintTicket = async (booking: Booking, trip: Trip) => {
    setIsPrinting(true);
    try {
      const element = document.getElementById(`print-ticket-${booking.id}`);
      if (!element) return;
      
      element.style.display = 'block';
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
      element.style.display = 'none';
      
      const imgData = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `ticket-${booking.passengerName}-${booking.id.slice(0, 8)}.png`;
      link.href = imgData;
      link.click();
    } catch (err) {
      console.error('Error printing ticket:', err);
    } finally {
      setIsPrinting(false);
    }
  };

  const handlePrintPassengerList = async () => {
    const trip = trips.find(t => t.id === selectedTripId);
    if (!trip) return;

    const tripBookings = bookings.filter(b => b.tripId === selectedTripId);
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
      <html dir="rtl">
        <head>
          <title>كشف الركاب - ${trip.from} إلى ${trip.to}</title>
          <style>
            body { font-family: 'Arial', sans-serif; padding: 40px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 12px; text-align: right; }
            th { background-color: #f8f9fa; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #059669; padding-bottom: 20px; }
            .trip-info { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
            .footer { margin-top: 40px; text-align: center; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>كشف ركاب الرحلة</h1>
            <p>العوجان للسياحة والسفر</p>
          </div>
          <div class="trip-info">
            <div><strong>من:</strong> ${trip.from}</div>
            <div><strong>إلى:</strong> ${trip.to}</div>
            <div><strong>التاريخ:</strong> ${formatDateArabic(trip.date)}</div>
            <div><strong>الوقت:</strong> ${trip.time}</div>
            <div><strong>رقم التتبع:</strong> ${trip.trackingNumber || '---'}</div>
            <div><strong>عدد الركاب:</strong> ${tripBookings.length}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>اسم الراكب</th>
                <th>رقم الهاتف</th>
                <th>رقم الجواز</th>
                <th>المقعد</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              ${tripBookings.map((b, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td>${b.passengerName}</td>
                  <td>${b.passengerPhone}</td>
                  <td>${b.passportNumber || '---'}</td>
                  <td>${b.seatNumber}</td>
                  <td>${b.status === 'confirmed' ? 'مؤكد' : 'قيد الانتظار'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="footer">
            تم استخراج هذا الكشف بتاريخ ${new Date().toLocaleString('ar-EG')}
          </div>
          <script>
            window.onload = () => {
              window.print();
              window.onafterprint = () => window.close();
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };
  const [editBookingData, setEditBookingData] = useState({
    passengerName: '',
    passengerPhone: '',
    passportNumber: '',
    seatNumber: 0
  });

  useEffect(() => {
    if (profile?.role !== 'admin' && profile?.role !== 'staff') return;

    const unsubTrips = onSnapshot(collection(db, 'trips'), (snap) => {
      setTrips(snap.docs.map(d => ({ id: d.id, ...d.data() } as Trip)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'trips');
    });

    const unsubBookings = onSnapshot(collection(db, 'bookings'), (snap) => {
      setBookings(snap.docs.map(d => ({ id: d.id, ...d.data() } as Booking)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'bookings');
    });

    const unsubBuses = onSnapshot(collection(db, 'buses'), (snap) => {
      setBuses(snap.docs.map(d => ({ id: d.id, ...d.data() } as Bus)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'buses');
    });

    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    const unsubCities = onSnapshot(collection(db, 'cities'), (snap) => {
      setCities(snap.docs.map(d => ({ id: d.id, ...d.data() } as City)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'cities');
    });

    const unsubBanners = onSnapshot(collection(db, 'banners'), (snap) => {
      setBanners(snap.docs.map(d => ({ id: d.id, ...d.data() } as Banner)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'banners');
    });

    const unsubParcels = onSnapshot(collection(db, 'parcels'), (snap) => {
      setParcels(snap.docs.map(d => ({ id: d.id, ...d.data() } as Parcel)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'parcels');
    });

    setLoading(false);
    return () => {
      unsubTrips();
      unsubBookings();
      unsubBuses();
      unsubUsers();
      unsubCities();
      unsubBanners();
      unsubParcels();
    };
  }, [profile]);

  // Handlers
  const handleUpdateTripStatus = async (tripId: string, status: string) => {
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
    } catch (error) {
      console.error('Error updating trip status:', error);
    }
  };

  const handleAddTrip = async () => {
    if (!newTrip.date || !newTrip.time || !newTrip.busNumber) return;
    
    try {
      let trackingNumber = 'wa001';
      
      await runTransaction(db, async (transaction) => {
        const counterRef = doc(db, 'metadata', 'trip_counter');
        const counterSnap = await transaction.get(counterRef);
        
        let nextCount = 1;
        if (counterSnap.exists()) {
          nextCount = counterSnap.data().count + 1;
        }
        
        transaction.set(counterRef, { count: nextCount });
        trackingNumber = `wa${String(nextCount).padStart(3, '0')}`;
      });

      const selectedBus = buses.find(b => b.busNumber === newTrip.busNumber);

      await addDoc(collection(db, 'trips'), { 
        ...newTrip, 
        price: newTrip.priceSAR || 0, // Default to SAR for backward compatibility
        availableSeats: newTrip.totalSeats,
        bookedSeats: [],
        trackingNumber,
        driverId: selectedBus?.driverId || ''
      });
      setNewTrip({ ...newTrip, date: '', time: '', busNumber: '', priceSAR: 300, priceSYP: 1000000 });
    } catch (error) {
      console.error('Error adding trip:', error);
    }
  };

  const handleAddBus = async () => {
    if (!newBus.plateNumber || !newBus.busNumber) return;
    await addDoc(collection(db, 'buses'), newBus);
    setNewBus({ plateNumber: '', busNumber: '', model: '', capacity: 45, type: 'Standard', status: 'active', driverId: '' });
  };

  const handleAddBanner = async () => {
    if (!newBanner.imageUrl) return;
    await addDoc(collection(db, 'banners'), {
      ...newBanner,
      order: Number(newBanner.order) || 0,
      active: true
    });
    setNewBanner({ imageUrl: '', link: '', order: 0, active: true });
  };

  const toggleBannerStatus = async (id: string, currentStatus: boolean) => {
    await updateDoc(doc(db, 'banners', id), { active: !currentStatus });
  };

  const handleAddParcel = async () => {
    if (!newParcel.senderName || !newParcel.receiverName || !newParcel.tripId) return;
    
    const selectedTrip = trips.find(t => t.id === newParcel.tripId);
    if (!selectedTrip) return;

    await addDoc(collection(db, 'parcels'), {
      ...newParcel,
      trackingNumber: selectedTrip.trackingNumber,
      from: selectedTrip.from,
      to: selectedTrip.to,
      status: 'pending',
      createdAt: new Date().toISOString()
    });
    setNewParcel({
      senderName: '', senderPhone: '', receiverName: '', receiverPhone: '',
      from: '', to: '', tripId: '', trackingNumber: '', note: '', price: 0, 
      currency: 'SAR', status: 'pending'
    });
  };

  const handlePrintParcelInvoice = (parcel: Parcel) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
      <html dir="rtl">
        <head>
          <title>فاتورة شحن طرد - ${parcel.trackingNumber}</title>
          <style>
            body { font-family: 'Arial', sans-serif; padding: 40px; color: #333; }
            .invoice-box { max-width: 800px; margin: auto; padding: 30px; border: 1px solid #eee; box-shadow: 0 0 10px rgba(0, 0, 0, .15); font-size: 16px; line-height: 24px; }
            .header { border-bottom: 2px solid #059669; padding-bottom: 20px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
            .company-info h1 { margin: 0; color: #059669; }
            .invoice-details { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
            .section-title { font-weight: bold; color: #059669; border-bottom: 1px solid #eee; margin-bottom: 10px; padding-bottom: 5px; }
            .info-row { margin-bottom: 8px; }
            .info-label { font-weight: bold; color: #666; }
            .price-section { margin-top: 30px; padding: 20px; background: #f9f9f9; border-radius: 10px; text-align: left; }
            .total-price { font-size: 24px; font-weight: bold; color: #059669; }
            .footer { margin-top: 50px; text-align: center; font-size: 12px; color: #999; border-top: 1px solid #eee; padding-top: 20px; }
            @media print { .no-print { display: none; } }
          </style>
        </head>
        <body>
          <div class="invoice-box">
            <div class="header">
              <div class="company-info">
                <h1>العوجان للسياحة والسفر</h1>
                <p>خدمات شحن الطرود</p>
              </div>
              <div class="tracking">
                <p><strong>رقم التتبع:</strong> ${parcel.trackingNumber}</p>
                <p><strong>التاريخ:</strong> ${new Date(parcel.createdAt).toLocaleDateString('ar-EG')}</p>
              </div>
            </div>

            <div class="invoice-details">
              <div>
                <div class="section-title">معلومات المرسل</div>
                <div class="info-row"><span class="info-label">الاسم:</span> ${parcel.senderName}</div>
                <div class="info-row"><span class="info-label">الهاتف:</span> ${parcel.senderPhone}</div>
              </div>
              <div>
                <div class="section-title">معلومات المستلم</div>
                <div class="info-row"><span class="info-label">الاسم:</span> ${parcel.receiverName}</div>
                <div class="info-row"><span class="info-label">الهاتف:</span> ${parcel.receiverPhone}</div>
              </div>
            </div>

            <div class="invoice-details">
              <div>
                <div class="section-title">مسار الشحنة</div>
                <div class="info-row"><span class="info-label">من:</span> ${parcel.from}</div>
                <div class="info-row"><span class="info-label">إلى:</span> ${parcel.to}</div>
              </div>
              <div>
                <div class="section-title">تفاصيل إضافية</div>
                <div class="info-row"><span class="info-label">ملاحظات:</span> ${parcel.note || '---'}</div>
                <div class="info-row"><span class="info-label">الحالة:</span> ${parcel.status === 'pending' ? 'قيد الانتظار' : parcel.status === 'shipped' ? 'تم الشحن' : 'تم التسليم'}</div>
              </div>
            </div>

            <div class="price-section">
              <span class="info-label">إجمالي تكلفة الشحن:</span>
              <div class="total-price">${parcel.price?.toLocaleString('ar-EG')} ${parcel.currency === 'SYP' ? 'ل.س' : 'ريال'}</div>
            </div>

            <div class="footer">
              <p>شكراً لتعاملكم معنا. يرجى الاحتفاظ بهذه الفاتورة لتتبع شحنتكم.</p>
              <p>هذه الوثيقة صدرت إلكترونياً ولا تحتاج لختم.</p>
            </div>
          </div>
          <script>
            window.onload = () => {
              window.print();
              window.onafterprint = () => window.close();
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  const handleAddUser = async () => {
    if (!newUser.email || !newUser.displayName) return;
    // Check if user already exists
    const existing = users.find(u => u.email === newUser.email);
    if (existing) {
      setError('هذا البريد الإلكتروني مسجل مسبقاً');
      return;
    }
    
    const userData: any = {
      ...newUser,
      createdAt: new Date().toISOString(),
    };
    
    if (newUser.role === 'staff') {
      userData.permissions = [];
    }

    await addDoc(collection(db, 'users'), userData);
    setNewUser({ displayName: '', email: '', phoneNumber: '', role: newUser.role });
  };

  const updateRole = async (uid: string, role: any, permissions?: string[]) => {
    await updateDoc(doc(db, 'users', uid), { role, permissions: permissions || [] });
  };

  const handleDeleteRequest = (coll: string, id: string, label: string) => {
    setDeleteConfirm({ coll, id, label });
  };

  const executeDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteDoc(doc(db, deleteConfirm.coll, deleteConfirm.id));
      setDeleteConfirm(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${deleteConfirm.coll}/${deleteConfirm.id}`);
    }
  };

  if (profile?.role !== 'admin' && profile?.role !== 'staff') {
    return <div className="text-center py-20">عذراً، هذه الصفحة مخصصة للإدارة فقط.</div>;
  }

  const drivers = users.filter(u => u.role === 'driver');
  const staff = users.filter(u => u.role === 'staff' || u.role === 'admin');

  const totalRevenue = bookings
    .filter(b => b.status === 'confirmed')
    .reduce((acc, b) => {
      const trip = trips.find(t => t.id === b.tripId);
      return acc + (trip?.priceSAR || trip?.price || 0);
    }, 0) + parcels.reduce((acc, p) => {
      // Convert parcel price to SAR if it was entered in SYP
      const priceInSAR = p.currency === 'SYP' ? (p.price || 0) / 3500 : (p.price || 0);
      return acc + priceInSAR;
    }, 0);

  const activeBannersCount = banners.filter(b => b.active).length;
  const citiesCount = cities.length;
  const parcelsCount = parcels.length;

  const startEditingBooking = (booking: any) => {
    setEditingBookingId(booking.id);
    setEditBookingData({
      passengerName: booking.passengerName,
      passengerPhone: booking.passengerPhone,
      passportNumber: booking.passportNumber || '',
      seatNumber: booking.seatNumber
    });
  };

  const handleSaveBookingEdit = async (bookingId: string) => {
    try {
      const oldBooking = bookings.find(b => b.id === bookingId);
      if (!oldBooking) return;

      // Update the booking document
      await updateDoc(doc(db, 'bookings', bookingId), {
        ...editBookingData
      });

      // If seat number changed, update the trip's bookedSeats
      if (oldBooking.seatNumber !== editBookingData.seatNumber) {
        const trip = trips.find(t => t.id === oldBooking.tripId);
        if (trip) {
          const newBookedSeats = (trip.bookedSeats || []).filter(s => s !== oldBooking.seatNumber);
          newBookedSeats.push(editBookingData.seatNumber);
          await updateDoc(doc(db, 'trips', trip.id), {
            bookedSeats: newBookedSeats
          });
        }
      }

      setEditingBookingId(null);
    } catch (error) {
      console.error('Error updating booking:', error);
    }
  };

  const canSeeTab = (tab: AdminTab) => {
    if (profile?.role === 'admin') return true;
    if (profile?.role !== 'staff') return false;
    
    const perms = profile.permissions || [];
    switch (tab) {
      case 'dashboard': return true;
      case 'trips': return perms.includes('manage_trips');
      case 'bookings': return perms.includes('manage_bookings');
      case 'buses': return perms.includes('manage_buses');
      case 'drivers': return perms.includes('manage_users');
      case 'staff': return perms.includes('manage_users');
      case 'cities': return perms.includes('manage_cities') || profile?.role === 'admin';
      case 'banners': return perms.includes('manage_banners') || profile?.role === 'admin';
      case 'parcels': return perms.includes('manage_parcels') || profile?.role === 'admin';
      default: return false;
    }
  };

  const SidebarItem = ({ id, label, icon: Icon }: { id: AdminTab, label: string, icon: any }) => {
    if (!canSeeTab(id)) return null;
    return (
      <button 
        onClick={() => setActiveTab(id)}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
          activeTab === id ? 'bg-emerald-600 text-white shadow-lg' : 'text-stone-500 hover:bg-stone-100'
        }`}
      >
        <Icon size={20} />
        <span className="font-bold text-sm">{label}</span>
      </button>
    );
  };

  return (
    <div className="flex flex-col md:flex-row gap-8 min-h-[80vh]">
      {/* Sidebar */}
      <aside className="w-full md:w-64 space-y-2">
        <SidebarItem id="dashboard" label="لوحة الإحصائيات" icon={LayoutDashboard} />
        <SidebarItem id="trips" label="إدارة الرحلات" icon={Calendar} />
        <SidebarItem id="bookings" label="إدارة الحجوزات" icon={CreditCard} />
        <SidebarItem id="drivers" label="إدارة السائقين" icon={UserCheck} />
        <SidebarItem id="buses" label="إدارة الحافلات" icon={BusIcon} />
        <SidebarItem id="cities" label="إدارة المدن" icon={MapPin} />
        <SidebarItem id="banners" label="إدارة البنرات" icon={ImageIcon} />
        <SidebarItem id="parcels" label="إدارة الشحنات" icon={Package} />
        <SidebarItem id="staff" label="إدارة الموظفين" icon={Shield} />
      </aside>

      {/* Content Area */}
      <main className="flex-1">
        <AnimatePresence mode="wait">
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-2xl flex items-center justify-between mb-6"
            >
              <div className="flex items-center gap-2">
                <AlertCircle size={20} />
                <span className="text-sm font-bold">{error}</span>
              </div>
              <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
                <X size={20} />
              </button>
            </motion.div>
          )}

          {/* Confirmation Modal */}
          {deleteConfirm && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl text-center space-y-6"
              >
                <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
                  <Trash2 size={32} />
                </div>
                <div>
                  <h3 className="text-xl font-bold mb-2">تأكيد الحذف</h3>
                  <p className="text-stone-500 text-sm">هل أنت متأكد من حذف "{deleteConfirm.label}"؟ لا يمكن التراجع عن هذا الإجراء.</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={executeDelete} className="flex-1 bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 transition-colors">
                    حذف
                  </button>
                  <button onClick={() => setDeleteConfirm(null)} className="flex-1 bg-stone-100 text-stone-600 py-3 rounded-xl font-bold hover:bg-stone-200 transition-colors">
                    إلغاء
                  </button>
                </div>
              </motion.div>
            </div>
          )}
          {activeTab === 'dashboard' && canSeeTab('dashboard') && (
            <motion.div key="dashboard" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-8">
              <h2 className="text-2xl font-bold">نظرة عامة</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard label="الرحلات النشطة" value={trips.filter(t => t.status === 'active').length} icon={Calendar} color="bg-emerald-600" />
                <StatCard label="إجمالي الحجوزات" value={bookings.length} icon={CreditCard} color="bg-blue-600" />
                <StatCard label="إجمالي الشحنات" value={parcelsCount} icon={Package} color="bg-purple-600" />
                <StatCard label="إجمالي الإيرادات" value={formatPrice(totalRevenue)} icon={DollarSign} color="bg-rose-600" />
                <StatCard label="السائقين" value={drivers.length} icon={UserCheck} color="bg-stone-900" />
                <StatCard label="الموظفين" value={staff.length} icon={Shield} color="bg-indigo-600" />
                <StatCard label="الحافلات" value={buses.length} icon={BusIcon} color="bg-amber-600" />
                <StatCard label="المدن" value={citiesCount} icon={MapPin} color="bg-cyan-600" />
                <StatCard label="البنرات النشطة" value={activeBannersCount} icon={ImageIcon} color="bg-pink-600" />
              </div>
            </motion.div>
          )}

          {activeTab === 'trips' && canSeeTab('trips') && (
            <motion.div key="trips" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-8">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold">إدارة الرحلات</h2>
              </div>
              
              <div className="card space-y-4">
                <h3 className="font-bold text-emerald-600">إضافة رحلة جديدة</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <select 
                    value={newTrip.from} 
                    onChange={e => setNewTrip({...newTrip, from: e.target.value})} 
                    className="bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">من</option>
                    {cities.map(c => <option key={c.id} value={c.name}>{c.name} ({c.country})</option>)}
                  </select>
                  <select 
                    value={newTrip.to} 
                    onChange={e => setNewTrip({...newTrip, to: e.target.value})} 
                    className="bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">إلى</option>
                    {cities.map(c => <option key={c.id} value={c.name}>{c.name} ({c.country})</option>)}
                  </select>
                  <input type="date" value={newTrip.date} onChange={e => setNewTrip({...newTrip, date: e.target.value})} className="bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                  <input type="time" value={newTrip.time} onChange={e => setNewTrip({...newTrip, time: e.target.value})} className="bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                  <select value={newTrip.busNumber} onChange={e => setNewTrip({...newTrip, busNumber: e.target.value})} className="bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500">
                    <option value="">اختر الحافلة</option>
                    {buses.map(b => <option key={b.id} value={b.busNumber}>{b.busNumber} ({b.plateNumber})</option>)}
                  </select>
                  <input type="number" placeholder="السعر (ريال)" value={newTrip.priceSAR} onChange={e => setNewTrip({...newTrip, priceSAR: Number(e.target.value)})} className="bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                  <input type="number" placeholder="السعر (ل.س)" value={newTrip.priceSYP} onChange={e => setNewTrip({...newTrip, priceSYP: Number(e.target.value)})} className="bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                  <button onClick={handleAddTrip} className="btn-primary col-span-full">إضافة الرحلة</button>
                </div>
              </div>

              <div className="overflow-x-auto card p-0">
                <table className="w-full text-right">
                  <thead className="bg-stone-50 border-b">
                    <tr className="text-xs text-stone-400 uppercase">
                      <th className="p-4">رقم التتبع</th>
                      <th className="p-4">الرحلة</th>
                      <th className="p-4">التاريخ</th>
                      <th className="p-4">الحافلة</th>
                      <th className="p-4">السعر (ريال)</th>
                      <th className="p-4">السعر (ل.س)</th>
                      <th className="p-4">السائق</th>
                      <th className="p-4">الحالة</th>
                      <th className="p-4">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {trips.map(trip => (
                      <tr key={trip.id} className="text-sm">
                        <td className="p-4 font-mono font-bold text-emerald-600">{trip.trackingNumber}</td>
                        <td className="p-4 font-bold">{trip.from} ← {trip.to}</td>
                        <td className="p-4">{trip.date} {trip.time}</td>
                        <td className="p-4">{trip.busNumber}</td>
                        <td className="p-4 font-bold text-emerald-600">{trip.priceSAR?.toLocaleString() || trip.price?.toLocaleString()} ريال</td>
                        <td className="p-4 font-bold text-emerald-600">{trip.priceSYP?.toLocaleString()} ل.س</td>
                        <td className="p-4">
                          <select 
                            value={trip.driverId || ''} 
                            onChange={(e) => updateDoc(doc(db, 'trips', trip.id), { driverId: e.target.value })}
                            className="bg-stone-100 rounded-lg px-2 py-1 text-xs"
                          >
                            <option value="">لا يوجد</option>
                            {drivers.map(d => <option key={d.uid} value={d.uid}>{d.displayName}</option>)}
                          </select>
                        </td>
                        <td className="p-4">
                          <select 
                            value={trip.status} 
                            onChange={(e) => handleUpdateTripStatus(trip.id, e.target.value)}
                            className="bg-stone-100 rounded-lg px-2 py-1 text-xs"
                          >
                            <option value="scheduled">مجدولة</option>
                            <option value="active">نشطة</option>
                            <option value="completed">مكتملة</option>
                            <option value="cancelled">ملغاة</option>
                          </select>
                        </td>
                        <td className="p-4">
                          <button onClick={() => handleDeleteRequest('trips', trip.id, `${trip.from} ← ${trip.to}`)} className="text-red-500 p-2 hover:bg-red-50 rounded-lg">
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {activeTab === 'buses' && canSeeTab('buses') && (
            <motion.div key="buses" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-8">
              <h2 className="text-2xl font-bold">إدارة الحافلات</h2>
              <div className="card space-y-4">
                <h3 className="font-bold text-emerald-600">إضافة حافلة جديدة</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <input type="text" placeholder="رقم اللوحة" value={newBus.plateNumber} onChange={e => setNewBus({...newBus, plateNumber: e.target.value})} className="bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                  <input type="text" placeholder="رقم الحافلة الداخلي" value={newBus.busNumber} onChange={e => setNewBus({...newBus, busNumber: e.target.value})} className="bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                  <input type="text" placeholder="الموديل" value={newBus.model} onChange={e => setNewBus({...newBus, model: e.target.value})} className="bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                  <input type="number" placeholder="السعة" value={newBus.capacity} onChange={e => setNewBus({...newBus, capacity: Number(e.target.value)})} className="bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                  <select value={newBus.type} onChange={e => setNewBus({...newBus, type: e.target.value as any})} className="bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500">
                    <option value="Standard">عادية</option>
                    <option value="VIP">VIP</option>
                  </select>
                  <select value={newBus.driverId} onChange={e => setNewBus({...newBus, driverId: e.target.value})} className="bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500">
                    <option value="">اختر السائق</option>
                    {drivers.map(d => <option key={d.uid} value={d.uid}>{d.displayName}</option>)}
                  </select>
                  <button onClick={handleAddBus} className="btn-primary col-span-full">إضافة حافلة</button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {buses.map(bus => {
                  const driver = drivers.find(d => d.uid === bus.driverId);
                  return (
                    <div key={bus.id} className="card border-2 border-stone-100 hover:border-emerald-500 transition-all group">
                      <div className="flex justify-between items-start mb-4">
                        <div className="bg-stone-100 p-3 rounded-2xl group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                          <BusIcon size={24} />
                        </div>
                        <button onClick={() => handleDeleteRequest('buses', bus.id, `الحافلة ${bus.busNumber}`)} className="text-stone-300 hover:text-red-500 transition-colors">
                          <Trash2 size={18} />
                        </button>
                      </div>
                      <h4 className="font-bold text-lg">{bus.busNumber}</h4>
                      <p className="text-xs text-stone-400 mb-2">{bus.plateNumber} • {bus.model}</p>
                      <p className="text-xs font-bold text-emerald-600 mb-4">
                        {driver ? `السائق: ${driver.displayName}` : 'بدون سائق'}
                      </p>
                      <div className="flex justify-between items-center text-sm">
                        <span className={`px-2 py-1 rounded-lg font-bold text-[10px] ${bus.type === 'VIP' ? 'bg-amber-100 text-amber-700' : 'bg-stone-100 text-stone-600'}`}>
                          {bus.type}
                        </span>
                        <select 
                          value={bus.status} 
                          onChange={(e) => updateDoc(doc(db, 'buses', bus.id), { status: e.target.value })}
                          className="text-xs bg-transparent font-bold outline-none"
                        >
                          <option value="active">نشطة</option>
                          <option value="maintenance">صيانة</option>
                          <option value="inactive">متوقفة</option>
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {activeTab === 'bookings' && canSeeTab('bookings') && (
            <motion.div key="bookings" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-8">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold">إدارة الحجوزات</h2>
                {selectedTripId && (
                  <button 
                    onClick={() => setSelectedTripId(null)}
                    className="text-sm text-emerald-600 font-bold hover:underline"
                  >
                    ← العودة لقائمة الرحلات
                  </button>
                )}
              </div>

              {!selectedTripId ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {trips.filter(t => bookings.some(b => b.tripId === t.id)).map(trip => {
                    const tripBookings = bookings.filter(b => b.tripId === trip.id);
                    return (
                      <div 
                        key={trip.id} 
                        onClick={() => setSelectedTripId(trip.id)}
                        className="card border-2 border-stone-100 hover:border-emerald-500 cursor-pointer transition-all group"
                      >
                        <div className="flex justify-between items-start mb-4">
                          <div className="bg-stone-100 p-3 rounded-2xl group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                            <BusIcon size={24} />
                          </div>
                          <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold">
                            {tripBookings.length} حجز
                          </span>
                        </div>
                        <h3 className="font-bold text-lg">{trip.from} ← {trip.to}</h3>
                        <div className="flex items-center gap-4 mt-2 text-stone-500 text-sm">
                          <div className="flex items-center gap-1">
                            <Calendar size={14} />
                            <span>{trip.date}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock size={14} />
                            <span>{trip.time}</span>
                          </div>
                        </div>
                        <p className="text-xs text-stone-400 mt-4">حافلة رقم: {trip.busNumber}</p>
                      </div>
                    );
                  })}
                  {trips.filter(t => bookings.some(b => b.tripId === t.id)).length === 0 && (
                    <div className="col-span-full card text-center py-12 text-stone-400">
                      لا توجد رحلات بها حجوزات حالياً.
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="card bg-emerald-50 border-emerald-100">
                    {(() => {
                      const trip = trips.find(t => t.id === selectedTripId);
                      return (
                        <div className="flex justify-between items-center">
                          <div>
                            <h3 className="font-bold text-emerald-800 text-lg">{trip?.from} ← {trip?.to}</h3>
                            <p className="text-sm text-emerald-600">{trip?.date} الساعة {trip?.time}</p>
                            <p className="text-xs font-mono text-emerald-500 mt-1">رقم التتبع: {trip?.trackingNumber}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-emerald-600 uppercase font-bold">الحافلة</p>
                            <p className="font-bold text-emerald-800">{trip?.busNumber}</p>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-emerald-600">قائمة الحجوزات</h3>
                    <button 
                      onClick={handlePrintPassengerList}
                      className="flex items-center gap-2 bg-stone-100 hover:bg-stone-200 text-stone-700 px-4 py-2 rounded-xl text-sm transition-colors"
                    >
                      <Printer size={16} />
                      طباعة الكشف كامل
                    </button>
                  </div>

                  <div className="overflow-x-auto card p-0">
                    <table className="w-full text-right">
                      <thead className="bg-stone-50 border-b">
                        <tr className="text-xs text-stone-400 uppercase">
                          <th className="p-4">المسافر</th>
                          <th className="p-4">رقم الجواز</th>
                          <th className="p-4">المقعد</th>
                          <th className="p-4">طريقة الدفع</th>
                          <th className="p-4">الحالة</th>
                          <th className="p-4">الإجراءات</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {bookings.filter(b => b.tripId === selectedTripId).map(booking => (
                          <tr key={booking.id} className="text-sm">
                            <td className="p-4">
                              {editingBookingId === booking.id ? (
                                <div className="space-y-2">
                                  <input 
                                    type="text" 
                                    value={editBookingData.passengerName} 
                                    onChange={e => setEditBookingData({...editBookingData, passengerName: e.target.value})}
                                    className="bg-white border p-1 rounded w-full text-xs"
                                  />
                                  <input 
                                    type="tel" 
                                    value={editBookingData.passengerPhone} 
                                    onChange={e => setEditBookingData({...editBookingData, passengerPhone: e.target.value})}
                                    className="bg-white border p-1 rounded w-full text-xs"
                                  />
                                </div>
                              ) : (
                                <>
                                  <p className="font-bold">{booking.passengerName}</p>
                                  <p className="text-xs text-stone-400">{booking.passengerPhone}</p>
                                </>
                              )}
                            </td>
                            <td className="p-4">
                              {editingBookingId === booking.id ? (
                                <input 
                                  type="text" 
                                  value={editBookingData.passportNumber} 
                                  onChange={e => setEditBookingData({...editBookingData, passportNumber: e.target.value})}
                                  className="bg-white border p-1 rounded w-full text-xs"
                                />
                              ) : (
                                <p className="font-mono text-xs">{booking.passportNumber || '---'}</p>
                              )}
                            </td>
                            <td className="p-4 font-mono">
                              {editingBookingId === booking.id ? (
                                <input 
                                  type="number" 
                                  value={editBookingData.seatNumber} 
                                  onChange={e => setEditBookingData({...editBookingData, seatNumber: Number(e.target.value)})}
                                  className="bg-white border p-1 rounded w-16 text-xs"
                                />
                              ) : (
                                booking.seatNumber
                              )}
                            </td>
                            <td className="p-4">
                              <span className={`text-[10px] px-2 py-1 rounded-full ${booking.paymentMethod === 'online' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                {booking.paymentMethod === 'online' ? 'إلكتروني' : 'عند السفر'}
                              </span>
                            </td>
                            <td className="p-4">
                              <select 
                                value={booking.status} 
                                onChange={(e) => updateDoc(doc(db, 'bookings', booking.id), { status: e.target.value })}
                                className="bg-stone-100 rounded-lg px-2 py-1 text-xs"
                              >
                                <option value="confirmed">مؤكد</option>
                                <option value="pending">قيد الانتظار</option>
                                <option value="cancelled">ملغى</option>
                              </select>
                            </td>
                            <td className="p-4">
                              <div className="flex items-center gap-2">
                                {editingBookingId === booking.id ? (
                                  <>
                                    <button 
                                      onClick={() => handleSaveBookingEdit(booking.id)}
                                      className="text-emerald-600 p-2 hover:bg-emerald-50 rounded-lg"
                                      title="حفظ"
                                    >
                                      <UserCheck size={16} />
                                    </button>
                                    <button 
                                      onClick={() => setEditingBookingId(null)}
                                      className="text-stone-400 p-2 hover:bg-stone-50 rounded-lg"
                                      title="إلغاء"
                                    >
                                      <AlertCircle size={16} />
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button 
                                      onClick={() => handlePrintTicket(booking, trips.find(t => t.id === booking.tripId)!)}
                                      className="text-emerald-600 p-2 hover:bg-emerald-50 rounded-lg"
                                      title="طباعة التذكرة"
                                    >
                                      <Printer size={16} />
                                    </button>
                                    <button 
                                      onClick={() => startEditingBooking(booking)}
                                      className="text-stone-400 p-2 hover:bg-stone-50 rounded-lg"
                                      title="تعديل"
                                    >
                                      <Edit size={16} />
                                    </button>
                                    <button 
                                      onClick={() => handleDeleteRequest('bookings', booking.id, `حجز ${booking.passengerName}`)} 
                                      className="text-red-500 p-2 hover:bg-red-50 rounded-lg"
                                      title="حذف"
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  </>
                                )}
                              </div>

                              {/* Hidden Flight Ticket Template */}
                              <div 
                                id={`print-ticket-${booking.id}`}
                                style={{ 
                                  display: 'none', 
                                  width: '800px', 
                                  height: '300px', 
                                  backgroundColor: '#ffffff',
                                  fontFamily: 'Arial, sans-serif',
                                  position: 'fixed',
                                  left: '-9999px'
                                }}
                              >
                                <div style={{ 
                                  display: 'flex', 
                                  height: '100%', 
                                  border: '2px solid #059669',
                                  borderRadius: '15px',
                                  overflow: 'hidden',
                                  direction: 'rtl',
                                  boxSizing: 'border-box'
                                }}>
                                  {/* Main Part */}
                                  <div style={{ 
                                    flex: 3, 
                                    padding: '20px', 
                                    position: 'relative', 
                                    borderLeft: '2px dashed #dddddd', 
                                    textAlign: 'right',
                                    boxSizing: 'border-box'
                                  }}>
                                    <div style={{ 
                                      display: 'flex', 
                                      justifyContent: 'space-between', 
                                      marginBottom: '20px', 
                                      alignItems: 'flex-start' 
                                    }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <img src="https://xn--ogbhrq.vip/wp-content/uploads/2026/03/bus-svgrepo-com-1.svg" alt="Logo" style={{ width: '40px', height: '40px' }} />
                                        <div>
                                          <h2 style={{ margin: 0, color: '#065f46', fontSize: '20px', fontWeight: 'bold' }}>العوجان للسياحة</h2>
                                          <p style={{ margin: 0, fontSize: '10px', color: '#666666' }}>INTERNATIONAL BOARDING PASS</p>
                                        </div>
                                      </div>
                                      <div style={{ textAlign: 'left' }}>
                                        <p style={{ margin: 0, fontSize: '12px', fontWeight: 'bold', color: '#1c1917' }}>رقم التتبع: {trips.find(t => t.id === booking.tripId)?.trackingNumber}</p>
                                        <p style={{ margin: 0, fontSize: '10px', color: '#059669', fontWeight: 'bold' }}>CONFIRMED</p>
                                      </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
                                      <div style={{ flex: 1 }}>
                                        <p style={{ margin: 0, fontSize: '10px', color: '#999999', fontWeight: 'normal' }}>اسم المسافر</p>
                                        <p style={{ margin: '2px 0 0 0', fontWeight: 'bold', fontSize: '14px', color: '#1c1917' }}>{booking.passengerName}</p>
                                      </div>
                                      <div style={{ flex: 1 }}>
                                        <p style={{ margin: 0, fontSize: '10px', color: '#999999', fontWeight: 'normal' }}>رقم الجواز</p>
                                        <p style={{ margin: '2px 0 0 0', fontWeight: 'bold', fontSize: '14px', color: '#1c1917' }}>{booking.passportNumber || '---'}</p>
                                      </div>
                                      <div style={{ flex: 1 }}>
                                        <p style={{ margin: 0, fontSize: '10px', color: '#999999', fontWeight: 'normal' }}>رقم الحجز</p>
                                        <p style={{ margin: '2px 0 0 0', fontWeight: 'bold', fontSize: '14px', fontFamily: 'monospace', color: '#1c1917' }}>{booking.id.slice(0, 8)}</p>
                                      </div>
                                    </div>

                                    <div style={{ 
                                      display: 'flex', 
                                      alignItems: 'center', 
                                      gap: '20px', 
                                      marginTop: '20px', 
                                      backgroundColor: '#ecfdf5', 
                                      padding: '15px', 
                                      borderRadius: '10px',
                                      boxSizing: 'border-box'
                                    }}>
                                      <div style={{ flex: 1 }}>
                                        <p style={{ margin: 0, fontSize: '10px', color: '#059669', fontWeight: 'normal' }}>من</p>
                                        <p style={{ margin: 0, fontWeight: 'bold', fontSize: '18px', color: '#065f46' }}>{trips.find(t => t.id === booking.tripId)?.from}</p>
                                      </div>
                                      <div style={{ color: '#6ee7b7', fontSize: '24px' }}>←</div>
                                      <div style={{ flex: 1, textAlign: 'left' }}>
                                        <p style={{ margin: 0, fontSize: '10px', color: '#059669', fontWeight: 'normal' }}>إلى</p>
                                        <p style={{ margin: 0, fontWeight: 'bold', fontSize: '18px', color: '#065f46' }}>{trips.find(t => t.id === booking.tripId)?.to}</p>
                                      </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '20px', marginTop: '20px' }}>
                                      <div style={{ flex: 1 }}>
                                        <p style={{ margin: 0, fontSize: '10px', color: '#999999', fontWeight: 'normal' }}>التاريخ</p>
                                        <p style={{ margin: 0, fontWeight: 'bold', color: '#1c1917' }}>{trips.find(t => t.id === booking.tripId)?.date}</p>
                                      </div>
                                      <div style={{ flex: 1 }}>
                                        <p style={{ margin: 0, fontSize: '10px', color: '#999999', fontWeight: 'normal' }}>الوقت</p>
                                        <p style={{ margin: 0, fontWeight: 'bold', color: '#1c1917' }}>{trips.find(t => t.id === booking.tripId)?.time}</p>
                                      </div>
                                      <div style={{ flex: 1 }}>
                                        <p style={{ margin: 0, fontSize: '10px', color: '#999999', fontWeight: 'normal' }}>المقعد</p>
                                        <p style={{ margin: 0, fontWeight: 'bold', fontSize: '18px', color: '#059669' }}>{booking.seatNumber}</p>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Stub Part */}
                                  <div style={{ 
                                    flex: 1, 
                                    padding: '20px', 
                                    backgroundColor: '#f9fafb', 
                                    textAlign: 'right',
                                    boxSizing: 'border-box'
                                  }}>
                                    <div style={{ textAlign: 'center', marginBottom: '15px' }}>
                                      <p style={{ margin: 0, fontSize: '10px', fontWeight: 'bold', color: '#065f46' }}>بطاقة صعود</p>
                                      <p style={{ margin: 0, fontSize: '8px', color: '#999999' }}>نسخة المسافر</p>
                                    </div>
                                    <div style={{ marginBottom: '10px' }}>
                                      <p style={{ margin: 0, fontSize: '8px', color: '#999999' }}>الاسم</p>
                                      <p style={{ margin: 0, fontWeight: 'bold', fontSize: '10px', color: '#1c1917' }}>{booking.passengerName}</p>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                                      <div>
                                        <p style={{ margin: 0, fontSize: '8px', color: '#999999' }}>من</p>
                                        <p style={{ margin: 0, fontWeight: 'bold', fontSize: '10px', color: '#1c1917' }}>{trips.find(t => t.id === booking.tripId)?.from}</p>
                                      </div>
                                      <div>
                                        <p style={{ margin: 0, fontSize: '8px', color: '#999999' }}>إلى</p>
                                        <p style={{ margin: 0, fontWeight: 'bold', fontSize: '10px', color: '#1c1917' }}>{trips.find(t => t.id === booking.tripId)?.to}</p>
                                      </div>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                                      <div>
                                        <p style={{ margin: 0, fontSize: '8px', color: '#999999' }}>التاريخ</p>
                                        <p style={{ margin: 0, fontWeight: 'bold', fontSize: '10px', color: '#1c1917' }}>{trips.find(t => t.id === booking.tripId)?.date}</p>
                                      </div>
                                      <div>
                                        <p style={{ margin: 0, fontSize: '8px', color: '#999999' }}>المقعد</p>
                                        <p style={{ margin: 0, fontWeight: 'bold', fontSize: '12px', color: '#059669' }}>{booking.seatNumber}</p>
                                      </div>
                                    </div>
                                    <div style={{ marginTop: '20px', textAlign: 'center' }}>
                                      <div style={{ backgroundColor: '#eeeeee', height: '30px', width: '100%', borderRadius: '4px' }}></div>
                                      <p style={{ margin: '5px 0 0 0', fontSize: '8px', fontFamily: 'monospace', color: '#999999' }}>{booking.id.slice(0, 10)}</p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'drivers' && canSeeTab('drivers') && (
            <motion.div key="drivers" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-8">
              <h2 className="text-2xl font-bold">إدارة السائقين</h2>
              
              <div className="card space-y-4">
                <h3 className="font-bold text-emerald-600">إضافة سائق جديد</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <input type="text" placeholder="الاسم الكامل" value={newUser.displayName} onChange={e => setNewUser({...newUser, displayName: e.target.value, role: 'driver'})} className="bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                  <input type="email" placeholder="البريد الإلكتروني" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value, role: 'driver'})} className="bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                  <input type="tel" placeholder="رقم الهاتف" value={newUser.phoneNumber} onChange={e => setNewUser({...newUser, phoneNumber: e.target.value, role: 'driver'})} className="bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                  <button onClick={handleAddUser} className="btn-primary col-span-full">إضافة السائق</button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {drivers.map(driver => (
                  <div key={driver.uid} className="card flex items-center gap-4">
                    <div className="w-12 h-12 bg-stone-100 rounded-full flex items-center justify-center font-bold text-stone-400">
                      {driver.displayName[0]}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold">{driver.displayName}</h4>
                      <p className="text-xs text-stone-400">{driver.email}</p>
                      <p className="text-xs text-stone-400">{driver.phoneNumber}</p>
                    </div>
                    <button onClick={() => updateRole(driver.uid, 'user')} className="text-xs text-red-500 hover:underline">إلغاء تعيين</button>
                  </div>
                ))}
                {drivers.length === 0 && <p className="text-stone-400 text-center col-span-full py-10">لا يوجد سائقين مسجلين حالياً.</p>}
              </div>
            </motion.div>
          )}

          {activeTab === 'cities' && canSeeTab('cities') && (
            <motion.div key="cities" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <AdminCities />
            </motion.div>
          )}

          {activeTab === 'staff' && canSeeTab('staff') && (
            <motion.div key="staff" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-8">
              <h2 className="text-2xl font-bold">إدارة الموظفين والصلاحيات</h2>

              <div className="card space-y-4">
                <h3 className="font-bold text-emerald-600">إضافة موظف جديد</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <input type="text" placeholder="الاسم الكامل" value={newUser.displayName} onChange={e => setNewUser({...newUser, displayName: e.target.value, role: 'staff'})} className="bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                  <input type="email" placeholder="البريد الإلكتروني" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value, role: 'staff'})} className="bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                  <input type="tel" placeholder="رقم الهاتف" value={newUser.phoneNumber} onChange={e => setNewUser({...newUser, phoneNumber: e.target.value, role: 'staff'})} className="bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                  <button onClick={handleAddUser} className="btn-primary col-span-full">إضافة الموظف</button>
                </div>
              </div>
              <div className="card p-0 overflow-hidden">
                <table className="w-full text-right">
                  <thead className="bg-stone-50 border-b">
                    <tr className="text-xs text-stone-400 uppercase">
                      <th className="p-4">الموظف</th>
                      <th className="p-4">الرتبة</th>
                      <th className="p-4">الصلاحيات</th>
                      <th className="p-4">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {users.filter(u => u.role !== 'user').map(user => (
                      <tr key={user.uid} className="text-sm">
                        <td className="p-4">
                          <p className="font-bold">{user.displayName}</p>
                          <p className="text-xs text-stone-400">{user.email}</p>
                        </td>
                        <td className="p-4">
                          <select 
                            value={user.role} 
                            onChange={(e) => updateRole(user.uid, e.target.value)}
                            className="bg-stone-100 rounded-lg px-2 py-1 text-xs font-bold"
                          >
                            <option value="admin">مدير نظام</option>
                            <option value="staff">موظف</option>
                            <option value="driver">سائق</option>
                          </select>
                        </td>
                        <td className="p-4">
                          {user.role === 'staff' && (
                            <div className="flex flex-wrap gap-2">
                              <PermissionToggle user={user} permission="manage_trips" label="الرحلات" />
                              <PermissionToggle user={user} permission="manage_bookings" label="الحجوزات" />
                              <PermissionToggle user={user} permission="manage_parcels" label="الطرود" />
                              <PermissionToggle user={user} permission="manage_buses" label="الحافلات" />
                              <PermissionToggle user={user} permission="manage_users" label="المستخدمين" />
                              <PermissionToggle user={user} permission="manage_cities" label="المدن" />
                              <PermissionToggle user={user} permission="manage_banners" label="البنرات" />
                            </div>
                          )}
                          {user.role === 'admin' && <span className="text-xs text-emerald-600 font-bold">صلاحيات كاملة</span>}
                        </td>
                        <td className="p-4">
                          <button onClick={() => updateRole(user.uid, 'user')} className="text-red-500 text-xs">تنزيل لرتبة مستخدم</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {activeTab === 'banners' && canSeeTab('banners') && (
            <motion.div key="banners" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-8">
              <h2 className="text-2xl font-bold">إدارة البنرات الإعلانية</h2>
              
              <div className="card space-y-4">
                <h3 className="font-bold text-emerald-600">إضافة بنر جديد</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs text-stone-400 font-bold px-1">رابط الصورة</label>
                    <input 
                      type="text" 
                      placeholder="https://example.com/image.jpg" 
                      value={newBanner.imageUrl} 
                      onChange={e => setNewBanner({...newBanner, imageUrl: e.target.value})} 
                      className="w-full bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500" 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-stone-400 font-bold px-1">الرابط (اختياري)</label>
                    <input 
                      type="text" 
                      placeholder="/booking or https://..." 
                      value={newBanner.link} 
                      onChange={e => setNewBanner({...newBanner, link: e.target.value})} 
                      className="w-full bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500" 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-stone-400 font-bold px-1">الترتيب</label>
                    <input 
                      type="number" 
                      value={newBanner.order} 
                      onChange={e => setNewBanner({...newBanner, order: parseInt(e.target.value)})} 
                      className="w-full bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500" 
                    />
                  </div>
                  <div className="flex items-end">
                    <button onClick={handleAddBanner} className="btn-primary w-full">إضافة البنر</button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {banners.sort((a, b) => a.order - b.order).map(banner => (
                  <div key={banner.id} className="card p-0 overflow-hidden group">
                    <div className="h-40 relative">
                      <img src={banner.imageUrl} alt="" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                        <button 
                          onClick={() => toggleBannerStatus(banner.id, banner.active)}
                          className={`p-2 rounded-full ${banner.active ? 'bg-emerald-500' : 'bg-stone-500'} text-white`}
                        >
                          {banner.active ? <UserCheck size={20} /> : <AlertCircle size={20} />}
                        </button>
                        <button 
                          onClick={() => handleDeleteRequest('banners', banner.id, 'هذا البنر')}
                          className="p-2 rounded-full bg-red-500 text-white"
                        >
                          <Trash2 size={20} />
                        </button>
                      </div>
                    </div>
                    <div className="p-4 flex items-center justify-between">
                      <div>
                        <p className="text-xs text-stone-400 font-bold">الترتيب: {banner.order}</p>
                        <p className="text-xs text-stone-400 truncate max-w-[200px]">{banner.link || 'لا يوجد رابط'}</p>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${banner.active ? 'bg-emerald-100 text-emerald-600' : 'bg-stone-100 text-stone-400'}`}>
                        {banner.active ? 'نشط' : 'متوقف'}
                      </span>
                    </div>
                  </div>
                ))}
                {banners.length === 0 && <p className="text-stone-400 text-center col-span-full py-10">لا يوجد بنرات حالياً.</p>}
              </div>
            </motion.div>
          )}

          {activeTab === 'parcels' && canSeeTab('parcels') && (
            <motion.div key="parcels" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-8">
              <h2 className="text-2xl font-bold">إدارة شحن الطرود</h2>

              <div className="card space-y-6">
                <h3 className="font-bold text-emerald-600">إنشاء شحنة طرد جديدة</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs text-stone-400 font-bold px-1">الرحلة المرتبطة</label>
                    <select 
                      value={newParcel.tripId} 
                      onChange={e => setNewParcel({...newParcel, tripId: e.target.value})}
                      className="w-full bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="">اختر الرحلة...</option>
                      {trips.filter(t => t.status === 'active' || t.status === 'scheduled').map(t => (
                        <option key={t.id} value={t.id}>{t.from} ➔ {t.to} ({t.date} - {t.time}) - {t.trackingNumber}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-stone-400 font-bold px-1">اسم المرسل</label>
                    <input type="text" value={newParcel.senderName} onChange={e => setNewParcel({...newParcel, senderName: e.target.value})} className="w-full bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-stone-400 font-bold px-1">رقم هاتف المرسل</label>
                    <input type="tel" value={newParcel.senderPhone} onChange={e => setNewParcel({...newParcel, senderPhone: e.target.value})} className="w-full bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-stone-400 font-bold px-1">اسم المستلم</label>
                    <input type="text" value={newParcel.receiverName} onChange={e => setNewParcel({...newParcel, receiverName: e.target.value})} className="w-full bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-stone-400 font-bold px-1">رقم هاتف المستلم</label>
                    <input type="tel" value={newParcel.receiverPhone} onChange={e => setNewParcel({...newParcel, receiverPhone: e.target.value})} className="w-full bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-stone-400 font-bold px-1">سعر الشحن</label>
                    <div className="flex gap-2">
                      <input 
                        type="number" 
                        value={newParcel.price} 
                        onChange={e => setNewParcel({...newParcel, price: parseInt(e.target.value)})} 
                        className="flex-1 bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500" 
                      />
                      <select 
                        value={newParcel.currency} 
                        onChange={e => setNewParcel({...newParcel, currency: e.target.value as 'SAR' | 'SYP'})}
                        className="bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="SAR">ريال</option>
                        <option value="SYP">ل.س</option>
                      </select>
                    </div>
                  </div>
                  <div className="col-span-full space-y-1">
                    <label className="text-xs text-stone-400 font-bold px-1">ملاحظات</label>
                    <textarea value={newParcel.note} onChange={e => setNewParcel({...newParcel, note: e.target.value})} className="w-full bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500 h-20" />
                  </div>
                  <button onClick={handleAddParcel} className="btn-primary col-span-full flex items-center justify-center gap-2">
                    <Plus size={20} />
                    إنشاء الشحنة
                  </button>
                </div>
              </div>

              <div className="card p-0 overflow-hidden">
                <table className="w-full text-right">
                  <thead className="bg-stone-50 border-b">
                    <tr className="text-xs text-stone-400 uppercase">
                      <th className="p-4">رقم التتبع</th>
                      <th className="p-4">المرسل والمستلم</th>
                      <th className="p-4">المسار</th>
                      <th className="p-4">السعر</th>
                      <th className="p-4">الحالة</th>
                      <th className="p-4">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {parcels.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(parcel => (
                      <tr key={parcel.id} className="text-sm hover:bg-stone-50 transition-colors">
                        <td className="p-4 font-mono font-bold text-emerald-600">{parcel.trackingNumber}</td>
                        <td className="p-4">
                          <div className="space-y-1">
                            <p><span className="text-stone-400">من:</span> {parcel.senderName}</p>
                            <p><span className="text-stone-400">إلى:</span> {parcel.receiverName}</p>
                          </div>
                        </td>
                        <td className="p-4">
                          <p className="font-bold">{parcel.from} ➔ {parcel.to}</p>
                          <p className="text-xs text-stone-400">{new Date(parcel.createdAt).toLocaleDateString('ar-EG')}</p>
                        </td>
                        <td className="p-4 font-bold text-emerald-600">
                          {parcel.price?.toLocaleString('ar-EG')} {parcel.currency === 'SYP' ? 'ل.س' : 'ريال'}
                        </td>
                        <td className="p-4">
                          <select 
                            value={parcel.status} 
                            onChange={async (e) => await updateDoc(doc(db, 'parcels', parcel.id), { status: e.target.value })}
                            className={`px-2 py-1 rounded-lg text-xs font-bold outline-none ${
                              parcel.status === 'pending' ? 'bg-amber-100 text-amber-600' :
                              parcel.status === 'shipped' ? 'bg-blue-100 text-blue-600' :
                              'bg-emerald-100 text-emerald-600'
                            }`}
                          >
                            <option value="pending">قيد الانتظار</option>
                            <option value="shipped">تم الشحن</option>
                            <option value="delivered">تم التسليم</option>
                          </select>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => handlePrintParcelInvoice(parcel)}
                              className="p-2 text-stone-400 hover:text-emerald-600 transition-colors"
                              title="طباعة الفاتورة"
                            >
                              <Printer size={18} />
                            </button>
                            <button 
                              onClick={() => handleDeleteRequest('parcels', parcel.id, `الشحنة ${parcel.trackingNumber}`)}
                              className="p-2 text-stone-400 hover:text-red-500 transition-colors"
                              title="حذف"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {parcels.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-10 text-center text-stone-400">لا يوجد شحنات مسجلة حالياً.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }: any) {
  return (
    <div className={`p-6 rounded-3xl text-white ${color} shadow-lg space-y-2`}>
      <Icon size={24} className="opacity-80" />
      <div>
        <p className="text-xs opacity-80 uppercase font-bold tracking-wider">{label}</p>
        <p className="text-3xl font-black">{value}</p>
      </div>
    </div>
  );
}

function PermissionToggle({ user, permission, label }: { user: UserProfile, permission: string, label: string }) {
  const hasPermission = user.permissions?.includes(permission);
  
  const toggle = async () => {
    const newPermissions = hasPermission 
      ? user.permissions?.filter(p => p !== permission) 
      : [...(user.permissions || []), permission];
    await updateDoc(doc(db, 'users', user.uid), { permissions: newPermissions });
  };

  return (
    <button 
      onClick={toggle}
      className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
        hasPermission ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-stone-100 text-stone-400 border border-stone-200'
      }`}
    >
      {label}
    </button>
  );
}
