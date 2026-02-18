/**
 * Filter and Actions Module for CSI Portal
 * Provides reusable search, sort, and pagination functionality for tables
 */

(function(window) {
    'use strict';

    /**
     * FilterActions namespace - Reusable filter and action utilities
     */
    const FilterActions = {
        /**
         * Initialize table filtering
         * @param {string} searchInputId - ID of search input element
         * @param {string} tableBodyId - ID of table tbody element
         * @param {Array<number>} searchColumns - Column indices to search (optional, defaults to all)
         */
        initSearch(searchInputId, tableBodyId, searchColumns = null) {
            const searchInput = document.getElementById(searchInputId);
            const tbody = document.getElementById(tableBodyId);

            if (!searchInput || !tbody) {
                console.error('Search input or table body not found');
                return;
            }

            searchInput.addEventListener('input', (e) => {
                this.filterTable(e.target.value, tbody, searchColumns);
            });
        },

        /**
         * Filter table rows by search term
         * @param {string} searchTerm - Search term
         * @param {HTMLElement} tbody - Table tbody element
         * @param {Array<number>} searchColumns - Column indices to search (optional)
         */
        filterTable(searchTerm, tbody, searchColumns = null) {
            const rows = tbody.querySelectorAll('tr');
            const term = searchTerm.toLowerCase().trim();

            rows.forEach(row => {
                if (row.cells.length === 0) return;

                let text = '';
                if (searchColumns && searchColumns.length > 0) {
                    // Search only specified columns
                    searchColumns.forEach(colIndex => {
                        if (row.cells[colIndex]) {
                            text += row.cells[colIndex].textContent.toLowerCase() + ' ';
                        }
                    });
                } else {
                    // Search all columns
                    text = row.textContent.toLowerCase();
                }

                row.style.display = text.includes(term) ? '' : 'none';
            });
        },

        /**
         * Initialize table sorting
         * @param {string} tableId - ID of table element
         * @param {Array<number>} sortableColumns - Column indices that are sortable
         */
        initSort(tableId, sortableColumns = []) {
            const table = document.getElementById(tableId);
            if (!table) {
                console.error('Table not found');
                return;
            }

            const headers = table.querySelectorAll('thead th');
            headers.forEach((header, index) => {
                if (sortableColumns.length === 0 || sortableColumns.includes(index)) {
                    header.style.cursor = 'pointer';
                    header.addEventListener('click', () => {
                        this.sortTable(table, index);
                    });
                }
            });
        },

        /**
         * Sort table by column
         * @param {HTMLElement} table - Table element
         * @param {number} columnIndex - Column index to sort by
         */
        sortTable(table, columnIndex) {
            const tbody = table.querySelector('tbody');
            const rows = Array.from(tbody.querySelectorAll('tr'));
            
            // Determine sort direction
            const currentDirection = table.dataset.sortDirection || 'asc';
            const newDirection = currentDirection === 'asc' ? 'desc' : 'asc';
            table.dataset.sortDirection = newDirection;
            table.dataset.sortColumn = columnIndex;

            // Sort rows
            rows.sort((a, b) => {
                const aCell = a.cells[columnIndex];
                const bCell = b.cells[columnIndex];
                
                if (!aCell || !bCell) return 0;

                const aText = aCell.textContent.trim();
                const bText = bCell.textContent.trim();

                // Try numeric comparison first
                const aNum = parseFloat(aText);
                const bNum = parseFloat(bText);
                
                if (!isNaN(aNum) && !isNaN(bNum)) {
                    return newDirection === 'asc' ? aNum - bNum : bNum - aNum;
                }

                // String comparison
                return newDirection === 'asc' 
                    ? aText.localeCompare(bText)
                    : bText.localeCompare(aText);
            });

            // Re-append sorted rows
            rows.forEach(row => tbody.appendChild(row));

            // Update header indicators
            this.updateSortIndicators(table, columnIndex, newDirection);
        },

        /**
         * Update sort direction indicators in table headers
         * @param {HTMLElement} table - Table element
         * @param {number} columnIndex - Sorted column index
         * @param {string} direction - Sort direction ('asc' or 'desc')
         */
        updateSortIndicators(table, columnIndex, direction) {
            const headers = table.querySelectorAll('thead th');
            headers.forEach((header, index) => {
                // Remove existing indicators
                header.textContent = header.textContent.replace(/\s*[↑↓]$/, '');
                
                // Add indicator to sorted column
                if (index === columnIndex) {
                    header.textContent += direction === 'asc' ? ' ↑' : ' ↓';
                }
            });
        },

        /**
         * Initialize pagination
         * @param {string} tableBodyId - ID of table tbody element
         * @param {string} paginationContainerId - ID of pagination container
         * @param {number} rowsPerPage - Number of rows per page
         */
        initPagination(tableBodyId, paginationContainerId, rowsPerPage = 10) {
            const tbody = document.getElementById(tableBodyId);
            const container = document.getElementById(paginationContainerId);

            if (!tbody || !container) {
                console.error('Table body or pagination container not found');
                return;
            }

            this.paginationState = {
                tbody,
                container,
                rowsPerPage,
                currentPage: 1,
                totalPages: 1
            };

            this.updatePagination();
        },

        /**
         * Update pagination display
         */
        updatePagination() {
            if (!this.paginationState) return;

            const { tbody, container, rowsPerPage } = this.paginationState;
            const rows = Array.from(tbody.querySelectorAll('tr')).filter(row => row.style.display !== 'none');
            
            const totalPages = Math.ceil(rows.length / rowsPerPage);
            this.paginationState.totalPages = totalPages;

            // Hide all rows first
            rows.forEach(row => row.classList.add('pagination-hidden'));

            // Show rows for current page
            const start = (this.paginationState.currentPage - 1) * rowsPerPage;
            const end = start + rowsPerPage;
            rows.slice(start, end).forEach(row => row.classList.remove('pagination-hidden'));

            // Render pagination controls
            this.renderPaginationControls(container, totalPages);
        },

        /**
         * Render pagination controls
         * @param {HTMLElement} container - Pagination container element
         * @param {number} totalPages - Total number of pages
         */
        renderPaginationControls(container, totalPages) {
            const { currentPage } = this.paginationState;

            if (totalPages <= 1) {
                container.innerHTML = '';
                return;
            }

            let html = '<div class="pagination">';
            
            // Previous button
            html += `<button class="btn btn-sm btn-secondary" ${currentPage === 1 ? 'disabled' : ''} data-page="${currentPage - 1}">Previous</button>`;
            
            // Page numbers
            for (let i = 1; i <= totalPages; i++) {
                if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
                    html += `<button class="btn btn-sm ${i === currentPage ? 'btn-primary' : 'btn-secondary'}" data-page="${i}">${i}</button>`;
                } else if (i === currentPage - 3 || i === currentPage + 3) {
                    html += '<span class="pagination-ellipsis">...</span>';
                }
            }
            
            // Next button
            html += `<button class="btn btn-sm btn-secondary" ${currentPage === totalPages ? 'disabled' : ''} data-page="${currentPage + 1}">Next</button>`;
            
            html += '</div>';
            container.innerHTML = html;

            // Attach click handlers
            container.querySelectorAll('button[data-page]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const page = parseInt(e.target.dataset.page);
                    this.goToPage(page);
                });
            });
        },

        /**
         * Go to specific page
         * @param {number} page - Page number
         */
        goToPage(page) {
            if (!this.paginationState) return;
            
            const { totalPages } = this.paginationState;
            if (page < 1 || page > totalPages) return;

            this.paginationState.currentPage = page;
            this.updatePagination();
        },

        /**
         * Initialize bulk actions
         * @param {string} tableBodyId - ID of table tbody element
         * @param {string} selectAllCheckboxId - ID of select all checkbox
         * @param {Function} onSelectionChange - Callback when selection changes
         */
        initBulkActions(tableBodyId, selectAllCheckboxId, onSelectionChange) {
            const tbody = document.getElementById(tableBodyId);
            const selectAllCheckbox = document.getElementById(selectAllCheckboxId);

            if (!tbody || !selectAllCheckbox) {
                console.error('Table body or select all checkbox not found');
                return;
            }

            // Select all handler
            selectAllCheckbox.addEventListener('change', (e) => {
                const checkboxes = tbody.querySelectorAll('input[type="checkbox"]');
                checkboxes.forEach(cb => {
                    cb.checked = e.target.checked;
                });
                if (onSelectionChange) onSelectionChange(this.getSelectedIds(tbody));
            });

            // Individual checkbox handler
            tbody.addEventListener('change', (e) => {
                if (e.target.type === 'checkbox') {
                    const checkboxes = tbody.querySelectorAll('input[type="checkbox"]');
                    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
                    selectAllCheckbox.checked = allChecked;
                    if (onSelectionChange) onSelectionChange(this.getSelectedIds(tbody));
                }
            });
        },

        /**
         * Get selected row IDs
         * @param {HTMLElement} tbody - Table tbody element
         * @returns {Array<string>} Array of selected IDs
         */
        getSelectedIds(tbody) {
            const checkboxes = tbody.querySelectorAll('input[type="checkbox"]:checked');
            return Array.from(checkboxes).map(cb => {
                const row = cb.closest('tr');
                return row ? row.dataset.id : null;
            }).filter(id => id !== null);
        },

        /**
         * Clear all selections
         * @param {string} tableBodyId - ID of table tbody element
         * @param {string} selectAllCheckboxId - ID of select all checkbox
         */
        clearSelections(tableBodyId, selectAllCheckboxId) {
            const tbody = document.getElementById(tableBodyId);
            const selectAllCheckbox = document.getElementById(selectAllCheckboxId);

            if (tbody) {
                tbody.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                    cb.checked = false;
                });
            }

            if (selectAllCheckbox) {
                selectAllCheckbox.checked = false;
            }
        }
    };

    // Add CSS for pagination
    const style = document.createElement('style');
    style.textContent = `
        .pagination {
            display: flex;
            gap: 0.5rem;
            align-items: center;
            justify-content: center;
            margin-top: 1rem;
        }
        .pagination-ellipsis {
            padding: 0 0.5rem;
            color: var(--gray-500);
        }
        .pagination-hidden {
            display: none !important;
        }
    `;
    document.head.appendChild(style);

    // Expose to window
    window.FilterActions = FilterActions;

})(window);
