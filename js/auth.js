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
          const snap = await getDoc(doc(db, 'users', user.uid));
          if (snap.exists()) {
            _userProfile = snap.data();
          } else {
            // First login — create basic profile from email
            _userProfile = { name: user.email, email: user.email, role: 'view' };
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
    // Create Firebase Auth account
    const { getAuth, createUserWithEmailAndPassword } =
      await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
    const { getFirestore, doc, setDoc } =
      await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');

    const auth = getAuth();
    const db   = getFirestore();

    // Create auth user
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const uid  = cred.user.uid;

    // Save profile to Firestore
    await setDoc(doc(db, 'users', uid), { name, email, role, createdAt: new Date().toISOString() });

    // Sign back in as admin (creating a new user signs in as that user)
    return uid;
  }

  async function updateUserRole(uid, role) {
    const { getFirestore, doc, updateDoc } =
      await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
    await updateDoc(doc(getFirestore(), 'users', uid), { role });
  }

  async function deleteUser(uid) {
    const { getFirestore, doc, deleteDoc } =
      await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
    await deleteDoc(doc(getFirestore(), 'users', uid));
    // Note: Firebase Auth account deletion requires admin SDK — we just remove the profile
  }

  return { listUsers, addUser, updateUserRole, deleteUser };
})();

// Start auth immediately
Auth.init();
