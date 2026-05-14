const express = require('express');
const router = express.Router();
const db = require('../database');
const mikrotik = require('../services/mikrotik');
const { v4: uuidv4 } = require('uuid');

const processados = new Set();

router.post('/infinitepay', async (req, res) => {
  res.status(200).json({ success: true });
  try {
    console.log('📥 Webhook recebido:', JSON.stringify(req.body));
    await processarPagamento(req.body);
  } catch (err) {
    console.error('❌ Erro no webhook:', err);
  }
});

async function processarPagamento(payload) {
  const { order_nsu, amount, items } = payload;
  if (!order_nsu) return;

  if (processados.has(order_nsu)) {
    console.log('⚠️ Já processado:', order_nsu);
    return;
  }

  const desc = items?.[0]?.description || '';
  const ipMatch  = desc.match(/IP:\s*([^|]+)/);
  const macMatch = desc.match(/MAC:\s*([^|]+)/);
  const ipCliente  = ipMatch  ? ipMatch[1].trim()  : null;
  const macCliente = macMatch ? macMatch[1].trim()  : null;

  console.log(`💳 Processando: ${order_nsu}`);

  const venda = db.getVenda(order_nsu);
  if (!venda) { console.log(`⚠️ Venda não encontrada: ${order_nsu}`); return; }
  if (venda.status === 'pago') { console.log(`⚠️ Venda já paga: ${order_nsu}`); return; }

  const plano = db.getPlano(venda.plano_id);
  if (!plano) { console.log(`⚠️ Plano não encontrado: ${venda.plano_id}`); return; }

  const username = `wa_${Date.now()}`;
  const password = uuidv4().substring(0, 8);
  const valor = ((amount || 0) / 100).toFixed(2);

  console.log(`🎉 Pagamento confirmado! Plano: ${plano.nome} | R$${valor}`);

  try {
    await mikrotik.criarUsuario({
      username, password, profile: plano.id,
      macCliente: venda.mac_cliente || macCliente,
    });
    const ip = venda.ip_cliente || ipCliente;
    if (ip && ip !== '::1' && ip !== '127.0.0.1') {
      await mikrotik.loginCliente({ username, password, ipCliente: ip });
    }
  } catch (err) {
    console.error('❌ Erro Mikrotik (venda registrada):', err.message);
  }

  db.atualizarVenda(order_nsu, {
    status: 'pago',
    mikrotik_user: username,
    mikrotik_processado: true,
    inicio_sessao: new Date().toISOString(),
  });

  processados.add(order_nsu);
  console.log(`✅ Acesso liberado! User: ${username} | Plano: ${plano.nome} (${plano.minutos}min)`);
}

router.post('/teste', async (req, res) => {
  const senha = req.headers['x-admin-password'];
  if (senha !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ erro: 'Não autorizado' });
  }
  const { venda_id } = req.body;
  if (!venda_id) return res.status(400).json({ erro: 'venda_id obrigatório' });
  await processarPagamento({ order_nsu: venda_id, amount: 0, items: [{ description: 'Teste' }] });
  res.json({ sucesso: true, mensagem: 'Pagamento simulado' });
});

module.exports = router;
