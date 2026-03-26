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
    <div style={{ height: 'var(--app-height, 100%)' }} className="flex flex-col font-sans overflow-hidden">
      {/* Navbar */}
      <nav className="glass sticky top-0 z-50 px-2 sm:px-4 py-2 sm:py-3 flex items-center justify-between shadow-sm shrink-0 flex-nowrap">
        <Link to="/" className="flex items-center gap-1 shrink-0">
          <img src="https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0226720471.firebasestorage.app/o/logoaujan.png?alt=media" alt="Logo" className="w-7 h-7 sm:w-10 sm:h-10" />
          <span className="text-base sm:text-xl font-bold text-emerald-800 hidden md:block">العوجان للسياحة</span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-8 overflow-x-auto no-scrollbar py-1 flex-1 justify-center min-w-0 mx-2">
          {navItems.map(item => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center gap-0.5 sm:gap-1 transition-colors shrink-0 ${
                location.pathname === item.path ? 'text-emerald-600 font-bold' : 'text-stone-500 hover:text-emerald-600'
              }`}
            >
              <item.icon size={16} className="sm:size-5" />
              <span className="text-[8px] sm:text-xs text-center whitespace-nowrap">{item.name}</span>
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {user ? (
            <div className="flex items-center gap-1 sm:gap-2">
              <div className="text-right hidden lg:block">
                <p className="text-xs font-bold">{profile?.displayName}</p>
                <p className="text-[10px] text-stone-500 uppercase">{profile?.role}</p>
              </div>
              <button onClick={logout} className="p-1.5 sm:p-2 hover:bg-stone-100 rounded-full text-stone-600 transition-colors">
                <LogOut size={18} className="sm:size-5" />
              </button>
            </div>
          ) : (
            <Link to="/login" className="btn-primary py-1.5 px-3 sm:py-2 sm:px-4 text-[10px] sm:text-sm shrink-0">تسجيل الدخول</Link>
          )}
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 overflow-y-auto pb-20 sm:pb-12 min-h-0">
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
