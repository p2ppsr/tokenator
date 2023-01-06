const Tokenator = require('../tokenator')

const STANDARD_EMAIL_MESSAGEBOX = 'email_inbox'

/**
 * Extends the Tokenator class to enable sending email messages
 */
class EmailTokenator extends Tokenator {
  constructor ({
    peerServHost = 'https://staging-peerserv-ivi63c6zsq-uc.a.run.app',
    clientPrivateKey
  } = {}) {
    super({ peerServHost, clientPrivateKey })
  }

  /**
   * Creates a payment token to send in a message to PeerServ
   * @param {Object} message The email message to send
   * @param {String} message.recipient The recipient of this email
   * @param {String} message.subject The subject of the email
   * @param {String} message.body The body of the email message
   */
  async sendEmail (message) {
    const emailToken = {
      recipient: message.recipient,
      messageBox: STANDARD_EMAIL_MESSAGEBOX,
      body: {
        subject: message.subject,
        body: message.body
      }
    }
    await this.sendMessage(emailToken)
  }

  /**
   * Recieves email messages according to the standard protocol
   * @param {Object} obj An object containing the messageIds
   * @param {Array} messageIds An array of Numbers indicating which email message(s) to read
   * @returns {Array} An array of email messages
   */
  async receiveEmail ({ messageIds }) {
    const messages = await this.readMessage({ messageIds })
    const emails = messages.map(x => JSON.parse(x.body))

    // Acknowledge that the email message has been read
    await this.acknowledgeMessage({ messageIds })
    return emails
  }
}
module.exports = EmailTokenator
