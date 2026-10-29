# Scripts do Mikrotik — WiFi Aqui

Aplicados pelo Claude através do notebook ligado à conversa (SSH no Mikrotik). Ordem:

1. Rede dos clientes pronta (ether3 192.168.0.1/24, DHCP e hotspot — AX53 em 192.168.0.2, gateway 192.168.0.1).
2. `1-divisao-e-portal.rsc` — filas PCQ (divisão justa), FastTrack desligado, walled garden e login.html do portal.
3. Criar o script `wifiaqui-sync-base` com o conteúdo de `wifiaqui-sync-base.rsc`.
4. `2-sincronizacao.rsc` com o token real (segredo `MIKROTIK_TOKEN` do Cloudflare) — cria o script `wifiaqui-sync` e o agendador de 20s.

Como funciona: a cada 20s o Mikrotik chama `POST /mikrotik/sync` e recebe:
- `RATE <down> <up> <modo> <faixa>` → teto por pessoa nas filas PCQ (0 = sem limite)
- `ADD <id> <usuario> <senha> <minutos> <ip> <mac>` → libera quem pagou (confirma com `ok=<id>` na próxima chamada)
- `DEL <usuario>` → derruba o cliente pedido no admin

O token **nunca** vai para o GitHub (repositório público).
