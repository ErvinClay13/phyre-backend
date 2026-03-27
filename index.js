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
    const { room, user, isHost } = req.body;

    if (!room || !user) {
      return res.status(400).json({ error: "Missing room or user" });
    }

    const at = new AccessToken(
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
      { identity: user }
    );

    at.addGrant({
      roomJoin: true,
      room,
      canPublish: !!isHost,
      canSubscribe: true,
    });

    const token = await at.toJwt();

    res.json({ token });

  } catch (err) {
    console.error("LiveKit token error:", err);
    res.status(500).json({ error: "Token creation failed" });
  }
});

/* -------------------------------------------------- */
/* 🔥 NEW: GET PROFILES (BACKEND FILTERING) */
/* -------------------------------------------------- */

app.post("/get-profiles", async (req, res) => {
  try {
    const { userId } = req.body;

    console.log("📥 GET PROFILES FOR:", userId);

    if (!userId) {
      return res.status(400).json({ error: "Missing userId" });
    }

    const userDoc = await adminDb.collection("users").doc(userId).get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: "User not found" });
    }

    const currentUser = userDoc.data();

    /* 🔥 GET ALL USERS */
    const usersSnapshot = await adminDb.collection("users").get();

    /* 🔥 GET SWIPES */
    const swipesSnapshot = await adminDb
      .collection("swipes")
      .doc(userId)
      .collection("actions")
      .get();

    const swipedIds = new Set();
    swipesSnapshot.forEach((doc) => {
      swipedIds.add(doc.id);
    });

    const results = [];

    usersSnapshot.forEach((doc) => {
      const u = doc.data();

      // ❌ skip self
      if (u.uid === userId) return;

      // ❌ skip incomplete profiles
      if (!u.onboardingComplete) return;

      // ❌ skip already swiped
      if (swipedIds.has(u.uid)) return;

      results.push(u);
    });

    console.log("✅ PROFILES RETURNED:", results.length);

    return res.json({ profiles: results });

  } catch (err) {
    console.error("❌ get-profiles error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* -------------------------------------------------- */
/* 🔥 SWIPE SYSTEM (MATCH LOGIC) */
/* -------------------------------------------------- */

app.post("/swipe", async (req, res) => {
  try {
    const { currentUserId, targetUserId, action } = req.body;

    console.log("👉 SWIPE:", currentUserId, "→", targetUserId, action);

    if (!currentUserId || !targetUserId || !action) {
      return res.status(400).json({ error: "Missing fields" });
    }

    if (action !== "like") {
      return res.json({ matchId: null });
    }

    const reverseSwipeRef = adminDb
      .collection("swipes")
      .doc(targetUserId)
      .collection("actions")
      .doc(currentUserId);

    const reverseSwipeSnap = await reverseSwipeRef.get();

    if (
      !reverseSwipeSnap.exists ||
      reverseSwipeSnap.data()?.action !== "like"
    ) {
      return res.json({ matchId: null });
    }

    const sortedIds = [currentUserId, targetUserId].sort();
    const matchId = sortedIds.join("_");

    const matchRef = adminDb.collection("matches").doc(matchId);
    const matchSnap = await matchRef.get();

    if (!matchSnap.exists) {
      await matchRef.set({
        users: sortedIds,
        createdAt: new Date(),
      });
    }

    console.log("🔥 MATCH CREATED:", matchId);

    return res.json({ matchId });

  } catch (error) {
    console.error("❌ SWIPE ERROR:", error);
    res.status(500).json({ error: "Server error" });
  }
});

/* -------------------------------------------------- */
/* 💬 START CONVERSATION */
/* -------------------------------------------------- */

app.post("/start-conversation", async (req, res) => {
  try {
    const { currentUserId, targetUserId } = req.body;

    if (!currentUserId || !targetUserId) {
      return res.status(400).json({ error: "Missing user IDs" });
    }

    const matchesRef = adminDb.collection("matches");

    const snapshot = await matchesRef
      .where("users", "array-contains", currentUserId)
      .get();

    let matchFound = null;

    snapshot.forEach((doc) => {
      const data = doc.data();
      if (data.users.includes(targetUserId)) {
        matchFound = { id: doc.id, ...data };
      }
    });

    if (!matchFound) {
      return res.status(403).json({ error: "No match found" });
    }

    const convRef = adminDb.collection("conversations");

    const convSnap = await convRef
      .where("users", "array-contains", currentUserId)
      .get();

    let existingConversation = null;

    convSnap.forEach((doc) => {
      const data = doc.data();
      if (data.users.includes(targetUserId)) {
        existingConversation = { id: doc.id, ...data };
      }
    });

    if (existingConversation) {
      return res.json({
        conversationId: existingConversation.id,
      });
    }

    const newConv = await convRef.add({
      users: [currentUserId, targetUserId],
      createdAt: new Date(),
      lastMessage: null,
    });

    return res.json({
      conversationId: newConv.id,
    });

  } catch (error) {
    console.error("Start conversation error:", error);
    res.status(500).json({ error: "Server error" });
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














// 3/18
// import express from "express";
// import cors from "cors";
// import { Expo } from "expo-server-sdk";
// import dotenv from "dotenv";
// import { adminDb } from "./firebaseAdmin.js";
// import { AccessToken } from "livekit-server-sdk";

// dotenv.config();

// const app = express();
// const expo = new Expo();

// app.use(cors());
// app.use(express.json());

// /* -------------------------------------------------- */
// /* 🔔 SEND PUSH */
// /* -------------------------------------------------- */

// app.post("/send-push", async (req, res) => {
//   try {
//     const { userId, title, body } = req.body;

//     if (!userId || !title || !body) {
//       return res.status(400).json({ error: "Missing fields" });
//     }

//     const userSnap = await adminDb.collection("users").doc(userId).get();

//     if (!userSnap.exists) {
//       return res.status(404).json({ error: "User not found" });
//     }

//     const { expoPushToken } = userSnap.data();

//     if (!expoPushToken) {
//       return res.status(400).json({ error: "User has no push token" });
//     }

//     if (!Expo.isExpoPushToken(expoPushToken)) {
//       return res.status(400).json({ error: "Invalid push token" });
//     }

//     const message = {
//       to: expoPushToken,
//       sound: "default",
//       title,
//       body,
//       data: {},
//     };

//     await expo.sendPushNotificationsAsync([message]);

//     return res.json({ success: true });

//   } catch (err) {
//     console.error("Push error:", err);
//     return res.status(500).json({ error: "Push failed" });
//   }
// });


// /* -------------------------------------------------- */
// /* 🎥 LIVEKIT TOKEN GENERATOR */
// /* -------------------------------------------------- */

// app.post("/livekit-token", async (req, res) => {
//   try {

//     console.log("🔥 LiveKit token request received:", req.body);

//     const { room, user, isHost } = req.body;

//     if (!room || !user) {
//       console.log("❌ Missing room or user");
//       return res.status(400).json({ error: "Missing room or user" });
//     }

//     if (!process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) {
//       console.log("❌ Missing LiveKit env variables");
//       return res.status(500).json({ error: "Server config error" });
//     }

//     const at = new AccessToken(
//       process.env.LIVEKIT_API_KEY,
//       process.env.LIVEKIT_API_SECRET,
//       {
//         identity: user,
//       }
//     );

//     if (isHost) {
//       at.addGrant({
//         roomJoin: true,
//         room: room,
//         canPublish: true,
//         canSubscribe: true,
//       });
//     } else {
//       at.addGrant({
//         roomJoin: true,
//         room: room,
//         canPublish: false,
//         canSubscribe: true,
//       });
//     }

//     const token = await at.toJwt();

//     console.log("✅ LiveKit token generated for:", user, "room:", room);

//     res.json({ token });

//   } catch (err) {
//     console.error("❌ LiveKit token error:", err);
//     res.status(500).json({ error: "Token creation failed" });
//   }
// });


// /* -------------------------------------------------- */
// /* ❤️ HEALTH CHECK */
// /* -------------------------------------------------- */

// app.get("/", (req, res) => {
//   res.send("Phyre backend running 🚀");
// });


// /* -------------------------------------------------- */
// /* 🚀 START SERVER */
// /* -------------------------------------------------- */

// const PORT = process.env.PORT || 5000;

// app.listen(PORT, () => {
//   console.log(`🚀 Server running on port ${PORT}`);
// });