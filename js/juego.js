'use strict';
/* ============================================================
   ESPACIO CRÍTICO v4 DIRECTOR'S CUT - 100% VECTORIAL
   Dificultades, Top-5, 4 tipos de enemigo, 6 jefes con patrones,
   powers Triple/Rapid/Escudo/Vida, balas enemigas, hit-stop,
   rachas, auto-fuego PC, contador FPS + modo eco de rendimiento.
   ============================================================ */

// ---------- CONFIG ----------
const CONFIG = {
    W: 800, H: 600,
    jugadorVel: 440,
    cooldownDisparo: 0.16,
    tripleDuracion: 8,
    rapidDuracion: 8,
    invencibleTrasDano: 2.0,
    spawnEnemigoBase: 0.75,
    spawnEnemigoMin: 0.22,
    rampaDificultad: 0.006,
    spawnPowerCada: 11,
    spawnPowerJefe: 6,   // en pelea de jefe caen más seguido (no hay asteroides que den drops)
    maxParticulas: 120,
    maxEnemigos: 12,
    maxBalas: 70,
};
// Rendimiento: modo eco auto si los FPS caen (quita sombras y halos caros)
let modoEco = false, ecoRachaBaja = 0, fpsAvg = 60, hudTimer = 0, fpsTimer = 0;
let fondoCache = null;
let escala = 1; // resolución interna del canvas (nítido en tablets/pantallas HiDPI)
// Meta de kills por nivel: 16, 20, 24... (alcanzable, no eterna)
function metaDeNivel(n) { return 12 + n * 4; }
const NOMBRES_JEFE = ['AVISPA', 'MANTIS', 'DREADNOUGHT', 'HYDRA', 'LEVIATÁN', 'OMEGA'];
function nombreJefe(nivel) { return NOMBRES_JEFE[(nivel - 1) % NOMBRES_JEFE.length] + (nivel > 6 ? ' +' + Math.floor((nivel - 1) / 6) : ''); }
const DIFS = {
    facil:   { nombre: 'FÁCIL',   vidas: 5, spawnMult: 1.35, velMult: 0.8,  ptsMult: 0.8 },
    normal:  { nombre: 'NORMAL',  vidas: 3, spawnMult: 1.0,  velMult: 1.0,  ptsMult: 1.0 },
    dificil: { nombre: 'DIFÍCIL', vidas: 2, spawnMult: 0.7,  velMult: 1.25, ptsMult: 1.5 },
};

const $ = (id) => document.getElementById(id);
const canvas = $('lienzoJuego');
const ctx = canvas.getContext('2d');
// ECO: en modoEco se anulan las sombras (lo más caro) sin tocar cada dibujo
(function() {
    try {
        const proto = Object.getPrototypeOf(ctx);
        const desc = Object.getOwnPropertyDescriptor(proto, 'shadowBlur');
        if (!desc || !desc.set) return;
        let _sb = 0;
        Object.defineProperty(ctx, 'shadowBlur', {
            get() { return _sb; },
            set(v) {
                _sb = (typeof modoEco !== 'undefined' && modoEco) ? 0 : v;
                desc.set.call(ctx, _sb * escala);
            },
            configurable: true
        });
    } catch {}
})();
const contenedorJuego = $('contenedor-juego');

const ui = {
    puntos: $('puntos-valor'),
    record: $('record-valor'),
    vidas: $('vidas'),
    puntosFinales: $('puntos-finales'),
    mensajeRecord: $('mensaje-record'),
    pantallaInicio: $('pantalla-inicio'),
    pantallaPausa: $('pantalla-pausa'),
    pantallaFin: $('pantalla-fin'),
    btnIniciar: $('btn-iniciar'),
    btnReiniciar: $('btn-reiniciar'),
    btnFinMenu: $('btn-fin-menu'),
    btnReanudar: $('btn-reanudar'),
    btnSalirMenu: $('btn-salir-menu'),
    btnPausa: $('btn-pausa'),
    btnMute: $('btn-mute'),
    fps: $('fps'),
    hudTriple: $('hud-triple'),
    hudEscudo: $('hud-escudo'),
    tripleTiempo: $('triple-tiempo'),
    barraTriple: $('barra-triple'),
    statTiempo: $('stat-tiempo'),
    statKills: $('stat-kills'),
    statPrecision: $('stat-precision'),
    statRacha: $('stat-racha'),
    statNivel: $('stat-nivel'),
    hudCombo: $('hud-combo'),
    comboValor: $('combo-valor'),
    hudRapid: $('hud-rapid'),
    rapidTiempo: $('rapid-tiempo'),
    barraRapid: $('barra-rapid'),
    hudJefe: $('hud-jefe'),
    jefeNombreTxt: $('jefe-nombre-txt'),
    jefeHpTxt: $('jefe-hp-txt'),
    jefePoderTxt: $('jefe-poder-txt'),
    barraJefeFill: $('barra-jefe-fill'),
    avisoJefe: $('aviso-jefe'),
    avisoJefeTxt: $('aviso-jefe-txt'),
    bannerNivel: $('banner-nivel'),
    nivelValor: $('nivel-valor'),
    nivelProg: $('nivel-prog'),
    barraNivelFill: $('barra-nivel-fill'),
    topLista: $('top5-lista'),
    topFin: $('top5-fin'),
    finalDif: $('final-dif'),
    statJefes: $('stat-jefes'),
    flash: $('flash'),
    vineta: $('vineta-dano'),
};

const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);

// ---------- STORAGE SEGURO ----------
const store = {
    get(k, def) {
        try {
            const v = localStorage.getItem(k);
            if (v === null) return def;
            const n = parseInt(v, 10);
            return Number.isFinite(n) ? n : def;
        } catch { return def; }
    },
    set(k, v) { try { localStorage.setItem(k, String(v)); } catch {} },
    getJSON(k, def) {
        try {
            const v = localStorage.getItem(k);
            if (!v) return def;
            const o = JSON.parse(v);
            return Array.isArray(o) ? o : def;
        } catch { return def; }
    },
    setJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};

// ---------- RANKING TOP-5 ----------
let top5 = store.getJSON('shooter_top5', []);
function guardarEnTop() {
    top5.push({ pts: puntuacion, kills: stats.kills, jefes: stats.jefes, nivel, dif: dificultad, fecha: new Date().toLocaleDateString() });
    top5.sort((a, b) => b.pts - a.pts);
    top5 = top5.slice(0, 5);
    store.setJSON('shooter_top5', top5);
}
function pintarTop() {
    const html = top5.length
        ? top5.map((t, i) => `<li>${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '·'} <b>${t.pts}</b> pts · NV${t.nivel || 1} · ${DIFS[t.dif] ? DIFS[t.dif].nombre : (t.dif || 'NORMAL')} · 👾${t.jefes ?? 0}</li>`).join('')
        : '<li>Aún sin récords. ¡Sé el primero!</li>';
    if (ui.topLista) ui.topLista.innerHTML = html;
    if (ui.topFin) ui.topFin.innerHTML = html;
}

// ---------- AUDIO ----------
const AudioEngine = {
    ctx: null, master: null, muted: store.get('shooter_muted', 0) === 1,
    noiseBuffer: null, lastLaser: 0,
    init() {
        if (!this.ctx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            this.ctx = new AC();
            this.master = this.ctx.createGain();
            this.master.gain.value = this.muted ? 0 : 0.9;
            this.master.connect(this.ctx.destination);
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
    },
    toggleMute() {
        this.muted = !this.muted;
        store.set('shooter_muted', this.muted ? 1 : 0);
        if (this.master) this.master.gain.value = this.muted ? 0 : 0.9;
        ui.btnMute.textContent = this.muted ? '🔇' : '🔊';
    },
    getNoise() {
        if (this.noiseBuffer) return this.noiseBuffer;
        const len = Math.floor(this.ctx.sampleRate * 0.3);
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
        this.noiseBuffer = buf;
        return buf;
    },
    laser(rapid = false) {
        if (!this.ctx || this.muted) return;
        const now = performance.now();
        if (now - this.lastLaser < (rapid ? 35 : 50)) return;
        this.lastLaser = now;
        const t = this.ctx.currentTime;
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.connect(g); g.connect(this.master);
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(rapid ? 1100 : 800, t);
        o.frequency.exponentialRampToValueAtTime(rapid ? 300 : 100, t + 0.12);
        g.gain.setValueAtTime(0.07, t);
        g.gain.exponentialRampToValueAtTime(0.01, t + 0.13);
        o.start(t); o.stop(t + 0.14);
    },
    explosion() {
        if (!this.ctx || this.muted) return;
        const t = this.ctx.currentTime;
        const src = this.ctx.createBufferSource();
        src.buffer = this.getNoise();
        const f = this.ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(500, t);
        f.frequency.exponentialRampToValueAtTime(40, t + 0.28);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.35, t);
        g.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
        src.connect(f); f.connect(g); g.connect(this.master);
        src.start(t);
    },
    powerup() {
        if (!this.ctx || this.muted) return;
        const t = this.ctx.currentTime;
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.connect(g); g.connect(this.master);
        o.type = 'sine';
        o.frequency.setValueAtTime(220, t);
        o.frequency.linearRampToValueAtTime(660, t + 0.1);
        o.frequency.linearRampToValueAtTime(1320, t + 0.3);
        g.gain.setValueAtTime(0.14, t);
        g.gain.exponentialRampToValueAtTime(0.01, t + 0.32);
        o.start(t); o.stop(t + 0.33);
    },
    dano() {
        if (!this.ctx || this.muted) return;
        const t = this.ctx.currentTime;
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.connect(g); g.connect(this.master);
        o.type = 'triangle';
        o.frequency.setValueAtTime(160, t);
        o.frequency.linearRampToValueAtTime(55, t + 0.4);
        g.gain.setValueAtTime(0.4, t);
        g.gain.exponentialRampToValueAtTime(0.01, t + 0.42);
        o.start(t); o.stop(t + 0.43);
    },
    gameover() {
        if (!this.ctx || this.muted) return;
        const t0 = this.ctx.currentTime;
        [330, 247, 165, 110].forEach((fq, i) => {
            const o = this.ctx.createOscillator(), g = this.ctx.createGain();
            o.connect(g); g.connect(this.master);
            o.type = 'square';
            o.frequency.value = fq;
            const t = t0 + i * 0.16;
            g.gain.setValueAtTime(0.08, t);
            g.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
            o.start(t); o.stop(t + 0.16);
        });
    },
    bossWarn() {
        if (!this.ctx || this.muted) return;
        const t0 = this.ctx.currentTime;
        [220, 220, 440].forEach((fq, i) => {
            const o = this.ctx.createOscillator(), g = this.ctx.createGain();
            o.connect(g); g.connect(this.master);
            o.type = 'sawtooth';
            o.frequency.value = fq;
            const t = t0 + i * 0.22;
            g.gain.setValueAtTime(0.12, t);
            g.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
            o.start(t); o.stop(t + 0.21);
        });
    }
};

// ---------- ESTADO ----------
let estado = 'menu';
let puntuacion = 0;
let record = store.get('shooter_record', 0);
let vidas = 3;
let dificultad = 'normal';
try { const d = localStorage.getItem('shooter_dif'); if (d && DIFS[d]) dificultad = d; } catch {}
let tiempoJuego = 0;
let timerEnemigo = 0, timerPower = 0;
// Piedad de vida: si tienes 2 o menos vidas, el power temporizado sale vida (máx 1 cada 35s)
let ultimaVidaPiedad = -99;
const PIEDAD_VIDA_CADA = 30;
let lastTime = 0, hitStop = 0, avisoTimer = 0;
// Niveles: oleada con meta -> jefe -> siguiente nivel
let nivel = 1, killsNivel = 0, metaNivel = metaDeNivel(1), fase = 'oleada';
let jefe = null, bannerTimer = 0;

let enemigos = [], proyectiles = [], balasEnemigas = [], estrellas = [], particulas = [], powerups = [], flotantes = [];
let ondas = [], fugaces = [], telegrafos = [], rayosActivos = [];
let timerFugaz = 3;
let nebulosas = [
    { x: 150, y: 110, r: 240, c1: 'rgba(123,92,255,0.20)', c2: 'rgba(123,92,255,0)' },
    { x: 660, y: 380, r: 270, c1: 'rgba(0,240,255,0.12)', c2: 'rgba(0,240,255,0)' },
    { x: 400, y: 560, r: 220, c1: 'rgba(255,61,240,0.10)', c2: 'rgba(255,61,240,0)' },
];
let stats = { disparos: 0, aciertos: 0, kills: 0, racha: 0, rachaMax: 0, jefes: 0 };

const teclas = { izquierda: false, derecha: false, arriba: false, abajo: false, disparar: false };
let touchActivo = false, touchX = null, touchY = null;
let touchOff = 55; // separación dedo-nave en unidades de juego (se calcula en px reales de pantalla)
// El ratón SOLO dispara (no mueve la nave, por decisión de diseño para PC).
let ratonActivo = false;
// Auto-fuego opcional para PC (tecla F, persiste). En móvil siempre hay auto-fuego al tocar.
let autoFuego = false;
try { autoFuego = localStorage.getItem('shooter_autofuego') === '1'; } catch {}
// La racha SOLO se pierde si te golpean (no por dejar escapar). Justa y mantenible.

