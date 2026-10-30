# Estado em 30/10/2026
## Funciona (testado)
- Mikrotik: rede base, hotspot, sincronização a cada 20s, NTP, portal abre sozinho ao conectar, acesso de teste de 3 min (corta no minuto exato).
- Checkout da InfinitePay carrega COM o acesso de teste; sem internet ele não roda dentro da janela do Wi-Fi do iPhone.
- Portal reescrito (public/portal-cliente.html): planos, dados, pagar por toque, confirmação em silêncio, "Continuar meu pagamento", "Meus acessos", botão "Abrir no navegador" (Android: Chrome; iPhone: x-safari, sem garantia).
## Não resolvido
- iPhone não permite forçar a abertura do Safari a partir da janela do Wi-Fi. Código SMS da InfinitePay obriga sair da janela.
- Pagamento de teste ainda não confirmado de ponta a ponta (venda paga -> acesso criado -> tempo certo). Segunda via de confirmação (retorno do checkout) já no servidor.
## Decisão pendente
- Pix próprio no portal (Mercado Pago agora / Sicredi API Pix depois) elimina o checkout externo e o código SMS.
