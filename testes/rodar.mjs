// Testes automáticos — rodar antes de cada commit:  node testes/rodar.mjs
// Simula Gist, InfinitePay, Telegram e um Mikrotik (RouterOS API); não acessa nada de verdade.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
const raiz = fileURLToPath(new URL('..', import.meta.url));
let falhas = 0; const ok = (c, msg) => { console.log((c ? '  ✔ ' : '  ✘ ') + msg); if (!c) falhas++; };

console.log('HTML (sintaxe do JavaScript)');
for (const f of ['admin/public/index.html', 'public/portal-cliente.html']) {
  const html = readFileSync(raiz + f, 'utf8');
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  let erro = null; for (const js of scripts) { try { new Function(js); } catch (e) { erro = e.message; } }
  ok(!erro, `${f}${erro ? ' → ' + erro : ''}`);
  ok(!/ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|\d{9,10}:AA[A-Za-z0-9_-]{30,}/.test(html), `${f} sem tokens no código`);
}

// Mikrotik falso
const tmp = mkdtempSync(tmpdir() + '/wa-');
writeFileSync(tmp + '/sockets.mjs', `
export const log = [];
const enc = ws => { const te = new TextEncoder(), o = []; for (const w of ws) { const b = te.encode(w); o.push(b.length, ...b); } o.push(0); return o; };
export function connect() {
  let c; const readable = new ReadableStream({ start(x) { c = x } }); let buf = []; const td = new TextDecoder();
  const writable = new WritableStream({ write(ch) { buf.push(...ch);
    for (;;) { let i = 0, ws = [], fim = false;
      while (i < buf.length) { const n = buf[i]; if (n === 0) { i++; fim = true; break; } if (i + 1 + n > buf.length) break; ws.push(td.decode(new Uint8Array(buf.slice(i + 1, i + 1 + n)))); i += 1 + n; }
      if (!fim) break; buf = buf.slice(i); log.push(ws);
      const resp = ws[0] === '/login' ? (ws.includes('=password=certa') ? [['!done']] : [['!trap', '=message=senha errada'], ['!done']])
        : ws[0] === '/system/identity/print' ? [['!re', '=name=MK'], ['!done']] : [['!done']];
      const b = []; for (const s of resp) b.push(...enc(s)); for (let k = 0; k < b.length; k += 2) c.enqueue(new Uint8Array(b.slice(k, k + 2)));
    } } });
  return { readable, writable, close() { try { c.close() } catch {} } };
}`);
writeFileSync(tmp + '/workers.mjs', 'export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }');
writeFileSync(tmp + '/rede.js', readFileSync(raiz + 'cloudflare/src/rede.js', 'utf8'));
writeFileSync(tmp + '/worker.mjs', readFileSync(raiz + 'cloudflare/src/worker.js', 'utf8').replace("from 'cloudflare:sockets'", "from './sockets.mjs'").replace("from 'cloudflare:workers'", "from './workers.mjs'"));
const MOD = await import(pathToFileURL(tmp + '/worker.mjs')); const W = MOD.default;
const R = await import(pathToFileURL(tmp + '/rede.js'));
const novoDO = () => { const mem = new Map(); const obj = new MOD.Rede({ storage: { get: async k => mem.get(k), put: async (k, v) => mem.set(k, JSON.parse(JSON.stringify(v))) } }, {});
  return { idFromName: () => 'x', get: () => ({ fetch: (u, o) => obj.fetch(new Request(u, o)) }) }; };
const { log } = await import(pathToFileURL(tmp + '/sockets.mjs'));

console.log('Servidor (cloudflare/src/worker.js)');
let files, pc, calls;
const reset = () => { files = { 'planos.json': { content: JSON.stringify([{ id: 'p60', nome: 'Turbo', minutos: 60, preco: 800, ativo: true }]) } }; pc = { status: 200, body: { success: true, paid: true } }; calls = []; log.length = 0; };
globalThis.fetch = async (u, o = {}) => { u = String(u); const m = o.method || 'GET'; calls.push([m, u, o.body]); const J = (x, s = 200) => new Response(JSON.stringify(x), { status: s });
  if (u.includes('api.github.com/gists') && m === 'GET') return J({ files });
  if (u.includes('api.github.com/gists') && m === 'PATCH') { const b = JSON.parse(o.body).files; for (const k in b) files[k] = { content: b[k].content }; return J({}); }
  if (u.endsWith('/payment_check')) return J(pc.body, pc.status);
  if (u.includes('/links')) return J({ url: 'https://pay/1' });
  if (u.includes('telegram')) return J({ ok: true });
  return J({}, 404); };
