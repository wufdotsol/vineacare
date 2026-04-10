import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, getDoc, doc, updateDoc, increment, serverTimestamp, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// Use emulator if local
import { connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { connectStorageEmulator } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";
import { connectAuthEmulator } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCGYnRZEfbpNkcfEte5t7qs6IytAXx_xDw",
  authDomain: "vineacare-test.firebaseapp.com",
  projectId: "vineacare-test",
  storageBucket: "vineacare-test.firebasestorage.app",
  messagingSenderId: "536960966057",
  appId: "1:536960966057:web:aa9cd5f3d3c713aba5b8b8",
  measurementId: "G-XMS1JNEWPS"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);

if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
  connectStorageEmulator(storage, '127.0.0.1', 9199);
}

let currentUser = null;
onAuthStateChanged(auth, user => {
  currentUser = user;
});

// App State
let selectedFiles = [];
let maxFiles = 4;
let currentSort = 'time';

// Elements
const postText = document.getElementById('post-text');
const charCount = document.getElementById('char-count');
const uploadImg = document.getElementById('upload-image');
const uploadVid = document.getElementById('upload-video');
const uploadAud = document.getElementById('upload-audio');
const previewContainer = document.getElementById('media-preview-container');
const composeForm = document.getElementById('compose-form');
const feedContainer = document.getElementById('feed-container');

// Only run feed logic if elements exist (e.g. not logged out)
if (composeForm) {
  postText.addEventListener('input', () => {
    const len = postText.value.length;
    charCount.textContent = `${len} / 350`;
    if (len >= 350) charCount.classList.add('text-danger');
    else charCount.classList.remove('text-danger');
  });

  const getMediaDuration = (file) => new Promise(resolve => {
    const el = document.createElement(file.type.startsWith('video') ? 'video' : 'audio');
    el.preload = 'metadata';
    el.onloadedmetadata = () => resolve(el.duration);
    el.src = URL.createObjectURL(file);
  });

  const handleFiles = async (files) => {
    for (let i = 0; i < files.length; i++) {
      if (selectedFiles.length >= maxFiles) {
        alert("Maximum 4 media files allowed.");
        break;
      }
      
      const file = files[i];
      // Constraints logic
      if (file.type.startsWith('image/') && file.size > 10 * 1024 * 1024) {
        alert(`Image ${file.name} exceeds 10MB limit.`);
        continue;
      }
      if (file.type.startsWith('video/')) {
        const dur = await getMediaDuration(file);
        if (dur > 120) {
          alert(`Video ${file.name} exceeds 2 minute limit.`);
          continue;
        }
      }
      if (file.type.startsWith('audio/')) {
        const dur = await getMediaDuration(file);
        if (dur > 180) {
          alert(`Audio ${file.name} exceeds 3 minute limit.`);
          continue;
        }
      }
      
      selectedFiles.push(file);
    }
    renderPreview();
  };

  [uploadImg, uploadVid, uploadAud].forEach(input => {
    input.addEventListener('change', (e) => {
      handleFiles(e.target.files);
      input.value = ''; // reset
    });
  });

  const renderPreview = () => {
    previewContainer.innerHTML = '';
    selectedFiles.forEach((file, index) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'preview-item shadow-sm';
      
      const rmBtn = document.createElement('button');
      rmBtn.className = 'remove-media-btn';
      rmBtn.innerHTML = '<i class="bi bi-x"></i>';
      rmBtn.onclick = (e) => {
        e.preventDefault();
        selectedFiles.splice(index, 1);
        renderPreview();
      };
      
      const url = URL.createObjectURL(file);
      let mediaEl;
      if (file.type.startsWith('image/')) {
        mediaEl = document.createElement('img');
        mediaEl.src = url;
      } else if (file.type.startsWith('video/')) {
        mediaEl = document.createElement('video');
        mediaEl.src = url;
        mediaEl.controls = true;
      } else if (file.type.startsWith('audio/')) {
        mediaEl = document.createElement('audio');
        mediaEl.src = url;
        mediaEl.controls = true;
      }
      
      wrapper.appendChild(rmBtn);
      wrapper.appendChild(mediaEl);
      previewContainer.appendChild(wrapper);
    });
  };

  composeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Getting user UID safely. If auth is slow, fallback to a data-attribute if available.
    if (!currentUser) {
      if (document.getElementById('logged-in-user-data')) {
        currentUser = { uid: document.getElementById('logged-in-user-data').dataset.uid, email: 'Anonymous' };
      } else {
        return alert("Must be logged in to post. Please refresh or login again.");
      }
    }
    
    const text = postText.value.trim();
    if (!text && selectedFiles.length === 0) return alert("Post cannot be empty.");
    if (text.length > 350) return alert("Text exceeds 350 characters.");

    const submitBtn = document.getElementById('submit-post-btn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Publishing...';

    try {
      const mediaUrls = [];
      for (const file of selectedFiles) {
        const ext = file.name.split('.').pop();
        const fileRef = ref(storage, `forum/${Date.now()}_${Math.random().toString(36).substr(2, 5)}.${ext}`);
        await uploadBytes(fileRef, file);
        const downloadUrl = await getDownloadURL(fileRef);
        mediaUrls.push({ type: file.type, url: downloadUrl });
      }

      const response = await fetch('/api/forum/post', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: text,
          media: mediaUrls
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit post to server');
      }

      const result = await response.json();
      console.log("Post created with UID:", result.id);
      
      // Optional: Inform user of the UID
      alert(`Post published successfully! (ID: ${result.id})`);

      // Reset form
      postText.value = '';
      charCount.textContent = '0 / 350';
      selectedFiles = [];
      renderPreview();
    } catch (err) {
      console.error(err);
      alert("Failed to publish post.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Post';
    }
  });

  // Filter Tabs
  document.querySelectorAll('#feed-filter-tabs .nav-link').forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelectorAll('#feed-filter-tabs .nav-link').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentSort = tab.dataset.sort;
      loadFeed();
    });
  });
}

