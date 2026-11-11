// FCM has no local emulator. Acknowledge delivery locally so no token leaves the demo.
exports.send = async () => 'local-message'
exports.sendEachForMulticast = async ({ tokens }) => ({
  successCount: tokens.length,
  failureCount: 0,
  responses: tokens.map(() => ({ success: true, messageId: 'local-message' })),
})
