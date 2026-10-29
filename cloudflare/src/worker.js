// WiFi Aqui — Servidor v3.0 (Cloudflare Workers)
// Mesmas rotas do server.js (Railway). Diferenças:
//  - vendas (inclusive pendentes) ficam no Gist, porque o Worker não guarda memória entre acessos
//  - Mikrotik via RouterOS API (TCP 8728) usando sockets do Cloudflare
import { connect } from 'cloudflare:sockets';

const VERSAO = '3.1-cloudflare';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' };
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS } });

const planosDefault = [
  { id: 'plano-10min',  nome: 'Flash',    descricao: '10 minutos de acesso', minutos: 10,  preco: 200,  ativo: true },
  { id: 'plano-30min',  nome: 'Expresso', descricao: '30 minutos de acesso', minutos: 30,  preco: 500,  ativo: true },
  { id: 'plano-60min',  nome: 'Turbo',    descricao: '1 hora de acesso',     minutos: 60,  preco: 800,  ativo: true, popular: true },
  { id: 'plano-120min', nome: 'Power',    descricao: '2 horas de acesso',    minutos: 120, preco: 1200, ativo: true },
];

// ---------------- Gist (com cache curto para aguentar o polling do portal) ----------------
let cache = { t: 0, gist: null };
const gh = env => ({ 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'wifiaqui-worker', ...(env.GITHUB_TOKEN ? { Authorization: `token ${env.GITHUB_TOKEN}` } : {}) });
async function gist(env, fresco = false) {
  if (!fresco && cache.gist && Date.now() - cache.t < 4000) return cache.gist;
  const r = await fetch(`https://api.github.com/gists/${env.WIFIAQUI_GIST_ID}`, { headers: gh(env) });
  if (!r.ok) { console.error('gist', r.status); return cache.gist; }
  cache = { t: Date.now(), gist: await r.json() };
  return cache.gist;
}
async function arquivo(env, g, nome) {
  const f = g?.files?.[nome]; if (!f) return null;
  if (!f.truncated) return f.content;
  const r = await fetch(f.raw_url, { headers: gh(env) }); return r.ok ? r.text() : null;
}
async function salvar(env, nome, dados) {
  if (!env.GITHUB_TOKEN) return false;
  const r = await fetch(`https://api.github.com/gists/${env.WIFIAQUI_GIST_ID}`, {
    method: 'PATCH', headers: { ...gh(env), 'Content-Type': 'application/json' },
    body: JSON.stringify({ files: { [nome]: { content: JSON.stringify(dados, null, 2) } } }),
  });
  cache.t = 0; // força reler
  return r.ok;
}
async function lerPlanos(env) { try { const t = await arquivo(env, await gist(env), 'planos.json'); return t ? JSON.parse(t) : planosDefault } catch { return planosDefault } }
async function lerVendas(env, fresco) { try { const t = await arquivo(env, await gist(env, fresco), 'vendas.json'); return t ? JSON.parse(t) : [] } catch { return [] } }
const salvarVendas = (env, v) => salvar(env, 'vendas.json', v.slice(-500));
const salvarPlanos = (env, p) => salvar(env, 'planos.json', p);

async function telegram(env, msg) {
  if (!env.TG_BOT_TOKEN) return;
  try { await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TG_CHAT_ID, text: msg }) }) }
  catch (e) { console.error('telegram', e.message) }
}

