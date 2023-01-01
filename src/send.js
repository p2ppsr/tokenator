const { createAction, getPublicKey } = require('@babbage/sdk')
// const pushdrop = require('pushdrop')
const { Authrite } = require('authrite-js')
const bsv = require('babbage-bsv')

const PEERSERV_HOST = 'http://localhost:3002'
// Define the structure for a message:
// {
//   type: // Ex. MetaNet ICU Token, or a 3241645161d8 payment
//   recipient: // Who is this message going to?
//   body: // what is the contents of this message? The structure can be an arbituarily define structure, but it must follow the guidlines of the protocol type definition.
// }
// TODO: Support multiple token protocols in the future

/**
 * List messages from PeerServ
 * @param {Object} message the message to send according to the specified token protocol
 * @returns {Object} the messages received
 */
module.exports = async (message = { type: 'metanet icu token', amount: 100, recipient: '03b51d497f8c67c1416cfe1a58daa5a576a63eb0b64608922d5c4f98b6a1d9b103' }) => {
  // Validate the general message structure
  if (!message) {
    const e = new Error('You must provide a message to send!')
    e.code = 'ERR_INVALID_MESSAGE'
    throw e
  }

  if (!message.type) {
    const e = new Error('You must specify the message type!')
    e.code = 'ERR_INVALID_MESSAGE_TYPE'
    throw e
  }

  if (!message.recipient) {
    const e = new Error('You must specify the message recipient!')
    e.code = 'ERR_INVALID_MESSAGE_RECIPIENT'
    throw e
  }

  // Define a template message body to send.
  // This can be customized depending on the message protocol type
  const messageBody = {}

  // Determine what type of message this is
  if (message.type === 'metanet icu token') {
    // Derive a new public key for the recipient
    const derivationPrefix = require('crypto')
      .randomBytes(10)
      .toString('base64')
    const derivationSuffix = require('crypto')
      .randomBytes(10)
      .toString('base64')
    const derivedPublicKey = await getPublicKey({
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
    const payment = await createAction({
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
  await new Authrite().request(`${PEERSERV_HOST}/sendMessage`, {
    body: {
      message: {
        recipient: message.recipient, // Should this be the derived public key?
        type: message.type,
        body: message.body
      }
    },
    method: 'POST'
  })

  console.log('Token created' + JSON.stringify(messageBody))
}

// Example code once pushdrop tokens are supported
// TODO: Support a token protocol specification
// const encryptedData = await encrypt({
//   plaintext: Uint8Array.from(Buffer.from('some data')),
//   protocolID: 'metanet icu',
//   keyID: '1'
// })

// // Here's the part where we create the new Bitcoin token.
// const bitcoinOutputScript = await pushdrop.create({
//   fields: [
//     Buffer.from('1234'),
//     Buffer.from(encryptedData)
//   ],
//   protocolID: 'metanet icu',
//   keyID: '1',
//   ownerKey: recipient // TODO: Derive recipient public key for the owner key
// })

// Now that we have the output script for our ToDo Bitcoin token, we can
// add it to a Bitcoin transaction (a.k.a. "Action")
// const newToken = await createAction({
//   outputs: [{
//     satoshis: Number(1),
//     script,
//     description: 'tokenator metanet token test'
//   }],
//   description: 'Created a new token using tokenator'
// })
