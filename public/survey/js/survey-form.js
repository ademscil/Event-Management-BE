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
        applications: [],
        selectedApplications: [],
        defaultApplicationId: null,
        defaultApplicationName: 'Survey',
        respondentData: {},
        responses: {},
        answerTextByQuestionId: {},
        sourceQuestionIds: {},
        masterData: {
            businessUnits: [],
            divisions: [],
            departments: [],
            functions: [],
            applicationsByDepartment: {},
            applicationsByFunction: {}
        },
        signatureCanvas: null,
        signatureContext: null,
        currentSignatureQuestionId: null,
        isDrawing: false
    };

    const API_BASE_URL = '/api/v1';

    function normalizeQuestion(question) {
        const options = question.options || {};
        const normalized = { ...question, options: {} };

        if (question.type === 'MultipleChoice' || question.type === 'Checkbox') {
            const sourceOptions = Array.isArray(options.options) ? options.options : [];
            normalized.options = {
                choices: sourceOptions.map(opt => ({ text: String(opt) })),
                orientation: options.layout === 'horizontal' ? 'horizontal' : 'vertical',
                dataSource: normalizeDataSource(options.dataSource),
                displayCondition: String(options.displayCondition || 'always')
            };
            normalized.pageTitle = String(options.pageTitle || '').trim();
            return normalized;
        }

        if (question.type === 'Dropdown') {
            normalized.options = {
                dropdownOptions: Array.isArray(options.options) ? options.options.map(opt => String(opt)) : [],
                dataSource: normalizeDataSource(options.dataSource),
                displayCondition: String(options.displayCondition || 'always')
            };
            normalized.pageTitle = String(options.pageTitle || '').trim();
            return normalized;
        }

        if (question.type === 'MatrixLikert') {
            if (options.variant === 'matrix') {
                normalized.options = {
                    matrixRows: Array.isArray(options.columns) && options.columns.length > 0
                        ? options.columns.map(col => String(col))
                        : ['Statement 1', 'Statement 2', 'Statement 3'],
                    scaleMin: 1,
                    scaleMax: 10,
                    displayCondition: String(options.displayCondition || 'always')
                };
                normalized.pageTitle = String(options.pageTitle || '').trim();
                return normalized;
            }

            normalized.options = {
                matrixRows: Array.isArray(options.rows) && options.rows.length > 0
                    ? options.rows.map(row => String(row))
                    : ['Statement 1', 'Statement 2'],
                scaleMin: 1,
                scaleMax: 10,
                displayCondition: String(options.displayCondition || 'always')
            };
            normalized.pageTitle = String(options.pageTitle || '').trim();
            return normalized;
        }

        if (question.type === 'Rating') {
            normalized.options = {
                ratingScale: Number(options.ratingScale || 10),
                commentRequiredBelowRating: options.commentRequiredBelowRating || null,
                displayCondition: String(options.displayCondition || 'always')
            };
            normalized.pageTitle = String(options.pageTitle || '').trim();
            return normalized;
        }

        normalized.options = options;
        normalized.pageTitle = String(options.pageTitle || '').trim();
        return normalized;
    }

    function normalizeDataSource(value) {
        const source = String(value || 'manual').toLowerCase();
        if (
            source === 'bu' ||
            source === 'division' ||
            source === 'department' ||
            source === 'function' ||
            source === 'app_department' ||
            source === 'app_function'
        ) {
            return source;
        }
        return 'manual';
    }

    function buildSourceQuestionIds(questions) {
        const result = {};
        questions.forEach(question => {
            if (question.type !== 'Dropdown' && question.type !== 'MultipleChoice' && question.type !== 'Checkbox') return;
            const source = normalizeDataSource(question.options && question.options.dataSource);
            if (source !== 'manual' && !result[source]) {
                result[source] = question.questionId;
            }
        });
        state.sourceQuestionIds = result;
    }

    function getQuestionElementValue(questionId) {
        const element = document.getElementById(`question-${questionId}`);
        if (!element) return '';
        if (typeof element.value === 'string') return element.value;
        return '';
    }

    function getAnswerValue(questionId) {
        if (!questionId) return '';
        const elementValue = getQuestionElementValue(questionId);
        if (elementValue) return elementValue;
        return String(state.answerTextByQuestionId[questionId] || '');
    }

    function findIdByName(items, name) {
        const normalized = String(name || '').trim().toLowerCase();
        if (!normalized) return '';
        const found = items.find(item => String(item.name || '').trim().toLowerCase() === normalized);
        return found ? String(found.id) : '';
    }

    async function fetchApplicationsByDepartment(departmentId) {
        if (!departmentId) return [];
        if (state.masterData.applicationsByDepartment[departmentId]) {
            return state.masterData.applicationsByDepartment[departmentId];
        }

        try {
            const response = await fetch(`${API_BASE_URL}/responses/survey/${state.surveyId}/applications?departmentId=${departmentId}`);
            if (!response.ok) return [];
            const payload = await response.json();
            const apps = Array.isArray(payload.applications)
                ? payload.applications.map(app => ({
                    id: app.applicationId,
                    name: String(app.name || '').trim()
                })).filter(app => app.id && app.name)
                : [];
            state.masterData.applicationsByDepartment[departmentId] = apps;
            return apps;
        } catch (error) {
            console.error('Failed to load applications by department:', error);
            return [];
        }
    }

    async function fetchApplicationsByFunction(functionId) {
        if (!functionId) return [];
        if (state.masterData.applicationsByFunction[functionId]) {
            return state.masterData.applicationsByFunction[functionId];
        }

        try {
            const response = await fetch(`${API_BASE_URL}/responses/survey/${state.surveyId}/applications?functionId=${functionId}`);
            if (!response.ok) return [];
            const payload = await response.json();
            const apps = Array.isArray(payload.applications)
                ? payload.applications.map(app => ({
                    id: app.applicationId,
                    name: String(app.name || '').trim()
                })).filter(app => app.id && app.name)
                : [];
            state.masterData.applicationsByFunction[functionId] = apps;
            return apps;
        } catch (error) {
            console.error('Failed to load applications by function:', error);
            return [];
        }
    }

    async function initializeApplicationContext() {
        const response = await fetch(`${API_BASE_URL}/responses/survey/${state.surveyId}/applications`);
        if (!response.ok) {
            throw new Error('Gagal memuat aplikasi survey');
        }
        const payload = await response.json();
        state.applications = Array.isArray(payload.applications) ? payload.applications : [];

        if (state.applications.length === 0) {
            throw new Error('Tidak ada aplikasi yang tersedia untuk survey ini');
        }

        state.defaultApplicationId = state.applications[0].applicationId;
        state.defaultApplicationName = state.applications[0].name || 'Survey';
        state.selectedApplications = [{
            applicationId: state.defaultApplicationId,
            applicationName: state.defaultApplicationName
        }];
    }

    async function initializeMasterData() {
        try {
            const [buResponse, divisionResponse, departmentResponse, functionResponse] = await Promise.all([
                fetch(`${API_BASE_URL}/public/business-units`),
                fetch(`${API_BASE_URL}/public/divisions`),
                fetch(`${API_BASE_URL}/public/departments`),
                fetch(`${API_BASE_URL}/public/functions`)
            ]);

            if (!buResponse.ok) {
                state.masterData.businessUnits = [];
                return;
            }

            const [buPayload, divisionPayload, departmentPayload, functionPayload] = await Promise.all([
                buResponse.json(),
                divisionResponse.ok ? divisionResponse.json() : Promise.resolve({ divisions: [] }),
                departmentResponse.ok ? departmentResponse.json() : Promise.resolve({ departments: [] }),
                functionResponse.ok ? functionResponse.json() : Promise.resolve({ functions: [] })
            ]);

            state.masterData.businessUnits = Array.isArray(buPayload.businessUnits)
                ? buPayload.businessUnits.map(item => ({
                    id: item.BusinessUnitId,
                    name: String(item.Name || '').trim()
                })).filter(item => item.id && item.name)
                : [];

            state.masterData.divisions = Array.isArray(divisionPayload.divisions)
                ? divisionPayload.divisions.map(item => ({
                    id: item.DivisionId,
                    businessUnitId: item.BusinessUnitId,
                    name: String(item.Name || '').trim()
                })).filter(item => item.id && item.name)
                : [];

            state.masterData.departments = Array.isArray(departmentPayload.departments)
                ? departmentPayload.departments.map(item => ({
                    id: item.DepartmentId,
                    divisionId: item.DivisionId,
                    name: String(item.Name || '').trim()
                })).filter(item => item.id && item.name)
                : [];

            state.masterData.functions = Array.isArray(functionPayload.functions)
                ? functionPayload.functions.map(item => ({
                    id: item.FunctionId,
                    name: String(item.Name || '').trim()
                })).filter(item => item.id && item.name)
                : [];
        } catch (error) {
            console.error('Failed to load master business units:', error);
            state.masterData.businessUnits = [];
        }
    }

    async function hydrateQuestionDataSources(questions) {
        const selectedBuValue = getAnswerValue(state.sourceQuestionIds.bu);
        const selectedDivisionValue = getAnswerValue(state.sourceQuestionIds.division);
        const selectedDepartmentValue = getAnswerValue(state.sourceQuestionIds.department);
        const selectedFunctionValue = getAnswerValue(state.sourceQuestionIds.function);

        const selectedBuId = findIdByName(state.masterData.businessUnits, selectedBuValue);
        const selectedDivisionId = findIdByName(state.masterData.divisions, selectedDivisionValue);
        const selectedDepartmentId = findIdByName(state.masterData.departments, selectedDepartmentValue);
        const selectedFunctionId = findIdByName(state.masterData.functions, selectedFunctionValue);

        const filteredDivisions = selectedBuId
            ? state.masterData.divisions.filter(item => String(item.businessUnitId || '') === selectedBuId)
            : state.masterData.divisions;
        const filteredDepartments = selectedDivisionId
            ? state.masterData.departments.filter(item => String(item.divisionId || '') === selectedDivisionId)
            : state.masterData.departments;

        const appByDepartment = await fetchApplicationsByDepartment(selectedDepartmentId);
        const appByFunction = await fetchApplicationsByFunction(selectedFunctionId);

        return questions.map(question => {
            if (question.type !== 'Dropdown' && question.type !== 'MultipleChoice' && question.type !== 'Checkbox') {
                return question;
            }

            const options = question.options || {};
            const source = normalizeDataSource(options.dataSource);
            const currentDropdownOptions = Array.isArray(options.dropdownOptions) ? options.dropdownOptions : [];
            const currentChoiceOptions = Array.isArray(options.choices) ? options.choices : [];
            let dynamicOptions = question.type === 'Dropdown'
                ? currentDropdownOptions
                : currentChoiceOptions.map(item => String(item.text || '').trim()).filter(Boolean);

            if (source === 'bu') {
                dynamicOptions = state.masterData.businessUnits.map(item => item.name);
            } else if (source === 'division') {
                dynamicOptions = filteredDivisions.map(item => item.name);
            } else if (source === 'department') {
                dynamicOptions = filteredDepartments.map(item => item.name);
            } else if (source === 'function') {
                dynamicOptions = state.masterData.functions.map(item => item.name);
            } else if (source === 'app_department') {
                dynamicOptions = appByDepartment.map(item => item.name);
            } else if (source === 'app_function') {
                dynamicOptions = appByFunction.map(item => item.name);
            }

            if (question.type === 'Dropdown') {
                return {
                    ...question,
                    options: {
                        ...options,
                        dropdownOptions: dynamicOptions
                    }
                };
            }

            return {
                ...question,
                options: {
                    ...options,
                    choices: dynamicOptions.map(item => ({ text: item }))
                }
            };
        });
    }

    function filterQuestionsByVisibility(questions) {
        const mappedSelector = questions.find(question => {
            if (question.type !== 'Dropdown' && question.type !== 'MultipleChoice' && question.type !== 'Checkbox') {
                return false;
            }
            const source = normalizeDataSource(question.options && question.options.dataSource);
            return source === 'app_department' || source === 'app_function';
        });

        if (!mappedSelector) {
            return questions;
        }

        const mappedValue = getAnswerValue(mappedSelector.questionId);
        const hasMappedSelection = String(mappedValue || '').trim().length > 0;

        return questions.filter(question => {
            if (question.questionId === mappedSelector.questionId) return true;
            const displayCondition = String((question.options && question.options.displayCondition) || 'always');
            if (displayCondition !== 'after_mapped_selection') return true;
            return hasMappedSelection;
        });
    }

    function sanitizeIdentityValue(value, maxLength) {
        const raw = String(value || '').trim();
        if (!raw) return '';
        return raw.slice(0, maxLength);
    }

    function normalizeEmail(value) {
        const email = sanitizeIdentityValue(value, 200).toLowerCase();
        if (!email) return '';
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailPattern.test(email) ? email : '';
    }

    function getHostBasedFallbackEmail(localId) {
        const host = String(window.location.hostname || 'localhost')
            .toLowerCase()
            .replace(/[^a-z0-9.-]/g, '');
        const domain = host.includes('.') ? host : `${host}.local`;
        return `${localId}@${domain}`;
    }

    function getOrCreateRespondentLocalId() {
        const storageKey = `csi.respondent.${state.surveyId}`;
        try {
            const existing = localStorage.getItem(storageKey);
            if (existing && /^[a-z0-9-]{6,64}$/i.test(existing)) {
                return existing.toLowerCase();
            }
        } catch (error) {
            console.warn('Unable to read respondent identity from localStorage:', error);
        }

        const randomId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID().replace(/[^a-z0-9-]/gi, '').toLowerCase()
            : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
        const localId = `respondent-${randomId}`.slice(0, 64);

        try {
            localStorage.setItem(storageKey, localId);
        } catch (error) {
            console.warn('Unable to persist respondent identity to localStorage:', error);
        }

        return localId;
    }

    function resolveRespondentIdentity() {
        const nameFromLink = sanitizeIdentityValue(state.respondentData.name, 200);
        const emailFromLink = normalizeEmail(state.respondentData.email);
        const localId = getOrCreateRespondentLocalId();

        const respondentName = nameFromLink || 'Bapak/Ibu Responden';
        const respondentEmail = emailFromLink || getHostBasedFallbackEmail(localId);

        return {
            name: respondentName,
            email: respondentEmail
        };
    }

    /**
     * Initialize application
     */
    async function init() {
        try {
            // Get survey ID from URL parameter
            const urlParams = new URLSearchParams(window.location.search);
            state.surveyId = urlParams.get('id');
            state.respondentData = {
                name: sanitizeIdentityValue(urlParams.get('respondentName') || urlParams.get('name'), 200),
                email: normalizeEmail(urlParams.get('respondentEmail') || urlParams.get('email'))
            };

            if (!state.surveyId) {
                showError('Survey ID tidak ditemukan. Silakan gunakan link yang valid.');
                return;
            }

            // Fetch survey data
            await loadSurveyData();
            await initializeApplicationContext();
            await initializeMasterData();
            // Build page structure
            buildPageStructure();

            // Render first page
            await renderCurrentPage();

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
        const response = await fetch(`${API_BASE_URL}/responses/survey/${state.surveyId}/form`);
        if (!response.ok) {
            throw new Error('Survey tidak ditemukan atau sudah tidak aktif');
        }

        const payload = await response.json();
        state.survey = payload.form;

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

        const questions = (state.survey.questions || []).map(normalizeQuestion);
        buildSourceQuestionIds(questions);
        const groupedByPage = new Map();

        questions.forEach(question => {
            const pageNumber = Number(question.pageNumber || 1);
            if (!groupedByPage.has(pageNumber)) {
                groupedByPage.set(pageNumber, []);
            }
            groupedByPage.get(pageNumber).push(question);
        });

        const orderedPages = Array.from(groupedByPage.keys()).sort((a, b) => a - b);
        orderedPages.forEach(pageNumber => {
            const pageQuestions = groupedByPage
                .get(pageNumber)
                .slice()
                .sort((a, b) => Number(a.displayOrder || 0) - Number(b.displayOrder || 0));
            const resolvedPageTitle =
                pageQuestions.find((question) => String(question.pageTitle || '').trim() !== '')?.pageTitle ||
                `Page ${pageNumber}`;

            state.pages.push({
                type: 'questions',
                data: {
                    pageNumber,
                    pageTitle: resolvedPageTitle,
                    applicationId: state.defaultApplicationId,
                    applicationName: state.defaultApplicationName,
                    questions: pageQuestions
                }
            });
        });

        state.totalPages = state.pages.length;
    }

    /**
     * Render current page
     */
    async function renderCurrentPage() {
        const page = state.pages[state.currentPage];
        const content = document.getElementById('survey-content');

        switch (page.type) {
            case 'questions':
                {
                    const hydratedQuestions = await hydrateQuestionDataSources(page.data.questions);
                    const visibleQuestions = filterQuestionsByVisibility(hydratedQuestions);
                    content.innerHTML = SurveyRenderer.renderQuestionsPage(
                        visibleQuestions,
                        page.data.pageTitle,
                        page.data.pageSubtitle
                    );
                }
                restoreCurrentPageInputs(page.data.applicationId);
                attachQuestionEventListeners();
                break;
        }

        updateNavigation();
        updateProgressBar();
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
            if (!input) return;

            if (input.checked) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }

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

        const dropdownInputs = document.querySelectorAll('.question-item[data-question-type="Dropdown"] select.form-control');
        dropdownInputs.forEach(input => {
            input.addEventListener('change', async () => {
                const questionEl = input.closest('.question-item');
                if (!questionEl) return;
                const questionId = questionEl.dataset.questionId;
                if (!questionId) return;
                state.answerTextByQuestionId[questionId] = input.value;
                saveCurrentPageData();
                await renderCurrentPage();
            });
        });

        const mappedSelectorInputs = document.querySelectorAll(
            '.question-item[data-data-source="app_department"] input, .question-item[data-data-source="app_function"] input',
        );
        mappedSelectorInputs.forEach(input => {
            input.addEventListener('change', async () => {
                saveCurrentPageData();
                await renderCurrentPage();
            });
        });

        const signatureButtons = document.querySelectorAll('.question-item[data-question-type="Signature"] .signature-open');
        signatureButtons.forEach(button => {
            button.addEventListener('click', () => {
                const questionId = button.getAttribute('data-question-id');
                if (!questionId) return;
                openSignatureModal(questionId);
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

        // Move to next page
        state.currentPage++;
        await renderCurrentPage();
    }

    /**
     * Navigate to previous page
     */
    function prevPage() {
        if (state.currentPage > 0) {
            state.currentPage--;
            void renderCurrentPage();
        }
    }

    /**
     * Validate current page
     */
    function validateCurrentPage() {
        const page = state.pages[state.currentPage];
        
        switch (page.type) {
            case 'questions':
                return validateQuestions();
            default:
                return true;
        }
    }

    /**
     * Validate questions
     */
    function validateQuestions() {
        let isValid = true;
        const normalizeQuestionRef = (value) => {
            const raw = String(value || '').trim();
            if (raw.toLowerCase().startsWith('q-')) {
                return raw.slice(2);
            }
            return raw;
        };

        const currentPage = state.pages[state.currentPage];
        const pageQuestions =
            currentPage && currentPage.type === 'questions' && currentPage.data && Array.isArray(currentPage.data.questions)
                ? currentPage.data.questions
                : [];

        const findQuestionById = (questionId) => {
            const normalizedQuestionId = normalizeQuestionRef(questionId);
            return pageQuestions.find((item) => normalizeQuestionRef(item.questionId) === normalizedQuestionId);
        };

        const resolveCurrentNumericValue = (questionId) => {
            const checked = document.querySelector(`input[name="question-${questionId}"]:checked`);
            if (checked) {
                const parsed = Number(checked.value);
                if (Number.isFinite(parsed)) return parsed;
            }

            const applicationId = currentPage && currentPage.data ? currentPage.data.applicationId : null;
            const saved = applicationId && Array.isArray(state.responses[applicationId])
                ? state.responses[applicationId].find((item) => String(item.questionId) === String(questionId))
                : null;
            if (saved && saved.value) {
                const numericValue = Number(saved.value.numericValue);
                if (Number.isFinite(numericValue)) return numericValue;
                const textValue = Number(String(saved.value.textValue || '').trim());
                if (Number.isFinite(textValue)) return textValue;
            }

            return 0;
        };

        const isConditionallyRequired = (question) => {
            if (!question || !question.options || !question.options.conditionalRequired) return false;
            const conditional = question.options.conditionalRequired;
            const sourceId = normalizeQuestionRef(conditional.sourceElementId);
            if (!sourceId) return false;

            const thresholdRaw = Number(conditional.threshold);
            const threshold = Number.isFinite(thresholdRaw)
                ? Math.min(10, Math.max(1, Math.round(thresholdRaw)))
                : 7;
            const sourceValue = resolveCurrentNumericValue(sourceId);
            return Number.isFinite(sourceValue) && sourceValue > 0 && sourceValue < threshold;
        };

        const questions = document.querySelectorAll('.question-item');

        questions.forEach(questionEl => {
            const questionId = questionEl.dataset.questionId;
            const questionType = questionEl.dataset.questionType;
            const questionDef = findQuestionById(questionId);
            const labelEl = questionEl.querySelector('.form-label');
            const staticMandatory = labelEl ? labelEl.classList.contains('required') : Boolean(questionDef && questionDef.isMandatory);
            const isMandatory = staticMandatory || isConditionallyRequired(questionDef);

            if (!isMandatory) return;

            let hasAnswer = false;

            switch (questionType) {
                case 'Text':
                    const textInput = document.getElementById(`question-${questionId}`);
                    const textValue = textInput && typeof textInput.value === 'string' ? textInput.value.trim() : '';
                    hasAnswer = textValue.length > 0;
                    break;
                case 'MultipleChoice':
                    hasAnswer = document.querySelector(`input[name="question-${questionId}"]:checked`) !== null;
                    break;
                case 'Checkbox':
                    hasAnswer = document.querySelectorAll(`input[name="question-${questionId}"]:checked`).length > 0;
                    break;
                case 'Dropdown':
                    {
                        const dropdownInput = document.getElementById(`question-${questionId}`);
                        hasAnswer = dropdownInput && typeof dropdownInput.value === 'string' ? dropdownInput.value !== '' : false;
                    }
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
                            const commentInput = document.getElementById(`comment-text-${questionId}`);
                            const commentText = commentInput && typeof commentInput.value === 'string' ? commentInput.value.trim() : '';
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
                    {
                        const dateInput = document.getElementById(`question-${questionId}`);
                        hasAnswer = dateInput && typeof dateInput.value === 'string' ? dateInput.value !== '' : false;
                    }
                    break;
                case 'Signature':
                    {
                        const signatureInput = document.getElementById(`signature-data-${questionId}`);
                        hasAnswer = signatureInput && typeof signatureInput.value === 'string' ? signatureInput.value !== '' : false;
                    }
                    break;
                case 'HeroCover':
                    hasAnswer = true;
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
            case 'questions':
                saveQuestionResponses(page.data.applicationId);
                break;
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
                    state.answerTextByQuestionId[questionId] = value.textValue;
                    break;
                case 'MultipleChoice':
                    const radioChecked = document.querySelector(`input[name="question-${questionId}"]:checked`);
                    value = radioChecked ? { textValue: radioChecked.value } : null;
                    if (radioChecked) state.answerTextByQuestionId[questionId] = radioChecked.value;
                    break;
                case 'Checkbox':
                    const checkboxesChecked = document.querySelectorAll(`input[name="question-${questionId}"]:checked`);
                    const selectedValues = Array.from(checkboxesChecked).map(cb => cb.value);
                    value = { textValue: selectedValues.join(', ') };
                    state.answerTextByQuestionId[questionId] = selectedValues.join(', ');
                    break;
                case 'Dropdown':
                    const dropdownValue = document.getElementById(`question-${questionId}`).value;
                    value = dropdownValue ? { textValue: dropdownValue } : null;
                    state.answerTextByQuestionId[questionId] = dropdownValue || '';
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
                    state.answerTextByQuestionId[questionId] = dateValue || '';
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

    function restoreCurrentPageInputs(applicationId) {
        const savedResponses = Array.isArray(state.responses[applicationId]) ? state.responses[applicationId] : [];
        savedResponses.forEach(item => {
            if (!item || !item.questionId || !item.value) return;
            const questionId = item.questionId;
            const value = item.value;
            const input = document.getElementById(`question-${questionId}`);
            if (!input) {
                const signatureInput = document.getElementById(`signature-data-${questionId}`);
                if (signatureInput && typeof value.textValue === 'string' && value.textValue.trim()) {
                    signatureInput.value = value.textValue;
                    const preview = document.getElementById(`signature-preview-${questionId}`);
                    if (preview) {
                        preview.innerHTML = `<img src="${value.textValue}" alt="Signature">`;
                    }
                }
                return;
            }

            if (input.tagName === 'SELECT' && typeof value.textValue === 'string') {
                const hasOption = Array.from(input.options || []).some(opt => opt.value === value.textValue);
                if (hasOption) {
                    input.value = value.textValue;
                    state.answerTextByQuestionId[questionId] = value.textValue;
                }
                return;
            }

            if (input.tagName === 'TEXTAREA' && typeof value.textValue === 'string') {
                input.value = value.textValue;
                state.answerTextByQuestionId[questionId] = value.textValue;
                return;
            }

            if (input.tagName === 'INPUT' && input.type === 'date' && value.dateValue) {
                input.value = value.dateValue;
                state.answerTextByQuestionId[questionId] = value.dateValue;
                return;
            }

            if (typeof value.textValue === 'string') {
                const radioInputs = document.querySelectorAll(`input[name="question-${questionId}"][type="radio"]`);
                if (radioInputs.length > 0) {
                    radioInputs.forEach((radio) => {
                        const isMatch = radio.value === value.textValue;
                        radio.checked = isMatch;
                        const item = radio.closest('.radio-item');
                        if (item) {
                            item.classList.toggle('selected', isMatch);
                        }
                    });
                    state.answerTextByQuestionId[questionId] = value.textValue;
                    return;
                }

                const checkboxInputs = document.querySelectorAll(`input[name="question-${questionId}"][type="checkbox"]`);
                if (checkboxInputs.length > 0) {
                    const selectedSet = new Set(
                        value.textValue.split(',').map(item => item.trim()).filter(Boolean),
                    );
                    checkboxInputs.forEach((checkbox) => {
                        const isChecked = selectedSet.has(checkbox.value);
                        checkbox.checked = isChecked;
                        const item = checkbox.closest('.checkbox-item');
                        if (item) {
                            item.classList.toggle('selected', isChecked);
                        }
                    });
                    state.answerTextByQuestionId[questionId] = value.textValue;
                }
            }
        });
    }

    function resolveSelectedApplicationIds() {
        const mappedSourceKeys = ['app_department', 'app_function'];
        const selectedNames = mappedSourceKeys
            .map(key => state.sourceQuestionIds[key])
            .filter(Boolean)
            .flatMap(questionId =>
                String(state.answerTextByQuestionId[questionId] || '')
                    .split(',')
                    .map(item => item.trim())
                    .filter(Boolean),
            );

        if (selectedNames.length === 0) {
            return state.selectedApplications.length > 0
                ? state.selectedApplications.map(app => app.applicationId)
                : [state.defaultApplicationId];
        }

        const selectedNameSet = new Set(selectedNames.map(name => name.toLowerCase()));
        const selectedIds = state.applications
            .filter(app => selectedNameSet.has(String(app.name || '').trim().toLowerCase()))
            .map(app => app.applicationId);

        return selectedIds.length > 0 ? selectedIds : [state.defaultApplicationId];
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

        const respondentIdentity = resolveRespondentIdentity();

        // Prepare submission data
        const submissionData = {
            surveyId: state.surveyId,
            respondent: respondentIdentity,
            selectedApplicationIds: resolveSelectedApplicationIds(),
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
                    email: submissionData.respondent.email,
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

        // Persist signature in current page responses immediately.
        saveCurrentPageData();
        
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

        const signatureCloseBtn = document.getElementById('signature-modal-close');
        if (signatureCloseBtn) {
            signatureCloseBtn.addEventListener('click', closeSignatureModal);
        }

        const signatureClearBtn = document.getElementById('signature-clear-btn');
        if (signatureClearBtn) {
            signatureClearBtn.addEventListener('click', clearSignature);
        }

        const signatureSaveBtn = document.getElementById('signature-save-btn');
        if (signatureSaveBtn) {
            signatureSaveBtn.addEventListener('click', saveSignature);
        }
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

// Expose app for inline onclick handlers used by survey renderer/template.
if (typeof window !== 'undefined') {
    window.SurveyApp = SurveyApp;
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    SurveyApp.init();
});
