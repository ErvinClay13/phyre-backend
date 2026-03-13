import admin from "firebase-admin";

/*
  Firebase Admin credentials are stored in Render
  as an environment variable called FIREBASE_ADMIN_JSON
*/

const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_JSON);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

export const adminDb = admin.firestore();
export const adminAuth = admin.auth();