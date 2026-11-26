import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowUpRight, Check, ChevronRight, ClipboardList, CreditCard, FileImage,
  Leaf, LogOut, MapPin, Menu, Plus, QrCode, Recycle, Route as RouteIcon, Search,
  ShieldCheck, Trash2, Truck, Users, Wallet, X
} from 'lucide-react';
import { api, getErrorMessage, getPhotoUrl } from './api.js';
import MapView from './MapView.jsx';

const ADMIN_PAYMENT_INFO = {
  qrisLabel: 'QRIS KAS SAMPAH BALUNIJUK',
  qrisMerchant: 'Pengelola Kebersihan Desa Balunijuk',
  bankName: 'Bank BRI',
  accountNumber: '0000-01-000000-50-0',
  accountHolder: 'Admin Pengelola Sampah Desa Balunijuk'
};

const roleLabels = { RESIDENT: 'Warga', OFFICER: 'Petugas', ADMIN: 'Admin' };
const statusLabels = {
  AVAILABLE: 'Tersedia', FULL: 'Penuh', MAINTENANCE: 'Perawatan',
  REPORTED: 'Dilaporkan', IN_PROGRESS: 'Diproses', CLEANED: 'Dibersihkan',
  UNPAID: 'Belum Bayar', PENDING: 'Menunggu ACC', PAID: 'Lunas',
  VERIFIED: 'Terverifikasi (ACC)', REJECTED: 'Ditolak'
};
const emptyBin = { bin_code: '', capacity: '120', status: 'AVAILABLE' };
const emptyUser = { full_name: '', phone_number: '', role: 'RESIDENT' };
const emptyRoute = { route_name: '', schedule: '', officer_id: '' };
const inputClass = 'mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-forest-500 focus:ring-4 focus:ring-forest-100';

function formatRupiah(value) {
  return `Rp ${Number(value || 0).toLocaleString('id-ID')}`;
}

function formatMonthLabel(dateValue) {
  if (!dateValue) return '-';
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return String(dateValue).slice(0, 7);
  return parsed.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
}

function readStoredSession() {
  try {
    const saved = localStorage.getItem('balunijuk-session');
    const session = saved ? JSON.parse(saved) : null;
    if (session && !['RESIDENT', 'ADMIN'].includes(session.role)) {
      localStorage.removeItem('balunijuk-session');
      return null;
    }
    return session;
  } catch {
    localStorage.removeItem('balunijuk-session');
    return null;
  }
}

function QrisSampleCard({ billId, amount }) {
  const payloadText = `QRIS-BALUNIJUK|BILL-${billId || 0}|RP-${Number(amount || 0)}`;
  const size = 21;
  const cells = [];
  let seed = 0;
  for (let i = 0; i < payloadText.length; i += 1) {
    seed = (seed * 31 + payloadText.charCodeAt(i)) % 1000003;
  }

  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      const inTopLeft = r < 7 && c < 7;
      const inTopRight = r < 7 && c >= size - 7;
      const inBottomLeft = r >= size - 7 && c < 7;
      let dark = false;

      if (inTopLeft || inTopRight || inBottomLeft) {
        const localR = inBottomLeft ? r - (size - 7) : r;
        const localC = inTopRight ? c - (size - 7) : c;
        const isBorder = localR === 0 || localR === 6 || localC === 0 || localC === 6;
        const isCenter = localR >= 2 && localR <= 4 && localC >= 2 && localC <= 4;
        dark = isBorder || isCenter;
      } else {
        const hash = ((r + 1) * 73 + (c + 1) * 137 + seed) % 11;
        dark = hash < 5;
      }

      if (dark) {
        cells.push(<rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill="#111827" />);
      }
    }
  }

  return (
    <div className="flex flex-col items-center rounded-2xl border border-stone-200 bg-white p-4 text-center sm:flex-row sm:items-center sm:text-left sm:gap-5">
      <div className="shrink-0 rounded-xl border border-stone-200 bg-white p-2.5 shadow-sm">
        <svg viewBox={`0 0 ${size} ${size}`} className="h-32 w-32" role="img" aria-label="Kode QRIS Pembayaran">
          <rect x="0" y="0" width={size} height={size} fill="#ffffff" />
          {cells}
        </svg>
      </div>
      <div className="mt-3 sm:mt-0 space-y-1">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-forest-50 px-2.5 py-0.5 text-[11px] font-bold text-forest-700">
          <QrCode size={13} /> {ADMIN_PAYMENT_INFO.qrisLabel}
        </span>
        <p className="text-sm font-bold text-ink">{ADMIN_PAYMENT_INFO.qrisMerchant}</p>
        <p className="text-xs text-stone-600">Nominal Tagihan: <strong className="text-forest-800">{formatRupiah(amount)}</strong></p>
        <p className="text-[11px] text-stone-500">Scan QR ini melalui aplikasi e-wallet atau mobile banking Anda, lalu unggah foto bukti pembayarannya.</p>
      </div>
    </div>
  );
}

function Panel({ children, className = '' }) {
  return <section className={`rounded-2xl border border-stone-100 bg-white shadow-card ${className}`}>{children}</section>;
}

function Field({ label, children, className = '' }) {
  return <label className={`block text-sm font-medium text-stone-700 ${className}`}>{label}{children}</label>;
}

function PrimaryButton({ children, className = '', ...props }) {
  return <button className={`inline-flex items-center justify-center gap-2 rounded-xl bg-forest-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-forest-900 disabled:cursor-not-allowed disabled:opacity-50 ${className}`} {...props}>{children}</button>;
}

function SecondaryButton({ children, className = '', ...props }) {
  return <button className={`inline-flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-3.5 py-2 text-sm font-semibold text-stone-700 transition hover:border-forest-500 hover:text-forest-700 disabled:opacity-50 ${className}`} {...props}>{children}</button>;
}

