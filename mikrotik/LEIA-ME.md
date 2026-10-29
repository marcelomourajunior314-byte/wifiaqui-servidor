# Scripts do Mikrotik — WiFi Aqui

Aplicados pelo Claude através do notebook ligado à conversa (SSH no Mikrotik). Ordem:

1. `0-rede-base.rsc` — rede do zero: ether1 internet (DHCP), ether2 gerência (192.168.10.1), ether3 clientes 192.168.50.1/24 com DHCP e hotspot. O AX53 fica em 192.168.50.2, gateway 192.168.50.1. Não usar 192.168.0.x, que é a faixa dos modems e conflita com a ether1.
2. `1-divisao-e-portal.rsc` — filas PCQ (divisão justa), FastTrack desligado, walled garden e login.html do portal.
3. Criar o script `wifiaqui-sync-base` com o conteúdo de `wifiaqui-sync-base.rsc`.
4. `2-sincronizacao.rsc` com o token real (segredo `MIKROTIK_TOKEN` do Cloudflare) — cria o script `wifiaqui-sync` e o agendador de 20s.

Como funciona: a cada 20s o Mikrotik chama `POST /mikrotik/sync` e recebe:
- `RATE <down> <up> <modo> <faixa>` → teto por pessoa nas filas PCQ (0 = sem limite)
- `ADD <id> <usuario> <senha|-> <segundos> <ip|-> <mac|->` → libera quem pagou, ou devolve o tempo que faltava depois de queda (confirma com `ok=<id>`)
- `SPEED` → teste rápido de velocidade (20 MB, só com a rede folgada) → `st=` na próxima chamada
- Toda chamada leva `pr=` (pings respondidos de 3) e `lat=` (ms) — saúde da conexão o tempo todo
- `DEL <usuario>` → derruba o cliente pedido no admin

O token **nunca** vai para o GitHub (repositório público).

## Quedas de energia / internet
- O usuário do hotspot é o **MAC** do aparelho e o hotspot aceita login por MAC: ao religar, o celular entra sozinho.
- O servidor conta o tempo usado só enquanto o Mikrotik está sincronizando. Se o Mikrotik religar (uptime volta a zero)
  ou ficar mais de 60 s sem sincronizar, o servidor manda `ADD` de novo para cada acesso com o **tempo que faltava**
  (o Mikrotik ajusta `limit-uptime = uptime + restante`).
- Quando o tempo acaba, o servidor manda `DEL`.
