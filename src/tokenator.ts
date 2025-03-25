/* 
 * Tokenator.ts
 * 
 * A simple wrapper for creating and redeeming tokens with PushDrop outputs.
 * 
 * Requires:
 *   - @bsv/sdk version 0.6.x+ (for Transaction, LockingScript, Beef, etc.)
 *   - A WalletClient implementing createAction() and signAction().
 */

import {
  Transaction,
  WalletOutput,
  WalletClient,
  CreateActionResult,
  LockingScript,
  PushDrop,
  WalletProtocol
} from '@bsv/sdk'

export interface TokenData {
  /**
   * Arbitrary data you wish to store in the PushDrop fields, each field is a number[].
   * Example: fields: [ Utils.toArray("Hello, world!", "utf8") ]
   */
  fields: number[][]
  /**
   * How many satoshis will be locked in this new token.
   */
  satoshis: number

  /**
   * A short text describing this token creation for the user.
   * (Used as the 'description' in createAction.)
   */
  description?: string

  /**
   * (Optional) Whether to include a signature field in the token. Default: true
   */
  includeSignature?: boolean
}

export interface TokenInfo {
  /**
   * The data fields that were stored in the PushDrop script.
   */
  fields: number[][]

  /**
   * Number of satoshis locked in this token.
   */
  satoshis: number

  /**
   * Transaction outpoint that holds the token (e.g. "<txid>.0").
   */
  outpoint: string

  /**
   * The compiled locking script's hex (for reference).
   */
  lockingScriptHex: string

  /**
   * The BEEFs (if any) that can help re-spend the token. Typically you get
   * this from walletClient.listOutputs(...).
   */
  beef?: number[]

  /**
   * The raw unspent output data from the wallet's basket listing, if needed.
   */
  rawOutput?: WalletOutput
}

/**
 * A simple, higher-level wrapper around PushDrop + MetaNet createAction / signAction,
 * so you can easily create/list/redeem tokens.
 */
export class Tokenator {
  private wallet: WalletClient
  private basketName: string
  private protocolID: WalletProtocol
  private keyID: string
  private counterparty: string

  constructor(options: {
    /**
     * The instance of the WalletClient (from @bsv/sdk) or your own client implementing createAction, signAction, etc.
     */
    wallet: WalletClient

    /**
     * All tokens you create/redeem will live in this basket.
     * ex: 'todo tokens' or 'my-nft-basket'.
     */
    basketName: string

    /**
     * The protocol ID to use for signing/locking. 
     * Example: [0, 'my-protocol-name']
     */
    protocolID: WalletProtocol

    /**
     * The key ID used for encryption/decryption or signatures within the protocol.
     * Typically a short string like '1'.
     */
    keyID: string

    /**
     * The default counterparty context for the wallet calls (often "self").
     */
    counterparty?: string
  }) {
    this.wallet = options.wallet
    this.basketName = options.basketName
    this.protocolID = options.protocolID
    this.keyID = options.keyID
    this.counterparty = options.counterparty ?? 'self'
  }

  /**
   * Creates (mints) a new PushDrop token with the given data fields and locks it with satoshis.
   * Returns basic info about the newly created token.
   */
  public async createToken(tokenData: TokenData): Promise<TokenInfo> {
    const {
      fields,
      satoshis,
      description = 'Create token',
      includeSignature = true
    } = tokenData

    if (satoshis < 1) {
      throw new Error('Must lock at least 1 satoshi.')
    }

    // 1) Construct the locking script with PushDrop:
    const pushdrop = new PushDrop(this.wallet)
    const lockingScript = await pushdrop.lock(
      fields,
      this.protocolID,
      this.keyID,
      this.counterparty,
      /* forSelf = */ false,
      includeSignature
    )

    // 2) Create an Action (Transaction) that includes one output (the token).
    //    We'll keep the result to fetch its outpoint or TXID.
    const createActionResult: CreateActionResult = await this.wallet.createAction({
      description,
      outputs: [
        {
          lockingScript: lockingScript.toHex(),
          satoshis,
          basket: this.basketName,
          outputDescription: description
        }
      ],
      options: {
        randomizeOutputs: false,
        acceptDelayedBroadcast: false
      }
    })

    // The newly created token is presumably the 0th output of the newly created TX.
    // You can store outpoint as "<txid>.0"
    const outpoint = `${createActionResult.txid}.0`

    // Return it to the caller
    return {
      fields,
      satoshis,
      outpoint,
      lockingScriptHex: lockingScript.toHex()
    }
  }

