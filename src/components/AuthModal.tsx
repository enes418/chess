import React, { useEffect, useState } from 'react';
import { Loader2, Lock, Mail, ShieldCheck, User, X } from 'lucide-react';
import { DEFAULT_AVATARS } from '../services/firebase';
import {
  claimAdminAccount,
  getAdminStatus,
  loginAdminAccount,
  loginSiteAccount,
  registerSiteAccount,
  type AdminStatusResponse,
  type AuthSessionResponse,
} from '../services/localAuthApi';

export type AuthMode = 'register' | 'login' | 'admin';

interface AuthPanelProps {
  initialMode?: AuthMode;
  onSuccess: (session: AuthSessionResponse) => void;
  onGoogleSignIn?: () => Promise<void>;
  onClose?: () => void;
}

export const AuthFormCard: React.FC<AuthPanelProps> = ({
  initialMode = 'register',
  onSuccess,
  onGoogleSignIn,
  onClose,
}) => {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(DEFAULT_AVATARS[1]);

  // Yönetici (Admin) durumu
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminConfirmPassword, setAdminConfirmPassword] = useState('');
  const [adminStatus, setAdminStatus] = useState<AdminStatusResponse | null>(null);
  const [adminStatusLoading, setAdminStatusLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (mode !== 'admin') return;
    let cancelled = false;
    setAdminStatusLoading(true);
    getAdminStatus()
      .then((status) => {
        if (!cancelled) setAdminStatus(status);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Admin durumu yüklenemedi.');
        }
      })
      .finally(() => {
        if (!cancelled) setAdminStatusLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'register') {
      if (username.trim().length < 2) {
        setError('Kullanıcı adı en az 2 karakter olmalıdır.');
        return;
      }
      if (!email.includes('@')) {
        setError('Lütfen geçerli bir e-posta adresi girin.');
        return;
      }
      if (password.length < 6) {
        setError('Şifre en az 6 karakter uzunluğunda olmalıdır.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Şifreler birbiriyle eşleşmiyor.');
        return;
      }
      setIsSubmitting(true);
      try {
        const session = await registerSiteAccount({
          username: username.trim(),
          email: email.trim(),
          password,
          avatarUrl,
        });
        onSuccess(session);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Kayıt işlemi başarısız oldu.');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (mode === 'login') {
      if (!identifier.trim() || !password) {
        setError('Lütfen kullanıcı adı/e-posta ve şifrenizi girin.');
        return;
      }
      setIsSubmitting(true);
      try {
        const session = await loginSiteAccount({
          identifier: identifier.trim(),
          password,
        });
        onSuccess(session);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Giriş yapılamadı.');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // Admin modu
    if (adminUsername.trim().length < 2 || !adminPassword) {
      setError('Lütfen admin kullanıcı adı ve şifresini girin.');
      return;
    }

    if (adminStatus?.needsClaim) {
      if (adminPassword.length < 4) {
        setError('Admin şifresi en az 4 karakter olmalıdır.');
        return;
      }
      if (adminPassword !== adminConfirmPassword) {
        setError('Admin şifreleri birbiriyle eşleşmiyor.');
        return;
      }
      setIsSubmitting(true);
      try {
        const session = await claimAdminAccount({
          username: adminUsername.trim(),
          password: adminPassword,
        });
        onSuccess(session);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Admin hesabı oluşturulamadı.');
      } finally {
        setIsSubmitting(false);
      }
    } else {
      setIsSubmitting(true);
      try {
        const session = await loginAdminAccount({
          username: adminUsername.trim(),
          password: adminPassword,
        });
        onSuccess(session);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Admin girişi başarısız oldu.');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const title =
    mode === 'register'
      ? 'Chess Arena Hesabı Oluştur'
      : mode === 'login'
        ? 'Chess Arena’ya Giriş Yap'
        : adminStatus?.needsClaim
          ? 'Yönetici (Admin) Hesabını Kur'
          : 'Yönetici (Admin) Girişi';

  const subtitle =
    mode === 'register'
      ? 'ELO puanını kaydet, arkadaş ekle ve gerçek zamanlı VS davetleriyle maç yap.'
      : mode === 'login'
        ? 'ELO puanına, arkadaş listene ve kayıtlı ayarlarına eriş.'
        : adminStatus?.needsClaim
          ? 'İlk kurulum: yönetici hesabını tanımlayın. Kurulum tamamlandıktan sonra kilitlenir.'
          : 'Oyuncuları, aktif odaları ve satranç hile motorunu yönetin.';

  return (
    <div className="w-full rounded-2xl border border-white/10 bg-[#262522] p-6 shadow-2xl space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            {mode === 'admin' && <ShieldCheck className="w-5 h-5 text-amber-400 shrink-0" />}
            <span>{title}</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">{subtitle}</p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Mod Sekmeleri */}
      <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[#1E1D1A] border border-white/[0.08]">
        <button
          type="button"
          onClick={() => {
            setMode('register');
            setError(null);
          }}
          className={`py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
            mode === 'register' ? 'bg-[#81B64C] text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          Kayıt Ol
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('login');
            setError(null);
          }}
          className={`py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
            mode === 'login' ? 'bg-[#81B64C] text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          Giriş Yap
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('admin');
            setError(null);
          }}
          className={`py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
            mode === 'admin' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          Admin
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3.5">
        {mode === 'register' && (
          <>
            <div>
              <label className="block text-xs text-slate-300 mb-1.5">Kullanıcı Adı</label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={32}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="BuyukustaTal"
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-[#1E1D1A] border border-white/10 focus:border-[#81B64C]/60 outline-none text-sm text-white placeholder:text-slate-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-300 mb-1.5">E-posta Adresi</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="oyuncu@chessarena.io"
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-[#1E1D1A] border border-white/10 focus:border-[#81B64C]/60 outline-none text-sm text-white placeholder:text-slate-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-300 mb-1.5">Şifre</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="En az 6 karakter"
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-[#1E1D1A] border border-white/10 focus:border-[#81B64C]/60 outline-none text-sm text-white placeholder:text-slate-600"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1.5">Şifre Tekrar</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Şifreyi tekrar girin"
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-[#1E1D1A] border border-white/10 focus:border-[#81B64C]/60 outline-none text-sm text-white placeholder:text-slate-600"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-300 mb-1.5">Profil Simgesi Seç</label>
              <div className="flex items-center gap-3">
                {DEFAULT_AVATARS.map((url) => (
                  <button
                    key={url}
                    type="button"
                    onClick={() => setAvatarUrl(url)}
                    className={`rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${
                      avatarUrl === url
                        ? 'border-[#81B64C] scale-105'
                        : 'border-transparent opacity-65 hover:opacity-100'
                    }`}
                  >
                    <img
                      src={url}
                      alt="Oyuncu simgesi"
                      referrerPolicy="no-referrer"
                      className="w-11 h-11 object-cover"
                    />
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {mode === 'login' && (
          <>
            <div>
              <label className="block text-xs text-slate-300 mb-1.5">E-posta veya Kullanıcı Adı</label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="oyuncu@chessarena.io veya kullanıcı adı"
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-[#1E1D1A] border border-white/10 focus:border-[#81B64C]/60 outline-none text-sm text-white placeholder:text-slate-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-300 mb-1.5">Şifre</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Şifrenizi girin"
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-[#1E1D1A] border border-white/10 focus:border-[#81B64C]/60 outline-none text-sm text-white placeholder:text-slate-600"
                />
              </div>
            </div>
          </>
        )}

        {mode === 'admin' && (
          <>
            {adminStatusLoading ? (
              <div className="py-6 flex items-center justify-center gap-2 text-xs text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                Admin yapılandırması kontrol ediliyor...
              </div>
            ) : (
              <>
                {adminStatus?.needsClaim && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-200 leading-relaxed">
                    Henüz bir yönetici tanımlanmamış. Aşağıdan admin kullanıcı adı ve şifrenizi
                    belirleyin. Kurulum tamamlandıktan sonra kilitlenir.
                  </div>
                )}

                <div>
                  <label className="block text-xs text-slate-300 mb-1.5">Admin Kullanıcı Adı</label>
                  <div className="relative">
                    <ShieldCheck className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      minLength={2}
                      maxLength={32}
                      value={adminUsername}
                      onChange={(e) => setAdminUsername(e.target.value)}
                      placeholder="Admin kullanıcı adı"
                      className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-[#1E1D1A] border border-white/10 focus:border-amber-500/60 outline-none text-sm text-white placeholder:text-slate-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-300 mb-1.5">Admin Şifresi</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      required
                      minLength={4}
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      placeholder="Admin şifresi"
                      className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-[#1E1D1A] border border-white/10 focus:border-amber-500/60 outline-none text-sm text-white placeholder:text-slate-600"
                    />
                  </div>
                </div>

                {adminStatus?.needsClaim && (
                  <div>
                    <label className="block text-xs text-slate-300 mb-1.5">
                      Admin Şifresi Tekrar
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="password"
                        required
                        minLength={4}
                        value={adminConfirmPassword}
                        onChange={(e) => setAdminConfirmPassword(e.target.value)}
                        placeholder="Admin şifresini tekrar girin"
                        className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-[#1E1D1A] border border-white/10 focus:border-amber-500/60 outline-none text-sm text-white placeholder:text-slate-600"
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {error && (
          <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/25 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting || (mode === 'admin' && adminStatusLoading)}
          className={`w-full py-2.5 rounded-lg disabled:opacity-50 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer ${
            mode === 'admin'
              ? 'bg-amber-600 hover:bg-amber-500'
              : 'bg-[#81B64C] hover:bg-[#95C95D]'
          }`}
        >
          {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
          {mode === 'register'
            ? 'Hesap Oluştur'
            : mode === 'login'
              ? 'Giriş Yap'
              : adminStatus?.needsClaim
                ? 'Admin Hesabını Oluştur'
                : 'Admin Olarak Giriş Yap'}
        </button>
      </form>

      {onGoogleSignIn && mode !== 'admin' && (
        <>
          <div className="relative flex items-center">
            <div className="flex-grow border-t border-white/[0.08]" />
            <span className="px-3 text-[11px] text-slate-500">veya</span>
            <div className="flex-grow border-t border-white/[0.08]" />
          </div>

          <button
            type="button"
            onClick={onGoogleSignIn}
            className="w-full py-2 rounded-lg bg-[#1E1D1A] hover:bg-white/[0.05] border border-white/10 text-xs font-medium text-slate-200 transition-colors cursor-pointer"
          >
            Google ile Devam Et
          </button>
        </>
      )}
    </div>
  );
};

interface AuthModalProps extends AuthPanelProps {
  open: boolean;
}

export const AuthModal: React.FC<AuthModalProps> = ({ open, ...props }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <AuthFormCard {...props} />
      </div>
    </div>
  );
};
