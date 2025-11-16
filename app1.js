// app.js (module) — put in repo root next to index.html
// Uses Firebase modular SDK via CDN import

// ----------------- FIREBASE IMPORTS (modular) -----------------
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getDatabase,
  ref,
  push,
  set,
  onChildAdded,
  onValue,
  off,
  get,
  update
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";

// ----------------- YOUR FIREBASE CONFIG -----------------
const firebaseConfig = {
  apiKey: "AIzaSyDjW_3cYR8apPFMmZqLqZh_9i2bN-1IEmY",
  authDomain: "college-finder-279aa.firebaseapp.com",
  databaseURL: "https://college-finder-279aa-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "college-finder-279aa",
  storageBucket: "college-finder-279aa.firebasestorage.app",
  messagingSenderId: "94401695690",
  appId: "1:94401695690:web:cc08b09173d329de944933",
  measurementId: "G-R8D5FF0HEH"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// Admin email
const ADMIN_EMAIL = "mithun@admin.com";

// DOM refs
const welcomeTxt = document.getElementById('welcomeTxt');
const btnAuth = document.getElementById('btn-auth');
const authModal = document.getElementById('authModal');
const authEmail = document.getElementById('authEmail');
const authPass = document.getElementById('authPass');
const authLogin = document.getElementById('authLogin');
const authSignup = document.getElementById('authSignup');
const authClose = document.getElementById('authClose');
const sidebarUser = document.getElementById('sidebar-user');
const btnLogout = document.getElementById('btn-logout');

const chatMessages = document.getElementById('chat-messages');
const userChatList = document.getElementById('user-chat-list');
const chatSend = document.getElementById('chat-send');
const chatInput = document.getElementById('chat-input');

const adminUserList = document.getElementById('admin-user-list');
const adminChatMessages = document.getElementById('admin-chat-messages');
const adminChatHeader = document.getElementById('admin-chat-header');
const adminChatInput = document.getElementById('admin-chat-input');
const adminChatSend = document.getElementById('admin-chat-send');

let currentUser = null;
let currentUserUid = null;
let currentAdminChatUid = null;

// small helper: metadata path for a user
const metaPath = (uid) => `meta/${uid}`;

// ----------------- NOTIFICATION UTILITIES -----------------

// Play a short beep using WebAudio (no external file)
function playSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(880, ctx.currentTime); // A6-ish
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    o.connect(g); g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.3);
  } catch (e) {
    // ignore if audio blocked
    console.warn('sound failed', e);
  }
}

// flash animation on element
function flashElement(el) {
  if(!el) return;
  el.classList.add('notify-flash');
  setTimeout(()=> el.classList.remove('notify-flash'), 1600);
}

// create CSS for .notify-flash & badge styles (inject once)
(function injectNotificationStyles(){
  const css = `
  .red-dot {
    display:inline-block;
    width:10px;height:10px;border-radius:50%;background:#e53935;margin-left:8px;vertical-align:middle;
    box-shadow:0 0 0 rgba(229,57,53,0.6);
  }
  .row-highlight { background: linear-gradient(90deg, rgba(255,249,196,0.9), rgba(255,255,255,0.6)); }
  .notify-flash {
    animation: flashit 1.2s ease-in-out;
  }
  @keyframes flashit {
    0% { box-shadow: 0 0 0 rgba(255, 204, 0, 0.0); transform: translateY(0); }
    30% { box-shadow: 0 6px 18px rgba(255, 204, 0, 0.18); transform: translateY(-2px); }
    60% { box-shadow: 0 2px 8px rgba(255, 204, 0, 0.08); transform: translateY(0); }
    100% { box-shadow: 0 0 0 rgba(255, 204, 0, 0.0); transform: translateY(0); }
  }`;
  const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
})();

