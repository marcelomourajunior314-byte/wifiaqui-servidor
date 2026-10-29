# Corpo do script "wifiaqui-sync" (as variáveis url e wan são colocadas antes pelo 2-sincronizacao.rsc)
:global waOk
:global waSt
:if ([:typeof $waOk] != "str") do={ :set waOk "" }
:if ([:typeof $waSt] != "num") do={ :set waSt 0 }
:local n [/ip hotspot active print count-only]
:local rx 0
:local tx 0
/interface monitor-traffic $wan once do={ :set rx $"rx-bits-per-second"; :set tx $"tx-bits-per-second" }
:local users ""
# saúde da conexão: 3 pings rápidos (quase nenhum dado)
:local pr 0
:local lat 0
:do { :set pr [/ping 1.1.1.1 count=3 interval=200ms] } on-error={}
:do { :set lat [:tonum [:pick [:tostr ([/ping 1.1.1.1 count=1 as-value]->"time")] 9 12]] } on-error={}
:foreach a in=[/ip hotspot active find] do={
  :set users ($users . [/ip hotspot active get $a user] . "," . [/ip hotspot active get $a address] . "," . [/ip hotspot active get $a mac-address] . "," . [/ip hotspot active get $a bytes-in] . "," . [/ip hotspot active get $a bytes-out] . ";")
}
:local body ("n=" . $n . "&rx=" . $rx . "&tx=" . $tx . "&up=" . [/system resource get uptime] . "&st=" . $waSt . "&pr=" . $pr . "&lat=" . $lat . "&ok=" . $waOk . "&users=" . $users)
:local resp ""
:do {
  :set resp ([/tool fetch url=$url http-method=post http-data=$body http-header-field="Content-Type: application/x-www-form-urlencoded" output=user as-value]->"data")
} on-error={ :log warning "wifiaqui: servidor inacessivel"; :error "sem servidor" }
:if ([:pick $resp 0 2] != "OK") do={ :log warning ("wifiaqui: resposta inesperada " . [:pick $resp 0 40]); :error "resposta" }
:set waOk ""
:set waSt 0
