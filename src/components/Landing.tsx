import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft, ArrowRight, MessageCircle, Users, Volume2,
  Sparkles, Shield, Zap, Monitor, Apple, Smartphone, Star,
} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/store";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./accordion";
import { Button } from "./ui";
import { SlopAvatar, SlopLogo } from "./SlopAvatar";

const bubbleLines = ["Selam! Ben Sloppi", "Sohbete hazır mısın?", "Tasarım yumuşacık oldu", "Sunlop'a selam söyle", "Beni sevdin mi?", "Hadi sunucuya girelim"];

function Sloppi() {
  const [line, setLine] = useState(0);
  return (
    <div className="relative mx-auto w-[min(380px,100%)] overflow-hidden rounded-[28px] border border-brand/20 bg-gradient-to-br from-brand/[.12] to-transparent p-8 shadow-float">
      <span className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-brand/20 blur-3xl" />
      <div className="relative flex justify-center pt-6">
        <div className="relative">
          <AnimatePresence mode="wait">
            <motion.div key={line} initial={{ opacity: 0, y: 8, scale: .95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }} className="absolute -top-14 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-2xl bg-paper px-3.5 py-2 text-[11px] font-extrabold text-ink shadow-lg">
              {bubbleLines[line]}
              <span className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-paper" />
            </motion.div>
          </AnimatePresence>
          <SlopAvatar
            name="slop sound"
            size={150}
            animate="always"
            showDot
            dotPosition="top-right"
            title="Sloppi"
            className="drop-shadow-[0_20px_40px_hsl(var(--brand)/.35)]"
            onClick={() => { setLine((l) => (l + 1) % bubbleLines.length); toast(bubbleLines[(line + 1) % bubbleLines.length]); }}
          />
        </div>
      </div>
      <div className="sloppi-shadow" />
      <div className="mt-6 text-center">
        <h3 className="font-display text-[17px] font-extrabold">Sloppi <span className="text-muted">• SlopSound Maskotu</span></h3>
        <p className="mx-auto mt-1.5 max-w-xs text-[11.5px] leading-relaxed text-muted">Neşeli, yardımsever, biraz yaramaz. Sohbette kaybolursan sana yol gösterir. Tıkla, konuşsun.</p>
        <div className="mt-3 flex justify-center gap-1.5"><span className="rounded-full bg-white/[.06] px-2.5 py-1 text-[9.5px] font-bold text-muted">Maskot</span><span className="rounded-full bg-white/[.06] px-2.5 py-1 text-[9.5px] font-bold text-muted">Yardımcı</span><span className="rounded-full bg-white/[.06] px-2.5 py-1 text-[9.5px] font-bold text-muted">7/24 Burada</span></div>
        <div className="mt-5 flex justify-center gap-2"><Button size="sm" onClick={() => { setLine((l) => (l + 1) % bubbleLines.length); toast("Sloppi: " + bubbleLines[(line + 1) % bubbleLines.length]); }}>Sloppi ile Konuş</Button><Button size="sm" variant="outline" onClick={() => toast("Duvar kağıdı yakında")}>Duvar Kağıdı Al</Button></div>
      </div>
    </div>
  );
}

const features = [
  { icon: Users, title: "Sunucular", desc: "Sınırsız kanal, katmanlı yapı. Her sunucu kendi kimliğine sahip." },
  { icon: MessageCircle, title: "DM", desc: "Ayrı panel, davet linki, okunmamış takibi. Kaybolmaz." },
  { icon: Volume2, title: "Ses Odaları", desc: "Düşük gecikme, konuşanı belli eden halkalar. Gir, takıl." },
  { icon: Sparkles, title: "Sunlop Asistanı", desc: "Sol altta hep durur. Yaz, cevap versin. 7/24 çevrimiçi." },
  { icon: Shield, title: "Gizlilik", desc: "Kim sana yazabilir, kim seni ekleyebilir — sen kontrol edersin." },
  { icon: Zap, title: "Hızlı", desc: "Gerçek bağlantı durumu, sade arayüz, akıcı geçişler." },
];

