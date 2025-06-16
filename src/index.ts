import {
  Beef,
  BEEF,
  BroadcastFailure,
  BroadcastResponse,
  LookupAnswer,
  LookupResolver,
  PushDrop,
  TopicBroadcaster,
  Transaction,
  Utils,
  WalletClient,
  WalletInterface,
  WalletProtocol,
  WalletOutput
} from '@bsv/sdk'

/* ────────────────────────────────────────────────────────────
 * Public types
 * ────────────────────────────────────────────────────────── */
export interface TokenatorOptions {
  protocol: WalletProtocol
  keyID: string
  tracking: 'local' | 'overlay'
  basket?: string
  overlayTopic?: string
  overlayService?: string
  /** If true, `createToken` / `updateToken` encrypt by default. */
  encryptByDefault?: boolean
  acceptDelayedBroadcast?: boolean
}

export interface TokenOutput {
  txid: string
  outputIndex: number
  lockingScript: string
  satoshis: number
  beef?: BEEF
}

export interface TokenPayload {
  message: string
  token: TokenOutput
}

export interface CreateOptions { encrypt?: boolean; wallet?: WalletInterface }
export interface UpdateOptions extends CreateOptions { }

export interface ListParams {
  limit?: number
  skip?: number
  sortOrder?: 'asc' | 'desc'
  message?: string
  startDate?: string
  endDate?: string
}
export interface ListOptions {
  resolver?: LookupResolver
  wallet?: WalletInterface
  timeout?: number
  decrypt?: boolean          // default: tracking==='local'
  includeBeef?: boolean      // default: true
}

/* ────────────────────────────────────────────────────────────
 * Tokenator
 * ────────────────────────────────────────────────────────── */
export class Tokenator {
  private readonly protocol: WalletProtocol
  private readonly keyID: string
  private readonly basket?: string
  private readonly tracking: 'local' | 'overlay'
  private readonly overlayTopic: string
  private readonly overlayService: string
  private readonly wallet: WalletInterface
  private readonly defaultEncrypt: boolean
  private readonly acceptDelayedBroadcast: boolean

  constructor(
    opts: TokenatorOptions,
    wallet: WalletInterface = new WalletClient()
  ) {
    if (opts.tracking === 'local' && !opts.basket) {
      throw new Error('basket must be supplied when tracking mode is "local"')
    }
    this.protocol = opts.protocol
    this.keyID = opts.keyID
    this.basket = opts.basket
    this.tracking = opts.tracking
    this.overlayTopic = opts.overlayTopic ?? 'tm_tokenator'
    this.overlayService = opts.overlayService ?? 'ls_tokenator'
    this.wallet = wallet
    this.defaultEncrypt = !!opts.encryptByDefault
    this.acceptDelayedBroadcast = opts.acceptDelayedBroadcast ?? true
  }

  /* ──────────────────────────────  Create  ───────────────────────────── */
  async createToken(
    message: string,
    opts: CreateOptions = {}
  ): Promise<Transaction | BroadcastResponse | BroadcastFailure> {
    const wallet = opts.wallet ?? this.wallet
    const encrypt = opts.encrypt ?? this.defaultEncrypt
    const payload = await this.serializeMessage(message, encrypt, wallet)

    const lockingScript = await new PushDrop(wallet).lock(
      [payload],
      this.protocol,
      this.keyID,
      'anyone',
      true
    )

    const { tx } = await wallet.createAction({
      description: 'Tokenator - create',
      outputs: [{
        satoshis: 1,
        lockingScript: lockingScript.toHex(),
        outputDescription: 'Tokenator token',
        ...(this.tracking === 'local' ? { basket: this.basket! } : {})
      }],
      options: { acceptDelayedBroadcast: this.acceptDelayedBroadcast, randomizeOutputs: false }
    })
    if (!tx) throw new Error('Failed to create transaction')

    const transaction = Transaction.fromAtomicBEEF(tx)
    return this.tracking === 'overlay'
      ? this.broadcastOverlay(transaction, wallet)
      : transaction
  }

