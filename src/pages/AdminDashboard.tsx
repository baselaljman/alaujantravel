import React, { useState, useEffect } from 'react';
import { 
  collection, onSnapshot, addDoc, updateDoc, doc, deleteDoc, 
  query, where, runTransaction, getDocs, setDoc
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Trip, UserProfile, Booking, Bus, City, Banner, Parcel, Notification, TripStop, Device } from '../types';
import { useAuth, normalizePhone } from '../hooks/useAuth';
import { useCurrency } from '../hooks/useCurrency';
import { 
  Plus, Trash2, Edit, Bus as BusIcon, Users, Package, 
  Calendar, Shield, UserCheck, Settings, LayoutDashboard,
  CreditCard, MapPin, Clock, AlertCircle, X, Printer, Download, Search,
  Image as ImageIcon, DollarSign, Bell, Send, Smartphone, CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import AdminCities from './AdminCities';
import html2canvas from 'html2canvas';

type AdminTab = 'dashboard' | 'trips' | 'bookings' | 'drivers' | 'buses' | 'staff' | 'cities' | 'banners' | 'parcels' | 'notifications';

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
  const [editingBus, setEditingBus] = useState<Bus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [gatewayUrl, setGatewayUrl] = useState<string>('');
  const [isSavingGateway, setIsSavingGateway] = useState<boolean>(false);

  // Form States
  const [newTrip, setNewTrip] = useState<Partial<Trip>>({
    from: '', to: '', date: '', time: '', 
    busNumber: '', price: 0, priceSAR: 300, priceSYP: 1000000, busType: 'Standard', 
    totalSeats: 35, status: 'scheduled', tripType: 'international',
    stops: []
  });
  const [newStop, setNewStop] = useState<TripStop>({ cityName: '', priceSAR: 0, priceSYP: 0 });
  const [newBus, setNewBus] = useState<Partial<Bus>>({
    plateNumber: '', busNumber: '', model: '', 
    capacity: 35, type: 'Standard', status: 'active',
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
    from: '', to: '', tripId: '', waybillNumber: '', note: '', price: 0, 
    currency: 'SAR', status: 'pending'
  });
  const [parcelSearch, setParcelSearch] = useState('');
  const [newNotification, setNewNotification] = useState<Partial<Notification>>({
    title: '', body: '', type: 'all', targetId: '', deliveryMethod: 'both', imageUrl: ''
  });
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);

  // Helper to construct fully qualified API URL considering local preview vs static gateways
  const getApiUrl = (path: string) => {
    // If we are running in the development / preview container (like .run.app or localhost)
    const isLocalContainer = window.location.hostname.includes('.run.app') || 
                             window.location.hostname.includes('localhost') || 
                             window.location.hostname.includes('127.0.0.1');

    if (isLocalContainer) {
      return path; // Always use the local full-stack server
    }

    // Otherwise we are on the external production domain (like alaujantravel.com)
    if (!gatewayUrl) {
      return path;
    }

    // Clean up gatewayUrl
    const cleanGateway = gatewayUrl.trim().replace(/\/$/, '');
    
    // Safely check if gateway is pointing to the current domain itself
    try {
      if (cleanGateway) {
        let gatewayHost = cleanGateway;
        if (cleanGateway.includes('//')) {
          gatewayHost = new URL(cleanGateway).hostname;
        }
        if (gatewayHost === window.location.hostname) {
          // Self-referencing error (e.g. gateway points to the static site itself)
          return path; 
        }
      }
    } catch (e) {
      // Invalid URL format
    }

    return `${cleanGateway}${path}`;
  };

  // Helper to find device linked to a booking
  const getLinkedDeviceForBooking = (booking: Booking) => {
    return devices.find(d => {
      // 1. Check exact user ID
      if (booking.userId && d.userId === booking.userId) {
        return true;
      }
      // 2. Check normalized phone numbers
      const normBookingPhone = normalizePhone(booking.passengerPhone);
      const normDevicePhone = normalizePhone(d.userPhone);
      if (normBookingPhone && normDevicePhone && normBookingPhone === normDevicePhone) {
        return true;
      }
      return false;
    });
  };

  const [directNotificationBooking, setDirectNotificationBooking] = useState<Booking | null>(null);
  const [directNotifTitle, setDirectNotifTitle] = useState('');
  const [directNotifBody, setDirectNotifBody] = useState('');
  const [directNotifStatus, setDirectNotifStatus] = useState<string | null>(null);

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

  const handlePrintTicket = async (booking: Booking, trip: Trip) => {
    setIsPrinting(true);
    try {
      const element = document.getElementById(`print-ticket-${booking.id}`);
      if (!element || !element.style) return;
      
      const originalDisplay = element.style.display;
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
          clonedDoc.head?.appendChild(style);
        }
      });
      element.style.display = originalDisplay || 'none';
      
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
    
    // Chunk into pages of 45 passengers
    const chunks = [];
    const chunkSize = 45;
    for (let i = 0; i < tripBookings.length; i += chunkSize) {
      chunks.push(tripBookings.slice(i, i + chunkSize));
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
      <html dir="rtl">
        <head>
          <title>كشف الركاب - ${trip.from} إلى ${trip.to}</title>
          <style>
            @media print {
              .page { page-break-after: always; break-after: page; }
              .page:last-child { page-break-after: avoid; break-after: avoid; }
            }
            body { font-family: 'Arial', sans-serif; padding: 20px; margin: 0; }
            .page { min-height: 100%; box-sizing: border-box; padding-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 11px; }
            th, td { border: 1px solid #ddd; padding: 4px 6px; text-align: right; }
            th { background-color: #f8f9fa; }
            .header { text-align: center; margin-bottom: 15px; border-bottom: 2px solid #059669; padding-bottom: 10px; position: relative; }
            .trip-info { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 10px; font-size: 12px; background: #fafafa; padding: 8px; border-radius: 6px; }
            .footer { margin-top: 15px; text-align: center; font-size: 10px; color: #666; }
          </style>
        </head>
        <body>
          ${chunks.map((chunk, chunkIndex) => `
            <div class="page">
              <div class="header">
                <img 
                  src="/logoaujantravel.jpeg" 
                  crossorigin="anonymous"
                  style="position: absolute; top: 0; right: 0; width: 45px; height: 45px; border-radius: 50%; object-fit: cover; print-color-adjust: exact; -webkit-print-color-adjust: exact; border: 1px solid #ddd;"
                />
                <h1 style="margin: 0; font-size: 18px;">كشف ركاب الرحلة (صفحة ${chunkIndex + 1} من ${chunks.length})</h1>
                <p style="margin: 3px 0 0 0; font-size: 11px;">العوجان للسياحة والسفر</p>
              </div>
              <div class="trip-info">
                <div><strong>من:</strong> ${trip.from}</div>
                <div><strong>إلى:</strong> ${trip.to}</div>
                <div><strong>التاريخ:</strong> ${formatDateArabic(trip.date)}</div>
                <div><strong>الوقت:</strong> ${trip.time}</div>
                <div><strong>رقم التتبع:</strong> ${trip.trackingNumber || '---'}</div>
                <div><strong>الركاب في الصفحة:</strong> ${chunk.length} / الإجمالي: ${tripBookings.length}</div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>اسم الراكب</th>
                    <th>رقم التواصل</th>
                    <th>رقم الجواز</th>
                    <th>المقعد</th>
                    <th>الوجهة</th>
                    <th>الطرود الإضافية</th>
                    <th>الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  ${chunk.map((b, i) => `
                    <tr>
                      <td>${chunkIndex * chunkSize + i + 1}</td>
                      <td>${b.passengerName}</td>
                      <td>${b.passengerPhone}</td>
                      <td>${b.passportNumber || '---'}</td>
                      <td>${b.seatNumber}</td>
                      <td>${b.to || trip.to}</td>
                      <td>${b.extraParcelsCount ? `${b.extraParcelsCount} طرود` : '---'}</td>
                      <td>${b.status === 'confirmed' ? 'مؤكد' : 'قيد الانتظار'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
              <div class="footer">
                تم استخراج هذا الكشف بتاريخ ${new Date().toLocaleString('ar-EG')}
              </div>
            </div>
          `).join('')}
          <script>
            window.onload = function() {
              const images = document.getElementsByTagName('img');
              let loaded = 0;
              if (images.length === 0) {
                window.print();
                window.onafterprint = () => window.close();
                return;
              }
              const check = () => {
                loaded++;
                if (loaded === images.length) {
                  setTimeout(() => { window.print(); window.onafterprint = () => window.close(); }, 500);
                }
              };
              for (let img of images) {
                if (img.complete) check();
                else { img.onload = check; img.onerror = check; }
              }
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  const handlePrintFinancialPassengerList = () => {
    const trip = trips.find(t => t.id === selectedTripId);
    if (!trip) return;

    const tripBookings = bookings.filter(b => b.tripId === selectedTripId);
    
    let totalSAR = 0;
    let totalSYP = 0;
    let hasSAR = false;
    let hasSYP = false;

    const bookingPrices = tripBookings.map(b => {
      const priceInfo = getBookingPrice(b, trip);
      const extra = b.extraParcelsPrice || 0;
      const combinedValue = priceInfo.value + extra;
      if (priceInfo.currency === 'ل.س') {
        totalSYP += combinedValue;
        hasSYP = true;
      } else {
        totalSAR += combinedValue;
        hasSAR = true;
      }
      return {
        currency: priceInfo.currency,
        baseValue: priceInfo.value,
        extra,
        totalValue: combinedValue
      };
    });

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const totalTextParts = [];
    if (hasSAR) totalTextParts.push(`${totalSAR} ريال`);
    if (hasSYP) totalTextParts.push(`${totalSYP} ل.س`);
    const totalText = totalTextParts.join(' / ') || '0';

    // Chunk into pages of 45 passengers
    const chunks = [];
    const chunkSize = 45;
    for (let i = 0; i < tripBookings.length; i += chunkSize) {
      chunks.push(tripBookings.slice(i, i + chunkSize));
    }

    const html = `
      <html dir="rtl">
        <head>
          <title>الكشف المالي للركاب - ${trip.from} إلى ${trip.to}</title>
          <style>
            @media print {
              .page { page-break-after: always; break-after: page; }
              .page:last-child { page-break-after: avoid; break-after: avoid; }
            }
            body { font-family: 'Arial', sans-serif; padding: 20px; margin: 0; }
            .page { min-height: 100%; box-sizing: border-box; padding-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 11px; }
            th, td { border: 1px solid #ddd; padding: 4px 6px; text-align: right; }
            th { background-color: #f8f9fa; }
            .header { text-align: center; margin-bottom: 15px; border-bottom: 2px solid #059669; padding-bottom: 10px; position: relative; }
            .trip-info { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 10px; font-size: 12px; background: #fafafa; padding: 8px; border-radius: 6px; }
            .summary-box { background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 8px 12px; border-radius: 6px; margin-top: 12px; font-size: 13px; font-weight: bold; color: #166534; display: flex; justify-content: space-between; }
            .footer { margin-top: 15px; text-align: center; font-size: 10px; color: #666; }
          </style>
        </head>
        <body>
          ${chunks.map((chunk, chunkIndex) => {
            const isLastPage = chunkIndex === chunks.length - 1;
            return `
              <div class="page">
                <div class="header">
                  <img 
                    src="/logoaujantravel.jpeg" 
                    crossorigin="anonymous"
                    style="position: absolute; top: 0; right: 0; width: 45px; height: 45px; border-radius: 50%; object-fit: cover; print-color-adjust: exact; -webkit-print-color-adjust: exact; border: 1px solid #ddd;"
                  />
                  <h1 style="margin: 0; font-size: 18px;">الكشف المالي والركاب للرحلة (صفحة ${chunkIndex + 1} من ${chunks.length})</h1>
                  <p style="margin: 3px 0 0 0; font-size: 11px;">العوجان للسياحة والسفر</p>
                </div>
                <div class="trip-info">
                  <div><strong>من:</strong> ${trip.from}</div>
                  <div><strong>إلى:</strong> ${trip.to}</div>
                  <div><strong>التاريخ:</strong> ${formatDateArabic(trip.date)}</div>
                  <div><strong>الوقت:</strong> ${trip.time}</div>
                  <div><strong>رقم التتبع:</strong> ${trip.trackingNumber || '---'}</div>
                  <div><strong>الركاب في الصفحة:</strong> ${chunk.length} / الإجمالي: ${tripBookings.length}</div>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>اسم الراكب</th>
                      <th>رقم التواصل</th>
                      <th>رقم الجواز</th>
                      <th>المقعد</th>
                      <th>الوجهة</th>
                      <th>الطرود الإضافية</th>
                      <th>سعر التذكرة الإجمالي</th>
                      <th>الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${chunk.map((b, i) => {
                      const absoluteIndex = chunkIndex * chunkSize + i;
                      const priceInfo = bookingPrices[absoluteIndex];
                      return `
                        <tr>
                          <td>${absoluteIndex + 1}</td>
                          <td>${b.passengerName}</td>
                          <td>${b.passengerPhone}</td>
                          <td>${b.passportNumber || '---'}</td>
                          <td>${b.seatNumber}</td>
                          <td>${b.to || trip.to}</td>
                          <td>${b.extraParcelsCount ? `${b.extraParcelsCount} طرود (+${priceInfo.extra} ${priceInfo.currency})` : '---'}</td>
                          <td style="font-weight: bold; color: #059669;">
                            ${priceInfo.totalValue} ${priceInfo.currency}
                            ${priceInfo.extra > 0 ? `<div style="font-size: 9px; color: #666; font-weight: normal;">(أساسي: ${priceInfo.baseValue} + طرود: ${priceInfo.extra})</div>` : ''}
                          </td>
                          <td>${b.status === 'confirmed' ? 'مؤكد' : 'قيد الانتظار'}</td>
                        </tr>
                      `;
                    }).join('')}
                  </tbody>
                </table>
                
                ${isLastPage ? `
                  <div class="summary-box">
                    <span>إجمالي مبالغ الرحلة:</span>
                    <span>${totalText}</span>
                  </div>
                ` : ''}

                <div class="footer">
                  تم استخراج هذا الكشف المالي بتاريخ ${new Date().toLocaleString('ar-EG')}
                </div>
              </div>
            `;
          }).join('')}
          <script>
            window.onload = function() {
              const images = document.getElementsByTagName('img');
              let loaded = 0;
              if (images.length === 0) {
                window.print();
                window.onafterprint = () => window.close();
                return;
              }
              const check = () => {
                loaded++;
                if (loaded === images.length) {
                  setTimeout(() => { window.print(); window.onafterprint = () => window.close(); }, 500);
                }
              };
              for (let img of images) {
                if (img.complete) check();
                else { img.onload = check; img.onerror = check; }
              }
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  const handlePrintTripParcels = (trip: Trip, tripParcels: Parcel[]) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
      <html dir="rtl">
        <head>
          <title>كشف شحنات الرحلة - ${trip.from} إلى ${trip.to}</title>
          <style>
            body { font-family: 'Arial', sans-serif; padding: 40px; color: #333; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 12px; text-align: right; font-size: 14px; }
            th { background-color: #f8f9fa; color: #059669; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #059669; padding-bottom: 20px; }
            .trip-info { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; font-size: 14px; }
            .footer { margin-top: 40px; text-align: center; font-size: 12px; color: #666; }
            .price-total { text-align: left; margin-top: 20px; font-weight: bold; font-size: 16px; color: #059669; }
          </style>
        </head>
        <body>
          <div class="header" style="position: relative;">
            <img 
              src="/logoaujantravel.jpeg" 
              crossorigin="anonymous"
              style="position: absolute; top: 0; right: 0; width: 60px; height: 60px; border-radius: 50%; object-fit: cover; print-color-adjust: exact; -webkit-print-color-adjust: exact; border: 1px solid #ddd;"
            />
            <h1>كشف شحنات الرحلة</h1>
            <p>العوجان للسياحة والسفر</p>
          </div>
          <div class="trip-info">
            <div><strong>من:</strong> ${trip.from}</div>
            <div><strong>إلى:</strong> ${trip.to}</div>
            <div><strong>التاريخ:</strong> ${formatDateArabic(trip.date)}</div>
            <div><strong>الوقت:</strong> ${trip.time}</div>
            <div><strong>رقم تتبع الرحلة:</strong> ${trip.trackingNumber || '---'}</div>
            <div><strong>عدد الشحنات:</strong> ${tripParcels.length}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>رقم البوليصة</th>
                <th>المرسل</th>
                <th>المستلم</th>
                <th>المسار</th>
                <th>الملاحظات</th>
                <th>السعر</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              ${tripParcels.map((p, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td>${p.waybillNumber}</td>
                  <td>${p.senderName}<br/><small>${p.senderPhone}</small></td>
                  <td>${p.receiverName}<br/><small>${p.receiverPhone}</small></td>
                  <td>${p.from || trip.from} ➔ ${p.to || trip.to}</td>
                  <td>${p.note || '---'}</td>
                  <td>${p.price?.toLocaleString('ar-EG')} ${p.currency === 'SYP' ? 'ل.س' : 'ريال'}</td>
                  <td>${p.status === 'pending' ? 'قيد الانتظار' : p.status === 'shipped' ? 'تم الشحن' : 'تم التسليم'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="price-total">
            إجمالي SAR: ${tripParcels.filter(p => p.currency === 'SAR').reduce((acc, p) => acc + (p.price || 0), 0).toLocaleString('ar-EG')} ريال<br/>
            إجمالي SYP: ${tripParcels.filter(p => p.currency === 'SYP').reduce((acc, p) => acc + (p.price || 0), 0).toLocaleString('ar-EG')} ل.س
          </div>
          <div class="footer">
            تم استخراج هذا الكشف بتاريخ ${new Date().toLocaleString('ar-EG')}
          </div>
          <script>
            window.onload = function() {
              const images = document.getElementsByTagName('img');
              let loaded = 0;
              if (images.length === 0) {
                window.print();
                window.onafterprint = () => window.close();
                return;
              }
              const check = () => {
                loaded++;
                if (loaded === images.length) {
                  setTimeout(() => { window.print(); window.onafterprint = () => window.close(); }, 500);
                }
              };
              for (let img of images) {
                if (img.complete) check();
                else { img.onload = check; img.onerror = check; }
              }
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
    seatNumber: 0,
    extraParcelsCount: 0,
    extraParcelsPrice: 0
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

    const unsubNotifications = onSnapshot(collection(db, 'notifications'), (snap) => {
      setNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() } as Notification)).sort((a, b) => 
        new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()
      ));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'notifications');
    });

    const unsubDevices = onSnapshot(collection(db, 'devices'), (snap) => {
      setDevices(snap.docs.map(d => ({ id: d.id, ...d.data() } as Device)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'devices');
    });

    const unsubSettings = onSnapshot(doc(db, 'settings', 'global'), (snap) => {
      if (snap.exists()) {
        setGatewayUrl(snap.data().notificationGatewayUrl || '');
      }
    }, (error) => {
      console.warn("Could not load global settings:", error);
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
      unsubNotifications();
      unsubDevices();
      unsubSettings();
    };
  }, [profile]);

  // Handlers
  const [notificationStatus, setNotificationStatus] = useState<{ initialized: boolean, projectId: string, error?: string, isStaticOnly?: boolean } | null>(null);

  useEffect(() => {
    const statusUrl = getApiUrl('/api/notification-status');
    // If the status URL is identical to current /api/... and we are on a static site, skip fetching to avoid JSON errors
    const isStaticSelfRef = !statusUrl.startsWith('http') && 
                            !window.location.hostname.includes('.run.app') && 
                            !window.location.hostname.includes('localhost') && 
                            !window.location.hostname.includes('127.0.0.1');

    if (isStaticSelfRef) {
      setNotificationStatus({
        initialized: false,
        projectId: '',
        isStaticOnly: true,
        error: "لم يتم تكوين بوابة خارجية للإشعارات بعد (FCM Gateway URL) لتوجيه الطلبات من هذا الموقع الاستاتيكي."
      });
      return;
    }

    fetch(statusUrl)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`خطأ في استجابة الخادم: ${res.status}`);
        }
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          return res.json();
        } else {
          throw new Error("استجابة الخادم ليست JSON؛ قد يكون الخادم الخارجي يعمل كموقع استاتيكي (Static Site) فقط.");
        }
      })
      .then(data => setNotificationStatus(data))
      .catch(err => {
        console.error('Error fetching notification status:', err);
        setNotificationStatus({
          initialized: false,
          projectId: '',
          isStaticOnly: true,
          error: err.message
        });
      });
  }, [gatewayUrl]);

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
      handleFirestoreError(error, OperationType.UPDATE, `trips/${tripId}`);
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
      const tripCapacity = selectedBus?.capacity || newTrip.totalSeats || 35;

      await addDoc(collection(db, 'trips'), { 
        ...newTrip, 
        totalSeats: tripCapacity,
        price: newTrip.priceSAR || 0, // Default to SAR for backward compatibility
        availableSeats: tripCapacity,
        bookedSeats: [],
        trackingNumber,
        driverId: selectedBus?.driverId || '',
        tripType: newTrip.tripType || 'international',
        stops: newTrip.stops || []
      });
      setNewTrip({ ...newTrip, date: '', time: '', busNumber: '', totalSeats: 35, priceSAR: 300, priceSYP: 1000000, tripType: 'international', stops: [] });
    } catch (error) {
      console.error('Error adding trip:', error);
    }
  };

  const handleAddBus = async () => {
    if (!newBus.plateNumber || !newBus.busNumber) return;
    await addDoc(collection(db, 'buses'), newBus);
    setNewBus({ plateNumber: '', busNumber: '', model: '', capacity: 35, type: 'Standard', status: 'active', driverId: '' });
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

    try {
      let waybillNumber = '00001';
      
      await runTransaction(db, async (transaction) => {
        const counterRef = doc(db, 'metadata', 'parcel_counter');
        const counterSnap = await transaction.get(counterRef);
        
        let nextCount = 1;
        if (counterSnap.exists()) {
          nextCount = (counterSnap.data().count || 0) + 1;
        }
        
        transaction.set(counterRef, { count: nextCount });
        waybillNumber = String(nextCount).padStart(5, '0');
      });

      await addDoc(collection(db, 'parcels'), {
        ...newParcel,
        waybillNumber,
        trackingNumber: selectedTrip.trackingNumber,
        from: newParcel.from || selectedTrip.from,
        to: newParcel.to || selectedTrip.to,
        status: 'pending',
        createdAt: new Date().toISOString()
      });
      setNewParcel({
        senderName: '', senderPhone: '', receiverName: '', receiverPhone: '',
        from: '', to: '', tripId: '', waybillNumber: '', note: '', price: 0, 
        currency: 'SAR', status: 'pending'
      });
    } catch (error) {
      console.error('Error adding parcel:', error);
      setError('حدث خطأ أثناء إنشاء الشحنة');
    }
  };

  const handleSendNotification = async () => {
    if (!newNotification.title || !newNotification.body) return;
    
    try {
      let finalTokens: string[] = [];
      let targetUserCount = 0;

      // Type-specific logic to extract tokens from users and devices collections
      if (newNotification.type === 'all') {
        const userTokens = users.map(u => u.fcmToken).filter(Boolean) as string[];
        const deviceTokens = devices.map(d => d.token).filter(Boolean) as string[];
        finalTokens = Array.from(new Set([...userTokens, ...deviceTokens]));
        targetUserCount = users.length;
      } else if (newNotification.type === 'drivers') {
        const driverIds = users.filter(u => u.role === 'driver').map(u => u.uid);
        const userTokens = users.filter(u => u.role === 'driver').map(u => u.fcmToken).filter(Boolean) as string[];
        const deviceTokens = devices.filter(d => d.userId && driverIds.includes(d.userId)).map(d => d.token).filter(Boolean) as string[];
        finalTokens = Array.from(new Set([...userTokens, ...deviceTokens]));
        targetUserCount = driverIds.length;
      } else if (newNotification.type === 'users') {
        const passengerIds = users.filter(u => u.role === 'user').map(u => u.uid);
        const userTokens = users.filter(u => u.role === 'user').map(u => u.fcmToken).filter(Boolean) as string[];
        const deviceTokens = devices.filter(d => !d.userId || (d.userId && passengerIds.includes(d.userId))).map(d => d.token).filter(Boolean) as string[];
        finalTokens = Array.from(new Set([...userTokens, ...deviceTokens]));
        targetUserCount = passengerIds.length;
      } else if (newNotification.type === 'specific') {
        const specificUserId = newNotification.targetId;
        const targetUser = users.find(u => u.uid === specificUserId);
        const userTokens = targetUser?.fcmToken ? [targetUser.fcmToken] : [];
        const normTargetPhone = normalizePhone(targetUser?.phoneNumber);
        const deviceTokens = devices.filter(d => {
          if (specificUserId && d.userId === specificUserId) return true;
          const normDevicePhone = normalizePhone(d.userPhone);
          if (normTargetPhone && normDevicePhone && normTargetPhone === normDevicePhone) return true;
          return false;
        }).map(d => d.token).filter(Boolean) as string[];
        finalTokens = Array.from(new Set([...userTokens, ...deviceTokens]));
        targetUserCount = finalTokens.length > 0 ? 1 : 0;
      } else if (newNotification.type === 'trip') {
        const targetTripId = newNotification.targetId;
        const tripBookings = bookings.filter(b => b.tripId === targetTripId && b.status !== 'cancelled');
        const bookedUserIds = tripBookings.map(b => b.userId).filter(Boolean);
        const bookedPhonesNormalized = tripBookings.map(b => normalizePhone(b.passengerPhone)).filter(Boolean);
        
        const bookedUserTokens = users.filter(u => bookedUserIds.includes(u.uid)).map(u => u.fcmToken).filter(Boolean) as string[];
        const bookedDeviceTokens = devices.filter(d => {
          if (d.userId && bookedUserIds.includes(d.userId)) return true;
          const normDevicePhone = normalizePhone(d.userPhone);
          if (normDevicePhone && bookedPhonesNormalized.includes(normDevicePhone)) return true;
          return false;
        }).map(d => d.token).filter(Boolean) as string[];
        finalTokens = Array.from(new Set([...bookedUserTokens, ...bookedDeviceTokens]));
        targetUserCount = tripBookings.length;
      }

      const totalAndroidDevices = devices.filter(d => finalTokens.includes(d.token) && d.platform === 'android').length;

      const stats = {
        total: finalTokens.length,
        android: totalAndroidDevices,
        ios: finalTokens.length - totalAndroidDevices,
        web: 0
      };

      // 1. Save to Firestore (for in-app history)
      await addDoc(collection(db, 'notifications'), {
        ...newNotification,
        sentAt: new Date().toISOString(),
        sentBy: profile?.uid,
        stats
      });

      // 2. Send Push Notification via Backend API if requested
      let pushErrorMsg = "";
      if (newNotification.deliveryMethod === 'push' || newNotification.deliveryMethod === 'both') {
        try {
          if (finalTokens.length > 0) {
            const targetUrl = getApiUrl('/api/send-notification');
            const response = await fetch(targetUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                tokens: finalTokens,
                title: newNotification.title,
                body: newNotification.body,
                imageUrl: newNotification.imageUrl,
                data: {
                  type: 'admin_broadcast',
                  sentAt: new Date().toISOString()
                }
              })
            });

            if (!response.ok) {
              const errData = await response.json();
              throw new Error(errData.error || 'فشلت عملية الإرسال من الخادم (تأكد من تفعيل خدمة FCM)');
            }
            
            const result = await response.json();
            console.log('Push notification result:', result);
          } else {
            throw new Error('لم يتم رصد هواتف مرتبطة أو رموز FCM نشطة لهذه الفئة المستهدفة.');
          }
        } catch (pushErr: any) {
          console.warn("Direct push notification delivery error:", pushErr);
          pushErrorMsg = pushErr.message;
        }
      }
      
      setNewNotification({ title: '', body: '', type: 'all', targetId: '', deliveryMethod: 'both', imageUrl: '' });
      if (pushErrorMsg) {
        setError(`تم نشر الإشعار داخل التطبيق بنجاح. تنبيه للإرسال الفوري للهواتف: ${pushErrorMsg}`);
      } else {
        setError('تم إرسال الإشعار بنجاح لجميع القنوات المفعلة');
      }
      setTimeout(() => setError(null), 5000);
    } catch (error: any) {
      console.error('Error sending notification history:', error);
      setError(`خطأ في إنشاء سجل الإشعارات: ${error.message}`);
    }
  };

  const handleSendDirectNotification = async () => {
    if (!directNotificationBooking || !directNotifTitle || !directNotifBody) return;

    try {
      setDirectNotifStatus('sending');
      
      const targetUserId = directNotificationBooking.userId;
      const passengerPhone = directNotificationBooking.passengerPhone;
      
      // Collect user token
      const userProfile = users.find(u => u.uid === targetUserId);
      const userTokens = userProfile?.fcmToken ? [userProfile.fcmToken] : [];

      // Collect device tokens matching userId or passengerPhone
      const normPassengerPhone = normalizePhone(passengerPhone);
      const deviceTokens = devices.filter(d => {
        if (targetUserId && d.userId === targetUserId) return true;
        const normDevicePhone = normalizePhone(d.userPhone);
        if (normPassengerPhone && normDevicePhone && normPassengerPhone === normDevicePhone) return true;
        return false;
      }).map(d => d.token).filter(Boolean) as string[];

      const finalTokens = Array.from(new Set([...userTokens, ...deviceTokens]));

      // 1. Save to notification history in Firestore FIRST (so it is saved anyway)
      await addDoc(collection(db, 'notifications'), {
        title: directNotifTitle,
        body: directNotifBody,
        type: 'specific',
        targetId: targetUserId || 'anonymous',
        sentAt: new Date().toISOString(),
        sentBy: profile?.uid,
        deliveryMethod: 'push',
        stats: {
          total: finalTokens.length,
          android: devices.filter(d => finalTokens.includes(d.token) && d.platform === 'android').length,
          ios: 0,
          web: 0
        }
      });

      // 2. Send via Backend API
      if (finalTokens.length === 0) {
        setDirectNotificationBooking(null);
        setDirectNotifTitle('');
        setDirectNotifBody('');
        setDirectNotifStatus('success');
        setError('تم تسجيل الإشعار كإشعار داخلي للمسافر، لكن لم يتم رصد هاتف ذكي مباشر نشط لهاتفه لتلقي التنبيه الفوري.');
        setTimeout(() => setError(null), 6000);
        return;
      }

      let apiSuccess = true;
      let apiErrorMsg = "";
      try {
        const targetUrl = getApiUrl('/api/send-notification');
        const response = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tokens: finalTokens,
            title: directNotifTitle,
            body: directNotifBody,
            data: {
              type: 'direct_customer_msg',
              bookingId: directNotificationBooking.id,
              sentAt: new Date().toISOString()
            }
          })
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || 'FCM error response.');
        }
      } catch (fcmErr: any) {
        console.warn('FCM delivery failed for direct msg:', fcmErr);
        apiSuccess = false;
        apiErrorMsg = fcmErr.message;
      }

      setDirectNotificationBooking(null);
      setDirectNotifTitle('');
      setDirectNotifBody('');
      setDirectNotifStatus('success');

      if (!apiSuccess) {
        setError(`تم حفظ الإشعار في أرشيف المسافر. تنبيه للتنبيه الفوري: ${apiErrorMsg || 'خطأ في الاتصال بخادم FCM'}`);
      } else {
        setError('تم إرسال الإشعار المخصص للمسافر بنجاح');
      }
      setTimeout(() => setError(null), 5000);
    } catch (err: any) {
      console.error('Error in send direct notification:', err);
      setDirectNotifStatus('error');
      alert('حدث خطأ غير متوقع أثناء إرسال الإشعار: ' + err.message);
    }
  };

  const handlePrintParcelInvoice = (parcel: Parcel) => {
    const trip = trips.find(t => t.id === parcel.tripId);
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
      <html dir="rtl">
        <head>
          <title>فاتورة شحن طرد - ${parcel.waybillNumber}</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 8mm;
            }
            body { font-family: 'Arial', sans-serif; padding: 15px; color: #333; background: #fff; margin: 0; }
            .invoice-box { max-width: 800px; margin: auto; padding: 20px; border: 1px solid #eee; box-shadow: 0 0 10px rgba(0, 0, 0, .05); font-size: 14px; line-height: 1.4; border-radius: 8px; }
            .header { border-bottom: 2px solid #059669; padding-bottom: 10px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center; }
            .company-info h1 { margin: 0; color: #059669; font-size: 20px; }
            .company-info p { margin: 2px 0 0 0; font-size: 13px; color: #666; }
            .tracking p { margin: 2px 0; font-size: 13px; }
            .invoice-details { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px; }
            .section-title { font-weight: bold; color: #059669; border-bottom: 1px solid #eee; margin-bottom: 6px; padding-bottom: 3px; font-size: 13px; }
            .info-row { margin-bottom: 4px; font-size: 12px; }
            .info-label { font-weight: bold; color: #666; }
            .price-section { margin-top: 15px; padding: 12px 15px; background: #f9f9f9; border-radius: 8px; text-align: left; display: flex; justify-content: space-between; align-items: center; }
            .price-section .info-label { font-size: 13px; margin: 0; }
            .total-price { font-size: 18px; font-weight: bold; color: #059669; margin: 0; }
            .footer { margin-top: 15px; text-align: center; font-size: 11px; color: #999; border-top: 1px solid #eee; padding-top: 10px; }
            @media print {
              .no-print { display: none; }
              body { padding: 0; margin: 0; }
              .invoice-box { padding: 10px; border: none; box-shadow: none; max-width: 100%; }
              @page {
                size: A4 portrait;
                margin: 5mm;
              }
              .terms-section { font-size: 9px !important; line-height: 1.4 !important; padding: 6px !important; margin-top: 10px !important; }
              .price-section { padding: 8px 12px; margin-top: 10px; }
              .invoice-details { margin-bottom: 8px; gap: 10px; }
              .header { margin-bottom: 8px; padding-bottom: 6px; }
              .footer { margin-top: 8px; padding-top: 6px; }
            }
          </style>
        </head>
        <body>
          <div class="invoice-box">
            <div class="header">
              <div class="company-info" style="display: flex; align-items: center; gap: 15px;">
                <img 
                  src="/logoaujantravel.jpeg" 
                  crossorigin="anonymous"
                  style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; print-color-adjust: exact; -webkit-print-color-adjust: exact; border: 1px solid #ddd;"
                />
                <div>
                  <h1>العوجان للسياحة والسفر</h1>
                  <p>خدمات شحن الطرود</p>
                </div>
              </div>
              <div class="tracking">
                <p><strong>رقم بوليصة الشحن:</strong> ${parcel.waybillNumber}</p>
                <p><strong>رقم تتبع الرحلة:</strong> <span style="color: #059669; font-weight: bold;">${trip?.trackingNumber || '---'}</span></p>
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

            <div class="terms-section" style="margin-top: 25px; border: 1px dashed #ddd; border-radius: 8px; padding: 15px; background: #fafafa; font-size: 11px; color: #555; line-height: 1.8; text-align: right;">
              <div style="font-size: 13px; font-weight: bold; color: #059669; margin-bottom: 8px; border-bottom: 2px solid #059669; padding-bottom: 4px; display: inline-block;">شروط وأحكام الشحن والاستلام:</div>
              <ul style="padding-right: 15px; margin: 0; list-style-type: none;">
                <li style="margin-bottom: 5px; position: relative; padding-right: 15px;">
                  <span style="position: absolute; right: 0; color: #059669; font-weight: bold;">*</span>
                  الشركة غير مسؤولة عن البضائع إذا لم يتم إستلامها خلال ١٠ أيام وعن سندات الاستلام بعد ١٥ يوم من تاريخ الاستلام.
                </li>
                <li style="margin-bottom: 5px; position: relative; padding-right: 15px;">
                  <span style="position: absolute; right: 0; color: #059669; font-weight: bold;">*</span>
                  الشركة غير مسؤولة عما بداخل الإرساليه من أشياء قابله للكسر أو ثمينة بدون تأمين من قبلنا.
                </li>
                <li style="margin-bottom: 5px; position: relative; padding-right: 15px;">
                  <span style="position: absolute; right: 0; color: #059669; font-weight: bold;">*</span>
                  في حالة فقدان الارسالية الشركة لا تتحمل أكثر من ١٠٠ ريال كقيمة الارسالية إذا لم يتم تأمين عليه من قبلنا.
                </li>
                <li style="margin-bottom: 5px; position: relative; padding-right: 15px;">
                  <span style="position: absolute; right: 0; color: #059669; font-weight: bold;">•</span>
                  استلامك الفاتورة يعتبر إطلاعك على الشروط.
                </li>
                <li style="margin-bottom: 5px; position: relative; padding-right: 15px;">
                  <span style="position: absolute; right: 0; color: #059669; font-weight: bold;">*</span>
                  الشركة لا تتحمل مسؤولية الإرسالية في حالة تعرضها لكوارث طبيعية ولم يكتب عليها الاسم أو رقم التواصل.
                </li>
                <li style="margin-bottom: 5px; position: relative; padding-right: 15px;">
                  <span style="position: absolute; right: 0; color: #059669; font-weight: bold;">*</span>
                  الشركة غير مسؤولة عن مابداخل الإرسالية الغير مصرح بها.
                </li>
              </ul>
            </div>

            <div class="footer">
              <p>شكراً لتعاملكم معنا. يرجى الاحتفاظ بهذه الفاتورة لتتبع شحنتكم.</p>
              <p>هذه الوثيقة صدرت إلكترونياً ولا تحتاج لختم.</p>
            </div>
          </div>
          <script>
            window.onload = function() {
              const images = document.getElementsByTagName('img');
              let loaded = 0;
              if (images.length === 0) {
                window.print();
                window.onafterprint = () => window.close();
                return;
              }
              const check = () => {
                loaded++;
                if (loaded === images.length) {
                  setTimeout(() => { window.print(); window.onafterprint = () => window.close(); }, 500);
                }
              };
              for (let img of images) {
                if (img.complete) check();
                else { img.onload = check; img.onerror = check; }
              }
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

  const updateRole = async (uid: string, role: string) => {
    const user = users.find(u => u.uid === uid);
    const updates: any = { role };
    // If changing to staff and didn't have permissions, initialize them
    if (role === 'staff' && !user?.permissions) {
      updates.permissions = [];
    }
    await updateDoc(doc(db, 'users', uid), updates);
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
      seatNumber: booking.seatNumber,
      extraParcelsCount: booking.extraParcelsCount || 0,
      extraParcelsPrice: booking.extraParcelsPrice || 0
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
      case 'notifications': return profile?.role === 'admin';
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
        <SidebarItem id="notifications" label="إرسال إشعارات" icon={Bell} />
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

          {success && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-emerald-50 border border-emerald-100 text-emerald-800 p-4 rounded-2xl flex items-center justify-between mb-6"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 size={20} className="text-emerald-600" />
                <span className="text-sm font-bold">{success}</span>
              </div>
              <button onClick={() => setSuccess(null)} className="text-emerald-500 hover:text-emerald-700">
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

          {/* Edit Bus Modal */}
          {editingBus && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl text-right space-y-4"
              >
                <div className="flex justify-between items-center pb-3 border-b border-stone-100">
                  <h3 className="text-lg font-bold text-emerald-600">تعديل بيانات الحافلة</h3>
                  <button 
                    onClick={() => setEditingBus(null)}
                    className="p-1 hover:bg-stone-100 rounded-full text-stone-400 hover:text-stone-600 transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>
                
                <div className="space-y-4 text-right">
                  <div>
                    <label className="block text-xs font-bold text-stone-500 mb-1">رقم اللوحة</label>
                    <input 
                      type="text" 
                      value={editingBus.plateNumber} 
                      onChange={e => setEditingBus({...editingBus, plateNumber: e.target.value})} 
                      className="w-full bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500 text-right" 
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-bold text-stone-500 mb-1">رقم الحافلة الداخلي</label>
                    <input 
                      type="text" 
                      value={editingBus.busNumber} 
                      onChange={e => setEditingBus({...editingBus, busNumber: e.target.value})} 
                      className="w-full bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500 text-right" 
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-bold text-stone-500 mb-1">الموديل</label>
                    <input 
                      type="text" 
                      value={editingBus.model} 
                      onChange={e => setEditingBus({...editingBus, model: e.target.value})} 
                      className="w-full bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500 text-right" 
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-bold text-stone-500 mb-1">السعة</label>
                    <input 
                      type="number" 
                      value={editingBus.capacity} 
                      onChange={e => setEditingBus({...editingBus, capacity: Number(e.target.value)})} 
                      className="w-full bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500 text-right" 
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-bold text-stone-500 mb-1">نوع الحافلة</label>
                    <select 
                      value={editingBus.type} 
                      onChange={e => setEditingBus({...editingBus, type: e.target.value as any})} 
                      className="w-full bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500 text-right animate-none"
                    >
                      <option value="Standard font-sans">عادية</option>
                      <option value="VIP font-sans">VIP</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-bold text-stone-500 mb-1">السائق</label>
                    <select 
                      value={editingBus.driverId || ''} 
                      onChange={e => setEditingBus({...editingBus, driverId: e.target.value})} 
                      className="w-full bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500 text-right animate-none font-sans"
                    >
                      <option value="">لا يوجد سائق</option>
                      {drivers.map(d => <option key={d.uid} value={d.uid}>{d.displayName}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-500 mb-1 font-sans">الحالة</label>
                    <select 
                      value={editingBus.status} 
                      onChange={e => setEditingBus({...editingBus, status: e.target.value as any})} 
                      className="w-full bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500 text-right animate-none font-sans"
                    >
                      <option value="active">نشطة</option>
                      <option value="maintenance">صيانة</option>
                      <option value="inactive">متوقفة</option>
                    </select>
                  </div>
                </div>
                
                <div className="flex gap-3 pt-3 border-t border-stone-100">
                  <button 
                    onClick={async () => {
                      if (!editingBus || !editingBus.plateNumber || !editingBus.busNumber) return;
                      try {
                        await updateDoc(doc(db, 'buses', editingBus.id), {
                          plateNumber: editingBus.plateNumber,
                          busNumber: editingBus.busNumber,
                          model: editingBus.model,
                          capacity: Number(editingBus.capacity),
                          type: editingBus.type,
                          status: editingBus.status,
                          driverId: editingBus.driverId || ''
                        });
                        setEditingBus(null);
                        setSuccess('تم تحديث بيانات الحافلة بنجاح');
                      } catch (err) {
                        handleFirestoreError(err, OperationType.UPDATE, `buses/${editingBus.id}`);
                      }
                    }} 
                    className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 transition-colors"
                  >
                    حفظ التعديلات
                  </button>
                  <button 
                    onClick={() => setEditingBus(null)} 
                    className="flex-1 bg-stone-100 text-stone-600 py-3 rounded-xl font-bold hover:bg-stone-200 transition-colors"
                  >
                    إلغاء
                  </button>
                </div>
              </motion.div>
            </div>
          )}

          {/* Direct Notification Modal */}
          {directNotificationBooking && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl text-right space-y-4"
              >
                <div className="flex justify-between items-center pb-3 border-b border-stone-100">
                  <h3 className="text-lg font-bold text-emerald-600">إرسال إشعار مخصص للهاتف</h3>
                  <button 
                    onClick={() => setDirectNotificationBooking(null)}
                    className="p-1 hover:bg-stone-100 rounded-full text-stone-400 hover:text-stone-600 transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="bg-stone-50 p-3 rounded-2xl border border-stone-100 text-xs text-stone-600 space-y-1">
                  <p><strong>المسافر:</strong> {directNotificationBooking.passengerName}</p>
                  <p><strong>الهاتف:</strong> {directNotificationBooking.passengerPhone}</p>
                  {(() => {
                    const dev = getLinkedDeviceForBooking(directNotificationBooking);
                    return dev ? (
                      <p className="text-emerald-600 flex items-center gap-1 font-bold mt-1">
                        <Smartphone size={12} />
                        <span>الهاتف المرتبط نشط ({dev.model}) - جاهز لاستقبال الإشعار الفوري</span>
                      </p>
                    ) : (
                      <p className="text-amber-500 font-bold flex items-center gap-1 mt-1">
                        <AlertCircle size={12} />
                        <span>لم يتم رصد هاتف ذكي مباشر نشط لهذا الحساب حتى الآن. سيتم توجيهه بالرمز المحفوظ أو تعذر الاستلام.</span>
                      </p>
                    );
                  })()}
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-stone-500 mb-1">عنوان الإشعار</label>
                    <input 
                      type="text" 
                      placeholder="عنوان الإشعار (مثال: تحديث عاجل للرحلة)" 
                      value={directNotifTitle} 
                      onChange={e => setDirectNotifTitle(e.target.value)} 
                      className="w-full bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500 text-right" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-500 mb-1">نص الرسالة</label>
                    <textarea 
                      placeholder="اكتب هنا تفاصيل الإشعار المخصص..." 
                      value={directNotifBody} 
                      onChange={e => setDirectNotifBody(e.target.value)} 
                      className="w-full bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500 min-h-[100px] text-right"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button 
                    onClick={handleSendDirectNotification} 
                    disabled={directNotifStatus === 'sending'}
                    className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 disabled:bg-stone-200 disabled:text-stone-400 transition-colors flex items-center justify-center gap-2 text-sm"
                  >
                    <Send size={16} />
                    {directNotifStatus === 'sending' ? 'جاري الإرسال...' : 'إرسال الإشعار الفوري'}
                  </button>
                  <button 
                    onClick={() => setDirectNotificationBooking(null)} 
                    className="flex-1 bg-stone-100 text-stone-600 py-3 rounded-xl font-bold hover:bg-stone-200 transition-colors text-sm"
                  >
                    إلغاء
                  </button>
                </div>
              </motion.div>
            </div>
          )}

          {activeTab === 'notifications' && canSeeTab('notifications') && (
            <motion.div key="notifications" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-8">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold">إدارة الإشعارات</h2>
                {notificationStatus && (
                  <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold ${
                    notificationStatus.isStaticOnly ? 'bg-rose-100 text-rose-600' :
                    notificationStatus.initialized ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'
                  }`}>
                    <div className={`w-2 h-2 rounded-full ${
                      notificationStatus.isStaticOnly ? 'bg-rose-500 animate-pulse' :
                      notificationStatus.initialized ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
                    }`} />
                    {notificationStatus.isStaticOnly ? 'تعذر الاتصال بخادم الإشعارات في الموقع الخارجي' :
                     notificationStatus.initialized ? 'خدمة الإشعارات (FCM) مفعلة' : 'خدمة الإشعارات (FCM) تتطلب إعداد ملف الخدمة'}
                  </div>
                )}
              </div>

              {/* FCM Gateway Config Card */}
              <div className="bg-white p-6 rounded-2xl border border-stone-200/80 shadow-sm space-y-4">
                <div className="flex items-center gap-2 text-emerald-700 font-bold">
                  <Smartphone size={20} />
                  <h3>إعدادات خادم وممر الإشعارات الفورية (FCM Gateway URL)</h3>
                </div>
                <p className="text-xs text-stone-600 leading-relaxed">
                  إذا كنت تقوم بتشغيل الموقع على نطاق خارجي استاتيكي مثل <strong>alaujantravel.com</strong> بدون بيئة خادم نشطة، فلن تتمكن المتصفحات من معالجة مفاتيح إرسال Firebase مباشرة لدواعي الحماية. يمكنك توجيه طلبات الإرسال لخادم نشط (مثل رابط بيئة العمل الحالية على Cloud Run) ليعمل كبوابة وسيطة آمنة وموثوقة.
                </p>
                
                <div className="flex flex-col sm:flex-row gap-3">
                  <input 
                    type="text" 
                    placeholder="مثال: https://ais-pre-...run.app" 
                    value={gatewayUrl}
                    onChange={(e) => setGatewayUrl(e.target.value)}
                    className="flex-1 bg-stone-50 p-3 rounded-xl border border-stone-200 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    onClick={async () => {
                      try {
                        setIsSavingGateway(true);
                        setError(null);
                        setSuccess(null);
                        await setDoc(doc(db, 'settings', 'global'), { notificationGatewayUrl: gatewayUrl }, { merge: true });
                        setSuccess('تم حفظ رابط معرّف بوابة الإشعارات بنجاح!');
                        setTimeout(() => setSuccess(null), 7000);
                      } catch (err: any) {
                        setError(`فشل حفظ المعرّف: ${err.message}`);
                      } finally {
                        setIsSavingGateway(false);
                      }
                    }}
                    disabled={isSavingGateway}
                    className="bg-emerald-600 text-white font-bold px-6 py-3 rounded-xl hover:bg-emerald-700 transition flex items-center justify-center gap-2 text-sm disabled:opacity-50"
                  >
                    {isSavingGateway ? 'جاري الحفظ...' : 'حفظ التكوين'}
                  </button>
                </div>

                <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-100 text-xs text-emerald-800 space-y-1">
                  <span className="font-bold block">💡 كيف تستخدم هذه الميزة لتفعيل الإشعارات على alaujantravel.com؟</span>
                  <p className="leading-relaxed text-stone-600">
                    1. قم بنسخ رابط بيئة العمل الحالية المعروض بالأسفل وإلصاقه في الخانة العلوية:
                    <br />
                    <code className="bg-white px-2 py-0.5 rounded border font-mono select-all text-emerald-700 font-bold mt-1 inline-block">{window.location.origin}</code>
                  </p>
                  <p className="leading-relaxed text-stone-600">
                    2. اضغط على <strong>"حفظ التكوين"</strong>. بمجرد الحفظ، ستقوم قاعدة بيانات الـ Firestore بتوزيع الرابط تلقائياً لجميع لوحات الإدارة الفعالة بما فيها موقعكمalaujantravel.com وبث الإعلانات بنجاح!
                  </p>
                </div>
              </div>
              
              {notificationStatus?.isStaticOnly && (
                <div className="bg-rose-50 border border-rose-100 p-5 rounded-2xl text-rose-950 text-xs space-y-3 shadow-sm">
                  <p className="font-bold text-sm text-rose-700 flex items-center gap-1.5">⚠️ تنبيه تقني وتوجيه لحل المشكلة على موقعكم الأساسي (alaujantravel.com):</p>
                  <p className="leading-relaxed text-stone-700">
                    عند إرسال إشعار من داخل بيئة العمل الحالية (هنا)، يصل الإشعار للعميل بنجاح لأن الخادم الخلفي (Node.js backend) نشط ومكتمل التكوين هنا.
                    السبب في عدم وصول الإشعارات عند الإرسال من خلال موقعكم الخارجي (<strong>https://alaujantravel.com</strong>) يعود لعدم تشغيل خادم خلفي نشط بنفس الطريقة:
                  </p>
                  <ul className="list-decimal list-inside space-y-2.5 pr-2">
                    <li className="leading-relaxed block">
                      <strong className="text-rose-800">1. لا يوجد خادم Node.js مفعل بموقعكم (رفع الموقع كملفات Static فقط):</strong>
                      <div className="mt-1 mr-4 text-stone-700">
                        إذا تم استخدام أمر البناء <code>npm run build</code> ورفع محتويات المجلد <code>dist</code> كملفات استاتيكية (Static SPA) فقط إلى استضافة مشتركة (مثل Hostinger أو cPanel)، سيعمل كل شيء بالموقع (بما فيه قاعدة بيانات الحجوزات والرحلات) لأنها تعمل مباشرة من المتصفح، <strong>لكن الإشعارات الفورية للهواتف ستفشل دائماً</strong>؛ لأسباب أمنية، يتطلب إرسال الإشارة لـ Firebase استدعاء الواجهة الخلفية الآمنة لـ (Firebase Admin) <code>/api/send-notification</code>.
                        <div className="mt-1 font-bold text-stone-800">📌 الحل المقترح:</div>
                        يجب رفع الكود بالكامل وتشغيل أمر البدء <code>node dist/server.cjs</code> على استضافة قادرة على دعم تشغيل NodeJS (مثل سيرفر VPS، أو تفعيل تطبيق Node من داخل لوحة CPanel في الاستضافة، أو استخدام Render/Heroku/Cloud Run).
                      </div>
                    </li>
                    <li className="leading-relaxed block">
                      <strong className="text-rose-800">2. فقدان ترخيص الخدمة (Environment Secret Var):</strong>
                      <div className="mt-1 mr-4 text-stone-700">
                        إذا كان خادم NodeJS يعمل بالفعل على النطاق الخارجي ولكن الإشعارات لا تخرج، فهذا يعني أنكم لم تقوموا بتمرير رمز الحساب الخدمي الآمن كمتغير بيئة.
                        <div className="mt-1 font-bold text-stone-800">📌 الحل المقترح:</div>
                        يجب عليكم الذهاب إلى لوحة تحكم الاستضافة الخاصة بك (الإعدادات البيئية أو Environment Variables)، وإضافة متغير جديد بالاسم: <code>FIREBASE_SERVICE_ACCOUNT</code> ووضع البيانات النصية السرية الكاملة لملف الحساب الخدمي (Service Account Key) المستخرج من لوحة تحكم Firebase Web Console كقيمة له.
                      </div>
                    </li>
                  </ul>
                </div>
              )}
              
              {!notificationStatus?.isStaticOnly && !notificationStatus?.initialized && (
                <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl text-amber-800 text-xs space-y-2">
                  <p className="font-bold">تنبيه: خدمة الإشعارات (Push) غير مكتملة الإعداد</p>
                  <p>لإرسال إشعارات حقيقية للهواتف، يجب توفير الملفات التالية:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li><strong>للخادم (Backend):</strong> ملف <code>service-account.json</code> من Firebase Console {'>'} Project Settings {'>'} Service Accounts.</li>
                    <li><strong>لتطبيق الأندرويد:</strong> ملف <code>google-services.json</code> من Firebase Console {'>'} Project Settings {'>'} General {'>'} Your Apps.</li>
                    <li>يجب وضع <code>service-account.json</code> في المجلد الرئيسي، و <code>google-services.json</code> في مجلد <code>android/app/</code>.</li>
                  </ul>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
                <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100">
                  <p className="text-xs text-stone-500 mb-1">إجمالي الحسابات</p>
                  <p className="text-xl font-bold">{users.length}</p>
                </div>
                <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
                  <p className="text-xs text-emerald-600 mb-1">الهواتف الفعالة (FCM)</p>
                  <p className="text-xl font-bold text-emerald-700">
                    {Array.from(new Set([...users.map(u => u.fcmToken), ...devices.map(d => d.token)])).filter(Boolean).length}
                  </p>
                </div>
                <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
                  <p className="text-xs text-blue-600 mb-1">أجهزة أندرويد النشطة</p>
                  <p className="text-xl font-bold text-blue-700">
                    {Array.from(new Set([...users.filter(u => u.deviceType === 'android').map(u => u.fcmToken), ...devices.filter(d => d.platform === 'android').map(d => d.token)])).filter(Boolean).length}
                  </p>
                </div>
                <div className="bg-purple-50 p-4 rounded-2xl border border-purple-100">
                  <p className="text-xs text-purple-600 mb-1">أجهزة آيفون النشطة</p>
                  <p className="text-xl font-bold text-purple-700">
                    {Array.from(new Set([...users.filter(u => u.deviceType === 'ios').map(u => u.fcmToken), ...devices.filter(d => d.platform === 'ios').map(d => d.token)])).filter(Boolean).length}
                  </p>
                </div>
                <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100">
                  <p className="text-xs text-amber-600 mb-1">إجمالي الأجهزة المسجلة</p>
                  <p className="text-xl font-bold text-amber-700">{devices.length}</p>
                </div>
              </div>
              
              <div className="card space-y-4">
                <h3 className="font-bold text-emerald-600">إرسال إشعار جديد</h3>
                <div className="grid grid-cols-1 gap-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <input 
                      type="text" 
                      placeholder="عنوان الإشعار" 
                      value={newNotification.title} 
                      onChange={e => setNewNotification({...newNotification, title: e.target.value})} 
                      className="bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500" 
                    />
                    <select 
                      value={newNotification.type} 
                      onChange={e => setNewNotification({...newNotification, type: e.target.value as any, targetId: ''})} 
                      className="bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="all">الكل</option>
                      <option value="drivers">السائقين فقط</option>
                      <option value="users">المسافرين فقط</option>
                      <option value="specific">مستخدم محدد</option>
                      <option value="trip">ركاب رحلة معينة</option>
                    </select>
                    <select 
                      value={newNotification.deliveryMethod} 
                      onChange={e => setNewNotification({...newNotification, deliveryMethod: e.target.value as any})} 
                      className="bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="both">إشعار عادي + داخل التطبيق</option>
                      <option value="push">إشعار عادي فقط (Push)</option>
                      <option value="in-app">داخل التطبيق فقط</option>
                    </select>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <input 
                      type="text" 
                      placeholder="رابط الصورة (اختياري)" 
                      value={newNotification.imageUrl} 
                      onChange={e => setNewNotification({...newNotification, imageUrl: e.target.value})} 
                      className="bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500" 
                    />
                    {newNotification.type === 'specific' && (
                      <select 
                        value={newNotification.targetId} 
                        onChange={e => setNewNotification({...newNotification, targetId: e.target.value})} 
                        className="bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="">اختر المستخدم</option>
                        {users.map(u => <option key={u.uid} value={u.uid}>{u.displayName} ({u.phoneNumber || u.email || ''})</option>)}
                      </select>
                    )}
                    {newNotification.type === 'trip' && (
                      <select 
                        value={newNotification.targetId} 
                        onChange={e => setNewNotification({...newNotification, targetId: e.target.value})} 
                        className="bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="">اختر الرحلة</option>
                        {trips.map(t => {
                          const driverName = users.find(u => u.uid === t.driverId)?.displayName || 'بدون سائق';
                          return (
                            <option key={t.id} value={t.id}>
                              {t.from} ← {t.to} | {t.departureDate ? formatDateArabic(t.departureDate) : t.date} الساعة {t.departureTime || t.time} ({driverName})
                            </option>
                          );
                        })}
                      </select>
                    )}
                  </div>
                  
                  <textarea 
                    placeholder="نص الإشعار" 
                    value={newNotification.body} 
                    onChange={e => setNewNotification({...newNotification, body: e.target.value})} 
                    className="bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500 min-h-[100px]"
                  />
                  
                  <button 
                    onClick={handleSendNotification} 
                    className="btn-primary flex items-center justify-center gap-2"
                  >
                    <Send size={18} />
                    إرسال الإشعار
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-bold">سجل الإشعارات المرسلة</h3>
                <div className="grid grid-cols-1 gap-4">
                  {notifications.map(notif => (
                    <div key={notif.id} className="card border-l-4 border-emerald-500">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-bold">{notif.title}</h4>
                        <span className="text-[10px] text-stone-400">
                          {new Date(notif.sentAt).toLocaleString('ar-EG')}
                        </span>
                      </div>
                      <p className="text-sm text-stone-600 mb-3">{notif.body}</p>
                      {notif.imageUrl && (
                        <div className="mb-3 rounded-xl overflow-hidden max-w-xs">
                          <img src={notif.imageUrl} alt={notif.title} className="w-full h-auto" referrerPolicy="no-referrer" />
                        </div>
                      )}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] bg-stone-100 px-2 py-1 rounded-full text-stone-500">
                          الهدف: {
                            notif.type === 'all' ? 'الكل' : 
                            notif.type === 'drivers' ? 'السائقين' : 
                            notif.type === 'users' ? 'المسافرين' : 
                            notif.type === 'trip' ? (() => {
                              const t = trips.find(trip => trip.id === notif.targetId);
                              return t ? `ركاب رحلة (${t.from} ← ${t.to} بتاريخ ${t.date})` : 'رحلة محذوفة';
                            })() :
                            `مستخدم محدد (${users.find(u => u.uid === notif.targetId)?.displayName || 'غير معروف'})`
                          }
                        </span>
                        <span className="text-[10px] bg-emerald-50 px-2 py-1 rounded-full text-emerald-600">
                          النوع: {
                            notif.deliveryMethod === 'push' ? 'Push' :
                            notif.deliveryMethod === 'in-app' ? 'داخل التطبيق' :
                            'كلاهما'
                          }
                        </span>
                        {notif.stats && (
                          <div className="flex gap-2">
                            <span className="text-[10px] bg-blue-50 px-2 py-1 rounded-full text-blue-600">
                              المستلمين: {notif.stats.total}
                            </span>
                            <span className="text-[10px] bg-stone-100 px-2 py-1 rounded-full text-stone-500">
                              Android: {notif.stats.android} | iOS: {notif.stats.ios} | Web: {notif.stats.web}
                            </span>
                          </div>
                        )}
                        <button 
                          onClick={() => handleDeleteRequest('notifications', notif.id, notif.title)}
                          className="text-red-500 hover:text-red-700 p-1"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {notifications.length === 0 && (
                    <div className="text-center py-10 text-stone-400 bg-stone-50 rounded-3xl border-2 border-dashed">
                      لا يوجد إشعارات مرسلة بعد
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
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
                    onChange={e => {
                      const newFrom = e.target.value;
                      const fromCity = cities.find(c => c.name === newFrom);
                      let newTo = newTrip.to;
                      if (fromCity) {
                        const currentToCity = cities.find(c => c.name === newTrip.to);
                        if (currentToCity) {
                          if (newTrip.tripType === 'international' && currentToCity.country === fromCity.country) {
                            newTo = '';
                          }
                        }
                      }
                      setNewTrip({...newTrip, from: newFrom, to: newTo});
                    }} 
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
                    {cities
                      .filter(c => {
                        if (!newTrip.from) return true;
                        const fromCity = cities.find(city => city.name === newTrip.from);
                        if (!fromCity) return true;
                        if (newTrip.tripType === 'umrah') {
                          return c.name !== newTrip.from; // Same country allowed for Umrah
                        }
                        return c.country !== fromCity.country; // Different country for International
                      })
                      .map(c => <option key={c.id} value={c.name}>{c.name} ({c.country})</option>)
                    }
                  </select>
                  <input type="date" value={newTrip.date} onChange={e => setNewTrip({...newTrip, date: e.target.value})} className="bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                  <input type="time" value={newTrip.time} onChange={e => setNewTrip({...newTrip, time: e.target.value})} className="bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                  <select 
                    value={newTrip.busNumber} 
                    onChange={e => {
                      const busNum = e.target.value;
                      const bus = buses.find(b => b.busNumber === busNum);
                      setNewTrip({
                        ...newTrip, 
                        busNumber: busNum,
                        totalSeats: bus?.capacity || newTrip.totalSeats || 35
                      });
                    }} 
                    className="bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">اختر الحافلة</option>
                    {buses.map(b => <option key={b.id} value={b.busNumber}>{b.busNumber} ({b.plateNumber})</option>)}
                  </select>
                  <input type="number" placeholder="السعر (ريال)" value={newTrip.priceSAR} onChange={e => setNewTrip({...newTrip, priceSAR: Number(e.target.value)})} className="bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                  <input type="number" placeholder="السعر (ل.س)" value={newTrip.priceSYP} onChange={e => setNewTrip({...newTrip, priceSYP: Number(e.target.value)})} className="bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                  <input type="number" placeholder="عدد المقاعد" value={newTrip.totalSeats} onChange={e => setNewTrip({...newTrip, totalSeats: Number(e.target.value)})} className="bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                  <select 
                    value={newTrip.tripType} 
                    onChange={e => {
                      const newType = e.target.value as 'international' | 'umrah';
                      let newTo = newTrip.to;
                      const fromCity = cities.find(c => c.name === newTrip.from);
                      if (fromCity && newTo) {
                        const toCity = cities.find(c => c.name === newTo);
                        if (toCity && newType === 'international' && toCity.country === fromCity.country) {
                          newTo = '';
                        }
                      }
                      setNewTrip({...newTrip, tripType: newType, to: newTo});
                    }} 
                    className="bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="international">رحلة دولية</option>
                    <option value="umrah">رحلة عمرة</option>
                  </select>

                  {newTrip.tripType === 'international' && (
                    <div className="col-span-full space-y-4 p-4 bg-stone-50 rounded-2xl border border-stone-200">
                      <h4 className="font-bold text-sm text-stone-600">المدن التي تمر بها الحافلة (محطات التوقف)</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                        <select 
                          value={newStop.cityName} 
                          onChange={e => setNewStop({...newStop, cityName: e.target.value})}
                          className="bg-white p-3 rounded-xl text-sm outline-none border border-stone-200"
                        >
                          <option value="">اختر المدينة...</option>
                          {cities.filter(c => c.name !== newTrip.from && c.name !== newTrip.to).map(c => (
                            <option key={c.id} value={c.name}>{c.name} ({c.country})</option>
                          ))}
                        </select>
                        <input 
                          type="number" 
                          placeholder="السعر (ريال)" 
                          value={newStop.priceSAR || ''} 
                          onChange={e => setNewStop({...newStop, priceSAR: Number(e.target.value)})}
                          className="bg-white p-3 rounded-xl text-sm outline-none border border-stone-200"
                        />
                        <input 
                          type="number" 
                          placeholder="السعر (ل.س)" 
                          value={newStop.priceSYP || ''} 
                          onChange={e => setNewStop({...newStop, priceSYP: Number(e.target.value)})}
                          className="bg-white p-3 rounded-xl text-sm outline-none border border-stone-200"
                        />
                        <button 
                          onClick={() => {
                            if (!newStop.cityName || !newStop.priceSAR || !newStop.priceSYP) return;
                            setNewTrip({
                              ...newTrip,
                              stops: [...(newTrip.stops || []), newStop]
                            });
                            setNewStop({ cityName: '', priceSAR: 0, priceSYP: 0 });
                          }}
                          className="bg-emerald-500 text-white p-3 rounded-xl text-sm font-bold hover:bg-emerald-600 transition-colors"
                        >
                          إضافة محطة
                        </button>
                      </div>
                      
                      {newTrip.stops && newTrip.stops.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-2">
                          {newTrip.stops.map((stop, idx) => (
                            <div key={idx} className="bg-white border border-emerald-200 px-3 py-1 rounded-full flex items-center gap-2 text-xs">
                              <span className="font-bold text-emerald-600">{stop.cityName}</span>
                              <span className="text-stone-400">({stop.priceSAR} ريال / {stop.priceSYP} ل.س)</span>
                              <button 
                                onClick={() => setNewTrip({...newTrip, stops: newTrip.stops?.filter((_, i) => i !== idx)})}
                                className="text-red-500 hover:text-red-700"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <button onClick={handleAddTrip} className="btn-primary col-span-full">إضافة الرحلة</button>
                </div>
              </div>

              <div className="overflow-x-auto w-full -mx-4 sm:mx-0">
                <div className="inline-block min-w-full align-middle">
                  <table className="min-w-full text-right">
                    <thead className="bg-stone-50 border-b">
                      <tr className="text-xs text-stone-400 uppercase">
                        <th className="p-4 whitespace-nowrap">رقم التتبع</th>
                        <th className="p-4 whitespace-nowrap">الرحلة</th>
                        <th className="p-4 whitespace-nowrap">النوع</th>
                        <th className="p-4 whitespace-nowrap">التاريخ</th>
                        <th className="p-4 whitespace-nowrap">الحافلة</th>
                        <th className="p-4 whitespace-nowrap">السعر (ريال)</th>
                        <th className="p-4 whitespace-nowrap">السعر (ل.س)</th>
                        <th className="p-4 whitespace-nowrap">السائق</th>
                        <th className="p-4 whitespace-nowrap">الحالة</th>
                        <th className="p-4 whitespace-nowrap">الإجراءات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {trips.map(trip => (
                        <tr key={trip.id} className="text-sm">
                          <td className="p-4 font-mono font-bold text-emerald-600">{trip.trackingNumber}</td>
                          <td className="p-4 font-bold">
                            <div>{trip.from} ← {trip.to}</div>
                            {trip.stops && trip.stops.length > 0 && (
                              <div className="text-[10px] text-stone-400 font-normal mt-1 flex flex-wrap gap-1">
                                <span>المحطات:</span>
                                {trip.stops.map((s, i) => (
                                  <span key={i} className="bg-stone-100 px-1 rounded">{s.cityName}</span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="p-4">
                            <span className={`text-[10px] px-2 py-1 rounded-full ${trip.tripType === 'umrah' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}`}>
                              {trip.tripType === 'umrah' ? 'عمرة' : 'دولية'}
                            </span>
                          </td>
                          <td className="p-4 whitespace-nowrap">{trip.date} {trip.time}</td>
                          <td className="p-4 whitespace-nowrap">{trip.busNumber}</td>
                          <td className="p-4 font-bold text-emerald-600 whitespace-nowrap">{trip.priceSAR?.toLocaleString() || trip.price?.toLocaleString()} ريال</td>
                          <td className="p-4 font-bold text-emerald-600 whitespace-nowrap">{trip.priceSYP?.toLocaleString()} ل.س</td>
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
                        <div className="flex gap-2">
                          <button onClick={() => setEditingBus(bus)} className="text-stone-300 hover:text-emerald-600 transition-colors" title="تعديل">
                            <Edit size={18} />
                          </button>
                          <button onClick={() => handleDeleteRequest('buses', bus.id, `الحافلة ${bus.busNumber}`)} className="text-stone-300 hover:text-red-500 transition-colors" title="حذف">
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                      <h4 className="font-bold text-lg">{bus.busNumber}</h4>
                      <p className="text-xs text-stone-400 mb-2">{bus.plateNumber} • {bus.model}</p>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs text-stone-500">السعة:</span>
                        <input 
                          type="number" 
                          value={bus.capacity} 
                          onChange={(e) => updateDoc(doc(db, 'buses', bus.id), { capacity: Number(e.target.value) })}
                          className="bg-stone-100 px-2 py-1 rounded text-xs w-16 font-bold"
                        />
                      </div>
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

                  <div className="flex flex-wrap gap-2 justify-between items-center mb-4">
                    <h3 className="font-bold text-emerald-600">قائمة الحجوزات</h3>
                    <div className="flex gap-2">
                      <button 
                        onClick={handlePrintPassengerList}
                        className="flex items-center gap-2 bg-stone-100 hover:bg-stone-200 text-stone-700 px-4 py-2 rounded-xl text-sm transition-colors"
                      >
                        <Printer size={16} />
                        طباعة الكشف كامل
                      </button>
                      <button 
                        onClick={handlePrintFinancialPassengerList}
                        className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-sm transition-colors font-bold shadow-sm"
                      >
                        <Printer size={16} />
                        طباعة الكشف المالي
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto w-full -mx-4 sm:mx-0">
                    <div className="inline-block min-w-full align-middle">
                      <table className="min-w-full text-right">
                        <thead className="bg-stone-50 border-b">
                          <tr className="text-xs text-stone-400 uppercase">
                            <th className="p-4 whitespace-nowrap">المسافر</th>
                            <th className="p-4 whitespace-nowrap">رقم الجواز</th>
                            <th className="p-4 whitespace-nowrap">المقعد</th>
                            <th className="p-4 whitespace-nowrap">طريقة الدفع</th>
                            <th className="p-4 whitespace-nowrap">الحالة</th>
                            <th className="p-4 whitespace-nowrap">الإجراءات</th>
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
                                    placeholder="الاسم"
                                  />
                                  <input 
                                    type="tel" 
                                    value={editBookingData.passengerPhone} 
                                    onChange={e => setEditBookingData({...editBookingData, passengerPhone: e.target.value})}
                                    className="bg-white border p-1 rounded w-full text-xs"
                                    placeholder="رقم الهاتف"
                                  />
                                  <div className="flex gap-2">
                                    <div className="flex-1">
                                      <label className="text-[9px] text-stone-450 block font-bold">الطرود الإضافية</label>
                                      <input 
                                        type="number" 
                                        min="0"
                                        placeholder="عدد الطرود"
                                        value={editBookingData.extraParcelsCount || 0} 
                                        onChange={e => setEditBookingData({...editBookingData, extraParcelsCount: Number(e.target.value)})}
                                        className="bg-white border p-1 rounded w-full text-xs animate-none"
                                      />
                                    </div>
                                    <div className="flex-1">
                                      <label className="text-[9px] text-stone-450 block font-bold">السعر الإضافي</label>
                                      <input 
                                        type="number" 
                                        min="0"
                                        placeholder="السعر الإضافي"
                                        value={editBookingData.extraParcelsPrice || 0} 
                                        onChange={e => setEditBookingData({...editBookingData, extraParcelsPrice: Number(e.target.value)})}
                                        className="bg-white border p-1 rounded w-full text-xs animate-none"
                                      />
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <p className="font-bold">{booking.passengerName}</p>
                                  <p className="text-xs text-stone-400">{booking.passengerPhone}</p>
                                  {booking.from && booking.to && (
                                    <p className="text-[10px] text-emerald-600 font-bold mt-1">
                                      {booking.from} ← {booking.to}
                                    </p>
                                  )}
                                  {booking.extraParcelsCount ? (
                                    <p className="text-[10px] text-amber-700 font-bold mt-1 bg-amber-50 px-1.5 py-0.5 rounded w-max border border-amber-100 flex items-center gap-1">
                                      <span>📦 طرود إضافية: {booking.extraParcelsCount} | +{booking.extraParcelsPrice || 0} {
                                        (() => {
                                          const tripObj = trips.find(t => t.id === booking.tripId);
                                          return tripObj ? getBookingPrice(booking, tripObj).currency : 'ريال';
                                        })()
                                      }</span>
                                    </p>
                                  ) : null}
                                  {(() => {
                                    const linkedDevice = getLinkedDeviceForBooking(booking);
                                    if (linkedDevice) {
                                      return (
                                        <div className="flex items-center gap-1 mt-1 text-[10px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded w-max border border-emerald-100">
                                          <Smartphone size={10} />
                                          <span>جهاز نشط: {linkedDevice.model}</span>
                                        </div>
                                      );
                                    } else {
                                      return (
                                        <div className="flex items-center gap-1 mt-1 text-[10px] text-stone-400 bg-stone-50 px-1.5 py-0.5 rounded w-max border border-stone-100">
                                          <Smartphone size={10} className="opacity-50" />
                                          <span>لا يوجد هاتف مرتبط</span>
                                        </div>
                                      );
                                    }
                                  })()}
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
                                      onClick={() => {
                                        setDirectNotificationBooking(booking);
                                        setDirectNotifTitle('تحديث بخصوص رحلتك');
                                        setDirectNotifBody(`عزيزي ${booking.passengerName}، نود إعلامك بـ...`);
                                      }}
                                      className="text-amber-500 p-2 hover:bg-amber-50 rounded-lg"
                                      title="إرسال إشعار مباشر للهاتف"
                                    >
                                      <Bell size={16} />
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
                                        <img 
                                          src="/logoaujantravel.jpeg" 
                                          alt="Logo" 
                                          referrerPolicy="no-referrer"
                                          style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '50%' }} 
                                        />
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
                                        <p style={{ margin: 0, fontWeight: 'bold', fontSize: '18px', color: '#065f46' }}>{booking.from || trips.find(t => t.id === booking.tripId)?.from}</p>
                                      </div>
                                      <div style={{ color: '#6ee7b7', fontSize: '24px' }}>←</div>
                                      <div style={{ flex: 1, textAlign: 'left' }}>
                                        <p style={{ margin: 0, fontSize: '10px', color: '#059669', fontWeight: 'normal' }}>إلى</p>
                                        <p style={{ margin: 0, fontWeight: 'bold', fontSize: '18px', color: '#065f46' }}>{booking.to || trips.find(t => t.id === booking.tripId)?.to}</p>
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
                                      {(() => {
                                        const tripObj = trips.find(t => t.id === booking.tripId);
                                        const priceInfo = tripObj ? getBookingPrice(booking, tripObj) : { value: 0, currency: '' };
                                        const extra = booking.extraParcelsPrice || 0;
                                        const total = priceInfo.value + extra;
                                        return (
                                          <div style={{ flex: 1 }}>
                                            <p style={{ margin: 0, fontSize: '10px', color: '#999999', fontWeight: 'normal' }}>سعر التذكرة</p>
                                            <p style={{ margin: 0, fontWeight: 'bold', fontSize: '16px', color: '#059669' }}>{total} {priceInfo.currency}</p>
                                            {extra > 0 && (
                                              <p style={{ margin: '2px 0 0 0', fontSize: '8px', color: '#b45309', fontWeight: 'bold' }}>
                                                (يشمل {booking.extraParcelsCount} طرود: +{extra} {priceInfo.currency})
                                              </p>
                                            )}
                                          </div>
                                        );
                                      })()}
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
                                        <p style={{ margin: 0, fontWeight: 'bold', fontSize: '10px', color: '#1c1917' }}>{booking.from || trips.find(t => t.id === booking.tripId)?.from}</p>
                                      </div>
                                      <div>
                                        <p style={{ margin: 0, fontSize: '8px', color: '#999999' }}>إلى</p>
                                        <p style={{ margin: 0, fontWeight: 'bold', fontSize: '10px', color: '#1c1917' }}>{booking.to || trips.find(t => t.id === booking.tripId)?.to}</p>
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
                                      <div>
                                        <p style={{ margin: 0, fontSize: '8px', color: '#999999' }}>السعر</p>
                                        {(() => {
                                          const tripObj = trips.find(t => t.id === booking.tripId);
                                          const priceInfo = tripObj ? getBookingPrice(booking, tripObj) : { value: 0, currency: '' };
                                          const extra = booking.extraParcelsPrice || 0;
                                          return (
                                            <p style={{ margin: 0, fontWeight: 'bold', fontSize: '10px', color: '#059669' }}>
                                              {priceInfo.value + extra} {priceInfo.currency}
                                            </p>
                                          );
                                        })()}
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
                          <div className="flex items-center gap-3">
                            <button onClick={() => updateRole(user.uid, 'user')} className="text-stone-400 hover:text-stone-600 text-xs font-bold">تنزيل لرتبة مستخدم</button>
                            <button 
                              onClick={() => handleDeleteRequest('users', user.uid, user.displayName)} 
                              className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded-lg transition-colors"
                              title="حذف المستخدم نهائياً"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
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
                      <img 
                        src={banner.imageUrl} 
                        alt="" 
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover" 
                      />
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
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h2 className="text-2xl font-bold">إدارة شحن الطرود</h2>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
                  <input 
                    type="text" 
                    placeholder="بحث بالاسم، البوليصة، أو الهاتف..." 
                    value={parcelSearch}
                    onChange={e => setParcelSearch(e.target.value)}
                    className="w-full bg-white border border-stone-200 rounded-xl pr-10 pl-4 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                  />
                </div>
              </div>

              <div className="card space-y-6">
                <h3 className="font-bold text-emerald-600">إنشاء شحنة طرد جديدة</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs text-stone-400 font-bold px-1">الرحلة المرتبطة</label>
                    <select 
                      value={newParcel.tripId} 
                      onChange={e => {
                        const selectedId = e.target.value;
                        const selectedTrip = trips.find(t => t.id === selectedId);
                        setNewParcel({
                          ...newParcel,
                          tripId: selectedId,
                          from: selectedTrip ? selectedTrip.from : '',
                          to: selectedTrip ? selectedTrip.to : ''
                        });
                      }}
                      className="w-full bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="">اختر الرحلة...</option>
                      {trips.filter(t => t.status === 'active' || t.status === 'scheduled').map(t => (
                        <option key={t.id} value={t.id}>{t.from} ➔ {t.to} ({t.date} - {t.time}) - {t.trackingNumber}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-stone-400 font-bold px-1">شحن من</label>
                    <select 
                      value={newParcel.from || ''} 
                      onChange={e => setNewParcel({...newParcel, from: e.target.value})}
                      className="w-full bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="">اختر مدينة الارسال...</option>
                      {cities.map(c => (
                        <option key={c.id} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-stone-400 font-bold px-1">شحن إلى</label>
                    <select 
                      value={newParcel.to || ''} 
                      onChange={e => setNewParcel({...newParcel, to: e.target.value})}
                      className="w-full bg-stone-100 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="">اختر مدينة الاستلام...</option>
                      {cities.map(c => (
                        <option key={c.id} value={c.name}>{c.name}</option>
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

              <div className="space-y-6">
                {trips.filter(t => parcels.some(p => p.tripId === t.id)).map(trip => {
                  const tripParcels = parcels.filter(p => p.tripId === trip.id)
                    .filter(p => {
                      const s = parcelSearch.toLowerCase();
                      return !s || 
                        p.waybillNumber?.toLowerCase().includes(s) ||
                        p.senderName.toLowerCase().includes(s) ||
                        p.receiverName.toLowerCase().includes(s) ||
                        p.senderPhone.includes(s) ||
                        p.receiverPhone.includes(s);
                    });

                  if (tripParcels.length === 0 && parcelSearch) return null;

                  return (
                    <div key={trip.id} className="card p-0 overflow-hidden border-emerald-100 border-2">
                      <div className="bg-emerald-50 p-4 border-b flex justify-between items-center">
                        <div>
                          <h4 className="font-bold text-emerald-800">{trip.from} ➔ {trip.to}</h4>
                          <p className="text-xs text-emerald-600">{formatDateArabic(trip.date)} - {trip.time} ({trip.trackingNumber})</p>
                        </div>
                        <button 
                          onClick={() => handlePrintTripParcels(trip, tripParcels)}
                          className="flex items-center gap-2 bg-white text-emerald-600 px-4 py-2 rounded-xl text-xs font-bold shadow-sm hover:shadow-md transition-all"
                        >
                          <Printer size={16} />
                          طباعة كشف الشحنات
                        </button>
                      </div>
                      <table className="w-full text-right">
                        <thead className="bg-stone-50 border-b">
                          <tr className="text-xs text-stone-400 uppercase">
                            <th className="p-4">رقم بوليصة الشحن</th>
                            <th className="p-4">المرسل والمستلم</th>
                            <th className="p-4">المسار والوجهة</th>
                            <th className="p-4">السعر</th>
                            <th className="p-4">الحالة</th>
                            <th className="p-4">الإجراءات</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {tripParcels.map(parcel => (
                            <tr key={parcel.id} className="text-sm hover:bg-stone-50 transition-colors">
                              <td className="p-4 font-mono font-bold text-emerald-600">{parcel.waybillNumber}</td>
                              <td className="p-4">
                                <div className="space-y-1">
                                  <p><span className="text-stone-400">من:</span> {parcel.senderName}</p>
                                  <p><span className="text-stone-400">إلى:</span> {parcel.receiverName}</p>
                                </div>
                              </td>
                              <td className="p-4">
                                <span className="bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-lg text-xs font-bold border border-emerald-100 inline-block">
                                  {parcel.from || trip.from} ➔ {parcel.to || trip.to}
                                </span>
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
                                    onClick={() => handleDeleteRequest('parcels', parcel.id, `الشحنة ${parcel.waybillNumber}`)}
                                    className="p-2 text-stone-400 hover:text-red-500 transition-colors"
                                    title="حذف"
                                  >
                                    <Trash2 size={18} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })}

                {parcels.length === 0 && (
                  <div className="card p-10 text-center text-stone-400">لا يوجد شحنات مسجلة حالياً.</div>
                )}
                
                {parcels.some(p => !p.tripId) && (
                  <div className="card p-0 overflow-hidden border-stone-100 border-2 mt-8">
                    <div className="bg-stone-50 p-4 border-b">
                      <h4 className="font-bold text-stone-600">شحنات عامة (غير مرتبطة برحلة)</h4>
                    </div>
                    <div className="overflow-x-auto w-full">
                      <div className="inline-block min-w-full align-middle">
                        <table className="min-w-full text-right">
                          <thead className="bg-stone-50 border-b">
                            <tr className="text-xs text-stone-400 uppercase">
                              <th className="p-4 whitespace-nowrap">رقم بوليصة الشحن</th>
                              <th className="p-4 whitespace-nowrap">المرسل والمستلم</th>
                              <th className="p-4 whitespace-nowrap">المسار</th>
                              <th className="p-4 whitespace-nowrap">السعر</th>
                              <th className="p-4 whitespace-nowrap">الحالة</th>
                              <th className="p-4 whitespace-nowrap">الإجراءات</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {parcels.filter(p => !p.tripId).map(parcel => (
                              <tr key={parcel.id} className="text-sm hover:bg-stone-50 transition-colors">
                                <td className="p-4 font-mono font-bold text-emerald-600">{parcel.waybillNumber}</td>
                                <td className="p-4 whitespace-nowrap">
                                  <p><span className="text-stone-400">من:</span> {parcel.senderName}</p>
                                  <p><span className="text-stone-400">إلى:</span> {parcel.receiverName}</p>
                                </td>
                                <td className="p-4 whitespace-nowrap">
                                  <p className="font-bold">{parcel.from} ➔ {parcel.to}</p>
                                </td>
                                <td className="p-4 font-bold whitespace-nowrap">
                                  {parcel.price?.toLocaleString('ar-EG')} {parcel.currency === 'SYP' ? 'ل.س' : 'ريال'}
                                </td>
                                <td className="p-4">
                                    <select 
                                      value={parcel.status} 
                                      onChange={async (e) => await updateDoc(doc(db, 'parcels', parcel.id), { status: e.target.value })}
                                      className="px-2 py-1 rounded-lg text-xs font-bold bg-stone-100 text-stone-600"
                                    >
                                      <option value="pending">قيد الانتظار</option>
                                      <option value="shipped">تم الشحن</option>
                                      <option value="delivered">تم التسليم</option>
                                    </select>
                                </td>
                                <td className="p-4">
                                  <div className="flex items-center gap-2">
                                    <button onClick={() => handlePrintParcelInvoice(parcel)} className="p-2 text-stone-400 hover:text-emerald-600">
                                      <Printer size={18} />
                                    </button>
                                    <button onClick={() => handleDeleteRequest('parcels', parcel.id, `الشحنة ${parcel.waybillNumber}`)} className="p-2 text-stone-400 hover:text-red-500">
                                      <Trash2 size={18} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
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
    try {
      const newPermissions = hasPermission 
        ? user.permissions?.filter(p => p !== permission) 
        : [...(user.permissions || []), permission];
      await updateDoc(doc(db, 'users', user.uid), { permissions: newPermissions });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
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
