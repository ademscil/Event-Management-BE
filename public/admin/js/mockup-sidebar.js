// Sidebar generator - consistent across all pages
(function() {
  'use strict';
  
  function generateSidebar() {
    const userRole = localStorage.getItem('userRole');
    const menuEl = document.getElementById('sidebar-menu');
    const currentPage = decodeURIComponent(window.location.pathname.split('/').pop() || '');
    
    if (!menuEl) return;
    
    const menus = {
      admin_superuser: `
        <li class="menu-title">MAIN</li>
        <li><a href="dashboard">Dashboard</a></li>
        <li class="menu-title">EVENT</li>
        <li><a href="event-management">Event Management</a></li>
        <li class="menu-title">MASTER</li>
        <li><a href="master-user">Master User</a></li>
      `,
      admin_event: `
        <li class="menu-title">MAIN</li>
        <li><a href="dashboard">Dashboard</a></li>
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
        <li><a href="dashboard">Dashboard</a></li>
        <li class="menu-title">APPROVAL</li>
        <li><a href="approval-it-lead">Approval IT Lead</a></li>
      `,
      dept_head: `
        <li class="menu-title">MAIN</li>
        <li><a href="dashboard">Dashboard</a></li>
        <li class="menu-title">EVENT</li>
        <li><a href="report-selection">Report</a></li>
        <li class="menu-title">APPROVAL</li>
        <li><a href="best-comments-admin">Best Comments</a></li>
      `
    };
    
    if (menus[userRole]) {
      menuEl.innerHTML = menus[userRole];
      
      // Set active class
      menuEl.querySelectorAll('a').forEach(link => {
        const href = link.getAttribute('href');
        if (href === currentPage) {
          link.classList.add('active');
        }
      });
    }
  }
  
  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', generateSidebar);
  } else {
    generateSidebar();
  }
})();




