import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, doc, updateDoc, increment, serverTimestamp, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";

// Same config
const firebaseConfig = {
  apiKey: "AIzaSyCGYnRZEfbpNkcfEte5t7qs6IytAXx_xDw",
  authDomain: "vineacare-test.firebaseapp.com",
  projectId: "vineacare-test",
  storageBucket: "vineacare-test.firebasestorage.app",
  messagingSenderId: "536960966057",
  appId: "1:536960966057:web:aa9cd5f3d3c713aba5b8b8"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app);
const storage = getStorage(app);

// Use emulator if local
import { connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { connectStorageEmulator } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";

if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
  connectStorageEmulator(storage, '127.0.0.1', 9199);
}

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Resolve Local User
    const loggedInUserEl = document.getElementById('logged-in-user-data');
    if (!loggedInUserEl) return; // User not logged in, view handles empty state
    
    const uid = loggedInUserEl.dataset.uid;
    let currentUserData = {};
    
    // Attempt local storage
    const localStr = localStorage.getItem('currentUser');
    if (localStr) {
        currentUserData = JSON.parse(localStr);
    }
    
    // Force refresh from Firebase
    const userDocRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userDocRef);
    if(userSnap.exists()) {
        currentUserData = { uid: uid, ...userSnap.data() };
        localStorage.setItem('currentUser', JSON.stringify(currentUserData));
    } else {
        currentUserData = { uid: uid, email: "Anonymous@vineacare.com", name: "User", username: "unknown" };
    }

    // 2. Populate Header & Sidebar Fields
    const pfpUrl = currentUserData.profile_pic || `https://ui-avatars.com/api/?name=${currentUserData.email}&background=random`;
    
    // Left
    document.getElementById('left-pfp').src = pfpUrl;
    document.getElementById('left-name').textContent = currentUserData.name || currentUserData.displayName || "User";
    document.getElementById('left-username').textContent = `@${currentUserData.username}`;
    
    // Right (Default)
    document.getElementById('right-pfp').src = pfpUrl;
    document.getElementById('right-name').textContent = currentUserData.name || currentUserData.displayName || "User";
    document.getElementById('right-username').textContent = `@${currentUserData.username}`;
    
    // Compose Form
    document.getElementById('compose-pfp').src = pfpUrl;
    document.getElementById('compose-pfp').style.display = 'block';

    // 3. Right Column State Management
    const rightProfile = document.getElementById('right-default-profile');
    const rightComment = document.getElementById('right-comment-section');
    
    document.getElementById('close-comments-btn').addEventListener('click', () => {
        rightComment.classList.add('d-none');
        rightProfile.classList.remove('d-none');
        if(currentCommentsUnsub) { currentCommentsUnsub(); currentCommentsUnsub = null; }
    });

    let currentCommentsUnsub = null;

    window.openContextualComment = (postId) => {
        rightProfile.classList.add('d-none');
        rightComment.classList.remove('d-none');
        document.getElementById('active-comment-post-id').value = postId;
        
        const listEl = document.getElementById('comments-list');
        listEl.innerHTML = '<div class="text-center text-muted py-4"><span class="spinner-border spinner-border-sm"></span> Loading...</div>';
        
        if (currentCommentsUnsub) currentCommentsUnsub();
        
        currentCommentsUnsub = onSnapshot(query(collection(db, 'posts', postId, 'comments'), orderBy('createdAt', 'asc')), (snapshot) => {
            listEl.innerHTML = '';
            if (snapshot.empty) {
                listEl.innerHTML = '<div class="text-center text-muted pt-4">No comments yet.</div>';
                return;
            }
            snapshot.forEach(cSnap => {
                const data = cSnap.data();
                const timeStr = timeAgo(data.createdAt);
                const isMine = data.authorUid === uid;
                listEl.innerHTML += `
                    <div class="comment-card ${isMine ? 'ms-4 border-start border-primary border-4' : ''}">
                        <div class="d-flex align-items-center mb-1">
                            <img src="https://ui-avatars.com/api/?name=${data.authorEmail}&background=random" class="rounded-circle me-2" width="24" height="24">
                            <span class="fw-bold fs-7 me-auto">${data.authorEmail.split('@')[0]}</span>
                            <small class="text-muted" style="font-size:0.7rem;">${timeStr}</small>
                        </div>
                        <div class="ps-4" style="font-size:0.85rem;">
                            ${data.text.replace(/</g, "&lt;").replace(/>/g, "&gt;")}
                        </div>
                    </div>
                `;
            });
            listEl.scrollTop = listEl.scrollHeight;
        });
    };

    // Right Column Comment Form submit
    document.getElementById('right-comment-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('right-comment-text');
        const text = input.value.trim();
        const postId = document.getElementById('active-comment-post-id').value;
        if (!text || !postId) return;
        
        const btn = e.target.querySelector('button');
        btn.disabled = true;
        try {
            await addDoc(collection(db, 'posts', postId, 'comments'), {
                authorUid: uid,
                authorEmail: currentUserData.email,
                text: text,
                createdAt: serverTimestamp()
            });
            await updateDoc(doc(db, 'posts', postId), { commentCount: increment(1) });
            input.value = '';
        } catch(err) {
            console.error(err);
            alert("Failed to comment");
        } finally {
            btn.disabled = false;
        }
    });

    // 4. Middle Column Feed Logic 
    let currentSort = 'feed'; // feed, bookmarks, posts
    let feedUnsubscribe = null;
    const feedContainer = document.getElementById('feed-container');
    
    document.querySelectorAll('#feedTabs .nav-link').forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('#feedTabs .nav-link').forEach(t => {
                t.classList.remove('active');
                t.classList.add('text-muted');
            });
            tab.classList.add('active');
            tab.classList.remove('text-muted');
            currentSort = tab.dataset.tab;
            loadFeed();
        });
    });

    function loadFeed() {
        if (!feedContainer) return;
        if (feedUnsubscribe) { feedUnsubscribe(); feedUnsubscribe = null; }
        
        const postsRef = collection(db, 'posts');
        let q;
        if (currentSort === 'posts') {
            q = query(postsRef, orderBy('createdAt', 'desc')); // Ideally filter where authorUid == uid
        } else {
            q = query(postsRef, orderBy('createdAt', 'desc'));
        }

        feedUnsubscribe = onSnapshot(q, (snapshot) => {
            feedContainer.innerHTML = '';
            
            // Local client-side filter since complex queries need indexes
            const docs = [];
            snapshot.forEach(d => docs.push({id: d.id, ...d.data()}));
            
            let filteredDocs = docs;
            if (currentSort === 'posts') {
                filteredDocs = docs.filter(d => d.authorUid === uid);
            }
            // bookmarks logic would filter if d.id in currentUserData.myBookmarks
            
            if (filteredDocs.length === 0) {
                feedContainer.innerHTML = '<div class="text-center text-muted p-5">Nothing to see here yet.</div>';
                return;
            }
            
            filteredDocs.forEach(data => {
                feedContainer.innerHTML += renderPostCard(data.id, data);
            });
        }, (err) => {
            console.error("Feed error:", err);
            feedContainer.innerHTML = '<div class="text-danger p-3">Failed to load feed. Check console.</div>';
        });
    }
    
    loadFeed();

    // 5. Create Post Logic
    const composeForm = document.getElementById('compose-form');
    const postText = document.getElementById('post-text');
    let selectedFiles = [];
    
    composeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = postText.value.trim();
        if (!text && selectedFiles.length === 0) return alert("Post cannot be empty.");
        
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

        try {
            const mediaUrls = [];
            // Mocking storage logic for brevity, you'd integrate real storage uploading here
            
            const response = await fetch('/api/forum/post', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: text,
                    media: mediaUrls
                })
            });

            if (!response.ok) throw new Error("Failed to post");
            postText.value = '';
            selectedFiles = [];
            // renderPreview() clear...
        } catch(err) {
            console.error(err);
            alert("Failed to publish post.");
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Post';
        }
    });

    // Logout via sidebar
    document.getElementById('side-logout-btn').addEventListener('click', async (e) => {
        e.preventDefault();
        try {
            await updateDoc(doc(db, 'users', uid), { isOnline: false, lastSeen: serverTimestamp() });
            await fetch('/api/sessionLogout', { method: 'POST' });
            localStorage.removeItem('currentUser');
            window.location.href = '/';
        } catch(err) { console.error(err); }
    });
});

