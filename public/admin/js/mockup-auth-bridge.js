/**
 * Bridge current auth storage to legacy mockup keys.
 * This keeps mockup scripts working with backend JWT auth.
 */
(function(window) {
  'use strict';

  function mapRole(role) {
    switch (role) {
      case 'SuperAdmin': return 'admin_superuser';
      case 'AdminEvent': return 'admin_event';
      case 'ITLead': return 'it_lead';
      case 'DepartmentHead': return 'dept_head';
      default: return '';
    }
  }

  function sync() {
    if (!window.Auth || typeof window.Auth.getUser !== 'function') return;
    const user = window.Auth.getUser();
    if (!user) return;

    localStorage.setItem('loggedIn', 'true');
    localStorage.setItem('username', user.username || '');
    localStorage.setItem('userName', user.displayName || user.username || '');
    localStorage.setItem('userRole', mapRole(user.role));
  }

  window.__syncMockupAuth = sync;
  sync();
})(window);
