const BabbageSDK = require('@babbage/sdk')
const { Authrite } = require('authrite-js')
const Ninja = require('utxoninja')
const bsv = require('babbage-bsv')

class Tokenator {
  /**
   * Client-side API for establishing authenticated server communication
   * @public
   * @param {object} tokenator All parameters are given in an object.
   * @param {String} tokenator.peerServHost The PeerServ host you want to connect to
   * @param {String} tokenator.clientPrivateKey (Optional) your private key to use for recieving funds. (Defaults to BabbageDesktop signing strategy)
   * @constructor
   */
  constructor ({
    peerServHost = 'https://staging-peerserv-ivi63c6zsq-uc.a.run.app',
    clientPrivateKey
  } = {}) {
    this.peerServHost = peerServHost
    this.clientPrivateKey = clientPrivateKey
  }

  /**
   * Sends a message to a PeerServ recipient
   * @param {Object} message
   * @returns Returns a success or fail status
   */
  async sendMessage (message) {
    // Validate the general message structure
    if (!message) {
      const e = new Error('You must provide a message to send!')
      e.code = 'ERR_MESSAGE_REQUIRED'
      throw e
    }

    if (!message.messageBox) {
      const e = new Error('Please provide a messageBox to send this message into!')
      e.code = 'ERR_MESSAGEBOX_REQUIRED'
      throw e
    }

    if (!message.recipient) {
      const e = new Error('You must specify the message recipient!')
      e.code = 'ERR_MESSAGE_RECIPIENT_REQUIRED'
      throw e
    }

    // Define a template message body to send.
    // This can be customized depending on the message protocol type
    const messageBody = {}

    // Determine what type of message this is
    if (message.messageBox) {
    // Derive a new public key for the recipient
      const derivationPrefix = require('crypto')
        .randomBytes(10)
        .toString('base64')
      const derivationSuffix = require('crypto')
        .randomBytes(10)
        .toString('base64')
      const derivedPublicKey = await BabbageSDK.getPublicKey({
        protocolID: [2, '3241645161d8'],
        keyID: `${derivationPrefix} ${derivationSuffix}`,
        counterparty: message.recipient
      })

      // Create a P2PK Bitcoin script
      const script = new bsv.Script(
        bsv.Script.fromAddress(bsv.Address.fromPublicKey(
          bsv.PublicKey.fromString(derivedPublicKey)
        ))
      ).toHex()

      // Create a new Bitcoin transaction
      const payment = await BabbageSDK.createAction({
        description: 'Tokenator payment',
        outputs: [{ script, satoshis: message.amount }]
      })

      message.body = {
        derivationPrefix,
        transaction: {
          ...payment,
          outputs: [{ vout: 0, satoshis: message.amount, derivationSuffix }]
        },
        amount: message.amount
      }
    } else {
      const e = new Error('Your message type is not currently supported!')
      e.code = 'ERR_UNSUPPORTED_MESSAGE_TYPE'
      throw e
    }
    // Notify the token management server about the new token
    // Note: this structure for the message must be enforced, but the message body can conform to the specific protocol
    await new Authrite().request(`${this.peerServHost}/sendMessage`, {
      body: {
        message: {
          recipient: message.recipient, // Should this be the derived public key?
          messageBox: message.messageBox,
          body: JSON.stringify(message.body)
        }
      },
      method: 'POST'
    })

    console.log('Token created' + JSON.stringify(message))
  }

  // /**
  //  * Receive and process messages from PeerServ
  //  * @param {Array} messageTypes the types of messages to fetch
  //  * @returns {Array} messages received from PeerServ
  //  */
  // async receiveMessages (messageTypes) {
  //   // Receive and process the new token(s) into a basket
  //   // Use BabbageSDK or private key for signing strategy
  //   let authriteClient
  //   if (!this.clientPrivateKey) {
  //     authriteClient = new Authrite()
  //   } else {
  //     authriteClient = new Authrite({ clientPrivateKey: this.clientPrivateKey })
  //   }
  //   const response = await authriteClient.request(`${this.peerServHost}/checkMessages`, {
  //     body: {
  //       filterBy: {
  //         messageBoxTypes: messageTypes
  //       },
  //       isReceiving: true
  //     },
  //     method: 'POST'
  //   })

  //   // Parse out the messages
  //   const messages = JSON.parse(Buffer.from(response.body).toString('utf8')).messages
  //   console.log(messages)

  //   // TODO: validate token contents etc.
  //   const tokens = messages.map(x => JSON.parse(x.body))