// ---------------- Mikrotik: cliente mínimo da RouterOS API ----------------
function encLen(n) {
  if (n < 0x80) return [n];
  if (n < 0x4000) return [(n >> 8) | 0x80, n & 0xff];
  if (n < 0x200000) return [(n >> 16) | 0xc0, (n >> 8) & 0xff, n & 0xff];
  if (n < 0x10000000) return [(n >>> 24) | 0xe0, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
  return [0xf0, (n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}
function encSentence(words) {
  const te = new TextEncoder(); const out = [];
  for (const w of words) { const b = te.encode(w); out.push(...encLen(b.length), ...b); }
  out.push(0); return new Uint8Array(out);
}
class RouterOS {
  constructor(env) { this.env = env; this.buf = new Uint8Array(0); }
  async open() {
    const host = this.env.MIKROTIK_HOST;
    if (!host) throw new Error('MIKROTIK_HOST não configurado');
    this.sock = connect({ hostname: host, port: parseInt(this.env.MIKROTIK_PORT || '8728') });
    this.w = this.sock.writable.getWriter(); this.r = this.sock.readable.getReader();
    await this.cmd(['/login', `=name=${this.env.MIKROTIK_USER || 'admin'}`, `=password=${this.env.MIKROTIK_PASSWORD || ''}`]);
    return this;
  }
  async need(n) {
    while (this.buf.length < n) {
      const { value, done } = await this.r.read();
      if (done) throw new Error('Mikrotik fechou a conexão');
      const nb = new Uint8Array(this.buf.length + value.length); nb.set(this.buf); nb.set(value, this.buf.length); this.buf = nb;
    }
  }
  async take(n) { await this.need(n); const v = this.buf.slice(0, n); this.buf = this.buf.slice(n); return v; }
  async readLen() {
    const b = (await this.take(1))[0];
    if ((b & 0x80) === 0) return b;
    if ((b & 0xc0) === 0x80) { const x = await this.take(1); return ((b & 0x3f) << 8) | x[0]; }
    if ((b & 0xe0) === 0xc0) { const x = await this.take(2); return ((b & 0x1f) << 16) | (x[0] << 8) | x[1]; }
    if ((b & 0xf0) === 0xe0) { const x = await this.take(3); return ((b & 0x0f) << 24) | (x[0] << 16) | (x[1] << 8) | x[2]; }
    const x = await this.take(4); return (x[0] << 24) | (x[1] << 16) | (x[2] << 8) | x[3];
  }
  async readSentence() {
    const td = new TextDecoder(); const words = [];
    for (;;) { const n = await this.readLen(); if (n === 0) return words; words.push(td.decode(await this.take(n))); }
  }
  // Envia um comando e devolve as linhas (!re) como objetos
  async cmd(words) {
    await this.w.write(encSentence(words));
    const out = []; let erro = null;
    for (;;) {
      const s = await this.readSentence(); const tipo = s[0];
      const obj = {}; for (const w of s.slice(1)) { const m = w.match(/^=([^=]+)=(.*)$/s); if (m) obj[m[1]] = m[2]; }
      if (tipo === '!re') out.push(obj);
      else if (tipo === '!trap') erro = obj.message || 'erro do Mikrotik';
      else if (tipo === '!fatal') throw new Error(s.slice(1).join(' ') || 'fatal');
      else if (tipo === '!done') { if (erro) throw new Error(erro); return out; }
    }
  }
  close() { try { this.sock?.close() } catch {} }
}
async function comMikrotik(env, fn) {
  const mk = new RouterOS(env);
  const t = new Promise((_, rej) => setTimeout(() => rej(new Error('Mikrotik: tempo esgotado')), 10000));
  try { await Promise.race([mk.open(), t]); return await Promise.race([fn(mk), t]); }
  finally { mk.close(); }
}
const mkCriarUsuario = (env, { username, password, profile, mac }) => comMikrotik(env, mk => mk.cmd(['/ip/hotspot/user/add', `=name=${username}`, `=password=${password}`, `=profile=${profile}`, `=comment=WiFiAqui-${Date.now()}`, ...(mac ? [`=mac-address=${mac}`] : [])]));
const mkLogin = (env, { username, password, ip }) => comMikrotik(env, mk => mk.cmd(['/ip/hotspot/active/login', `=user=${username}`, `=password=${password}`, `=ip=${ip}`]));
async function mkAtivos(env) {
  try { const a = await comMikrotik(env, mk => mk.cmd(['/ip/hotspot/active/print'])); return a.map(c => ({ usuario: c.user, ip: c.address, mac: c['mac-address'], uptime: c.uptime, sessao: c['session-time-left'] })); }
  catch { return []; }
}
const mkRemover = (env, nome) => comMikrotik(env, async mk => { const u = await mk.cmd(['/ip/hotspot/user/print', `?name=${nome}`]); if (u[0]) await mk.cmd(['/ip/hotspot/user/remove', `=.id=${u[0]['.id']}`]); });
async function mkStatus(env) { try { const i = await comMikrotik(env, mk => mk.cmd(['/system/identity/print'])); return { conectado: true, nome: i[0]?.name } } catch (e) { return { conectado: false, erro: e.message } } }

// ---------------- Util ----------------
const agora = () => new Date().toISOString();
const hoje = () => agora().slice(0, 10);
const mes = () => agora().slice(0, 7);
const ipDe = req => req.headers.get('CF-Connecting-IP') || null;
async function corpo(req) {
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('application/json')) return req.json().catch(() => ({}));
  if (ct.includes('form')) { const f = await req.formData(); return Object.fromEntries(f.entries()); }
  return {};
}
async function portal(req, env) {
  const u = new URL(req.url);
  return env.ASSETS.fetch(new Request(u.origin + '/portal-cliente.html'));
}

// ---------------- Segurança: confirma o pagamento na própria InfinitePay ----------------
async function confirmarPagamento(env, body) {
  const { order_nsu, transaction_nsu, invoice_slug } = body || {};
  if (!order_nsu || !transaction_nsu || !invoice_slug) return 'nao_pago';
  try {
    const r = await fetch('https://api.checkout.infinitepay.io/payment_check', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle: env.INFINITEPAY_HANDLE, order_nsu, transaction_nsu, slug: invoice_slug }),
    });
    if (r.status >= 400 && r.status < 500 && r.status !== 429) return 'nao_pago';
    if (!r.ok) return 'indefinido';
    const d = await r.json().catch(() => null);
    if (!d || typeof d.paid !== 'boolean') return 'indefinido';
    return d.success !== false && d.paid ? 'pago' : 'nao_pago';
  } catch (e) { console.error('payment_check', e.message); return 'indefinido'; }
}

