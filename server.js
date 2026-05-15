// WiFi Aqui — Servidor v2.0
// Arquitetura simplificada: tudo em um arquivo, Gist para persistência
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fetch = require('node-fetch');
const { RouterOSAPI } = require('node-routeros');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const PORT              = process.env.PORT || 3000;
const ADMIN_PASSWORD    = process.env.ADMIN_PASSWORD || '04110820';
const SERVER_URL        = process.env.SERVER_URL || 'https://wifiaqui-servidor-production.up.railway.app';
const INFINITEPAY_HANDLE = process.env.INFINITEPAY_HANDLE || 'aurumwood';
const GITHUB_TOKEN      = process.env.GITHUB_TOKEN;
const GIST_ID           = process.env.WIFIAQUI_GIST_ID || '5b034134c5c02b347c68824569e8ccc2';
const TG_BOT_TOKEN      = process.env.TG_BOT_TOKEN || '8826986129:AAGwKZiCU-25EhqtDDgFQxrsVfMBigFD19w';
const TG_CHAT_ID        = process.env.TG_CHAT_ID || '8782621401';

const MIKROTIK_CONFIG = {
  host:     process.env.MIKROTIK_HOST || '127.0.0.1',
  port:     parseInt(process.env.MIKROTIK_PORT) || 8728,
  user:     process.env.MIKROTIK_USER || 'admin',
  password: process.env.MIKROTIK_PASSWORD || '',
  timeout:  10,
};

// Cache em memória + Gist para persistência de vendas
let vendasCache = [];
const processados = new Set();

async function lerVendas() {
  try {
    const headers = { 'Accept': 'application/vnd.github.v3+json' };
    if (GITHUB_TOKEN) headers['Authorization'] = `token ${GITHUB_TOKEN}`;
    const r = await fetch(`https://api.github.com/gists/${GIST_ID}`, { headers });
    if (!r.ok) return vendasCache;
    const data = await r.json();
    const raw = data.files?.['vendas.json']?.content;
    if (raw) vendasCache = JSON.parse(raw);
    return vendasCache;
  } catch (e) { console.error('lerVendas:', e.message); return vendasCache; }
}

async function salvarVendas() {
  try {
    if (!GITHUB_TOKEN) return false;
    // Salva apenas últimas 500 vendas para não estourar o Gist
    const ultimas = vendasCache.slice(-500);
    const r = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      method: 'PATCH',
      headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: { 'vendas.json': { content: JSON.stringify(ultimas, null, 2) } } })
    });
    return r.ok;
  } catch (e) { console.error('salvarVendas:', e.message); return false; }
}

// Carrega vendas do Gist ao iniciar
lerVendas().then(v => console.log(`📦 Vendas carregadas: ${v.length}`));

// ================================
// GIST — Persistência de planos
// ================================
const planosDefault = [
  { id: 'plano-10min',  nome: 'Flash',    descricao: '10 minutos de acesso', minutos: 10,  preco: 200,  ativo: true },
  { id: 'plano-30min',  nome: 'Expresso', descricao: '30 minutos de acesso', minutos: 30,  preco: 500,  ativo: true },
  { id: 'plano-60min',  nome: 'Turbo',    descricao: '1 hora de acesso',     minutos: 60,  preco: 800,  ativo: true, popular: true },
  { id: 'plano-120min', nome: 'Power',    descricao: '2 horas de acesso',    minutos: 120, preco: 1200, ativo: true },
];

async function lerPlanos() {
  try {
    const headers = { 'Accept': 'application/vnd.github.v3+json' };
    if (GITHUB_TOKEN) headers['Authorization'] = `token ${GITHUB_TOKEN}`;
    const r = await fetch(`https://api.github.com/gists/${GIST_ID}`, { headers });
    if (!r.ok) return planosDefault;
    const data = await r.json();
    const raw = data.files?.['planos.json']?.content;
    return raw ? JSON.parse(raw) : planosDefault;
  } catch (e) { console.error('lerPlanos:', e.message); return planosDefault; }
}

