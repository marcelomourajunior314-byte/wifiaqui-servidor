const axios = require('axios');

const INFINITEPAY_URL = 'https://api.checkout.infinitepay.io/links';

// ================================
// GERAR LINK DE PAGAMENTO
// ================================
async function gerarLinkPagamento({ vendaId, plano, valor, urlRetorno, urlWebhook }) {
  try {
    const response = await axios.post(
      INFINITEPAY_URL,
      {
        handle: process.env.INFINITEPAY_HANDLE,
        redirect_url: urlRetorno,
        webhook_url: urlWebhook,
        order_nsu: vendaId,
        items: [
          {
            quantity: 1,
            price: valor,
            description: `WiFi Aqui — ${plano.nome} (${plano.minutos} minutos)`,
          },
        ],
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.INFINITEPAY_TOKEN}`,
        },
      }
    );

    console.log(`✅ Link gerado InfinitePay: ${response.data.url}`);
    return {
      sucesso: true,
      url: response.data.url,
      paymentId: response.data.invoice_slug || vendaId,
    };
  } catch (err) {
    console.error('❌ Erro ao gerar link InfinitePay:', err.response?.data || err.message);
    throw new Error('Erro ao gerar link de pagamento');
  }
}

// ================================
// VERIFICAR WEBHOOK
// Valida assinatura do webhook da InfinitePay
// ================================
function verificarWebhook(payload, signature) {
  const crypto = require('crypto');
  const secret = process.env.WEBHOOK_SECRET;

  const hmac = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');

  return hmac === signature;
}

module.exports = {
  gerarLinkPagamento,
  verificarWebhook,
};