function timeAgo(date) {
  if (!date) return 'Just now';
  const seconds = Math.floor((new Date() - date.toDate()) / 1000);
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + "y";
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + "mo";
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + "d";
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + "h";
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + "m";
  return Math.max(0, Math.floor(seconds)) + "s";
}

function generateMediaGridHtml(mediaArray) {
  if (!mediaArray || mediaArray.length === 0) return '';
  const countClass = `media-${Math.min(mediaArray.length, 4)}`;
  let html = `<div class="post-media-grid ${countClass}">`;
  mediaArray.slice(0, 4).forEach(item => {
    html += `<div class="media-cell">`;
    if (item.type.startsWith('image/')) {
      html += `<img src="${item.url}" alt="Post Image">`;
    } else if (item.type.startsWith('video/')) {
      html += `<video src="${item.url}" controls></video>`;
    } else if (item.type.startsWith('audio/')) {
      html += `<div style="height:100%; display:flex; align-items:center; background:#f1f1f1;">
                 <audio src="${item.url}" controls style="width:100%"></audio>
               </div>`;
    }
    html += `</div>`;
  });
  html += `</div>`;
  return html;
}

function renderPostCard(postId, data, inDetailView = false) {
  const isLikedClass = ''; // Mock logic - in a real app, track user likes locally
  const timeStr = timeAgo(data.createdAt);
  
  return `
    <div class="post-card ${inDetailView ? 'detail-view' : ''}" data-id="${postId}">
      <div class="post-header">
        <div class="post-author" onclick="window.location.href='/forum/post/${postId}'" style="cursor:pointer">
          <img src="https://ui-avatars.com/api/?name=${data.authorEmail}&background=random" class="avatar" alt="Avatar">
          <span>${data.authorEmail.split('@')[0]}</span>
        </div>
        <div class="post-time">${timeStr}</div>
      </div>
      <div class="post-body" onclick="window.location.href='/forum/post/${postId}'" style="cursor:pointer">
        ${data.text.replace(/</g, "&lt;").replace(/>/g, "&gt;")}
      </div>
      ${generateMediaGridHtml(data.media)}
      <div class="post-actions">
        <div class="action-btn comment-act" onclick="openCommentModal('${postId}')">
          <i class="bi bi-chat"></i> <span>${data.commentCount || 0}</span>
        </div>
        <div class="action-btn repost-act" onclick="toggleRepost('${postId}')">
          <i class="bi bi-arrow-repeat"></i> <span>${data.repostCount || 0}</span>
        </div>
        <div class="action-btn like-act" onclick="toggleLike('${postId}')">
          <i class="bi bi-heart"></i> <span>${data.likeCount || 0}</span>
        </div>
      </div>
    </div>
  `;
}

// Global actions for onclick
window.openCommentModal = (postId) => {
  const modal = new bootstrap.Modal(document.getElementById('commentModal'));
  document.getElementById('comment-post-id').value = postId;
  modal.show();
};

window.toggleLike = async (postId) => {
  if(!currentUser) return alert("Please log in");
  const postRef = doc(db, 'posts', postId);
  await updateDoc(postRef, { likeCount: increment(1) });
};

window.toggleRepost = async (postId) => {
  if(!currentUser) return alert("Please log in");
  const postRef = doc(db, 'posts', postId);
  await updateDoc(postRef, { repostCount: increment(1) });
};

