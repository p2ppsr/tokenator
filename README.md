# Tokenator

Tokenator is a flexible and lightweight TypeScript library for creating, updating, redeeming, and querying simple text-based tokens on the Bitcoin SV (BSV) blockchain.

Tokens are embedded using [PushDrop](https://docs.bsv.dev/docs/pushdrop) scripts, can optionally be encrypted using the BSV SDK's BRC-2 encryption system, and support either local or overlay tracking modes.

---

## Features

- Optional encryption and decryption of token data
- Local token tracking via wallet baskets
- Overlay tracking via broadcast and lookup services
- Simple API for creating, updating, redeeming, and listing tokens
- Built on [@bsv/sdk](https://github.com/bitcoin-sv/bsv-sdk)

---

## Installation

```bash
npm install @bsv/sdk
```

Then copy `Tokenator.ts` into your project.

---

## Usage

### Initialization

```ts
import { WalletClient } from '@bsv/sdk'
import { Tokenator } from './Tokenator'

const wallet = new WalletClient()

const tokenator = new Tokenator({
  protocol: [2, 'MyApp'],
  keyID: '1',
  tracking: 'local',          // or 'overlay'
  basket: 'my-basket',        // required for local mode
  encryptByDefault: true      // optional
}, wallet)
```

---

### Create Token

```ts
await tokenator.createToken('My secure message')
```

This creates and broadcasts a token using the configured tracking mode (local basket or overlay topic). If `encryptByDefault` is set, the message will be encrypted automatically.

---

### List Tokens

```ts
const tokens = await tokenator.listTokens()
// tokens: Array<{ message, token: { txid, outputIndex, lockingScript, satoshis, beef? } }>
```

By default:
- Includes `beef`, which is required to redeem or update tokens
- Decrypts messages if in local mode and encryption was used

---

### Update Token

```ts
await tokenator.updateToken(tokens[0].token, 'Updated message')
```

Updates the given token output with a new message. Encryption is applied based on constructor settings (or can be overridden per call).

---

### Redeem Token

```ts
await tokenator.redeemToken(tokens[0].token)
```

Spends (removes) the token by creating and signing a transaction that consumes it.

---

## Tracking Modes

| Mode     | Description                                                                 |
|----------|-----------------------------------------------------------------------------|
| `local`  | Tokens are stored in a wallet basket. No overlay broadcast is performed.   |
| `overlay`| Tokens are broadcast to a topic and queryable via a lookup overlay service.|

---

## API Reference

### Constructor

```ts
new Tokenator(options: TokenatorOptions, wallet?: WalletInterface)
```

#### TokenatorOptions

| Name              | Type                 | Description                                |
|-------------------|----------------------|--------------------------------------------|
| `protocol`        | `[number, string]`   | Protocol ID and name                       |
| `keyId`           | `string`             | Identifier for key derivation              |
| `tracking`        | `'local' | 'overlay'` | Token tracking mode                        |
| `basket`          | `string?`            | Required if using local mode               |
| `overlayTopic`    | `string?`            | Topic name for overlay broadcast           |
| `overlayService`  | `string?`            | Lookup service name for overlay query      |
| `encryptByDefault`| `boolean?`           | Automatically encrypt all messages         |

---

## Example: Public Notes with Overlay

```ts
const notes = new Tokenator({
  protocol: [99, 'Notes'],
  keyId: '1',
  tracking: 'overlay',
  overlayTopic: 'public_notes',
  overlayService: 'ls_notes'
}, wallet)

await notes.createToken('Hello, world!')
const results = await notes.listTokens({ limit: 5 })
console.log(results.map(n => n.message))
```

---

## License

This library is licensed under the **Open BSV License**.
