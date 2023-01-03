const { Authrite } = require('authrite-js')

const PEERSERV_HOST = 'http://localhost:3002'

/**
 * List messages from PeerServ
 * @param {Array} messageTypes the types of messages to fetch
 * @returns {Array} messages received from PeerServ
 */
// TODO support other filters
module.exports = async ({ messageTypes, acknowledged }) => {
  // TODO: Remove test data
  const EXAMPLE_PRIV_KEY = '6dcc124be5f382be631d49ba12f61adbce33a5ac14f6ddee12de25272f943f8b'
  // Get a list of a messages for the given user, but don't process their contents.
  const response = await new Authrite({ clientPrivateKey: EXAMPLE_PRIV_KEY }).request(`${PEERSERV_HOST}/checkMessages`, {
    body: {
      filterBy: {
        messageBoxTypes: messageTypes,
        acknowledged
      },
      isReceiving: false
    },
    method: 'POST'
  })

  const messages = JSON.parse(Buffer.from(response.body).toString('utf8')).messages
  return messages
}
