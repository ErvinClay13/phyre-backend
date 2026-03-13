import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Needed for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read service account file
const serviceAccount = JSON.parse(
  fs.readFileSync(path.join(__dirname, "firebase-admin.json"), "utf8")
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

export const adminDb = admin.firestore();
export const adminAuth = admin.auth();