const Tokenator = require('../tokenator')
const BabbageSDK = require('@babbage/sdk')
const Ninja = require('utxoninja')
const bsv = require('babbage-bsv')

const STANDARD_PAYMENT_MESSAGEBOX = 'payment_inbox'

/**
 * Extends the Tokenator class to enable peer-to-peer Bitcoin payments
 */
class PaymentTokenator extends Tokenator {
  constructor ({
    peerServHost = 'https://staging-peerserv-ivi63c6zsq-uc.a.run.app',
    clientPrivateKey
  } = {}) {
    super({ peerServHost, clientPrivateKey })
  }

  /**
   * @param {Object} payment The payment object
   * @param {string} payment.recipient The recipient of the payment
   * @param {Number} payment.amount The amount in satoshis to send
   * @returns
   */
  async createPaymentToken (payment) {
    // Derive a new public key for the recipient according to the P2PKH Payment Protocol.
    const derivationPrefix = require('crypto')
      .randomBytes(10)
      .toString('base64')
    const derivationSuffix = require('crypto')
      .randomBytes(10)
      .toString('base64')
    const derivedPublicKey = await BabbageSDK.getPublicKey({
      protocolID: [2, '3241645161d8'],
      keyID: `${derivationPrefix} ${derivationSuffix}`,
      counterparty: payment.recipient
    })

    // Create a P2PK Bitcoin script
    const script = new bsv.Script(
      bsv.Script.fromAddress(bsv.Address.fromPublicKey(
        bsv.PublicKey.fromString(derivedPublicKey)
      ))
    ).toHex()

    // Create a new Bitcoin transaction
    const paymentAction = await BabbageSDK.createAction({
      description: 'Tokenator payment',
      outputs: [{ script, satoshis: payment.amount }]
    })

    // Configure the standard messageBox and payment body
    payment.messageBox = STANDARD_PAYMENT_MESSAGEBOX
    payment.body = {
      derivationPrefix,
      transaction: {
        ...paymentAction,
        outputs: [{ vout: 0, satoshis: payment.amount, derivationSuffix }]
      },
      amount: payment.amount
    }
    return payment
  }

  /**
   * Sends Bitcoin to a PeerServ recipient
   * @param {Object} payment The payment object
   * @param {string} payment.recipient The recipient of the payment
   * @param {Number} payment.amount The amount in satoshis to send
   */
  async sendPayment (payment) {
    const paymentToken = await this.createPaymentToken(payment)
    return await this.sendMessage(paymentToken)
  }

  /**
   * Recieves one or more incoming Bitcoin payments
   * @param {Object} obj An object containing the messageIds
   * @param {Array} messageIds An array of Numbers indicating which payments to recieve
   * @returns {Array} An array indicating the payments processed
   */
  async receivePayment ({ messageIds }) {
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
          dojoURL: 'https://staging-dojo.babbage.systems'
        }
      })
      return ninja
    }

    // Recieve payments using submitDirectTransaction
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
        messagesProcessed.push(message.messageId)
      } catch (e) {
        console.log(`Error: ${e}`)
      }
    }

    // Acknowledge the payment(s) has been recieved
    await this.acknowledgeMessage({ messageIds: messagesProcessed })
    return paymentsReceived
  }
}
module.exports = PaymentTokenator
