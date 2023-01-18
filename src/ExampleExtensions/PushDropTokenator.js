const Tokenator = require('../tokenator')
const BabbageSDK = require('@babbage/sdk')
const Ninja = require('utxoninja')
const pushdrop = require('pushdrop')

/**
 * Extends the Tokenator class to enable sending PushDrop tokens with custom instructions Peer-to-Peer
 * @param {object} obj All parameters are given in an object
 * @param {String} [obj.peerServHost] The PeerServ host you want to connect to
 * @param {String} [obj.dojoHost] The Dojo to use for UTXO management
 * @param {String} [obj.clientPrivateKey] A private key to use for mutual authentication with Authrite. (Optional - Defaults to Babbage signing strategy).
 */
class PushDropTokenator extends Tokenator {
  constructor ({
    peerServHost = 'https://staging-peerserv.babbage.systems',
    dojoHost = 'https://staging-dojo.babbage.systems',
    clientPrivateKey,
    defaultTokenValue,
    protocolID,
    protocolKeyID,
    protocolBasketName,
    protocolMessageBox,
    protocolAddress
  } = {}) {
    super({ peerServHost, clientPrivateKey })

    // Set derived class properties
    this.defaultTokenValue = defaultTokenValue
    this.protocolID = protocolID
    this.protocolKeyID = protocolKeyID
    this.protocolBasketName = protocolBasketName
    this.protocolMessageBox = protocolMessageBox
    this.protocolAddress = protocolAddress
  }

  /**
   * @param {Object} data The data object with any data fields to send
   * @param {String} data.recipient Who this data should be sent to
   * @returns
   */
  async createPushDropToken (data) {
    if (!data.recipient) {
      data.recipient = 'self'
    }
    // Encrypt the data
    const encryptedData = await BabbageSDK.encrypt({
      plaintext: Uint8Array.from(Buffer.from(JSON.stringify(data))),
      protocolID: this.protocolID,
      keyID: this.protocolKeyID,
      counterparty: data.recipient
    })

    // Create a new PushDrop token
    const bitcoinOutputScript = await pushdrop.create({
      fields: [
        Buffer.from(this.protocolAddress),
        Buffer.from(encryptedData)
      ],
      protocolID: this.protocolID,
      keyID: this.protocolKeyID,
      counterparty: data.recipient
    })

    // Create a transaction
    const newPushDropToken = await BabbageSDK.createAction({
      outputs: [{
        satoshis: Number(this.defaultTokenValue),
        script: bitcoinOutputScript,
        // basket: STANDARD_PUSHDROP_BASKET,
        // customInstructions (if outgoing basket is desired)
        description: `New ${this.protocolID} token`
      }],
      description: `Create a ${this.protocolID}  token`
    })

    const sender = await BabbageSDK.getPublicKey({ identityKey: true })

    // Configure the standard messageBox and body
    data.messageBox = this.protocolMessageBox
    data.body = {
      transaction: {
        ...newPushDropToken,
        outputs: [{
          vout: 0,
          satoshis: this.defaultTokenValue,
          basket: this.protocolBasketName,
          customInstructions: {
            outputScript: bitcoinOutputScript,
            sender,
            protocolID: this.protocolID,
            keyID: this.protocolKeyID
          }
        }]
      },
      amount: data.amount
    }
    return data
  }

  /**
   * Sends a PushDrop token to a PeerServ recipient
   * @param {Object} data The data object with any data fields to send
   * @param {String} [data.recipient='self'] Who this data should be sent to (optional)
   */
  async sendPushDropToken (data) {
    const token = await this.createPushDropToken(data)
    return await this.sendMessage(token)
  }

  /**
   * Recieves incoming PushDrop tokens
   * @returns {Array} An array indicating the tokens received
   */
  async receivePushDropTokens () {
    const messages = await this.listMessages({ messageBoxes: [this.protocolMessageBox] })
    const tokens = messages.map(x => JSON.parse(x.body))

    // Figure out what the signing strategy should be
    // Note: Should this be refactored to be part of Ninja?
    const getLib = () => {
      if (!this.clientPrivateKey) {
        return BabbageSDK
      }
      const ninja = new Ninja({
        privateKey: this.clientPrivateKey,
        config: {
          // dojoURL: this.dojoHost
          dojoURL: 'http://localhost:3102'
        }
      })
      return ninja
    }

    // Recieve tokens using submitDirectTransaction
    const messagesProcessed = []
    const tokensReceived = []
    for (const [i, message] of messages.entries()) {
      try {
        // Validate PushDrop Token
        for (const out of tokens[i].transaction.outputs) {
          if (!out.customInstructions) {
            const e = new Error(`${this.protocolID} tokens must include custom derivation instructions!`)
            e.code = 'ERR_INVALID_TOKEN'
            throw e
          }

          // Derive the lockingPublicKey
          const ownerKey = await BabbageSDK.getPublicKey({
            protocolID: out.customInstructions.protocolID,
            keyID: out.customInstructions.keyID,
            counterparty: out.customInstructions.sender,
            forSelf: true
          })
          const result = await pushdrop.decode({
            script: out.customInstructions.outputScript
          })

          // Make sure the derived ownerKey and lockingPublicKey match
          if (ownerKey !== result.lockingPublicKey) {
            const e = new Error('Derived owner key and script lockingPublicKey did not match!')
            e.code = 'ERR_INVALID_OWNER_KEY'
            throw e
          }
        }

        // Use Ninja to submit the validated transaction to Dojo
        const result = await getLib().submitDirectTransaction({
          senderIdentityKey: message.sender,
          note: `${this.protocolID} token`,
          amount: this.defaultTokenValue,
          transaction: tokens[i].transaction
        })
        if (result.status !== 'success') {
          const e = new Error('Token not processed')
          e.code = 'ERR_TOKEN_NOT_PROCESSED'
          throw e
        }
        tokensReceived.push(result)
        messagesProcessed.push(message.messageId)

        // Acknowledge the token(s) received
        await this.acknowledgeMessage({ messageIds: messagesProcessed })
        return tokensReceived
      } catch (e) {
        console.error(e)
      }
    }
  }
}
module.exports = PushDropTokenator
