/**
 * Dashboard Module for CSI Portal
 * Handles dashboard statistics display and role-based content
 */

(function(window) {
    'use strict';

    // Configuration
    const API_BASE_URL = '/api/v1';

    /**
     * Dashboard namespace
     */
    const Dashboard = {
        /**
         * Initialize dashboard
         */
        async init() {
            try {
                const user = await window.AuthUtils.redirectIfNotAuthenticated();
                
                if (!user) {
                    return;
                }

                // Display user info
                this.displayUserInfo(user);

                // Load statistics based on role
                await this.loadStatistics(user);

                // Setup event listeners
                this.setupEventListeners();
            } catch (error) {
                console.error('Dashboard initialization error:', error);
                this.showError('Failed to initialize dashboard');
            }
        },

        /**
         * Display user information in header
         * @param {Object} user - User object
         */
        displayUserInfo(user) {
            const userNameEl = document.getElementById('userName');
            const userRoleEl = document.getElementById('userRole');

            if (userNameEl) {
                userNameEl.textContent = user.displayName || user.username;
            }

            if (userRoleEl) {
                userRoleEl.textContent = window.AuthUtils.getUserRoleDisplay();
            }
        },

        /**
         * Load statistics based on user role
         * @param {Object} user - User object
         */
        async loadStatistics(user) {
            const statsContainer = document.getElementById('statsContainer');
            
            if (!statsContainer) {
                return;
            }

            // Show loading state
            statsContainer.innerHTML = '<div class="loading">Loading statistics...</div>';

            try {
                let stats = null;

                // Fetch statistics based on role
                if (window.AuthUtils.isSuperAdmin() || window.AuthUtils.isAdminEvent()) {
                    stats = await this.fetchAdminStatistics();
                    this.renderAdminStatistics(stats, statsContainer);
                } else if (window.AuthUtils.isITLead()) {
                    stats = await this.fetchITLeadStatistics();
                    this.renderITLeadStatistics(stats, statsContainer);
                } else if (window.AuthUtils.isDepartmentHead()) {
                    stats = await this.fetchDepartmentHeadStatistics();
                    this.renderDepartmentHeadStatistics(stats, statsContainer);
                }
            } catch (error) {
                console.error('Error loading statistics:', error);
                statsContainer.innerHTML = '<div class="error">Failed to load statistics</div>';
            }
        },

        /**
         * Fetch admin statistics from API
         * @returns {Promise<Object>} Statistics data
         */
        async fetchAdminStatistics() {
            const response = await window.AuthUtils.authenticatedFetch(`${API_BASE_URL}/dashboard/admin-stats`);
            
            if (!response.ok) {
                throw new Error('Failed to fetch admin statistics');
            }

            return await response.json();
        },

        /**
         * Fetch IT Lead statistics from API
         * @returns {Promise<Object>} Statistics data
         */
        async fetchITLeadStatistics() {
            const response = await window.AuthUtils.authenticatedFetch(`${API_BASE_URL}/dashboard/it-lead-stats`);
            
            if (!response.ok) {
                throw new Error('Failed to fetch IT Lead statistics');
            }

            return await response.json();
        },

        /**
         * Fetch Department Head statistics from API
         * @returns {Promise<Object>} Statistics data
         */
        async fetchDepartmentHeadStatistics() {
            const response = await window.AuthUtils.authenticatedFetch(`${API_BASE_URL}/dashboard/dept-head-stats`);
            
            if (!response.ok) {
                throw new Error('Failed to fetch Department Head statistics');
            }

            return await response.json();
        },

        /**
         * Render admin statistics
         * @param {Object} stats - Statistics data
         * @param {HTMLElement} container - Container element
         */
        renderAdminStatistics(stats, container) {
            const html = `
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-icon">📊</div>
                        <div class="stat-content">
                            <div class="stat-value">${stats.totalSurveys || 0}</div>
                            <div class="stat-label">Total Surveys</div>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">✅</div>
                        <div class="stat-content">
                            <div class="stat-value">${stats.activeSurveys || 0}</div>
                            <div class="stat-label">Active Surveys</div>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">⏳</div>
                        <div class="stat-content">
                            <div class="stat-value">${stats.pendingApprovals || 0}</div>
                            <div class="stat-label">Pending Approvals</div>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">📝</div>
                        <div class="stat-content">
                            <div class="stat-value">${stats.totalResponses || 0}</div>
                            <div class="stat-label">Total Responses</div>
                        </div>
                    </div>
                </div>
            `;

            container.innerHTML = html;
        },

        /**
         * Render IT Lead statistics
         * @param {Object} stats - Statistics data
         * @param {HTMLElement} container - Container element
         */
        renderITLeadStatistics(stats, container) {
            const html = `
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-icon">⏳</div>
                        <div class="stat-content">
                            <div class="stat-value">${stats.pendingApprovals || 0}</div>
                            <div class="stat-label">Pending Approvals</div>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">✅</div>
                        <div class="stat-content">
                            <div class="stat-value">${stats.approvedCount || 0}</div>
                            <div class="stat-label">Approved</div>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">❌</div>
                        <div class="stat-content">
                            <div class="stat-value">${stats.rejectedCount || 0}</div>
                            <div class="stat-label">Rejected</div>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">📊</div>
                        <div class="stat-content">
                            <div class="stat-value">${stats.assignedFunctions || 0}</div>
                            <div class="stat-label">Assigned Functions</div>
                        </div>
                    </div>
                </div>
            `;

            container.innerHTML = html;
        },

        /**
         * Render Department Head statistics
         * @param {Object} stats - Statistics data
         * @param {HTMLElement} container - Container element
         */
        renderDepartmentHeadStatistics(stats, container) {
            const html = `
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-icon">📊</div>
                        <div class="stat-content">
                            <div class="stat-value">${stats.activeSurveys || 0}</div>
                            <div class="stat-label">Active Surveys</div>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">📝</div>
                        <div class="stat-content">
                            <div class="stat-value">${stats.totalResponses || 0}</div>
                            <div class="stat-label">Total Responses</div>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">⭐</div>
                        <div class="stat-content">
                            <div class="stat-value">${stats.averageScore ? stats.averageScore.toFixed(1) : '0.0'}</div>
                            <div class="stat-label">Average Score</div>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">💬</div>
                        <div class="stat-content">
                            <div class="stat-value">${stats.bestCommentsCount || 0}</div>
                            <div class="stat-label">Best Comments</div>
                        </div>
                    </div>
                </div>
            `;

            container.innerHTML = html;
        },

        /**
         * Setup event listeners
         */
        setupEventListeners() {
            // Logout button
            const logoutBtn = document.getElementById('logoutBtn');
            if (logoutBtn) {
                logoutBtn.addEventListener('click', async () => {
                    await window.Auth.logout();
                    window.location.href = 'login';
                });
            }

            // Refresh button
            const refreshBtn = document.getElementById('refreshBtn');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', async () => {
                    const user = window.Auth.getUser();
                    if (user) {
                        await this.loadStatistics(user);
                    }
                });
            }
        },

        /**
         * Show error message
         * @param {string} message - Error message
         */
        showError(message) {
            const container = document.getElementById('statsContainer');
            if (container) {
                container.innerHTML = `<div class="error">${message}</div>`;
            }
        }
    };

    // Expose to window
    window.Dashboard = Dashboard;

    // Auto-initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => Dashboard.init());
    } else {
        Dashboard.init();
    }

})(window);

