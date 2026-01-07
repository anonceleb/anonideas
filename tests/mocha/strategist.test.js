const { expect } = require('chai');
const { getBestBurnerWords } = require('../../strategist');

describe('Strategist', () => {
  it('getBestBurnerWords returns up to 3 words when candidates > 2', () => {
    const candidates = ['bider','eider','rider','tider','wider','coder'];
    const full = ['bider','eider','rider','tider','wider','coder','other','random','maybe'];
    const burners = getBestBurnerWords(candidates, full);
    expect(burners).to.be.an('array');
    expect(burners.length).to.be.at.most(3);
  });
});