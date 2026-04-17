import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, doc, updateDoc, increment, serverTimestamp, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";
import { getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

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
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// Store current loaded user state globally
let globalCurrentUser = null;

document.addEventListener('DOMContentLoaded', () => {

    const forumContentBlock = document.getElementById('forum-content-block');
    const authPromptBlock = document.getElementById('auth-prompt-block');

    // Setup Login Button Action
    const centralLoginBtn = document.getElementById('central-login-btn');
    if (centralLoginBtn) {
        centralLoginBtn.addEventListener('click', async () => {
            try {
                const result = await signInWithPopup(auth, provider);
                const user = result.user;
                const userRef = doc(db, "users", user.uid);
                const userSnap = await getDoc(userRef);
                
                let userObj;
                if (userSnap.exists()) {
                    userObj = userSnap.data();
                    await updateDoc(userRef, { isOnline: true });
                } else {
                    let email = user.email || "";
                    let username = email ? email.split('@')[0] : "unknown";
                    userObj = {
                        name: user.displayName || "User",
                        email: email,
                        username: username,
                        profile_pic: user.photoURL || "",
                        sentFriendRequests: [], recievedFriendRequests: [], myFriends: [],
                        myPosts: [], myChats: [], myGroups: [], myEvents: [], myJobs: [],
                        myApplications: [], myBookmarks: [], myFeeds: [],
                        lastSeen: null, isOnline: true, isVerified: false
                    };
                    await setDoc(userRef, userObj);
                }
                
                localStorage.setItem('currentUser', JSON.stringify(userObj));
                
                // Keep backend in sync
                const idToken = await user.getIdToken();
                fetch('/api/sessionLogin', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ idToken })
                });
                
            } catch (err) {
                console.error("Login failed:", err);
                alert("Login failed, see console.");
            }
        });
    }

    // Reactively handle Auth State Changes
    onAuthStateChanged(auth, async (firebaseUser) => {
        if (firebaseUser) {
            // Logged IN
            authPromptBlock.classList.add('d-none');
            forumContentBlock.classList.remove('d-none');
            
            let localUser = JSON.parse(localStorage.getItem('currentUser'));
            if (!localUser || localUser.email !== firebaseUser.email) {
                const docSnap = await getDoc(doc(db, "users", firebaseUser.uid));
                if(docSnap.exists()) {
                    localUser = docSnap.data();
                    localStorage.setItem('currentUser', JSON.stringify(localUser));
                }
            }
            
            globalCurrentUser = { uid: firebaseUser.uid, ...localUser };
            initForumUI(globalCurrentUser);

        } else {
            // Logged OUT (or fallback for viewing page)
            // Even if logged out, the prompt said "remove the auth check so that I can view the forum page for now"
            // So we show the forum anyway, but with mock "Guest" data.
            // In a real app we might show authPromptBlock and hide forumContentBlock.
            authPromptBlock.classList.add('d-none');
            forumContentBlock.classList.remove('d-none');
            
            globalCurrentUser = null;
            initForumUI(null); // Boot in read-only guest mode
        }
    });
});


