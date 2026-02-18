/**
 * Authentication Module for CSI Portal
 * Handles login, logout, token management, and authentication utilities
 */

(function(window) {
    'use strict';

    // Configuration
    const API_BASE_URL = '/api/v1/auth';
    const TOKEN_KEY = 'csi_token';
    const REFRESH_TOKEN_KEY = 'csi_refresh_token';
    const USER_KEY = 'csi_user';

    /**
     * Safely parse JSON response body.
     * @param {Response} response
     * @returns {Promise<Object|null>}
     */
    async function tryParseJson(response) {
        try {
            return await response.json();
        } catch (error) {
            return null;
        }
    }

    /**
     * Convert API error payload to a readable message.
     * @param {Object|null} data
     * @param {string} fallback
     * @returns {string}
     */
    function extractErrorMessage(data, fallback) {
        if (!data) return fallback;
        if (data.message) return data.message;
        if (data.error && typeof data.error === 'string') return data.error;
        if (data.error && data.error.message) return data.error.message;
        if (Array.isArray(data.details) && data.details.length > 0) {
            return data.details.map(item => item.msg || item.message).filter(Boolean).join(', ');
        }
        return fallback;
    }

    /**
     * Auth namespace - Main authentication functions
     */
    const Auth = {
        /**
         * Login user with username and password
         * @param {string} username - User's username
         * @param {string} password - User's password
         * @returns {Promise<Object>} Login result with success flag and message
         */
        async login(username, password) {
            try {
                const response = await fetch(`${API_BASE_URL}/login`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ username, password })
                });

                const data = await tryParseJson(response);

                if (response.ok && data && data.success) {
                    // Store token and user info
                    localStorage.setItem(TOKEN_KEY, data.token);
                    localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
                    localStorage.setItem(USER_KEY, JSON.stringify(data.user));

                    return {
                        success: true,
                        user: data.user
                    };
                } else {
                    return {
                        success: false,
                        message: extractErrorMessage(data, 'Login failed')
                    };
                }
            } catch (error) {
                console.error('Login error:', error);
                return {
                    success: false,
                    message: 'Network error. Please check your connection and try again.'
                };
            }
        },

        /**
         * Logout current user
         * @returns {Promise<boolean>} Success status
         */
        async logout() {
            try {
                const token = this.getToken();
                
                if (token) {
                    // Call logout endpoint
                    await fetch(`${API_BASE_URL}/logout`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        }
                    });
                }
            } catch (error) {
                console.error('Logout error:', error);
            } finally {
                // Clear local storage regardless of API call result
                this.clearAuth();
            }

            return true;
        },

        /**
         * Validate current token
         * @returns {Promise<Object>} Validation result with valid flag and user data
         */
        async validateToken() {
            const token = this.getToken();
            
            if (!token) {
                return { valid: false };
            }

            try {
                const response = await fetch(`${API_BASE_URL}/validate`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (response.ok) {
                    const data = await response.json();
                    
                    if (data.valid && data.user) {
                        // Update user info in localStorage
                        localStorage.setItem(USER_KEY, JSON.stringify(data.user));
                        return { valid: true, user: data.user };
                    }
                }

                // Token is invalid, try to refresh
                return await this.refreshToken();
            } catch (error) {
                console.error('Token validation error:', error);
                return { valid: false };
            }
        },

        /**
         * Refresh authentication token
         * @returns {Promise<Object>} Refresh result with valid flag
         */
        async refreshToken() {
            const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
            
            if (!refreshToken) {
                return { valid: false };
            }

            try {
                const response = await fetch(`${API_BASE_URL}/refresh`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ refreshToken })
                });

                if (response.ok) {
                    const data = await tryParseJson(response);
                    
                    if (data && data.success) {
                        // Update tokens and user info
                        localStorage.setItem(TOKEN_KEY, data.token);
                        localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
                        localStorage.setItem(USER_KEY, JSON.stringify(data.user));
                        
                        return { valid: true, user: data.user };
                    }
                }

                // Refresh failed, clear auth
                this.clearAuth();
                return { valid: false };
            } catch (error) {
                console.error('Token refresh error:', error);
                this.clearAuth();
                return { valid: false };
            }
        },

        /**
         * Get stored authentication token
         * @returns {string|null} JWT token or null
         */
        getToken() {
            return localStorage.getItem(TOKEN_KEY);
        },

        /**
         * Get stored user information
         * @returns {Object|null} User object or null
         */
        getUser() {
            const userJson = localStorage.getItem(USER_KEY);
            if (userJson) {
                try {
                    return JSON.parse(userJson);
                } catch (error) {
                    console.error('Error parsing user data:', error);
                    return null;
                }
            }
            return null;
        },

        /**
         * Check if user is authenticated
         * @returns {boolean} True if authenticated
         */
        isAuthenticated() {
            return !!this.getToken();
        },

        /**
         * Clear all authentication data
         */
        clearAuth() {
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(REFRESH_TOKEN_KEY);
            localStorage.removeItem(USER_KEY);
        }
    };

    /**
     * AuthUtils namespace - Authentication utility functions
     */
    const AuthUtils = {
        /**
         * Check authentication and redirect if not authenticated
         * @param {string} redirectUrl - URL to redirect to if not authenticated (default: login)
         * @returns {Promise<Object|null>} User object if authenticated, null otherwise
         */
        async checkAuth(redirectUrl = 'login') {
            const result = await Auth.validateToken();
            
            if (!result.valid) {
                window.location.href = redirectUrl;
                return null;
            }
            
            return result.user;
        },

        /**
         * Redirect to login if not authenticated
         * Call this on page load for protected pages
         * @param {string} redirectUrl - URL to redirect to if not authenticated (default: login)
         * @returns {Promise<Object|null>} User object if authenticated
         */
        async redirectIfNotAuthenticated(redirectUrl = 'login') {
            return await this.checkAuth(redirectUrl);
        },

        /**
         * Check if user has specific role
         * @param {string} role - Role to check (SuperAdmin, AdminEvent, ITLead, DepartmentHead)
         * @returns {boolean} True if user has the role
         */
        hasRole(role) {
            const user = Auth.getUser();
            return user && user.role === role;
        },

        /**
         * Check if user has any of the specified roles
         * @param {string[]} roles - Array of roles to check
         * @returns {boolean} True if user has any of the roles
         */
        hasAnyRole(roles) {
            const user = Auth.getUser();
            return user && roles.includes(user.role);
        },

        /**
         * Check if user is Super Admin
         * @returns {boolean} True if user is Super Admin
         */
        isSuperAdmin() {
            return this.hasRole('SuperAdmin');
        },

        /**
         * Check if user is Admin Event
         * @returns {boolean} True if user is Admin Event
         */
        isAdminEvent() {
            return this.hasRole('AdminEvent');
        },

        /**
         * Check if user is IT Lead
         * @returns {boolean} True if user is IT Lead
         */
        isITLead() {
            return this.hasRole('ITLead');
        },

        /**
         * Check if user is Department Head
         * @returns {boolean} True if user is Department Head
         */
        isDepartmentHead() {
            return this.hasRole('DepartmentHead');
        },

        /**
         * Require specific role or redirect
         * @param {string|string[]} requiredRoles - Role(s) required to access the page
         * @param {string} redirectUrl - URL to redirect to if role check fails (default: dashboard)
         * @returns {boolean} True if user has required role
         */
        requireRole(requiredRoles, redirectUrl = 'dashboard') {
            const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
            
            if (!this.hasAnyRole(roles)) {
                window.location.href = redirectUrl;
                return false;
            }
            
            return true;
        },

        /**
         * Get user display name
         * @returns {string} User's display name or empty string
         */
        getUserDisplayName() {
            const user = Auth.getUser();
            return user ? user.displayName : '';
        },

        /**
         * Get user role display name in Indonesian
         * @returns {string} Role display name
         */
        getUserRoleDisplay() {
            const user = Auth.getUser();
            if (!user) return '';

            const roleMap = {
                'SuperAdmin': 'Super Admin',
                'AdminEvent': 'Admin Event',
                'ITLead': 'IT Lead',
                'DepartmentHead': 'Department Head'
            };

            return roleMap[user.role] || user.role;
        },

        /**
         * Make authenticated API request
         * @param {string} url - API endpoint URL
         * @param {Object} options - Fetch options
         * @returns {Promise<Response>} Fetch response
         */
        async authenticatedFetch(url, options = {}) {
            const token = Auth.getToken();
            
            if (!token) {
                throw new Error('No authentication token available');
            }

            const headers = {
                ...options.headers,
                'Authorization': `Bearer ${token}`
            };

            const response = await fetch(url, {
                ...options,
                headers
            });

            // If unauthorized, try to refresh token
            if (response.status === 401) {
                const refreshResult = await Auth.refreshToken();
                
                if (refreshResult.valid) {
                    // Retry request with new token
                    headers.Authorization = `Bearer ${Auth.getToken()}`;
                    return await fetch(url, {
                        ...options,
                        headers
                    });
                } else {
                    // Refresh failed, redirect to login
                    window.location.href = 'login';
                    throw new Error('Authentication expired');
                }
            }

            return response;
        }
    };

    // Expose to window
    window.Auth = Auth;
    window.AuthUtils = AuthUtils;

})(window);

