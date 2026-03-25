import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MapPin, Shield, Clock, Phone, Search, Calendar, Package } from 'lucide-react';
import { motion } from 'framer-motion';
import DatePicker, { registerLocale } from 'react-datepicker';
import { arSA } from 'date-fns/locale/ar-SA';
import "react-datepicker/dist/react-datepicker.css";
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { City, Banner } from '../types';
import { AnimatePresence } from 'framer-motion';

registerLocale('ar-SA', arSA);

export default function Home() {
  const navigate = useNavigate();
  const [cities, setCities] = useState<City[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [currentBanner, setCurrentBanner] = useState(0);
  const [search, setSearch] = useState({ from: '', to: '', date: '' });

  useEffect(() => {
    const bannersQuery = query(
      collection(db, 'banners'),
      where('active', '==', true),
      orderBy('order', 'asc')
    );

    const unsubscribe = onSnapshot(bannersQuery, (snapshot) => {
      const bannersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Banner));
      setBanners(bannersData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'banners');
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (banners.length > 1) {
      const timer = setInterval(() => {
        setCurrentBanner((prev) => (prev + 1) % banners.length);
      }, 5000);
      return () => clearInterval(timer);
    }
  }, [banners.length]);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'cities'), (snapshot) => {
      const citiesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as City));
      setCities(citiesData);
      
      // Set default values if cities exist
      if (citiesData.length > 0) {
        // Find two cities from different countries
        const firstCity = citiesData[0];
        const secondCity = citiesData.find(c => c.country !== firstCity.country);
        
        if (firstCity && secondCity) {
          setSearch(prev => ({
            ...prev,
            from: firstCity.name,
            to: secondCity.name
          }));
        } else if (firstCity) {
          // Fallback if only one country exists
          setSearch(prev => ({ ...prev, from: firstCity.name }));
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'cities');
    });
    return unsubscribe;
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(`/booking?from=${search.from}&to=${search.to}&date=${search.date}`);
  };

  const fromCity = cities.find(c => c.name === search.from);
  const filteredToCities = fromCity 
    ? cities.filter(c => c.country !== fromCity.country)
    : cities;

  return (
    <div className="space-y-8 sm:space-y-12">
      {/* Hero Section */}
      <section className="relative aspect-[16/9] sm:aspect-auto sm:min-h-[600px] rounded-3xl overflow-hidden shadow-2xl flex flex-col">
        <img 
          src="https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0226720471.firebasestorage.app/o/busbanar.png?alt=media" 
          alt="Bus Banner" 
          className="absolute inset-0 w-full h-full object-cover object-center"
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
                  onChange={(e) => {
                    const newFrom = e.target.value;
                    const newFromCity = cities.find(c => c.name === newFrom);
                    const currentToCity = cities.find(c => c.name === search.to);
                    
                    let newTo = search.to;
                    // If the new "From" country is the same as current "To" country, reset "To"
                    if (newFromCity && currentToCity && newFromCity.country === currentToCity.country) {
                      const otherCountryCities = cities.filter(c => c.country !== newFromCity.country);
                      newTo = otherCountryCities.length > 0 ? otherCountryCities[0].name : '';
                    }
                    
                    setSearch({...search, from: newFrom, to: newTo});
                  }}
                  className="w-full bg-stone-50 border-none rounded-xl pr-10 pl-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none appearance-none"
                >
                  {cities.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
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
                  {filteredToCities.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
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

      {/* Dynamic Banners Section */}
      <section className="relative h-[300px] sm:h-[400px] rounded-3xl overflow-hidden shadow-xl group">
        {banners.length > 0 ? (
          <AnimatePresence mode="wait">
            <motion.div
              key={banners[currentBanner].id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.5 }}
              className="absolute inset-0"
            >
              {banners[currentBanner].link ? (
                <Link to={banners[currentBanner].link!}>
                  <img 
                    src={banners[currentBanner].imageUrl} 
                    alt={`Banner ${currentBanner}`}
                    className="w-full h-full object-cover"
                  />
                </Link>
              ) : (
                <img 
                  src={banners[currentBanner].imageUrl} 
                  alt={`Banner ${currentBanner}`}
                  className="w-full h-full object-cover"
                />
              )}
            </motion.div>
          </AnimatePresence>
        ) : (
          <div className="w-full h-full bg-stone-100 flex items-center justify-center text-stone-400">
            <Package size={48} className="opacity-20" />
          </div>
        )}
        
        {/* Banner Indicators */}
        {banners.length > 1 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-10">
            {banners.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentBanner(idx)}
                className={`w-2 h-2 rounded-full transition-all ${
                  idx === currentBanner ? 'bg-white w-6' : 'bg-white/50'
                }`}
              />
            ))}
          </div>
        )}
      </section>

      {/* Parcel Services */}
      <section className="bg-emerald-900 rounded-3xl p-6 sm:p-12 text-white overflow-hidden relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-800 rounded-full -translate-y-1/2 translate-x-1/2 opacity-50 blur-3xl" />
        <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 bg-emerald-800/50 px-4 py-2 rounded-full text-sm font-bold">
              <Package size={18} />
              <span>خدمات الشحن الدولي</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-black leading-tight">شحن الطرود بين جميع دول الخليج وسوريا</h2>
            <p className="text-emerald-100 text-lg">نقدم خدمات شحن آمنة وسريعة لطرودكم مع إمكانية التتبع اللحظي لمسار الشحنة حتى وصولها.</p>
            <div className="flex flex-wrap gap-4">
              <a 
                href="https://wa.me/966500069261" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="btn-primary bg-white text-emerald-900 hover:bg-emerald-50"
              >
                تواصل معنا واتساب
              </a>
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
              src="https://i.postimg.cc/8cGGpC8d/parcel.png" 
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
