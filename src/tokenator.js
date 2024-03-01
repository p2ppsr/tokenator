const { Authrite } = require('authrite-js')
const { getPublicKey } = require('@babbage/sdk-ts')

/**
   * Defines the structure of a PeerServ Message
   * @typedef {Object} PeerServMessage
   * @property {Number} messageId - identifies a particular message
   * @property {String} body - the body of the message (may be a stringified object)
   * @property {String} sender - the identityKey of the sender
   * @property {String} created_at - message creation timestamp as a string
   * @property {String} updated_at - message update timestamp as a string
   */

/**
   * Extendable class for interacting with a PeerServ
   * @param {object} [obj] All parameters are given in an object
   * @param {String} [obj.peerServHost] The PeerServ host you want to connect to
   * @param {String} [obj.clientPrivateKey] A private key to use for mutual authentication with Authrite. (Defaults to Babbage signing strategy)
   */
class Tokenator {
  constructor({
    peerServHost = 'https://staging-peerserv.babbage.systems',
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
    this.joinedRooms = []
  }

  async initializeConnection() {
    // Configure the identity key
    if (!this.myIdentityKey) {
      if (!this.clientPrivateKey) {
        this.myIdentityKey = await getPublicKey({ identityKey: true })
      } else {
        this.myIdentityKey = this.authriteClient.clientPublicKey
      }
    }

    if (!this.io) {
      this.io = await this.authriteClient.connect(this.peerServHost)

      // let roomId
      // if (!recipient) {
      //   roomId = `${recipient}-${messageBox}`
      // }
      // roomId = `${this.myIdentityKey}-${messageBox}`
    }
  }

  async listenForLiveMessages({ onMessage }) {
    await this.initializeConnection()
    // Setup an event handler for receiving messages
    this.io.on('sendMessage', onMessage)
  }

  async sendLiveMessage({ message, messageBox, recipient }) {
    await this.initializeConnection()

    // Join a room
    const roomId = `${recipient}-${messageBox}`

    if (!this.joinedRooms.some(x => x === roomId)) {
      await this.io.emit('joinRoom', roomId)
      this.joinedRooms.push(roomId)
    }

    // Send a message to the server to get a response
    await this.io.emit('sendMessage', { room: roomId, text: message })
  }

  /**
   * Sends a message to a PeerServ recipient
   * @param {Object} message The object containing the message params
   * @param {string} message.recipient The identityKey of the intended recipient
   * @param {string} message.messageBox The messageBox the message should be sent to depending on the protocol being used
   * @param {string} message.body The body of the message
   * @returns {String} status message
   */
  async sendMessage(message) {
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
   * @param {Object} obj An object containing the messageBox
   * @param {Array}  obj.messageBox The name of the messageBox to list messages from
   * @returns {Array<PeerServMessage>} of matching messages returned from PeerServ
   */
  async listMessages({ messageBox }) {
    // Use BabbageSDK or private key for signing strategy
    const response = await this.authriteClient.request(`${this.peerServHost}/listMessages`, {
      body: {
        messageBox
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
  async acknowledgeMessage({ messageIds }) {
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

  xorPublicKeys(hex1, hex2) {
    // Ensure both hex strings are of equal length
    if (hex1.length !== hex2.length) {
      throw new Error('Hex strings must be of the same length')
    }

    let result = ''

    // Iterate over each hex character pair (byte)
    for (let i = 0; i < hex1.length; i += 2) {
      // Extract a byte from each hex string and convert to a number
      const byte1 = parseInt(hex1.substr(i, 2), 16)
      const byte2 = parseInt(hex2.substr(i, 2), 16)

      // XOR the bytes and convert back to a hex string
      let xorResult = (byte1 ^ byte2).toString(16)

      // Pad single-digit hex numbers with a leading 0
      xorResult = xorResult.padStart(2, '0')

      // Append the result to the output string
      result += xorResult
    }

    return result
  }
}
module.exports = Tokenator
