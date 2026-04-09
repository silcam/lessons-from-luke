const Sequencer = require('@jest/test-sequencer').default;

class RandomSequencer extends Sequencer {
  sort(tests) {
    const sorted = Array.from(tests);
    for (let i = sorted.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
    }
    return sorted;
  }
}

module.exports = RandomSequencer;
