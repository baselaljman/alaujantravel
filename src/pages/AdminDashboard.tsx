import React, { useState, useEffect } from 'react';
import { 
  collection, onSnapshot, addDoc, updateDoc, doc, deleteDoc, 
  query, where, runTransaction 
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Trip, UserProfile, Booking, Bus } from '../types';
import { useAuth } from '../hooks/useAuth';
import { 
  Plus, Trash2, Edit, Bus as BusIcon, Users, Package, 
  Calendar, Shield, UserCheck, Settings, LayoutDashboard,
  CreditCard, MapPin, Clock, AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type AdminTab = 'dashboard' | 'trips' | 'bookings' | 'drivers' | 'buses' | 'staff';

export default function AdminDashboard() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  
  // Data States
  const [trips, setTrips] = useState<Trip[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // Form States
  const [newTrip, setNewTrip] = useState<Partial<Trip>>({
    from: 'الرياض', to: 'دمشق', date: '', time: '', 
    busNumber: '', price: 300, busType: 'Standard', 
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

  // Booking Management States
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);
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
    });

    const unsubBookings = onSnapshot(collection(db, 'bookings'), (snap) => {
      setBookings(snap.docs.map(d => ({ id: d.id, ...d.data() } as Booking)));
    });

    const unsubBuses = onSnapshot(collection(db, 'buses'), (snap) => {
      setBuses(snap.docs.map(d => ({ id: d.id, ...d.data() } as Bus)));
    });

    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile)));
    });

    setLoading(false);
    return () => {
      unsubTrips();
      unsubBookings();
      unsubBuses();
      unsubUsers();
    };
  }, [profile]);

  // Handlers
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
        availableSeats: newTrip.totalSeats,
        bookedSeats: [],
        trackingNumber,
        driverId: selectedBus?.driverId || ''
      });
      setNewTrip({ ...newTrip, date: '', time: '', busNumber: '' });
    } catch (error) {
      console.error('Error adding trip:', error);
    }
  };

  const handleAddBus = async () => {
    if (!newBus.plateNumber || !newBus.busNumber) return;
    await addDoc(collection(db, 'buses'), newBus);
    setNewBus({ plateNumber: '', busNumber: '', model: '', capacity: 45, type: 'Standard', status: 'active', driverId: '' });
  };

  const handleAddUser = async () => {
    if (!newUser.email || !newUser.displayName) return;
    // Check if user already exists
    const existing = users.find(u => u.email === newUser.email);
    if (existing) {
      alert('هذا البريد الإلكتروني مسجل مسبقاً');
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

  const deleteDocHandler = async (coll: string, id: string) => {
    if (confirm('هل أنت متأكد من الحذف؟')) {
      await deleteDoc(doc(db, coll, id));
    }
  };

  if (profile?.role !== 'admin' && profile?.role !== 'staff') {
    return <div className="text-center py-20">عذراً، هذه الصفحة مخصصة للإدارة فقط.</div>;
  }

  const drivers = users.filter(u => u.role === 'driver');
  const staff = users.filter(u => u.role === 'staff' || u.role === 'admin');

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
        <SidebarItem id="staff" label="إدارة الموظفين" icon={Shield} />
      </aside>

      {/* Content Area */}
      <main className="flex-1">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && canSeeTab('dashboard') && (
            <motion.div key="dashboard" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-8">
              <h2 className="text-2xl font-bold">نظرة عامة</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard label="الرحلات النشطة" value={trips.filter(t => t.status === 'active').length} icon={Calendar} color="bg-emerald-600" />
                <StatCard label="إجمالي الحجوزات" value={bookings.length} icon={CreditCard} color="bg-blue-600" />
                <StatCard label="السائقين" value={drivers.length} icon={UserCheck} color="bg-stone-900" />
                <StatCard label="الحافلات" value={buses.length} icon={BusIcon} color="bg-amber-600" />
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
                  <input type="text" placeholder="من" value={newTrip.from} onChange={e => setNewTrip({...newTrip, from: e.target.value})} className="bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                  <input type="text" placeholder="إلى" value={newTrip.to} onChange={e => setNewTrip({...newTrip, to: e.target.value})} className="bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                  <input type="date" value={newTrip.date} onChange={e => setNewTrip({...newTrip, date: e.target.value})} className="bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                  <input type="time" value={newTrip.time} onChange={e => setNewTrip({...newTrip, time: e.target.value})} className="bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                  <select value={newTrip.busNumber} onChange={e => setNewTrip({...newTrip, busNumber: e.target.value})} className="bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500">
                    <option value="">اختر الحافلة</option>
                    {buses.map(b => <option key={b.id} value={b.busNumber}>{b.busNumber} ({b.plateNumber})</option>)}
                  </select>
                  <input type="number" placeholder="السعر" value={newTrip.price} onChange={e => setNewTrip({...newTrip, price: Number(e.target.value)})} className="bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                  <button onClick={handleAddTrip} className="btn-primary col-span-full">إضافة الرحلة</button>
                </div>
              </div>

              <div className="overflow-x-auto card p-0">
                <table className="w-full text-right">
                  <thead className="bg-stone-50 border-b">
                    <tr className="text-xs text-stone-400 uppercase">
                      <th className="p-4">الرحلة</th>
                      <th className="p-4">التاريخ</th>
                      <th className="p-4">الحافلة</th>
                      <th className="p-4">السائق</th>
                      <th className="p-4">الحالة</th>
                      <th className="p-4">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {trips.map(trip => (
                      <tr key={trip.id} className="text-sm">
                        <td className="p-4 font-bold">{trip.from} ← {trip.to}</td>
                        <td className="p-4">{trip.date} {trip.time}</td>
                        <td className="p-4">{trip.busNumber}</td>
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
                            onChange={(e) => updateDoc(doc(db, 'trips', trip.id), { status: e.target.value })}
                            className="bg-stone-100 rounded-lg px-2 py-1 text-xs"
                          >
                            <option value="scheduled">مجدولة</option>
                            <option value="active">نشطة</option>
                            <option value="completed">مكتملة</option>
                            <option value="cancelled">ملغاة</option>
                          </select>
                        </td>
                        <td className="p-4">
                          <button onClick={() => deleteDocHandler('trips', trip.id)} className="text-red-500 p-2 hover:bg-red-50 rounded-lg">
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
                        <button onClick={() => deleteDocHandler('buses', bus.id)} className="text-stone-300 hover:text-red-500 transition-colors">
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
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-emerald-600 uppercase font-bold">الحافلة</p>
                            <p className="font-bold text-emerald-800">{trip?.busNumber}</p>
                          </div>
                        </div>
                      );
                    })()}
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
                                      onClick={() => startEditingBooking(booking)}
                                      className="text-stone-400 p-2 hover:bg-stone-50 rounded-lg"
                                      title="تعديل"
                                    >
                                      <Edit size={16} />
                                    </button>
                                    <button 
                                      onClick={() => deleteDocHandler('bookings', booking.id)} 
                                      className="text-red-500 p-2 hover:bg-red-50 rounded-lg"
                                      title="حذف"
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  </>
                                )}
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
                              <PermissionToggle user={user} permission="manage_buses" label="الحافلات" />
                              <PermissionToggle user={user} permission="manage_users" label="المستخدمين" />
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
