// Dashboard specific functionality
(function() {
  'use strict';
  
  // Check authentication and redirect based on role
  function checkAuth() {
    const userName = localStorage.getItem('userName');
    const userRole = localStorage.getItem('userRole');
    
    if (!userName) {
      window.location.href = 'login';
      return false;
    }
    
    // Update user display
    const userDisplay = document.getElementById('user-display');
    if (userDisplay) {
      userDisplay.textContent = userName;
    }
    
    return true;
  }
  
  // Generate sidebar menu based on role
  function generateSidebar() {
    const userRole = localStorage.getItem('userRole');
    const menuEl = document.getElementById('sidebar-menu');
    
    if (!menuEl) return;
    
    const menus = {
      admin_superuser: `
        <li class="menu-title">MAIN</li>
        <li><a href="dashboard" class="active">Dashboard</a></li>
        <li class="menu-title">EVENT</li>
        <li><a href="event-management">Event Management</a></li>
        <li class="menu-title">MASTER</li>
        <li><a href="master-user">Master User</a></li>
      `,
      admin_event: `
        <li class="menu-title">MAIN</li>
        <li><a href="dashboard" class="active">Dashboard</a></li>
        <li class="menu-title">EVENT</li>
        <li><a href="event-management">Event Management</a></li>
        <li><a href="report-selection">Report</a></li>
        <li class="menu-title">APPROVAL</li>
        <li><a href="approval-admin">Approval Admin</a></li>
        <li><a href="best-comments-admin">Best Comments</a></li>
        <li class="menu-title">MASTER</li>
        <li><a href="master-bu">Master BU</a></li>
        <li><a href="master-divisi">Master Divisi</a></li>
        <li><a href="master-departmentv2">Master Department</a></li>
        <li><a href="master-function">Master Function</a></li>
        <li><a href="master-aplikasi">Master Aplikasi</a></li>
        <li class="menu-title">MAPPING</li>
        <li><a href="mapping-dept-aplikasi">Dept -> Aplikasi</a></li>
        <li><a href="mapping-function-aplikasi">Function -> Aplikasi</a></li>
      `,
      it_lead: `
        <li class="menu-title">MAIN</li>
        <li><a href="dashboard" class="active">Dashboard</a></li>
        <li class="menu-title">APPROVAL</li>
        <li><a href="approval-it-lead">Approval IT Lead</a></li>
      `,
      dept_head: `
        <li class="menu-title">MAIN</li>
        <li><a href="dashboard" class="active">Dashboard</a></li>
        <li class="menu-title">EVENT</li>
        <li><a href="report-selection">Report</a></li>
        <li class="menu-title">APPROVAL</li>
        <li><a href="best-comments-admin">Best Comments</a></li>
      `
    };
    
    if (menus[userRole]) {
      menuEl.innerHTML = menus[userRole];
    }
  }
  
  // Handle role-based UI visibility
  function handleRoleBasedUI() {
    const userRole = localStorage.getItem('userRole');
    
    // Hide action buttons for dept_head
    if (userRole === 'dept_head') {
      // Hide all action buttons
      document.querySelectorAll('.btn-edit, .btn-primary, .btn-secondary, .btn-approve, .btn-reject, .page-actions').forEach(el => {
        el.style.display = 'none';
      });
      
      // Hide Aksi column
      document.querySelectorAll('.survey-action-col').forEach(col => col.style.display = 'none');
    }
    
    // Hide Aksi column for admin_superuser only
    if (userRole === 'admin_superuser') {
      const tables = document.querySelectorAll('table.table');
      tables.forEach(table => {
        // Hide Aksi header
        const headers = table.querySelectorAll('thead th');
        headers.forEach((th, index) => {
          if (th.textContent.trim() === 'Aksi') {
            th.style.display = 'none';
            // Hide corresponding cells in tbody
            const rows = table.querySelectorAll('tbody tr');
            rows.forEach(row => {
              const cell = row.cells[index];
              if (cell) cell.style.display = 'none';
            });
          }
        });
      });
    }
  }
  
  // Initialize dashboard
  function init() {
    if (checkAuth()) {
      generateSidebar();
      handleRoleBasedUI();
    }
  }
  
  // Run when DOM is loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();




