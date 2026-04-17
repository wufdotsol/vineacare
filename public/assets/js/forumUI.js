import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, doc, updateDoc, increment, serverTimestamp, getDoc, setDoc, arrayUnion, arrayRemove, getDocs, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
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
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// Store current loaded user state globally
window.globalCurrentUser = null;
window.db = db; // expose for toggleLikeMain etc
window.isGuest = true;

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
                
                fetch('/api/sessionLogin', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ idToken: await user.getIdToken() })
                });
                
            } catch (err) {
                console.error("Login failed:", err);
            }
        });
    }

    // Reactively handle Auth State Changes
    onAuthStateChanged(auth, async (firebaseUser) => {
        authPromptBlock.classList.add('d-none');
        forumContentBlock.classList.remove('d-none');

        if (firebaseUser) {
            let localUser = JSON.parse(localStorage.getItem('currentUser'));
            if (!localUser || localUser.email !== firebaseUser.email) {
                const docSnap = await getDoc(doc(db, "users", firebaseUser.uid));
                if(docSnap.exists()) {
                    localUser = docSnap.data();
                    localStorage.setItem('currentUser', JSON.stringify(localUser));
                }
            }
            window.globalCurrentUser = { uid: firebaseUser.uid, ...localUser };
            window.isGuest = false;
        } else {
            window.globalCurrentUser = null;
            window.isGuest = true;
        }
        
        initForumUI(window.globalCurrentUser);
    });

    window.addEventListener('navLoginSuccess', (e) => {
        window.globalCurrentUser = { uid: auth.currentUser.uid, ...e.detail };
        window.isGuest = false;
        authPromptBlock.classList.add('d-none');
        forumContentBlock.classList.remove('d-none');
        initForumUI(window.globalCurrentUser);
    });
});


