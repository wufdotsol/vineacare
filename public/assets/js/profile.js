import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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

// DOM Elements
const profilePicLarge = document.getElementById('profile-pic-large');
const displayNameSidebar = document.getElementById('display-name-sidebar');
const usernameSidebar = document.getElementById('username-sidebar');
const profileForm = document.getElementById('profile-form');
const displayNameInput = document.getElementById('displayName');
const usernameInput = document.getElementById('username');
const profilePicInput = document.getElementById('profilePic');
const saveStatus = document.getElementById('save-status');
const logoutBtn = document.getElementById('logout-btn');
const inboxCount = document.getElementById('inbox-count');
const notifCount = document.getElementById('notif-count');
const inboxList = document.getElementById('inbox-list');
const notificationsList = document.getElementById('notifications-list');

// Page state
let currentUserData = null;

// Initial setup
onAuthStateChanged(auth, async (user) => {
  if (user) {
    console.log("Profile page: User is signed in");
    await loadUserProfile();
  } else {
    console.log("Profile page: No user signed in, redirecting to home");
    window.location.href = "/";
  }
});

async function loadUserProfile() {
  try {
    const response = await fetch('/api/user/me');
    if (!response.ok) throw new Error("Failed to fetch user data");
    
    const data = await response.json();
    currentUserData = data;

    // Update UI
    displayNameSidebar.textContent = data.displayName || auth.currentUser.displayName || "User";
    usernameSidebar.textContent = data.username ? `@${data.username}` : "@username";
    profilePicLarge.src = data.photoURL || auth.currentUser.photoURL || "/assets/img/team/team-1.jpg";
    
    // Fill form
    displayNameInput.value = data.displayName || auth.currentUser.displayName || "";
    usernameInput.value = data.username || "";
    profilePicInput.value = data.photoURL || auth.currentUser.photoURL || "";

    // Update counts
    inboxCount.textContent = (data.inbox || []).length;
    notifCount.textContent = (data.notifications || []).length;

    // Populate Inbox (Mocked)
    if (data.inbox && data.inbox.length > 0) {
      inboxList.innerHTML = data.inbox.map(msg => `
        <div class="list-group-item d-flex align-items-center">
          <div class="flex-grow-1">
            <h6 class="mb-1">${msg.title || 'Message'}</h6>
            <p class="mb-0 small text-muted">${msg.text || msg}</p>
          </div>
          <span class="small text-muted">Just now</span>
        </div>
      `).join('');
    }

    // Populate Notifications (Mocked)
    if (data.notifications && data.notifications.length > 0) {
      notificationsList.innerHTML = data.notifications.map(n => `
        <div class="list-group-item d-flex align-items-center">
          <i class="bi bi-info-circle text-primary me-3"></i>
          <div>
            <p class="mb-0">${n.text || n}</p>
            <span class="small text-muted">Recently</span>
          </div>
        </div>
      `).join('');
    }

  } catch (error) {
    console.error("Error loading profile:", error);
  }
}

// Handle Form Submission
profileForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const updatedData = {
    displayName: displayNameInput.value,
    username: usernameInput.value,
    photoURL: profilePicInput.value
  };

  try {
    const response = await fetch('/api/user/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedData)
    });

    if (response.ok) {
      saveStatus.classList.remove('d-none');
      
      // Update sidebar in real-time
      displayNameSidebar.textContent = updatedData.displayName;
      usernameSidebar.textContent = `@${updatedData.username}`;
      if (updatedData.photoURL) profilePicLarge.src = updatedData.photoURL;

      setTimeout(() => {
        saveStatus.classList.add('d-none');
      }, 3000);
    } else {
      alert("Failed to update profile. Please try again.");
    }
  } catch (error) {
    console.error("Error saving profile:", error);
    alert("An error occurred. Check console for details.");
  }
});

// Handle Logout
logoutBtn.addEventListener('click', async () => {
  if (confirm("Are you sure you want to logout?")) {
    try {
      if (auth.currentUser) {
        const userRef = doc(db, "users", auth.currentUser.uid);
        await updateDoc(userRef, {
          lastSeen: serverTimestamp(),
          isOnline: false
        });
        localStorage.removeItem('currentUser');
      }
      await signOut(auth);
      await fetch('/api/sessionLogout', { method: 'POST' });
      window.location.href = "/";
    } catch (error) {
      console.error("Logout error:", error);
    }
  }
});
