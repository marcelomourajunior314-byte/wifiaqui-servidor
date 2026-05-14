const { RouterOSAPI } = require('node-routeros');

const config = {
  host: process.env.MIKROTIK_HOST,
  port: parseInt(process.env.MIKROTIK_PORT) || 8728,
  user: process.env.MIKROTIK_USER || 'admin',
  password: process.env.MIKROTIK_PASSWORD,
  timeout: 10,
};

async function conectar() {
  const conn = new RouterOSAPI(config);
  await conn.connect();
  return conn;
}

async function criarUsuario({ username, password, profile, macCliente }) {
  let conn;
  try {
    conn = await conectar();
    await conn.write('/ip/hotspot/user/add', [
      `=name=${username}`,
      `=password=${password}`,
      `=profile=${profile}`,
      `=comment=WiFiAqui-${Date.now()}`,
      ...(macCliente ? [`=mac-address=${macCliente}`] : []),
    ]);
    console.log(`✅ Usuário criado: ${username} | Perfil: ${profile}`);
    return { sucesso: true, username };
  } catch (err) {
    console.error('❌ Erro ao criar usuário:', err.message);
    throw err;
  } finally {
    if (conn) conn.close();
  }
}

async function loginCliente({ username, password, ipCliente }) {
  let conn;
  try {
    conn = await conectar();
    await conn.write('/ip/hotspot/active/login', [
      `=user=${username}`,
      `=password=${password}`,
      `=ip=${ipCliente}`,
    ]);
    console.log(`✅ Cliente logado: ${username} | IP: ${ipCliente}`);
    return { sucesso: true };
  } catch (err) {
    console.error('❌ Erro ao logar cliente:', err.message);
    return { sucesso: false, erro: err.message };
  } finally {
    if (conn) conn.close();
  }
}

async function removerUsuario(username) {
  let conn;
  try {
    conn = await conectar();
    const usuarios = await conn.write('/ip/hotspot/user/print', [`?name=${username}`]);
    if (usuarios.length > 0) {
      await conn.write('/ip/hotspot/user/remove', [`=.id=${usuarios[0]['.id']}`]);
      console.log(`✅ Usuário removido: ${username}`);
    }
    return { sucesso: true };
  } catch (err) {
    console.error('❌ Erro ao remover usuário:', err.message);
    throw err;
  } finally {
    if (conn) conn.close();
  }
}

async function clientesAtivos() {
  let conn;
  try {
    conn = await conectar();
    const ativos = await conn.write('/ip/hotspot/active/print');
    return ativos.map(c => ({
      usuario: c.user,
      ip: c.address,
      mac: c['mac-address'],
      uptime: c.uptime,
      sessao: c['session-time-left'],
    }));
  } catch (err) {
    console.error('❌ Erro ao listar clientes:', err.message);
    return [];
  } finally {
    if (conn) conn.close();
  }
}

async function atualizarPerfil({ nome, minutos, velocidade }) {
  let conn;
  try {
    conn = await conectar();
    const perfis = await conn.write('/ip/hotspot/user/profile/print', [`?name=${nome}`]);
    const sessionTimeout = minutos >= 60
      ? `${Math.floor(minutos/60)}h${minutos%60>0?(minutos%60)+'m':''}`
      : `${minutos}m`;
    if (perfis.length > 0) {
      await conn.write('/ip/hotspot/user/profile/set', [
        `=.id=${perfis[0]['.id']}`,
        `=session-timeout=${sessionTimeout}`,
        `=rate-limit=${velocidade || '5M/3M'}`,
      ]);
    } else {
      await conn.write('/ip/hotspot/user/profile/add', [
        `=name=${nome}`,
        `=session-timeout=${sessionTimeout}`,
        `=rate-limit=${velocidade || '5M/3M'}`,
        `=shared-users=1`,
      ]);
    }
    return { sucesso: true };
  } catch (err) {
    console.error('❌ Erro ao atualizar perfil:', err.message);
    throw err;
  } finally {
    if (conn) conn.close();
  }
}

async function testarConexao() {
  let conn;
  try {
    conn = await conectar();
    const info = await conn.write('/system/identity/print');
    return { conectado: true, nome: info[0]?.name };
  } catch (err) {
    return { conectado: false, erro: err.message };
  } finally {
    if (conn) conn.close();
  }
}

async function alterarSSID(novoNome) {
  let conn;
  try {
    conn = await conectar();
    const hotspots = await conn.write('/ip/hotspot/print');
    if (!hotspots.length) throw new Error('Nenhum hotspot encontrado');
    await conn.write('/ip/hotspot/set', [
      `=.id=${hotspots[0]['.id']}`,
      `=name=${novoNome}`,
    ]);
    try {
      const wl = await conn.write('/interface/wireless/print');
      if (wl.length) {
        await conn.write('/interface/wireless/set', [
          `=.id=${wl[0]['.id']}`,
          `=ssid=${novoNome}`,
        ]);
      }
    } catch {}
    console.log(`✅ SSID alterado para: ${novoNome}`);
    return { sucesso: true, ssid: novoNome };
  } catch (err) {
    console.error('❌ Erro ao alterar SSID:', err.message);
    throw err;
  } finally {
    if (conn) conn.close();
  }
}

async function buscarSSID() {
  let conn;
  try {
    conn = await conectar();
    const hotspots = await conn.write('/ip/hotspot/print');
    const ssid = hotspots[0]?.name || 'WiFi Aqui';
    return { sucesso: true, ssid };
  } catch (err) {
    return { sucesso: false, ssid: 'WiFi Aqui' };
  } finally {
    if (conn) conn.close();
  }
}

module.exports = {
  criarUsuario,
  loginCliente,
  removerUsuario,
  clientesAtivos,
  atualizarPerfil,
  testarConexao,
  alterarSSID,
  buscarSSID,
};
