const Tokenator = require('../tokenator')

const STANDARD_EMAIL_MESSAGEBOX = 'email_inbox'

/**
 * Extends the Tokenator class to enable sending email messages
 * @param {object} obj All parameters are given in an object.
 * @param {String} [obj.peerServHost] The PeerServ host you want to connect to.
 * @param {String} [obj.clientPrivateKey] A private key to use for mutual authentication with Authrite. (Optional - Defaults to Babbage signing strategy).
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
   * Lists incoming emails from PeerServ
   * @returns {Array} of incoming emails from PeerServ
   */
  async listIncomingEmails () {
    // Use BabbageSDK or private key for signing strategy
    const response = await this.authriteClient.request(`${this.peerServHost}/listMessages`, {
      body: {
        messageBoxes: [STANDARD_EMAIL_MESSAGEBOX]
      },
      method: 'POST'
    })

    // Parse out and valid the response status
    const parsedResponse = JSON.parse(Buffer.from(response.body).toString('utf8'))
    if (parsedResponse.status === 'error') {
      const e = new Error(parsedResponse.description)
      e.code = parsedResponse.code
      throw e
    }
    return parsedResponse.messages
  }

  /**
   * Recieves email messages according to the standard protocol
   * @param {Object} obj An object containing the messageIds
   * @param {Array}  obj.messageIds An array of Numbers indicating which email message(s) to read
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
