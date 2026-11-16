// The words a round can use. DRAW_WORDS are the built-in list: things that are fun to draw and quick to guess. KNOWN_EXTRA
// is not offered to anyone: it is only there so the matcher can tell a typo from a different word (a guess of "house" is
// not a slip for "horse"). Both lists are plain lower case, one thing per entry.

export const DRAW_WORDS: readonly string[] = [
  'cat', 'dog', 'horse', 'bird', 'fish', 'whale', 'shark', 'turtle', 'frog', 'snail', 'snake', 'spider', 'butterfly', 'bee', 'ant',
  'owl', 'penguin', 'elephant', 'giraffe', 'monkey', 'rabbit', 'mouse', 'duck', 'chicken', 'pig', 'cow', 'sheep', 'lion', 'tiger', 'bear',
  'hedgehog', 'octopus', 'crab', 'dolphin', 'dinosaur', 'dragon', 'unicorn', 'ghost', 'robot', 'alien', 'pirate', 'wizard', 'mermaid', 'knight',
  'apple', 'banana', 'pear', 'grapes', 'strawberry', 'cherry', 'lemon', 'pineapple', 'watermelon', 'carrot', 'mushroom', 'pizza', 'burger', 'cake', 'cookie',
  'ice cream', 'donut', 'sandwich', 'egg', 'bread', 'cheese', 'popcorn', 'coffee', 'teapot', 'cupcake', 'pancakes', 'sushi', 'taco',
  'house', 'castle', 'tent', 'bridge', 'lighthouse', 'windmill', 'church', 'barn', 'igloo', 'treehouse', 'tower', 'door', 'window', 'ladder',
  'car', 'bus', 'train', 'boat', 'ship', 'plane', 'helicopter', 'rocket', 'bicycle', 'tractor', 'submarine', 'hot air balloon', 'skateboard', 'sailboat',
  'sun', 'moon', 'star', 'cloud', 'rainbow', 'lightning', 'snowman', 'tree', 'flower', 'cactus', 'volcano', 'mountain', 'island', 'waterfall', 'campfire', 'umbrella',
  'chair', 'table', 'bed', 'lamp', 'clock', 'key', 'book', 'candle', 'mirror', 'bucket', 'broom', 'scissors', 'toothbrush', 'television', 'telephone',
  'guitar', 'piano', 'drum', 'trumpet', 'violin', 'microphone', 'headphones', 'camera', 'paintbrush', 'pencil', 'crown', 'sword', 'shield', 'treasure chest', 'anchor',
  'glasses', 'hat', 'shoe', 'sock', 'backpack', 'ring', 'balloon', 'kite', 'present', 'bell', 'flag', 'heart', 'skull', 'bone', 'magnet', 'light bulb',
  'football', 'basketball', 'tennis racket', 'fishing rod', 'bow and arrow', 'chess', 'dice', 'jigsaw puzzle', 'snowboard', 'trophy', 'medal',
  'witch', 'vampire', 'scarecrow', 'pumpkin', 'christmas tree', 'santa claus', 'reindeer', 'gingerbread man', 'snowflake',
  'doctor', 'astronaut', 'chef', 'firefighter', 'clown', 'ninja', 'cowboy', 'superhero', 'baby', 'hands', 'eye', 'tooth',
];

export const KNOWN_EXTRA: readonly string[] = [
  'bar', 'bat', 'bag', 'ball', 'band', 'bank', 'beach', 'bee', 'bell', 'belt', 'bike', 'bin', 'bit', 'boot', 'bowl', 'box', 'boy', 'brain', 'branch', 'brick',
  'brush', 'bug', 'cage', 'can', 'cap', 'card', 'cart', 'cave', 'chain', 'chair', 'chest', 'chin', 'circle', 'city', 'claw', 'clown', 'coat', 'comb', 'cone',
  'corn', 'cup', 'dad', 'dart', 'deer', 'desk', 'dish', 'doll', 'dot', 'dress', 'drop', 'ear', 'farm', 'fan', 'fence', 'field', 'finger', 'fire', 'fist', 'flag',
  'floor', 'foot', 'fork', 'fox', 'game', 'gate', 'ghost', 'girl', 'glass', 'glove', 'goat', 'gold', 'grape', 'grass', 'hair', 'hammer', 'hand', 'hen', 'hill',
  'hole', 'hook', 'hose', 'jar', 'jet', 'jug', 'knee', 'knife', 'lake', 'leaf', 'leg', 'lip', 'log', 'mail', 'map', 'mask', 'meat', 'milk', 'mom', 'moon',
  'nail', 'neck', 'nest', 'net', 'nose', 'nut', 'oar', 'oven', 'paint', 'pan', 'park', 'path', 'pea', 'pie', 'pin', 'pipe', 'plant', 'plate', 'pond', 'pot',
  'rain', 'rat', 'road', 'rock', 'roof', 'rope', 'rose', 'sail', 'salt', 'sand', 'saw', 'seed', 'shell', 'shirt', 'shop', 'sink', 'skirt', 'sky', 'slide',
  'soap', 'sofa', 'spoon', 'stair', 'stairs', 'stick', 'stone', 'stool', 'straw', 'swan', 'swing', 'tail', 'tape', 'tire', 'toe', 'tool', 'toy', 'tray', 'truck',
  'tub', 'vase', 'wall', 'watch', 'wave', 'web', 'wheel', 'wing', 'wolf', 'wood', 'worm', 'yard', 'zebra', 'hear', 'near', 'peer', 'beer', 'dear', 'fear', 'gear',
  'cloudy', 'house', 'mouse', 'horse', 'cheese', 'goose', 'moose', 'sleep', 'sheep', 'shape', 'share', 'shake', 'plan', 'plane', 'plant', 'plate', 'train', 'trail',
  'brain', 'drain', 'grain', 'rain', 'chin', 'chip', 'ship', 'shop', 'whale', 'while', 'white', 'wheel', 'wheat', 'heat', 'heart', 'hearth', 'earth', 'pearl',
];

/** Lower-case, letters only, so a list entry can be compared with a squashed guess. */
const squash = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

let known: Set<string> | null = null;
/** True when `squashed` is a word the lists know. Used to tell a typo from a different word. */
export function isKnownWord(squashed: string): boolean {
  if (!known) known = new Set([...DRAW_WORDS, ...KNOWN_EXTRA].map(squash));
  return known.has(squashed);
}

/** One built-in word at random, never one in `not` (compared in lower case). Pure given `rand`. */
export function pickWord(rand: () => number = Math.random, not: readonly string[] = []): string {
  const skip = new Set(not.map((w) => w.toLowerCase()));
  const pool = DRAW_WORDS.filter((w) => !skip.has(w));
  const list = pool.length ? pool : DRAW_WORDS;
  return list[Math.min(list.length - 1, Math.floor(rand() * list.length))];
}