async function salvarPlanos(planos) {
  try {
    if (!GITHUB_TOKEN) return false;
    const r = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      method: 'PATCH',
      headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: { 'planos.json': { content: JSON.stringify(planos, null, 2) } } })
    });
    console.log('Planos salvos no Gist:', r.ok);
    return r.ok;
  } catch (e) { console.error('salvarPlanos:', e.message); return false; }
}

// ================================
// TELEGRAM
// ================================
async function notificarTelegram(msg) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TG_CHAT_ID, text: msg })
    });
    const data = await r.json();
    if (data.ok) console.log("📱 Telegram enviado!");
    else console.error("Telegram erro:", JSON.stringify(data));
  } catch (e) { console.error("Telegram falhou:", e.message); }
}

// ================================
// MIKROTIK
// ================================
async function mkConectar() {
  const conn = new RouterOSAPI(MIKROTIK_CONFIG);
  await conn.connect();
  return conn;
}

async function mkCriarUsuario({ username, password, profile, macCliente }) {
  let conn;
  try {
    conn = await mkConectar();
    await conn.write('/ip/hotspot/user/add', [
      `=name=${username}`, `=password=${password}`, `=profile=${profile}`,
      `=comment=WiFiAqui-${Date.now()}`,
      ...(macCliente ? [`=mac-address=${macCliente}`] : []),
    ]);
    console.log(`✅ Usuário criado: ${username}`);
    return { sucesso: true, username };
  } catch (err) { console.error('❌ mkCriarUsuario:', err.message); throw err; }
  finally { if (conn) conn.close(); }
}

async function mkLoginCliente({ username, password, ipCliente }) {
  let conn;
  try {
    conn = await mkConectar();
    await conn.write('/ip/hotspot/active/login', [
      `=user=${username}`, `=password=${password}`, `=ip=${ipCliente}`,
    ]);
    return { sucesso: true };
  } catch (err) { return { sucesso: false, erro: err.message }; }
  finally { if (conn) conn.close(); }
}

async function mkClientesAtivos() {
  let conn;
  try {
    conn = await mkConectar();
    const ativos = await conn.write('/ip/hotspot/active/print');
    return ativos.map(c => ({
      usuario: c.user, ip: c.address, mac: c['mac-address'],
      uptime: c.uptime, sessao: c['session-time-left'],
    }));
  } catch (err) { return []; }
  finally { if (conn) conn.close(); }
}

async function mkRemoverUsuario(username) {
  let conn;
  try {
    conn = await mkConectar();
    const usuarios = await conn.write('/ip/hotspot/user/print', [`?name=${username}`]);
    if (usuarios.length > 0) {
      await conn.write('/ip/hotspot/user/remove', [`=.id=${usuarios[0]['.id']}`]);
    }
    return { sucesso: true };
  } catch (err) { throw err; }
  finally { if (conn) conn.close(); }
}

async function mkTestarConexao() {
  let conn;
  try {
    conn = await mkConectar();
    const info = await conn.write('/system/identity/print');
    return { conectado: true, nome: info[0]?.name };
  } catch (err) { return { conectado: false, erro: err.message }; }
  finally { if (conn) conn.close(); }
}

// ================================
// UTILS
// ================================
function agora() { return new Date().toISOString(); }
function hoje() { return new Date().toISOString().split('T')[0]; }
function mesAtual() { return new Date().toISOString().substring(0, 7); }
function autenticar(req, res, next) {
  const senha = req.headers['x-admin-password'] || req.query.senha;
  if (senha !== ADMIN_PASSWORD) return res.status(401).json({ erro: 'Não autorizado' });
  next();
}

// ================================
// PORTAL — Cliente
// ================================

// HTML mínimo para o Mikrotik — redirect para o portal
// Arquivo login.html do Mikrotik deve conter form com action para esta rota
app.get('/portal/mikrotik-login', (req, res) => {
  res.set('Content-Type', 'text/html');
  res.send([
    '<html><title>WiFi Aqui</title><body>',
    '<form name="r" action="' + SERVER_URL + '/portal" method="post">',
    '<input type="hidden" name="mac" value="$(mac)">',
    '<input type="hidden" name="ip" value="$(ip)">',
    '</form>',
    '<script>document.r.submit();</script>',
    '</body></html>'
  ].join(''));
});