let env = { REDE: novoDO(), MIKROTIK_TOKEN: 'tk', WIFIAQUI_GIST_ID: 'G', GITHUB_TOKEN: 't', TG_BOT_TOKEN: 'b', TG_CHAT_ID: '1', INFINITEPAY_HANDLE: 'h', ADMIN_PASSWORD: 's', MIKROTIK_HOST: '1.1.1.1', MIKROTIK_PASSWORD: 'certa',
  ASSETS: { fetch: async r => new Response('PORTAL ' + new URL(r.url).pathname) } };
const run = async (m, p, b, h = {}) => { const w = []; const r = await W.fetch(new Request('https://wa.x' + p, { method: m, headers: { 'content-type': 'application/json', ...h }, body: b ? JSON.stringify(b) : undefined }), env, { waitUntil: x => w.push(x) }); await Promise.all(w); return r; };
const vendas = () => JSON.parse(files['vendas.json']?.content || '[]');
const tg = () => calls.filter(c => c[1].includes('telegram')).map(c => JSON.parse(c[2]).text);
const novaVenda = async () => (await (await run('POST', '/portal/iniciar-pagamento', { plano_id: 'p60', ip_cliente: '192.168.10.20' })).json()).venda_id;
const hook = (id, extra = {}) => ({ order_nsu: id, transaction_nsu: 'T', invoice_slug: 'S', items: [{ description: 'WiFi Aqui | Turbo' }], ...extra });

reset(); ok((await (await run('GET', '/')).text()).includes('portal-cliente'), 'GET / mostra o portal');
ok(/mac_cliente: clienteMac\(\), ip_cliente: clienteIp\(\)/.test(readFileSync(raiz + 'public/portal-cliente.html', 'utf8')), 'portal envia MAC e IP do Mikrotik no pagamento');
{ const h = readFileSync(raiz + 'public/portal-cliente.html', 'utf8'); ok(/x-safari-http\$1:\/\/.{0,10}/.test(h) || /urlPagamento\(data\.url_pagamento\)\.replace/.test(h) && h.includes("'T-'"), 'pagamento abre pelo acesso de teste do hotspot (trial)'); }
reset(); { const t = await (await run('GET', '/portal/mikrotik-status')).text(); ok(t.includes('$(mac)') && t.includes('/portal?mac='), 'status.html do hotspot volta ao portal'); }
reset(); { const m = 'AA:BB:CC:DD:EE:99'; const vid = (await (await run('POST', '/portal/iniciar-pagamento', { plano_id: 'p60', ip_cliente: '192.168.10.30', mac_cliente: m })).json()).venda_id; const d = await (await run('GET', '/portal/pendente?mac=' + encodeURIComponent(m))).json(); const o = await (await run('GET', '/portal/pendente?mac=00:00:00:00:00:00')).json(); ok(d.venda_id === vid && o.venda_id === null, 'portal acha o pagamento em andamento pelo MAC do aparelho'); }
reset(); { const t = await (await run('GET', '/portal/mikrotik-login')).text(); ok(t.includes('$(link-login-only)') && t.includes('$(mac-esc)') && !t.includes('googleapis'), 'login.html envia MAC, IP e link de login do Mikrotik'); }
reset(); ok((await (await run('GET', '/portal/planos')).json()).planos.length === 1, 'planos vêm do Gist');
reset(); let id = await novaVenda(); ok(vendas()[0]?.status === 'pendente', 'venda pendente salva no Gist');
{ const lk = calls.find(c => c[1].includes('checkout.infinitepay.io/links')); const pl = lk ? JSON.parse(lk[2]) : {}; ok(pl.address?.cep && pl.address?.street && !pl.billing_address, 'checkout recebe o endereço pré-preenchido (campo address)'); }
await new Promise(r => setTimeout(r, 4100)); await run('POST', '/webhook/infinitepay', hook(id));
ok(vendas()[0].status === 'pago' && tg()[0]?.includes('NOVA VENDA'), 'pagamento confirmado libera venda e avisa');
ok(log.some(w => w[0] === '/ip/hotspot/user/add') && log.some(w => w[0] === '/ip/hotspot/active/login'), 'Mikrotik: cria usuário e loga o cliente');
reset(); id = await novaVenda(); pc = { status: 200, body: { success: true, paid: false } }; await new Promise(r => setTimeout(r, 4100)); await run('POST', '/webhook/infinitepay', hook(id));
ok(vendas()[0].status === 'pendente' && tg()[0]?.includes('RECUSADO'), 'pagamento NÃO confirmado é recusado (e avisa)');
reset(); id = await novaVenda(); await new Promise(r => setTimeout(r, 4100)); await run('POST', '/webhook/infinitepay', hook(id, { transaction_nsu: undefined }));
ok(vendas()[0].status === 'pendente', 'webhook falso (sem transaction_nsu) é recusado');
reset(); ok((await run('GET', '/admin/dashboard')).status === 401, 'admin sem senha → 401');
reset(); ok((await (await run('GET', '/admin/mikrotik/status', null, { 'x-admin-password': 's' })).json()).conectado === true, 'admin: status do Mikrotik');

