const BabbageSDK = require('@babbage/sdk')
// const pushdrop = require('pushdrop')
const { Authrite } = require('authrite-js')
// const bsv = require('babbage-bsv')
const Ninja = require('utxoninja')

/**
 * Receive and process messages from PeerServ
 * @param {Object} obj All params inside an object
 * @param {Array} obj.messageTypes the types of messages to fetch
 * @param {String} obj.privateKey private key to use as signing strategy (optional: defaults to Babbage signing strategy))
 * @returns {Array} messages received from PeerServ
 */
module.exports = async ({ messageTypes, privateKey }) => { // Note: Probably not great to require private key here?
  // Receive and process the new token(s) into a basket
  // Use BabbageSDK or private key for signing strategy
  let authriteClient
  if (!privateKey) {
    authriteClient = new Authrite()
  } else {
    authriteClient = new Authrite({ clientPrivateKey: privateKey })
  }
  const response = await authriteClient.request('http://localhost:3002/checkMessages', {
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

  // Figure out what the signing strategy should be
  // Note: This should probably be refactored to be part of Ninja
  const getLib = () => {
    if (!privateKey) {
      return BabbageSDK
    }
    const ninja = new Ninja({
      privateKey,
      config: {
        dojoURL: 'https://staging-dojo.babbage.systems'
      }
    })
    return ninja
  }

  const paymentsReceived = []
  for (const [i, message] of messages.entries()) {
    try {
      const paymentResult = await getLib().submitDirectTransaction({
        protocol: '3241645161d8',
        senderIdentityKey: message.sender,
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
