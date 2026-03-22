import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MapPin, Shield, Clock, Phone, Search, Calendar, Package } from 'lucide-react';
import { motion } from 'framer-motion';
import DatePicker, { registerLocale } from 'react-datepicker';
import { arSA } from 'date-fns/locale/ar-SA';
import "react-datepicker/dist/react-datepicker.css";

registerLocale('ar-SA', arSA);

export default function Home() {
  const navigate = useNavigate();
  const [search, setSearch] = useState({ from: 'الرياض', to: 'دمشق', date: '' });

  const destinations = [
    { name: 'الرياض', image: 'https://picsum.photos/seed/riyadh/800/600' },
    { name: 'دمشق', image: 'https://picsum.photos/seed/damascus/800/600' },
    { name: 'عمان', image: 'https://picsum.photos/seed/amman/800/600' },
  ];

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(`/booking?from=${search.from}&to=${search.to}&date=${search.date}`);
  };

  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <section className="relative min-h-[600px] rounded-3xl overflow-hidden shadow-2xl flex flex-col">
        <img 
          src="https://xn--ogbhrq.vip/wp-content/uploads/2026/03/busbanar.png" 
          alt="Bus Banner" 
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
        
        <div className="relative z-10 flex-1 flex flex-col justify-center items-center p-8 sm:p-12 text-white text-center">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl sm:text-6xl font-black mb-6 leading-tight"
          >
            سافر بأمان وراحة <br /> مع العوجان
          </motion.h1>
          
          {/* Search Form */}
          <motion.form 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            onSubmit={handleSearch}
            className="glass w-full max-w-4xl p-6 rounded-3xl grid grid-cols-1 md:grid-cols-4 gap-4 mt-8 text-stone-900"
          >
            <div className="flex flex-col text-right gap-2">
              <label className="text-xs font-bold text-stone-500 mr-2">من</label>
              <div className="relative">
                <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-600" size={18} />
                <select 
                  value={search.from}
                  onChange={(e) => setSearch({...search, from: e.target.value})}
                  className="w-full bg-stone-50 border-none rounded-xl pr-10 pl-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none appearance-none"
                >
                  <option>الرياض</option>
                  <option>دمشق</option>
                  <option>عمان</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col text-right gap-2">
              <label className="text-xs font-bold text-stone-500 mr-2">إلى</label>
              <div className="relative">
                <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-600" size={18} />
                <select 
                  value={search.to}
                  onChange={(e) => setSearch({...search, to: e.target.value})}
                  className="w-full bg-stone-50 border-none rounded-xl pr-10 pl-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none appearance-none"
                >
                  <option>دمشق</option>
                  <option>الرياض</option>
                  <option>عمان</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col text-right gap-2">
              <label className="text-xs font-bold text-stone-500 mr-2">تاريخ السفر</label>
              <div className="relative">
                <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-600 pointer-events-none z-10" size={18} />
                <DatePicker
                  selected={search.date ? new Date(search.date) : null}
                  onChange={(date: Date | null) => setSearch({...search, date: date ? date.toISOString().split('T')[0] : ''})}
                  locale="ar-SA"
                  dateFormat="yyyy/MM/dd"
                  placeholderText="يوم / شهر / سنة"
                  className="w-full bg-stone-50 border-none rounded-xl pr-10 pl-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-right"
                  wrapperClassName="w-full"
                />
              </div>
            </div>

            <div className="flex items-end">
              <button type="submit" className="btn-primary w-full py-3.5 flex items-center justify-center gap-2">
                <Search size={20} />
                بحث عن رحلات
              </button>
            </div>
          </motion.form>
        </div>
      </section>

      {/* Destinations */}
      <section>
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <MapPin className="text-emerald-600" />
          وجهاتنا الرئيسية
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {destinations.map((dest, idx) => (
            <motion.div 
              key={dest.name}
              whileHover={{ y: -10 }}
              className="card group cursor-pointer overflow-hidden p-0"
            >
              <div className="h-48 overflow-hidden">
                <img src={dest.image} alt={dest.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
              </div>
              <div className="p-4 text-center">
                <h3 className="text-xl font-bold">{dest.name}</h3>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Parcel Services */}
      <section className="bg-emerald-900 rounded-3xl p-8 sm:p-12 text-white overflow-hidden relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-800 rounded-full -translate-y-1/2 translate-x-1/2 opacity-50 blur-3xl" />
        <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 bg-emerald-800/50 px-4 py-2 rounded-full text-sm font-bold">
              <Package size={18} />
              <span>خدمات الشحن الدولي</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-black leading-tight">شحن الطرود بين الرياض وعمان ودمشق</h2>
            <p className="text-emerald-100 text-lg">نقدم خدمات شحن آمنة وسريعة لطرودكم مع إمكانية التتبع اللحظي لمسار الشحنة حتى وصولها.</p>
            <div className="flex flex-wrap gap-4">
              <Link to="/tracking" className="btn-primary bg-white text-emerald-900 hover:bg-emerald-50">تتبع طردك الآن</Link>
              <div className="flex items-center gap-2 text-sm text-emerald-200">
                <Shield size={16} />
                <span>تأمين شامل على الشحنات</span>
              </div>
            </div>
          </div>
          <div className="hidden md:block">
            <motion.img 
              initial={{ x: 50, opacity: 0 }}
              whileInView={{ x: 0, opacity: 1 }}
              src="https://xn--ogbhrq.vip/wp-content/uploads/2026/03/delivery-truck-svgrepo-com.svg" 
              alt="Parcel Delivery" 
              className="w-full max-w-sm mx-auto drop-shadow-2xl"
            />
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="grid grid-cols-1 sm:grid-cols-4 gap-6">
        {[
          { icon: Shield, title: 'أمان تام', desc: 'حافلاتنا مجهزة بأحدث أنظمة الأمان' },
          { icon: Clock, title: 'دقة المواعيد', desc: 'نلتزم بمواعيد الانطلاق والوصول' },
          { icon: Phone, title: 'دعم 24/7', desc: 'فريقنا متاح لخدمتكم على مدار الساعة' },
          { icon: MapPin, title: 'تتبع مباشر', desc: 'يمكنك تتبع موقع الحافلة لحظة بلحظة' },
        ].map((feature, idx) => (
          <div key={idx} className="card text-center flex flex-col items-center gap-3">
            <div className="bg-emerald-100 p-4 rounded-2xl text-emerald-600">
              <feature.icon size={32} />
            </div>
            <h3 className="font-bold">{feature.title}</h3>
            <p className="text-sm text-stone-500">{feature.desc}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
