const express = require('express');
const router = express.Router();
const db = require('../database');
const mikrotik = require('../services/mikrotik');
const { v4: uuidv4 } = require('uuid');

// ================================
// POST /webhook/infinitepay
// InfinitePay chama aqui quando pagamento é confirmado
// ================================
router.post('/infinitepay', async (req, res) => {
  try {
    const payload = req.body;
    console.log('📥 Webhook recebido:', JSON.stringify(payload, null, 2));

    // Responde 200 imediatamente para a InfinitePay não retentar
    res.status(200).json({ recebido: true });

    // Processar de forma assíncrona
    await processarPagamento(payload);
  } catch (err) {
    console.error('❌ Erro no webhook:', err);
    res.status(200).json({ recebido: true }); // Sempre 200 para evitar retentativas
  }
});

// ================================
// PROCESSAR PAGAMENTO CONFIRMADO
// ================================
async function processarPagamento(payload) {
  try {
    // Identificar venda pelo order_nsu
    const vendaId = payload.order_nsu;
    if (!vendaId) {
      console.log('⚠️ Webhook sem order_nsu, ignorando');
      return;
    }

    // Verificar se é pagamento confirmado
    const statusPago = ['paid', 'approved', 'captured', 'succeeded'];
    const statusPayload = payload.status?.toLowerCase() || '';
    if (!statusPago.includes(statusPayload)) {
      console.log(`⚠️ Status não é pagamento: ${statusPayload}`);
      return;
    }

    // Buscar venda no banco
    const venda = db.getVenda(vendaId);
    if (!venda) {
      console.log(`⚠️ Venda não encontrada: ${vendaId}`);
      return;
    }

    // Evitar processamento duplicado
    if (venda.status === 'pago') {
      console.log(`⚠️ Venda já processada: ${vendaId}`);
      return;
    }

    // Buscar plano
    const plano = db.getPlano(venda.plano_id);
    if (!plano) {
      console.log(`⚠️ Plano não encontrado: ${venda.plano_id}`);
      return;
    }

    // Gerar credenciais para o cliente
    const username = `wa_${Date.now()}`;
    const password = uuidv4().substring(0, 8);

    console.log(`💳 Pagamento confirmado! Venda: ${vendaId} | Plano: ${plano.nome}`);

    // Criar usuário no Mikrotik
    await mikrotik.criarUsuario({
      username,
      password,
      profile: plano.id, // plano-10min, plano-30min, etc
      macCliente: venda.mac_cliente,
    });

    // Se tiver IP do cliente, logar automaticamente
    if (venda.ip_cliente && venda.ip_cliente !== '::1') {
      await mikrotik.loginCliente({
        username,
        password,
        ipCliente: venda.ip_cliente,
      });
    }

    // Atualizar venda no banco
    db.atualizarVenda(vendaId, {
      status: 'pago',
      mikrotik_user: username,
      inicio_sessao: new Date().toISOString(),
    });

    console.log(`✅ Acesso liberado! Cliente: ${username} | Plano: ${plano.nome} (${plano.minutos}min)`);
  } catch (err) {
    console.error('❌ Erro ao processar pagamento:', err);
  }
}

// ================================
// POST /webhook/teste
// Simular pagamento para testes
// ================================
router.post('/teste', async (req, res) => {
  const adminPassword = req.headers['x-admin-password'];
  if (adminPassword !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ erro: 'Não autorizado' });
  }

  const { venda_id } = req.body;
  if (!venda_id) {
    return res.status(400).json({ erro: 'venda_id obrigatório' });
  }

  await processarPagamento({
    order_nsu: venda_id,
    status: 'paid',
  });

  res.json({ sucesso: true, mensagem: 'Pagamento simulado processado' });
});

module.exports = router;
