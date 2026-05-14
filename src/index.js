require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ================================
// MIDDLEWARES
// ================================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Arquivos estáticos (portal HTML)
app.use(express.static(path.join(__dirname, '../public')));

// ================================
// ROTAS
// ================================
const portalRoutes = require('./routes/portal');
const webhookRoutes = require('./routes/webhook');
const adminRoutes = require('./routes/admin');

app.use('/portal', portalRoutes);
app.use('/webhook', webhookRoutes);
app.use('/admin', adminRoutes);

// ================================
// ROTA RAIZ — redireciona para portal
// ================================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/portal-cliente.html'));
});

// ================================
// HEALTH CHECK
// ================================
app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    servico: 'WiFi Aqui',
    versao: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// ================================
// INICIAR SERVIDOR
// ================================
app.listen(PORT, () => {
  console.log('');
  console.log('🚀 ================================');
  console.log('📡 WiFi Aqui — Servidor iniciado');
  console.log(`🌐 Porta: ${PORT}`);
  console.log(`🔧 Mikrotik: ${process.env.MIKROTIK_HOST || 'não configurado'}`);
  console.log(`💳 InfinitePay: ${process.env.INFINITEPAY_HANDLE || 'não configurado'}`);
  console.log('✅ ================================');
  console.log('');
});

module.exports = app;
