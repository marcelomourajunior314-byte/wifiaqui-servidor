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
:foreach a in=[/ip hotspot active find] do={
  :set users ($users . [/ip hotspot active get $a user] . "," . [/ip hotspot active get $a address] . "," . [/ip hotspot active get $a mac-address] . "," . [/ip hotspot active get $a bytes-in] . "," . [/ip hotspot active get $a bytes-out] . ";")
}
:local body ("n=" . $n . "&rx=" . $rx . "&tx=" . $tx . "&up=" . [/system resource get uptime] . "&st=" . $waSt . "&ok=" . $waOk . "&users=" . $users)
:local resp ""
:do {
  :set resp ([/tool fetch url=$url http-method=post http-data=$body http-header-field="Content-Type: application/x-www-form-urlencoded" output=user as-value]->"data")
} on-error={ :log warning "wifiaqui: servidor inacessivel"; :error "sem servidor" }
:if ([:pick $resp 0 2] != "OK") do={ :log warning ("wifiaqui: resposta inesperada " . [:pick $resp 0 40]); :error "resposta" }
:set waOk ""
:set waSt 0
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
    # ADD <id> <usuario> <senha|-> <segundos> <ip|-> <mac|->  — cria o acesso ou devolve o tempo que faltava
    :local id [:pick $p 1]; :local u [:pick $p 2]; :local pw [:pick $p 3]; :local seg [:pick $p 4]; :local ip [:pick $p 5]; :local mac [:pick $p 6]
    :if ($pw = "-") do={ :set pw "" }
    :local dur [:totime ($seg . "s")]
    :local uid [/ip hotspot user find name=$u]
    :if ([:len $uid] = 0) do={
      /ip hotspot user add name=$u password=$pw profile=default limit-uptime=$dur comment="WiFi Aqui"
    } else={
      /ip hotspot user set $uid limit-uptime=([/ip hotspot user get $uid uptime] + $dur)
    }
    :if ($mac != "-") do={
      /ip hotspot user set [find name=$u] mac-address=$mac
      # IP atual do aparelho (pode ter mudado depois de queda de energia)
      :local lease [/ip dhcp-server lease find mac-address=$mac]
      :if ([:len $lease] > 0) do={ :set ip [/ip dhcp-server lease get [:pick $lease 0] address] }
    }
    :if ($ip != "-" && [:len [/ip hotspot active find user=$u]] = 0) do={
      :do {
        :if ($mac != "-") do={ /ip hotspot active login user=$u password=$pw ip=$ip mac-address=$mac } else={ /ip hotspot active login user=$u password=$pw ip=$ip }
      } on-error={ :log info ("wifiaqui: " . $u . " entra sozinho quando o aparelho reconectar") }
    }
    :if ($id != "-") do={ :set waOk ($waOk . $id . ",") }
    :log info ("wifiaqui: acesso " . $u . " com " . $seg . "s")
  }
  :if ($cmd = "SPEED") do={
    # mede a Starlink: baixa um arquivo da Cloudflare e observa a velocidade máxima na WAN
    :execute script=":do { /tool fetch url=\"https://speed.cloudflare.com/__down?bytes=50000000\" output=none } on-error={}"
    :local maxbps 0
    :for i from=1 to=4 do={
      :delay 1s
      /interface monitor-traffic $wan once do={ :if ($"rx-bits-per-second" > $maxbps) do={ :set maxbps $"rx-bits-per-second" } }
    }
    :set waSt $maxbps
    :log info ("wifiaqui: velocidade medida " . ($maxbps / 1000000) . " Mbps")
  }
  :if ($cmd = "DEL") do={
    :local u [:pick $p 1]
    /ip hotspot active remove [find user=$u]
    /ip hotspot user remove [find name=$u]
    :log info ("wifiaqui: derrubado " . $u)
  }
}
