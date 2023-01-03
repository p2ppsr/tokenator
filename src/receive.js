// const { submitDirectTransaction, getTransactionOutputs, decrypt } = require('@babbage/sdk')
// const pushdrop = require('pushdrop')
const { Authrite } = require('authrite-js')
// const bsv = require('babbage-bsv')
const Ninja = require('utxoninja')

/**
 * Receive and process messages from PeerServ
 * @param {Array} messageTypes the types of messages to fetch
 * @returns {Array} messages received from PeerServ
 */
module.exports = async ({ messageTypes }) => {
  // Receive and process the new token(s) into a basket
  const EXAMPLE_PRIV_KEY = '6dcc124be5f382be631d49ba12f61adbce33a5ac14f6ddee12de25272f943f8b'
  const response = await new Authrite({ clientPrivateKey: EXAMPLE_PRIV_KEY }).request('http://localhost:3002/checkMessages', {
    body: {
      filterBy: {
        messageBoxTypes: messageTypes
      },
      isReceiving: true
    },
    method: 'POST'
  })

  // Parse out the messages
  const messages = JSON.parse(Buffer.from(response.body).toString('utf8')).messages
  console.log(messages)

  // TODO: validate token contents etc.
  const tokens = messages.map(x => JSON.parse(x.body))

  const ninja = new Ninja({
    privateKey: EXAMPLE_PRIV_KEY,
    config: {
      dojoURL: 'https://staging-dojo.babbage.systems'
    }
  })

  const paymentsReceived = []
  for (const [i, message] of messages.entries()) {
    try {
      const paymentResult = await ninja.submitDirectTransaction({
        protocol: '3241645161d8',
        senderIdentityKey: '032e5bd6b837cfb30208bbb1d571db9ddf2fb1a7b59fb4ed2a31af632699f770a1',
        note: 'Payment test using tokenator',
        amount: message.amount,
        derivationPrefix: tokens[i].derivationPrefix,
        transaction: tokens[i].transaction
      })
      if (paymentResult.status !== 'success') {
        throw new Error('Payment not processed')
      }
      paymentsReceived.push(paymentResult)
    } catch (e) {
      console.log(`Error: ${e}`)
    }
  }
  return paymentsReceived
}

// Reference for once pushdrop tokens are supported:
// const outputs = await getTransactionOutputs({
//   basket: 'metanet icu tokens',
//   spendable: true,
//   includeEnvelope: true
// })

//   const decodedData = pushdrop.decode({ script: outputs[2].outputScript })

//   // As you can tell if you look at the fields we sent into
//   // PushDrop when the token was originally created, the encrypted
//   // copy of the task is the second field from the fields array,
//   // after the TODO_PROTO_ADDR prefix.
//   const encryptedData = decodedData.fields[1]

//   // We'll pass in the encrypted value from the token, and
//   // use the "todo list" protocol and key ID for decrypting.
//   // NOTE: The same protocolID and keyID must be used when you
//   // encrypt and decrypt any data. Decrypting with the wrong
//   // protocolID or keyID would result in an error.
//   const decryptedData = await decrypt({
//     ciphertext: Buffer.from(encryptedData, 'hex'),
//     protocolID: 'metanet icu',
//     keyID: '1',
//     returnType: 'string'
//   })

// TODO: useGetPublicKey
// Use custom instructions that show how to unlock the output?? What tokenID and keyID
