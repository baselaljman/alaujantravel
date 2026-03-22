import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Bus, User, MapPin, Package, LayoutDashboard, LogOut, MessageCircle, X, Send } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { getAiResponse } from '../services/geminiService';
import { motion, AnimatePresence } from 'framer-motion';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, profile, login, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [messages, setMessages] = useState<{ text: string; isAi: boolean }[]>([
    { text: 'مرحباً بك في العوجان للسياحة والسفر! كيف يمكنني مساعدتك اليوم؟', isAi: true }
  ]);
  const [input, setInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Redirect admin to dashboard on login or if on home page
  useEffect(() => {
    if (profile?.role === 'admin' && location.pathname === '/') {
      navigate('/admin');
    }
  }, [profile, location.pathname, navigate]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMsg = input;
    setInput('');
    setMessages(prev => [...prev, { text: userMsg, isAi: false }]);
    
    const aiResponse = await getAiResponse(userMsg);
    setMessages(prev => [...prev, { text: aiResponse || 'عذراً، حدث خطأ.', isAi: true }]);
  };

  const navItems = [
    { name: 'الرئيسية', path: '/', icon: Bus },
    { name: 'حجز رحلة', path: '/booking', icon: MapPin },
    { name: 'تتبع طرد', path: '/tracking', icon: Package },
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
          <img src="https://xn--ogbhrq.vip/wp-content/uploads/2026/03/bus-svgrepo-com-1.svg" alt="Logo" className="w-10 h-10" />
          <span className="text-xl font-bold text-emerald-800 hidden sm:block">العوجان للسياحة</span>
        </Link>

        <div className="flex items-center gap-4 sm:gap-8">
          {navItems.map(item => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center gap-1 text-sm transition-colors ${
                location.pathname === item.path ? 'text-emerald-600 font-bold' : 'text-stone-500 hover:text-emerald-600'
              }`}
            >
              <item.icon size={20} />
              <span className="hidden md:block">{item.name}</span>
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

      {/* AI Assistant Bubble */}
      <div className="fixed bottom-6 left-6 z-50">
        <AnimatePresence>
          {isChatOpen && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.9 }}
              className="glass w-80 h-96 mb-4 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            >
              <div className="bg-emerald-600 p-4 text-white flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <MessageCircle size={20} />
                  <span className="font-bold">المساعد الذكي</span>
                </div>
                <button onClick={() => setIsChatOpen(false)}><X size={20} /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-stone-50/50">
                {messages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.isAi ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${
                      msg.isAi ? 'bg-white text-stone-800 shadow-sm' : 'bg-emerald-600 text-white'
                    }`}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <div className="p-3 border-t bg-white flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="اسألني أي شيء..."
                  className="flex-1 bg-stone-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button onClick={handleSend} className="bg-emerald-600 text-white p-2 rounded-xl">
                  <Send size={18} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <button
          onClick={() => setIsChatOpen(!isChatOpen)}
          className="bg-emerald-600 text-white p-4 rounded-full shadow-lg hover:scale-110 transition-transform"
        >
          <MessageCircle size={24} />
        </button>
      </div>

      {/* Footer */}
      <footer className="bg-stone-900 text-stone-400 py-8 px-4 text-center">
        <p className="text-sm">© 2026 العوجان للسياحة والسفر - جميع الحقوق محفوظة</p>
      </footer>
    </div>
  );
}
