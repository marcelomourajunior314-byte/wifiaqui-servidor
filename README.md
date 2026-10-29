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

## Cloudflare Workers (substitui a Railway) – pasta `cloudflare/`

Mesmas rotas; o portal (`public/portal-cliente.html`) é servido pelo próprio Worker.
1. Cloudflare → Workers & Pages → Create → **Import a repository** → `wifiaqui-servidor`
2. **Root directory:** `cloudflare` · Deploy command: `npx wrangler deploy`
3. Secrets: `GITHUB_TOKEN`, `TG_BOT_TOKEN`, `ADMIN_PASSWORD`, `MIKROTIK_PASSWORD`
4. Variável: `MIKROTIK_HOST` (IP público/DDNS do Mikrotik, porta 8728 liberada)
