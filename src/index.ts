import {
  World,
  createSystem,
  PanelUI,
  PanelDocument,
  UIKitDocument,
  UIKit,
  Follower,
  ScreenSpace,
  eq,
  Entity,
  InputComponent,
} from '@iwsdk/core';
import {
  BoxGeometry,
  CylinderGeometry,
  SphereGeometry,
  TorusGeometry,
  ConeGeometry,
  RingGeometry,
  MeshStandardMaterial,
  MeshBasicMaterial,
  Mesh,
  Group,
  Vector3,
  Color,
  PointLight,
  AmbientLight,
  DirectionalLight,
  FogExp2,
  LineSegments,
  EdgesGeometry,
  LineBasicMaterial,
  Raycaster,
  Vector2,
  PlaneGeometry,
  AdditiveBlending,
} from '@iwsdk/core';

// ─── Roulette Data ───
const EURO_SEQUENCE = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
const AMER_SEQUENCE = [0,28,9,26,30,11,7,20,32,17,5,22,34,15,3,24,36,13,1,37,27,10,25,29,12,8,19,31,18,6,21,33,16,4,23,35,14,2];

const RED_NUMBERS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const isRed = (n: number) => RED_NUMBERS.has(n);
const isBlack = (n: number) => n > 0 && !RED_NUMBERS.has(n);
const numberColor = (n: number): string => n === 0 || n === 37 ? '#00aa44' : isRed(n) ? '#cc2222' : '#222222';

// ─── Themes ───
interface Theme { name: string; grid: string; accent: string; bg: string; fog: string; wall: string; wheel: string; table: string; glow: string; }
const THEMES: Theme[] = [
  { name: 'Neon Holodeck', grid: '#00ffff', accent: '#ff00ff', bg: '#000a14', fog: '#000810', wall: '#001428', wheel: '#003344', table: '#002233', glow: '#00ffcc' },
  { name: 'Crimson Casino', grid: '#ff3333', accent: '#ffaa00', bg: '#140005', fog: '#100004', wall: '#280010', wheel: '#441111', table: '#331111', glow: '#ff6644' },
  { name: 'Gold Palace', grid: '#ccaa00', accent: '#ff8844', bg: '#0a0800', fog: '#080600', wall: '#1a1400', wheel: '#332800', table: '#2a2000', glow: '#ffcc44' },
  { name: 'Ultra Violet', grid: '#aa44ff', accent: '#ff44aa', bg: '#0a0014', fog: '#080010', wall: '#140028', wheel: '#221144', table: '#1a0d33', glow: '#cc88ff' },
  { name: 'Emerald Table', grid: '#00ff88', accent: '#00ccff', bg: '#000a06', fog: '#000804', wall: '#001410', wheel: '#003322', table: '#002a1a', glow: '#44ffaa' },
];

// ─── Bet Types ───
type BetType = 'straight' | 'red' | 'black' | 'odd' | 'even' | 'low' | 'high' | 'dozen1' | 'dozen2' | 'dozen3' | 'col1' | 'col2' | 'col3' | 'street' | 'line' | 'five' | 'split' | 'corner';
interface Bet { type: BetType; number?: number; numbers?: number[]; amount: number; }

// Street bet: 3 numbers in a row (e.g. 1-2-3, 4-5-6, ..., 34-35-36) pays 11:1
// Line bet: 6 numbers across 2 rows (e.g. 1-6) pays 5:1
// Five bet (American only): 0-00-1-2-3 pays 6:1
function evaluateBet(bet: Bet, result: number): number {
  switch (bet.type) {
    case 'straight': return bet.number === result ? bet.amount * 35 : 0;
    case 'red': return isRed(result) ? bet.amount * 2 : 0;
    case 'black': return isBlack(result) ? bet.amount * 2 : 0;
    case 'odd': return result > 0 && result <= 36 && result % 2 === 1 ? bet.amount * 2 : 0;
    case 'even': return result > 0 && result <= 36 && result % 2 === 0 ? bet.amount * 2 : 0;
    case 'low': return result >= 1 && result <= 18 ? bet.amount * 2 : 0;
    case 'high': return result >= 19 && result <= 36 ? bet.amount * 2 : 0;
    case 'dozen1': return result >= 1 && result <= 12 ? bet.amount * 3 : 0;
    case 'dozen2': return result >= 13 && result <= 24 ? bet.amount * 3 : 0;
    case 'dozen3': return result >= 25 && result <= 36 ? bet.amount * 3 : 0;
    case 'col1': return result > 0 && result % 3 === 1 ? bet.amount * 3 : 0;
    case 'col2': return result > 0 && result % 3 === 2 ? bet.amount * 3 : 0;
    case 'col3': return result > 0 && result % 3 === 0 && result > 0 ? bet.amount * 3 : 0;
    case 'street': return bet.numbers && bet.numbers.includes(result) ? bet.amount * 12 : 0;
    case 'line': return bet.numbers && bet.numbers.includes(result) ? bet.amount * 6 : 0;
    case 'five': return [0, 37, 1, 2, 3].includes(result) ? bet.amount * 7 : 0;
    case 'split': return bet.numbers && bet.numbers.includes(result) ? bet.amount * 18 : 0;
    case 'corner': return bet.numbers && bet.numbers.includes(result) ? bet.amount * 9 : 0;
    default: return 0;
  }
}

// Generate street bet number sets: each row of 3 (1-2-3, 4-5-6, ..., 34-35-36)
const STREETS: number[][] = [];
for (let i = 0; i < 12; i++) STREETS.push([i * 3 + 1, i * 3 + 2, i * 3 + 3]);

// Generate line bet number sets: each pair of adjacent rows
const LINES: number[][] = [];
for (let i = 0; i < 11; i++) LINES.push([...STREETS[i], ...STREETS[i + 1]]);

// ─── French Call Bets (European wheel positions) ───
// Voisins du Zero: 17 numbers near zero (22,18,29,7,28,12,35,3,26,0,32,15,19,4,21,2,25)
const VOISINS_DU_ZERO = [22,18,29,7,28,12,35,3,26,0,32,15,19,4,21,2,25];
// Tiers du Cylindre: 12 numbers opposite zero (27,13,36,11,30,8,23,10,5,24,16,33)
const TIERS_DU_CYLINDRE = [27,13,36,11,30,8,23,10,5,24,16,33];
// Orphelins: 8 remaining numbers (1,20,14,31,9,17,34,6)
const ORPHELINS = [1,20,14,31,9,17,34,6];
// Jeu Zero: 7 numbers closest to zero (12,35,3,26,0,32,15)
const JEU_ZERO = [12,35,3,26,0,32,15];

function getNeighbors(number: number, count: number, isAmerican: boolean): number[] {
  const seq = isAmerican ? AMER_SEQUENCE : EURO_SEQUENCE;
  const idx = seq.indexOf(number);
  if (idx < 0) return [number];
  const result: number[] = [];
  for (let i = -count; i <= count; i++) {
    const pos = (idx + i + seq.length) % seq.length;
    result.push(seq[pos]);
  }
  return result;
}

// ─── Achievements ───
interface Achievement { id: string; name: string; desc: string; check: (s: GameState) => boolean; }
const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_spin', name: 'First Spin', desc: 'Spin the wheel', check: s => s.totalSpins >= 1 },
  { id: 'ten_spins', name: 'Regular', desc: 'Spin 10 times', check: s => s.totalSpins >= 10 },
  { id: 'fifty_spins', name: 'Veteran', desc: 'Spin 50 times', check: s => s.totalSpins >= 50 },
  { id: 'hundred_spins', name: 'High Roller', desc: 'Spin 100 times', check: s => s.totalSpins >= 100 },
  { id: 'five_hundred', name: 'Whale', desc: 'Spin 500 times', check: s => s.totalSpins >= 500 },
  { id: 'first_win', name: 'Beginner Luck', desc: 'Win a bet', check: s => s.totalWins >= 1 },
  { id: 'ten_wins', name: 'Winner', desc: 'Win 10 bets', check: s => s.totalWins >= 10 },
  { id: 'fifty_wins', name: 'Sharp', desc: 'Win 50 bets', check: s => s.totalWins >= 50 },
  { id: 'hundred_wins', name: 'Pro Gambler', desc: 'Win 100 bets', check: s => s.totalWins >= 100 },
  { id: 'straight_hit', name: 'Straight Shot', desc: 'Hit a straight bet (35:1)', check: s => s.straightHits >= 1 },
  { id: 'five_straight', name: 'Sharpshooter', desc: 'Hit 5 straight bets', check: s => s.straightHits >= 5 },
  { id: 'win_100', name: 'Nice Haul', desc: 'Win $100+ in one spin', check: s => s.bestSingleWin >= 100 },
  { id: 'win_500', name: 'Big Score', desc: 'Win $500+ in one spin', check: s => s.bestSingleWin >= 500 },
  { id: 'win_1000', name: 'Jackpot', desc: 'Win $1000+ in one spin', check: s => s.bestSingleWin >= 1000 },
  { id: 'win_5000', name: 'Mega Win', desc: 'Win $5000+ in one spin', check: s => s.bestSingleWin >= 5000 },
  { id: 'streak_3', name: 'Hot Hand', desc: '3-win streak', check: s => s.bestStreak >= 3 },
  { id: 'streak_5', name: 'On Fire', desc: '5-win streak', check: s => s.bestStreak >= 5 },
  { id: 'streak_8', name: 'Untouchable', desc: '8-win streak', check: s => s.bestStreak >= 8 },
  { id: 'streak_10', name: 'Legendary', desc: '10-win streak', check: s => s.bestStreak >= 10 },
  { id: 'wagered_1k', name: 'Spender', desc: 'Wager $1000 total', check: s => s.totalWagered >= 1000 },
  { id: 'wagered_10k', name: 'Big Spender', desc: 'Wager $10K total', check: s => s.totalWagered >= 10000 },
  { id: 'wagered_50k', name: 'High Stakes', desc: 'Wager $50K total', check: s => s.totalWagered >= 50000 },
  { id: 'won_total_1k', name: 'Earner', desc: 'Win $1000 total', check: s => s.totalWon >= 1000 },
  { id: 'won_total_10k', name: 'Rich', desc: 'Win $10K total', check: s => s.totalWon >= 10000 },
  { id: 'red_5', name: 'Red Hot', desc: 'Win 5 red bets in a row', check: s => s.redStreak >= 5 },
  { id: 'black_5', name: 'Dark Horse', desc: 'Win 5 black bets in a row', check: s => s.blackStreak >= 5 },
  { id: 'zero_hit', name: 'Green Machine', desc: 'Land on zero', check: s => s.zeroHits >= 1 },
  { id: 'zero_5', name: 'House Edge', desc: 'Land on zero 5 times', check: s => s.zeroHits >= 5 },
  { id: 'double_zero', name: 'Double Trouble', desc: 'Land on 00 (American)', check: s => s.doubleZeroHits >= 1 },
  { id: 'all_bets', name: 'Diversified', desc: 'Place all bet types', check: s => s.betTypesUsed.size >= 13 },
  { id: 'games_10', name: 'Regular Player', desc: 'Play 10 sessions', check: s => s.sessionsPlayed >= 10 },
  { id: 'games_50', name: 'Dedicated', desc: 'Play 50 sessions', check: s => s.sessionsPlayed >= 50 },
  { id: 'daily_done', name: 'Daily Gambler', desc: 'Complete a daily challenge', check: s => s.dailiesCompleted >= 1 },
  { id: 'daily_3', name: 'Daily Devotee', desc: 'Complete 3 dailies', check: s => s.dailiesCompleted >= 3 },
  { id: 'daily_7', name: 'Weekly Warrior', desc: 'Complete 7 dailies', check: s => s.dailiesCompleted >= 7 },
  { id: 'skin_unlock', name: 'Fashionista', desc: 'Unlock a chip skin', check: s => s.skinsUnlocked >= 2 },
  { id: 'theme_all', name: 'Theme Tourist', desc: 'Use all themes', check: s => s.themesUsed.size >= 5 },
  { id: 'level_10', name: 'Rising Star', desc: 'Reach Level 10', check: s => s.level >= 10 },
  { id: 'level_25', name: 'Casino Veteran', desc: 'Reach Level 25', check: s => s.level >= 25 },
  { id: 'level_50', name: 'Casino Legend', desc: 'Reach Level 50', check: s => s.level >= 50 },
];

// ─── Game State ───
interface GameState {
  totalSpins: number; totalWins: number; totalWagered: number; totalWon: number;
  bestSingleWin: number; bestStreak: number; straightHits: number;
  redStreak: number; blackStreak: number; zeroHits: number; doubleZeroHits: number;
  betTypesUsed: Set<string>; sessionsPlayed: number; dailiesCompleted: number;
  skinsUnlocked: number; themesUsed: Set<string>; level: number; xp: number;
  hotNumbers: Map<number, number>; achievements: Set<string>;
  chipSkin: number; themeIdx: number;
}

type UIState = 'title' | 'modes' | 'table' | 'playing' | 'spinning' | 'result' | 'gameover' | 'leaderboard' | 'achievements' | 'stats' | 'settings' | 'help' | 'pause' | 'chips' | 'callbets' | 'autospin' | 'racetrack' | 'favorites' | 'tutorial' | 'quickbets';
type GameMode = 'single' | 'session' | 'marathon' | 'high-roller' | 'daily' | 'practice' | 'streak' | 'tournament';

function loadState(): GameState {
  const raw = localStorage.getItem('neon-roulette-state');
  if (raw) {
    const p = JSON.parse(raw);
    return {
      ...p,
      betTypesUsed: new Set(p.betTypesUsed || []),
      themesUsed: new Set(p.themesUsed || []),
      hotNumbers: new Map(Object.entries(p.hotNumbers || {}).map(([k, v]) => [Number(k), v as number])),
      achievements: new Set(p.achievements || []),
    };
  }
  return {
    totalSpins: 0, totalWins: 0, totalWagered: 0, totalWon: 0,
    bestSingleWin: 0, bestStreak: 0, straightHits: 0,
    redStreak: 0, blackStreak: 0, zeroHits: 0, doubleZeroHits: 0,
    betTypesUsed: new Set(), sessionsPlayed: 0, dailiesCompleted: 0,
    skinsUnlocked: 1, themesUsed: new Set(), level: 1, xp: 0,
    hotNumbers: new Map(), achievements: new Set(),
    chipSkin: 0, themeIdx: 0,
  };
}

function saveState(s: GameState) {
  const obj = {
    ...s,
    betTypesUsed: [...s.betTypesUsed],
    themesUsed: [...s.themesUsed],
    hotNumbers: Object.fromEntries(s.hotNumbers),
    achievements: [...s.achievements],
  };
  localStorage.setItem('neon-roulette-state', JSON.stringify(obj));
}

// ─── Leaderboard ───
interface LeaderEntry { score: number; mode: string; spins: number; date: string; }
function loadLeaderboard(): LeaderEntry[] {
  const raw = localStorage.getItem('neon-roulette-leaders');
  return raw ? JSON.parse(raw) : [];
}
function saveLeaderboard(board: LeaderEntry[]) {
  localStorage.setItem('neon-roulette-leaders', JSON.stringify(board.slice(0, 20)));
}

// ─── Favorite Bets ───
interface FavoriteBet { name: string; bets: Bet[]; }
function loadFavorites(): (FavoriteBet | null)[] {
  const raw = localStorage.getItem('neon-roulette-favs');
  if (raw) return JSON.parse(raw);
  return [null, null, null, null, null];
}
function saveFavorites(favs: (FavoriteBet | null)[]) {
  localStorage.setItem('neon-roulette-favs', JSON.stringify(favs));
}

