import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  User
} from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from 'firebase/firestore';
import { auth, db } from './lib/firebase';
import { formatDate, normalizeEmail, statusBadgeClass, statusLabel } from './lib/utils';
import { Shell } from './components/Shell';
import './styles.css';

type Operation = { id?: string; name: string; date: string; description?: string };
type PMProfile = {
  authUid: string;
  email: string;
  loginProvider: string;
  fullName: string;
  warName: string;
  registration: string;
  observations?: string;
  status: 'pending' | 'approved' | 'rejected' | 'inactive';
  rejectionReason?: string;
  createdAt?: any;
  updatedAt?: any;
};

function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');

  async function googleLogin() {
    setMsg('');
    await signInWithPopup(auth, new GoogleAuthProvider());
  }

  async function emailAccess(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    try {
      if (mode === 'register') {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      setMsg(err?.message || 'Falha no acesso.');
    }
  }

  async function reset() {
    if (!email) {
      setMsg('Digite o e-mail primeiro.');
      return;
    }
    await sendPasswordResetEmail(auth, email);
    setMsg('E-mail de recuperação enviado, se a conta existir.');
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <section className="login-hero">
          <div className="brand-mark">PM</div>
          <h1>Área do PM</h1>
          <p>Acesso individual para cadastro, missões/operações participadas, notificações e comunicação com o Painel Operacional.</p>
          <div className="notice">
            O cadastro enviado ficará pendente até liberação pelo Painel Operacional.
          </div>
        </section>
        <section className="login-form">
          <h2>{mode === 'login' ? 'Entrar' : 'Criar cadastro'}</h2>
          <button onClick={googleLogin} className="secondary" style={{ width: '100%', marginBottom: 14 }}>
            Entrar com Google
          </button>
          <form className="form-grid" onSubmit={emailAccess}>
            <label>E-mail
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
            </label>
            <label>Senha
              <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required minLength={6} />
            </label>
            {msg && <div className="notice">{msg}</div>}
            <button type="submit">{mode === 'login' ? 'Entrar com e-mail' : 'Criar conta'}</button>
          </form>
          <div className="actions" style={{ marginTop: 12 }}>
            <button className="ghost" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
              {mode === 'login' ? 'Criar conta com e-mail' : 'Já tenho conta'}
            </button>
            <button className="ghost" onClick={reset}>Recuperar senha</button>
          </div>
        </section>
      </div>
    </div>
  );
}

