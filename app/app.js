/* Central de Atendimento AR — app (PWA) sobre Supabase.
 * Cada gerente comercial entra com e-mail e senha e vê só a própria base;
 * o gestor vê e administra a base de todos. Quem garante isso é o banco
 * (Row Level Security em supabase/schema.sql), não esta tela. */
(() => {
'use strict';

const CFG = window.AR_CONFIG || {};
const TZ = CFG.fusoHorario || 'America/Sao_Paulo';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2, '0');
const ICON = {
  wa: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.8-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7a2.8 2.8 0 0 0 1.8-1.3 2.3 2.3 0 0 0 .2-1.3c-.1-.1-.2-.2-.5-.3Z"/></svg>',
  cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>'
};
const ETAPAS = {novo: 'Novo contato', ativo: 'Em negociação', parceiro: 'Parceiro ativo', inativo: 'Inativo'};
const TIPOS = {imobiliaria: 'Imobiliária', corretor: 'Corretor autônomo'};
const CANAIS = ['WhatsApp', 'Ligação', 'Visita presencial', 'E-mail', 'Reunião'];
const STATUS = {agendada: 'Agendada', realizada: 'Realizada', cancelada: 'Cancelada'};

const S = {
  sb: null, sessao: null, eu: null, perfis: [], parceiros: [], visitas: [],
  carregado: false, route: 'hoje', dono: null, // dono = id exibido; 'todos' só para gestor
  f: {tipo: 'todos', q: '', etapa: '', ord: 'retorno'}, visModo: 'proximas',
  authModo: 'entrar', authMsg: null, definirSenha: false, confirm: null, imp: null, contatos: {}
};
const gestor = () => S.eu && S.eu.papel === 'gestor';

/* ---------------- datas ---------------- */
const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
const addDias = (iso, n) => { const [y,m,d] = iso.split('-').map(Number); const t = new Date(y, m-1, d+n); return `${t.getFullYear()}-${pad(t.getMonth()+1)}-${pad(t.getDate())}`; };
const diaLocal = ts => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
const horaLocal = ts => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const DIAS = ['domingo','segunda','terça','quarta','quinta','sexta','sábado'];
const MESES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
function fmtDia(iso) {
  const h = hojeISO();
  if (iso === h) return 'Hoje';
  if (iso === addDias(h, 1)) return 'Amanhã';
  if (iso === addDias(h, -1)) return 'Ontem';
  const [y,m,d] = iso.split('-').map(Number); const t = new Date(y, m-1, d);
  return `${DIAS[t.getDay()]}, ${t.getDate()} ${MESES[t.getMonth()]}`;
}
const fmtCurto = iso => iso ? `${iso.slice(8,10)}/${iso.slice(5,7)}` : '';
const fmtQuando = ts => { const d = new Date(ts); return `${pad(d.getDate())}/${pad(d.getMonth()+1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

/* ---------------- utilidades ---------------- */
const digits = s => String(s || '').replace(/\D/g, '');
function waNum(tel) { let d = digits(tel); if (!d) return ''; if (d.length === 10 || d.length === 11) d = '55' + d; return d; }
const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => el.hidden = true, 3500); }
const perfil = id => S.perfis.find(p => p.id === id);
const nomeDe = id => (perfil(id) && perfil(id).nome) || (id === S.eu?.id ? S.eu.nome : 'Gerente');
const iniciais = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();
const parceiro = id => S.parceiros.find(p => p.id === id);
function erroTxt(e) {
  const m = (e && (e.message || e.error_description)) || '';
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
  if (/Email not confirmed/i.test(m)) return 'Confirme seu e-mail pelo link que recebeu antes de entrar.';
  if (/row-level security/i.test(m)) return 'Você não tem permissão para esta ação.';
  if (/Password should be/i.test(m)) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Sem conexão com o servidor. Verifique sua internet.';
  return m || 'Algo deu errado. Tente de novo.';
}

/* Base exibida conforme o seletor (gestor pode ver um gerente ou todos) */
const doDono = r => S.dono === 'todos' || r.dono === S.dono;
const meusParceiros = () => S.parceiros.filter(doDono);
const minhasVisitas = () => S.visitas.filter(doDono);

/* ---------------- início ---------------- */
async function iniciar() {
  if (!CFG.supabaseUrl || /SEU-PROJETO/.test(CFG.supabaseUrl) || !CFG.supabaseAnonKey || /COLE_AQUI/.test(CFG.supabaseAnonKey)) {
    $('#main').innerHTML = telaConfig(); return;
  }
  if (!window.supabase || !window.supabase.createClient) { $('#main').innerHTML = telaErro('Não foi possível carregar o app. Atualize a página.'); return; }
  // Link de convite ou de redefinição de senha: depois de entrar, pedir a nova senha
  if (/type=(recovery|invite)/.test(location.hash)) S.definirSenha = true;
  S.sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: true}});
  S.sb.auth.onAuthStateChange((evento, sessao) => {
    if (evento === 'PASSWORD_RECOVERY') S.definirSenha = true;
    const antes = S.sessao && S.sessao.user.id;
    S.sessao = sessao;
    if (!sessao) { limpar(); render(); return; }
    if (antes !== sessao.user.id) setTimeout(carregarTudo, 0);
  });
  const {data} = await S.sb.auth.getSession();
  S.sessao = data.session;
  if (S.sessao) await carregarTudo(); else render();
  window.addEventListener('online', () => { $('#offline').hidden = true; if (S.sessao) carregarTudo(); });
  window.addEventListener('offline', () => { $('#offline').hidden = false; });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

function limpar() {
  if (S.canal) { S.sb.removeChannel(S.canal); S.canal = null; }
  Object.assign(S, {eu: null, perfis: [], parceiros: [], visitas: [], carregado: false, dono: null, contatos: {}});
}

async function carregarTudo() {
  const uid = S.sessao.user.id;
  const {data: eu, error} = await S.sb.from('perfis').select('*').eq('id', uid).maybeSingle();
  if (error) { $('#main').innerHTML = telaErro(erroTxt(error)); return; }
  if (!eu) { $('#main').innerHTML = telaErro('Seu usuário ainda não tem perfil. Peça ao gestor para rodar o script do banco (schema.sql) e tente de novo.'); return; }
  S.eu = eu;
  if (!S.dono) S.dono = eu.id;
  await recarregar();
  assinarTempoReal();
}

async function recarregar() {
  if (!S.sessao || !S.eu) return;
  const [pf, pa, vi] = await Promise.all([
    S.sb.from('perfis').select('*').order('nome'),
    S.sb.from('parceiros').select('*').order('nome').limit(5000),
    S.sb.from('visitas').select('*').order('inicio').limit(5000)
  ]);
  const err = pf.error || pa.error || vi.error;
  if (err) { toast(erroTxt(err)); }
  else {
    S.perfis = pf.data; S.parceiros = pa.data; S.visitas = vi.data;
    const me = S.perfis.find(p => p.id === S.eu.id); if (me) S.eu = me;
  }
  S.carregado = true;
  render();
}
let recTimer = null;
const recarregarLogo = () => { clearTimeout(recTimer); recTimer = setTimeout(recarregar, 400); };

function assinarTempoReal() {
  if (S.canal) return;
  try {
    S.canal = S.sb.channel('central-ar')
      .on('postgres_changes', {event: '*', schema: 'public', table: 'parceiros'}, recarregarLogo)
      .on('postgres_changes', {event: '*', schema: 'public', table: 'visitas'}, recarregarLogo)
      .on('postgres_changes', {event: '*', schema: 'public', table: 'perfis'}, recarregarLogo)
      .subscribe();
  } catch (e) { /* sem tempo real: os dados recarregam após cada ação */ }
}

/* ---------------- rotas ---------------- */
const ROTAS = ['hoje', 'parceiros', 'visitas', 'equipe', 'conta'];
function rota() {
  const h = location.hash.replace('#', '');
  S.route = ROTAS.includes(h) ? h : 'hoje';
  if (S.route === 'equipe' && S.eu && !gestor()) S.route = 'hoje';
  render(); window.scrollTo(0, 0);
}
window.addEventListener('hashchange', () => { if (/access_token|type=/.test(location.hash)) return; rota(); });

/* ---------------- render ---------------- */
function render() {
  const logado = !!(S.sessao && S.eu);
  $('#tabs-nav').hidden = !logado;
  $('#who').hidden = !logado;
  $('#tab-equipe').hidden = !gestor();
  const main = $('#main');
  if (!S.sessao) { $('#viewbar').hidden = true; main.innerHTML = telaAuth(); return; }
  if (!S.eu || !S.carregado) { main.innerHTML = '<div class="card empty-big"><h3>Carregando sua base…</h3></div>'; return; }
  if (!S.eu.ativo) { $('#viewbar').hidden = true; main.innerHTML = telaErro('Seu acesso está desativado. Fale com o gestor comercial da AR.', true); return; }
  if (S.definirSenha) { main.innerHTML = telaNovaSenha(); return; }
  $('#who').innerHTML = `<span class="avatar">${esc(iniciais(S.eu.nome))}</span><span><b>${esc(S.eu.nome)}</b><small>${gestor() ? 'Gestor' : 'Gerente comercial'}</small></span>`;
  document.querySelectorAll('#tabs a').forEach(a => a.setAttribute('aria-current', a.dataset.r === S.route ? 'page' : 'false'));
  renderSeletor();
  const d = derivados();
  $('#n-hoje').textContent = d.visHoje.length + d.retornos.length;
  $('#n-hoje').className = (d.visHoje.length + d.retornos.length) ? 'hot' : '';
  $('#n-parc').textContent = meusParceiros().length;
  $('#n-vis').textContent = d.visSem.length;
  const html = {hoje: () => viewHoje(d), parceiros: viewParceiros, visitas: viewVisitas, equipe: viewEquipe, conta: viewConta}[S.route]();
  const foco = document.activeElement && document.activeElement.id;
  const pos = foco && document.activeElement.selectionStart;
  const y = window.scrollY;
  main.innerHTML = html;
  if (foco) { const el = document.getElementById(foco); if (el && main.contains(el)) { el.focus(); try { if (pos != null) el.setSelectionRange(pos, pos); } catch (e) {} } }
  window.scrollTo(0, y);
}

function renderSeletor() {
  const bar = $('#viewbar');
  const mostrar = gestor() && ['hoje', 'parceiros', 'visitas'].includes(S.route);
  bar.hidden = !mostrar;
  if (!mostrar) return;
  const ativos = S.perfis.filter(p => p.ativo);
  $('#sel-dono').innerHTML = `<option value="todos">Toda a equipe</option>` +
    ativos.map(p => `<option value="${esc(p.id)}">${esc(p.nome)}${p.id === S.eu.id ? ' (você)' : ''}</option>`).join('');
  $('#sel-dono').value = S.dono;
}

function derivados() {
  const h = hojeISO(), sem = addDias(h, 7), agora = Date.now();
  const vs = minhasVisitas().filter(v => v.status === 'agendada');
  const visHoje = vs.filter(v => diaLocal(v.inicio) === h);
  const visSem = vs.filter(v => { const d = diaLocal(v.inicio); return d >= h && d <= sem; }).sort((a, b) => a.inicio.localeCompare(b.inicio));
  const retornos = meusParceiros().filter(p => p.proximo_contato && p.proximo_contato <= h && p.etapa !== 'inativo')
    .sort((a, b) => a.proximo_contato.localeCompare(b.proximo_contato));
  const emBreve = vs.filter(v => { const t = new Date(v.inicio).getTime(); return t >= agora - 15*60e3 && t <= agora + 2*3600e3; });
  const ps = meusParceiros();
  return {h, visHoje, visSem, retornos, emBreve, nImob: ps.filter(p => p.tipo === 'imobiliaria').length, nCor: ps.filter(p => p.tipo === 'corretor').length};
}

/* ---------------- telas de acesso ---------------- */
function telaConfig() {
  return `<section class="card empty-big"><h3>Falta conectar o banco de dados</h3>
  <p class="lede">Este app ainda não sabe qual projeto Supabase usar. Copie <code>config.example.js</code> para <code>config.js</code>, preencha a URL e a chave pública do projeto e publique de novo. O passo a passo completo está em <code>docs/INSTALACAO.md</code>.</p></section>`;
}
function telaErro(t, sair) {
  return `<section class="card empty-big"><h3>Não foi possível abrir a central</h3><p class="lede">${esc(t)}</p>${sair || S.sessao ? '<button class="btn" data-a="sair">Sair</button>' : ''}</section>`;
}
function telaAuth() {
  const m = S.authMsg;
  const msg = m ? `<p class="${m.ok ? 'ok-txt' : 'err-txt'}" role="alert">${esc(m.t)}</p>` : '';
  if (S.authModo === 'esqueci') return `<section class="card auth"><h2>Recuperar senha</h2>
    <p class="lede">Informe seu e-mail. Você recebe um link para criar uma senha nova.</p>
    <form id="f-esqueci"><label class="f">E-mail<input type="email" id="a-email" name="email" required autocomplete="email" value="${esc(S.authEmail || '')}"></label>${msg}
    <button class="btn primary" type="submit">Enviar link</button></form>
    <button class="linkbtn" data-a="auth-entrar">Voltar para o login</button></section>`;
  return `<section class="card auth"><h2>Entrar</h2>
    <p class="lede">Use o e-mail e a senha que o gestor comercial da AR cadastrou para você.</p>
    <form id="f-login">
      <label class="f">E-mail<input type="email" id="a-email" name="email" required autocomplete="username" value="${esc(S.authEmail || '')}"></label>
      <label class="f">Senha<input type="password" id="a-senha" name="senha" required autocomplete="current-password" minlength="6"></label>
      ${msg}<button class="btn primary" type="submit">Entrar</button>
    </form>
    <button class="linkbtn" data-a="auth-esqueci">Esqueci minha senha</button>
    <p class="lede" style="font-size:13px">Ainda não tem acesso? Peça ao gestor para criar o seu usuário.</p></section>`;
}
function telaNovaSenha() {
  const m = S.authMsg;
  return `<section class="card auth"><h2>Crie sua senha</h2>
    <p class="lede">Escolha a senha que você vai usar para entrar na central.</p>
    <form id="f-senha">
      <label class="f">Nova senha<input type="password" id="n-senha" name="senha" required minlength="6" autocomplete="new-password"></label>
      <label class="f">Repita a senha<input type="password" id="n-senha2" name="senha2" required minlength="6" autocomplete="new-password"></label>
      ${m ? `<p class="${m.ok ? 'ok-txt' : 'err-txt'}">${esc(m.t)}</p>` : ''}
      <button class="btn primary" type="submit">Salvar senha</button>
    </form></section>`;
}

/* ---------------- Meu dia ---------------- */
function quemTitulo(base) {
  if (S.dono === 'todos') return base + ' · toda a equipe';
  if (S.dono !== S.eu.id) return base + ' · ' + nomeDe(S.dono);
  return base;
}
function viewHoje(d) {
  const soon = d.emBreve.map(v => {
    const min = Math.round((new Date(v.inicio).getTime() - Date.now()) / 60000);
    const quando = min <= 0 ? 'começando agora' : min < 60 ? `em ${min} min` : `em ${Math.floor(min/60)}h${pad(min%60)}`;
    const p = parceiro(v.parceiro_id);
    return `<div class="soon" role="alert"><span>Visita ${quando}</span><strong>${esc(horaLocal(v.inicio))} · ${esc(p ? p.nome : 'Parceiro')}${v.cliente ? ' · ' + esc(v.cliente) : ''}</strong>${v.local ? `<span>${esc(v.local)}</span>` : ''}<a class="btn sm" href="#visitas">Ver visita</a></div>`;
  }).join('');
  const ret = d.retornos.slice(0, 15).map(p => `<li><span><b>${esc(p.nome)}</b> <span class="chip t-${esc(p.tipo)}">${esc(TIPOS[p.tipo])}</span>${S.dono === 'todos' ? ` <span class="chip">${esc(nomeDe(p.dono))}</span>` : ''}<br>
    <span class="m">Retorno ${p.proximo_contato < d.h ? 'atrasado desde ' + fmtCurto(p.proximo_contato) : 'para hoje'}</span></span>
    <span class="acts">${p.telefone ? `<a class="btn sm wa" href="https://wa.me/${waNum(p.telefone)}" target="_blank" rel="noopener">${ICON.wa}WhatsApp</a>` : ''}<button class="btn sm" data-a="contato" data-id="${esc(p.id)}">Registrar contato</button></span></li>`).join('');
  const prox = d.visSem.slice(0, 10).map(v => { const p = parceiro(v.parceiro_id);
    return `<li><span><b>${esc(fmtDia(diaLocal(v.inicio)))} · ${esc(horaLocal(v.inicio))}</b><br><span class="m">${esc(p ? p.nome : 'Parceiro')}${v.cliente ? ' · ' + esc(v.cliente) : ''}${v.local ? ' · ' + esc(v.local) : ''}</span></span>
    <span class="acts"><button class="btn sm" data-a="ics" data-id="${esc(v.id)}">${ICON.cal}Lembrete no celular</button></span></li>`; }).join('');
  const vazio = !meusParceiros().length;
  return `<div class="page-head"><div><h2>${esc(quemTitulo('Meu dia'))}</h2><p class="lede">${esc(fmtDia(d.h))}, ${esc(fmtCurto(d.h))}. Visitas marcadas e parceiros esperando retorno.</p></div>
  <div class="row"><button class="btn" data-a="novo-parceiro">+ Imobiliária ou corretor</button><button class="btn primary" data-a="nova-visita">+ Agendar visita</button></div></div>
  ${soon}
  <div class="kpis">
    <a class="kpi" data-k="hoje" href="#visitas"><div class="v">${d.visHoje.length}</div><div class="l">visitas hoje</div></a>
    <a class="kpi" data-k="sem" href="#visitas"><div class="v">${d.visSem.length}</div><div class="l">visitas nos próximos 7 dias</div></a>
    <a class="kpi" data-k="atr" href="#parceiros"><div class="v">${d.retornos.length}</div><div class="l">retornos pendentes</div></a>
    <a class="kpi" data-k="imob" href="#parceiros"><div class="v">${d.nImob}</div><div class="l">imobiliárias</div></a>
    <a class="kpi" data-k="cor" href="#parceiros"><div class="v">${d.nCor}</div><div class="l">corretores autônomos</div></a>
  </div>
  ${vazio ? `<div class="card empty-big"><h3>Sua base está vazia</h3><p class="lede">Cadastre as imobiliárias e os corretores que você atende, ou peça ao gestor para importar a planilha para você.</p><button class="btn primary" data-a="novo-parceiro">Cadastrar o primeiro parceiro</button></div>` : ''}
  <div class="grid2">
    <section class="card"><div class="sec-title"><h3>Retornos para fazer</h3><small>${d.retornos.length} pendente${d.retornos.length === 1 ? '' : 's'}</small></div>
      ${ret ? `<ul class="mini">${ret}</ul>` : '<p class="empty">Nenhum retorno pendente. Ao registrar um contato, defina o próximo retorno e ele aparece aqui no dia certo.</p>'}</section>
    <section class="card"><div class="sec-title"><h3>Próximas visitas</h3><small>7 dias</small></div>
      ${prox ? `<ul class="mini">${prox}</ul>` : '<p class="empty">Nenhuma visita marcada para esta semana.</p>'}</section>
  </div>`;
}

/* ---------------- Parceiros ---------------- */
function filtrar() {
  const {tipo, q, etapa, ord} = S.f, nq = norm(q);
  const l = meusParceiros().filter(p => (tipo === 'todos' || p.tipo === tipo) && (!etapa || p.etapa === etapa) &&
    (!nq || norm([p.nome, p.responsavel, p.telefone, p.cidade, p.creci, p.email, p.notas].join(' ')).includes(nq)));
  if (ord === 'nome') l.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  else if (ord === 'recente') l.sort((a, b) => b.atualizado_em.localeCompare(a.atualizado_em));
  else l.sort((a, b) => (a.proximo_contato || '9999').localeCompare(b.proximo_contato || '9999') || a.nome.localeCompare(b.nome, 'pt-BR'));
  return l;
}
function cardParceiro(p, h) {
  const late = p.proximo_contato && p.proximo_contato <= h && p.etapa !== 'inativo';
  const visP = S.visitas.filter(v => v.parceiro_id === p.id && v.status === 'agendada' && diaLocal(v.inicio) >= h).length;
  const imob = p.imobiliaria_id && parceiro(p.imobiliaria_id);
  const nCor = p.tipo === 'imobiliaria' ? S.parceiros.filter(c => c.imobiliaria_id === p.id).length : 0;
  return `<article class="pc" data-e="${esc(p.etapa)}">
    <div class="row" style="justify-content:space-between;align-items:flex-start;flex-wrap:nowrap">
      <div style="min-width:0"><h4>${esc(p.nome)}</h4><div class="sub">${[p.responsavel, p.cidade, p.creci ? 'CRECI ' + p.creci : '', imob ? 'da ' + imob.nome : ''].filter(Boolean).map(esc).join(' · ')}</div></div>
      ${p.telefone ? `<a class="btn sm wa" href="https://wa.me/${waNum(p.telefone)}" target="_blank" rel="noopener">${ICON.wa}WhatsApp</a>` : ''}
    </div>
    <div class="chips">
      <span class="chip t-${esc(p.tipo)}">${esc(TIPOS[p.tipo])}</span>
      <span class="chip e-${esc(p.etapa)}">${esc(ETAPAS[p.etapa])}</span>
      ${p.proximo_contato ? `<span class="chip ${late ? 'late' : ''}">Retorno ${esc(fmtCurto(p.proximo_contato))}</span>` : ''}
      ${visP ? `<span class="chip">${visP} visita${visP > 1 ? 's' : ''} marcada${visP > 1 ? 's' : ''}</span>` : ''}
      ${nCor ? `<span class="chip">${nCor} corretor${nCor > 1 ? 'es' : ''}</span>` : ''}
      ${S.dono === 'todos' ? `<span class="chip">${esc(nomeDe(p.dono))}</span>` : ''}
    </div>
    ${p.telefone || p.email ? `<div class="sub num">${esc(p.telefone)}${p.telefone && p.email ? ' · ' : ''}${esc(p.email)}</div>` : ''}
    ${p.notas ? `<div class="last">${esc(p.notas)}</div>` : ''}
    <div class="acts">
      <button class="btn sm" data-a="contato" data-id="${esc(p.id)}">Registrar contato</button>
      <button class="btn sm" data-a="nova-visita" data-id="${esc(p.id)}">Agendar visita</button>
      <button class="btn sm ghost" data-a="ver-parceiro" data-id="${esc(p.id)}">Histórico e edição</button>
    </div></article>`;
}
function viewParceiros() {
  const l = filtrar(), h = hojeISO(), total = meusParceiros().length;
  const seg = (v, t) => `<button type="button" data-a="f-tipo" data-v="${v}" aria-pressed="${S.f.tipo === v}">${t}</button>`;
  return `<div class="page-head"><div><h2>${esc(quemTitulo('Imobiliárias e corretores'))}</h2><p class="lede">${total} parceiro${total === 1 ? '' : 's'} na base.${gestor() ? '' : ' Só você e o gestor enxergam esta base.'}</p></div>
  <div class="row">${gestor() ? '<a class="btn" href="#equipe">Importar planilha</a>' : ''}<button class="btn primary" data-a="novo-parceiro">+ Imobiliária ou corretor</button></div></div>
  <section class="card" style="display:flex;flex-direction:column;gap:10px">
    <div class="row"><input id="f-q" class="search" type="search" placeholder="Buscar nome, telefone, cidade ou CRECI" value="${esc(S.f.q)}" autocomplete="off">
    <span class="seg">${seg('todos', 'Todos')}${seg('imobiliaria', 'Imobiliárias')}${seg('corretor', 'Corretores')}</span></div>
    <div class="row">
      <select id="f-etapa" style="width:auto"><option value="">Todas as etapas</option>${Object.entries(ETAPAS).map(([k, v]) => `<option value="${k}" ${S.f.etapa === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <select id="f-ord" style="width:auto">
        <option value="retorno" ${S.f.ord === 'retorno' ? 'selected' : ''}>Ordenar por próximo retorno</option>
        <option value="nome" ${S.f.ord === 'nome' ? 'selected' : ''}>Ordenar por nome</option>
        <option value="recente" ${S.f.ord === 'recente' ? 'selected' : ''}>Atualizados por último</option></select>
      <span class="m num" style="margin-left:auto">${l.length} de ${total}</span>
    </div></section>
  ${l.length ? `<div class="list">${l.map(p => cardParceiro(p, h)).join('')}</div>` :
    `<div class="card empty-big"><h3>${total ? 'Nenhum parceiro com esses filtros' : 'Nenhum parceiro cadastrado'}</h3><p class="lede">${total ? 'Limpe a busca ou troque o tipo para ver os demais.' : 'Cadastre imobiliárias e corretores autônomos que você atende.'}</p>${total ? '' : '<button class="btn primary" data-a="novo-parceiro">Cadastrar parceiro</button>'}</div>`}`;
}

/* ---------------- Visitas ---------------- */
function cardVisita(v) {
  const p = parceiro(v.parceiro_id);
  const conf = S.confirm === 'v' + v.id;
  const lem = (v.lembretes || []).map(m => m >= 1440 ? (m / 1440) + ' dia' : m >= 60 ? (m / 60) + 'h' : m + ' min').join(' e ');
  return `<article class="vis" data-s="${esc(v.status)}">
    <div class="hr">${esc(horaLocal(v.inicio))}<small>${esc(v.duracao_min)} min</small></div>
    <div class="body">
      <h5>${esc(p ? p.nome : 'Parceiro removido')}${v.cliente ? ' · ' + esc(v.cliente) : ''}</h5>
      ${v.local ? `<div class="sub" style="font-size:13px;color:var(--muted)">${esc(v.local)}</div>` : ''}
      ${v.obs ? `<div class="last">${esc(v.obs)}</div>` : ''}
      <div class="chips"><span class="chip">${STATUS[v.status]}</span>${lem ? `<span class="chip">Lembrete ${esc(lem)} antes</span>` : ''}${S.dono === 'todos' ? `<span class="chip">${esc(nomeDe(v.dono))}</span>` : ''}</div>
      <div class="acts">${v.status === 'agendada' ? `
        <button class="btn sm primary" data-a="ics" data-id="${esc(v.id)}">${ICON.cal}Salvar no calendário do celular</button>
        <a class="btn sm" href="${esc(urlGoogle(v))}" target="_blank" rel="noopener">Google Agenda</a>
        <button class="btn sm" data-a="v-status" data-v="realizada" data-id="${esc(v.id)}">Marcar realizada</button>
        <button class="btn sm" data-a="editar-visita" data-id="${esc(v.id)}">Editar</button>
        <button class="btn sm ghost" data-a="v-status" data-v="cancelada" data-id="${esc(v.id)}">Cancelar</button>` : `
        <button class="btn sm" data-a="v-status" data-v="agendada" data-id="${esc(v.id)}">Reabrir</button>
        <button class="btn sm ${conf ? 'danger' : 'ghost'}" data-a="v-del" data-id="${esc(v.id)}">${conf ? 'Confirmar exclusão' : 'Excluir'}</button>`}
      </div></div></article>`;
}
function viewVisitas() {
  const h = hojeISO(), prox = S.visModo === 'proximas';
  const l = minhasVisitas().filter(v => { const d = diaLocal(v.inicio);
      return prox ? (d >= h && v.status !== 'cancelada') || (d < h && v.status === 'agendada') : (d < h && v.status !== 'agendada') || v.status === 'cancelada'; })
    .sort((a, b) => prox ? a.inicio.localeCompare(b.inicio) : b.inicio.localeCompare(a.inicio));
  const grupos = {}; l.forEach(v => (grupos[diaLocal(v.inicio)] ||= []).push(v));
  const dias = Object.keys(grupos);
  return `<div class="page-head"><div><h2>${esc(quemTitulo('Visitas'))}</h2><p class="lede">Agende, salve no calendário do celular com alarme e marque como realizada depois.</p></div>
  <div class="row"><span class="seg"><button type="button" data-a="vis-modo" data-v="proximas" aria-pressed="${prox}">Próximas</button><button type="button" data-a="vis-modo" data-v="historico" aria-pressed="${!prox}">Histórico</button></span>
  <button class="btn primary" data-a="nova-visita">+ Agendar visita</button></div></div>
  ${dias.length ? dias.map(d => `<section class="day"><h4 class="${d === h ? 'today' : ''}">${esc(fmtDia(d))} · ${esc(fmtCurto(d))}${d < h && prox ? ' · pendente de baixa' : ''}</h4>${grupos[d].map(cardVisita).join('')}</section>`).join('') :
    `<div class="card empty-big"><h3>${prox ? 'Nenhuma visita agendada' : 'Nenhuma visita no histórico'}</h3><p class="lede">${prox ? 'Agende uma visita para uma imobiliária ou corretor da sua base.' : 'Visitas realizadas, canceladas ou de dias anteriores ficam guardadas aqui.'}</p>${prox ? '<button class="btn primary" data-a="nova-visita">Agendar visita</button>' : ''}</div>`}`;
}

/* ---------------- Calendário: arquivo .ics (com alarmes) e link do Google ---------------- */
const utcStamp = ts => new Date(ts).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const fimVisita = v => new Date(new Date(v.inicio).getTime() + (v.duracao_min || 60) * 60000).toISOString();
function tituloVisita(v) { const p = parceiro(v.parceiro_id); return `Visita · ${p ? p.nome : 'parceiro'}${v.cliente ? ' · ' + v.cliente : ''}`; }
function descVisita(v) {
  const p = parceiro(v.parceiro_id);
  return [p ? `${TIPOS[p.tipo]}: ${p.nome}${p.responsavel ? ' (' + p.responsavel + ')' : ''}` : '', p && p.telefone ? 'Telefone: ' + p.telefone : '',
    v.cliente ? 'Cliente: ' + v.cliente : '', v.obs ? 'Observações: ' + v.obs : '', 'Central de Atendimento AR'].filter(Boolean).join('\n');
}
function urlGoogle(v) {
  const q = new URLSearchParams({action: 'TEMPLATE', text: tituloVisita(v), dates: `${utcStamp(v.inicio)}/${utcStamp(fimVisita(v))}`, ctz: TZ, details: descVisita(v), location: v.local || ''});
  return 'https://calendar.google.com/calendar/render?' + q.toString();
}
function baixarIcs(v) {
  const e = s => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, m => '\\' + m);
  const alarmes = (v.lembretes || []).map(m => ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${e(tituloVisita(v))}`, `TRIGGER:-PT${m}M`, 'END:VALARM']).flat();
  const linhas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AR Incorporadora//Central de Atendimento//PT-BR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `UID:${v.id}@central-ar`, `DTSTAMP:${utcStamp(new Date().toISOString())}`, `DTSTART:${utcStamp(v.inicio)}`, `DTEND:${utcStamp(fimVisita(v))}`,
    `SUMMARY:${e(tituloVisita(v))}`, `DESCRIPTION:${e(descVisita(v))}`, `LOCATION:${e(v.local)}`, ...alarmes, 'END:VEVENT', 'END:VCALENDAR'];
  const blob = new Blob([linhas.join('\r\n')], {type: 'text/calendar;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `visita-${diaLocal(v.inicio)}-${horaLocal(v.inicio).replace(':', 'h')}.ics`;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast('Abra o arquivo baixado para salvar a visita com alarme no calendário.');
}

/* ---------------- Equipe (gestor) ---------------- */
function viewEquipe() {
  const h = hojeISO();
  const linhas = S.perfis.map(u => {
    const ps = S.parceiros.filter(p => p.dono === u.id), vs = S.visitas.filter(v => v.dono === u.id);
    const atras = ps.filter(p => p.proximo_contato && p.proximo_contato < h && p.etapa !== 'inativo').length;
    const conf = S.confirm === 'u' + u.id;
    return `<tr><td><b>${esc(u.nome)}</b><br><span class="m">${esc(u.email)}</span></td>
      <td><span class="badge ${u.papel === 'gestor' ? 'gestor' : ''} ${u.ativo ? '' : 'off'}">${u.ativo ? (u.papel === 'gestor' ? 'Gestor' : 'Gerente') : 'Desativado'}</span></td>
      <td class="num">${ps.filter(p => p.tipo === 'imobiliaria').length}</td><td class="num">${ps.filter(p => p.tipo === 'corretor').length}</td>
      <td class="num">${vs.filter(v => v.status === 'agendada' && diaLocal(v.inicio) >= h).length}</td><td class="num">${vs.filter(v => v.status === 'realizada').length}</td>
      <td class="num">${atras ? `<span class="chip late">${atras}</span>` : '0'}</td>
      <td><div class="row" style="flex-wrap:nowrap">
        <button class="btn sm" data-a="ver-base" data-id="${esc(u.id)}">Ver base</button>
        ${u.id !== S.eu.id ? `<button class="btn sm ghost" data-a="u-papel" data-id="${esc(u.id)}">${u.papel === 'gestor' ? 'Tornar gerente' : 'Tornar gestor'}</button>
        <button class="btn sm ${conf ? 'danger' : 'ghost'}" data-a="u-ativo" data-id="${esc(u.id)}">${u.ativo ? (conf ? 'Confirmar desativação' : 'Desativar') : 'Reativar'}</button>` : ''}
      </div></td></tr>`;
  }).join('');
  const opts = S.perfis.filter(p => p.ativo).map(p => `<option value="${esc(p.id)}">${esc(p.nome)}</option>`).join('');
  return `<div class="page-head"><div><h2>Equipe comercial</h2><p class="lede">Gerentes, gestores e o tamanho de cada base. Cada gerente só enxerga a própria base; gestores veem todas.</p></div></div>
  <section class="card"><div class="sec-title"><h3>Usuários</h3><small>${S.perfis.filter(p => p.ativo).length} ativos</small></div>
    <div class="tscroll"><table><thead><tr><th>Nome</th><th>Acesso</th><th>Imobiliárias</th><th>Corretores</th><th>Visitas futuras</th><th>Realizadas</th><th>Retornos atrasados</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div></section>
  <section class="card"><div class="sec-title"><h3>Cadastrar um gerente novo</h3></div>
    <ol class="steps">
      <li>No painel do Supabase, abra <b>Authentication → Users → Add user → Create new user</b>.</li>
      <li>Informe o e-mail e uma senha inicial e marque <b>Auto Confirm User</b>. Ou use <b>Send invitation</b> para ele criar a própria senha pelo e-mail.</li>
      <li>Ele aparece nesta tabela como gerente. Mande o link do app junto com o login, e ele pode trocar a senha em <b>Minha conta</b>.</li>
    </ol></section>
  <section class="card" style="display:flex;flex-direction:column;gap:12px">
    <div class="sec-title"><h3>Importar planilha</h3></div>
    <p class="lede" style="margin:0">Arquivo CSV (Excel → Salvar como → CSV) com as colunas <b>nome</b>, <b>tipo</b> (imobiliária ou corretor), <b>telefone</b>, <b>email</b>, <b>cidade</b>, <b>creci</b>, <b>responsavel</b>, <b>imobiliaria</b> (para corretores vinculados) e <b>gerente</b> (e-mail ou nome do gerente). Linhas sem gerente vão para quem você escolher abaixo.</p>
    <div class="row"><label for="imp-padrao">Sem gerente na planilha, enviar para:</label><select id="imp-padrao" style="width:auto">${opts}</select>
      <label class="btn primary" for="imp-file">Escolher arquivo CSV</label><input id="imp-file" type="file" accept=".csv,text/csv,text/plain" hidden></div>
    ${S.imp ? `<p class="msg ${S.imp.err ? 'err' : 'ok'}">${esc(S.imp.t)}</p>` : ''}
  </section>`;
}

/* ---------------- Minha conta ---------------- */
function viewConta() {
  return `<div class="page-head"><div><h2>Minha conta</h2><p class="lede">${esc(S.eu.email)} · ${gestor() ? 'Gestor' : 'Gerente comercial'}</p></div><button class="btn" data-a="sair">Sair</button></div>
  <div class="grid2">
    <section class="card"><form id="f-perfil" style="display:flex;flex-direction:column;gap:10px"><div class="sec-title"><h3>Meus dados</h3></div>
      <label class="f">Nome<input type="text" id="c-nome" name="nome" required value="${esc(S.eu.nome)}"></label>
      <label class="f">Telefone<input type="tel" id="c-tel" name="telefone" value="${esc(S.eu.telefone)}"></label>
      <div><button class="btn primary" type="submit">Salvar</button></div></form></section>
    <section class="card"><form id="f-trocar" style="display:flex;flex-direction:column;gap:10px"><div class="sec-title"><h3>Trocar senha</h3></div>
      <label class="f">Nova senha<input type="password" id="c-senha" name="senha" required minlength="6" autocomplete="new-password"></label>
      <label class="f">Repita a nova senha<input type="password" id="c-senha2" name="senha2" required minlength="6" autocomplete="new-password"></label>
      <div><button class="btn primary" type="submit">Trocar senha</button></div></form></section>
  </div>
  <section class="card"><div class="sec-title"><h3>Instalar no celular</h3></div>
    <ol class="steps"><li><b>Android (Chrome):</b> menu ⋮ → <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.</li>
    <li><b>iPhone (Safari):</b> botão Compartilhar → <b>Adicionar à Tela de Início</b>.</li></ol></section>`;
}

/* ---------------- diálogos ---------------- */
const dlg = $('#dlg'), form = $('#dlg-form');
let aoSalvar = null;
function abrir(html, fn) { form.innerHTML = html; aoSalvar = fn; dlg.showModal(); const f = form.querySelector('input:not([type=hidden]),select,textarea'); if (f) f.focus(); }
form.addEventListener('submit', async ev => {
  ev.preventDefault();
  if (ev.submitter && ev.submitter.value === 'cancel') { dlg.close(); return; }
  if (!aoSalvar) return;
  const fd = Object.fromEntries(new FormData(form).entries());
  fd._lembretes = [...form.querySelectorAll('input[name="lembrete"]:checked')].map(i => Number(i.value));
  const b = form.querySelector('button[value="ok"]'); if (b) b.disabled = true;
  const ok = await aoSalvar(fd);
  if (b) b.disabled = false;
  if (ok !== false) dlg.close();
});
const botoes = t => `<div class="dlg-acts"><button class="btn" value="cancel" formnovalidate>Cancelar</button><button class="btn primary" value="ok">${t}</button></div>`;
async function exec(promessa, okMsg) {
  const {error} = await promessa;
  if (error) { toast(erroTxt(error)); return false; }
  if (okMsg) toast(okMsg);
  await recarregar();
  return true;
}
const donoNovo = () => S.dono === 'todos' ? S.eu.id : S.dono;

function dlgParceiro(p) {
  const e = p || {tipo: 'imobiliaria', etapa: 'novo', dono: donoNovo()};
  const imobs = S.parceiros.filter(x => x.tipo === 'imobiliaria' && x.dono === e.dono && (!p || x.id !== p.id)).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  abrir(`<h3>${p ? 'Editar parceiro' : 'Nova imobiliária ou corretor'}</h3>
  <div class="fgrid">
    <label class="f">Tipo<select name="tipo" id="d-tipo">${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}" ${e.tipo === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    <label class="f">Etapa<select name="etapa" id="d-etapa">${Object.entries(ETAPAS).map(([k, v]) => `<option value="${k}" ${e.etapa === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    <label class="f full">Nome da imobiliária ou do corretor<input type="text" name="nome" id="d-nome" required value="${esc(e.nome)}"></label>
    <label class="f">Responsável / contato<input type="text" name="responsavel" id="d-resp" value="${esc(e.responsavel)}" placeholder="Ex.: Ana (gerente)"></label>
    <label class="f">CRECI<input type="text" name="creci" id="d-creci" value="${esc(e.creci)}"></label>
    <label class="f">Telefone / WhatsApp<input type="tel" name="telefone" id="d-tel" value="${esc(e.telefone)}" placeholder="(47) 99999-0000"></label>
    <label class="f">E-mail<input type="email" name="email" id="d-email" value="${esc(e.email)}"></label>
    <label class="f">Cidade<input type="text" name="cidade" id="d-cid" value="${esc(e.cidade)}" placeholder="Itapema"></label>
    <label class="f">Próximo retorno<input type="date" name="proximo_contato" id="d-prox" value="${esc(e.proximo_contato || '')}"></label>
    <label class="f full">Corretor vinculado a uma imobiliária?<select name="imobiliaria_id" id="d-imob"><option value="">Não (autônomo ou é imobiliária)</option>${imobs.map(i => `<option value="${esc(i.id)}" ${e.imobiliaria_id === i.id ? 'selected' : ''}>${esc(i.nome)}</option>`).join('')}</select></label>
    ${gestor() ? `<label class="f full">Gerente responsável<select name="dono" id="d-dono">${S.perfis.filter(u => u.ativo || u.id === e.dono).map(u => `<option value="${esc(u.id)}" ${e.dono === u.id ? 'selected' : ''}>${esc(u.nome)}</option>`).join('')}</select></label>` : ''}
    <label class="f full">Observações<textarea name="notas" id="d-notas">${esc(e.notas)}</textarea></label>
  </div>${botoes(p ? 'Salvar alterações' : 'Cadastrar')}`, fd => {
    const dados = {tipo: fd.tipo, etapa: fd.etapa, nome: fd.nome.trim(), responsavel: fd.responsavel.trim(), creci: fd.creci.trim(), telefone: fd.telefone.trim(),
      email: fd.email.trim(), cidade: fd.cidade.trim(), proximo_contato: fd.proximo_contato || null, notas: fd.notas.trim(), imobiliaria_id: fd.imobiliaria_id || null};
    if (gestor() && fd.dono) dados.dono = fd.dono;
    else if (!p) dados.dono = S.eu.id;
    if (p && dados.dono && dados.dono !== p.dono) dados.imobiliaria_id = null;
    return p ? exec(S.sb.from('parceiros').update(dados).eq('id', p.id), dados.dono && dados.dono !== p.dono ? 'Parceiro transferido para ' + nomeDe(dados.dono) : 'Parceiro atualizado')
             : exec(S.sb.from('parceiros').insert(dados), 'Parceiro cadastrado');
  });
}

function dlgContato(p) {
  abrir(`<h3>Registrar contato</h3><p class="lede" style="margin:0">${esc(p.nome)}</p>
  <div class="fgrid">
    <label class="f">Como foi<select name="canal" id="k-canal">${CANAIS.map(c => `<option>${c}</option>`).join('')}</select></label>
    <label class="f">Etapa<select name="etapa" id="k-etapa">${Object.entries(ETAPAS).map(([k, v]) => `<option value="${k}" ${p.etapa === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    <label class="f full">O que foi conversado<textarea name="texto" id="k-texto" required placeholder="Ex.: enviei a tabela do lançamento, pediu material para 3 clientes"></textarea></label>
    <label class="f full">Próximo retorno<input type="date" name="proximo" id="k-prox" value="${esc(addDias(hojeISO(), 7))}"></label>
  </div>
  <div class="checks">${[[2, 'Em 2 dias'], [7, 'Em 1 semana'], [15, 'Em 15 dias'], [30, 'Em 1 mês']].map(([n, t]) => `<button type="button" class="chk" data-a="k-prox" data-v="${n}">${t}</button>`).join('')}</div>
  ${botoes('Salvar contato')}`, async fd => {
    const r1 = await S.sb.from('contatos').insert({parceiro_id: p.id, dono: p.dono, canal: fd.canal, texto: fd.texto.trim()});
    if (r1.error) { toast(erroTxt(r1.error)); return false; }
    delete S.contatos[p.id];
    return exec(S.sb.from('parceiros').update({etapa: fd.etapa, proximo_contato: fd.proximo || null}).eq('id', p.id), 'Contato registrado');
  });
}

async function dlgVerParceiro(p) {
  abrir(`<h3>${esc(p.nome)}</h3><p class="empty">Carregando histórico…</p><div class="dlg-acts"><button class="btn" value="cancel" formnovalidate>Fechar</button></div>`, null);
  let hist = S.contatos[p.id];
  if (!hist) {
    const {data, error} = await S.sb.from('contatos').select('*').eq('parceiro_id', p.id).order('em', {ascending: false}).limit(200);
    hist = error ? [] : data; S.contatos[p.id] = hist;
  }
  if (!dlg.open) return;
  const vis = S.visitas.filter(v => v.parceiro_id === p.id).sort((a, b) => b.inicio.localeCompare(a.inicio));
  const cors = p.tipo === 'imobiliaria' ? S.parceiros.filter(c => c.imobiliaria_id === p.id) : [];
  const h4 = t => `<h4 style="margin:0 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)">${t}</h4>`;
  form.innerHTML = `<h3>${esc(p.nome)}</h3>
  <div class="chips"><span class="chip t-${esc(p.tipo)}">${esc(TIPOS[p.tipo])}</span><span class="chip">${esc(ETAPAS[p.etapa])}</span>${p.cidade ? `<span class="chip">${esc(p.cidade)}</span>` : ''}${gestor() ? `<span class="chip">${esc(nomeDe(p.dono))}</span>` : ''}</div>
  ${p.notas ? `<p class="last" style="margin:0">${esc(p.notas)}</p>` : ''}
  ${cors.length ? `<div>${h4('Corretores desta imobiliária (' + cors.length + ')')}<ul class="hist">${cors.map(c => `<li>${esc(c.nome)}${c.telefone ? ' · ' + esc(c.telefone) : ''}</li>`).join('')}</ul></div>` : ''}
  <div>${h4('Contatos (' + hist.length + ')')}${hist.length ? `<ul class="hist">${hist.map(x => `<li><time>${esc(fmtQuando(x.em))} · ${esc(x.canal)}</time>${esc(x.texto)}</li>`).join('')}</ul>` : '<p class="empty">Nenhum contato registrado.</p>'}</div>
  <div>${h4('Visitas (' + vis.length + ')')}${vis.length ? `<ul class="hist">${vis.map(v => `<li><time>${esc(fmtCurto(diaLocal(v.inicio)))} ${esc(horaLocal(v.inicio))} · ${esc(STATUS[v.status])}</time>${esc(v.cliente)} ${esc(v.local)}</li>`).join('')}</ul>` : '<p class="empty">Nenhuma visita.</p>'}</div>
  <div class="dlg-acts"><button type="button" class="btn ghost" data-a="p-del" data-id="${esc(p.id)}">Excluir parceiro</button><button class="btn" value="cancel" formnovalidate>Fechar</button><button type="button" class="btn primary" data-a="editar-parceiro" data-id="${esc(p.id)}">Editar dados</button></div>`;
}

function dlgVisita(v, parceiroId) {
  const dono = v ? v.dono : donoNovo();
  const ps = S.parceiros.filter(p => p.dono === dono).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  if (!ps.length) { toast('Cadastre primeiro a imobiliária ou o corretor da visita.'); dlgParceiro(); return; }
  let dia = addDias(hojeISO(), 1), hora = '10:00';
  if (v) { dia = diaLocal(v.inicio); hora = horaLocal(v.inicio); }
  const e = v || {parceiro_id: parceiroId || '', duracao_min: 60, lembretes: [60, 1440]};
  abrir(`<h3>${v ? 'Editar visita' : 'Agendar visita'}</h3>
  <div class="fgrid">
    <label class="f full">Imobiliária ou corretor<select name="parceiro_id" id="v-parc" required>${ps.map(p => `<option value="${esc(p.id)}" ${e.parceiro_id === p.id ? 'selected' : ''}>${esc(p.nome)} · ${esc(TIPOS[p.tipo])}</option>`).join('')}</select></label>
    <label class="f">Data<input type="date" name="data" id="v-data" required value="${esc(dia)}"></label>
    <label class="f">Horário<input type="time" name="hora" id="v-hora" required value="${esc(hora)}"></label>
    <label class="f">Duração<select name="duracao_min" id="v-dur">${[30, 45, 60, 90, 120].map(m => `<option value="${m}" ${Number(e.duracao_min) === m ? 'selected' : ''}>${m} min</option>`).join('')}</select></label>
    <label class="f">Cliente (opcional)<input type="text" name="cliente" id="v-cli" value="${esc(e.cliente)}" placeholder="Quem vai visitar"></label>
    <label class="f full">Local / empreendimento<input type="text" name="local" id="v-local" value="${esc(e.local)}" placeholder="Ex.: decorado, Av. Nereu Ramos, Itapema"></label>
    <label class="f full">Observações<textarea name="obs" id="v-obs">${esc(e.obs)}</textarea></label>
  </div>
  <div><div style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;color:var(--muted)">Alarmes no calendário</div>
  <div class="checks">${[[15, '15 min antes'], [60, '1 hora antes'], [1440, '1 dia antes']].map(([m, t]) => `<label class="chk" for="v-l${m}"><input type="checkbox" id="v-l${m}" name="lembrete" value="${m}" ${(e.lembretes || []).includes(m) ? 'checked' : ''}> ${t}</label>`).join('')}</div></div>
  ${botoes(v ? 'Salvar alterações' : 'Agendar')}`, async fd => {
    const dados = {parceiro_id: fd.parceiro_id, inicio: new Date(`${fd.data}T${fd.hora.slice(0, 5)}:00`).toISOString(), duracao_min: Number(fd.duracao_min),
      cliente: fd.cliente.trim(), local: fd.local.trim(), obs: fd.obs.trim(), lembretes: fd._lembretes};
    if (v) return exec(S.sb.from('visitas').update(dados).eq('id', v.id), 'Visita atualizada');
    dados.dono = dono;
    const {data, error} = await S.sb.from('visitas').insert(dados).select().single();
    if (error) { toast(erroTxt(error)); return false; }
    await recarregar();
    location.hash = '#visitas';
    toast('Visita agendada. Toque em “Salvar no calendário do celular” para receber o alarme.');
    return !!data;
  });
}

/* ---------------- importação CSV ---------------- */
function parseCSV(txt) {
  txt = txt.replace(/^\uFEFF/, '');
  const first = txt.split(/\r?\n/)[0] || '';
  const sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : (first.includes('\t') ? '\t' : ',');
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    if (q) { if (ch === '"') { if (txt[i+1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === sep) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && txt[i+1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}
const COLS = {
  nome: ['nome', 'parceiro', 'empresa', 'razao social', 'nome fantasia'], tipo: ['tipo', 'categoria'],
  telefone: ['telefone', 'celular', 'whatsapp', 'fone'], email: ['email', 'e-mail'], cidade: ['cidade', 'municipio'],
  creci: ['creci'], responsavel: ['responsavel', 'contato'], imobiliaria: ['imobiliaria', 'imobiliaria vinculada'],
  gerente: ['gerente', 'gerente comercial', 'agente', 'consultor', 'responsavel ar']
};
function acharGerente(t) {
  const n = norm(t); if (!n) return null;
  const at = S.perfis.filter(p => p.ativo);
  const u = at.find(p => norm(p.email) === n) || at.find(p => norm(p.nome) === n) || at.find(p => norm(p.nome).startsWith(n + ' ') || norm(p.nome).split(' ')[0] === n);
  return u ? u.id : null;
}
async function importar(file, padrao) {
  const rows = parseCSV(await file.text());
  if (rows.length < 2) { S.imp = {t: 'A planilha está vazia ou sem cabeçalho.', err: true}; render(); return; }
  const head = rows[0].map(norm), idx = {};
  for (const [k, al] of Object.entries(COLS)) { const i = head.findIndex(h => al.includes(h)); if (i >= 0) idx[k] = i; }
  if (idx.nome == null) { S.imp = {t: 'Não encontrei a coluna “nome”. Renomeie a coluna principal para nome e importe de novo.', err: true}; render(); return; }
  const semGerente = new Set();
  const linhas = rows.slice(1).map(r => {
    const g = k => idx[k] != null ? String(r[idx[k]] || '').trim() : '';
    const t = norm(g('tipo'));
    let dono = padrao;
    if (g('gerente')) { const id = acharGerente(g('gerente')); if (id) dono = id; else semGerente.add(g('gerente')); }
    return {nome: g('nome'), tipo: t.includes('corretor') || t.includes('autonom') ? 'corretor' : 'imobiliaria', telefone: g('telefone'), email: g('email'),
      cidade: g('cidade'), creci: g('creci'), responsavel: g('responsavel'), dono, _imob: g('imobiliaria'), proximo_contato: hojeISO()};
  }).filter(l => l.nome);
  // imobiliárias primeiro, para vincular os corretores
  const imobs = linhas.filter(l => l.tipo === 'imobiliaria'), cors = linhas.filter(l => l.tipo === 'corretor');
  const limpo = l => { const c = {...l}; delete c._imob; return c; };
  let n = 0;
  for (let i = 0; i < imobs.length; i += 200) {
    const {error} = await S.sb.from('parceiros').insert(imobs.slice(i, i + 200).map(limpo));
    if (error) { S.imp = {t: `Parou em ${n} itens: ${erroTxt(error)}`, err: true}; render(); return; }
    n += Math.min(200, imobs.length - i); S.imp = {t: `Importando… ${n}`}; render();
  }
  await recarregar();
  const mapa = {}; S.parceiros.filter(p => p.tipo === 'imobiliaria').forEach(p => { mapa[p.dono + '|' + norm(p.nome)] = p.id; });
  const corsOk = cors.map(c => ({...limpo(c), imobiliaria_id: c._imob ? (mapa[c.dono + '|' + norm(c._imob)] || null) : null}));
  for (let i = 0; i < corsOk.length; i += 200) {
    const {error} = await S.sb.from('parceiros').insert(corsOk.slice(i, i + 200));
    if (error) { S.imp = {t: `Parou em ${n} itens: ${erroTxt(error)}`, err: true}; render(); return; }
    n += Math.min(200, corsOk.length - i); S.imp = {t: `Importando… ${n}`}; render();
  }
  const faltou = [...semGerente];
  S.imp = {t: `${n} parceiro${n === 1 ? '' : 's'} importado${n === 1 ? '' : 's'}.` + (faltou.length ? ` Gerente não encontrado (foram para o padrão): ${faltou.slice(0, 5).join(', ')}${faltou.length > 5 ? '…' : ''}.` : '')};
  await recarregar();
}

/* ---------------- eventos ---------------- */
document.addEventListener('submit', async ev => {
  const f = ev.target; if (f.id === 'dlg-form') return;
  ev.preventDefault();
  const fd = Object.fromEntries(new FormData(f).entries());
  const b = f.querySelector('button[type=submit]'); if (b) b.disabled = true;
  try {
    if (fd.email) S.authEmail = fd.email.trim();
    if (f.id === 'f-login') {
      S.authMsg = null;
      const {error} = await S.sb.auth.signInWithPassword({email: fd.email.trim(), password: fd.senha});
      if (error) { S.authMsg = {t: erroTxt(error)}; render(); }
    } else if (f.id === 'f-esqueci') {
      const {error} = await S.sb.auth.resetPasswordForEmail(fd.email.trim(), {redirectTo: location.origin + location.pathname});
      S.authMsg = error ? {t: erroTxt(error)} : {t: 'Se o e-mail estiver cadastrado, você vai receber o link em instantes.', ok: true}; render();
    } else if (f.id === 'f-senha' || f.id === 'f-trocar') {
      if (fd.senha !== fd.senha2) { if (f.id === 'f-senha') { S.authMsg = {t: 'As senhas não são iguais.'}; render(); } else toast('As senhas não são iguais.'); return; }
      const {error} = await S.sb.auth.updateUser({password: fd.senha});
      if (error) { if (f.id === 'f-senha') { S.authMsg = {t: erroTxt(error)}; render(); } else toast(erroTxt(error)); return; }
      S.definirSenha = false; S.authMsg = null; history.replaceState(null, '', location.pathname + '#hoje'); rota(); toast('Senha salva');
    } else if (f.id === 'f-perfil') {
      await exec(S.sb.from('perfis').update({nome: fd.nome.trim(), telefone: fd.telefone.trim()}).eq('id', S.eu.id), 'Dados salvos');
    }
  } finally { if (b && document.contains(b)) b.disabled = false; }
});

document.addEventListener('click', async ev => {
  const b = ev.target.closest('[data-a]'); if (!b) return;
  const a = b.dataset.a, id = b.dataset.id;
  const p = id && parceiro(id), v = id && S.visitas.find(x => x.id === id);
  if (!['v-del', 'p-del', 'u-ativo'].includes(a)) S.confirm = null;
  switch (a) {
    case 'auth-esqueci': S.authModo = 'esqueci'; S.authMsg = null; render(); break;
    case 'auth-entrar': S.authModo = 'entrar'; S.authMsg = null; render(); break;
    case 'sair': await S.sb.auth.signOut(); location.hash = ''; break;
    case 'novo-parceiro': dlgParceiro(); break;
    case 'editar-parceiro': dlg.close(); dlgParceiro(parceiro(id)); break;
    case 'ver-parceiro': dlgVerParceiro(p); break;
    case 'contato': dlgContato(p); break;
    case 'nova-visita': dlgVisita(null, id); break;
    case 'editar-visita': dlgVisita(v); break;
    case 'ics': baixarIcs(v); break;
    case 'k-prox': { const i = $('#k-prox'); if (i) i.value = addDias(hojeISO(), Number(b.dataset.v)); break; }
    case 'v-status': await exec(S.sb.from('visitas').update({status: b.dataset.v}).eq('id', id),
      {realizada: 'Visita marcada como realizada', cancelada: 'Visita cancelada. Apague também o evento do seu calendário.', agendada: 'Visita reaberta'}[b.dataset.v]); break;
    case 'v-del':
      if (S.confirm === 'v' + id) { S.confirm = null; await exec(S.sb.from('visitas').delete().eq('id', id), 'Visita excluída'); }
      else { S.confirm = 'v' + id; render(); }
      break;
    case 'p-del':
      if (S.confirm === 'p' + id) { S.confirm = null; if (await exec(S.sb.from('parceiros').delete().eq('id', id), 'Parceiro excluído')) dlg.close(); }
      else { S.confirm = 'p' + id; b.textContent = 'Confirmar exclusão (apaga o histórico)'; b.classList.add('danger'); }
      break;
    case 'f-tipo': S.f.tipo = b.dataset.v; render(); break;
    case 'vis-modo': S.visModo = b.dataset.v; render(); break;
    case 'ver-base': S.dono = id; location.hash = '#parceiros'; break;
    case 'u-papel': { const u = perfil(id); await exec(S.sb.rpc('gestor_definir_usuario', {p_id: id, p_papel: u.papel === 'gestor' ? 'gerente' : 'gestor', p_ativo: u.ativo}), 'Acesso atualizado'); break; }
    case 'u-ativo': { const u = perfil(id);
      if (u.ativo && S.confirm !== 'u' + id) { S.confirm = 'u' + id; render(); break; }
      S.confirm = null;
      await exec(S.sb.rpc('gestor_definir_usuario', {p_id: id, p_papel: u.papel, p_ativo: !u.ativo}), u.ativo ? 'Usuário desativado' : 'Usuário reativado'); break; }
  }
});
document.addEventListener('input', ev => { if (ev.target.id === 'f-q') { S.f.q = ev.target.value; render(); } });
document.addEventListener('change', ev => {
  const t = ev.target;
  if (t.id === 'f-etapa') { S.f.etapa = t.value; render(); }
  else if (t.id === 'f-ord') { S.f.ord = t.value; render(); }
  else if (t.id === 'sel-dono') { S.dono = t.value; render(); }
  else if (t.id === 'imp-file' && t.files && t.files[0]) { S.imp = {t: 'Lendo planilha…'}; const padrao = $('#imp-padrao').value; render(); importar(t.files[0], padrao); }
});
setInterval(() => { if (S.eu && S.route === 'hoje' && !dlg.open) render(); }, 60000);

rota();
iniciar();
})();