// Feed Loading
let feedUnsubscribe = null;
function loadFeed() {
  if (!feedContainer) return;

  if (feedUnsubscribe) feedUnsubscribe();

  let q;
  const postsRef = collection(db, 'posts');
  if (currentSort === 'likes') {
    q = query(postsRef, orderBy('likeCount', 'desc'), orderBy('createdAt', 'desc'));
  } else if (currentSort === 'comments') {
    q = query(postsRef, orderBy('commentCount', 'desc'), orderBy('createdAt', 'desc'));
  } else {
    q = query(postsRef, orderBy('createdAt', 'desc'));
  }

  feedUnsubscribe = onSnapshot(q, (snapshot) => {
    feedContainer.innerHTML = '';
    if (snapshot.empty) {
      feedContainer.innerHTML = '<div class="text-center text-muted p-5">No posts yet. Be the first!</div>';
      return;
    }
    snapshot.forEach(docSnap => {
      feedContainer.innerHTML += renderPostCard(docSnap.id, docSnap.data());
    });
  }, (err) => {
    console.error("Error fetching feed:", err);
    feedContainer.innerHTML = '<div class="text-danger p-3">Failed to load feed. Check indexes if using emulators.</div>';
  });
}

if (feedContainer) {
  loadFeed();
}

// Modal Comment Setup
const commentForm = document.getElementById('comment-form');
if (commentForm) {
  commentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser) return alert("Log in first");
    
    const text = document.getElementById('comment-text').value.trim();
    const postId = document.getElementById('comment-post-id').value;
    if (!text) return;
    
    try {
      // Add comment to subcollection
      await addDoc(collection(db, 'posts', postId, 'comments'), {
        authorUid: currentUser.uid,
        authorEmail: currentUser.email,
        text: text,
        createdAt: serverTimestamp()
      });
      // Increment comment count
      await updateDoc(doc(db, 'posts', postId), { commentCount: increment(1) });

      const modalEl = document.getElementById('commentModal');
      const modalInstance = bootstrap.Modal.getInstance(modalEl);
      modalInstance.hide();
      document.getElementById('comment-text').value = '';
    } catch(err) {
      console.error(err);
      alert("Failed to comment");
    }
  });
}

// Single Post View Logic
const singlePostContainer = document.getElementById('single-post-container');
const commentsContainer = document.getElementById('comments-container');
if (singlePostContainer) {
  const postId = singlePostContainer.dataset.postId;
  
  // Listen to post
  onSnapshot(doc(db, 'posts', postId), (docSnap) => {
    if (docSnap.exists()) {
      singlePostContainer.innerHTML = renderPostCard(docSnap.id, docSnap.data(), true);
    } else {
      singlePostContainer.innerHTML = '<div class="alert alert-danger">Post not found.</div>';
    }
  });

  // Listen to comments
  const commentsQ = query(collection(db, 'posts', postId, 'comments'), orderBy('createdAt', 'asc'));
  onSnapshot(commentsQ, (snapshot) => {
    commentsContainer.innerHTML = '';
    if (snapshot.empty) {
      commentsContainer.innerHTML = '<div class="text-muted p-3">No comments yet.</div>';
      return;
    }
    snapshot.forEach(cSnap => {
      const data = cSnap.data();
      const timeStr = timeAgo(data.createdAt);
      commentsContainer.innerHTML += `
        <div class="comment-card">
          <div class="post-header mb-2">
            <div class="post-author" style="font-size: 14px;">
              <img src="https://ui-avatars.com/api/?name=${data.authorEmail}&background=random" class="avatar" style="width:30px; height:30px;">
              <span>${data.authorEmail.split('@')[0]}</span>
            </div>
            <div class="post-time">${timeStr}</div>
          </div>
          <div class="post-body" style="font-size: 14px; margin-bottom: 0;">
            ${data.text.replace(/</g, "&lt;").replace(/>/g, "&gt;")}
          </div>
        </div>
      `;
    });
  });

  // Inline Comment Form
  const inlineCommentForm = document.getElementById('inline-comment-form');
  if (inlineCommentForm) {
    inlineCommentForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentUser) return alert("Log in first");
      const text = document.getElementById('inline-comment-text').value.trim();
      if (!text) return;

      try {
        await addDoc(collection(db, 'posts', postId, 'comments'), {
          authorUid: currentUser.uid,
          authorEmail: currentUser.email,
          text: text,
          createdAt: serverTimestamp()
        });
        await updateDoc(doc(db, 'posts', postId), { commentCount: increment(1) });
        document.getElementById('inline-comment-text').value = '';
      } catch(err) {
        console.error(err);
        alert("Failed to submit comment");
      }
    });
  }
}