function PMForm({ user, profile, onSaved }: { user: User; profile?: PMProfile | null; onSaved: () => void }) {
  const [fullName, setFullName] = useState(profile?.fullName || user.displayName || '');
  const [warName, setWarName] = useState(profile?.warName || '');
  const [registration, setRegistration] = useState(profile?.registration || '');
  const [observations, setObservations] = useState(profile?.observations || '');
  const [operations, setOperations] = useState<Operation[]>([]);
  const [opName, setOpName] = useState('');
  const [opDate, setOpDate] = useState('');
  const [opDescription, setOpDescription] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadOps() {
      const snap = await getDocs(query(collection(db, 'pm_profiles', user.uid, 'operations'), orderBy('date', 'desc')));
      setOperations(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Operation)));
    }
    loadOps();
  }, [user.uid]);

  function addOperation() {
    if (!opName.trim() || !opDate) return;
    setOperations((prev) => [
      ...prev,
      { name: opName.trim(), date: opDate, description: opDescription.trim() }
    ].sort((a, b) => b.date.localeCompare(a.date)));
    setOpName('');
    setOpDate('');
    setOpDescription('');
  }

  function removeOperation(index: number) {
    setOperations((prev) => prev.filter((_, i) => i !== index));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const ref = doc(db, 'pm_profiles', user.uid);
    const base = {
      authUid: user.uid,
      email: normalizeEmail(user.email),
      loginProvider: user.providerData[0]?.providerId || 'password',
      fullName: fullName.trim(),
      warName: warName.trim(),
      registration: registration.trim(),
      observations: observations.trim(),
      updatedAt: serverTimestamp()
    };

    const snap = await getDoc(ref);
    if (snap.exists()) {
      const current = snap.data() as PMProfile;
      const update: any = { ...base };
      if (current.status === 'rejected') {
        update.status = 'pending';
        update.resubmittedAt = serverTimestamp();
      }
      await updateDoc(ref, update);
    } else {
      await setDoc(ref, {
        ...base,
        status: 'pending',
        createdAt: serverTimestamp()
      });
    }

    const existing = await getDocs(collection(db, 'pm_profiles', user.uid, 'operations'));
    await Promise.all(existing.docs.map((d) => deleteDoc(d.ref)));
    for (const op of operations) {
      await addDoc(collection(db, 'pm_profiles', user.uid, 'operations'), {
        name: op.name.trim(),
        date: op.date,
        description: op.description?.trim() || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }

    setSaving(false);
    onSaved();
  }

  return (
    <form className="card form-grid" onSubmit={save}>
      <h2>Meu cadastro</h2>
      {profile?.status === 'rejected' && (
        <div className="notice danger">
          <strong>Cadastro recusado.</strong><br />
          Motivo: {profile.rejectionReason || 'Motivo não informado.'}<br />
          Corrija os dados e envie novamente para verificação.
        </div>
      )}
      <div className="grid three">
        <label>Nome completo *
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </label>
        <label>Nome de guerra *
          <input value={warName} onChange={(e) => setWarName(e.target.value)} required />
        </label>
        <label>Matrícula *
          <input value={registration} onChange={(e) => setRegistration(e.target.value)} required />
        </label>
      </div>
      <label>Observação geral
        <textarea value={observations} onChange={(e) => setObservations(e.target.value)} />
      </label>

      <div className="card" style={{ background: 'var(--surface-soft)' }}>
        <h3>Missões/operações já participadas</h3>
        <div className="grid three">
          <label>Nome da missão/operação
            <input value={opName} onChange={(e) => setOpName(e.target.value)} />
          </label>
          <label>Data
            <input value={opDate} onChange={(e) => setOpDate(e.target.value)} type="date" lang="pt-BR" />
          </label>
          <label>Descrição opcional
            <input value={opDescription} onChange={(e) => setOpDescription(e.target.value)} />
          </label>
        </div>
        <button type="button" className="secondary" onClick={addOperation} style={{ marginTop: 12 }}>Adicionar missão/operação</button>
        <div className="table-wrap" style={{ marginTop: 14 }}>
          <table>
            <thead><tr><th>Nome</th><th>Data</th><th>Descrição</th><th></th></tr></thead>
            <tbody>
              {operations.map((op, index) => (
                <tr key={`${op.name}-${op.date}-${index}`}>
                  <td>{op.name}</td>
                  <td>{formatDate(op.date)}</td>
                  <td>{op.description || '-'}</td>
                  <td><button type="button" className="danger" onClick={() => removeOperation(index)}>Remover</button></td>
                </tr>
              ))}
              {!operations.length && <tr><td colSpan={4} className="empty">Nenhuma missão/operação informada.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <button disabled={saving}>{saving ? 'Salvando...' : profile?.status === 'rejected' ? 'Corrigir e reenviar para verificação' : 'Enviar cadastro para verificação'}</button>
    </form>
  );
}

function NotificationsPage({ user }: { user: User }) {
  const [message, setMessage] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [sent, setSent] = useState('');

  useEffect(() => {
    async function load() {
      const inbox = await getDocs(query(collection(db, 'notifications'), where('recipientUid', '==', user.uid), orderBy('createdAt', 'desc')));
      setItems(inbox.docs.map((d) => ({ id: d.id, ...d.data() })));
    }
    load();
  }, [user.uid, sent]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    await addDoc(collection(db, 'messages'), {
      senderUid: user.uid,
      senderEmail: normalizeEmail(user.email),
      senderType: 'pm',
      recipientType: 'operational_inbox',
      text: message.trim(),
      status: 'sent',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    setMessage('');
    setSent('Mensagem enviada ao Painel Operacional.');
  }

  return (
    <div className="grid two">
      <section className="card">
        <h2>Enviar mensagem ao Operacional</h2>
        <form className="form-grid" onSubmit={sendMessage}>
          <label>Mensagem de texto
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} required />
          </label>
          {sent && <div className="notice success">{sent}</div>}
          <button>Enviar mensagem</button>
        </form>
      </section>
      <section className="card">
        <h2>Minhas notificações</h2>
        {items.length ? items.map((item) => (
          <div className="notice" key={item.id}>
            <strong>{item.title || 'Notificação'}</strong><br />
            {item.message || item.text || '-'}
          </div>
        )) : <div className="empty">Nenhuma notificação.</div>}
      </section>
    </div>
  );
}


function MyOperationsPage({ user }: { user: User }) {
  const [operations, setOperations] = useState<Operation[]>([]);

  useEffect(() => {
    async function load() {
      const snap = await getDocs(query(collection(db, 'pm_profiles', user.uid, 'operations'), orderBy('date', 'desc')));
      setOperations(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Operation)));
    }
    load();
  }, [user.uid]);

  return (
    <section className="card">
      <h2>Minhas missões/operações informadas</h2>
      <p>Este histórico é o que você informou no cadastro. Missões oficiais concluídas pelo Painel Operacional entrarão no histórico oficial do sistema nos próximos módulos.</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Nome</th><th>Data</th><th>Descrição</th></tr>
          </thead>
          <tbody>
            {operations.map((op) => (
              <tr key={op.id || `${op.name}-${op.date}`}>
                <td>{op.name}</td>
                <td>{formatDate(op.date)}</td>
                <td>{op.description || '-'}</td>
              </tr>
            ))}
            {!operations.length && <tr><td colSpan={3} className="empty">Nenhuma missão/operação informada.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PMDashboard({ user, profile, onReload }: { user: User; profile: PMProfile; onReload: () => void }) {
  const [page, setPage] = useState('dashboard');

  const status = profile.status;
  const isIncomplete = !profile.fullName || !profile.warName || !profile.registration;

  return (
    <Shell
      title="Área do PM"
      subtitle="pm.guiasys.online"
      nav={[
        { key: 'dashboard', label: 'Início' },
        { key: 'cadastro', label: 'Meu cadastro' },
        { key: 'operacoes', label: 'Minhas operações' },
        { key: 'notificacoes', label: 'Notificações/Mensagens' },
        { key: 'conta', label: 'Minha conta' }
      ]}
      current={page}
      onNavigate={setPage}
      userLabel={profile.warName || user.email || 'PM'}
      onLogout={() => signOut(auth)}
    >
      {page === 'dashboard' && (
        <section className="card">
          <h2>Situação do cadastro</h2>
          <p><span className={`badge ${statusBadgeClass(status)}`}>{statusLabel(status)}</span></p>
          {status === 'pending' && <div className="notice">Cadastro enviado para análise. Aguarde a liberação pelo Painel Operacional.</div>}
          {status === 'approved' && <div className="notice success">Cadastro aprovado. Você está apto a participar dos processos de seleção quando cumprir os critérios.</div>}
          {status === 'rejected' && <div className="notice danger">Cadastro recusado. Motivo: {profile.rejectionReason || 'Não informado.'}</div>}
          {status === 'inactive' && <div className="notice danger">Cadastro inativo. Procure o responsável operacional.</div>}
          {isIncomplete && <div className="notice danger">Seu cadastro está incompleto. Enquanto faltar nome completo, nome de guerra ou matrícula, você não entra no cálculo do IPO.</div>}
          <div className="grid three">
            <div className="card" style={{ background: 'var(--surface-soft)' }}>
              <h3>Nome completo</h3>
              <span className={`badge ${profile.fullName ? 'success' : 'danger'}`}>{profile.fullName ? 'Preenchido' : 'Pendente'}</span>
            </div>
            <div className="card" style={{ background: 'var(--surface-soft)' }}>
              <h3>Nome de guerra</h3>
              <span className={`badge ${profile.warName ? 'success' : 'danger'}`}>{profile.warName ? 'Preenchido' : 'Pendente'}</span>
            </div>
            <div className="card" style={{ background: 'var(--surface-soft)' }}>
              <h3>Matrícula</h3>
              <span className={`badge ${profile.registration ? 'success' : 'danger'}`}>{profile.registration ? 'Preenchida' : 'Pendente'}</span>
            </div>
          </div>
        </section>
      )}
      {page === 'cadastro' && <PMForm user={user} profile={profile} onSaved={onReload} />}
      {page === 'operacoes' && <MyOperationsPage user={user} />}
      {page === 'notificacoes' && <NotificationsPage user={user} />}
      {page === 'conta' && (
        <section className="card">
          <h2>Minha conta</h2>
          <p><strong>E-mail:</strong> {user.email}</p>
          <p><strong>UID:</strong> {user.uid}</p>
          <p><strong>Termo de uso:</strong> previsto para implementação textual posterior.</p>
        </section>
      )}
    </Shell>
  );
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<PMProfile | null | undefined>(undefined);

  async function loadProfile(current: User) {
    const snap = await getDoc(doc(db, 'pm_profiles', current.uid));
    setProfile(snap.exists() ? (snap.data() as PMProfile) : null);
  }

  useEffect(() => {
    return onAuthStateChanged(auth, async (current) => {
      setUser(current);
      if (current) await loadProfile(current);
      else setProfile(undefined);
    });
  }, []);

  if (!user) return <LoginPage />;
  if (profile === undefined) return <div className="login-page"><div className="card">Carregando...</div></div>;
  if (!profile) return <div className="content"><PMForm user={user} profile={null} onSaved={() => loadProfile(user)} /></div>;
  return <PMDashboard user={user} profile={profile} onReload={() => loadProfile(user)} />;
}

createRoot(document.getElementById('root')!).render(<App />);
