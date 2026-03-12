import admin from "firebase-admin";
import serviceAccount from "./firebase-admin.json" assert { type: "json" };

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

export const adminDb = admin.firestore();
export default admin;