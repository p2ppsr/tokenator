const Tokenator = require('../tokenator')
const BabbageSDK = require('@babbage/sdk')
const Ninja = require('utxoninja')
const pushdrop = require('pushdrop')

// Define protocol constants
const STANDARD_SCRIBE_MESSAGEBOX = 'scribe_inbox'
const STANDARD_SCRIBE_BASKET = 'scribe notes'
const SCRIBE_PROTOCOL_ID = 'scribe'
const SCRIBE_KEY_ID = 1
const STANDARD_NOTE_VALUE = 1
const SCRIBE_PROTO_ADDR = '1XKdoVfVTrtNu243T44sNFVEpeTmeYitK'
const APDT_PROTOCOL = '974a75ed395f'

/**
 * Extends the Tokenator class to enable sending Scribe tokens with custom instructions Peer-to-Peer
 * @param {object} obj All parameters are given in an object
 * @param {String} [obj.peerServHost] The PeerServ host you want to connect to
 * @param {String} [obj.dojoHost] The Dojo to use for UTXO management
 * @param {String} [obj.clientPrivateKey] A private key to use for mutual authentication with Authrite. (Optional - Defaults to Babbage signing strategy).
 */
class ScribeTokenator extends Tokenator {
  constructor ({
    peerServHost = 'https://staging-peerserv.babbage.systems',
    dojoHost = 'https://staging-dojo.babbage.systems',
    clientPrivateKey
  } = {}) {
    super({ peerServHost, clientPrivateKey })
  }

  /**
   * @param {Object} note The note object
   * @param {string} note.title The recipient of the payment
   * @param {Number} note.contents The amount in satoshis to send
   * @param {String} note.recipient Who this note should be sent to
   * @returns
   */
  async createScribeToken (note) {
    // Encrypt the note
    const encryptedNote = await BabbageSDK.encrypt({
      // The plaintext for encryption is what the user put into the text area
      plaintext: Uint8Array.from(Buffer.from(JSON.stringify(note))),
      protocolID: SCRIBE_PROTOCOL_ID,
      keyID: SCRIBE_KEY_ID
    })

    // Create a new scribe token
    const bitcoinOutputScript = await pushdrop.create({
      fields: [
        Buffer.from(SCRIBE_PROTO_ADDR),
        Buffer.from(encryptedNote)
      ],
      protocolID: SCRIBE_PROTOCOL_ID,
      keyID: SCRIBE_KEY_ID,
      counterparty: note.recipient
    })

    // Create a transaction
    const newScribeToken = await BabbageSDK.createAction({
      outputs: [{
        satoshis: Number(STANDARD_NOTE_VALUE),
        script: bitcoinOutputScript,
        basket: STANDARD_SCRIBE_BASKET,
        description: 'New Scribe note'
      }],
      description: 'Create a Scribe note'
    })

    const sender = await BabbageSDK.getPublicKey({ identityKey: true })

    // Configure the standard messageBox and note body
    note.messageBox = STANDARD_SCRIBE_MESSAGEBOX
    note.body = {
      transaction: {
        ...newScribeToken,
        outputs: [{
          vout: 0,
          satoshis: STANDARD_NOTE_VALUE,
          basket: STANDARD_SCRIBE_BASKET,
          customInstructions: {
            outputScript: bitcoinOutputScript,
            sender,
            protocolID: SCRIBE_PROTOCOL_ID,
            keyID: SCRIBE_KEY_ID
          }
        }]
      },
      amount: note.amount
    }
    return note
  }

  /**
   * Sends a Scribe token to a PeerServ recipient
   * @param {Object} note The note object
   * @param {string} note.title The title of this note
   * @param {Number} note.contents The contents of the note
   * @param {String} note.recipient Who this note should be sent to
   */
  async sendScribeToken (note) {
    const scribeToken = await this.createScribeToken(note)
    return await this.sendMessage(scribeToken)
  }

  /**
   * Lists incoming Scribe tokens from PeerServ
   * @returns {Array} of incoming tokens from PeerServ
   */
  async listIncomingTokens () {
    // Use BabbageSDK or private key for signing strategy
    const response = await this.authriteClient.request(`${this.peerServHost}/listMessages`, {
      body: {
        messageBoxes: [STANDARD_SCRIBE_MESSAGEBOX]
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
   * Recieves one or more incoming Scribe tokens
   * @param {Object} obj An object containing the messageIds
   * @param {Array} messageIds An array of Numbers indicating which tokens to recieve
   * @returns {Array} An array indicating the tokens processed
   */
  async receiveNote ({ messageIds }) {
    const messages = await this.readMessage({ messageIds })
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

    // Recieve payments using submitDirectTransaction
    const messagesProcessed = []
    const paymentsReceived = []
    for (const [i, message] of messages.entries()) {
      try {
        // Validate Scribe Token
        for (const out of tokens[i].transaction.outputs) {
          if (!out.customInstructions) {
            const e = new Error()
            e.code = 'ERR_INVALID_TOKEN'
            e.description = 'Scribe tokens must include custom derivation instructions!'
          }

          // Derive the lockingPublicKey
          const ownerKey = await BabbageSDK.getPublicKey({
            protocolID: out.customInstructions.protocolID,
            keyID: out.customInstructions.keyID,
            sender: out.customInstructions.sender
          })
          const result = await pushdrop.decode({
            script: out.customInstructions.outputScript
          })

          // Make sure the derived ownerKey and lockingPublicKey match
          if (ownerKey !== result.lockingPublicKey) {
            const e = new Error()
            e.code = 'ERR_INVALID_OWNER_KEY'
            e.description = 'Derived owner key and script lockingPublicKey did not match!'
          }
        }

        // Use Ninja to submit the validated transaction to Dojo
        const paymentResult = await getLib().submitDirectTransaction({
          protocol: APDT_PROTOCOL,
          senderIdentityKey: message.sender,
          note: 'PushDrop Scribe token',
          amount: STANDARD_NOTE_VALUE,
          transaction: tokens[i].transaction
        })
        if (paymentResult.status !== 'success') {
          throw new Error('Token not processed')
        }
        paymentsReceived.push(paymentResult)
        messagesProcessed.push(message.messageId)

        // Acknowledge the payment(s) has been recieved
        await this.acknowledgeMessage({ messageIds: messagesProcessed })
        return paymentsReceived
      } catch (e) {
        console.log(`Error: ${e}`)
      }
    }
  }
}
module.exports = ScribeTokenator
