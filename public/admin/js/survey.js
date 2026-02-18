/**
 * Survey Management Module
 * Handles survey CRUD operations, operational controls, and scheduling
 */

(function() {
    'use strict';

    const API_BASE = '/api/v1';
    let currentSurveyId = null;
    let surveys = [];

    // Initialize on page load
    document.addEventListener('DOMContentLoaded', async function() {
        // Check authentication (async)
        const user = await window.AuthUtils.redirectIfNotAuthenticated();
        if (!user) {
            return;
        }

        // Initialize sidebar with current role config
        if (window.Sidebar) {
            window.Sidebar.init();
        }

        // Sync user display on header
        const userDisplay = document.getElementById('user-display');
        if (userDisplay) {
            userDisplay.textContent = window.AuthUtils.getUserDisplayName();
        }

        // Initialize page
        initializePage();
    });

    function initializePage() {
        // Load surveys
        loadSurveys();

        // Event listeners
        document.getElementById('create-survey-btn').addEventListener('click', createNewSurvey);
        document.getElementById('status-filter').addEventListener('change', filterSurveys);
        document.getElementById('search-input').addEventListener('input', filterSurveys);
        document.getElementById('logout-btn').addEventListener('click', async () => {
            await window.Auth.logout();
            window.location.href = 'login';
        });

        // Operational modal tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                switchTab(this.dataset.tab);
            });
        });

        // Operational modal buttons
        document.getElementById('operational-close').addEventListener('click', closeOperationalModal);
        document.getElementById('generate-link-btn').addEventListener('click', generateSurveyLink);
        document.getElementById('copy-link-btn').addEventListener('click', () => copyToClipboard('survey-link'));
        document.getElementById('copy-shortened-btn').addEventListener('click', () => copyToClipboard('shortened-link'));
        document.getElementById('shorten-url-check').addEventListener('change', toggleShortenedLink);
        document.getElementById('generate-qr-btn').addEventListener('click', generateQRCode);
        document.getElementById('download-qr-btn').addEventListener('click', downloadQRCode);
        document.getElementById('generate-embed-btn').addEventListener('click', generateEmbedCode);
        document.getElementById('copy-embed-btn').addEventListener('click', () => copyToClipboard('embed-code'));

        // Blast modal
        document.getElementById('blast-close').addEventListener('click', closeBlastModal);
        document.getElementById('blast-cancel').addEventListener('click', closeBlastModal);
        document.getElementById('blast-schedule-type').addEventListener('change', updateBlastScheduleFields);
        document.getElementById('blast-form').addEventListener('submit', scheduleBlast);
        
        // Blast modal tabs
        document.querySelectorAll('#blast-modal .tab-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                switchModalTab('blast', this.dataset.tab);
            });
        });

        // Reminder modal
        document.getElementById('reminder-close').addEventListener('click', closeReminderModal);
        document.getElementById('reminder-cancel').addEventListener('click', closeReminderModal);
        document.getElementById('reminder-schedule-type').addEventListener('change', updateReminderScheduleFields);
        document.getElementById('reminder-form').addEventListener('submit', scheduleReminder);
        
        // Reminder modal tabs
        document.querySelectorAll('#reminder-modal .tab-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                switchModalTab('reminder', this.dataset.tab);
            });
        });

        // Operations modal
        document.getElementById('operations-close').addEventListener('click', closeOperationsModal);

        // Load target criteria options
        loadTargetCriteria();
    }

    async function loadSurveys() {
        try {
            const response = await fetch(`${API_BASE}/surveys`, {
                headers: {
                    'Authorization': `Bearer ${window.Auth.getToken()}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to load surveys');
            }

            const payload = await response.json();
            surveys = Array.isArray(payload) ? payload : (payload.surveys || []);
            renderSurveys(surveys);
        } catch (error) {
            console.error('Error loading surveys:', error);
            showError('Gagal memuat data survey');
        }
    }

    function renderSurveys(surveysToRender) {
        const tbody = document.getElementById('survey-tbody');
        
        if (surveysToRender.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">Tidak ada data</td></tr>';
            return;
        }

        tbody.innerHTML = surveysToRender.map(survey => `
            <tr>
                <td>
                    <strong>${escapeHtml(survey.title)}</strong>
                    <br>
                    <small class="text-muted">${escapeHtml(survey.description || '')}</small>
                </td>
                <td>
                    ${formatDate(survey.startDate)} - ${formatDate(survey.endDate)}
                </td>
                <td>
                    <span class="badge badge-${getStatusColor(survey.status)}">${survey.status}</span>
                </td>
                <td>
                    ${survey.targetRespondents || '-'}<br>
                    <small class="text-muted">Target: ${survey.targetScore || '-'}</small>
                </td>
                <td>${survey.responseCount || 0}</td>
                <td>
                    <div class="btn-group">
                        <button class="btn btn-sm btn-secondary" onclick="window.SurveyModule.continueDesign('${survey.surveyId}')" title="Continue Design">
                            <span class="icon">✏️</span>
                        </button>
                        <button class="btn btn-sm btn-info" onclick="window.SurveyModule.openOperationalControls('${survey.surveyId}')" title="Operational Controls">
                            <span class="icon">🔗</span>
                        </button>
                        <button class="btn btn-sm btn-primary" onclick="window.SurveyModule.openBlastModal('${survey.surveyId}')" title="Schedule Blast">
                            <span class="icon">📧</span>
                        </button>
                        <button class="btn btn-sm btn-warning" onclick="window.SurveyModule.openReminderModal('${survey.surveyId}')" title="Schedule Reminder">
                            <span class="icon">⏰</span>
                        </button>
                        <button class="btn btn-sm btn-secondary" onclick="window.SurveyModule.viewScheduledOperations('${survey.surveyId}')" title="View Scheduled Operations">
                            <span class="icon">📋</span>
                        </button>
                        ${survey.status === 'Draft' ? `
                            <button class="btn btn-sm btn-success" onclick="window.SurveyModule.activateSurvey('${survey.surveyId}')" title="Activate">
                                <span class="icon">✓</span>
                            </button>
                        ` : ''}
                        ${survey.status === 'Active' ? `
                            <button class="btn btn-sm btn-warning" onclick="window.SurveyModule.deactivateSurvey('${survey.surveyId}')" title="Deactivate">
                                <span class="icon">⏸</span>
                            </button>
                        ` : ''}
                        ${survey.responseCount === 0 ? `
                            <button class="btn btn-sm btn-danger" onclick="window.SurveyModule.deleteSurvey('${survey.surveyId}')" title="Delete">
                                <span class="icon">🗑</span>
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `).join('');
    }

    function filterSurveys() {
        const statusFilter = document.getElementById('status-filter').value.toLowerCase();
        const searchTerm = document.getElementById('search-input').value.toLowerCase();

        const filtered = surveys.filter(survey => {
            const matchesStatus = !statusFilter || survey.status.toLowerCase() === statusFilter;
            const matchesSearch = !searchTerm || 
                survey.title.toLowerCase().includes(searchTerm) ||
                (survey.description && survey.description.toLowerCase().includes(searchTerm));
            
            return matchesStatus && matchesSearch;
        });

        renderSurveys(filtered);
    }

    function createNewSurvey() {
        // Clear any existing editing_survey_id
        localStorage.removeItem('editing_survey_id');
        // Navigate to survey builder
        window.location.href = 'survey-create';
    }

    function continueDesign(surveyId) {
        // Store surveyId in localStorage for the builder to load
        localStorage.setItem('editing_survey_id', surveyId);
        // Navigate to survey builder
        window.location.href = 'survey-create';
    }

    async function activateSurvey(surveyId) {
        if (!confirm('Apakah Anda yakin ingin mengaktifkan survey ini?')) {
            return;
        }

        try {
            const response = await fetch(`${API_BASE}/surveys/${surveyId}/activate`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${window.Auth.getToken()}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to activate survey');
            }

            showSuccess('Survey berhasil diaktifkan');
            loadSurveys();
        } catch (error) {
            console.error('Error activating survey:', error);
            showError('Gagal mengaktifkan survey');
        }
    }

    async function deactivateSurvey(surveyId) {
        if (!confirm('Apakah Anda yakin ingin menonaktifkan survey ini?')) {
            return;
        }

        try {
            const response = await fetch(`${API_BASE}/surveys/${surveyId}/deactivate`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${window.Auth.getToken()}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to deactivate survey');
            }

            showSuccess('Survey berhasil dinonaktifkan');
            loadSurveys();
        } catch (error) {
            console.error('Error deactivating survey:', error);
            showError('Gagal menonaktifkan survey');
        }
    }

    async function deleteSurvey(surveyId) {
        if (!confirm('Apakah Anda yakin ingin menghapus survey ini? Tindakan ini tidak dapat dibatalkan.')) {
            return;
        }

        try {
            const response = await fetch(`${API_BASE}/surveys/${surveyId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${window.Auth.getToken()}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to delete survey');
            }

            showSuccess('Survey berhasil dihapus');
            loadSurveys();
        } catch (error) {
            console.error('Error deleting survey:', error);
            showError('Gagal menghapus survey');
        }
    }

    // Operational Controls
    function openOperationalControls(surveyId) {
        currentSurveyId = surveyId;
        document.getElementById('operational-modal').classList.add('active');
        
        // Load existing data if available
        loadOperationalData(surveyId);
    }

    function closeOperationalModal() {
        document.getElementById('operational-modal').classList.remove('active');
        currentSurveyId = null;
    }

    function switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`).classList.add('active');
    }

    async function loadOperationalData(surveyId) {
        try {
            const response = await fetch(`${API_BASE}/surveys/${surveyId}/operational`, {
                headers: {
                    'Authorization': `Bearer ${window.Auth.getToken()}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                
                if (data.surveyLink) {
                    document.getElementById('survey-link').value = data.surveyLink;
                }
                if (data.shortenedLink) {
                    document.getElementById('shortened-link').value = data.shortenedLink;
                    document.getElementById('shortened-link-group').style.display = 'block';
                }
                if (data.qrCodeDataUrl) {
                    displayQRCode(data.qrCodeDataUrl);
                }
                if (data.embedCode) {
                    document.getElementById('embed-code').value = data.embedCode;
                    document.getElementById('copy-embed-btn').style.display = 'inline-block';
                }
            }
        } catch (error) {
            console.error('Error loading operational data:', error);
        }
    }

    async function generateSurveyLink() {
        const shortenUrl = document.getElementById('shorten-url-check').checked;

        try {
            const response = await fetch(`${API_BASE}/surveys/${currentSurveyId}/generate-link`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${window.Auth.getToken()}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ shortenUrl })
            });

            if (!response.ok) {
                throw new Error('Failed to generate link');
            }

            const data = await response.json();
            document.getElementById('survey-link').value = data.surveyLink;
            
            if (data.shortenedLink) {
                document.getElementById('shortened-link').value = data.shortenedLink;
                document.getElementById('shortened-link-group').style.display = 'block';
            }

            showSuccess('Link berhasil di-generate');
        } catch (error) {
            console.error('Error generating link:', error);
            showError('Gagal generate link');
        }
    }

    function toggleShortenedLink() {
        const checked = document.getElementById('shorten-url-check').checked;
        if (!checked) {
            document.getElementById('shortened-link-group').style.display = 'none';
        }
    }

    async function generateQRCode() {
        try {
            const response = await fetch(`${API_BASE}/surveys/${currentSurveyId}/generate-qr`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${window.Auth.getToken()}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to generate QR code');
            }

            const data = await response.json();
            displayQRCode(data.qrCodeDataUrl);
            showSuccess('QR Code berhasil di-generate');
        } catch (error) {
            console.error('Error generating QR code:', error);
            showError('Gagal generate QR code');
        }
    }

    function displayQRCode(dataUrl) {
        const container = document.getElementById('qr-code-container');
        container.innerHTML = `<img src="${dataUrl}" alt="QR Code" style="max-width: 300px;">`;
        document.getElementById('download-qr-btn').style.display = 'inline-block';
        document.getElementById('download-qr-btn').dataset.qrUrl = dataUrl;
    }

    function downloadQRCode() {
        const dataUrl = document.getElementById('download-qr-btn').dataset.qrUrl;
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `survey-qr-${currentSurveyId}.png`;
        link.click();
    }

    async function generateEmbedCode() {
        try {
            const response = await fetch(`${API_BASE}/surveys/${currentSurveyId}/generate-embed`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${window.Auth.getToken()}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to generate embed code');
            }

            const data = await response.json();
            document.getElementById('embed-code').value = data.embedCode;
            document.getElementById('copy-embed-btn').style.display = 'inline-block';
            showSuccess('Embed code berhasil di-generate');
        } catch (error) {
            console.error('Error generating embed code:', error);
            showError('Gagal generate embed code');
        }
    }

    function copyToClipboard(elementId) {
        const element = document.getElementById(elementId);
        element.select();
        document.execCommand('copy');
        showSuccess('Copied to clipboard');
    }

    // Blast Scheduling
    function openBlastModal(surveyId) {
        currentSurveyId = surveyId;
        document.getElementById('blast-modal').classList.add('active');
        document.getElementById('blast-form').reset();
        updateBlastScheduleFields();
        
        // Switch to schedule tab by default
        switchModalTab('blast', 'blast-schedule');
    }

    function closeBlastModal() {
        document.getElementById('blast-modal').classList.remove('active');
        currentSurveyId = null;
    }

    function updateBlastScheduleFields() {
        const scheduleType = document.getElementById('blast-schedule-type').value;
        const dateGroup = document.getElementById('blast-date-group');
        const dayGroup = document.getElementById('blast-day-group');

        if (scheduleType === 'once' || scheduleType === 'monthly') {
            dateGroup.style.display = 'block';
            dayGroup.style.display = 'none';
        } else if (scheduleType === 'weekly') {
            dateGroup.style.display = 'none';
            dayGroup.style.display = 'block';
        } else if (scheduleType === 'daily') {
            dateGroup.style.display = 'none';
            dayGroup.style.display = 'none';
        }
    }

    async function scheduleBlast(e) {
        e.preventDefault();

        const scheduleType = document.getElementById('blast-schedule-type').value;
        const date = document.getElementById('blast-date').value;
        const time = document.getElementById('blast-time').value;
        const day = document.getElementById('blast-day').value;
        const embedCover = document.getElementById('blast-embed-cover').checked;
        const template = document.getElementById('blast-template').value;

        // Get selected target criteria
        const buOptions = document.getElementById('blast-bu').selectedOptions;
        const divisionOptions = document.getElementById('blast-division').selectedOptions;
        const departmentOptions = document.getElementById('blast-department').selectedOptions;
        const functionOptions = document.getElementById('blast-function').selectedOptions;

        const targetCriteria = {
            businessUnitIds: Array.from(buOptions).map(opt => opt.value),
            divisionIds: Array.from(divisionOptions).map(opt => opt.value),
            departmentIds: Array.from(departmentOptions).map(opt => opt.value),
            functionIds: Array.from(functionOptions).map(opt => opt.value)
        };

        const requestData = {
            surveyId: currentSurveyId,
            operationType: 'Blast',
            scheduleType,
            scheduledDate: date || null,
            scheduledTime: time,
            dayOfWeek: scheduleType === 'weekly' ? parseInt(day) : null,
            embedCover,
            emailTemplate: template,
            targetCriteria
        };

        try {
            const response = await fetch(`${API_BASE}/surveys/${currentSurveyId}/schedule-blast`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${window.Auth.getToken()}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestData)
            });

            if (!response.ok) {
                throw new Error('Failed to schedule blast');
            }

            showSuccess('Email blast berhasil dijadwalkan');
            closeBlastModal();
        } catch (error) {
            console.error('Error scheduling blast:', error);
            showError('Gagal menjadwalkan email blast');
        }
    }

    // Reminder Scheduling
    function openReminderModal(surveyId) {
        currentSurveyId = surveyId;
        document.getElementById('reminder-modal').classList.add('active');
        document.getElementById('reminder-form').reset();
        updateReminderScheduleFields();
        
        // Switch to schedule tab by default
        switchModalTab('reminder', 'reminder-schedule');
        
        // Load non-respondents count
        loadNonRespondents(surveyId);
    }

    function closeReminderModal() {
        document.getElementById('reminder-modal').classList.remove('active');
        currentSurveyId = null;
    }

    function updateReminderScheduleFields() {
        const scheduleType = document.getElementById('reminder-schedule-type').value;
        const dateGroup = document.getElementById('reminder-date-group');
        const dayGroup = document.getElementById('reminder-day-group');

        if (scheduleType === 'once') {
            dateGroup.style.display = 'block';
            dayGroup.style.display = 'none';
        } else if (scheduleType === 'weekly') {
            dateGroup.style.display = 'none';
            dayGroup.style.display = 'block';
        } else if (scheduleType === 'daily') {
            dateGroup.style.display = 'none';
            dayGroup.style.display = 'none';
        }
    }

    async function scheduleReminder(e) {
        e.preventDefault();

        const scheduleType = document.getElementById('reminder-schedule-type').value;
        const date = document.getElementById('reminder-date').value;
        const time = document.getElementById('reminder-time').value;
        const day = document.getElementById('reminder-day').value;
        const embedCover = document.getElementById('reminder-embed-cover').checked;
        const template = document.getElementById('reminder-template').value;

        const requestData = {
            surveyId: currentSurveyId,
            operationType: 'Reminder',
            scheduleType,
            scheduledDate: date || null,
            scheduledTime: time,
            dayOfWeek: scheduleType === 'weekly' ? parseInt(day) : null,
            embedCover,
            emailTemplate: template
        };

        try {
            const response = await fetch(`${API_BASE}/surveys/${currentSurveyId}/schedule-reminder`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${window.Auth.getToken()}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestData)
            });

            if (!response.ok) {
                throw new Error('Failed to schedule reminder');
            }

            showSuccess('Reminder berhasil dijadwalkan');
            closeReminderModal();
        } catch (error) {
            console.error('Error scheduling reminder:', error);
            showError('Gagal menjadwalkan reminder');
        }
    }

    // Scheduled Operations
    async function viewScheduledOperations(surveyId) {
        currentSurveyId = surveyId;
        document.getElementById('operations-modal').classList.add('active');
        await loadScheduledOperations(surveyId);
    }

    function closeOperationsModal() {
        document.getElementById('operations-modal').classList.remove('active');
        currentSurveyId = null;
    }

    async function loadScheduledOperations(surveyId) {
        try {
            const response = await fetch(`${API_BASE}/surveys/${surveyId}/scheduled-operations`, {
                headers: {
                    'Authorization': `Bearer ${window.Auth.getToken()}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to load scheduled operations');
            }

            const operations = await response.json();
            renderScheduledOperations(operations);
        } catch (error) {
            console.error('Error loading scheduled operations:', error);
            showError('Gagal memuat scheduled operations');
        }
    }

    function renderScheduledOperations(operations) {
        const tbody = document.getElementById('operations-tbody');

        if (operations.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">Tidak ada scheduled operations</td></tr>';
            return;
        }

        tbody.innerHTML = operations.map(op => `
            <tr>
                <td>${op.operationType}</td>
                <td>${op.scheduledDate ? formatDate(op.scheduledDate) : '-'} ${op.scheduledTime || ''}</td>
                <td>${op.frequency}</td>
                <td>${op.nextExecutionAt ? formatDateTime(op.nextExecutionAt) : '-'}</td>
                <td><span class="badge badge-${op.status === 'Pending' ? 'warning' : 'success'}">${op.status}</span></td>
                <td>
                    ${op.status === 'Pending' ? `
                        <button class="btn btn-sm btn-danger" onclick="window.SurveyModule.cancelOperation('${op.operationId}')">Cancel</button>
                    ` : '-'}
                </td>
            </tr>
        `).join('');
    }

    async function cancelOperation(operationId) {
        if (!confirm('Apakah Anda yakin ingin membatalkan scheduled operation ini?')) {
            return;
        }

        try {
            const response = await fetch(`${API_BASE}/scheduled-operations/${operationId}/cancel`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${window.Auth.getToken()}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to cancel operation');
            }

            showSuccess('Operation berhasil dibatalkan');
            loadScheduledOperations(currentSurveyId);
        } catch (error) {
            console.error('Error canceling operation:', error);
            showError('Gagal membatalkan operation');
        }
    }

    // Load target criteria options
    async function loadTargetCriteria() {
        try {
            // Load Business Units
            const buResponse = await fetch(`${API_BASE}/business-units`, {
                headers: { 'Authorization': `Bearer ${window.Auth.getToken()}` }
            });
            if (buResponse.ok) {
                const bus = await buResponse.json();
                const buSelect = document.getElementById('blast-bu');
                buSelect.innerHTML = bus.map(bu => `<option value="${bu.businessUnitId}">${bu.name}</option>`).join('');
            }

            // Load Divisions
            const divResponse = await fetch(`${API_BASE}/divisions`, {
                headers: { 'Authorization': `Bearer ${window.Auth.getToken()}` }
            });
            if (divResponse.ok) {
                const divs = await divResponse.json();
                const divSelect = document.getElementById('blast-division');
                divSelect.innerHTML = divs.map(div => `<option value="${div.divisionId}">${div.name}</option>`).join('');
            }

            // Load Departments
            const deptResponse = await fetch(`${API_BASE}/departments`, {
                headers: { 'Authorization': `Bearer ${window.Auth.getToken()}` }
            });
            if (deptResponse.ok) {
                const depts = await deptResponse.json();
                const deptSelect = document.getElementById('blast-department');
                deptSelect.innerHTML = depts.map(dept => `<option value="${dept.departmentId}">${dept.name}</option>`).join('');
            }

            // Load Functions
            const funcResponse = await fetch(`${API_BASE}/functions`, {
                headers: { 'Authorization': `Bearer ${window.Auth.getToken()}` }
            });
            if (funcResponse.ok) {
                const funcs = await funcResponse.json();
                const funcSelect = document.getElementById('blast-function');
                funcSelect.innerHTML = funcs.map(func => `<option value="${func.functionId}">${func.name}</option>`).join('');
            }
        } catch (error) {
            console.error('Error loading target criteria:', error);
        }
    }

    // Modal tab switching
    function switchModalTab(modalType, tabName) {
        const modal = modalType === 'blast' ? 'blast-modal' : 'reminder-modal';
        const modalElement = document.getElementById(modal);
        
        // Update tab buttons
        modalElement.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        modalElement.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Update tab content
        modalElement.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        modalElement.querySelector(`#${tabName}-tab`).classList.add('active');

        // Load data for specific tabs
        if (tabName === 'blast-logs') {
            loadBlastLogs(currentSurveyId);
        } else if (tabName === 'reminder-logs') {
            loadReminderLogs(currentSurveyId);
        } else if (tabName === 'reminder-stats') {
            loadNonRespondents(currentSurveyId);
        }
    }

    // Load blast email logs
    async function loadBlastLogs(surveyId) {
        try {
            const response = await fetch(`${API_BASE}/surveys/${surveyId}/email-logs?type=Blast`, {
                headers: {
                    'Authorization': `Bearer ${window.Auth.getToken()}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to load blast logs');
            }

            const logs = await response.json();
            renderEmailLogs(logs, 'blast-logs-tbody');
        } catch (error) {
            console.error('Error loading blast logs:', error);
            document.getElementById('blast-logs-tbody').innerHTML = 
                '<tr><td colspan="5" class="text-center text-danger">Gagal memuat data</td></tr>';
        }
    }

    // Load reminder email logs
    async function loadReminderLogs(surveyId) {
        try {
            const response = await fetch(`${API_BASE}/surveys/${surveyId}/email-logs?type=Reminder`, {
                headers: {
                    'Authorization': `Bearer ${window.Auth.getToken()}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to load reminder logs');
            }

            const logs = await response.json();
            renderEmailLogs(logs, 'reminder-logs-tbody');
        } catch (error) {
            console.error('Error loading reminder logs:', error);
            document.getElementById('reminder-logs-tbody').innerHTML = 
                '<tr><td colspan="5" class="text-center text-danger">Gagal memuat data</td></tr>';
        }
    }

    // Render email logs
    function renderEmailLogs(logs, tbodyId) {
        const tbody = document.getElementById(tbodyId);

        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center">Tidak ada log email</td></tr>';
            return;
        }

        tbody.innerHTML = logs.map(log => `
            <tr>
                <td>${formatDateTime(log.sentAt)}</td>
                <td>${log.recipientCount || 0}</td>
                <td><span class="badge badge-success">${log.successCount || 0}</span></td>
                <td><span class="badge badge-danger">${log.failureCount || 0}</span></td>
                <td><span class="badge badge-${log.status === 'Completed' ? 'success' : 'warning'}">${log.status}</span></td>
            </tr>
        `).join('');
    }

    // Load non-respondents
    async function loadNonRespondents(surveyId) {
        try {
            const response = await fetch(`${API_BASE}/surveys/${surveyId}/non-respondents`, {
                headers: {
                    'Authorization': `Bearer ${window.Auth.getToken()}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to load non-respondents');
            }

            const data = await response.json();
            
            // Update count
            document.getElementById('non-respondent-count').textContent = data.count || 0;
            
            // Render table
            renderNonRespondents(data.nonRespondents || []);
        } catch (error) {
            console.error('Error loading non-respondents:', error);
            document.getElementById('non-respondent-count').textContent = '-';
            document.getElementById('non-respondents-tbody').innerHTML = 
                '<tr><td colspan="4" class="text-center text-danger">Gagal memuat data</td></tr>';
        }
    }

    // Render non-respondents
    function renderNonRespondents(nonRespondents) {
        const tbody = document.getElementById('non-respondents-tbody');

        if (nonRespondents.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center">Semua target telah merespons</td></tr>';
            return;
        }

        tbody.innerHTML = nonRespondents.map(nr => `
            <tr>
                <td>${escapeHtml(nr.name || '-')}</td>
                <td>${escapeHtml(nr.email)}</td>
                <td>${escapeHtml(nr.departmentName || '-')}</td>
                <td>${nr.lastBlastSent ? formatDateTime(nr.lastBlastSent) : 'Never'}</td>
            </tr>
        `).join('');
    }

    // Utility functions
    function formatDate(dateString) {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleDateString('id-ID');
    }

    function formatDateTime(dateString) {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleString('id-ID');
    }

    function getStatusColor(status) {
        const colors = {
            'Draft': 'secondary',
            'Active': 'success',
            'Closed': 'warning',
            'Archived': 'info'
        };
        return colors[status] || 'secondary';
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function showSuccess(message) {
        alert(message); // Replace with better notification system
    }

    function showError(message) {
        alert(message); // Replace with better notification system
    }

    // Export public API
    window.SurveyModule = {
        continueDesign,
        activateSurvey,
        deactivateSurvey,
        deleteSurvey,
        openOperationalControls,
        openBlastModal,
        openReminderModal,
        viewScheduledOperations,
        cancelOperation
    };
})();



