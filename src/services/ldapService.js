const ldap = require('ldapjs');
const config = require('../config');
const logger = require('../config/logger');

/**
 * @typedef {Object} LDAPAuthResult
 * @property {boolean} success - Whether authentication was successful
 * @property {UserAttributes} user - User attributes from LDAP
 * @property {string} errorMessage - Error message if authentication failed
 */

/**
 * @typedef {Object} UserAttributes
 * @property {string} username - User's login name
 * @property {string} displayName - User's full display name
 * @property {string} email - User's email address
 * @property {string} dn - User's distinguished name
 */

/**
 * LDAP Service for user authentication and attribute retrieval
 */
class LDAPService {
  constructor() {
    this.config = config.ldap;
    this.maxRetries = 3;
    this.retryDelay = 1000; // milliseconds
  }

  /**
   * Create LDAP client with retry logic
   * @private
   * @returns {Promise<ldap.Client>}
   */
  async createClient() {
    return new Promise((resolve, reject) => {
      const client = ldap.createClient({
        url: this.config.url,
        timeout: 5000,
        connectTimeout: 10000,
        reconnect: true
      });

      client.on('error', (err) => {
        logger.error('LDAP client error:', err);
      });

      resolve(client);
    });
  }

  /**
   * Bind to LDAP server with credentials
   * @private
   * @param {ldap.Client} client - LDAP client
   * @param {string} dn - Distinguished name
   * @param {string} password - Password
   * @returns {Promise<void>}
   */
  async bind(client, dn, password) {
    return new Promise((resolve, reject) => {
      client.bind(dn, password, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Search for user in LDAP directory
   * @private
   * @param {ldap.Client} client - LDAP client
   * @param {string} username - Username to search for
   * @returns {Promise<Object>}
   */
  async searchUser(client, username) {
    return new Promise((resolve, reject) => {
      const searchOptions = {
        filter: `(uid=${username})`,
        scope: 'sub',
        attributes: ['uid', 'cn', 'displayName', 'mail', 'email', 'dn']
      };

      client.search(this.config.baseDN, searchOptions, (err, res) => {
        if (err) {
          return reject(err);
        }

        let userEntry = null;

        res.on('searchEntry', (entry) => {
          userEntry = entry.object;
        });

        res.on('error', (err) => {
          reject(err);
        });

        res.on('end', (result) => {
          if (result.status !== 0) {
            reject(new Error(`LDAP search failed with status: ${result.status}`));
          } else if (!userEntry) {
            reject(new Error('User not found'));
          } else {
            resolve(userEntry);
          }
        });
      });
    });
  }

  /**
   * Authenticate user with LDAP credentials
   * @param {string} username - User's login name
   * @param {string} password - User's password
   * @returns {Promise<LDAPAuthResult>}
   */
  async authenticate(username, password) {
    let attempt = 0;
    let lastError = null;

    // Validate inputs
    if (!username || !password) {
      return {
        success: false,
        user: null,
        errorMessage: 'Username and password are required'
      };
    }

    // Retry logic for transient failures
    while (attempt < this.maxRetries) {
      attempt++;
      let client = null;

      try {
        logger.info(`LDAP authentication attempt ${attempt} for user: ${username}`);

        // Create LDAP client
        client = await this.createClient();

        // First, bind with service account to search for user
        await this.bind(client, this.config.bindDN, this.config.bindPassword);

        // Search for user
        const userEntry = await this.searchUser(client, username);

        // Unbind service account
        client.unbind();

        // Create new client for user authentication
        client = await this.createClient();

        // Try to bind with user credentials
        await this.bind(client, userEntry.dn, password);

        // Get user attributes
        const userAttributes = await this.getUserAttributes(username);

        // Unbind user
        client.unbind();

        logger.info(`LDAP authentication successful for user: ${username}`);

        return {
          success: true,
          user: userAttributes,
          errorMessage: null
        };

      } catch (error) {
        lastError = error;
        logger.warn(`LDAP authentication attempt ${attempt} failed for user ${username}:`, error.message);

        // Close client if still connected
        if (client) {
          try {
            client.unbind();
          } catch (unbindError) {
            // Ignore unbind errors
          }
        }

        // Check if error is retryable
        const isRetryable = error.message.includes('timeout') || 
                           error.message.includes('ECONNREFUSED') ||
                           error.message.includes('ENOTFOUND');

        if (!isRetryable || attempt >= this.maxRetries) {
          break;
        }

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
      }
    }

    // All attempts failed
    logger.error(`LDAP authentication failed for user ${username} after ${attempt} attempts:`, lastError.message);

    // Determine error message
    let errorMessage = 'Authentication failed';
    if (lastError.message.includes('Invalid Credentials')) {
      errorMessage = 'Invalid username or password';
    } else if (lastError.message.includes('User not found')) {
      errorMessage = 'User not found';
    } else if (lastError.message.includes('timeout') || lastError.message.includes('ECONNREFUSED')) {
      errorMessage = 'LDAP server unavailable, please try again later';
    }

    return {
      success: false,
      user: null,
      errorMessage
    };
  }

  /**
   * Get user attributes from LDAP
   * @param {string} username - User's login name
   * @returns {Promise<UserAttributes>}
   */
  async getUserAttributes(username) {
    let client = null;

    try {
      // Create LDAP client
      client = await this.createClient();

      // Bind with service account
      await this.bind(client, this.config.bindDN, this.config.bindPassword);

      // Search for user
      const userEntry = await this.searchUser(client, username);

      // Unbind
      client.unbind();

      // Extract and normalize attributes
      return {
        username: userEntry.uid || username,
        displayName: userEntry.displayName || userEntry.cn || username,
        email: userEntry.mail || userEntry.email || '',
        dn: userEntry.dn
      };

    } catch (error) {
      logger.error(`Failed to get user attributes for ${username}:`, error.message);

      // Close client if still connected
      if (client) {
        try {
          client.unbind();
        } catch (unbindError) {
          // Ignore unbind errors
        }
      }

      throw new Error(`Failed to retrieve user attributes: ${error.message}`);
    }
  }
}

// Export singleton instance
module.exports = new LDAPService();
