/**
   * test.ts – demo for the Tokenator helper
   *
   * Run with:
   *   npx tsx test.ts
   *
   * Make sure your environment can sign transactions (e.g. the WalletClient is
   * authenticated with a mnemonic or has a funded key).
   */

import { WalletClient, BroadcastResponse, BroadcastFailure, Transaction } from '@bsv/sdk'
import { Tokenator } from '../src/index.js'

(async () => {
  const wallet = new WalletClient('auto', 'local')
  // ─────────────────────────────────────────────────────────────────────────
  // 1. Boot a wallet (change auth flow to match your project)
  // ─────────────────────────────────────────────────────────────────────────
  const todo = new Tokenator({
    protocol: [2, 'DemoProto'],
    keyID: '1',
    tracking: 'local',
    basket: 'todo',
    encryptByDefault: true          // auto-encrypt on create / update
  }, wallet)

  // create (encrypted automatically)
  await todo.createToken('Buy milk')

  // list – defaults to decrypt:true, includeBeef:true
  const all = await todo.listTokens()
  console.log(all[0])       // ⇒ 'Buy milk'

  // list without decrypting, no pesky `undefined`
  const raw = await todo.listTokens({ decrypt: false })
  console.log(raw[0])

  // Create
  // const createdLocalTx = await local.createToken('Buy milk')
  // console.log('Created local txid:', (createdLocalTx as Transaction).id('hex'))

  // // List
  // const allLocal = await local.listTokens(undefined, { decrypt: false, includeBeef: true })
  // console.log('Local basket contains:', allLocal.map(t => t.message))

  // // // Update
  // const updatedLocalTx = await local.updateToken(allLocal[0].token, 'Buy almond milk')
  // console.log('Updated local txid:', (updatedLocalTx as Transaction).id('hex'))

  // // // Redeem
  // const redeemedLocalTx = await local.redeemToken(allLocal[0].token)
  // console.log('Redeemed local txid:', (redeemedLocalTx as Transaction).id('hex'))

  // // ─────────────────────────────────────────────────────────────────────────
  // // 3. Overlay-tracking example (public discovery)
  // // ─────────────────────────────────────────────────────────────────────────
  // const overlay = new Tokenator(
  //   {
  //     protocol: [1, 'HelloWorld'],
  //     keyId: '1',
  //     tracking: 'overlay',
  //     overlayTopic: 'tm_helloworld',
  //     overlayService: 'ls_helloworld'
  //   },
  //   wallet
  // )

  // console.log('\n=== OVERLAY MODE ===')

  // // Create
  // const broadcast = await overlay.createToken('Hello overlay!')
  // if ('id' in broadcast) {
  //   // Should never happen in overlay mode
  //   console.log('Unexpected local transaction:', broadcast.id('hex'))
  // } else if ((broadcast as BroadcastResponse).status === 'success') {
  //   console.log('Overlay broadcast accepted. txid:', (broadcast as BroadcastResponse).txid)
  // } else {
  //   console.error('Overlay broadcast FAILED:', (broadcast as BroadcastFailure).status === 'error')
  // }

  // // Query latest 5 overlay tokens
  // const latestOverlay = await overlay.listTokens({ limit: 5 })
  // latestOverlay.forEach(t =>
  //   console.log(`[${t.token.txid.slice(0, 8)}]`, t.message)
  // )

  // console.log('\nDemo complete ✅')

})()