import { useState } from "react";
import { motion } from "motion/react";
import { AtSign, Lock, User, Sparkles, ArrowRight, Chrome } from "lucide-react";
import { useApp } from "@/lib/store";
import { Button, Input } from "./ui";
import { SlopLogo } from "./SlopAvatar";

export function AuthScreen() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const login = useApp((s) => s.login);
  const register = useApp((s) => s.register);
  const loginWithGoogle = useApp((s) => s.loginWithGoogle);
  const error = useApp((s) => s.error);
  const oauthStatus = useApp((s) => s.oauthStatus);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "login") await login(email, password);
      else await register(email, username, password);
    } catch { /* hata store'da */ }
    finally { setBusy(false); }
  }

  async function google() {
    setGoogleBusy(true);
    try { await loginWithGoogle(); }
    catch { /* hata store'da */ }
    finally { setGoogleBusy(false); }
  }

  return (
    <div className="relative grid h-screen w-screen place-items-center overflow-hidden bg-ink text-paper">
      <div className="atmosphere" />
      <motion.div
        initial={{ opacity: 0, y: 18, scale: .97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 26 }}
        className="glass relative z-10 w-[min(92vw,420px)] rounded-panel p-7 shadow-float"
      >
        <div className="flex items-center gap-3">
          <SlopLogo size={44} animate="always" />
          <div>
            <h1 className="font-display text-[20px] font-extrabold tracking-tight">SlopSound</h1>
            <p className="text-[11px] text-muted">Konuş, oyna, takıl.</p>
          </div>
          <Sparkles size={16} className="ml-auto text-lime" />
        </div>

        <div className="mt-6 flex rounded-full bg-white/[.05] p-1">
          {(["login", "register"] as const).map((item) => (
            <button
              key={item}
              onClick={() => setMode(item)}
              className={`flex-1 rounded-full py-2 text-[11px] font-bold transition ${mode === item ? "bg-brand text-ink" : "text-muted hover:text-paper"}`}
            >
              {item === "login" ? "Giriş Yap" : "Kayıt Ol"}
            </button>
          ))}
        </div>

        <form onSubmit={(e) => void submit(e)} className="mt-5 space-y-3">
          <div className="relative">
            <AtSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <Input aria-label="E-posta" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-posta" className="pl-9" />
          </div>
          {mode === "register" && (
            <div className="relative">
              <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <Input aria-label="Kullanıcı adı" required minLength={3} maxLength={32} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Kullanıcı adı" className="pl-9" />
            </div>
          )}
          <div className="relative">
            <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <Input aria-label="Şifre" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Şifre" className="pl-9" />
          </div>
          {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-[11px] text-danger">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Bağlanıyor…" : mode === "login" ? "Giriş Yap" : "Hesap Oluştur"} <ArrowRight size={14} />
          </Button>
        </form>

        <div className="my-5 flex items-center gap-3 text-[9px] font-black uppercase tracking-[.18em] text-muted/60">
          <span className="h-px flex-1 bg-white/[.07]" />veya<span className="h-px flex-1 bg-white/[.07]" />
        </div>
        <Button variant="outline" onClick={() => void google()} disabled={busy || googleBusy} className="w-full">
          <Chrome size={15} /> {googleBusy ? "Google açılıyor…" : "Google ile devam et"}
        </Button>
        {oauthStatus && <p className="mt-3 rounded-xl bg-brand/10 px-3 py-2 text-center text-[10.5px] font-bold text-brand">{oauthStatus}</p>}

        <div className="mt-5 rounded-xl border border-white/[.06] bg-white/[.03] p-3 text-[10px] leading-relaxed text-muted">
          Giriş bilgilerin sunucuda doğrulanır. Oturumun bu cihazda güvenli cookie ile saklanır.
        </div>
      </motion.div>
    </div>
  );
}
