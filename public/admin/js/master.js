/**
 * Master Data Management Module for CSI Portal
 * Handles CRUD operations for all master data entities
 */

(function(window) {
    'use strict';

    const API_BASE_URL = '/api/v1';

    /**
     * MasterData namespace - Master data management functions
     */
    const MasterData = {
        /**
         * Initialize User management page
         */
        initUsers() {
            this.currentEntity = 'users';
            this.loadUsers();
            this.setupUserEventHandlers();
        },

        /**
         * Load users from API
         */
        async loadUsers() {
            try {
                const response = await AuthUtils.authenticatedFetch(`${API_BASE_URL}/users`);
                
                if (!response.ok) {
                    throw new Error('Failed to load users');
                }

                const data = await response.json();
                this.renderUsersTable(data.users || data);
            } catch (error) {
                console.error('Error loading users:', error);
                this.showError('Gagal memuat data user');
            }
        },

        /**
         * Render users table
         * @param {Array} users - Array of user objects
         */
        renderUsersTable(users) {
            const tbody = document.getElementById('users-tbody');
            
            if (!users || users.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center">Tidak ada data</td></tr>';
                return;
            }

            tbody.innerHTML = users.map(user => `
                <tr data-id="${user.userId}">
                    <td>${this.escapeHtml(user.username)}</td>
                    <td>${this.escapeHtml(user.displayName)}</td>
                    <td>${this.escapeHtml(user.email)}</td>
                    <td><span class="badge badge-info">${this.getRoleDisplay(user.role)}</span></td>
                    <td>
                        <span class="badge ${user.useLDAP ? 'badge-success' : 'badge-secondary'}">
                            ${user.useLDAP ? 'ON' : 'OFF'}
                        </span>
                    </td>
                    <td>
                        <span class="badge ${user.isActive ? 'badge-success' : 'badge-danger'}">
                            ${user.isActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                    </td>
                    <td>
                        <button class="btn btn-sm btn-primary edit-user-btn" data-id="${user.userId}">Edit</button>
                        ${user.isActive ? 
                            `<button class="btn btn-sm btn-danger delete-user-btn" data-id="${user.userId}">Nonaktifkan</button>` :
                            `<button class="btn btn-sm btn-success activate-user-btn" data-id="${user.userId}">Aktifkan</button>`
                        }
                    </td>
                </tr>
            `).join('');

            // Attach event handlers to buttons
            this.attachUserRowHandlers();
        },

        /**
         * Setup event handlers for user management
         */
        setupUserEventHandlers() {
            // Add user button
            document.getElementById('add-user-btn').addEventListener('click', () => {
                this.showUserModal();
            });

            // Search input
            document.getElementById('search-input').addEventListener('input', (e) => {
                this.filterUsers(e.target.value);
            });

            // Modal close buttons
            document.getElementById('modal-close').addEventListener('click', () => {
                this.hideUserModal();
            });

            document.getElementById('cancel-btn').addEventListener('click', () => {
                this.hideUserModal();
            });

            // LDAP toggle handler
            document.getElementById('use-ldap').addEventListener('change', (e) => {
                this.togglePasswordFields(e.target.checked);
            });

            // Form submit
            document.getElementById('user-form').addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveUser();
            });

            // Delete modal handlers
            document.getElementById('delete-modal-close').addEventListener('click', () => {
                this.hideDeleteModal();
            });

            document.getElementById('delete-cancel-btn').addEventListener('click', () => {
                this.hideDeleteModal();
            });

            document.getElementById('delete-confirm-btn').addEventListener('click', () => {
                this.confirmDeleteUser();
            });
        },

        /**
         * Attach event handlers to table row buttons
         */
        attachUserRowHandlers() {
            // Edit buttons
            document.querySelectorAll('.edit-user-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const userId = e.target.dataset.id;
                    this.editUser(userId);
                });
            });

            // Delete buttons
            document.querySelectorAll('.delete-user-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const userId = e.target.dataset.id;
                    this.deleteUser(userId);
                });
            });

            // Activate buttons
            document.querySelectorAll('.activate-user-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const userId = e.target.dataset.id;
                    this.activateUser(userId);
                });
            });
        },

        /**
         * Show user modal for add/edit
         * @param {Object} user - User object for editing (optional)
         */
        showUserModal(user = null) {
            const modal = document.getElementById('user-modal');
            const form = document.getElementById('user-form');
            const title = document.getElementById('modal-title');
            
            // Reset form
            form.reset();
            this.hideFormMessages();

            if (user) {
                // Edit mode
                title.textContent = 'Edit User';
                document.getElementById('user-id').value = user.userId;
                document.getElementById('username').value = user.username;
                document.getElementById('username').disabled = true; // Username cannot be changed
                document.getElementById('display-name').value = user.displayName;
                document.getElementById('email').value = user.email;
                document.getElementById('role').value = user.role;
                document.getElementById('use-ldap').checked = user.useLDAP;
                
                // Hide password fields in edit mode
                this.togglePasswordFields(user.useLDAP, true);
            } else {
                // Add mode
                title.textContent = 'Tambah User';
                document.getElementById('user-id').value = '';
                document.getElementById('username').disabled = false;
                document.getElementById('use-ldap').checked = false;
                this.togglePasswordFields(false);
            }

            modal.style.display = 'flex';
        },

        /**
         * Hide user modal
         */
        hideUserModal() {
            document.getElementById('user-modal').style.display = 'none';
        },

        /**
         * Toggle password fields based on LDAP setting
         * @param {boolean} useLDAP - Whether LDAP is enabled
         * @param {boolean} isEditMode - Whether in edit mode
         */
        togglePasswordFields(useLDAP, isEditMode = false) {
            const passwordGroup = document.getElementById('password-group');
            const confirmPasswordGroup = document.getElementById('confirm-password-group');
            const passwordInput = document.getElementById('password');
            const confirmPasswordInput = document.getElementById('confirm-password');

            if (useLDAP || isEditMode) {
                // Hide password fields when LDAP is ON or in edit mode
                passwordGroup.style.display = 'none';
                confirmPasswordGroup.style.display = 'none';
                passwordInput.required = false;
                confirmPasswordInput.required = false;
            } else {
                // Show password fields when LDAP is OFF and in add mode
                passwordGroup.style.display = 'block';
                confirmPasswordGroup.style.display = 'block';
                passwordInput.required = true;
                confirmPasswordInput.required = true;
            }
        },

        /**
         * Save user (create or update)
         */
        async saveUser() {
            this.hideFormMessages();

            const userId = document.getElementById('user-id').value;
            const username = document.getElementById('username').value.trim();
            const displayName = document.getElementById('display-name').value.trim();
            const email = document.getElementById('email').value.trim();
            const role = document.getElementById('role').value;
            const useLDAP = document.getElementById('use-ldap').checked;
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirm-password').value;

            // Validation
            if (!username || !displayName || !email || !role) {
                this.showFormError('Semua field wajib diisi');
                return;
            }

            // Username validation
            if (!/^[a-zA-Z0-9_]{3,50}$/.test(username)) {
                this.showFormError('Username harus 3-50 karakter, hanya huruf, angka, dan underscore');
                return;
            }

            // Email validation
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                this.showFormError('Format email tidak valid');
                return;
            }

            // Password validation for non-LDAP users in add mode
            if (!useLDAP && !userId) {
                if (!password || password.length < 8) {
                    this.showFormError('Password minimal 8 karakter');
                    return;
                }

                if (password !== confirmPassword) {
                    this.showFormError('Password dan konfirmasi password tidak cocok');
                    return;
                }
            }

            const userData = {
                username,
                displayName,
                email,
                role,
                useLDAP
            };

            // Add password only for non-LDAP users in add mode
            if (!useLDAP && !userId && password) {
                userData.password = password;
            }

            try {
                const url = userId ? `${API_BASE_URL}/users/${userId}` : `${API_BASE_URL}/users`;
                const method = userId ? 'PUT' : 'POST';

                const response = await AuthUtils.authenticatedFetch(url, {
                    method,
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(userData)
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.message || data.error || 'Failed to save user');
                }

                this.showFormSuccess(userId ? 'User berhasil diupdate' : 'User berhasil ditambahkan');
                
                setTimeout(() => {
                    this.hideUserModal();
                    this.loadUsers();
                }, 1500);
            } catch (error) {
                console.error('Error saving user:', error);
                this.showFormError(error.message || 'Gagal menyimpan user');
            }
        },

        /**
         * Edit user
         * @param {string} userId - User ID
         */
        async editUser(userId) {
            try {
                const response = await AuthUtils.authenticatedFetch(`${API_BASE_URL}/users/${userId}`);
                
                if (!response.ok) {
                    throw new Error('Failed to load user');
                }

                const data = await response.json();
                this.showUserModal(data.user || data);
            } catch (error) {
                console.error('Error loading user:', error);
                this.showError('Gagal memuat data user');
            }
        },

        /**
         * Delete user (deactivate)
         * @param {string} userId - User ID
         */
        deleteUser(userId) {
            this.currentDeleteUserId = userId;
            
            // Find user name
            const row = document.querySelector(`tr[data-id="${userId}"]`);
            const userName = row ? row.querySelector('td:nth-child(2)').textContent : '';
            
            document.getElementById('delete-user-name').textContent = userName;
            document.getElementById('delete-modal').style.display = 'flex';
        },

        /**
         * Confirm delete user
         */
        async confirmDeleteUser() {
            const userId = this.currentDeleteUserId;
            
            try {
                const response = await AuthUtils.authenticatedFetch(`${API_BASE_URL}/users/${userId}`, {
                    method: 'DELETE'
                });

                if (!response.ok) {
                    const data = await response.json();
                    throw new Error(data.message || data.error || 'Failed to deactivate user');
                }

                this.hideDeleteModal();
                this.showSuccess('User berhasil dinonaktifkan');
                this.loadUsers();
            } catch (error) {
                console.error('Error deactivating user:', error);
                this.showError(error.message || 'Gagal menonaktifkan user');
            }
        },

        /**
         * Activate user
         * @param {string} userId - User ID
         */
        async activateUser(userId) {
            try {
                const response = await AuthUtils.authenticatedFetch(`${API_BASE_URL}/users/${userId}/activate`, {
                    method: 'POST'
                });

                if (!response.ok) {
                    const data = await response.json();
                    throw new Error(data.message || data.error || 'Failed to activate user');
                }

                this.showSuccess('User berhasil diaktifkan');
                this.loadUsers();
            } catch (error) {
                console.error('Error activating user:', error);
                this.showError(error.message || 'Gagal mengaktifkan user');
            }
        },

        /**
         * Hide delete modal
         */
        hideDeleteModal() {
            document.getElementById('delete-modal').style.display = 'none';
            this.currentDeleteUserId = null;
        },

        /**
         * Filter users by search term
         * @param {string} searchTerm - Search term
         */
        filterUsers(searchTerm) {
            const rows = document.querySelectorAll('#users-tbody tr');
            const term = searchTerm.toLowerCase();

            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                row.style.display = text.includes(term) ? '' : 'none';
            });
        },

        /**
         * Get role display name
         * @param {string} role - Role code
         * @returns {string} Role display name
         */
        getRoleDisplay(role) {
            const roleMap = {
                'SuperAdmin': 'Super Admin',
                'AdminEvent': 'Admin Event',
                'ITLead': 'IT Lead',
                'DepartmentHead': 'Department Head'
            };
            return roleMap[role] || role;
        },

        /**
         * Show form error message
         * @param {string} message - Error message
         */
        showFormError(message) {
            const errorDiv = document.getElementById('form-error');
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
            document.getElementById('form-success').style.display = 'none';
        },

        /**
         * Show form success message
         * @param {string} message - Success message
         */
        showFormSuccess(message) {
            const successDiv = document.getElementById('form-success');
            successDiv.textContent = message;
            successDiv.style.display = 'block';
            document.getElementById('form-error').style.display = 'none';
        },

        /**
         * Hide form messages
         */
        hideFormMessages() {
            document.getElementById('form-error').style.display = 'none';
            document.getElementById('form-success').style.display = 'none';
        },

        /**
         * Show error notification
         * @param {string} message - Error message
         */
        showError(message) {
            alert(message); // TODO: Replace with better notification system
        },

        /**
         * Show success notification
         * @param {string} message - Success message
         */
        showSuccess(message) {
            alert(message); // TODO: Replace with better notification system
        },

        /**
         * Escape HTML to prevent XSS
         * @param {string} text - Text to escape
         * @returns {string} Escaped text
         */
        escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
    };

    // Expose to window
    window.MasterData = MasterData;

})(window);


    // ==================== Business Unit Management ====================

    MasterData.initBusinessUnits = function() {
        this.currentEntity = 'business-units';
        this.loadBusinessUnits();
        this.setupBusinessUnitEventHandlers();
    };

    MasterData.loadBusinessUnits = async function() {
        try {
            const response = await AuthUtils.authenticatedFetch(`${API_BASE_URL}/business-units`);
            
            if (!response.ok) {
                throw new Error('Failed to load business units');
            }

            const data = await response.json();
            this.renderBusinessUnitsTable(data.businessUnits || data);
        } catch (error) {
            console.error('Error loading business units:', error);
            this.showError('Gagal memuat data business unit');
        }
    };

    MasterData.renderBusinessUnitsTable = function(businessUnits) {
        const tbody = document.getElementById('bu-tbody');
        
        if (!businessUnits || businessUnits.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center">Tidak ada data</td></tr>';
            return;
        }

        tbody.innerHTML = businessUnits.map(bu => `
            <tr data-id="${bu.businessUnitId}">
                <td>${this.escapeHtml(bu.code)}</td>
                <td>${this.escapeHtml(bu.name)}</td>
                <td>
                    <span class="badge ${bu.isActive ? 'badge-success' : 'badge-danger'}">
                        ${bu.isActive ? 'Aktif' : 'Nonaktif'}
                    </span>
                </td>
                <td>
                    <button class="btn btn-sm btn-primary edit-bu-btn" data-id="${bu.businessUnitId}">Edit</button>
                    <button class="btn btn-sm btn-danger delete-bu-btn" data-id="${bu.businessUnitId}">Hapus</button>
                </td>
            </tr>
        `).join('');

        this.attachBusinessUnitRowHandlers();
    };

    MasterData.setupBusinessUnitEventHandlers = function() {
        // Add button
        document.getElementById('add-bu-btn').addEventListener('click', () => {
            this.showBusinessUnitModal();
        });

        // Bulk import button
        document.getElementById('bulk-import-btn').addEventListener('click', () => {
            this.showImportModal();
        });

        // Search input
        document.getElementById('search-input').addEventListener('input', (e) => {
            this.filterTable(e.target.value, 'bu-tbody');
        });

        // Modal close buttons
        document.getElementById('modal-close').addEventListener('click', () => {
            this.hideBusinessUnitModal();
        });

        document.getElementById('cancel-btn').addEventListener('click', () => {
            this.hideBusinessUnitModal();
        });

        // Form submit
        document.getElementById('bu-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveBusinessUnit();
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
            this.importBusinessUnits();
        });

        // Delete modal handlers
        document.getElementById('delete-modal-close').addEventListener('click', () => {
            this.hideDeleteModal();
        });

        document.getElementById('delete-cancel-btn').addEventListener('click', () => {
            this.hideDeleteModal();
        });

        document.getElementById('delete-confirm-btn').addEventListener('click', () => {
            this.confirmDeleteBusinessUnit();
        });
    };

    MasterData.attachBusinessUnitRowHandlers = function() {
        // Edit buttons
        document.querySelectorAll('.edit-bu-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const buId = e.target.dataset.id;
                this.editBusinessUnit(buId);
            });
        });

        // Delete buttons
        document.querySelectorAll('.delete-bu-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const buId = e.target.dataset.id;
                this.deleteBusinessUnit(buId);
            });
        });
    };

    MasterData.showBusinessUnitModal = function(bu = null) {
        const modal = document.getElementById('bu-modal');
        const form = document.getElementById('bu-form');
        const title = document.getElementById('modal-title');
        
        form.reset();
        this.hideFormMessages();

        if (bu) {
            title.textContent = 'Edit Business Unit';
            document.getElementById('bu-id').value = bu.businessUnitId;
            document.getElementById('bu-code').value = bu.code;
            document.getElementById('bu-code').disabled = true;
            document.getElementById('bu-name').value = bu.name;
        } else {
            title.textContent = 'Tambah Business Unit';
            document.getElementById('bu-id').value = '';
            document.getElementById('bu-code').disabled = false;
        }

        modal.style.display = 'flex';
    };

    MasterData.hideBusinessUnitModal = function() {
        document.getElementById('bu-modal').style.display = 'none';
    };

    MasterData.saveBusinessUnit = async function() {
        this.hideFormMessages();

        const buId = document.getElementById('bu-id').value;
        const code = document.getElementById('bu-code').value.trim();
        const name = document.getElementById('bu-name').value.trim();

        // Validation
        if (!code || !name) {
            this.showFormError('Semua field wajib diisi');
            return;
        }

        if (!/^[a-zA-Z0-9-]{2,20}$/.test(code)) {
            this.showFormError('Kode harus 2-20 karakter, hanya huruf, angka, dan tanda hubung');
            return;
        }

        if (name.length < 1 || name.length > 200) {
            this.showFormError('Nama harus 1-200 karakter');
            return;
        }

        const buData = { code, name };

        try {
            const url = buId ? `${API_BASE_URL}/business-units/${buId}` : `${API_BASE_URL}/business-units`;
            const method = buId ? 'PUT' : 'POST';

            const response = await AuthUtils.authenticatedFetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(buData)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || data.error || 'Failed to save business unit');
            }

            this.showFormSuccess(buId ? 'Business unit berhasil diupdate' : 'Business unit berhasil ditambahkan');
            
            setTimeout(() => {
                this.hideBusinessUnitModal();
                this.loadBusinessUnits();
            }, 1500);
        } catch (error) {
            console.error('Error saving business unit:', error);
            this.showFormError(error.message || 'Gagal menyimpan business unit');
        }
    };

    MasterData.editBusinessUnit = async function(buId) {
        try {
            const response = await AuthUtils.authenticatedFetch(`${API_BASE_URL}/business-units/${buId}`);
            
            if (!response.ok) {
                throw new Error('Failed to load business unit');
            }

            const data = await response.json();
            this.showBusinessUnitModal(data.businessUnit || data);
        } catch (error) {
            console.error('Error loading business unit:', error);
            this.showError('Gagal memuat data business unit');
        }
    };

    MasterData.deleteBusinessUnit = function(buId) {
        this.currentDeleteId = buId;
        this.currentDeleteEntity = 'business-unit';
        
        const row = document.querySelector(`tr[data-id="${buId}"]`);
        const buName = row ? row.querySelector('td:nth-child(2)').textContent : '';
        
        document.getElementById('delete-bu-name').textContent = buName;
        document.getElementById('delete-modal').style.display = 'flex';
    };

    MasterData.confirmDeleteBusinessUnit = async function() {
        const buId = this.currentDeleteId;
        
        try {
            const response = await AuthUtils.authenticatedFetch(`${API_BASE_URL}/business-units/${buId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.message || data.error || 'Failed to delete business unit');
            }

            this.hideDeleteModal();
            this.showSuccess('Business unit berhasil dihapus');
            this.loadBusinessUnits();
        } catch (error) {
            console.error('Error deleting business unit:', error);
            this.showError(error.message || 'Gagal menghapus business unit');
        }
    };

    MasterData.showImportModal = function() {
        const modal = document.getElementById('import-modal');
        const form = document.getElementById('import-form');
        
        form.reset();
        document.getElementById('import-error').style.display = 'none';
        document.getElementById('import-success').style.display = 'none';

        modal.style.display = 'flex';
    };

    MasterData.hideImportModal = function() {
        document.getElementById('import-modal').style.display = 'none';
    };

    MasterData.importBusinessUnits = async function() {
        document.getElementById('import-error').style.display = 'none';
        document.getElementById('import-success').style.display = 'none';

        const fileInput = document.getElementById('import-file');
        const file = fileInput.files[0];

        if (!file) {
            document.getElementById('import-error').textContent = 'Pilih file Excel terlebih dahulu';
            document.getElementById('import-error').style.display = 'block';
            return;
        }

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await AuthUtils.authenticatedFetch(`${API_BASE_URL}/business-units/bulk-import`, {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || data.error || 'Failed to import business units');
            }

            document.getElementById('import-success').textContent = 
                `Import berhasil: ${data.imported || 0} business unit ditambahkan`;
            document.getElementById('import-success').style.display = 'block';
            
            setTimeout(() => {
                this.hideImportModal();
                this.loadBusinessUnits();
            }, 2000);
        } catch (error) {
            console.error('Error importing business units:', error);
            document.getElementById('import-error').textContent = error.message || 'Gagal import business unit';
            document.getElementById('import-error').style.display = 'block';
        }
    };

    MasterData.filterTable = function(searchTerm, tbodyId) {
        const rows = document.querySelectorAll(`#${tbodyId} tr`);
        const term = searchTerm.toLowerCase();

        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(term) ? '' : 'none';
        });
    };



    // ==================== Division Management ====================

    MasterData.initDivisions = function() {
        this.currentEntity = 'divisions';
        this.loadDivisions();
        this.loadBusinessUnitsForDropdown();
        this.setupDivisionEventHandlers();
    };

    MasterData.loadDivisions = async function() {
        try {
            const response = await AuthUtils.authenticatedFetch(`${API_BASE_URL}/divisions`);
            
            if (!response.ok) {
                throw new Error('Failed to load divisions');
            }

            const data = await response.json();
            this.renderDivisionsTable(data.divisions || data);
        } catch (error) {
            console.error('Error loading divisions:', error);
            this.showError('Gagal memuat data division');
        }
    };

    MasterData.loadBusinessUnitsForDropdown = async function() {
        try {
            const response = await AuthUtils.authenticatedFetch(`${API_BASE_URL}/business-units`);
            
            if (!response.ok) {
                throw new Error('Failed to load business units');
            }

            const data = await response.json();
            const businessUnits = data.businessUnits || data;
            
            const select = document.getElementById('business-unit');
            select.innerHTML = '<option value="">Pilih Business Unit</option>' +
                businessUnits.filter(bu => bu.isActive).map(bu => 
                    `<option value="${bu.businessUnitId}">${this.escapeHtml(bu.name)}</option>`
                ).join('');
        } catch (error) {
            console.error('Error loading business units:', error);
        }
    };

    MasterData.renderDivisionsTable = function(divisions) {
        const tbody = document.getElementById('division-tbody');
        
        if (!divisions || divisions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center">Tidak ada data</td></tr>';
            return;
        }

        tbody.innerHTML = divisions.map(div => `
            <tr data-id="${div.divisionId}">
                <td>${this.escapeHtml(div.code)}</td>
                <td>${this.escapeHtml(div.name)}</td>
                <td>${this.escapeHtml(div.businessUnitName || '-')}</td>
                <td>
                    <span class="badge ${div.isActive ? 'badge-success' : 'badge-danger'}">
                        ${div.isActive ? 'Aktif' : 'Nonaktif'}
                    </span>
                </td>
                <td>
                    <button class="btn btn-sm btn-primary edit-division-btn" data-id="${div.divisionId}">Edit</button>
                    <button class="btn btn-sm btn-danger delete-division-btn" data-id="${div.divisionId}">Hapus</button>
                </td>
            </tr>
        `).join('');

        this.attachDivisionRowHandlers();
    };

    MasterData.setupDivisionEventHandlers = function() {
        document.getElementById('add-division-btn').addEventListener('click', () => {
            this.showDivisionModal();
        });

        document.getElementById('bulk-import-btn').addEventListener('click', () => {
            this.showImportModal();
        });

        document.getElementById('search-input').addEventListener('input', (e) => {
            this.filterTable(e.target.value, 'division-tbody');
        });

        document.getElementById('modal-close').addEventListener('click', () => {
            this.hideDivisionModal();
        });

        document.getElementById('cancel-btn').addEventListener('click', () => {
            this.hideDivisionModal();
        });

        document.getElementById('division-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveDivision();
        });

        document.getElementById('import-modal-close').addEventListener('click', () => {
            this.hideImportModal();
        });

        document.getElementById('import-cancel-btn').addEventListener('click', () => {
            this.hideImportModal();
        });

        document.getElementById('import-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.importDivisions();
        });

        document.getElementById('delete-modal-close').addEventListener('click', () => {
            this.hideDeleteModal();
        });

        document.getElementById('delete-cancel-btn').addEventListener('click', () => {
            this.hideDeleteModal();
        });

        document.getElementById('delete-confirm-btn').addEventListener('click', () => {
            this.confirmDeleteDivision();
        });
    };

    MasterData.attachDivisionRowHandlers = function() {
        document.querySelectorAll('.edit-division-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const divisionId = e.target.dataset.id;
                this.editDivision(divisionId);
            });
        });

        document.querySelectorAll('.delete-division-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const divisionId = e.target.dataset.id;
                this.deleteDivision(divisionId);
            });
        });
    };

    MasterData.showDivisionModal = function(division = null) {
        const modal = document.getElementById('division-modal');
        const form = document.getElementById('division-form');
        const title = document.getElementById('modal-title');
        
        form.reset();
        this.hideFormMessages();

        if (division) {
            title.textContent = 'Edit Division';
            document.getElementById('division-id').value = division.divisionId;
            document.getElementById('business-unit').value = division.businessUnitId;
            document.getElementById('division-code').value = division.code;
            document.getElementById('division-code').disabled = true;
            document.getElementById('division-name').value = division.name;
        } else {
            title.textContent = 'Tambah Division';
            document.getElementById('division-id').value = '';
            document.getElementById('division-code').disabled = false;
        }

        modal.style.display = 'flex';
    };

    MasterData.hideDivisionModal = function() {
        document.getElementById('division-modal').style.display = 'none';
    };

    MasterData.saveDivision = async function() {
        this.hideFormMessages();

        const divisionId = document.getElementById('division-id').value;
        const businessUnitId = document.getElementById('business-unit').value;
        const code = document.getElementById('division-code').value.trim();
        const name = document.getElementById('division-name').value.trim();

        if (!businessUnitId || !code || !name) {
            this.showFormError('Semua field wajib diisi');
            return;
        }

        if (!/^[a-zA-Z0-9-]{2,20}$/.test(code)) {
            this.showFormError('Kode harus 2-20 karakter, hanya huruf, angka, dan tanda hubung');
            return;
        }

        if (name.length < 1 || name.length > 200) {
            this.showFormError('Nama harus 1-200 karakter');
            return;
        }

        const divisionData = { businessUnitId, code, name };

        try {
            const url = divisionId ? `${API_BASE_URL}/divisions/${divisionId}` : `${API_BASE_URL}/divisions`;
            const method = divisionId ? 'PUT' : 'POST';

            const response = await AuthUtils.authenticatedFetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(divisionData)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || data.error || 'Failed to save division');
            }

            this.showFormSuccess(divisionId ? 'Division berhasil diupdate' : 'Division berhasil ditambahkan');
            
            setTimeout(() => {
                this.hideDivisionModal();
                this.loadDivisions();
            }, 1500);
        } catch (error) {
            console.error('Error saving division:', error);
            this.showFormError(error.message || 'Gagal menyimpan division');
        }
    };

    MasterData.editDivision = async function(divisionId) {
        try {
            const response = await AuthUtils.authenticatedFetch(`${API_BASE_URL}/divisions/${divisionId}`);
            
            if (!response.ok) {
                throw new Error('Failed to load division');
            }

            const data = await response.json();
            this.showDivisionModal(data.division || data);
        } catch (error) {
            console.error('Error loading division:', error);
            this.showError('Gagal memuat data division');
        }
    };

    MasterData.deleteDivision = function(divisionId) {
        this.currentDeleteId = divisionId;
        this.currentDeleteEntity = 'division';
        
        const row = document.querySelector(`tr[data-id="${divisionId}"]`);
        const divisionName = row ? row.querySelector('td:nth-child(2)').textContent : '';
        
        document.getElementById('delete-division-name').textContent = divisionName;
        document.getElementById('delete-modal').style.display = 'flex';
    };

    MasterData.confirmDeleteDivision = async function() {
        const divisionId = this.currentDeleteId;
        
        try {
            const response = await AuthUtils.authenticatedFetch(`${API_BASE_URL}/divisions/${divisionId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.message || data.error || 'Failed to delete division');
            }

            this.hideDeleteModal();
            this.showSuccess('Division berhasil dihapus');
            this.loadDivisions();
        } catch (error) {
            console.error('Error deleting division:', error);
            this.showError(error.message || 'Gagal menghapus division');
        }
    };

    MasterData.importDivisions = async function() {
        document.getElementById('import-error').style.display = 'none';
        document.getElementById('import-success').style.display = 'none';

        const fileInput = document.getElementById('import-file');
        const file = fileInput.files[0];

        if (!file) {
            document.getElementById('import-error').textContent = 'Pilih file Excel terlebih dahulu';
            document.getElementById('import-error').style.display = 'block';
            return;
        }

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await AuthUtils.authenticatedFetch(`${API_BASE_URL}/divisions/bulk-import`, {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || data.error || 'Failed to import divisions');
            }

            document.getElementById('import-success').textContent = 
                `Import berhasil: ${data.imported || 0} division ditambahkan`;
            document.getElementById('import-success').style.display = 'block';
            
            setTimeout(() => {
                this.hideImportModal();
                this.loadDivisions();
            }, 2000);
        } catch (error) {
            console.error('Error importing divisions:', error);
            document.getElementById('import-error').textContent = error.message || 'Gagal import division';
            document.getElementById('import-error').style.display = 'block';
        }
    };



    // ==================== Department Management ====================

    MasterData.initDepartments = function() {
        this.currentEntity = 'departments';
        this.loadDepartments();
        this.loadBusinessUnitsForDropdown();
        this.setupDepartmentEventHandlers();
    };

    MasterData.loadDepartments = async function() {
        try {
            const response = await AuthUtils.authenticatedFetch(`${API_BASE_URL}/departments`);
            if (!response.ok) throw new Error('Failed to load departments');
            const data = await response.json();
            this.renderDepartmentsTable(data.departments || data);
        } catch (error) {
            console.error('Error loading departments:', error);
            this.showError('Gagal memuat data department');
        }
    };

    MasterData.renderDepartmentsTable = function(departments) {
        const tbody = document.getElementById('dept-tbody');
        if (!departments || departments.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">Tidak ada data</td></tr>';
            return;
        }
        tbody.innerHTML = departments.map(dept => `
            <tr data-id="${dept.departmentId}">
                <td>${this.escapeHtml(dept.code)}</td>
                <td>${this.escapeHtml(dept.name)}</td>
                <td>${this.escapeHtml(dept.divisionName || '-')}</td>
                <td>${this.escapeHtml(dept.businessUnitName || '-')}</td>
                <td><span class="badge ${dept.isActive ? 'badge-success' : 'badge-danger'}">${dept.isActive ? 'Aktif' : 'Nonaktif'}</span></td>
                <td>
                    <button class="btn btn-sm btn-primary edit-dept-btn" data-id="${dept.departmentId}">Edit</button>
                    <button class="btn btn-sm btn-danger delete-dept-btn" data-id="${dept.departmentId}">Hapus</button>
                </td>
            </tr>
        `).join('');
        this.attachDepartmentRowHandlers();
    };

    MasterData.setupDepartmentEventHandlers = function() {
        document.getElementById('add-dept-btn').addEventListener('click', () => this.showDepartmentModal());
        document.getElementById('bulk-import-btn').addEventListener('click', () => this.showImportModal());
        document.getElementById('search-input').addEventListener('input', (e) => this.filterTable(e.target.value, 'dept-tbody'));
        document.getElementById('modal-close').addEventListener('click', () => this.hideDepartmentModal());
        document.getElementById('cancel-btn').addEventListener('click', () => this.hideDepartmentModal());
        document.getElementById('dept-form').addEventListener('submit', (e) => { e.preventDefault(); this.saveDepartment(); });
        document.getElementById('import-modal-close').addEventListener('click', () => this.hideImportModal());
        document.getElementById('import-cancel-btn').addEventListener('click', () => this.hideImportModal());
        document.getElementById('import-form').addEventListener('submit', (e) => { e.preventDefault(); this.importDepartments(); });
        document.getElementById('delete-modal-close').addEventListener('click', () => this.hideDeleteModal());
        document.getElementById('delete-cancel-btn').addEventListener('click', () => this.hideDeleteModal());
        document.getElementById('delete-confirm-btn').addEventListener('click', () => this.confirmDeleteDepartment());
        
        // Cascading dropdown
        document.getElementById('business-unit').addEventListener('change', (e) => this.loadDivisionsForBU(e.target.value));
    };

    MasterData.loadDivisionsForBU = async function(businessUnitId) {
        const divisionSelect = document.getElementById('division');
        divisionSelect.innerHTML = '<option value="">Pilih Division</option>';
        if (!businessUnitId) return;
        
        try {
            const response = await AuthUtils.authenticatedFetch(`${API_BASE_URL}/divisions?businessUnitId=${businessUnitId}`);
            if (!response.ok) throw new Error('Failed to load divisions');
            const data = await response.json();
            const divisions = data.divisions || data;
            divisionSelect.innerHTML = '<option value="">Pilih Division</option>' +
                divisions.filter(d => d.isActive).map(d => `<option value="${d.divisionId}">${this.escapeHtml(d.name)}</option>`).join('');
        } catch (error) {
            console.error('Error loading divisions:', error);
        }
    };

    MasterData.attachDepartmentRowHandlers = function() {
        document.querySelectorAll('.edit-dept-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.editDepartment(e.target.dataset.id));
        });
        document.querySelectorAll('.delete-dept-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.deleteDepartment(e.target.dataset.id));
        });
    };

    MasterData.showDepartmentModal = function(dept = null) {
        const modal = document.getElementById('dept-modal');
        const form = document.getElementById('dept-form');
        const title = document.getElementById('modal-title');
        form.reset();
        this.hideFormMessages();
        
        if (dept) {
            title.textContent = 'Edit Department';
            document.getElementById('dept-id').value = dept.departmentId;
            document.getElementById('business-unit').value = dept.businessUnitId;
            this.loadDivisionsForBU(dept.businessUnitId).then(() => {
                document.getElementById('division').value = dept.divisionId;
            });
            document.getElementById('dept-code').value = dept.code;
            document.getElementById('dept-code').disabled = true;
            document.getElementById('dept-name').value = dept.name;
        } else {
            title.textContent = 'Tambah Department';
            document.getElementById('dept-id').value = '';
            document.getElementById('dept-code').disabled = false;
        }
        modal.style.display = 'flex';
    };

    MasterData.hideDepartmentModal = function() {
        document.getElementById('dept-modal').style.display = 'none';
    };

    MasterData.saveDepartment = async function() {
        this.hideFormMessages();
        const deptId = document.getElementById('dept-id').value;
        const divisionId = document.getElementById('division').value;
        const code = document.getElementById('dept-code').value.trim();
        const name = document.getElementById('dept-name').value.trim();

        if (!divisionId || !code || !name) {
            this.showFormError('Semua field wajib diisi');
            return;
        }
        if (!/^[a-zA-Z0-9-]{2,20}$/.test(code)) {
            this.showFormError('Kode harus 2-20 karakter, hanya huruf, angka, dan tanda hubung');
            return;
        }
        if (name.length < 1 || name.length > 200) {
            this.showFormError('Nama harus 1-200 karakter');
            return;
        }

        try {
            const url = deptId ? `${API_BASE_URL}/departments/${deptId}` : `${API_BASE_URL}/departments`;
            const response = await AuthUtils.authenticatedFetch(url, {
                method: deptId ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ divisionId, code, name })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || data.error || 'Failed to save department');
            this.showFormSuccess(deptId ? 'Department berhasil diupdate' : 'Department berhasil ditambahkan');
            setTimeout(() => { this.hideDepartmentModal(); this.loadDepartments(); }, 1500);
        } catch (error) {
            console.error('Error saving department:', error);
            this.showFormError(error.message || 'Gagal menyimpan department');
        }
    };

    MasterData.editDepartment = async function(deptId) {
        try {
            const response = await AuthUtils.authenticatedFetch(`${API_BASE_URL}/departments/${deptId}`);
            if (!response.ok) throw new Error('Failed to load department');
            const data = await response.json();
            this.showDepartmentModal(data.department || data);
        } catch (error) {
            console.error('Error loading department:', error);
            this.showError('Gagal memuat data department');
        }
    };

    MasterData.deleteDepartment = function(deptId) {
        this.currentDeleteId = deptId;
        this.currentDeleteEntity = 'department';
        const row = document.querySelector(`tr[data-id="${deptId}"]`);
        const deptName = row ? row.querySelector('td:nth-child(2)').textContent : '';
        document.getElementById('delete-dept-name').textContent = deptName;
        document.getElementById('delete-modal').style.display = 'flex';
    };

    MasterData.confirmDeleteDepartment = async function() {
        try {
            const response = await AuthUtils.authenticatedFetch(`${API_BASE_URL}/departments/${this.currentDeleteId}`, { method: 'DELETE' });
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.message || data.error || 'Failed to delete department');
            }
            this.hideDeleteModal();
            this.showSuccess('Department berhasil dihapus');
            this.loadDepartments();
        } catch (error) {
            console.error('Error deleting department:', error);
            this.showError(error.message || 'Gagal menghapus department');
        }
    };

    MasterData.importDepartments = async function() {
        document.getElementById('import-error').style.display = 'none';
        document.getElementById('import-success').style.display = 'none';
        const fileInput = document.getElementById('import-file');
        const file = fileInput.files[0];
        if (!file) {
            document.getElementById('import-error').textContent = 'Pilih file Excel terlebih dahulu';
            document.getElementById('import-error').style.display = 'block';
            return;
        }
        const formData = new FormData();
        formData.append('file', file);
        try {
            const response = await AuthUtils.authenticatedFetch(`${API_BASE_URL}/departments/bulk-import`, {
                method: 'POST',
                body: formData
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || data.error || 'Failed to import departments');
            document.getElementById('import-success').textContent = `Import berhasil: ${data.imported || 0} department ditambahkan`;
            document.getElementById('import-success').style.display = 'block';
            setTimeout(() => { this.hideImportModal(); this.loadDepartments(); }, 2000);
        } catch (error) {
            console.error('Error importing departments:', error);
            document.getElementById('import-error').textContent = error.message || 'Gagal import department';
            document.getElementById('import-error').style.display = 'block';
        }
    };



    // ==================== Function Management ====================

    MasterData.initFunctions = function() {
        this.currentEntity = 'functions';
        this.loadFunctions();
        this.setupFunctionEventHandlers();
    };

    MasterData.loadFunctions = async function() {
        try {
            const response = await AuthUtils.authenticatedFetch(`${API_BASE_URL}/functions`);
            if (!response.ok) throw new Error('Failed to load functions');
            const data = await response.json();
            this.renderFunctionsTable(data.functions || data);
        } catch (error) {
            console.error('Error loading functions:', error);
            this.showError('Gagal memuat data function');
        }
    };

    MasterData.renderFunctionsTable = function(functions) {
        const tbody = document.getElementById('function-tbody');
        if (!functions || functions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center">Tidak ada data</td></tr>';
            return;
        }
        tbody.innerHTML = functions.map(func => `
            <tr data-id="${func.functionId}">
                <td>${this.escapeHtml(func.code)}</td>
                <td>${this.escapeHtml(func.name)}</td>
                <td><span class="badge ${func.isActive ? 'badge-success' : 'badge-danger'}">${func.isActive ? 'Aktif' : 'Nonaktif'}</span></td>
                <td>
                    <button class="btn btn-sm btn-primary edit-function-btn" data-id="${func.functionId}">Edit</button>
                    <button class="btn btn-sm btn-danger delete-function-btn" data-id="${func.functionId}">Hapus</button>
                </td>
            </tr>
        `).join('');
        this.attachFunctionRowHandlers();
    };

    MasterData.setupFunctionEventHandlers = function() {
        document.getElementById('add-function-btn').addEventListener('click', () => this.showFunctionModal());
        document.getElementById('bulk-import-btn').addEventListener('click', () => this.showImportModal());
        document.getElementById('search-input').addEventListener('input', (e) => this.filterTable(e.target.value, 'function-tbody'));
        document.getElementById('modal-close').addEventListener('click', () => this.hideFunctionModal());
        document.getElementById('cancel-btn').addEventListener('click', () => this.hideFunctionModal());
        document.getElementById('function-form').addEventListener('submit', (e) => { e.preventDefault(); this.saveFunction(); });
        document.getElementById('import-modal-close').addEventListener('click', () => this.hideImportModal());
        document.getElementById('import-cancel-btn').addEventListener('click', () => this.hideImportModal());
        document.getElementById('import-form').addEventListener('submit', (e) => { e.preventDefault(); this.importFunctions(); });
        document.getElementById('delete-modal-close').addEventListener('click', () => this.hideDeleteModal());
        document.getElementById('delete-cancel-btn').addEventListener('click', () => this.hideDeleteModal());
        document.getElementById('delete-confirm-btn').addEventListener('click', () => this.confirmDeleteFunction());
    };

    MasterData.attachFunctionRowHandlers = function() {
        document.querySelectorAll('.edit-function-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.editFunction(e.target.dataset.id));
        });
        document.querySelectorAll('.delete-function-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.deleteFunction(e.target.dataset.id));
        });
    };

    MasterData.showFunctionModal = function(func = null) {
        const modal = document.getElementById('function-modal');
        const form = document.getElementById('function-form');
        const title = document.getElementById('modal-title');
        form.reset();
        this.hideFormMessages();
        
        if (func) {
            title.textContent = 'Edit Function';
            document.getElementById('function-id').value = func.functionId;
            document.getElementById('function-code').value = func.code;
            document.getElementById('function-code').disabled = true;
            document.getElementById('function-name').value = func.name;
        } else {
            title.textContent = 'Tambah Function';
            document.getElementById('function-id').value = '';
            document.getElementById('function-code').disabled = false;
        }
        modal.style.display = 'flex';
    };

    MasterData.hideFunctionModal = function() {
        document.getElementById('function-modal').style.display = 'none';
    };

    MasterData.saveFunction = async function() {
        this.hideFormMessages();
        const funcId = document.getElementById('function-id').value;
        const code = document.getElementById('function-code').value.trim();
        const name = document.getElementById('function-name').value.trim();

        if (!code || !name) {
            this.showFormError('Semua field wajib diisi');
            return;
        }
        if (!/^[a-zA-Z0-9-]{2,20}$/.test(code)) {
            this.showFormError('Kode harus 2-20 karakter, hanya huruf, angka, dan tanda hubung');
            return;
        }
        if (name.length < 1 || name.length > 200) {
            this.showFormError('Nama harus 1-200 karakter');
            return;
        }

        try {
            const url = funcId ? `${API_BASE_URL}/functions/${funcId}` : `${API_BASE_URL}/functions`;
            const response = await AuthUtils.authenticatedFetch(url, {
                method: funcId ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, name })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || data.error || 'Failed to save function');
            this.showFormSuccess(funcId ? 'Function berhasil diupdate' : 'Function berhasil ditambahkan');
            setTimeout(() => { this.hideFunctionModal(); this.loadFunctions(); }, 1500);
        } catch (error) {
            console.error('Error saving function:', error);
            this.showFormError(error.message || 'Gagal menyimpan function');
        }
    };

    MasterData.editFunction = async function(funcId) {
        try {
            const response = await AuthUtils.authenticatedFetch(`${API_BASE_URL}/functions/${funcId}`);
            if (!response.ok) throw new Error('Failed to load function');
            const data = await response.json();
            this.showFunctionModal(data.function || data);
        } catch (error) {
            console.error('Error loading function:', error);
            this.showError('Gagal memuat data function');
        }
    };

    MasterData.deleteFunction = function(funcId) {
        this.currentDeleteId = funcId;
        this.currentDeleteEntity = 'function';
        const row = document.querySelector(`tr[data-id="${funcId}"]`);
        const funcName = row ? row.querySelector('td:nth-child(2)').textContent : '';
        document.getElementById('delete-function-name').textContent = funcName;
        document.getElementById('delete-modal').style.display = 'flex';
    };

    MasterData.confirmDeleteFunction = async function() {
        try {
            const response = await AuthUtils.authenticatedFetch(`${API_BASE_URL}/functions/${this.currentDeleteId}`, { method: 'DELETE' });
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.message || data.error || 'Failed to delete function');
            }
            this.hideDeleteModal();
            this.showSuccess('Function berhasil dihapus');
            this.loadFunctions();
        } catch (error) {
            console.error('Error deleting function:', error);
            this.showError(error.message || 'Gagal menghapus function');
        }
    };

    MasterData.importFunctions = async function() {
        document.getElementById('import-error').style.display = 'none';
        document.getElementById('import-success').style.display = 'none';
        const fileInput = document.getElementById('import-file');
        const file = fileInput.files[0];
        if (!file) {
            document.getElementById('import-error').textContent = 'Pilih file Excel terlebih dahulu';
            document.getElementById('import-error').style.display = 'block';
            return;
        }
        const formData = new FormData();
        formData.append('file', file);
        try {
            const response = await AuthUtils.authenticatedFetch(`${API_BASE_URL}/functions/bulk-import`, {
                method: 'POST',
                body: formData
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || data.error || 'Failed to import functions');
            document.getElementById('import-success').textContent = `Import berhasil: ${data.imported || 0} function ditambahkan`;
            document.getElementById('import-success').style.display = 'block';
            setTimeout(() => { this.hideImportModal(); this.loadFunctions(); }, 2000);
        } catch (error) {
            console.error('Error importing functions:', error);
            document.getElementById('import-error').textContent = error.message || 'Gagal import function';
            document.getElementById('import-error').style.display = 'block';
        }
    };

    // ==================== Application Management ====================

    MasterData.initApplications = function() {
        this.currentEntity = 'applications';
        this.loadApplications();
        this.setupApplicationEventHandlers();
    };

    MasterData.loadApplications = async function() {
        try {
            const response = await AuthUtils.authenticatedFetch(`${API_BASE_URL}/applications`);
            if (!response.ok) throw new Error('Failed to load applications');
            const data = await response.json();
            this.renderApplicationsTable(data.applications || data);
        } catch (error) {
            console.error('Error loading applications:', error);
            this.showError('Gagal memuat data application');
        }
    };

    MasterData.renderApplicationsTable = function(applications) {
        const tbody = document.getElementById('app-tbody');
        if (!applications || applications.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center">Tidak ada data</td></tr>';
            return;
        }
        tbody.innerHTML = applications.map(app => `
            <tr data-id="${app.applicationId}">
                <td>${this.escapeHtml(app.code)}</td>
                <td>${this.escapeHtml(app.name)}</td>
                <td>${this.escapeHtml(app.description || '-')}</td>
                <td><span class="badge ${app.isActive ? 'badge-success' : 'badge-danger'}">${app.isActive ? 'Aktif' : 'Nonaktif'}</span></td>
                <td>
                    <button class="btn btn-sm btn-primary edit-app-btn" data-id="${app.applicationId}">Edit</button>
                    <button class="btn btn-sm btn-danger delete-app-btn" data-id="${app.applicationId}">Hapus</button>
                </td>
            </tr>
        `).join('');
        this.attachApplicationRowHandlers();
    };

    MasterData.setupApplicationEventHandlers = function() {
        document.getElementById('add-app-btn').addEventListener('click', () => this.showApplicationModal());
        document.getElementById('bulk-import-btn').addEventListener('click', () => this.showImportModal());
        document.getElementById('search-input').addEventListener('input', (e) => this.filterTable(e.target.value, 'app-tbody'));
        document.getElementById('modal-close').addEventListener('click', () => this.hideApplicationModal());
        document.getElementById('cancel-btn').addEventListener('click', () => this.hideApplicationModal());
        document.getElementById('app-form').addEventListener('submit', (e) => { e.preventDefault(); this.saveApplication(); });
        document.getElementById('import-modal-close').addEventListener('click', () => this.hideImportModal());
        document.getElementById('import-cancel-btn').addEventListener('click', () => this.hideImportModal());
        document.getElementById('import-form').addEventListener('submit', (e) => { e.preventDefault(); this.importApplications(); });
        document.getElementById('delete-modal-close').addEventListener('click', () => this.hideDeleteModal());
        document.getElementById('delete-cancel-btn').addEventListener('click', () => this.hideDeleteModal());
        document.getElementById('delete-confirm-btn').addEventListener('click', () => this.confirmDeleteApplication());
    };

    MasterData.attachApplicationRowHandlers = function() {
        document.querySelectorAll('.edit-app-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.editApplication(e.target.dataset.id));
        });
        document.querySelectorAll('.delete-app-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.deleteApplication(e.target.dataset.id));
        });
    };

    MasterData.showApplicationModal = function(app = null) {
        const modal = document.getElementById('app-modal');
        const form = document.getElementById('app-form');
        const title = document.getElementById('modal-title');
        form.reset();
        this.hideFormMessages();
        
        if (app) {
            title.textContent = 'Edit Application';
            document.getElementById('app-id').value = app.applicationId;
            document.getElementById('app-code').value = app.code;
            document.getElementById('app-code').disabled = true;
            document.getElementById('app-name').value = app.name;
            document.getElementById('app-description').value = app.description || '';
        } else {
            title.textContent = 'Tambah Application';
            document.getElementById('app-id').value = '';
            document.getElementById('app-code').disabled = false;
        }
        modal.style.display = 'flex';
    };

    MasterData.hideApplicationModal = function() {
        document.getElementById('app-modal').style.display = 'none';
    };

    MasterData.saveApplication = async function() {
        this.hideFormMessages();
        const appId = document.getElementById('app-id').value;
        const code = document.getElementById('app-code').value.trim();
        const name = document.getElementById('app-name').value.trim();
        const description = document.getElementById('app-description').value.trim();

        if (!code || !name) {
            this.showFormError('Kode dan nama wajib diisi');
            return;
        }
        if (!/^[a-zA-Z0-9-]{2,20}$/.test(code)) {
            this.showFormError('Kode harus 2-20 karakter, hanya huruf, angka, dan tanda hubung');
            return;
        }
        if (name.length < 1 || name.length > 200) {
            this.showFormError('Nama harus 1-200 karakter');
            return;
        }

        try {
            const url = appId ? `${API_BASE_URL}/applications/${appId}` : `${API_BASE_URL}/applications`;
            const response = await AuthUtils.authenticatedFetch(url, {
                method: appId ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, name, description })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || data.error || 'Failed to save application');
            this.showFormSuccess(appId ? 'Application berhasil diupdate' : 'Application berhasil ditambahkan');
            setTimeout(() => { this.hideApplicationModal(); this.loadApplications(); }, 1500);
        } catch (error) {
            console.error('Error saving application:', error);
            this.showFormError(error.message || 'Gagal menyimpan application');
        }
    };

    MasterData.editApplication = async function(appId) {
        try {
            const response = await AuthUtils.authenticatedFetch(`${API_BASE_URL}/applications/${appId}`);
            if (!response.ok) throw new Error('Failed to load application');
            const data = await response.json();
            this.showApplicationModal(data.application || data);
        } catch (error) {
            console.error('Error loading application:', error);
            this.showError('Gagal memuat data application');
        }
    };

    MasterData.deleteApplication = function(appId) {
        this.currentDeleteId = appId;
        this.currentDeleteEntity = 'application';
        const row = document.querySelector(`tr[data-id="${appId}"]`);
        const appName = row ? row.querySelector('td:nth-child(2)').textContent : '';
        document.getElementById('delete-app-name').textContent = appName;
        document.getElementById('delete-modal').style.display = 'flex';
    };

    MasterData.confirmDeleteApplication = async function() {
        try {
            const response = await AuthUtils.authenticatedFetch(`${API_BASE_URL}/applications/${this.currentDeleteId}`, { method: 'DELETE' });
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.message || data.error || 'Failed to delete application');
            }
            this.hideDeleteModal();
            this.showSuccess('Application berhasil dihapus');
            this.loadApplications();
        } catch (error) {
            console.error('Error deleting application:', error);
            this.showError(error.message || 'Gagal menghapus application');
        }
    };

    MasterData.importApplications = async function() {
        document.getElementById('import-error').style.display = 'none';
        document.getElementById('import-success').style.display = 'none';
        const fileInput = document.getElementById('import-file');
        const file = fileInput.files[0];
        if (!file) {
            document.getElementById('import-error').textContent = 'Pilih file Excel terlebih dahulu';
            document.getElementById('import-error').style.display = 'block';
            return;
        }
        const formData = new FormData();
        formData.append('file', file);
        try {
            const response = await AuthUtils.authenticatedFetch(`${API_BASE_URL}/applications/bulk-import`, {
                method: 'POST',
                body: formData
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || data.error || 'Failed to import applications');
            document.getElementById('import-success').textContent = `Import berhasil: ${data.imported || 0} application ditambahkan`;
            document.getElementById('import-success').style.display = 'block';
            setTimeout(() => { this.hideImportModal(); this.loadApplications(); }, 2000);
        } catch (error) {
            console.error('Error importing applications:', error);
            document.getElementById('import-error').textContent = error.message || 'Gagal import application';
            document.getElementById('import-error').style.display = 'block';
        }
    };

