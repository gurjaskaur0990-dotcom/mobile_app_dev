if (process.env.FUNCTIONS_EMULATOR !== 'true')
  throw new Error('These fixtures run in Firebase emulators only.')
module.exports = require('./flutter-triggers.cjs')
