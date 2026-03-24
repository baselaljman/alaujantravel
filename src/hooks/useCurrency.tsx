import { useState, useEffect } from 'react';

export type Currency = 'SAR' | 'SYP';

const SAR_TO_SYP = 3500; // 1 SAR = 3500 SYP (approximate market rate)

export function useCurrency() {
  const [currency, setCurrency] = useState<Currency>('SAR');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const detectCountry = async () => {
      try {
        // Try primary API
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const response = await fetch('https://ipapi.co/json/', { signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const data = await response.json();
          if (data.country_code === 'SY') {
            setCurrency('SYP');
            return;
          }
        }
        
        // Try fallback API if primary fails
        const fallbackController = new AbortController();
        const fallbackTimeoutId = setTimeout(() => fallbackController.abort(), 3000);
        const fallbackResponse = await fetch('https://ip-api.com/json/', { signal: fallbackController.signal });
        clearTimeout(fallbackTimeoutId);
        
        if (fallbackResponse.ok) {
          const data = await fallbackResponse.json();
          if (data.country === 'Syria' || data.countryCode === 'SY') {
            setCurrency('SYP');
            return;
          }
        }
      } catch (error) {
        // Silent fail - default to SAR
      } finally {
        setLoading(false);
      }
    };

    detectCountry();
  }, []);

  const formatPrice = (priceInSAR: number) => {
    if (currency === 'SYP') {
      const priceInSYP = priceInSAR * SAR_TO_SYP;
      return `${priceInSYP.toLocaleString('ar-EG')} ل.س`;
    }
    return `${priceInSAR.toLocaleString('ar-EG')} ريال`;
  };

  const convertPrice = (priceInSAR: number) => {
    if (currency === 'SYP') {
      return priceInSAR * SAR_TO_SYP;
    }
    return priceInSAR;
  };

  const toBaseCurrency = (priceInLocal: number) => {
    if (currency === 'SYP') {
      return priceInLocal / SAR_TO_SYP;
    }
    return priceInLocal;
  };

  return { currency, formatPrice, convertPrice, toBaseCurrency, loading };
}
