const Tokenator = require('../tokenator')
const BabbageSDK = require('@babbage/sdk')
const Ninja = require('utxoninja')
const pushdrop = require('pushdrop')

// Define protocol constants
const STANDARD_SCRIBE_MESSAGEBOX = 'scribe_inbox'
const STANDARD_SCRIBE_BASKET = 'scribe'
const SCRIBE_PROTOCOL_ID = 'scribe'
const SCRIBE_KEY_ID = 1
const STANDARD_NOTE_VALUE = 1
const SCRIBE_PROTO_ADDR = '1XKdoVfVTrtNu243T44sNFVEpeTmeYitK'

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
      keyID: SCRIBE_KEY_ID,
      counterparty: note.recipient ? note.recipient : 'self'
    })

    // Create a new scribe token
    const bitcoinOutputScript = await pushdrop.create({
      fields: [
        Buffer.from(SCRIBE_PROTO_ADDR),
        Buffer.from(encryptedNote)
      ],
      protocolID: SCRIBE_PROTOCOL_ID,
      keyID: SCRIBE_KEY_ID,
      counterparty: note.recipient ? note.recipient : 'self'
    })

    // Create a transaction
    const action = {
      outputs: [{
        satoshis: Number(STANDARD_NOTE_VALUE),
        script: bitcoinOutputScript,
        // basket: STANDARD_SCRIBE_BASKET,
        // customInstructions (if outgoing basket is desired)
        description: 'New Scribe note'
      }],
      description: 'Create a Scribe note'
    }
    if (!note.recipient) {
      action.outputs[0].basket = STANDARD_SCRIBE_BASKET
      // action.outputs[0].customInstructions = {
      //   outputScript: bitcoinOutputScript,
      //   sender,
      //   protocolID: SCRIBE_PROTOCOL_ID,
      //   keyID: SCRIBE_KEY_ID
      // }
    }
    const newScribeToken = await BabbageSDK.createAction(action)
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
            const e = new Error('Scribe tokens must include custom derivation instructions!')
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
        const paymentResult = await getLib().submitDirectTransaction({
          senderIdentityKey: message.sender,
          note: 'PushDrop Scribe token',
          amount: STANDARD_NOTE_VALUE,
          transaction: tokens[i].transaction
        })
        if (paymentResult.status !== 'success') {
          const e = new Error('Token not processed')
          e.code = 'ERR_TOKEN_NOT_PROCESSED'
          throw e
        }
        paymentsReceived.push(paymentResult)
        messagesProcessed.push(message.messageId)

        // Acknowledge the payment(s) has been recieved
        await this.acknowledgeMessage({ messageIds: messagesProcessed })
        return paymentsReceived
      } catch (e) {
        console.error(e)
      }
    }
  }

  /**
   * Decrypts all available notes in a user's Scribe basket
   * @returns {Array} of decrypted note objects
   */
  async decryptNotes () {
    const notesFromBasket = await BabbageSDK.getTransactionOutputs({
      // The name of the basket where the tokens are kept
      basket: STANDARD_SCRIBE_BASKET,
      // Only get tokens that are active on the list, not already spent
      spendable: true,
      includeEnvelope: true
    })

    // Decrypt the user's notes
    const decryptedNotes = await Promise
      .all(notesFromBasket.map(async note => {
        try {
          const token = {
            ...note.envelope,
            lockingScript: note.outputScript,
            txid: note.txid,
            outputIndex: note.vout
          }
          // Get custom instructions if provided
          let counterparty = 'self'
          if (note.customInstructions) {
            token.customInstructions = JSON.parse(note.customInstructions)
            counterparty = token.customInstructions.sender
            console.log(token.customInstructions)
          }

          const decodedNote = pushdrop.decode({ script: note.outputScript })
          const encryptedNote = decodedNote.fields[1]
          const decryptedNote = await BabbageSDK.decrypt({
            ciphertext: Buffer.from(encryptedNote, 'hex'),
            protocolID: SCRIBE_PROTOCOL_ID,
            keyID: SCRIBE_KEY_ID,
            counterparty,
            returnType: 'string'
          })
          // Now we can return the decrypted version of the note, along
          // with some information about the token.
          const parsedNote = JSON.parse(decryptedNote)
          console.log(decryptedNote)
          return {
            token,
            sats: note.amount,
            // Finally, we include the note that we've just decrypted, for
            // showing in the notes list
            title: parsedNote.title,
            contents: parsedNote.contents
          }
        } catch (e) {
        // In case there are any errors, we'll handle them gracefully.
          console.error('Error decrypting note:', e)
          return {
            ...note,
            note: '[error] Unable to decrypt note!'
          }
        }
      }))
    // We reverse the list, so the newest notes show up at the top
    decryptedNotes.reverse()
    return decryptedNotes
  }

  /**
   * Deletes or updates a note token
   * @param {Object} selectedNote the note to update or delete
   * @param {Boolean} shouldUpdate whether additional outputs should be redeemed
   * @returns
   */
  async handleRedeem (selectedNote, shouldUpdate = false) {
    const tokenToRedeem = {
      // To unlock the token, we need to use the same "scribe" protocolID
      // and keyID as when we created the ToDo token before.
      protocolID: SCRIBE_PROTOCOL_ID,
      keyID: SCRIBE_KEY_ID,
      // We're telling PushDrop which previous transaction and output we want
      // to unlock, so that the correct unlocking puzzle can be prepared.
      prevTxId: selectedNote.token.txid,
      outputIndex: selectedNote.token.outputIndex,
      // We also give PushDrop a copy of the locking puzzle ("script") that
      // we want to open, which is helpful in preparing to unlock it.
      lockingScript: selectedNote.token.lockingScript,
      // Finally, the amount of Bitcoins we are expecting to unlock when the
      // puzzle gets solved.
      outputAmount: selectedNote.sats
    }
    // Get the counterparty if provided
    if (selectedNote.customInstructions) {
      tokenToRedeem.counterparty = selectedNote.customInstructions.counterparty
    }
    const unlockingScript = await pushdrop.redeem(tokenToRedeem)

    // Now, we're going to use the unlocking puzle that PushDrop has prepared
    // for us, so that the user can get their Bitcoins back.This is another
    // "Action", which is just a Bitcoin transaction.
    const action = {
      // Let the user know what's going on, and why they're getting some
      // Bitcoins back.
      description: shouldUpdate ? `Update note...: ${selectedNote.title}` : `Delete note...: ${selectedNote.title}`,
      inputs: { // These are inputs, which unlock Bitcoin tokens.
        // The input comes from the previous ToDo token, which we're now
        // completing, redeeming and spending.
        [selectedNote.token.txid]: {
          ...selectedNote.token,
          // The output we want to redeem is specified here, and we also give
          // the unlocking puzzle ("script") from PushDrop.
          outputsToRedeem: [{
            index: selectedNote.token.outputIndex,
            unlockingScript,
            // Spending descriptions tell the user why this input was redeemed
            spendingDescription: shouldUpdate ? 'Redeem an existing note' : 'Delete a note'
          }]
        }
      }
    }
    // Check if we should create an updated token
    let lockingScript
    if (shouldUpdate) {
      const note = {
        title: selectedNote.title,
        contents: selectedNote.contents
      }
      const encryptedUpdatedNote = await BabbageSDK.encrypt({
        // The plaintext for encryption is what the user put into the text area
        plaintext: Uint8Array.from(Buffer.from(JSON.stringify(note))),
        protocolID: SCRIBE_PROTOCOL_ID,
        keyID: SCRIBE_KEY_ID
      })

      // Create a new Bitcoin token.
      lockingScript = await pushdrop.create({
        fields: [
          Buffer.from(SCRIBE_PROTO_ADDR),
          Buffer.from(encryptedUpdatedNote)
        ],
        protocolID: SCRIBE_PROTOCOL_ID,
        keyID: SCRIBE_KEY_ID
      })
      action.outputs = [{
        script: lockingScript,
        satoshis: Number(STANDARD_NOTE_VALUE),
        basket: STANDARD_SCRIBE_BASKET,
        description: 'Updated Scribe note'
      }]
    }
    const updatedToken = await BabbageSDK.createAction(action)
    if (shouldUpdate) {
      return {
        lockingScript,
        updatedToken
      }
    }
    return updatedToken
  }
}
module.exports = ScribeTokenator
