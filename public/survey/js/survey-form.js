/**
 * Survey Form Application
 * Main application logic for dynamic survey rendering and submission
 */

const SurveyApp = (function() {
    'use strict';

    // Application state
    const state = {
        surveyId: null,
        survey: null,
        currentPage: 0,
        totalPages: 0,
        pages: [], // Array of page objects: { type, data }
        businessUnits: [],
        divisions: [],
        departments: [],
        applications: [],
        selectedApplications: [],
        respondentData: {},
        responses: {},
        signatureCanvas: null,
        signatureContext: null,
        currentSignatureQuestionId: null,
        isDrawing: false
    };

    const API_BASE_URL = '/api/v1';

    /**
     * Initialize application
     */
    async function init() {
        try {
            // Get survey ID from URL parameter
            const urlParams = new URLSearchParams(window.location.search);
            state.surveyId = urlParams.get('id');

            if (!state.surveyId) {
                showError('Survey ID tidak ditemukan. Silakan gunakan link yang valid.');
                return;
            }

            // Fetch survey data
            await loadSurveyData();

            // Build page structure
            buildPageStructure();

            // Render first page
            renderCurrentPage();

            // Attach event listeners
            attachEventListeners();

            // Hide loading, show survey
            document.getElementById('loading-screen').style.display = 'none';
            document.getElementById('survey-container').style.display = 'block';

        } catch (error) {
            console.error('Initialization error:', error);
            showError(error.message || 'Gagal memuat survey. Silakan coba lagi.');
        }
    }


    /**
     * Load survey data from API
     */
    async function loadSurveyData() {
        const response = await fetch(`${API_BASE_URL}/surveys/${state.surveyId}`);
        if (!response.ok) {
            throw new Error('Survey tidak ditemukan atau sudah tidak aktif');
        }
        state.survey = await response.json();

        // Check if survey is active
        if (state.survey.status !== 'Active') {
            throw new Error('Survey ini sudah tidak aktif');
        }

        // Check survey period
        const now = new Date();
        const startDate = new Date(state.survey.startDate);
        const endDate = new Date(state.survey.endDate);
        
        if (now < startDate) {
            throw new Error('Survey belum dimulai');
        }
        if (now > endDate) {
            throw new Error('Survey sudah berakhir');
        }
    }

    /**
     * Build page structure based on survey configuration
     */
    function buildPageStructure() {
        state.pages = [];

        // Page 1: Intro/Hero Cover (if exists)
        if (state.survey.configuration && state.survey.configuration.heroImageUrl) {
            state.pages.push({ type: 'intro', data: state.survey });
        }

        // Page 2: Respondent Data Form
        state.pages.push({ type: 'respondent', data: null });

        // Page 3: Application Selection
        state.pages.push({ type: 'applications', data: null });

        // Page 4+: Questions (will be added dynamically per application)
        // Questions pages will be built after application selection

        state.totalPages = state.pages.length;
    }

    /**
     * Render current page
     */
    function renderCurrentPage() {
        const page = state.pages[state.currentPage];
        const content = document.getElementById('survey-content');

        switch (page.type) {
            case 'intro':
                content.innerHTML = SurveyRenderer.renderIntroPage(page.data);
                break;
            case 'respondent':
                renderRespondentPage();
                break;
            case 'applications':
                renderApplicationsPage();
                break;
            case 'questions':
                content.innerHTML = SurveyRenderer.renderQuestionsPage(page.data.questions, page.data.applicationName);
                attachQuestionEventListeners();
                break;
        }

        updateNavigation();
        updateProgressBar();
    }

    /**
     * Render respondent data form
     */
    async function renderRespondentPage() {
        const content = document.getElementById('survey-content');
        
        // Load business units if not loaded
        if (state.businessUnits.length === 0) {
            try {
                const response = await fetch(`${API_BASE_URL}/business-units`);
                state.businessUnits = await response.json();
            } catch (error) {
                console.error('Error loading business units:', error);
                state.businessUnits = [];
            }
        }

        content.innerHTML = SurveyRenderer.renderRespondentForm(state.businessUnits);
        attachRespondentFormListeners();
    }

    /**
     * Attach event listeners to respondent form
     */
    function attachRespondentFormListeners() {
        // Business Unit change
        document.getElementById('business-unit').addEventListener('change', async (e) => {
            const buId = e.target.value;
            const divisionSelect = document.getElementById('division');
            const departmentSelect = document.getElementById('department');

            // Reset divisions and departments
            divisionSelect.innerHTML = '<option value="">-- Pilih Division --</option>';
            departmentSelect.innerHTML = '<option value="">-- Pilih Department --</option>';
            divisionSelect.disabled = true;
            departmentSelect.disabled = true;

            if (buId) {
                try {
                    const response = await fetch(`${API_BASE_URL}/divisions?businessUnitId=${buId}`);
                    state.divisions = await response.json();
                    
                    state.divisions.forEach(div => {
                        const option = document.createElement('option');
                        option.value = div.divisionId;
                        option.textContent = div.name;
                        divisionSelect.appendChild(option);
                    });
                    
                    divisionSelect.disabled = false;
                } catch (error) {
                    console.error('Error loading divisions:', error);
                }
            }
        });

        // Division change
        document.getElementById('division').addEventListener('change', async (e) => {
            const divisionId = e.target.value;
            const departmentSelect = document.getElementById('department');

            // Reset departments
            departmentSelect.innerHTML = '<option value="">-- Pilih Department --</option>';
            departmentSelect.disabled = true;

            if (divisionId) {
                try {
                    const response = await fetch(`${API_BASE_URL}/departments?divisionId=${divisionId}`);
                    state.departments = await response.json();
                    
                    state.departments.forEach(dept => {
                        const option = document.createElement('option');
                        option.value = dept.departmentId;
                        option.textContent = dept.name;
                        departmentSelect.appendChild(option);
                    });
                    
                    departmentSelect.disabled = false;
                } catch (error) {
                    console.error('Error loading departments:', error);
                }
            }
        });
    }

    /**
     * Render applications selection page
     */
    async function renderApplicationsPage() {
        const content = document.getElementById('survey-content');
        
        // Load applications based on selected department
        const departmentId = state.respondentData.departmentId;
        
        if (!departmentId) {
            showError('Department tidak ditemukan');
            return;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/applications/by-department/${departmentId}`);
            state.applications = await response.json();
            
            if (state.applications.length === 0) {
                showError('Tidak ada aplikasi yang tersedia untuk department ini');
                return;
            }

            content.innerHTML = SurveyRenderer.renderApplicationSelection(state.applications);
            attachApplicationListeners();
        } catch (error) {
            console.error('Error loading applications:', error);
            showError('Gagal memuat daftar aplikasi');
        }
    }

    /**
     * Attach event listeners to application checkboxes
     */
    function attachApplicationListeners() {
        const checkboxes = document.querySelectorAll('#application-list input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const item = e.target.closest('.checkbox-item');
                if (e.target.checked) {
                    item.classList.add('selected');
                } else {
                    item.classList.remove('selected');
                }
            });
        });
    }

    /**
     * Attach event listeners to questions
     */
    function attachQuestionEventListeners() {
        // Rating questions with comment requirement
        const ratingInputs = document.querySelectorAll('.rating-scale input[type="radio"]');
        ratingInputs.forEach(input => {
            input.addEventListener('change', (e) => {
                const questionId = e.target.name.replace('question-', '');
                const rating = parseInt(e.target.value);
                const commentSection = document.getElementById(`comment-${questionId}`);
                
                if (commentSection) {
                    const commentRequired = commentSection.querySelector('label').textContent.match(/\d+/);
                    if (commentRequired && rating < parseInt(commentRequired[0])) {
                        commentSection.style.display = 'block';
                    } else {
                        commentSection.style.display = 'none';
                    }
                }
            });
        });

        // Checkbox and radio item selection visual feedback
        const checkboxItems = document.querySelectorAll('.checkbox-item, .radio-item');
        checkboxItems.forEach(item => {
            const input = item.querySelector('input');
            input.addEventListener('change', () => {
                if (input.type === 'checkbox') {
                    if (input.checked) {
                        item.classList.add('selected');
                    } else {
                        item.classList.remove('selected');
                    }
                } else if (input.type === 'radio') {
                    // Remove selected from all radio items in the same group
                    const group = item.closest('.radio-group');
                    group.querySelectorAll('.radio-item').forEach(ri => ri.classList.remove('selected'));
                    if (input.checked) {
                        item.classList.add('selected');
                    }
                }
            });
        });
    }


    /**
     * Update navigation buttons
     */
    function updateNavigation() {
        const btnPrev = document.getElementById('btn-prev');
        const btnNext = document.getElementById('btn-next');
        const btnSubmit = document.getElementById('btn-submit');

        // Show/hide previous button
        if (state.currentPage > 0) {
            btnPrev.style.display = 'inline-block';
        } else {
            btnPrev.style.display = 'none';
        }

        // Show/hide next/submit button
        if (state.currentPage < state.pages.length - 1) {
            btnNext.style.display = 'inline-block';
            btnSubmit.style.display = 'none';
        } else {
            btnNext.style.display = 'none';
            btnSubmit.style.display = 'inline-block';
        }
    }

    /**
     * Update progress bar
     */
    function updateProgressBar() {
        const config = state.survey.configuration || {};
        const showProgressBar = config.showProgressBar !== false;

        const progressContainer = document.getElementById('progress-bar-container');
        
        if (showProgressBar && state.totalPages > 0) {
            progressContainer.style.display = 'block';
            
            const progress = ((state.currentPage + 1) / state.totalPages) * 100;
            document.getElementById('progress-bar-fill').style.width = `${progress}%`;
            document.getElementById('progress-current').textContent = state.currentPage + 1;
            document.getElementById('progress-total').textContent = state.totalPages;
        } else {
            progressContainer.style.display = 'none';
        }
    }

    /**
     * Navigate to next page
     */
    async function nextPage() {
        // Validate current page
        if (!validateCurrentPage()) {
            return;
        }

        // Save current page data
        saveCurrentPageData();

        // If on application selection page, build question pages
        if (state.pages[state.currentPage].type === 'applications') {
            await buildQuestionPages();
        }

        // Move to next page
        state.currentPage++;
        renderCurrentPage();
    }

    /**
     * Navigate to previous page
     */
    function prevPage() {
        if (state.currentPage > 0) {
            state.currentPage--;
            renderCurrentPage();
        }
    }

    /**
     * Validate current page
     */
    function validateCurrentPage() {
        const page = state.pages[state.currentPage];
        
        switch (page.type) {
            case 'intro':
                return true;
            case 'respondent':
                return validateRespondentForm();
            case 'applications':
                return validateApplicationSelection();
            case 'questions':
                return validateQuestions();
            default:
                return true;
        }
    }

    /**
     * Validate respondent form
     */
    function validateRespondentForm() {
        let isValid = true;

        // Name
        const name = document.getElementById('respondent-name').value.trim();
        if (!name) {
            showFieldError('name', 'Nama wajib diisi');
            isValid = false;
        } else {
            hideFieldError('name');
        }

        // Email
        const email = document.getElementById('respondent-email').value.trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email || !emailRegex.test(email)) {
            showFieldError('email', 'Email wajib diisi dengan format yang benar');
            isValid = false;
        } else {
            hideFieldError('email');
        }

        // Business Unit
        const buId = document.getElementById('business-unit').value;
        if (!buId) {
            showFieldError('bu', 'Business Unit wajib dipilih');
            isValid = false;
        } else {
            hideFieldError('bu');
        }

        // Division
        const divisionId = document.getElementById('division').value;
        if (!divisionId) {
            showFieldError('division', 'Division wajib dipilih');
            isValid = false;
        } else {
            hideFieldError('division');
        }

        // Department
        const departmentId = document.getElementById('department').value;
        if (!departmentId) {
            showFieldError('department', 'Department wajib dipilih');
            isValid = false;
        } else {
            hideFieldError('department');
        }

        return isValid;
    }

    /**
     * Validate application selection
     */
    function validateApplicationSelection() {
        const checkboxes = document.querySelectorAll('#application-list input[type="checkbox"]:checked');
        
        if (checkboxes.length === 0) {
            showFieldError('applications', 'Pilih minimal satu aplikasi');
            return false;
        }
        
        hideFieldError('applications');
        return true;
    }

    /**
     * Validate questions
     */
    function validateQuestions() {
        let isValid = true;
        const questions = document.querySelectorAll('.question-item');

        questions.forEach(questionEl => {
            const questionId = questionEl.dataset.questionId;
            const questionType = questionEl.dataset.questionType;
            const isMandatory = questionEl.querySelector('.form-label').classList.contains('required');

            if (!isMandatory) return;

            let hasAnswer = false;

            switch (questionType) {
                case 'Text':
                    const textValue = document.getElementById(`question-${questionId}`).value.trim();
                    hasAnswer = textValue.length > 0;
                    break;
                case 'MultipleChoice':
                    hasAnswer = document.querySelector(`input[name="question-${questionId}"]:checked`) !== null;
                    break;
                case 'Checkbox':
                    hasAnswer = document.querySelectorAll(`input[name="question-${questionId}"]:checked`).length > 0;
                    break;
                case 'Dropdown':
                    hasAnswer = document.getElementById(`question-${questionId}`).value !== '';
                    break;
                case 'MatrixLikert':
                    const rows = questionEl.querySelectorAll('.matrix-table tbody tr');
                    hasAnswer = Array.from(rows).every(row => {
                        return row.querySelector('input[type="radio"]:checked') !== null;
                    });
                    break;
                case 'Rating':
                    const ratingChecked = document.querySelector(`input[name="question-${questionId}"]:checked`);
                    hasAnswer = ratingChecked !== null;
                    
                    // Check comment requirement
                    if (hasAnswer) {
                        const commentSection = document.getElementById(`comment-${questionId}`);
                        if (commentSection && commentSection.style.display !== 'none') {
                            const commentText = document.getElementById(`comment-text-${questionId}`).value.trim();
                            if (!commentText) {
                                showFieldError(`comment-${questionId}`, 'Komentar wajib diisi untuk rating rendah');
                                isValid = false;
                                return;
                            } else {
                                hideFieldError(`comment-${questionId}`);
                            }
                        }
                    }
                    break;
                case 'Date':
                    hasAnswer = document.getElementById(`question-${questionId}`).value !== '';
                    break;
                case 'Signature':
                    hasAnswer = document.getElementById(`signature-data-${questionId}`).value !== '';
                    break;
            }

            if (!hasAnswer) {
                showFieldError(questionId, 'Pertanyaan ini wajib dijawab');
                isValid = false;
            } else {
                hideFieldError(questionId);
            }
        });

        return isValid;
    }

    /**
     * Save current page data
     */
    function saveCurrentPageData() {
        const page = state.pages[state.currentPage];

        switch (page.type) {
            case 'respondent':
                state.respondentData = {
                    name: document.getElementById('respondent-name').value.trim(),
                    email: document.getElementById('respondent-email').value.trim(),
                    businessUnitId: document.getElementById('business-unit').value,
                    divisionId: document.getElementById('division').value,
                    departmentId: document.getElementById('department').value
                };
                break;
            case 'applications':
                const checkboxes = document.querySelectorAll('#application-list input[type="checkbox"]:checked');
                state.selectedApplications = Array.from(checkboxes).map(cb => ({
                    applicationId: cb.value,
                    applicationName: cb.closest('.checkbox-item').querySelector('.option-text strong').textContent
                }));
                break;
            case 'questions':
                saveQuestionResponses(page.data.applicationId);
                break;
        }
    }


    /**
     * Build question pages for selected applications
     */
    async function buildQuestionPages() {
        // Remove existing question pages
        state.pages = state.pages.filter(p => p.type !== 'questions');

        // Fetch questions for this survey
        try {
            const response = await fetch(`${API_BASE_URL}/surveys/${state.surveyId}/questions`);
            const allQuestions = await response.json();

            // Create a question page for each selected application
            state.selectedApplications.forEach(app => {
                state.pages.push({
                    type: 'questions',
                    data: {
                        applicationId: app.applicationId,
                        applicationName: app.applicationName,
                        questions: allQuestions
                    }
                });
            });

            state.totalPages = state.pages.length;
        } catch (error) {
            console.error('Error loading questions:', error);
            showError('Gagal memuat pertanyaan survey');
        }
    }

    /**
     * Save question responses for current application
     */
    function saveQuestionResponses(applicationId) {
        if (!state.responses[applicationId]) {
            state.responses[applicationId] = [];
        }

        const questions = document.querySelectorAll('.question-item');
        
        questions.forEach(questionEl => {
            const questionId = questionEl.dataset.questionId;
            const questionType = questionEl.dataset.questionType;
            let value = null;

            switch (questionType) {
                case 'Text':
                    value = { textValue: document.getElementById(`question-${questionId}`).value.trim() };
                    break;
                case 'MultipleChoice':
                    const radioChecked = document.querySelector(`input[name="question-${questionId}"]:checked`);
                    value = radioChecked ? { textValue: radioChecked.value } : null;
                    break;
                case 'Checkbox':
                    const checkboxesChecked = document.querySelectorAll(`input[name="question-${questionId}"]:checked`);
                    const selectedValues = Array.from(checkboxesChecked).map(cb => cb.value);
                    value = { textValue: selectedValues.join(', ') };
                    break;
                case 'Dropdown':
                    const dropdownValue = document.getElementById(`question-${questionId}`).value;
                    value = dropdownValue ? { textValue: dropdownValue } : null;
                    break;
                case 'MatrixLikert':
                    const matrixValues = {};
                    const rows = questionEl.querySelectorAll('.matrix-table tbody tr');
                    rows.forEach(row => {
                        const radioChecked = row.querySelector('input[type="radio"]:checked');
                        if (radioChecked) {
                            const rowLabel = radioChecked.dataset.row;
                            matrixValues[rowLabel] = parseInt(radioChecked.value);
                        }
                    });
                    value = { matrixValues };
                    break;
                case 'Rating':
                    const ratingChecked = document.querySelector(`input[name="question-${questionId}"]:checked`);
                    if (ratingChecked) {
                        value = { numericValue: parseInt(ratingChecked.value) };
                        
                        // Add comment if exists
                        const commentText = document.getElementById(`comment-text-${questionId}`);
                        if (commentText && commentText.value.trim()) {
                            value.commentValue = commentText.value.trim();
                        }
                    }
                    break;
                case 'Date':
                    const dateValue = document.getElementById(`question-${questionId}`).value;
                    value = dateValue ? { dateValue } : null;
                    break;
                case 'Signature':
                    const signatureData = document.getElementById(`signature-data-${questionId}`).value;
                    value = signatureData ? { textValue: signatureData } : null;
                    break;
            }

            if (value) {
                // Check if response already exists for this question
                const existingIndex = state.responses[applicationId].findIndex(r => r.questionId === questionId);
                if (existingIndex >= 0) {
                    state.responses[applicationId][existingIndex].value = value;
                } else {
                    state.responses[applicationId].push({
                        questionId,
                        applicationId,
                        value
                    });
                }
            }
        });
    }

    /**
     * Submit survey
     */
    async function submitSurvey() {
        // Validate last page
        if (!validateCurrentPage()) {
            return;
        }

        // Save last page data
        saveCurrentPageData();

        // Prepare submission data
        const submissionData = {
            surveyId: state.surveyId,
            respondent: state.respondentData,
            selectedApplicationIds: state.selectedApplications.map(app => app.applicationId),
            responses: []
        };

        // Flatten responses
        Object.keys(state.responses).forEach(appId => {
            submissionData.responses.push(...state.responses[appId]);
        });

        // Disable submit button
        const btnSubmit = document.getElementById('btn-submit');
        btnSubmit.disabled = true;
        btnSubmit.textContent = 'Mengirim...';

        try {
            // Check for duplicates first
            const duplicateCheck = await fetch(`${API_BASE_URL}/responses/check-duplicate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    surveyId: state.surveyId,
                    email: state.respondentData.email,
                    applicationIds: submissionData.selectedApplicationIds
                })
            });

            const duplicateResult = await duplicateCheck.json();
            
            if (duplicateResult.isDuplicate) {
                alert(duplicateResult.message || 'Anda sudah mengisi survey untuk aplikasi ini sebelumnya.');
                btnSubmit.disabled = false;
                btnSubmit.textContent = 'Kirim Survey';
                return;
            }

            // Submit response
            const response = await fetch(`${API_BASE_URL}/responses`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(submissionData)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Gagal mengirim survey');
            }

            // Show success screen
            document.getElementById('survey-container').style.display = 'none';
            document.getElementById('success-screen').style.display = 'flex';

        } catch (error) {
            console.error('Submission error:', error);
            alert(error.message || 'Gagal mengirim survey. Silakan coba lagi.');
            btnSubmit.disabled = false;
            btnSubmit.textContent = 'Kirim Survey';
        }
    }

    /**
     * Show error screen
     */
    function showError(message) {
        document.getElementById('loading-screen').style.display = 'none';
        document.getElementById('survey-container').style.display = 'none';
        document.getElementById('error-message').textContent = message;
        document.getElementById('error-screen').style.display = 'flex';
    }

    /**
     * Show field error
     */
    function showFieldError(fieldId, message) {
        const errorEl = document.getElementById(`error-${fieldId}`);
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.classList.add('show');
        }
        
        const fieldEl = document.getElementById(fieldId) || document.getElementById(`question-${fieldId}`);
        if (fieldEl) {
            fieldEl.classList.add('error');
        }
    }

    /**
     * Hide field error
     */
    function hideFieldError(fieldId) {
        const errorEl = document.getElementById(`error-${fieldId}`);
        if (errorEl) {
            errorEl.classList.remove('show');
        }
        
        const fieldEl = document.getElementById(fieldId) || document.getElementById(`question-${fieldId}`);
        if (fieldEl) {
            fieldEl.classList.remove('error');
        }
    }


    /**
     * Signature Modal Functions
     */
    function openSignatureModal(questionId) {
        state.currentSignatureQuestionId = questionId;
        const modal = document.getElementById('signature-modal');
        modal.style.display = 'flex';

        // Initialize canvas
        const canvas = document.getElementById('signature-canvas');
        state.signatureCanvas = canvas;
        state.signatureContext = canvas.getContext('2d');

        // Set canvas size
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;

        // Configure context
        state.signatureContext.strokeStyle = '#000';
        state.signatureContext.lineWidth = 2;
        state.signatureContext.lineCap = 'round';
        state.signatureContext.lineJoin = 'round';

        // Load existing signature if any
        const existingSignature = document.getElementById(`signature-data-${questionId}`).value;
        if (existingSignature) {
            const img = new Image();
            img.onload = function() {
                state.signatureContext.drawImage(img, 0, 0);
            };
            img.src = existingSignature;
        }

        // Attach drawing event listeners
        attachSignatureListeners();
    }

    function closeSignatureModal() {
        const modal = document.getElementById('signature-modal');
        modal.style.display = 'none';
        
        // Remove event listeners
        if (state.signatureCanvas) {
            state.signatureCanvas.removeEventListener('mousedown', startDrawing);
            state.signatureCanvas.removeEventListener('mousemove', draw);
            state.signatureCanvas.removeEventListener('mouseup', stopDrawing);
            state.signatureCanvas.removeEventListener('mouseout', stopDrawing);
            state.signatureCanvas.removeEventListener('touchstart', startDrawing);
            state.signatureCanvas.removeEventListener('touchmove', draw);
            state.signatureCanvas.removeEventListener('touchend', stopDrawing);
        }
    }

    function attachSignatureListeners() {
        const canvas = state.signatureCanvas;

        // Mouse events
        canvas.addEventListener('mousedown', startDrawing);
        canvas.addEventListener('mousemove', draw);
        canvas.addEventListener('mouseup', stopDrawing);
        canvas.addEventListener('mouseout', stopDrawing);

        // Touch events
        canvas.addEventListener('touchstart', startDrawing);
        canvas.addEventListener('touchmove', draw);
        canvas.addEventListener('touchend', stopDrawing);
    }

    function startDrawing(e) {
        e.preventDefault();
        state.isDrawing = true;

        const pos = getMousePos(e);
        state.signatureContext.beginPath();
        state.signatureContext.moveTo(pos.x, pos.y);
    }

    function draw(e) {
        if (!state.isDrawing) return;
        e.preventDefault();

        const pos = getMousePos(e);
        state.signatureContext.lineTo(pos.x, pos.y);
        state.signatureContext.stroke();
    }

    function stopDrawing(e) {
        if (!state.isDrawing) return;
        e.preventDefault();
        
        state.isDrawing = false;
        state.signatureContext.closePath();
    }

    function getMousePos(e) {
        const canvas = state.signatureCanvas;
        const rect = canvas.getBoundingClientRect();
        
        let clientX, clientY;
        
        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    }

    function clearSignature() {
        const canvas = state.signatureCanvas;
        state.signatureContext.clearRect(0, 0, canvas.width, canvas.height);
    }

    function saveSignature() {
        const canvas = state.signatureCanvas;
        const dataUrl = canvas.toDataURL('image/png');
        
        // Save to hidden input
        const questionId = state.currentSignatureQuestionId;
        document.getElementById(`signature-data-${questionId}`).value = dataUrl;
        
        // Update preview
        const preview = document.getElementById(`signature-preview-${questionId}`);
        preview.innerHTML = `<img src="${dataUrl}" alt="Signature">`;
        
        // Close modal
        closeSignatureModal();
    }

    /**
     * Event Listeners
     */
    function attachEventListeners() {
        // Navigation buttons
        document.getElementById('btn-prev').addEventListener('click', prevPage);
        document.getElementById('btn-next').addEventListener('click', nextPage);
        document.getElementById('btn-submit').addEventListener('click', submitSurvey);
    }

    /**
     * Public API
     */
    return {
        init,
        openSignatureModal,
        closeSignatureModal,
        clearSignature,
        saveSignature
    };
})();

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    SurveyApp.init();
});
