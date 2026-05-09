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
