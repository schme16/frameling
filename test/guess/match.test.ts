// The matcher, hard: what must get it, and (just as much) what must not. Wrong either way makes the game annoying.
import { describe, expect, it } from 'vitest';
import { editDistance, letterCounts, matchGuess, normalise, slack, sounds, warmer, warmthOf } from '../../src/guess/match';
import { pickWord, DRAW_WORDS } from '../../src/guess/words';

const yes = (guess: string, word: string, how?: string) => {
  const m = matchGuess(guess, word);
  expect(m.right, `"${guess}" should get "${word}"`).toBe(true);
  if (how) expect(m.how, `"${guess}" for "${word}"`).toBe(how);
};
const no = (guess: string, word: string) => expect(matchGuess(guess, word).right, `"${guess}" should NOT get "${word}"`).toBe(false);

describe('normalise', () => {
  it('lower-cases, drops punctuation, accents and apostrophes, and keeps one space between words', () => {
    expect(normalise('  CAT!!  ')).toBe('cat');
    expect(normalise("It's  a   Dog.")).toBe('its a dog');
    expect(normalise('Café')).toBe('cafe');
    expect(normalise('ice-cream, please')).toBe('ice cream please');
    expect(normalise('rock & roll')).toBe('rock and roll');
    expect(normalise('...')).toBe('');
  });
});

describe('exact, whatever the capitals, punctuation and spaces', () => {
  it('gets it', () => {
    yes('cat', 'cat', 'exact');
    yes('CAT', 'cat', 'exact');
    yes('Cat!', 'cat', 'exact');
    yes('  c a t'.replace(/ /g, ''), 'Cat');
    yes('ice cream', 'Ice Cream', 'exact');
    yes('ice   cream', 'ice cream', 'exact');
    yes('cafe', 'Café', 'exact');
    yes('rock and roll', 'Rock & Roll', 'exact');
    yes("dont", "Don't", 'exact');
  });
  it('a word with digits or another alphabet is matched exactly', () => {
    yes('3d glasses', '3D Glasses', 'exact');
    yes('猫', '猫', 'exact');
    no('犬', '猫');
  });
});

describe('tidy: articles, chatty padding and spacing', () => {
  it('drops a leading a/an/the on either side', () => {
    yes('a cat', 'cat', 'tidy');
    yes('the cat', 'cat', 'tidy');
    yes('an apple', 'apple', 'tidy');
    yes('cat', 'the cat', 'tidy');
    yes('sun', 'The Sun', 'tidy');
    yes('a cat', 'the cat', 'tidy');
  });
  it('drops "is it", "i think", "maybe" and a trailing "lol"', () => {
    yes('is it a cat?', 'cat', 'tidy');
    yes('its a cat', 'cat', 'tidy');
    yes("it's a cat!!", 'cat', 'tidy');
    yes('i think its a cat', 'cat', 'tidy');
    yes('maybe cat', 'cat', 'tidy');
    yes('cat lol', 'cat', 'tidy');
    yes('cat pls', 'cat', 'tidy');
    yes('omg a cat', 'cat', 'tidy');
  });
  it('spaces and hyphens do not matter', () => {
    yes('icecream', 'ice cream', 'tidy');
    yes('ice-cream', 'ice cream', 'exact');
    yes('ice cream', 'icecream', 'tidy');
    yes('tree house', 'treehouse', 'tidy');
    yes('hot air balloon', 'hot-air balloon');
  });
  it('a word that starts with a padding word still matches itself', () => {
    yes('the last supper', 'The Last Supper', 'exact');
    yes('it', 'It', 'exact');
    yes('is it a cat', 'is it a cat', 'exact');
  });
  it('a hedge or a list is not a guess', () => {
    no('cat or dog', 'cat');
    no('is it a cat or a dog', 'cat');
    no('cat dog', 'cat');
    no('i love my cat', 'cat');
    no('scatter', 'cat');
    no('category', 'cat');
  });
});

describe('plurals', () => {
  it('takes the plural or the singular either way round', () => {
    yes('cats', 'cat', 'plural');
    yes('cat', 'cats', 'plural');
    yes('boxes', 'box', 'plural');
    yes('box', 'boxes', 'plural');
    yes('horses', 'horse', 'plural');
    yes('bunnies', 'bunny', 'plural');
    yes('bunny', 'bunnies', 'plural');
    yes('wolves', 'wolf', 'plural');
    yes('knives', 'knife', 'plural');
    yes('leaves', 'leaf', 'plural');
    yes('dishes', 'dish', 'plural');
    yes('mice', 'mouse', 'plural');
    yes('mouse', 'mice', 'plural');
    yes('feet', 'foot', 'plural');
    yes('teeth', 'tooth', 'plural');
    yes('geese', 'goose', 'plural');
    yes('children', 'child', 'plural');
    yes('ice creams', 'ice cream', 'plural');
    yes('the cats', 'cat', 'plural');
    yes('computer mice', 'computer mouse', 'plural');
    yes('glass', 'glasses');
    yes('scissor', 'scissors');
  });
  it('does not turn a short word into a "plural" of something else', () => {
    no('bu', 'bus');
    no('wa', 'was');
    no('ye', 'yes');
    no('ca', 'cat');
  });
});

