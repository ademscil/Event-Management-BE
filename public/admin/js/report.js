/**
 * Report Module for CSI Portal
 * Handles report selection, comparison, and viewing
 */

(function(window) {
    'use strict';

    const API_BASE_URL = '/api/v1';

    /**
     * ReportSelection namespace - Report selection page functionality
     */
    const ReportSelection = {
        surveys: [],
        functions: [],

        /**
         * Initialize report selection page
         */
        async init() {
            await this.loadSurveys();
            await this.loadFunctions();
            this.setupEventListeners();
        },

        /**
         * Load surveys for event list
         */
        async loadSurveys() {
            try {
                const response = await window.AuthUtils.authenticatedFetch(
                    `${API_BASE_URL}/reports/selection-list`
                );

                if (response.ok) {
                    const data = await response.json();
                    this.surveys = data.surveys || [];
                    this.renderSurveyTable();
                    this.populateSurveyFilter();
                } else {
                    console.error('Failed to load surveys');
                    this.showError('Failed to load surveys');
                }
            } catch (error) {
                console.error('Error loading surveys:', error);
                this.showError('Error loading surveys');
            }
        },

        /**
         * Load functions for filter
         */
        async loadFunctions() {
            try {
                const response = await window.AuthUtils.authenticatedFetch(
                    `${API_BASE_URL}/functions`
                );

                if (response.ok) {
                    const data = await response.json();
                    this.functions = data.functions || [];
                    this.populateFunctionFilter();
                } else {
                    console.error('Failed to load functions');
                }
            } catch (error) {
                console.error('Error loading functions:', error);
            }
        },

        /**
         * Render survey table
         */
        renderSurveyTable() {
            const tbody = document.getElementById('survey-tbody');
            
            if (!tbody) return;

            if (this.surveys.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No surveys found</td></tr>';
                return;
            }

            tbody.innerHTML = this.surveys.map(survey => `
                <tr>
                    <td>${this.escapeHtml(survey.title)}</td>
                    <td>${this.formatPeriod(survey.startDate, survey.endDate)}</td>
                    <td>${this.renderStatusBadge(survey.status)}</td>
                    <td class="text-center">${survey.respondentCount || 0}</td>
                    <td class="text-center">
                        <div class="btn-group">
                            <button class="btn btn-primary btn-sm" onclick="ReportSelection.viewReport(${survey.surveyId})">
                                View Report
                            </button>
                            <button class="btn btn-success btn-sm" onclick="ReportSelection.exportReport(${survey.surveyId}, 'excel')">
                                Export Excel
                            </button>
                            <button class="btn btn-danger btn-sm" onclick="ReportSelection.exportReport(${survey.surveyId}, 'pdf')">
                                Export PDF
                            </button>
                        </div>
                    </td>
                </tr>
            `).join('');
        },

        /**
         * Populate survey filter dropdown
         */
        populateSurveyFilter() {
            const select = document.getElementById('filter-survey');
            
            if (!select) return;

            select.innerHTML = '<option value="">Select Survey</option>' +
                this.surveys.map(survey => 
                    `<option value="${survey.surveyId}">${this.escapeHtml(survey.title)}</option>`
                ).join('');
        },

        /**
         * Populate function filter dropdown
         */
        populateFunctionFilter() {
            const select = document.getElementById('filter-function');
            
            if (!select) return;

            select.innerHTML = '<option value="">All Functions</option>' +
                this.functions.map(func => 
                    `<option value="${func.FunctionId}">${this.escapeHtml(func.Name)}</option>`
                ).join('');
        },

        /**
         * Setup event listeners
         */
        setupEventListeners() {
            const applyBtn = document.getElementById('apply-filter-btn');
            const resetBtn = document.getElementById('reset-filter-btn');

            if (applyBtn) {
                applyBtn.addEventListener('click', () => this.applyFilter());
            }

            if (resetBtn) {
                resetBtn.addEventListener('click', () => this.resetFilter());
            }
        },

        /**
         * Apply filter and load comparison
         */
        async applyFilter() {
            const surveyId = document.getElementById('filter-survey').value;
            const functionId = document.getElementById('filter-function').value;

            if (!surveyId) {
                alert('Please select a survey');
                return;
            }

            await this.loadComparison(surveyId, functionId);
        },

        /**
         * Reset filter
         */
        resetFilter() {
            document.getElementById('filter-survey').value = '';
            document.getElementById('filter-function').value = '';
            
            const tbody = document.getElementById('comparison-tbody');
            const statsBox = document.getElementById('comparison-stats');
            
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Select survey and function to view comparison</td></tr>';
            }
            
            if (statsBox) {
                statsBox.style.display = 'none';
            }
        },

        /**
         * Load takeout comparison
         */
        async loadComparison(surveyId, functionId) {
            try {
                const url = functionId 
                    ? `${API_BASE_URL}/reports/takeout-comparison/${surveyId}?functionId=${functionId}`
                    : `${API_BASE_URL}/reports/takeout-comparison/${surveyId}`;

                const response = await window.AuthUtils.authenticatedFetch(url);

                if (response.ok) {
                    const data = await response.json();
                    this.renderComparison(data.comparison);
                } else {
                    console.error('Failed to load comparison');
                    this.showError('Failed to load comparison');
                }
            } catch (error) {
                console.error('Error loading comparison:', error);
                this.showError('Error loading comparison');
            }
        },

        /**
         * Render comparison table
         */
        renderComparison(comparison) {
            const tbody = document.getElementById('comparison-tbody');
            const statsBox = document.getElementById('comparison-stats');

            if (!tbody || !comparison) return;

            // Calculate statistics
            const totalRows = comparison.questions ? comparison.questions.length : 0;
            const takeoutRows = comparison.questions ? 
                comparison.questions.filter(q => q.takeoutCount > 0).length : 0;
            const avgBefore = comparison.overallAvgBefore || 0;
            const avgAfter = comparison.overallAvgAfter || 0;

            // Update statistics
            if (statsBox) {
                document.getElementById('stat-total-rows').textContent = totalRows;
                document.getElementById('stat-takeout-rows').textContent = takeoutRows;
                document.getElementById('stat-avg-before').textContent = avgBefore.toFixed(2);
                document.getElementById('stat-avg-after').textContent = avgAfter.toFixed(2);
                statsBox.style.display = 'block';
            }

            // Render table
            if (!comparison.questions || comparison.questions.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No data available</td></tr>';
                return;
            }

            tbody.innerHTML = comparison.questions.map(question => `
                <tr>
                    <td>${this.escapeHtml(question.questionText)}</td>
                    <td class="text-center">${question.totalResponses || 0}</td>
                    <td class="text-center">${question.takeoutCount || 0}</td>
                    <td class="text-center">${(question.avgBefore || 0).toFixed(2)}</td>
                    <td class="text-center">${(question.avgAfter || 0).toFixed(2)}</td>
                    <td>${this.escapeHtml(question.takeoutReason || '-')}</td>
                </tr>
            `).join('');
        },

        /**
         * View report
         */
        viewReport(surveyId) {
            window.location.href = `report?surveyId=${surveyId}`;
        },

        /**
         * Export report
         */
        async exportReport(surveyId, format) {
            try {
                const endpoint = format === 'excel' 
                    ? `${API_BASE_URL}/reports/export/excel`
                    : `${API_BASE_URL}/reports/export/pdf`;

                const response = await window.AuthUtils.authenticatedFetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ surveyId })
                });

                if (response.ok) {
                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `report_${surveyId}.${format === 'excel' ? 'xlsx' : 'pdf'}`;
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    document.body.removeChild(a);
                } else {
                    this.showError('Failed to export report');
                }
            } catch (error) {
                console.error('Error exporting report:', error);
                this.showError('Error exporting report');
            }
        },

        /**
         * Format period
         */
        formatPeriod(startDate, endDate) {
            const start = new Date(startDate).toLocaleDateString('id-ID');
            const end = new Date(endDate).toLocaleDateString('id-ID');
            return `${start} - ${end}`;
        },

        /**
         * Render status badge
         */
        renderStatusBadge(status) {
            const badgeMap = {
                'Draft': 'badge-secondary',
                'Active': 'badge-success',
                'Closed': 'badge-danger',
                'Archived': 'badge-warning'
            };

            const badgeClass = badgeMap[status] || 'badge-secondary';
            return `<span class="badge ${badgeClass}">${status}</span>`;
        },

        /**
         * Show error message
         */
        showError(message) {
            const tbody = document.getElementById('survey-tbody');
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger">${message}</td></tr>`;
            }
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

    /**
     * ReportViewer namespace - Report viewer page functionality
     */
    const ReportViewer = {
        surveyId: null,
        report: null,

        /**
         * Initialize report viewer page
         */
        async init() {
            // Get surveyId from URL
            const urlParams = new URLSearchParams(window.location.search);
            this.surveyId = urlParams.get('surveyId');

            if (!this.surveyId) {
                alert('Survey ID is required');
                window.location.href = 'report-selection';
                return;
            }

            await this.loadReport();
            this.setupEventListeners();
        },

        /**
         * Load report data
         */
        async loadReport() {
            try {
                const response = await window.AuthUtils.authenticatedFetch(
                    `${API_BASE_URL}/reports/generate`,
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ surveyId: parseInt(this.surveyId) })
                    }
                );

                if (response.ok) {
                    const data = await response.json();
                    this.report = data.report;
                    this.renderReport();
                } else {
                    console.error('Failed to load report');
                    alert('Failed to load report');
                }
            } catch (error) {
                console.error('Error loading report:', error);
                alert('Error loading report');
            }
        },

        /**
         * Render report
         */
        renderReport() {
            if (!this.report) return;

            // Render statistics
            this.renderStatistics();

            // Render charts (placeholder)
            this.renderCharts();

            // Render response table
            this.renderResponseTable();
        },

        /**
         * Render statistics
         */
        renderStatistics() {
            const container = document.getElementById('statistics-container');
            if (!container || !this.report.statistics) return;

            container.innerHTML = `
                <div class="grid-2">
                    <div class="panel">
                        <div class="panel-body">
                            <h4>Total Responses</h4>
                            <p class="text-3xl">${this.report.statistics.totalResponses || 0}</p>
                        </div>
                    </div>
                    <div class="panel">
                        <div class="panel-body">
                            <h4>Average Rating</h4>
                            <p class="text-3xl">${(this.report.statistics.averageRating || 0).toFixed(2)}</p>
                        </div>
                    </div>
                </div>
            `;
        },

        /**
         * Render charts (placeholder)
         */
        renderCharts() {
            const container = document.getElementById('charts-container');
            if (!container) return;

            container.innerHTML = `
                <div class="panel">
                    <div class="panel-body">
                        <p class="text-muted text-center">Charts will be rendered here</p>
                    </div>
                </div>
            `;
        },

        /**
         * Render response table
         */
        renderResponseTable() {
            const tbody = document.getElementById('response-tbody');
            if (!tbody || !this.report.responses) return;

            if (this.report.responses.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No responses found</td></tr>';
                return;
            }

            tbody.innerHTML = this.report.responses.map(response => `
                <tr>
                    <td>${this.escapeHtml(response.respondentName)}</td>
                    <td>${this.escapeHtml(response.department)}</td>
                    <td>${this.escapeHtml(response.application)}</td>
                    <td class="text-center">${(response.averageScore || 0).toFixed(2)}</td>
                    <td>${new Date(response.submittedAt).toLocaleDateString('id-ID')}</td>
                </tr>
            `).join('');
        },

        /**
         * Setup event listeners
         */
        setupEventListeners() {
            const excelBtn = document.getElementById('export-excel-btn');
            const pdfBtn = document.getElementById('export-pdf-btn');

            if (excelBtn) {
                excelBtn.addEventListener('click', () => this.exportReport('excel'));
            }

            if (pdfBtn) {
                pdfBtn.addEventListener('click', () => this.exportReport('pdf'));
            }
        },

        /**
         * Export report
         */
        async exportReport(format) {
            try {
                const endpoint = format === 'excel' 
                    ? `${API_BASE_URL}/reports/export/excel`
                    : `${API_BASE_URL}/reports/export/pdf`;

                const response = await window.AuthUtils.authenticatedFetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ surveyId: parseInt(this.surveyId) })
                });

                if (response.ok) {
                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `report_${this.surveyId}.${format === 'excel' ? 'xlsx' : 'pdf'}`;
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    document.body.removeChild(a);
                } else {
                    alert('Failed to export report');
                }
            } catch (error) {
                console.error('Error exporting report:', error);
                alert('Error exporting report');
            }
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
    window.ReportSelection = ReportSelection;
    window.ReportViewer = ReportViewer;

})(window);

