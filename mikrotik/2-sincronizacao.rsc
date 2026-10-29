# WiFi Aqui — Mikrotik: sincronização a cada 20s com o servidor (funciona atrás da Starlink/4G)
# Envia: pessoas conectadas, consumo e uso de cada cliente. Recebe: limite por pessoa, quem liberar e quem derrubar.
# Substituir COLE_O_TOKEN pelo valor do segredo MIKROTIK_TOKEN do Cloudflare (nunca salvar no GitHub).
:local token "COLE_O_TOKEN"
:local wan "ether1"

/system script
:if ([:len [find name="wifiaqui-sync"]] > 0) do={ remove [find name="wifiaqui-sync"] }
add name=wifiaqui-sync policy=ftp,read,write,policy,test source=(":local url \"https://wifiaqui-api.marcelomourajunior314.workers.dev/mikrotik/sync?token=" . $token . "\"\r\n:local wan \"" . $wan . "\"\r\n" . [/system script get [find name="wifiaqui-sync-base"] source])

/system scheduler
:if ([:len [find name="wifiaqui-sync"]] > 0) do={ remove [find name="wifiaqui-sync"] }
add name=wifiaqui-sync interval=20s on-event="/system script run wifiaqui-sync" policy=ftp,read,write,policy,test comment="WiFi Aqui"
:log info "WiFi Aqui: sincronizacao agendada a cada 20s"
