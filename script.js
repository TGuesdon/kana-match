// Table des kanas de base : [romaji, hiragana, katakana]
const KANA = [
  ['a', 'あ', 'ア'], ['i', 'い', 'イ'], ['u', 'う', 'ウ'], ['e', 'え', 'エ'], ['o', 'お', 'オ'],
  ['ka', 'か', 'カ'], ['ki', 'き', 'キ'], ['ku', 'く', 'ク'], ['ke', 'け', 'ケ'], ['ko', 'こ', 'コ'],
  ['sa', 'さ', 'サ'], ['shi', 'し', 'シ'], ['su', 'す', 'ス'], ['se', 'せ', 'セ'], ['so', 'そ', 'ソ'],
  ['ta', 'た', 'タ'], ['chi', 'ち', 'チ'], ['tsu', 'つ', 'ツ'], ['te', 'て', 'テ'], ['to', 'と', 'ト'],
  ['na', 'な', 'ナ'], ['ni', 'に', 'ニ'], ['nu', 'ぬ', 'ヌ'], ['ne', 'ね', 'ネ'], ['no', 'の', 'ノ'],
  ['ha', 'は', 'ハ'], ['hi', 'ひ', 'ヒ'], ['fu', 'ふ', 'フ'], ['he', 'へ', 'ヘ'], ['ho', 'ほ', 'ホ'],
  ['ma', 'ま', 'マ'], ['mi', 'み', 'ミ'], ['mu', 'む', 'ム'], ['me', 'め', 'メ'], ['mo', 'も', 'モ'],
  ['ya', 'や', 'ヤ'], ['yu', 'ゆ', 'ユ'], ['yo', 'よ', 'ヨ'],
  ['ra', 'ら', 'ラ'], ['ri', 'り', 'リ'], ['ru', 'る', 'ル'], ['re', 'れ', 'レ'], ['ro', 'ろ', 'ロ'],
  ['wa', 'わ', 'ワ'], ['wo', 'を', 'ヲ'], ['n', 'ん', 'ン'],
];

// Groupes de kanas faciles à confondre (par romaji), toutes écritures confondues
const LOOKALIKES = [
  // Hiragana
  ['shi', 'tsu'],        // し つ
  ['sa', 'chi', 'ki'],   // さ ち き
  ['sa', 'se'],          // さ せ
  ['ha', 'ho', 'ke'],    // は ほ け
  ['nu', 'me'],          // ぬ め
  ['ne', 're', 'wa'],    // ね れ わ
  ['ru', 'ro'],          // る ろ
  ['i', 'ri'],           // い り
  ['ta', 'na'],          // た な
  ['ma', 'mo'],          // ま も
  ['a', 'o'],            // あ お
  ['ko', 'ni'],          // こ に
  ['u', 'ra'],           // う ら
  // Katakana
  ['n', 'so'],           // ン ソ
  ['ku', 'ke', 'ta'],    // ク ケ タ
  ['u', 'wa', 'fu'],     // ウ ワ フ
  ['nu', 'su'],          // ヌ ス
  ['ko', 'yu', 'ro'],    // コ ユ ロ
  ['chi', 'te'],         // チ テ
  ['a', 'ma'],           // ア マ
  ['ru', 're'],          // ル レ
  ['ra', 'wo', 'fu'],    // ラ ヲ フ
  ['no', 'me', 'na'],    // ノ メ ナ
  ['e', 'ni'],           // エ ニ
];

// romaji -> ensemble de ses sosies
const LOOKALIKE_MAP = {};
LOOKALIKES.forEach((group) => group.forEach((romaji) => {
  LOOKALIKE_MAP[romaji] ??= new Set();
  group.forEach((other) => other !== romaji && LOOKALIKE_MAP[romaji].add(other));
}));

const PAIRS_PER_ROUND = 5;
const STORAGE_KEY = 'kana-match:mistakes';
const MAX_MISTAKES = 5;   // plafond pour qu'une paire ne monopolise pas les séries
const MISTAKE_WEIGHT = 3; // chaque erreur ajoute ce poids au tirage (poids de base : 1)
const LOOKALIKE_BONUS = 0.5; // bonus de base pour un kana qui a des sosies
const LOOKALIKE_BOOST = 2;   // multiplicateur des sosies d'un kana déjà tiré dans la série

const hiraList = document.getElementById('hiragana-list');
const kataList = document.getElementById('katakana-list');
const feedback = document.getElementById('feedback');
const newRoundBtn = document.getElementById('new-round');

let selected = null; // { button, romaji, side }
let matchedCount = 0;
let errorCount = 0;
let missedThisRound = new Set(); // romaji des paires ratées pendant la série en cours

