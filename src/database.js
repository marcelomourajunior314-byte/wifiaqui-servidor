const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data');
const PLANOS_FILE = path.join(DB_PATH, 'planos.json');
const VENDAS_FILE = path.join(DB_PATH, 'vendas.json');

if (!fs.existsSync(DB_PATH)) fs.mkdirSync(DB_PATH, { recursive: true });

if (!fs.existsSync(PLANOS_FILE)) {
  fs.writeFileSync(PLANOS_FILE, JSON.stringify([
    { id: 'plano-10min',  nome: 'Flash',    descricao: '10 minutos de acesso', minutos: 10,  preco: 200,  ativo: true },
    { id: 'plano-30min',  nome: 'Expresso', descricao: '30 minutos de acesso', minutos: 30,  preco: 500,  ativo: true },
    { id: 'plano-60min',  nome: 'Turbo',    descricao: '1 hora de acesso',     minutos: 60,  preco: 800,  ativo: true },
    { id: 'plano-120min', nome: 'Power',    descricao: '2 horas de acesso',    minutos: 120, preco: 1200, ativo: true },
  ], null, 2));
}

if (!fs.existsSync(VENDAS_FILE)) {
  fs.writeFileSync(VENDAS_FILE, JSON.stringify([], null, 2));
}

function lerPlanos() { return JSON.parse(fs.readFileSync(PLANOS_FILE, 'utf8')); }
function salvarPlanos(p) { fs.writeFileSync(PLANOS_FILE, JSON.stringify(p, null, 2)); }
function lerVendas() { return JSON.parse(fs.readFileSync(VENDAS_FILE, 'utf8')); }
function salvarVendas(v) { fs.writeFileSync(VENDAS_FILE, JSON.stringify(v, null, 2)); }
function agora() { return new Date().toISOString(); }
function hoje() { return new Date().toISOString().split('T')[0]; }
function mesAtual() { return new Date().toISOString().substring(0, 7); }

function getPlanos() { return lerPlanos().filter(p => p.ativo); }
function getPlano(id) { return lerPlanos().find(p => p.id === id) || null; }
function criarPlano(plano) { const p = lerPlanos(); p.push({...plano, ativo: true, criado_em: agora()}); salvarPlanos(p); }
function atualizarPlano(id, dados) { const p = lerPlanos(); const i = p.findIndex(x => x.id === id); if(i!==-1){p[i]={...p[i],...dados}; salvarPlanos(p);} }
function deletarPlano(id) { atualizarPlano(id, {ativo: false}); }

function criarVenda(venda) { const v = lerVendas(); v.push({...venda, criado_em: agora()}); salvarVendas(v); }
function getVenda(id) { return lerVendas().find(v => v.id === id) || null; }
function getVendaPorPayment(pid) { return lerVendas().find(v => v.payment_id === pid) || null; }
function atualizarVenda(id, dados) { const v = lerVendas(); const i = v.findIndex(x => x.id === id); if(i!==-1){v[i]={...v[i],...dados}; salvarVendas(v);} }

function getVendasHoje() {
  const planos = lerPlanos();
  return lerVendas().filter(v => v.criado_em?.startsWith(hoje()))
    .map(v => ({...v, plano_nome: planos.find(p => p.id === v.plano_id)?.nome || v.plano_id}))
    .sort((a,b) => b.criado_em.localeCompare(a.criado_em));
}
function getVendasMes() {
  const planos = lerPlanos();
  return lerVendas().filter(v => v.criado_em?.startsWith(mesAtual()))
    .map(v => ({...v, plano_nome: planos.find(p => p.id === v.plano_id)?.nome || v.plano_id}))
    .sort((a,b) => b.criado_em.localeCompare(a.criado_em));
}
function getResumo() {
  const pagas = lerVendas().filter(v => v.status === 'pago');
  return {
    vendas_hoje:  pagas.filter(v => v.criado_em?.startsWith(hoje())).length,
    receita_hoje: pagas.filter(v => v.criado_em?.startsWith(hoje())).reduce((s,v) => s+(v.valor||0), 0),
    vendas_mes:   pagas.filter(v => v.criado_em?.startsWith(mesAtual())).length,
    receita_mes:  pagas.filter(v => v.criado_em?.startsWith(mesAtual())).reduce((s,v) => s+(v.valor||0), 0),
    total_vendas: pagas.length,
  };
}

module.exports = { getPlanos, getPlano, criarPlano, atualizarPlano, deletarPlano, criarVenda, getVenda, getVendaPorPayment, atualizarVenda, getVendasHoje, getVendasMes, getResumo };