  /* ──────────────────────────────  Update  ───────────────────────────── */
  async updateToken(
    prev: TokenOutput,
    newMessage: string,
    opts: UpdateOptions = {}
  ): Promise<Transaction | BroadcastResponse | BroadcastFailure> {
    if (!prev.beef) throw new Error('Token must contain BEEF for update')
    const wallet = opts.wallet ?? this.wallet
    const encrypt = opts.encrypt ?? this.defaultEncrypt
    const payload = await this.serializeMessage(newMessage, encrypt, wallet)

    const newLocking = await new PushDrop(wallet).lock(
      [payload],
      this.protocol,
      this.keyID,
      'anyone',
      true
    )

    const pushdrop = new PushDrop(wallet)
    const prevOutpoint = `${prev.txid}.${prev.outputIndex}` as const
    const loadedBEEF = Beef.fromBinary(prev.beef as number[])
    const { signableTransaction } = await wallet.createAction({
      description: 'Tokenator - update',
      inputBEEF: loadedBEEF.toBinary(),
      inputs: [{
        outpoint: prevOutpoint,
        unlockingScriptLength: 74,
        inputDescription: 'Spend previous token'
      }],
      outputs: [{
        satoshis: 1,
        lockingScript: newLocking.toHex(),
        outputDescription: 'Updated Tokenator token',
        ...(this.tracking === 'local' ? { basket: this.basket! } : {})
      }],
      options: { acceptDelayedBroadcast: this.acceptDelayedBroadcast, randomizeOutputs: false }
    })
    if (!signableTransaction) throw new Error('Unable to update token')

    const unlocker = pushdrop.unlock(this.protocol, this.keyID, 'anyone')
    const unlockingScript = await unlocker.sign(
      Transaction.fromBEEF(signableTransaction.tx),
      0
    )

    const { tx } = await wallet.signAction({
      reference: signableTransaction.reference,
      spends: { 0: { unlockingScript: unlockingScript.toHex() } }
    })
    if (!tx) throw new Error('Unable to update token')

    const transaction = Transaction.fromAtomicBEEF(tx)
    return this.tracking === 'overlay'
      ? this.broadcastOverlay(transaction, wallet)
      : transaction
  }

  /* ──────────────────────────────  Redeem  ───────────────────────────── */
  async redeemToken(
    token: TokenOutput,
    wallet: WalletInterface = this.wallet
  ): Promise<Transaction | BroadcastResponse | BroadcastFailure> {
    if (!token.beef) throw new Error('Token must contain BEEF to redeem')

    const prevOutpoint = `${token.txid}.${token.outputIndex}` as const
    const loadedBEEF = Beef.fromBinary(token.beef as number[])

    const { signableTransaction } = await wallet.createAction({
      description: 'Tokenator - redeem',
      inputBEEF: loadedBEEF.toBinary(),
      inputs: [{
        outpoint: prevOutpoint,
        unlockingScriptLength: 74,
        inputDescription: 'Redeem token'
      }],
      options: { acceptDelayedBroadcast: this.acceptDelayedBroadcast, randomizeOutputs: false }
    })
    if (!signableTransaction) throw new Error('Unable to redeem token')

    const unlocker = new PushDrop(wallet).unlock(this.protocol, this.keyID, 'anyone')
    const unlockingScript = await unlocker.sign(
      Transaction.fromBEEF(signableTransaction.tx),
      0
    )

    const { tx } = await wallet.signAction({
      reference: signableTransaction.reference,
      spends: { 0: { unlockingScript: unlockingScript.toHex() } }
    })
    if (!tx) throw new Error('Unable to redeem token')

    const transaction = Transaction.fromAtomicBEEF(tx)
    return this.tracking === 'overlay'
      ? this.broadcastOverlay(transaction, wallet)
      : transaction
  }

  /* ──────────────────────────────  List  ───────────────────────────── */
  async listTokens(
    paramsOrOpts: ListParams | ListOptions = {},
    maybeOpts: ListOptions = {}
  ): Promise<TokenPayload[]> {
    // --- Smart arg swapper ------------------------------------------
    let params: ListParams
    let opts: ListOptions
    if (this.isListOptions(paramsOrOpts)) {
      params = {}
      opts = { ...paramsOrOpts, ...maybeOpts }
    } else {
      params = paramsOrOpts
      opts = maybeOpts
    }

    // --- Defaults ----------------------------------------------------
    if (opts.includeBeef === undefined) opts.includeBeef = true
    if (opts.decrypt === undefined) opts.decrypt = (this.tracking === 'local')

    // --- Delegate ----------------------------------------------------
    return this.tracking === 'overlay'
      ? this.queryOverlayTokens(params, opts)
      : this.queryLocalTokens(params, opts)
  }

  /* ──────────────────────────── Helpers ──────────────────────────── */
  private async broadcastOverlay(
    tx: Transaction,
    wallet: WalletInterface
  ): Promise<BroadcastResponse | BroadcastFailure> {
    const broadcaster = new TopicBroadcaster([this.overlayTopic], {
      networkPreset: (await wallet.getNetwork({})).network
    })
    return broadcaster.broadcast(tx)
  }

