/**
 * Survey Builder Module
 * Handles survey creation and editing with drag-and-drop question builder
 */

(function() {
    'use strict';

    const API_BASE = '/api/v1';
    let surveyData = {
        surveyId: null,
        title: '',
        description: '',
        startDate: '',
        endDate: '',
        targetRespondents: null,
        targetScore: null,
        configuration: {
            heroImageUrl: null,
            logoUrl: null,
            backgroundColor: '#ffffff',
            backgroundImageUrl: null,
            fontFamily: 'Figtree',
            showProgressBar: false,
            showPageNumbers: false
        },
        pages: [{ pageNumber: 1, questions: [] }]
    };

    let currentPage = 1;
    let selectedQuestionIndex = null;
    let draggedQuestionIndex = null;

    // Initialize on page load
    document.addEventListener('DOMContentLoaded', function() {
        // Check authentication
        if (!window.AuthUtils.checkAuth()) {
            return;
        }

        // Initialize sidebar
        if (window.SidebarUtils) {
            window.SidebarUtils.init();
        }

        // Check if editing existing survey
        const editingSurveyId = localStorage.getItem('editing_survey_id');
        if (editingSurveyId) {
            loadSurveyData(editingSurveyId);
            localStorage.removeItem('editing_survey_id');
        }

        // Initialize page
        initializePage();
    });

    function initializePage() {
        // Event listeners
        document.getElementById('back-btn').addEventListener('click', () => {
            window.location.href = 'event-management';
        });

        document.getElementById('preview-btn').addEventListener('click', showPreview);
        document.getElementById('save-draft-btn').addEventListener('click', () => saveSurvey(false));
        document.getElementById('publish-btn').addEventListener('click', () => saveSurvey(true));
        document.getElementById('logout-btn').addEventListener('click', () => window.AuthUtils.logout());
        document.getElementById('preview-close').addEventListener('click', closePreview);

        // Survey details
        document.getElementById('survey-title').addEventListener('input', updateSurveyData);
        document.getElementById('survey-description').addEventListener('input', updateSurveyData);
        document.getElementById('survey-start-date').addEventListener('change', updateSurveyData);
        document.getElementById('survey-end-date').addEventListener('change', updateSurveyData);
        document.getElementById('survey-target-respondents').addEventListener('input', updateSurveyData);
        document.getElementById('survey-target-score').addEventListener('input', updateSurveyData);

        // Theme configuration
        document.getElementById('hero-image-upload').addEventListener('change', handleHeroImageUpload);
        document.getElementById('logo-upload').addEventListener('change', handleLogoUpload);
        document.getElementById('bg-color-picker').addEventListener('input', handleBgColorChange);
        document.getElementById('bg-color-text').addEventListener('input', handleBgColorTextChange);
        document.getElementById('bg-image-upload').addEventListener('change', handleBgImageUpload);
        document.getElementById('font-family').addEventListener('change', handleFontChange);
        document.getElementById('show-progress-bar').addEventListener('change', updateSurveyData);
        document.getElementById('show-page-numbers').addEventListener('change', updateSurveyData);

        // Question types
        document.querySelectorAll('.question-type-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                addQuestion(this.dataset.type);
            });
        });

        // Page management
        document.getElementById('add-page-btn').addEventListener('click', addPage);

        // Initialize page tabs
        updatePageTabs();
    }

    async function loadSurveyData(surveyId) {
        try {
            const response = await fetch(`${API_BASE}/surveys/${surveyId}`, {
                headers: {
                    'Authorization': `Bearer ${window.AuthUtils.getToken()}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to load survey');
            }

            const data = await response.json();
            surveyData = data;

            // Apply data to form
            document.getElementById('survey-title').value = data.title || '';
            document.getElementById('survey-description').value = data.description || '';
            document.getElementById('survey-start-date').value = data.startDate ? data.startDate.split('T')[0] : '';
            document.getElementById('survey-end-date').value = data.endDate ? data.endDate.split('T')[0] : '';
            document.getElementById('survey-target-respondents').value = data.targetRespondents || '';
            document.getElementById('survey-target-score').value = data.targetScore || '';

            // Apply theme configuration
            if (data.configuration) {
                const config = data.configuration;
                
                if (config.heroImageUrl) {
                    document.getElementById('hero-image-preview').src = config.heroImageUrl;
                    document.getElementById('hero-image-preview').style.display = 'block';
                }
                
                if (config.logoUrl) {
                    document.getElementById('logo-preview').src = config.logoUrl;
                    document.getElementById('logo-preview').style.display = 'block';
                    document.getElementById('brand-preview-logo').src = config.logoUrl;
                    document.getElementById('brand-preview-logo').style.display = 'block';
                }
                
                if (config.backgroundColor) {
                    document.getElementById('bg-color-picker').value = config.backgroundColor;
                    document.getElementById('bg-color-text').value = config.backgroundColor;
                    document.getElementById('brand-preview').style.backgroundColor = config.backgroundColor;
                }
                
                if (config.backgroundImageUrl) {
                    document.getElementById('bg-image-preview').src = config.backgroundImageUrl;
                    document.getElementById('bg-image-preview').style.display = 'block';
                }
                
                if (config.fontFamily) {
                    document.getElementById('font-family').value = config.fontFamily;
                    document.getElementById('brand-preview').style.setProperty('--preview-font', config.fontFamily);
                }
                
                document.getElementById('show-progress-bar').checked = config.showProgressBar || false;
                document.getElementById('show-page-numbers').checked = config.showPageNumbers || false;
            }

            // Render pages and questions
            if (data.pages && data.pages.length > 0) {
                surveyData.pages = data.pages;
                updatePageTabs();
                renderQuestions();
            }

            showSuccess('Survey data loaded successfully');
        } catch (error) {
            console.error('Error loading survey:', error);
            showError('Failed to load survey data');
        }
    }

    function updateSurveyData() {
        surveyData.title = document.getElementById('survey-title').value;
        surveyData.description = document.getElementById('survey-description').value;
        surveyData.startDate = document.getElementById('survey-start-date').value;
        surveyData.endDate = document.getElementById('survey-end-date').value;
        surveyData.targetRespondents = document.getElementById('survey-target-respondents').value || null;
        surveyData.targetScore = document.getElementById('survey-target-score').value || null;
        surveyData.configuration.showProgressBar = document.getElementById('show-progress-bar').checked;
        surveyData.configuration.showPageNumbers = document.getElementById('show-page-numbers').checked;
    }

    // Theme handlers
    async function handleHeroImageUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('image', file);

        try {
            const response = await fetch(`${API_BASE}/surveys/upload-hero-image`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${window.AuthUtils.getToken()}`
                },
                body: formData
            });

            if (!response.ok) throw new Error('Upload failed');

            const data = await response.json();
            surveyData.configuration.heroImageUrl = data.imageUrl;
            document.getElementById('hero-image-preview').src = data.imageUrl;
            document.getElementById('hero-image-preview').style.display = 'block';
            showSuccess('Hero image uploaded');
        } catch (error) {
            console.error('Error uploading hero image:', error);
            showError('Failed to upload hero image');
        }
    }


    async function handleLogoUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('image', file);

        try {
            const response = await fetch(`${API_BASE}/surveys/upload-logo`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${window.AuthUtils.getToken()}`
                },
                body: formData
            });

            if (!response.ok) throw new Error('Upload failed');

            const data = await response.json();
            surveyData.configuration.logoUrl = data.imageUrl;
            document.getElementById('logo-preview').src = data.imageUrl;
            document.getElementById('logo-preview').style.display = 'block';
            document.getElementById('brand-preview-logo').src = data.imageUrl;
            document.getElementById('brand-preview-logo').style.display = 'block';
            showSuccess('Logo uploaded');
        } catch (error) {
            console.error('Error uploading logo:', error);
            showError('Failed to upload logo');
        }
    }

    async function handleBgImageUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('image', file);

        try {
            const response = await fetch(`${API_BASE}/surveys/upload-background-image`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${window.AuthUtils.getToken()}`
                },
                body: formData
            });

            if (!response.ok) throw new Error('Upload failed');

            const data = await response.json();
            surveyData.configuration.backgroundImageUrl = data.imageUrl;
            document.getElementById('bg-image-preview').src = data.imageUrl;
            document.getElementById('bg-image-preview').style.display = 'block';
            showSuccess('Background image uploaded');
        } catch (error) {
            console.error('Error uploading background image:', error);
            showError('Failed to upload background image');
        }
    }

    function handleBgColorChange(e) {
        const color = e.target.value;
        document.getElementById('bg-color-text').value = color;
        surveyData.configuration.backgroundColor = color;
        document.getElementById('brand-preview').style.backgroundColor = color;
    }

    function handleBgColorTextChange(e) {
        const color = e.target.value;
        if (/^#[0-9A-F]{6}$/i.test(color)) {
            document.getElementById('bg-color-picker').value = color;
            surveyData.configuration.backgroundColor = color;
            document.getElementById('brand-preview').style.backgroundColor = color;
        }
    }

    function handleFontChange(e) {
        const font = e.target.value;
        surveyData.configuration.fontFamily = font;
        document.getElementById('brand-preview').style.setProperty('--preview-font', font);
    }

    // Page management
    function addPage() {
        const newPageNumber = surveyData.pages.length + 1;
        surveyData.pages.push({ pageNumber: newPageNumber, questions: [] });
        updatePageTabs();
        switchToPage(newPageNumber);
    }

    function removePage(pageNumber) {
        if (surveyData.pages.length === 1) {
            showError('Cannot remove the last page');
            return;
        }

        if (!confirm('Are you sure you want to remove this page and all its questions?')) {
            return;
        }

        surveyData.pages = surveyData.pages.filter(p => p.pageNumber !== pageNumber);
        
        // Renumber pages
        surveyData.pages.forEach((page, index) => {
            page.pageNumber = index + 1;
        });

        if (currentPage >= pageNumber && currentPage > 1) {
            currentPage--;
        }

        updatePageTabs();
        renderQuestions();
    }

    function switchToPage(pageNumber) {
        currentPage = pageNumber;
        updatePageTabs();
        renderQuestions();
        selectedQuestionIndex = null;
        document.getElementById('properties-panel').innerHTML = '<p class="text-muted">Select a question to edit its properties</p>';
    }

    function updatePageTabs() {
        const tabsContainer = document.getElementById('page-tabs');
        tabsContainer.innerHTML = surveyData.pages.map(page => `
            <button class="page-tab ${page.pageNumber === currentPage ? 'active' : ''}" 
                    onclick="window.SurveyBuilder.switchToPage(${page.pageNumber})">
                Page ${page.pageNumber}
                ${surveyData.pages.length > 1 ? `
                    <span class="remove-page" onclick="event.stopPropagation(); window.SurveyBuilder.removePage(${page.pageNumber})">×</span>
                ` : ''}
            </button>
        `).join('') + '<button class="page-tab" id="add-page-btn">+ Add Page</button>';

        // Re-attach add page listener
        document.getElementById('add-page-btn').addEventListener('click', addPage);
    }

    // Question management
    function addQuestion(type) {
        const currentPageData = surveyData.pages.find(p => p.pageNumber === currentPage);
        if (!currentPageData) return;

        const newQuestion = {
            questionId: generateId(),
            type: type,
            promptText: `New ${type} Question`,
            subtitle: '',
            isMandatory: false,
            displayOrder: currentPageData.questions.length + 1,
            pageNumber: currentPage,
            imageUrl: null,
            layoutOrientation: 'vertical',
            options: getDefaultOptions(type)
        };

        currentPageData.questions.push(newQuestion);
        renderQuestions();
    }

    function getDefaultOptions(type) {
        switch (type) {
            case 'Text':
                return { maxCharacters: 500 };
            case 'MultipleChoice':
            case 'Checkbox':
                return { choices: ['Option 1', 'Option 2', 'Option 3'], choiceImages: {} };
            case 'Dropdown':
                return { dropdownOptions: ['Option 1', 'Option 2', 'Option 3'] };
            case 'MatrixLikert':
                return { matrixRows: ['Row 1', 'Row 2', 'Row 3'], scaleMin: 1, scaleMax: 10 };
            case 'Rating':
                return { ratingScale: 10, ratingLowLabel: 'Poor', ratingHighLabel: 'Excellent', commentRequiredBelowRating: null };
            case 'Date':
                return { dateFormat: 'yyyy-MM-dd' };
            case 'Signature':
                return { canvasWidth: 400, canvasHeight: 200 };
            case 'HeroCover':
                return { title: 'Welcome', subtitle: 'Please complete this survey' };
            default:
                return {};
        }
    }

    function renderQuestions() {
        const currentPageData = surveyData.pages.find(p => p.pageNumber === currentPage);
        if (!currentPageData) return;

        const container = document.getElementById('questions-container');
        
        if (currentPageData.questions.length === 0) {
            container.innerHTML = '<p class="text-muted text-center">Click a question type to add it to the survey</p>';
            return;
        }

        container.innerHTML = currentPageData.questions.map((q, index) => `
            <div class="question-item ${selectedQuestionIndex === index ? 'selected' : ''}" 
                 draggable="true"
                 data-index="${index}"
                 onclick="window.SurveyBuilder.selectQuestion(${index})">
                <div class="question-header">
                    <span class="drag-handle">☰</span>
                    <strong>${q.type}</strong>
                    <div class="question-actions">
                        <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); window.SurveyBuilder.duplicateQuestion(${index})" title="Duplicate">
                            📋
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); window.SurveyBuilder.deleteQuestion(${index})" title="Delete">
                            🗑
                        </button>
                    </div>
                </div>
                <div>
                    <strong>${escapeHtml(q.promptText)}</strong>
                    ${q.subtitle ? `<br><small class="text-muted">${escapeHtml(q.subtitle)}</small>` : ''}
                    ${q.isMandatory ? '<span class="badge badge-danger">Required</span>' : ''}
                </div>
            </div>
        `).join('');

        // Add drag and drop listeners
        container.querySelectorAll('.question-item').forEach(item => {
            item.addEventListener('dragstart', handleDragStart);
            item.addEventListener('dragover', handleDragOver);
            item.addEventListener('drop', handleDrop);
            item.addEventListener('dragend', handleDragEnd);
        });
    }

    function selectQuestion(index) {
        selectedQuestionIndex = index;
        renderQuestions();
        renderProperties(index);
    }

    function duplicateQuestion(index) {
        const currentPageData = surveyData.pages.find(p => p.pageNumber === currentPage);
        if (!currentPageData) return;

        const original = currentPageData.questions[index];
        const duplicate = JSON.parse(JSON.stringify(original));
        duplicate.questionId = generateId();
        duplicate.displayOrder = currentPageData.questions.length + 1;
        duplicate.promptText = original.promptText + ' (Copy)';

        currentPageData.questions.push(duplicate);
        renderQuestions();
    }

    function deleteQuestion(index) {
        if (!confirm('Are you sure you want to delete this question?')) {
            return;
        }

        const currentPageData = surveyData.pages.find(p => p.pageNumber === currentPage);
        if (!currentPageData) return;

        currentPageData.questions.splice(index, 1);
        
        // Update display order
        currentPageData.questions.forEach((q, i) => {
            q.displayOrder = i + 1;
        });

        selectedQuestionIndex = null;
        renderQuestions();
        document.getElementById('properties-panel').innerHTML = '<p class="text-muted">Select a question to edit its properties</p>';
    }

    // Drag and drop handlers
    function handleDragStart(e) {
        draggedQuestionIndex = parseInt(e.target.dataset.index);
        e.target.classList.add('dragging');
    }

    function handleDragOver(e) {
        e.preventDefault();
    }

    function handleDrop(e) {
        e.preventDefault();
        const dropIndex = parseInt(e.target.closest('.question-item').dataset.index);
        
        if (draggedQuestionIndex !== dropIndex) {
            const currentPageData = surveyData.pages.find(p => p.pageNumber === currentPage);
            if (!currentPageData) return;

            const [removed] = currentPageData.questions.splice(draggedQuestionIndex, 1);
            currentPageData.questions.splice(dropIndex, 0, removed);

            // Update display order
            currentPageData.questions.forEach((q, i) => {
                q.displayOrder = i + 1;
            });

            renderQuestions();
        }
    }

    function handleDragEnd(e) {
        e.target.classList.remove('dragging');
        draggedQuestionIndex = null;
    }


    // Properties panel rendering
    function renderProperties(index) {
        const currentPageData = surveyData.pages.find(p => p.pageNumber === currentPage);
        if (!currentPageData) return;

        const question = currentPageData.questions[index];
        const panel = document.getElementById('properties-panel');

        let html = `
            <div class="form-group">
                <label>Question Text <span class="required">*</span></label>
                <input type="text" class="form-control" id="prop-prompt" value="${escapeHtml(question.promptText)}">
            </div>
            <div class="form-group">
                <label>Subtitle</label>
                <input type="text" class="form-control" id="prop-subtitle" value="${escapeHtml(question.subtitle || '')}">
            </div>
            <div class="form-group">
                <label>
                    <input type="checkbox" id="prop-mandatory" ${question.isMandatory ? 'checked' : ''}> Mandatory
                </label>
            </div>
            <div class="form-group">
                <label>Question Image</label>
                <input type="file" class="form-control" id="prop-image" accept="image/*">
                ${question.imageUrl ? `<img src="${question.imageUrl}" class="image-preview">` : ''}
            </div>
        `;

        // Type-specific properties
        switch (question.type) {
            case 'Text':
                html += `
                    <div class="form-group">
                        <label>Max Characters</label>
                        <input type="number" class="form-control" id="prop-max-chars" value="${question.options.maxCharacters || 500}">
                    </div>
                `;
                break;

            case 'MultipleChoice':
            case 'Checkbox':
                html += `
                    <div class="form-group">
                        <label>Layout Orientation</label>
                        <select class="form-control" id="prop-orientation">
                            <option value="vertical" ${question.layoutOrientation === 'vertical' ? 'selected' : ''}>Vertical</option>
                            <option value="horizontal" ${question.layoutOrientation === 'horizontal' ? 'selected' : ''}>Horizontal</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Options</label>
                        <div id="options-list">
                            ${(question.options.choices || []).map((choice, i) => `
                                <div class="option-item">
                                    <input type="text" class="form-control" value="${escapeHtml(choice)}" data-option-index="${i}">
                                    <input type="file" accept="image/*" data-option-image="${i}" style="display: none;">
                                    <button class="btn btn-sm btn-secondary" onclick="document.querySelector('[data-option-image=\\'${i}\\']').click()">📷</button>
                                    ${question.options.choiceImages && question.options.choiceImages[i] ? 
                                        `<img src="${question.options.choiceImages[i]}" class="option-image-preview">` : ''}
                                    <button class="btn btn-sm btn-danger" onclick="window.SurveyBuilder.removeOption(${i})">×</button>
                                </div>
                            `).join('')}
                        </div>
                        <button class="btn btn-sm btn-secondary" id="add-option-btn">+ Add Option</button>
                    </div>
                `;
                break;

            case 'Dropdown':
                html += `
                    <div class="form-group">
                        <label>Options</label>
                        <div id="options-list">
                            ${(question.options.dropdownOptions || []).map((opt, i) => `
                                <div class="option-item">
                                    <input type="text" class="form-control" value="${escapeHtml(opt)}" data-option-index="${i}">
                                    <button class="btn btn-sm btn-danger" onclick="window.SurveyBuilder.removeOption(${i})">×</button>
                                </div>
                            `).join('')}
                        </div>
                        <button class="btn btn-sm btn-secondary" id="add-option-btn">+ Add Option</button>
                    </div>
                `;
                break;

            case 'MatrixLikert':
                html += `
                    <div class="form-group">
                        <label>Matrix Rows</label>
                        <div id="matrix-rows-list">
                            ${(question.options.matrixRows || []).map((row, i) => `
                                <div class="matrix-row-item">
                                    <input type="text" class="form-control" value="${escapeHtml(row)}" data-row-index="${i}">
                                    <button class="btn btn-sm btn-danger" onclick="window.SurveyBuilder.removeMatrixRow(${i})">×</button>
                                </div>
                            `).join('')}
                        </div>
                        <button class="btn btn-sm btn-secondary" id="add-row-btn">+ Add Row</button>
                    </div>
                    <div class="form-group">
                        <label>Scale Range</label>
                        <div style="display: flex; gap: 10px;">
                            <input type="number" class="form-control" id="prop-scale-min" value="${question.options.scaleMin || 1}" placeholder="Min">
                            <input type="number" class="form-control" id="prop-scale-max" value="${question.options.scaleMax || 10}" placeholder="Max">
                        </div>
                    </div>
                `;
                break;

            case 'Rating':
                html += `
                    <div class="form-group">
                        <label>Rating Scale</label>
                        <input type="number" class="form-control" id="prop-rating-scale" value="${question.options.ratingScale || 10}">
                    </div>
                    <div class="form-group">
                        <label>Low Label</label>
                        <input type="text" class="form-control" id="prop-low-label" value="${escapeHtml(question.options.ratingLowLabel || '')}">
                    </div>
                    <div class="form-group">
                        <label>High Label</label>
                        <input type="text" class="form-control" id="prop-high-label" value="${escapeHtml(question.options.ratingHighLabel || '')}">
                    </div>
                    <div class="form-group">
                        <label>Comment Required Below Rating</label>
                        <input type="number" class="form-control" id="prop-comment-threshold" value="${question.options.commentRequiredBelowRating || ''}" placeholder="Leave empty for no requirement">
                    </div>
                `;
                break;

            case 'Date':
                html += `
                    <div class="form-group">
                        <label>Date Format</label>
                        <select class="form-control" id="prop-date-format">
                            <option value="yyyy-MM-dd" ${question.options.dateFormat === 'yyyy-MM-dd' ? 'selected' : ''}>YYYY-MM-DD</option>
                            <option value="dd/MM/yyyy" ${question.options.dateFormat === 'dd/MM/yyyy' ? 'selected' : ''}>DD/MM/YYYY</option>
                            <option value="MM/dd/yyyy" ${question.options.dateFormat === 'MM/dd/yyyy' ? 'selected' : ''}>MM/DD/YYYY</option>
                        </select>
                    </div>
                `;
                break;

            case 'Signature':
                html += `
                    <div class="form-group">
                        <label>Canvas Size</label>
                        <div style="display: flex; gap: 10px;">
                            <input type="number" class="form-control" id="prop-canvas-width" value="${question.options.canvasWidth || 400}" placeholder="Width">
                            <input type="number" class="form-control" id="prop-canvas-height" value="${question.options.canvasHeight || 200}" placeholder="Height">
                        </div>
                    </div>
                    <div class="signature-canvas-container">
                        <canvas class="signature-canvas" width="${question.options.canvasWidth || 400}" height="${question.options.canvasHeight || 200}"></canvas>
                        <button class="btn btn-sm btn-secondary" style="margin-top: 10px;">Clear Signature</button>
                    </div>
                `;
                break;

            case 'HeroCover':
                html += `
                    <div class="form-group">
                        <label>Title</label>
                        <input type="text" class="form-control" id="prop-hero-title" value="${escapeHtml(question.options.title || '')}">
                    </div>
                    <div class="form-group">
                        <label>Subtitle</label>
                        <input type="text" class="form-control" id="prop-hero-subtitle" value="${escapeHtml(question.options.subtitle || '')}">
                    </div>
                `;
                break;
        }

        html += `
            <div class="form-actions">
                <button class="btn btn-primary" id="save-properties-btn">Save Properties</button>
            </div>
        `;

        panel.innerHTML = html;

        // Attach event listeners
        document.getElementById('save-properties-btn').addEventListener('click', () => saveProperties(index));
        
        if (document.getElementById('add-option-btn')) {
            document.getElementById('add-option-btn').addEventListener('click', () => addOption(index));
        }
        
        if (document.getElementById('add-row-btn')) {
            document.getElementById('add-row-btn').addEventListener('click', () => addMatrixRow(index));
        }

        // Option image uploads
        document.querySelectorAll('[data-option-image]').forEach(input => {
            input.addEventListener('change', (e) => handleOptionImageUpload(e, index));
        });

        // Question image upload
        if (document.getElementById('prop-image')) {
            document.getElementById('prop-image').addEventListener('change', (e) => handleQuestionImageUpload(e, index));
        }
    }

    function saveProperties(index) {
        const currentPageData = surveyData.pages.find(p => p.pageNumber === currentPage);
        if (!currentPageData) return;

        const question = currentPageData.questions[index];

        // Common properties
        question.promptText = document.getElementById('prop-prompt').value;
        question.subtitle = document.getElementById('prop-subtitle').value;
        question.isMandatory = document.getElementById('prop-mandatory').checked;

        // Type-specific properties
        switch (question.type) {
            case 'Text':
                question.options.maxCharacters = parseInt(document.getElementById('prop-max-chars').value);
                break;

            case 'MultipleChoice':
            case 'Checkbox':
                question.layoutOrientation = document.getElementById('prop-orientation').value;
                question.options.choices = Array.from(document.querySelectorAll('[data-option-index]'))
                    .map(input => input.value);
                break;

            case 'Dropdown':
                question.options.dropdownOptions = Array.from(document.querySelectorAll('[data-option-index]'))
                    .map(input => input.value);
                break;

            case 'MatrixLikert':
                question.options.matrixRows = Array.from(document.querySelectorAll('[data-row-index]'))
                    .map(input => input.value);
                question.options.scaleMin = parseInt(document.getElementById('prop-scale-min').value);
                question.options.scaleMax = parseInt(document.getElementById('prop-scale-max').value);
                break;

            case 'Rating':
                question.options.ratingScale = parseInt(document.getElementById('prop-rating-scale').value);
                question.options.ratingLowLabel = document.getElementById('prop-low-label').value;
                question.options.ratingHighLabel = document.getElementById('prop-high-label').value;
                question.options.commentRequiredBelowRating = document.getElementById('prop-comment-threshold').value || null;
                break;

            case 'Date':
                question.options.dateFormat = document.getElementById('prop-date-format').value;
                break;

            case 'Signature':
                question.options.canvasWidth = parseInt(document.getElementById('prop-canvas-width').value);
                question.options.canvasHeight = parseInt(document.getElementById('prop-canvas-height').value);
                break;

            case 'HeroCover':
                question.options.title = document.getElementById('prop-hero-title').value;
                question.options.subtitle = document.getElementById('prop-hero-subtitle').value;
                break;
        }

        renderQuestions();
        showSuccess('Properties saved');
    }

    function addOption(index) {
        const currentPageData = surveyData.pages.find(p => p.pageNumber === currentPage);
        if (!currentPageData) return;

        const question = currentPageData.questions[index];

        if (question.type === 'Dropdown') {
            question.options.dropdownOptions.push('New Option');
        } else {
            question.options.choices.push('New Option');
        }

        renderProperties(index);
    }

    function removeOption(optionIndex) {
        const currentPageData = surveyData.pages.find(p => p.pageNumber === currentPage);
        if (!currentPageData || selectedQuestionIndex === null) return;

        const question = currentPageData.questions[selectedQuestionIndex];

        if (question.type === 'Dropdown') {
            question.options.dropdownOptions.splice(optionIndex, 1);
        } else {
            question.options.choices.splice(optionIndex, 1);
            if (question.options.choiceImages && question.options.choiceImages[optionIndex]) {
                delete question.options.choiceImages[optionIndex];
            }
        }

        renderProperties(selectedQuestionIndex);
    }

    function addMatrixRow(index) {
        const currentPageData = surveyData.pages.find(p => p.pageNumber === currentPage);
        if (!currentPageData) return;

        const question = currentPageData.questions[index];
        question.options.matrixRows.push('New Row');
        renderProperties(index);
    }

    function removeMatrixRow(rowIndex) {
        const currentPageData = surveyData.pages.find(p => p.pageNumber === currentPage);
        if (!currentPageData || selectedQuestionIndex === null) return;

        const question = currentPageData.questions[selectedQuestionIndex];
        question.options.matrixRows.splice(rowIndex, 1);
        renderProperties(selectedQuestionIndex);
    }

    async function handleQuestionImageUpload(e, index) {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('image', file);

        try {
            const response = await fetch(`${API_BASE}/surveys/upload-question-image`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${window.AuthUtils.getToken()}`
                },
                body: formData
            });

            if (!response.ok) throw new Error('Upload failed');

            const data = await response.json();
            const currentPageData = surveyData.pages.find(p => p.pageNumber === currentPage);
            if (currentPageData) {
                currentPageData.questions[index].imageUrl = data.imageUrl;
                renderProperties(index);
                showSuccess('Question image uploaded');
            }
        } catch (error) {
            console.error('Error uploading question image:', error);
            showError('Failed to upload question image');
        }
    }

    async function handleOptionImageUpload(e, questionIndex) {
        const file = e.target.files[0];
        if (!file) return;

        const optionIndex = parseInt(e.target.dataset.optionImage);
        const formData = new FormData();
        formData.append('image', file);

        try {
            const response = await fetch(`${API_BASE}/surveys/upload-option-image`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${window.AuthUtils.getToken()}`
                },
                body: formData
            });

            if (!response.ok) throw new Error('Upload failed');

            const data = await response.json();
            const currentPageData = surveyData.pages.find(p => p.pageNumber === currentPage);
            if (currentPageData) {
                const question = currentPageData.questions[questionIndex];
                if (!question.options.choiceImages) {
                    question.options.choiceImages = {};
                }
                question.options.choiceImages[optionIndex] = data.imageUrl;
                renderProperties(questionIndex);
                showSuccess('Option image uploaded');
            }
        } catch (error) {
            console.error('Error uploading option image:', error);
            showError('Failed to upload option image');
        }
    }


    // Save survey
    async function saveSurvey(publish) {
        updateSurveyData();

        // Validation
        if (!surveyData.title) {
            showError('Please enter a survey title');
            return;
        }

        if (!surveyData.startDate || !surveyData.endDate) {
            showError('Please enter start and end dates');
            return;
        }

        if (new Date(surveyData.endDate) <= new Date(surveyData.startDate)) {
            showError('End date must be after start date');
            return;
        }

        const method = surveyData.surveyId ? 'PUT' : 'POST';
        const url = surveyData.surveyId 
            ? `${API_BASE}/surveys/${surveyData.surveyId}`
            : `${API_BASE}/surveys`;

        const payload = {
            ...surveyData,
            status: publish ? 'Active' : 'Draft'
        };

        try {
            const response = await fetch(url, {
                method: method,
                headers: {
                    'Authorization': `Bearer ${window.AuthUtils.getToken()}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error('Failed to save survey');
            }

            const data = await response.json();
            surveyData.surveyId = data.surveyId;

            showSuccess(publish ? 'Survey published successfully' : 'Survey saved as draft');

            if (publish) {
                setTimeout(() => {
                    window.location.href = 'event-management';
                }, 1500);
            }
        } catch (error) {
            console.error('Error saving survey:', error);
            showError('Failed to save survey');
        }
    }

    // Preview
    function showPreview() {
        updateSurveyData();

        const modal = document.getElementById('preview-modal');
        const content = document.getElementById('preview-content');

        let html = `
            <div style="font-family: ${surveyData.configuration.fontFamily}; background-color: ${surveyData.configuration.backgroundColor}; padding: 20px; border-radius: 8px;">
                ${surveyData.configuration.logoUrl ? `<img src="${surveyData.configuration.logoUrl}" style="max-width: 150px; margin-bottom: 20px;">` : ''}
                <h2>${escapeHtml(surveyData.title)}</h2>
                <p>${escapeHtml(surveyData.description || '')}</p>
                <p><small>Period: ${surveyData.startDate} to ${surveyData.endDate}</small></p>
                <hr>
        `;

        surveyData.pages.forEach(page => {
            html += `<h3>Page ${page.pageNumber}</h3>`;
            
            page.questions.forEach(q => {
                html += `
                    <div style="margin-bottom: 20px; padding: 15px; background: white; border-radius: 8px;">
                        ${q.imageUrl ? `<img src="${q.imageUrl}" style="max-width: 200px; margin-bottom: 10px;">` : ''}
                        <strong>${escapeHtml(q.promptText)}</strong>
                        ${q.isMandatory ? '<span style="color: red;">*</span>' : ''}
                        ${q.subtitle ? `<br><small>${escapeHtml(q.subtitle)}</small>` : ''}
                        <div style="margin-top: 10px;">
                            ${renderQuestionPreview(q)}
                        </div>
                    </div>
                `;
            });
        });

        html += '</div>';
        content.innerHTML = html;
        modal.classList.add('active');
    }

    function renderQuestionPreview(question) {
        switch (question.type) {
            case 'Text':
                return '<input type="text" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" placeholder="Your answer">';
            
            case 'MultipleChoice':
                return (question.options.choices || []).map((choice, i) => `
                    <div style="margin: 5px 0;">
                        <label>
                            <input type="radio" name="preview-${question.questionId}">
                            ${question.options.choiceImages && question.options.choiceImages[i] ? 
                                `<img src="${question.options.choiceImages[i]}" style="width: 30px; height: 30px; margin: 0 5px;">` : ''}
                            ${escapeHtml(choice)}
                        </label>
                    </div>
                `).join('');
            
            case 'Checkbox':
                return (question.options.choices || []).map((choice, i) => `
                    <div style="margin: 5px 0;">
                        <label>
                            <input type="checkbox">
                            ${question.options.choiceImages && question.options.choiceImages[i] ? 
                                `<img src="${question.options.choiceImages[i]}" style="width: 30px; height: 30px; margin: 0 5px;">` : ''}
                            ${escapeHtml(choice)}
                        </label>
                    </div>
                `).join('');
            
            case 'Dropdown':
                return `
                    <select style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                        <option>Select an option</option>
                        ${(question.options.dropdownOptions || []).map(opt => `<option>${escapeHtml(opt)}</option>`).join('')}
                    </select>
                `;
            
            case 'MatrixLikert':
                return `
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr>
                                <th></th>
                                ${Array.from({length: question.options.scaleMax - question.options.scaleMin + 1}, (_, i) => 
                                    `<th style="text-align: center; padding: 5px;">${question.options.scaleMin + i}</th>`
                                ).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${(question.options.matrixRows || []).map(row => `
                                <tr>
                                    <td style="padding: 5px;">${escapeHtml(row)}</td>
                                    ${Array.from({length: question.options.scaleMax - question.options.scaleMin + 1}, () => 
                                        '<td style="text-align: center;"><input type="radio"></td>'
                                    ).join('')}
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                `;
            
            case 'Rating':
                return `
                    <div style="display: flex; gap: 5px; align-items: center;">
                        <span>${escapeHtml(question.options.ratingLowLabel || '')}</span>
                        ${Array.from({length: question.options.ratingScale}, (_, i) => 
                            `<button style="padding: 5px 10px; border: 1px solid #ccc; border-radius: 4px;">${i + 1}</button>`
                        ).join('')}
                        <span>${escapeHtml(question.options.ratingHighLabel || '')}</span>
                    </div>
                `;
            
            case 'Date':
                return '<input type="date" style="padding: 8px; border: 1px solid #ccc; border-radius: 4px;">';
            
            case 'Signature':
                return `<canvas style="border: 1px solid #ccc; border-radius: 4px;" width="${question.options.canvasWidth}" height="${question.options.canvasHeight}"></canvas>`;
            
            case 'HeroCover':
                return `
                    <div style="text-align: center; padding: 40px;">
                        <h1>${escapeHtml(question.options.title || '')}</h1>
                        <p>${escapeHtml(question.options.subtitle || '')}</p>
                    </div>
                `;
            
            default:
                return '<p>Preview not available for this question type</p>';
        }
    }

    function closePreview() {
        document.getElementById('preview-modal').classList.remove('active');
    }

    // Utility functions
    function generateId() {
        return 'q_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    function escapeHtml(text) {
        if (!text) return '';
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
    window.SurveyBuilder = {
        switchToPage,
        removePage,
        selectQuestion,
        duplicateQuestion,
        deleteQuestion,
        removeOption,
        removeMatrixRow
    };
})();


