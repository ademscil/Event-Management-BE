/**
 * CSI Portal - Approval Management Module
 * Handles approval workflow operations for Admin Event and IT Lead roles
 */

(function() {
    'use strict';

    // API base URL
    const API_BASE = '/api/v1';

    /**
     * Approval Management Namespace
     */
    window.ApprovalManager = {
        // Current filters
        currentFilters: {
            surveyId: null,
            functionId: null,
            applicationId: null,
            departmentId: null,
            rating: null,
            duplicateFilter: 'all' // all, duplicate, unique
        },

        /**
         * Initialize approval page
         */
        init: function() {
            this.setupEventListeners();
            this.loadFilters();
        },

        /**
         * Setup event listeners
         */
        setupEventListeners: function() {
            // Tab switching
            document.querySelectorAll('.tab-btn').forEach(btn => {
                btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
            });

            // Filter changes
            document.getElementById('filter-survey')?.addEventListener('change', () => this.applyFilters());
            document.getElementById('filter-function')?.addEventListener('change', () => this.applyFilters());
            document.getElementById('filter-application')?.addEventListener('change', () => this.applyFilters());
            document.getElementById('filter-department')?.addEventListener('change', () => this.applyFilters());
            document.getElementById('filter-rating')?.addEventListener('change', () => this.applyFilters());
            document.getElementById('filter-duplicate')?.addEventListener('change', () => this.applyFilters());

            // Bulk actions
            document.getElementById('btn-bulk-propose')?.addEventListener('click', () => this.bulkProposeTakeout());
            document.getElementById('btn-bulk-approve')?.addEventListener('click', () => this.bulkApprove());
            document.getElementById('btn-bulk-reject')?.addEventListener('click', () => this.bulkReject());
            document.getElementById('btn-export-excel')?.addEventListener('click', () => this.exportToExcel());

            // Select all checkbox
            document.getElementById('select-all')?.addEventListener('change', (e) => this.toggleSelectAll(e.target.checked));
        },

        /**
         * Switch between tabs
         */
        switchTab: function(tabName) {
            // Update tab buttons
            document.querySelectorAll('.tab-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.tab === tabName);
            });

            // Update tab content
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.toggle('active', content.id === `tab-${tabName}`);
            });

            // Load data for the active tab
            if (tabName === 'respondents') {
                this.loadRespondents();
            } else if (tabName === 'propose-takeout') {
                this.loadProposeTakeout();
            } else if (tabName === 'pending-approvals') {
                this.loadPendingApprovals();
            } else if (tabName === 'best-comments-feedback') {
                this.loadBestCommentsFeedback();
            } else if (tabName === 'view-comments') {
                this.loadComments();
            } else if (tabName === 'view-best-comments') {
                this.loadBestComments();
            }
        },

        /**
         * Load filter options
         */
        loadFilters: async function() {
            try {
                // Load surveys
                const surveys = await this.apiCall('/surveys');
                this.populateSelect('filter-survey', surveys, 'SurveyId', 'Title');

                // Load functions
                const functions = await this.apiCall('/functions');
                this.populateSelect('filter-function', functions, 'FunctionId', 'FunctionName');

                // Load applications
                const applications = await this.apiCall('/applications');
                this.populateSelect('filter-application', applications, 'ApplicationId', 'ApplicationName');

                // Load departments
                const departments = await this.apiCall('/departments');
                this.populateSelect('filter-department', departments, 'DepartmentId', 'DepartmentName');

            } catch (error) {
                console.error('Error loading filters:', error);
            }
        },

        /**
         * Populate select dropdown
         */
        populateSelect: function(selectId, items, valueField, textField) {
            const select = document.getElementById(selectId);
            if (!select) return;

            select.innerHTML = '<option value="">All</option>';
            items.forEach(item => {
                const option = document.createElement('option');
                option.value = item[valueField];
                option.textContent = item[textField];
                select.appendChild(option);
            });
        },

        /**
         * Apply filters
         */
        applyFilters: function() {
            this.currentFilters = {
                surveyId: document.getElementById('filter-survey')?.value || null,
                functionId: document.getElementById('filter-function')?.value || null,
                applicationId: document.getElementById('filter-application')?.value || null,
                departmentId: document.getElementById('filter-department')?.value || null,
                rating: document.getElementById('filter-rating')?.value || null,
                duplicateFilter: document.getElementById('filter-duplicate')?.value || 'all'
            };

            // Reload current tab data
            const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab;
            this.switchTab(activeTab);
        },

        /**
         * Load respondents list (Tab 1 for Admin Event)
         */
        loadRespondents: async function() {
            try {
                const params = new URLSearchParams();
                if (this.currentFilters.surveyId) params.append('surveyId', this.currentFilters.surveyId);
                if (this.currentFilters.functionId) params.append('functionId', this.currentFilters.functionId);
                params.append('duplicateFilter', this.currentFilters.duplicateFilter);

                const respondents = await this.apiCall(`/approvals/respondents?${params}`);
                this.renderRespondentsTable(respondents);
            } catch (error) {
                console.error('Error loading respondents:', error);
                this.showError('Failed to load respondents');
            }
        },

        /**
         * Render respondents table
         */
        renderRespondentsTable: function(respondents) {
            const tbody = document.getElementById('respondents-tbody');
            if (!tbody) return;

            if (!respondents || respondents.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" class="text-center">No respondents found</td></tr>';
                return;
            }

            tbody.innerHTML = respondents.map(r => `
                <tr>
                    <td><input type="checkbox" class="respondent-checkbox" data-response-id="${r.ResponseId}"></td>
                    <td>${this.escapeHtml(r.RespondentName)}</td>
                    <td>${this.escapeHtml(r.RespondentEmail)}</td>
                    <td>${this.escapeHtml(r.DepartmentName)}</td>
                    <td>${this.escapeHtml(r.ApplicationName)}</td>
                    <td>${new Date(r.SubmittedAt).toLocaleDateString()}</td>
                    <td><span class="badge badge-${r.IsDuplicate ? 'warning' : 'success'}">${r.IsDuplicate ? 'Duplicate' : 'Unique'}</span></td>
                    <td>
                        <button class="btn btn-sm btn-primary" onclick="ApprovalManager.viewRespondentDetail(${r.ResponseId})">
                            View Detail
                        </button>
                    </td>
                </tr>
            `).join('');
        },

        /**
         * Load propose takeout data (Tab 2 for Admin Event)
         */
        loadProposeTakeout: async function() {
            try {
                const params = new URLSearchParams();
                if (this.currentFilters.surveyId) params.append('surveyId', this.currentFilters.surveyId);
                if (this.currentFilters.functionId) params.append('functionId', this.currentFilters.functionId);
                if (this.currentFilters.applicationId) params.append('applicationId', this.currentFilters.applicationId);
                if (this.currentFilters.departmentId) params.append('departmentId', this.currentFilters.departmentId);
                if (this.currentFilters.rating) params.append('rating', this.currentFilters.rating);

                const responses = await this.apiCall(`/approvals/propose-takeout-data?${params}`);
                this.renderProposeTakeoutTable(responses);
            } catch (error) {
                console.error('Error loading propose takeout data:', error);
                this.showError('Failed to load propose takeout data');
            }
        },

        /**
         * Render propose takeout table
         */
        renderProposeTakeoutTable: function(responses) {
            const tbody = document.getElementById('propose-takeout-tbody');
            if (!tbody) return;

            if (!responses || responses.length === 0) {
                tbody.innerHTML = '<tr><td colspan="9" class="text-center">No responses found</td></tr>';
                return;
            }

            tbody.innerHTML = responses.map(r => `
                <tr>
                    <td>${this.escapeHtml(r.RespondentName)}</td>
                    <td>${this.escapeHtml(r.RespondentEmail)}</td>
                    <td>${this.escapeHtml(r.DepartmentName)}</td>
                    <td>${this.escapeHtml(r.ApplicationName)}</td>
                    ${r.Questions.map(q => `
                        <td>
                            <input type="checkbox" class="question-checkbox" 
                                data-response-id="${r.ResponseId}" 
                                data-question-id="${q.QuestionId}"
                                ${q.TakeoutStatus === 'ProposedTakeout' ? 'checked' : ''}>
                            <span class="score-link" onclick="ApprovalManager.viewQuestionDetail(${r.ResponseId}, ${q.QuestionId})">
                                ${q.Score || 'N/A'}
                            </span>
                            <span class="badge badge-${this.getStatusBadgeClass(q.TakeoutStatus)}">${q.TakeoutStatus}</span>
                        </td>
                    `).join('')}
                </tr>
            `).join('');
        },

        /**
         * Load pending approvals for IT Lead (Tab 1)
         */
        loadPendingApprovals: async function() {
            try {
                const params = new URLSearchParams();
                if (this.currentFilters.surveyId) params.append('surveyId', this.currentFilters.surveyId);
                if (this.currentFilters.functionId) params.append('functionId', this.currentFilters.functionId);

                const approvals = await this.apiCall(`/approvals/pending?${params}`);
                this.renderPendingApprovalsTable(approvals);
            } catch (error) {
                console.error('Error loading pending approvals:', error);
                this.showError('Failed to load pending approvals');
            }
        },

        /**
         * Render pending approvals table
         */
        renderPendingApprovalsTable: function(approvals) {
            const tbody = document.getElementById('pending-approvals-tbody');
            if (!tbody) return;

            if (!approvals || approvals.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" class="text-center">No pending approvals found</td></tr>';
                return;
            }

            tbody.innerHTML = approvals.map(a => `
                <tr>
                    <td><input type="checkbox" class="approval-checkbox" data-response-id="${a.ResponseId}" data-question-id="${a.QuestionId}"></td>
                    <td>${this.escapeHtml(a.RespondentName)}</td>
                    <td>${this.escapeHtml(a.QuestionText)}</td>
                    <td>${a.Score || 'N/A'}</td>
                    <td>${this.escapeHtml(a.ProposalReason)}</td>
                    <td>${new Date(a.ProposedAt).toLocaleDateString()}</td>
                    <td>
                        <button class="btn btn-sm btn-success" onclick="ApprovalManager.approveQuestion(${a.ResponseId}, ${a.QuestionId})">
                            Approve
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="ApprovalManager.rejectQuestion(${a.ResponseId}, ${a.QuestionId})">
                            Reject
                        </button>
                    </td>
                </tr>
            `).join('');
        },

        /**
         * Load best comments feedback (Tab 2 for IT Lead)
         */
        loadBestCommentsFeedback: async function() {
            try {
                const bestComments = await this.apiCall('/approvals/best-comments');
                this.renderBestCommentsFeedbackTable(bestComments);
            } catch (error) {
                console.error('Error loading best comments:', error);
                this.showError('Failed to load best comments');
            }
        },

        /**
         * Render best comments feedback table
         */
        renderBestCommentsFeedbackTable: function(comments) {
            const tbody = document.getElementById('best-comments-feedback-tbody');
            if (!tbody) return;

            if (!comments || comments.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center">No best comments found</td></tr>';
                return;
            }

            tbody.innerHTML = comments.map(c => `
                <tr>
                    <td>${this.escapeHtml(c.SurveyTitle)}</td>
                    <td>${this.escapeHtml(c.FunctionName)}</td>
                    <td>${this.escapeHtml(c.CommentText)}</td>
                    <td>
                        <textarea class="form-control" id="feedback-${c.QuestionResponseId}" rows="2" placeholder="Enter feedback...">${c.Feedback || ''}</textarea>
                    </td>
                    <td>
                        <button class="btn btn-sm btn-primary" onclick="ApprovalManager.submitFeedback(${c.QuestionResponseId})">
                            Submit
                        </button>
                    </td>
                </tr>
            `).join('');
        },

        /**
         * Load comments for selection (Tab 1 for Best Comments page)
         */
        loadComments: async function() {
            try {
                const params = new URLSearchParams();
                if (this.currentFilters.surveyId) params.append('surveyId', this.currentFilters.surveyId);
                if (this.currentFilters.functionId) params.append('functionId', this.currentFilters.functionId);

                const comments = await this.apiCall(`/approvals/comments?${params}`);
                this.renderCommentsTable(comments);
            } catch (error) {
                console.error('Error loading comments:', error);
                this.showError('Failed to load comments');
            }
        },

        /**
         * Render comments table
         */
        renderCommentsTable: function(comments) {
            const tbody = document.getElementById('comments-tbody');
            if (!tbody) return;

            if (!comments || comments.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center">No comments found</td></tr>';
                return;
            }

            tbody.innerHTML = comments.map(c => `
                <tr>
                    <td><input type="checkbox" class="comment-checkbox" data-response-id="${c.ResponseId}" data-question-id="${c.QuestionId}"></td>
                    <td>${this.escapeHtml(c.SurveyTitle)}</td>
                    <td>${this.escapeHtml(c.FunctionName)}</td>
                    <td>${this.escapeHtml(c.RespondentName)}</td>
                    <td>${this.escapeHtml(c.CommentText)}</td>
                    <td>${c.Rating || 'N/A'}</td>
                </tr>
            `).join('');
        },

        /**
         * Load best comments with feedback (Tab 2 for Best Comments page)
         */
        loadBestComments: async function() {
            try {
                const bestComments = await this.apiCall('/approvals/best-comments-with-feedback');
                this.renderBestCommentsTable(bestComments);
            } catch (error) {
                console.error('Error loading best comments:', error);
                this.showError('Failed to load best comments');
            }
        },

        /**
         * Render best comments table
         */
        renderBestCommentsTable: function(comments) {
            const tbody = document.getElementById('best-comments-tbody');
            if (!tbody) return;

            if (!comments || comments.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center">No best comments found</td></tr>';
                return;
            }

            tbody.innerHTML = comments.map(c => `
                <tr>
                    <td>${this.escapeHtml(c.SurveyTitle)}</td>
                    <td>${this.escapeHtml(c.FunctionName)}</td>
                    <td>${this.escapeHtml(c.CommentText)}</td>
                    <td>${this.escapeHtml(c.ITLeadName || 'N/A')}</td>
                    <td>${this.escapeHtml(c.Feedback || 'No feedback yet')}</td>
                </tr>
            `).join('');
        },

        /**
         * Bulk propose takeout
         */
        bulkProposeTakeout: async function() {
            const checkboxes = document.querySelectorAll('.question-checkbox:checked');
            if (checkboxes.length === 0) {
                this.showError('Please select at least one question');
                return;
            }

            const reason = prompt('Enter reason for takeout:');
            if (!reason) return;

            const items = Array.from(checkboxes).map(cb => ({
                responseId: parseInt(cb.dataset.responseId),
                questionId: parseInt(cb.dataset.questionId)
            }));

            try {
                await this.apiCall('/approvals/bulk-propose-takeout', 'POST', {
                    items,
                    reason
                });

                this.showSuccess('Takeout proposed successfully');
                this.loadProposeTakeout();
            } catch (error) {
                console.error('Error proposing takeout:', error);
                this.showError('Failed to propose takeout');
            }
        },

        /**
         * Bulk approve
         */
        bulkApprove: async function() {
            const checkboxes = document.querySelectorAll('.approval-checkbox:checked');
            if (checkboxes.length === 0) {
                this.showError('Please select at least one item');
                return;
            }

            const reason = prompt('Enter reason for approval (optional):');

            const items = Array.from(checkboxes).map(cb => ({
                responseId: parseInt(cb.dataset.responseId),
                questionId: parseInt(cb.dataset.questionId)
            }));

            try {
                await this.apiCall('/approvals/bulk-approve', 'POST', {
                    items,
                    reason
                });

                this.showSuccess('Approved successfully');
                this.loadPendingApprovals();
            } catch (error) {
                console.error('Error approving:', error);
                this.showError('Failed to approve');
            }
        },

        /**
         * Bulk reject
         */
        bulkReject: async function() {
            const checkboxes = document.querySelectorAll('.approval-checkbox:checked');
            if (checkboxes.length === 0) {
                this.showError('Please select at least one item');
                return;
            }

            const reason = prompt('Enter reason for rejection (required):');
            if (!reason) {
                this.showError('Reason is required for rejection');
                return;
            }

            const items = Array.from(checkboxes).map(cb => ({
                responseId: parseInt(cb.dataset.responseId),
                questionId: parseInt(cb.dataset.questionId)
            }));

            try {
                await this.apiCall('/approvals/bulk-reject', 'POST', {
                    items,
                    reason
                });

                this.showSuccess('Rejected successfully');
                this.loadPendingApprovals();
            } catch (error) {
                console.error('Error rejecting:', error);
                this.showError('Failed to reject');
            }
        },

        /**
         * Approve single question
         */
        approveQuestion: async function(responseId, questionId) {
            const reason = prompt('Enter reason for approval (optional):');

            try {
                await this.apiCall('/approvals/approve', 'POST', {
                    responseId,
                    questionId,
                    reason
                });

                this.showSuccess('Approved successfully');
                this.loadPendingApprovals();
            } catch (error) {
                console.error('Error approving:', error);
                this.showError('Failed to approve');
            }
        },

        /**
         * Reject single question
         */
        rejectQuestion: async function(responseId, questionId) {
            const reason = prompt('Enter reason for rejection (required):');
            if (!reason) {
                this.showError('Reason is required for rejection');
                return;
            }

            try {
                await this.apiCall('/approvals/reject', 'POST', {
                    responseId,
                    questionId,
                    reason
                });

                this.showSuccess('Rejected successfully');
                this.loadPendingApprovals();
            } catch (error) {
                console.error('Error rejecting:', error);
                this.showError('Failed to reject');
            }
        },

        /**
         * Submit feedback for best comment
         */
        submitFeedback: async function(questionResponseId) {
            const feedbackText = document.getElementById(`feedback-${questionResponseId}`)?.value;
            if (!feedbackText) {
                this.showError('Please enter feedback');
                return;
            }

            try {
                await this.apiCall('/approvals/best-comments/feedback', 'POST', {
                    questionResponseId,
                    feedbackText
                });

                this.showSuccess('Feedback submitted successfully');
                this.loadBestCommentsFeedback();
            } catch (error) {
                console.error('Error submitting feedback:', error);
                this.showError('Failed to submit feedback');
            }
        },

        /**
         * Save selected comments as best comments
         */
        saveAsBestComments: async function() {
            const checkboxes = document.querySelectorAll('.comment-checkbox:checked');
            if (checkboxes.length === 0) {
                this.showError('Please select at least one comment');
                return;
            }

            const items = Array.from(checkboxes).map(cb => ({
                responseId: parseInt(cb.dataset.responseId),
                questionId: parseInt(cb.dataset.questionId)
            }));

            try {
                await this.apiCall('/approvals/best-comments/mark', 'POST', { items });

                this.showSuccess('Comments marked as best comments');
                this.loadComments();
            } catch (error) {
                console.error('Error marking best comments:', error);
                this.showError('Failed to mark best comments');
            }
        },

        /**
         * View respondent detail
         */
        viewRespondentDetail: async function(responseId) {
            try {
                const detail = await this.apiCall(`/responses/${responseId}`);
                this.showRespondentDetailModal(detail);
            } catch (error) {
                console.error('Error loading respondent detail:', error);
                this.showError('Failed to load respondent detail');
            }
        },

        /**
         * View question detail
         */
        viewQuestionDetail: async function(responseId, questionId) {
            try {
                const detail = await this.apiCall(`/responses/${responseId}/questions/${questionId}`);
                this.showQuestionDetailModal(detail);
            } catch (error) {
                console.error('Error loading question detail:', error);
                this.showError('Failed to load question detail');
            }
        },

        /**
         * Show respondent detail modal
         */
        showRespondentDetailModal: function(detail) {
            // Implementation for modal display
            alert(`Respondent: ${detail.RespondentName}\nEmail: ${detail.RespondentEmail}\nDepartment: ${detail.DepartmentName}`);
        },

        /**
         * Show question detail modal
         */
        showQuestionDetailModal: function(detail) {
            // Implementation for modal display
            alert(`Question: ${detail.QuestionText}\nScore: ${detail.Score}\nComment: ${detail.CommentText || 'N/A'}\nTakeout Reason: ${detail.TakeoutReason || 'N/A'}`);
        },

        /**
         * Export to Excel
         */
        exportToExcel: async function() {
            try {
                const params = new URLSearchParams(this.currentFilters);
                window.location.href = `${API_BASE}/approvals/export?${params}`;
            } catch (error) {
                console.error('Error exporting:', error);
                this.showError('Failed to export');
            }
        },

        /**
         * Toggle select all checkboxes
         */
        toggleSelectAll: function(checked) {
            const activeTab = document.querySelector('.tab-content.active');
            const checkboxes = activeTab?.querySelectorAll('input[type="checkbox"]:not(#select-all)');
            checkboxes?.forEach(cb => cb.checked = checked);
        },

        /**
         * Get status badge class
         */
        getStatusBadgeClass: function(status) {
            const statusMap = {
                'Active': 'success',
                'ProposedTakeout': 'warning',
                'TakenOut': 'danger',
                'Rejected': 'secondary'
            };
            return statusMap[status] || 'secondary';
        },

        /**
         * API call helper
         */
        apiCall: async function(endpoint, method = 'GET', body = null) {
            const token = localStorage.getItem('token');
            const options = {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            };

            if (body) {
                options.body = JSON.stringify(body);
            }

            const response = await fetch(`${API_BASE}${endpoint}`, options);
            
            if (!response.ok) {
                throw new Error(`API call failed: ${response.statusText}`);
            }

            return response.json();
        },

        /**
         * Show success message
         */
        showSuccess: function(message) {
            alert(message); // Replace with better notification system
        },

        /**
         * Show error message
         */
        showError: function(message) {
            alert(message); // Replace with better notification system
        },

        /**
         * Escape HTML to prevent XSS
         */
        escapeHtml: function(text) {
            if (!text) return '';
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
    };

    // Initialize on page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => ApprovalManager.init());
    } else {
        ApprovalManager.init();
    }

})();
