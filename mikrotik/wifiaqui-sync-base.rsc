# Corpo do script "wifiaqui-sync" (as variáveis url e wan são colocadas antes pelo 2-sincronizacao.rsc)
:global waOk
:if ([:typeof $waOk] != "str") do={ :set waOk "" }
:local n [/ip hotspot active print count-only]
:local rx 0
:local tx 0
/interface monitor-traffic $wan once do={ :set rx $"rx-bits-per-second"; :set tx $"tx-bits-per-second" }
:local users ""
:foreach a in=[/ip hotspot active find] do={
  :set users ($users . [/ip hotspot active get $a user] . "," . [/ip hotspot active get $a address] . "," . [/ip hotspot active get $a mac-address] . "," . [/ip hotspot active get $a bytes-in] . "," . [/ip hotspot active get $a bytes-out] . ";")
}
:local body ("n=" . $n . "&rx=" . $rx . "&tx=" . $tx . "&ok=" . $waOk . "&users=" . $users)
:local resp ""
:do {
  :set resp ([/tool fetch url=$url http-method=post http-data=$body http-header-field="Content-Type: application/x-www-form-urlencoded" output=user as-value]->"data")
} on-error={ :log warning "wifiaqui: servidor inacessivel"; :error "sem servidor" }
:if ([:pick $resp 0 2] != "OK") do={ :log warning ("wifiaqui: resposta inesperada " . [:pick $resp 0 40]); :error "resposta" }
:set waOk ""
:local pos 0
:local tam [:len $resp]
:while ($pos < $tam) do={
  :local fim [:find $resp "\n" $pos]
  :if ([:typeof $fim] = "nil") do={ :set fim $tam }
  :local linha [:pick $resp $pos $fim]
  :set pos ($fim + 1)
  # separa as palavras da linha
  :local p {}
  :local ini 0
  :local esp [:find $linha " " 0]
  :while ([:typeof $esp] != "nil") do={ :set p ($p, [:pick $linha $ini $esp]); :set ini ($esp + 1); :set esp [:find $linha " " $ini] }
  :set p ($p, [:pick $linha $ini [:len $linha]])
  :local cmd [:pick $p 0]
  :if ($cmd = "RATE") do={
    /queue type set [find name="wa-down"] pcq-rate=[:tonum [:pick $p 1]]
    /queue type set [find name="wa-up"] pcq-rate=[:tonum [:pick $p 2]]
  }
  :if ($cmd = "ADD") do={
    :local id [:pick $p 1]; :local u [:pick $p 2]; :local pw [:pick $p 3]; :local min [:pick $p 4]; :local ip [:pick $p 5]; :local mac [:pick $p 6]
    :if ([:len [/ip hotspot user find name=$u]] = 0) do={ /ip hotspot user add name=$u password=$pw profile=default limit-uptime=($min . "m") comment="WiFi Aqui" }
    :if ($mac != "-") do={ /ip hotspot user set [find name=$u] mac-address=$mac }
    :if ($ip != "-") do={
      :do {
        :if ($mac != "-") do={ /ip hotspot active login user=$u password=$pw ip=$ip mac-address=$mac } else={ /ip hotspot active login user=$u password=$pw ip=$ip }
      } on-error={ :log warning ("wifiaqui: login automatico falhou para " . $u) }
    }
    :set waOk ($waOk . $id . ",")
    :log info ("wifiaqui: liberado " . $u . " por " . $min . " min")
  }
  :if ($cmd = "DEL") do={
    :local u [:pick $p 1]
    /ip hotspot active remove [find user=$u]
    /ip hotspot user remove [find name=$u]
    :log info ("wifiaqui: derrubado " . $u)
  }
}
