const Tokenator = require('../tokenator')
const BabbageSDK = require('@babbage/sdk')
const Ninja = require('utxoninja')
const bsv = require('babbage-bsv')

const STANDARD_PAYMENT_MESSAGEBOX = 'payment_inbox'

/**
 * Extends the Tokenator class to enable peer-to-peer Bitcoin payments
 * @param {object} obj All parameters are given in an object.
 * @param {String} [obj.peerServHost] The PeerServ host you want to connect to.
 * @param {String} [obj.clientPrivateKey] A private key to use for mutual authentication with Authrite. (Optional - Defaults to Babbage signing strategy).
 */
class PaymentTokenator extends Tokenator {
  constructor ({
    peerServHost = 'https://staging-peerserv.babbage.systems',
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
   * Recieves incoming Bitcoin payments
   * @returns {Array} An array indicating the payments processed
   */
  async receivePayments () {
    const messages = await this.listMessages({ messageBox: [STANDARD_PAYMENT_MESSAGEBOX] })
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
        // Note: custom acceptance validation could be added here.
        // Example: if (message.amount > 100000000) {...acceptance criteria}
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

        // Acknowledge the payment(s) has been recieved
        await this.acknowledgeMessage({ messageIds: messagesProcessed })
      } catch (e) {
        console.log(`Error: ${e}`)
        return 'Unable to receive payment!'
      }
    }
    return {
      messages,
      paymentsReceived
    }
  }
}
module.exports = PaymentTokenator
