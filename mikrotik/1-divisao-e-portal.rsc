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
:foreach h in={$servidor; "*.infinitepay.io"; "checkout.infinitepay.io"; "*.infinitepay.com.br"; "*.cloudflare.com"; "speed.cloudflare.com"; "*.google.com"; "*.googletagmanager.com"; "*.gstatic.com"; "*.amplitude.com"; "*.cloudflare.net"; "*.rudderlabs.com"; "*.cloudfront.net"; "*.clarity.ms"; "*.msn.com"; "*.online-metrix.net"; "*.rudderstack.com"; "*.trafficmanager.net"; "*.googleapis.com"; "*.googleusercontent.com"; "*.recaptcha.net"; "dns.google"} do={
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

# 6) Checkout da InfinitePay liberado SEM internet (o aparelho continua "preso" ao portal e a janela do Wi-Fi não fecha)
:foreach h in={"checkout.infinitepay.io";"assets.infinitepay.io";"infinitepay-api-v2.services.production.infinitepay.io";"infinitepay-invoice-api.services.production.infinitepay.io";"api.lab.amplitude.com";"cdn.rudderlabs.com";"api.rudderstack.com";"www.clarity.ms";"scripts.clarity.ms";"e.clarity.ms";"c.clarity.ms";"c.msn.com";"www.googletagmanager.com";"h.online-metrix.net";"play.google.com";"pay.google.com";"www.google.com";"www.gstatic.com";"fonts.gstatic.com";"fonts.googleapis.com";"challenges.cloudflare.com";"speed.cloudflare.com"} do={
  :if ([:len [/ip firewall address-list find where list=wa-checkout address=$h]] = 0) do={ /ip firewall address-list add list=wa-checkout address=$h comment="WiFi Aqui checkout" }
}
:if ([:len [/ip firewall filter find where comment="WiFi Aqui checkout"]] = 0) do={ /ip firewall filter add chain=forward src-address=192.168.50.0/24 dst-address-list=wa-checkout action=accept place-before=0 comment="WiFi Aqui checkout" }
:if ([:len [/ip firewall nat find where comment="WiFi Aqui checkout"]] = 0) do={ /ip firewall nat add chain=dstnat src-address=192.168.50.0/24 dst-address-list=wa-checkout action=accept place-before=0 comment="WiFi Aqui checkout" }