// small notification bubble on screen (transient)
function showToast(text) {
  const n = document.createElement("div");
  n.textContent = text;
  n.style.position = "fixed";
  n.style.bottom = "20px";
  n.style.right = "20px";
  n.style.background = "#0a3d62";
  n.style.color = "#fff";
  n.style.padding = "10px 16px";
  n.style.borderRadius = "8px";
  n.style.zIndex = "9999";
  n.style.boxShadow = "0 6px 18px rgba(6,30,60,0.16)";
  document.body.appendChild(n);
  setTimeout(() => n.remove(), 2800);
}

// set unread count in meta (persisted)
async function incrementUnreadFor(uid, from, senderName) {
  const mref = ref(db, metaPath(uid));
  try {
    const snap = await get(mref);
    const cur = snap.exists() ? (snap.val() || {}) : {};
    const newCount = (cur.unread||0) + 1;
    const payload = {
      unread: newCount,
      lastTime: Date.now(),
      lastSender: from,
      lastSenderName: senderName || cur.lastSenderName || '',
    };
    await set(mref, Object.assign({}, cur, payload));
  } catch (e) { console.error('incUnread', e); }
}

// clear unread for a uid (when that user/admin opens the chat)
async function clearUnread(uid) {
  const mref = ref(db, metaPath(uid));
  try {
    const snap = await get(mref);
    const cur = snap.exists() ? (snap.val() || {}) : {};
    if(cur.unread && cur.unread > 0) {
      cur.unread = 0;
      await set(mref, cur);
    }
  } catch(e){ console.error('clear unread', e); }
}

// helper to place red-dot on a tab/button
function setTabBadge(btnEl, show) {
  if(!btnEl) return;
  // remove existing dot
  const existing = btnEl.querySelector('.red-dot');
  if(existing) existing.remove();
  if(show) {
    const d = document.createElement('span');
    d.className = 'red-dot';
    btnEl.appendChild(d);
  }
}

// ---------------- TAB switching (delegation) ----------------
document.getElementById('sidebar').addEventListener('click', function(e){
  const btn = e.target.closest('.tab-button');
  if(!btn) return;
  const tab = btn.dataset.tab;
  if(!tab) return;
  // hide all sections
  document.querySelectorAll('[data-section]').forEach(s=>s.style.display='none');
  const target = document.getElementById(tab);
  if(target) target.style.display='block';
  // active
  document.querySelectorAll('.tab-button').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');

  // When user opens messages tab, clear their unread badge
  if(tab === 'messages' && currentUserUid) {
    clearUnread(currentUserUid).catch(()=>{});
    // remove badge on Messages button if present
    const mbtn = document.querySelector('[data-tab="messages"]');
    if(mbtn) setTabBadge(mbtn, false);
  }

  // When admin opens admin tab, clear admin badge
  if(tab === 'admin' && currentUser && currentUser.email && currentUser.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
    const abtn = document.querySelector('[data-tab="admin"]');
    if(abtn) setTabBadge(abtn, false);
  }
});

// AUTH modal open/close
btnAuth.addEventListener('click', ()=> authModal.style.display='flex');
authClose.addEventListener('click', ()=> authModal.style.display='none');

// Signup
authSignup.addEventListener('click', async ()=>{
  const email = authEmail.value.trim();
  const pass = authPass.value.trim();
  if(!email || !pass) return alert('Enter email & password');
  try{
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    // create users record so admin list has it
    await set(ref(db, 'users/' + cred.user.uid), { email: email, createdAt: Date.now() });
    authModal.style.display = 'none';
    alert('Account created and signed in.');
  }catch(err){
    alert(err.message || err);
  }
});

// Login
authLogin.addEventListener('click', async ()=>{
  const email = authEmail.value.trim();
  const pass = authPass.value.trim();
  if(!email || !pass) return alert('Enter email & password');
  try{
    await signInWithEmailAndPassword(auth, email, pass);
    authModal.style.display = 'none';
  }catch(err){
    alert(err.message || err);
  }
});

