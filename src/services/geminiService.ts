import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export async function getAiResponse(userMessage: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash-latest",
      contents: userMessage,
      config: {
        systemInstruction: "أنت مساعد ذكي لشركة 'العوجان للسياحة والسفر'. الشركة تقدم رحلات دولية بين الرياض ودمشق وعمان. ساعد العملاء في الاستفسار عن المواعيد، تتبع الطرود، وطريقة الحجز. كن مهذباً وودوداً وباللغة العربية.",
      },
    });
    return response.text;
  } catch (error) {
    console.error("Gemini Error:", error);
    return "عذراً، واجهت مشكلة في معالجة طلبك. يرجى المحاولة لاحقاً.";
  }
}
