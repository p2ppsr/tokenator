/* eslint-env jest */
const Tokenator = require('../tokenator')
jest.mock('authrite-js')

describe('tokenator', () => {
  beforeEach(() => {
  })

  const VALID_SEND_RESULT = {
    body: JSON.stringify({
      status: 200,
      message: 'Your message has been sent!'
    })
  }
  const VALID_LIST_AND_READ_RESULT = {
    body: JSON.stringify({
      status: 200,
      messages: [
        {
          sender: '028d37b941208cd6b8a4c28288eda5f2f16c2b3ab0fcb6d13c18b47fe37b971fc1',
          messageBoxId: 42,
          body: '{}'
        },
        {
          sender: '028d37b941208cd6b8a4c28288eda5f2f16c2b3ab0fcb6d13c18b47fe37b971fc1',
          messageBoxId: 43,
          body: '{}'
        }
      ]
    })
  }
  const VALID_ACK_RESULT = {
    body: JSON.stringify({
      status: 200,
      message: 'Messages marked as acknowledged!'
    })
  }

  afterEach(() => {
    jest.clearAllMocks()
  })
  it('Creates an instance of the Tokenator class', async () => {
    const tokenator = new Tokenator()
    const expectedInstance = {
      peerServHost: 'https://staging-peerserv.babbage.systems',
      authriteClient: {},
      joinedRooms: []
    }
    expect(JSON.parse(JSON.stringify(tokenator))).toEqual(
      expectedInstance
    )
  }, 100000)
  it('Throws an error a message does not contain a recipient', async () => {
    const tokenator = new Tokenator()
    await expect(tokenator.sendMessage({
      messageBox: 'test_inbox',
      body: {}
    })).rejects.toHaveProperty('code', 'ERR_MESSAGE_RECIPIENT_REQUIRED')
  }, 100000)
  it('Throws an error a message does not contain a messageBox', async () => {
    const tokenator = new Tokenator()
    await expect(tokenator.sendMessage({
      recipient: 'mockIdentityKey',
      body: {}
    })).rejects.toHaveProperty('code', 'ERR_MESSAGEBOX_REQUIRED')
  })
  it('Throws an error a message does not contain a body', async () => {
    const tokenator = new Tokenator()
    await expect(tokenator.sendMessage({
      recipient: 'mockIdentityKey',
      messageBox: 'test_inbox'
    })).rejects.toHaveProperty('code', 'ERR_MESSAGE_BODY_REQUIRED')
  })
  // Note: requires local MetaNet Client
  it('Sends a message', async () => {
    const tokenator = new Tokenator()
    tokenator.authriteClient.request.mockImplementation(() => {
      return VALID_SEND_RESULT
    })
    const result = await tokenator.sendMessage({
      recipient: 'mockIdentityKey',
      messageBox: 'test_inbox',
      body: { data: 'test' }
    })
    expect(result).toEqual('Your message has been sent!')
  })
  it('Lists available messages', async () => {
    const tokenator = new Tokenator()
    tokenator.authriteClient.request.mockImplementation(() => {
      return VALID_LIST_AND_READ_RESULT
    })
    const result = await tokenator.listMessages({
      messageBox: 'test_inbox'
    })
    expect(result).toEqual(JSON.parse(VALID_LIST_AND_READ_RESULT.body).messages)
  })
  it('Acknowledges a message', async () => {
    const tokenator = new Tokenator()
    tokenator.authriteClient.request.mockImplementation(() => {
      return VALID_ACK_RESULT
    })
    const result = await tokenator.acknowledgeMessage({
      messageIds: [42]
    })
    expect(result).toEqual(200)
  })
})