  private async serializeMessage(
    message: string,
    encrypt: boolean,
    wallet: WalletInterface
  ): Promise<number[]> {
    if (!encrypt) return Utils.toArray(message)
    const { ciphertext } = await wallet.encrypt({
      plaintext: Utils.toArray(message, 'utf8'),
      protocolID: this.protocol,
      keyID: this.keyID
    })
    return ciphertext
  }

  private async deserializeMessage(
    bytes: number[],
    decrypt: boolean,
    wallet: WalletInterface
  ): Promise<string> {
    if (!decrypt) return Utils.toUTF8(bytes)
    const { plaintext } = await wallet.decrypt({
      ciphertext: bytes,
      protocolID: this.protocol,
      keyID: this.keyID
    })
    return Utils.toUTF8(plaintext)
  }

  /* ───────────────────────── Overlay query ───────────────────────── */
  private async queryOverlayTokens(
    params: ListParams,
    opts: ListOptions
  ): Promise<TokenPayload[]> {
    const {
      limit = 20, skip = 0, sortOrder = 'desc',
      message, startDate, endDate
    } = params
    const wallet = opts.wallet ?? this.wallet

    const query: Record<string, unknown> = { limit, skip, sortOrder }
    if (message?.trim()) query.message = message.trim()
    if (startDate) query.startDate = `${startDate}T00:00:00.000Z`
    if (endDate) query.endDate = `${endDate}T23:59:59.999Z`

    const resolver =
      opts.resolver ??
      new LookupResolver({
        networkPreset: (await wallet.getNetwork({})).network
      })

    const ans = await resolver.query(
      { service: this.overlayService, query },
      opts.timeout ?? 10_000
    )
    return this.parseLookupAnswer(ans, opts.decrypt!, wallet, opts.includeBeef!)
  }

  /* ───────────────────────── Local (basket) query ───────────────────────── */
  private async queryLocalTokens(
    params: ListParams,
    opts: ListOptions
  ): Promise<TokenPayload[]> {
    const wallet = opts.wallet ?? this.wallet
    const outputs = await wallet.listOutputs({
      basket: this.basket!,
      include: 'entire transactions'
    })

    const tokens: TokenPayload[] = []

    for (const out of outputs.outputs as WalletOutput[]) {
      try {
        const [txid, voutStr] = out.outpoint.split('.')
        const vout = Number(voutStr)
        const tx = Transaction.fromBEEF(outputs.BEEF as number[], txid)
        const lockingScript = tx.outputs[vout].lockingScript
        const decoded = PushDrop.decode(lockingScript)

        const message = await this.deserializeMessage(
          decoded.fields[0] as number[],
          opts.decrypt!,
          wallet
        )

        if (params.message && !message.includes(params.message)) continue

        tokens.push({
          message,
          token: {
            txid,
            outputIndex: vout,
            lockingScript: lockingScript.toHex(),
            satoshis: out.satoshis ?? 0,
            ...(opts.includeBeef ? { beef: outputs.BEEF } : {})
          }
        })
      } catch (err) {
        console.error('[Tokenator] failed to decode local output', err)
      }
    }

    // Sort & paginate
    tokens.sort((a, b) =>
      params.sortOrder === 'asc'
        ? a.token.txid.localeCompare(b.token.txid)
        : b.token.txid.localeCompare(a.token.txid)
    )
    const skip = params.skip ?? 0
    const limit = params.limit ?? tokens.length
    return tokens.slice(skip, skip + limit)
  }

  /* ───────────────────────── Shared decoder ───────────────────────── */
  private async parseLookupAnswer(
    ans: LookupAnswer,
    decrypt: boolean,
    wallet: WalletInterface,
    includeBeef: boolean
  ): Promise<TokenPayload[]> {
    if (ans.type !== 'output-list' || !ans.outputs.length) return []
    return Promise.all(ans.outputs.map(async o => {
      const tx = Transaction.fromBEEF(o.beef)
      const out = tx.outputs[o.outputIndex]
      const data = PushDrop.decode(out.lockingScript)

      const message = await this.deserializeMessage(
        data.fields[0] as number[],
        decrypt,
        wallet
      )

      return {
        message,
        token: {
          txid: tx.id('hex'),
          outputIndex: o.outputIndex,
          lockingScript: out.lockingScript.toHex(),
          satoshis: out.satoshis!,
          ...(includeBeef ? { beef: o.beef } : {})
        }
      }
    }))
  }

  /* ───────────────────────── Util ───────────────────────── */
  private isListOptions(x: any): x is ListOptions {
    if (!x || typeof x !== 'object') return false
    // unique keys of ListOptions
    return 'decrypt' in x || 'resolver' in x || 'includeBeef' in x ||
      'wallet' in x || 'timeout' in x
  }
}