describe('spelling by sound', () => {
  it('takes ph/f, ck/k, a hard c as k, and doubled or stretched letters', () => {
    yes('elefant', 'elephant');
    yes('dolfin', 'dolphin');
    yes('fone', 'phone');
    yes('kat', 'cat', 'sound');
    yes('caaaat', 'cat', 'sound');
    yes('catt', 'cat', 'sound');
    yes('bal', 'ball', 'sound');
    yes('tre', 'tree', 'sound');
    yes('duk', 'duck', 'sound');
    yes('girafe', 'giraffe');
    yes('jiraff'.replace('j', 'g'), 'giraffe');
  });
  it('a soft c is left alone', () => {
    no('sell', 'cell');
    no('kell', 'cell');
  });
});

describe('one letter out (two, for ten letters or more)', () => {
  it('forgives a missing, extra, swapped or wrong letter in a word of five or more', () => {
    yes('elephnt', 'elephant', 'typo');
    yes('elephaant', 'elephant');
    yes('elephnat', 'elephant', 'typo');
    yes('elephent', 'elephant', 'typo');
    yes('giraff', 'giraffe');
    yes('pizzza'.replace('zzz', 'zz'), 'pizza');
    yes('rabit', 'rabbit');
    yes('pengiun', 'penguin', 'typo');
    yes('butterfy', 'butterfly');
    yes('dinosuar', 'dinosaur', 'typo');
    yes('hedgehg', 'hedgehog', 'typo');
    yes('strawbery', 'strawberry');
    yes('elephnts', 'elephant');
    yes('elephants', 'elephant', 'plural');
  });
  it('lets two letters go in a word of ten or more', () => {
    yes('rhinocerus', 'rhinoceros');
    yes('helicoptr', 'helicopter');
    yes('submarne', 'submarine');
    yes('watermellon', 'watermelon');
    yes('wattermelon', 'watermelon');
    yes('hot air baloon', 'hot air balloon');
    yes('christmas tre', 'christmas tree');
    yes('cristmas tree', 'christmas tree');
    expect(slack(4)).toBe(0);
    expect(slack(5)).toBe(1);
    expect(slack(9)).toBe(1);
    expect(slack(10)).toBe(2);
  });
  it('words of four letters or fewer must be exact', () => {
    for (const [g, w] of [['bear', 'pear'], ['pear', 'bear'], ['beer', 'bear'], ['dear', 'deer'], ['tree', 'free'], ['cat', 'bat'], ['dog', 'dot'], ['cow', 'cot'], ['car', 'cat'], ['sun', 'sub'], ['moon', 'mood'], ['frog', 'from'], ['bird', 'bind'], ['lion', 'loin'], ['ant', 'any']] as const) no(g, w);
  });
  it('the first letter has to be right', () => {
    no('mouse', 'house'.replace('house', 'xouse'));
    no('plant', 'slant');
    no('apple', 'ample');
    no('zlephant', 'elephant');
  });
  it('a guess that is a different real word never counts, even one letter out', () => {
    no('house', 'horse');
    no('horse', 'house');
    no('hose', 'horse');
    no('mouse', 'moose');
    no('plane', 'plant');
    no('plate', 'plane');
    no('cloud', 'clown');
    no('clown', 'cloud');
    no('sheep', 'sleep');
    no('shark', 'share');
    no('whale', 'while');
    no('train', 'brain');
    no('heart', 'hearth');
    no('snail', 'nail');
    no('apple', 'maple');
  });
  it('does not forgive when too many letters are wrong', () => {
    no('elephantine', 'elephant');
    no('elphnt', 'elephant');
    no('elegant', 'elephant');
    no('elefnt', 'elephant');
    no('girafs', 'giraffe'.replace('giraffe', 'zebra'));
    no('dolphin', 'penguin');
    no('kitten', 'cat');
    no('puppy', 'dog');
    no('feline', 'cat');
    no('horsie', 'unicorn');
    no('pizzeria', 'pizza'.replace('pizza', 'burger'));
  });
  it('a long word does not accept a short piece or a word with extra words', () => {
    no('ice cream', 'ice cream cone');
    no('cream', 'ice cream');
    no('hot air', 'hot air balloon');
    no('tree', 'christmas tree');
    no('santa', 'santa claus');
  });
});

