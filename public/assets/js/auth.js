import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAqj6QGAKb0HzD43N5t4mDd0Bpn0q3QDGo",
  authDomain: "vineacare.firebaseapp.com",
  projectId: "vineacare",
  storageBucket: "vineacare.firebasestorage.app",
  messagingSenderId: "300769963613",
  appId: "1:300769963613:web:61691056ab2c318ecca7b4"
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
