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
type BetType = 'straight' | 'red' | 'black' | 'odd' | 'even' | 'low' | 'high' | 'dozen1' | 'dozen2' | 'dozen3' | 'col1' | 'col2' | 'col3';
interface Bet { type: BetType; number?: number; amount: number; }

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
    default: return 0;
  }
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

type UIState = 'title' | 'modes' | 'table' | 'playing' | 'spinning' | 'result' | 'gameover' | 'leaderboard' | 'achievements' | 'stats' | 'settings' | 'help' | 'pause' | 'chips';
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
  } as any);

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
  interface BetZone { mesh: Mesh; type: BetType; number?: number; label: string; }
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
      if (zone) placeBet(zone);
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
    bets.push({ type: zone.type, number: zone.number, amount: selectedChip });
    if (gameMode !== 'practice') bankroll -= selectedChip;
    state.betTypesUsed.add(zone.type);
    addChipMarker(zone.mesh.position.clone());
    playChipPlace();
    updateHUD();
  }

  function clearBets() {
    for (const b of bets) {
      if (gameMode !== 'practice') bankroll += b.amount;
    }
    bets = [];
    clearChipMarkers();
    updateHUD();
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
  }

  function startSpin() {
    if (bets.length === 0 || isSpinning) return;
    isSpinning = true;
    uiState = 'spinning';
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
  }

  function resolveSpin() {
    isSpinning = false;
    let totalWin = 0;
    for (const b of bets) {
      totalWin += evaluateBet(b, currentResult);
    }
    bankroll += totalWin;
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
      emitParticles(0, 1.5, -1, 20, theme().glow);
    } else {
      currentStreak = 0;
      state.redStreak = 0;
      state.blackStreak = 0;
      playLose();
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
    uiState = 'result';
    showResultPanel(totalWin);
    saveState(state);
  }

  function continueAfterResult() {
    // Check game over conditions
    const isOver = checkGameOver();
    if (isOver) {
      endGame();
    } else {
      uiState = 'playing';
      showPanel('playing');
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
    spinHistory = []; bets = []; lastBets = [];
    clearChipMarkers();

    uiState = 'playing';
    showPanel('playing');
    updateHUD();
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
      case 'playing': show('hud'); show('betting'); show('history'); break;
      case 'spinning': show('hud'); break;
      case 'result': show('result'); show('hud'); break;
      case 'gameover': show('gameover'); break;
      case 'leaderboard': show('leaderboard'); break;
      case 'achievements': show('achievements'); break;
      case 'stats': show('stats'); break;
      case 'settings': show('settings'); break;
      case 'help': show('help'); break;
      case 'pause': show('pause'); break;
      case 'chips': show('chips'); break;
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
          entity.object3D!.visible = false;
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
        'btn-back': toTitle,
      });
      wire('helpQ', 'help', { 'btn-back': toTitle });
      wire('pauseQ', 'pause', {
        'btn-resume': () => { uiState = 'playing'; showPanel('playing'); updateHUD(); playClick(); },
        'btn-quit': toTitle,
      });
      wire('chipsQ', 'chips', { 'btn-back': toTitle });
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
        // Wait a bit for panels to load
        setTimeout(() => {
          showPanel('title');
          // Update title level display
          const te = panelEntities['title'];
          if (te) setText(te, 'level-display', 'Level ' + state.level + ' - ' + state.xp + ' XP');
        }, 500);
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

        // Resolve
        if (progress >= 1) {
          this.bounceInterval = 0;
          resolveSpin();
          updateHistoryPanel();
          if (uiState === 'gameover') updateGameOverPanel();
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
          }
        }
      }

      // XR input
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
      }
    }
  }

  world.registerSystem(RouletteGameSystem);

  // Show title
  setTimeout(() => showPanel('title'), 800);
}

main();