// ---------------- Webhook ----------------
async function processarPagamento(body, env) {
  const { order_nsu, items } = body || {};
  if (!order_nsu) return;
  const vendas = await lerVendas(env, true);
  const i = vendas.findIndex(v => v.id === order_nsu);
  if (i < 0 || vendas[i].status === 'pago') return;
  const conf = await confirmarPagamento(env, body);
  if (conf === 'nao_pago') {
    console.warn('Webhook recusado (pagamento não confirmado na InfinitePay)', order_nsu);
    await telegram(env, `⚠️ WiFi Aqui: aviso de pagamento RECUSADO (não confirmado na InfinitePay)\nVenda: ${order_nsu}\nSe o valor caiu na sua conta, libere o acesso manualmente.`);
    return;
  }
  const venda = vendas[i];
  const desc = items?.[0]?.description || '';
  const ipDesc = desc.match(/IP:([^|]+)/)?.[1]?.trim() || null;
  const macDesc = desc.match(/MAC:([^|]+)/)?.[1]?.trim() || null;
  const planos = await lerPlanos(env);
  const plano = planos.find(p => p.id === venda.plano_id);
  if (!plano) return;

  const username = `wa_${Date.now()}`;
  const password = crypto.randomUUID().slice(0, 8);
  try {
    await mkCriarUsuario(env, { username, password, profile: plano.id, mac: venda.mac_cliente || macDesc });
    const ip = venda.ip_cliente || ipDesc;
    if (ip && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)) await mkLogin(env, { username, password, ip }).catch(e => console.error('mk login', e.message));
  } catch (e) { console.error('Mikrotik (venda registrada mesmo assim):', e.message); }

  vendas[i] = { ...venda, status: 'pago', mikrotik_user: username, mikrotik_senha: password, inicio_sessao: agora() };
  await salvarVendas(env, vendas);
  await telegram(env, ['💳 NOVA VENDA — WiFi Aqui!', `📶 Plano: ${plano.nome} (${plano.minutos}min)`, `💰 Valor: R$${(venda.valor / 100).toFixed(2)}`,
    venda.cliente_nome ? `👤 Nome: ${venda.cliente_nome}` : '', venda.cliente_celular ? `📱 Celular: ${venda.cliente_celular}` : '',
    `🔌 MAC: ${venda.mac_cliente || 'N/A'}`, `🌐 IP: ${venda.ip_cliente || 'N/A'}`, conf === 'indefinido' ? '⚠️ Não consegui confirmar na InfinitePay agora — confira se o valor caiu.' : ''].filter(Boolean).join('\n'));
}

