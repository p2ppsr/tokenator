const { Authrite } = require('authrite-js')
const { getPublicKey, createHmac } = require('@babbage/sdk-ts')

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

  /**
   * Establish an initial socket connection to a room
   * The room ID is based on your identityKey and the messageBox
   * @param {string} messageBox 
   */
  async initializeConnection(messageBox) {
    // Configure the identity key
    if (!this.myIdentityKey) {
      if (!this.clientPrivateKey) {
        this.myIdentityKey = await getPublicKey({ identityKey: true })
      } else {
        this.myIdentityKey = this.authriteClient.clientPublicKey
      }
    }

    if (!this.authriteClient.socket) {
      await this.authriteClient.connect(this.peerServHost)

      // Wait until the connection response has been sent
      // TODO: Support a callback or similar function from the authrite side.
      await setTimeout(async () => {
        const roomId = `${this.myIdentityKey}-${messageBox}`
        if (!this.joinedRooms.some(x => x === roomId)) {
          await this.authriteClient.emit('joinRoom', roomId)
          this.joinedRooms.push(roomId)
        }
      }, 3000)
    }
  }

  /**
   * Start listening on your "public" message room
   * Anyone can send you a message here
   * @param {object} obj - all params given in an object
   * @param {function} obj.onMessage - onMessage handler function
   * @param {string} obj.messageBox - name of messageBox to listen on 
   */
  async listenForLiveMessages({ onMessage, messageBox }) {
    await this.initializeConnection(messageBox)

    this.authriteClient.on('sendMessage', async (payload) => {
      onMessage(payload.message)
      await this.acknowledgeMessage({ messageIds: [payload.message.messageId] })
    })
  }

  /**
   * Send a message over sockets, with a backup of messageBox delivery
   * @param {object} obj all params given in an object
   * @param {string} obj.message The message contents to send
   * @param {string} obj.messageBox The messageBox the message should be sent to depending on the protocol being used
   * @param {string} obj.recipient The identityKey of the intended recipient
   */
  async sendLiveMessage({ message, messageBox, recipient }) {
    await this.initializeConnection()

    // Send the message to the recipients message box first
    const result = await this.sendMessage({
      recipient,
      messageBox,
      body: message
    })

    const roomId = `${recipient}-${messageBox}`
    // Also send over sockets so they can receive it if they are online
    await this.authriteClient.emit('sendMessage', {
      roomId: roomId,
      message: {
        message,
        messageId: result.messageId
      }
    })
  }

  /**
   * Sends a message to a PeerServ recipient
   * @param {object} message The object containing the message params
   * @param {string} message.recipient The identityKey of the intended recipient
   * @param {string} message.messageBox The messageBox the message should be sent to depending on the protocol being used
   * @param {string | object} message.body The body of the message
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

    const hmac = await createHmac({ data: Buffer.from(JSON.stringify(message.body)), protocolID: `${message.messageBox} peerserv`, keyID: '1', counterparty: message.recipient })
    const messageId = Buffer.from(hmac).toString('hex')

    // Notify the token management server about the new token
    // Note: this structure for the message must be enforced, but the message body can conform to the specific protocol in use
    const response = await this.authriteClient.request(`${this.peerServHost}/sendMessage`, {
      body: {
        message: {
          recipient: message.recipient,
          messageBox: message.messageBox,
          messageId,
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
    return {
      ...parsedResponse,
      messageId
    }
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
