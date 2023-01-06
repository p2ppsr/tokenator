const NodePolyfillPlugin = require('node-polyfill-webpack-plugin')
const path = require('path')

module.exports = {
  entry: {
    Tokenator: './src/tokenator.js',
    PaymentTokenator: './src/ExampleExtensions/PaymentTokenator.js',
    EmailTokenator: './src/ExampleExtensions/EmailTokenator.js'
  },
  output: {
    globalObject: 'this',
    library: ['Tokenator', 'PaymentTokenator', 'EmailTokenator'],
    libraryTarget: 'umd',
    filename: '[name].bundle.js'
  },
  plugins: [
    new NodePolyfillPlugin()
  ],
  externals: {
  },
  resolve: {
    extensions: ['', '.js', '.jsx'],
    alias: {
      'babbage-bsv': path.resolve(__dirname, 'node_modules/babbage-bsv'),
      'safe-buffer': path.resolve(__dirname, 'node_modules/safe-buffer'),
      'bn.js': path.resolve(__dirname, 'node_modules/bn.js'),
      'babbage-sdk': path.resolve(__dirname, 'node_modules/babbage-sdk'),
      'authrite-js': path.resolve(__dirname, 'node_modules/authrite-js')
    }
  }
}
