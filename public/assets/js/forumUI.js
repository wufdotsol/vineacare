import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, doc, updateDoc, increment, serverTimestamp, getDoc, setDoc, deleteDoc, arrayUnion, arrayRemove, getDocs, where, limit } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

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

window.globalCurrentUser = null;
window.db = db; 
window.isGuest = true;

window.showToast = (message, isError = false) => {
    const container = document.getElementById('global-toast-container');
    if (!container) return;
    const toastId = 'toast-' + Math.random().toString(36).substr(2, 9);
    const bgClass = isError ? 'bg-danger text-white' : 'bg-success text-white';
    
    container.insertAdjacentHTML('beforeend', `
        <div id="${toastId}" class="toast align-items-center ${bgClass} border-0 show" role="alert" style="transition: opacity 0.3s ease; opacity: 1;">
          <div class="d-flex">
            <div class="toast-body fw-bold">
              <i class="bi ${isError ? 'bi-exclamation-triangle' : 'bi-check-circle'} me-2"></i> ${message}
            </div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" onclick="document.getElementById('${toastId}').remove();"></button>
          </div>
        </div>
    `);
    
    setTimeout(() => {
        const el = document.getElementById(toastId);
        if (el) {
            el.style.opacity = '0';
            setTimeout(() => el.remove(), 300);
        }
    }, 4000);
};

document.addEventListener('DOMContentLoaded', () => {

    const forumContentBlock = document.getElementById('forum-content-block');
    const authPromptBlock = document.getElementById('auth-prompt-block');

    const centralLoginBtn = document.getElementById('central-login-btn');
    if (centralLoginBtn) {
        centralLoginBtn.addEventListener('click', () => {
            const navLink = document.getElementById('auth-nav-link');
            if (navLink) navLink.click();
        });
    }

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
        window.showToast("Successfully logged in!");
    });
});

