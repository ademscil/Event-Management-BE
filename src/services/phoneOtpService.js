const axios = require('axios');
const config = require('../config');
const logger = require('../config/logger');

class PhoneOtpService {
  constructor() {
    this.provider = String(config.phoneOtp?.provider || '').trim().toLowerCase();
  }

  normalizeChannel(channel) {
    return String(channel || '').trim().toLowerCase() === 'sms' ? 'sms' : 'whatsapp';
  }

  toE164(phoneNumber) {
    const digits = String(phoneNumber || '').replace(/\D/g, '');
    return digits ? `+${digits}` : '';
  }

  supportsProviderVerification() {
    return this.provider === 'twilio';
  }

  isConfigured(channel = 'sms') {
    const normalizedChannel = this.normalizeChannel(channel);

    if (this.provider === 'twilio') {
      return Boolean(
        config.phoneOtp?.twilio?.accountSid &&
        config.phoneOtp?.twilio?.authToken &&
        config.phoneOtp?.twilio?.verifyServiceSid
      );
    }

    if (this.provider === 'infobip') {
      if (!config.phoneOtp?.infobip?.baseUrl || !config.phoneOtp?.infobip?.apiKey) {
        return false;
      }

      if (normalizedChannel === 'whatsapp') {
        return Boolean(config.phoneOtp?.infobip?.whatsappSender);
      }

      return Boolean(config.phoneOtp?.infobip?.smsSender);
    }

    return false;
  }

  getTwilioClient() {
    return {
      accountSid: config.phoneOtp.twilio.accountSid,
      authToken: config.phoneOtp.twilio.authToken,
      verifyServiceSid: config.phoneOtp.twilio.verifyServiceSid,
    };
  }

  getInfobipClient() {
    return {
      baseUrl: String(config.phoneOtp.infobip.baseUrl || '').replace(/\/$/, ''),
      apiKey: config.phoneOtp.infobip.apiKey,
      smsSender: config.phoneOtp.infobip.smsSender,
      whatsappSender: config.phoneOtp.infobip.whatsappSender,
    };
  }

  async sendViaTwilioVerify(phoneNumber, channel) {
    const client = this.getTwilioClient();
    const response = await axios.post(
      `https://verify.twilio.com/v2/Services/${encodeURIComponent(client.verifyServiceSid)}/Verifications`,
      new URLSearchParams({
        To: this.toE164(phoneNumber),
        Channel: channel,
      }).toString(),
      {
        auth: {
          username: client.accountSid,
          password: client.authToken,
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 15000,
      }
    );

    return {
      success: true,
      sid: response.data?.sid || null,
      status: response.data?.status || 'pending',
      channel,
    };
  }

  async verifyViaTwilio(phoneNumber, code) {
    const client = this.getTwilioClient();
    const response = await axios.post(
      `https://verify.twilio.com/v2/Services/${encodeURIComponent(client.verifyServiceSid)}/VerificationCheck`,
      new URLSearchParams({
        To: this.toE164(phoneNumber),
        Code: String(code || '').trim(),
      }).toString(),
      {
        auth: {
          username: client.accountSid,
          password: client.authToken,
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 15000,
      }
    );

    return {
      success: String(response.data?.status || '').toLowerCase() === 'approved',
      status: response.data?.status || '',
    };
  }

  async sendViaInfobipSms(phoneNumber, code) {
    const client = this.getInfobipClient();
    const response = await axios.post(
      `${client.baseUrl}/sms/2/text/advanced`,
      {
        messages: [
          {
            from: client.smsSender,
            destinations: [{ to: this.toE164(phoneNumber) }],
            text: `Kode OTP reset password CSI Web App: ${code}. Berlaku 10 menit.`,
          },
        ],
      },
      {
        headers: {
          Authorization: `App ${client.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        timeout: 15000,
      }
    );

    const message = response.data?.messages?.[0] || {};
    return {
      success: true,
      status: message.status?.description || 'sent',
      messageId: message.messageId || null,
      channel: 'sms',
    };
  }

  async sendPasswordResetOtp(phoneNumber, channel, code = '') {
    const normalizedChannel = this.normalizeChannel(channel);

    if (!this.isConfigured(normalizedChannel)) {
      return {
        success: false,
        error: normalizedChannel === 'whatsapp'
          ? 'Channel WhatsApp OTP belum dikonfigurasi untuk provider saat ini.'
          : 'Channel OTP via phone belum dikonfigurasi.',
      };
    }

    try {
      if (this.provider === 'twilio') {
        return await this.sendViaTwilioVerify(phoneNumber, normalizedChannel);
      }

      if (this.provider === 'infobip') {
        if (normalizedChannel !== 'sms') {
          return {
            success: false,
            error: 'WhatsApp OTP belum tersedia pada konfigurasi Infobip trial saat ini. Gunakan SMS terlebih dahulu.',
          };
        }

        if (!String(code || '').trim()) {
          return {
            success: false,
            error: 'Kode OTP tidak tersedia untuk pengiriman SMS.',
          };
        }

        return await this.sendViaInfobipSms(phoneNumber, String(code || '').trim());
      }

      return {
        success: false,
        error: 'Provider OTP via phone belum didukung.',
      };
    } catch (error) {
      logger.error('Failed to send phone OTP', {
        provider: this.provider,
        channel: normalizedChannel,
        error: error?.response?.data || error.message,
      });
      return {
        success: false,
        error: 'Gagal mengirim OTP ke nomor tujuan.',
      };
    }
  }

  async verifyPasswordResetOtp(phoneNumber, channel, code) {
    const normalizedChannel = this.normalizeChannel(channel);

    if (!this.supportsProviderVerification()) {
      return {
        success: false,
        error: 'Provider OTP saat ini menggunakan verifikasi lokal aplikasi.',
      };
    }

    if (!this.isConfigured(normalizedChannel)) {
      return {
        success: false,
        error: 'Channel OTP via phone belum dikonfigurasi.',
      };
    }

    try {
      return await this.verifyViaTwilio(phoneNumber, code);
    } catch (error) {
      logger.warn('Failed to verify phone OTP', {
        provider: this.provider,
        channel: normalizedChannel,
        error: error?.response?.data || error.message,
      });
      return {
        success: false,
        error: 'OTP tidak valid atau sudah kedaluwarsa.',
      };
    }
  }
}

module.exports = new PhoneOtpService();
