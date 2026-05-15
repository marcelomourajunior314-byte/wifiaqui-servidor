const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const db = require('../database');
const { gerarLinkPagamento } = require('../services/infinitepay');

// ================================
// GET /portal/hotspot
// HTML mínimo para o Mikrotik — redirect instantâneo
// ================================
router.get('/hotspot', (req, res) => {
  res.send('<html><head><meta http-equiv="refresh" content="0;url=https://wifiaqui-servidor-production.up.railway.app/portal"></head><body>Redirecionando...</body></html>');
});

// ================================
// GET /portal
// Servir a página HTML do portal
// ================================
router.get('/', (req, res) => {
  res.sendFile('portal-cliente.html', { root: './public' });
});

// ================================
// GET /portal/planos
// Retorna planos ativos para o frontend
// ================================
router.get('/planos', (req, res) => {
  try {
    const planos = db.getPlanos();
    res.json({ sucesso: true, planos });
  } catch (err) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao buscar planos' });
  }
});

// ================================
// POST /portal/iniciar-pagamento
// Cliente escolheu plano → gerar link InfinitePay
// ================================
router.post('/iniciar-pagamento', async (req, res) => {
  try {
    const { plano_id, mac_cliente, ip_cliente } = req.body;

    const plano = db.getPlano(plano_id);
    if (!plano) {
      return res.status(400).json({ sucesso: false, erro: 'Plano não encontrado' });
    }

    const vendaId = uuidv4();
    db.criarVenda({
      id: vendaId,
      plano_id: plano.id,
      mac_cliente: mac_cliente || null,
      ip_cliente: ip_cliente || req.ip,
      valor: plano.preco,
      status: 'pendente',
      payment_id: vendaId,
    });

    const serverUrl = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3000}`;
    const resultado = await gerarLinkPagamento({
      vendaId,
      plano,
      valor: plano.preco,
      urlRetorno: `${serverUrl}/portal/sucesso?venda=${vendaId}`,
      urlWebhook: `${serverUrl}/webhook/infinitepay`,
    });

    res.json({
      sucesso: true,
      url_pagamento: resultado.url,
      venda_id: vendaId,
      plano: {
        nome: plano.nome,
        minutos: plano.minutos,
        preco: plano.preco,
      },
    });
  } catch (err) {
    console.error('Erro ao iniciar pagamento:', err);
    res.status(500).json({ sucesso: false, erro: 'Erro ao processar pagamento' });
  }
});

// ================================
// GET /portal/status/:vendaId
// Polling — cliente verifica se pagamento foi confirmado
// ================================
router.get('/status/:vendaId', (req, res) => {
  try {
    const venda = db.getVenda(req.params.vendaId);
    if (!venda) {
      return res.status(404).json({ sucesso: false, erro: 'Venda não encontrada' });
    }
    res.json({
      sucesso: true,
      status: venda.status,
      pago: venda.status === 'pago',
      plano_id: venda.plano_id,
      inicio_sessao: venda.inicio_sessao,
    });
  } catch (err) {
    res.status(500).json({ sucesso: false, erro: 'Erro ao verificar status' });
  }
});

// ================================
// GET /portal/sucesso
// Página de retorno após pagamento
// ================================
router.get('/sucesso', (req, res) => {
  res.sendFile('portal-cliente.html', { root: './public' });
});

module.exports = router;
