# WiFi Aqui — Mikrotik: rede base do zero (rodar logo depois do reset, antes do 1-divisao-e-portal.rsc)
# ether1 = internet (modem/Starlink, DHCP) | ether2 = gerência (notebook 192.168.10.200) | ether3 = clientes (AX53) com hotspot
# A rede dos clientes é 192.168.50.0/24 (não usar 192.168.0.x, que é a faixa dos modems).
:log info "WiFi Aqui: aplicando rede base"

# limpa o que veio de fábrica (bridge com todas as portas)
/ip dhcp-client remove [find]
/ip address remove [find]
/interface bridge port remove [find]
/interface bridge remove [find]

# internet
/ip dhcp-client add interface=ether1 disabled=no use-peer-dns=no add-default-route=yes
/ip dns set allow-remote-requests=yes servers=8.8.8.8,1.1.1.1
/ip firewall nat remove [find]
/ip firewall nat add chain=srcnat out-interface=ether1 action=masquerade comment="WiFi Aqui internet"

# gerência pela ether2
/ip address add address=192.168.10.1/24 interface=ether2 comment="Gerencia"

# rede dos clientes na ether3
/ip address add address=192.168.50.1/24 interface=ether3 comment="WiFi Aqui clientes"
/ip pool remove [find name=pool-clientes]
/ip pool add name=pool-clientes ranges=192.168.50.10-192.168.50.250
/ip dhcp-server network remove [find]
/ip dhcp-server remove [find]
/ip dhcp-server network add address=192.168.50.0/24 gateway=192.168.50.1 dns-server=192.168.50.1
/ip dhcp-server add name=dhcp-clientes interface=ether3 address-pool=pool-clientes lease-time=1h disabled=no

# hotspot (portal cativo) na ether3
/ip hotspot remove [find]
/ip hotspot profile set [find name=default] hotspot-address=192.168.50.1
/ip hotspot add name=hotspot1 interface=ether3 address-pool=pool-clientes profile=default disabled=no
:log info "WiFi Aqui: rede base pronta"

# relógio certo (o hEX perde a hora sem energia): NTP + fuso de São Paulo
/system ntp client set enabled=yes server-dns-names=time.google.com,pool.ntp.org
/system clock set time-zone-name=America/Sao_Paulo
