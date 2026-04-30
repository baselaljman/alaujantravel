import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import admin from "firebase-admin";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import bodyParser from "body-parser";
import fs from "fs";
import axios from "axios";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load Firebase Config
const configPath = path.join(process.cwd(), "firebase-applet-config.json");
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));

// Initialize Firebase Admin
if (admin.apps.length === 0) {
  console.log("Firebase Admin: Attempting initialization...");
  const serviceAccountPath = path.join(process.cwd(), "service-account.json");
  
  if (fs.existsSync(serviceAccountPath)) {
    try {
      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf-8"));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: `https://${firebaseConfig.projectId}.firebaseio.com`
      });
      console.log("Firebase Admin: Initialized using service-account.json file.");
    } catch (err) {
      console.error("Firebase Admin: Error reading service-account.json:", err);
    }
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      let saRaw = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
      console.log("Firebase Admin: FIREBASE_SERVICE_ACCOUNT found. Length:", saRaw.length);
      
      // Handle surrounding quotes
      if (saRaw.startsWith("'") && saRaw.endsWith("'")) saRaw = saRaw.slice(1, -1);
      if (saRaw.startsWith('"') && saRaw.endsWith('"')) saRaw = saRaw.slice(1, -1);
      
      let serviceAccount;
      try {
        serviceAccount = JSON.parse(saRaw);
      } catch (parseError: any) {
        console.error("Firebase Admin: Initial JSON parse failed. Attempting cleanup...");
        const cleanerRaw = saRaw.replace(/\\"/g, '"').replace(/\\n/g, '\n');
        try {
          serviceAccount = JSON.parse(cleanerRaw);
        } catch (e2: any) {
          console.error("Firebase Admin: RE-PARSE FAILED:", e2.message);
          throw e2;
        }
      }
      
      console.log(`Firebase Admin: Parsed JSON for project: ${serviceAccount.project_id}`);
      
      // DEEP CLEAN PRIVATE KEY
      if (serviceAccount.private_key && typeof serviceAccount.private_key === 'string') {
        let pKey = serviceAccount.private_key.trim();
        
        // Remove surrounding quotes if any
        if (pKey.startsWith('"') && pKey.endsWith('"')) pKey = pKey.slice(1, -1);
        if (pKey.startsWith("'") && pKey.endsWith("'")) pKey = pKey.slice(1, -1);
        
        // Fix double escaping of newlines
        pKey = pKey.replace(/\\n/g, '\n');
        
        // Ensure it uses unix newlines solely
        pKey = pKey.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        
        // Ensure it has the correct headers
        if (!pKey.includes("-----BEGIN PRIVATE KEY-----")) {
          console.error("Firebase Admin: Private key is missing BEGIN header!");
        }
        
        serviceAccount.private_key = pKey;
        console.log(`Firebase Admin: Private key cleaned (length: ${pKey.length}). Lines: ${pKey.split('\n').length}`);
      } else {
        console.error("Firebase Admin: NO PRIVATE KEY FOUND IN JSON!");
      }

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
      });
      console.log("Firebase Admin: app.initializeApp called successfully.");
    } catch (e: any) {
      console.error("Firebase Admin: FATAL INITIALIZATION ERROR:", e.message);
      if (e.message.includes("Unexpected token")) {
        console.error("Diagnostic: The JSON is likely corrupted or has invisible characters.");
      }
      admin.initializeApp({ projectId: firebaseConfig.projectId });
    }
  } else {
    console.warn("Firebase Admin: No service account found. Falling back to default credentials (may fail).");
    admin.initializeApp({
      projectId: firebaseConfig.projectId
    });
  }
}

let dbInstance: admin.firestore.Firestore | null = null;
const getDb = () => {
  if (!dbInstance) {
    if (!admin.apps.length) throw new Error("Firebase Admin not initialized");
    dbInstance = getFirestore(admin.apps[0], firebaseConfig.firestoreDatabaseId);
  }
  return dbInstance;
};