// ─── Dealer Messages ───
const DEALER_GREETINGS = [
  'Welcome to the Neon Holodeck Casino!',
  'Step up to the table, friend.',
  'The wheel awaits your wager.',
  'Good luck tonight!',
  'May fortune favor the bold.',
];
const DEALER_BET_COMMENTS: Record<string, string[]> = {
  straight: ['Bold choice! 35 to 1 odds.', 'A straight bet, the purest gamble.', 'One number, one dream.'],
  red: ['Red it is! Classic.', 'Feeling the crimson tonight?', 'Red, the color of fortune.'],
  black: ['Black, the dark horse bet.', 'Riding the shadows tonight.', 'Black bets, bold moves.'],
  split: ['Split bet, doubling your coverage.', 'Two numbers, 17 to 1.'],
  corner: ['Corner play! Covering 4.', 'Smart spread on the corners.'],
  dozen: ['Dozen bet, good coverage.', 'A third of the board is yours.'],
  street: ['Street bet, three in a row.', 'Taking the whole street!'],
  default: ['Bet placed!', 'Good luck with that one.', 'Interesting choice.'],
};
const DEALER_WIN = [
  'Winner! The table pays.',
  'Congratulations! A fine win.',
  'The odds were with you!',
  'Well played!',
  'Your bankroll grows!',
];
const DEALER_BIG_WIN = [
  'Incredible! A massive payout!',
  'The house is shaking!',
  'What a spectacular hit!',
  'History in the making!',
];
const DEALER_LOSE = [
  'Not this time.',
  'The wheel has spoken.',
  'Better luck on the next spin.',
  'The house wins this round.',
];
const DEALER_SPIN = [
  'No more bets! The wheel spins!',
  'Round and round she goes!',
  'Spinning!',
  'The wheel is in motion!',
];

function randomFrom<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

// ─── Tutorial Steps ───
const TUTORIAL_STEPS = [
  { title: 'Welcome!', desc: 'This is Neon Roulette VR -- a full casino roulette experience in your browser or headset.' },
  { title: 'The Wheel', desc: 'European wheels have 37 pockets (0-36). American wheels add a 00 pocket (38 total).' },
  { title: 'Placing Bets', desc: 'Click or point at the betting table to place chips. Use number keys 1-5 to select chip values ($1/$5/$10/$25/$100).' },
  { title: 'Bet Types', desc: 'Straight (35:1) = one number. Red/Black (1:1) = color. Split (17:1) = two numbers. Many more options!' },
  { title: 'Spinning', desc: 'Press SPACE or click Spin when you have bets placed. Watch the ball and hope for the best!' },
  { title: 'Special Bets', desc: 'Try French call bets (Voisins, Tiers, Orphelins) or neighbor bets for wider coverage.' },
  { title: 'Features', desc: 'Auto-spin, Martingale doubling, La Partage/En Prison rules, favorite bets, and 8 game modes await!' },
  { title: 'VR Controls', desc: 'Right trigger = spin, A = continue/rebet, B = pause. Left trigger = cycle chips, X = clear, Y = call bets, grip = double.' },
];

// ─── Audio ───
let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let sfxGain: GainNode | null = null;
let musicGain: GainNode | null = null;
let masterVol = 1, sfxVol = 1, musicVol = 1;
let droneOsc1: OscillatorNode | null = null;
let droneOsc2: OscillatorNode | null = null;

function initAudio() {
  if (audioCtx) return;
  audioCtx = new AudioContext();
  masterGain = audioCtx.createGain(); masterGain.connect(audioCtx.destination);
  sfxGain = audioCtx.createGain(); sfxGain.connect(masterGain);
  musicGain = audioCtx.createGain(); musicGain.connect(masterGain);
  startDrone();
}

function startDrone() {
  if (!audioCtx || !musicGain) return;
  droneOsc1 = audioCtx.createOscillator(); droneOsc1.type = 'sine'; droneOsc1.frequency.value = 55;
  const g1 = audioCtx.createGain(); g1.gain.value = 0.06; droneOsc1.connect(g1); g1.connect(musicGain);
  droneOsc2 = audioCtx.createOscillator(); droneOsc2.type = 'triangle'; droneOsc2.frequency.value = 82.5;
  const g2 = audioCtx.createGain(); g2.gain.value = 0.04; droneOsc2.connect(g2); g2.connect(musicGain);
  const lfo = audioCtx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.15;
  const lfoGain = audioCtx.createGain(); lfoGain.gain.value = 0.02;
  lfo.connect(lfoGain); lfoGain.connect(g1.gain);
  droneOsc1.start(); droneOsc2.start(); lfo.start();
}

function playSfx(freq: number, type: OscillatorType = 'sine', dur = 0.12, vol = 0.15) {
  if (!audioCtx || !sfxGain) return;
  const osc = audioCtx.createOscillator(); osc.type = type;
  osc.frequency.value = freq * (0.95 + Math.random() * 0.1);
  const g = audioCtx.createGain(); g.gain.value = vol;
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
  osc.connect(g); g.connect(sfxGain); osc.start(); osc.stop(audioCtx.currentTime + dur);
}

function playSpinSound() { playSfx(220, 'sawtooth', 0.08, 0.1); }
function playBallBounce() { playSfx(880, 'triangle', 0.06, 0.12); }
function playBallSettle() {
  playSfx(440, 'sine', 0.2, 0.15);
  setTimeout(() => playSfx(660, 'sine', 0.15, 0.12), 100);
}
function playWin() {
  [660, 880, 1100, 1320].forEach((f, i) => setTimeout(() => playSfx(f, 'sine', 0.2, 0.15), i * 80));
}
function playLose() {
  [440, 330, 220].forEach((f, i) => setTimeout(() => playSfx(f, 'sawtooth', 0.15, 0.1), i * 100));
}
function playChipPlace() { playSfx(1200, 'square', 0.05, 0.08); }
function playClick() { playSfx(1000, 'sine', 0.04, 0.1); }
function playAchievement() {
  [660, 880, 1100, 1320, 1540].forEach((f, i) => setTimeout(() => playSfx(f, 'sine', 0.15, 0.12), i * 60));
}
function playCountdown() { playSfx(550, 'sine', 0.1, 0.1); }
function playGo() { playSfx(880, 'sine', 0.2, 0.15); }
function playStraightWin() {
  [440, 660, 880, 1100, 1320, 1540].forEach((f, i) => setTimeout(() => playSfx(f, 'triangle', 0.25, 0.18), i * 50));
}

