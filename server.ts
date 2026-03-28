import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import admin from "firebase-admin";
import bodyParser from "body-parser";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load Firebase Config
const configPath = path.join(process.cwd(), "firebase-applet-config.json");
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));

// Initialize Firebase Admin
// Note: For push notifications to work, the user must provide a service account JSON
// as an environment variable FIREBASE_SERVICE_ACCOUNT or place it in service-account.json
const serviceAccountPath = path.join(process.cwd(), "service-account.json");
if (fs.existsSync(serviceAccountPath)) {
  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf-8"));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: `https://${firebaseConfig.projectId}.firebaseio.com`
  });
  console.log("Firebase Admin initialized with service account file.");
} else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: `https://${firebaseConfig.projectId}.firebaseio.com`
    });
    console.log("Firebase Admin initialized with environment variable.");
  } catch (e) {
    console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT env var:", e);
  }
} else {
  // Fallback to default credentials (works on Google Cloud)
  try {
    admin.initializeApp({
      projectId: firebaseConfig.projectId
    });
    console.log("Firebase Admin initialized with default credentials.");
  } catch (e) {
    console.warn("Firebase Admin failed to initialize. Push notifications will not work until a service account is provided.");
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(bodyParser.json());

  // Health check for Firebase Admin
  app.get("/api/notification-status", (req, res) => {
    res.json({ 
      initialized: admin.apps.length > 0,
      projectId: firebaseConfig.projectId
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