// Initialization function
function initForumUI(currentUserData) {
    const isGuest = window.isGuest;

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
    if (document.getElementById('compose-pfp')) document.getElementById('compose-pfp').src = pfpUrl;

    // Disable posting if guest
    const postInput = document.getElementById('post-text');
    const postSubmit = document.querySelector('#compose-form button[type="submit"]');
    if (isGuest && postInput) {
        postInput.placeholder = "Please log in to post or interact...";
        postSubmit.disabled = true;
    }

    // Right Column View Manager
    const rightProfile = document.getElementById('right-default-profile');
    const rightComment = document.getElementById('right-comment-section');
    
    // Create an ad-hoc dynamic view container if it doesn't exist
    let rightDynamic = document.getElementById('right-dynamic-section');
    if (!rightDynamic) {
        rightDynamic = document.createElement('div');
        rightDynamic.id = 'right-dynamic-section';
        rightDynamic.className = 'right-view-panel d-none bg-white shadow-sm rounded-4 p-3 h-100 flex-column';
        rightDynamic.style.maxHeight = '80vh';
        document.getElementById('right-column-content').appendChild(rightDynamic);
    }

    const setRightView = (viewType) => {
        rightProfile.classList.add('d-none');
        rightComment.classList.add('d-none');
        rightDynamic.classList.add('d-none');
        rightDynamic.classList.remove('d-flex');

        if (viewType === 'profile') rightProfile.classList.remove('d-none');
        if (viewType === 'comment') rightComment.classList.remove('d-none');
        if (viewType === 'dynamic') {
            rightDynamic.classList.remove('d-none');
            rightDynamic.classList.add('d-flex');
        }
    };

    document.getElementById('close-comments-btn').addEventListener('click', () => setRightView('profile'));

    // --- Bookmarks Logic ---
    window.toggleBookmarkMain = async (postId) => {
        if (isGuest) return alert("Log in to bookmark.");
        const userRef = doc(db, 'users', currentUserData.uid);
        let myBookmarks = currentUserData.myBookmarks || [];
        
        if (myBookmarks.includes(postId)) {
            myBookmarks = myBookmarks.filter(id => id !== postId);
            await updateDoc(userRef, { myBookmarks: arrayRemove(postId) });
        } else {
            myBookmarks.push(postId);
            await updateDoc(userRef, { myBookmarks: arrayUnion(postId) });
        }
        currentUserData.myBookmarks = myBookmarks;
        localStorage.setItem('currentUser', JSON.stringify(currentUserData));
        alert(myBookmarks.includes(postId) ? "Bookmarked!" : "Removed from bookmarks.");
        loadFeed(); // Refresh feed if on bookmarks tab
    };

    // --- Left Nav Interactions (Networking) ---
    const attachLeftNav = (id, handler) => {
        const el = document.getElementById(id);
        if(!el) return;
        const newEl = el.cloneNode(true);
        el.parentNode.replaceChild(newEl, el);
        newEl.addEventListener('click', (e) => {
            e.preventDefault();
            if(isGuest) return alert("Please log in.");
            handler();
        });
    };

    const fetchUsers = async (uidArray) => {
        if (!uidArray || uidArray.length === 0) return [];
        const chunks = [];
        for (let i = 0; i < uidArray.length; i += 10) chunks.push(uidArray.slice(i, i + 10));
        let results = [];
        for (const chunk of chunks) {
            const q = query(collection(db, 'users'), where('__name__', 'in', chunk));
            const snap = await getDocs(q);
            snap.forEach(d => results.push({ uid: d.id, ...d.data() }));
        }
        return results;
    };

    // Global Network functions
    window.acceptFriend = async (targetUid) => {
        await updateDoc(doc(db, 'users', currentUserData.uid), { recievedFriendRequests: arrayRemove(targetUid), myFriends: arrayUnion(targetUid) });
        await updateDoc(doc(db, 'users', targetUid), { sentFriendRequests: arrayRemove(currentUserData.uid), myFriends: arrayUnion(currentUserData.uid) });
        syncLocalUserField('recievedFriendRequests', arrayRemove(targetUid), true);
        syncLocalUserField('myFriends', arrayUnion(targetUid), true);
        alert('Friend accepted!');
        setRightView('profile');
    };

    window.rejectFriend = async (targetUid) => {
        await updateDoc(doc(db, 'users', currentUserData.uid), { recievedFriendRequests: arrayRemove(targetUid) });
        await updateDoc(doc(db, 'users', targetUid), { sentFriendRequests: arrayRemove(currentUserData.uid) });
        syncLocalUserField('recievedFriendRequests', arrayRemove(targetUid), true);
        setRightView('profile');
    };

    const renderNetworkList = async (title, uidArray, type) => {
        setRightView('dynamic');
        rightDynamic.innerHTML = `
            <div class="d-flex justify-content-between align-items-center border-bottom pb-2 mb-3">
              <h5 class="fw-bold mb-0 text-dark">${title}</h5>
              <button class="btn btn-sm btn-light rounded-circle" onclick="document.getElementById('close-comments-btn').click()"><i class="bi bi-x-lg"></i></button>
            </div>
            <div id="network-list-content" class="flex-grow-1 overflow-auto pe-2 mt-2 text-center text-muted"><span class="spinner-border spinner-border-sm"></span> Loading...</div>
        `;
        
        const listEl = document.getElementById('network-list-content');
        if(!uidArray || uidArray.length === 0) {
            listEl.innerHTML = '<div class="pt-4">No users found.</div>';
            return;
        }

        const users = await fetchUsers(uidArray);
        listEl.innerHTML = '';
        users.forEach(u => {
            let actions = '';
            if (type === 'received') {
                actions = `
                    <button class="btn btn-sm btn-success rounded-pill" onclick="window.acceptFriend('${u.uid}')"><i class="bi bi-check"></i></button>
                    <button class="btn btn-sm btn-danger rounded-pill" onclick="window.rejectFriend('${u.uid}')"><i class="bi bi-x"></i></button>
                `;
            } else if (type === 'friends') {
                actions = `<button class="btn btn-sm btn-outline-primary rounded-pill" onclick="window.openChat('${u.uid}', '${u.name}')"><i class="bi bi-chat-dots"></i> Message</button>`;
            }
            
            listEl.innerHTML += `
                <div class="d-flex align-items-center mb-3 bg-light p-2 rounded-3 shadow-sm">
                    <img src="${u.profile_pic || 'https://ui-avatars.com/api/?name='+u.name}" class="rounded-circle me-3" width="40" height="40">
                    <div class="me-auto text-start" style="line-height:1.2;">
                        <div class="fw-bold" style="font-size:0.9rem;">${u.name}</div>
                        <div class="text-muted" style="font-size:0.75rem;">@${u.username}</div>
                    </div>
                    <div class="d-flex gap-2">${actions}</div>
                </div>
            `;
        });
    };

    attachLeftNav('left-nav-received', () => renderNetworkList('Received Requests', currentUserData.recievedFriendRequests, 'received'));
    attachLeftNav('left-nav-pending', () => renderNetworkList('Pending Requests', currentUserData.sentFriendRequests, 'pending'));
    attachLeftNav('left-nav-friends', () => renderNetworkList('My Friends', currentUserData.myFriends, 'friends'));

    attachLeftNav('left-nav-messages', () => {
        setRightView('dynamic');
        rightDynamic.innerHTML = `
            <div class="d-flex justify-content-between align-items-center border-bottom pb-2 mb-3">
              <h5 class="fw-bold mb-0 text-dark">Chats</h5>
              <button class="btn btn-sm btn-light rounded-circle" onclick="document.getElementById('close-comments-btn').click()"><i class="bi bi-x-lg"></i></button>
            </div>
            <div id="chats-list-content" class="flex-grow-1 overflow-auto pe-2 mt-2 text-center text-muted"><small>Go to My Friends to start a chat.</small></div>
        `;
    });

    attachLeftNav('left-nav-bookmarks', () => {
        document.querySelector('[data-tab="bookmarks"]').click();
    });

    // --- Chat Logic ---
    let currentChatUnsub = null;
    window.openChat = async (targetUid, targetName) => {
        setRightView('dynamic');
        rightDynamic.innerHTML = `
            <div class="d-flex justify-content-between align-items-center border-bottom pb-2 mb-3">
              <h6 class="fw-bold mb-0 text-dark"><i class="bi bi-chat-text text-primary me-2"></i> ${targetName}</h6>
              <button class="btn btn-sm btn-light rounded-circle" onclick="document.getElementById('close-comments-btn').click()"><i class="bi bi-x-lg"></i></button>
            </div>
            <div id="chat-messages-wall" class="flex-grow-1 overflow-auto pe-2 mb-3 d-flex flex-column" style="scrollbar-width: thin;"></div>
            <form id="chat-form" class="mt-auto border-top pt-3 d-flex">
               <input type="text" class="form-control rounded-pill bg-light border-0 px-3 flex-grow-1" id="chat-input" placeholder="Type a message..." required autocomplete="off">
               <button class="btn btn-primary rounded-circle ms-2 shadow-sm" type="submit" style="width:40px;height:40px;"><i class="bi bi-send-fill text-white"></i></button>
            </form>
        `;

        const chatId = currentUserData.uid < targetUid ? `${currentUserData.uid}_${targetUid}` : `${targetUid}_${currentUserData.uid}`;
        // Ensure chat doc
        await setDoc(doc(db, 'chats', chatId), { lastActive: serverTimestamp() }, { merge: true });

        const wall = document.getElementById('chat-messages-wall');
        if (currentChatUnsub) currentChatUnsub();

        currentChatUnsub = onSnapshot(query(collection(db, 'chats', chatId, 'messages'), orderBy('createdAt', 'asc')), (snapshot) => {
            wall.innerHTML = '';
            snapshot.forEach(m => {
                const data = m.data();
                const isMe = data.senderId === currentUserData.uid;
                wall.innerHTML += `
                    <div class="chat-message ${isMe ? 'sent' : 'received'}">
                        ${data.text}
                    </div>
                `;
            });
            wall.scrollTop = wall.scrollHeight;
        });

        document.getElementById('chat-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const input = document.getElementById('chat-input');
            const text = input.value.trim();
            if (!text) return;
            try {
                await addDoc(collection(db, 'chats', chatId, 'messages'), {
                    senderId: currentUserData.uid,
                    text: text,
                    createdAt: serverTimestamp()
                });
                await updateDoc(doc(db, 'chats', chatId), { lastActive: serverTimestamp() });
                input.value = '';
            } catch(err) { console.error("Chat send failed", err); }
        });
    };

    // --- Sub-Collections: Contextual Comments ---
    let currentCommentsUnsub = null;
    window.openContextualComment = (postId) => {
        setRightView('comment');
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

    const commentForm = document.getElementById('right-comment-form');
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

    // --- Middle Column Feed Logic ---
    let currentSort = 'feed'; 
    let feedUnsubscribe = null;
    const feedContainer = document.getElementById('feed-container');
    
    document.querySelectorAll('#feedTabs .nav-link').forEach(tab => {
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
                filteredDocs = isGuest ? [] : docs.filter(d => d.authorUid === currentUserData.uid);
            } else if (currentSort === 'bookmarks') {
                filteredDocs = isGuest ? [] : docs.filter(d => (currentUserData.myBookmarks || []).includes(d.id));
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
            feedContainer.innerHTML = '<div class="text-danger p-3">Failed to load feed.</div>';
        });
    }
    
    loadFeed();

    // --- Create Post Logic (Text Only) ---
    const composeFormPost = document.getElementById('compose-form');
    if (composeFormPost) {
        const newComposeForm = composeFormPost.cloneNode(true);
        composeFormPost.parentNode.replaceChild(newComposeForm, composeFormPost);

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
                    body: JSON.stringify({ text: text, media: [] }) // Text only per requirement
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
    }

    // Logout via sidebar
    const sideLogOutBtn = document.getElementById('side-logout-btn');
    if (sideLogOutBtn) {
        const newLogOutBtn = sideLogOutBtn.cloneNode(true);
        sideLogOutBtn.parentNode.replaceChild(newLogOutBtn, sideLogOutBtn);
        
        newLogOutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            if (isGuest) {
                const centralBtn = document.getElementById('central-login-btn');
                if (centralBtn) centralBtn.click();
                return;
            }
            try {
                await updateDoc(doc(db, 'users', currentUserData.uid), { isOnline: false, lastSeen: serverTimestamp() });
                await signOut(auth);
                await fetch('/api/sessionLogout', { method: 'POST' });
                localStorage.removeItem('currentUser');
                window.location.href = '/';
            } catch(err) { console.error(err); }
        });
        
        if (isGuest) {
            newLogOutBtn.innerHTML = '<i class="bi bi-box-arrow-in-right me-3 fs-5"></i> Log In';
            newLogOutBtn.classList.remove('text-danger');
            newLogOutBtn.classList.add('text-primary');
        }
    }
}

