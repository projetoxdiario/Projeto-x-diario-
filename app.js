import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const gate = document.getElementById('authGate');
const authMessage = document.getElementById('authMessage');
const legacySource = document.getElementById('legacy-app');
const CONFIG_KEY = 'pxdiario_challenge_settings_v1';
const WORKOUTS_KEY = 'pxdiario_workouts_v1';
const PROFILE_KEY = 'pxdiario_profiles_v1';
const ACTIVE_KEY = 'pxdiario_active_profile_v1';
const defaults = {title:'Projeto X: reta final de outubro',copy:'Constância, força, corrida e hábitos sustentáveis. Sem promessas milagrosas.',start:'2026-10-17',days:15};
let supabase;
let currentUser;
let currentProfile;
let syncTimer;
let nativeSetItem;

const isConfigured = SUPABASE_URL && SUPABASE_ANON_KEY &&
  !SUPABASE_URL.includes('COLE_A_') && !SUPABASE_ANON_KEY.includes('COLE_A_');

function message(text, bad=false) {
  authMessage.textContent = text;
  authMessage.style.color = bad ? '#ffb3a7' : '#aab8af';
}
function setMode(mode) {
  document.getElementById('authTitle').textContent = mode === 'login' ? 'Entrar no Projeto X' : 'Criar minha conta';
  document.getElementById('authSubmit').textContent = mode === 'login' ? 'Entrar' : 'Criar conta';
  document.getElementById('switchAuth').textContent = mode === 'login' ? 'Primeiro acesso? Criar conta com convite' : 'Já tenho conta — entrar';
  document.getElementById('switchAuth').dataset.mode = mode === 'login' ? 'signup' : 'login';
  message('');
}

if (!isConfigured) {
  message('Configuração pendente: copie config.example.js para config.js e preencha a URL e a chave pública do Supabase. Veja README.md.', true);
  document.getElementById('authSubmit').disabled = true;
  document.getElementById('switchAuth').disabled = true;
} else {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  setMode('login');
  document.getElementById('switchAuth').addEventListener('click', e => setMode(e.currentTarget.dataset.mode));
  document.getElementById('authForm').addEventListener('submit', async e => {
    e.preventDefault();
    const mode = document.getElementById('switchAuth').dataset.mode === 'signup' ? 'login' : 'signup';
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    const submit = document.getElementById('authSubmit');
    submit.disabled = true;
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await bootApp();
      } else {
        const name = document.getElementById('signupName').value.trim();
        const invite = document.getElementById('inviteCode').value.trim().toUpperCase();
        if (!name || !invite) throw new Error('Informe seu nome e o código de convite.');
        if (password.length < 8) throw new Error('Use uma senha com pelo menos 8 caracteres.');
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: name, invite_code: invite } }
        });
        if (error) throw error;
        if (!data.session) {
          message('Conta criada. Confirme o e-mail no link recebido e depois volte aqui para entrar. O convite será validado no cadastro.');
        } else {
          await bootApp();
        }
      }
    } catch (err) {
      message(err?.message || 'Não foi possível concluir. Confira os dados e tente novamente.', true);
    } finally { submit.disabled = false; }
  });
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await supabase.auth.signOut();
    location.reload();
  });
  bootApp().catch(err => message(err?.message || 'Erro ao iniciar o aplicativo.', true));
}