// ---------- ENTIDADES ----------
class Particula {
    constructor(x, y, vx, vy, color, tam, vidaMax) {
        this.x = x; this.y = y; this.vx = vx; this.vy = vy;
        this.color = color; this.tam = tam; this.vidaMax = vidaMax; this.vida = vidaMax;
    }
    actualizar(dt) { this.x += this.vx * dt; this.y += this.vy * dt; this.vx *= (1 - dt * 1.2); this.vy *= (1 - dt * 1.2); this.vida -= dt * 60; }
    dibujar() {
        ctx.save();
        ctx.globalAlpha = clamp(this.vida / this.vidaMax, 0, 1);
        ctx.fillStyle = this.color;
        ctx.beginPath(); ctx.arc(this.x, this.y, this.tam, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }
}
function crearExplosion(x, y, color, n = 12) {
    if (reduceMotion) n = 5;
    if (modoEco) n = Math.ceil(n / 2);
    for (let i = 0; i < n && particulas.length < CONFIG.maxParticulas; i++) {
        const a = Math.random() * Math.PI * 2, v = rand(40, 280);
        particulas.push(new Particula(x, y, Math.cos(a) * v, Math.sin(a) * v, color, rand(1.5, 4.2), rand(20, 42)));
    }
    // onda expansiva (capada en eco)
    const maxOndas = modoEco ? 6 : 10;
    if (!reduceMotion && ondas.length < maxOndas) ondas.push({ x, y, r: 6, max: 46, vida: 1, color });
}
function flashPantalla() {
    if (reduceMotion || !ui.flash) return;
    ui.flash.classList.add('activa');
    setTimeout(() => ui.flash.classList.remove('activa'), 120);
}
function vinetaDano(ms = 450) {
    if (!ui.vineta) return;
    ui.vineta.classList.add('activa');
    setTimeout(() => ui.vineta.classList.remove('activa'), ms);
}
function textoFlotante(x, y, texto, color = '#fff') {
    flotantes.push({ x, y, texto, color, vida: 1.1 });
    if (flotantes.length > 10) flotantes.shift();
}

class Jugador {
    constructor() {
        this.ancho = 52; this.alto = 46;
        this.x = CONFIG.W / 2 - this.ancho / 2;
        this.y = CONFIG.H - this.alto - 24;
        this.cooldown = 0;
        this.triple = false; this.tripleRestante = 0;
        this.rapid = false; this.rapidRestante = 0;
        this.escudo = false;
        this.invencible = 0;
        this.propTimer = 0;
        this.tilt = 0; // -1..1 inclinación visual
        this.llama = 0;
    }
    reset() {
        this.x = CONFIG.W / 2 - this.ancho / 2;
        this.y = CONFIG.H - this.alto - 24;
        this.cooldown = 0; this.triple = false; this.tripleRestante = 0;
        this.rapid = false; this.rapidRestante = 0;
        this.escudo = false; this.invencible = 0; this.tilt = 0;
    }
    actualizar(dt) {
        let dir = 0;
        const v = CONFIG.jugadorVel;
        if (teclas.izquierda) { this.x -= v * dt; dir = -1; }
        if (teclas.derecha) { this.x += v * dt; dir = 1; }
        if (teclas.arriba) this.y -= v * dt;
        if (teclas.abajo) this.y += v * dt;
        // Táctil XY: la nave persigue al dedo (con offset para no taparla)
        if (touchActivo && touchX !== null && touchY !== null) {
            const ox = touchX - this.ancho / 2, oy = touchY - this.alto / 2 - touchOff;
            const dx = clamp(ox - this.x, -v * dt * 2, v * dt * 2);
            const dy = clamp(oy - this.y, -v * dt * 2, v * dt * 2);
            this.x += dx; this.y += dy;
            if (Math.abs(dx) > 1) dir = dx > 0 ? 1 : -1;
        }
        // Límites: toda la pantalla salvo el nido del jefe (arriba 32% para no chocar al entrar)
        this.x = clamp(this.x, 0, CONFIG.W - this.ancho);
        this.y = clamp(this.y, CONFIG.H * 0.32, CONFIG.H - this.alto - 8);
        this.tilt += (dir - this.tilt) * Math.min(1, dt * 10);
        this.llama += dt * 20;

        if (this.invencible > 0) this.invencible -= dt;
        if (this.triple) {
            this.tripleRestante -= dt;
            if (this.tripleRestante <= 0) { this.triple = false; this.tripleRestante = 0; }
        }
        if (this.rapid) {
            this.rapidRestante -= dt;
            if (this.rapidRestante <= 0) { this.rapid = false; this.rapidRestante = 0; }
        }
        this.cooldown -= dt;
        if ((teclas.disparar || touchActivo || ratonActivo || autoFuego) && this.cooldown <= 0) this.disparar();

        this.propTimer -= dt;
        if (this.propTimer <= 0 && !reduceMotion) {
            this.propTimer = 0.06;
            const px = this.x + this.ancho / 2, py = this.y + this.alto - 2;
            const cols = ['#00ffff', '#44aaff', '#ffffff'];
            if (particulas.length < CONFIG.maxParticulas)
                particulas.push(new Particula(px + rand(-3, 3), py, rand(-30, 30) - this.tilt * 60, rand(120, 230), cols[(Math.random() * 3) | 0], rand(1, 2.6), 14));
        }
    }
    disparar() {
        this.cooldown = CONFIG.cooldownDisparo / (this.rapid ? 2.1 : 1);
        AudioEngine.laser(this.rapid);
        const cx = this.x + this.ancho / 2;
        const col = this.rapid ? '#7df9ff' : this.triple ? '#00ff88' : '#ffe14d';
        if (this.triple) {
            proyectiles.push(new Proyectil(cx, this.y + 4, 0, this.rapid ? '#7df9ff' : '#00ff88'));
            proyectiles.push(new Proyectil(cx, this.y + 4, -170, this.rapid ? '#7df9ff' : '#00ff88'));
            proyectiles.push(new Proyectil(cx, this.y + 4, 170, this.rapid ? '#7df9ff' : '#00ff88'));
            stats.disparos += 3;
        } else {
            proyectiles.push(new Proyectil(cx, this.y + 4, 0, col));
            stats.disparos += 1;
        }
    }
    dibujar() {
        if (this.invencible > 0 && Math.floor(this.invencible * 12) % 2 === 0) return;
        const cx = this.x + this.ancho / 2;
        const top = this.y, h = this.alto, w = this.ancho;
        const now = performance.now();
        const powerCol = this.rapid ? '#7df9ff' : this.triple ? '#00ff88' : '#ff5577';

        ctx.save();
        // Sombra suave bajo la nave
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = 'rgba(0,240,255,0.35)';
        ctx.beginPath();
        ctx.ellipse(cx, top + h + 7, w * 0.42, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.translate(cx, this.y + h / 2);
        ctx.rotate(this.tilt * 0.18); // inclinación al girar
        ctx.translate(-cx, -(this.y + h / 2));

        // Aura según power activo
        if (this.triple || this.rapid) {
            ctx.save();
            ctx.globalAlpha = 0.5 + Math.sin(now / 180) * 0.15;
            const ag = ctx.createRadialGradient(cx, top + h / 2, 8, cx, top + h / 2, 52);
            ag.addColorStop(0, 'rgba(0,0,0,0)');
            ag.addColorStop(1, this.rapid ? 'rgba(125,249,255,0.35)' : 'rgba(0,255,136,0.35)');
            ctx.fillStyle = ag;
            ctx.beginPath(); ctx.arc(cx, top + h / 2, 52, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        }

        // Escudo mejorado: relleno + doble anillo rotatorio
        if (this.escudo) {
            ctx.save();
            const pulso = 3 + Math.sin(now / 200) * 1.5;
            const r = w * 0.95 + pulso;
            ctx.globalAlpha = 0.16;
            ctx.fillStyle = 'rgba(0,240,255,0.5)';
            ctx.beginPath(); ctx.arc(cx, this.y + h / 2, r, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1;
            ctx.strokeStyle = 'rgba(0,255,255,0.9)';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(cx, this.y + h / 2, r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(0,255,255,0.35)';
            ctx.lineWidth = 7;
            ctx.beginPath();
            ctx.arc(cx, this.y + h / 2, r, 0, Math.PI * 2);
            ctx.stroke();
            // arcos rotatorios
            ctx.strokeStyle = 'rgba(255,255,255,0.85)';
            ctx.lineWidth = 2.5;
            const rot = now / 600;
            for (let k = 0; k < 2; k++) {
                ctx.beginPath();
                ctx.arc(cx, this.y + h / 2, r - 5, rot + k * Math.PI, rot + k * Math.PI + 0.9);
                ctx.stroke();
            }
            ctx.restore();
        }

        // Llama motor en 2 capas (externa + núcleo blanco)
        const flick = 12 + Math.sin(this.llama) * 4 + Math.random() * 4;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const gradF = ctx.createLinearGradient(0, top + h - 6, 0, top + h + flick + 10);
        gradF.addColorStop(0, '#ffffff');
        gradF.addColorStop(0.35, '#00e5ff');
        gradF.addColorStop(1, 'rgba(0,80,255,0)');
        ctx.fillStyle = gradF;
        ctx.beginPath();
        ctx.moveTo(cx - 8, top + h - 4);
        ctx.lineTo(cx + 8, top + h - 4);
        ctx.lineTo(cx, top + h + flick);
        ctx.closePath(); ctx.fill();
        // núcleo
        const gradF2 = ctx.createLinearGradient(0, top + h - 4, 0, top + h + flick * 0.6);
        gradF2.addColorStop(0, 'rgba(255,255,255,0.95)');
        gradF2.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gradF2;
        ctx.beginPath();
        ctx.moveTo(cx - 3.5, top + h - 4);
        ctx.lineTo(cx + 3.5, top + h - 4);
        ctx.lineTo(cx, top + h + flick * 0.62);
        ctx.closePath(); ctx.fill();
        ctx.restore();

        // Alas planas + borde neón (sin degradado ni sombras)
        for (const s of [-1, 1]) {
            ctx.fillStyle = '#1a2b6d';
            ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 2;
            ctx.beginPath();
            if (s < 0) {
                ctx.moveTo(cx - 8, top + h * 0.45);
                ctx.lineTo(cx - w / 2 - 2, top + h);
                ctx.lineTo(cx - 8, top + h - 2);
            } else {
                ctx.moveTo(cx + 8, top + h * 0.45);
                ctx.lineTo(cx + w / 2 + 2, top + h);
                ctx.lineTo(cx + 8, top + h - 2);
            }
            ctx.closePath(); ctx.fill(); ctx.stroke();
            // franja luminosa del ala
            ctx.strokeStyle = 'rgba(160,250,255,0.8)'; ctx.lineWidth = 1;
            ctx.beginPath();
            if (s < 0) { ctx.moveTo(cx - 10, top + h * 0.6); ctx.lineTo(cx - w / 2 + 3, top + h - 3); }
            else { ctx.moveTo(cx + 10, top + h * 0.6); ctx.lineTo(cx + w / 2 - 3, top + h - 3); }
            ctx.stroke();
        }

        // Cuerpo plano + borde claro (sin degradado ni sombra)
        ctx.fillStyle = '#1e7fa8';
        ctx.strokeStyle = '#dffbff'; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx, top);                       // punta
        ctx.lineTo(cx + 11, top + h * 0.65);
        ctx.lineTo(cx + 7, top + h - 4);
        ctx.lineTo(cx - 7, top + h - 4);
        ctx.lineTo(cx - 11, top + h * 0.65);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        // quilla luminosa
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, top + 4); ctx.lineTo(cx, top + h * 0.6);
        ctx.stroke();

        // Cabina cristal con reflejo
        ctx.fillStyle = '#031c2e';
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(cx, top + h * 0.42, 5.5, 9.5, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(160,240,255,0.9)';
        ctx.beginPath();
        ctx.ellipse(cx - 0.5, top + h * 0.4, 3.4, 7, 0, 0, Math.PI * 2);
        ctx.fill();

        // Luces de puntera planas
        ctx.fillStyle = powerCol;
        ctx.beginPath(); ctx.arc(cx - w / 2 - 1, top + h - 1, 2.6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + w / 2 + 1, top + h - 1, 2.6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(cx - w / 2 - 1, top + h - 1, 1, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + w / 2 + 1, top + h - 1, 1, 0, Math.PI * 2); ctx.fill();

        ctx.restore();
    }
    get cx() { return this.x + this.ancho / 2; }
    get cy() { return this.y + this.alto / 2; }
}
const jugador = new Jugador();

class Proyectil {
    constructor(x, y, vx, color) {
        this.x = x; this.y = y; this.vx = vx;
        this.vy = 580;
        this.radio = 11;
        this.color = color;
        this.ancho = 7; this.alto = 20;
        this.t = 0;
    }
    actualizar(dt) { this.y -= this.vy * dt; this.x += this.vx * dt; this.t += dt; }
    dibujar() {
        ctx.save();
        // estela sólida (sin degradado: 1 trazo barato)
        ctx.strokeStyle = this.color;
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(this.x, this.y + this.alto + 10);
        ctx.lineTo(this.x, this.y + 4);
        ctx.stroke();
        ctx.globalAlpha = 1;
        // cuerpo energía (sin sombra: color plano)
        ctx.fillStyle = this.color;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(this.x - this.ancho / 2, this.y, this.ancho, this.alto - 2, 4);
        else ctx.rect(this.x - this.ancho / 2, this.y, this.ancho, this.alto - 2);
        ctx.fill();
        // núcleo blanco + punta (sin sombras ni pulsos)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(this.x - 2, this.y + 1, 4, this.alto - 4);
        ctx.beginPath(); ctx.arc(this.x, this.y, 3.4, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }
}

class Enemigo {
    constructor(multVel) {
        // tipos desbloqueados por tiempo
        const t = tiempoJuego;
        const r = Math.random();
        if (t > 50 && r < 0.07) this.tipo = 'tank';
        else if (t > 35 && r < 0.20) this.tipo = 'kamikaze';
        else if (t > 20 && r < 0.38) this.tipo = 'weaver';
        else this.tipo = 'normal';

        if (this.tipo === 'kamikaze') {
            this.radio = rand(12, 16);
            this.vida = 1;
            this.vel = rand(200, 280) * multVel;
            this.pal = ['#4d0a0a', '#b31313', '#ff5b5b'];
        } else if (this.tipo === 'tank') {
            this.radio = rand(30, 38);
            this.vida = 3;
            this.vel = rand(45, 75) * multVel;
            this.pal = ['#1c1c26', '#4a4a6a', '#8f8fb0'];
        } else if (this.tipo === 'weaver') {
            this.radio = rand(15, 22);
            this.vida = 1;
            this.vel = rand(90, 140) * multVel;
            this.pal = ['#0a2a3a', '#1565a0', '#4dd7ff'];
        } else {
            this.radio = rand(15, 32);
            this.vida = this.radio > 27 ? 2 : 1;
            this.vel = rand(70, 165) * multVel * (this.radio > 26 ? 0.8 : 1.25);
            const paletas = [
                ['#5a2d0c', '#c2571a', '#ff9a3c'],
                ['#2b2b33', '#5a5a6a', '#9a9ab0'],
                ['#3a1a3a', '#7a2a7a', '#c06ac0'],
            ];
            this.pal = paletas[(Math.random() * paletas.length) | 0];
        }
        this.x = rand(this.radio, CONFIG.W - this.radio);
        this.baseX = this.x;
        this.y = -this.radio - 10;
        this.rot = rand(0, Math.PI * 2);
        this.rotVel = rand(-2, 2);
        this.fase = rand(0, Math.PI * 2);
        // forma irregular única por asteroide
        const n = 9 + ((Math.random() * 3) | 0);
        this.vertices = [];
        for (let i = 0; i < n; i++) this.vertices.push(rand(0.75, 1.12));
        // cráteres fijos
        this.crateres = [];
        const nc = 2 + ((Math.random() * 2) | 0);
        for (let i = 0; i < nc; i++) {
            this.crateres.push({ a: rand(0, Math.PI * 2), d: rand(0.15, 0.55), r: rand(0.14, 0.26) });
        }
    }
    actualizar(dt) {
        this.y += this.vel * dt;
        this.rot += this.rotVel * dt;
        this.fase += dt * 3;
        if (this.tipo === 'weaver') {
            this.x = clamp(this.baseX + Math.sin(this.fase) * 90, this.radio, CONFIG.W - this.radio);
        } else if (this.tipo === 'kamikaze') {
            // leve persecución
            const dx = jugador.cx - this.x;
            this.x += clamp(dx * 1.2, -140, 140) * dt;
        }
    }
    dibujar() {
        const r = this.radio;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rot);
        // cuerpo rocoso: color plano + borde (sin degradados ni sombras)
        ctx.fillStyle = this.pal[1];
        ctx.strokeStyle = 'rgba(0,0,0,0.65)'; ctx.lineWidth = 2;
        ctx.beginPath();
        const n = this.vertices.length;
        for (let i = 0; i <= n; i++) {
            const a = (i / n) * Math.PI * 2;
            const rr = r * this.vertices[i % n];
            const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath(); ctx.fill(); ctx.stroke();
        // highlight superior barato (1 arco)
        ctx.strokeStyle = 'rgba(255,255,255,0.30)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(0, 0, r * 0.92, -Math.PI * 0.8, -Math.PI * 0.2); ctx.stroke();
        // cráteres simples (1 círculo cada uno)
        for (const c of this.crateres) {
            const cxp = Math.cos(c.a) * r * c.d, cyp = Math.sin(c.a) * r * c.d;
            ctx.fillStyle = 'rgba(0,0,0,0.40)';
            ctx.beginPath(); ctx.arc(cxp, cyp, r * c.r, 0, Math.PI * 2); ctx.fill();
        }
        // grieta si le queda vida extra
        if (this.vida > 1) {
            ctx.save();
            ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-r * 0.6, -r * 0.5);
            ctx.lineTo(-r * 0.1, 0);
            ctx.lineTo(-r * 0.4, r * 0.55);
            ctx.stroke();
            ctx.restore();
            // puntos de vida tank
            if (this.tipo === 'tank') {
                ctx.fillStyle = '#cfe0ff';
                for (let k = 0; k < this.vida; k++) {
                    ctx.beginPath(); ctx.arc(-10 + k * 10, -r - 8, 2.6, 0, Math.PI * 2); ctx.fill();
                }
            }
        }
        ctx.restore();
        // marcador de tipo especial (barato: 1 trazo, sin sombras ni dashes animados)
        if (this.tipo === 'kamikaze') {
            ctx.save();
            ctx.strokeStyle = 'rgba(255,60,60,0.9)'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(this.x, this.y, r + 7, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = 'rgba(255,60,60,0.9)';
            ctx.beginPath(); ctx.arc(this.x, this.y, 2.5, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        } else if (this.tipo === 'tank') {
            ctx.save();
            ctx.strokeStyle = 'rgba(170,180,255,0.85)'; ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.arc(this.x, this.y, r + 5, 0, Math.PI * 2); ctx.stroke();
            ctx.restore();
        } else if (this.tipo === 'weaver') {
            ctx.save();
            ctx.strokeStyle = 'rgba(77,215,255,0.6)'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(this.x, this.y, r + 5, 0, Math.PI * 2); ctx.stroke();
            ctx.restore();
        }
    }
}

class Estrella {
    constructor(capa) {
        this.x = Math.random() * CONFIG.W; this.y = Math.random() * CONFIG.H;
        this.capa = capa;
        this.size = capa ? rand(1, 2.8) : rand(0.5, 1.4);
        this.vel = capa ? rand(60, 150) : rand(15, 45);
        this.tw = rand(0, Math.PI * 2);
        const tintes = ['#ffffff', '#bdf6ff', '#ffd7f2', '#fff6c9'];
        this.col = tintes[(Math.random() * tintes.length) | 0];
    }
    actualizar(dt) {
        this.y += this.vel * dt;
        this.tw += dt * 3;
        if (this.y > CONFIG.H) { this.y = -4; this.x = Math.random() * CONFIG.W; }
    }
    dibujar() {
        ctx.save();
        ctx.globalAlpha = this.capa ? 0.85 : 0.6;
        ctx.fillStyle = this.capa ? this.col : '#8a8ac0';
        ctx.fillRect(this.x, this.y, this.size, this.size);
        ctx.restore();
    }
}

// Power inteligente: prioriza lo que NO tienes activo (para jefes)
function tipoPowerInteligente() {
    const op = [
        ['escudo', jugador.escudo ? 0 : 3],
        ['triple', jugador.triple ? 0.6 : 2.5],
        ['rapid', jugador.rapid ? 0.6 : 2],
        ['vida', vidas >= 5 ? 0 : (vidas <= 2 ? 4 : vidas <= 3 ? 2.5 : 1)],
    ];
    let r = Math.random() * op.reduce((a, o) => a + o[1], 0);
    for (const [tipo, w] of op) { if ((r -= w) < 0) return tipo; }
    return 'rapid';
}
function soltarPowerJefe(x, y) {
    if (powerups.length >= 4) return;
    const p = new PowerUp(tipoPowerInteligente());
    p.x = clamp(x, 34, CONFIG.W - 34); p.y = y;
    powerups.push(p);
    textoFlotante(p.x, p.y + 22, '¡BOTÍN!', '#ffe14d');
}

class PowerUp {
    constructor(tipoForzado) {
        this.x = rand(34, CONFIG.W - 34); this.y = -20;
        this.radio = 16; this.vel = 135;
        if (tipoForzado) this.tipo = tipoForzado;
        else {
            const r = Math.random();
            this.tipo = r < 0.25 ? 'triple' : r < 0.40 ? 'rapid' : r < 0.65 ? 'escudo' : 'vida';
            if (this.tipo === 'vida' && vidas >= 5) this.tipo = 'rapid';
        }
        this.t = rand(0, 10);
    }
    actualizar(dt) { this.y += this.vel * dt; this.t += dt; this.x += Math.sin(this.t * 3) * 30 * dt; }
    dibujar() {
        const bob = Math.sin(this.t * 5) * 2.5;
        ctx.save();
        ctx.translate(this.x, this.y + bob);

        const cols = { triple: '#00ff88', rapid: '#ffe14d', escudo: '#00e5ff', vida: '#ff5f9e' };
        const dims = { triple: 'rgba(0,255,136,0.30)', rapid: 'rgba(255,225,77,0.30)', escudo: 'rgba(0,229,255,0.30)', vida: 'rgba(255,95,158,0.32)' };
        const col = cols[this.tipo] || '#fff';
        const colDim = dims[this.tipo] || 'rgba(255,255,255,0.2)';

        // halo plano + anillo fijo (sin degradados ni rotación)
        ctx.save();
        ctx.globalAlpha = 0.30;
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(0, 0, 24, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();

        // cápsula simple
        ctx.save();
        ctx.fillStyle = 'rgba(6,12,28,0.96)';
        ctx.strokeStyle = col; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        // reflejo
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.beginPath(); ctx.ellipse(-4.5, -6, 5, 3, -0.5, 0, Math.PI * 2); ctx.fill();
        // aro interior
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(0, 0, 11.5, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();

        // icono plano
        ctx.save();
        ctx.fillStyle = col; ctx.strokeStyle = col;
        if (this.tipo === 'triple') {
            for (const dx of [-6, 0, 6]) {
                ctx.fillRect(dx - 2, -7, 4, 12);
                ctx.beginPath(); ctx.arc(dx, -7, 2, 0, Math.PI * 2); ctx.fill();
            }
            ctx.fillStyle = '#fff';
            for (const dx of [-6, 0, 6]) ctx.fillRect(dx - 1, -4, 2, 7);
        } else if (this.tipo === 'rapid') {
            ctx.lineWidth = 2.6; ctx.lineCap = 'round';
            for (const dx of [-6, 0, 6]) {
                ctx.beginPath();
                ctx.moveTo(dx - 2, -8); ctx.lineTo(dx + 2, -2);
                ctx.lineTo(dx - 2, 2); ctx.lineTo(dx + 2, 8);
                ctx.stroke();
            }
        } else if (this.tipo === 'escudo') {
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(0, -8);
            ctx.lineTo(7, -4); ctx.lineTo(7, 2);
            ctx.quadraticCurveTo(7, 7, 0, 9);
            ctx.quadraticCurveTo(-7, 7, -7, 2);
            ctx.lineTo(-7, -4);
            ctx.closePath(); ctx.stroke();
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(0, 0, 2.2, 0, Math.PI * 2); ctx.fill();
        } else {
            ctx.beginPath();
            ctx.moveTo(0, 7);
            ctx.bezierCurveTo(-10, -1, -6, -9, 0, -3);
            ctx.bezierCurveTo(6, -9, 10, -1, 0, 7);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.beginPath(); ctx.arc(-3, -3, 1.6, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#0a0a18';
            ctx.fillRect(-1.5, -2, 3, 6); ctx.fillRect(-3.5, 0, 7, 2.5);
        }
        ctx.restore();
        ctx.restore();
    }
}

class BalaEnemiga {
    constructor(x, y, vx, vy) {
        this.x = x; this.y = y; this.vx = vx; this.vy = vy;
        this.radio = 8; this.t = 0;
    }
    actualizar(dt) { this.x += this.vx * dt; this.y += this.vy * dt; this.t += dt; }
    dibujar() {
        ctx.save();
        // anillo rosa + núcleo blanco (sin degradados ni sombras: 2 círculos)
        ctx.fillStyle = 'rgba(255,45,110,0.35)';
        ctx.beginPath(); ctx.arc(this.x, this.y, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ff2d78';
        ctx.beginPath(); ctx.arc(this.x, this.y, 5.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(this.x, this.y, 2.6, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }
}

// ---------- JEFES: cada uno con diseño, movimiento y ataques propios ----------
const TELEGRAFO_RAPIDO = 0.5; // segundos entre el aviso y el ataque fuerte
const bl = (x, y, a, v) => balasEnemigas.push(new BalaEnemiga(x, y, Math.cos(a) * v, Math.sin(a) * v));
const haciaJ = (x, y) => Math.atan2(jugador.cy - y, jugador.cx - x);
const colTg = (cx, w, t, fn) => telegrafos.push({ tipo: 'columna', x: cx - w / 2, w, t, total: t, fn });
const trayectoriaTg = (x1, y1, x2, y2, t, fn) => telegrafos.push({ tipo: 'trayectoria', x1, y1, x2, y2, t, total: t, fn });
const anilloTg = (j, r, t, fn) => telegrafos.push({ tipo: 'anillo', x: j.x, y: j.y, r, t, total: t, fn });
const anillo = (x, y, n, v, off = 0) => { for (let k = 0; k < n; k++) bl(x, y, k / n * Math.PI * 2 + off, v); };

const BOSSES = [
    { // 1 · AVISPA
        nombre: 'AVISPA', hp: 120, modos: ['strafe', 'zig', 'perseguir', 'zig'], tFuerte: [4.5, 6],
        skin: { casco: '#ffd400', borde: '#ffea70', nucleo: '#ff3b1f' },
        normal(j) {
            if (Math.random() < 0.55) { j.setPoder('Aguijones'); const a = haciaJ(j.x, j.y + 55); for (const o of [-0.09, 0.09]) bl(j.x, j.y + 55, a + o, 340); }
            else { j.setPoder('Zumbido'); for (let k = -1; k <= 1; k++) bl(j.x, j.y + 55, Math.PI / 2 + k * 0.3, 300); }
        },
        fuerte(j) {
            if (Math.random() < 0.7) {
                // El aviso y la picada comparten exactamente el mismo origen y destino.
                // Antes se dibujaba una columna vertical mientras la avispa se acercaba
                // al objetivo en diagonal, haciendo que el ataque pareciera venir de otro lado.
                const objetivoX = jugador.cx;
                const objetivoY = clamp(jugador.cy - 30, 200, CONFIG.H - 90);
                j.setPoder('¡PIQUETE! ¡Sigue la línea roja!'); j.accion = { f: 'aviso' };
                trayectoriaTg(j.x, j.y, objetivoX, objetivoY, TELEGRAFO_RAPIDO, (tg) => {
                    const distancia = Math.max(1, Math.hypot(tg.x2 - tg.x1, tg.y2 - tg.y1));
                    j.accion = {
                        f: 'baja',
                        x: tg.x2, y: tg.y2,
                        inicioX: tg.x1, inicioY: tg.y1,
                        distancia, progreso: 0
                    };
                });
            } else {
                j.setPoder('¡ENJAMBRE!');
                for (let k = 0; k < 3; k++) if (enemigos.length < 10) { const m = new Enemigo(1.1); m.x = clamp(j.x + rand(-100, 100), 30, CONFIG.W - 30); m.y = j.y + 40; enemigos.push(m); }
            }
        },
        dibujar(j) {
            const a = Math.sin(j.t * 45) * 0.4;
            ctx.fillStyle = 'rgba(200,240,255,0.55)'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
            for (const s of [-1, 1]) { ctx.save(); ctx.scale(s, 1); ctx.translate(12, -22); ctx.rotate(-0.5 + a); ctx.beginPath(); ctx.ellipse(30, 0, 32, 11, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore(); }
            ctx.strokeStyle = '#111'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-5, -46); ctx.lineTo(-16, -62); ctx.moveTo(5, -46); ctx.lineTo(16, -62); ctx.stroke();
            ctx.fillStyle = '#ffd400'; ctx.beginPath(); ctx.ellipse(0, 20, 22, 32, 0, 0, 7); ctx.fill();
            ctx.save(); ctx.clip(); ctx.fillStyle = '#111'; for (const y of [2, 20, 38]) ctx.fillRect(-26, y, 52, 8); ctx.restore();
            ctx.fillStyle = '#ffd400'; ctx.beginPath(); ctx.ellipse(0, -16, 15, 14, 0, 0, 7); ctx.fill(); ctx.strokeStyle = '#111'; ctx.stroke();
            ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(0, -38, 12, 0, 7); ctx.fill();
            ctx.fillStyle = '#ff3b1f'; ctx.beginPath(); ctx.arc(-6, -40, 4.5, 0, 7); ctx.arc(6, -40, 4.5, 0, 7); ctx.fill();
            ctx.fillStyle = '#ddd'; ctx.beginPath(); ctx.moveTo(-6, 50); ctx.lineTo(6, 50); ctx.lineTo(0, 72 + (j.accion && j.accion.f === 'baja' ? 10 : 0)); ctx.closePath(); ctx.fill();
        }
    },
    { // 2 · MANTIS
        nombre: 'MANTIS', hp: 140, modos: ['strafe', 'perseguir', 'strafe'], tFuerte: [5, 6.5],
        skin: { casco: '#0f3a1a', borde: '#5dff7a', nucleo: '#c6ff3d' },
        normal(j) {
            j.setPoder('Tajos');
            for (const s of [-1, 1]) { const x = j.x + s * 42, a = haciaJ(x, j.y + 30); for (const o of [-0.16, 0.16]) bl(x, j.y + 30, a + o, 290); }
        },
        fuerte(j) {
            j.setPoder('¡CORTE DOBLE! ¡Quédate en el centro!');
            colTg(clamp(jugador.cx - 115, 50, CONFIG.W - 50), 90, TELEGRAFO_RAPIDO);
            colTg(clamp(jugador.cx + 115, 50, CONFIG.W - 50), 90, TELEGRAFO_RAPIDO);
        },
        dibujar(j) {
            const sw = Math.sin(j.t * 5) * 0.15;
            ctx.fillStyle = '#1e7a34'; ctx.strokeStyle = '#5dff7a'; ctx.lineWidth = 2;
            for (const s of [-1, 1]) {
                ctx.save(); ctx.scale(s, 1); ctx.rotate(sw);
                ctx.beginPath(); ctx.moveTo(8, -18); ctx.lineTo(46, -4); ctx.lineTo(40, 16); ctx.lineTo(30, 4); ctx.lineTo(6, -6); ctx.closePath(); ctx.fill(); ctx.stroke();
                ctx.fillStyle = '#e8ffe0'; ctx.beginPath(); ctx.moveTo(40, 16); ctx.lineTo(34, 62); ctx.lineTo(24, 20); ctx.closePath(); ctx.fill(); ctx.stroke();
                ctx.restore(); ctx.fillStyle = '#1e7a34';
            }
            ctx.fillStyle = '#2fa94a'; ctx.beginPath(); ctx.ellipse(0, 6, 13, 38, 0, 0, 7); ctx.fill(); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(-16, -36); ctx.lineTo(16, -36); ctx.lineTo(0, -12); ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#c6ff3d'; ctx.beginPath(); ctx.arc(-9, -33, 4, 0, 7); ctx.arc(9, -33, 4, 0, 7); ctx.fill();
        }
    },
    { // 3 · DREADNOUGHT
        nombre: 'DREADNOUGHT', hp: 190, modos: ['strafe', 'strafe', 'perseguir'], tFuerte: [5.5, 7],
        skin: { casco: '#2b2f3a', borde: '#ff4d4d', nucleo: '#ff9a3d' },
        normal(j) {
            j.setPoder('Cañones');
            const xs = Math.random() < 0.5 ? [-46, 0, 46] : [-30, 30];
            for (const dx of xs) bl(j.x + dx, j.y + 40, Math.PI / 2 + dx * 0.002, 270);
        },
        fuerte(j) {
            j.setPoder('¡BOMBARDEO! ¡Mira las zonas rojas!');
            const cols = [jugador.cx + rand(-60, 60)]; while (cols.length < 4) cols.push(rand(70, CONFIG.W - 70));
            for (const c of cols) colTg(clamp(c, 60, CONFIG.W - 60), 100, TELEGRAFO_RAPIDO + 0.05);
        },
        dibujar(j) {
            ctx.fillStyle = '#2b2f3a'; ctx.strokeStyle = '#ff4d4d'; ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.moveTo(0, 50); ctx.lineTo(-66, 20); ctx.lineTo(-74, -22); ctx.lineTo(-40, -38); ctx.lineTo(40, -38); ctx.lineTo(74, -22); ctx.lineTo(66, 20); ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#4a5061'; for (const x of [-46, 0, 46]) { ctx.fillRect(x - 9, 10, 18, 12); ctx.fillRect(x - 3, 22, 6, 24); }
            ctx.fillStyle = '#ff9a3d'; for (let k = -3; k <= 3; k++) ctx.fillRect(k * 16 - 4, -26, 8, 5);
            ctx.fillStyle = '#ff4d4d'; ctx.beginPath(); ctx.arc(0, -8, 8 + Math.sin(j.t * 5) * 1.5, 0, 7); ctx.fill();
        }
    },
    { // 4 · HYDRA
        nombre: 'HYDRA', hp: 160, modos: ['perseguir', 'strafe', 'zig'], tFuerte: [5, 6.5],
        skin: { casco: '#2a1250', borde: '#c48bff', nucleo: '#7dff6a' },
        normal(j) {
            j.setPoder('Tres cabezas');
            for (const dx of [-44, 0, 44]) bl(j.x + dx, j.y + 30, haciaJ(j.x + dx, j.y + 30) + rand(-0.12, 0.12), 260);
        },
        fuerte(j) {
            j.setPoder('¡ALIENTO VENENOSO! ¡Aléjate!');
            anilloTg(j, 120, TELEGRAFO_RAPIDO, (tg) => { for (const dx of [-44, 0, 44]) anillo(tg.x + dx, tg.y + 30, 10, 190, dx * 0.05); crearExplosion(tg.x, tg.y, '#7dff6a', 20); sacudirPantalla(); });
        },
        dibujar(j) {
            ctx.strokeStyle = '#5b2aa8'; ctx.lineWidth = 9; ctx.lineCap = 'round';
            const hs = [[-44, 34], [0, 48], [44, 34]];
            hs.forEach(([hx, hy], i) => { const w = Math.sin(j.t * 3 + i * 2) * 6; ctx.beginPath(); ctx.moveTo(0, -18); ctx.quadraticCurveTo(hx * 0.3 + w, -10, hx + w, hy); ctx.stroke(); });
            ctx.fillStyle = '#2a1250'; ctx.strokeStyle = '#c48bff'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.ellipse(0, -26, 34, 24, 0, 0, 7); ctx.fill(); ctx.stroke();
            hs.forEach(([hx, hy], i) => { const w = Math.sin(j.t * 3 + i * 2) * 6; ctx.fillStyle = '#5b2aa8'; ctx.beginPath(); ctx.arc(hx + w, hy, 13, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#7dff6a'; ctx.beginPath(); ctx.arc(hx + w - 5, hy + 3, 2.5, 0, 7); ctx.arc(hx + w + 5, hy + 3, 2.5, 0, 7); ctx.fill(); });
        }
    },
    { // 5 · LEVIATÁN
        nombre: 'LEVIATÁN', hp: 210, modos: ['strafe', 'perseguir', 'strafe'], tFuerte: [5, 6.5],
        skin: { casco: '#062a4a', borde: '#38c8ff', nucleo: '#7dfff0' },
        normal(j) {
            j.setPoder('Burbujas'); for (let k = -2; k <= 2; k++) bl(j.x, j.y + 44, Math.PI / 2 + k * 0.2, 170);
        },
        fuerte(j) {
            j.setPoder('¡TSUNAMI! ¡Sigue el hueco!');
            const dir = Math.random() < 0.5 ? 1 : -1;
            for (let i = 0; i < 5; i++) colTg(dir > 0 ? 80 + i * 160 : CONFIG.W - 80 - i * 160, 150, 0.4 + i * 0.22);
        },
        dibujar(j) {
            ctx.fillStyle = '#062a4a'; ctx.strokeStyle = '#38c8ff'; ctx.lineWidth = 2.5;
            const f = Math.sin(j.t * 3) * 8;
            ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(-22 + f, -60); ctx.lineTo(0, -46); ctx.lineTo(22 - f, -60); ctx.closePath(); ctx.fill(); ctx.stroke();
            for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 30, 0); ctx.lineTo(s * 66, 24 + f); ctx.lineTo(s * 30, 22); ctx.closePath(); ctx.fill(); ctx.stroke(); }
            ctx.beginPath(); ctx.ellipse(0, 0, 40, 48, 0, 0, 7); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#7dfff0'; for (const [x, y] of [[-20, -10], [22, -18], [-26, 8], [14, 6], [0, -28]]) { ctx.globalAlpha = 0.5 + Math.sin(j.t * 4 + x) * 0.4; ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill(); }
            ctx.globalAlpha = 1; ctx.fillStyle = '#031320'; ctx.beginPath(); ctx.ellipse(0, 34, 22, 9, 0, 0, Math.PI); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-14, 12, 5, 0, 7); ctx.arc(14, 12, 5, 0, 7); ctx.fill();
            ctx.fillStyle = '#38c8ff'; ctx.beginPath(); ctx.arc(-14, 13, 2.5, 0, 7); ctx.arc(14, 13, 2.5, 0, 7); ctx.fill();
        }
    },
    { // 6 · OMEGA
        nombre: 'OMEGA', hp: 240, modos: ['strafe', 'perseguir', 'zig'], tFuerte: [4.5, 6],
        skin: { casco: '#1d1a08', borde: '#ffe14d', nucleo: '#ffffff' },
        normal(j) {
            j.setPoder('Espiral'); j.espiralAng += 0.7;
            for (let k = 0; k < 6; k++) bl(j.x, j.y, j.espiralAng + k * Math.PI / 3, 220);
        },
        fuerte(j) {
            j.setPoder('¡SINGULARIDAD! ¡Colapso total!');
            anilloTg(j, 150, TELEGRAFO_RAPIDO, (tg) => { anillo(tg.x, tg.y, 24, 210); anillo(tg.x, tg.y, 24, 310, 0.13); crearExplosion(tg.x, tg.y, '#ffe14d', 30); sacudirPantalla(); });
            colTg(jugador.cx, 80, TELEGRAFO_RAPIDO + 0.25);
        },
        dibujar(j) {
            ctx.strokeStyle = '#ffe14d'; ctx.lineWidth = 2.5;
            for (const [r, sp, c] of [[62, 0.8, '#1d1a08'], [44, -1.3, '#3a3210']]) {
                ctx.save(); ctx.rotate(j.t * sp); ctx.fillStyle = c;
                ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r, 0); ctx.lineTo(0, r); ctx.lineTo(-r, 0); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
            }
            ctx.fillStyle = '#fff'; ctx.shadowColor = '#ffe14d'; ctx.shadowBlur = 16;
            ctx.beginPath(); ctx.arc(0, 0, 13 + Math.sin(j.t * 6) * 2, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
            ctx.fillStyle = '#1d1a08'; ctx.font = '900 16px Orbitron, monospace'; ctx.textAlign = 'center'; ctx.fillText('Ω', 0, 6);
        }
    },
];

class Jefe {
    constructor(nivelJ) {
        this.nivel = nivelJ;
        this.def = BOSSES[(nivelJ - 1) % BOSSES.length];
        this.nombre = nombreJefe(nivelJ);
        this.maxHp = this.def.hp + Math.floor((nivelJ - 1) / BOSSES.length) * 80;
        this.hp = this.maxHp;
        this.umbrales = [0.75, 0.5, 0.25]; // al bajar de cada % de vida suelta un power
        this.x = CONFIG.W / 2; this.y = -90;
        this.objetivoY = 118;
        this.t = 0; this.radio = 52; this.entrada = true;
        this.modo = 'strafe'; this.timerModo = 2; this.objetivoX = CONFIG.W / 2;
        this.timerNormal = 1.4; this.timerFuerte = 4;
        this.espiralAng = 0; this.poderTxt = ''; this.poderTxtT = 0;
        this.accion = null; this.zigDir = 1;
        this.skin = this.def.skin;
    }
    setPoder(txt) { this.poderTxt = txt; this.poderTxtT = 2.2; if (ui.jefePoderTxt) ui.jefePoderTxt.textContent = '⚡ ' + txt; }
    elegirModo() {
        const ops = this.def.modos;
        this.modo = ops[(Math.random() * ops.length) | 0];
        this.timerModo = rand(1.6, 3.2);
        this.objetivoX = rand(90, CONFIG.W - 90);
    }
    ejecutarTelegrafo(tg) {
        if (tg.fn) { tg.fn(tg); return; }
        if (tg.tipo === 'columna') {
            rayosActivos.push({ x: tg.x, w: tg.w, t: 0.55, total: 0.55 });
            for (let k = 0; k < 4; k++) balasEnemigas.push(new BalaEnemiga(tg.x + rand(8, tg.w - 8), this.y + 40, rand(-30, 30), rand(300, 420)));
            sacudirPantalla();
        }
    }
    actualizar(dt) {
        this.t += dt;
        if (this.poderTxtT > 0) { this.poderTxtT -= dt; if (this.poderTxtT <= 0 && ui.jefePoderTxt) ui.jefePoderTxt.textContent = ''; }
        if (this.entrada) {
            this.y += 75 * dt;
            if (this.y >= this.objetivoY) { this.y = this.objetivoY; this.entrada = false; this.elegirModo(); }
            return;
        }
        // Acciones especiales (piquete de la Avispa): aviso quieto -> picada rápida -> vuelve arriba
        const a = this.accion;
        if (a) {
            if (a.f === 'baja') {
                a.progreso = Math.min(1, a.progreso + 820 * dt / a.distancia);
                this.x = a.inicioX + (a.x - a.inicioX) * a.progreso;
                this.y = a.inicioY + (a.y - a.inicioY) * a.progreso;
                if (a.progreso >= 1) { a.f = 'sube'; sacudirPantalla(); crearExplosion(this.x, this.y + 60, '#ffd400', 18); }
            } else if (a.f === 'sube') {
                this.y -= 330 * dt;
                if (this.y <= this.objetivoY) { this.y = this.objetivoY; this.accion = null; }
            }
            return;
        }
        this.timerModo -= dt;
        if (this.timerModo <= 0) this.elegirModo();
        const vel = 150 + this.nivel * 12;
        if (this.modo === 'strafe') {
            this.x += Math.sin(this.t * 1.4) * vel * dt; this.y += Math.sin(this.t * 2.3) * 18 * dt;
        } else if (this.modo === 'perseguir') {
            const dxObj = this.objetivoX - this.x;
            if (Math.abs(dxObj) < 12) this.objetivoX = rand(90, CONFIG.W - 90);
            else this.x += Math.sign(dxObj) * vel * 1.25 * dt;
            this.y += clamp(this.objetivoY - this.y, -1, 1) * 40 * dt;
        } else if (this.modo === 'zig') {
            // Movimiento suave (sin Math.sign para evitar jitter en los giros)
            this.x += Math.sin(this.t * 2.2) * vel * 1.8 * dt;
            this.y = this.objetivoY + Math.sin(this.t * 3.5) * 18;
        }
        this.x = clamp(this.x, 70, CONFIG.W - 70);
        const f = 1 + this.nivel * 0.06;
        this.timerNormal -= dt;
        if (this.timerNormal <= 0) { this.timerNormal = Math.max(0.6, rand(0.9, 1.5) / f); this.def.normal(this); AudioEngine.laser(false); }
        this.timerFuerte -= dt;
        if (this.timerFuerte <= 0) {
            const [a1, a2] = this.def.tFuerte;
            this.timerFuerte = Math.max(3.5, rand(a1, a2) - this.nivel * 0.2);
            this.def.fuerte(this); AudioEngine.bossWarn();
        }
    }
    herir() {
        this.hp--;
        crearExplosion(this.x + rand(-40, 40), this.y + rand(-30, 30), '#ffffff', 6);
        while (this.hp > 0 && this.umbrales.length && this.hp / this.maxHp <= this.umbrales[0]) {
            this.umbrales.shift();
            soltarPowerJefe(this.x, this.y + 50);
        }
        return this.hp <= 0;
    }
    dibujar() {
        const s = this.skin, av = this.accion && this.accion.f === 'aviso';
        const lowHp = this.hp / this.maxHp < 0.3;
        ctx.save();
        ctx.translate(this.x + (av ? Math.sin(this.t * 90) * 4 : 0), this.y);
        // halo pulsante + aura low-hp
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const pulse = 100 + Math.sin(this.t * 3) * 8;
        const hg = ctx.createRadialGradient(0, 0, 18, 0, 0, pulse + 12);
        hg.addColorStop(0, s.borde + '44'); hg.addColorStop(0.7, s.borde + '1e'); hg.addColorStop(1, s.borde + '00');
        ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(0, 0, pulse + 12, 0, Math.PI * 2); ctx.fill();
        if (lowHp) {
            ctx.strokeStyle = `rgba(255,60,70,${0.5 + Math.sin(this.t * 8) * 0.3})`;
            ctx.lineWidth = 2; ctx.setLineDash([8, 8]);
            ctx.beginPath(); ctx.arc(0, 0, 78 + Math.sin(this.t * 6) * 3, 0, Math.PI * 2); ctx.stroke();
            ctx.setLineDash([]);
        }
        ctx.restore();
        // sombra bajo el jefe
        ctx.save();
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.ellipse(0, 58, 52, 10, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        this.def.dibujar(this);
        // anillo base + progreso HP (sin sombras)
        ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(0, 0, 66, 0, Math.PI * 2); ctx.stroke();
        ctx.save();
        ctx.strokeStyle = s.borde; ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(0, 0, 66, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (this.hp / this.maxHp)); ctx.stroke();
        ctx.restore();
        // núcleo HP bajo parpadea
        if (lowHp) {
            ctx.fillStyle = `rgba(255,255,255,${0.6 + Math.sin(this.t * 10) * 0.4})`;
            ctx.beginPath(); ctx.arc(0, -66, 3, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
        ctx.save();
        ctx.font = '800 12px Orbitron, monospace'; ctx.textAlign = 'center';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.strokeText(this.nombre, this.x, this.y - 74); ctx.fillStyle = s.borde; ctx.fillText(this.nombre, this.x, this.y - 74);
        ctx.restore();
    }
}

// ---------- COLISIONES ----------
function dist(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); }

function verificarColisiones() {
    const ptsMult = DIFS[dificultad].ptsMult;
    for (let i = enemigos.length - 1; i >= 0; i--) {
        const e = enemigos[i];
        const cercaJugador = Math.abs(e.x - jugador.cx) < e.radio + jugador.ancho / 2 - 6 &&
            Math.abs(e.y - jugador.cy) < e.radio + jugador.alto / 2 - 6;
        if (cercaJugador && estado === 'playing') {
            crearExplosion(e.x, e.y, '#ff7733');
            enemigos.splice(i, 1);
            if (jugador.escudo) {
                jugador.escudo = false;
                // Gracia breve para que una volea no quite escudo+vida en el mismo frame
                jugador.invencible = Math.max(jugador.invencible, 1.0);
                AudioEngine.powerup();
                textoFlotante(jugador.cx, jugador.y - 12, 'ESCUDO!', '#00e5ff');
            } else if (jugador.invencible <= 0) {
                perderVida();
            }
            continue;
        }
        for (let j = proyectiles.length - 1; j >= 0; j--) {
            const p = proyectiles[j];
            if (dist(p.x, p.y, e.x, e.y) < e.radio + p.radio - 4) {
                proyectiles.splice(j, 1);
                stats.aciertos++;
                e.vida--;
                if (e.vida <= 0) {
                    crearExplosion(e.x, e.y, e.tipo === 'kamikaze' ? '#ff4444' : '#ffaa33');
                    crearExplosion(e.x, e.y, '#ffffff', 6);
                    AudioEngine.explosion();
                    enemigos.splice(i, 1);
                    stats.kills++; stats.racha++;
                    stats.rachaMax = Math.max(stats.rachaMax, stats.racha);
                    hitStop = Math.max(hitStop, 0.045); // game-feel
                    const base = e.tipo === 'tank' ? 30 : e.tipo === 'kamikaze' ? 15 : 10;
                    const pts = Math.round((base + Math.min(stats.racha, 15) * 2) * ptsMult);
                    puntuacion += pts;
                    textoFlotante(e.x, e.y, '+' + pts, '#ffe14d');
                    // Progreso de nivel solo en fase oleada
                    if (fase === 'oleada') {
                        killsNivel++;
                        if (killsNivel >= metaNivel) aparecerJefeNivel();
                    }
                    // Con pocas vidas caen más powers al destruir (para remontar)
                    if (Math.random() < (vidas <= 3 ? 0.12 : 0.06)) powerups.push(new PowerUp());
                } else {
                    crearExplosion(p.x, p.y, '#ffffff', 5);
                }
                break;
            }
        }
    }
    // Balas jugador vs JEFE (nave, radio 52)
    if (jefe && !jefe.entrada) {
        for (let j = proyectiles.length - 1; j >= 0; j--) {
            const p = proyectiles[j];
            if (dist(p.x, p.y, jefe.x, jefe.y) < 52 + p.radio - 4) {
                proyectiles.splice(j, 1);
                stats.aciertos++;
                if (jefe.herir()) {
                    // JEFE MUERTO -> siguiente nivel
                    const jx = jefe.x, jy = jefe.y;
                    crearExplosion(jx, jy, '#ff2d55', 40);
                    crearExplosion(jx, jy, '#ffffff', 20);
                    AudioEngine.explosion();
                    flashPantalla();
                    sacudirPantalla();
                    hitStop = 0.25;
                    completarNivel();
                }
                break;
            }
        }
        // Jefe embiste al jugador
        if (jefe && Math.abs(jefe.x - jugador.cx) < 52 + jugador.ancho / 2 - 10 &&
            Math.abs(jefe.y - jugador.cy) < 46 + jugador.alto / 2 - 10) {
            if (jugador.escudo) { jugador.escudo = false; jugador.invencible = Math.max(jugador.invencible, 1.0); textoFlotante(jugador.cx, jugador.y - 12, 'ESCUDO!', '#00e5ff'); }
            else if (jugador.invencible <= 0) perderVida();
        }
    }
    // Balas enemigas vs jugador
    for (let i = balasEnemigas.length - 1; i >= 0; i--) {
        const b = balasEnemigas[i];
        if (Math.abs(b.x - jugador.cx) < b.radio + jugador.ancho / 2 - 8 &&
            Math.abs(b.y - jugador.cy) < b.radio + jugador.alto / 2 - 8) {
            balasEnemigas.splice(i, 1);
            crearExplosion(b.x, b.y, '#ff2d78', 8);
            if (jugador.escudo) {
                jugador.escudo = false;
                jugador.invencible = Math.max(jugador.invencible, 1.0);
                textoFlotante(jugador.cx, jugador.y - 12, 'ESCUDO!', '#00e5ff');
            } else if (jugador.invencible <= 0) perderVida();
        }
    }
    for (let i = powerups.length - 1; i >= 0; i--) {
        const p = powerups[i];
        if (Math.abs(p.x - jugador.cx) < p.radio + jugador.ancho / 2 &&
            Math.abs(p.y - jugador.cy) < p.radio + jugador.alto / 2) {
            AudioEngine.powerup();
            crearExplosion(p.x, p.y, '#ffffff', 10);
            flashPantalla();
            if (p.tipo === 'triple') {
                jugador.triple = true; jugador.tripleRestante = CONFIG.tripleDuracion;
                textoFlotante(jugador.cx, jugador.y - 12, 'TRIPLE x3!', '#00ff88');
            } else if (p.tipo === 'rapid') {
                jugador.rapid = true; jugador.rapidRestante = CONFIG.rapidDuracion;
                textoFlotante(jugador.cx, jugador.y - 12, 'RAPID!', '#ffe14d');
            } else if (p.tipo === 'escudo') {
                jugador.escudo = true;
                textoFlotante(jugador.cx, jugador.y - 12, 'ESCUDO!', '#00e5ff');
            } else {
                vidas = Math.min(5, vidas + 1);
                textoFlotante(jugador.cx, jugador.y - 12, '+1 VIDA', '#ff5f9e');
            }
            powerups.splice(i, 1);
        }
    }
}

// ---------- FLUJO ----------
function sacudirPantalla() {
    if (reduceMotion) return;
    contenedorJuego.classList.remove('shake');
    void contenedorJuego.offsetWidth;
    contenedorJuego.classList.add('shake');
    setTimeout(() => contenedorJuego.classList.remove('shake'), 220);
}

function perderVida() {
    sacudirPantalla();
    vinetaDano(550);
    AudioEngine.dano();
    crearExplosion(jugador.cx, jugador.cy, '#00e5ff', 24);
    vidas--;
    stats.racha = 0;
    jugador.invencible = CONFIG.invencibleTrasDano;
    actualizarHUD();
    if (vidas <= 0) terminarJuego();
}

function actualizarHUD() {
    ui.puntos.textContent = puntuacion;
    ui.record.textContent = record;
    ui.vidas.textContent = vidas > 0 ? (vidas <= 3 ? '❤️'.repeat(clamp(vidas, 0, 5)) : '❤️×' + clamp(vidas, 0, 5)) : '💀';
    if (ui.nivelValor) ui.nivelValor.textContent = nivel;
    if (ui.nivelProg) ui.nivelProg.textContent = fase === 'jefe' ? 'JEFE' : killsNivel + '/' + metaNivel;
    if (ui.barraNivelFill) ui.barraNivelFill.style.width = (fase === 'jefe' ? 100 : killsNivel / metaNivel * 100) + '%';
    if (jugador.triple) {
        ui.hudTriple.classList.remove('oculta');
        ui.tripleTiempo.textContent = Math.ceil(jugador.tripleRestante) + 's';
        ui.barraTriple.style.width = (jugador.tripleRestante / CONFIG.tripleDuracion * 100) + '%';
    } else ui.hudTriple.classList.add('oculta');
    if (ui.hudRapid) {
        if (jugador.rapid) {
            ui.hudRapid.classList.remove('oculta');
            ui.rapidTiempo.textContent = Math.ceil(jugador.rapidRestante) + 's';
            ui.barraRapid.style.width = (jugador.rapidRestante / CONFIG.rapidDuracion * 100) + '%';
        } else ui.hudRapid.classList.add('oculta');
    }
    ui.hudEscudo.classList.toggle('oculta', !jugador.escudo);
    // combo / racha
    if (ui.hudCombo && ui.comboValor) {
        if (stats.racha >= 3 && estado === 'playing') {
            ui.hudCombo.classList.remove('oculta');
            ui.comboValor.textContent = stats.racha;
        } else ui.hudCombo.classList.add('oculta');
    }
    // alerta vida baja: fija en 1 vida, se quita al curar
    if (ui.vineta && estado === 'playing') {
        if (vidas === 1) ui.vineta.classList.add('activa');
        else if (jugador.invencible <= 0) ui.vineta.classList.remove('activa');
    }
}

function mostrarSolo(pantalla) {
    [ui.pantallaInicio, ui.pantallaPausa, ui.pantallaFin].forEach(p => p.classList.add('oculta'));
    if (pantalla) pantalla.classList.remove('oculta');
}

function mostrarBanner(txt, sub = '') {
    if (!ui.bannerNivel) return;
    ui.bannerNivel.innerHTML = txt + (sub ? '<br><small style="font-size:13px;letter-spacing:2px;color:#9aa3c7">' + sub + '</small>' : '');
    ui.bannerNivel.classList.remove('oculta');
    // reinicia animación
    void ui.bannerNivel.offsetWidth;
    clearTimeout(mostrarBanner._t);
    mostrarBanner._t = setTimeout(() => ui.bannerNivel.classList.add('oculta'), 2400);
}

function iniciarJuego() {
    AudioEngine.init();
    const dif = DIFS[dificultad];
    puntuacion = 0; vidas = dif.vidas; tiempoJuego = 0;
    nivel = 1; killsNivel = 0; metaNivel = metaDeNivel(1); fase = 'oleada';
    timerEnemigo = 0; timerPower = 4; timerFugaz = 3; ultimaVidaPiedad = -99;
    jefe = null; avisoTimer = 0; hitStop = 0; bannerTimer = 0;
    enemigos = []; proyectiles = []; balasEnemigas = []; particulas = []; powerups = []; flotantes = [];
    ondas = []; fugaces = []; telegrafos = []; rayosActivos = [];
    stats = { disparos: 0, aciertos: 0, kills: 0, racha: 0, rachaMax: 0, jefes: 0 };
    jugador.reset();
    teclas.izquierda = teclas.derecha = teclas.arriba = teclas.abajo = teclas.disparar = false;
    touchActivo = false; touchX = touchY = null; ratonActivo = false;
    estado = 'playing';
    if (autoFuego) setTimeout(() => textoFlotante(CONFIG.W / 2, 320, 'AUTO-FUEGO ON (F)', '#7df9ff'), 600);
    mostrarSolo(null);
    if (ui.hudJefe) ui.hudJefe.classList.add('oculta');
    if (ui.avisoJefe) ui.avisoJefe.classList.add('oculta');
    actualizarHUD();
    ui.btnPausa.textContent = '⏸️';
    mostrarBanner('NIVEL 1', 'Destruye ' + metaNivel + ' para invocar al jefe');
}

function pausar() {
    if (estado !== 'playing') return;
    estado = 'paused';
    mostrarSolo(ui.pantallaPausa);
    ui.btnPausa.textContent = '▶️';
}
function reanudar() {
    if (estado !== 'paused') return;
    AudioEngine.init();
    estado = 'playing';
    mostrarSolo(null);
    ui.btnPausa.textContent = '⏸️';
    lastTime = performance.now();
}
function irMenu() {
    estado = 'menu';
    teclas.izquierda = teclas.derecha = teclas.arriba = teclas.abajo = teclas.disparar = false;
    touchActivo = false; ratonActivo = false;
    jefe = null; telegrafos = []; rayosActivos = []; balasEnemigas = [];
    if (ui.hudJefe) ui.hudJefe.classList.add('oculta');
    if (ui.avisoJefe) ui.avisoJefe.classList.add('oculta');
    if (ui.bannerNivel) ui.bannerNivel.classList.add('oculta');
    pintarTop();
    mostrarSolo(ui.pantallaInicio);
    ui.btnPausa.textContent = '⏸️';
}

function terminarJuego() {
    estado = 'gameover';
    teclas.disparar = false; touchActivo = false; ratonActivo = false;
    telegrafos = []; rayosActivos = [];
    if (ui.hudJefe) ui.hudJefe.classList.add('oculta');
    if (ui.avisoJefe) ui.avisoJefe.classList.add('oculta');
    if (ui.bannerNivel) ui.bannerNivel.classList.add('oculta');
    AudioEngine.gameover();
    guardarEnTop();
    ui.puntosFinales.textContent = puntuacion;
    if (ui.finalDif) ui.finalDif.textContent = '· ' + DIFS[dificultad].nombre + ' · NV' + nivel;
    if (puntuacion > record) {
        record = puntuacion;
        store.set('shooter_record', record);
        ui.mensajeRecord.textContent = '🎉 ¡NUEVO RÉCORD PERSONAL! 🎉';
    } else {
        ui.mensajeRecord.textContent = 'Récord a batir: ' + record;
    }
    ui.statTiempo.textContent = Math.floor(tiempoJuego) + 's';
    ui.statKills.textContent = stats.kills;
    ui.statPrecision.textContent = stats.disparos ? Math.round(stats.aciertos / stats.disparos * 100) + '%' : '0%';
    ui.statRacha.textContent = stats.rachaMax;
    if (ui.statJefes) ui.statJefes.textContent = stats.jefes;
    if (ui.statNivel) ui.statNivel.textContent = nivel;
    pintarTop();
    actualizarHUD();
    mostrarSolo(ui.pantallaFin);
}

function aparecerJefeNivel() {
    fase = 'jefe';
    jefe = new Jefe(nivel);
    AudioEngine.bossWarn();
    timerPower = Math.min(timerPower, 3.5); // primer power pronto al empezar el jefe
    if (ui.hudJefe) ui.hudJefe.classList.remove('oculta');
    if (ui.jefeNombreTxt) ui.jefeNombreTxt.textContent = jefe.nombre;
    if (ui.avisoJefeTxt) ui.avisoJefeTxt.textContent = jefe.nombre + ' EN APROXIMACIÓN';
    if (ui.avisoJefe) {
        ui.avisoJefe.classList.remove('oculta');
        avisoTimer = 2.8;
    }
    // limpia asteroides viejos para duelo limpio (pero deja powers)
    enemigos = [];
    mostrarBanner('⚠️ ' + jefe.nombre, 'Nave-jefe del nivel ' + nivel + ' · ¡Esquiva lo rojo!');
    actualizarHUD();
}

function completarNivel() {
    stats.jefes++;
    const ptsMult = DIFS[dificultad].ptsMult;
    const bonus = Math.round((300 + nivel * 100) * ptsMult);
    puntuacion += bonus;
    textoFlotante(CONFIG.W / 2, 280, '+' + bonus + ' NIVEL ' + nivel, '#00ff88');
    crearExplosion(jefe ? jefe.x : CONFIG.W / 2, 150, '#ffffff', 30);
    flashPantalla();
    jefe = null;
    // Limpia avisos pendientes del jefe muerto para que no se queden congelados ni se evaporen raro
    telegrafos = []; rayosActivos = [];
    if (ui.hudJefe) ui.hudJefe.classList.add('oculta');
    // recompensa: cura 1 (si lleno, convierte a puntos) + 2 powers sin duplicar lo ya activo
    if (vidas < 5) vidas = Math.min(5, vidas + 1);
    else {
        const extra = Math.round(150 * ptsMult);
        puntuacion += extra;
        textoFlotante(CONFIG.W / 2, 320, '+' + extra + ' VIDA LLENA', '#ff5f9e');
    }
    const segundoTipo = !jugador.triple && !jugador.rapid ? (Math.random() < 0.5 ? 'triple' : 'rapid') : (!jugador.triple ? 'triple' : (!jugador.rapid ? 'rapid' : 'vida'));
    powerups.push(new PowerUp(jugador.escudo ? (vidas < 5 ? 'vida' : segundoTipo) : 'escudo'));
    powerups.push(new PowerUp(segundoTipo === 'vida' && vidas >= 5 ? 'rapid' : segundoTipo));
    nivel++;
    killsNivel = 0; metaNivel = metaDeNivel(nivel); fase = 'oleada';
    timerEnemigo = 0.5;
    mostrarBanner('NIVEL ' + nivel, 'Meta: destruye ' + metaNivel);
    actualizarHUD();
}

// Telegrafiado: zonas rojas que avisan el poder fuerte antes de ejecutarlo
function actualizarTelegrafos(dt) {
    for (let i = telegrafos.length - 1; i >= 0; i--) {
        const tg = telegrafos[i];
        tg.t -= dt;
        if (tg.t <= 0) {
            telegrafos.splice(i, 1);
            if (jefe) jefe.ejecutarTelegrafo(tg);
        }
    }
}
function dibujarTelegrafos() {
    for (const tg of telegrafos) {
        const parp = 0.45 + Math.abs(Math.sin(performance.now() / 120)) * 0.35;
        const pct = clamp(tg.t / tg.total, 0, 1);
        ctx.save();
        if (tg.tipo === 'columna') {
            // relleno con borde luminoso + esquinas
            ctx.fillStyle = `rgba(255,30,60,${parp * 0.35})`;
            ctx.fillRect(tg.x, 0, tg.w, CONFIG.H);
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const eg = ctx.createLinearGradient(tg.x, 0, tg.x + tg.w, 0);
            eg.addColorStop(0, 'rgba(255,30,60,0)');
            eg.addColorStop(0.5, `rgba(255,60,90,${parp * 0.35})`);
            eg.addColorStop(1, 'rgba(255,30,60,0)');
            ctx.fillStyle = eg;
            ctx.fillRect(tg.x, 0, tg.w, CONFIG.H);
            ctx.restore();
            ctx.strokeStyle = `rgba(255,80,110,${parp + 0.35})`;
            ctx.lineWidth = 2.5; ctx.setLineDash([12, 8]);
            ctx.shadowColor = '#ff1e3c'; ctx.shadowBlur = 10;
            ctx.strokeRect(tg.x + 1.5, -4, tg.w - 3, CONFIG.H + 8);
            ctx.setLineDash([]);
            ctx.shadowBlur = 0;
            // icono aviso con fondo
            ctx.fillStyle = 'rgba(200,0,30,0.9)';
            ctx.beginPath(); ctx.arc(tg.x + tg.w / 2, 196, 16, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(tg.x + tg.w / 2, 196, 16, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = '#fff';
            ctx.font = '900 20px Orbitron, monospace'; ctx.textAlign = 'center';
            ctx.fillText('!', tg.x + tg.w / 2, 203);
            // barra de cuenta atrás doble
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(tg.x, 0, tg.w, 7);
            const barG = ctx.createLinearGradient(tg.x, 0, tg.x + tg.w, 0);
            barG.addColorStop(0, '#ff7a5c'); barG.addColorStop(1, '#ff1e3c');
            ctx.fillStyle = barG;
            ctx.fillRect(tg.x, 0, tg.w * (1 - pct), 7);
            ctx.fillStyle = '#fff';
            ctx.fillRect(tg.x, 6, tg.w * (1 - pct), 1.5);
        } else if (tg.tipo === 'trayectoria') {
            // La zona de aviso sigue la misma línea que recorrerá la avispa.
            ctx.lineCap = 'round';
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.strokeStyle = `rgba(255,30,60,${parp * 0.3})`;
            ctx.lineWidth = 36;
            ctx.setLineDash([20, 14]);
            ctx.lineDashOffset = -performance.now() / 40;
            ctx.beginPath(); ctx.moveTo(tg.x1, tg.y1); ctx.lineTo(tg.x2, tg.y2); ctx.stroke();
            ctx.restore();
            ctx.setLineDash([]);
            ctx.strokeStyle = `rgba(255,120,160,${parp + 0.3})`;
            ctx.lineWidth = 3.5;
            ctx.shadowColor = '#ff1e3c'; ctx.shadowBlur = 8;
            ctx.beginPath(); ctx.moveTo(tg.x1, tg.y1); ctx.lineTo(tg.x2, tg.y2); ctx.stroke();
            ctx.shadowBlur = 0;
            // destino pulsante con doble anillo
            const rr = 13 + pct * 6 + Math.sin(performance.now() / 90) * 2;
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(tg.x2, tg.y2, rr * 0.55, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#ff1e3c'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(tg.x2, tg.y2, rr, 0, Math.PI * 2); ctx.stroke();
            ctx.strokeStyle = `rgba(255,30,60,${parp})`; ctx.lineWidth = 1.6;
            ctx.beginPath(); ctx.arc(tg.x2, tg.y2, rr + 7, 0, Math.PI * 2); ctx.stroke();
            ctx.strokeStyle = '#ff1e3c'; ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(tg.x2 - 22, tg.y2); ctx.lineTo(tg.x2 + 22, tg.y2);
            ctx.moveTo(tg.x2, tg.y2 - 22); ctx.lineTo(tg.x2, tg.y2 + 22);
            ctx.stroke();
            ctx.fillStyle = '#ff1e3c';
            ctx.fillRect(tg.x1 - 3, tg.y1 - 3, 6, 6);
        } else if (tg.tipo === 'anillo') {
            const prog = 1 - pct;
            const rr = tg.r * (1 + prog * 0.22);
            ctx.fillStyle = `rgba(255,30,60,${parp * 0.22})`;
            ctx.beginPath(); ctx.arc(tg.x, tg.y, tg.r, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = `rgba(255,60,90,${parp + 0.35})`;
            ctx.lineWidth = 4; ctx.setLineDash([14, 9]);
            ctx.lineDashOffset = -performance.now() / 50;
            ctx.shadowColor = '#ff1e3c'; ctx.shadowBlur = 10;
            ctx.beginPath(); ctx.arc(tg.x, tg.y, rr, 0, Math.PI * 2); ctx.stroke();
            ctx.setLineDash([]);
            ctx.shadowBlur = 0;
            // arco de progreso
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(tg.x, tg.y, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog); ctx.stroke();
        }
        ctx.restore();
    }
}
function actualizarRayos(dt) {
    for (let i = rayosActivos.length - 1; i >= 0; i--) {
        const r = rayosActivos[i];
        r.t -= dt;
        // daño si la nave está dentro de la columna (centro + medio ancho para no castigar roces)
        if (estado === 'playing' &&
            jugador.cx + jugador.ancho / 2 - 10 > r.x && jugador.cx - jugador.ancho / 2 + 10 < r.x + r.w) {
            if (jugador.escudo) { jugador.escudo = false; jugador.invencible = Math.max(jugador.invencible, 1.0); textoFlotante(jugador.cx, jugador.y - 12, 'ESCUDO!', '#00e5ff'); r.t = 0; }
            else if (jugador.invencible <= 0) perderVida();
        }
        if (r.t <= 0) rayosActivos.splice(i, 1);
    }
}
function dibujarRayos() {
    for (const r of rayosActivos) {
        const a = clamp(r.t / r.total, 0, 1);
        ctx.save();
        // 3 franjas planas (sin degradados ni chispas)
        ctx.fillStyle = `rgba(255,60,110,${0.30 * a + 0.08})`;
        ctx.fillRect(r.x, 0, r.w, CONFIG.H);
        ctx.fillStyle = `rgba(255,120,170,${0.75 * a + 0.1})`;
        ctx.fillRect(r.x + r.w * 0.28, 0, r.w * 0.44, CONFIG.H);
        ctx.fillStyle = `rgba(255,255,255,${0.9 * a + 0.05})`;
        ctx.fillRect(r.x + r.w * 0.44, 0, r.w * 0.12, CONFIG.H);
        ctx.restore();
    }
}

// ---------- FONDO (cacheado: se prerenderiza 1 vez, por frame solo rejilla barata) ----------
function construirFondoCache() {
    fondoCache = document.createElement('canvas');
    fondoCache.width = CONFIG.W; fondoCache.height = CONFIG.H;
    const c = fondoCache.getContext('2d');
    const bg = c.createLinearGradient(0, 0, 0, CONFIG.H);
    bg.addColorStop(0, '#050516');
    bg.addColorStop(0.45, '#02020a');
    bg.addColorStop(0.75, '#05021a');
    bg.addColorStop(1, '#0a0424');
    c.fillStyle = bg;
    c.fillRect(0, 0, CONFIG.W, CONFIG.H);
    for (const n of nebulosas) {
        const g = c.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
        g.addColorStop(0, n.c1); g.addColorStop(1, n.c2);
        c.fillStyle = g;
        c.fillRect(n.x - n.r, n.y - n.r, n.r * 2, n.r * 2);
    }
    // planeta lejano + anillo
    const px = 670, py = 108, pr = 44;
    const pg = c.createRadialGradient(px - 14, py - 14, 6, px, py, pr);
    pg.addColorStop(0, '#3d6bff');
    pg.addColorStop(0.6, '#1a2456');
    pg.addColorStop(1, '#070818');
    c.globalAlpha = 0.9;
    c.fillStyle = pg;
    c.beginPath(); c.arc(px, py, pr, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 0.3;
    c.strokeStyle = '#7df9ff'; c.lineWidth = 2;
    c.beginPath(); c.ellipse(px, py + 6, pr + 18, 10, -0.25, 0, Math.PI * 2); c.stroke();
    c.globalAlpha = 0.45;
    c.fillStyle = 'rgba(180,220,255,0.22)';
    c.beginPath(); c.arc(px - 14, py - 12, 9, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 1;
    // sol synthwave
    const hz = CONFIG.H - 90;
    const sunG = c.createLinearGradient(0, hz - 66, 0, hz);
    sunG.addColorStop(0, 'rgba(255,225,77,0.55)');
    sunG.addColorStop(0.55, 'rgba(255,95,158,0.45)');
    sunG.addColorStop(1, 'rgba(255,63,240,0)');
    c.fillStyle = sunG;
    c.beginPath(); c.arc(CONFIG.W / 2, hz + 8, 52, Math.PI, 0); c.fill();
    c.fillStyle = 'rgba(2,2,10,0.85)';
    for (let i = 0; i < 4; i++) c.fillRect(CONFIG.W / 2 - 54, hz - 34 + i * 10, 108, 2.5);
}
function dibujarFondo(now, dt) {
    if (!fondoCache) construirFondoCache();
    ctx.drawImage(fondoCache, 0, 0);
    // rejilla barata (sin sombras ni degradados por frame)
    const t = now / 1000;
    ctx.save();
    const hz = CONFIG.H - 90;
    ctx.globalAlpha = 0.14;
    ctx.strokeStyle = '#00f0ff'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, hz); ctx.lineTo(CONFIG.W, hz); ctx.stroke();
    if (!modoEco) {
        const off = (t * 22) % 12;
        for (let i = 0; i < 6; i++) {
            const y = hz + 8 + i * 16 + off;
            if (y > CONFIG.H) continue;
            ctx.globalAlpha = 0.03 + (i / 6) * 0.05;
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CONFIG.W, y); ctx.stroke();
        }
    }
    ctx.restore();
    // estrellas fugaces
    if (!reduceMotion && estado !== 'paused') {
        timerFugaz -= dt;
        if (timerFugaz <= 0) {
            timerFugaz = rand(2.5, 7);
            fugaces.push({ x: rand(100, CONFIG.W), y: -20, vx: rand(-160, -60), vy: rand(280, 420), vida: 1 });
        }
    }
    for (let i = fugaces.length - 1; i >= 0; i--) {
        const f = fugaces[i];
        f.x += f.vx * dt; f.y += f.vy * dt; f.vida -= dt * 0.9;
        ctx.save();
        ctx.globalAlpha = clamp(f.vida, 0, 1) * 0.8;
        ctx.strokeStyle = '#bff6ff'; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(f.x, f.y);
        ctx.lineTo(f.x - f.vx * 0.2, f.y - f.vy * 0.2);
        ctx.stroke();
        ctx.restore();
        if (f.vida <= 0) fugaces.splice(i, 1);
    }
}
function dibujarOndas(dt) {
    for (let i = ondas.length - 1; i >= 0; i--) {
        const o = ondas[i];
        o.r += 240 * dt; o.vida -= dt * 2.2;
        ctx.save();
        ctx.globalAlpha = clamp(o.vida, 0, 1) * 0.85;
        ctx.strokeStyle = o.color; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
        if (o.vida <= 0 || o.r > o.max + 40) ondas.splice(i, 1);
    }
}

// ---------- BUCLE ----------
function frame(now) {
    requestAnimationFrame(frame);
    if (!lastTime) lastTime = now;
    let rawDt = (now - lastTime) / 1000;
    lastTime = now;
    let dt = rawDt;
    if (dt > 0.05) dt = 0.05;

    // Monitor FPS sin tocar el DOM: media móvil + eco automático (rápido: ~0.5s)
    if (rawDt > 0 && rawDt < 0.5) fpsAvg = fpsAvg * 0.93 + (1 / rawDt) * 0.07;
    if (!modoEco && fpsAvg < 50) {
        ecoRachaBaja++;
        if (ecoRachaBaja > 25) { modoEco = true; ecoRachaBaja = 0; }
    } else if (!modoEco) ecoRachaBaja = 0;
    // Salir de eco solo en menú para evitar parpadeo de calidad
    if (modoEco && estado === 'menu' && fpsAvg > 57) modoEco = false;

    // Contador FPS: solo toca el DOM 2 veces por segundo
    fpsTimer += rawDt;
    if (fpsTimer > 0.5) {
        fpsTimer = 0;
        if (ui.fps) {
            const v = Math.round(Math.min(120, Math.max(0, fpsAvg)));
            if (ui.fps.textContent !== String(v)) ui.fps.textContent = v;
        }
    }

    dibujarFondo(now, estado === 'paused' ? 0 : dt);
    const dtFondo = estado === 'paused' ? 0 : dt;
    for (const s of estrellas) { s.actualizar(dtFondo); s.dibujar(); }

    if (estado === 'playing') {
        // hit-stop: congela 90% el mundo al matar
        if (hitStop > 0) { hitStop -= dt; dt *= 0.12; }
        tiempoJuego += dt;
        const dif = DIFS[dificultad];
        // Dificultad también escala con el nivel (además del tiempo)
        const multVel = Math.min(2.6, (1 + tiempoJuego * 0.008 + (nivel - 1) * 0.12)) * dif.velMult;
        const intervalo = Math.max(0.13, CONFIG.spawnEnemigoBase - tiempoJuego * 0.004 - (nivel - 1) * 0.05) * dif.spawnMult;

        // Solo spawnean asteroides en fase oleada (en jefe, duelo limpio). Capado por rendimiento.
        if (fase === 'oleada') {
            timerEnemigo -= dt;
            if (timerEnemigo <= 0) {
                timerEnemigo = intervalo;
                if (enemigos.length < CONFIG.maxEnemigos) enemigos.push(new Enemigo(multVel));
                else timerEnemigo = 0.3;
            }
        }
        if (balasEnemigas.length > CONFIG.maxBalas) balasEnemigas.splice(0, balasEnemigas.length - CONFIG.maxBalas);
        timerPower -= dt;
        if (timerPower <= 0) {
            if (fase === 'jefe') {
                timerPower = CONFIG.spawnPowerJefe;
                if (powerups.length < 3) powerups.push(new PowerUp(tipoPowerInteligente()));
            } else {
                timerPower = CONFIG.spawnPowerCada;
                // Piedad: con 3 o menos vidas, el temporizado sale vida (con cooldown para no abusar)
                if (vidas <= 3 && tiempoJuego - ultimaVidaPiedad > PIEDAD_VIDA_CADA) {
                    ultimaVidaPiedad = tiempoJuego;
                    powerups.push(new PowerUp('vida'));
                } else {
                    powerups.push(new PowerUp());
                }
            }
        }
        if (avisoTimer > 0) {
            avisoTimer -= dt;
            if (avisoTimer <= 0 && ui.avisoJefe) ui.avisoJefe.classList.add('oculta');
        }
        if (jefe && ui.barraJefeFill) {
            ui.barraJefeFill.style.width = (jefe.hp / jefe.maxHp * 100) + '%';
            if (ui.jefeHpTxt) ui.jefeHpTxt.textContent = jefe.hp + '/' + jefe.maxHp;
        }
        // telegrafiados y rayos siempre
        actualizarTelegrafos(dt);
        actualizarRayos(dt);

        jugador.actualizar(dt);

        for (let i = proyectiles.length - 1; i >= 0; i--) {
            const p = proyectiles[i];
            p.actualizar(dt); p.dibujar();
            if (p.y < -40 || p.x < -40 || p.x > CONFIG.W + 40) proyectiles.splice(i, 1);
        }
        for (let i = enemigos.length - 1; i >= 0; i--) {
            const e = enemigos[i];
            e.actualizar(dt); e.dibujar();
            if (e.y - e.radio > CONFIG.H) {
                // FIX racha justa: escapar ya NO rompe racha (solo el daño la rompe)
                enemigos.splice(i, 1);
            }
        }
        for (let i = powerups.length - 1; i >= 0; i--) {
            const p = powerups[i];
            p.actualizar(dt); p.dibujar();
            if (p.y - p.radio > CONFIG.H) powerups.splice(i, 1);
        }
        // jefe + balas enemigas
        if (jefe) { jefe.actualizar(dt); jefe.dibujar(); }
        for (let i = balasEnemigas.length - 1; i >= 0; i--) {
            const b = balasEnemigas[i];
            b.actualizar(dt); b.dibujar();
            if (b.y > CONFIG.H + 30 || b.y < -30 || b.x < -30 || b.x > CONFIG.W + 30) balasEnemigas.splice(i, 1);
        }
        for (let i = particulas.length - 1; i >= 0; i--) {
            const pt = particulas[i];
            pt.actualizar(dt); pt.dibujar();
            if (pt.vida <= 0) particulas.splice(i, 1);
        }
        verificarColisiones();
        jugador.dibujar();
        dibujarOndas(dt);
        dibujarTelegrafos();
        dibujarRayos();

        for (let i = flotantes.length - 1; i >= 0; i--) {
            const f = flotantes[i];
            f.vida -= dt; f.y -= 44 * dt;
            ctx.save();
            ctx.globalAlpha = clamp(f.vida / 1.1, 0, 1);
            ctx.font = '800 17px Rajdhani, sans-serif';
            ctx.textAlign = 'center';
            ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
            ctx.strokeText(f.texto, f.x, f.y);
            ctx.fillStyle = f.color;
            ctx.fillText(f.texto, f.x, f.y);
            ctx.restore();
            if (f.vida <= 0) flotantes.splice(i, 1);
        }
        // HUD a 8 Hz (el DOM cada frame tira los FPS)
        hudTimer += rawDt;
        if (hudTimer > 0.12) {
            hudTimer = 0;
            if (ui.puntos.textContent !== String(puntuacion)) ui.puntos.textContent = puntuacion;
            actualizarHUD();
        }
    } else {
        for (const e of enemigos) e.dibujar();
        for (const p of powerups) p.dibujar();
        for (const pt of particulas) pt.dibujar();
        if (jefe) jefe.dibujar();
        for (const b of balasEnemigas) b.dibujar();
        dibujarOndas(dtFondo);
        dibujarTelegrafos();
        dibujarRayos();
        if (estado !== 'menu') jugador.dibujar();
        else {
            // nave demo flotando en menú
            const bx = jugador.cx, by = CONFIG.H - 130 + Math.sin(now / 500) * 8;
            const ox = jugador.x, oy = jugador.y;
            jugador.x = bx - jugador.ancho / 2; jugador.y = by;
            jugador.dibujar();
            jugador.x = ox; jugador.y = oy;
        }
    }
}

// ---------- INPUT ----------
function canvasPos(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    return {
        x: (clientX - r.left) / r.width * CONFIG.W,
        y: clientY !== undefined ? (clientY - r.top) / r.height * CONFIG.H : 0
    };
}

window.addEventListener('keydown', (e) => {
    const k = e.key;
    const kl = k.length === 1 ? k.toLowerCase() : k;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(k)) e.preventDefault();
    if (k === 'ArrowLeft' || kl === 'a') teclas.izquierda = true;
    if (k === 'ArrowRight' || kl === 'd') teclas.derecha = true;
    if (k === 'ArrowUp' || kl === 'w') teclas.arriba = true;
    if (k === 'ArrowDown' || kl === 's') teclas.abajo = true;
    if (k === ' ' || k === 'Spacebar') teclas.disparar = true;
    if (kl === 'p' || k === 'Escape') {
        if (estado === 'playing') pausar();
        else if (estado === 'paused') reanudar();
    }
    if (kl === 'm') { AudioEngine.init(); AudioEngine.toggleMute(); }
    if (kl === 'f') {
        autoFuego = !autoFuego;
        try { localStorage.setItem('shooter_autofuego', autoFuego ? '1' : '0'); } catch {}
        if (estado === 'playing') textoFlotante(jugador.cx, jugador.y - 12, autoFuego ? 'AUTO-FUEGO ON' : 'AUTO-FUEGO OFF', '#7df9ff');
    }
    if (k === 'Enter') {
        if (estado === 'menu' || estado === 'gameover') iniciarJuego();
        else if (estado === 'paused') reanudar();
    }
});
window.addEventListener('keyup', (e) => {
    const k = e.key;
    const kl = k.length === 1 ? k.toLowerCase() : k;
    if (k === 'ArrowLeft' || kl === 'a') teclas.izquierda = false;
    if (k === 'ArrowRight' || kl === 'd') teclas.derecha = false;
    if (k === 'ArrowUp' || kl === 'w') teclas.arriba = false;
    if (k === 'ArrowDown' || kl === 's') teclas.abajo = false;
    if (k === ' ' || k === 'Spacebar') teclas.disparar = false;
});

canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0 && estado === 'playing') ratonActivo = true;
});
window.addEventListener('mouseup', () => { ratonActivo = false; });
canvas.addEventListener('mouseleave', () => { ratonActivo = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    AudioEngine.init();
    if (estado !== 'playing') return;
    touchActivo = true;
    touchOff = clamp(72 * CONFIG.H / (canvas.getBoundingClientRect().height || CONFIG.H), 40, 170);
    const p = canvasPos(e.touches[0].clientX, e.touches[0].clientY);
    touchX = p.x; touchY = p.y;
}, { passive: false });
canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (touchActivo) {
        const p = canvasPos(e.touches[0].clientX, e.touches[0].clientY);
        touchX = p.x; touchY = p.y;
    }
}, { passive: false });
const finTouch = (e) => { e.preventDefault(); touchActivo = false; touchX = touchY = null; };
canvas.addEventListener('touchend', finTouch);
canvas.addEventListener('touchcancel', finTouch);

document.addEventListener('visibilitychange', () => { if (document.hidden) pausar(); });

// ---------- BOTONES ----------
ui.btnIniciar.addEventListener('click', iniciarJuego);
ui.btnReiniciar.addEventListener('click', iniciarJuego);
if (ui.btnFinMenu) ui.btnFinMenu.addEventListener('click', irMenu);
ui.btnReanudar.addEventListener('click', reanudar);
ui.btnSalirMenu.addEventListener('click', irMenu);
ui.btnPausa.addEventListener('click', () => {
    AudioEngine.init();
    if (estado === 'playing') pausar();
    else if (estado === 'paused') reanudar();
});
ui.btnMute.addEventListener('click', () => { AudioEngine.init(); AudioEngine.toggleMute(); });

// Dificultad
document.querySelectorAll('.dif-btn').forEach(btn => {
    if (btn.dataset.dif === dificultad) btn.classList.add('activa');
    else if (btn.dataset.dif === 'normal' && !document.querySelector('.dif-btn.activa')) btn.classList.add('activa');
    btn.addEventListener('click', () => {
        AudioEngine.init();
        dificultad = btn.dataset.dif;
        try { localStorage.setItem('shooter_dif', dificultad); } catch {}
        document.querySelectorAll('.dif-btn').forEach(b => b.classList.toggle('activa', b === btn));
    });
});
// Marcar activa inicial
document.querySelectorAll('.dif-btn').forEach(b => b.classList.toggle('activa', b.dataset.dif === dificultad));

// ---------- INIT (sin assets externos) ----------
function inicializarEstrellas() {
    estrellas = [];
    for (let i = 0; i < 40; i++) estrellas.push(new Estrella(0));
    for (let i = 0; i < 25; i++) estrellas.push(new Estrella(1));
}
ui.record.textContent = record;
ui.btnMute.textContent = AudioEngine.muted ? '🔇' : '🔊';
// Ajusta la resolución interna al tamaño real en pantalla (tablets / HiDPI)
function ajustarLienzo() {
    const w = canvas.getBoundingClientRect().width;
    if (!w) return;
    const s = Math.round(Math.min(2, Math.max(1, w * (window.devicePixelRatio || 1) / CONFIG.W)) * 4) / 4;
    if (s === escala && canvas.width === Math.round(CONFIG.W * s)) return;
    escala = s;
    canvas.width = Math.round(CONFIG.W * s);
    canvas.height = Math.round(CONFIG.H * s);
    ctx.setTransform(s, 0, 0, s, 0, 0);
}
if ('ResizeObserver' in window) new ResizeObserver(ajustarLienzo).observe(canvas);
window.addEventListener('resize', ajustarLienzo);
window.addEventListener('orientationchange', () => setTimeout(ajustarLienzo, 250));
ajustarLienzo();

inicializarEstrellas();
pintarTop();
mostrarSolo(ui.pantallaInicio);
lastTime = performance.now();
requestAnimationFrame(frame);