// Logout
btnLogout.addEventListener('click', async ()=>{
  if(confirm('Logout?')) {
    try{
      await signOut(auth);
    }catch(e){ console.error(e); }
  }
});

// auth state
onAuthStateChanged(auth, async (user)=>{
  currentUser = user;
  if(user){
    welcomeTxt.textContent = user.email;
    sidebarUser.textContent = user.email;
    currentUserUid = user.uid;
    injectMessagesTab();
    if(user.email && user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()){
      injectAdminTab();
      // show admin by default
      document.querySelectorAll('[data-section]').forEach(s=>s.style.display='none');
      document.getElementById('admin').style.display='block';
    } else {
      document.querySelectorAll('[data-section]').forEach(s=>s.style.display='none');
      document.getElementById('messages').style.display='block';
    }
    // ensure users record exists
    set(ref(db, 'users/' + user.uid), { email: user.email, createdAt: Date.now() })
      .catch(()=>{}); // ignore
    await loadUserChat();

    // When user signs in, if they have unread > 0, show badge on messages tab
    try {
      const metaSnap = await get(ref(db, metaPath(user.uid)));
      const meta = metaSnap.exists() ? metaSnap.val() : {};
      const mbtn = document.querySelector('[data-tab="messages"]');
      if(meta && meta.unread && meta.unread > 0) {
        if(mbtn) setTabBadge(mbtn, true);
      } else {
        if(mbtn) setTabBadge(mbtn, false);
      }
    } catch(e){ console.error(e); }

  } else {
    welcomeTxt.textContent = 'Not signed in';
    sidebarUser.textContent = '—';
    currentUserUid = null;
    // remove injected tabs if present
    const mbtn = document.querySelector('[data-tab="messages"]'); if(mbtn) mbtn.remove();
    const abtn = document.querySelector('[data-tab="admin"]'); if(abtn) abtn.remove();
    // show home
    document.querySelectorAll('[data-section]').forEach(s=>s.style.display='none');
    document.getElementById('home').style.display='block';
  }
});