// Nombre d'erreurs par romaji, persisté dans le navigateur (pas de compte)
function loadMistakes() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveMistakes() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mistakes));
  } catch {
    // stockage indisponible (navigation privée…) : on continue sans mémoire
  }
}

const mistakes = loadMistakes();

function addMistake(romaji) {
  mistakes[romaji] = Math.min(MAX_MISTAKES, (mistakes[romaji] || 0) + 1);
}

function removeMistake(romaji) {
  if (!mistakes[romaji]) return;
  mistakes[romaji]--;
  if (mistakes[romaji] === 0) delete mistakes[romaji];
}

function shuffle(array) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function baseWeight(romaji) {
  const lookalikeBonus = LOOKALIKE_MAP[romaji] ? LOOKALIKE_BONUS : 0;
  return 1 + lookalikeBonus + MISTAKE_WEIGHT * (mistakes[romaji] || 0);
}

// Tirage pondéré sans remise : les paires souvent ratées et les kanas qui se
// ressemblent sortent plus souvent, et les sosies ont tendance à sortir ensemble
function weightedSample(items, count) {
  const pool = items.map((item) => ({ item, weight: baseWeight(item[0]) }));
  const result = [];
  while (result.length < count && pool.length) {
    const total = pool.reduce((sum, p) => sum + p.weight, 0);
    let r = Math.random() * total;
    const index = pool.findIndex((p) => (r -= p.weight) < 0);
    const [picked] = pool.splice(index === -1 ? pool.length - 1 : index, 1);
    result.push(picked.item);
    const lookalikes = LOOKALIKE_MAP[picked.item[0]];
    if (lookalikes) pool.forEach((p) => lookalikes.has(p.item[0]) && (p.weight *= LOOKALIKE_BOOST));
  }
  return result;
}

function createCard(char, romaji, side) {
  const li = document.createElement('li');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'card';
  btn.dataset.romaji = romaji;
  btn.dataset.side = side;
  btn.setAttribute('aria-label', `${side} ${char}`);
  btn.innerHTML = `<span class="kana">${char}</span><span class="romaji">${romaji}</span>`;
  btn.addEventListener('click', () => onCardClick(btn));
  li.appendChild(btn);
  return li;
}

function setFeedback(text, type = '') {
  feedback.textContent = text;
  feedback.className = `feedback ${type}`.trim();
}

function onCardClick(btn) {
  if (btn.classList.contains('matched')) return;

  // Pas encore de sélection, ou clic dans la même colonne : on (re)sélectionne
  if (!selected || selected.side === btn.dataset.side) {
    if (selected) selected.button.classList.remove('selected');
    if (selected && selected.button === btn) {
      selected = null;
      return;
    }
    btn.classList.add('selected');
    selected = { button: btn, romaji: btn.dataset.romaji, side: btn.dataset.side };
    return;
  }

  const first = selected.button;
  first.classList.remove('selected');
  selected = null;

  if (first.dataset.romaji === btn.dataset.romaji) {
    first.classList.add('matched');
    btn.classList.add('matched');
    first.disabled = true;
    btn.disabled = true;
    matchedCount++;
    // Trouvée sans erreur : la paire redevient un peu moins prioritaire
    if (!missedThisRound.has(btn.dataset.romaji)) {
      removeMistake(btn.dataset.romaji);
      saveMistakes();
    }
    if (matchedCount === PAIRS_PER_ROUND) {
      setFeedback(errorCount === 0 ? 'Parfait ! すごい！ 🎉' : 'Bravo, série terminée ! 🎉', 'success');
    } else {
      setFeedback(`Bien joué : « ${btn.dataset.romaji} »`, 'success');
    }
  } else {
    errorCount++;
    // Les deux paires confondues reviendront plus souvent
    [first.dataset.romaji, btn.dataset.romaji].forEach((romaji) => {
      if (!missedThisRound.has(romaji)) addMistake(romaji);
      missedThisRound.add(romaji);
    });
    saveMistakes();
    setFeedback('Pas tout à fait, réessaie !', 'error');
    [first, btn].forEach((b) => {
      b.classList.remove('wrong');
      void b.offsetWidth; // relance l'animation
      b.classList.add('wrong');
      setTimeout(() => b.classList.remove('wrong'), 400);
    });
  }
}

function newRound() {
  const pairs = weightedSample(KANA, PAIRS_PER_ROUND);
  selected = null;
  matchedCount = 0;
  errorCount = 0;
  missedThisRound = new Set();

  hiraList.replaceChildren(...shuffle(pairs).map(([r, h]) => createCard(h, r, 'hiragana')));
  kataList.replaceChildren(...shuffle(pairs).map(([r, , k]) => createCard(k, r, 'katakana')));

  setFeedback('Touche un caractère pour commencer.');
}

newRoundBtn.addEventListener('click', newRound);
newRound();
