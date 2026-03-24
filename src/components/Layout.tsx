import React, { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Bus, User, MapPin, Package, LayoutDashboard, LogOut } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { motion } from 'framer-motion';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, profile, login, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Redirect admin to dashboard on login or if on home page
  useEffect(() => {
    if (profile?.role === 'admin' && location.pathname === '/') {
      navigate('/admin');
    }
  }, [profile, location.pathname, navigate]);

  const navItems = [
    { name: 'الرئيسية', path: '/', icon: Bus },
    { name: 'حجز رحلة', path: '/booking', icon: MapPin },
    { name: 'تتبع الطرد والرحلات', path: '/tracking', icon: Package },
    { name: 'حجوزاتي', path: '/profile', icon: User },
  ];

  if (profile?.role === 'driver') {
    navItems.push({ name: 'لوحة القائد', path: '/driver', icon: LayoutDashboard });
  }
  if (profile?.role === 'admin' || profile?.role === 'staff') {
    navItems.push({ name: 'الإدارة', path: '/admin', icon: LayoutDashboard });
  }

  return (
    <div className="min-h-screen flex flex-col font-sans">
      {/* Navbar */}
      <nav className="glass sticky top-0 z-50 px-4 py-3 flex items-center justify-between shadow-sm">
        <Link to="/" className="flex items-center gap-2">
          <img src="https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0226720471.firebasestorage.app/o/logoaujan.png?alt=media" alt="Logo" className="w-10 h-10" />
          <span className="text-xl font-bold text-emerald-800 hidden sm:block">العوجان للسياحة</span>
        </Link>

        <div className="flex items-center gap-3 sm:gap-8">
          {navItems.map(item => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center gap-1 transition-colors ${
                location.pathname === item.path ? 'text-emerald-600 font-bold' : 'text-stone-500 hover:text-emerald-600'
              }`}
            >
              <item.icon size={18} className="sm:size-5" />
              <span className="text-[9px] sm:text-xs text-center whitespace-nowrap">{item.name}</span>
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <div className="flex items-center gap-2">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-bold">{profile?.displayName}</p>
                <p className="text-[10px] text-stone-500 uppercase">{profile?.role}</p>
              </div>
              <button onClick={logout} className="p-2 hover:bg-stone-100 rounded-full text-stone-600 transition-colors">
                <LogOut size={20} />
              </button>
            </div>
          ) : (
            <Link to="/login" className="btn-primary py-2 px-4 text-sm">تسجيل الدخول</Link>
          )}
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6">
        {children}
      </main>

      {/* WhatsApp Floating Button */}
      <a
        href="https://wa.me/966500069261"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 left-6 z-50 bg-[#25D366] text-white p-4 rounded-full shadow-lg hover:scale-110 transition-transform flex items-center justify-center"
        title="تواصل معنا عبر واتساب"
      >
        <svg 
          viewBox="0 0 24 24" 
          width="24" 
          height="24" 
          stroke="currentColor" 
          strokeWidth="2" 
          fill="none" 
          strokeLinecap="round" 
          strokeLinejoin="round"
        >
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
        </svg>
      </a>

      {/* Footer */}
      <footer className="bg-stone-900 text-stone-400 py-8 px-4 text-center">
        <p className="text-sm">© 2026 العوجان للسياحة والسفر - جميع الحقوق محفوظة</p>
      </footer>
    </div>
  );
}
