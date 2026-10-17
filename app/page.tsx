export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 text-white">
      <div className="flex flex-col items-center gap-6">
        <span className="text-xs font-semibold tracking-widest uppercase text-emerald-400 bg-emerald-400/10 px-3 py-1 rounded-full border border-emerald-400/20">
          ✦ Running
        </span>
        <h1 className="text-6xl font-bold tracking-tight">
          Salon<span className="text-emerald-400">Desk</span>
        </h1>
        <p className="text-zinc-400 text-lg">
          WhatsApp AI Receptionist — Task 1 scaffold complete.
        </p>
      </div>
    </main>
  );
}
