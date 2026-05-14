# WiFi Aqui — Servidor

Sistema completo de venda de acesso à internet via Mikrotik + InfinitePay.

## Variáveis de ambiente (Railway)

Configure no painel do Railway em Variables:

| Variável | Valor |
|---|---|
| `MIKROTIK_HOST` | IP público do Mikrotik |
| `MIKROTIK_PORT` | 8728 |
| `MIKROTIK_USER` | admin |
| `MIKROTIK_PASSWORD` | sua senha do Mikrotik |
| `INFINITEPAY_HANDLE` | sua tag InfinitePay |
| `INFINITEPAY_TOKEN` | token da API InfinitePay |
| `WEBHOOK_SECRET` | segredo para validar webhooks |
| `ADMIN_PASSWORD` | senha do dashboard admin |
| `SERVER_URL` | URL do Railway (ex: https://wifiaqui.up.railway.app) |

## Rotas

### Portal (cliente)
- `GET /` — Página de compra
- `GET /portal/planos` — Lista planos disponíveis
- `POST /portal/iniciar-pagamento` — Inicia pagamento
- `GET /portal/status/:vendaId` — Verifica status do pagamento

### Webhook
- `POST /webhook/infinitepay` — Recebe confirmação de pagamento
- `POST /webhook/teste` — Simula pagamento (desenvolvimento)

### Admin (dashboard)
Todas as rotas precisam do header `x-admin-password`

- `GET /admin/dashboard` — Resumo geral
- `GET /admin/planos` — Lista planos
- `POST /admin/planos` — Cria plano
- `PUT /admin/planos/:id` — Atualiza plano
- `DELETE /admin/planos/:id` — Desativa plano
- `GET /admin/vendas` — Histórico
- `DELETE /admin/clientes/:username` — Derruba cliente
- `GET /admin/mikrotik/status` — Status Mikrotik
