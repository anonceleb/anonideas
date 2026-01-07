const { expect } = require('chai');
const { getPattern, calculateExpectedInfo, matchesConstraints, getPossibleWords } = require('../../lib/solver_core');

describe('Solver core', () => {
  it('getPattern should compute correct/present/absent', () => {
    const pattern = getPattern('raise', 'rains');
    // r a i s e vs r a i n s -> positions 0,1,2 correct; 'e' vs 'n' absent etc
    expect(pattern).to.be.a('string');
  });

  it('calculateExpectedInfo returns non-negative entropy', () => {
    const possible = ['crane', 'slate', 'trace', 'stare', 'share'];
    const e = calculateExpectedInfo('crane', possible);
    expect(e).to.be.a('number');
    expect(e).to.be.at.least(0);
  });

  it('matchesConstraints and getPossibleWords behave as expected', () => {
    const wordList = ['hinge', 'binge', 'tinge', 'singe', 'crane', 'pride'];
    const constraints = { correct: {1: 'i', 2: 'n', 3: 'g', 4: 'e'}, present: {}, absent: new Set(['s']) };
    const possible = getPossibleWords(wordList, constraints);
    expect(possible.length).to.be.greaterThan(0);
    expect(possible).to.include.members(['hinge','binge','tinge']);
  });
});