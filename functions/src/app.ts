import express = require("express");
import cookieParser = require("cookie-parser");
import * as path from "path";
import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}

const app = express();

app.use(cookieParser());
app.use(express.json());

// View engine setup
app.set("views", path.join(__dirname, "../views"));
app.set("view engine", "ejs");

// Middleware to verify session and inject uid
app.use(async (req, res, next) => {
  const sessionCookie = req.cookies.__session || "";
  let uid: string | null = null;

  if (sessionCookie) {
    try {
      const decodedClaims = await admin.auth().verifySessionCookie(sessionCookie, true);
      uid = decodedClaims.uid;
    } catch (error) {
      console.error("Error verifying session cookie:", error);
    }
  }

  // Inject uid into locals so it's available in all EJS templates
  res.locals.uid = uid;
  next();
});

// Routes
app.get("/", (req, res) => {
  res.render("index", { title: "Home" });
});

app.get("/index.html", (req, res) => {
  res.redirect("/");
});

app.get("/forum", (req, res) => {
  res.render("forum", { title: "Forum" });
});

app.get("/forum.html", (req, res) => {
  res.redirect("/forum");
});

app.get("/forum/post/:id", (req, res) => {
  res.render("post", { title: "Post Thread", postId: req.params.id });
});

// Profile page route
app.get("/profile/:uid", (req, res) => {
  res.render("profile", { title: "Profile", profileUid: req.params.uid });
});

// Endpoint to fetch private user data (inbox, notifications)
app.get("/api/user/me", async (req, res) => {
  const uid = res.locals.uid;
  if (!uid) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const userDoc = await admin.firestore().collection('users').doc(uid).get();
    if (!userDoc.exists) {
      res.json({ inbox: [], notifications: [], username: "", displayName: "", photoURL: "" });
      return;
    }
    res.json(userDoc.data());
  } catch (error) {
    console.error("Error fetching user data:", error);
    res.status(500).send("Internal Error");
  }
});

// Endpoint to create a new forum post securely
app.post("/api/forum/post", async (req, res) => {
  const uid = res.locals.uid;
  if (!uid) {
    res.status(401).json({ error: "Unauthorized. Please log in." });
    return;
  }

  try {
    const { text, media } = req.body;
    
    // Fetch the user record to get the email (or use custom claims)
    const userRecord = await admin.auth().getUser(uid);
    const authorEmail = userRecord.email || "Anonymous";

    const postData = {
      authorUid: uid,
      authorEmail: authorEmail,
      text: text || "",
      media: media || [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      likeCount: 0,
      repostCount: 0,
      commentCount: 0,
      bookmarkCount: 0
    };

    const docRef = await admin.firestore().collection('posts').add(postData);
    res.json({ success: true, id: docRef.id });
  } catch (error) {
    console.error("Error creating post:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Endpoint to update user profile
app.post("/api/user/update", async (req, res) => {
  const uid = res.locals.uid;
  const { displayName, photoURL, username } = req.body;

  if (!uid) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    // Update Firestore
    const userRef = admin.firestore().collection('users').doc(uid);
    await userRef.set({
      displayName: displayName || "",
      photoURL: photoURL || "",
      username: username || "",
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // (Optional) Update Auth record too
    await admin.auth().updateUser(uid, {
      displayName: displayName,
      photoURL: photoURL
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Endpoint to establish session cookie
app.post("/api/sessionLogin", async (req, res) => {
  const idToken = req.body.idToken;
  if (!idToken) {
    res.status(400).send("No ID Token provided");
    return;
  }

  const expiresIn = 60 * 60 * 24 * 5 * 1000; // 5 days
  try {
    const sessionCookie = await admin.auth().createSessionCookie(idToken, { expiresIn });
    const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";
    const options = { maxAge: expiresIn, httpOnly: true, secure: !isEmulator, path: "/" };
    
    // Ensure user document exists in Firestore
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;
    const userSnapshot = await admin.firestore().collection('users').doc(uid).get();
    
    if (!userSnapshot.exists) {
      await admin.firestore().collection('users').doc(uid).set({
        displayName: decodedToken.name || "",
        photoURL: decodedToken.picture || "",
        email: decodedToken.email || "",
        username: "", // To be set by user
        inbox: [],
        notifications: [],
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    res.cookie("__session", sessionCookie, options);
    res.json({ status: "success" });
  } catch (error) {
    console.error("Session login error:", error);
    res.status(401).send("UNAUTHORIZED REQUEST!");
  }
});

app.post("/api/sessionLogout", (req, res) => {
  res.clearCookie("__session", { path: "/" });
  res.json({ status: "success" });
});

export default app;
