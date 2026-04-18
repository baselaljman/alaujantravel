import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { motion } from 'framer-motion';
import { Mail, Lock, User, LogIn, UserPlus, Chrome, Phone, CheckCircle2, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';

export default function Login() {
  const { login, loginWithEmail, registerWithEmail, resetPassword, signInWithPhone, verifyOtp, user } = useAuth();
  const [authMode, setAuthMode] = useState<'email-login' | 'email-register' | 'phone'>('email-login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [selectedCountry, setSelectedCountry] = useState({ code: '+966', flag: '🇸🇦', name: 'السعودية' });
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const countries = [
    { code: '+966', flag: '🇸🇦', name: 'السعودية' },
    { code: '+971', flag: '🇦🇪', name: 'الإمارات' },
    { code: '+965', flag: '🇰🇼', name: 'الكويت' },
    { code: '+973', flag: '🇧🇭', name: 'البحرين' },
    { code: '+974', flag: '🇶🇦', name: 'قطر' },
    { code: '+968', flag: '🇴🇲', name: 'عمان' },
    { code: '+962', flag: '🇯🇴', name: 'الأردن' },
    { code: '+961', flag: '🇱🇧', name: 'لبنان' },
    { code: '+963', flag: '🇸🇾', name: 'سوريا' },
    { code: '+964', flag: '🇮🇶', name: 'العراق' },
    { code: '+20', flag: '🇪🇬', name: 'مصر' },
    { code: '+212', flag: '🇲🇦', name: 'المغرب' },
    { code: '+213', flag: '🇩🇿', name: 'الجزائر' },
    { code: '+216', flag: '🇹🇳', name: 'تونس' },
    { code: '+218', flag: '🇱🇾', name: 'ليبيا' },
    { code: '+249', flag: '🇸🇩', name: 'السودان' },
    { code: '+967', flag: '🇾🇪', name: 'اليمن' },
    { code: '+970', flag: '🇵🇸', name: 'فلسطين' },
  ];

  const navigate = useNavigate();

  const isRegister = authMode === 'email-register';
  const isPhone = authMode === 'phone';

  React.useEffect(() => {
    if (user) {
      navigate('/');
    }
  }, [user, navigate]);

  if (user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isRegister) {
        await registerWithEmail(email, password, name);
      } else {
        await loginWithEmail(email, password);
      }
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'حدث خطأ ما');
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      if (!showOtpInput) {
        // Handle leading zero and formatting
        let cleanPhone = phone.trim();
        if (cleanPhone.startsWith('0')) {
          cleanPhone = cleanPhone.substring(1);
        }
        
        // Remove any non-numeric characters for safety
        cleanPhone = cleanPhone.replace(/\D/g, '');
        
        const formattedPhone = `${selectedCountry.code}${cleanPhone}`;
        
        await signInWithPhone(formattedPhone, 'recaptcha-container');
        setShowOtpInput(true);
        setMessage('تم إرسال كود التحقق إلى هاتفك');
      } else {
        await verifyOtp(otp);
        navigate('/');
      }
    } catch (err: any) {
      setError(err.message || 'فشل التحقق من رقم الهاتف');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      await login();
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'حدث خطأ ما');
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError('يرجى إدخال البريد الإلكتروني أولاً');
      return;
    }
    setError('');
    setMessage('');
    setLoading(true);
    try {
      await resetPassword(email);
      setMessage('تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني');
    } catch (err: any) {
      setError(err.message || 'فشل إرسال رابط إعادة التعيين');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-10 p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card space-y-6"
      >
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-emerald-800">
            {isPhone ? 'الدخول برقم الهاتف' : isRegister ? 'إنشاء حساب جديد' : 'تسجيل الدخول'}
          </h1>
          <p className="text-stone-500 text-sm">
            {isPhone ? 'سجل دخولك بسهولة عبر كود التحقق SMS' : isRegister ? 'انضم إلينا اليوم لتجربة سفر أفضل' : 'مرحباً بك مجدداً في العوجان للسياحة'}
          </p>
        </div>

        {/* Recaptcha Container for Web */}
        <div id="recaptcha-container"></div>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-xl text-xs text-center border border-red-100">
            {error}
          </div>
        )}

        {message && (
          <div className="bg-emerald-50 text-emerald-600 p-3 rounded-xl text-xs text-center border border-emerald-100">
            {message}
          </div>
        )}

        {isPhone ? (
          <form onSubmit={handlePhoneSubmit} className="space-y-4">
            {!showOtpInput ? (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Phone className="absolute left-3 top-3 text-stone-400" size={18} />
                    <input
                      type="tel"
                      placeholder="5xxxxxxxxx"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                      dir="ltr"
                      className="w-full bg-stone-100 p-3 pl-10 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500 text-left"
                    />
                  </div>
                  <div className="relative w-1/3">
                    <select
                      value={selectedCountry.code}
                      onChange={(e) => {
                        const country = countries.find(c => c.code === e.target.value);
                        if (country) setSelectedCountry(country);
                      }}
                      className="w-full bg-stone-100 p-3 pr-2 rounded-xl text-xs outline-none focus:ring-2 focus:ring-emerald-500 appearance-none text-right font-bold pl-8"
                    >
                      {countries.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.flag} {c.name} {c.code}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute left-2 top-3.5 text-stone-400 pointer-events-none" size={14} />
                  </div>
                </div>
                <p className="text-[10px] text-stone-400 text-center">
                  سيتم إرسال كود التحقق إلى {selectedCountry.name} ({selectedCountry.code})
                </p>
              </div>
            ) : (
              <div className="relative">
                <CheckCircle2 className="absolute left-3 top-3 text-stone-400" size={18} />
                <input
                  type="text"
                  placeholder="كود التحقق (6 أرقام)"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  required
                  maxLength={6}
                  className="w-full bg-stone-100 p-3 pl-10 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500 text-center tracking-widest font-bold"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn size={20} />
                  {showOtpInput ? 'تحقق ودخول' : 'إرسال كود التحقق'}
                </>
              )}
            </button>
            
            {showOtpInput && (
              <button
                type="button"
                onClick={() => setShowOtpInput(false)}
                className="w-full text-xs text-stone-400 hover:text-emerald-600 transition-colors"
              >
                تغيير رقم الهاتف
              </button>
            )}
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
          {isRegister && (
            <div className="relative">
              <User className="absolute left-3 top-3 text-stone-400" size={18} />
              <input
                type="text"
                placeholder="الاسم الكامل"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full bg-stone-100 p-3 pl-10 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          )}

          <div className="relative">
            <Mail className="absolute left-3 top-3 text-stone-400" size={18} />
            <input
              type="email"
              placeholder="البريد الإلكتروني"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-stone-100 p-3 pl-10 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-3 top-3 text-stone-400" size={18} />
            <input
              type="password"
              placeholder="كلمة المرور"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required={!loading}
              className="w-full bg-stone-100 p-3 pl-10 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {!isRegister && (
            <div className="flex justify-start">
              <button
                type="button"
                onClick={handleForgotPassword}
                className="text-xs text-stone-500 hover:text-emerald-600 transition-colors"
                disabled={loading}
              >
                نسيت كلمة السر؟
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full py-3 flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                {isRegister ? <UserPlus size={20} /> : <LogIn size={20} />}
                {isRegister ? 'إنشاء الحساب' : 'دخول'}
              </>
            )}
          </button>
        </form>
        )}

        <div className="relative py-2">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-stone-200"></div>
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-2 text-stone-400">أو</span>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <button
            onClick={handleGoogleLogin}
            className="w-full border-2 border-stone-100 p-3 rounded-xl flex items-center justify-center gap-2 hover:bg-stone-50 transition-colors text-sm font-bold"
          >
            <Chrome size={20} className="text-emerald-600" />
            الدخول بواسطة جوجل
          </button>

          {!isPhone ? (
            <button
              onClick={() => setAuthMode('phone')}
              className="w-full border-2 border-stone-100 p-3 rounded-xl flex items-center justify-center gap-2 hover:bg-stone-50 transition-colors text-sm font-bold text-stone-600"
            >
              <Phone size={20} className="text-emerald-600" />
              الدخول بواسطة رقم الهاتف
            </button>
          ) : (
            <button
              onClick={() => setAuthMode('email-login')}
              className="w-full border-2 border-stone-100 p-3 rounded-xl flex items-center justify-center gap-2 hover:bg-stone-50 transition-colors text-sm font-bold text-stone-600"
            >
              <Mail size={20} className="text-emerald-600" />
              الدخول بواسطة البريد الإلكتروني
            </button>
          )}
        </div>

        <div className="text-center">
          <button
            onClick={() => setAuthMode(isRegister ? 'email-login' : 'email-register')}
            className={`text-sm text-emerald-600 hover:underline ${isPhone ? 'hidden' : ''}`}
          >
            {isRegister ? 'لديك حساب بالفعل؟ سجل دخولك' : 'ليس لديك حساب؟ أنشئ حساباً جديداً'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