  /**
   * Lists all unspent tokens in the configured basket. 
   * Decodes their PushDrop fields, if possible.
   */
  public async listTokens(): Promise<TokenInfo[]> {
    const outputsResult = await this.wallet.listOutputs({
      basket: this.basketName,
      include: 'entire transactions'
    })
    const beefAll = outputsResult.BEEF // combined BEEF for all these outputs

    const tokenInfos: TokenInfo[] = []

    for (const out of outputsResult.outputs) {
      try {
        if (!out.outpoint) continue
        const [txid, voutStr] = out.outpoint.split('.')
        const vout = parseInt(voutStr, 10)
        const satoshis = out.satoshis ?? 0

        // We decode the pushdrop fields from the locking script
        // If the entire transaction is in the BEEF, we can parse it:
        const tx = Transaction.fromBEEF(beefAll as number[], txid)
        if (!tx) {
          // if for some reason we can't parse from the provided BEEF, skip
          continue
        }

        const output = tx.outputs[vout]
        if (!output) {
          continue
        }
        const lockingScriptHex = output.lockingScript.toHex()

        // Attempt to decode the pushdrop fields
        const { fields } = PushDrop.decode(output.lockingScript)
        fields.pop() // remove the signature

        tokenInfos.push({
          fields,
          satoshis,
          outpoint: out.outpoint,
          lockingScriptHex,
          beef: beefAll,
          rawOutput: out
        })
      } catch (err) {
        console.warn(`Failed to decode output: ${out.outpoint}`, err)
      }
    }

    // Sort newest-first by TXID or just return as-is
    return tokenInfos.reverse()
  }

  /**
   * Redeems a token by spending it (unlocking script) and returning satoshis to the user.
   * Takes the outpoint of the token and optional metadata about how the user wants
   * to sign or the final transaction described.
   */
  public async redeemToken(options: {
    token: TokenInfo
    description?: string
    signOutputs?: 'all' | 'none' | 'single'
    anyoneCanPay?: boolean
  }): Promise<void> {
    const { token, signOutputs = 'all', anyoneCanPay = false } = options
    const description = options.description ?? `Redeem token ${token.outpoint}`
    if (!token.beef) {
      throw new Error('No BEEF found for this token. Cannot redeem.')
    }

    // 1) Prepare a signable transaction by referencing the to-be-spent outpoint
    const { signableTransaction }: CreateActionResult = await this.wallet.createAction({
      description,
      inputBEEF: token.beef, // we pass in the entire BEEF that should contain our token TX
      inputs: [
        {
          outpoint: token.outpoint,
          inputDescription: 'Spend a PushDrop token',
          unlockingScriptLength: 73
        }
      ],
      options: {
        randomizeOutputs: false
      }
    })

    if (!signableTransaction) {
      throw new Error('Failed to create signable transaction for redemption.')
    }

    // 2) Use the PushDrop helper to build an unlocking script
    const pushdrop = new PushDrop(this.wallet)
    const unlocker = pushdrop.unlock(
      this.protocolID,
      this.keyID,
      this.counterparty,
      signOutputs,
      anyoneCanPay,
      token.satoshis,
      LockingScript.fromHex(token.lockingScriptHex)
    )

    const partialTx = Transaction.fromBEEF(signableTransaction.tx)
    if (!partialTx) {
      throw new Error('Invalid partial signable transaction.')
    }

    // sign it for input index = 0
    const unlockingScript = await unlocker.sign(partialTx, 0)

    // 3) Submit the final signature to the wallet to finalize
    await this.wallet.signAction({
      reference: signableTransaction.reference,
      spends: {
        0: {
          unlockingScript: unlockingScript.toHex()
        }
      }
    })

    // Once redeemed, the wallet will likely mark that outpoint as spent.
    // The satoshis return to the user's internal wallet balance.
  }
}
