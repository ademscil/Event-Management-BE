/**
 * Mapping Management Module for CSI Portal
 * Handles Function-Application and Application-Department mappings
 */

(function(window) {
    'use strict';

    const API_BASE_URL = '/api/v1';

    /**
     * Mapping namespace - Mapping management functions
     */
    const Mapping = {
        currentMappings: [],
        allFunctions: [],
        allApplications: [],
        allBusinessUnits: [],
        allDivisions: [],
        allDepartments: [],

        /**
         * Initialize Function-Application mapping page
         */
        initFunctionAppMapping() {
            this.currentMappingType = 'function-app';
            this.loadFunctionAppData();
            this.setupFunctionAppEventHandlers();
        },

        /**
         * Load all data needed for Function-Application mapping
         */
        async loadFunctionAppData() {
            try {
                // Load functions, applications, and mappings in parallel
                const [functionsRes, appsRes, mappingsRes] = await Promise.all([
                    AuthUtils.authenticatedFetch(`${API_BASE_URL}/functions`),
                    AuthUtils.authenticatedFetch(`${API_BASE_URL}/applications`),
                    AuthUtils.authenticatedFetch(`${API_BASE_URL}/mappings/function-app/details`)
                ]);

                if (!functionsRes.ok || !appsRes.ok || !mappingsRes.ok) {
                    throw new Error('Failed to load mapping data');
                }

                const functionsData = await functionsRes.json();
                const appsData = await appsRes.json();
                const mappingsData = await mappingsRes.json();

                this.allFunctions = functionsData.functions || functionsData;
                this.allApplications = appsData.applications || appsData;
                this.currentMappings = mappingsData.mappings || mappingsData;

                this.renderFunctionAppTable(this.currentMappings);
                this.populateFunctionDropdown();
            } catch (error) {
                console.error('Error loading function-app mapping data:', error);
                this.showError('Gagal memuat data mapping');
            }
        },

        /**
         * Render Function-Application mapping table
         * @param {Array} mappings - Array of mapping objects with details
         */
        renderFunctionAppTable(mappings) {
            const tbody = document.getElementById('mapping-tbody');
            
            if (!mappings || mappings.length === 0) {
                tbody.innerHTML = '<tr><td colspan="3" class="text-center">Tidak ada data mapping</td></tr>';
                return;
            }

            tbody.innerHTML = mappings.map(mapping => `
                <tr data-function-id="${mapping.functionId}">
                    <td>${this.escapeHtml(mapping.functionCode)}</td>
                    <td>${this.escapeHtml(mapping.functionName)}</td>
                    <td>
                        <div class="tags-container">
                            ${mapping.applications && mapping.applications.length > 0 ? 
                                mapping.applications.map(app => `
                                    <span class="tag tag-primary">
                                        ${this.escapeHtml(app.applicationName)}
                                        <button class="tag-remove" data-function-id="${mapping.functionId}" data-app-id="${app.applicationId}" title="Hapus mapping">×</button>
                                    </span>
                                `).join('') :
                                '<span class="text-muted">Tidak ada aplikasi</span>'
                            }
                            <button class="btn btn-sm btn-success add-app-btn" data-function-id="${mapping.functionId}">
                                <span class="icon">+</span> Tambah Aplikasi
                            </button>
                        </div>
                    </td>
                </tr>
            `).join('');

            this.attachFunctionAppRowHandlers();
        },

        /**
         * Setup event handlers for Function-Application mapping
         */
        setupFunctionAppEventHandlers() {
            // Add mapping button
            document.getElementById('add-mapping-btn').addEventListener('click', () => {
                this.showAddMappingModal();
            });

            // Bulk import button
            document.getElementById('bulk-import-btn').addEventListener('click', () => {
                this.showImportModal();
            });

            // Export button
            document.getElementById('export-btn').addEventListener('click', () => {
                this.exportFunctionAppMappings();
            });

            // Search input
            document.getElementById('search-input').addEventListener('input', (e) => {
                this.filterMappingTable(e.target.value);
            });

            // Filter dropdowns
            document.getElementById('filter-function').addEventListener('change', () => {
                this.applyFilters();
            });

            document.getElementById('filter-application').addEventListener('change', () => {
                this.applyFilters();
            });

            // Add mapping modal handlers
            document.getElementById('mapping-modal-close').addEventListener('click', () => {
                this.hideAddMappingModal();
            });

            document.getElementById('mapping-cancel-btn').addEventListener('click', () => {
                this.hideAddMappingModal();
            });

            document.getElementById('mapping-form').addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveFunctionAppMapping();
            });

            // Import modal handlers
            document.getElementById('import-modal-close').addEventListener('click', () => {
                this.hideImportModal();
            });

            document.getElementById('import-cancel-btn').addEventListener('click', () => {
                this.hideImportModal();
            });

            document.getElementById('import-form').addEventListener('submit', (e) => {
                e.preventDefault();
                this.importMappings();
            });
        },

        /**
         * Attach event handlers to table row buttons
         */
        attachFunctionAppRowHandlers() {
            // Add application buttons
            document.querySelectorAll('.add-app-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const functionId = e.target.closest('button').dataset.functionId;
                    this.showAddApplicationModal(functionId);
                });
            });

            // Remove tag buttons
            document.querySelectorAll('.tag-remove').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const functionId = e.target.dataset.functionId;
                    const appId = e.target.dataset.appId;
                    this.removeFunctionAppMapping(functionId, appId);
                });
            });
        },

        /**
         * Populate function dropdown for filtering and adding
         */
        populateFunctionDropdown() {
            const filterDropdown = document.getElementById('filter-function');
            const addDropdown = document.getElementById('mapping-function');

            const options = this.allFunctions.map(func => 
                `<option value="${func.functionId}">${this.escapeHtml(func.code)} - ${this.escapeHtml(func.name)}</option>`
            ).join('');

            if (filterDropdown) {
                filterDropdown.innerHTML = '<option value="">Semua Function</option>' + options;
            }

            if (addDropdown) {
                addDropdown.innerHTML = '<option value="">Pilih Function</option>' + options;
            }
        },

        /**
         * Show add mapping modal
         */
        showAddMappingModal() {
            const modal = document.getElementById('mapping-modal');
            const form = document.getElementById('mapping-form');
            
            form.reset();
            this.hideModalMessages();
            this.populateFunctionDropdown();
            this.populateApplicationCheckboxes();

            modal.style.display = 'flex';
        },

        /**
         * Hide add mapping modal
         */
        hideAddMappingModal() {
            document.getElementById('mapping-modal').style.display = 'none';
        },

        /**
         * Populate application checkboxes for multi-select
         */
        populateApplicationCheckboxes() {
            const container = document.getElementById('mapping-applications');
            
            container.innerHTML = this.allApplications.map(app => `
                <div class="checkbox-item">
                    <label>
                        <input type="checkbox" name="applications" value="${app.applicationId}">
                        ${this.escapeHtml(app.code)} - ${this.escapeHtml(app.name)}
                    </label>
                </div>
            `).join('');
        },

        /**
         * Show add application modal for specific function
         * @param {string} functionId - Function ID
         */
        showAddApplicationModal(functionId) {
            const modal = document.getElementById('add-app-modal');
            const form = document.getElementById('add-app-form');
            
            form.reset();
            document.getElementById('add-app-function-id').value = functionId;
            
            // Find function name
            const func = this.allFunctions.find(f => f.functionId === functionId);
            document.getElementById('add-app-function-name').textContent = func ? func.name : '';

            // Get currently mapped applications for this function
            const mapping = this.currentMappings.find(m => m.functionId === functionId);
            const mappedAppIds = mapping && mapping.applications ? 
                mapping.applications.map(a => a.applicationId) : [];

            // Populate available applications (exclude already mapped)
            const container = document.getElementById('add-app-applications');
            const availableApps = this.allApplications.filter(app => !mappedAppIds.includes(app.applicationId));

            if (availableApps.length === 0) {
                container.innerHTML = '<p class="text-muted">Semua aplikasi sudah di-mapping</p>';
            } else {
                container.innerHTML = availableApps.map(app => `
                    <div class="checkbox-item">
                        <label>
                            <input type="checkbox" name="applications" value="${app.applicationId}">
                            ${this.escapeHtml(app.code)} - ${this.escapeHtml(app.name)}
                        </label>
                    </div>
                `).join('');
            }

            modal.style.display = 'flex';
        },

        /**
         * Hide add application modal
         */
        hideAddApplicationModal() {
            document.getElementById('add-app-modal').style.display = 'none';
        },

        /**
         * Save Function-Application mapping
         */
        async saveFunctionAppMapping() {
            this.hideModalMessages();

            const functionId = document.getElementById('mapping-function').value;
            const checkboxes = document.querySelectorAll('#mapping-applications input[name="applications"]:checked');
            const applicationIds = Array.from(checkboxes).map(cb => cb.value);

            // Validation
            if (!functionId) {
                this.showModalError('Pilih function terlebih dahulu');
                return;
            }

            if (applicationIds.length === 0) {
                this.showModalError('Pilih minimal satu aplikasi');
                return;
            }

            try {
                const response = await AuthUtils.authenticatedFetch(`${API_BASE_URL}/mappings/function-app`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        functionId,
                        applicationIds
                    })
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.message || data.error || 'Failed to save mapping');
                }

                this.showModalSuccess('Mapping berhasil ditambahkan');
                
                setTimeout(() => {
                    this.hideAddMappingModal();
                    this.loadFunctionAppData();
                }, 1500);
            } catch (error) {
                console.error('Error saving mapping:', error);
                this.showModalError(error.message || 'Gagal menyimpan mapping');
            }
        },

        /**
         * Save additional applications for a function
         */
        async saveAdditionalApplications() {
            const functionId = document.getElementById('add-app-function-id').value;
            const checkboxes = document.querySelectorAll('#add-app-applications input[name="applications"]:checked');
            const applicationIds = Array.from(checkboxes).map(cb => cb.value);

            if (applicationIds.length === 0) {
                alert('Pilih minimal satu aplikasi');
                return;
            }

            try {
                const response = await AuthUtils.authenticatedFetch(`${API_BASE_URL}/mappings/function-app`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        functionId,
                        applicationIds
                    })
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.message || data.error || 'Failed to add applications');
                }

                this.hideAddApplicationModal();
                this.showSuccess('Aplikasi berhasil ditambahkan');
                this.loadFunctionAppData();
            } catch (error) {
                console.error('Error adding applications:', error);
                alert(error.message || 'Gagal menambahkan aplikasi');
            }
        },

        /**
         * Remove Function-Application mapping
         * @param {string} functionId - Function ID
         * @param {string} applicationId - Application ID
         */
        async removeFunctionAppMapping(functionId, applicationId) {
            if (!confirm('Apakah Anda yakin ingin menghapus mapping ini?')) {
                return;
            }

            try {
                const response = await AuthUtils.authenticatedFetch(
                    `${API_BASE_URL}/mappings/function-app/by-entities?functionId=${functionId}&applicationId=${applicationId}`,
                    {
                        method: 'DELETE'
                    }
                );

                if (!response.ok) {
                    const data = await response.json();
                    throw new Error(data.message || data.error || 'Failed to delete mapping');
                }

                this.showSuccess('Mapping berhasil dihapus');
                this.loadFunctionAppData();
            } catch (error) {
                console.error('Error deleting mapping:', error);
                this.showError(error.message || 'Gagal menghapus mapping');
            }
        },

        /**
         * Filter mapping table by search term
         * @param {string} searchTerm - Search term
         */
        filterMappingTable(searchTerm) {
            const rows = document.querySelectorAll('#mapping-tbody tr');
            const term = searchTerm.toLowerCase();

            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                row.style.display = text.includes(term) ? '' : 'none';
            });
        },

        /**
         * Apply filters to mapping table
         */
        applyFilters() {
            const functionFilter = document.getElementById('filter-function').value;
            const applicationFilter = document.getElementById('filter-application').value;

            let filteredMappings = [...this.currentMappings];

            // Filter by function
            if (functionFilter) {
                filteredMappings = filteredMappings.filter(m => m.functionId === functionFilter);
            }

            // Filter by application
            if (applicationFilter) {
                filteredMappings = filteredMappings.filter(m => 
                    m.applications && m.applications.some(a => a.applicationId === applicationFilter)
                );
            }

            this.renderFunctionAppTable(filteredMappings);
        },

        /**
         * Export Function-Application mappings to CSV
         */
        async exportFunctionAppMappings() {
            try {
                const response = await AuthUtils.authenticatedFetch(`${API_BASE_URL}/mappings/function-app/export`);

                if (!response.ok) {
                    throw new Error('Failed to export mappings');
                }

                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `function-app-mappings-${new Date().toISOString().split('T')[0]}.csv`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);

                this.showSuccess('Export berhasil');
            } catch (error) {
                console.error('Error exporting mappings:', error);
                this.showError('Gagal export mapping');
            }
        },

        /**
         * Show import modal
         */
        showImportModal() {
            const modal = document.getElementById('import-modal');
            const form = document.getElementById('import-form');
            
            form.reset();
            document.getElementById('import-error').style.display = 'none';
            document.getElementById('import-success').style.display = 'none';

            modal.style.display = 'flex';
        },

        /**
         * Hide import modal
         */
        hideImportModal() {
            document.getElementById('import-modal').style.display = 'none';
        },

        /**
         * Import mappings from file
         */
        async importMappings() {
            document.getElementById('import-error').style.display = 'none';
            document.getElementById('import-success').style.display = 'none';

            const fileInput = document.getElementById('import-file');
            const file = fileInput.files[0];

            if (!file) {
                document.getElementById('import-error').textContent = 'Pilih file terlebih dahulu';
                document.getElementById('import-error').style.display = 'block';
                return;
            }

            const formData = new FormData();
            formData.append('file', file);
            formData.append('mappingType', this.currentMappingType);

            try {
                const response = await AuthUtils.authenticatedFetch(`${API_BASE_URL}/mappings/bulk-import`, {
                    method: 'POST',
                    body: formData
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.message || data.error || 'Failed to import mappings');
                }

                document.getElementById('import-success').textContent = 
                    `Import berhasil: ${data.imported || 0} mapping ditambahkan`;
                document.getElementById('import-success').style.display = 'block';
                
                setTimeout(() => {
                    this.hideImportModal();
                    if (this.currentMappingType === 'function-app') {
                        this.loadFunctionAppData();
                    } else {
                        this.loadAppDeptData();
                    }
                }, 2000);
            } catch (error) {
                console.error('Error importing mappings:', error);
                document.getElementById('import-error').textContent = error.message || 'Gagal import mapping';
                document.getElementById('import-error').style.display = 'block';
            }
        },

        /**
         * Show modal error message
         * @param {string} message - Error message
         */
        showModalError(message) {
            const errorDiv = document.getElementById('mapping-form-error');
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
            document.getElementById('mapping-form-success').style.display = 'none';
        },

        /**
         * Show modal success message
         * @param {string} message - Success message
         */
        showModalSuccess(message) {
            const successDiv = document.getElementById('mapping-form-success');
            successDiv.textContent = message;
            successDiv.style.display = 'block';
            document.getElementById('mapping-form-error').style.display = 'none';
        },

        /**
         * Hide modal messages
         */
        hideModalMessages() {
            document.getElementById('mapping-form-error').style.display = 'none';
            document.getElementById('mapping-form-success').style.display = 'none';
        },

        /**
         * Show error notification
         * @param {string} message - Error message
         */
        showError(message) {
            alert(message);
        },

        /**
         * Show success notification
         * @param {string} message - Success message
         */
        showSuccess(message) {
            alert(message);
        },

        /**
         * Escape HTML to prevent XSS
         * @param {string} text - Text to escape
         * @returns {string} Escaped text
         */
        escapeHtml(text) {
            if (!text) return '';
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
    };

    // Expose to window
    window.Mapping = Mapping;

})(window);


    // ==================== Application-Department Mapping ====================

    /**
     * Initialize Application-Department mapping page
     */
    Mapping.initAppDeptMapping = function() {
        this.currentMappingType = 'app-dept';
        this.loadAppDeptData();
        this.setupAppDeptEventHandlers();
    };

    /**
     * Load all data needed for Application-Department mapping
     */
    Mapping.loadAppDeptData = async function() {
        try {
            // Load business units, divisions, departments, applications, and mappings
            const [buRes, divisionsRes, deptsRes, appsRes, mappingsRes] = await Promise.all([
                AuthUtils.authenticatedFetch(`${API_BASE_URL}/business-units`),
                AuthUtils.authenticatedFetch(`${API_BASE_URL}/divisions`),
                AuthUtils.authenticatedFetch(`${API_BASE_URL}/departments`),
                AuthUtils.authenticatedFetch(`${API_BASE_URL}/applications`),
                AuthUtils.authenticatedFetch(`${API_BASE_URL}/mappings/app-dept/hierarchical`)
            ]);

            if (!buRes.ok || !divisionsRes.ok || !deptsRes.ok || !appsRes.ok || !mappingsRes.ok) {
                throw new Error('Failed to load mapping data');
            }

            const buData = await buRes.json();
            const divisionsData = await divisionsRes.json();
            const deptsData = await deptsRes.json();
            const appsData = await appsRes.json();
            const mappingsData = await mappingsRes.json();

            this.allBusinessUnits = buData.businessUnits || buData;
            this.allDivisions = divisionsData.divisions || divisionsData;
            this.allDepartments = deptsData.departments || deptsData;
            this.allApplications = appsData.applications || appsData;
            this.currentMappings = mappingsData.mappings || mappingsData;

            this.renderAppDeptTable(this.currentMappings);
            this.populateAppDeptFilters();
        } catch (error) {
            console.error('Error loading app-dept mapping data:', error);
            this.showError('Gagal memuat data mapping');
        }
    };

    /**
     * Render Application-Department mapping table (hierarchical)
     * @param {Array} mappings - Array of hierarchical mapping objects
     */
    Mapping.renderAppDeptTable = function(mappings) {
        const tbody = document.getElementById('mapping-tbody');
        
        if (!mappings || mappings.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center">Tidak ada data mapping</td></tr>';
            return;
        }

        let html = '';
        
        mappings.forEach(bu => {
            bu.divisions.forEach(division => {
                division.departments.forEach(dept => {
                    html += `
                        <tr data-dept-id="${dept.departmentId}">
                            <td>${this.escapeHtml(bu.businessUnitName)}</td>
                            <td>${this.escapeHtml(division.divisionName)}</td>
                            <td>${this.escapeHtml(dept.departmentName)}</td>
                            <td>
                                <div class="tags-container">
                                    ${dept.applications && dept.applications.length > 0 ? 
                                        dept.applications.map(app => `
                                            <span class="tag tag-primary">
                                                ${this.escapeHtml(app.applicationName)}
                                                <button class="tag-remove" data-dept-id="${dept.departmentId}" data-app-id="${app.applicationId}" title="Hapus mapping">×</button>
                                            </span>
                                        `).join('') :
                                        '<span class="text-muted">Tidak ada aplikasi</span>'
                                    }
                                    <button class="btn btn-sm btn-success add-dept-app-btn" data-dept-id="${dept.departmentId}">
                                        <span class="icon">+</span> Tambah Aplikasi
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `;
                });
            });
        });

        tbody.innerHTML = html;
        this.attachAppDeptRowHandlers();
    };

    /**
     * Setup event handlers for Application-Department mapping
     */
    Mapping.setupAppDeptEventHandlers = function() {
        // Add mapping button
        document.getElementById('add-mapping-btn').addEventListener('click', () => {
            this.showAddAppDeptMappingModal();
        });

        // Bulk import button
        document.getElementById('bulk-import-btn').addEventListener('click', () => {
            this.showImportModal();
        });

        // Export button
        document.getElementById('export-btn').addEventListener('click', () => {
            this.exportAppDeptMappings();
        });

        // Search input
        document.getElementById('search-input').addEventListener('input', (e) => {
            this.filterMappingTable(e.target.value);
        });

        // Filter dropdowns
        document.getElementById('filter-bu').addEventListener('change', () => {
            this.updateDivisionFilter();
            this.applyAppDeptFilters();
        });

        document.getElementById('filter-division').addEventListener('change', () => {
            this.updateDepartmentFilter();
            this.applyAppDeptFilters();
        });

        document.getElementById('filter-department').addEventListener('change', () => {
            this.applyAppDeptFilters();
        });

        document.getElementById('filter-application').addEventListener('change', () => {
            this.applyAppDeptFilters();
        });

        // Add mapping modal handlers
        document.getElementById('mapping-modal-close').addEventListener('click', () => {
            this.hideAddAppDeptMappingModal();
        });

        document.getElementById('mapping-cancel-btn').addEventListener('click', () => {
            this.hideAddAppDeptMappingModal();
        });

        // Cascading dropdowns in add mapping modal
        document.getElementById('mapping-bu').addEventListener('change', () => {
            this.updateMappingDivisionDropdown();
        });

        document.getElementById('mapping-division').addEventListener('change', () => {
            this.updateMappingDepartmentDropdown();
        });

        document.getElementById('mapping-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveAppDeptMapping();
        });

        // Import modal handlers
        document.getElementById('import-modal-close').addEventListener('click', () => {
            this.hideImportModal();
        });

        document.getElementById('import-cancel-btn').addEventListener('click', () => {
            this.hideImportModal();
        });

        document.getElementById('import-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.importMappings();
        });
    };

    /**
     * Attach event handlers to table row buttons
     */
    Mapping.attachAppDeptRowHandlers = function() {
        // Add application buttons
        document.querySelectorAll('.add-dept-app-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const deptId = e.target.closest('button').dataset.deptId;
                this.showAddDeptApplicationModal(deptId);
            });
        });

        // Remove tag buttons
        document.querySelectorAll('.tag-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const deptId = e.target.dataset.deptId;
                const appId = e.target.dataset.appId;
                this.removeAppDeptMapping(deptId, appId);
            });
        });
    };

    /**
     * Populate filter dropdowns for App-Dept mapping
     */
    Mapping.populateAppDeptFilters = function() {
        // Business Unit filter
        const buFilter = document.getElementById('filter-bu');
        buFilter.innerHTML = '<option value="">Semua Business Unit</option>' +
            this.allBusinessUnits.map(bu => 
                `<option value="${bu.businessUnitId}">${this.escapeHtml(bu.name)}</option>`
            ).join('');

        // Application filter
        const appFilter = document.getElementById('filter-application');
        appFilter.innerHTML = '<option value="">Semua Aplikasi</option>' +
            this.allApplications.map(app => 
                `<option value="${app.applicationId}">${this.escapeHtml(app.code)} - ${this.escapeHtml(app.name)}</option>`
            ).join('');

        // Initialize division and department filters as empty
        document.getElementById('filter-division').innerHTML = '<option value="">Pilih Business Unit dulu</option>';
        document.getElementById('filter-department').innerHTML = '<option value="">Pilih Division dulu</option>';
    };

    /**
     * Update division filter based on selected BU
     */
    Mapping.updateDivisionFilter = function() {
        const buId = document.getElementById('filter-bu').value;
        const divisionFilter = document.getElementById('filter-division');
        const deptFilter = document.getElementById('filter-department');

        if (!buId) {
            divisionFilter.innerHTML = '<option value="">Pilih Business Unit dulu</option>';
            deptFilter.innerHTML = '<option value="">Pilih Division dulu</option>';
            return;
        }

        const divisions = this.allDivisions.filter(d => d.businessUnitId === buId);
        divisionFilter.innerHTML = '<option value="">Semua Division</option>' +
            divisions.map(div => 
                `<option value="${div.divisionId}">${this.escapeHtml(div.name)}</option>`
            ).join('');

        deptFilter.innerHTML = '<option value="">Pilih Division dulu</option>';
    };

    /**
     * Update department filter based on selected division
     */
    Mapping.updateDepartmentFilter = function() {
        const divisionId = document.getElementById('filter-division').value;
        const deptFilter = document.getElementById('filter-department');

        if (!divisionId) {
            deptFilter.innerHTML = '<option value="">Pilih Division dulu</option>';
            return;
        }

        const departments = this.allDepartments.filter(d => d.divisionId === divisionId);
        deptFilter.innerHTML = '<option value="">Semua Department</option>' +
            departments.map(dept => 
                `<option value="${dept.departmentId}">${this.escapeHtml(dept.name)}</option>`
            ).join('');
    };

    /**
     * Apply filters to App-Dept mapping table
     */
    Mapping.applyAppDeptFilters = function() {
        const buFilter = document.getElementById('filter-bu').value;
        const divisionFilter = document.getElementById('filter-division').value;
        const deptFilter = document.getElementById('filter-department').value;
        const appFilter = document.getElementById('filter-application').value;

        const rows = document.querySelectorAll('#mapping-tbody tr');

        rows.forEach(row => {
            let show = true;
            const cells = row.cells;

            if (!cells || cells.length === 0) return;

            // Filter by BU
            if (buFilter && !cells[0].textContent.includes(this.getBusinessUnitName(buFilter))) {
                show = false;
            }

            // Filter by Division
            if (divisionFilter && !cells[1].textContent.includes(this.getDivisionName(divisionFilter))) {
                show = false;
            }

            // Filter by Department
            if (deptFilter) {
                const deptId = row.dataset.deptId;
                if (deptId !== deptFilter) {
                    show = false;
                }
            }

            // Filter by Application
            if (appFilter) {
                const appName = this.getApplicationName(appFilter);
                if (!cells[3].textContent.includes(appName)) {
                    show = false;
                }
            }

            row.style.display = show ? '' : 'none';
        });
    };

    /**
     * Get business unit name by ID
     */
    Mapping.getBusinessUnitName = function(buId) {
        const bu = this.allBusinessUnits.find(b => b.businessUnitId === buId);
        return bu ? bu.name : '';
    };

    /**
     * Get division name by ID
     */
    Mapping.getDivisionName = function(divisionId) {
        const division = this.allDivisions.find(d => d.divisionId === divisionId);
        return division ? division.name : '';
    };

    /**
     * Get department name by ID
     */
    Mapping.getDepartmentName = function(deptId) {
        const dept = this.allDepartments.find(d => d.departmentId === deptId);
        return dept ? dept.name : '';
    };

    /**
     * Get application name by ID
     */
    Mapping.getApplicationName = function(appId) {
        const app = this.allApplications.find(a => a.applicationId === appId);
        return app ? app.name : '';
    };

    /**
     * Show add App-Dept mapping modal
     */
    Mapping.showAddAppDeptMappingModal = function() {
        const modal = document.getElementById('mapping-modal');
        const form = document.getElementById('mapping-form');
        
        form.reset();
        this.hideModalMessages();
        
        // Populate BU dropdown
        const buDropdown = document.getElementById('mapping-bu');
        buDropdown.innerHTML = '<option value="">Pilih Business Unit</option>' +
            this.allBusinessUnits.map(bu => 
                `<option value="${bu.businessUnitId}">${this.escapeHtml(bu.name)}</option>`
            ).join('');

        // Reset cascading dropdowns
        document.getElementById('mapping-division').innerHTML = '<option value="">Pilih Business Unit dulu</option>';
        document.getElementById('mapping-department').innerHTML = '<option value="">Pilih Division dulu</option>';

        // Populate applications
        this.populateApplicationCheckboxes();

        modal.style.display = 'flex';
    };

    /**
     * Hide add App-Dept mapping modal
     */
    Mapping.hideAddAppDeptMappingModal = function() {
        document.getElementById('mapping-modal').style.display = 'none';
    };

    /**
     * Update division dropdown in mapping modal
     */
    Mapping.updateMappingDivisionDropdown = function() {
        const buId = document.getElementById('mapping-bu').value;
        const divisionDropdown = document.getElementById('mapping-division');
        const deptDropdown = document.getElementById('mapping-department');

        if (!buId) {
            divisionDropdown.innerHTML = '<option value="">Pilih Business Unit dulu</option>';
            deptDropdown.innerHTML = '<option value="">Pilih Division dulu</option>';
            return;
        }

        const divisions = this.allDivisions.filter(d => d.businessUnitId === buId);
        divisionDropdown.innerHTML = '<option value="">Pilih Division</option>' +
            divisions.map(div => 
                `<option value="${div.divisionId}">${this.escapeHtml(div.name)}</option>`
            ).join('');

        deptDropdown.innerHTML = '<option value="">Pilih Division dulu</option>';
    };

    /**
     * Update department dropdown in mapping modal
     */
    Mapping.updateMappingDepartmentDropdown = function() {
        const divisionId = document.getElementById('mapping-division').value;
        const deptDropdown = document.getElementById('mapping-department');

        if (!divisionId) {
            deptDropdown.innerHTML = '<option value="">Pilih Division dulu</option>';
            return;
        }

        const departments = this.allDepartments.filter(d => d.divisionId === divisionId);
        deptDropdown.innerHTML = '<option value="">Pilih Department</option>' +
            departments.map(dept => 
                `<option value="${dept.departmentId}">${this.escapeHtml(dept.name)}</option>`
            ).join('');
    };

    /**
     * Save App-Dept mapping
     */
    Mapping.saveAppDeptMapping = async function() {
        this.hideModalMessages();

        const departmentId = document.getElementById('mapping-department').value;
        const checkboxes = document.querySelectorAll('#mapping-applications input[name="applications"]:checked');
        const applicationIds = Array.from(checkboxes).map(cb => cb.value);

        // Validation
        if (!departmentId) {
            this.showModalError('Pilih department terlebih dahulu');
            return;
        }

        if (applicationIds.length === 0) {
            this.showModalError('Pilih minimal satu aplikasi');
            return;
        }

        try {
            const response = await AuthUtils.authenticatedFetch(`${API_BASE_URL}/mappings/app-dept`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    departmentId,
                    applicationIds
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || data.error || 'Failed to save mapping');
            }

            this.showModalSuccess('Mapping berhasil ditambahkan');
            
            setTimeout(() => {
                this.hideAddAppDeptMappingModal();
                this.loadAppDeptData();
            }, 1500);
        } catch (error) {
            console.error('Error saving mapping:', error);
            this.showModalError(error.message || 'Gagal menyimpan mapping');
        }
    };

    /**
     * Show add application modal for specific department
     * @param {string} departmentId - Department ID
     */
    Mapping.showAddDeptApplicationModal = function(departmentId) {
        const modal = document.getElementById('add-app-modal');
        const form = document.getElementById('add-app-form');
        
        form.reset();
        document.getElementById('add-app-dept-id').value = departmentId;
        
        // Find department name
        const dept = this.allDepartments.find(d => d.departmentId === departmentId);
        document.getElementById('add-app-dept-name').textContent = dept ? dept.name : '';

        // Get currently mapped applications for this department
        let mappedAppIds = [];
        this.currentMappings.forEach(bu => {
            bu.divisions.forEach(division => {
                division.departments.forEach(d => {
                    if (d.departmentId === departmentId && d.applications) {
                        mappedAppIds = d.applications.map(a => a.applicationId);
                    }
                });
            });
        });

        // Populate available applications (exclude already mapped)
        const container = document.getElementById('add-app-applications');
        const availableApps = this.allApplications.filter(app => !mappedAppIds.includes(app.applicationId));

        if (availableApps.length === 0) {
            container.innerHTML = '<p class="text-muted">Semua aplikasi sudah di-mapping</p>';
        } else {
            container.innerHTML = availableApps.map(app => `
                <div class="checkbox-item">
                    <label>
                        <input type="checkbox" name="applications" value="${app.applicationId}">
                        ${this.escapeHtml(app.code)} - ${this.escapeHtml(app.name)}
                    </label>
                </div>
            `).join('');
        }

        modal.style.display = 'flex';
    };

    /**
     * Save additional applications for a department
     */
    Mapping.saveAdditionalDeptApplications = async function() {
        const departmentId = document.getElementById('add-app-dept-id').value;
        const checkboxes = document.querySelectorAll('#add-app-applications input[name="applications"]:checked');
        const applicationIds = Array.from(checkboxes).map(cb => cb.value);

        if (applicationIds.length === 0) {
            alert('Pilih minimal satu aplikasi');
            return;
        }

        try {
            const response = await AuthUtils.authenticatedFetch(`${API_BASE_URL}/mappings/app-dept`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    departmentId,
                    applicationIds
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || data.error || 'Failed to add applications');
            }

            this.hideAddApplicationModal();
            this.showSuccess('Aplikasi berhasil ditambahkan');
            this.loadAppDeptData();
        } catch (error) {
            console.error('Error adding applications:', error);
            alert(error.message || 'Gagal menambahkan aplikasi');
        }
    };

    /**
     * Remove App-Dept mapping
     * @param {string} departmentId - Department ID
     * @param {string} applicationId - Application ID
     */
    Mapping.removeAppDeptMapping = async function(departmentId, applicationId) {
        if (!confirm('Apakah Anda yakin ingin menghapus mapping ini?')) {
            return;
        }

        try {
            const response = await AuthUtils.authenticatedFetch(
                `${API_BASE_URL}/mappings/app-dept/by-entities?applicationId=${applicationId}&departmentId=${departmentId}`,
                {
                    method: 'DELETE'
                }
            );

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.message || data.error || 'Failed to delete mapping');
            }

            this.showSuccess('Mapping berhasil dihapus');
            this.loadAppDeptData();
        } catch (error) {
            console.error('Error deleting mapping:', error);
            this.showError(error.message || 'Gagal menghapus mapping');
        }
    };

    /**
     * Export App-Dept mappings to CSV
     */
    Mapping.exportAppDeptMappings = async function() {
        try {
            const response = await AuthUtils.authenticatedFetch(`${API_BASE_URL}/mappings/app-dept/export`);

            if (!response.ok) {
                throw new Error('Failed to export mappings');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `app-dept-mappings-${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            this.showSuccess('Export berhasil');
        } catch (error) {
            console.error('Error exporting mappings:', error);
            this.showError('Gagal export mapping');
        }
    };

})(window);
