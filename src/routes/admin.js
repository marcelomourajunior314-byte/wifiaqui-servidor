const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const mikrotik = require('../services/mikrotik');
const { atualizarPerfil, alterarSSID, buscarSSID } = require('../services/mikrotik');

function autenticar(req, res, next) {
  const senha = req.headers['x-admin-password'] || req.query.senha;
  if (senha !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ erro: 'Não autorizado' });
  }
  next();
}

router.use(autenticar);

router.get('/dashboard', async (req, res) => {
  try {
    const resumo = db.getResumo();
    const ativos = await mikrotik.clientesAtivos();
    const vendasHoje = db.getVendasHoje();
    res.json({
      sucesso: true,
      resumo: {
        vendas_hoje: resumo.vendas_hoje || 0,
        receita_hoje: resumo.receita_hoje || 0,
        vendas_mes: resumo.vendas_mes || 0,
        receita_mes: resumo.receita_mes || 0,
        total_vendas: resumo.total_vendas || 0,
        clientes_ativos: ativos.length,
      },
      clientes_ativos: ativos,
      vendas_hoje: vendasHoje,
    });
  } catch (err) {
    console.error('Erro no dashboard:', err);
    res.status(500).json({ erro: 'Erro ao carregar dashboard' });
  }
});

router.get('/planos', (req, res) => {
  try {
    res.json({ sucesso: true, planos: db.getPlanos() });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar planos' });
  }
});

router.post('/planos', async (req, res) => {
  try {
    const { nome, descricao, minutos, preco } = req.body;
    if (!nome || !minutos || !preco) {
      return res.status(400).json({ erro: 'nome, minutos e preco são obrigatórios' });
    }
    const id = `plano-${minutos}min-${Date.now()}`;
    db.criarPlano({ id, nome, descricao: descricao || '', minutos, preco });
    await atualizarPerfil({ nome: id, minutos, velocidade: '5M/3M' });
    res.json({ sucesso: true, id, mensagem: 'Plano criado com sucesso' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao criar plano' });
  }
});

router.put('/planos/:id', async (req, res) => {
  try {
    const { nome, descricao, minutos, preco, ativo } = req.body;
    const { id } = req.params;
    const planoAtual = db.getPlano(id);
    if (!planoAtual) return res.status(404).json({ erro: 'Plano não encontrado' });
    db.atualizarPlano(id, {
      nome: nome || planoAtual.nome,
      descricao: descricao !== undefined ? descricao : planoAtual.descricao,
      minutos: minutos || planoAtual.minutos,
      preco: preco || planoAtual.preco,
      ativo: ativo !== undefined ? (ativo ? 1 : 0) : planoAtual.ativo,
    });
    if (minutos && minutos !== planoAtual.minutos) {
      await atualizarPerfil({ nome: id, minutos, velocidade: '5M/3M' });
    }
    res.json({ sucesso: true, mensagem: 'Plano atualizado com sucesso' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao atualizar plano' });
  }
});

router.delete('/planos/:id', (req, res) => {
  try {
    db.deletarPlano(req.params.id);
    res.json({ sucesso: true, mensagem: 'Plano desativado' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao deletar plano' });
  }
});

router.get('/vendas', (req, res) => {
  try {
    const { periodo } = req.query;
    const vendas = periodo === 'mes' ? db.getVendasMes() : db.getVendasHoje();
    res.json({ sucesso: true, vendas });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar vendas' });
  }
});

router.delete('/clientes/:username', async (req, res) => {
  try {
    await mikrotik.removerUsuario(req.params.username);
    res.json({ sucesso: true, mensagem: 'Cliente removido' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao remover cliente' });
  }
});

router.get('/mikrotik/status', async (req, res) => {
  try {
    const status = await mikrotik.testarConexao();
    res.json({ sucesso: true, ...status });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao verificar Mikrotik' });
  }
});

router.get('/rede', async (req, res) => {
  try {
    const resultado = await buscarSSID();
    const ssidSalvo = process.env.WIFI_SSID || resultado.ssid;
    res.json({ sucesso: true, ssid: ssidSalvo });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao buscar nome da rede' });
  }
});

router.post('/rede', async (req, res) => {
  try {
    const { ssid } = req.body;
    if (!ssid || ssid.trim().length < 1) return res.status(400).json({ erro: 'Nome da rede não pode ser vazio' });
    if (ssid.length > 32) return res.status(400).json({ erro: 'Nome máximo 32 caracteres' });
    await alterarSSID(ssid.trim());
    res.json({ sucesso: true, ssid: ssid.trim(), mensagem: 'Nome da rede atualizado!' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao alterar nome da rede. Verifique conexão com Mikrotik.' });
  }
});

router.post('/senha', async (req, res) => {
  try {
    const { senha_atual, senha_nova } = req.body;
    if (senha_atual !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ erro: 'Senha atual incorreta' });
    }
    res.json({ sucesso: true, mensagem: 'Senha atualizada. Atualize a variável ADMIN_PASSWORD no Railway.' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao alterar senha' });
  }
});

module.exports = router;
