export type UserRole = 'user' | 'admin' | 'driver' | 'staff';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  photoURL?: string;
  phoneNumber?: string;
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
  price: number;
  busType: 'VIP' | 'Standard';
  totalSeats: number;
  availableSeats: number;
  bookedSeats?: number[];
  status: 'active' | 'cancelled' | 'completed' | 'scheduled' | 'paused';
  busNumber?: string;
  driverId?: string;
  trackingNumber?: string;
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
  senderId: string;
  receiverName: string;
  receiverPhone: string;
  from: string;
  to: string;
  status: 'pending' | 'shipped' | 'delivered';
  trackingNumber: string;
  description?: string;
}

export interface LiveLocation {
  driverId: string;
  tripId: string;
  lat: number;
  lng: number;
  lastUpdated: string;
}
