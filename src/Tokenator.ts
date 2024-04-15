import { Authrite } from 'authrite-js'
import { getPublicKey, createHmac } from '@babbage/sdk-ts'

/**
   * Extendable class for interacting with a PeerServ
   * @param {object} [obj] All parameters are given in an object
   * @param {String} [obj.peerServHost] The PeerServ host you want to connect to
   * @param {String} [obj.clientPrivateKey] A private key to use for mutual authentication with Authrite. (Defaults to Babbage signing strategy)
   */
export class Tokenator {
  private peerServHost: string
  private clientPrivateKey?: string
  private authriteClient: Authrite
  private joinedRooms: string[]
  private myIdentityKey?: string

  constructor({
    peerServHost = 'https://staging-peerserv.babbage.systems',
    clientPrivateKey
  }: TokenatorConfig = {}) {
    this.peerServHost = peerServHost
    this.clientPrivateKey = clientPrivateKey
    this.authriteClient = new Authrite(clientPrivateKey ? { clientPrivateKey } : undefined)
    this.joinedRooms = []
  }

  /**
   * Establish an initial socket connection to a room
   * The room ID is based on your identityKey and the messageBox
   * @param {string} messageBox
   */
  async initializeConnection(messageBox: string): Promise<string> {
    if (!this.myIdentityKey) {
      this.myIdentityKey = this.clientPrivateKey ? this.authriteClient.clientPublicKey : await getPublicKey({ identityKey: true })
    }

    if (!this.authriteClient.socket) {
      await this.authriteClient.connect(this.peerServHost)
    }

    const roomId = `${this.myIdentityKey}-${messageBox}`
    if (!this.joinedRooms.some(x => x === roomId)) {
      await this.authriteClient.emit('joinRoom', roomId)
      this.joinedRooms.push(roomId)
    }
    return roomId
  }

  /**
   * Start listening on your "public" message room
   * Anyone can send you a message here
   * @param {object} obj - all params given in an object
   * @param {function} obj.onMessage - onMessage handler function
   * @param {string} obj.messageBox - name of messageBox to listen on 
   * @param {boolean} obj.autoAcknowledge - determines if live messages should be automatically acknowledged and deleted from the server. 
   */
  async listenForLiveMessages({ onMessage, messageBox, autoAcknowledge = true }: MessageParams): Promise<void> {
    const roomId = await this.initializeConnection(messageBox)
    this.authriteClient.on(`sendMessage-${roomId}`, async (message: PeerServMessage) => {
      onMessage(message)
      if (autoAcknowledge) {
        await this.acknowledgeMessage({ messageIds: [message.messageId] })
      }
    })
  }

  /**
   * Send a message over sockets, with a backup of messageBox delivery
   * @param {object} obj all params given in an object
   * @param {string} obj.message The message contents to send
   * @param {string} obj.messageBox The messageBox the message should be sent to depending on the protocol being used
   * @param {string} obj.recipient The identityKey of the intended recipient
   */
  async sendLiveMessage({ body, messageBox, recipient }: SendMessageParams): Promise<void> {
    await this.initializeConnection(messageBox)
    const roomId = `${recipient}-${messageBox}`
    const hmac = await createHmac({ data: Buffer.from(JSON.stringify(body)), protocolID: [0, 'PeerServ'], keyID: '1', counterparty: recipient })
    const messageId = Buffer.from(hmac).toString('hex')

    await this.authriteClient.emit('sendMessage', {
      roomId: roomId,
      message: {
        body,
        messageId
      }
    })

    await this.sendMessage({
      recipient,
      messageBox,
      body
    })
  }

  /**
  * Sends a message to a PeerServ recipient
  * @param {object} message The object containing the message params
  * @param {string} message.recipient The identityKey of the intended recipient
  * @param {string} message.messageBox The messageBox the message should be sent to depending on the protocol being used
  * @param {string | object} message.body The body of the message
  * @param {string} [message.messageId] Optional messageId to be used for the message to send
  * @returns {String} status message
  */
  async sendMessage(message: Message): Promise<{ status: string, messageId: string }> {
    if (!message) {
      throw new Error('You must provide a message to send!')
    }

    if (!message.messageId) {
      const hmac = await createHmac({ data: Buffer.from(JSON.stringify(message.body)), protocolID: [0, 'PeerServ'], keyID: '1', counterparty: message.recipient })
      message.messageId = Buffer.from(hmac).toString('hex')
    }

    const response = await this.authriteClient.request(`${this.peerServHost}/sendMessage`, {
      body: {
        message: {
          recipient: message.recipient,
          messageBox: message.messageBox,
          messageId: message.messageId,
          body: JSON.stringify(message.body)
        }
      },
      method: 'POST'
    })
    const parsedResponse = JSON.parse(Buffer.from(response.body).toString('utf8'))
    if (parsedResponse.status === 'error') {
      throw new Error(parsedResponse.description)
    }
    return {
      ...parsedResponse,
      messageId: message.messageId
    }
  }

  /**
   * Lists messages from PeerServ
   * @param {Object} obj An object containing the messageBox
   * @param {Array}  obj.messageBox The name of the messageBox to list messages from
   * @returns {Array<PeerServMessage>} of matching messages returned from PeerServ
   */
  async listMessages({ messageBox }: MessageBox): Promise<PeerServMessage[]> {
    const response = await this.authriteClient.request(`${this.peerServHost}/listMessages`, {
      body: { messageBox },
      method: 'POST'
    })
    const parsedResponse = JSON.parse(Buffer.from(response.body).toString('utf8'))
    if (parsedResponse.status === 'error') {
      throw new Error(parsedResponse.description)
    }
    return parsedResponse.messages
  }

  /**
  * Acknowledges one or more messages as having been received ensuring deletion of the message(s)
  * @param {Object} obj An object containing the messageIds
  * @param {Array}  obj.messageIds An array of Numbers indicating which message(s) to acknowledge
  * @returns {Array} of messages formatted according to the particular protocol in use
  */
  async acknowledgeMessage({ messageIds }: AcknowledgeMessageParams): Promise<string> {
    const acknowledged = await this.authriteClient.request(`${this.peerServHost}/acknowledgeMessage`, {
      body: { messageIds },
      method: 'POST'
    })
    const parsedAcknowledged = JSON.parse(Buffer.from(acknowledged.body).toString('utf8'))
    if (parsedAcknowledged.status === 'error') {
      throw new Error(parsedAcknowledged.description)
    }
    return parsedAcknowledged.status
  }
}