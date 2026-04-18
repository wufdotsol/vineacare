import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCGYnRZEfbpNkcfEte5t7qs6IytAXx_xDw",
  authDomain: "vineacare-test.firebaseapp.com",
  projectId: "vineacare-test",
  storageBucket: "vineacare-test.firebasestorage.app",
  messagingSenderId: "536960966057",
  appId: "1:536960966057:web:aa9cd5f3d3c713aba5b8b8",
  measurementId: "G-XMS1JNEWPS"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

const authNavLink = document.getElementById('auth-nav-link');

if (authNavLink) {
  authNavLink.addEventListener('click', (e) => {
    e.preventDefault();
    if (auth.currentUser) {
      // Navigate to profile instead of signing out
      window.location.href = `/profile/${auth.currentUser.uid}`;
    } else {
      // Sign in
      signInWithPopup(auth, provider)
        .then(async (result) => {
          console.log("Logged in:", result.user.displayName);
          
          const uid = result.user.uid;
          const idToken = await result.user.getIdToken();
          
          // Check if document exists first
          const userRef = doc(db, "users", uid);
          const userSnap = await getDoc(userRef);
          
          let userObj;
          if (!userSnap.exists()) {
             // Generate user instance as defined in auth.txt
             userObj = {
                 name: result.user.displayName || "User",
                 email: result.user.email || "",
                 username: result.user.email ? result.user.email.split('@')[0] : "unknown",
                 profile_pic: result.user.photoURL || "",
                 sentFriendRequests: [],
                 recievedFriendRequests: [],
                 myFriends: [],
                 myPosts: [],
                 myChats: [],
                 myGroups: [],
                 myEvents: [],
                 myJobs: [],
                 myApplications: [],
                 myBookmarks: [],
                 myFeeds: [],
                 lastSeen: null,
                 isOnline: true,
                 isVerified: false
             };
             // Push it to the database
             await setDoc(userRef, userObj);
             console.log("Successfully created user document:", userObj);
          } else {
             // If doc was found, update user object with data from document
             userObj = userSnap.data();
             await setDoc(userRef, { isOnline: true }, { merge: true });
          }
          
          console.log("Downloaded Firebase User Document:", userObj);
          localStorage.setItem('currentUser', JSON.stringify(userObj));
          
          // Also establish backend session but non-blocking gracefully
          try {
            await fetch('/api/sessionLogin', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'same-origin',
              body: JSON.stringify({ idToken })
            });
          } catch(e) { console.warn("Backend session sync failed but frontend auth passed", e); }
          
          if (window.location.pathname.includes('/forum')) {
              window.dispatchEvent(new CustomEvent('navLoginSuccess', { detail: userObj }));
          } else {
              window.location.href = '/forum';
          }
        }).catch((error) => {
          console.error("Login error:", error);
        });
    }
  });
}

onAuthStateChanged(auth, async (user) => {
  if (user) {
    if (authNavLink) {
      // User is signed in, replace icon with profile picture
      const profilePicUrl = user.photoURL;
      authNavLink.innerHTML = `<img src="${profilePicUrl}" alt="${user.displayName}" style="width: 24px; height: 24px; border-radius: 50%; margin-left: 10px; object-fit: cover;">`;
      authNavLink.title = `Profile (${user.displayName})`;
    }
    
    // Also ensure currentUser in local storage exists
    if (!localStorage.getItem('currentUser')) {
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        localStorage.setItem('currentUser', JSON.stringify(userSnap.data()));
      }
    }
  } else {
    if (authNavLink) {
      // User is signed out, show default icon
      authNavLink.innerHTML = `<i class="bi bi-person-circle" style="font-size: 1.1rem; margin-left: 10px;"></i>`;
      authNavLink.title = "Login";
    }
    localStorage.removeItem('currentUser');
  }
});