async function bootApp() {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const session = sessionData.session;
  if (!session) { gate.hidden = false; return; }
  currentUser = session.user;
  const { data: profile, error: profileError } = await supabase
    .from('profiles').select('id, full_name, role, is_active').eq('id', currentUser.id).single();
  if (profileError) throw new Error('Não foi possível carregar seu perfil. Confirme se o SQL do projeto foi executado no Supabase.');
  if (!profile.is_active) {
    await supabase.auth.signOut();
    throw new Error('Este acesso está desativado. Fale com o criador do Projeto X.');
  }
  currentProfile = profile;
  const [{ data: cloudData, error: dataError }, { data: config, error: configError }] = await Promise.all([
    supabase.from('user_data').select('data').eq('user_id', currentUser.id).maybeSingle(),
    supabase.from('app_config').select('challenge_settings, workouts').eq('id', 'main').maybeSingle()
  ]);
  if (dataError) throw dataError;
  if (configError) throw configError;
  const userData = cloudData?.data || {completed:{},runs:[],measurements:[]};
  nativeSetItem = Storage.prototype.setItem;
  nativeSetItem.call(localStorage, PROFILE_KEY, JSON.stringify({[currentUser.id]: {name: profile.full_name || currentUser.user_metadata?.full_name || 'Atleta', data:userData}}));
  nativeSetItem.call(localStorage, ACTIVE_KEY, currentUser.id);
  nativeSetItem.call(localStorage, CONFIG_KEY, JSON.stringify(config?.challenge_settings || defaults));
  if (Array.isArray(config?.workouts) && config.workouts.length) nativeSetItem.call(localStorage, WORKOUTS_KEY, JSON.stringify(config.workouts));
  window.PX_ROLE = profile.role;
  window.PX_USER = {id:currentUser.id,email:currentUser.email,name:profile.full_name || 'Atleta'};
  installCloudSync();
  gate.hidden = true;
  document.body.classList.add('px-authenticated');
  document.querySelector('label[for="profileSelect"]').style.display = 'none';
  document.getElementById('profileSelect').style.display = 'none';
  document.querySelector('.profilebox button[onclick="createProfile()"]')?.remove();
  const creatorNav = document.querySelector('nav button[data-page="creator"]');
  if (creatorNav) creatorNav.style.display = profile.role === 'creator' ? '' : 'none';
  // Executa o HTML original somente depois de carregar os dados da conta.
  const appScript = document.createElement('script');
  appScript.textContent = legacySource.textContent;
  document.body.appendChild(appScript);
  document.getElementById('profileMessage').textContent = `${profile.role === 'creator' ? 'Criador' : 'Participante'} · dados sincronizados com sua conta`;
  if (profile.role === 'creator') {
    window.openCreator = function() {
      document.getElementById('cfgTitle').value = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}').title || defaults.title;
      const cfg = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
      document.getElementById('cfgCopy').value = cfg.copy || defaults.copy;
      document.getElementById('cfgStart').value = cfg.start || defaults.start;
      document.getElementById('cfgDays').value = cfg.days || defaults.days;
      document.getElementById('workoutEditor').value = localStorage.getItem(WORKOUTS_KEY) || JSON.stringify(window.PX_DEFAULT_WORKOUTS || [], null, 2);
      window.showPage('creator');
      loadAdminPanel();
    };
    addAdminPanel();
  } else {
    // Remove texto de protótipo sobre configurações locais para participantes.
    const creatorNotice = document.querySelector('#creator .notice');
    if (creatorNotice) creatorNotice.textContent = 'Área reservada ao criador do Projeto X.';
  }
  window.PX_SYNC_READY = true;
  message('');
}

function installCloudSync() {
  if (window.PX_STORAGE_PATCHED) return;
  const original = Storage.prototype.setItem;
  Storage.prototype.setItem = function(key, value) {
    original.call(this, key, value);
    if (this !== localStorage || !window.PX_SYNC_READY) return;
    if ([PROFILE_KEY, CONFIG_KEY, WORKOUTS_KEY].includes(key)) {
      clearTimeout(syncTimer);
      syncTimer = setTimeout(() => syncKey(key), 450);
    }
  };
  window.PX_STORAGE_PATCHED = true;
}
async function syncKey(key) {
  if (!currentUser) return;
  if (key === PROFILE_KEY) {
    const all = JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}');
    const profile = all[currentUser.id];
    if (!profile) return;
    const { error } = await supabase.from('user_data').upsert({user_id:currentUser.id, data:profile.data || {completed:{},runs:[],measurements:[]}, updated_at:new Date().toISOString()});
    if (error) console.error('Falha ao sincronizar dados pessoais:', error.message);
    const newName = String(profile.name || 'Atleta').slice(0,60);
    if (newName !== currentProfile.full_name) {
      const { error: nameError } = await supabase.rpc('update_my_profile_name', {p_name:newName});
      if (!nameError) currentProfile.full_name = newName;
    }
  } else if (currentProfile.role === 'creator') {
    const challenge = JSON.parse(localStorage.getItem(CONFIG_KEY) || JSON.stringify(defaults));
    const workouts = JSON.parse(localStorage.getItem(WORKOUTS_KEY) || '[]');
    const { error } = await supabase.from('app_config').upsert({id:'main', challenge_settings:challenge, workouts, updated_by:currentUser.id, updated_at:new Date().toISOString()});
    if (error) console.error('Falha ao sincronizar configurações:', error.message);
  }
}