// Memory-syncer for arrays locally
function syncLocalUserField(field, operation, isLocalSyncOnly=false) {
    if(!window.globalCurrentUser) return;
    // Basic local cache patching for immediate UI feedback; real state is refetched on reload
    // In a production app, use onSnapshot on the User doc.
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
    if (window.isGuest) return alert("Please log in to like this post.");
    const postRef = doc(window.db, 'posts', postId);
    await updateDoc(postRef, { likeCount: increment(1) });
};

function renderPostCard(postId, data, isGuest) {
    const timeStr = timeAgo(data.createdAt);
    const bmClass = (!isGuest && window.globalCurrentUser?.myBookmarks?.includes(postId)) ? "bi-bookmark-fill text-primary" : "bi-bookmark";
    
    return \`
      <div class="post-card" data-id="\${postId}">
        <div class="d-flex align-items-center mb-3">
          <img src="https://ui-avatars.com/api/?name=\${data.authorEmail}&background=random" class="rounded-circle me-3" width="45" height="45">
          <div class="me-auto">
            <h6 class="mb-0 fw-bold">\${data.authorEmail.split('@')[0]}</h6>
            <small class="text-muted">\${timeStr}</small>
          </div>
          <button class="btn btn-sm btn-outline-primary rounded-pill px-3" onclick="if(!window.isGuest) alert('Friend Request sent!');" title="Add Friend">
             <i class="bi bi-person-plus"></i> Connect
          </button>
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
          <button class="d-flex align-items-center gap-2 bookmark-act ms-auto \${!isGuest && window.globalCurrentUser.myBookmarks?.includes(postId) ? 'text-primary' : ''}" title="Bookmark" onclick="window.toggleBookmarkMain('\${postId}')">
            <i class="bi \${bmClass} fs-5"></i>
          </button>
        </div>
      </div>
    \`;
}
