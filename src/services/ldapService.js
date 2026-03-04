const config = require('../config');
const logger = require('../config/logger');

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function extractXmlTag(xml, tag) {
  const regex = new RegExp(`<(?:\\w+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1].trim() : '';
}

/**
 * LDAP SOAP authentication service.
 * Uses endpoint LDapAuth.asmx -> ValidateLogin(UserID, PassID).
 */
class LDAPService {
  constructor() {
    this.config = config.ldap;
    this.authUrl = this.config.authUrl;
    this.timeoutMs = this.config.timeoutMs || 8000;
  }

  async callValidateLogin(username, password) {
    const body = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ValidateLogin xmlns="http://tempuri.org/">
      <UserID>${escapeXml(username)}</UserID>
      <PassID>${escapeXml(password)}</PassID>
    </ValidateLogin>
  </soap:Body>
</soap:Envelope>`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(this.authUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: '"http://tempuri.org/ValidateLogin"'
        },
        body,
        signal: controller.signal
      });

      const xml = await response.text();
      if (!response.ok) {
        return {
          success: false,
          authResult: false,
          authMessages: `LDAP endpoint HTTP ${response.status}`
        };
      }

      const authResultRaw = extractXmlTag(xml, 'AuthResult').toLowerCase();
      const authMessages = extractXmlTag(xml, 'AuthMessages');
      const authResult = authResultRaw === 'true';

      return {
        success: true,
        authResult,
        authMessages: authMessages || (authResult ? 'OK' : 'Invalid username or password')
      };
    } catch (error) {
      const isTimeout = error && error.name === 'AbortError';
      return {
        success: false,
        authResult: false,
        authMessages: isTimeout ? 'LDAP request timeout' : 'LDAP endpoint unreachable'
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Authenticate user against LDAP SOAP service.
   * @param {string} username
   * @param {string} password
   * @returns {Promise<{success:boolean,user:Object|null,errorMessage:string|null}>}
   */
  async authenticate(username, password) {
    if (!username || !password) {
      return {
        success: false,
        user: null,
        errorMessage: 'Username and password are required'
      };
    }

    try {
      logger.info(`LDAP SOAP authentication attempt for user: ${username}`);
      const result = await this.callValidateLogin(username, password);

      if (!result.success) {
        logger.warn(`LDAP SOAP authentication transport failure for user: ${username} - ${result.authMessages}`);
        return {
          success: false,
          user: null,
          errorMessage: result.authMessages || 'LDAP authentication failed'
        };
      }

      if (!result.authResult) {
        logger.warn(`LDAP SOAP authentication denied for user: ${username}`);
        return {
          success: false,
          user: null,
          errorMessage: result.authMessages || 'Invalid username or password'
        };
      }

      logger.info(`LDAP SOAP authentication successful for user: ${username}`);
      return {
        success: true,
        user: {
          username,
          displayName: username,
          email: '',
          dn: ''
        },
        errorMessage: null
      };
    } catch (error) {
      logger.error('LDAP SOAP authentication error:', error);
      return {
        success: false,
        user: null,
        errorMessage: 'LDAP authentication failed'
      };
    }
  }

  /**
   * Keep compatibility with callers expecting user attributes.
   * LDAP SOAP endpoint does not expose profile fields.
   */
  async getUserAttributes(username) {
    return {
      username,
      displayName: username,
      email: '',
      dn: ''
    };
  }
}

module.exports = new LDAPService();
