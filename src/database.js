const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '../../wifiaqui.db'));

// Habilitar WAL para melhor performance
db.pragma('journal_mode = WAL');

// ================================
// CRIAR TABELAS
// ================================
db.exec(`
  -- Planos disponíveis
  CREATE TABLE IF NOT EXISTS planos (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    descricao TEXT,
    minutos INTEGER NOT NULL,
    preco INTEGER NOT NULL,
    ativo INTEGER DEFAULT 1,
    criado_em TEXT DEFAULT (datetime('now'))
  );

  -- Vendas/Sessões
  CREATE TABLE IF NOT EXISTS vendas (
    id TEXT PRIMARY KEY,
    plano_id TEXT NOT NULL,
    mac_cliente TEXT,
    ip_cliente TEXT,
    valor INTEGER NOT NULL,
    status TEXT DEFAULT 'pendente',
    payment_id TEXT,
    mikrotik_user TEXT,
    inicio_sessao TEXT,
    fim_sessao TEXT,
    criado_em TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (plano_id) REFERENCES planos(id)
  );

  -- Configurações do sistema
  CREATE TABLE IF NOT EXISTS configuracoes (
    chave TEXT PRIMARY KEY,
    valor TEXT NOT NULL,
    atualizado_em TEXT DEFAULT (datetime('now'))
  );
`);

// ================================
// PLANOS PADRÃO
// ================================
const planosExistentes = db.prepare('SELECT COUNT(*) as total FROM planos').get();
if (planosExistentes.total === 0) {
  const inserirPlano = db.prepare(`
    INSERT INTO planos (id, nome, descricao, minutos, preco, ativo)
    VALUES (?, ?, ?, ?, ?, 1)
  `);
  inserirPlano.run('plano-10min',  'Flash',    '10 minutos de acesso',  10,  200);
  inserirPlano.run('plano-30min',  'Expresso', '30 minutos de acesso',  30,  500);
  inserirPlano.run('plano-60min',  'Turbo',    '1 hora de acesso',      60,  800);
  inserirPlano.run('plano-120min', 'Power',    '2 horas de acesso',     120, 1200);
}

// ================================
// QUERIES REUTILIZÁVEIS
// ================================
module.exports = {
  db,

  // Planos
  getPlanos: () => db.prepare('SELECT * FROM planos WHERE ativo = 1 ORDER BY minutos').all(),
  getPlano: (id) => db.prepare('SELECT * FROM planos WHERE id = ?').get(id),
  criarPlano: (plano) => db.prepare(`
    INSERT INTO planos (id, nome, descricao, minutos, preco)
    VALUES (@id, @nome, @descricao, @minutos, @preco)
  `).run(plano),
  atualizarPlano: (id, dados) => db.prepare(`
    UPDATE planos SET nome=@nome, descricao=@descricao, minutos=@minutos, preco=@preco, ativo=@ativo
    WHERE id=@id
  `).run({ ...dados, id }),
  deletarPlano: (id) => db.prepare('UPDATE planos SET ativo = 0 WHERE id = ?').run(id),

  // Vendas
  criarVenda: (venda) => db.prepare(`
    INSERT INTO vendas (id, plano_id, mac_cliente, ip_cliente, valor, status, payment_id)
    VALUES (@id, @plano_id, @mac_cliente, @ip_cliente, @valor, @status, @payment_id)
  `).run(venda),
  getVenda: (id) => db.prepare('SELECT * FROM vendas WHERE id = ?').get(id),
  getVendaPorPayment: (payment_id) => db.prepare('SELECT * FROM vendas WHERE payment_id = ?').get(payment_id),
  atualizarVenda: (id, dados) => db.prepare(`
    UPDATE vendas SET status=@status, mikrotik_user=@mikrotik_user, inicio_sessao=@inicio_sessao
    WHERE id=@id
  `).run({ ...dados, id }),
  getVendasHoje: () => db.prepare(`
    SELECT v.*, p.nome as plano_nome FROM vendas v
    JOIN planos p ON v.plano_id = p.id
    WHERE date(v.criado_em) = date('now')
    ORDER BY v.criado_em DESC
  `).all(),
  getVendasMes: () => db.prepare(`
    SELECT v.*, p.nome as plano_nome FROM vendas v
    JOIN planos p ON v.plano_id = p.id
    WHERE strftime('%Y-%m', v.criado_em) = strftime('%Y-%m', 'now')
    ORDER BY v.criado_em DESC
  `).all(),
  getResumo: () => db.prepare(`
    SELECT
      COUNT(CASE WHEN status='pago' AND date(criado_em) = date('now') THEN 1 END) as vendas_hoje,
      SUM(CASE WHEN status='pago' AND date(criado_em) = date('now') THEN valor ELSE 0 END) as receita_hoje,
      COUNT(CASE WHEN status='pago' AND strftime('%Y-%m', criado_em) = strftime('%Y-%m', 'now') THEN 1 END) as vendas_mes,
      SUM(CASE WHEN status='pago' AND strftime('%Y-%m', criado_em) = strftime('%Y-%m', 'now') THEN valor ELSE 0 END) as receita_mes,
      COUNT(CASE WHEN status='pago' THEN 1 END) as total_vendas
    FROM vendas
  `).get(),
};