function StatusBadge({ status }) {
  const colors = {
    AVAILABLE: 'bg-emerald-50 text-emerald-700',
    FULL: 'bg-amber-50 text-amber-700',
    MAINTENANCE: 'bg-stone-100 text-stone-600',
    REPORTED: 'bg-rose-50 text-rose-700',
    IN_PROGRESS: 'bg-amber-50 text-amber-700',
    CLEANED: 'bg-emerald-50 text-emerald-700',
    UNPAID: 'bg-rose-50 text-rose-700',
    PENDING: 'bg-amber-50 text-amber-700',
    PAID: 'bg-emerald-50 text-emerald-700',
    VERIFIED: 'bg-emerald-50 text-emerald-700',
    REJECTED: 'bg-rose-50 text-rose-700'
  };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${colors[status] || 'bg-stone-100 text-stone-600'}`}>{statusLabels[status] || status}</span>;
}

function Login({ onLogin, message, setMessage }) {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loginMode, setLoginMode] = useState('RESIDENT');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const { data } = await api.post('/login', {
        full_name: fullName.trim(),
        phone_number: phone.trim(),
        password: loginMode === 'ADMIN' ? password : '',
        login_mode: loginMode
      });
      setPassword('');
      onLogin(data.user);
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f3f6f0] px-4 py-10">
      <div className="absolute -left-24 -top-28 h-96 w-96 rounded-full bg-forest-100 blur-3xl" />
      <div className="absolute -bottom-36 -right-20 h-[26rem] w-[26rem] rounded-full bg-amber-100/70 blur-3xl" />
      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-[2rem] bg-white shadow-2xl shadow-forest-900/10 md:grid-cols-[1.05fr_.95fr]">
        <div className="relative hidden min-h-[620px] flex-col justify-between overflow-hidden bg-forest-900 p-10 text-white md:flex">
          <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(#9dcaa8 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
          <div className="absolute -right-20 top-24 h-80 w-80 rounded-full border border-white/10" />
          <div className="absolute -right-4 top-40 h-56 w-56 rounded-full border border-white/10" />
          <div className="relative flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10"><Recycle size={23} /></div>
            <span className="text-sm font-bold tracking-wide">BALUNIJUK BERSIH</span>
          </div>
          <div className="relative max-w-md">
            <p className="mb-4 text-xs font-bold uppercase tracking-[.25em] text-emerald-200">Desa Balunijuk & Pagarawan</p>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight">Lingkungan bersih, dimulai dari kita.</h1>
            <p className="mt-5 max-w-sm text-sm leading-6 text-emerald-50/75">Kelola iuran bulanan warga, pantau titik kontainer, dan laporkan TPS liar dalam satu aplikasi.</p>
            <div className="mt-8 flex items-center gap-3 text-xs text-emerald-100/80">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-white/10"><MapPin size={15} /></span>
              Pemetaan geospasial berbasis OpenStreetMap
            </div>
          </div>
          <p className="relative text-xs text-white/45">Sistem Manajemen Pengelolaan Sampah · Prototipe</p>
        </div>
        <div className="flex items-center px-6 py-10 sm:px-12 md:px-12">
          <div className="mx-auto w-full max-w-sm">
            <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-2xl bg-forest-50 text-forest-700 md:hidden"><Recycle size={25} /></div>
            <p className="text-sm font-semibold text-forest-600">Selamat datang</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Masuk ke sistem</h2>
            <p className="mt-2 text-sm leading-6 text-stone-500">Masukkan nama lengkap dan nomor telepon. Akun Warga akan dibuat otomatis jika belum terdaftar.</p>
            <div className="mt-6 grid grid-cols-2 rounded-xl bg-stone-100 p-1" role="tablist" aria-label="Mode masuk">
              {[
                ['RESIDENT', 'Masuk Warga'],
                ['ADMIN', 'Masuk Admin']
              ].map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  role="tab"
                  aria-selected={loginMode === mode}
                  onClick={() => { setLoginMode(mode); setPassword(''); setMessage(''); }}
                  className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition ${loginMode === mode ? 'bg-white text-forest-800 shadow-sm' : 'text-stone-500 hover:text-ink'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <form onSubmit={submit} className="mt-8 space-y-5">
              <Field label="Nama lengkap">
                <input className={inputClass} value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Contoh: Ahmad Warga" autoComplete="name" required />
              </Field>
              <Field label="Nomor telepon">
                <input className={inputClass} value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Contoh: 081234567890" autoComplete="tel" required />
              </Field>
              {loginMode === 'ADMIN' && (
                <Field label="Password Admin">
                  <input className={inputClass} type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Masukkan password Admin" autoComplete="current-password" required />
                </Field>
              )}
              {message && <p className="rounded-xl bg-rose-50 px-3.5 py-3 text-sm text-rose-700">{message}</p>}
              <PrimaryButton className="w-full py-3" disabled={busy}>{busy ? 'Memeriksa...' : 'Masuk'}<ChevronRight size={17} /></PrimaryButton>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, note, icon: Icon, tone = 'green', onClick, active = false }) {
  const tones = {
    green: 'bg-forest-50 text-forest-700',
    orange: 'bg-orange-50 text-orange-700',
    rose: 'bg-rose-50 text-rose-700',
    blue: 'bg-sky-50 text-sky-700'
  };
  const interactiveClass = onClick
    ? `cursor-pointer text-left transition hover:-translate-y-0.5 hover:border-forest-400 ${active ? 'ring-2 ring-forest-500 border-forest-500' : ''}`
    : '';

  return (
    <Panel className={`p-5 ${interactiveClass}`}>
      <button type="button" onClick={onClick} disabled={!onClick} className="block w-full text-left disabled:cursor-default">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-stone-500">{label}</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-ink">{value ?? 0}</p>
          </div>
          <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tones[tone]}`}><Icon size={19} /></div>
        </div>
        {note && (
          <p className="mt-4 flex items-center gap-1 text-xs text-stone-500">
            <ArrowUpRight size={14} className="text-forest-600" />{note}
          </p>
        )}
      </button>
    </Panel>
  );
}

function SectionHeading({ title, description, action }) {
  return <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-semibold text-ink">{title}</h2>{description && <p className="mt-1 text-sm text-stone-500">{description}</p>}</div>{action}</div>;
}

function EmptyState({ children }) {
  return <div className="rounded-xl border border-dashed border-stone-200 px-4 py-8 text-center text-sm text-stone-500">{children}</div>;
}

