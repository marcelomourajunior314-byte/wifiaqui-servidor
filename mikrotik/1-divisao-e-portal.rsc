# WiFi Aqui — Mikrotik: divisão justa da internet + portal no Cloudflare
# Aplicar UMA vez (Claude aplica pelo notebook ligado à conversa).
# Antes: trocar REDE_CLIENTES se a rede dos clientes não for 192.168.50.0/24.
:local redeClientes "192.168.50.0/24"
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
:foreach h in={$servidor; "*.infinitepay.io"; "checkout.infinitepay.io"; "*.infinitepay.com.br"; "*.cloudflare.com"; "speed.cloudflare.com"; "*.amplitude.com"; "*.cloudflare.net"; "*.rudderlabs.com"; "*.cloudfront.net"; "*.clarity.ms"; "*.msn.com"; "*.online-metrix.net"; "*.rudderstack.com"; "*.trafficmanager.net"; "*.recaptcha.net"} do={
  :if ([:len [find dst-host=$h]] = 0) do={ add dst-host=$h action=allow comment="WiFi Aqui" }
}
/ip hotspot walled-garden ip
:if ([:len [find comment="WiFi Aqui - DNS"]] = 0) do={ add dst-port=53 protocol=udp action=accept comment="WiFi Aqui - DNS" }

# 4) Reconexão automática pelo MAC: quem pagou volta a navegar sozinho depois de queda de energia/internet
/ip hotspot profile set [find] login-by=mac,cookie,http-chap,http-pap mac-auth-mode=mac-as-username
# Acesso de teste só para concluir o pagamento (o HTTPS do checkout não passa só pelo walled garden): 3 min de internet; depois só volta a ter teste após 20 min
/ip hotspot profile set [find] trial-uptime-limit=3m trial-uptime-reset=20m trial-user-profile=trial-wa

# 5) Página de login do hotspot → portal no Cloudflare (envia MAC e IP do cliente)
/tool fetch url=("https://" . $servidor . "/portal/mikrotik-login") dst-path=flash/hotspot/login.html mode=https check-certificate=no
# 5b) Quem já tem internet (teste de pagamento ou plano) digita http://wifi.aqui e volta ao portal
/tool fetch url=("https://" . $servidor . "/portal/mikrotik-status") dst-path=flash/hotspot/status.html mode=https check-certificate=no
/ip hotspot profile set [find] dns-name=wifi.aqui

:log info "WiFi Aqui: divisao justa e portal configurados"

# 5) Quem está no acesso de teste (pagando) e abrir qualquer site http volta ao portal (retoma o pagamento pelo MAC)
:if ([:len [/ip hotspot user profile find name=trial-wa]] = 0) do={ /ip hotspot user profile add name=trial-wa address-list=trial-wa }
:if ([:len [/ip firewall nat find comment="WiFi Aqui trial volta ao portal"]] = 0) do={ /ip firewall nat add chain=dstnat action=redirect to-ports=64874 protocol=tcp dst-port=80 src-address-list=trial-wa place-before=0 comment="WiFi Aqui trial volta ao portal" }

# 6) Limpeza: removidas as regras "wa-checkout" e o script wa-dns-lista (quebravam a detecção de portal no Android).
#    Nunca liberar google.com/gstatic.com (connectivitycheck, captive.apple.com) no walled garden.
/system scheduler remove [find name=wa-dns-lista]
/system script remove [find name=wa-dns-lista]
/ip firewall nat remove [find comment~"WiFi Aqui checkout"]
/ip firewall filter remove [find comment~"WiFi Aqui checkout"]
/ip firewall address-list remove [find list=wa-checkout]
/ip hotspot walled-garden remove [find dst-host~"google|gstatic"]
