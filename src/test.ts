import { Utils, WalletClient } from '@bsv/sdk'
import { Tokenator } from './Tokenator'

// 1) Create or obtain the wallet client (your app’s MetaNet client).
const wallet = new WalletClient('json-api', 'localhost')

// 2) Instantiate the Tokenator wrapper.
const tokenator = new Tokenator({
  wallet,
  basketName: 'my-tokens',
  protocolID: [2, 'demo tokens'],
  keyID: '1',
  counterparty: 'self',
})

// 3) Create a new token
async function createMyToken() {
  const myFields = [
    // Each data field is a number[], e.g. text converted to utf8 bytes:
    Utils.toArray('Hello'), // "Hello"
    Utils.toArray("world"), // "World"
  ]
  const { outpoint, satoshis, fields } = await tokenator.createToken({
    fields: myFields,
    satoshis: 1,
    description: 'Mint my pushdrop token'
  })
  console.log('Created token at:', outpoint, 'with', satoshis, 'sats.')
  console.log('Data fields stored:', fields)
}

// 4) List existing tokens
async function listMyTokens() {
  const tokens = await tokenator.listTokens()
  for (const t of tokens) {
    console.log('Found token:', t.outpoint)
    console.log('PushDrop fields:', t.fields)
    console.log('Satoshis locked:', t.satoshis)
  }
}

// 5) Redeem an existing token
async function redeemMyToken(outpoint: string) {
  const tokens = await tokenator.listTokens()
  const token = tokens.find((tk) => tk.outpoint === outpoint)
  if (!token) {
    throw new Error('No token found with that outpoint.')
  }
  await tokenator.redeemToken({
    token,
    description: 'Redeem my pushdrop token'
  })
  console.log('Token redeemed successfully.')
}

// Wrap it all:
async function main() {
  // await createMyToken()
  // await listMyTokens()

  // Suppose we want to redeem the most recent token:
  const [latest] = await tokenator.listTokens()
  console.log(latest.fields.map(x => Utils.toUTF8(x)))
  // if (latest) {
  //   await redeemMyToken(latest.outpoint)
  // }
}

main().catch(console.error)
