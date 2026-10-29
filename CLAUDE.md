# WiFi Aqui
Publicado no Cloudflare Workers via Git (commit em main = deploy automático em ~1 min):
| Pasta | Worker | Endereço |
|---|---|---|
| cloudflare/ (+ public/portal-cliente.html) | wifiaqui-api (servidor + portal do cliente) | https://wifiaqui-api.marcelomourajunior314.workers.dev |
| admin/public/index.html | wifiaqui-admin (painel) | https://wifiaqui-admin.marcelomourajunior314.workers.dev |
- Segredos no painel do Cloudflare: GITHUB_TOKEN, TG_BOT_TOKEN, ADMIN_PASSWORD, MIKROTIK_PASSWORD; variável MIKROTIK_HOST (pendente: DDNS do Mikrotik após o reset).
- Mikrotik atrás da Starlink: o próprio Mikrotik chama POST /mikrotik/sync a cada 20s (segredo MIKROTIK_TOKEN); scripts em mikrotik/ (aplicar via notebook ligado à conversa). Controle adaptativo da divisão da internet em cloudflare/src/rede.js; estado ao vivo no Durable Object Rede; alerta de Mikrotik offline por cron (5 min). Acesso direto via RouterOS API TCP 8728 só se MIKROTIK_HOST existir. Gist 5b034134c5c02b347c68824569e8ccc2 (planos.json, vendas.json).
- Nunca colocar tokens no código (repo público).
- Antes de todo commit: `node testes/rodar.mjs` (testes simulados; o hook .githooks/pre-commit bloqueia se falhar — ativar com `git config core.hooksPath .githooks`).
- Commits: user.name "Marcelo", email marcelomourajunior314@gmail.com; responder em português do Brasil.
