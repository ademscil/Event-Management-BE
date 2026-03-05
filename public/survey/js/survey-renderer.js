/**
 * Survey Renderer Module
 * Handles dynamic rendering of survey pages based on configuration
 */

const SurveyRenderer = (function() {
    'use strict';

    function normalizePromptText(value) {
        const text = String(value || '').trim();
        if (text.toLowerCase() === 'untitled question') {
            return '';
        }
        return text;
    }

    /**
     * Render questions page
     */
    function renderQuestionsPage(questions, pageTitle, pageSubtitle) {
        const title = pageTitle && String(pageTitle).trim() !== ''
            ? String(pageTitle).trim()
            : 'Pertanyaan Survey';
        const subtitle = pageSubtitle && String(pageSubtitle).trim() !== ''
            ? String(pageSubtitle).trim()
            : '';
        return `
            <div class="questions-page">
                <h2>${escapeHtml(title)}</h2>
                ${subtitle ? `<p class="form-subtitle">${escapeHtml(subtitle)}</p>` : ''}

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
        const promptText = normalizePromptText(question.promptText);
        const subtitle = String(question.subtitle || '').trim();
        const shouldRenderLabel = question.type !== 'HeroCover' && promptText !== '';

        const dataSource = String(options.dataSource || '');
        const displayCondition = String(options.displayCondition || 'always');

        let html = `
            <div class="form-group question-item" data-question-id="${questionId}" data-question-type="${question.type}" data-data-source="${escapeHtml(dataSource)}" data-display-condition="${escapeHtml(displayCondition)}">
                ${shouldRenderLabel ? `<label class="form-label ${required}" for="question-${questionId}">
                    ${index + 1}. ${escapeHtml(promptText)}
                </label>` : ''}
                ${subtitle && question.type !== 'HeroCover' ? `<span class="form-subtitle">${escapeHtml(subtitle)}</span>` : ''}
                ${question.type !== 'HeroCover' && question.imageUrl ? `<div class="question-image"><img src="${question.imageUrl}" alt="Question Image"></div>` : ''}
        `;

        switch (question.type) {
            case 'HeroCover':
                html += renderHeroCoverQuestion(question, options);
                break;
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

    function renderHeroCoverQuestion(question, options) {
        const coverUrl = question.imageUrl || options.heroImageUrl || '';
        const heroTitle = normalizePromptText(question.promptText);
        const subtitle = String(question.subtitle || '').trim();
        return `
            <div class="hero-cover-question">
                ${coverUrl ? `<img src="${coverUrl}" alt="Hero Cover">` : ''}
                <div class="hero-cover-copy">
                    ${heroTitle ? `<h3>${escapeHtml(heroTitle)}</h3>` : ''}
                    ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}
                </div>
            </div>
        `;
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
                <button
                    type="button"
                    class="btn btn-primary signature-open"
                    data-question-id="${questionId}"
                >
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

    // Public API
    return {
        renderQuestionsPage,
        renderQuestion
    };
})();
