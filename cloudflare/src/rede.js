// WiFi Aqui — controle de rede adaptativo (lógica pura, testável)
// A cada ~20s o Mikrotik manda: quantas pessoas estão usando e quanto da internet está sendo consumido.
// Aqui decidimos o limite por pessoa. O Mikrotik já divide igualmente (PCQ); este limite é o teto de cada um.
//
//  folga     (uso < ~50% da capacidade) → libera mais, igual para todos
//  normal                                → segue a tabela de faixas por lotação
//  saturado  (uso > ~85%)                → aperta igualmente, sem deixar ninguém sem internet

export const CONFIG_PADRAO = {
  automatico: true,          // false = usa só a tabela fixa
  capacidadeMbps: 100,       // estimativa inicial da Starlink (o sistema aprende a real)
  aprender: true,            // ajusta a capacidade pelo pico real observado
  pisoMbps: 1,               // ninguém fica abaixo disso
  faixas: [                  // limite por pessoa conforme quantas estão conectadas (0 = sem limite)
    { ate: 5, mbps: 0 },
    { ate: 15, mbps: 6 },
    { ate: 30, mbps: 3 },
    { ate: 9999, mbps: 1.5 },
  ],
  alertas: true,             // avisos no Telegram
};

const M = 1_000_000;

export function mesclarConfig(c) {
  const cfg = { ...CONFIG_PADRAO, ...(c || {}) };
  if (!Array.isArray(cfg.faixas) || !cfg.faixas.length) cfg.faixas = CONFIG_PADRAO.faixas;
  cfg.faixas = [...cfg.faixas].map(f => ({ ate: +f.ate || 9999, mbps: Math.max(0, +f.mbps || 0) })).sort((a, b) => a.ate - b.ate);
  cfg.capacidadeMbps = Math.max(5, +cfg.capacidadeMbps || 100);
  cfg.pisoMbps = Math.max(0.25, +cfg.pisoMbps || 1);
  return cfg;
}

export function faixaDe(cfg, n) {
  const i = cfg.faixas.findIndex(f => n <= f.ate);
  return i < 0 ? cfg.faixas.length - 1 : i;
}

// estado anterior: { capBps, modo }
export function decidir({ n, rxBps }, cfg, anterior = {}) {
  cfg = mesclarConfig(cfg);
  n = Math.max(0, Math.floor(+n || 0));
  rxBps = Math.max(0, +rxBps || 0);

  // capacidade estimada: pico observado que "esquece" devagar (~1h), nunca abaixo de 10 Mbps
  let capBps = anterior.capBps || cfg.capacidadeMbps * M;
  if (cfg.aprender) capBps = Math.max(rxBps, capBps * 0.997, 10 * M);
  else capBps = cfg.capacidadeMbps * M;

  const uso = capBps ? rxBps / capBps : 0;

  // modo com histerese (não fica pulando)
  let modo = anterior.modo || 'normal';
  if (modo === 'folga' && uso > 0.6) modo = 'normal';
  if (modo === 'saturado' && uso < 0.7) modo = 'normal';
  if (modo === 'normal') { if (uso > 0.85) modo = 'saturado'; else if (uso < 0.45) modo = 'folga'; }
  if (!cfg.automatico) modo = 'normal';

  const fi = faixaDe(cfg, n);
  const T = cfg.faixas[fi].mbps * M;                 // teto da faixa (0 = sem limite)
  const justo = n > 0 ? (capBps * 0.9) / n : 0;      // parte igual de cada um
  const piso = cfg.pisoMbps * M;

  let down;
  if (n === 0) down = 0;
  else if (modo === 'folga') down = fi === 0 ? 0 : Math.max(T * 2, justo);       // sobrando: libera mais, igual para todos
  else if (modo === 'saturado') down = Math.max(piso, T ? Math.min(T, justo) : justo); // cheio: aperta igual
  else down = T;                                                                   // normal: tabela
  down = Math.round(down);
  const up = down ? Math.max(512_000, Math.round(down * 0.25)) : 0;

  return { n, rxBps, uso: Math.round(uso * 100), capBps: Math.round(capBps), modo, faixa: fi, downBps: down, upBps: up };
}

// Formato que o script do Mikrotik envia: users=user,ip,mac,bytesIn,bytesOut;...
export function lerUsuarios(txt) {
  return String(txt || '').split(';').map(l => l.trim()).filter(Boolean).map(l => {
    const [user, ip, mac, bin, bout] = l.split(',');
    return { user, ip, mac, bin: +bin || 0, bout: +bout || 0 };
  }).filter(u => u.user);
}

// Maiores consumidores (Mbps de download) comparando com a amostra anterior
export function topConsumo(atual, anterior = {}, segundos = 20) {
  const prev = anterior || {};
  return atual.map(u => {
    const p = prev[u.user];
    const delta = p != null && u.bout >= p ? u.bout - p : 0; // bytes-out do hotspot = download do cliente
    return { user: u.user, ip: u.ip, mac: u.mac, mbps: +((delta * 8) / segundos / M).toFixed(2), totalMB: +(u.bout / 1e6).toFixed(1) };
  }).sort((a, b) => b.mbps - a.mbps).slice(0, 5);
}

export const fmtRate = bps => (bps ? (bps >= M ? `${+(bps / M).toFixed(1)}M` : `${Math.round(bps / 1000)}k`) : '0');
