const BabbageSDK = require('@babbage/sdk')
const pushdrop = require('pushdrop')
const PushDropTokenator = require('./PushDropTokenator')

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
class ScribeTokenator extends PushDropTokenator {
  constructor ({
    peerServHost = 'https://staging-peerserv.babbage.systems',
    dojoHost = 'https://staging-dojo.babbage.systems',
    clientPrivateKey
  } = {}) {
    super({
      peerServHost,
      clientPrivateKey,
      defaultTokenValue: STANDARD_NOTE_VALUE,
      protocolID: SCRIBE_PROTOCOL_ID,
      protocolKeyID: SCRIBE_KEY_ID,
      protocolBasketName: STANDARD_SCRIBE_BASKET,
      protocolMessageBox: STANDARD_SCRIBE_MESSAGEBOX,
      protocolAddress: SCRIBE_PROTO_ADDR
    })
  }

  /**
   * @param {Object} note The note object
   * @param {string} note.title The recipient of the payment
   * @param {Number} note.contents The amount in satoshis to send
   * @param {String} note.recipient Who this note should be sent to
   * @returns
   */
  async createScribeToken (note) {
    debugger
    return await this.createPushDropToken(note)
  }

  /**
   * Sends a Scribe token to a PeerServ recipient
   * @param {Object} note The note object
   * @param {string} note.title The title of this note
   * @param {Number} note.contents The contents of the note
   * @param {String} note.recipient Who this note should be sent to
   */
  async sendScribeToken (note) {
    return await this.sendPushDropToken(note)
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
