const { submitDirectTransaction, getTransactionOutputs, decrypt } = require('@babbage/sdk')
const pushdrop = require('pushdrop')
const { Authrite } = require('authrite-js')
const bsv = require('babbage-bsv')
const Ninja = require('utxoninja')

module.exports = async () => {
  // TEST token type
  const TOKEN_TYPE = 'metanet icu token'
  // receive and process the new token into a basket
  const response = await new Authrite().request('http://localhost:3002/listMessages', {
    body: { messageBoxTypes: [TOKEN_TYPE] },
    method: 'POST'
  })
  // debugger
  const messages = JSON.parse(Buffer.from(response.body).toString('utf8')).messages
  console.log(messages)

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

  // TODO: validate token contents etc.
  const tokens = messages.map(x => JSON.parse(x.body))

  const TEST_PRIVATE_KEY = '6dcc124be5f382be631d49ba12f61adbce33a5ac14f6ddee12de25272f943f8b'
  const ninja = new Ninja({
    privateKey: TEST_PRIVATE_KEY,
    ninjaConfig: {
      dojoURL: 'https://staging-dojo.babbage.systems'
    }
  })

  // const outputs = await ninja.getTransactionOutputs({
  //   basket: 'metanet icu token',
  //   spendable: true,
  //   includeEnvelope: true
  // })

  const paymentResult = await ninja.submitDirectTransaction({
    protocol: '3241645161d8',
    senderIdentityKey: '032e5bd6b837cfb30208bbb1d571db9ddf2fb1a7b59fb4ed2a31af632699f770a1',
    note: 'Payment test using tokenator',
    amount: 400,
    derivationPrefix: tokens[tokens.length - 1].derivationPrefix,
    transaction: tokens[tokens.length - 1].transaction
  })
  if (paymentResult.status !== 'success') {
    throw new Error('Payment not processed')
  }
}
