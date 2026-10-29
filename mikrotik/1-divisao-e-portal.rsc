# WiFi Aqui — Mikrotik: divisão justa da internet + portal no Cloudflare
# Aplicar UMA vez (Claude aplica pelo notebook ligado à conversa).
# Antes: trocar REDE_CLIENTES se a rede dos clientes não for 192.168.0.0/24.
:local redeClientes "192.168.0.0/24"
:local servidor "wifiaqui-api.marcelomourajunior314.workers.dev"

# 1) Filas PCQ: divide igualmente entre quem está usando; o teto por pessoa é ajustado pelo servidor a cada 20s
/queue type
:if ([:len [find name="wa-down"]] = 0) do={ add name=wa-down kind=pcq pcq-classifier=dst-address pcq-rate=0 }
:if ([:len [find name="wa-up"]] = 0) do={ add name=wa-up kind=pcq pcq-classifier=src-address pcq-rate=0 }
/queue simple
:if ([:len [find name="wifiaqui-justo"]] = 0) do={ add name=wifiaqui-justo target=$redeClientes queue=wa-up/wa-down max-limit=0/0 comment="WiFi Aqui - divisao justa" }

# 2) FastTrack desliga as filas: desativar
/ip firewall filter disable [find action=fasttrack-connection]

# 3) Liberar (sem pagar) o portal e o pagamento
/ip hotspot walled-garden
:foreach h in={$servidor; "*.infinitepay.io"; "checkout.infinitepay.io"; "*.infinitepay.com.br"; "captive.apple.com"; "connectivitycheck.gstatic.com"; "*.cloudflare.com"} do={
  :if ([:len [find dst-host=$h]] = 0) do={ add dst-host=$h action=allow comment="WiFi Aqui" }
}
/ip hotspot walled-garden ip
:if ([:len [find comment="WiFi Aqui - DNS"]] = 0) do={ add dst-port=53 protocol=udp action=accept comment="WiFi Aqui - DNS" }

# 4) Página de login do hotspot → portal no Cloudflare (envia MAC e IP do cliente)
/tool fetch url=("https://" . $servidor . "/portal/mikrotik-login") dst-path=flash/hotspot/login.html mode=https check-certificate=no

:log info "WiFi Aqui: divisao justa e portal configurados"