console.log('Controle de rede (decisões)');
const Mb = 1e6; const cfg = R.mesclarConfig({ capacidadeMbps: 100 });
let d = R.decidir({ n: 3, rxBps: 10 * Mb }, cfg); ok(d.modo === 'folga' && d.downBps === 0, 'poucas pessoas e internet sobrando → sem limite');
d = R.decidir({ n: 20, rxBps: 60 * Mb }, cfg); ok(d.modo === 'normal' && d.downBps === 3 * Mb, '20 pessoas, uso normal → 3 Mbps cada (tabela)');
d = R.decidir({ n: 20, rxBps: 20 * Mb }, cfg); ok(d.modo === 'folga' && d.downBps === 6 * Mb, '20 pessoas mas internet sobrando → libera mais (6 Mbps)');
d = R.decidir({ n: 80, rxBps: 98 * Mb }, cfg); ok(d.modo === 'saturado' && d.downBps === Math.round(Math.max(1 * Mb, Math.min(1.5 * Mb, d.capBps * 0.9 / 80))) && d.downBps < 1.5 * Mb, '80 pessoas e saturada → aperta igual para todos');
d = R.decidir({ n: 200, rxBps: 99 * Mb }, cfg); ok(d.downBps === 1 * Mb, 'nunca abaixo do piso (1 Mbps)');
let ant = { modo: 'saturado', capBps: 100 * Mb }; d = R.decidir({ n: 40, rxBps: 80 * Mb }, cfg, ant); ok(d.modo === 'saturado', 'histerese: não sai de saturado com 80% (evita ficar pulando)');
d = R.decidir({ n: 10, rxBps: 150 * Mb }, cfg, { capBps: 100 * Mb }); ok(d.capBps === 150 * Mb, 'aprende a velocidade real da Starlink pelo pico');
ok(R.topConsumo([{ user: 'a', bout: 30e6 }, { user: 'b', bout: 5e6 }], { a: 5e6, b: 4e6 }, 20)[0].user === 'a', 'identifica quem mais consome');

