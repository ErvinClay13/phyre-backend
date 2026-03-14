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
    console.error("Push error:", err);
    return res.status(500).json({ error: "Push failed" });
  }
});


/* -------------------------------------------------- */
/* 🎥 LIVEKIT TOKEN GENERATOR */
/* -------------------------------------------------- */

app.post("/livekit-token", async (req, res) => {
  try {

    console.log("🔥 LiveKit token request received:", req.body);

    const { room, user } = req.body;

    if (!room || !user) {
      console.log("❌ Missing room or user");
      return res.status(400).json({ error: "Missing room or user" });
    }

    if (!process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) {
      console.log("❌ Missing LiveKit env variables");
      return res.status(500).json({ error: "Server config error" });
    }

    const at = new AccessToken(
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
      {
        identity: user,
      }
    );

    at.addGrant({
      roomJoin: true,
      room: room,
      canPublish: true,
      canSubscribe: true,
    });

    const token = await at.toJwt();

    console.log("✅ LiveKit token generated for:", user, "room:", room);

    res.json({ token });

  } catch (err) {
    console.error("❌ LiveKit token error:", err);
    res.status(500).json({ error: "Token creation failed" });
  }
});


/* -------------------------------------------------- */
/* ❤️ HEALTH CHECK */
/* -------------------------------------------------- */

app.get("/", (req, res) => {
  res.send("Phyre backend running 🚀");
});


/* -------------------------------------------------- */
/* 🚀 START SERVER */
/* -------------------------------------------------- */

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
