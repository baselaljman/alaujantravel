import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { motion } from 'framer-motion';
import { Mail, Lock, User, LogIn, UserPlus, Chrome } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const { login, loginWithEmail, registerWithEmail, resetPassword, user } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

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
            {isRegister ? 'إنشاء حساب جديد' : 'تسجيل الدخول'}
          </h1>
          <p className="text-stone-500 text-sm">
            {isRegister ? 'انضم إلينا اليوم لتجربة سفر أفضل' : 'مرحباً بك مجدداً في العوجان للسياحة'}
          </p>
        </div>

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

        <div className="relative py-2">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-stone-200"></div>
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-2 text-stone-400">أو</span>
          </div>
        </div>

        <button
          onClick={handleGoogleLogin}
          className="w-full border-2 border-stone-100 p-3 rounded-xl flex items-center justify-center gap-2 hover:bg-stone-50 transition-colors text-sm font-bold"
        >
          <Chrome size={20} className="text-emerald-600" />
          الدخول بواسطة جوجل
        </button>

        <div className="text-center">
          <button
            onClick={() => setIsRegister(!isRegister)}
            className="text-sm text-emerald-600 hover:underline"
          >
            {isRegister ? 'لديك حساب بالفعل؟ سجل دخولك' : 'ليس لديك حساب؟ أنشئ حساباً جديداً'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
