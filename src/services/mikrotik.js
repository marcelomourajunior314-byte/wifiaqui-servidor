const { RouterOSAPI } = require('node-routeros');

const config = {
  host: process.env.MIKROTIK_HOST,
  port: parseInt(process.env.MIKROTIK_PORT) || 8728,
  user: process.env.MIKROTIK_USER || 'admin',
  password: process.env.MIKROTIK_PASSWORD,
  timeout: 10,
};

// ================================
// CONECTAR NO MIKROTIK
// ================================
async function conectar() {
  const conn = new RouterOSAPI(config);
  await conn.connect();
  return conn;
}

// ================================
// CRIAR USUÁRIO HOTSPOT
// Chamado após pagamento confirmado
// ================================
async function criarUsuario({ username, password, profile, macCliente }) {
  let conn;
  try {
    conn = await conectar();

    // Criar usuário com o plano escolhido
    await conn.write('/ip/hotspot/user/add', [
      `=name=${username}`,
      `=password=${password}`,
      `=profile=${profile}`,
      `=comment=WiFiAqui-${Date.now()}`,
      ...(macCliente ? [`=mac-address=${macCliente}`] : []),
    ]);

    console.log(`✅ Usuário criado no Mikrotik: ${username} | Perfil: ${profile}`);
    return { sucesso: true, username };
  } catch (err) {
    console.error('❌ Erro ao criar usuário no Mikrotik:', err.message);
    throw err;
  } finally {
    if (conn) conn.close();
  }
}

// ================================
// FAZER LOGIN DO CLIENTE
// Autentica o cliente automaticamente após pagamento
// ================================
async function loginCliente({ username, password, ipCliente }) {
  let conn;
  try {
    conn = await conectar();

    await conn.write('/ip/hotspot/active/login', [
      `=user=${username}`,
      `=password=${password}`,
      `=ip=${ipCliente}`,
    ]);

    console.log(`✅ Cliente logado automaticamente: ${username} | IP: ${ipCliente}`);
    return { sucesso: true };
  } catch (err) {
    console.error('❌ Erro ao logar cliente:', err.message);
    // Não lança erro — cliente pode logar manualmente
    return { sucesso: false, erro: err.message };
  } finally {
    if (conn) conn.close();
  }
}

// ================================
// DERRUBAR USUÁRIO
// ================================
async function removerUsuario(username) {
  let conn;
  try {
    conn = await conectar();

    // Buscar usuário
    const usuarios = await conn.write('/ip/hotspot/user/print', [
      `?name=${username}`,
    ]);

    if (usuarios.length > 0) {
      await conn.write('/ip/hotspot/user/remove', [
        `=.id=${usuarios[0]['.id']}`,
      ]);
      console.log(`✅ Usuário removido do Mikrotik: ${username}`);
    }

    return { sucesso: true };
  } catch (err) {
    console.error('❌ Erro ao remover usuário:', err.message);
    throw err;
  } finally {
    if (conn) conn.close();
  }
}

// ================================
// LISTAR CLIENTES ATIVOS
// ================================
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
    console.error('❌ Erro ao listar clientes ativos:', err.message);
    return [];
  } finally {
    if (conn) conn.close();
  }
}

// ================================
// ATUALIZAR PERFIL NO MIKROTIK
// Chamado quando você muda os planos no dashboard
// ================================
async function atualizarPerfil({ nome, minutos, velocidade }) {
  let conn;
  try {
    conn = await conectar();

    // Verificar se perfil existe
    const perfis = await conn.write('/ip/hotspot/user/profile/print', [
      `?name=${nome}`,
    ]);

    const sessionTimeout = minutos >= 60
      ? `${Math.floor(minutos / 60)}h${minutos % 60 > 0 ? (minutos % 60) + 'm' : ''}`
      : `${minutos}m`;

    if (perfis.length > 0) {
      // Atualizar existente
      await conn.write('/ip/hotspot/user/profile/set', [
        `=.id=${perfis[0]['.id']}`,
        `=session-timeout=${sessionTimeout}`,
        `=rate-limit=${velocidade || '5M/3M'}`,
      ]);
      console.log(`✅ Perfil atualizado no Mikrotik: ${nome}`);
    } else {
      // Criar novo
      await conn.write('/ip/hotspot/user/profile/add', [
        `=name=${nome}`,
        `=session-timeout=${sessionTimeout}`,
        `=rate-limit=${velocidade || '5M/3M'}`,
        `=shared-users=1`,
      ]);
      console.log(`✅ Perfil criado no Mikrotik: ${nome}`);
    }

    return { sucesso: true };
  } catch (err) {
    console.error('❌ Erro ao atualizar perfil:', err.message);
    throw err;
  } finally {
    if (conn) conn.close();
  }
}

// ================================
// TESTAR CONEXÃO
// ================================
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

module.exports = {
  criarUsuario,
  loginCliente,
  removerUsuario,
  clientesAtivos,
  atualizarPerfil,
  testarConexao,
};
