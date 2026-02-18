const axios = require('axios');
const config = require('../config');
const logger = require('../config/logger');

/**
 * SAP Client Module
 * Handles HTTP communication with SAP REST/SOAP API
 * 
 * @module sapClient
 */

/**
 * @typedef {Object} SAPResponse
 * @property {boolean} success
 * @property {Object} data
 * @property {string} error
 */

/**
 * SAP Client class for API communication
 */
class SAPClient {
  constructor() {
    this.baseUrl = config.sap.apiUrl;
    this.apiKey = config.sap.apiKey;
    this.timeout = 30000; // 30 seconds
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1 second
    
    // Only create axios instance if not in test environment or if config is available
    if (this.baseUrl) {
      this._initializeClient();
    }
  }

  /**
   * Initialize axios client
   * @private
   */
  _initializeClient() {
    // Create axios instance with default configuration
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    // Add request interceptor for authentication
    this.client.interceptors.request.use(
      (config) => {
        if (this.apiKey) {
          config.headers['Authorization'] = `Bearer ${this.apiKey}`;
        }
        logger.debug(`SAP API Request: ${config.method.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        logger.error('SAP API Request Error:', error);
        return Promise.reject(error);
      }
    );

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => {
        logger.debug(`SAP API Response: ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        if (error.response) {
          logger.error(`SAP API Error Response: ${error.response.status} ${error.response.statusText}`);
        } else if (error.request) {
          logger.error('SAP API No Response:', error.message);
        } else {
          logger.error('SAP API Request Setup Error:', error.message);
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Make HTTP request with retry logic
   * @private
   * @param {string} method - HTTP method
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Request data
   * @param {number} retryCount - Current retry attempt
   * @returns {Promise<SAPResponse>}
   */
  async _makeRequest(method, endpoint, data = null, retryCount = 0) {
    try {
      // Initialize client if not already done
      if (!this.client) {
        this._initializeClient();
      }

      const config = {
        method,
        url: endpoint
      };

      if (data) {
        if (method.toLowerCase() === 'get') {
          config.params = data;
        } else {
          config.data = data;
        }
      }

      const response = await this.client.request(config);
      
      return {
        success: true,
        data: response.data,
        error: null
      };
    } catch (error) {
      // Check if we should retry
      if (retryCount < this.maxRetries && this._isRetryableError(error)) {
        logger.warn(`SAP API request failed, retrying (${retryCount + 1}/${this.maxRetries})...`);
        await this._delay(this.retryDelay * Math.pow(2, retryCount)); // Exponential backoff
        return this._makeRequest(method, endpoint, data, retryCount + 1);
      }

      // Extract error message
      let errorMessage = 'Unknown error';
      if (error.response) {
        errorMessage = error.response.data?.message || error.response.statusText || `HTTP ${error.response.status}`;
      } else if (error.request) {
        errorMessage = 'No response from SAP server';
      } else {
        errorMessage = error.message;
      }

      logger.error(`SAP API request failed after ${retryCount} retries: ${errorMessage}`);
      
      return {
        success: false,
        data: null,
        error: errorMessage
      };
    }
  }

  /**
   * Check if error is retryable
   * @private
   * @param {Error} error
   * @returns {boolean}
   */
  _isRetryableError(error) {
    // Retry on network errors or 5xx server errors
    if (!error.response) {
      return true; // Network error
    }
    
    const status = error.response.status;
    return status >= 500 && status < 600; // Server errors
  }

  /**
   * Delay helper for retry logic
   * @private
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise<void>}
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Fetch organizational data from SAP
   * @returns {Promise<SAPResponse>}
   */
  async fetchOrganizationalData() {
    logger.info('Fetching organizational data from SAP...');
    return this._makeRequest('GET', '/organizational-data');
  }

  /**
   * Fetch Business Units from SAP
   * @returns {Promise<SAPResponse>}
   */
  async fetchBusinessUnits() {
    logger.info('Fetching Business Units from SAP...');
    return this._makeRequest('GET', '/business-units');
  }

  /**
   * Fetch Divisions from SAP
   * @param {string} businessUnitCode - Optional BU code filter
   * @returns {Promise<SAPResponse>}
   */
  async fetchDivisions(businessUnitCode = null) {
    logger.info('Fetching Divisions from SAP...');
    const params = businessUnitCode ? { businessUnit: businessUnitCode } : null;
    return this._makeRequest('GET', '/divisions', params);
  }

  /**
   * Fetch Departments from SAP
   * @param {string} divisionCode - Optional division code filter
   * @returns {Promise<SAPResponse>}
   */
  async fetchDepartments(divisionCode = null) {
    logger.info('Fetching Departments from SAP...');
    const params = divisionCode ? { division: divisionCode } : null;
    return this._makeRequest('GET', '/departments', params);
  }

  /**
   * Test SAP connection
   * @returns {Promise<SAPResponse>}
   */
  async testConnection() {
    logger.info('Testing SAP connection...');
    return this._makeRequest('GET', '/health');
  }

  /**
   * Fetch all organizational data in one call (if SAP supports it)
   * @returns {Promise<SAPResponse>}
   */
  async fetchAllOrganizationalData() {
    logger.info('Fetching all organizational data from SAP...');
    return this._makeRequest('GET', '/organizational-data/all');
  }
}

// Export singleton instance
module.exports = new SAPClient();
