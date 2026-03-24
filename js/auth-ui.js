/**
 * auth-ui.js — Login screen, user header bar, admin users panel
 */

const AuthUI = (() => {

  // ── Login screen ──────────────────────────────────────────────────────
  function showLoginScreen() {
    document.body.innerHTML = `
      <div class="login-wrap">
        <div class="login-card">
          <div class="login-logo">
            <img src="logo.png" alt="AIO" class="login-logo-img" />
            <div class="login-logo-label">Inventory System</div>
          </div>
          <div id="login-error" class="login-error" style="display:none;"></div>
          <div class="form-group" style="margin-bottom:14px;">
            <label class="form-label">Email address</label>
            <input class="fi" id="login-email" type="email" placeholder="you@aioapp.com" autocomplete="email" />
          </div>
          <div class="form-group" style="margin-bottom:20px;">
            <label class="form-label">Password</label>
            <input class="fi" id="login-password" type="password" placeholder="••••••••" autocomplete="current-password" />
          </div>
          <button class="btn btn-orange login-btn" id="login-btn">Sign in</button>
          <div class="login-footer">AIO App Inventory · Authorised users only</div>
        </div>
      </div>`;

    const doLogin = async () => {
      const email = document.getElementById('login-email').value.trim();
      const pass  = document.getElementById('login-password').value;
      const err   = document.getElementById('login-error');
      const btn   = document.getElementById('login-btn');

      if (!email || !pass) { showError('Please enter your email and password.'); return; }
      btn.textContent = 'Signing in...';
      btn.disabled = true;

      try {
        await Auth.signIn(email, pass);
        // onAuthStateChanged will fire → page reloads via app.js
      } catch (e) {
        btn.textContent = 'Sign in';
        btn.disabled = false;
        const msg = e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password' || e.code === 'auth/user-not-found'
          ? 'Incorrect email or password.'
          : e.code === 'auth/too-many-requests'
          ? 'Too many attempts. Please try again later.'
          : 'Sign in failed. Please try again.';
        showError(msg);
      }
    };

    function showError(msg) {
      const el = document.getElementById('login-error');
      if (el) { el.textContent = msg; el.style.display = 'block'; }
    }

    document.getElementById('login-btn').addEventListener('click', doLogin);
    document.getElementById('login-password').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
    setTimeout(() => document.getElementById('login-email')?.focus(), 100);
  }

  // ── Inject user bar into header ───────────────────────────────────────
  function injectUserBar() {
    const header = document.querySelector('.header');
    if (!header) return;

    const profile = Auth.getProfile();
    const name    = Auth.getName();
    const role    = profile?.role || 'view';
    const roleLabel = { admin: 'Admin', edit: 'Editor', view: 'View only' }[role] || role;
    const roleColour = { admin: 'var(--aio-purple)', edit: 'var(--success-text)', view: 'var(--text-hint)' }[role];

    const bar = document.createElement('div');
    bar.className = 'user-bar';
    bar.id = 'user-bar';
    bar.innerHTML = `
      <span class="user-name">${esc(name)}</span>
      <span class="user-role" style="color:${roleColour}">${roleLabel}</span>
      ${Auth.isAdmin() ? '<button class="btn btn-ghost btn-xs" id="btn-manage-users">Manage users</button>' : ''}
      <button class="btn btn-ghost btn-xs" id="btn-sign-out">Sign out</button>`;
    header.appendChild(bar);

    document.getElementById('btn-sign-out')?.addEventListener('click', () => {
      if (confirm('Sign out?')) Auth.signOut();
    });
    document.getElementById('btn-manage-users')?.addEventListener('click', showUsersPanel);
  }

  // ── Apply role restrictions ───────────────────────────────────────────
  function applyRoleRestrictions() {
    if (Auth.canEdit()) return; // admin + edit = full access

    // View only — disable all action buttons and form inputs
    const selectors = [
      '#btn-submit-in', '#btn-submit-out', '#btn-submit-transit',
      '#btn-add-product', '#btn-add-transit-product', '#btn-clear-out',
      '.btn-orange', '.btn-danger', '.btn-success',
      '.btn-remove-row', '.used-toggle input'
    ];
    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        el.disabled = true;
        el.style.opacity = '0.4';
        el.style.pointerEvents = 'none';
        el.title = 'View only access';
      });
    });

    // Add view-only banner
    const banner = document.createElement('div');
    banner.style.cssText = 'background:var(--info-bg);color:var(--info-text);border:1px solid var(--info-border);border-radius:var(--r-md);padding:8px 16px;font-size:12px;font-weight:500;margin:0 1.5rem 1rem;';
    banner.textContent = '👁 View only access — contact an administrator to make changes';
    document.querySelector('.view')?.parentElement?.insertBefore(banner, document.querySelector('.view'));
  }

  // ── Admin: Users panel ────────────────────────────────────────────────
  async function showUsersPanel() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'users-panel-overlay';
    overlay.innerHTML = `
      <div class="modal-box" style="width:580px;max-height:80vh;overflow-y:auto;">
        <div class="modal-title" style="display:flex;align-items:center;justify-content:space-between;">
          <span>Manage users</span>
          <button class="btn-remove-row" id="close-users-panel">×</button>
        </div>
        <div id="users-list"><div style="color:var(--text-hint);font-size:13px;">Loading...</div></div>
        <hr style="margin:1.25rem 0;border-color:var(--border);" />
        <div style="font-size:11px;font-weight:700;color:var(--aio-purple);text-transform:uppercase;letter-spacing:.06em;margin-bottom:12px;">Add new user</div>
        <div id="add-user-error" class="login-error" style="display:none;margin-bottom:10px;"></div>
        <div class="form-grid g2" style="margin-bottom:10px;">
          <div class="form-group">
            <label class="form-label">Full name *</label>
            <input class="fi" id="new-user-name" placeholder="e.g. John Smith" />
          </div>
          <div class="form-group">
            <label class="form-label">Email *</label>
            <input class="fi" id="new-user-email" type="email" placeholder="john@aioapp.com" />
          </div>
        </div>
        <div class="form-grid g2" style="margin-bottom:16px;">
          <div class="form-group">
            <label class="form-label">Temporary password *</label>
            <input class="fi" id="new-user-pass" type="password" placeholder="Min 6 characters" />
          </div>
          <div class="form-group">
            <label class="form-label">Role *</label>
            <select class="fi" id="new-user-role">
              <option value="view">View only</option>
              <option value="edit">Editor</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>
        <div style="display:flex;justify-content:flex-end;">
          <button class="btn btn-primary" id="btn-add-user-confirm">Add user</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);
    overlay.querySelector('#close-users-panel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    await refreshUsersList();

    overlay.querySelector('#btn-add-user-confirm').addEventListener('click', async () => {
      const name  = document.getElementById('new-user-name').value.trim();
      const email = document.getElementById('new-user-email').value.trim();
      const pass  = document.getElementById('new-user-pass').value;
      const role  = document.getElementById('new-user-role').value;
      const errEl = document.getElementById('add-user-error');
      errEl.style.display = 'none';

      if (!name || !email || !pass) { errEl.textContent = 'All fields are required.'; errEl.style.display = 'block'; return; }
      if (pass.length < 6) { errEl.textContent = 'Password must be at least 6 characters.'; errEl.style.display = 'block'; return; }

      const btn = document.getElementById('btn-add-user-confirm');
      btn.textContent = 'Adding...'; btn.disabled = true;

      try {
        await UserManager.addUser(email, pass, name, role);
        // Clear form
        ['new-user-name','new-user-email','new-user-pass'].forEach(id => document.getElementById(id).value = '');
        await refreshUsersList();
        btn.textContent = '✓ User added';
        setTimeout(() => { btn.textContent = 'Add user'; btn.disabled = false; }, 2000);
      } catch(e) {
        errEl.textContent = e.code === 'auth/email-already-in-use'
          ? 'That email is already registered.'
          : 'Error: ' + (e.message || 'Could not add user');
        errEl.style.display = 'block';
        btn.textContent = 'Add user'; btn.disabled = false;
      }
    });
  }

  async function refreshUsersList() {
    const container = document.getElementById('users-list');
    if (!container) return;
    try {
      const users = await UserManager.listUsers();
      const currentUid = Auth.getUser()?.uid;
      const roleLabel = { admin: 'Admin', edit: 'Editor', view: 'View only' };
      const roleColour = { admin: 'var(--aio-purple)', edit: 'var(--success-text)', view: 'var(--text-hint)' };

      container.innerHTML = `
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead><tr>
            <th style="text-align:left;padding:6px 8px;font-size:10px;font-weight:700;color:var(--text-hint);text-transform:uppercase;border-bottom:1px solid var(--border);">Name</th>
            <th style="text-align:left;padding:6px 8px;font-size:10px;font-weight:700;color:var(--text-hint);text-transform:uppercase;border-bottom:1px solid var(--border);">Email</th>
            <th style="text-align:left;padding:6px 8px;font-size:10px;font-weight:700;color:var(--text-hint);text-transform:uppercase;border-bottom:1px solid var(--border);">Role</th>
            <th style="border-bottom:1px solid var(--border);"></th>
          </tr></thead>
          <tbody>
            ${users.map(u => `<tr>
              <td style="padding:9px 8px;border-bottom:1px solid var(--border);font-weight:500;">${esc(u.name || '—')}</td>
              <td style="padding:9px 8px;border-bottom:1px solid var(--border);color:var(--text-muted);font-size:12px;">${esc(u.email)}</td>
              <td style="padding:9px 8px;border-bottom:1px solid var(--border);">
                ${u.id === currentUid
                  ? `<span style="font-size:11px;color:${roleColour[u.role]};font-weight:600;">${roleLabel[u.role] || u.role} (you)</span>`
                  : `<select class="fi" data-uid="${esc(u.id)}" style="width:110px;padding:4px 6px;font-size:12px;">
                      ${['view','edit','admin'].map(r => `<option value="${r}"${u.role===r?' selected':''}>${roleLabel[r]}</option>`).join('')}
                    </select>`}
              </td>
              <td style="padding:9px 8px;border-bottom:1px solid var(--border);text-align:right;">
                ${u.id !== currentUid
                  ? `<button class="btn btn-ghost btn-xs" data-delete="${esc(u.id)}" data-name="${esc(u.name||u.email)}" style="color:var(--danger-text);border-color:var(--danger-border);">Remove</button>`
                  : ''}
              </td>
            </tr>`).join('')}
          </tbody>
        </table>`;

      // Wire role change dropdowns
      container.querySelectorAll('select[data-uid]').forEach(sel => {
        sel.addEventListener('change', async () => {
          await UserManager.updateUserRole(sel.dataset.uid, sel.value);
        });
      });

      // Wire delete buttons
      container.querySelectorAll('button[data-delete]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm(`Remove ${btn.dataset.name}? They will lose access.`)) return;
          await UserManager.deleteUser(btn.dataset.delete);
          await refreshUsersList();
        });
      });

    } catch(e) {
      container.innerHTML = `<div style="color:var(--danger-text);font-size:13px;">Error loading users: ${e.message}</div>`;
    }
  }

  function esc(s) { return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  return { showLoginScreen, injectUserBar, applyRoleRestrictions };
})();
