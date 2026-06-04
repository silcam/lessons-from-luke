// Suppress noisy production logging during tests unless VERBOSE=1 is set.
// Tests that need to assert on console calls can still use jest.spyOn — it
// wraps whatever function is currently on console, so spies and mockRestore
// continue to work as expected.
if (!process.env.VERBOSE) {
  console.log = () => {};
  console.info = () => {};
  console.warn = () => {};
  console.error = () => {};
}
