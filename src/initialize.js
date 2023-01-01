// TODO
// Automatic flag / or manual approve.
const receive = require('./receive')
module.exports = async (todo) => {
  // Process any incoming tokens
  return await receive(todo)
}
