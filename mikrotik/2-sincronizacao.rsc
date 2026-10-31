# WiFi Aqui — Mikrotik: sincronização a cada 20s com o servidor (funciona atrás da Starlink/4G)
# Envia: pessoas conectadas, consumo e uso de cada cliente. Recebe: limite por pessoa, quem liberar e quem derrubar.
# Antes de importar, baixar wifiaqui-sync-a.rsc e wifiaqui-sync-b.rsc e definir o token só na memória do Mikrotik:
#   :global waToken "VALOR_DO_MIKROTIK_TOKEN"     (segredo do Cloudflare; nunca salvar no GitHub)
:global waToken
:if ([:len $waToken] < 10) do={
  # reinstalação: recupera o token do script que já está no Mikrotik
  :do {
    :local velho [/system script get [find name="wifiaqui-sync"] source]
    :local i [:find $velho "token="]
    :local j [:find $velho "\"" $i]
    :set waToken [:pick $velho ($i + 6) $j]
  } on-error={}
}
:if ([:len $waToken] < 10) do={ :error "defina antes: :global waToken com o valor do MIKROTIK_TOKEN" }
:local wan "ether1"
# o RouterOS 6 lê no máximo ~4 KB por arquivo, por isso o corpo do script vem em duas partes
:local a [/file get wifiaqui-sync-a.rsc contents]
:local b [/file get wifiaqui-sync-b.rsc contents]

/system script
:if ([:len [find name="wifiaqui-sync"]] > 0) do={ remove [find name="wifiaqui-sync"] }
add name=wifiaqui-sync policy=ftp,read,write,policy,test source=(":local url \"https://wifiaqui-api.marcelomourajunior314.workers.dev/mikrotik/sync?token=" . $waToken . "\"\r\n:local wan \"" . $wan . "\"\r\n" . $a . "\r\n" . $b)

/system scheduler
:if ([:len [find name="wifiaqui-sync"]] > 0) do={ remove [find name="wifiaqui-sync"] }
add name=wifiaqui-sync interval=5s on-event="/system script run wifiaqui-sync" policy=ftp,read,write,policy,test comment="WiFi Aqui"
:set waToken ""
:log info "WiFi Aqui: sincronizacao agendada a cada 20s"
