import React, { useState } from 'react';
import { db } from '../firebase';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { Trash2, AlertTriangle, CheckCircle2, Shield, ArrowRight, Mail, Phone, User } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function DeleteAccount() {
  const [formData, setFormData] = useState({
    name: '',
    emailOrPhone: '',
    reason: '',
    confirmCheck: false
  });
  
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!formData.name.trim() || !formData.emailOrPhone.trim()) {
      setError('يرجى ملء جميع الحقول الإلزامية.');
      return;
    }

    if (!formData.confirmCheck) {
      setError('يرجى تأكيد رغبتكم في حذف الحساب والبيانات.');
      return;
    }

    try {
      setLoading(true);
      
      // Save the deletion request securely to Firestore
      await addDoc(collection(db, 'delete_requests'), {
        name: formData.name.trim(),
        emailOrPhone: formData.emailOrPhone.trim(),
        reason: formData.reason.trim(),
        status: 'pending',
        requestedAt: Timestamp.now()
      });

      setSuccess(true);
    } catch (err: any) {
      console.error('Error submitting deletion request:', err);
      setError('حدث خطأ أثناء إرسال الطلب، يرجى المحاولة مرة أخرى أو اتصل بالدعم.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8 font-sans" dir="rtl">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        
        {/* Banner */}
        <div className="bg-gradient-to-r from-red-600 to-rose-700 px-6 py-10 sm:px-12 text-white text-center sm:text-right">
          <Trash2 className="h-12 w-12 mx-auto sm:mx-0 mb-4 opacity-90" />
          <h1 className="text-3xl font-extrabold tracking-tight">طلب حذف الحساب والبيانات</h1>
          <p className="mt-2 text-rose-100 text-sm sm:text-base">
            تطبيق العوجان لسفر الحافلات (Al-Aujan Travel) - أمان وتحكم كامل في بياناتك
          </p>
        </div>

        <div className="px-6 py-8 sm:px-12 sm:py-10 text-slate-700 leading-relaxed space-y-8">
          
          {/* Policy Information (Google Play Requirements) */}
          <div className="bg-amber-50 rounded-xl p-5 border border-amber-200">
            <h2 className="text-lg font-bold text-amber-950 pb-2 mb-3 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
              تنبيه هام حول الآثار المترتبة على الحذف:
            </h2>
            <p className="text-sm text-amber-900 mb-3 leading-relaxed">
              عند تقديم طلب حذف الحساب، سيقوم فريق الدعم الفني لمؤسسة العوجان للسياحة والسفر بمراجعة الطلب وتنفيذه بالكامل خلال <strong>7 أيام عمل</strong>. يرجى قراءة ما سيتم حذفه وما سيتم الاحتفاظ به:
            </p>
            <ul className="list-disc list-inside space-y-2 text-xs text-amber-900 mr-4">
              <li>
                <strong>البيانات التي سيتم حذفها نهائياً وفوراً:</strong> الاسم، البريد الإلكتروني، رقم الهاتف، الموقع الجغرافي، سجل البحث عن الرحلات وفئات السفر.
              </li>
              <li>
                <strong>البيانات التي سيتم إلغاء تنشيطها والتخلص من هويتها الشخصية:</strong> سجل حجز التذاكر يتم إلغاء هويته وتحويله إلى بيانات مجهولة لأغراض إحصائية ومالية (بدون ربطه بأي اسم أو هاتف).
              </li>
              <li>
                <strong>فترة الاحتفاظ بالبيانات الاحتياطية:</strong> يتم تطهير كافة النسخ الاحتياطية (Backups) تلقائياً بالكامل في غضون 30 يوماً من إتمام عملية حذف الحساب لتأكيد خروج البيانات كلياً من خوادمنا.
              </li>
            </ul>
          </div>

          {!success ? (
            <>
              {/* Submission Form */}
              <div>
                <h2 className="text-xl font-bold text-slate-900 border-b border-slate-100 pb-2 mb-6 flex items-center gap-2">
                  <Shield className="h-5 w-5 text-red-600" />
                  نموذج تقديم طلب الحذف المباشر
                </h2>
                
                <p className="text-sm text-slate-600 mb-6">
                  يرجى ملء النموذج أدناه لإرسال طلب فوري للمشرفين من أجل حذف حسابكم وجميع البيانات المرتبطة به.
                </p>

                <form onSubmit={handleSubmit} className="space-y-6">
                  {error && (
                    <div className="p-4 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm">
                      {error}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label htmlFor="name" className="block text-sm font-semibold text-slate-700 mb-2">
                        الاسم الكامل المسجل في التطبيق <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
                          <User className="h-5 w-5" />
                        </div>
                        <input
                          type="text"
                          id="name"
                          className="block w-full pr-10 pl-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none text-sm transition-all text-slate-800"
                          placeholder="مثال: محمد أحمد العبدالله"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="emailOrPhone" className="block text-sm font-semibold text-slate-700 mb-2">
                        البريد الإلكتروني أو رقم الهاتف <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
                          <Mail className="h-5 w-5" />
                        </div>
                        <input
                          type="text"
                          id="emailOrPhone"
                          className="block w-full pr-10 pl-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none text-sm transition-all text-slate-800"
                          placeholder="البريد الإلكتروني أو الرقم الهاتفي"
                          value={formData.emailOrPhone}
                          onChange={(e) => setFormData({ ...formData, emailOrPhone: e.target.value })}
                          required
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="reason" className="block text-sm font-semibold text-slate-700 mb-2">
                      سبب طلب حذف الحساب (اختياري)
                    </label>
                    <textarea
                      id="reason"
                      rows={3}
                      className="block w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none text-sm transition-all text-slate-800"
                      placeholder="يسعدنا معرفة السبب لتطوير خدماتنا مستقبلاً..."
                      value={formData.reason}
                      onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                    />
                  </div>

                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <div className="flex items-start">
                      <div className="flex items-center h-5">
                        <input
                          id="confirmCheck"
                          type="checkbox"
                          className="h-4 w-4 text-red-600 border-slate-300 rounded focus:ring-red-500"
                          checked={formData.confirmCheck}
                          onChange={(e) => setFormData({ ...formData, confirmCheck: e.target.checked })}
                        />
                      </div>
                      <label htmlFor="confirmCheck" className="mr-3 text-xs text-slate-600 select-none leading-relaxed">
                        أؤكد رغبتي الكاملة في حذف حسابي وكل البيانات الخاصة بي بشكل نهائي، وأتفهم أنه لا يمكن استرجاع هذه البيانات بعد إتمام الحذف.
                      </label>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full sm:w-auto px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-sm transition-all shadow-sm focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50"
                    >
                      {loading ? 'جاري إرسال الطلب...' : 'إرسال طلب الحذف'}
                    </button>
                  </div>
                </form>
              </div>
            </>
          ) : (
            <div className="text-center py-12 px-4">
              <CheckCircle2 className="h-16 w-16 text-emerald-600 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-slate-950 mb-3">تم إرسال طلب حذف الحساب بنجاح</h2>
              <p className="text-slate-600 text-sm max-w-md mx-auto leading-relaxed mb-6">
                نعلمكم بأنه قد تم تسجيل طلب حذف الحساب وبياناتكم بنجاح في نظامنا. سيقوم فريق الإدارة بمراجعته وإتمام تصفير وحذف كافة السجلات المرتبطة بكم نهائياً في غضون <strong>7 أيام عمل</strong>.
              </p>
              <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
                <Link
                  to="/"
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-sm transition-colors"
                >
                  <ArrowRight className="h-4 w-4" />
                  الرجوع للرئيسية
                </Link>
                <a
                  href="mailto:support@alaujantravel.com"
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-sm transition-colors"
                >
                  التواصل مع الدعم الفني
                </a>
              </div>
            </div>
          )}

          {/* Alternate In-App Way */}
          <div className="pt-6 border-t border-slate-100 text-sm">
            <h3 className="font-bold text-slate-900 mb-2">طريقة بديلة للحذف الفوري من داخل التطبيق:</h3>
            <p className="text-xs text-slate-500 leading-relaxed mb-1">
              إذا كان لا يزال بإمكانكم الدخول إلى التطبيق، يمكنكم تسريع هذه العملية:
            </p>
            <ol className="list-decimal list-inside text-xs text-slate-500 space-y-1 pr-2">
              <li>سجل دخولك إلى تطبيق <strong>العوجان Al-Aujan Travel</strong>.</li>
              <li>انقر على قائمة <strong>الملف الشخصي (Profile)</strong> في شريط التنقل.</li>
              <li>اختر <strong>حذف الحساب والبيانات</strong> لتنفيذ العملية ذاتياً فوراً دون انتظار الموافقة اليدوية.</li>
            </ol>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-100 px-6 py-4 text-center text-xs text-slate-500 border-t border-slate-200">
          مؤسسة العوجان للسياحة والسفر © جميع الحقوق محفوظة {new Date().getFullYear()}
        </div>
      </div>
    </div>
  );
}