// ---------------- Rotas ----------------
export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url); const p = url.pathname.replace(/\/+$/, '') || '/'; const m = req.method;
    if (m === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    try {
      // Portal
      if (p === '/' || p === '/portal' || p === '/portal/sucesso') {
        if (m === 'POST') { // vindo do login.html do Mikrotik: guarda mac/ip na URL
          const b = await corpo(req); const q = new URLSearchParams();
          if (b.mac) q.set('mac', b.mac); if (b.ip) q.set('ip', b.ip);
          return Response.redirect(`${url.origin}/portal${q.toString() ? '?' + q : ''}`, 303);
        }
        return portal(req, env);
      }
      if (p === '/portal/mikrotik-login')
        return new Response(`<html><title>WiFi Aqui</title><body><form name="r" action="${url.origin}/portal" method="post"><input type="hidden" name="mac" value="$(mac)"><input type="hidden" name="ip" value="$(ip)"></form><script>document.r.submit();</script></body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      if (p === '/portal/planos') return json({ sucesso: true, planos: (await lerPlanos(env)).filter(x => x.ativo) });
      if (p === '/portal/iniciar-pagamento' && m === 'POST') {
        const { plano_id, mac_cliente, ip_cliente, cliente_nome, cliente_celular } = await corpo(req);
        const plano = (await lerPlanos(env)).find(x => x.id === plano_id);
        if (!plano) return json({ sucesso: false, erro: 'Plano não encontrado' }, 400);
        const vendaId = crypto.randomUUID(); const ip = ip_cliente || ipDe(req);
        const payload = {
          handle: env.INFINITEPAY_HANDLE, redirect_url: `${url.origin}/portal/sucesso?venda=${vendaId}`, webhook_url: `${url.origin}/webhook/infinitepay`, order_nsu: vendaId,
          customer: { name: cliente_nome || 'Cliente WiFi', email: 'cliente@wifiaqui.com', phone_number: cliente_celular || '47900000000' },
          billing_address: { line1: 'Rua WiFi Aqui', city: 'Joinville', state: 'SC', postal_code: '89000000', country: 'BR' },
          items: [{ quantity: 1, price: Math.round(plano.preco), description: `WiFi Aqui | ${plano.nome} (${plano.minutos}min) | IP:${ip || ''} | MAC:${mac_cliente || ''}` }],
        };
        const r = await fetch('https://api.checkout.infinitepay.io/links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d.url) { console.error('InfinitePay', JSON.stringify(d)); return json({ sucesso: false, erro: 'Erro ao processar pagamento' }, 500); }
        const vendas = await lerVendas(env, true);
        vendas.push({ id: vendaId, plano_id: plano.id, mac_cliente: mac_cliente || null, ip_cliente: ip, cliente_nome: cliente_nome || null, cliente_celular: cliente_celular || null, valor: plano.preco, status: 'pendente', payment_id: vendaId, criado_em: agora() });
        await salvarVendas(env, vendas);
        return json({ sucesso: true, url_pagamento: d.url, venda_id: vendaId, plano: { nome: plano.nome, minutos: plano.minutos, preco: plano.preco } });
      }
      if (p.startsWith('/portal/status/')) {
        const id = decodeURIComponent(p.split('/').pop());
        const v = (await lerVendas(env)).find(x => x.id === id);
        if (!v) return json({ sucesso: false, erro: 'Venda não encontrada' }, 404);
        const pl = (await lerPlanos(env)).find(x => x.id === v.plano_id);
        return json({ sucesso: true, status: v.status, pago: v.status === 'pago', plano_id: v.plano_id, plano_minutos: pl?.minutos || 60, plano_nome: pl?.nome || '', inicio_sessao: v.inicio_sessao });
      }
      // Webhook
      if (p === '/webhook/infinitepay' && m === 'POST') {
        const b = await req.json().catch(() => ({})); console.log('Webhook', JSON.stringify(b));
        ctx.waitUntil(processarPagamento(b, env).catch(e => console.error('webhook', e.message)));
        return json({ success: true });
      }
      // Sync / health
      if (p === '/mikrotik/sync') { const pend = (await lerVendas(env)).filter(v => v.status === 'pago' && !v.mikrotik_sincronizado); return json({ sucesso: true, pendentes: pend.length, dados: pend }); }
      if (p === '/health') return json({ status: 'online', servico: 'WiFi Aqui', versao: VERSAO, gist: env.WIFIAQUI_GIST_ID, mikrotik: env.MIKROTIK_HOST || '(não configurado)', token_ok: !!env.GITHUB_TOKEN });
      // Admin
      if (p.startsWith('/admin')) {
        const senha = req.headers.get('x-admin-password') || url.searchParams.get('senha');
        if (!env.ADMIN_PASSWORD || senha !== env.ADMIN_PASSWORD) return json({ erro: 'Não autorizado' }, 401);
        if (p === '/admin/dashboard') {
          const [ativos, vendas] = await Promise.all([mkAtivos(env), lerVendas(env)]);
          const pagas = vendas.filter(v => v.status === 'pago');
          const de = pref => pagas.filter(v => v.criado_em?.startsWith(pref));
          return json({ sucesso: true, resumo: { vendas_hoje: de(hoje()).length, receita_hoje: de(hoje()).reduce((s, v) => s + (v.valor || 0), 0), vendas_mes: de(mes()).length, receita_mes: de(mes()).reduce((s, v) => s + (v.valor || 0), 0), total_vendas: pagas.length, clientes_ativos: ativos.length },
            clientes_ativos: ativos, vendas_hoje: vendas.filter(v => v.criado_em?.startsWith(hoje())).sort((a, b) => b.criado_em.localeCompare(a.criado_em)) });
        }
        if (p === '/admin/planos' && m === 'GET') return json({ sucesso: true, planos: await lerPlanos(env) });
        if (p === '/admin/planos' && m === 'POST') {
          const { nome, descricao, minutos, preco } = await corpo(req);
          if (!nome || !minutos || !preco) return json({ erro: 'Dados incompletos' }, 400);
          const planos = await lerPlanos(env); const id = `plano-${minutos}min-${Date.now()}`;
          planos.push({ id, nome, descricao: descricao || '', minutos, preco, ativo: true }); await salvarPlanos(env, planos);
          return json({ sucesso: true, id, mensagem: 'Plano criado!' });
        }
        if (p.startsWith('/admin/planos/')) {
          const id = decodeURIComponent(p.split('/').pop()); const planos = await lerPlanos(env); const i = planos.findIndex(x => x.id === id);
          if (i < 0) return json({ erro: 'Plano não encontrado' }, 404);
          if (m === 'PUT') { const b = await corpo(req); for (const k of ['nome', 'descricao', 'minutos', 'preco', 'ativo', 'popular']) if (b[k] !== undefined) planos[i][k] = b[k]; await salvarPlanos(env, planos); return json({ sucesso: true, mensagem: 'Plano atualizado!' }); }
          if (m === 'DELETE') { planos[i].ativo = false; await salvarPlanos(env, planos); return json({ sucesso: true, mensagem: 'Plano desativado' }); }
        }
        if (p === '/admin/vendas') { const f = url.searchParams.get('periodo') === 'mes' ? mes() : hoje(); return json({ sucesso: true, vendas: (await lerVendas(env)).filter(v => v.criado_em?.startsWith(f)).sort((a, b) => b.criado_em.localeCompare(a.criado_em)) }); }
        if (p === '/admin/mikrotik/status') return json({ sucesso: true, ...(await mkStatus(env)) });
        if (p.startsWith('/admin/clientes/') && m === 'DELETE') { try { await mkRemover(env, decodeURIComponent(p.split('/').pop())); return json({ sucesso: true }); } catch { return json({ erro: 'Erro ao remover cliente' }, 500); } }
      }
      // demais arquivos estáticos de public/
      return env.ASSETS.fetch(req);
    } catch (e) { console.error('erro', p, e.message); return json({ erro: e.message }, 500); }
  },
};
