(function () {
  'use strict';

  function toggleMenu(menu) {
    if (!menu) return;
    menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
  }

  function closeMenu(menu) {
    if (!menu) return;
    menu.style.display = 'none';
  }

  async function performLogout() {
    try {
      if (window.Auth && typeof window.Auth.logout === 'function') {
        await window.Auth.logout();
      }
    } catch (_) {
      // Ignore API logout errors and still clear local session.
    } finally {
      localStorage.removeItem('loggedIn');
      localStorage.removeItem('username');
      localStorage.removeItem('userRole');
      localStorage.removeItem('userName');
      if (window.Auth && typeof window.Auth.clearToken === 'function') {
        window.Auth.clearToken();
      }
      window.location.href = 'login';
    }
  }

  function initUserMenu() {
    const userInfo = document.querySelector('.user-info');
    const trigger = document.querySelector('.user-dropdown');
    const menu = document.getElementById('user-dropdown-menu');
    const logoutBtn = menu ? menu.querySelector('.logout-action') : null;

    if (!trigger || !menu) return;

    trigger.addEventListener('click', function (event) {
      event.stopPropagation();
      toggleMenu(menu);
    });

    menu.addEventListener('click', function (event) {
      event.stopPropagation();
    });

    if (logoutBtn) {
      logoutBtn.addEventListener('click', async function (event) {
        event.preventDefault();
        event.stopPropagation();
        await performLogout();
      });
    }

    document.addEventListener('click', function (event) {
      if (!userInfo || !event.target.closest('.user-info')) {
        closeMenu(menu);
      }
    });

    window.toggleUserDropdown = function (event) {
      if (event) event.stopPropagation();
      toggleMenu(menu);
    };

    window.logoutUser = performLogout;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUserMenu);
  } else {
    initUserMenu();
  }
})();