function initForumUI(currentUserData) {
    const isGuest = window.isGuest;

    const pfpUrl = isGuest ? "https://ui-avatars.com/api/?name=Guest&background=111111&color=fff" : (currentUserData?.profile_pic || `https://ui-avatars.com/api/?name=${(currentUserData?.email || "User").split('@')[0]}&background=random`);
    const dispName = isGuest ? "Guest Viewer" : (currentUserData?.name || currentUserData?.displayName || "User");
    const uName = isGuest ? "guest" : (currentUserData?.username || "user");
    
    document.getElementById('left-pfp').src = pfpUrl;
    document.getElementById('left-name').textContent = dispName;
    document.getElementById('left-username').textContent = `@${uName}`;
    
    document.getElementById('right-pfp').src = pfpUrl;
    document.getElementById('right-name').textContent = dispName;
    document.getElementById('right-username').textContent = `@${uName}`;
    
    if (document.getElementById('compose-pfp')) document.getElementById('compose-pfp').src = pfpUrl;

    const postInput = document.getElementById('post-text');
    const postSubmit = document.querySelector('#compose-form button[type="submit"]');
    if (isGuest && postInput) {
        postInput.placeholder = "Please log in to post...";
        postSubmit.disabled = true;
    } else if (!isGuest && postInput) {
        postInput.placeholder = "What's happening?";
        postSubmit.disabled = false;
    }

    const rightProfile = document.getElementById('right-default-profile');
    const rightComment = document.getElementById('right-comment-section');
    
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

    // --- Search Logic ---
    const setupSearch = (inputId, clearId) => {
        const inp = document.getElementById(inputId);
        const clr = document.getElementById(clearId);
        if(!inp) return;
        
        inp.addEventListener('keyup', async (e) => {
            const text = e.target.value.trim().toLowerCase();
            if (text.length > 0) {
                clr.classList.remove('d-none');
                if (e.key === 'Enter') {
                    if (isGuest) return window.showToast("Log in to search.", true);
                    setRightView('dynamic');
                    rightDynamic.innerHTML = `
                        <div class="d-flex justify-content-between align-items-center border-bottom pb-2 mb-3">
                        <h5 class="fw-bold mb-0 text-dark">Search Results</h5>
                        <button class="btn btn-sm btn-light rounded-circle" onclick="document.getElementById('close-comments-btn').click()"><i class="bi bi-x-lg"></i></button>
                        </div>
                        <div id="search-list-content" class="flex-grow-1 overflow-auto"><span class="spinner-border spinner-border-sm"></span> Locating...</div>
                    `;
                    try {
                        const usersRef = collection(db, 'users');
                        const q1 = query(usersRef, where('username', '>=', text), where('username', '<=', text + '\uf8ff'), limit(20));
                        const snap = await getDocs(q1);
                        const listE = document.getElementById('search-list-content');
                        listE.innerHTML = '';
                        if(snap.empty) {
                            listE.innerHTML = '<div class="text-muted text-center pt-3">No matching profiles found.</div>';
                            return;
                        }
                        snap.forEach(d => {
                            const u = d.data();
                            listE.innerHTML += `
                            <div class="d-flex align-items-center mb-3 bg-light p-2 rounded shadow-sm border" style="cursor:pointer;" onclick="window.viewUserProfile('${d.id}')">
                                <img src="${u.profile_pic || 'https://ui-avatars.com/api/?name='+u.name}" class="rounded-circle me-3" width="40" height="40">
                                <div><div class="fw-bold fs-6">${u.name}</div><div class="text-muted" style="font-size:0.75rem;">@${u.username}</div></div>
                            </div>
                            `;
                        });
                    } catch(err) { console.error(err); }
                }
            } else {
                clr.classList.add('d-none');
            }
        });
        clr.addEventListener('click', () => { inp.value = ''; clr.classList.add('d-none'); setRightView('profile'); });
    };

    setupSearch('left-search-input', 'left-search-clear');
    setupSearch('middle-search-input', 'middle-search-clear');

    // --- Dynamic Ext Profile Engine ---
    window.viewUserProfile = async (targetUid) => {
        if(isGuest) return window.showToast("Must log in.", true);
        if(targetUid === currentUserData.uid) { setRightView('profile'); return; }
        
        setRightView('dynamic');
        rightDynamic.innerHTML = '<div class="text-center p-5"><div class="spinner-border text-primary"></div></div>';
        
        try {
            const docS = await getDoc(doc(db, 'users', targetUid));
            if(!docS.exists()) throw new Error("Missing user");
            const tp = docS.data();
            
            rightDynamic.innerHTML = `
                <div class="d-flex justify-content-between align-items-center border-bottom pb-2 mb-3">
                  <h6 class="fw-bold mb-0 text-dark"><i class="bi bi-person badge bg-primary me-2"></i>Profile</h6>
                  <button class="btn btn-sm btn-light rounded-circle" onclick="document.getElementById('close-comments-btn').click()"><i class="bi bi-x-lg"></i></button>
                </div>
                <div class="text-center mb-3">
                   <img src="${tp.profile_pic || 'https://ui-avatars.com/api/?name='+tp.name}" class="rounded-circle mb-2 border border-3 shadow-sm" width="80" height="80" style="object-fit:cover;">
                   <h5 class="fw-bold mb-0 text-dark">${tp.name}</h5>
                   <p class="text-muted mb-2">@${tp.username}</p>
                   <div class="d-flex justify-content-center gap-2 mt-2">
                       <button class="btn btn-sm btn-primary rounded-pill fw-bold px-3" onclick="window.sendFriendRequest('${targetUid}')">Add Friend</button>
                   </div>
                </div>
                <ul class="nav nav-pills justify-content-center right-side-pills border-bottom pb-2 mb-2" style="gap:5px;">
                   <li class="nav-item"><a class="nav-link active rounded-pill px-3 py-1 fw-bold fs-7">Posts</a></li>
                </ul>
                <div id="ext-profile-posts" class="flex-grow-1 overflow-auto pe-1" style="scrollbar-width: thin;">
                   <div class="text-center text-muted"><span class="spinner-border spinner-border-sm"></span> Loading...</div>
                </div>
            `;
            
            const qP = query(collection(db, 'posts'), where("authorUid", "==", targetUid), orderBy('createdAt', 'desc'), limit(15));
            const pSnap = await getDocs(qP);
            const pCont = document.getElementById('ext-profile-posts');
            pCont.innerHTML = '';
            if(pSnap.empty) { pCont.innerHTML = '<div class="text-muted text-center pt-3 mt-4 border border-dashed rounded p-3">No public posts.</div>'; return; }
            
            pSnap.forEach(d => {
                pCont.innerHTML += renderPostCard(d.id, d.data(), false);
            });
            
        } catch(err) {
            console.error(err);
            window.showToast("Failed to load profile", true);
        }
    };


    window.toggleBookmarkMain = async (postId) => {
        if (isGuest) return window.showToast("Log in to save bookmarks.", true);
        const userRef = doc(db, 'users', currentUserData.uid);
        let myBookmarks = currentUserData.myBookmarks || [];
        if (myBookmarks.includes(postId)) {
            myBookmarks = myBookmarks.filter(id => id !== postId);
            await updateDoc(userRef, { myBookmarks: arrayRemove(postId) });
            window.showToast("Removed from bookmarks.");
        } else {
            myBookmarks.push(postId);
            await updateDoc(userRef, { myBookmarks: arrayUnion(postId) });
            window.showToast("Post bookmarked!");
        }
        currentUserData.myBookmarks = myBookmarks;
        localStorage.setItem('currentUser', JSON.stringify(currentUserData));
        loadFeed(); 
    };

    window.toggleLikeMain = async (postId) => {
        if (isGuest) return window.showToast("Please log in to like this post.", true);
        const uid = currentUserData.uid;
        const likeRef = doc(db, 'posts', postId, 'likes', uid);
        const postRef = doc(db, 'posts', postId);
        const userRef = doc(db, 'users', uid);
        
        try {
            const snap = await getDoc(likeRef);
            if (snap.exists()) {
                window.showToast("You already liked this post!");
            } else {
                await setDoc(likeRef, { likedAt: serverTimestamp() });
                await updateDoc(postRef, { likeCount: increment(1) });
                await updateDoc(userRef, { myLikes: arrayUnion(postId) });
                
                currentUserData.myLikes = currentUserData.myLikes || [];
                currentUserData.myLikes.push(postId);
                localStorage.setItem('currentUser', JSON.stringify(currentUserData));
                
                window.showToast("Liked!");
                loadFeed();
            }
        } catch (err) { window.showToast("Failed to like.", true); }
    };

    window.deletePostMain = async (postId) => {
        if (!confirm("Are you sure you want to permanently delete this post?")) return;
        try {
            await deleteDoc(doc(db, 'posts', postId));
            await updateDoc(doc(db, 'users', currentUserData.uid), { myPosts: arrayRemove(postId) });
            window.showToast("Post annihilated.");
            loadFeed();
        } catch(err) { window.showToast("Failed to delete post.", true); }
    };

    const attachLeftNav = (id, handler) => {
        const el = document.getElementById(id);
        if(!el) return;
        const newEl = el.cloneNode(true);
        el.parentNode.replaceChild(newEl, el);
        newEl.addEventListener('click', (e) => {
            e.preventDefault();
            if(isGuest) return window.showToast("Please log in.", true);
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

    window.sendFriendRequest = async (targetUid) => {
        if (isGuest) return window.showToast("Log in to add friends.", true);
        try {
            await updateDoc(doc(db, 'users', targetUid), { recievedFriendRequests: arrayUnion(globalCurrentUser.uid) });
            await updateDoc(doc(db, 'users', globalCurrentUser.uid), { sentFriendRequests: arrayUnion(targetUid) });
            window.showToast("Friend request sent!");
        } catch (err) { window.showToast("Failed to send request.", true); }
    };

    window.acceptFriend = async (targetUid) => {
        try {
            await updateDoc(doc(db, 'users', currentUserData.uid), { recievedFriendRequests: arrayRemove(targetUid), myFriends: arrayUnion(targetUid) });
            await updateDoc(doc(db, 'users', targetUid), { sentFriendRequests: arrayRemove(currentUserData.uid), myFriends: arrayUnion(currentUserData.uid) });
            window.showToast('Accepted!'); setRightView('profile');
        } catch(err) {}
    };

    window.rejectFriend = async (targetUid) => {
        try {
            await updateDoc(doc(db, 'users', currentUserData.uid), { recievedFriendRequests: arrayRemove(targetUid) });
            await updateDoc(doc(db, 'users', targetUid), { sentFriendRequests: arrayRemove(currentUserData.uid) });
            window.showToast('Dismissed'); setRightView('profile');
        } catch(err) {}
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
            listEl.innerHTML = '<div class="pt-4">Empty tier.</div>';
            return;
        }

        const users = await fetchUsers(uidArray);
        listEl.innerHTML = '';
        users.forEach(u => {
            let actions = '';
            if (type === 'received') {
                actions = `<button class="btn btn-sm btn-success rounded-pill fw-bold" onclick="window.acceptFriend('${u.uid}')"><i class="bi bi-check"></i> Accept</button>
                           <button class="btn btn-sm btn-danger rounded-pill" onclick="window.rejectFriend('${u.uid}')"><i class="bi bi-x"></i></button>`;
            } else if (type === 'friends') {
                actions = `<button class="btn btn-sm btn-outline-primary rounded-pill fw-bold" onclick="window.openChat('${u.uid}', '${u.name}')"><i class="bi bi-chat-dots"></i> Message</button>`;
            } else if (type === 'pending') {
                actions = `<span class="badge bg-warning text-dark">Pending</span>`;
            }
            
            listEl.innerHTML += `
                <div class="d-flex align-items-center mb-3 bg-light p-2 rounded-3 shadow-sm border border-1" style="cursor:pointer;" onclick="window.viewUserProfile('${u.uid}')">
                    <img src="${u.profile_pic || 'https://ui-avatars.com/api/?name='+u.name}" class="rounded-circle me-3 border shadow-sm" width="40" height="40">
                    <div class="me-auto text-start" style="line-height:1.2;">
                        <div class="fw-bold" style="font-size:0.9rem;">${u.name}</div>
                        <div class="text-muted" style="font-size:0.75rem;">@${u.username}</div>
                    </div>
                    <div class="d-flex gap-2" onclick="event.stopPropagation()">${actions}</div>
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
              <h5 class="fw-bold mb-0 text-dark">Recent Chats</h5>
              <button class="btn btn-sm btn-light rounded-circle" onclick="document.getElementById('close-comments-btn').click()"><i class="bi bi-x-lg"></i></button>
            </div>
            <div class="flex-grow-1 overflow-auto pe-2 mt-2 text-center text-muted"><small>Go to My Friends and click 'Message' to start threading live.</small></div>
        `;
    });

    attachLeftNav('left-nav-bookmarks', () => { document.querySelector('[data-tab="bookmarks"]')?.click(); });

    // --- Chat Logic ---
    window.likeMessage = async (chatId, msgId) => {
        try {
            await updateDoc(doc(db, 'chats', chatId, 'messages', msgId), { likes: arrayUnion(currentUserData.uid) });
            window.showToast("Liked message!");
        } catch(e) { console.error(e); }
    };

    let currentChatUnsub = null;
    window.openChat = async (targetUid, targetName) => {
        setRightView('dynamic');
        const chatId = currentUserData.uid < targetUid ? `${currentUserData.uid}_${targetUid}` : `${targetUid}_${currentUserData.uid}`;
        
        rightDynamic.innerHTML = `
            <div class="d-flex justify-content-between align-items-center border-bottom pb-2 mb-3">
              <h6 class="fw-bold mb-0 text-dark" style="cursor:pointer;" onclick="window.viewUserProfile('${targetUid}')"><i class="bi bi-chat-text text-primary me-2"></i> ${targetName}</h6>
              <button class="btn btn-sm btn-light rounded-circle" onclick="document.getElementById('close-comments-btn').click()"><i class="bi bi-x-lg"></i></button>
            </div>
            <div id="chat-messages-wall" class="flex-grow-1 overflow-auto pe-2 mb-3 d-flex flex-column" style="scrollbar-width: thin;">
               <div class="text-center text-muted py-4"><span class="spinner-border spinner-border-sm"></span> Syncing channel...</div>
            </div>
            <form id="chat-form" class="mt-auto border-top pt-3 d-flex shadow-sm p-2 rounded bg-light">
               <input type="text" class="form-control rounded-pill bg-white border-0 px-3 flex-grow-1 shadow-none" id="chat-input" placeholder="Type a message..." required autocomplete="off">
               <button class="btn btn-primary rounded-circle shadow-sm ms-2" type="submit" style="width:38px;height:38px;"><i class="bi bi-send-fill text-white"></i></button>
            </form>
        `;

        await setDoc(doc(db, 'chats', chatId), { user1Id: currentUserData.uid, user2Id: targetUid, lastActive: serverTimestamp() }, { merge: true });
        await updateDoc(doc(db, 'users', currentUserData.uid), { myChats: arrayUnion(chatId) });
        await updateDoc(doc(db, 'users', targetUid), { myChats: arrayUnion(chatId) });

        const wall = document.getElementById('chat-messages-wall');
        if (currentChatUnsub) currentChatUnsub();

        currentChatUnsub = onSnapshot(query(collection(db, 'chats', chatId, 'messages'), orderBy('createdAt', 'asc')), (snapshot) => {
            wall.innerHTML = '';
            snapshot.forEach(m => {
                const data = m.data();
                const isMe = data.senderId === currentUserData.uid;
                const alignment = isMe ? 'ms-auto' : 'me-auto';
                const bgColor = isMe ? '#34e3f6ff' : '#7bf79aff';
                const heart = (data.likes && data.likes.length > 0) ? `<i class="bi bi-heart-fill text-danger float-end ms-2" style="font-size:0.75rem;"></i>` : '';
                
                wall.innerHTML += `
                    <div class="${alignment} mb-2 p-2 rounded-3 shadow-sm" style="max-width: 80%; background-color: ${bgColor}; color: #111; user-select:none; cursor:pointer;" title="Double tap to like" ondblclick="window.likeMessage('${chatId}', '${m.id}')">
                        ${data.text} ${heart}
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
                input.value = '';
                await addDoc(collection(db, 'chats', chatId, 'messages'), {
                    senderId: currentUserData.uid,
                    text: text,
                    likes: [],
                    createdAt: serverTimestamp()
                });
                await updateDoc(doc(db, 'chats', chatId), { lastActive: serverTimestamp() });
            } catch(err) { window.showToast("Delivery failed.", true); }
        });
    };

    // --- Comments Logic ---
    let currentCommentsUnsub = null;
    window.openContextualComment = (postId) => {
        setRightView('comment');
        document.getElementById('active-comment-post-id').value = postId;
        const listEl = document.getElementById('comments-list');
        listEl.innerHTML = '<div class="text-center text-muted py-4"><span class="spinner-border spinner-border-sm"></span> Loading...</div>';
        
        if (currentCommentsUnsub) currentCommentsUnsub();
        currentCommentsUnsub = onSnapshot(query(collection(db, 'posts', postId, 'comments'), orderBy('createdAt', 'asc')), (snapshot) => {
            listEl.innerHTML = '';
            if (snapshot.empty) { listEl.innerHTML = '<div class="text-center text-muted pt-4">No comments.</div>'; return; }
            snapshot.forEach(cSnap => {
                const data = cSnap.data();
                const isMine = currentUserData && data.authorUid === currentUserData.uid;
                listEl.innerHTML += `
                    <div class="comment-card ${isMine ? 'ms-4 border-start border-primary border-4 shadow-sm' : ''} mb-3 p-2 bg-light rounded">
                        <div class="d-flex align-items-center mb-1 cursor-pointer" onclick="window.viewUserProfile('${data.authorUid}')">
                            <span class="fw-bold fs-7 me-auto">${data.authorEmail.split('@')[0]}</span>
                            <small class="text-muted" style="font-size:0.7rem;">${timeAgo(data.createdAt)}</small>
                        </div>
                        <div class="ps-2" style="font-size:0.85rem;">${data.text.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
                    </div>
                `;
            });
            listEl.scrollTop = listEl.scrollHeight;
        });
    };

    const commentForm = document.getElementById('right-comment-form');
    if (commentForm) {
        const newCommentForm = commentForm.cloneNode(true);
        commentForm.parentNode.replaceChild(newCommentForm, commentForm);
        newCommentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (isGuest) return window.showToast("Must log in.", true);
            const input = document.getElementById('right-comment-text');
            const text = input.value.trim();
            const postId = document.getElementById('active-comment-post-id').value;
            if (!text || !postId) return;
            const btn = e.target.querySelector('button');
            btn.disabled = true;
            try {
                const cDoc = await addDoc(collection(db, 'posts', postId, 'comments'), {
                    authorUid: currentUserData.uid,
                    authorEmail: currentUserData.email,
                    text: text,
                    createdAt: serverTimestamp()
                });
                await updateDoc(doc(db, 'posts', postId), { commentCount: increment(1), comments: arrayUnion(cDoc.id) });
                await updateDoc(doc(db, 'users', currentUserData.uid), { myComments: arrayUnion(cDoc.id) });
                input.value = '';
                window.showToast("Comment inserted!");
            } catch(err) { window.showToast("Failed to comment.", true); } 
            finally { btn.disabled = false; }
        });
    }

    // --- Middle Column Feed Logic ---
    let currentSort = 'feed'; 
    let feedUnsubscribe = null;
    const feedContainer = document.getElementById('feed-container');
    
    document.querySelectorAll('#feedTabs .nav-link').forEach(tab => {
        const newTab = tab.cloneNode(true);
        tab.parentNode.replaceChild(newTab, tab);
        newTab.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('#feedTabs .nav-link').forEach(t => { t.classList.remove('active'); t.classList.add('text-muted'); });
            newTab.classList.add('active'); newTab.classList.remove('text-muted');
            currentSort = newTab.dataset.tab; loadFeed();
        });
    });

    function loadFeed() {
        if (!feedContainer) return;
        if (feedUnsubscribe) { feedUnsubscribe(); feedUnsubscribe = null; }
        const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(50));
        feedUnsubscribe = onSnapshot(q, (snapshot) => {
            feedContainer.innerHTML = '';
            const docs = [];
            snapshot.forEach(d => docs.push({id: d.id, ...d.data()}));
            let filteredDocs = docs;
            if (currentSort === 'posts') filteredDocs = isGuest ? [] : docs.filter(d => d.authorUid === currentUserData.uid);
            else if (currentSort === 'bookmarks') filteredDocs = isGuest ? [] : docs.filter(d => (currentUserData.myBookmarks || []).includes(d.id));
            
            if (filteredDocs.length === 0) {
                feedContainer.innerHTML = '<div class="text-center text-muted p-5 mt-4 border rounded border-dashed bg-white shadow-sm">No items.</div>';
                return;
            }
            filteredDocs.forEach(data => { feedContainer.innerHTML += renderPostCard(data.id, data, isGuest); });
        }, (err) => { feedContainer.innerHTML = '<div class="text-danger p-3">Failed strictly.</div>'; });
    }
    loadFeed();

    const composeFormPost = document.getElementById('compose-form');
    if (composeFormPost) {
        const newComposeForm = composeFormPost.cloneNode(true);
        composeFormPost.parentNode.replaceChild(newComposeForm, composeFormPost);
        newComposeForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (isGuest) return window.showToast("Please log in to post.", true);
            const pt = document.getElementById('post-text');
            const text = pt.value.trim();
            if (!text) return window.showToast("Post is empty.", true);
            const submitBtn = e.target.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            try {
                const res = await fetch('/api/forum/post', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: text, media: [] }) });
                const d = await res.json();
                await updateDoc(doc(db, 'users', currentUserData.uid), { myPosts: arrayUnion(d.id) });
                pt.value = ''; window.showToast("Posted to feed!");
            } catch(err) { window.showToast("Failed to publish post.", true); } 
            finally { submitBtn.disabled = false; }
        });
    }

    const sideLogOutBtn = document.getElementById('side-logout-btn');
    if (sideLogOutBtn) {
        const newLogOutBtn = sideLogOutBtn.cloneNode(false);
        sideLogOutBtn.parentNode.replaceChild(newLogOutBtn, sideLogOutBtn);
        
        if (isGuest) {
            newLogOutBtn.innerHTML = '<i class="bi bi-google me-3 fs-5"></i> Sign In';
            newLogOutBtn.classList.remove('text-danger', 'justify-content-between');
            newLogOutBtn.classList.add('text-primary');
            newLogOutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                document.getElementById('auth-nav-link')?.click();
            });
        } else {
            const logoutPfp = currentUserData?.profile_pic || `https://ui-avatars.com/api/?name=${(currentUserData?.email || "User").split('@')[0]}&background=random`;
            newLogOutBtn.classList.remove('text-primary');
            newLogOutBtn.classList.add('text-danger', 'justify-content-between');
            newLogOutBtn.innerHTML = `
                <div class="d-flex align-items-center" id="side-pfp-btn" style="cursor:pointer;" title="View Profile">
                    <img src="${logoutPfp}" class="rounded-circle border border-primary border-2" width="30" height="30" style="object-fit:cover;">
                </div>
                <div class="d-flex align-items-center" id="side-logout-action-btn" style="cursor:pointer; color: inherit;">
                    <i class="bi bi-box-arrow-right me-2 fs-5"></i> Logout
                </div>
            `;
            
            setTimeout(() => {
                const pfpBtn = document.getElementById('side-pfp-btn');
                const logoutAction = document.getElementById('side-logout-action-btn');
                
                if (pfpBtn) pfpBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    window.viewUserProfile(window.globalCurrentUser.uid);
                });
                
                if (logoutAction) logoutAction.addEventListener('click', async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    try {
                        await updateDoc(doc(db, 'users', currentUserData.uid), { isOnline: false, lastSeen: serverTimestamp() });
                        await signOut(auth);
                        await fetch('/api/sessionLogout', { method: 'POST' });
                        localStorage.removeItem('currentUser');
                        window.location.href = '/';
                    } catch(err) { window.showToast("Failure.", true); }
                });
            }, 0);
        }
    }
}

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

function renderPostCard(postId, data, isGuest) {
    const timeStr = timeAgo(data.createdAt);
    let myLikes = [];
    if(!isGuest && window.globalCurrentUser?.myLikes) myLikes = window.globalCurrentUser.myLikes;
    const isLiked = myLikes.includes(postId);

    return \`
      <div class="post-card" data-id="\${postId}">
        <div class="d-flex align-items-center mb-3">
          <img src="https://ui-avatars.com/api/?name=\${(data.authorEmail || "u").split('@')[0]}&background=random" class="rounded-circle me-3 border shadow-sm" width="45" height="45" style="cursor:pointer;" onclick="window.viewUserProfile('\${data.authorUid}')">
          <div class="me-auto" style="cursor:pointer;" onclick="window.viewUserProfile('\${data.authorUid}')">
            <h6 class="mb-0 fw-bold">\${(data.authorEmail || "user").split('@')[0]}</h6>
            <small class="text-muted">\${timeStr}</small>
          </div>
          \${!isGuest && data.authorUid !== window.globalCurrentUser?.uid ? \`
            <button class="btn btn-sm btn-outline-primary rounded-pill px-3 fw-bold" onclick="window.sendFriendRequest('\${data.authorUid}')" title="Add Friend">
               <i class="bi bi-person-plus"></i> Connect
            </button>
          \` : ''}
          \${!isGuest && data.authorUid === window.globalCurrentUser?.uid ? \`
            <button class="btn btn-sm btn-outline-danger rounded-pill px-2 py-0 fw-bold ms-2 border-0" onclick="window.deletePostMain('\${postId}')" title="Delete">
               <i class="bi bi-trash fs-5"></i>
            </button>
          \` : ''}
        </div>
        <div class="post-body mb-3 fs-6">\${data.text.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
        <div class="post-actions d-flex gap-4 border-top pt-2 mt-2">
          <button class="d-flex align-items-center gap-2 comment-act" title="Comment" onclick="window.openContextualComment('\${postId}')">
            <i class="bi bi-chat fs-5"></i> <span>\${data.commentCount || 0}</span>
          </button>
          <button class="d-flex align-items-center gap-2 like-act \${isLiked ? 'text-danger' : ''}" title="Like" onclick="window.toggleLikeMain('\${postId}')">
            <i class="bi \${isLiked ? 'bi-heart-fill' : 'bi-heart'} fs-5"></i> <span>\${data.likeCount || 0}</span>
          </button>
          <button class="d-flex align-items-center gap-2 bookmark-act ms-auto \${!isGuest && window.globalCurrentUser?.myBookmarks?.includes(postId) ? 'text-primary' : ''}" title="Bookmark" onclick="window.toggleBookmarkMain('\${postId}')">
            <i class="bi \${(!isGuest && window.globalCurrentUser?.myBookmarks?.includes(postId)) ? 'bi-bookmark-fill' : 'bi-bookmark'} fs-5"></i>
          </button>
        </div>
      </div>
    \`;
}
