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
    # teste rápido e leve: 20 MB da Cloudflare, mede o pico de velocidade na WAN a cada meio segundo
    :execute script=":do { /tool fetch url=\"https://speed.cloudflare.com/__down?bytes=20000000\" output=none } on-error={}"
    :local maxbps 0
    :for i from=1 to=5 do={
      :delay 500ms
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
