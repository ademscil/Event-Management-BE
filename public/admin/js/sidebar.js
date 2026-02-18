/**
 * Sidebar Navigation Module for CSI Portal
 * Handles dynamic menu generation based on user role and active page highlighting
 */

(function(window) {
    'use strict';

    /**
     * Menu items configuration by role
     */
    const MENU_CONFIG = {
        SuperAdmin: [
            {
                label: 'Dashboard',
                icon: '🏠',
                url: 'dashboard',
                id: 'dashboard'
            },
            {
                label: 'Event Management',
                icon: '📊',
                url: 'event-management',
                id: 'survey-management'
            },
            {
                label: 'Master Data',
                icon: '📁',
                id: 'master-data',
                submenu: [
                    {
                        label: 'Master User',
                        url: 'master-user',
                        id: 'master-user'
                    }
                ]
            }
        ],
        AdminEvent: [
            {
                label: 'Dashboard',
                icon: '🏠',
                url: 'dashboard',
                id: 'dashboard'
            },
            {
                label: 'Event Management',
                icon: '📊',
                url: 'event-management',
                id: 'survey-management'
            },
            {
                label: 'Approval',
                icon: '✅',
                url: 'approval-admin',
                id: 'approval-admin'
            },
            {
                label: 'Best Comments',
                icon: '💬',
                url: 'best-comments-admin',
                id: 'best-comments'
            },
            {
                label: 'Reports',
                icon: '📈',
                url: 'report-selection',
                id: 'reports'
            },
            {
                label: 'Master Data',
                icon: '📁',
                id: 'master-data',
                submenu: [
                    {
                        label: 'Business Unit',
                        url: 'master-bu',
                        id: 'master-bu'
                    },
                    {
                        label: 'Division',
                        url: 'master-divisi',
                        id: 'master-divisi'
                    },
                    {
                        label: 'Department',
                        url: 'master-departmentv2',
                        id: 'master-department'
                    },
                    {
                        label: 'Function',
                        url: 'master-function',
                        id: 'master-function'
                    },
                    {
                        label: 'Application',
                        url: 'master-aplikasi',
                        id: 'master-aplikasi'
                    }
                ]
            },
            {
                label: 'Mapping',
                icon: '🔗',
                id: 'mapping',
                submenu: [
                    {
                        label: 'Function - Application',
                        url: 'mapping-function-aplikasi',
                        id: 'mapping-function-app'
                    },
                    {
                        label: 'Department - Application',
                        url: 'mapping-dept-aplikasi',
                        id: 'mapping-dept-app'
                    }
                ]
            }
        ],
        ITLead: [
            {
                label: 'Dashboard',
                icon: '🏠',
                url: 'dashboard',
                id: 'dashboard'
            },
            {
                label: 'Approval IT Lead',
                icon: '✅',
                url: 'approval-it-lead',
                id: 'approval-it-lead'
            }
        ],
        DepartmentHead: [
            {
                label: 'Dashboard',
                icon: '🏠',
                url: 'dashboard',
                id: 'dashboard'
            },
            {
                label: 'Reports',
                icon: '📈',
                url: 'dept-head-review',
                id: 'dept-head-review'
            },
            {
                label: 'Best Comments',
                icon: '💬',
                url: 'best-comments-admin',
                id: 'best-comments'
            }
        ]
    };

    /**
     * Sidebar namespace
     */
    const Sidebar = {
        /**
         * Initialize sidebar
         * @param {string} containerId - ID of the sidebar container element
         */
        init(containerId = 'sidebar') {
            const container = document.getElementById(containerId);
            
            if (!container) {
                console.warn('Sidebar container not found');
                return;
            }

            const user = window.Auth.getUser();
            
            if (!user) {
                console.warn('User not authenticated');
                return;
            }

            // Generate and render menu
            const menuHtml = this.generateMenu(user.role);
            container.innerHTML = menuHtml;

            // Setup event listeners
            this.setupEventListeners();

            // Highlight active page
            this.highlightActivePage();
        },

        /**
         * Generate menu HTML based on user role
         * @param {string} role - User role
         * @returns {string} Menu HTML
         */
        generateMenu(role) {
            const menuItems = MENU_CONFIG[role] || [];
            
            if (menuItems.length === 0) {
                return '<div class="sidebar-empty">No menu items available</div>';
            }

            let html = '<nav class="sidebar-nav">';
            
            menuItems.forEach(item => {
                if (item.submenu) {
                    html += this.generateSubmenu(item);
                } else {
                    html += this.generateMenuItem(item);
                }
            });

            html += '</nav>';
            
            return html;
        },

        /**
         * Generate single menu item HTML
         * @param {Object} item - Menu item configuration
         * @returns {string} Menu item HTML
         */
        generateMenuItem(item) {
            return `
                <a href="${item.url}" class="sidebar-item" data-page-id="${item.id}">
                    <span class="sidebar-icon">${item.icon}</span>
                    <span class="sidebar-label">${item.label}</span>
                </a>
            `;
        },

        /**
         * Generate submenu HTML
         * @param {Object} item - Menu item with submenu
         * @returns {string} Submenu HTML
         */
        generateSubmenu(item) {
            let html = `
                <div class="sidebar-submenu-container">
                    <div class="sidebar-item sidebar-submenu-toggle" data-submenu-id="${item.id}">
                        <span class="sidebar-icon">${item.icon}</span>
                        <span class="sidebar-label">${item.label}</span>
                        <span class="sidebar-arrow">▼</span>
                    </div>
                    <div class="sidebar-submenu" id="submenu-${item.id}">
            `;

            item.submenu.forEach(subitem => {
                html += `
                    <a href="${subitem.url}" class="sidebar-subitem" data-page-id="${subitem.id}">
                        <span class="sidebar-sublabel">${subitem.label}</span>
                    </a>
                `;
            });

            html += `
                    </div>
                </div>
            `;

            return html;
        },

        /**
         * Setup event listeners for sidebar interactions
         */
        setupEventListeners() {
            // Submenu toggle
            const submenuToggles = document.querySelectorAll('.sidebar-submenu-toggle');
            
            submenuToggles.forEach(toggle => {
                toggle.addEventListener('click', (e) => {
                    e.preventDefault();
                    const submenuId = toggle.getAttribute('data-submenu-id');
                    const submenu = document.getElementById(`submenu-${submenuId}`);
                    const arrow = toggle.querySelector('.sidebar-arrow');
                    
                    if (submenu) {
                        submenu.classList.toggle('open');
                        arrow.textContent = submenu.classList.contains('open') ? '▲' : '▼';
                    }
                });
            });
        },

        /**
         * Highlight active page in sidebar
         */
        highlightActivePage() {
            const currentPage = this.getCurrentPageId();
            
            if (!currentPage) {
                return;
            }

            // Remove all active classes
            document.querySelectorAll('.sidebar-item, .sidebar-subitem').forEach(item => {
                item.classList.remove('active');
            });

            // Add active class to current page
            const activeItem = document.querySelector(`[data-page-id="${currentPage}"]`);
            
            if (activeItem) {
                activeItem.classList.add('active');

                // If it's a submenu item, open the parent submenu
                if (activeItem.classList.contains('sidebar-subitem')) {
                    const submenuContainer = activeItem.closest('.sidebar-submenu');
                    if (submenuContainer) {
                        submenuContainer.classList.add('open');
                        const toggle = submenuContainer.previousElementSibling;
                        if (toggle) {
                            const arrow = toggle.querySelector('.sidebar-arrow');
                            if (arrow) {
                                arrow.textContent = '▲';
                            }
                        }
                    }
                }
            }
        },

        /**
         * Get current page ID from URL
         * @returns {string|null} Page ID
         */
        getCurrentPageId() {
            const path = window.location.pathname;
            const filename = path.split('/').pop();
            
            // Map filenames to page IDs
            const pageMap = {
                'dashboard': 'dashboard',
                'survey-management': 'survey-management',
                'event-management': 'survey-management',
                'survey-create': 'survey-create',
                'approval-admin': 'approval-admin',
                'approval-it-lead': 'approval-it-lead',
                'best-comments-admin': 'best-comments',
                'report-selection': 'reports',
                'report': 'reports',
                'dept-head-review': 'dept-head-review',
                'master-user': 'master-user',
                'master-bu': 'master-bu',
                'master-divisi': 'master-divisi',
                'master-departmentv2': 'master-department',
                'master-function': 'master-function',
                'master-aplikasi': 'master-aplikasi',
                'mapping-function-aplikasi': 'mapping-function-app',
                'mapping-dept-aplikasi': 'mapping-dept-app'
            };

            return pageMap[filename] || null;
        },

        /**
         * Refresh sidebar (useful after role changes)
         */
        refresh(containerId = 'sidebar') {
            this.init(containerId);
        }
    };

    // Expose to window
    window.Sidebar = Sidebar;

    // Auto-initialize on DOM ready if sidebar container exists
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            if (document.getElementById('sidebar')) {
                Sidebar.init();
            }
        });
    } else {
        if (document.getElementById('sidebar')) {
            Sidebar.init();
        }
    }

})(window);