// Initialization function separated to handle state injection cleanly
function initForumUI(currentUserData) {
    const isGuest = !currentUserData;

    // 1. Map user data
    const pfpUrl = isGuest ? "https://ui-avatars.com/api/?name=Guest&background=111111&color=fff" : (currentUserData.profile_pic || `https://ui-avatars.com/api/?name=${currentUserData.email}&background=random`);
    const dispName = isGuest ? "Guest Viewer" : (currentUserData.name || currentUserData.displayName || "User");
    const uName = isGuest ? "guest" : currentUserData.username;
    
    // Left
    document.getElementById('left-pfp').src = pfpUrl;
    document.getElementById('left-name').textContent = dispName;
    document.getElementById('left-username').textContent = `@${uName}`;
    
    // Right (Default)
    document.getElementById('right-pfp').src = pfpUrl;
    document.getElementById('right-name').textContent = dispName;
    document.getElementById('right-username').textContent = `@${uName}`;
    
    // Compose Form
    document.getElementById('compose-pfp').src = pfpUrl;
    document.getElementById('compose-pfp').style.display = 'block';

    // Disable posting if guest
    const postInput = document.getElementById('post-text');
    const postSubmit = document.querySelector('#compose-form button[type="submit"]');
    if (isGuest) {
        postInput.placeholder = "Please log in to post or interact...";
        postSubmit.disabled = true;
    }

    // 2. Right Column State Management
    const rightProfile = document.getElementById('right-default-profile');
    const rightComment = document.getElementById('right-comment-section');
    let currentCommentsUnsub = null;

    document.getElementById('close-comments-btn').addEventListener('click', () => {
        rightComment.classList.add('d-none');
        rightProfile.classList.remove('d-none');
        if(currentCommentsUnsub) { currentCommentsUnsub(); currentCommentsUnsub = null; }
    });

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
                const isMine = currentUserData && data.authorUid === currentUserData.uid;
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
    const commentForm = document.getElementById('right-comment-form');
    // Clear old listener if re-initing
    const newCommentForm = commentForm.cloneNode(true);
    commentForm.parentNode.replaceChild(newCommentForm, commentForm);
    
    newCommentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (isGuest) return alert("Must log in to comment.");
        
        const input = document.getElementById('right-comment-text');
        const text = input.value.trim();
        const postId = document.getElementById('active-comment-post-id').value;
        if (!text || !postId) return;
        
        const btn = e.target.querySelector('button');
        btn.disabled = true;
        try {
            await addDoc(collection(db, 'posts', postId, 'comments'), {
                authorUid: currentUserData.uid,
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

    // 3. Middle Column Feed Logic 
    let currentSort = 'feed'; 
    let feedUnsubscribe = null;
    const feedContainer = document.getElementById('feed-container');
    
    document.querySelectorAll('#feedTabs .nav-link').forEach(tab => {
        // use isolated event delegation to avoid duplicated listeners on re-init
        const newTab = tab.cloneNode(true);
        tab.parentNode.replaceChild(newTab, tab);
        
        newTab.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('#feedTabs .nav-link').forEach(t => {
                t.classList.remove('active');
                t.classList.add('text-muted');
            });
            newTab.classList.add('active');
            newTab.classList.remove('text-muted');
            currentSort = newTab.dataset.tab;
            loadFeed();
        });
    });

    function loadFeed() {
        if (!feedContainer) return;
        if (feedUnsubscribe) { feedUnsubscribe(); feedUnsubscribe = null; }
        
        const postsRef = collection(db, 'posts');
        let q = query(postsRef, orderBy('createdAt', 'desc'));

        feedUnsubscribe = onSnapshot(q, (snapshot) => {
            feedContainer.innerHTML = '';
            
            const docs = [];
            snapshot.forEach(d => docs.push({id: d.id, ...d.data()}));
            
            let filteredDocs = docs;
            if (currentSort === 'posts') {
                if (isGuest) {
                    filteredDocs = [];
                } else {
                    filteredDocs = docs.filter(d => d.authorUid === currentUserData.uid);
                }
            }
            
            if (filteredDocs.length === 0) {
                feedContainer.innerHTML = '<div class="text-center text-muted p-5">Nothing to see here yet.</div>';
                return;
            }
            
            filteredDocs.forEach(data => {
                feedContainer.innerHTML += renderPostCard(data.id, data, isGuest);
            });
        }, (err) => {
            console.error("Feed error:", err);
            feedContainer.innerHTML = '<div class="text-danger p-3">Failed to load feed. Check console.</div>';
        });
    }
    
    loadFeed();

    // 4. Create Post Logic
    const composeForm = document.getElementById('compose-form');
    const newComposeForm = composeForm.cloneNode(true);
    composeForm.parentNode.replaceChild(newComposeForm, composeForm);

    newComposeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (isGuest) return alert("Please log in to post.");
        
        const pt = document.getElementById('post-text');
        const text = pt.value.trim();
        if (!text) return alert("Post cannot be empty.");
        
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

        try {
            await fetch('/api/forum/post', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: text,
                    media: []
                })
            });
            pt.value = '';
        } catch(err) {
            console.error(err);
            alert("Failed to publish post.");
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Post';
        }
    });

    // Logout via sidebar
    const sideLogOutBtn = document.getElementById('side-logout-btn');
    if (sideLogOutBtn) {
        const newLogOutBtn = sideLogOutBtn.cloneNode(true);
        sideLogOutBtn.parentNode.replaceChild(newLogOutBtn, sideLogOutBtn);
        
        newLogOutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            if (isGuest) {
                // If they click logout but are just a guest, trigger login instead or alert
                const centralBtn = document.getElementById('central-login-btn');
                if (centralBtn) centralBtn.click();
                return;
            }
            try {
                await updateDoc(doc(db, 'users', currentUserData.uid), { isOnline: false, lastSeen: serverTimestamp() });
                await signOut(auth);
                await fetch('/api/sessionLogout', { method: 'POST' });
                localStorage.removeItem('currentUser');
                window.location.reload();
            } catch(err) { console.error(err); }
        });
        
        if (isGuest) {
            newLogOutBtn.innerHTML = '<i class="bi bi-box-arrow-in-right me-3 fs-5"></i> Log In';
            newLogOutBtn.classList.remove('text-danger');
            newLogOutBtn.classList.add('text-primary');
        }
    }
}

// Utilities
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
    if (!globalCurrentUser) {
        return alert("Please log in to like this post.");
    }
    const postRef = doc(db, 'posts', postId);
    await updateDoc(postRef, { likeCount: increment(1) });
};

function renderPostCard(postId, data, isGuest) {
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