// Utilities and Renderers
function timeAgo(date) {
    if (!date) return 'Just now';
    const seconds = Math.floor((new Date() - date.toDate()) / 1000);
    if(seconds < 60) return "Just now";
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + "y";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + "mo";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + "d";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + "h";
    interval = seconds / 60;
    return Math.floor(interval) + "m";
}

window.toggleLikeMain = async (postId) => {
    // In actual implementation, check if the user already liked it from users DB
    const db = getFirestore();
    const postRef = doc(db, 'posts', postId);
    await updateDoc(postRef, { likeCount: increment(1) });
};

function renderPostCard(postId, data) {
    const timeStr = timeAgo(data.createdAt);
    
    return \`
      <div class="post-card" data-id="\${postId}">
        <div class="d-flex align-items-center mb-3">
          <img src="https://ui-avatars.com/api/?name=\${data.authorEmail}&background=random" class="rounded-circle me-3" width="45" height="45">
          <div>
            <h6 class="mb-0 fw-bold">\${data.authorEmail.split('@')[0]}</h6>
            <small class="text-muted">\${timeStr}</small>
          </div>
        </div>
        <div class="post-body mb-3 fs-6">
          \${data.text.replace(/</g, "&lt;").replace(/>/g, "&gt;")}
        </div>
        <div class="post-actions d-flex gap-4 border-top pt-2 mt-2">
          <button class="d-flex align-items-center gap-2 comment-act" title="Comment" onclick="window.openContextualComment('\${postId}')">
            <i class="bi bi-chat fs-5"></i> <span>\${data.commentCount || 0}</span>
          </button>
          <button class="d-flex align-items-center gap-2 like-act" title="Like" onclick="window.toggleLikeMain('\${postId}')">
            <i class="bi bi-heart fs-5"></i> <span>\${data.likeCount || 0}</span>
          </button>
          <button class="d-flex align-items-center gap-2 bookmark-act ms-auto" title="Bookmark">
            <i class="bi bi-bookmark fs-5"></i>
          </button>
        </div>
      </div>
    \`;
}