app.get('/portal', (req, res) => {
  res.sendFile('portal-cliente.html', { root: './public' });
});

app.post('/portal', (req, res) => {
  res.sendFile('portal-cliente.html', { root: './public' });
});

app.get('/portal/sucesso', (req, res) => {
  res.sendFile('portal-cliente.html', { root: './public' });
});

app.get('/portal/planos', async (req, res) => {
  try {
    const planos = await lerPlanos();
    res.json({ sucesso: true, planos: planos.filter(p => p.ativo) });
  } catch (err) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao buscar planos' });
  }
});

app.post('/portal/iniciar-pagamento', async (req, res) => {
  try {
    const { plano_id, mac_cliente, ip_cliente, cliente_nome, cliente_celular } = req.body;
    const planos = await lerPlanos();
    const plano = planos.find(p => p.id === plano_id);
    if (!plano) return res.status(400).json({ sucesso: false, erro: 'Plano não encontrado' });

    const vendaId = uuidv4();
    const novaVenda = {
      id: vendaId, plano_id: plano.id,
      mac_cliente: mac_cliente || null,
      ip_cliente: ip_cliente || req.ip,
      cliente_nome: cliente_nome || null,
      cliente_celular: cliente_celular || null,
      valor: plano.preco, status: 'pendente',
      payment_id: vendaId, criado_em: agora(),
    };
    vendasCache.push(novaVenda);

    const cents = Math.round(plano.preco);
    const payload = {
      handle: INFINITEPAY_HANDLE,
      redirect_url: `${SERVER_URL}/portal/sucesso?venda=${vendaId}`,
      webhook_url: `${SERVER_URL}/webhook/infinitepay`,
      order_nsu: vendaId,
      customer: {
        name: cliente_nome || 'Cliente WiFi',
        email: 'cliente@wifiaqui.com',
        phone_number: cliente_celular || '47900000000',
      },
      billing_address: {
        line1: 'Rua WiFi Aqui',
        city: 'Joinville',
        state: 'SC',
        postal_code: '89000000',
        country: 'BR',
      },
      items: [{
        quantity: 1, price: cents,
        description: `WiFi Aqui | ${plano.nome} (${plano.minutos}min) | IP:${ip_cliente || req.ip} | MAC:${mac_cliente || ''}`,
      }]
    };

    const r = await fetch('https://api.checkout.infinitepay.io/links', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    const data = await r.json();
    if (!r.ok || !data.url) throw new Error('Erro InfinitePay');

    res.json({ sucesso: true, url_pagamento: data.url, venda_id: vendaId, plano: { nome: plano.nome, minutos: plano.minutos, preco: plano.preco } });
  } catch (err) {
    console.error('iniciar-pagamento:', err);
    res.status(500).json({ sucesso: false, erro: 'Erro ao processar pagamento' });
  }
});

app.get('/portal/status/:vendaId', async (req, res) => {
  const venda = vendasCache.find(v => v.id === req.params.vendaId);
  if (!venda) return res.status(404).json({ sucesso: false, erro: 'Venda não encontrada' });
  const planos = await lerPlanos();
  const plano = planos.find(p => p.id === venda.plano_id);
  res.json({
    sucesso: true,
    status: venda.status,
    pago: venda.status === 'pago',
    plano_id: venda.plano_id,
    plano_minutos: plano?.minutos || 60,
    plano_nome: plano?.nome || '',
    inicio_sessao: venda.inicio_sessao,
  });
});

// ================================
// WEBHOOK — InfinitePay
// ================================
app.post('/webhook/infinitepay', async (req, res) => {
  res.status(200).json({ success: true });
  try {
    console.log('📥 Webhook:', JSON.stringify(req.body));
    const { order_nsu, amount, items } = req.body;
    if (!order_nsu || processados.has(order_nsu)) return;

    const desc = items?.[0]?.description || '';
    const ipMatch  = desc.match(/IP:([^|]+)/);
    const macMatch = desc.match(/MAC:([^|]+)/);
    const ipCliente  = ipMatch?.[1]?.trim() || null;
    const macCliente = macMatch?.[1]?.trim() || null;

    // Dados do cliente preenchidos no checkout InfinitePay
    const nomeCliente  = req.body?.customer?.name || req.body?.billing?.name || '';
    const emailCliente = req.body?.customer?.email || req.body?.billing?.email || '';
    const foneCliente  = req.body?.customer?.phone || req.body?.billing?.phone || '';

    const venda = vendasCache.find(v => v.id === order_nsu);
    if (!venda || venda.status === 'pago') return;

    const planos = await lerPlanos();
    const plano = planos.find(p => p.id === venda.plano_id);
    if (!plano) return;

    const username = `wa_${Date.now()}`;
    const password = uuidv4().substring(0, 8);

    try {
      await mkCriarUsuario({ username, password, profile: plano.id, macCliente: venda.mac_cliente || macCliente });
      const ip = venda.ip_cliente || ipCliente;
      if (ip && ip !== '::1' && ip !== '127.0.0.1') {
        await mkLoginCliente({ username, password, ipCliente: ip });
      }
    } catch (err) {
      console.error('❌ Mikrotik erro (venda registrada):', err.message);
    }

    const i = vendasCache.findIndex(v => v.id === order_nsu);
    if (i !== -1) {
      vendasCache[i] = { ...vendasCache[i], status: 'pago', mikrotik_user: username, inicio_sessao: agora() };
    }
    processados.add(order_nsu);
    await salvarVendas();
    const valor = (venda.valor / 100).toFixed(2);
    const msg = [
      '💳 NOVA VENDA — WiFi Aqui!',
      `📶 Plano: ${plano.nome} (${plano.minutos}min)`,
      `💰 Valor: R$${valor}`,
      venda.cliente_nome    ? `👤 Nome: ${venda.cliente_nome}`       : '',
      venda.cliente_celular ? `📱 Celular: ${venda.cliente_celular}` : '',
      `🔌 MAC: ${venda.mac_cliente || 'N/A'}`,
      `🌐 IP: ${venda.ip_cliente || 'N/A'}`,
    ].filter(Boolean).join('\n');
    await notificarTelegram(msg);
    console.log(`✅ Acesso liberado! ${username} | ${plano.nome}`);
  } catch (err) { console.error('❌ webhook:', err); }
});

// ================================
// ADMIN — Dashboard
// ================================
app.use('/admin', autenticar);

app.get('/admin/dashboard', async (req, res) => {
  try {
    const ativos = await mkClientesAtivos();
    const pagas = vendasCache.filter(v => v.status === 'pago');
    res.json({
      sucesso: true,
      resumo: {
        vendas_hoje:    pagas.filter(v => v.criado_em?.startsWith(hoje())).length,
        receita_hoje:   pagas.filter(v => v.criado_em?.startsWith(hoje())).reduce((s, v) => s + (v.valor || 0), 0),
        vendas_mes:     pagas.filter(v => v.criado_em?.startsWith(mesAtual())).length,
        receita_mes:    pagas.filter(v => v.criado_em?.startsWith(mesAtual())).reduce((s, v) => s + (v.valor || 0), 0),
        total_vendas:   pagas.length,
        clientes_ativos: ativos.length,
      },
      clientes_ativos: ativos,
      vendas_hoje: vendasCache.filter(v => v.criado_em?.startsWith(hoje())).sort((a, b) => b.criado_em.localeCompare(a.criado_em)),
    });
  } catch (err) { res.status(500).json({ erro: 'Erro ao carregar dashboard' }); }
});

app.get('/admin/planos', async (req, res) => {
  try {
    const planos = await lerPlanos();
    res.json({ sucesso: true, planos });
  } catch (err) { res.status(500).json({ erro: 'Erro ao buscar planos' }); }
});

app.put('/admin/planos/:id', async (req, res) => {
  try {
    const { nome, descricao, minutos, preco, ativo, popular } = req.body;
    const planos = await lerPlanos();
    const i = planos.findIndex(p => p.id === req.params.id);
    if (i === -1) return res.status(404).json({ erro: 'Plano não encontrado' });
    planos[i] = {
      ...planos[i],
      ...(nome !== undefined && { nome }),
      ...(descricao !== undefined && { descricao }),
      ...(minutos !== undefined && { minutos }),
      ...(preco !== undefined && { preco }),
      ...(ativo !== undefined && { ativo }),
      ...(popular !== undefined && { popular }),
    };
    await salvarPlanos(planos);
    res.json({ sucesso: true, mensagem: 'Plano atualizado!' });
  } catch (err) { res.status(500).json({ erro: 'Erro ao atualizar plano' }); }
});

app.post('/admin/planos', async (req, res) => {
  try {
    const { nome, descricao, minutos, preco } = req.body;
    if (!nome || !minutos || !preco) return res.status(400).json({ erro: 'Dados incompletos' });
    const planos = await lerPlanos();
    const id = `plano-${minutos}min-${Date.now()}`;
    planos.push({ id, nome, descricao: descricao || '', minutos, preco, ativo: true });
    await salvarPlanos(planos);
    res.json({ sucesso: true, id, mensagem: 'Plano criado!' });
  } catch (err) { res.status(500).json({ erro: 'Erro ao criar plano' }); }
});

app.delete('/admin/planos/:id', async (req, res) => {
  try {
    const planos = await lerPlanos();
    const i = planos.findIndex(p => p.id === req.params.id);
    if (i === -1) return res.status(404).json({ erro: 'Plano não encontrado' });
    planos[i].ativo = false;
    await salvarPlanos(planos);
    res.json({ sucesso: true, mensagem: 'Plano desativado' });
  } catch (err) { res.status(500).json({ erro: 'Erro ao deletar plano' }); }
});

app.get('/admin/vendas', (req, res) => {
  const { periodo } = req.query;
  const filtro = periodo === 'mes' ? mesAtual() : hoje();
  const vendas = vendasCache.filter(v => v.criado_em?.startsWith(filtro)).sort((a, b) => b.criado_em.localeCompare(a.criado_em));
  res.json({ sucesso: true, vendas });
});

app.get('/admin/mikrotik/status', async (req, res) => {
  const status = await mkTestarConexao();
  res.json({ sucesso: true, ...status });
});

app.delete('/admin/clientes/:username', async (req, res) => {
  try {
    await mkRemoverUsuario(req.params.username);
    res.json({ sucesso: true });
  } catch (err) { res.status(500).json({ erro: 'Erro ao remover cliente' }); }
});

// ================================
// MIKROTIK SYNC — Scheduler puxa isso
// ================================
app.get('/mikrotik/sync', async (req, res) => {
  const pendentes = vendasCache.filter(v => v.status === 'pago' && !v.mikrotik_sincronizado);
  res.json({ sucesso: true, pendentes: pendentes.length, dados: pendentes });
});

// ================================
// HEALTH
// ================================
app.get('/health', (req, res) => {
  res.json({ status: 'online', servico: 'WiFi Aqui', versao: '2.0', gist: GIST_ID, mikrotik: MIKROTIK_CONFIG.host });
});

app.get('/', (req, res) => {
  res.sendFile('portal-cliente.html', { root: './public' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('🚀 ================================');
  console.log('📡 WiFi Aqui — Servidor v2.0');
  console.log(`🌐 Porta: ${PORT}`);
  console.log(`🔧 Mikrotik: ${MIKROTIK_CONFIG.host}`);
  console.log(`💳 InfinitePay: ${INFINITEPAY_HANDLE}`);
  console.log(`📦 Gist: ${GIST_ID}`);
  console.log(`🔑 GitHub Token: ${GITHUB_TOKEN ? 'OK' : 'AUSENTE'}`);
  console.log('✅ ================================');
  console.log('');
});

module.exports = app;
