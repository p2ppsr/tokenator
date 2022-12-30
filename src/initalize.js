// TODO
// Automatic flag / or manual approve.
const receive = require('./receive')
module.exports = async (todo) => {
  // Process any incoming tokens
  const result = await receive(todo)
}
