/**
 * Department Head Review Module for CSI Portal
 * Handles Department Head review functionality with two tabs
 */

(function(window) {
    'use strict';

    const API_BASE_URL = '/api/v1';

    /**
     * DeptHeadReview namespace
     */
    const DeptHeadReview = {
        user: null,
        surveys: [],
        functions: [],
        applications: [],
        selectedSurveyId: null,
        scores: [],
        takeouts: [],
        comments: [],

        /**
         * Initialize Department Head review page
         */
        async init() {
            this.user = window.Auth.getUser();
            
            if (!this.user || !this.user.departmentId) {
                alert('Department information not found');
                return;
            }

            await this.loadSurveys();
            await this.loadFunctions();
            await this.loadApplications();
            this.setupEventListeners();
            this.setupTabs();
        },

        /**
         * Load surveys
         */
        async loadSurveys() {
            try {
                const response = await window.AuthUtils.authenticatedFetch(
                    `${API_BASE_URL}/surveys`
                );

                if (response.ok) {
                    const data = await response.json();
                    this.surveys = data.surveys || [];
                    this.populateSurveySelect();
                } else {
                    console.error('Failed to load surveys');
                }
            } catch (error) {
                console.error('Error loading surveys:', error);
            }
        },

        /**
         * Load functions
         */
        async loadFunctions() {
            try {
                const response = await window.AuthUtils.authenticatedFetch(
                    `${API_BASE_URL}/functions`
                );

                if (response.ok) {
                    const data = await response.json();
                    this.functions = data.functions || [];
                    this.populateFunctionFilters();
                } else {
                    console.error('Failed to load functions');
                }
            } catch (error) {
                console.error('Error loading functions:', error);
            }
        },

        /**
         * Load applications
         */
        async loadApplications() {
            try {
                const response = await window.AuthUtils.authenticatedFetch(
                    `${API_BASE_URL}/applications`
                );

                if (response.ok) {
                    const data = await response.json();
                    this.applications = data.applications || [];
                    this.populateApplicationFilter();
                } else {
                    console.error('Failed to load applications');
                }
            } catch (error) {
                console.error('Error loading applications:', error);
            }
        },

        /**
         * Populate survey select
         */
        populateSurveySelect() {
            const select = document.getElementById('survey-select');
            
            if (!select) return;

            select.innerHTML = '<option value="">Select Survey</option>' +
                this.surveys.map(survey => 
                    `<option value="${survey.SurveyId}">${this.escapeHtml(survey.Title)}</option>`
                ).join('');
        },

        /**
         * Populate function filters
         */
        populateFunctionFilters() {
            const filters = [
                document.getElementById('filter-function'),
                document.getElementById('filter-comment-function')
            ];

            filters.forEach(select => {
                if (select) {
                    select.innerHTML = '<option value="">All Functions</option>' +
                        this.functions.map(func => 
                            `<option value="${func.FunctionId}">${this.escapeHtml(func.Name)}</option>`
                        ).join('');
                }
            });
        },

        /**
         * Populate application filter
         */
        populateApplicationFilter() {
            const select = document.getElementById('filter-application');
            
            if (!select) return;

            select.innerHTML = '<option value="">All Applications</option>' +
                this.applications.map(app => 
                    `<option value="${app.ApplicationId}">${this.escapeHtml(app.Name)}</option>`
                ).join('');
        },

        /**
         * Setup event listeners
         */
        setupEventListeners() {
            // Survey selection
            const surveySelect = document.getElementById('survey-select');
            if (surveySelect) {
                surveySelect.addEventListener('change', (e) => {
                    this.selectedSurveyId = e.target.value;
                    if (this.selectedSurveyId) {
                        this.loadReviewData();
                    }
                });
            }

            // Takeout filters
            const applyTakeoutBtn = document.getElementById('apply-takeout-filter-btn');
            const resetTakeoutBtn = document.getElementById('reset-takeout-filter-btn');

            if (applyTakeoutBtn) {
                applyTakeoutBtn.addEventListener('click', () => this.applyTakeoutFilter());
            }

            if (resetTakeoutBtn) {
                resetTakeoutBtn.addEventListener('click', () => this.resetTakeoutFilter());
            }

            // Comment filters
            const applyCommentBtn = document.getElementById('apply-comment-filter-btn');
            const resetCommentBtn = document.getElementById('reset-comment-filter-btn');

            if (applyCommentBtn) {
                applyCommentBtn.addEventListener('click', () => this.applyCommentFilter());
            }

            if (resetCommentBtn) {
                resetCommentBtn.addEventListener('click', () => this.resetCommentFilter());
            }
        },

        /**
         * Setup tabs
         */
        setupTabs() {
            const tabBtns = document.querySelectorAll('.tab-btn');
            
            tabBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const tabName = btn.getAttribute('data-tab');
                    this.switchTab(tabName);
                });
            });
        },

        /**
         * Switch tab
         */
        switchTab(tabName) {
            // Update tab buttons
            document.querySelectorAll('.tab-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

            // Update tab content
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(`tab-${tabName}`).classList.add('active');
        },

        /**
         * Load review data
         */
        async loadReviewData() {
            if (!this.selectedSurveyId || !this.user.departmentId) return;

            await Promise.all([
                this.loadScores(),
                this.loadTakeouts(),
                this.loadComments()
            ]);
        },

        /**
         * Load scores by function
         */
        async loadScores() {
            try {
                const response = await window.AuthUtils.authenticatedFetch(
                    `${API_BASE_URL}/reports/scores-by-function/${this.user.departmentId}/${this.selectedSurveyId}`
                );

                if (response.ok) {
                    const data = await response.json();
                    this.scores = data.scores || [];
                    this.renderScores();
                } else {
                    console.error('Failed to load scores');
                }
            } catch (error) {
                console.error('Error loading scores:', error);
            }
        },

        /**
         * Load approved takeouts
         */
        async loadTakeouts() {
            try {
                const response = await window.AuthUtils.authenticatedFetch(
                    `${API_BASE_URL}/reports/approved-takeouts/${this.user.departmentId}/${this.selectedSurveyId}`
                );

                if (response.ok) {
                    const data = await response.json();
                    this.takeouts = data.takeouts || [];
                    this.renderTakeouts(this.takeouts);
                } else {
                    console.error('Failed to load takeouts');
                }
            } catch (error) {
                console.error('Error loading takeouts:', error);
            }
        },

        /**
         * Load best comments
         */
        async loadComments() {
            try {
                const response = await window.AuthUtils.authenticatedFetch(
                    `${API_BASE_URL}/approval/best-comments?surveyId=${this.selectedSurveyId}&departmentId=${this.user.departmentId}`
                );

                if (response.ok) {
                    const data = await response.json();
                    this.comments = data.comments || [];
                    this.renderComments(this.comments);
                } else {
                    console.error('Failed to load comments');
                }
            } catch (error) {
                console.error('Error loading comments:', error);
            }
        },

        /**
         * Render scores
         */
        renderScores() {
            const tbody = document.getElementById('scores-tbody');
            
            if (!tbody) return;

            if (this.scores.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No data available</td></tr>';
                return;
            }

            tbody.innerHTML = this.scores.map(score => `
                <tr>
                    <td>${this.escapeHtml(score.functionName)}</td>
                    <td class="text-center">${(score.averageScore || 0).toFixed(2)}</td>
                    <td class="text-center">${(score.targetScore || 0).toFixed(2)}</td>
                    <td class="text-center">${this.renderStatusBadge(score.status)}</td>
                </tr>
            `).join('');
        },

        /**
         * Render takeouts
         */
        renderTakeouts(takeouts) {
            const tbody = document.getElementById('takeouts-tbody');
            
            if (!tbody) return;

            if (takeouts.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No takeouts found</td></tr>';
                return;
            }

            tbody.innerHTML = takeouts.map(takeout => `
                <tr>
                    <td>${this.anonymizeRespondent(takeout.respondentEmail)}</td>
                    <td>${this.escapeHtml(takeout.functionName)}</td>
                    <td>${this.escapeHtml(takeout.applicationName)}</td>
                    <td>${this.escapeHtml(takeout.questionText)}</td>
                    <td>${this.escapeHtml(takeout.reason)}</td>
                    <td>${this.escapeHtml(takeout.approvedBy)}</td>
                </tr>
            `).join('');
        },

        /**
         * Render comments
         */
        renderComments(comments) {
            const tbody = document.getElementById('comments-tbody');
            
            if (!tbody) return;

            if (comments.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No comments found</td></tr>';
                return;
            }

            tbody.innerHTML = comments.map(comment => `
                <tr>
                    <td>${this.escapeHtml(comment.functionName)}</td>
                    <td>${this.escapeHtml(comment.commentText)}</td>
                    <td>${this.escapeHtml(comment.itLeadName || '-')}</td>
                    <td>${this.escapeHtml(comment.feedback || '-')}</td>
                </tr>
            `).join('');
        },

        /**
         * Apply takeout filter
         */
        applyTakeoutFilter() {
            const functionId = document.getElementById('filter-function').value;
            const applicationId = document.getElementById('filter-application').value;

            let filtered = this.takeouts;

            if (functionId) {
                filtered = filtered.filter(t => t.functionId == functionId);
            }

            if (applicationId) {
                filtered = filtered.filter(t => t.applicationId == applicationId);
            }

            this.renderTakeouts(filtered);
        },

        /**
         * Reset takeout filter
         */
        resetTakeoutFilter() {
            document.getElementById('filter-function').value = '';
            document.getElementById('filter-application').value = '';
            this.renderTakeouts(this.takeouts);
        },

        /**
         * Apply comment filter
         */
        applyCommentFilter() {
            const functionId = document.getElementById('filter-comment-function').value;

            let filtered = this.comments;

            if (functionId) {
                filtered = filtered.filter(c => c.functionId == functionId);
            }

            this.renderComments(filtered);
        },

        /**
         * Reset comment filter
         */
        resetCommentFilter() {
            document.getElementById('filter-comment-function').value = '';
            this.renderComments(this.comments);
        },

        /**
         * Render status badge
         */
        renderStatusBadge(status) {
            if (status === 'On Track') {
                return '<span class="badge badge-success">On Track</span>';
            } else if (status === 'Below Target') {
                return '<span class="badge badge-danger">Below Target</span>';
            } else {
                return '<span class="badge badge-secondary">-</span>';
            }
        },

        /**
         * Anonymize respondent
         */
        anonymizeRespondent(email) {
            if (!email) return 'Anonymous';
            
            const parts = email.split('@');
            if (parts.length !== 2) return 'Anonymous';
            
            const username = parts[0];
            const domain = parts[1];
            
            if (username.length <= 2) {
                return `${username[0]}***@${domain}`;
            }
            
            return `${username.substring(0, 2)}***@${domain}`;
        },

        /**
         * Escape HTML
         */
        escapeHtml(text) {
            if (!text) return '';
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
    };

    // Expose to window
    window.DeptHeadReview = DeptHeadReview;

})(window);