export function Landing() {
  const setView = useApp((s) => s.setView);
  return (
    <div className="relative z-10 h-full overflow-y-auto">
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-white/[.06] bg-ink/80 px-5 backdrop-blur-xl">
        <div className="flex items-center gap-2"><button onClick={() => setView("app")} className="icon-btn"><ArrowLeft size={15} /></button><SlopLogo size={24} /><span className="font-display text-[13px] font-extrabold">SlopSound</span><span className="hidden text-[10px] text-muted sm:inline">• Maskot: Sloppi</span></div>
        <nav className="hidden items-center gap-1 md:flex">
          {[["Özellikler", "#ozellikler"], ["Uygulama", "#uygulama"], ["Nasıl Çalışır", "#nasil"], ["SSS", "#sss"]].map(([label, href]) => (
            <a key={label} href={href} className="rounded-full px-3 py-1.5 text-[11px] font-bold text-muted transition hover:bg-white/[.05] hover:text-paper">{label}</a>
          ))}
        </nav>
        <div className="flex items-center gap-2"><Button variant="ghost" size="sm" onClick={() => setView("app")}>Giriş Yap</Button><Button size="sm" onClick={() => setView("app")}>Ücretsiz Başla</Button></div>
      </header>

      <section className="mx-auto grid max-w-[1120px] items-center gap-10 px-5 py-14 lg:grid-cols-[1.15fr_.85fr]">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .6 }}>
          <span className="inline-flex items-center gap-2 rounded-full border border-lime/25 bg-lime/[.08] px-3 py-1.5 text-[10px] font-black tracking-wider text-lime"><Sparkles size={11} /> Sade, hızlı, kendi kimliğinle</span>
          <h1 className="mt-5 font-display text-[52px] font-extrabold leading-[1.05] tracking-[-.04em] max-sm:text-[36px]">Konuş, oyna,<br /><span className="text-brand">takıl.</span> Hepsi burada.</h1>
          <p className="mt-5 max-w-lg text-[16px] leading-relaxed text-muted">SlopSound, Discord'a benzeyen ama onun kopyası olmayan, sade ve hızlı bir sohbet uygulaması. Sunucular, DM, ses odaları ve Sunlop asistanı tek yerde.</p>
          <div className="mt-7 flex flex-wrap gap-3"><Button size="lg" onClick={() => setView("app")}>Hemen Başla <ArrowRight size={16} /></Button><Button size="lg" variant="outline" onClick={() => document.getElementById("uygulama")?.scrollIntoView({ behavior: "smooth" })}>Uygulamaya Bak</Button></div>
          <p className="mt-3 text-[11px] text-muted">Ücretsiz • Kredi kartı istemez • Kolay kurulum</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, scale: .94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: .6, delay: .1 }}><Sloppi /></motion.div>
      </section>

      <section id="ozellikler" className="mx-auto max-w-[1120px] scroll-mt-20 px-5 py-12">
        <h2 className="font-display text-[26px] font-extrabold tracking-tight">Neler var?</h2>
        <p className="mt-1 text-[12.5px] text-muted">Gereksiz özellik yok. İhtiyacın olan her şey, sade haliyle.</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <motion.div key={f.title} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * .05 }} className="rounded-[22px] border border-white/[.07] bg-white/[.03] p-5 transition hover:-translate-y-1 hover:border-brand/40 hover:bg-brand/[.05]">
              <div className="grid h-9 w-9 place-items-center rounded-[13px] bg-brand/15 text-brand"><f.icon size={17} /></div>
              <h3 className="mt-4 font-display text-[14px] font-extrabold">{f.title}</h3>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section id="uygulama" className="mx-auto max-w-[1120px] scroll-mt-20 px-5 py-12">
        <h2 className="font-display text-[26px] font-extrabold tracking-tight">Uygulama nasıl görünüyor?</h2>
        <p className="mt-1 text-[12.5px] text-muted">Arayüz şeması. Gerçek kanallar, mesajlar ve üyeler giriş yaptıktan sonra yüklenir.</p>
        <div className="glass mt-6 overflow-hidden rounded-panel">
          <div className="flex h-9 items-center gap-2 border-b border-white/[.07] px-4"><span className="h-2 w-2 rounded-full bg-danger" /><span className="h-2 w-2 rounded-full bg-warn" /><span className="h-2 w-2 rounded-full bg-lime" /><span className="ml-3 text-[10px] font-bold text-muted">SlopSound — arayüz</span><span className="ml-auto rounded-full bg-white/[.06] px-2 py-0.5 text-[9px] font-black text-muted">ARAYÜZ ŞEMASI</span></div>
          <div className="grid min-h-[260px] grid-cols-[150px_1fr_130px] max-sm:grid-cols-[100px_1fr]">
            <div className="border-r border-white/[.06] p-3"><p className="category-label !px-0 !mt-0">Kanallar</p><div className="mt-2 space-y-1.5">{[0, 1, 2].map((i) => <div key={i} className="h-6 rounded-lg bg-white/[.05]" />)}</div><p className="category-label !px-0">Ses Odaları</p><div className="mt-2 h-6 rounded-lg bg-brand/10" /></div>
            <div className="p-4"><p className="text-[11px] font-bold text-muted">Sohbet</p><div className="mt-6 space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-12 rounded-card border border-white/[.06] bg-white/[.02]" />)}</div><p className="mt-4 text-[10px] text-muted">Mesajlar giriş yaptıktan sonra burada görünür.</p></div>
            <div className="hidden border-l border-white/[.06] p-3 sm:block"><p className="category-label !px-0 !mt-0">Üyeler</p><div className="mt-2 space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-white/20" /><span className="h-2 flex-1 rounded bg-white/[.05]" /></div>)}</div></div>
          </div>
        </div>
      </section>

      <section id="nasil" className="mx-auto max-w-[1120px] scroll-mt-20 px-5 py-12">
        <h2 className="font-display text-[26px] font-extrabold tracking-tight">3 adımda başla</h2>
        <p className="mt-1 text-[12.5px] text-muted">Kayıt ol, arkadaşını ekle, konuşmaya başla.</p>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {[
            ["01", "Hesap oluştur", "E-posta + kullanıcı adı yeterli. 1 dakikada bitiyor."],
            ["02", "Arkadaşını ekle", "Ad ile ekle veya davet linki gönder. Kabul edince DM açılır."],
            ["03", "Sohbete gir", "Sunucuya katıl veya kendi sunucunu kur. Sunlop hep yanında."],
          ].map(([n, title, desc]) => (
            <div key={n} className="rounded-[22px] border border-white/[.07] bg-white/[.03] p-5"><p className="font-display text-[28px] font-extrabold text-brand/60">{n}</p><h3 className="mt-2 font-display text-[14px] font-extrabold">{title}</h3><p className="mt-1 text-[11.5px] leading-relaxed text-muted">{desc}</p></div>
          ))}
        </div>
        <div className="mt-4 flex flex-col items-start justify-between gap-4 rounded-panel border border-brand/30 bg-gradient-to-br from-brand/15 to-transparent p-6 sm:flex-row sm:items-center">
          <div><h3 className="font-display text-[18px] font-extrabold">SlopSound'u indir</h3><p className="mt-1 text-[11.5px] text-muted">Windows kurulum dosyası hazır. Mac ve Linux sürümleri planlanıyor.</p></div>
          <div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => toast("İndirme bağlantısı yakında")}><Monitor size={14} /> Windows</Button><Button size="sm" variant="outline" onClick={() => toast("macOS sürümü planlanıyor")}><Apple size={14} /> Mac</Button><Button size="sm" variant="outline" onClick={() => toast("Linux sürümü planlanıyor")}><Smartphone size={14} /> Linux</Button></div>
        </div>
      </section>

      <section className="mx-auto max-w-[1120px] px-5 py-12">
        <h2 className="font-display text-[26px] font-extrabold tracking-tight">Tüm bilgiler</h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["SlopSound nedir?", "Sade, hızlı, kendi kimliği olan bir sohbet uygulaması."],
            ["Ücretli mi?", "Hayır. Temel kullanım ücretsiz."],
            ["Güvenli mi?", "Oturumlar sunucuda doğrulanır; mesajlar uçtan uca şifreli değildir."],
            ["Hangi cihazlarda?", "Şu an Windows. macOS ve Linux planlanıyor."],
            ["İnternet giderse?", "Bağlantı kesilince durum ekranı gösterilir; mesaj kuyruğu yok."],
            ["Bakım olursa?", "Durum ekranı gerçek servis durumunu gösterir."],
          ].map(([q, a]) => <div key={q} className="rounded-[22px] border border-white/[.07] bg-white/[.03] p-5"><h3 className="text-[12.5px] font-extrabold">{q}</h3><p className="mt-1.5 text-[11px] leading-relaxed text-muted">{a}</p></div>)}
        </div>
      </section>

      <section id="sss" className="mx-auto max-w-[1120px] scroll-mt-20 px-5 py-12 pb-20">
        <h2 className="font-display text-[26px] font-extrabold tracking-tight">Sık Sorulan Sorular</h2>
        <div className="mt-6 max-w-2xl">
          <Accordion type="single" collapsible>
            {[
              ["SlopSound Discord mu?", "Hayır. Benzer şeyler yapar ama kendi tasarımı, kendi kimliği ve kendi asistanı var."],
              ["Arkadaşımı nasıl eklerim?", "Arkadaş Ekle ekranından kullanıcı adıyla aratabilir veya davet linki gönderebilirsin."],
              ["Sloppi kim?", "Mor, yuvarlak, neşeli maskotumuz. Sohbette kaybolursan yol gösterir. Tıkla, konuşsun."],
              ["Sunlop ne yapar?", "Sol altta duran AI asistanın. Mesaj yazarsan cevap verir, ayarları hatırlatır."],
            ].map(([q, a], i) => (
              <AccordionItem key={q} value={`item-${i}`}>
                <AccordionTrigger>{q}</AccordionTrigger>
                <AccordionContent>{a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      <footer className="border-t border-white/[.06] px-5 py-8">
        <div className="mx-auto flex max-w-[1120px] flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="font-display text-[13px] font-extrabold">SlopSound • 2026 • Bağımsız • Sade • Hızlı</p><p className="mt-1 text-[10.5px] text-muted">Gizlilik • Koşullar • Destek: destek@slopsound.gg</p></div>
          <div className="flex items-center gap-2 text-[10.5px] text-muted"><Star size={13} className="text-warn" /> Maskot: Sloppi • Asistan: Sunlop</div>
        </div>
      </footer>
    </div>
  );
}