function addAdminPanel() {
  const creator = document.getElementById('creator');
  if (!creator || document.getElementById('onlineAdminPanel')) return;
  const card = document.createElement('div');
  card.className = 'card'; card.id = 'onlineAdminPanel';
  card.innerHTML = `<h4>👥 Administração online</h4><p class="muted">Gerencie participantes e gere convites de uso único. Alterações são aplicadas no banco online.</p><div class="rowbtn"><button class="btn" id="makeInviteBtn">Gerar código de convite</button><button class="btn secondary" id="refreshMembersBtn">Atualizar participantes</button></div><div id="newInviteOutput" class="notice" style="display:none;margin-top:12px"></div><div id="membersOutput" class="records" style="margin-top:12px"><div class="empty">Carregando participantes…</div></div>`;
  creator.appendChild(card);
  document.getElementById('makeInviteBtn').addEventListener('click', makeInvite);
  document.getElementById('refreshMembersBtn').addEventListener('click', loadAdminPanel);
}
async function makeInvite() {
  const code = 'PX-' + crypto.randomUUID().replaceAll('-','').slice(0,10).toUpperCase();
  const { error } = await supabase.from('invite_codes').insert({code, max_uses:1, uses:0, is_active:true, created_by:currentUser.id});
  if (error) { alert('Não foi possível criar o convite: ' + error.message); return; }
  const output = document.getElementById('newInviteOutput');
  output.style.display = 'block';
  output.innerHTML = `<strong>Novo convite:</strong> <code>${code}</code><br>Envie este código somente para a pessoa que vai entrar. Ele permite um cadastro.`;
  await loadAdminPanel();
}
async function loadAdminPanel() {
  const output = document.getElementById('membersOutput');
  if (!output || currentProfile.role !== 'creator') return;
  output.innerHTML = '<div class="empty">Carregando…</div>';
  const [{data:members,error:memberError},{data:invites,error:inviteError}] = await Promise.all([
    supabase.from('profiles').select('id,full_name,role,is_active,created_at').order('created_at',{ascending:false}),
    supabase.from('invite_codes').select('id,code,is_active,uses,max_uses,created_at').order('created_at',{ascending:false}).limit(20)
  ]);
  if (memberError || inviteError) { output.textContent = 'Erro ao carregar administração. Confira as políticas RLS no SQL.'; return; }
  const memberHtml = `<h4>Participantes (${members.filter(m=>m.role==='participant').length})</h4>` + members.map(m => `<div class="record"><strong>${escapeText(m.full_name || 'Sem nome')}</strong> · ${m.role==='creator'?'Criador':'Participante'}<br><span class="muted">${m.is_active?'Ativo':'Desativado'} · ${new Date(m.created_at).toLocaleDateString('pt-BR')}</span>${m.role==='participant'?`<div class="rowbtn"><button class="btn secondary" data-member="${m.id}" data-active="${m.is_active?'false':'true'}">${m.is_active?'Desativar acesso':'Reativar acesso'}</button></div>`:''}</div>`).join('');
  const inviteHtml = `<h4 style="margin-top:18px">Convites recentes</h4>` + (invites.length ? invites.map(i=>`<div class="record"><strong><code>${escapeText(i.code)}</code></strong><br>${i.is_active && i.uses<i.max_uses?'Disponível':'Usado ou desativado'} · usos ${i.uses}/${i.max_uses}<div class="rowbtn">${i.is_active?`<button class="btn secondary" data-invite="${i.id}">Desativar convite</button>`:''}</div></div>`).join('') : '<div class="empty">Ainda não há convites.</div>');
  output.innerHTML = memberHtml + inviteHtml;
  output.querySelectorAll('[data-member]').forEach(btn=>btn.addEventListener('click',async()=>{
    const {error}=await supabase.rpc('admin_set_participant_active',{p_user_id:btn.dataset.member,p_active:btn.dataset.active==='true'});
    if(error) alert('Não foi possível alterar o acesso: '+error.message); else await loadAdminPanel();
  }));
  output.querySelectorAll('[data-invite]').forEach(btn=>btn.addEventListener('click',async()=>{
    const {error}=await supabase.from('invite_codes').update({is_active:false}).eq('id',btn.dataset.invite);
    if(error) alert('Não foi possível desativar: '+error.message); else await loadAdminPanel();
  }));
}
function escapeText(value) { return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
