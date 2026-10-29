# WiFi Aqui

Venda de acesso Wi-Fi em eventos (Mikrotik + InfinitePay). Tudo roda no **Cloudflare** (gratuito) e é publicado automaticamente a cada commit na branch `main`.

| Pasta | O que é | Worker |
|---|---|---|
| `cloudflare/` + `public/portal-cliente.html` | Servidor + portal de compra do cliente | `wifiaqui-api` |
| `admin/public/` | Painel admin | `wifiaqui-admin` |

- Dados: GitHub Gist `5b034134c5c02b347c68824569e8ccc2` (`planos.json`, `vendas.json`)
- Segredos no painel do Cloudflare: `GITHUB_TOKEN`, `TG_BOT_TOKEN`, `ADMIN_PASSWORD`, `MIKROTIK_PASSWORD`
- Variável `MIKROTIK_HOST`: IP público/DDNS do Mikrotik (API na porta 8728)

## Rotas
- Portal: `GET /`, `GET /portal/planos`, `POST /portal/iniciar-pagamento`, `GET /portal/status/:id`, `GET /portal/mikrotik-login`
- Webhook: `POST /webhook/infinitepay`
- Admin (header `x-admin-password`): `/admin/dashboard`, `/admin/planos`, `/admin/vendas`, `/admin/mikrotik/status`, `DELETE /admin/clientes/:usuario`
- `GET /health`
