## EmailTokenator

<!-- Generated by documentation.js. Update this documentation by updating the source code. -->

#### Table of Contents

*   [EmailTokenator](#emailtokenator)
    *   [Parameters](#parameters)
    *   [sendEmail](#sendemail)
        *   [Parameters](#parameters-1)
    *   [listIncomingEmails](#listincomingemails)
    *   [receiveEmail](#receiveemail)
        *   [Parameters](#parameters-2)
*   [constructor](#constructor)
    *   [Parameters](#parameters-3)
*   [sendMessage](#sendmessage)
    *   [Parameters](#parameters-4)
*   [listMessages](#listmessages)
    *   [Parameters](#parameters-5)
*   [readMessage](#readmessage)
    *   [Parameters](#parameters-6)
*   [acknowledgeMessage](#acknowledgemessage)
    *   [Parameters](#parameters-7)

### EmailTokenator

**Extends Tokenator**

Extends the Tokenator class to enable sending email messages

#### Parameters

*   `obj` **[object](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Object)** All parameters are given in an object. (optional, default `{}`)

    *   `obj.peerServHost` **[String](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)?** The PeerServ host you want to connect to. (optional, default `'https://staging-peerserv-ivi63c6zsq-uc.a.run.app'`)
    *   `obj.clientPrivateKey` **[String](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)?** A private key to use for mutual authentication with Authrite. (Optional - Defaults to Babbage signing strategy).

#### sendEmail

Creates a payment token to send in a message to PeerServ

##### Parameters

*   `message` **[Object](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Object)** The email message to send

    *   `message.recipient` **[String](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)** The recipient of this email
    *   `message.subject` **[String](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)** The subject of the email
    *   `message.body` **[String](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)** The body of the email message

#### listIncomingEmails

Lists incoming emails from PeerServ

Returns **[Array](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Array)** of incoming emails from PeerServ

#### receiveEmail

Recieves email messages according to the standard protocol

##### Parameters

*   `obj` **[Object](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Object)** An object containing the messageIds

    *   `obj.messageIds` **[Array](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Array)** An array of Numbers indicating which email message(s) to read

Returns **[Array](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Array)** An array of email messages