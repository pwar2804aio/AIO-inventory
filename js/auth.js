/**
 * auth.js — AIO Inventory user authentication & role management
 * Uses Firebase Auth (email/password) + Firestore users collection
 */

const Auth = (() => {

  let _currentUser  = null;  // Firebase Auth user
  let _userProfile  = null;  // Firestore user doc { name, email, role }
  let _onAuthReady  = [];
  let _authReady    = false;

  // ── Initialise ──────────────────────────────────────────────────────────
  async function init() {
    const { getAuth, onAuthStateChanged } =
      await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
    const { getFirestore, doc, getDoc } =
      await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
    const { initializeApp, getApps } =
      await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');

    const FB_CONFIG = {
      apiKey:            "AIzaSyCJaWCjiBSYEATT7ytZoK23Dauqgek1M-g",
      authDomain:        "aio-inventory.firebaseapp.com",
      projectId:         "aio-inventory",
      storageBucket:     "aio-inventory.firebasestorage.app",
      messagingSenderId: "168216293932",
      appId:             "1:168216293932:web:68438c3e40e46ffd2f9789"
    };

    const app = getApps().length ? getApps()[0] : initializeApp(FB_CONFIG);
    const auth = getAuth(app);
    const db   = getFirestore(app);

    onAuthStateChanged(auth, async (user) => {
      if (user) {
        _currentUser = user;
        // Load profile from Firestore users collection
        try {
          const { getDoc: _gd, setDoc: _sd, doc: _doc, deleteDoc: _dd } =
            await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
          const snap = await _gd(_doc(db, 'users', user.uid));
          if (snap.exists() && !snap.data().deleted) {
            _userProfile = snap.data();
          } else if (snap.exists() && snap.data().deleted) {
            // Soft-deleted — treat as logged out
            _userProfile = null;
            const { getAuth: _ga, signOut: _so } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
            await _so(_ga());
            return;
          } else {
            // No profile — check pending_users by email (admin pre-created before UID was known)
            const { collection: _col, query: _q, where: _w, getDocs: _gds } =
              await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
            const pendingSnap = await _gds(_q(_col(db, 'pending_users'), _w('email', '==', user.email)));
            if (!pendingSnap.empty) {
              const pending = pendingSnap.docs[0].data();
              const profile = { name: pending.name, email: user.email, role: pending.role, createdAt: new Date().toISOString() };
              await _sd(_doc(db, 'users', user.uid), profile);
              await _dd(pendingSnap.docs[0].ref); // clean up pending
              _userProfile = profile;
            } else {
              // Truly first login with no pre-created profile
              _userProfile = { name: user.email, email: user.email, role: 'view' };
            }
          }
        } catch(e) {
          _userProfile = { name: user.email, email: user.email, role: 'view' };
        }
        _authReady = true;
        _onAuthReady.forEach(fn => fn(true));
        _onAuthReady = [];
      } else {
        _currentUser = null;
        _userProfile = null;
        _authReady   = true;
        _onAuthReady.forEach(fn => fn(false));
        _onAuthReady = [];
      }
    });
  }

  function onReady(fn) {
    if (_authReady) fn(!!_currentUser); else _onAuthReady.push(fn);
  }

  function getUser()    { return _currentUser; }
  function getProfile() { return _userProfile; }
  function isAdmin()    { return _userProfile?.role === 'admin'; }
  function canEdit()    { return _userProfile?.role === 'admin' || _userProfile?.role === 'edit'; }
  function getName()    { return _userProfile?.name || _currentUser?.email || ''; }

  async function signIn(email, password) {
    const { getAuth, signInWithEmailAndPassword } =
      await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
    const auth = getAuth();
    await signInWithEmailAndPassword(auth, email, password);
  }

  async function signOut() {
    const { getAuth, signOut: fbSignOut } =
      await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
    await fbSignOut(getAuth());
    window.location.reload();
  }

  return { init, onReady, getUser, getProfile, isAdmin, canEdit, getName, signIn, signOut };
})();

// ── User Management (admin only) ──────────────────────────────────────────
const UserManager = (() => {

  async function listUsers() {
    const { getFirestore, collection, getDocs } =
      await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
    const db = getFirestore();
    const snap = await getDocs(collection(db, 'users'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  async function addUser(email, password, name, role) {
    const { initializeApp, getApp, deleteApp } =
      await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
    const { getAuth, createUserWithEmailAndPassword, signOut: fbSignOut } =
      await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
    const { getFirestore, doc, setDoc } =
      await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');

    const FB_CONFIG = {
      apiKey:            "AIzaSyCJaWCjiBSYEATT7ytZoK23Dauqgek1M-g",
      authDomain:        "aio-inventory.firebaseapp.com",
      projectId:         "aio-inventory",
      storageBucket:     "aio-inventory.firebasestorage.app",
      messagingSenderId: "168216293932",
      appId:             "1:168216293932:web:68438c3e40e46ffd2f9789"
    };

    // Use a secondary app instance so the admin session is never touched
    const secondaryApp  = initializeApp(FB_CONFIG, 'aio-user-creation-' + Date.now());
    const secondaryAuth = getAuth(secondaryApp);
    const db            = getFirestore();

    try {
      const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
      const uid  = cred.user.uid;

      // Save profile to Firestore using the primary db instance
      await setDoc(doc(db, 'users', uid), { name, email, role, createdAt: new Date().toISOString() });

      return uid;
    } finally {
      // Always clean up the secondary app — admin stays logged in on primary
      try { await fbSignOut(secondaryAuth); } catch(_) {}
      try { await deleteApp(secondaryApp); } catch(_) {}
    }
  }

  async function updateUserRole(uid, role) {
    const { getFirestore, doc, updateDoc } =
      await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
    await updateDoc(doc(getFirestore(), 'users', uid), { role });
  }

  async function deleteUser(uid) {
    // Soft-delete: mark as deleted in Firestore but keep the Firebase Auth account.
    // This allows reactivation later without hitting email-already-in-use.
    const { getFirestore, doc, updateDoc } =
      await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
    await updateDoc(doc(getFirestore(), 'users', uid), {
      deleted: true,
      deletedAt: new Date().toISOString(),
    });
  }

  async function reactivateUser(uid, name, role) {
    // Restore a soft-deleted user: clear the deleted flag and update profile.
    const { getFirestore, doc, updateDoc } =
      await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
    await updateDoc(doc(getFirestore(), 'users', uid), {
      name, role,
      deleted: false,
      deletedAt: null,
      reactivatedAt: new Date().toISOString(),
    });
  }

  async function sendPasswordReset(email) {
    const { getAuth, sendPasswordResetEmail } =
      await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
    await sendPasswordResetEmail(getAuth(), email);
  }

  async function addPendingUser(email, name, role) {
    // Pre-create a profile for a ghost Auth account (Firebase Auth exists, Firestore doesn't).
    // When they next log in, onAuthStateChanged will migrate this to users/{uid}.
    const { getFirestore, collection, addDoc, query, where, getDocs, deleteDoc } =
      await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
    const db = getFirestore();
    // Remove any existing pending entry for this email first
    const existing = await getDocs(query(collection(db, 'pending_users'), where('email', '==', email)));
    for (const d of existing.docs) await deleteDoc(d.ref);
    await addDoc(collection(db, 'pending_users'), { email, name, role, createdAt: new Date().toISOString() });
  }

  return { listUsers, addUser, addPendingUser, updateUserRole, deleteUser, reactivateUser, sendPasswordReset };
})();

// Start auth immediately
Auth.init();
