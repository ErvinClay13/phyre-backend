import express from "express";
import cors from "cors";
import { Expo } from "expo-server-sdk";
import dotenv from "dotenv";
import { adminDb } from "./firebaseAdmin.js";
import { AccessToken } from "livekit-server-sdk";

dotenv.config();

const app = express();
const expo = new Expo();

app.use(cors());
app.use(express.json());

/* -------------------------------------------------- */
/* 🔔 SEND PUSH */
/* -------------------------------------------------- */

app.post("/send-push", async (req, res) => {
  try {
    const { userId, title, body } = req.body;

    if (!userId || !title || !body) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const userSnap = await adminDb.collection("users").doc(userId).get();

    if (!userSnap.exists) {
      return res.status(404).json({ error: "User not found" });
    }

    const { expoPushToken } = userSnap.data();

    if (!expoPushToken) {
      return res.status(400).json({ error: "User has no push token" });
    }

    if (!Expo.isExpoPushToken(expoPushToken)) {
      return res.status(400).json({ error: "Invalid push token" });
    }

    const message = {
      to: expoPushToken,
      sound: "default",
      title,
      body,
      data: {},
    };

    await expo.sendPushNotificationsAsync([message]);

    return res.json({ success: true });
  } catch (err) {
    console.log("Push error:", err);
    return res.status(500).json({ error: "Push failed" });
  }
});

app.listen(5000, () => {
  console.log("🚀 Push server running on port 5000");
});