// inject Messages tab
function injectMessagesTab(){
  if(document.querySelector('[data-tab="messages"]')) return;
  const btn = document.createElement('button');
  btn.className = 'tab-button';
  btn.dataset.tab = 'messages';
  btn.textContent = '💬 Messages';
  btn.addEventListener('click', ()=> {
    document.querySelectorAll('[data-section]').forEach(s=>s.style.display='none');
    document.getElementById('messages').style.display='block';
    document.querySelectorAll('.tab-button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    loadUserChat(); // ensure chats loaded
  });
  document.getElementById('sidebar').appendChild(btn);
}

// inject Admin tab
function injectAdminTab(){
  if(document.querySelector('[data-tab="admin"]')) return;
  const btn = document.createElement('button');
  btn.className = 'tab-button';
  btn.dataset.tab = 'admin';
  btn.textContent = '🛠 Admin';
  btn.addEventListener('click', ()=> {
    document.querySelectorAll('[data-section]').forEach(s=>s.style.display='none');
    document.getElementById('admin').style.display='block';
    document.querySelectorAll('.tab-button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    loadAdminUsers();
  });
  document.getElementById('sidebar').appendChild(btn);
}

// ---------------- FLIPBOARDS ----------------
const FLIPS = [
  { city:'Chennai', title:'Engineering', link:'engineering_colleges_in_chennai.html' },
  { city:'Chennai', title:'Medical', link:'medical_college_in_chennai.html' },
  { city:'Chennai', title:'Arts & Science', link:'arts-science_college_chennai.html' },
  { city:'Pondicherry', title:'Engineering', link:'engineering_pondy.html' },
  { city:'Pondicherry', title:'Medical', link:'medical_pondyy.html' },
  { city:'Pondicherry', title:'Arts & Science', link:'arts_pondy.html' },
  { city:'Coimbatore', title:'Engineering', link:'engineering_coimbatore.html' },
  { city:'Coimbatore', title:'Medical', link:'medical_college_coimbatore.html' },
  { city:'Coimbatore', title:'Arts & Science', link:'arts_science_coimbatore.html' },
  { city:'Trichy', title:'Engineering', link:'engineering-trichy.html' },
  { city:'Trichy', title:'Medical', link:'medical-trichy.html' },
  { city:'Trichy', title:'Arts & Science', link:'arts-and-science-trichy.html' },
  { city:'Trichy', title:'Aviation', link:'aviation-trichy.html' },
  { city:'Madurai', title:'Aviation', link:'aviaaon-maduur.html' },
  { city:'Madurai', title:'Engineering', link:'engeerg-ma.html' },
  { city:'Salem', title:'Engineering', link:'salem-engineering.html' }
];

function renderFlipboards(){
  const grid = document.getElementById('flip-grid');
  grid.innerHTML = '';
  FLIPS.forEach(item=>{
    const d = document.createElement('div'); d.className='flip';
    d.innerHTML = `<div style="font-weight:700">${item.city}</div><div style="margin-top:6px">${item.title}</div>`;
    const btn = document.createElement('button'); btn.className='view-btn'; btn.textContent='View';
    btn.addEventListener('click', (ev)=>{
      ev.stopPropagation();
      if(!currentUserUid){ authModal.style.display='flex'; return; }
      // open the specific link (user must be logged in)
      window.open(item.link, '_blank');
    });
    d.appendChild(btn);
    d.addEventListener('click', ()=> {
      const map = { Chennai:'chennai', Pondicherry:'pondy', Coimbatore:'coimbatore', Trichy:'trichy', Madurai:'madurai', Salem:'salem' };
      const id = map[item.city] || 'home';
      document.querySelectorAll('[data-section]').forEach(s=>s.style.display='none');
      const el = document.getElementById(id);
      if(el) el.style.display='block';
    });
    grid.appendChild(d);
  });
}
renderFlipboards();

// ---------------- CITY SAMPLE DATA ----------------
const SAMPLE = {
  "Chennai": { "Engineering":["IIT Madras","SSN College of Engineering","Anna University - CEG"], "Medical":["Madras Medical College","Stanley Medical College"], "Arts & Science":["Loyola College","Madras Christian College"] },
  "Coimbatore": { "Engineering":["PSG College of Technology","Coimbatore Institute of Technology"], "Medical":["Coimbatore Medical College"], "Arts & Science":["PSG College of Arts & Science"] },
  "Pondicherry": { "Engineering":["(sample)"], "Medical":["JIPMER"], "Arts & Science":["Pondy Arts College"] },
  "Trichy": { "Engineering":["NIT Trichy","Saranathan College"], "Medical":["KAPV Medical College"], "Arts & Science":["Bishop Heber College"] },
  "Madurai": { "Engineering":["Thiagarajar College of Engineering"], "Medical":["Madurai Medical College"], "Arts & Science":["The American College"] },
  "Salem": { "Engineering":["Sona College of Technology"], "Medical":["Vinayaka Missions Medical College"], "Arts & Science":["Sona Arts and Science College"] }
};

function renderCityLists(){
  ['chennai','coimbatore','pondy','trichy','madurai','salem'].forEach(id=>{
    const key = id === 'pondy' ? 'Pondicherry' : id.charAt(0).toUpperCase() + id.slice(1);
    const cont = document.getElementById(id + '-content');
    cont.innerHTML = '';
    const obj = SAMPLE[key] || {};
    Object.keys(obj).forEach(cat=>{
      const card = document.createElement('div'); card.className='card';
      card.innerHTML = `<strong>${cat}</strong><div class="small">${obj[cat].length} colleges</div>`;
      obj[cat].forEach(c=>{
        const r = document.createElement('div'); r.style.padding='8px'; r.style.borderBottom='1px solid #f0f0f0';
        r.innerHTML = `<div style="font-weight:700">${c}</div><div class="small">— sample info</div>`;
        const v = document.createElement('button'); v.className='view-btn'; v.textContent='View';
        v.onclick = (ev)=> { ev.stopPropagation(); if(!currentUserUid){ authModal.style.display='flex'; return; } alert('Open details for ' + c); };
        r.appendChild(v);
        card.appendChild(r);
      });
      cont.appendChild(card);
    });
  });
}
renderCityLists();

// ---------------- USER CHAT ----------------
async function loadUserChat(){
  if(!currentUserUid) return;
  userChatList.innerHTML = '<div style="font-weight:700">Your Chat</div><div class="small" style="margin-top:6px">Messages with admin</div>';
  chatMessages.innerHTML = '';
  const userRef = ref(db, 'chats/' + currentUserUid);
  // remove previous listener if any
  off(userRef);
  onChildAdded(userRef, (snap)=>{
    const m = snap.val();
    const el = document.createElement('div');
    el.className = 'msg ' + (m.from === 'admin' ? 'admin' : 'user');
    el.innerHTML = `<div>${escapeHtml(m.text)}</div><div style="color:#666;font-size:11px;margin-top:6px">${new Date(m.time).toLocaleString()}</div>`;
    chatMessages.appendChild(el);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // If message is FROM admin and current user is not admin -> show notification & badge
    if(m.from === 'admin' && currentUserUid) {
      // show toast + sound + flash
      showToast('New reply from admin');
      playSound();
      // show red dot on messages tab
      const mbtn = document.querySelector('[data-tab="messages"]');
      if(mbtn) setTabBadge(mbtn, true);
      // also persist unread (meta) - admin already sets unread when sending, but ensure meta exists
      // (we avoid incrementing here to prevent double counts)
    }
  });

  chatSend.onclick = async function(){
    const txt = chatInput.value.trim();
    if(!txt) return;
    const payload = { from:'user', text: txt, time: Date.now() };
    await push(ref(db, 'chats/' + currentUserUid), payload);
    // increment admin's unread (so admin sees this user as new/unread)
    await incrementUnreadFor('admin', 'user', currentUser ? currentUser.email : 'user');
    chatInput.value = '';
  };

  // when user opens chat, clear their own unread (they're reading)
  await clearUnread(currentUserUid);
  // remove red dot for messages tab since user opened it
  const mbtn = document.querySelector('[data-tab="messages"]');
  if(mbtn) setTabBadge(mbtn, false);
}

// ---------------- ADMIN UI ----------------

// utility to build user rows with metadata
function buildUserRow(uid, userData, meta){
  const row = document.createElement('div');
  row.id = 'user-' + uid;
  row.style.padding='8px';
  row.style.borderBottom='1px solid #eee';
  row.style.cursor='pointer';
  row.dataset.uid = uid;

  const emailText = escapeHtml(userData.email || uid);
  const unread = meta && meta.unread ? meta.unread : 0;
  const lastTime = meta && meta.lastTime ? meta.lastTime : 0;
  const lastSenderName = meta && meta.lastSenderName ? escapeHtml(meta.lastSenderName) : '';

  row.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
    <div>
      <div style="font-weight:700">${emailText}</div>
      <div class="small">uid: ${uid}</div>
    </div>
    <div style="text-align:right">
      ${ unread > 0 ? `<div style="font-weight:700;color:#e53935">${unread}</div>` : '' }
      <div class="small" style="color:#666;margin-top:6px">${ lastTime ? new Date(lastTime).toLocaleString() : '' }</div>
    </div>
  </div>`;

  // highlight row if has unread
  if(unread > 0) {
    row.classList.add('row-highlight');
  } else {
    row.classList.remove('row-highlight');
  }

  // click to open admin chat
  row.onclick = async ()=>{
    openAdminChat(uid, userData.email);
    // when admin opens user's chat, clear their unread & update UI
    await clearUnread(uid);
    // remove highlight & resort list
    const el = document.getElementById('user-' + uid);
    if(el) { el.classList.remove('row-highlight'); }
    await loadAdminUsers(); // reload to reflect sorting
  };

  return row;
}

// move user row to top (visual)
function moveUserToTop(userId) {
  const userDiv = document.getElementById("user-" + userId);
  if (userDiv && adminUserList) {
    // put below the title header (first child is title)
    adminUserList.insertBefore(userDiv, adminUserList.children[1] || null);
  }
}

// loadAdminUsers: smart sorting (unread desc, then lastTime desc)
async function loadAdminUsers(){
  adminUserList.innerHTML = '<div style="font-weight:700">Users</div>';
  const usersRef = ref(db, 'users');
  off(usersRef);
  onValue(usersRef, async (snap)=>{
    const usersObj = snap.val() || {};
    // collect all users with meta
    const items = [];
    const promises = Object.keys(usersObj).map(async uid=>{
      const u = usersObj[uid];
      const metaSnap = await get(ref(db, metaPath(uid)));
      const meta = metaSnap.exists() ? metaSnap.val() : {};
      items.push({ uid, user: u, meta });
    });
    await Promise.all(promises);
    // sort: unread desc, then lastTime desc
    items.sort((a,b)=>{
      const au = a.meta && a.meta.unread ? a.meta.unread : 0;
      const bu = b.meta && b.meta.unread ? b.meta.unread : 0;
      if(au !== bu) return bu - au;
      const at = a.meta && a.meta.lastTime ? a.meta.lastTime : 0;
      const bt = b.meta && b.meta.lastTime ? b.meta.lastTime : 0;
      return bt - at;
    });

    // rebuild list
    adminUserList.innerHTML = '<div style="font-weight:700">Users</div>';
    items.forEach(it=>{
      const row = buildUserRow(it.uid, it.user, it.meta);
      adminUserList.appendChild(row);
    });

    // if admin has unread across any users, show badge on admin tab
    const totalUnread = items.reduce((s,it)=> s + (it.meta && it.meta.unread ? it.meta.unread : 0), 0);
    const abtn = document.querySelector('[data-tab="admin"]');
    if(abtn) setTabBadge(abtn, totalUnread > 0);
  });
}

// open admin chat and listen to messages for that user
function openAdminChat(uid, email){
  currentAdminChatUid = uid;
  adminChatHeader.innerHTML = `<strong>${escapeHtml(email||uid)}</strong>`;
  adminChatMessages.innerHTML = '';
  const chatRef = ref(db, 'chats/' + uid);
  off(chatRef);
  onChildAdded(chatRef, (snap)=>{
    const m = snap.val();
    const el = document.createElement('div');
    el.className = 'msg ' + (m.from === 'admin' ? 'admin' : 'user');
    el.innerHTML = `<div>${escapeHtml(m.text)}</div><div style="color:#666;font-size:11px;margin-top:6px">${new Date(m.time).toLocaleString()}</div>`;
    adminChatMessages.appendChild(el);
    adminChatMessages.scrollTop = adminChatMessages.scrollHeight;
  });

  adminChatSend.onclick = async function(){
    const t = adminChatInput.value.trim();
    if(!t || !currentAdminChatUid) return;
    const payload = { from:'admin', text: t, time: Date.now() };
    await push(ref(db, 'chats/' + currentAdminChatUid), payload);

    // increment unread for the user (persisted)
    await incrementUnreadFor(currentAdminChatUid, 'admin', currentUser ? currentUser.email : 'admin');

    // update admin's meta as lastTime for this uid too
    await update(ref(db, metaPath(currentAdminChatUid)), { lastTime: Date.now(), lastSender: 'admin', lastSenderName: currentUser ? currentUser.email : 'admin' });

    adminChatInput.value = '';

    // Notify admin UI (move user to top)
    moveUserToTop(currentAdminChatUid);
  };

  // when admin opens this chat, clear unread for that uid
  clearUnread(uid).catch(()=>{});
}

// ----------------- REALTIME REACTIONS: LISTEN FOR NEW CHATS GLOBALLY -----------------
// We'll watch 'chats' root child_added for any new messages to update meta and show
// notifications. Note: We listen per-chat via admin/user listeners too, but this helps to keep meta & notifications consistent.

// For admin: watch for new messages from users (so admin gets notifications + rows move to top)
// For users: their own chat listener shows replies as implemented earlier

// Global listener - child added under 'chats' (for each user's chat list)
// This will run whenever a new message is pushed for ANY user
onChildAdded(ref(db, 'chats'), (snapUserChats) => {
  const uid = snapUserChats.key; // user uid whose chat subnode changed (this triggers once with the list snapshot, not per message)
  // Note: onChildAdded at this level fires with the child node (the whole chat list) and not each message.
  // To observe messages themselves per-user, we listen inside loadUserChat/openAdminChat.
  // However we still want to ensure meta exists for users who never had meta and ensure admin sees new users.
  // We'll set up a child listener per user for new messages:
  const userChatRef = ref(db, 'chats/' + uid);
  // set up an onChildAdded for the actual messages under this user's chat
  onChildAdded(userChatRef, async (msgSnap) => {
    const m = msgSnap.val();
    if(!m) return;
    const from = m.from || 'user';
    const time = m.time || Date.now();
    // If 'from' is 'user' => so normal user sent a message (to admin)
    if(from === 'user') {
      // increment admin unread (persisted)
      await incrementUnreadFor('admin', 'user', null);
      // update meta for the user itself (lastTime)
      await update(ref(db, metaPath(uid)), { lastTime: time, lastSender: 'user' });
      // move user row to top if admin UI present
      moveUserToTop(uid);

      // Show admin-side transient visual if admin is signed in and viewing admin
      if(currentUser && currentUser.email && currentUser.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
        // show toast, sound, flash
        showToast(`New message from ${uid}`);
        playSound();
        // add highlight to row
        const row = document.getElementById('user-' + uid);
        if(row) {
          row.classList.add('row-highlight');
          flashElement(row);
        }
        // ensure admin badge on tab
        const abtn = document.querySelector('[data-tab="admin"]');
        if(abtn) setTabBadge(abtn, true);
      }
    } else if(from === 'admin') {
      // Admin sent a message to user: increment unread for the user (so they get notified)
      await incrementUnreadFor(uid, 'admin', currentUser ? currentUser.email : 'admin');
      // If that user is currently online and viewing their messages, their own onChildAdded will show toast & clear unread
      // But ensure the messages tab for that user has badge if they're not looking
      if(currentUserUid && currentUserUid === uid) {
        // user who is logged in is the recipient; onChildAdded in loadUserChat will show toast already
      } else {
        // show messages tab badge for the recipient (persisted); when they sign in, our auth state handler shows it
      }
    }
  });
});

// ---------------- ADMIN HELPER: when a user row gets new message, move to top visually ----------------
function ensureUserRowTop(uid) {
  const row = document.getElementById('user-' + uid);
  if(row && adminUserList) {
    adminUserList.insertBefore(row, adminUserList.children[1] || null);
  }
}

// ---------------- CHAT SENDERS: handled in loadUserChat/openAdminChat above ----------------

// ---------------- Utilities ----------------
function escapeHtml(s){ if(!s) return ''; return String(s).replace(/[&<>"']/g, function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]; }); }

// small toast alias to use same naming earlier
function showToast(msg){ showToast; } // no-op to avoid duplicate function name (we defined showToast earlier)

// ensure console message
console.log('app.js loaded (with notifications + admin sorting + persisted unread).');