describe('nothing and nonsense', () => {
  it('empty, punctuation only and the wrong thing are wrong', () => {
    no('', 'cat');
    no('   ', 'cat');
    no('!!!', 'cat');
    no('cat', '');
    no('a', 'cat');
    no('the', 'cat');
    no('lol', 'cat');
    no('xyzzy', 'cat');
  });
  it('does not blow up on odd input', () => {
    expect(() => matchGuess('😀😀', 'cat')).not.toThrow();
    expect(() => matchGuess('a'.repeat(5000), 'cat')).not.toThrow();
    expect(matchGuess('a'.repeat(5000), 'cat').right).toBe(false);
  });
});

describe('how alike, and the warmth words', () => {
  it('is 1 when right, 0 for nothing alike, and in between for a near miss', () => {
    expect(matchGuess('cat', 'cat').alike).toBe(1);
    expect(matchGuess('zzzzz', 'horse').alike).toBeLessThan(0.2);
    expect(matchGuess('house', 'horse').alike).toBeGreaterThanOrEqual(0.75);
    expect(matchGuess('pear', 'bear').alike).toBeGreaterThanOrEqual(0.55);
    expect(matchGuess('kitten', 'cat').alike).toBeLessThan(0.55);
  });
  it('warmth is bands of that, and the warmer of two wins', () => {
    expect(warmthOf(0)).toBe('cold');
    expect(warmthOf(0.36)).toBe('cool');
    expect(warmthOf(0.6)).toBe('warm');
    expect(warmthOf(0.8)).toBe('hot');
    expect(warmer('cool', 'warm')).toBe('warm');
    expect(warmer('hot', 'cold')).toBe('hot');
    expect(warmer('none', 'cold')).toBe('cold');
  });
});

describe('the small pieces', () => {
  it('edit distance counts a swap as one', () => {
    expect(editDistance('cat', 'cta')).toBe(1);
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(editDistance('', 'abc')).toBe(3);
    expect(editDistance('abcdef', 'xyz', 2)).toBeGreaterThan(2);
  });
  it('sounds folds the same way both sides', () => {
    expect(sounds('phone')).toBe(sounds('fone'));
    expect(sounds('cat')).toBe(sounds('kat'));
    expect(sounds('ciel')).toBe('ciel');
  });
  it('counts letters per word', () => {
    expect(letterCounts('ice cream')).toEqual([3, 5]);
    expect(letterCounts("rock 'n' roll")).toEqual([4, 1, 4]);
    expect(letterCounts('---')).toEqual([]);
  });
});

describe('the word list', () => {
  it('has plenty, all unique, all plain', () => {
    expect(DRAW_WORDS.length).toBeGreaterThan(150);
    expect(new Set(DRAW_WORDS).size).toBe(DRAW_WORDS.length);
    for (const w of DRAW_WORDS) expect(w).toMatch(/^[a-z ]+$/);
  });
  it('every word in the list gets itself, its plural-ish tidy forms and a typo, and none gets another', () => {
    for (const w of DRAW_WORDS) {
      expect(matchGuess(w, w).right, w).toBe(true);
      expect(matchGuess(`${w.toUpperCase()}!`, w).right, w).toBe(true);
      expect(matchGuess(`is it a ${w}?`, w).right, w).toBe(true);
    }
  });
  it('no two different words in the list take each other (no unfair collisions)', () => {
    const clashes: string[] = [];
    for (const a of DRAW_WORDS) for (const b of DRAW_WORDS) if (a !== b && matchGuess(a, b).right) clashes.push(`${a} -> ${b}`);
    // Real pairs the list holds on purpose: a plural form of a listed word, or the same thing said two ways.
    const allowed = new Set(['hand -> hands', 'hands -> hand', 'pancakes -> pancake', 'grape -> grapes', 'grapes -> grape']);
    expect(clashes.filter((c) => !allowed.has(c))).toEqual([]);
  });
  it('picks one at random, and not one it was told to skip', () => {
    expect(pickWord(() => 0)).toBe(DRAW_WORDS[0]);
    expect(pickWord(() => 0.999999)).toBe(DRAW_WORDS[DRAW_WORDS.length - 1]);
    expect(pickWord(() => 0, [DRAW_WORDS[0]])).toBe(DRAW_WORDS[1]);
  });
});