function App() {
  const [session, setSession] = useState(readStoredSession);
  const [overview, setOverview] = useState({ bins: [], dumps: [], routes: [] });
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [myReports, setMyReports] = useState([]);
  const [myBills, setMyBills] = useState([]);
  const [adminPayments, setAdminPayments] = useState([]);
  const [cleanupReports, setCleanupReports] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);
  const [activeTab, setActiveTab] = useState('Ringkasan');
  const [notice, setNotice] = useState('');
  const [errorNotice, setErrorNotice] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [polygonPoints, setPolygonPoints] = useState([]);
  const [dumpForm, setDumpForm] = useState({ description: '', photo: null });
  const [binForm, setBinForm] = useState(emptyBin);
  const [editingBinId, setEditingBinId] = useState(null);
  const [userForm, setUserForm] = useState(emptyUser);
  const [editingUserId, setEditingUserId] = useState(null);
  const [routeForm, setRouteForm] = useState(emptyRoute);
  const [editingRouteId, setEditingRouteId] = useState(null);
  const [editingDumpId, setEditingDumpId] = useState(null);
  const [cleanupNotes, setCleanupNotes] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [selectedBillId, setSelectedBillId] = useState(null);
  const [payChannel, setPayChannel] = useState('QRIS');
  const [payReference, setPayReference] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [payProofFile, setPayProofFile] = useState(null);
  const [billGenForm, setBillGenForm] = useState({
    billing_month: '2026-11',
    amount: '25000',
    bill_description: 'Iuran kebersihan bulanan'
  });

  const showNotice = useCallback((message, isError = false) => {
    setNotice(message);
    setErrorNotice(isError);
    window.setTimeout(() => setNotice(''), 4000);
  }, []);

  const refresh = useCallback(async () => {
    if (!session) return;
    try {
      const [mapResponse] = await Promise.all([api.get('/map/overview')]);
      setOverview(mapResponse.data);
      if (session.role === 'ADMIN') {
        const [statsResponse, usersResponse, activityResponse, paymentsResponse] = await Promise.all([
          api.get('/admin/stats'),
          api.get('/users'),
          api.get('/activity-logs'),
          api.get('/admin/payments')
        ]);
        setStats(statsResponse.data);
        setUsers(usersResponse.data);
        setActivityLogs(activityResponse.data);
        setAdminPayments(paymentsResponse.data);
      } else if (session.role === 'RESIDENT') {
        const [dumpsResponse, billsResponse] = await Promise.all([
          api.get('/dumps/mine'),
          api.get('/bills/mine')
        ]);
        setMyReports(dumpsResponse.data);
        setMyBills(billsResponse.data);
      } else {
        const [cleanupResponse, activityResponse] = await Promise.all([
          api.get('/cleanup-reports'),
          api.get('/activity-logs')
        ]);
        setCleanupReports(cleanupResponse.data);
        setActivityLogs(activityResponse.data);
      }
    } catch (error) {
      showNotice(getErrorMessage(error), true);
    }
  }, [session, showNotice]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (session?.role !== 'ADMIN') return undefined;
    const intervalId = window.setInterval(() => {
      api.get('/activity-logs')
        .then(({ data }) => setActivityLogs(data))
        .catch((error) => showNotice(getErrorMessage(error), true));
    }, 15000);
    return () => window.clearInterval(intervalId);
  }, [session, showNotice]);

  function signIn(user) {
    const nextSession = { id: user.id, name: user.name, role: user.role };
    localStorage.setItem('balunijuk-session', JSON.stringify(nextSession));
    setSession(nextSession);
    setActiveTab(user.role === 'ADMIN' ? 'Ringkasan' : user.role === 'RESIDENT' ? 'Peta & laporan' : 'Tugas saya');
    setNotice('');
  }

  function signOut() {
    localStorage.removeItem('balunijuk-session');
    setSession(null);
    setOverview({ bins: [], dumps: [], routes: [] });
    setStats(null);
    setUsers([]);
    setMyBills([]);
    setAdminPayments([]);
  }

  async function perform(action, successMessage, afterSuccess) {
    setLoading(true);
    try {
      await action();
      if (afterSuccess) afterSuccess();
      await refresh();
      showNotice(successMessage);
    } catch (error) {
      showNotice(getErrorMessage(error), true);
    } finally {
      setLoading(false);
    }
  }

  const roleTabs = useMemo(() => {
    if (session?.role === 'ADMIN') return [
      { label: 'Ringkasan', icon: ClipboardList },
      { label: 'Pembayaran', icon: CreditCard },
      { label: 'Kontainer', icon: Trash2 },
      { label: 'Rute', icon: RouteIcon },
      { label: 'Pengguna', icon: Users },
      { label: 'Riwayat Aktivitas (Activity Log)', icon: Activity }
    ];
    return [{ label: 'Peta & laporan', icon: MapPin }];
  }, [session]);

  const mapMode = session?.role === 'RESIDENT' ? 'report'
    : session?.role === 'ADMIN' && activeTab === 'Kontainer' ? 'bin'
      : session?.role === 'ADMIN' && activeTab === 'Rute' ? 'route'
        : 'view';

  function onMapClick(point) {
    if (mapMode === 'route') {
      setPolygonPoints((points) => [...points, point]);
    } else if (mapMode === 'report' || mapMode === 'bin') {
      setSelectedPoint(point);
    }
  }

  function resetBinForm() {
    setBinForm(emptyBin);
    setEditingBinId(null);
    setSelectedPoint(null);
  }

  function editBin(bin) {
    setBinForm({ bin_code: bin.bin_code, capacity: String(bin.capacity), status: bin.status });
    setSelectedPoint({ lat: Number(bin.lat), lng: Number(bin.lng) });
    setEditingBinId(bin.bin_id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function submitBin(event) {
    event.preventDefault();
    if (!selectedPoint) return showNotice('Klik peta untuk memilih lokasi kontainer.', true);
    const payload = { ...binForm, capacity: Number(binForm.capacity), ...selectedPoint };
    perform(
      () => editingBinId ? api.put(`/bins/${editingBinId}`, payload) : api.post('/bins', payload),
      editingBinId ? 'Data kontainer diperbarui.' : 'Kontainer baru ditambahkan.',
      resetBinForm
    );
  }

  function editUser(user) {
    setUserForm({
      full_name: user.full_name,
      phone_number: user.phone_number,
      role: user.role === 'ADMIN' ? 'ADMIN' : 'RESIDENT'
    });
    setEditingUserId(user.user_id);
  }

  function submitUser(event) {
    event.preventDefault();
    perform(
      () => editingUserId ? api.put(`/users/${editingUserId}`, userForm) : api.post('/users', userForm),
      editingUserId ? 'Data pengguna diperbarui.' : 'Pengguna berhasil ditambahkan.',
      () => { setUserForm(emptyUser); setEditingUserId(null); }
    );
  }

  function editRoute(route) {
    const ring = route.boundary?.coordinates?.[0] || [];
    const coords = ring.slice(0, -1).map(([lng, lat]) => ({ lng, lat }));
    setRouteForm({ route_name: route.route_name, schedule: route.schedule, officer_id: String(route.officer_id) });
    setPolygonPoints(coords);
    setEditingRouteId(route.route_id);
  }

  function resetRouteForm() {
    setRouteForm(emptyRoute);
    setPolygonPoints([]);
    setEditingRouteId(null);
  }

  function submitRoute(event) {
    event.preventDefault();
    if (polygonPoints.length < 3) return showNotice('Klik peta untuk menambahkan minimal tiga titik batas rute.', true);
    const payload = { ...routeForm, coordinates: polygonPoints };
    perform(
      () => editingRouteId ? api.put(`/routes/${editingRouteId}`, payload) : api.post('/routes', payload),
      editingRouteId ? 'Rute berhasil diperbarui.' : 'Rute baru berhasil ditambahkan.',
      resetRouteForm
    );
  }

  function submitDump(event) {
    event.preventDefault();
    if (!selectedPoint) return showNotice('Pilih titik lokasi laporan pada peta.', true);
    if (!dumpForm.photo) return showNotice('Pilih foto bukti terlebih dahulu.', true);
    const body = new FormData();
    body.append('description', dumpForm.description);
    body.append('lat', selectedPoint.lat);
    body.append('lng', selectedPoint.lng);
    body.append('photo', dumpForm.photo);
    perform(
      () => api.post('/dumps', body),
      'Laporan TPS liar berhasil dikirim.',
      () => { setDumpForm({ description: '', photo: null }); setSelectedPoint(null); }
    );
  }

  function beginCleanup(dumpId) {
    perform(() => api.patch(`/dumps/${dumpId}/status`, { status: 'IN_PROGRESS' }), 'Laporan mulai ditangani.');
  }

  function completeCleanup(event) {
    event.preventDefault();
    perform(
      () => api.post('/cleanup-reports', { dump_id: editingDumpId, notes: cleanupNotes }),
      'Laporan ditandai selesai.',
      () => { setEditingDumpId(null); setCleanupNotes(''); }
    );
  }

  function submitBillPayment(event) {
    event.preventDefault();
    if (!selectedBillId) return showNotice('Pilih tagihan terlebih dahulu.', true);
    if (payChannel !== 'CASH' && !payProofFile) {
      return showNotice('Unggah foto bukti pembayaran untuk QRIS atau Transfer.', true);
    }
    const formData = new FormData();
    formData.append('channel', payChannel);
    if (payReference.trim()) formData.append('payment_reference', payReference.trim());
    if (payNotes.trim()) formData.append('notes', payNotes.trim());
    if (payProofFile) formData.append('proof', payProofFile);

    perform(
      () => api.post(`/bills/${selectedBillId}/pay`, formData),
      'Pembayaran dikirim dan menunggu ACC Admin.',
      () => {
        setSelectedBillId(null);
        setPayReference('');
        setPayNotes('');
        setPayProofFile(null);
      }
    );
  }

  function generateMonthlyBills(event) {
    event.preventDefault();
    perform(
      () => api.post('/admin/bills/generate', {
        billing_month: billGenForm.billing_month,
        amount: Number(billGenForm.amount),
        bill_description: billGenForm.bill_description
      }),
      'Tagihan bulanan warga berhasil dibuat.'
    );
  }

  function verifyPayment(paymentId, decision) {
    perform(
      () => api.patch(`/admin/payments/${paymentId}/verify`, { decision }),
      decision === 'APPROVE' ? 'Pembayaran di-ACC (Lunas).' : 'Pembayaran ditolak.'
    );
  }

  const activeBill = useMemo(
    () => myBills.find((item) => item.bill_id === selectedBillId) || null,
    [myBills, selectedBillId]
  );

  const pendingPaymentsCount = useMemo(
    () => adminPayments.filter((p) => p.payment_status === 'PENDING').length,
    [adminPayments]
  );

  const verifiedTotalAmount = useMemo(
    () => adminPayments
      .filter((p) => p.payment_status === 'VERIFIED')
      .reduce((sum, p) => sum + Number(p.amount || 0), 0),
    [adminPayments]
  );

  const residentSummary = useMemo(() => {
    const unpaid = myBills.filter((b) => b.status === 'UNPAID' || b.payment_status === 'REJECTED').length;
    const pending = myBills.filter((b) => b.status === 'PENDING').length;
    const paid = myBills.filter((b) => b.status === 'PAID').length;
    return { unpaid, pending, paid };
  }, [myBills]);

  const title = activeTab === 'Riwayat Aktivitas (Activity Log)' ? 'Riwayat Aktivitas (Activity Log)'
    : activeTab === 'Pembayaran' ? 'Pembayaran & ACC Iuran Bulanan'
      : session?.role === 'ADMIN' ? 'Pusat kendali lingkungan'
        : 'Tagihan & Lapor Lingkungan';

  const pageDescription = activeTab === 'Riwayat Aktivitas (Activity Log)' ? 'Aktivitas terbaru yang tercatat di sistem.'
    : activeTab === 'Pembayaran' ? 'Terbitkan tagihan bulanan dan verifikasi (ACC) pembayaran warga.'
      : session?.role === 'ADMIN' ? 'Klik kartu ringkasan di bawah untuk langsung membuka menu terkait.'
        : 'Klik kartu status tagihan di bawah untuk menuju pembayaran, atau laporkan titik sampah liar.';

  if (!session) return <Login onLogin={signIn} message={notice} setMessage={setNotice} />;

  return (
    <div className="min-h-screen bg-[#f5f7f2]">
      {notice && (
        <div className={`fixed right-4 top-20 z-[2000] flex max-w-sm items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-xl ${errorNotice ? 'bg-rose-700' : 'bg-forest-800'}`}>
          <span>{notice}</span>
          <button onClick={() => setNotice('')} aria-label="Tutup notifikasi"><X size={15} /></button>
        </div>
      )}

      <header className="sticky top-0 z-[1000] border-b border-stone-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-[72px] max-w-[1600px] items-center justify-between px-4 sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="rounded-lg p-2 text-stone-500 hover:bg-stone-100 lg:hidden" aria-label="Buka menu"><Menu size={19} /></button>
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-forest-700 text-white"><Leaf size={21} /></div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold tracking-wide text-forest-900">BALUNIJUK BERSIH</p>
              <p className="hidden text-[11px] text-stone-500 sm:block">Sistem pengelolaan sampah desa</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold text-ink">{session.name}</p>
              <p className="text-[11px] text-stone-500">{roleLabels[session.role]}</p>
            </div>
            <div className="grid h-9 w-9 place-items-center rounded-full bg-forest-100 text-xs font-bold text-forest-700">
              {session.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}
            </div>
            <button onClick={signOut} className="rounded-xl p-2.5 text-stone-500 hover:bg-rose-50 hover:text-rose-700" title="Keluar"><LogOut size={18} /></button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1600px] lg:grid-cols-[235px_minmax(0,1fr)]">
        <aside className={`${mobileMenuOpen ? 'block' : 'hidden'} border-b border-stone-200 bg-white px-4 py-5 lg:block lg:min-h-[calc(100vh-72px)] lg:border-b-0 lg:border-r lg:px-5`}>
          <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[.18em] text-stone-400">Menu utama</p>
          <nav className="space-y-1">
            {roleTabs.map(({ label, icon: Icon }) => (
              <button
                key={label}
                onClick={() => { setActiveTab(label); setMobileMenuOpen(false); }}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${activeTab === label ? 'bg-forest-50 text-forest-800' : 'text-stone-500 hover:bg-stone-50 hover:text-ink'}`}
              >
                <Icon size={17} />
                <span className="flex-1">{label}</span>
                {label === 'Pembayaran' && pendingPaymentsCount > 0 && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">{pendingPaymentsCount}</span>
                )}
              </button>
            ))}
          </nav>
          <div className="mt-8 rounded-2xl bg-[#f4f7f2] p-4">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-white text-forest-700 shadow-sm"><ShieldCheck size={18} /></div>
            <p className="mt-3 text-xs font-semibold text-ink">Verifikasi dua pihak</p>
            <p className="mt-1 text-[11px] leading-5 text-stone-500">Pembayaran warga divalidasi Admin sebelum berstatus Lunas.</p>
          </div>
        </aside>

        <main className="min-w-0 px-4 py-6 sm:px-7 lg:px-8">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.18em] text-forest-600">{roleLabels[session.role]} · {activeTab}</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-[28px]">{title}</h1>
              <p className="mt-1.5 text-sm text-stone-500">{pageDescription}</p>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-500">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Balunijuk, Bangka
            </div>
          </div>

          {session.role === 'ADMIN' && (
            <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Menunggu ACC Bayar"
                value={pendingPaymentsCount}
                note={`Kas ACC: ${formatRupiah(verifiedTotalAmount)} · Klik buka Pembayaran`}
                icon={Wallet}
                tone="orange"
                active={activeTab === 'Pembayaran'}
                onClick={() => setActiveTab('Pembayaran')}
              />
              <MetricCard
                label="Kontainer terdaftar"
                value={stats?.bins.total_bins}
                note={`${stats?.bins.available_bins || 0} tersedia · Klik buka Kontainer`}
                icon={Trash2}
                active={activeTab === 'Kontainer'}
                onClick={() => setActiveTab('Kontainer')}
              />
              <MetricCard
                label="Laporan TPS liar"
                value={stats?.dumps.total_reports}
                note={`${stats?.dumps.reported || 0} perlu ditangani · Klik buka Ringkasan`}
                icon={MapPin}
                tone="rose"
                active={activeTab === 'Ringkasan'}
                onClick={() => setActiveTab('Ringkasan')}
              />
              <MetricCard
                label="Pengguna sistem"
                value={stats?.users.total_users}
                note={`${stats?.users.officers || 0} petugas · Klik buka Pengguna`}
                icon={Users}
                tone="blue"
                active={activeTab === 'Pengguna'}
                onClick={() => setActiveTab('Pengguna')}
              />
            </div>
          )}

          {session.role === 'ADMIN' && activeTab === 'Ringkasan' && (
            <div className="space-y-6">
              <Panel className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 px-5 py-4">
                  <div>
                    <h2 className="font-semibold text-ink">Peta operasional (Opsional / Pendukung)</h2>
                    <p className="mt-0.5 text-xs text-stone-500">Titik kontainer, laporan TPS liar, dan rute desa</p>
                  </div>
                  <div className="flex flex-wrap gap-3 text-[11px] text-stone-500">
                    <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-forest-600" />Kontainer</span>
                    <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-rose-500" />TPS liar</span>
                    <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-emerald-200" />Rute</span>
                  </div>
                </div>
                <div className="h-[340px]"><MapView overview={overview} /></div>
              </Panel>
            </div>
          )}

          {session.role === 'ADMIN' && activeTab === 'Kontainer' && (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_350px]">
              <div className="space-y-5">
                <Panel className="overflow-hidden">
                  <div className="border-b border-stone-100 px-5 py-4"><h2 className="font-semibold text-ink">Peta kontainer</h2><p className="mt-1 text-xs text-stone-500">Klik titik peta untuk memilih atau memperbarui koordinat.</p></div>
                  <div className="h-[380px]"><MapView overview={overview} onMapClick={onMapClick} selectedPoint={selectedPoint} /></div>
                </Panel>
                <Panel className="p-5">
                  <SectionHeading title="Daftar kontainer" description={`${overview.bins.length} titik terdaftar`} />
                  <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="text-xs text-stone-400"><tr><th className="pb-3 font-medium">Kode</th><th className="pb-3 font-medium">Kapasitas</th><th className="pb-3 font-medium">Status</th><th className="pb-3 font-medium">Lokasi</th><th className="pb-3" /></tr></thead><tbody className="divide-y divide-stone-100">{overview.bins.map((bin) => <tr key={bin.bin_id}><td className="py-3 font-semibold">{bin.bin_code}</td><td className="py-3">{bin.capacity} L</td><td className="py-3"><StatusBadge status={bin.status} /></td><td className="py-3 text-xs text-stone-500">{Number(bin.lat).toFixed(4)}, {Number(bin.lng).toFixed(4)}</td><td className="py-3 text-right"><button onClick={() => editBin(bin)} className="mr-3 text-xs font-semibold text-forest-700">Ubah</button><button onClick={() => window.confirm(`Hapus kontainer ${bin.bin_code}?`) && perform(() => api.delete(`/bins/${bin.bin_id}`), 'Kontainer dihapus.')} className="text-xs font-semibold text-rose-600">Hapus</button></td></tr>)}</tbody></table></div>
                </Panel>
              </div>
              <Panel className="h-fit p-5">
                <SectionHeading title={editingBinId ? 'Ubah kontainer' : 'Tambah kontainer'} description="Lengkapi informasi dan tandai lokasi di peta." />
                <form onSubmit={submitBin} className="space-y-4">
                  <Field label="Kode kontainer"><input className={inputClass} maxLength="20" value={binForm.bin_code} onChange={(event) => setBinForm({ ...binForm, bin_code: event.target.value })} required placeholder="Contoh: BAL-003" /></Field>
                  <Field label="Kapasitas (liter)"><input className={inputClass} type="number" min="1" value={binForm.capacity} onChange={(event) => setBinForm({ ...binForm, capacity: event.target.value })} required /></Field>
                  <Field label="Status"><select className={inputClass} value={binForm.status} onChange={(event) => setBinForm({ ...binForm, status: event.target.value })}><option value="AVAILABLE">Tersedia</option><option value="FULL">Penuh</option><option value="MAINTENANCE">Perawatan</option></select></Field>
                  <div className="rounded-xl bg-stone-50 p-3 text-xs text-stone-500">{selectedPoint ? `Lokasi: ${selectedPoint.lat.toFixed(5)}, ${selectedPoint.lng.toFixed(5)}` : 'Belum ada lokasi. Klik peta untuk menentukan titik.'}</div>
                  <PrimaryButton disabled={loading} className="w-full">{editingBinId ? <Check size={16} /> : <Plus size={16} />}{editingBinId ? 'Simpan perubahan' : 'Tambah kontainer'}</PrimaryButton>
                  {editingBinId && <SecondaryButton type="button" className="w-full" onClick={resetBinForm}>Batal mengubah</SecondaryButton>}
                </form>
              </Panel>
            </div>
          )}

          {session.role === 'ADMIN' && activeTab === 'Rute' && (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_350px]">
              <div className="space-y-5">
                <Panel className="overflow-hidden"><div className="border-b border-stone-100 px-5 py-4"><h2 className="font-semibold text-ink">Peta batas rute</h2><p className="mt-1 text-xs text-stone-500">Klik peta untuk menambahkan titik batas polygon (minimal 3 titik).</p></div><div className="h-[380px]"><MapView overview={overview} onMapClick={onMapClick} polygonPoints={polygonPoints} /></div></Panel>
                <Panel className="p-5"><SectionHeading title="Jadwal pengangkutan" description={`${overview.routes.length} rute tersedia`} />{overview.routes.length ? <div className="space-y-3">{overview.routes.map((route) => <div key={route.route_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-100 p-4"><div className="flex items-start gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-forest-50 text-forest-700"><RouteIcon size={18} /></div><div><p className="font-semibold text-ink">{route.route_name}</p><p className="mt-1 text-xs text-stone-500">{route.schedule} · {route.officer_name}</p></div></div><div className="flex gap-3"><button onClick={() => editRoute(route)} className="text-xs font-semibold text-forest-700">Ubah</button><button onClick={() => window.confirm(`Hapus rute ${route.route_name}?`) && perform(() => api.delete(`/routes/${route.route_id}`), 'Rute dihapus.')} className="text-xs font-semibold text-rose-600">Hapus</button></div></div>)}</div> : <EmptyState>Belum ada rute pengangkutan.</EmptyState>}</Panel>
              </div>
              <Panel className="h-fit p-5">
                <SectionHeading title={editingRouteId ? 'Ubah rute' : 'Buat rute'} description="Gambar batas area pada peta." />
                <form onSubmit={submitRoute} className="space-y-4">
                  <Field label="Nama rute"><input className={inputClass} maxLength="100" value={routeForm.route_name} onChange={(event) => setRouteForm({ ...routeForm, route_name: event.target.value })} required placeholder="Rute Balunijuk Utara" /></Field>
                  <Field label="Jadwal"><input className={inputClass} maxLength="50" value={routeForm.schedule} onChange={(event) => setRouteForm({ ...routeForm, schedule: event.target.value })} required placeholder="Senin & Kamis, 07.00" /></Field>
                  <Field label="Petugas"><select className={inputClass} value={routeForm.officer_id} onChange={(event) => setRouteForm({ ...routeForm, officer_id: event.target.value })} required><option value="">Pilih petugas</option>{users.filter((user) => user.role === 'OFFICER').map((user) => <option key={user.user_id} value={user.user_id}>{user.full_name}</option>)}</select></Field>
                  <div className="rounded-xl bg-stone-50 p-3 text-xs text-stone-500">{polygonPoints.length} titik dipilih · perlu minimal 3 titik</div>
                  {polygonPoints.length > 0 && <SecondaryButton type="button" className="w-full" onClick={() => setPolygonPoints((points) => points.slice(0, -1))}>Hapus titik terakhir</SecondaryButton>}
                  <PrimaryButton disabled={loading} className="w-full"><Plus size={16} />{editingRouteId ? 'Simpan perubahan' : 'Simpan rute'}</PrimaryButton>
                  {editingRouteId && <SecondaryButton type="button" className="w-full" onClick={resetRouteForm}>Batal mengubah</SecondaryButton>}
                </form>
              </Panel>
            </div>
          )}

          {session.role === 'ADMIN' && activeTab === 'Pengguna' && (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_350px]">
              <Panel className="p-5">
                <SectionHeading title="Pengguna terdaftar" description={`${users.length} akun`} />
                <div className="mb-4 flex items-center gap-2 rounded-xl bg-stone-50 px-3 py-2 text-stone-400"><Search size={16} /><span className="text-xs">Pengelolaan akun desa</span></div>
                <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="text-xs text-stone-400"><tr><th className="pb-3 font-medium">Nama</th><th className="pb-3 font-medium">Nomor telepon</th><th className="pb-3 font-medium">Role</th><th className="pb-3" /></tr></thead><tbody className="divide-y divide-stone-100">{users.map((user) => <tr key={user.user_id}><td className="py-3 font-semibold">{user.full_name}</td><td className="py-3 text-stone-500">{user.phone_number}</td><td className="py-3"><span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-bold text-stone-600">{roleLabels[user.role]}</span></td><td className="py-3 text-right"><button onClick={() => editUser(user)} className="mr-3 text-xs font-semibold text-forest-700">Ubah</button>{user.user_id !== session.id && <button onClick={() => window.confirm(`Hapus pengguna ${user.full_name}?`) && perform(() => api.delete(`/users/${user.user_id}`), 'Pengguna dihapus.')} className="text-xs font-semibold text-rose-600">Hapus</button>}</td></tr>)}</tbody></table></div>
              </Panel>
              <Panel className="h-fit p-5">
                <SectionHeading title={editingUserId ? 'Ubah pengguna' : 'Tambah pengguna'} description="Kelola akun warga dan petugas." />
                <form onSubmit={submitUser} className="space-y-4">
                  <Field label="Nama lengkap"><input className={inputClass} maxLength="100" value={userForm.full_name} onChange={(event) => setUserForm({ ...userForm, full_name: event.target.value })} required /></Field>
                  <Field label="Nomor telepon"><input className={inputClass} maxLength="15" value={userForm.phone_number} onChange={(event) => setUserForm({ ...userForm, phone_number: event.target.value })} required /></Field>
                  <Field label="Role"><select className={inputClass} value={userForm.role} onChange={(event) => setUserForm({ ...userForm, role: event.target.value })}><option value="RESIDENT">Warga</option><option value="ADMIN">Admin</option></select></Field>
                  <PrimaryButton disabled={loading} className="w-full">{editingUserId ? 'Simpan perubahan' : 'Tambah pengguna'}</PrimaryButton>
                  {editingUserId && <SecondaryButton type="button" className="w-full" onClick={() => { setUserForm(emptyUser); setEditingUserId(null); }}>Batal mengubah</SecondaryButton>}
                </form>
              </Panel>
            </div>
          )}

          {session.role === 'ADMIN' && activeTab === 'Pembayaran' && (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
              <Panel className="p-5">
                <SectionHeading title="Verifikasi pembayaran bulanan" description="Periksa bukti QRIS/Transfer atau penerimaan Tunai lalu klik ACC." />
                {adminPayments.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[680px] text-left text-sm">
                      <thead className="text-xs text-stone-400">
                        <tr>
                          <th className="pb-3 font-medium">Warga</th>
                          <th className="pb-3 font-medium">Periode & Nominal</th>
                          <th className="pb-3 font-medium">Metode & Catatan</th>
                          <th className="pb-3 font-medium">Bukti</th>
                          <th className="pb-3 font-medium">Status</th>
                          <th className="pb-3 text-right font-medium">Aksi ACC</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {adminPayments.map((pay) => (
                          <tr key={pay.payment_id}>
                            <td className="py-3">
                              <p className="font-semibold text-ink">{pay.resident_name}</p>
                              <p className="text-xs text-stone-500">{pay.phone_number}</p>
                            </td>
                            <td className="py-3">
                              <p className="font-medium text-ink">{formatMonthLabel(pay.billing_month)}</p>
                              <p className="text-xs text-stone-600">{formatRupiah(pay.amount)}</p>
                            </td>
                            <td className="py-3 text-xs text-stone-600">
                              <p className="font-semibold text-ink">{pay.payment_method === 'CASH' ? 'Tunai (CASH)' : 'Transfer / QRIS'}</p>
                              {pay.payment_reference && <p className="text-stone-500">Ref: {pay.payment_reference}</p>}
                              {pay.notes && <p className="text-stone-500">{pay.notes}</p>}
                            </td>
                            <td className="py-3">
                              {pay.proof_url ? (
                                <a href={getPhotoUrl(pay.proof_url)} target="_blank" rel="noreferrer" className="inline-block">
                                  <img src={getPhotoUrl(pay.proof_url)} alt="Bukti bayar" className="h-12 w-12 rounded-lg border border-stone-200 object-cover" />
                                </a>
                              ) : (
                                <span className="text-xs text-stone-400">Tanpa foto</span>
                              )}
                            </td>
                            <td className="py-3"><StatusBadge status={pay.payment_status} /></td>
                            <td className="py-3 text-right">
                              {pay.payment_status === 'PENDING' ? (
                                <div className="flex justify-end gap-2">
                                  <button
                                    type="button"
                                    disabled={loading}
                                    onClick={() => verifyPayment(pay.payment_id, 'APPROVE')}
                                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                                  >
                                    ACC
                                  </button>
                                  <button
                                    type="button"
                                    disabled={loading}
                                    onClick={() => verifyPayment(pay.payment_id, 'REJECT')}
                                    className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                                  >
                                    Tolak
                                  </button>
                                </div>
                              ) : (
                                <span className="text-xs text-stone-400">Selesai</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState>Belum ada pembayaran warga yang masuk.</EmptyState>
                )}
              </Panel>

              <Panel className="h-fit p-5">
                <SectionHeading title="Buat tagihan bulanan" description="Terbitkan tagihan iuran untuk seluruh akun Warga." />
                <form onSubmit={generateMonthlyBills} className="space-y-4">
                  <Field label="Bulan tagihan">
                    <input
                      type="month"
                      className={inputClass}
                      value={billGenForm.billing_month}
                      onChange={(e) => setBillGenForm({ ...billGenForm, billing_month: e.target.value })}
                      required
                    />
                  </Field>
                  <Field label="Nominal iuran (Rp)">
                    <input
                      type="number"
                      min="1000"
                      step="500"
                      className={inputClass}
                      value={billGenForm.amount}
                      onChange={(e) => setBillGenForm({ ...billGenForm, amount: e.target.value })}
                      required
                    />
                  </Field>
                  <Field label="Keterangan">
                    <input
                      className={inputClass}
                      value={billGenForm.bill_description}
                      onChange={(e) => setBillGenForm({ ...billGenForm, bill_description: e.target.value })}
                      required
                    />
                  </Field>
                  <PrimaryButton type="submit" disabled={loading} className="w-full">
                    <Plus size={16} /> Terbitkan Tagihan Warga
                  </PrimaryButton>
                </form>
              </Panel>
            </div>
          )}

          {session.role === 'RESIDENT' && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-3">
                <MetricCard
                  label="Tagihan Belum Bayar"
                  value={residentSummary.unpaid}
                  note="Klik untuk buka pembayaran"
                  icon={Wallet}
                  tone="rose"
                  onClick={() => {
                    const target = myBills.find((b) => b.status === 'UNPAID' || b.payment_status === 'REJECTED');
                    setSelectedBillId(target ? target.bill_id : 'DEMO');
                    document.getElementById('bagian-tagihan')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                />
                <MetricCard
                  label="Menunggu ACC Admin"
                  value={residentSummary.pending}
                  note="Klik untuk lihat daftar tagihan"
                  icon={CreditCard}
                  tone="orange"
                  onClick={() => {
                    document.getElementById('bagian-tagihan')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                />
                <MetricCard
                  label="Sudah Lunas (ACC)"
                  value={residentSummary.paid}
                  note="Klik untuk lihat riwayat tagihan"
                  icon={Check}
                  tone="green"
                  onClick={() => {
                    document.getElementById('bagian-tagihan')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                />
              </div>

              <Panel id="bagian-tagihan" className="p-5">
                <SectionHeading
                  title="Tagihan iuran bulanan saya"
                  description="Pilih tagihan lalu bayar lewat QRIS, Transfer Bank, atau Tunai."
                  action={
                    <SecondaryButton
                      type="button"
                      onClick={() => {
                        const target = myBills.find((b) => b.status === 'UNPAID' || b.payment_status === 'REJECTED');
                        setSelectedBillId(target ? target.bill_id : 'DEMO');
                        setPayChannel('QRIS');
                      }}
                    >
                      <CreditCard size={15} /> {selectedBillId ? 'Tutup Form Bayar' : 'Buka Form Pembayaran'}
                    </SecondaryButton>
                  }
                />

                {myBills.length ? (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {myBills.map((bill) => {
                      const isSelected = selectedBillId === bill.bill_id;
                      const canPay = bill.status === 'UNPAID' || bill.payment_status === 'REJECTED';
                      return (
                        <div
                          key={bill.bill_id}
                          onClick={() => {
                            if (canPay) {
                              setSelectedBillId(bill.bill_id);
                              setPayChannel('QRIS');
                              setPayProofFile(null);
                              setPayReference('');
                              setPayNotes('');
                            }
                          }}
                          className={`flex flex-col justify-between rounded-2xl border p-4 transition ${canPay ? 'cursor-pointer hover:border-forest-400' : ''} ${isSelected ? 'border-forest-600 bg-forest-50/40 ring-2 ring-forest-200' : 'border-stone-200/80 bg-stone-50/50'}`}
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-bold text-ink">{formatMonthLabel(bill.billing_month)}</p>
                              <StatusBadge status={bill.status} />
                            </div>
                            <p className="mt-2 text-2xl font-semibold text-forest-800">{formatRupiah(bill.amount)}</p>
                            <p className="mt-1 text-xs text-stone-500">{bill.bill_description || 'Iuran sampah bulanan'}</p>
                            {bill.proof_url && (
                              <a
                                href={getPhotoUrl(bill.proof_url)}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-forest-700 underline"
                              >
                                <img src={getPhotoUrl(bill.proof_url)} alt="Bukti pembayaran" className="h-9 w-9 rounded-lg object-cover" />
                                Lihat bukti pembayaran
                              </a>
                            )}
                          </div>
                          <div className="mt-4 pt-3 border-t border-stone-200/70">
                            {canPay && (
                              <PrimaryButton
                                type="button"
                                className="w-full py-2 text-xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedBillId(isSelected ? null : bill.bill_id);
                                  setPayChannel('QRIS');
                                  setPayProofFile(null);
                                  setPayReference('');
                                  setPayNotes('');
                                }}
                              >
                                <CreditCard size={15} /> {isSelected ? 'Tutup Form Bayar' : 'Klik untuk Bayar'}
                              </PrimaryButton>
                            )}
                            {bill.status === 'PENDING' && (
                              <p className="text-xs font-medium text-amber-700">Menunggu verifikasi / ACC Admin.</p>
                            )}
                            {bill.status === 'PAID' && (
                              <p className="text-xs font-semibold text-emerald-700">Pembayaran sudah di-ACC (Lunas).</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState>
                    Belum ada tagihan bulanan untuk akun Anda. Klik tombol <strong>Buka Form Pembayaran</strong> di kanan atas untuk melihat tampilan QRIS, Transfer (Bank & No. Rekening), dan Tunai.
                  </EmptyState>
                )}

                {selectedBillId && (
                  <form
                    onSubmit={(e) => {
                      if (selectedBillId === 'DEMO') {
                        e.preventDefault();
                        showNotice('Ini pratinjau form pembayaran. Terbitkan tagihan dari Admin agar tersimpan ke database.', true);
                        return;
                      }
                      submitBillPayment(e);
                    }}
                    className="mt-5 rounded-2xl border border-forest-200 bg-forest-50/40 p-5 space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-ink">
                        {selectedBillId === 'DEMO'
                          ? 'Pratinjau Form Pembayaran Iuran Bulanan (Rp 25.000)'
                          : `Form Pembayaran Tagihan #${selectedBillId} (${formatRupiah(activeBill?.amount)})`}
                      </h3>
                      <button type="button" onClick={() => setSelectedBillId(null)} className="text-xs font-semibold text-stone-500 hover:text-ink">Tutup</button>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {[
                        ['QRIS', 'QRIS'],
                        ['TRANSFER', 'Transfer'],
                        ['CASH', 'Tunai']
                      ].map(([code, label]) => (
                        <button
                          key={code}
                          type="button"
                          onClick={() => { setPayChannel(code); if (code === 'CASH') setPayProofFile(null); }}
                          className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${payChannel === code ? 'border-forest-700 bg-forest-700 text-white' : 'border-stone-200 bg-white text-stone-700'}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {payChannel === 'QRIS' && (
                      <QrisSampleCard
                        billId={selectedBillId === 'DEMO' ? 1 : selectedBillId}
                        amount={activeBill?.amount ?? 25000}
                      />
                    )}

                    {payChannel === 'TRANSFER' && (
                      <div className="rounded-2xl border border-stone-200 bg-white p-4 text-xs text-stone-600 space-y-1">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-forest-700">Informasi Bank & Rekening Penerima (Admin)</p>
                        <p className="text-sm font-bold text-ink">Bank: {ADMIN_PAYMENT_INFO.bankName}</p>
                        <p className="text-sm font-bold text-ink">No. Rekening: {ADMIN_PAYMENT_INFO.accountNumber}</p>
                        <p>Atas Nama: <strong className="text-ink">{ADMIN_PAYMENT_INFO.accountHolder}</strong></p>
                        <p>Nominal Transfer: <strong className="text-forest-800">{formatRupiah(activeBill?.amount ?? 25000)}</strong></p>
                      </div>
                    )}

                    {payChannel === 'CASH' && (
                      <div className="rounded-2xl border border-stone-200 bg-white p-4 text-xs text-stone-600">
                        <p className="font-semibold text-ink">Pembayaran Tunai</p>
                        <p className="mt-1">Tidak wajib mengunggah foto bukti. Tuliskan catatan penyerahan uang tunai agar Admin dapat mengecek dan memberi ACC.</p>
                      </div>
                    )}

                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label={payChannel === 'CASH' ? 'No. Kwitansi / Referensi (Opsional)' : 'No. Referensi / Nama Pengirim (Opsional)'}>
                        <input
                          className={inputClass}
                          value={payReference}
                          onChange={(e) => setPayReference(e.target.value)}
                          placeholder={payChannel === 'CASH' ? 'Contoh: Kwitansi #12' : 'Contoh: Transfer a.n. Budi'}
                        />
                      </Field>
                      <Field label="Catatan">
                        <input
                          className={inputClass}
                          value={payNotes}
                          onChange={(e) => setPayNotes(e.target.value)}
                          placeholder={payChannel === 'CASH' ? 'Contoh: Bayar tunai ke kantor desa' : 'Catatan tambahan...'}
                          required={payChannel === 'CASH'}
                        />
                      </Field>
                    </div>

                    {payChannel !== 'CASH' && (
                      <Field label="Foto bukti pembayaran (Wajib saat kirim tagihan asli)">
                        <span className="mt-1.5 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-stone-300 bg-white p-3 hover:border-forest-500">
                          <FileImage className="text-forest-600" size={19} />
                          <span className="min-w-0 flex-1 truncate text-xs text-stone-500">
                            {payProofFile?.name || 'Pilih foto bukti transfer / QRIS (maks. 5 MB)'}
                          </span>
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/gif"
                            className="sr-only"
                            onChange={(e) => setPayProofFile(e.target.files?.[0] || null)}
                            required={selectedBillId !== 'DEMO'}
                          />
                        </span>
                      </Field>
                    )}

                    <PrimaryButton type="submit" disabled={loading} className="w-full">
                      <Check size={16} /> Kirim Pembayaran (Menunggu ACC Admin)
                    </PrimaryButton>
                  </form>
                )}
              </Panel>
              
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(310px,.75fr)]">
                <div className="space-y-5">
                  <Panel className="overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 px-5 py-4">
                      <div>
                        <h2 className="font-semibold text-ink">Peta titik sampah (Pendukung Laporan)</h2>
                        <p className="mt-1 text-xs text-stone-500">Klik lokasi yang ingin dilaporkan sebagai TPS liar.</p>
                      </div>
                      <span className="rounded-full bg-forest-50 px-3 py-1.5 text-[11px] font-semibold text-forest-700">Klik peta untuk pin lokasi</span>
                    </div>
                    <div className="h-[360px]"><MapView overview={overview} onMapClick={onMapClick} selectedPoint={selectedPoint} /></div>
                  </Panel>
                  <Panel className="p-5">
                    <SectionHeading title="Riwayat laporan saya" description={`${myReports.length} laporan terkirim`} />
                    {myReports.length ? (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[520px] text-left text-sm">
                          <thead className="text-xs text-stone-400"><tr><th className="pb-3 font-medium">Laporan</th><th className="pb-3 font-medium">Lokasi</th><th className="pb-3 font-medium">Status</th><th className="pb-3 font-medium">Tanggal</th></tr></thead>
                          <tbody className="divide-y divide-stone-100">{myReports.map((report) => <tr key={report.dump_id}><td className="py-3"><div className="flex items-center gap-2"><img className="h-10 w-10 rounded-lg object-cover" src={getPhotoUrl(report.photo_url)} alt="Foto laporan" /><span className="max-w-40 truncate text-xs text-stone-600">{report.description}</span></div></td><td className="py-3 text-xs text-stone-500">{Number(report.lat).toFixed(4)}, {Number(report.lng).toFixed(4)}</td><td className="py-3"><StatusBadge status={report.status} /></td><td className="py-3 text-xs text-stone-500">{new Date(report.created_at).toLocaleDateString('id-ID')}</td></tr>)}</tbody>
                        </table>
                      </div>
                    ) : <EmptyState>Belum ada laporan. Tandai lokasi dan kirim laporan pertamamu.</EmptyState>}
                  </Panel>
                </div>
                <div className="space-y-5">
                  <Panel className="p-5">
                    <SectionHeading title="Lapor TPS liar" description="Bagikan informasi lokasi sampah." />
                    <form onSubmit={submitDump} className="space-y-4">
                      <Field label="Deskripsi lokasi"><textarea className={`${inputClass} min-h-28 resize-y`} maxLength="2000" value={dumpForm.description} onChange={(event) => setDumpForm({ ...dumpForm, description: event.target.value })} required placeholder="Ceritakan kondisi atau patokan lokasi..." /></Field>
                      <Field label="Foto bukti"><span className="mt-1.5 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-stone-300 bg-stone-50 p-3 hover:border-forest-500"><FileImage className="text-forest-600" size={19} /><span className="min-w-0 flex-1 truncate text-xs text-stone-500">{dumpForm.photo?.name || 'Pilih foto (maks. 5 MB)'}</span><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={(event) => setDumpForm({ ...dumpForm, photo: event.target.files?.[0] || null })} required /></span></Field>
                      <div className="rounded-xl bg-stone-50 p-3 text-xs text-stone-500">{selectedPoint ? `Koordinat: ${selectedPoint.lat.toFixed(5)}, ${selectedPoint.lng.toFixed(5)}` : 'Lokasi belum dipilih. Klik peta untuk menandai.'}</div>
                      <PrimaryButton disabled={loading} className="w-full"><MapPin size={16} />Kirim laporan</PrimaryButton>
                    </form>
                  </Panel>
                </div>
              </div>
            </div>
          )}

          {session.role === 'OFFICER' && activeTab === 'Tugas saya' && (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-3"><MetricCard label="Rute tugas" value={overview.routes.length} note="Rute yang ditugaskan kepada Anda" icon={RouteIcon} /><MetricCard label="Perlu ditangani" value={overview.dumps.filter((dump) => dump.status === 'REPORTED').length} note="Laporan baru dari warga" icon={MapPin} tone="rose" /><MetricCard label="Dalam proses" value={overview.dumps.filter((dump) => dump.status === 'IN_PROGRESS').length} note="Laporan aktif ditangani" icon={Truck} tone="orange" /></div>
              <Panel className="overflow-hidden"><div className="border-b border-stone-100 px-5 py-4"><h2 className="font-semibold text-ink">Peta tugas</h2><p className="mt-1 text-xs text-stone-500">Rute khusus petugas, kontainer, dan laporan TPS liar.</p></div><div className="h-[360px]"><MapView overview={overview} /></div></Panel>
              <div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
                <Panel className="p-5"><SectionHeading title="Rute pengangkutan" description="Jadwal tugas yang ditetapkan" />{overview.routes.length ? <div className="space-y-3">{overview.routes.map((route) => <div key={route.route_id} className="rounded-xl bg-stone-50 p-4"><div className="flex items-center gap-2 font-semibold"><RouteIcon size={16} className="text-forest-700" />{route.route_name}</div><p className="mt-2 text-xs text-stone-500">{route.schedule}</p></div>)}</div> : <EmptyState>Belum ada rute yang ditugaskan.</EmptyState>}
                  <div className="mt-6 border-t border-stone-100 pt-5"><SectionHeading title="Kontainer" description="Perbarui kondisi lapangan" />{overview.bins.map((bin) => <div key={bin.bin_id} className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-100 p-3"><div><p className="text-sm font-semibold">{bin.bin_code}</p><p className="mt-1 text-xs text-stone-500">{bin.capacity} L</p></div><select className="rounded-lg border border-stone-200 px-2 py-1.5 text-xs" value={bin.status} onChange={(event) => perform(() => api.patch(`/bins/${bin.bin_id}/status`, { status: event.target.value }), 'Status kontainer diperbarui.')}><option value="AVAILABLE">Tersedia</option><option value="FULL">Penuh</option><option value="MAINTENANCE">Perawatan</option></select></div>)}</div>
                </Panel>
                <Panel className="p-5"><SectionHeading title="Laporan TPS liar" description="Tindak lanjuti laporan warga" />{overview.dumps.length ? <div className="space-y-3">{overview.dumps.map((dump) => <article key={dump.dump_id} className="rounded-xl border border-stone-100 p-4"><div className="flex flex-wrap items-start gap-3">{dump.photo_url ? <img className="h-16 w-16 shrink-0 rounded-xl object-cover" src={getPhotoUrl(dump.photo_url)} alt="Foto titik sampah" /> : <div className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-stone-100 text-stone-400"><FileImage size={20} /></div>}<div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-ink">Laporan #{dump.dump_id}</p><StatusBadge status={dump.status} /></div><p className="mt-1 text-sm text-stone-600">{dump.description}</p><p className="mt-1 text-xs text-stone-400">{dump.reporter_name} · {Number(dump.lat).toFixed(4)}, {Number(dump.lng).toFixed(4)}</p></div></div>{dump.status === 'REPORTED' && <PrimaryButton className="mt-3 py-2 text-xs" onClick={() => beginCleanup(dump.dump_id)} disabled={loading}><Truck size={14} />Mulai penanganan</PrimaryButton>}{dump.status === 'IN_PROGRESS' && <div className="mt-3">{editingDumpId === dump.dump_id ? <form onSubmit={completeCleanup} className="space-y-2"><textarea className={`${inputClass} min-h-20`} value={cleanupNotes} onChange={(event) => setCleanupNotes(event.target.value)} placeholder="Catatan hasil pembersihan..." required /><div className="flex gap-2"><PrimaryButton className="py-2 text-xs" disabled={loading}><Check size={14} />Tandai selesai</PrimaryButton><SecondaryButton type="button" className="py-2 text-xs" onClick={() => { setEditingDumpId(null); setCleanupNotes(''); }}>Batal</SecondaryButton></div></form> : <SecondaryButton className="py-2 text-xs" onClick={() => setEditingDumpId(dump.dump_id)}><Check size={14} />Isi laporan pembersihan</SecondaryButton>}</div>}</article>)}</div> : <EmptyState>Belum ada laporan TPS liar.</EmptyState>}</Panel>
              </div>
            </div>
          )}

          {session.role === 'OFFICER' && activeTab === 'Riwayat bersih' && (
            <Panel className="p-5"><SectionHeading title="Riwayat pembersihan" description="Laporan penyelesaian yang telah dikirim" />{cleanupReports.length ? <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm"><thead className="text-xs text-stone-400"><tr><th className="pb-3 font-medium">Laporan</th><th className="pb-3 font-medium">Catatan</th><th className="pb-3 font-medium">Waktu selesai</th><th className="pb-3 font-medium">Status</th></tr></thead><tbody className="divide-y divide-stone-100">{cleanupReports.map((report) => <tr key={report.report_id}><td className="py-3 font-semibold">#{report.dump_id} · {report.dump_description}</td><td className="py-3 text-stone-500">{report.notes}</td><td className="py-3 text-xs text-stone-500">{new Date(report.cleaned_at).toLocaleString('id-ID')}</td><td className="py-3"><StatusBadge status="CLEANED" /></td></tr>)}</tbody></table></div> : <EmptyState>Riwayat pembersihan akan tampil setelah laporan diselesaikan.</EmptyState>}</Panel>
          )}

          {session.role === 'ADMIN' && activeTab === 'Riwayat Aktivitas (Activity Log)' && (
            <Panel className="p-5">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <SectionHeading title="Riwayat Aktivitas (Activity Log)" description="50 aktivitas terbaru dari database." />
                <div className="flex items-center gap-3">
                  <span className="text-xs text-stone-400">Pembaruan otomatis setiap 15 detik</span>
                  <SecondaryButton
                    type="button"
                    onClick={() => api.get('/activity-logs')
                      .then(({ data }) => setActivityLogs(data))
                      .catch((error) => showNotice(getErrorMessage(error), true))}
                  >
                    Perbarui
                  </SecondaryButton>
                </div>
              </div>
              {activityLogs.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="text-xs text-stone-400">
                      <tr>
                        <th className="pb-3 font-medium">Waktu</th>
                        <th className="pb-3 font-medium">Pelaku</th>
                        <th className="pb-3 font-medium">Role</th>
                        <th className="pb-3 font-medium">Aksi</th>
                        <th className="pb-3 font-medium">Deskripsi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {activityLogs.map((log) => (
                        <tr key={log.log_id}>
                          <td className="whitespace-nowrap py-3 text-xs text-stone-500">{new Date(log.created_at).toLocaleString('id-ID')}</td>
                          <td className="py-3 font-medium text-ink">{log.actor_name || 'Pengguna tidak diketahui'}</td>
                          <td className="py-3 text-stone-500">{roleLabels[log.role] || log.role || '—'}</td>
                          <td className="py-3"><span className="rounded-full bg-forest-50 px-2.5 py-1 text-[11px] font-bold text-forest-700">{log.action}</span></td>
                          <td className="max-w-md py-3 text-stone-600">{log.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <EmptyState>Belum ada aktivitas tercatat.</EmptyState>}
            </Panel>
          )}

          <footer className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-stone-200 pt-4 text-[11px] text-stone-400">
            <span>© 2026 Sistem Pengelolaan Sampah Desa Balunijuk & Pagarawan</span>
            <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Data peta © OpenStreetMap</span>
          </footer>
        </main>
      </div>
    </div>
  );
}

export default App;