import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

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
          const idToken = await result.user.getIdToken();
          await fetch('/api/sessionLogin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken })
          });
          window.location.reload();
        }).catch((error) => {
          console.error("Login error:", error);
        });
    }
  });
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    // User is signed in, replace icon with profile picture
    const profilePicUrl = user.photoURL;
    authNavLink.innerHTML = `<img src="${profilePicUrl}" alt="${user.displayName}" style="width: 24px; height: 24px; border-radius: 50%; margin-left: 10px; object-fit: cover;">`;
    authNavLink.title = `Profile (${user.displayName})`;
  } else {
    // User is signed out, show default icon
    authNavLink.innerHTML = `<i class="bi bi-person-circle" style="font-size: 1.1rem; margin-left: 10px;"></i>`;
    authNavLink.title = "Login";
  }
});
