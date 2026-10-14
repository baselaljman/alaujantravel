import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { motion } from 'framer-motion';
import { Mail, Lock, User, LogIn, UserPlus, Chrome, Phone, CheckCircle2, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';

export default function Login() {
  const { login, loginWithEmail, registerWithEmail, resetPassword, signInWithPhone, sendSmsOtp, verifySmsOtp, verifyOtp, user } = useAuth();
  const [authMode, setAuthMode] = useState<'email-login' | 'email-register' | 'phone'>('email-login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [selectedCountry, setSelectedCountry] = useState({ code: '+966', flag: '🇸🇦', name: 'السعودية' });
  const [syriaSubMode, setSyriaSubMode] = useState<'login' | 'register'>('register');
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    let timer: any;
    if (resendCooldown > 0) {
      timer = setInterval(() => {
        setResendCooldown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [resendCooldown]);

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
      if (isRegister || (isPhone && selectedCountry.code === '+963' && syriaSubMode === 'register')) {
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
      // Common phone processing
      let cleanPhone = phone.trim();
      if (cleanPhone.startsWith('0')) {
        cleanPhone = cleanPhone.substring(1);
      }
      cleanPhone = cleanPhone.replace(/\D/g, '');
      const formattedPhone = `${selectedCountry.code}${cleanPhone}`;

      if (!showOtpInput) {
        setMessage('جاري إرسال كود التحقق عبر SMS...');
        await sendSmsOtp(formattedPhone);
        
        setShowOtpInput(true);
        setResendCooldown(60);
        setMessage(`تم إرسال كود التحقق إلى رقم هاتفك بنجاح ✅`);
      } else {
        await verifySmsOtp(formattedPhone, otp);
        navigate('/');
      }
    } catch (err: any) {
      console.error('Phone Auth Error:', err);
      if (err?.code === 'auth/too-many-requests' || err?.message?.includes('too-many-requests')) {
        setError('تم تجاوز عدد المحاولات المسموح بها مؤقتاً بواسطة Firebase (auth/too-many-requests). يرجى الانتظار 10 إلى 15 دقيقة، أو استخدام خيار الدخول بـ "جوجل" أو "البريد الإلكتروني".');
      } else if (err?.code === 'auth/captcha-check-failed' || err?.message?.includes('-39') || err?.message?.includes('error-code:-39')) {
        setError('فشل التحقق من أمان reCAPTCHA (خطأ -39). يرجى إعادة المحاولة أو إدخال كود التحقق إذا وصلك، أو استخدام الدخول بجوجل/البريد.');
      } else {
        setError(err.message || 'فشل التحقق من رقم الهاتف. تأكد من صحة الرقم ومن صيغته الصحيحة.');
      }
      setMessage('');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0 || loading) return;
    setError('');
    setMessage('');
    setLoading(true);
    try {
      let cleanPhone = phone.trim();
      if (cleanPhone.startsWith('0')) {
        cleanPhone = cleanPhone.substring(1);
      }
      cleanPhone = cleanPhone.replace(/\D/g, '');
      const formattedPhone = `${selectedCountry.code}${cleanPhone}`;

      setMessage('جاري إرسال كود جديد...');
      await sendSmsOtp(formattedPhone);
      setResendCooldown(60);
      setMessage('تم إرسال كود تحقق جديد بنجاح ✅');
    } catch (err: any) {
      console.error('Resend SMS Error:', err);
      if (err?.code === 'auth/too-many-requests' || err?.message?.includes('too-many-requests')) {
        setError('تم حظر إرسال الرسائل مؤقتاً لكثرة الطلبات. يرجى الانتظار بضع دقائق.');
      } else {
        setError(err.message || 'فشل إعادة إرسال الرمز.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const success = await login();
      if (success) {
        navigate('/');
      }
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

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-xl text-xs text-center border border-red-100 space-y-2">
            <div>{error}</div>
            {(error.includes('too-many-requests') || error.includes('SMS') || error.includes('تجاوز')) && authMode === 'phone' && (
              <button
                type="button"
                onClick={() => { setAuthMode('email-login'); setError(''); setMessage(''); }}
                className="inline-block mt-1 px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-800 font-bold rounded-lg text-xs transition-colors"
              >
                👈 الانتقال للدخول بالبريد الإلكتروني / Google فوراً
              </button>
            )}
          </div>
        )}

        {message && (
          <div className="bg-emerald-50 text-emerald-600 p-3 rounded-xl text-xs text-center border border-emerald-100">
            {message}
          </div>
        )}

        {isPhone ? (
          <form onSubmit={selectedCountry.code === '+963' ? handleSubmit : handlePhoneSubmit} className="space-y-4">
            {selectedCountry.code === '+963' ? (
              <div className="space-y-4">
                <div className="bg-amber-50 text-amber-700 p-3 rounded-xl text-[10px] text-center border border-amber-100 mb-2">
                  خدمة الرسائل النصية (SMS) غير متوفرة في سوريا حالياً. 
                  <br />
                  يرجى التسجيل أو الدخول باستخدام البريد الإلكتروني.
                </div>
                
                <div className="relative w-full mb-4">
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

                <div className="flex gap-2 mb-4 bg-stone-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setSyriaSubMode('register')}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${syriaSubMode === 'register' ? 'bg-white shadow-sm text-emerald-600' : 'text-stone-500'}`}
                  >
                    إنشاء حساب
                  </button>
                  <button
                    type="button"
                    onClick={() => setSyriaSubMode('login')}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${syriaSubMode === 'login' ? 'bg-white shadow-sm text-emerald-600' : 'text-stone-500'}`}
                  >
                    تسجيل دخول
                  </button>
                </div>

                {syriaSubMode === 'register' && (
                  <div className="relative">
                    <User className="absolute right-3 top-3 text-stone-400" size={18} />
                    <input
                      type="text"
                      placeholder="الاسم الكامل"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      className="w-full bg-stone-100 p-3 pr-10 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                )}

                <div className="relative">
                  <Mail className="absolute right-3 top-3 text-stone-400" size={18} />
                  <input
                    type="email"
                    placeholder="البريد الإلكتروني"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full bg-stone-100 p-3 pr-10 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="relative">
                  <Lock className="absolute right-3 top-3 text-stone-400" size={18} />
                  <input
                    type="password"
                    placeholder="كلمة المرور"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full bg-stone-100 p-3 pr-10 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
            ) : !showOtpInput ? (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <div className="relative w-1/3">
                    <select
                      value={selectedCountry.code}
                      onChange={(e) => {
                        const country = countries.find(c => c.code === e.target.value);
                        if (country) setSelectedCountry(country);
                      }}
                      className="w-full bg-stone-100 p-3 pr-2 rounded-xl text-[10px] sm:text-xs outline-none focus:ring-2 focus:ring-emerald-500 appearance-none text-right font-bold pl-8 border-l border-stone-200"
                    >
                      {countries.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.flag} {c.name} {c.code}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute left-2 top-3.5 text-stone-400 pointer-events-none" size={14} />
                  </div>
                  <div className="relative flex-1">
                    <Phone className="absolute right-3 top-3 text-stone-400" size={18} />
                    <input
                      type="tel"
                      placeholder="05xxxxxxxx"
                      value={phone}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '');
                        setPhone(val.startsWith('0') ? val.substring(1) : val);
                      }}
                      required
                      dir="ltr"
                      className="w-full bg-stone-100 p-3 pr-10 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500 text-left"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-stone-400 text-center">
                  سيتم إرسال كود التحقق إلى {selectedCountry.name} ({selectedCountry.code})
                </p>
              </div>
            ) : (
              <div className="relative">
                <CheckCircle2 className="absolute right-3 top-3 text-stone-400" size={18} />
                <input
                  type="text"
                  placeholder="كود التحقق (6 أرقام)"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  required
                  maxLength={6}
                  className="w-full bg-stone-100 p-3 pr-10 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500 text-center tracking-widest font-bold"
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
                  {selectedCountry.code === '+963' ? (
                    <>
                      {syriaSubMode === 'register' ? <UserPlus size={20} /> : <LogIn size={20} />}
                      {syriaSubMode === 'register' ? 'إنشاء حساب بالبريد' : 'دخول بالبريد'}
                    </>
                  ) : (
                    <>
                      {showOtpInput ? <CheckCircle2 size={20} /> : <LogIn size={20} />}
                      {showOtpInput ? 'تحقق ودخول' : 'إرسال كود التحقق'}
                    </>
                  )}
                </>
              )}
            </button>
            
            {showOtpInput && (
              <div className="flex flex-col gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleResendCode}
                  disabled={resendCooldown > 0 || loading}
                  className={`w-full py-2 rounded-xl text-xs font-bold transition-all ${
                    resendCooldown > 0 || loading
                      ? 'bg-stone-100 text-stone-400 cursor-not-allowed'
                      : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  }`}
                >
                  {resendCooldown > 0
                    ? `إعادة إرسال الرمز بعد (${resendCooldown} ثانية)`
                    : 'إعادة إرسال كود التحقق SMS'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowOtpInput(false)}
                  className="w-full text-xs text-stone-400 hover:text-emerald-600 transition-colors py-1"
                >
                  تغيير رقم الهاتف
                </button>
              </div>
            )}
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
          {isRegister && (
            <div className="relative">
              <User className="absolute right-3 top-3 text-stone-400" size={18} />
              <input
                type="text"
                placeholder="الاسم الكامل"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full bg-stone-100 p-3 pr-10 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          )}

          <div className="relative">
            <Mail className="absolute right-3 top-3 text-stone-400" size={18} />
            <input
              type="email"
              placeholder="البريد الإلكتروني"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-stone-100 p-3 pr-10 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="relative">
            <Lock className="absolute right-3 top-3 text-stone-400" size={18} />
            <input
              type="password"
              placeholder="كلمة المرور"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required={!loading}
              className="w-full bg-stone-100 p-3 pr-10 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
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
