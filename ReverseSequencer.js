const Sequencer = require('@jest/test-sequencer').default;

class ReverseSequencer extends Sequencer {
  sort(tests) {
    return super.sort(tests).reverse();
  }
}

module.exports = ReverseSequencer;
