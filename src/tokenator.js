const { Authrite } = require('authrite-js')

class Tokenator {
  /**
   * Extendable client-side API for interacting with a PeerServ.
   *
   * @public
   * @param {object} obj All parameters are given in an object.
   * @param {String} [obj.peerServHost] The PeerServ host you want to connect to.
   * @param {String} [obj.clientPrivateKey] A private key to use for mutual authentication with Authrite. (Optional - Defaults to Babbage signing strategy).
   * @constructor
   */
  constructor ({
    peerServHost = 'https://staging-peerserv-ivi63c6zsq-uc.a.run.app',
    clientPrivateKey
  } = {}) {
    this.peerServHost = peerServHost
    this.clientPrivateKey = clientPrivateKey

    // Initialize an Authrite client to authenticate requests
    let authriteClient
    if (!this.clientPrivateKey) {
      authriteClient = new Authrite()
    } else {
      authriteClient = new Authrite({ clientPrivateKey: this.clientPrivateKey })
    }
    this.authriteClient = authriteClient
  }

  /**
   * Sends a message to a PeerServ recipient
   * @param {Object} message The object containing the message params
   * @param {string} message.recipient
   * @param {string} message.messageBox
   * @param {string} message.body
   * @returns {String} a success message as a string
   */
  async sendMessage (message) {
    // Validate the general message structure
    if (!message) {
      const e = new Error('You must provide a message to send!')
      e.code = 'ERR_MESSAGE_REQUIRED'
      throw e
    }
    if (!message.recipient) {
      const e = new Error('You must provide a message recipient!')
      e.code = 'ERR_MESSAGE_RECIPIENT_REQUIRED'
      throw e
    }
    if (!message.messageBox) {
      const e = new Error('You must provide a messageBox to send this message into!')
      e.code = 'ERR_MESSAGEBOX_REQUIRED'
      throw e
    }
    if (!message.body) {
      const e = new Error('Every message must have a body!')
      e.code = 'ERR_MESSAGE_BODY_REQUIRED'
      throw e
    }

    // Notify the token management server about the new token
    // Note: this structure for the message must be enforced, but the message body can conform to the specific protocol in use
    const response = await this.authriteClient.request(`${this.peerServHost}/sendMessage`, {
      body: {
        message: {
          recipient: message.recipient,
          messageBox: message.messageBox,
          body: JSON.stringify(message.body)
        }
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
    // Return the success message
    return parsedResponse.message
  }

  /**
   * Lists messages from PeerServ
   * @param {Array} [messageBoxes] An array of messageBoxes names given as strings (Optional)
   * If no messageBoxes are provided, all messageBoxes belonging to the current user will be selected from
   * @returns {Array} of matching messages returned from PeerServ
   */
  async listMessages ({ messageBoxes = [] } = {}) {
    // Use BabbageSDK or private key for signing strategy
    const response = await this.authriteClient.request(`${this.peerServHost}/listMessages`, {
      body: {
        messageBoxes
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
   * Receives messages from PeerServ
   * @param {Object} obj An object containing the messageIds
   * @param {Array}  obj.messageIds An array of Numbers indicating which message(s) to read
   * @returns {Array} of messages received from PeerServ
   */
  async readMessage ({ messageIds }) {
    // Make a read request to PeerServ over Authrite
    const response = await this.authriteClient.request(`${this.peerServHost}/readMessage`, {
      body: {
        messageIds
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
   * Acknowledges one or more messages as having been recieved ensuring deletion of the message(s)
   * @param {Object} obj An object containing the messageIds
   * @param {Array}  obj.messageIds An array of Numbers indicating which message(s) to acknowledge
   * @returns {Array} of messages formatted according to the particular protocol in use
   */
  async acknowledgeMessage ({ messageIds }) {
    // Make an acknowledgement request to PeerServ over Authrite
    const acknowledged = await this.authriteClient.request(`${this.peerServHost}/acknowledgeMessage`, {
      body: {
        messageIds
      },
      method: 'POST'
    })

    // Parse out and valid the response status
    const parsedAcknowledged = JSON.parse(Buffer.from(acknowledged.body).toString('utf8'))
    if (parsedAcknowledged.status === 'error') {
      const e = new Error(parsedAcknowledged.description)
      e.code = parsedAcknowledged.code
      throw e
    }
    return parsedAcknowledged.status
  }
}
module.exports = Tokenator