console.log('Sincronização Mikrotik ↔ servidor');
env = { ...env, MIKROTIK_HOST: '', REDE: novoDO() };
const sync = async (body, token = 'tk') => { const w = []; const r = await W.fetch(new Request('https://wa.x/mikrotik/sync?token=' + token, { method: 'POST', body }), env, { waitUntil: x => w.push(x) }); await Promise.all(w); return [r.status, await r.text()]; };
reset(); let [st, tx] = await sync('n=0&rx=0', 'errado'); ok(st === 401, 'sincronização sem token → recusada');
reset(); [st, tx] = await sync('n=2&rx=5000000&tx=1000000&users=u1,192.168.0.20,AA,1,1000;u2,192.168.0.21,BB,1,500'); ok(st === 200 && /^OK\nRATE 0 0 folga 1\n(SPEED\n)?END/.test(tx), 'responde a decisão (RATE)');
id = await novaVenda(); await new Promise(r => setTimeout(r, 4100)); await run('POST', '/webhook/infinitepay', hook(id));
ok(vendas()[0].status === 'pago' && vendas()[0].liberado === false, 'sem acesso direto: venda paga fica aguardando o Mikrotik');
await new Promise(r => setTimeout(r, 4100)); [st, tx] = await sync('n=2&rx=5000000');
const add = tx.split('\n').find(l => l.startsWith('ADD ')); ok(add && add.includes(' 3600 192.168.10.20 '), 'Mikrotik recebe ADD com usuário, senha, 3600 s (60 min) e IP');
await sync('n=3&rx=5000000&ok=' + add.split(' ')[1]); await new Promise(r => setTimeout(r, 4100));
ok(vendas()[0].liberado === true, 'Mikrotik confirma (ok=) → venda marcada como liberada');
[st, tx] = await sync('n=3&rx=5000000'); ok(!tx.includes('ADD '), 'não manda liberar de novo');
reset(); env.REDE = novoDO(); await sync('n=10&rx=10000000'); await sync('n=60&rx=195000000');
ok(tg().some(m => m.includes('SATURADA')), 'avisa no Telegram quando satura');
await run('DELETE', '/admin/clientes/wa_9', null, { 'x-admin-password': 's' }); [st, tx] = await sync('n=1&rx=1');
ok(tx.includes('DEL wa_9'), 'derrubar cliente pelo admin → DEL na próxima sincronização');
const rd = await (await run('GET', '/admin/rede', null, { 'x-admin-password': 's' })).json(); ok(rd.estado.online && rd.estado.n === 1 && rd.config.faixas.length === 4, 'admin /admin/rede mostra estado ao vivo e configuração');
const ms = await (await run('GET', '/admin/mikrotik/status', null, { 'x-admin-password': 's' })).json(); ok(ms.conectado === true, 'status do Mikrotik pela sincronização');

