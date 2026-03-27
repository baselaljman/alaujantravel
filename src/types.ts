export type UserRole = 'user' | 'admin' | 'driver' | 'staff';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  photoURL?: string;
  phoneNumber?: string;
  fcmToken?: string;
  deviceType?: 'android' | 'ios' | 'web';
  createdAt?: string;
  permissions?: string[]; // For staff/admin customization
}

export interface Bus {
  id: string;
  plateNumber: string;
  busNumber: string;
  model: string;
  capacity: number;
  type: 'VIP' | 'Standard';
  status: 'active' | 'maintenance' | 'inactive';
  driverId?: string;
}

export interface Trip {
  id: string;
  from: string;
  to: string;
  date: string;
  time: string;
  price: number; // For backward compatibility
  priceSAR: number;
  priceSYP: number;
  busType: 'VIP' | 'Standard';
  totalSeats: number;
  availableSeats: number;
  bookedSeats?: number[];
  status: 'active' | 'cancelled' | 'completed' | 'scheduled' | 'paused';
  busNumber?: string;
  driverId?: string;
  trackingNumber?: string;
  tripType?: 'international' | 'umrah';
}

export interface Booking {
  id: string;
  tripId: string;
  userId: string;
  seatNumber: number;
  passengerName: string;
  passengerPhone: string;
  passengerEmail?: string;
  passportNumber?: string;
  paymentMethod: 'online' | 'later';
  bookingDate: string;
  status: 'confirmed' | 'pending' | 'cancelled';
}

export interface Parcel {
  id: string;
  senderName: string;
  senderPhone: string;
  receiverName: string;
  receiverPhone: string;
  from: string;
  to: string;
  tripId: string;
  trackingNumber: string;
  note?: string;
  price: number;
  currency: 'SAR' | 'SYP';
  status: 'pending' | 'shipped' | 'delivered';
  createdAt: string;
}

export interface Country {
  id: string;
  name: string;
}

export interface City {
  id: string;
  name: string;
  country: string;
}

export interface LiveLocation {
  driverId: string;
  tripId: string;
  lat: number;
  lng: number;
  lastUpdated: string;
}

export interface Banner {
  id: string;
  imageUrl: string;
  link?: string;
  order: number;
  active: boolean;
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  type: 'all' | 'drivers' | 'users' | 'specific';
  targetId?: string;
  sentAt: string;
  sentBy: string;
  deliveryMethod?: 'push' | 'in-app' | 'both';
  imageUrl?: string;
  stats?: {
    total: number;
    android: number;
    ios: number;
    web: number;
  };
}