  //   // Figure out what the signing strategy should be
  //   // Note: This should probably be refactored to be part of Ninja
  //   const getLib = () => {
  //     if (!this.clientPrivateKey) {
  //       return BabbageSDK
  //     }
  //     const ninja = new Ninja({
  //       privateKey: this.clientPrivateKey,
  //       config: {
  //         dojoURL: 'https://staging-dojo.babbage.systems'
  //       }
  //     })
  //     return ninja
  //   }

  //   const paymentsReceived = []
  //   for (const [i, message] of messages.entries()) {
  //     try {
  //       const paymentResult = await getLib().submitDirectTransaction({
  //         protocol: '3241645161d8',
  //         senderIdentityKey: message.sender,
  //         note: 'PeerServ payment',
  //         amount: message.amount,
  //         derivationPrefix: tokens[i].derivationPrefix,
  //         transaction: tokens[i].transaction
  //       })
  //       if (paymentResult.status !== 'success') {
  //         throw new Error('Payment not processed')
  //       }
  //       paymentsReceived.push(paymentResult)
  //     } catch (e) {
  //       console.log(`Error: ${e}`)
  //     }
  //   }
  //   return paymentsReceived
  // }

  /**
   * List messages from PeerServ
   * @param {Array} messageTypes the types of messages to fetch
   * @param {Boolean} acknowledged specifies if acknowledged or unacknowledged messages should be returned
   * @returns {Array} messages received from PeerServ
   */
  async listMessages ({ messageBoxes = [] } = {}) {
    // Use BabbageSDK or private key for signing strategy
    let authriteClient
    if (!this.clientPrivateKey) {
      authriteClient = new Authrite()
    } else {
      authriteClient = new Authrite({ clientPrivateKey: this.clientPrivateKey })
    }
    const response = await authriteClient.request(`${this.peerServHost}/listMessages`, {
      body: {
        messageBoxes
      },
      method: 'POST'
    })

    const parsedResponse = JSON.parse(Buffer.from(response.body).toString('utf8'))
    if (parsedResponse.status === 'error') {
      const e = new Error(parsedResponse.description)
      e.code = '?'
      throw e
    }
    return parsedResponse.messages
  }

  /**
   * Receive and process messages from PeerServ
   * @param {Array} messageIds the messages to read
   * @returns {Array} messages received from PeerServ
   */
  async readMessage ({ messageIds }) {
    // Receive and process the new token(s) into a basket
    // Use BabbageSDK or private key for signing strategy
    let authriteClient
    if (!this.clientPrivateKey) {
      authriteClient = new Authrite()
    } else {
      authriteClient = new Authrite({ clientPrivateKey: this.clientPrivateKey })
    }
    const response = await authriteClient.request(`${this.peerServHost}/readMessage`, {
      body: {
        messageIds
      },
      method: 'POST'
    })

    // Parse out the message
    // TODO Update for just one message
    const parsedResponse = JSON.parse(Buffer.from(response.body).toString('utf8'))
    if (parsedResponse.status === 'error') {
      const e = new Error(parsedResponse.description)
      e.code = parsedResponse.code
      throw e
    }
    const messages = parsedResponse.messages

    if (messages && messages.length === 0) {
      return []
    }

    // TODO: validate token contents etc.
    const tokens = messages.map(x => JSON.parse(x.body))

    // Figure out what the signing strategy should be
    // Note: This should probably be refactored to be part of Ninja
    const getLib = () => {
      if (!this.clientPrivateKey) {
        return BabbageSDK
      }
      const ninja = new Ninja({
        privateKey: this.clientPrivateKey,
        config: {
          dojoURL: 'https://staging-dojo.babbage.systems'
        }
      })
      return ninja
    }

    const messagesProcessed = []
    const paymentsReceived = []
    for (const [i, message] of messages.entries()) {
      try {
        const paymentResult = await getLib().submitDirectTransaction({
          protocol: '3241645161d8',
          senderIdentityKey: message.sender,
          note: 'PeerServ payment',
          amount: message.amount,
          derivationPrefix: tokens[i].derivationPrefix,
          transaction: tokens[i].transaction
        })
        if (paymentResult.status !== 'success') {
          throw new Error('Payment not processed')
        }
        paymentsReceived.push(paymentResult)
        messagesProcessed.push(message)
      } catch (e) {
        console.log(`Error: ${e}`)
      }
    }
    const acknowledged = await authriteClient.request(`${this.peerServHost}/acknowledgeMessage`, {
      body: {
        messageIds: messagesProcessed.map(m => m.messageId)
      },
      method: 'POST'
    })
    const parsedAcknowledged = JSON.parse(Buffer.from(acknowledged.body).toString('utf8'))
    if (parsedAcknowledged.status === 'error') {
      const e = new Error(parsedAcknowledged.description)
      e.code = parsedAcknowledged.code
      throw e
    }
    return paymentsReceived
  }
}
module.exports = Tokenator
