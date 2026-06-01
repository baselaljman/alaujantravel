import React from 'react';
import { Shield, Eye, Lock, MapPin, UserCheck, Smartphone } from 'lucide-react';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8 font-sans" dir="rtl">
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 px-6 py-10 sm:px-12 text-white text-center sm:text-right">
          <Shield className="h-12 w-12 mx-auto sm:mx-0 mb-4 opacity-90" />
          <h1 className="text-3xl font-extrabold tracking-tight">سياسة الخصوصية - تطبيق العوجان</h1>
          <p className="mt-2 text-emerald-100 text-sm sm:text-base">
            تاريخ التحديث: {new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        <div className="px-6 py-8 sm:px-12 sm:py-10 text-slate-700 leading-relaxed space-y-8">
          {/* Objective */}
          <div>
            <h2 className="text-xl font-bold text-slate-900 border-b border-slate-100 pb-2 mb-3 flex items-center gap-2">
              <Eye className="h-5 w-5 text-emerald-600" />
              تمهيد وتلتزم بالخصوصية
            </h2>
            <p className="text-slate-600">
              نهتم في <strong>مؤسسة العوجان للسياحة والسفر</strong> بخصوصية بياناتكم وسرية معلوماتكم بشكل بالغ. توضح هذه السياسة كيفية جمع البيانات، واستخدامها، وحمايتها عند استخدام تطبيق الهاتف المحمول وموقعنا الإلكتروني المخصص لإدارة حجز الرحلات وتتبع الحافلات.
            </p>
          </div>

          {/* Location Permission - Critical for Play Store */}
          <div className="bg-emerald-50/50 rounded-xl p-5 border border-emerald-100">
            <h2 className="text-xl font-bold text-slate-900 pb-2 mb-3 flex items-center gap-2">
              <MapPin className="h-5 w-5 text-emerald-600" />
              أذونات الموقع الجغرافي (Location Permissions)
            </h2>
            <p className="text-slate-600 mb-3">
              يتطلب تطبيق العوجان الوصول إلى بيانات الموقع الجغرافي الخاصة بكم <strong>فقط أثناء استخدام التطبيق (Foreground Location)</strong> لتقديم الخدمات الأساسية التالية:
            </p>
            <ul className="list-disc list-inside space-y-2 text-slate-600 mr-4">
              <li>
                <strong>تحديد مكان الركوب:</strong> لمساعدة الركاب في معرفة أقرب نقطة تجمع أو حافلة، وإرشاد السائق إلى مكان تواجد الراكب بدقة عند فتح التطبيق واستخدامه والمطالبة بالخدمة.
              </li>
              <li>
                <strong>تتبع الحافلة (للسائقين):</strong> يحتاج التطبيق إلى الوصول لموقع السائق لتحديث موقع الحافلة ومشاركته مع الركاب لتمكينهم من تتبع مسار الرحلة طوال فترة عمل السائق أثناء فتح شاشة القيادة.
              </li>
            </ul>
            <p className="text-xs text-slate-500 mt-4 leading-relaxed">
              * تنبيه: التطبيق لا يطلب ولا يستخدم <strong>صلاحية الوصول للموقع في الخلفية (ACCESS_BACKGROUND_LOCATION)</strong>، ويقتصر جمع واستخدام بيانات الموقع فقط عندما يكون التطبيق نشطاً ومفتوحاً على الشاشة من قِبل المستخدم لضمان أعلى مستويات الخصوصية وحماية استهلاك طاقة البطارية.
            </p>
          </div>

          {/* Types of Data Collected */}
          <div>
            <h2 className="text-xl font-bold text-slate-900 border-b border-slate-100 pb-2 mb-3 flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-emerald-600" />
              البيانات التي نقوم بجمعها
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div className="p-4 bg-slate-50 rounded-lg">
                <h3 className="font-semibold text-slate-900 mb-1 text-sm">بيانات الحساب الشخصي</h3>
                <p className="text-xs text-slate-500">الاسم الكامل، رقم الهاتف، والبريد الإلكتروني للتحقق وتأكيد حجز التذاكر في الرحلات.</p>
              </div>
              <div className="p-4 bg-slate-50 rounded-lg">
                <h3 className="font-semibold text-slate-900 mb-1 text-sm">بيانات الرحلات والحجز</h3>
                <p className="text-xs text-slate-500">تفاصيل المحطات، كرت الحجز، أرقام المقاعد المختارة، وسجل الرحلات السابقة والنشطة الخاصة بك.</p>
              </div>
              <div className="p-4 bg-slate-50 rounded-lg">
                <h3 className="font-semibold text-slate-900 mb-1 text-sm">بيانات الأجهزة والوصول</h3>
                <p className="text-xs text-slate-500">نوع الجهاز، نظام التشغيل، ومعرف الجهاز الفريد لإرسال إشعارات فورية حول الرحلات.</p>
              </div>
              <div className="p-4 bg-slate-50 rounded-lg">
                <h3 className="font-semibold text-slate-900 mb-1 text-sm">بيانات السائقين والشركاء</h3>
                <p className="text-xs text-slate-500">رقم رخصة القيادة، معلومات الحافلة الحالية، وسجل التتبع الجغرافي لتوفير رحلة آمنة ومنظّمة.</p>
              </div>
            </div>
          </div>

          {/* How We protect data */}
          <div>
            <h2 className="text-xl font-bold text-slate-900 border-b border-slate-100 pb-2 mb-3 flex items-center gap-2">
              <Lock className="h-5 w-5 text-emerald-600" />
              أمن وحماية البيانات
            </h2>
            <p className="text-slate-600">
              تُحفظ جميع بياناتكم داخل قواعد بيانات مشفرة مستضافة عبر خواديم سحابية آمنة (تحت إدارة Firebase & Google Cloud). كما نقوم بتمرير كافة البيانات عبر بروتوكولات اتصال آمنة ومشفرة (HTTPS/SSL). لن يتم بيع معلوماتكم الشخصية أو تأجيرها أو تسريبها لأية جهة خارجية نهائياً.
            </p>
          </div>

          {/* Children and data deleting rights */}
          <div>
            <h2 className="text-xl font-bold text-slate-900 border-b border-slate-100 pb-2 mb-3 flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-emerald-600" />
              التحكم في بياناتك وحذف الحساب
            </h2>
            <p className="text-slate-600">
              يحق لكل مستخدم في أي وقت طلب تعديل أو حذف بياناته الشخصية نهائياً من أنظمتنا. يمكنكم التوجه لقسم الملف الشخصي في التطبيق لطلب إزالة الحساب نهائياً، أو التواصل معنا مباشرة لحذف جميع السجلات المرتبطة بهاتفك من قاعدة البيانات فوراً.
            </p>
          </div>

          {/* Contact info */}
          <div className="text-center bg-slate-50 rounded-xl p-6 border border-slate-100">
            <h3 className="font-bold text-slate-900 mb-2">للاستفسارات والدعم الفني</h3>
            <p className="text-slate-600 text-sm">
              إذا كان لديكم أي استفسار حول سياسة الخصوصية الخاصة بنا، يمكنكم التواصل مع الإدارة عبر:
            </p>
            <div className="mt-3 text-emerald-700 font-semibold text-sm">
              البريد الإلكتروني: support@alaujantravel.com
            </div>
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
