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

// Messaggio Configuration
const MESSAGGIO_SECRET_KEY = (process.env.MESSAGGIO_SECRET_KEY || "").trim();
const MESSAGGIO_SENDER_CODE = (process.env.MESSAGGIO_SENDER_CODE || "").trim();
const MESSAGGIO_PROJECT_LOGIN = (process.env.MESSAGGIO_PROJECT_LOGIN || "").trim();

let dbInstance: admin.firestore.Firestore | null = null;
let firebaseStatus = {
  connected: false,
  error: null as string | null,
  lastChecked: null as Date | null
};

// Robust Firebase Admin Initialization logic
const initializeFirebaseAdmin = () => {
  if (admin.apps.length > 0) return;

  console.log("Firebase Admin: Initializing...");
  
  const saEnv = process.env.FIREBASE_SERVICE_ACCOUNT || "";
  
  if (!saEnv) {
    console.warn("Firebase Admin: FIREBASE_SERVICE_ACCOUNT env var is missing. Please add it to Secrets.");
    admin.initializeApp({ projectId: firebaseConfig.projectId });
    return;
  }

  try {
    let cleanSa = saEnv.trim();
    
    // Strip surrounding single/double quotes if added by the environment/shell
    if ((cleanSa.startsWith("'") && cleanSa.endsWith("'")) || (cleanSa.startsWith("\"") && cleanSa.endsWith("\""))) {
      cleanSa = cleanSa.slice(1, -1);
    }

    let saJson;
    try {
      saJson = JSON.parse(cleanSa);
    } catch (e) {
      // Emergency cleanup for common copy-paste escaping issues
      const fixedSa = cleanSa.replace(/\\n/g, '\n').replace(/\\"/g, '"');
      saJson = JSON.parse(fixedSa);
    }

    // Standardize the private key line breaks
    if (saJson.private_key) {
      // If the string contains literal \n characters (common in env vars or manual copy), replace them
      // If it already has real newlines, this won't hurt
      saJson.private_key = saJson.private_key.replace(/\\n/g, '\n');
    }

    admin.initializeApp({
      credential: admin.credential.cert(saJson)
    });
    console.log(`Firebase Admin: Success! Initialized for project: ${saJson.project_id}`);
    
    // Global connectivity status
    const testDbAccess = async () => {
      const dbId = firebaseConfig.firestoreDatabaseId;
      console.log(`Firebase Admin: Testing Firestore connection (Project: ${saJson.project_id}, DB: ${dbId || '(default)'})`);
      
      try {
        // Try the configured database first
        dbInstance = getFirestore(admin.apps[0], dbId);
        await dbInstance.collection('_health_check').doc('ping').get();
        firebaseStatus = { connected: true, error: null, lastChecked: new Date() };
        console.log("Firebase Admin: Firestore connectivity test SUCCESSFUL.");
      } catch (err: any) {
        console.error(`Firebase Admin: Initial attempt failed. Code: ${err.code}, Message: ${err.message}`);
        
        // If it's a NOT_FOUND error (5), try falling back to (default)
        if (err.message.includes("5 NOT_FOUND") || err.code === 5) {
          console.log("Firebase Admin: Named database not found. Falling back to (default) database...");
          try {
            dbInstance = getFirestore(admin.apps[0]);
            await dbInstance.collection('_health_check').doc('ping').get();
            firebaseStatus = { connected: true, error: null, lastChecked: new Date() };
            console.log("Firebase Admin: FALLBACK to (default) database SUCCESSFUL.");
          } catch (fallbackErr: any) {
             firebaseStatus = { connected: false, error: fallbackErr.message, lastChecked: new Date() };
             console.error("Firebase Admin: FALLBACK also failed:", fallbackErr.message);
          }
        } else {
          firebaseStatus = { connected: false, error: err.message, lastChecked: new Date() };
        }
      }
    };
    testDbAccess();

  } catch (err: any) {
    console.error("Firebase Admin: Initialization failed:", err.message);
    // Emergency Fallback
    if (!admin.apps.length) {
      admin.initializeApp({ projectId: firebaseConfig.projectId });
    }
  }
};

initializeFirebaseAdmin();

const getDb = () => {
  if (!dbInstance) {
    if (!admin.apps.length) throw new Error("Firebase Admin not initialized");
    // If not set by initializeFirebaseAdmin's test, try config
    dbInstance = getFirestore(admin.apps[0], firebaseConfig.firestoreDatabaseId);
  }
  return dbInstance;
};

// Global connectivity status
// (Moved to top to avoid ReferenceError)

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(bodyParser.json());

  // Health check for Firebase Admin
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", firebase: firebaseStatus });
  });

  // Diagnostics for Firebase Admin
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

  // OTP Routes (SMS via Messaggio)
  app.post("/api/auth/otp/send", async (req, res) => {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({ error: "رقم الهاتف مطلوب" });
    }

    if (!MESSAGGIO_SECRET_KEY) {
      return res.status(500).json({ error: "إعدادات Messaggio غير مكتملة (نقص المفتاح السري Secret Key)" });
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
            details: "يحدث هذا عادةً لأن ملف مفتاح الخدمة (Service Account) غير صحيح."
          });
        }
        throw firestoreError;
      }

      // Send via Messaggio API
      // Detailed logging for debugging "failed to extract permissions"
      // We try a few variations of headers based on Messaggio common issues
      const cleanKey = MESSAGGIO_SECRET_KEY.replace('Bearer ', '').trim();
      
      console.log(`Messaggio: Sending request to project ${MESSAGGIO_PROJECT_LOGIN}`);
      console.log(`Messaggio: Auth token length: ${cleanKey.length}`);
      
      const response = await axios.post(`https://api.messaggio.com/api/v1/projects/${MESSAGGIO_PROJECT_LOGIN}/messages`, {
        messages: [
          {
            to: phoneNumber,
            from: MESSAGGIO_SENDER_CODE,
            channel: "sms",
            content: {
              text: `كود التحقق الخاص بك هو: ${otpCode}. صالح لمدة 5 دقائق.`
            }
          }
        ]
      }, {
        headers: {
          // Trying standard Bearer first
          'Authorization': `Bearer ${cleanKey}`,
          // Adding X-Api-Key as secondary fallback in the same request if supported
          'X-Api-Key': cleanKey,
          'Content-Type': 'application/json'
        },
        validateStatus: () => true 
      });

      console.log("Messaggio API Raw Status:", response.status);
      console.log("Messaggio API Response Data:", JSON.stringify(response.data));

      if (response.status === 200 || response.status === 201) {
        res.json({ success: true, messageId: response.data.messages?.[0]?.id });
      } else {
        const errorData = response.data;
        const errorMessage = errorData?.error || errorData?.message || "Unknown error";
        // Avoid sending 403 directly as it might be intercepted by Nginx/CloudRun and replaced with HTML
        const safeStatus = response.status === 403 ? 400 : response.status;
        res.status(safeStatus).json({ 
          error: `فشل إرسال الرسالة عبر Messaggio: ${errorMessage}`,
          details: errorData
        });
      }
    } catch (error: any) {
      console.error("Messaggio SMS Send Error:", error.response?.data || error.message);
      const errorData = error.response?.data;
      const errorMessage = errorData?.error || errorData?.message || error.message;
      const errorStatus = errorData?.status || "Error";
      
      res.status(500).json({ 
        error: `فشل إرسال الرسالة: ${errorMessage}`,
        details: {
          status: errorStatus,
          raw: errorData
        }
      });
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

  // Global Error Handler for API routes
  app.use("/api", (err: any, req: any, res: any, next: any) => {
    console.error("API Error Handler Caught:", err);
    res.status(err.status || 500).json({
      error: "حدث خطأ غير متوقع في الخادم",
      message: err.message,
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
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