console.log('Quedas: energia e internet (backup de quem estava conectado)');
const realNow = Date.now; let T = realNow(); Date.now = () => T; const passa = s => { T += s * 1000; };
const MAC = 'AA:BB:CC:DD:EE:01';
env = { ...env, REDE: novoDO() }; reset();
let vid = await (await run('POST', '/portal/iniciar-pagamento', { plano_id: 'p60', ip_cliente: '192.168.0.50', mac_cliente: MAC })).json().then(x => x.venda_id);
passa(5); await run('POST', '/webhook/infinitepay', hook(vid));
ok(vendas()[0].mikrotik_user === MAC, 'acesso criado pelo MAC (reconecta sozinho depois de queda)');
passa(5); [st, tx] = await sync('n=0&rx=1000000&up=1h');
let a1 = tx.split('\n').find(l => l.startsWith('ADD ')); ok(a1 && a1.split(' ')[2] === MAC && a1.split(' ')[3] === '-' && a1.split(' ')[4] === '3600', 'primeira liberação: 60 min, sem senha (login por MAC)');
const usr = `${MAC},192.168.0.50,${MAC},100,5000`;
passa(20); await sync(`n=1&rx=1000000&up=1h0m20s&ok=${a1.split(' ')[1]}&users=${usr}`);
for (let k = 0; k < 30; k++) { passa(20); await sync(`n=1&rx=1000000&up=${3600 + 40 + k * 20}s&users=${usr}`); } // 10 min de uso
let ac = (await (await run('GET', '/admin/rede', null, { 'x-admin-password': 's' })).json()).estado.acessos.find(a => a.usuario === MAC);
ok(ac && ac.restaMin === 50, `backup sabe o tempo restante (50 de 60 min) → ${ac?.restaMin}`);
// queda de ENERGIA: Mikrotik religa (uptime volta a zero) 15 min depois, ninguém conectado ainda
passa(15 * 60); [st, tx] = await sync('n=0&rx=0&up=1m');
let r1 = tx.split('\n').find(l => l.startsWith('ADD ') && l.includes(MAC)); const seg1 = +r1?.split(' ')[4];
ok(r1 && seg1 >= 2950 && seg1 <= 3010, `energia: restaura o acesso com ~50 min (${Math.round(seg1 / 60)} min), sem descontar o tempo desligado`);
ok(r1 && r1.split(' ')[6] === MAC, 'restauração leva o MAC (o aparelho entra sozinho ao reconectar)');
ok(tg().some(m => m.includes('reiniciou')), 'avisa no Telegram que o Mikrotik religou e restaurou');
passa(20); [st, tx] = await sync(`n=1&rx=1000000&up=1m20s&users=${usr}`); ok(!tx.includes('ADD '), 'depois de restaurar, não repete');
// queda de INTERNET: Mikrotik ligado, mas 8 min sem falar com o servidor
for (let k = 0; k < 15; k++) { passa(20); await sync(`n=1&rx=1000000&up=${100 + k * 20}s&users=${usr}`); } // +5 min de uso → restam 45
passa(8 * 60); [st, tx] = await sync(`n=1&rx=1000000&up=${100 + 15 * 20 + 480}s&users=${usr}`);
let r2 = tx.split('\n').find(l => l.startsWith('ADD ') && l.includes(MAC)); const seg2 = +r2?.split(' ')[4];
ok(r2 && seg2 >= 2640 && seg2 <= 2700, `internet caiu 8 min: devolve o tempo (restam ~45 min → ${Math.round(seg2 / 60)})`);
// fim do tempo: servidor manda derrubar
for (let k = 0; k < 140; k++) { passa(20); [st, tx] = await sync(`n=1&rx=1000000&up=${2000 + k * 20}s&users=${usr}`); if (tx.includes('DEL ')) break; }
ok(tx.includes(`DEL ${MAC}`), 'tempo acabou → derruba (sem ganhar tempo extra)');
// velocidade da Starlink
env.REDE = novoDO(); passa(1); [st, tx] = await sync('n=0&rx=0&up=10m'); ok(tx.includes('SPEED'), 'pede medição da Starlink');
passa(20); await sync('n=0&rx=0&up=10m20s&st=187000000'); let est = (await (await run('GET', '/admin/rede', null, { 'x-admin-password': 's' })).json()).estado;
ok(est.velocidade?.bps === 187e6 && est.capBps >= 185e6, 'velocidade medida (187 Mbps) aparece no admin e vira a capacidade');
passa(20); await sync('n=0&rx=0&up=10m30s&st=150000000'); passa(20); await sync('n=0&rx=0&up=10m35s&st=170000000');
est = (await (await run('GET', '/admin/rede', null, { 'x-admin-password': 's' })).json()).estado;
ok(est.velocidade.bps === 170e6 && est.velocidadeAnterior.bps === 150e6 && !JSON.stringify(est).includes('187000000'), 'guarda só a última e a anterior medição (a mais antiga some)');
passa(20); [st, tx] = await sync('n=0&rx=0&up=10m40s'); ok(!tx.includes('SPEED'), 'não mede de novo antes do intervalo');
await run('POST', '/admin/rede/testar', {}, { 'x-admin-password': 's' }); passa(20); [st, tx] = await sync('n=0&rx=0&up=11m'); ok(tx.includes('SPEED'), 'botão "Medir agora" funciona');
// saúde da conexão
env.REDE = novoDO(); reset();
for (let k = 0; k < 4; k++) { passa(20); await sync(`n=2&rx=1000000&up=${700 + k * 20}s&pr=3&lat=38`); }
est = (await (await run('GET', '/admin/rede', null, { 'x-admin-password': 's' })).json()).estado;
ok(est.qualidade?.estado === 'estavel' && est.qualidade.ping === 38, 'saúde da conexão: estável, ping 38 ms');
for (let k = 0; k < 6; k++) { passa(20); await sync(`n=2&rx=1000000&up=${800 + k * 20}s&pr=1&lat=0`); }
est = (await (await run('GET', '/admin/rede', null, { 'x-admin-password': 's' })).json()).estado;
ok(est.qualidade?.estado === 'instavel' && tg().some(m => m.includes('INSTÁVEL')), 'perda de pacotes → "instável" no admin e aviso no Telegram');
passa(20); [st, tx] = await sync('n=2&rx=190000000&up=1000s&pr=3'); ok(!tx.includes('SPEED'), 'não faz teste de velocidade com a rede ocupada');
Date.now = realNow;

console.log(falhas ? `\n✘ ${falhas} falha(s)` : '\n✔ Tudo certo'); process.exit(falhas ? 1 : 0);
