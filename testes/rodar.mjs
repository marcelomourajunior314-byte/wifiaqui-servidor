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
writeFileSync(tmp + '/worker.mjs', readFileSync(raiz + 'cloudflare/src/worker.js', 'utf8').replace("from 'cloudflare:sockets'", "from './sockets.mjs'"));
const W = (await import(pathToFileURL(tmp + '/worker.mjs'))).default;
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
const env = { WIFIAQUI_GIST_ID: 'G', GITHUB_TOKEN: 't', TG_BOT_TOKEN: 'b', TG_CHAT_ID: '1', INFINITEPAY_HANDLE: 'h', ADMIN_PASSWORD: 's', MIKROTIK_HOST: '1.1.1.1', MIKROTIK_PASSWORD: 'certa',
  ASSETS: { fetch: async r => new Response('PORTAL ' + new URL(r.url).pathname) } };
const run = async (m, p, b, h = {}) => { const w = []; const r = await W.fetch(new Request('https://wa.x' + p, { method: m, headers: { 'content-type': 'application/json', ...h }, body: b ? JSON.stringify(b) : undefined }), env, { waitUntil: x => w.push(x) }); await Promise.all(w); return r; };
const vendas = () => JSON.parse(files['vendas.json']?.content || '[]');
const tg = () => calls.filter(c => c[1].includes('telegram')).map(c => JSON.parse(c[2]).text);
const novaVenda = async () => (await (await run('POST', '/portal/iniciar-pagamento', { plano_id: 'p60', ip_cliente: '192.168.10.20' })).json()).venda_id;
const hook = (id, extra = {}) => ({ order_nsu: id, transaction_nsu: 'T', invoice_slug: 'S', items: [{ description: 'WiFi Aqui | Turbo' }], ...extra });

reset(); ok((await (await run('GET', '/')).text()).includes('portal-cliente'), 'GET / mostra o portal');
ok(/mac_cliente: clienteMac\(\), ip_cliente: clienteIp\(\)/.test(readFileSync(raiz + 'public/portal-cliente.html', 'utf8')), 'portal envia MAC e IP do Mikrotik no pagamento');
reset(); ok((await (await run('GET', '/portal/planos')).json()).planos.length === 1, 'planos vêm do Gist');
reset(); let id = await novaVenda(); ok(vendas()[0]?.status === 'pendente', 'venda pendente salva no Gist');
await new Promise(r => setTimeout(r, 4100)); await run('POST', '/webhook/infinitepay', hook(id));
ok(vendas()[0].status === 'pago' && tg()[0]?.includes('NOVA VENDA'), 'pagamento confirmado libera venda e avisa');
ok(log.some(w => w[0] === '/ip/hotspot/user/add') && log.some(w => w[0] === '/ip/hotspot/active/login'), 'Mikrotik: cria usuário e loga o cliente');
reset(); id = await novaVenda(); pc = { status: 200, body: { success: true, paid: false } }; await new Promise(r => setTimeout(r, 4100)); await run('POST', '/webhook/infinitepay', hook(id));
ok(vendas()[0].status === 'pendente' && tg()[0]?.includes('RECUSADO'), 'pagamento NÃO confirmado é recusado (e avisa)');
reset(); id = await novaVenda(); await new Promise(r => setTimeout(r, 4100)); await run('POST', '/webhook/infinitepay', hook(id, { transaction_nsu: undefined }));
ok(vendas()[0].status === 'pendente', 'webhook falso (sem transaction_nsu) é recusado');
reset(); ok((await run('GET', '/admin/dashboard')).status === 401, 'admin sem senha → 401');
reset(); ok((await (await run('GET', '/admin/mikrotik/status', null, { 'x-admin-password': 's' })).json()).conectado === true, 'admin: status do Mikrotik');

console.log(falhas ? `\n✘ ${falhas} falha(s)` : '\n✔ Tudo certo'); process.exit(falhas ? 1 : 0);
