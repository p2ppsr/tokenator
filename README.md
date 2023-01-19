# tokenator

## Overview

Tokenator is a versatile and powerful tool that allows developers to easily create and transfer tokens peer-to-peer on the MetaNet. 

The base-level class provides basic functionality such as sending, receiving, and deleting tokens, while derived classes can be used to build specialized tokens for various applications. Examples of these derived classes include PaymentTokenator, EmailTokenator, PushDropTokenator, and ScribeTokenator. 

With Tokenator, developers can take advantage of the power of the BSV blockchain, the simple messageBox architecture of PeerServ, privacy and mutual authentication with Authrite, and monetization with PacketPay to create cutting-edge decentralized applications.

## Example Usage

```js
const Tokenator = require('@babage/tokenator')
const johnSmith = '022600d2ef37d123fdcac7d25d7a464ada7acd3fb65a0daf85412140ee20884311'

const init = async () => {
    // Create a new instance of the PushDropTokenator class
    // Configure the parameters according to the protocol being used
    const tokenator = new Tokenator({
        peerServHost: 'https://staging-peerserv.babbage.systems'
    })
    // Send a generic message using Babbage
    await tokenator.sendMessage({
        recipient: johnSmith,
        messageBox: 'example_inbox',
        body: 'This is an example message!'
    })

    // John can now list messages in his messageBox on PeerServ
    const messages = await tokenator.listMessages({
        messageBox: 'example_inbox'
    })

    console.log(messages[0].body) // --> 'This is an example message!'

    // Acknowledge that the messages have been received and can be deleted.
    await tokenator.acknowledgeMessage({
        messageIds: messages.map(x => x.messageId)
    })
}

init()
```

## API

<!-- Generated by documentation.js. Update this documentation by updating the source code. -->

#### Table of Contents

*   [PeerServMessage](#peerservmessage)
    *   [Properties](#properties)
*   [Tokenator](#tokenator)
    *   [Parameters](#parameters)
    *   [sendMessage](#sendmessage)
        *   [Parameters](#parameters-1)
    *   [listMessages](#listmessages)
        *   [Parameters](#parameters-2)
    *   [acknowledgeMessage](#acknowledgemessage)
        *   [Parameters](#parameters-3)

### PeerServMessage

Defines the structure of a PeerServ Message

Type: [Object](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Object)

#### Properties

*   `messageId` **[Number](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Number)** identifies a particular message
*   `body` **[String](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)** the body of the message (may be a stringified object)
*   `sender` **[String](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)** the identityKey of the sender
*   `created_at` **[String](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)** message creation timestamp as a string
*   `updated_at` **[String](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)** message update timestamp as a string

### Tokenator

Extendable class for interacting with a PeerServ

#### Parameters

*   `obj` **[object](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Object)?** All parameters are given in an object (optional, default `{}`)

    *   `obj.peerServHost` **[String](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)?** The PeerServ host you want to connect to (optional, default `'https://staging-peerserv.babbage.systems'`)
    *   `obj.clientPrivateKey` **[String](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)?** A private key to use for mutual authentication with Authrite. (Defaults to Babbage signing strategy)

#### sendMessage

Sends a message to a PeerServ recipient

##### Parameters

*   `message` **[Object](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Object)** The object containing the message params

    *   `message.recipient` **[string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)** The identityKey of the intended recipient
    *   `message.messageBox` **[string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)** The messageBox the message should be sent to depending on the protocol being used
    *   `message.body` **[string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)** The body of the message

Returns **[String](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)** status message

#### listMessages

Lists messages from PeerServ

##### Parameters

*   `obj` **[Object](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Object)** An object containing the messageBox

    *   `obj.messageBox` **[Array](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Array)** The name of the messageBox to list messages from

Returns **[Array](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Array)<[PeerServMessage](#peerservmessage)>** of matching messages returned from PeerServ

#### acknowledgeMessage

Acknowledges one or more messages as having been recieved ensuring deletion of the message(s)

##### Parameters

*   `obj` **[Object](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Object)** An object containing the messageIds

    *   `obj.messageIds` **[Array](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Array)** An array of Numbers indicating which message(s) to acknowledge

Returns **[Array](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Array)** of messages formatted according to the particular protocol in use