// ─── Seeded PRNG ───
function mulberry32(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ─── Particle Pool ───
const POOL_SIZE = 150;
interface Particle { mesh: Mesh; vx: number; vy: number; vz: number; life: number; maxLife: number; active: boolean; }
let particles: Particle[] = [];

function initParticles(scene: { add(o: Mesh): void }) {
  const geo = new SphereGeometry(0.015, 4, 4);
  for (let i = 0; i < POOL_SIZE; i++) {
    const mat = new MeshBasicMaterial({ color: 0x00ffcc, transparent: true, blending: AdditiveBlending });
    const mesh = new Mesh(geo, mat);
    mesh.visible = false;
    scene.add(mesh);
    particles.push({ mesh, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, active: false });
  }
}

function emitParticles(x: number, y: number, z: number, count: number, color: string) {
  let emitted = 0;
  for (const p of particles) {
    if (emitted >= count) break;
    if (p.active) continue;
    p.mesh.position.set(x, y, z);
    (p.mesh.material as MeshBasicMaterial).color.set(color);
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.5 + Math.random() * 1.5;
    p.vx = Math.cos(angle) * speed * (0.5 + Math.random());
    p.vy = 1 + Math.random() * 2;
    p.vz = Math.sin(angle) * speed * (0.5 + Math.random());
    p.life = 0; p.maxLife = 0.5 + Math.random() * 0.8; p.active = true; p.mesh.visible = true;
    emitted++;
  }
}

function updateParticles(dt: number) {
  for (const p of particles) {
    if (!p.active) continue;
    p.life += dt;
    if (p.life >= p.maxLife) { p.active = false; p.mesh.visible = false; continue; }
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    p.vy -= 4.0 * dt;
    (p.mesh.material as MeshBasicMaterial).opacity = 1 - p.life / p.maxLife;
  }
}

// ─── Main ───
const container = document.getElementById('app') as HTMLDivElement;

async function main() {
  const world = await World.create(container, {
    xr: { offer: 'once' },
    render: { fov: 60 },
    features: {
      locomotion: {
        browserControls: true,
      } as Record<string, unknown>,
    },
  });

  const scene = world.scene;
  const camera = world.camera;
  const renderer = world.renderer;

  const state = loadState();
  let uiState: UIState = 'title';
  let gameMode: GameMode = 'session';
  let isAmerican = false;
  let bankroll = 1000;
  let bets: Bet[] = [];
  let lastBets: Bet[] = [];
  let selectedChip = 5;
  let currentResult = -1;
  let spinHistory: number[] = [];
  let sessionSpins = 0;
  let maxSpins = 10;
  let currentStreak = 0;
  let sessionWins = 0;
  let sessionBestWin = 0;
  let sessionBestStreak = 0;
  let toastMsg = '';
  let toastTimer = 0;
  let achPage = 0;
  let wheelAngle = 0;
  let ballAngle = 0;
  let ballRadius = 1.1;
  let isSpinning = false;
  let spinTime = 0;
  let spinDuration = 0;
  let targetPocket = -1;
  let wheelSpeed = 0;
  let ballSpeed = 0;
  let countdownPhase = 0;
  let countdownTimer = 0;
  let winningPocketIdx = -1;
  let winPulseTime = 0;
  let cameraBaseZ = 0;
  let cameraZoomTarget = 0;
  let cameraZooming = false;
  let betTooltip = '';
  let streakFxTimer = 0;
  let initialCameraZ = 0;
  let autoSpinCount = 0;
  let autoSpinMax = 10;
  let autoSpinStopAmount = 500;
  let autoSpinRunning = false;
  let autoSpinPauseTimer = 0;
  let neighborCount = 2;
  let neighborPickMode = false;
  let ballTrail: { x: number; y: number; z: number; alpha: number }[] = [];
  let laPartageEnabled = false;
  let enPrisonEnabled = false;
  let enPrisonBets: Bet[] = [];
  let partageRefund = 0;
  let martingaleActive = false;
  let startingBankroll = 1000;
  let sessionProfit = 0;
  let dealerMsg = '';
  let dealerSub = '';
  let dealerTimer = 0;
  let tutorialStep = 0;
  let tutorialActive = false;
  let favorites = loadFavorites();
  let bankrollHistory: number[] = [];
  let sessionStartTime = 0;
  let sessionElapsed = 0;
  let winningTableZoneIdx = -1;
  let winTablePulseTime = 0;
  let heatmapEnabled = true;

  const theme = () => THEMES[state.themeIdx];
  state.themesUsed.add(theme().name);

  // ─── Holodeck Environment ───
  scene.background = new Color(theme().bg);
  scene.fog = new FogExp2(theme().fog, 0.06);

  const ambientLight = new AmbientLight(0x222233, 0.5);
  scene.add(ambientLight);
  const dirLight = new DirectionalLight(0xffffff, 0.4);
  dirLight.position.set(3, 8, 2);
  scene.add(dirLight);
  const accent1 = new PointLight(theme().accent, 1.5, 15);
  accent1.position.set(-3, 3, -2);
  scene.add(accent1);
  const accent2 = new PointLight(theme().glow, 1.2, 12);
  accent2.position.set(3, 3, 2);
  scene.add(accent2);

  // Grid floor
  const gridFloor = new Group();
  const gridMat = new LineBasicMaterial({ color: theme().grid, transparent: true, opacity: 0.15 });
  for (let i = -10; i <= 10; i++) {
    const geo1 = new BoxGeometry(0.005, 0.005, 20);
    const l1 = new Mesh(geo1, new MeshBasicMaterial({ color: theme().grid, transparent: true, opacity: 0.1 }));
    l1.position.set(i, 0, 0);
    gridFloor.add(l1);
    const geo2 = new BoxGeometry(20, 0.005, 0.005);
    const l2 = new Mesh(geo2, new MeshBasicMaterial({ color: theme().grid, transparent: true, opacity: 0.1 }));
    l2.position.set(0, 0, i);
    gridFloor.add(l2);
  }
  scene.add(gridFloor);

  // Grid ceiling
  const gridCeiling = gridFloor.clone();
  gridCeiling.position.y = 4;
  scene.add(gridCeiling);

  // Floating decorations
  const decorations: { mesh: Mesh; rotSpeed: number; bobSpeed: number; bobAmp: number; baseY: number }[] = [];
  const decoGeos = [new TorusGeometry(0.15, 0.04, 8, 16), new BoxGeometry(0.2, 0.2, 0.2), new SphereGeometry(0.12, 8, 8), new ConeGeometry(0.1, 0.2, 6)];
  for (let i = 0; i < 14; i++) {
    const geo = decoGeos[i % decoGeos.length];
    const mat = new MeshBasicMaterial({ color: i % 2 === 0 ? theme().grid : theme().accent, wireframe: true, transparent: true, opacity: 0.2 });
    const mesh = new Mesh(geo, mat);
    const angle = (i / 14) * Math.PI * 2;
    const dist = 5 + Math.random() * 4;
    const baseY = 1.5 + Math.random() * 2;
    mesh.position.set(Math.cos(angle) * dist, baseY, Math.sin(angle) * dist);
    scene.add(mesh);
    decorations.push({ mesh, rotSpeed: 0.3 + Math.random() * 0.5, bobSpeed: 0.5 + Math.random() * 0.5, bobAmp: 0.1 + Math.random() * 0.15, baseY });
  }

  // Ambient particles
  const ambientParticles: { mesh: Mesh; baseY: number; driftX: number; driftZ: number; pulseSpeed: number }[] = [];
  const apGeo = new SphereGeometry(0.01, 4, 4);
  for (let i = 0; i < 40; i++) {
    const mat = new MeshBasicMaterial({ color: theme().glow, transparent: true, opacity: 0.3, blending: AdditiveBlending });
    const mesh = new Mesh(apGeo, mat);
    mesh.position.set((Math.random() - 0.5) * 12, 0.5 + Math.random() * 3, (Math.random() - 0.5) * 12);
    scene.add(mesh);
    ambientParticles.push({ mesh, baseY: mesh.position.y, driftX: (Math.random() - 0.5) * 0.2, driftZ: (Math.random() - 0.5) * 0.2, pulseSpeed: 1 + Math.random() * 2 });
  }

  initParticles(scene);

  // ─── Roulette Wheel ───
  const wheelGroup = new Group();
  wheelGroup.position.set(0, 1.0, -2.5);
  scene.add(wheelGroup);

  // Wheel base
  const wheelBase = new Mesh(
    new CylinderGeometry(1.2, 1.3, 0.15, 48),
    new MeshStandardMaterial({ color: theme().wheel, metalness: 0.6, roughness: 0.3 })
  );
  wheelGroup.add(wheelBase);
  const wheelEdge = new LineSegments(new EdgesGeometry(wheelBase.geometry), new LineBasicMaterial({ color: theme().glow, transparent: true, opacity: 0.4 }));
  wheelGroup.add(wheelEdge);

  // Wheel disc (rotates)
  const wheelDisc = new Group();
  wheelGroup.add(wheelDisc);

  // Pockets
  const sequence = () => isAmerican ? AMER_SEQUENCE : EURO_SEQUENCE;
  const pocketCount = () => isAmerican ? 38 : 37;
  let pocketMeshes: Mesh[] = [];
  let pocketLabels: Mesh[] = [];

  function buildWheel() {
    // Clear old pockets
    for (const m of pocketMeshes) wheelDisc.remove(m);
    for (const m of pocketLabels) wheelDisc.remove(m);
    pocketMeshes = [];
    pocketLabels = [];
    const seq = sequence();
    const count = pocketCount();
    for (let i = 0; i < count; i++) {
      const num = seq[i];
      const angle = (i / count) * Math.PI * 2;
      const r = 1.0;
      // Pocket block
      const pGeo = new BoxGeometry(0.12, 0.08, 0.06);
      const col = numberColor(num);
      const pMat = new MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.5, metalness: 0.3, roughness: 0.5 });
      const pMesh = new Mesh(pGeo, pMat);
      pMesh.position.set(Math.cos(angle) * r, 0.1, Math.sin(angle) * r);
      pMesh.lookAt(0, 0.1, 0);
      wheelDisc.add(pMesh);
      pocketMeshes.push(pMesh);

      // Number indicator (small sphere)
      const nGeo = new SphereGeometry(0.02, 6, 6);
      const nMat = new MeshBasicMaterial({ color: 0xffffff });
      const nMesh = new Mesh(nGeo, nMat);
      nMesh.position.set(Math.cos(angle) * (r - 0.15), 0.15, Math.sin(angle) * (r - 0.15));
      wheelDisc.add(nMesh);
      pocketLabels.push(nMesh);
    }

    // Center cone
    const centerCone = new Mesh(
      new ConeGeometry(0.15, 0.3, 12),
      new MeshStandardMaterial({ color: theme().glow, emissive: theme().glow, emissiveIntensity: 0.3, metalness: 0.7, roughness: 0.2 })
    );
    centerCone.position.y = 0.2;
    wheelDisc.add(centerCone);

    // Inner ring
    const innerRing = new Mesh(
      new TorusGeometry(0.6, 0.02, 8, 32),
      new MeshStandardMaterial({ color: theme().glow, emissive: theme().glow, emissiveIntensity: 0.3 })
    );
    innerRing.rotation.x = Math.PI / 2;
    innerRing.position.y = 0.1;
    wheelDisc.add(innerRing);

    // Outer rim glow ring
    const outerRim = new Mesh(
      new TorusGeometry(1.12, 0.015, 8, 48),
      new MeshStandardMaterial({ color: theme().glow, emissive: theme().glow, emissiveIntensity: 0.5, transparent: true, opacity: 0.6 })
    );
    outerRim.rotation.x = Math.PI / 2;
    outerRim.position.y = 0.12;
    wheelDisc.add(outerRim);

    // Pocket divider lines between pockets
    const divMat = new MeshBasicMaterial({ color: theme().glow, transparent: true, opacity: 0.3 });
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (0.5 / count) * Math.PI * 2;
      const divGeo = new BoxGeometry(0.005, 0.06, 0.12);
      const div = new Mesh(divGeo, divMat);
      div.position.set(Math.cos(angle) * 1.0, 0.1, Math.sin(angle) * 1.0);
      div.lookAt(0, 0.1, 0);
      wheelDisc.add(div);
    }
  }

  buildWheel();

  // Ball
  const ball = new Mesh(
    new SphereGeometry(0.04, 12, 12),
    new MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.8, metalness: 0.8, roughness: 0.1 })
  );
  ball.visible = false;
  wheelGroup.add(ball);

  // Ball glow
  const ballGlow = new Mesh(
    new SphereGeometry(0.06, 8, 8),
    new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, blending: AdditiveBlending })
  );
  ballGlow.visible = false;
  wheelGroup.add(ballGlow);

  // Wheel spotlight
  const wheelLight = new PointLight(theme().glow, 1.5, 5);
  wheelLight.position.set(0, 2, 0);
  wheelGroup.add(wheelLight);

  // ─── Betting Table (3D) ───
  const tableGroup = new Group();
  tableGroup.position.set(0, 0.8, -0.8);
  tableGroup.rotation.x = -Math.PI / 6;
  scene.add(tableGroup);

  // Table surface
  const tableSurface = new Mesh(
    new BoxGeometry(2.0, 0.02, 1.2),
    new MeshStandardMaterial({ color: '#003322', metalness: 0.1, roughness: 0.8 })
  );
  tableGroup.add(tableSurface);
  const tableEdge = new LineSegments(new EdgesGeometry(tableSurface.geometry), new LineBasicMaterial({ color: theme().glow, transparent: true, opacity: 0.4 }));
  tableGroup.add(tableEdge);

  // Bet zones (clickable areas on table)
  interface BetZone { mesh: Mesh; type: BetType; number?: number; numbers?: number[]; label: string; }
  const betZones: BetZone[] = [];
  const zoneMat = (col: string) => new MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.2, transparent: true, opacity: 0.6, metalness: 0.1, roughness: 0.7 });

  // Number grid (3 columns x 12 rows)
  for (let row = 0; row < 12; row++) {
    for (let col = 0; col < 3; col++) {
      const num = row * 3 + (3 - col);
      const x = -0.75 + row * 0.13;
      const z = -0.35 + col * 0.2;
      const geo = new BoxGeometry(0.11, 0.015, 0.17);
      const col2 = numberColor(num);
      const mat = zoneMat(col2);
      const mesh = new Mesh(geo, mat);
      mesh.position.set(x, 0.015, z);
      tableGroup.add(mesh);
      betZones.push({ mesh, type: 'straight', number: num, label: String(num) });
    }
  }

  // Zero
  const zeroGeo = new BoxGeometry(0.11, 0.015, 0.55);
  const zeroMesh = new Mesh(zeroGeo, zoneMat('#00aa44'));
  zeroMesh.position.set(-0.88, 0.015, 0);
  tableGroup.add(zeroMesh);
  betZones.push({ mesh: zeroMesh, type: 'straight', number: 0, label: '0' });

  // Outside bets
  const outsideBets: { type: BetType; label: string; x: number; z: number; w: number; h: number; color: string }[] = [
    { type: 'red', label: 'RED', x: 0, z: 0.55, w: 0.5, h: 0.12, color: '#cc2222' },
    { type: 'black', label: 'BLACK', x: 0.55, z: 0.55, w: 0.5, h: 0.12, color: '#222222' },
    { type: 'odd', label: 'ODD', x: -0.55, z: 0.55, w: 0.5, h: 0.12, color: '#886600' },
    { type: 'even', label: 'EVEN', x: -0.55, z: -0.55, w: 0.5, h: 0.12, color: '#886600' },
    { type: 'low', label: '1-18', x: 0, z: -0.55, w: 0.5, h: 0.12, color: '#006688' },
    { type: 'high', label: '19-36', x: 0.55, z: -0.55, w: 0.5, h: 0.12, color: '#006688' },
    { type: 'dozen1', label: '1st 12', x: -0.5, z: -0.42, w: 0.48, h: 0.1, color: '#664400' },
    { type: 'dozen2', label: '2nd 12', x: 0.02, z: -0.42, w: 0.48, h: 0.1, color: '#664400' },
    { type: 'dozen3', label: '3rd 12', x: 0.54, z: -0.42, w: 0.48, h: 0.1, color: '#664400' },
    { type: 'col1', label: 'Col 1', x: 0.88, z: -0.17, w: 0.12, h: 0.17, color: '#444466' },
    { type: 'col2', label: 'Col 2', x: 0.88, z: 0, w: 0.12, h: 0.17, color: '#444466' },
    { type: 'col3', label: 'Col 3', x: 0.88, z: 0.17, w: 0.12, h: 0.17, color: '#444466' },
  ];

  for (const ob of outsideBets) {
    const geo = new BoxGeometry(ob.w, 0.015, ob.h);
    const mesh = new Mesh(geo, zoneMat(ob.color));
    mesh.position.set(ob.x, 0.015, ob.z);
    tableGroup.add(mesh);
    betZones.push({ mesh, type: ob.type, label: ob.label });
  }

  // Street bet zones (left edge of each row, pays 11:1)
  for (let i = 0; i < 12; i++) {
    const x = -0.75 + i * 0.13;
    const geo = new BoxGeometry(0.11, 0.015, 0.06);
    const mesh = new Mesh(geo, zoneMat('#005566'));
    mesh.position.set(x, 0.015, -0.28);
    tableGroup.add(mesh);
    betZones.push({ mesh, type: 'street', numbers: STREETS[i], label: 'St ' + STREETS[i][0] + '-' + STREETS[i][2] });
  }

  // Line bet zones (between rows, pays 5:1)
  for (let i = 0; i < 11; i++) {
    const x = -0.75 + i * 0.13 + 0.065;
    const geo = new BoxGeometry(0.06, 0.015, 0.06);
    const mesh = new Mesh(geo, zoneMat('#554400'));
    mesh.position.set(x, 0.015, -0.28);
    tableGroup.add(mesh);
    betZones.push({ mesh, type: 'line', numbers: LINES[i], label: 'Ln ' + LINES[i][0] + '-' + LINES[i][5] });
  }

  // Five-number bet (American only: 0-00-1-2-3, pays 6:1) - always shown but only works on American
  const fiveGeo = new BoxGeometry(0.2, 0.015, 0.06);
  const fiveMesh = new Mesh(fiveGeo, zoneMat('#006644'));
  fiveMesh.position.set(-0.88, 0.015, -0.28);
  tableGroup.add(fiveMesh);
  betZones.push({ mesh: fiveMesh, type: 'five', label: '0-00-1-2-3' });

  // Split bets (between two adjacent numbers horizontally, pays 17:1)
  for (let row = 0; row < 12; row++) {
    for (let col = 0; col < 2; col++) {
      const num1 = row * 3 + (3 - col);
      const num2 = row * 3 + (2 - col);
      const x = -0.75 + row * 0.13;
      const z = -0.35 + col * 0.2 + 0.1;
      const geo = new BoxGeometry(0.11, 0.015, 0.04);
      const mesh = new Mesh(geo, zoneMat('#335566'));
      mesh.position.set(x, 0.017, z);
      tableGroup.add(mesh);
      betZones.push({ mesh, type: 'split', numbers: [num1, num2], label: 'Sp ' + num1 + '/' + num2 });
    }
  }

  // Corner bets (intersection of 4 numbers, pays 8:1)
  for (let row = 0; row < 11; row++) {
    for (let col = 0; col < 2; col++) {
      const n1 = row * 3 + (3 - col);
      const n2 = row * 3 + (2 - col);
      const n3 = (row + 1) * 3 + (3 - col);
      const n4 = (row + 1) * 3 + (2 - col);
      const x = -0.75 + row * 0.13 + 0.065;
      const z = -0.35 + col * 0.2 + 0.1;
      const geo = new BoxGeometry(0.04, 0.015, 0.04);
      const mesh = new Mesh(geo, zoneMat('#445533'));
      mesh.position.set(x, 0.017, z);
      tableGroup.add(mesh);
      betZones.push({ mesh, type: 'corner', numbers: [n1, n2, n3, n4], label: 'Cn ' + n1 + '/' + n2 + '/' + n3 + '/' + n4 });
    }
  }

  // ─── Racetrack 3D Ring ───
  const racetrackGroup = new Group();
  racetrackGroup.position.set(0, 1.4, -2.5);
  scene.add(racetrackGroup);

  // Build a physical ring showing wheel numbers in order (decorative)
  const raceRingGeo = new TorusGeometry(1.5, 0.03, 8, 64);
  const raceRingMat = new MeshBasicMaterial({ color: theme().glow, transparent: true, opacity: 0.15 });
  const raceRing = new Mesh(raceRingGeo, raceRingMat);
  raceRing.rotation.x = Math.PI / 2;
  racetrackGroup.add(raceRing);

  // Number position markers around racetrack
  const raceMarkers: Mesh[] = [];
  function buildRacetrackMarkers() {
    for (const m of raceMarkers) racetrackGroup.remove(m);
    raceMarkers.length = 0;
    const seq = isAmerican ? AMER_SEQUENCE : EURO_SEQUENCE;
    const count = seq.length;
    for (let i = 0; i < count; i++) {
      const num = seq[i];
      const angle = (i / count) * Math.PI * 2;
      const r = 1.5;
      const geo = new SphereGeometry(0.025, 6, 6);
      const col = numberColor(num);
      const mat = new MeshBasicMaterial({ color: col, transparent: true, opacity: 0.6 });
      const mesh = new Mesh(geo, mat);
      mesh.position.set(Math.cos(angle) * r, 0, Math.sin(angle) * r);
      racetrackGroup.add(mesh);
      raceMarkers.push(mesh);
    }
  }
  buildRacetrackMarkers();

  // Chip markers (placed bets visualization)
  const chipMarkers: Mesh[] = [];
  const chipGeo = new CylinderGeometry(0.03, 0.03, 0.015, 12);

  const CHIP_COLORS = ['#00ffcc', '#ff4444', '#ccaa00', '#aa88ff', '#ff8844', '#44ff88', '#ff88cc', '#cccccc'];

  function addChipMarker(pos: Vector3) {
    const mat = new MeshStandardMaterial({ color: CHIP_COLORS[state.chipSkin], emissive: CHIP_COLORS[state.chipSkin], emissiveIntensity: 0.5 });
    const chip = new Mesh(chipGeo, mat);
    chip.position.copy(pos);
    chip.position.y += 0.025 + chipMarkers.length * 0.005;
    tableGroup.add(chip);
    chipMarkers.push(chip);
  }

  function clearChipMarkers() {
    for (const c of chipMarkers) tableGroup.remove(c);
    chipMarkers.length = 0;
  }

  // ─── Raycasting ───
  const raycaster = new Raycaster();
  const mouse = new Vector2();
  let mouseDown = false;

  renderer.domElement.addEventListener('mousemove', (e: MouseEvent) => {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  });

  renderer.domElement.addEventListener('click', () => {
    if (uiState !== 'playing') return;
    initAudio();
    raycaster.setFromCamera(mouse, camera);
    const zoneMeshes = betZones.map(z => z.mesh);
    const hits = raycaster.intersectObjects(zoneMeshes);
    if (hits.length > 0) {
      const zone = betZones[zoneMeshes.indexOf(hits[0].object as Mesh)];
      if (zone) {
        if (neighborPickMode && zone.type === 'straight' && zone.number !== undefined) {
          placeNeighborBet(zone.number);
        } else {
          placeBet(zone);
        }
      }
    }
  });

  // ─── Keyboard ───
  const keys: Record<string, boolean> = {};
  window.addEventListener('keydown', (e) => {
    keys[e.key] = true;
    initAudio();
    if (e.key === '1') { selectedChip = 1; playClick(); }
    if (e.key === '2') { selectedChip = 5; playClick(); }
    if (e.key === '3') { selectedChip = 10; playClick(); }
    if (e.key === '4') { selectedChip = 25; playClick(); }
    if (e.key === '5') { selectedChip = 100; playClick(); }
    if (e.key === ' ' && uiState === 'playing' && bets.length > 0) startSpin();
    if (e.key === 'c' && uiState === 'playing') clearBets();
    if (e.key === 'r' && uiState === 'playing') rebet();
    if (e.key === 'u' && uiState === 'playing') undoLastBet();
    if (e.key === 'q' && uiState === 'playing') { uiState = 'quickbets'; hideAllPanels(); const qe = panelEntities['quickbets']; if (qe && qe.object3D) qe.object3D.visible = true; const he = panelEntities['hud']; if (he && he.object3D) he.object3D.visible = true; playClick(); }
    if (e.key === 'a' && uiState === 'playing') { uiState = 'autospin' as UIState; hideAllPanels(); const ae = panelEntities['autospin']; if (ae && ae.object3D) ae.object3D.visible = true; updateAutoSpinPanel(); }
    if (e.key === 'f' && uiState === 'playing') { uiState = 'favorites' as UIState; hideAllPanels(); const fe = panelEntities['favorites']; if (fe && fe.object3D) fe.object3D.visible = true; const he = panelEntities['hud']; if (he && he.object3D) he.object3D.visible = true; updateFavoritesPanel(); }
    if (e.key === 'Enter' && uiState === 'result') continueAfterResult();
    if ((e.key === 'Escape' || e.key === 'p') && (uiState === 'playing' || uiState === 'pause')) {
      uiState = uiState === 'pause' ? 'playing' : 'pause';
      showPanel(uiState);
    }
  });
  window.addEventListener('keyup', (e) => { keys[e.key] = false; });

  // ─── Game Logic ───
  function placeBet(zone: BetZone) {
    if (uiState !== 'playing' || isSpinning) return;
    if (selectedChip > bankroll && gameMode !== 'practice') return;
    // Five-number bet only valid on American table
    if (zone.type === 'five' && !isAmerican) {
      showToast('Five-bet is American only!');
      return;
    }
    bets.push({ type: zone.type, number: zone.number, numbers: zone.numbers, amount: selectedChip });
    if (gameMode !== 'practice') bankroll -= selectedChip;
    state.betTypesUsed.add(zone.type);
    addChipMarker(zone.mesh.position.clone());
    playChipPlace();
    updateHUD();
    updateOddsPanel();
    // Dealer comment on bet type (occasionally)
    if (Math.random() < 0.3 || bets.length === 1) {
      const comments = DEALER_BET_COMMENTS[zone.type] || DEALER_BET_COMMENTS['default'];
      showDealer(randomFrom(comments), zone.label);
    }
  }

  function clearBets() {
    for (const b of bets) {
      if (gameMode !== 'practice') bankroll += b.amount;
    }
    bets = [];
    clearChipMarkers();
    updateHUD();
    updateOddsPanel();
  }

  function undoLastBet() {
    if (bets.length === 0 || isSpinning) return;
    const removed = bets.pop()!;
    if (gameMode !== 'practice') bankroll += removed.amount;
    // Remove last chip marker
    if (chipMarkers.length > 0) {
      const last = chipMarkers.pop()!;
      tableGroup.remove(last);
    }
    playClick();
    showToast('Undo: ' + removed.type + (removed.number !== undefined ? ' ' + removed.number : ''));
    updateHUD();
    updateOddsPanel();
  }

  function rebet() {
    if (lastBets.length === 0) return;
    const totalNeeded = lastBets.reduce((s, b) => s + b.amount, 0);
    if (totalNeeded > bankroll && gameMode !== 'practice') return;
    bets = lastBets.map(b => ({ ...b }));
    if (gameMode !== 'practice') bankroll -= totalNeeded;
    clearChipMarkers();
    for (const b of bets) {
      const zone = betZones.find(z => z.type === b.type && z.number === b.number);
      if (zone) addChipMarker(zone.mesh.position.clone());
    }
    updateHUD();
    updateOddsPanel();
  }

  function startSpin() {
    if (bets.length === 0 || isSpinning) return;
    initAudio();

    // Start countdown sequence
    countdownPhase = 3;
    showDealer(randomFrom(DEALER_SPIN));
    countdownTimer = 0;
    uiState = 'spinning';
    hideAllPanels();
    const ce = panelEntities['countdown'];
    if (ce && ce.object3D) ce.object3D.visible = true;
    setText(panelEntities['countdown'], 'countdown-text', '3');
    playCountdown();

    // Clear previous winning pocket highlight
    winningPocketIdx = -1;
    winPulseTime = 0;
  }

  function executeActualSpin() {
    isSpinning = true;
    const totalBet = bets.reduce((s, b) => s + b.amount, 0);
    state.totalWagered += totalBet;

    // Determine result
    const seq = sequence();
    const count = pocketCount();
    if (gameMode === 'daily') {
      const today = new Date();
      const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate() + sessionSpins;
      const rng = mulberry32(seed);
      targetPocket = Math.floor(rng() * count);
    } else {
      targetPocket = Math.floor(Math.random() * count);
    }
    currentResult = seq[targetPocket];

    // Spin physics
    wheelSpeed = 3 + Math.random() * 2;
    ballSpeed = -(5 + Math.random() * 3);
    spinDuration = 3 + Math.random() * 1.5;
    spinTime = 0;
    ballRadius = 1.1;
    ball.visible = true;
    ballGlow.visible = true;

    // Determine target angle
    const targetAngle = (targetPocket / count) * Math.PI * 2;
    ballAngle = targetAngle + Math.PI * 2 * (8 + Math.random() * 4);

    playSpinSound();
    hideAllPanels();

    // Camera zoom toward wheel
    cameraBaseZ = camera.position.z;
    cameraZoomTarget = cameraBaseZ + 1.0;
    cameraZooming = true;
  }

  function resolveSpin() {
    isSpinning = false;
    let totalWin = 0;
    partageRefund = 0;

    // Check En Prison bets first (from previous zero)
    if (enPrisonBets.length > 0) {
      for (const b of enPrisonBets) {
        const win = evaluateBet(b, currentResult);
        if (win > 0) {
          totalWin += b.amount; // Return original bet (no profit)
        }
        // If zero again, bet is lost
      }
      enPrisonBets = [];
    }

    for (const b of bets) {
      const win = evaluateBet(b, currentResult);
      if (win > 0) {
        totalWin += win;
      } else if ((currentResult === 0 || currentResult === 37) && !isAmerican) {
        // La Partage / En Prison for even-money bets on European table
        const evenMoneyTypes: BetType[] = ['red', 'black', 'odd', 'even', 'low', 'high'];
        if (evenMoneyTypes.includes(b.type)) {
          if (enPrisonEnabled) {
            // En Prison: lock the bet for next spin
            enPrisonBets.push({ ...b });
          } else if (laPartageEnabled) {
            // La Partage: return half the bet
            const refund = Math.floor(b.amount / 2);
            totalWin += refund;
            partageRefund += refund;
          }
        }
      }
    }
    bankroll += totalWin;
    sessionProfit = bankroll - startingBankroll;
    bankrollHistory.push(bankroll);
    state.totalSpins++;
    sessionSpins++;

    // Track result
    spinHistory.unshift(currentResult);
    if (spinHistory.length > 20) spinHistory.pop();
    state.hotNumbers.set(currentResult, (state.hotNumbers.get(currentResult) || 0) + 1);

    if (currentResult === 0) state.zeroHits++;
    if (currentResult === 37) state.doubleZeroHits++;

    if (totalWin > 0) {
      state.totalWins++;
      state.totalWon += totalWin;
      sessionWins++;
      currentStreak++;
      if (currentStreak > state.bestStreak) state.bestStreak = currentStreak;
      if (currentStreak > sessionBestStreak) sessionBestStreak = currentStreak;
      if (totalWin > state.bestSingleWin) state.bestSingleWin = totalWin;
      if (totalWin > sessionBestWin) sessionBestWin = totalWin;

      // Check for straight hit
      for (const b of bets) {
        if (b.type === 'straight' && b.number === currentResult) {
          state.straightHits++;
          playStraightWin();
          emitParticles(ball.position.x + wheelGroup.position.x, ball.position.y + wheelGroup.position.y, ball.position.z + wheelGroup.position.z, 30, '#ffcc00');
        }
      }

      // Color streaks
      if (isRed(currentResult)) { state.redStreak++; state.blackStreak = 0; }
      else if (isBlack(currentResult)) { state.blackStreak++; state.redStreak = 0; }
      else { state.redStreak = 0; state.blackStreak = 0; }

      playWin();
      const numStr2 = currentResult === 37 ? '00' : String(currentResult);
      if (totalWin >= 500) {
        showDealer(randomFrom(DEALER_BIG_WIN), numStr2 + ' pays $' + totalWin);
      } else {
        showDealer(randomFrom(DEALER_WIN), numStr2 + ' pays $' + totalWin);
      }
      const winColor = isRed(currentResult) ? '#ff4444' : isBlack(currentResult) ? '#8844ff' : '#44ff88';
      emitParticles(0, 1.5, -1, 25, winColor);
      emitParticles(0, 2.0, -2, 15, theme().glow);
      if (totalWin >= 100) emitParticles(-1, 1.8, -1.5, 15, '#ffcc00');
      if (totalWin >= 500) emitParticles(1, 1.8, -1.5, 20, '#ff88ff');
    } else {
      currentStreak = 0;
      state.redStreak = 0;
      state.blackStreak = 0;
      playLose();
      const numStr3 = currentResult === 37 ? '00' : String(currentResult);
      showDealer(randomFrom(DEALER_LOSE), numStr3 + ' -- the house collects');
    }

    // XP
    const xpGain = Math.floor(totalWin / 10) + 5;
    state.xp += xpGain;
    const xpNeeded = 100 + state.level * 50;
    if (state.xp >= xpNeeded) {
      state.xp -= xpNeeded;
      state.level++;
      showToast('Level Up! Lv.' + state.level);
    }

    // Achievements
    checkAchievements();

    lastBets = bets.map(b => ({ ...b }));
    bets = [];
    clearChipMarkers();

    playBallSettle();

    // Highlight winning pocket on wheel
    winningPocketIdx = targetPocket;
    winPulseTime = 0;

    // Highlight winning number on betting table
    winningTableZoneIdx = betZones.findIndex(z => z.type === 'straight' && z.number === currentResult);
    winTablePulseTime = 0;

    // Camera zoom back
    cameraZooming = false;

    uiState = 'result';
    showResultPanel(totalWin);
    saveState(state);

    // Streak visual effects
    if (currentStreak >= 3) {
      streakFxTimer = 2.0;
    }
  }

  function continueAfterResult() {
    // Check game over conditions
    const isOver = checkGameOver();
    if (isOver) {
      if (autoSpinRunning) stopAutoSpin();
      endGame();
    } else if (autoSpinRunning) {
      // Auto-spin: pause briefly then trigger next
      uiState = 'playing';
      showPanel('playing');
      updateHUD();
      autoSpinPauseTimer = 1.0;
    } else {
      uiState = 'playing';
      showPanel('playing');
      // Apply martingale on loss
      if (martingaleActive && currentStreak === 0 && sessionSpins > 0) {
        applyMartingale();
      }
      updateHUD();
    }
  }

  function checkGameOver(): boolean {
    if (gameMode === 'single') return true;
    if (gameMode === 'session' && sessionSpins >= 10) return true;
    if (gameMode === 'marathon' && sessionSpins >= 50) return true;
    if (gameMode === 'streak' && currentStreak === 0 && sessionSpins > 0) return true;
    if (bankroll <= 0 && gameMode !== 'practice') return true;
    if (gameMode === 'tournament' && sessionSpins >= 5) return true;
    return false;
  }

  function endGame() {
    state.sessionsPlayed++;
    if (gameMode === 'daily') state.dailiesCompleted++;
    uiState = 'gameover';
    showPanel('gameover');
    // Leaderboard
    if (gameMode !== 'practice') {
      const board = loadLeaderboard();
      board.push({ score: bankroll, mode: gameMode, spins: sessionSpins, date: new Date().toLocaleDateString() });
      board.sort((a, b) => b.score - a.score);
      saveLeaderboard(board);
    }
    saveState(state);
  }

  function startGame(mode: GameMode, american: boolean) {
    gameMode = mode;
    isAmerican = american;
    buildWheel();
    buildRacetrackMarkers();

    switch (mode) {
      case 'single': bankroll = 1000; maxSpins = 1; break;
      case 'session': bankroll = 1000; maxSpins = 10; break;
      case 'marathon': bankroll = 5000; maxSpins = 50; break;
      case 'high-roller': bankroll = 10000; maxSpins = 10; selectedChip = 100; break;
      case 'daily': bankroll = 1000; maxSpins = 10; break;
      case 'practice': bankroll = 99999; maxSpins = 999; break;
      case 'streak': bankroll = 1000; maxSpins = 999; break;
      case 'tournament': bankroll = 2000; maxSpins = 5; break;
    }

    sessionSpins = 0; currentStreak = 0; sessionWins = 0; sessionBestWin = 0; sessionBestStreak = 0;
    spinHistory = []; bets = []; lastBets = []; enPrisonBets = [];
    clearChipMarkers();
    startingBankroll = bankroll;
    sessionProfit = 0;
    bankrollHistory = [bankroll];
    sessionStartTime = Date.now();
    sessionElapsed = 0;
    winningTableZoneIdx = -1;
    winTablePulseTime = 0;

    uiState = 'playing';
    showPanel('playing');
    updateHUD();
    showDealer(randomFrom(DEALER_GREETINGS), mode + ' mode -- ' + (american ? 'American' : 'European') + ' table');
  }

  function checkAchievements() {
    for (const ach of ACHIEVEMENTS) {
      if (!state.achievements.has(ach.id) && ach.check(state)) {
        state.achievements.add(ach.id);
        showToast(ach.name + ' unlocked!');
        playAchievement();
        // Count skin unlocks
        const skinAchs = ['first_win', 'wagered_1k', 'games_10', 'streak_3', 'straight_hit', 'all_bets', 'level_25'];
        if (skinAchs.includes(ach.id)) state.skinsUnlocked++;
      }
    }
  }

  function showToast(msg: string) {
    toastMsg = msg;
    toastTimer = 2.5;
  }

  function showDealer(msg: string, sub = '') {
    dealerMsg = msg;
    dealerSub = sub;
    dealerTimer = 4.0;
    const de = panelEntities['dealer'];
    if (de) {
      setText(de, 'dealer-msg', msg);
      setText(de, 'dealer-sub', sub);
      if (de.object3D) de.object3D.visible = true;
    }
  }

  function calculateOdds(): { prob: number; ev: number; maxPayout: number; edge: number; risk: string } {
    if (bets.length === 0) return { prob: 0, ev: 0, maxPayout: 0, edge: 0, risk: '--' };
    const totalPockets = isAmerican ? 38 : 37;
    // Count unique covered numbers from all bets
    const coveredNumbers = new Set<number>();
    let totalBet = 0;
    let maxPayout = 0;
    for (const b of bets) {
      totalBet += b.amount;
      if (b.type === 'straight' && b.number !== undefined) { coveredNumbers.add(b.number); maxPayout = Math.max(maxPayout, b.amount * 35); }
      else if (b.type === 'split' && b.numbers) { b.numbers.forEach(n => coveredNumbers.add(n)); maxPayout = Math.max(maxPayout, b.amount * 17); }
      else if (b.type === 'corner' && b.numbers) { b.numbers.forEach(n => coveredNumbers.add(n)); maxPayout = Math.max(maxPayout, b.amount * 8); }
      else if (b.type === 'street' && b.numbers) { b.numbers.forEach(n => coveredNumbers.add(n)); maxPayout = Math.max(maxPayout, b.amount * 11); }
      else if (b.type === 'line' && b.numbers) { b.numbers.forEach(n => coveredNumbers.add(n)); maxPayout = Math.max(maxPayout, b.amount * 5); }
      else if (b.type === 'red') { for (let i = 1; i <= 36; i++) if (isRed(i)) coveredNumbers.add(i); maxPayout = Math.max(maxPayout, b.amount); }
      else if (b.type === 'black') { for (let i = 1; i <= 36; i++) if (isBlack(i)) coveredNumbers.add(i); maxPayout = Math.max(maxPayout, b.amount); }
      else if (b.type === 'odd') { for (let i = 1; i <= 36; i += 2) coveredNumbers.add(i); maxPayout = Math.max(maxPayout, b.amount); }
      else if (b.type === 'even') { for (let i = 2; i <= 36; i += 2) coveredNumbers.add(i); maxPayout = Math.max(maxPayout, b.amount); }
      else if (b.type === 'low') { for (let i = 1; i <= 18; i++) coveredNumbers.add(i); maxPayout = Math.max(maxPayout, b.amount); }
      else if (b.type === 'high') { for (let i = 19; i <= 36; i++) coveredNumbers.add(i); maxPayout = Math.max(maxPayout, b.amount); }
      else if (b.type === 'dozen1') { for (let i = 1; i <= 12; i++) coveredNumbers.add(i); maxPayout = Math.max(maxPayout, b.amount * 2); }
      else if (b.type === 'dozen2') { for (let i = 13; i <= 24; i++) coveredNumbers.add(i); maxPayout = Math.max(maxPayout, b.amount * 2); }
      else if (b.type === 'dozen3') { for (let i = 25; i <= 36; i++) coveredNumbers.add(i); maxPayout = Math.max(maxPayout, b.amount * 2); }
      else if (b.type === 'col1') { for (let i = 1; i <= 36; i += 3) coveredNumbers.add(i); maxPayout = Math.max(maxPayout, b.amount * 2); }
      else if (b.type === 'col2') { for (let i = 2; i <= 36; i += 3) coveredNumbers.add(i); maxPayout = Math.max(maxPayout, b.amount * 2); }
      else if (b.type === 'col3') { for (let i = 3; i <= 36; i += 3) coveredNumbers.add(i); maxPayout = Math.max(maxPayout, b.amount * 2); }
      else if (b.type === 'five') { [0, 37, 1, 2, 3].forEach(n => coveredNumbers.add(n)); maxPayout = Math.max(maxPayout, b.amount * 6); }
    }
    const prob = coveredNumbers.size / totalPockets;
    const edge = isAmerican ? 5.26 : 2.70;
    const ev = -totalBet * (edge / 100);
    const risk = prob < 0.15 ? 'HIGH' : prob < 0.4 ? 'MEDIUM' : 'LOW';
    return { prob: Math.round(prob * 100), ev: Math.round(ev * 100) / 100, maxPayout, edge, risk };
  }

  function updateOddsPanel() {
    const e = panelEntities['odds'];
    if (!e) return;
    const odds = calculateOdds();
    setText(e, 'odds-prob', odds.prob + '%');
    setText(e, 'odds-ev', (odds.ev >= 0 ? '+' : '') + '$' + odds.ev);
    setText(e, 'odds-max', '$' + odds.maxPayout);
    setText(e, 'odds-edge', odds.edge + '%');
    setText(e, 'odds-risk', odds.risk);
  }

  // ─── Favorites Management ───
  function saveFavoriteBet(slot: number) {
    if (bets.length === 0) { showToast('No bets to save!'); return; }
    const types = new Set(bets.map(b => b.type));
    const totalAmount = bets.reduce((s, b) => s + b.amount, 0);
    const name = [...types].slice(0, 3).join('+') + ' $' + totalAmount;
    favorites[slot] = { name, bets: bets.map(b => ({ ...b })) };
    saveFavorites(favorites);
    showToast('Saved to slot ' + (slot + 1) + '!');
    updateFavoritesPanel();
  }

  function loadFavoriteBet(slot: number) {
    const fav = favorites[slot];
    if (!fav) { showToast('Slot ' + (slot + 1) + ' is empty!'); return; }
    const totalNeeded = fav.bets.reduce((s, b) => s + b.amount, 0);
    if (totalNeeded > bankroll && gameMode !== 'practice') { showToast('Not enough chips!'); return; }
    clearBets();
    bets = fav.bets.map(b => ({ ...b }));
    if (gameMode !== 'practice') bankroll -= totalNeeded;
    clearChipMarkers();
    for (const b of bets) {
      const zone = betZones.find(z => z.type === b.type && z.number === b.number);
      if (zone) addChipMarker(zone.mesh.position.clone());
    }
    showToast('Loaded from slot ' + (slot + 1));
    showDealer('Your favorite bet is in play.', fav.name);
    updateHUD();
  }

  function updateFavoritesPanel() {
    const e = panelEntities['favorites'];
    if (!e) return;
    for (let i = 0; i < 5; i++) {
      const fav = favorites[i];
      setText(e, 'fav-' + (i + 1), fav ? fav.name : 'Empty');
    }
  }

  // ─── Tutorial ───
  function showTutorial() {
    tutorialStep = 0;
    tutorialActive = true;
    uiState = 'tutorial';
    hideAllPanels();
    const te = panelEntities['tutorial'];
    if (te && te.object3D) te.object3D.visible = true;
    updateTutorialPanel();
  }

  function updateTutorialPanel() {
    const e = panelEntities['tutorial'];
    if (!e) return;
    const step = TUTORIAL_STEPS[tutorialStep];
    setText(e, 'tut-title', step.title);
    setText(e, 'tut-desc', step.desc);
    setText(e, 'tut-step', 'Step ' + (tutorialStep + 1) + ' of ' + TUTORIAL_STEPS.length);
    setText(e, 'tut-page', (tutorialStep + 1) + '/' + TUTORIAL_STEPS.length);
  }

  // ─── Call Bets ───
  function placeCallBet(numbers: number[]) {
    if (uiState !== 'playing' || isSpinning) return;
    const chipCost = selectedChip * numbers.length;
    if (chipCost > bankroll && gameMode !== 'practice') {
      showToast('Not enough chips!');
      return;
    }
    for (const num of numbers) {
      bets.push({ type: 'straight', number: num, amount: selectedChip });
      if (gameMode !== 'practice') bankroll -= selectedChip;
      state.betTypesUsed.add('straight');
      const zone = betZones.find(z => z.type === 'straight' && z.number === num);
      if (zone) addChipMarker(zone.mesh.position.clone());
    }
    playChipPlace();
    updateHUD();
  }

  function placeVoisins() {
    placeCallBet(VOISINS_DU_ZERO);
    showToast('Voisins du Zero — 17 numbers!');
  }

  function placeTiers() {
    placeCallBet(TIERS_DU_CYLINDRE);
    showToast('Tiers du Cylindre — 12 numbers!');
  }

  function placeOrphelins() {
    placeCallBet(ORPHELINS);
    showToast('Orphelins — 8 numbers!');
  }

  function placeJeuZero() {
    placeCallBet(JEU_ZERO);
    showToast('Jeu Zero — 7 numbers!');
  }

  function placeNeighborBet(centerNumber: number) {
    const nbrs = getNeighbors(centerNumber, neighborCount, isAmerican);
    placeCallBet(nbrs);
    showToast(centerNumber + ' + ' + neighborCount + ' neighbors');
    neighborPickMode = false;
  }

  // ─── Quick Bet Patterns ───
  function placeQuickBet(type: BetType) {
    if (uiState !== 'playing' && uiState !== 'quickbets') return;
    if (selectedChip > bankroll && gameMode !== 'practice') return;
    bets.push({ type, amount: selectedChip });
    if (gameMode !== 'practice') bankroll -= selectedChip;
    state.betTypesUsed.add(type);
    const zone = betZones.find(z => z.type === type && z.number === undefined);
    if (zone) addChipMarker(zone.mesh.position.clone());
    playChipPlace();
    updateHUD();
    updateOddsPanel();
  }

  function placeQuickBetGroup(numbers: number[]) {
    if (uiState !== 'playing' && uiState !== 'quickbets') return;
    const chipCost = selectedChip * numbers.length;
    if (chipCost > bankroll && gameMode !== 'practice') {
      showToast('Not enough chips!');
      return;
    }
    for (const num of numbers) {
      bets.push({ type: 'straight', number: num, amount: selectedChip });
      if (gameMode !== 'practice') bankroll -= selectedChip;
      state.betTypesUsed.add('straight');
      const zone = betZones.find(z => z.type === 'straight' && z.number === num);
      if (zone) addChipMarker(zone.mesh.position.clone());
    }
    playChipPlace();
    updateHUD();
    updateOddsPanel();
  }

  // Snake bet: 1, 5, 9, 12, 14, 16, 19, 23, 27, 30, 32, 34 (zigzag across the table)
  const SNAKE_BET = [1, 5, 9, 12, 14, 16, 19, 23, 27, 30, 32, 34];

  function getHot5(): number[] {
    const sorted = [...state.hotNumbers.entries()].sort((a, b) => b[1] - a[1]);
    return sorted.slice(0, 5).map(([n]) => n);
  }

  function getCold5(): number[] {
    const allNums: number[] = [];
    const pCount = isAmerican ? 38 : 37;
    const seq = isAmerican ? AMER_SEQUENCE : EURO_SEQUENCE;
    for (let i = 0; i < pCount; i++) allNums.push(seq[i]);
    const coldSorted = allNums.map(n => ({ num: n, cnt: state.hotNumbers.get(n) || 0 })).sort((a, b) => a.cnt - b.cnt);
    return coldSorted.slice(0, 5).map(c => c.num);
  }

  // ─── Number Heatmap ───
  function updateHeatmap() {
    if (!heatmapEnabled || spinHistory.length === 0) return;
    const counts = new Map<number, number>();
    for (const n of spinHistory) {
      counts.set(n, (counts.get(n) || 0) + 1);
    }
    const maxCount = Math.max(...counts.values(), 1);
    for (const zone of betZones) {
      if (zone.type === 'straight' && zone.number !== undefined) {
        const cnt = counts.get(zone.number) || 0;
        const intensity = cnt / maxCount;
        // Blend in a warm glow for frequently-hit numbers
        if (cnt > 0 && uiState === 'playing') {
          const mat = zone.mesh.material as MeshStandardMaterial;
          mat.emissiveIntensity = 0.2 + intensity * 0.6;
        }
      }
    }
  }

  // ─── Session Timer ───
  function formatSessionTime(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return min + ':' + (sec < 10 ? '0' : '') + sec;
  }

  // ─── Auto-Spin ───
  function startAutoSpin() {
    if (lastBets.length === 0) {
      showToast('Place a bet first!');
      return;
    }
    autoSpinCount = 0;
    autoSpinRunning = true;
    autoSpinPauseTimer = 0;
    showToast('Auto-spin started: ' + autoSpinMax + ' spins');
    triggerAutoSpin();
  }

  function stopAutoSpin() {
    autoSpinRunning = false;
    autoSpinCount = 0;
    showToast('Auto-spin stopped');
  }

  function doubleBets() {
    if (bets.length === 0 || isSpinning) return;
    const extraCost = bets.reduce((s, b) => s + b.amount, 0);
    if (extraCost > bankroll && gameMode !== 'practice') {
      showToast('Not enough chips to double!');
      return;
    }
    for (const b of bets) {
      if (gameMode !== 'practice') bankroll -= b.amount;
      b.amount *= 2;
    }
    playChipPlace();
    showToast('Bets doubled!');
    updateHUD();
  }

  function triggerAutoSpin() {
    if (!autoSpinRunning) return;
    if (autoSpinCount >= autoSpinMax) {
      stopAutoSpin();
      showToast('Auto-spin complete!');
      return;
    }
    if (bankroll <= 0 && gameMode !== 'practice') {
      stopAutoSpin();
      showToast('Out of chips!');
      return;
    }
    if (bankroll >= autoSpinStopAmount && autoSpinCount > 0) {
      stopAutoSpin();
      showToast('Win target reached: $' + bankroll + '!');
      return;
    }
    // Rebet and spin
    rebet();
    if (bets.length > 0) {
      autoSpinCount++;
      startSpin();
    } else {
      stopAutoSpin();
    }
  }

  // ─── UI Panel Management ───
  const panelEntities: Record<string, Entity> = {};
  const panelDocs: Record<string, UIKitDocument> = {};

  function hideAllPanels() {
    for (const key of Object.keys(panelEntities)) {
      const e = panelEntities[key];
      if (e && e.object3D) e.object3D.visible = false;
    }
  }

  function showPanel(name: string) {
    hideAllPanels();
    // Show relevant panels
    const show = (k: string) => { if (panelEntities[k] && panelEntities[k].object3D) panelEntities[k].object3D.visible = true; };

    switch (name) {
      case 'title': show('title'); break;
      case 'modes': show('modes'); break;
      case 'table': show('table'); break;
      case 'playing': show('hud'); show('betting'); show('history'); show('hotcold'); show('payouts'); show('odds'); break;
      case 'spinning': show('hud'); show('dealer'); break;
      case 'result': show('result'); show('hud'); show('dealer'); break;
      case 'gameover': show('gameover'); break;
      case 'leaderboard': show('leaderboard'); break;
      case 'achievements': show('achievements'); break;
      case 'stats': show('stats'); break;
      case 'settings': show('settings'); break;
      case 'help': show('help'); break;
      case 'pause': show('pause'); break;
      case 'chips': show('chips'); break;
      case 'callbets': show('callbets'); show('hud'); show('racetrack'); break;
      case 'autospin': show('autospin'); show('hud'); break;
      case 'favorites': show('favorites'); show('hud'); break;
      case 'tutorial': show('tutorial'); break;
      case 'quickbets': show('quickbets'); show('hud'); break;
    }
  }

  function setText(entity: Entity, id: string, text: string) {
    const doc = entity.getValue(PanelDocument, 'document') as UIKitDocument | undefined;
    if (!doc) return;
    const el = doc.getElementById(id) as UIKit.Text | undefined;
    el?.setProperties({ text });
  }

  function updateHUD() {
    const e = panelEntities['hud'];
    if (!e) return;
    setText(e, 'bankroll', '$' + bankroll);
    setText(e, 'bet-total', 'Bet: $' + bets.reduce((s, b) => s + b.amount, 0));
    setText(e, 'last-number', currentResult >= 0 ? (currentResult === 37 ? '00' : String(currentResult)) + ' ' + (isRed(currentResult) ? 'RED' : isBlack(currentResult) ? 'BLACK' : 'GREEN') : '--');
    setText(e, 'spin-count', 'Spin ' + sessionSpins + '/' + maxSpins);
    setText(e, 'mode-label', gameMode);
    setText(e, 'streak-label', 'Streak: ' + currentStreak);
    sessionProfit = bankroll - startingBankroll;
    setText(e, 'profit-label', (sessionProfit >= 0 ? '+' : '') + '$' + sessionProfit);
    // Calculate bet coverage
    const coveredNumbers = new Set<number>();
    for (const b of bets) {
      if (b.number !== undefined) coveredNumbers.add(b.number);
      if (b.numbers) for (const n of b.numbers) coveredNumbers.add(n);
      if (b.type === 'red') { for (let i = 1; i <= 36; i++) if (isRed(i)) coveredNumbers.add(i); }
      if (b.type === 'black') { for (let i = 1; i <= 36; i++) if (isBlack(i)) coveredNumbers.add(i); }
      if (b.type === 'odd') { for (let i = 1; i <= 36; i += 2) coveredNumbers.add(i); }
      if (b.type === 'even') { for (let i = 2; i <= 36; i += 2) coveredNumbers.add(i); }
      if (b.type === 'low') { for (let i = 1; i <= 18; i++) coveredNumbers.add(i); }
      if (b.type === 'high') { for (let i = 19; i <= 36; i++) coveredNumbers.add(i); }
      if (b.type === 'dozen1') { for (let i = 1; i <= 12; i++) coveredNumbers.add(i); }
      if (b.type === 'dozen2') { for (let i = 13; i <= 24; i++) coveredNumbers.add(i); }
      if (b.type === 'dozen3') { for (let i = 25; i <= 36; i++) coveredNumbers.add(i); }
      if (b.type === 'col1') { for (let i = 1; i <= 36; i += 3) coveredNumbers.add(i); }
      if (b.type === 'col2') { for (let i = 2; i <= 36; i += 3) coveredNumbers.add(i); }
      if (b.type === 'col3') { for (let i = 3; i <= 36; i += 3) coveredNumbers.add(i); }
      if (b.type === 'five') [0, 37, 1, 2, 3].forEach(n => coveredNumbers.add(n));
    }
    const totalPockets = isAmerican ? 38 : 37;
    setText(e, 'coverage-label', 'Coverage: ' + coveredNumbers.size + '/' + totalPockets);
    // Show active rules
    const rules: string[] = [];
    if (laPartageEnabled) rules.push('La Partage');
    if (enPrisonEnabled) rules.push('En Prison');
    if (martingaleActive) rules.push('Martingale');
    if (enPrisonBets.length > 0) rules.push(enPrisonBets.length + ' imprisoned');
    setText(e, 'rule-label', rules.join(' | '));
    // Session timer
    if (sessionStartTime > 0) {
      sessionElapsed = Date.now() - sessionStartTime;
      setText(e, 'session-time', formatSessionTime(sessionElapsed));
    }
    // Update betting panel summary
    updateBetSummary();
  }

  function showResultPanel(totalWin: number) {
    const e = panelEntities['result'];
    if (!e) return;
    const numStr = currentResult === 37 ? '00' : String(currentResult);
    const colStr = isRed(currentResult) ? 'RED' : isBlack(currentResult) ? 'BLACK' : 'GREEN';
    setText(e, 'result-label', numStr + ' ' + colStr);
    setText(e, 'win-label', totalWin > 0 ? 'WIN $' + totalWin + '!' : 'No win');
    setText(e, 'bets-detail', lastBets.map(b => b.type + (b.number !== undefined ? ' ' + b.number : '')).join(', '));
    setText(e, 'bankroll-label', 'Bankroll: $' + bankroll);
    setText(e, 'session-profit', 'Session: ' + (sessionProfit >= 0 ? '+' : '') + '$' + sessionProfit);
    if (partageRefund > 0) {
      setText(e, 'partage-label', 'La Partage: +$' + partageRefund + ' returned');
    } else if (enPrisonBets.length > 0) {
      setText(e, 'partage-label', 'En Prison: ' + enPrisonBets.length + ' bet(s) locked');
    } else {
      setText(e, 'partage-label', '');
    }
  }

  function updateHistoryPanel() {
    const e = panelEntities['history'];
    if (!e) return;
    for (let i = 0; i < 10; i++) {
      const num = spinHistory[i];
      if (num !== undefined) {
        const colStr = isRed(num) ? 'R' : isBlack(num) ? 'B' : 'G';
        setText(e, 'h' + (i + 1), (num === 37 ? '00' : String(num)) + ' ' + colStr);
      } else {
        setText(e, 'h' + (i + 1), '--');
      }
    }
  }

  function updateBettingPanel() {
    const e = panelEntities['betting'];
    if (!e) return;
    setText(e, 'selected-chip', 'Selected: $' + selectedChip);
    setText(e, 'martingale-status', martingaleActive ? 'ON' : 'OFF');
  }

  function updateBetSummary() {
    const e = panelEntities['betting'];
    if (!e) return;
    if (bets.length === 0) {
      setText(e, 'bet-summary', 'No bets placed');
      return;
    }
    // Group bets by type and sum
    const groups = new Map<string, number>();
    for (const b of bets) {
      const key = b.type;
      groups.set(key, (groups.get(key) || 0) + b.amount);
    }
    const parts: string[] = [];
    for (const [type, amount] of groups) {
      parts.push(type + ': $' + amount);
    }
    setText(e, 'bet-summary', parts.slice(0, 4).join(' | ') + (parts.length > 4 ? ' +' + (parts.length - 4) + ' more' : ''));
  }

  // Martingale: auto-double on loss for even-money bets
  function applyMartingale() {
    if (!martingaleActive || lastBets.length === 0) return;
    // Only apply to even-money bets
    const evenMoneyTypes: BetType[] = ['red', 'black', 'odd', 'even', 'low', 'high'];
    const mgBets = lastBets.filter(b => evenMoneyTypes.includes(b.type));
    if (mgBets.length === 0) return;
    // Double each even-money bet
    const doubled = mgBets.map(b => ({ ...b, amount: b.amount * 2 }));
    const totalCost = doubled.reduce((s, b) => s + b.amount, 0);
    if (totalCost > bankroll && gameMode !== 'practice') {
      showToast('Martingale: not enough chips');
      return;
    }
    bets = doubled;
    if (gameMode !== 'practice') bankroll -= totalCost;
    clearChipMarkers();
    for (const b of bets) {
      const zone = betZones.find(z => z.type === b.type && z.number === b.number);
      if (zone) addChipMarker(zone.mesh.position.clone());
    }
    showToast('Martingale: doubled to $' + totalCost);
    updateHUD();
  }

  // ─── Create UI Entities ───
  const panelConfigs: Record<string, { config: string; world: boolean; pos: [number, number, number]; scale?: number; follower?: boolean; screenSpace?: boolean }> = {
    title: { config: './ui/title.json', world: true, pos: [0, 2.0, -3.5], scale: 1.5 },
    modes: { config: './ui/modes.json', world: true, pos: [0, 2.0, -3.5], scale: 1.5 },
    table: { config: './ui/table.json', world: true, pos: [0, 2.0, -3.5], scale: 1.5 },
    hud: { config: './ui/hud.json', world: false, pos: [0, 0, 0], follower: true },
    betting: { config: './ui/betting.json', world: false, pos: [0, 0, 0], screenSpace: true },
    result: { config: './ui/result.json', world: true, pos: [0, 2.0, -3.0], scale: 1.5 },
    history: { config: './ui/history.json', world: true, pos: [1.8, 1.5, -2.5], scale: 0.8 },
    gameover: { config: './ui/gameover.json', world: true, pos: [0, 2.0, -3.5], scale: 1.5 },
    leaderboard: { config: './ui/leaderboard.json', world: true, pos: [0, 2.0, -3.5], scale: 1.2 },
    achievements: { config: './ui/achievements.json', world: true, pos: [0, 2.0, -3.5], scale: 1.2 },
    stats: { config: './ui/stats.json', world: true, pos: [0, 2.0, -3.5], scale: 1.2 },
    settings: { config: './ui/settings.json', world: true, pos: [0, 2.0, -3.5], scale: 1.2 },
    help: { config: './ui/help.json', world: true, pos: [0, 2.0, -3.5], scale: 1.2 },
    pause: { config: './ui/pause.json', world: true, pos: [0, 2.0, -3.0], scale: 1.5 },
    toast: { config: './ui/toast.json', world: false, pos: [0, 0, 0], follower: true },
    countdown: { config: './ui/countdown.json', world: false, pos: [0, 0, 0], follower: true },
    chips: { config: './ui/chips.json', world: true, pos: [0, 2.0, -3.5], scale: 1.2 },
    hotcold: { config: './ui/hotcold.json', world: true, pos: [-1.8, 1.5, -2.5], scale: 0.8 },
    payouts: { config: './ui/payouts.json', world: true, pos: [1.8, 1.8, -2.0], scale: 0.7 },
    callbets: { config: './ui/callbets.json', world: true, pos: [-1.8, 1.8, -2.0], scale: 0.9 },
    autospin: { config: './ui/autospin.json', world: true, pos: [0, 2.0, -3.5], scale: 1.2 },
    racetrack: { config: './ui/racetrack.json', world: true, pos: [-1.5, 2.0, -2.0], scale: 0.9 },
    dealer: { config: './ui/dealer.json', world: true, pos: [0, 2.5, -2.5], scale: 1.0 },
    odds: { config: './ui/odds.json', world: true, pos: [-1.8, 1.2, -2.0], scale: 0.7 },
    favorites: { config: './ui/favorites.json', world: true, pos: [0, 2.0, -3.5], scale: 1.2 },
    tutorial: { config: './ui/tutorial.json', world: true, pos: [0, 2.0, -3.5], scale: 1.5 },
    quickbets: { config: './ui/quickbets.json', world: true, pos: [0, 2.0, -3.5], scale: 1.2 },
  };

  for (const [key, cfg] of Object.entries(panelConfigs)) {
    const entity = world.createEntity();
    entity.addComponent(PanelUI, { config: cfg.config });
    if (cfg.follower) {
      entity.addComponent(Follower, { target: world.player.head });
    } else if (cfg.screenSpace) {
      entity.addComponent(ScreenSpace, {});
    }
    panelEntities[key] = entity;
  }

  // ─── UI System ───
  class RouletteUISystem extends createSystem({
    titleQ: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/title.json')] },
    modesQ: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/modes.json')] },
    tableQ: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/table.json')] },
    hudQ: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/hud.json')] },
    bettingQ: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/betting.json')] },
    resultQ: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/result.json')] },
    historyQ: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/history.json')] },
    gameoverQ: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/gameover.json')] },
    leaderboardQ: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/leaderboard.json')] },
    achievementsQ: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/achievements.json')] },
    statsQ: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/stats.json')] },
    settingsQ: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/settings.json')] },
    helpQ: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/help.json')] },
    pauseQ: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/pause.json')] },
    toastQ: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/toast.json')] },
    countdownQ: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/countdown.json')] },
    chipsQ: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/chips.json')] },
    hotcoldQ: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/hotcold.json')] },
    payoutsQ: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/payouts.json')] },
    callbetsQ: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/callbets.json')] },
    autospinQ: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/autospin.json')] },
    racetrackQ: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/racetrack.json')] },
    dealerQ: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/dealer.json')] },
    oddsQ: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/odds.json')] },
    favoritesQ: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/favorites.json')] },
    tutorialQ: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/tutorial.json')] },
    quickbetsQ: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/quickbets.json')] },
  }) {
    init() {
      const wire = (qName: string, key: string, bindings: Record<string, () => void>) => {
        (this.queries as any)[qName].subscribe('qualify', (entity: Entity) => {
          const doc = entity.getValue(PanelDocument, 'document') as UIKitDocument;
          if (!doc) return;
          panelDocs[key] = doc;
          for (const [id, handler] of Object.entries(bindings)) {
            const el = doc.getElementById(id) as UIKit.Text | undefined;
            el?.addEventListener('click', handler);
          }
          // Position world-space panels
          const cfg = panelConfigs[key];
          if (cfg.world && entity.object3D) {
            entity.object3D.position.set(...cfg.pos);
            if (cfg.scale) entity.object3D.scale.setScalar(cfg.scale);
          }
          if (entity.object3D) entity.object3D.visible = false;
        });
      };

      const toTitle = () => { uiState = 'title'; showPanel('title'); playClick(); };
      let selectedTableMode: GameMode = 'session';

      wire('titleQ', 'title', {
        'btn-play': () => { uiState = 'modes'; showPanel('modes'); playClick(); },
        'btn-scores': () => { uiState = 'leaderboard'; showPanel('leaderboard'); updateLeaderboard(); playClick(); },
        'btn-achievements': () => { uiState = 'achievements'; showPanel('achievements'); updateAchievements(); playClick(); },
        'btn-stats': () => { uiState = 'stats'; showPanel('stats'); updateStats(); playClick(); },
        'btn-chips': () => { uiState = 'chips'; showPanel('chips'); playClick(); },
        'btn-settings': () => { uiState = 'settings'; showPanel('settings'); playClick(); },
        'btn-help': () => { uiState = 'help'; showPanel('help'); playClick(); },
        'btn-tutorial': () => { showTutorial(); playClick(); },
        'btn-favorites': () => { uiState = 'favorites' as UIState; hideAllPanels(); const fe = panelEntities['favorites']; if (fe && fe.object3D) fe.object3D.visible = true; updateFavoritesPanel(); playClick(); },
      });

      wire('modesQ', 'modes', {
        'btn-single': () => { selectedTableMode = 'single'; uiState = 'table'; showPanel('table'); playClick(); },
        'btn-session': () => { selectedTableMode = 'session'; uiState = 'table'; showPanel('table'); playClick(); },
        'btn-marathon': () => { selectedTableMode = 'marathon'; uiState = 'table'; showPanel('table'); playClick(); },
        'btn-high-roller': () => { selectedTableMode = 'high-roller'; uiState = 'table'; showPanel('table'); playClick(); },
        'btn-daily': () => { selectedTableMode = 'daily'; uiState = 'table'; showPanel('table'); playClick(); },
        'btn-practice': () => { selectedTableMode = 'practice'; uiState = 'table'; showPanel('table'); playClick(); },
        'btn-streak': () => { selectedTableMode = 'streak'; uiState = 'table'; showPanel('table'); playClick(); },
        'btn-tournament': () => { selectedTableMode = 'tournament'; uiState = 'table'; showPanel('table'); playClick(); },
        'btn-back': toTitle,
      });

      wire('tableQ', 'table', {
        'btn-european': () => { startGame(selectedTableMode, false); playClick(); },
        'btn-american': () => { startGame(selectedTableMode, true); playClick(); },
        'btn-back': () => { uiState = 'modes'; showPanel('modes'); playClick(); },
      });

      wire('bettingQ', 'betting', {
        'chip-1': () => { selectedChip = 1; updateBettingPanel(); playClick(); },
        'chip-5': () => { selectedChip = 5; updateBettingPanel(); playClick(); },
        'chip-10': () => { selectedChip = 10; updateBettingPanel(); playClick(); },
        'chip-25': () => { selectedChip = 25; updateBettingPanel(); playClick(); },
        'chip-100': () => { selectedChip = 100; updateBettingPanel(); playClick(); },
        'btn-spin': () => { if (bets.length > 0) startSpin(); },
        'btn-clear': () => { clearBets(); playClick(); },
        'btn-rebet': () => { rebet(); playClick(); },
        'btn-callbets': () => { hideAllPanels(); const ce = panelEntities['callbets']; if (ce && ce.object3D) ce.object3D.visible = true; const re = panelEntities['racetrack']; if (re && re.object3D) re.object3D.visible = true; const he = panelEntities['hud']; if (he && he.object3D) he.object3D.visible = true; updateCallBetsPanel(); updateRacetrackPanel(); playClick(); },
        'btn-autospin': () => { hideAllPanels(); const ae = panelEntities['autospin']; if (ae && ae.object3D) ae.object3D.visible = true; const he = panelEntities['hud']; if (he && he.object3D) he.object3D.visible = true; updateAutoSpinPanel(); playClick(); },
        'btn-double': () => { doubleBets(); playClick(); },
        'btn-martingale': () => { martingaleActive = !martingaleActive; updateBettingPanel(); playClick(); showToast('Martingale: ' + (martingaleActive ? 'ON' : 'OFF')); },
        'btn-favorites': () => { uiState = 'favorites' as UIState; hideAllPanels(); const fe = panelEntities['favorites']; if (fe && fe.object3D) fe.object3D.visible = true; const he = panelEntities['hud']; if (he && he.object3D) he.object3D.visible = true; updateFavoritesPanel(); playClick(); },
        'btn-undo': () => { undoLastBet(); },
        'btn-quickbets': () => { uiState = 'quickbets'; hideAllPanels(); const qe = panelEntities['quickbets']; if (qe && qe.object3D) qe.object3D.visible = true; const he = panelEntities['hud']; if (he && he.object3D) he.object3D.visible = true; playClick(); },
      });

      wire('resultQ', 'result', {
        'btn-continue': () => { continueAfterResult(); playClick(); },
      });

      wire('gameoverQ', 'gameover', {
        'btn-rematch': () => { startGame(gameMode, isAmerican); playClick(); },
        'btn-menu': toTitle,
      });

      wire('leaderboardQ', 'leaderboard', { 'btn-back': toTitle });
      wire('achievementsQ', 'achievements', {
        'btn-prev': () => { if (achPage > 0) { achPage--; updateAchievements(); playClick(); } },
        'btn-next': () => { if ((achPage + 1) * 15 < ACHIEVEMENTS.length) { achPage++; updateAchievements(); playClick(); } },
        'btn-back': toTitle,
      });
      wire('statsQ', 'stats', { 'btn-back': toTitle });
      wire('settingsQ', 'settings', {
        'master-up': () => { masterVol = Math.min(1, masterVol + 0.1); if (masterGain) masterGain.gain.value = masterVol; updateSettingsPanel(); },
        'master-down': () => { masterVol = Math.max(0, masterVol - 0.1); if (masterGain) masterGain.gain.value = masterVol; updateSettingsPanel(); },
        'sfx-up': () => { sfxVol = Math.min(1, sfxVol + 0.1); if (sfxGain) sfxGain.gain.value = sfxVol; updateSettingsPanel(); },
        'sfx-down': () => { sfxVol = Math.max(0, sfxVol - 0.1); if (sfxGain) sfxGain.gain.value = sfxVol; updateSettingsPanel(); },
        'music-up': () => { musicVol = Math.min(1, musicVol + 0.1); if (musicGain) musicGain.gain.value = musicVol; updateSettingsPanel(); },
        'music-down': () => { musicVol = Math.max(0, musicVol - 0.1); if (musicGain) musicGain.gain.value = musicVol; updateSettingsPanel(); },
        'theme-prev': () => { state.themeIdx = (state.themeIdx - 1 + THEMES.length) % THEMES.length; applyTheme(); state.themesUsed.add(theme().name); updateSettingsPanel(); saveState(state); },
        'theme-next': () => { state.themeIdx = (state.themeIdx + 1) % THEMES.length; applyTheme(); state.themesUsed.add(theme().name); updateSettingsPanel(); saveState(state); },
        'btn-partage': () => { laPartageEnabled = !laPartageEnabled; if (laPartageEnabled) enPrisonEnabled = false; updateSettingsPanel(); playClick(); },
        'btn-enprison': () => { enPrisonEnabled = !enPrisonEnabled; if (enPrisonEnabled) laPartageEnabled = false; updateSettingsPanel(); playClick(); },
        'btn-back': toTitle,
      });
      wire('helpQ', 'help', { 'btn-back': toTitle });
      wire('pauseQ', 'pause', {
        'btn-resume': () => { uiState = 'playing'; showPanel('playing'); updateHUD(); playClick(); },
        'btn-quit': toTitle,
      });
      wire('chipsQ', 'chips', {
        'c1': () => { if (state.skinsUnlocked >= 1) { state.chipSkin = 0; saveState(state); updateChipsPanel(); playClick(); } },
        'c2': () => { if (state.skinsUnlocked >= 2) { state.chipSkin = 1; saveState(state); updateChipsPanel(); playClick(); } },
        'c3': () => { if (state.skinsUnlocked >= 3) { state.chipSkin = 2; saveState(state); updateChipsPanel(); playClick(); } },
        'c4': () => { if (state.skinsUnlocked >= 4) { state.chipSkin = 3; saveState(state); updateChipsPanel(); playClick(); } },
        'c5': () => { if (state.skinsUnlocked >= 5) { state.chipSkin = 4; saveState(state); updateChipsPanel(); playClick(); } },
        'c6': () => { if (state.skinsUnlocked >= 6) { state.chipSkin = 5; saveState(state); updateChipsPanel(); playClick(); } },
        'c7': () => { if (state.skinsUnlocked >= 7) { state.chipSkin = 6; saveState(state); updateChipsPanel(); playClick(); } },
        'c8': () => { if (state.skinsUnlocked >= 8) { state.chipSkin = 7; saveState(state); updateChipsPanel(); playClick(); } },
        'btn-back': toTitle,
      });

      wire('hotcoldQ', 'hotcold', {});
      wire('payoutsQ', 'payouts', {});

      wire('callbetsQ', 'callbets', {
        'btn-voisins': () => { placeVoisins(); playClick(); },
        'btn-tiers': () => { placeTiers(); playClick(); },
        'btn-orphelins': () => { placeOrphelins(); playClick(); },
        'btn-jeuzero': () => { placeJeuZero(); playClick(); },
        'nbr-minus': () => { neighborCount = Math.max(1, neighborCount - 1); updateCallBetsPanel(); playClick(); },
        'nbr-plus': () => { neighborCount = Math.min(5, neighborCount + 1); updateCallBetsPanel(); playClick(); },
        'nbr-pick': () => { neighborPickMode = !neighborPickMode; updateCallBetsPanel(); playClick(); },
        'btn-back': () => { uiState = 'playing'; showPanel('playing'); updateHUD(); playClick(); },
      });

      wire('autospinQ', 'autospin', {
        'auto-minus': () => { autoSpinMax = Math.max(5, autoSpinMax - 5); updateAutoSpinPanel(); playClick(); },
        'auto-plus': () => { autoSpinMax = Math.min(100, autoSpinMax + 5); updateAutoSpinPanel(); playClick(); },
        'stop-minus': () => { autoSpinStopAmount = Math.max(100, autoSpinStopAmount - 100); updateAutoSpinPanel(); playClick(); },
        'stop-plus': () => { autoSpinStopAmount = Math.min(50000, autoSpinStopAmount + 100); updateAutoSpinPanel(); playClick(); },
        'btn-start-auto': () => { startAutoSpin(); uiState = 'playing'; showPanel('playing'); updateHUD(); playClick(); },
        'btn-stop-auto': () => { stopAutoSpin(); updateAutoSpinPanel(); playClick(); },
        'btn-back': () => { uiState = 'playing'; showPanel('playing'); updateHUD(); playClick(); },
      });

      wire('racetrackQ', 'racetrack', {
        'btn-close-track': () => { uiState = 'playing'; showPanel('playing'); updateHUD(); playClick(); },
      });

      wire('dealerQ', 'dealer', {});

      wire('oddsQ', 'odds', {});

      wire('favoritesQ', 'favorites', {
        'fav-save-1': () => { saveFavoriteBet(0); playClick(); },
        'fav-save-2': () => { saveFavoriteBet(1); playClick(); },
        'fav-save-3': () => { saveFavoriteBet(2); playClick(); },
        'fav-save-4': () => { saveFavoriteBet(3); playClick(); },
        'fav-save-5': () => { saveFavoriteBet(4); playClick(); },
        'fav-load-1': () => { loadFavoriteBet(0); uiState = 'playing'; showPanel('playing'); updateHUD(); playClick(); },
        'fav-load-2': () => { loadFavoriteBet(1); uiState = 'playing'; showPanel('playing'); updateHUD(); playClick(); },
        'fav-load-3': () => { loadFavoriteBet(2); uiState = 'playing'; showPanel('playing'); updateHUD(); playClick(); },
        'fav-load-4': () => { loadFavoriteBet(3); uiState = 'playing'; showPanel('playing'); updateHUD(); playClick(); },
        'fav-load-5': () => { loadFavoriteBet(4); uiState = 'playing'; showPanel('playing'); updateHUD(); playClick(); },
        'btn-back': () => { uiState = 'playing'; showPanel('playing'); updateHUD(); playClick(); },
      });

      wire('tutorialQ', 'tutorial', {
        'tut-prev': () => { if (tutorialStep > 0) { tutorialStep--; updateTutorialPanel(); playClick(); } },
        'tut-next': () => { if (tutorialStep < TUTORIAL_STEPS.length - 1) { tutorialStep++; updateTutorialPanel(); playClick(); } else { tutorialActive = false; uiState = 'title'; showPanel('title'); playClick(); } },
        'tut-skip': () => { tutorialActive = false; uiState = 'title'; showPanel('title'); playClick(); },
      });

      const backToPlaying = () => { uiState = 'playing'; showPanel('playing'); updateHUD(); playClick(); };
      wire('quickbetsQ', 'quickbets', {
        'qb-all-red': () => { placeQuickBet('red'); showToast('All Red! 18 numbers'); playClick(); },
        'qb-all-black': () => { placeQuickBet('black'); showToast('All Black! 18 numbers'); playClick(); },
        'qb-all-odd': () => { placeQuickBet('odd'); showToast('All Odd! 18 numbers'); playClick(); },
        'qb-all-even': () => { placeQuickBet('even'); showToast('All Even! 18 numbers'); playClick(); },
        'qb-low': () => { placeQuickBet('low'); showToast('1-18! Low numbers'); playClick(); },
        'qb-high': () => { placeQuickBet('high'); showToast('19-36! High numbers'); playClick(); },
        'qb-columns-all': () => { placeQuickBet('col1'); placeQuickBet('col2'); placeQuickBet('col3'); showToast('All 3 Columns!'); playClick(); },
        'qb-dozens-all': () => { placeQuickBet('dozen1'); placeQuickBet('dozen2'); placeQuickBet('dozen3'); showToast('All 3 Dozens!'); playClick(); },
        'qb-streets-all': () => { for (const st of STREETS) { const chipCost = selectedChip; if (chipCost <= bankroll || gameMode === 'practice') { bets.push({ type: 'street', numbers: st, amount: selectedChip }); if (gameMode !== 'practice') bankroll -= selectedChip; } } playChipPlace(); showToast('All 12 Streets!'); updateHUD(); updateOddsPanel(); },
        'qb-corners-all': () => { placeQuickBetGroup(SNAKE_BET); showToast('Snake Bet! 12 numbers zigzag'); },
        'qb-first-6': () => { placeQuickBetGroup([1, 2, 3, 4, 5, 6]); showToast('Numbers 1-6!'); },
        'qb-mid-6': () => { placeQuickBetGroup([16, 17, 18, 19, 20, 21]); showToast('Numbers 16-21!'); },
        'qb-last-6': () => { placeQuickBetGroup([31, 32, 33, 34, 35, 36]); showToast('Numbers 31-36!'); },
        'qb-hot-5': () => { const hot = getHot5(); if (hot.length === 0) { showToast('No history yet!'); } else { placeQuickBetGroup(hot); showToast('Hot 5: ' + hot.join(',')); } playClick(); },
        'qb-cold-5': () => { const cold = getCold5(); placeQuickBetGroup(cold.slice(0, 5)); showToast('Cold 5: ' + cold.slice(0, 5).join(',')); playClick(); },
        'qb-back': backToPlaying,
      });
    }
  }

  function updateLeaderboard() {
    const e = panelEntities['leaderboard'];
    if (!e) return;
    const board = loadLeaderboard();
    for (let i = 0; i < 10; i++) {
      const entry = board[i];
      setText(e, 'r' + (i + 1), entry ? (i + 1) + '. $' + entry.score + ' (' + entry.mode + ') ' + entry.date : (i + 1) + '. ---');
    }
  }

  function updateAchievements() {
    const e = panelEntities['achievements'];
    if (!e) return;
    const start = achPage * 15;
    for (let i = 0; i < 15; i++) {
      const ach = ACHIEVEMENTS[start + i];
      if (ach) {
        const done = state.achievements.has(ach.id);
        setText(e, 'a' + (i + 1), (done ? '[x] ' : '[ ] ') + ach.name + ' - ' + ach.desc);
      } else {
        setText(e, 'a' + (i + 1), '');
      }
    }
    setText(e, 'page-label', (achPage + 1) + '/' + Math.ceil(ACHIEVEMENTS.length / 15));
  }

  function updateStats() {
    const e = panelEntities['stats'];
    if (!e) return;
    setText(e, 's1', 'Total Spins: ' + state.totalSpins);
    setText(e, 's2', 'Total Wins: ' + state.totalWins);
    setText(e, 's3', 'Win Rate: ' + (state.totalSpins > 0 ? Math.round(state.totalWins / state.totalSpins * 100) : 0) + '%');
    setText(e, 's4', 'Total Wagered: $' + state.totalWagered);
    setText(e, 's5', 'Total Won: $' + state.totalWon);
    setText(e, 's6', 'Best Win: $' + state.bestSingleWin);
    setText(e, 's7', 'Best Streak: ' + state.bestStreak);
    const sortedNums = [...state.hotNumbers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    setText(e, 's8', 'Hot Numbers: ' + (sortedNums.length > 0 ? sortedNums.map(([n, c]) => n + '(' + c + ')').join(', ') : '--'));
    setText(e, 's9', 'Sessions Played: ' + state.sessionsPlayed);
    setText(e, 's10', 'Level: ' + state.level + ' (' + state.xp + ' XP)');
  }

  function updateSettingsPanel() {
    const e = panelEntities['settings'];
    if (!e) return;
    setText(e, 'master-val', Math.round(masterVol * 100) + '%');
    setText(e, 'sfx-val', Math.round(sfxVol * 100) + '%');
    setText(e, 'music-val', Math.round(musicVol * 100) + '%');
    setText(e, 'theme-val', theme().name);
    setText(e, 'btn-partage', laPartageEnabled ? 'ON' : 'OFF');
    setText(e, 'btn-enprison', enPrisonEnabled ? 'ON' : 'OFF');
  }

  function updateChipsPanel() {
    const e = panelEntities['chips'];
    if (!e) return;
    const CHIP_NAMES = ['Classic Neon', 'Royal Red', 'Gold Rush', 'Void Purple', 'Solar Flare', 'Emerald', 'Rose Gold', 'Chrome'];
    const CHIP_REQUIREMENTS = ['Default', '50 wins', '5K wagered', '10 games', 'x3 streak', 'Straight win', 'All bet types', 'Level 25'];
    for (let i = 0; i < 8; i++) {
      const unlocked = state.skinsUnlocked > i;
      const equipped = state.chipSkin === i;
      const label = unlocked
        ? CHIP_NAMES[i] + (equipped ? ' [Equipped]' : '')
        : CHIP_NAMES[i] + ' (Locked: ' + CHIP_REQUIREMENTS[i] + ')';
      setText(e, 'c' + (i + 1), label);
    }
  }

  function updateHotCold() {
    const e = panelEntities['hotcold'];
    if (!e) return;
    // Hot: most landed numbers from session
    const counts = new Map<number, number>();
    for (const n of spinHistory) {
      counts.set(n, (counts.get(n) || 0) + 1);
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    for (let i = 0; i < 5; i++) {
      if (sorted[i]) {
        const [num, cnt] = sorted[i];
        const col = isRed(num) ? 'R' : isBlack(num) ? 'B' : 'G';
        setText(e, 'hot' + (i + 1), (num === 37 ? '00' : String(num)) + ' ' + col + ' (' + cnt + 'x)');
      } else {
        setText(e, 'hot' + (i + 1), '--');
      }
    }
    // Cold: all 37 numbers, find those that haven't appeared or appeared least
    const allNums: number[] = [];
    const pCount = isAmerican ? 38 : 37;
    for (let i = 0; i < pCount; i++) allNums.push(isAmerican ? AMER_SEQUENCE[i] : EURO_SEQUENCE[i]);
    const coldSorted = allNums.map(n => ({ num: n, cnt: counts.get(n) || 0 })).sort((a, b) => a.cnt - b.cnt);
    for (let i = 0; i < 5; i++) {
      const c = coldSorted[i];
      if (c) {
        const col = isRed(c.num) ? 'R' : isBlack(c.num) ? 'B' : 'G';
        setText(e, 'cold' + (i + 1), (c.num === 37 ? '00' : String(c.num)) + ' ' + col + ' (' + c.cnt + 'x)');
      } else {
        setText(e, 'cold' + (i + 1), '--');
      }
    }
  }

  function updateCallBetsPanel() {
    const e = panelEntities['callbets'];
    if (!e) return;
    setText(e, 'nbr-count', neighborCount + ' neighbor' + (neighborCount > 1 ? 's' : ''));
    setText(e, 'nbr-pick-label', neighborPickMode ? 'Click a number on table...' : 'Pick a number...');
  }

  function updateAutoSpinPanel() {
    const e = panelEntities['autospin'];
    if (!e) return;
    setText(e, 'auto-count', String(autoSpinMax));
    setText(e, 'stop-amount', '$' + autoSpinStopAmount);
    setText(e, 'auto-status', autoSpinRunning ? 'Running: ' + autoSpinCount + '/' + autoSpinMax : 'Not running');
  }

  function updateGameOverPanel() {
    const e = panelEntities['gameover'];
    if (!e) return;
    setText(e, 'mode-label', gameMode);
    setText(e, 'final-bankroll', '$' + bankroll);
    setText(e, 'spins-label', 'Spins: ' + sessionSpins);
    setText(e, 'wins-label', 'Wins: ' + sessionWins);
    setText(e, 'biggest-win', 'Best Win: $' + sessionBestWin);
    const startBank = gameMode === 'marathon' ? 5000 : gameMode === 'high-roller' ? 10000 : gameMode === 'tournament' ? 2000 : 1000;
    const profit = bankroll - startBank;
    setText(e, 'profit-label', 'Profit: ' + (profit >= 0 ? '+' : '') + '$' + profit);
    setText(e, 'streak-label', 'Best Streak: ' + sessionBestStreak);
    setText(e, 'duration-label', 'Duration: ' + formatSessionTime(sessionElapsed));
    // Bankroll trend: show min/max/final
    if (bankrollHistory.length > 0) {
      const minBR = Math.min(...bankrollHistory);
      const maxBR = Math.max(...bankrollHistory);
      setText(e, 'trend-label', 'Low $' + minBR + ' / High $' + maxBR);
    } else {
      setText(e, 'trend-label', '');
    }
  }

  function updateRacetrackPanel() {
    const e = panelEntities['racetrack'];
    if (!e) return;
    const seq = isAmerican ? AMER_SEQUENCE : EURO_SEQUENCE;
    // Determine which numbers are covered by bets
    const coveredNumbers = new Set<number>();
    for (const b of bets) {
      if (b.number !== undefined) coveredNumbers.add(b.number);
      if (b.numbers) for (const n of b.numbers) coveredNumbers.add(n);
      if (b.type === 'red') { for (let i = 1; i <= 36; i++) if (isRed(i)) coveredNumbers.add(i); }
      if (b.type === 'black') { for (let i = 1; i <= 36; i++) if (isBlack(i)) coveredNumbers.add(i); }
      if (b.type === 'odd') { for (let i = 1; i <= 36; i += 2) coveredNumbers.add(i); }
      if (b.type === 'even') { for (let i = 2; i <= 36; i += 2) coveredNumbers.add(i); }
      if (b.type === 'low') { for (let i = 1; i <= 18; i++) coveredNumbers.add(i); }
      if (b.type === 'high') { for (let i = 19; i <= 36; i++) coveredNumbers.add(i); }
      if (b.type === 'dozen1') { for (let i = 1; i <= 12; i++) coveredNumbers.add(i); }
      if (b.type === 'dozen2') { for (let i = 13; i <= 24; i++) coveredNumbers.add(i); }
      if (b.type === 'dozen3') { for (let i = 25; i <= 36; i++) coveredNumbers.add(i); }
      if (b.type === 'col1') { for (let i = 1; i <= 36; i += 3) coveredNumbers.add(i); }
      if (b.type === 'col2') { for (let i = 2; i <= 36; i += 3) coveredNumbers.add(i); }
      if (b.type === 'col3') { for (let i = 3; i <= 36; i += 3) coveredNumbers.add(i); }
      if (b.type === 'five') [0, 37, 1, 2, 3].forEach(n => coveredNumbers.add(n));
    }
    // Update racetrack numbers (show coverage by marking covered ones)
    for (let i = 0; i < Math.min(seq.length, 37); i++) {
      const num = seq[i];
      const numStr = num === 37 ? '00' : String(num);
      const covered = coveredNumbers.has(num);
      setText(e, 't' + i, covered ? '[' + numStr + ']' : numStr);
    }
    setText(e, 'coverage-count', coveredNumbers.size + ' covered');
  }

  function applyTheme() {
    const t = theme();
    scene.background = new Color(t.bg);
    (scene.fog as FogExp2).color.set(t.fog);
    accent1.color.set(t.accent);
    accent2.color.set(t.glow);
    wheelLight.color.set(t.glow);
    (wheelBase.material as MeshStandardMaterial).color.set(t.wheel);
    (wheelEdge.material as LineBasicMaterial).color.set(t.glow);
    (tableEdge.material as LineBasicMaterial).color.set(t.glow);
  }

  world.registerSystem(RouletteUISystem);

  // ─── Game Loop System ───
  class RouletteGameSystem extends createSystem({}) {
    private totalTime = 0;
    private bounceInterval = 0;
    private initialized = false;

    update(delta: number) {
      this.totalTime += delta;

      if (!this.initialized) {
        this.initialized = true;
        initialCameraZ = camera.position.z;
        cameraBaseZ = initialCameraZ;
        // Wait a bit for panels to load
        setTimeout(() => {
          showPanel('title');
          // Update title level display
          const te = panelEntities['title'];
          if (te) setText(te, 'level-display', 'Level ' + state.level + ' - ' + state.xp + ' XP');
        }, 500);
      }

      // Countdown processing
      if (uiState === 'spinning' && countdownPhase > 0) {
        countdownTimer += delta;
        if (countdownTimer >= 0.7) {
          countdownTimer = 0;
          countdownPhase--;
          if (countdownPhase > 0) {
            setText(panelEntities['countdown'], 'countdown-text', String(countdownPhase));
            playCountdown();
          } else {
            setText(panelEntities['countdown'], 'countdown-text', 'GO!');
            playGo();
            setTimeout(() => {
              const ce = panelEntities['countdown'];
              if (ce && ce.object3D) ce.object3D.visible = false;
              executeActualSpin();
            }, 400);
          }
        }
      }

      // Decorations animation
      for (const d of decorations) {
        d.mesh.rotation.y += d.rotSpeed * delta;
        d.mesh.position.y = d.baseY + Math.sin(this.totalTime * d.bobSpeed) * d.bobAmp;
      }

      // Ambient particles
      for (const ap of ambientParticles) {
        ap.mesh.position.x += ap.driftX * delta;
        ap.mesh.position.z += ap.driftZ * delta;
        (ap.mesh.material as MeshBasicMaterial).opacity = 0.15 + 0.15 * Math.sin(this.totalTime * ap.pulseSpeed);
        // Wrap
        if (Math.abs(ap.mesh.position.x) > 8) ap.mesh.position.x *= -0.9;
        if (Math.abs(ap.mesh.position.z) > 8) ap.mesh.position.z *= -0.9;
      }

      // Wheel idle rotation
      if (!isSpinning) {
        wheelDisc.rotation.y += 0.05 * delta;
      }

      // Spin animation
      if (isSpinning) {
        spinTime += delta;
        const progress = Math.min(spinTime / spinDuration, 1);
        const ease = 1 - Math.pow(1 - progress, 3);

        // Wheel rotation
        wheelDisc.rotation.y += wheelSpeed * (1 - ease * 0.8) * delta;

        // Ball movement
        const ballEase = 1 - Math.pow(1 - progress, 4);
        const currentBallAngle = ballAngle * (1 - ballEase);
        const seq = sequence();
        const count = pocketCount();
        const finalAngle = (targetPocket / count) * Math.PI * 2 + wheelDisc.rotation.y;

        const angle = progress < 0.7 ? currentBallAngle : finalAngle + (currentBallAngle - finalAngle) * (1 - (progress - 0.7) / 0.3);

        // Ball radius decreases as it settles
        ballRadius = 1.1 - ease * 0.1;
        const bx = Math.cos(angle) * ballRadius;
        const bz = Math.sin(angle) * ballRadius;
        const by = 0.15 + (1 - ease) * 0.3 + Math.abs(Math.sin(progress * Math.PI * 8)) * (1 - ease) * 0.1;

        ball.position.set(bx, by, bz);
        ballGlow.position.copy(ball.position);

        // Ball bounce sounds
        this.bounceInterval += delta;
        if (this.bounceInterval > 0.15 && progress < 0.85) {
          playBallBounce();
          this.bounceInterval = 0;
        }

        // Spin tick sound
        if (progress < 0.9 && Math.random() < 0.1) {
          playSpinSound();
        }

        // Ball trail particles
        if (Math.random() < 0.4) {
          emitParticles(
            ball.position.x + wheelGroup.position.x,
            ball.position.y + wheelGroup.position.y,
            ball.position.z + wheelGroup.position.z,
            1, '#ffffff'
          );
        }

        // Resolve
        if (progress >= 1) {
          this.bounceInterval = 0;
          resolveSpin();
          updateHistoryPanel();
          updateHotCold();
          if (uiState === 'gameover') updateGameOverPanel();
        }
      }

      // Auto-spin pause timer
      if (autoSpinRunning && autoSpinPauseTimer > 0) {
        autoSpinPauseTimer -= delta;
        if (autoSpinPauseTimer <= 0 && uiState === 'playing') {
          triggerAutoSpin();
        }
      }

      // Ball trail effect during spin
      if (isSpinning && ball.visible) {
        ballTrail.push({ x: ball.position.x + wheelGroup.position.x, y: ball.position.y + wheelGroup.position.y, z: ball.position.z + wheelGroup.position.z, alpha: 1.0 });
        if (ballTrail.length > 12) ballTrail.shift();
      } else {
        ballTrail.length = 0;
      }
      // Update trail particles (reuse from particle pool for visual trail)
      for (let i = 0; i < ballTrail.length; i++) {
        const t2 = ballTrail[i];
        t2.alpha -= delta * 2;
        if (t2.alpha <= 0 && i < ballTrail.length - 1) {
          ballTrail.splice(i, 1);
          i--;
        }
      }

      // Toast
      if (toastTimer > 0) {
        toastTimer -= delta;
        const te = panelEntities['toast'];
        if (te) {
          if (te.object3D) te.object3D.visible = true;
          setText(te, 'toast-text', toastMsg);
        }
        if (toastTimer <= 0) {
          const te2 = panelEntities['toast'];
          if (te2 && te2.object3D) te2.object3D.visible = false;
        }
      }

      // Dealer message timer
      if (dealerTimer > 0) {
        dealerTimer -= delta;
        if (dealerTimer <= 0) {
          const de = panelEntities['dealer'];
          if (de && de.object3D && uiState !== 'spinning' && uiState !== 'result') {
            de.object3D.visible = false;
          }
        }
      }

      // Particles
      updateParticles(delta);

      // Highlight hovered bet zone
      if (uiState === 'playing') {
        raycaster.setFromCamera(mouse, camera);
        const zoneMeshes = betZones.map(z => z.mesh);
        const hits = raycaster.intersectObjects(zoneMeshes);
        for (const z of betZones) {
          (z.mesh.material as MeshStandardMaterial).emissiveIntensity = 0.2;
        }
        if (hits.length > 0) {
          const zone = betZones[zoneMeshes.indexOf(hits[0].object as Mesh)];
          if (zone) {
            (zone.mesh.material as MeshStandardMaterial).emissiveIntensity = 0.8;
            // Update payout panel with hover info
            const payoutMap: Record<string, string> = {
              straight: '35:1 ($' + selectedChip + ' -> $' + (selectedChip * 36) + ')',
              split: '17:1 ($' + selectedChip + ' -> $' + (selectedChip * 18) + ')',
              street: '11:1 ($' + selectedChip + ' -> $' + (selectedChip * 12) + ')',
              corner: '8:1 ($' + selectedChip + ' -> $' + (selectedChip * 9) + ')',
              five: '6:1 ($' + selectedChip + ' -> $' + (selectedChip * 7) + ')',
              line: '5:1 ($' + selectedChip + ' -> $' + (selectedChip * 6) + ')',
              dozen1: '2:1 ($' + selectedChip + ' -> $' + (selectedChip * 3) + ')',
              dozen2: '2:1 ($' + selectedChip + ' -> $' + (selectedChip * 3) + ')',
              dozen3: '2:1 ($' + selectedChip + ' -> $' + (selectedChip * 3) + ')',
              col1: '2:1 ($' + selectedChip + ' -> $' + (selectedChip * 3) + ')',
              col2: '2:1 ($' + selectedChip + ' -> $' + (selectedChip * 3) + ')',
              col3: '2:1 ($' + selectedChip + ' -> $' + (selectedChip * 3) + ')',
              red: '1:1 ($' + selectedChip + ' -> $' + (selectedChip * 2) + ')',
              black: '1:1 ($' + selectedChip + ' -> $' + (selectedChip * 2) + ')',
              odd: '1:1 ($' + selectedChip + ' -> $' + (selectedChip * 2) + ')',
              even: '1:1 ($' + selectedChip + ' -> $' + (selectedChip * 2) + ')',
              low: '1:1 ($' + selectedChip + ' -> $' + (selectedChip * 2) + ')',
              high: '1:1 ($' + selectedChip + ' -> $' + (selectedChip * 2) + ')',
            };
            const info = zone.label + ' | ' + (payoutMap[zone.type] || '');
            setText(panelEntities['payouts'], 'hover-info', info);
          }
        } else {
          setText(panelEntities['payouts'], 'hover-info', 'Hover a zone to see payout');
        }
      }

      // XR input - Right controller
      const right = (world.input as any).xr?.gamepads?.right;
      if (right) {
        if (right.getButtonDown(InputComponent.Trigger)) {
          if (uiState === 'playing' && bets.length > 0) {
            startSpin();
          }
        }
        if (right.getButtonDown(InputComponent.B_Button)) {
          if (uiState === 'playing' || uiState === 'pause') {
            uiState = uiState === 'pause' ? 'playing' : 'pause';
            showPanel(uiState);
            if (uiState === 'playing') updateHUD();
          }
        }
        if (right.getButtonDown(InputComponent.A_Button)) {
          if (uiState === 'playing') { rebet(); playClick(); }
          else if (uiState === 'result') { continueAfterResult(); playClick(); }
        }
      }

      // XR input - Left controller
      const left = (world.input as any).xr?.gamepads?.left;
      if (left) {
        if (left.getButtonDown(InputComponent.Trigger)) {
          // Left trigger: cycle chip values
          const chipValues = [1, 5, 10, 25, 100];
          const idx = chipValues.indexOf(selectedChip);
          selectedChip = chipValues[(idx + 1) % chipValues.length];
          updateBettingPanel();
          showToast('Chip: $' + selectedChip);
          playClick();
        }
        if (left.getButtonDown(InputComponent.X_Button)) {
          // X button: clear bets
          if (uiState === 'playing') { clearBets(); playClick(); }
        }
        if (left.getButtonDown(InputComponent.Y_Button)) {
          // Y button: toggle call bets panel
          if (uiState === 'playing') {
            hideAllPanels();
            const ce = panelEntities['callbets'];
            if (ce && ce.object3D) ce.object3D.visible = true;
            const re = panelEntities['racetrack'];
            if (re && re.object3D) re.object3D.visible = true;
            const he = panelEntities['hud'];
            if (he && he.object3D) he.object3D.visible = true;
            updateCallBetsPanel();
            updateRacetrackPanel();
            playClick();
          }
        }
        // Left grip: double bets
        if (left.getButtonDown(InputComponent.Squeeze)) {
          if (uiState === 'playing') { doubleBets(); playClick(); }
        }
      }

      // Camera zoom toward wheel during spin
      if (cameraZooming && isSpinning) {
        const targetZ = cameraBaseZ - 1.0;
        camera.position.z += (targetZ - camera.position.z) * 2.0 * delta;
      } else if (!isSpinning && cameraBaseZ !== 0) {
        camera.position.z += (cameraBaseZ - camera.position.z) * 3.0 * delta;
        if (Math.abs(camera.position.z - cameraBaseZ) < 0.01) {
          camera.position.z = cameraBaseZ;
        }
      }

      // Winning pocket pulse (glow the winning slot after spin)
      if (winningPocketIdx >= 0 && winningPocketIdx < pocketMeshes.length) {
        winPulseTime += delta;
        const pulse = 0.5 + 0.5 * Math.sin(winPulseTime * 6.0);
        const pm = pocketMeshes[winningPocketIdx];
        if (pm) {
          (pm.material as MeshStandardMaterial).emissiveIntensity = 0.5 + pulse * 1.5;
          pm.scale.setScalar(1.0 + pulse * 0.3);
        }
      }

      // Winning number highlight on betting table
      if (winningTableZoneIdx >= 0 && winningTableZoneIdx < betZones.length) {
        winTablePulseTime += delta;
        const pulse2 = 0.5 + 0.5 * Math.sin(winTablePulseTime * 5.0);
        const tz = betZones[winningTableZoneIdx];
        if (tz && uiState === 'result') {
          (tz.mesh.material as MeshStandardMaterial).emissiveIntensity = 0.5 + pulse2 * 1.2;
          tz.mesh.scale.setScalar(1.0 + pulse2 * 0.15);
        } else if (uiState !== 'result') {
          // Reset when leaving result
          if (tz) {
            tz.mesh.scale.setScalar(1.0);
            (tz.mesh.material as MeshStandardMaterial).emissiveIntensity = 0.2;
          }
          winningTableZoneIdx = -1;
        }
      }

      // Number heatmap on table (subtle glow on frequently-hit numbers)
      if (heatmapEnabled && spinHistory.length > 0 && uiState === 'playing') {
        updateHeatmap();
      }

      // Streak visual effects (screen-edge glow when on a streak)
      if (streakFxTimer > 0) {
        streakFxTimer -= delta;
        const intensity = Math.min(streakFxTimer, 1.0);
        accent1.intensity = 1.5 + intensity * 3.0;
        accent2.intensity = 1.2 + intensity * 3.0;
      } else {
        accent1.intensity += (1.5 - accent1.intensity) * 2.0 * delta;
        accent2.intensity += (1.2 - accent2.intensity) * 2.0 * delta;
      }
    }
  }

  world.registerSystem(RouletteGameSystem);

  // Show title
  setTimeout(() => showPanel('title'), 800);
}

main();
