import admin from "firebase-admin";

let serviceAccount;

/* -------------------------------------------------- */
/* 🔐 LOAD SERVICE ACCOUNT */
/* -------------------------------------------------- */

if (process.env.FIREBASE_ADMIN_JSON) {
  // ✅ Production (Render)
  serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_JSON);
} else {
  // ✅ Local development
  const fs = await import("fs");
  const path = new URL("./firebase-admin.json", import.meta.url);

  const file = fs.readFileSync(path, "utf-8");
  serviceAccount = JSON.parse(file);
}

/* -------------------------------------------------- */
/* 🚀 INIT FIREBASE ADMIN */
/* -------------------------------------------------- */

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const adminDb = admin.firestore();
const adminAuth = admin.auth();

export { adminDb, adminAuth };