const { expect } = require('chai');
const { satisfiesSoft } = require('../../lib/solver_core');

describe('Soft constraint candidate filter', () => {
  it('enforces confirmed positions (greens)', () => {
    const constraints = { correct: {0: 'a', 1: 'b'}, present: {}, absent: new Set() };
    expect(satisfiesSoft('about', constraints)).to.be.true;
    expect(satisfiesSoft('crane', constraints)).to.be.false;
  });

  it('enforces forbidden positions for present letters', () => {
    const constraints = { correct: {}, present: { 'a': [0] }, absent: new Set() };
    expect(satisfiesSoft('about', constraints)).to.be.false; // 'a' in position 0 is forbidden
    expect(satisfiesSoft('staab', constraints)).to.be.false;
  });

  it('filters absent letters that are not present/correct', () => {
    const constraints = { correct: {}, present: {}, absent: new Set(['x', 'z']) };
    expect(satisfiesSoft('crane', constraints)).to.be.true;
    expect(satisfiesSoft('zxing', constraints)).to.be.false;
  });
});