// Global connectivity status
let firebaseStatus = {
  connected: false,
  error: null as string | null,
  lastChecked: null as Date | null
};

// Test connectivity immediately and periodically
const testDbAccess = async () => {
  try {
    const db = getDb();
    await db.collection('_health_check').doc('ping').set({ 
      time: new Date(),
      note: "Server startup check" 
    });
    firebaseStatus = { connected: true, error: null, lastChecked: new Date() };
    console.log("Firebase Admin: Firestore connectivity test SUCCESSFUL.");
  } catch (err: any) {
    firebaseStatus = { connected: false, error: err.message, lastChecked: new Date() };
    console.error("Firebase Admin: Firestore connectivity test FAILED!");
    console.error(`Error Code: ${err.code}, Message: ${err.message}`);
  }
};
testDbAccess();

// UniMatrix Configuration
const UNIMATRIX_ACCESS_KEY = process.env.UNIMATRIX_ACCESS_KEY || "";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(bodyParser.json());

  // Health check for Firebase Admin
  app.get("/api/notification-status", (req, res) => {
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT || "";
    let saJsonStatus = "missing";
    let saProjectId = null;
    
    if (sa) {
      try {
        let cleanSa = sa.trim();
        if (cleanSa.startsWith("'") || cleanSa.startsWith('"')) cleanSa = cleanSa.slice(1, -1);
        const parsed = JSON.parse(cleanSa);
        saJsonStatus = "valid_json";
        saProjectId = parsed.project_id;
        
        const pk = parsed.private_key || "";
        const pkClean = pk.replace(/\\n/g, '\n').trim();
        
        (req as any).saInfo = {
          saType: parsed.type,
          pKeyLength: pk.length,
          pKeyLines: pkClean.split('\n').length,
          hasBegin: pkClean.includes("BEGIN PRIVATE KEY"),
          hasEnd: pkClean.includes("END PRIVATE KEY")
        };
      } catch (e) {
        saJsonStatus = "invalid_json";
      }
    }

    res.json({ 
      initialized: admin.apps.length > 0,
      projectId: firebaseConfig.projectId,
      firebaseStatus: firebaseStatus,
      diagnostics: {
        saLength: sa.length,
        saJsonStatus,
        saProjectId,
        projectIdMatch: saProjectId === firebaseConfig.projectId,
        nodeEnv: process.env.NODE_ENV,
        ...(req as any).saInfo
      }
    });
  });

  // API Route to send notifications
  app.post("/api/send-notification", async (req, res) => {
    const { tokens, title, body, imageUrl, data } = req.body;

    if (!tokens || !Array.isArray(tokens) || tokens.length === 0) {
      return res.status(400).json({ error: "No tokens provided" });
    }

    if (!admin.apps.length) {
      return res.status(500).json({ error: "Firebase Admin not initialized. Please provide a service account." });
    }

    try {
      const message: any = {
        notification: {
          title,
          body,
        },
        tokens,
        android: {
          notification: {
            imageUrl,
            channelId: "default",
            priority: "high",
            sound: "default"
          }
        },
        apns: {
          payload: {
            aps: {
              mutableContent: true,
              sound: "default"
            }
          },
          fcmOptions: {
            imageUrl
          }
        },
        data: data || {}
      };

      const response = await admin.messaging().sendEachForMulticast(message);
      res.json({ 
        success: true, 
        successCount: response.successCount, 
        failureCount: response.failureCount 
      });
    } catch (error: any) {
      console.error("Error sending FCM message:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // OTP Routes (SMS via UniMatrix)
  app.post("/api/auth/otp/send", async (req, res) => {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({ error: "رقم الهاتف مطلوب" });
    }

    if (!UNIMATRIX_ACCESS_KEY) {
      return res.status(500).json({ error: "إعدادات UniMatrix غير مكتملة (نقص مفتاح الوصول)" });
    }

    try {
      // Generate a 6-digit code
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      
      // Store in Firestore with 5-minute expiry
      const db = getDb();
      
      try {
        await db.collection('sms_otps').doc(phoneNumber).set({
          code: otpCode,
          expiresAt: Timestamp.fromMillis(Date.now() + 5 * 60 * 1000)
        });
      } catch (firestoreError: any) {
        console.error("Firestore Error in /api/auth/otp/send:", firestoreError);
        if (firestoreError.message?.includes('16') || firestoreError.message?.includes('UNAUTHENTICATED')) {
          return res.status(500).json({ 
            error: "فشل المصادقة مع Firebase (خطأ 16).",
            details: "يحدث هذا عادةً لأن ملف مفتاح الخدمة (Service Account) غير صحيح، أو أنه يخص مشروعاً آخر، أو أنه تم نسخه بشكل خاطئ. يرجى التأكد من الحصول على المفتاح من: Firebase Console > Project Settings > Service Accounts > Generate New Private Key."
          });
        }
        throw firestoreError;
      }

      // Send via UniMatrix API
      // Documented at https://www.unimtx.com/docs/api/messaging/send-sms
      const response = await axios.post(`https://api.unimtx.com/?action=send&accessKey=${UNIMATRIX_ACCESS_KEY}`, {
        to: phoneNumber,
        text: `كود التحقق الخاص بك هو: ${otpCode}. صالح لمدة 5 دقائق.`
      });

      if (response.data.code === '0' || response.data.status === 'success') {
        res.json({ success: true, messageId: response.data.data?.messageId });
      } else {
        console.error("UniMatrix Error Response:", response.data);
        res.status(500).json({ error: `فشل إرسال الرسالة: ${response.data.message || 'خطأ غير معروف'}` });
      }
    } catch (error: any) {
      console.error("UniMatrix SMS Send Error:", error);
      res.status(500).json({ error: error.message || "حدث خطأ أثناء إرسال الرسالة القصيرة" });
    }
  });

  app.post("/api/auth/otp/verify", async (req, res) => {
    const { phoneNumber, code } = req.body;

    if (!phoneNumber || !code) {
      return res.status(400).json({ error: "رقم الهاتف والكود مطلوبان" });
    }

    try {
      const db = getDb();
      
      let otpDoc;
      try {
        otpDoc = await db.collection('sms_otps').doc(phoneNumber).get();
      } catch (firestoreError: any) {
        console.error("Firestore Error in /api/auth/otp/verify:", firestoreError);
        if (firestoreError.message?.includes('16') || firestoreError.message?.includes('UNAUTHENTICATED')) {
          return res.status(500).json({ 
            error: "فشل المصادقة مع Firebase (خطأ 16).",
            details: "يحدث هذا عادةً لأن ملف مفتاح الخدمة (Service Account) غير صحيح، أو أنه يخص مشروعاً آخر، أو أنه تم نسخه بشكل خاطئ. يرجى التأكد من الحصول على المفتاح من: Firebase Console > Project Settings > Service Accounts > Generate New Private Key."
          });
        }
        throw firestoreError;
      }

      if (!otpDoc.exists) {
        return res.status(400).json({ error: "لم يتم إرسال كود لهذا الرقم أو انتهت صلاحيته" });
      }

      const otpData = otpDoc.data();
      if (otpData?.expiresAt.toDate() < new Date()) {
        await db.collection('sms_otps').doc(phoneNumber).delete();
        return res.status(400).json({ error: "انتهت صلاحية الكود" });
      }

      if (otpData?.code === code) {
        // Correct code - Authenticate user
        const customToken = await admin.auth().createCustomToken(phoneNumber);
        // Clear the OTP
        await db.collection('sms_otps').doc(phoneNumber).delete();
        res.json({ success: true, token: customToken });
      } else {
        res.status(400).json({ success: false, error: "كود التحقق غير صحيح" });
      }
    } catch (error: any) {
      console.error("OTP Verify Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
