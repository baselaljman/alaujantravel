import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { City, Country } from '../types';
import { MapPin, Plus, Edit2, Trash2, X, Check, Globe } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function AdminCities() {
  const [cities, setCities] = useState<City[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [activeTab, setActiveTab] = useState<'cities' | 'countries'>('cities');
  
  // City states
  const [isAddingCity, setIsAddingCity] = useState(false);
  const [editingCity, setEditingCity] = useState<City | null>(null);
  const [newCity, setNewCity] = useState({ name: '', country: '' });

  // Country states
  const [isAddingCountry, setIsAddingCountry] = useState(false);
  const [editingCountry, setEditingCountry] = useState<Country | null>(null);
  const [newCountry, setNewCountry] = useState({ name: '' });

  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string, type: 'city' | 'country', label: string } | null>(null);

  useEffect(() => {
    const unsubCities = onSnapshot(collection(db, 'cities'), (snapshot) => {
      setCities(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as City)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'cities');
    });

    const unsubCountries = onSnapshot(collection(db, 'countries'), (snapshot) => {
      const fetchedCountries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Country));
      setCountries(fetchedCountries);
      // Set default country for new city if none selected
      if (fetchedCountries.length > 0 && !newCity.country) {
        setNewCity(prev => ({ ...prev, country: fetchedCountries[0].name }));
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'countries');
    });

    return () => {
      unsubCities();
      unsubCountries();
    };
  }, []);

  const handleAddCity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCity.name || !newCity.country) return;
    try {
      await addDoc(collection(db, 'cities'), newCity);
      setNewCity({ name: '', country: countries[0]?.name || '' });
      setIsAddingCity(false);
    } catch (error) {
      console.error('Error adding city:', error);
    }
  };

  const handleUpdateCity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCity || !editingCity.name || !editingCity.country) return;
    try {
      const { id, ...data } = editingCity;
      await updateDoc(doc(db, 'cities', id), data);
      setEditingCity(null);
    } catch (error) {
      console.error('Error updating city:', error);
    }
  };

  const handleAddCountry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCountry.name) return;
    try {
      await addDoc(collection(db, 'countries'), newCountry);
      setNewCountry({ name: '' });
      setIsAddingCountry(false);
    } catch (error) {
      console.error('Error adding country:', error);
    }
  };

  const handleUpdateCountry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCountry || !editingCountry.name) return;
    try {
      const { id, ...data } = editingCountry;
      await updateDoc(doc(db, 'countries', id), data);
      setEditingCountry(null);
    } catch (error) {
      console.error('Error updating country:', error);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      const collectionName = deleteConfirm.type === 'city' ? 'cities' : 'countries';
      await deleteDoc(doc(db, collectionName, deleteConfirm.id));
      setDeleteConfirm(null);
    } catch (error) {
      console.error(`Error deleting ${deleteConfirm.type}:`, error);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <MapPin className="text-emerald-600" />
          إدارة المدن والدول
        </h1>
        <div className="flex gap-2 bg-stone-100 p-1 rounded-xl">
          <button 
            onClick={() => setActiveTab('cities')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'cities' ? 'bg-white shadow-sm text-emerald-600' : 'text-stone-500 hover:text-stone-700'}`}
          >
            المدن
          </button>
          <button 
            onClick={() => setActiveTab('countries')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'countries' ? 'bg-white shadow-sm text-emerald-600' : 'text-stone-500 hover:text-stone-700'}`}
          >
            الدول
          </button>
        </div>
      </div>

      <div className="flex justify-end">
        {activeTab === 'cities' ? (
          <button 
            onClick={() => setIsAddingCity(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus size={20} />
            إضافة مدينة
          </button>
        ) : (
          <button 
            onClick={() => setIsAddingCountry(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus size={20} />
            إضافة دولة
          </button>
        )}
      </div>

      {activeTab === 'cities' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {countries.length === 0 ? (
            <div className="col-span-full card text-center py-12 text-stone-400">
              يرجى إضافة دول أولاً لتتمكن من إضافة مدن.
            </div>
          ) : (
            countries.map(country => (
              <div key={country.id} className="space-y-4">
                <h2 className="text-xl font-bold border-b pb-2 text-emerald-700 flex items-center gap-2">
                  <Globe size={18} />
                  {country.name}
                </h2>
                <div className="space-y-2">
                  {cities.filter(c => c.country === country.name).map(city => (
                    <ItemCard 
                      key={city.id} 
                      name={city.name} 
                      onEdit={() => setEditingCity(city)} 
                      onDelete={() => setDeleteConfirm({ id: city.id, type: 'city', label: city.name })} 
                    />
                  ))}
                  {cities.filter(c => c.country === country.name).length === 0 && (
                    <p className="text-xs text-stone-400 italic py-2">لا توجد مدن مضافة لهذه الدولة.</p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {countries.map(country => (
            <ItemCard 
              key={country.id} 
              name={country.name} 
              onEdit={() => setEditingCountry(country)} 
              onDelete={() => setDeleteConfirm({ id: country.id, type: 'country', label: country.name })} 
            />
          ))}
          {countries.length === 0 && (
            <div className="col-span-full card text-center py-12 text-stone-400">
              لا توجد دول مضافة حالياً.
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <AnimatePresence>
        {/* Delete Confirmation */}
        {deleteConfirm && (
          <motion.div 
            key="delete-confirm-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl text-center space-y-6"
            >
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
                <Trash2 size={32} />
              </div>
              <div>
                <h3 className="text-xl font-bold mb-2">تأكيد الحذف</h3>
                <p className="text-stone-500 text-sm">
                  هل أنت متأكد من حذف {deleteConfirm.type === 'city' ? 'المدينة' : 'الدولة'} "{deleteConfirm.label}"؟ 
                  {deleteConfirm.type === 'country' && ' سيؤدي هذا إلى جعل المدن التابعة لها بدون دولة محددة.'}
                </p>
              </div>
              <div className="flex gap-3">
                <button onClick={handleDelete} className="flex-1 bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 transition-colors">
                  حذف
                </button>
                <button onClick={() => setDeleteConfirm(null)} className="flex-1 bg-stone-100 text-stone-600 py-3 rounded-xl font-bold hover:bg-stone-200 transition-colors">
                  إلغاء
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* City Modal */}
        {(isAddingCity || editingCity) && (
          <motion.div 
            key="city-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold">
                  {isAddingCity ? 'إضافة مدينة جديدة' : 'تعديل مدينة'}
                </h3>
                <button onClick={() => { setIsAddingCity(false); setEditingCity(null); }} className="text-stone-400 hover:text-stone-600">
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={isAddingCity ? handleAddCity : handleUpdateCity} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-stone-600">اسم المدينة</label>
                  <input 
                    type="text" 
                    value={isAddingCity ? newCity.name : editingCity?.name}
                    onChange={(e) => isAddingCity ? setNewCity({...newCity, name: e.target.value}) : setEditingCity({...editingCity!, name: e.target.value})}
                    className="w-full bg-stone-50 border-stone-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder="مثلاً: الرياض، دمشق..."
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-stone-600">الدولة</label>
                  <select 
                    value={isAddingCity ? newCity.country : editingCity?.country}
                    onChange={(e) => isAddingCity ? setNewCity({...newCity, country: e.target.value}) : setEditingCity({...editingCity!, country: e.target.value})}
                    className="w-full bg-stone-50 border-stone-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none"
                    required
                  >
                    <option value="">اختر الدولة</option>
                    {countries.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </div>

                <button type="submit" className="btn-primary w-full py-4 mt-4 flex items-center justify-center gap-2">
                  <Check size={20} />
                  {isAddingCity ? 'إضافة' : 'حفظ التغييرات'}
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}

        {/* Country Modal */}
        {(isAddingCountry || editingCountry) && (
          <motion.div 
            key="country-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold">
                  {isAddingCountry ? 'إضافة دولة جديدة' : 'تعديل دولة'}
                </h3>
                <button onClick={() => { setIsAddingCountry(false); setEditingCountry(null); }} className="text-stone-400 hover:text-stone-600">
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={isAddingCountry ? handleAddCountry : handleUpdateCountry} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-stone-600">اسم الدولة</label>
                  <input 
                    type="text" 
                    value={isAddingCountry ? newCountry.name : editingCountry?.name}
                    onChange={(e) => isAddingCountry ? setNewCountry({...newCountry, name: e.target.value}) : setEditingCountry({...editingCountry!, name: e.target.value})}
                    className="w-full bg-stone-50 border-stone-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder="مثلاً: السعودية، سوريا..."
                    required
                  />
                </div>

                <button type="submit" className="btn-primary w-full py-4 mt-4 flex items-center justify-center gap-2">
                  <Check size={20} />
                  {isAddingCountry ? 'إضافة' : 'حفظ التغييرات'}
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface ItemCardProps {
  name: string;
  onEdit: () => void;
  onDelete: () => void;
}

const ItemCard: React.FC<ItemCardProps> = ({ name, onEdit, onDelete }) => {
  return (
    <div className="bg-white p-4 rounded-2xl border border-stone-100 flex justify-between items-center group hover:shadow-md transition-all">
      <span className="font-bold">{name}</span>
      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button 
          onClick={onEdit}
          className="p-2 text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
        >
          <Edit2 size={16} />
        </button>
        <button 
          onClick={onDelete}
          className="p-2 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}
