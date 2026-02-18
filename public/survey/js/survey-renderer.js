/**
 * Survey Renderer Module
 * Handles dynamic rendering of survey pages based on configuration
 */

const SurveyRenderer = (function() {
    'use strict';

    /**
     * Render intro/hero cover page
     */
    function renderIntroPage(survey) {
        const config = survey.configuration || {};
        const heroImageUrl = config.heroImageUrl || '';
        const title = survey.title || 'Survey';
        const subtitle = config.heroTitle || '';
        const description = survey.description || '';

        return `
            <div class="hero-cover">
                ${heroImageUrl ? `<img src="${heroImageUrl}" alt="Hero Image">` : ''}
                <h1>${escapeHtml(title)}</h1>
                ${subtitle ? `<p class="subtitle">${escapeHtml(subtitle)}</p>` : ''}
                
                <div class="survey-info">
                    <h3>Informasi Survey</h3>
                    ${description ? `<p><strong>Deskripsi:</strong> ${escapeHtml(description)}</p>` : ''}
                    <p><strong>Periode:</strong> ${formatDate(survey.startDate)} - ${formatDate(survey.endDate)}</p>
                    <p>Terima kasih telah meluangkan waktu untuk mengisi survey ini. Feedback Anda sangat berharga bagi kami.</p>
                </div>
            </div>
        `;
    }

    /**
     * Render respondent data form (organizational selection)
     */
    function renderRespondentForm(businessUnits) {
        return `
            <div class="respondent-form">
                <h2>Data Responden</h2>
                <p class="form-subtitle">Silakan lengkapi data Anda</p>

                <div class="form-group">
                    <label class="form-label required" for="respondent-name">Nama</label>
                    <input type="text" id="respondent-name" class="form-control" placeholder="Masukkan nama lengkap">
                    <span class="form-error" id="error-name">Nama wajib diisi</span>
                </div>

                <div class="form-group">
                    <label class="form-label required" for="respondent-email">Email</label>
                    <input type="email" id="respondent-email" class="form-control" placeholder="nama@email.com">
                    <span class="form-error" id="error-email">Email wajib diisi dengan format yang benar</span>
                </div>

                <div class="form-group">
                    <label class="form-label required" for="business-unit">Business Unit</label>
                    <select id="business-unit" class="form-control">
                        <option value="">-- Pilih Business Unit --</option>
                        ${businessUnits.map(bu => `<option value="${bu.businessUnitId}">${escapeHtml(bu.name)}</option>`).join('')}
                    </select>
                    <span class="form-error" id="error-bu">Business Unit wajib dipilih</span>
                </div>

                <div class="form-group">
                    <label class="form-label required" for="division">Division</label>
                    <select id="division" class="form-control" disabled>
                        <option value="">-- Pilih Division --</option>
                    </select>
                    <span class="form-error" id="error-division">Division wajib dipilih</span>
                </div>

                <div class="form-group">
                    <label class="form-label required" for="department">Department</label>
                    <select id="department" class="form-control" disabled>
                        <option value="">-- Pilih Department --</option>
                    </select>
                    <span class="form-error" id="error-department">Department wajib dipilih</span>
                </div>
            </div>
        `;
    }

    /**
     * Render application selection page
     */
    function renderApplicationSelection(applications) {
        return `
            <div class="application-selection">
                <h2>Pilih Aplikasi</h2>
                <p class="form-subtitle">Pilih satu atau lebih aplikasi yang ingin Anda nilai</p>

                <div class="form-group">
                    <div class="checkbox-group" id="application-list">
                        ${applications.map(app => `
                            <div class="checkbox-item" data-app-id="${app.applicationId}">
                                <input type="checkbox" id="app-${app.applicationId}" value="${app.applicationId}">
                                <div class="option-content">
                                    <div class="option-text">
                                        <strong>${escapeHtml(app.name)}</strong>
                                        ${app.description ? `<br><small>${escapeHtml(app.description)}</small>` : ''}
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    <span class="form-error" id="error-applications">Pilih minimal satu aplikasi</span>
                </div>
            </div>
        `;
    }

    /**
     * Render questions page
     */
    function renderQuestionsPage(questions, applicationName) {
        return `
            <div class="questions-page">
                <h2>Pertanyaan untuk ${escapeHtml(applicationName)}</h2>
                <p class="form-subtitle">Mohon jawab semua pertanyaan dengan jujur</p>

                ${questions.map((question, index) => renderQuestion(question, index)).join('')}
            </div>
        `;
    }

    /**
     * Render a single question based on type
     */
    function renderQuestion(question, index) {
        const options = question.options || {};
        const required = question.isMandatory ? 'required' : '';
        const questionId = question.questionId;

        let html = `
            <div class="form-group question-item" data-question-id="${questionId}" data-question-type="${question.type}">
                <label class="form-label ${required}" for="question-${questionId}">
                    ${index + 1}. ${escapeHtml(question.promptText)}
                </label>
                ${question.subtitle ? `<span class="form-subtitle">${escapeHtml(question.subtitle)}</span>` : ''}
                ${question.imageUrl ? `<div class="question-image"><img src="${question.imageUrl}" alt="Question Image"></div>` : ''}
        `;

        switch (question.type) {
            case 'Text':
                html += renderTextQuestion(questionId, options);
                break;
            case 'MultipleChoice':
                html += renderMultipleChoiceQuestion(questionId, options);
                break;
            case 'Checkbox':
                html += renderCheckboxQuestion(questionId, options);
                break;
            case 'Dropdown':
                html += renderDropdownQuestion(questionId, options);
                break;
            case 'MatrixLikert':
                html += renderMatrixLikertQuestion(questionId, options);
                break;
            case 'Rating':
                html += renderRatingQuestion(questionId, options);
                break;
            case 'Date':
                html += renderDateQuestion(questionId, options);
                break;
            case 'Signature':
                html += renderSignatureQuestion(questionId);
                break;
            default:
                html += `<p>Unsupported question type: ${question.type}</p>`;
        }

        html += `
                <span class="form-error" id="error-${questionId}">Pertanyaan ini wajib dijawab</span>
            </div>
        `;

        return html;
    }

    function renderTextQuestion(questionId, options) {
        const maxChars = options.maxCharacters || 500;
        return `
            <textarea id="question-${questionId}" class="form-control" maxlength="${maxChars}" 
                placeholder="Masukkan jawaban Anda..."></textarea>
            <small class="form-text">Maksimal ${maxChars} karakter</small>
        `;
    }

    function renderMultipleChoiceQuestion(questionId, options) {
        const choices = options.choices || [];
        const orientation = options.orientation || 'vertical';
        return `
            <div class="radio-group ${orientation}" id="question-${questionId}">
                ${choices.map((choice, idx) => `
                    <div class="radio-item" data-value="${escapeHtml(choice.text)}">
                        <input type="radio" id="question-${questionId}-${idx}" name="question-${questionId}" value="${escapeHtml(choice.text)}">
                        ${choice.imageUrl ? `<img src="${choice.imageUrl}" alt="Option" class="option-image">` : ''}
                        <div class="option-content">
                            <span class="option-text">${escapeHtml(choice.text)}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    function renderCheckboxQuestion(questionId, options) {
        const choices = options.choices || [];
        const orientation = options.orientation || 'vertical';
        return `
            <div class="checkbox-group ${orientation}" id="question-${questionId}">
                ${choices.map((choice, idx) => `
                    <div class="checkbox-item" data-value="${escapeHtml(choice.text)}">
                        <input type="checkbox" id="question-${questionId}-${idx}" name="question-${questionId}" value="${escapeHtml(choice.text)}">
                        ${choice.imageUrl ? `<img src="${choice.imageUrl}" alt="Option" class="option-image">` : ''}
                        <div class="option-content">
                            <span class="option-text">${escapeHtml(choice.text)}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    function renderDropdownQuestion(questionId, options) {
        const dropdownOptions = options.dropdownOptions || [];
        return `
            <select id="question-${questionId}" class="form-control">
                <option value="">-- Pilih jawaban --</option>
                ${dropdownOptions.map(opt => `<option value="${escapeHtml(opt)}">${escapeHtml(opt)}</option>`).join('')}
            </select>
        `;
    }

    function renderMatrixLikertQuestion(questionId, options) {
        const rows = options.matrixRows || [];
        const scaleMin = options.scaleMin || 1;
        const scaleMax = options.scaleMax || 10;
        const scale = [];
        for (let i = scaleMin; i <= scaleMax; i++) {
            scale.push(i);
        }

        return `
            <div class="matrix-container">
                <table class="matrix-table" id="question-${questionId}">
                    <thead>
                        <tr>
                            <th></th>
                            ${scale.map(num => `<th>${num}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map((row, rowIdx) => `
                            <tr>
                                <td>${escapeHtml(row)}</td>
                                ${scale.map(num => `
                                    <td>
                                        <input type="radio" name="question-${questionId}-row-${rowIdx}" 
                                            value="${num}" data-row="${escapeHtml(row)}">
                                    </td>
                                `).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    function renderRatingQuestion(questionId, options) {
        const scale = options.ratingScale || 10;
        const lowLabel = options.ratingLowLabel || 'Rendah';
        const highLabel = options.ratingHighLabel || 'Tinggi';
        const commentRequired = options.commentRequiredBelowRating || null;

        const ratings = [];
        for (let i = 1; i <= scale; i++) {
            ratings.push(i);
        }

        return `
            <div class="rating-container">
                <div class="rating-scale" id="question-${questionId}">
                    ${ratings.map(num => `
                        <div class="rating-option">
                            <input type="radio" id="question-${questionId}-${num}" name="question-${questionId}" value="${num}">
                            <label for="question-${questionId}-${num}">${num}</label>
                        </div>
                    `).join('')}
                </div>
                <div class="rating-labels">
                    <span>${escapeHtml(lowLabel)}</span>
                    <span>${escapeHtml(highLabel)}</span>
                </div>
                ${commentRequired ? `
                    <div class="comment-section" id="comment-${questionId}" style="display: none; margin-top: 1rem;">
                        <label class="form-label required">Komentar (wajib untuk rating di bawah ${commentRequired})</label>
                        <textarea class="form-control" id="comment-text-${questionId}" placeholder="Berikan komentar Anda..."></textarea>
                        <span class="form-error" id="error-comment-${questionId}">Komentar wajib diisi untuk rating rendah</span>
                    </div>
                ` : ''}
            </div>
        `;
    }

    function renderDateQuestion(questionId, options) {
        return `
            <input type="date" id="question-${questionId}" class="form-control">
        `;
    }

    function renderSignatureQuestion(questionId) {
        return `
            <div class="signature-container" id="question-${questionId}">
                <div class="signature-preview" id="signature-preview-${questionId}">
                    <span class="signature-placeholder">Klik tombol di bawah untuk menandatangani</span>
                </div>
                <button type="button" class="btn btn-primary" onclick="SurveyApp.openSignatureModal('${questionId}')">
                    Tanda Tangan
                </button>
                <input type="hidden" id="signature-data-${questionId}" value="">
            </div>
        `;
    }

    /**
     * Utility: Escape HTML to prevent XSS
     */
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Utility: Format date
     */
    function formatDate(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString('id-ID', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
    }

    // Public API
    return {
        renderIntroPage,
        renderRespondentForm,
        renderApplicationSelection,
        renderQuestionsPage,
        renderQuestion
    };
})();
