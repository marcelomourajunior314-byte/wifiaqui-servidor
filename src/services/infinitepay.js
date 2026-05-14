const fetch = require('node-fetch');

const HANDLE = process.env.INFINITEPAY_HANDLE || 'aurumwood';
const RAILWAY_URL = process.env.SERVER_URL || 'https://wifiaqui-servidor-production.up.railway.app';
const PORTAL_URL = process.env.PORTAL_URL || 'https://wifiaqui-servidor-production.up.railway.app';

async function gerarLinkPagamento({ vendaId, plano, valor, ipCliente, macCliente }) {
  const cents = Math.round(valor);
  const payload = {
    handle: HANDLE,
    redirect_url: `${PORTAL_URL}/portal/sucesso?venda=${vendaId}`,
    webhook_url: `${RAILWAY_URL}/webhook/infinitepay`,
    order_nsu: vendaId,
    items: [{
      quantity: 1,
      price: cents,
      description: `WiFi Aqui | Plano: ${plano.nome} (${plano.minutos}min) | IP: ${ipCliente || ''} | MAC: ${macCliente || ''}`
    }]
  };

  const r = await fetch('https://api.checkout.infinitepay.io/links', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await r.json();
  if (!r.ok || !data.url) {
    console.error('❌ InfinitePay erro:', data);
    throw new Error('Erro ao gerar link de pagamento');
  }

  console.log(`✅ Link gerado: ${data.url}`);
  return { sucesso: true, url: data.url, paymentId: vendaId };
}

module.exports = { gerarLinkPagamento };
