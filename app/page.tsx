import Link from 'next/link'

const features = [
  ['01', 'One inbox for every enquiry', 'Bring customer conversations and staff replies into one shared view.'],
  ['02', 'Appointments without the back-and-forth', 'Keep services, durations, and availability connected to each booking.'],
  ['03', 'Follow-through built in', 'Keep reminders and review requests attached to the appointment journey.'],
]

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#101411] text-[#f3f5ef]">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 md:px-10">
        <Link href="/" className="text-lg font-semibold tracking-tight">Salon<span className="text-emerald-400">Desk</span></Link>
        <nav className="flex items-center gap-5 text-sm"><a href="#workflow" className="hidden text-zinc-400 hover:text-white sm:block">Workflow</a><Link href="/login" className="border border-zinc-700 px-4 py-2.5 hover:border-emerald-400">Sign in</Link></nav>
      </header>

      <section className="relative mx-auto grid max-w-7xl gap-12 px-5 pb-20 pt-12 md:grid-cols-[0.9fr_1.1fr] md:items-center md:px-10 md:pb-24 md:pt-16">
        <div className="relative z-10 max-w-xl">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300"><span className="h-px w-7 bg-emerald-400" />SalonDesk · for independent salons</p>
          <h1 className="mt-6 text-5xl font-semibold leading-[1.04] tracking-tight sm:text-6xl">More time for the chair.<br /><span className="font-serif font-normal italic text-emerald-300">Less time in the inbox.</span></h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-zinc-400">A WhatsApp receptionist and appointment desk that helps your team answer enquiries, manage bookings, and stay on top of follow-ups.</p>
          <div className="mt-8 flex flex-wrap items-center gap-3"><a href="mailto:hello@salondesk.in?subject=SalonDesk%20demo" className="bg-emerald-400 px-5 py-3 text-sm font-semibold text-[#102016] transition-colors hover:bg-emerald-300">Book a demo <span aria-hidden="true">↗</span></a><a href="#workflow" className="px-4 py-3 text-sm text-zinc-300 hover:text-white">See how it works</a></div>
          <p className="mt-5 text-xs text-zinc-600">Built for the rhythm of a busy salon.</p>
        </div>

        <div className="relative mx-auto w-full max-w-2xl">
          <div className="absolute -right-20 -top-12 h-64 w-64 rounded-full bg-emerald-400/10 blur-3xl" />
          <div className="relative border border-zinc-700 bg-[#171d19] shadow-2xl shadow-black/30">
            <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center bg-emerald-400/15 text-sm font-semibold text-emerald-300">G</span><div><p className="text-sm font-medium">Glow Salon</p><p className="text-[11px] text-zinc-500">Team inbox</p></div></div><span className="border border-emerald-500/30 px-2.5 py-1 text-[10px] uppercase tracking-wider text-emerald-300">3 open</span></div>
            <div className="grid min-h-[310px] grid-cols-[minmax(145px,0.75fr)_1.25fr]">
              <div className="border-r border-zinc-800">
                <div className="border-b border-zinc-800 px-4 py-3 text-xs text-zinc-500">Conversations</div>
                <div className="border-b border-zinc-800 bg-emerald-500/10 px-4 py-4"><div className="flex items-center justify-between gap-2"><span className="truncate text-xs font-medium">Priya Sharma</span><span className="text-[10px] text-zinc-600">10:42</span></div><p className="mt-2 truncate text-[11px] text-zinc-500">Do you have a slot today?</p><span className="mt-3 inline-block border border-emerald-500/30 px-1.5 py-0.5 text-[9px] uppercase text-emerald-300">Bot</span></div>
                <div className="border-b border-zinc-800 px-4 py-4"><p className="truncate text-xs font-medium">Aarav Mehta</p><p className="mt-2 truncate text-[11px] text-zinc-500">Thanks, see you then</p></div>
                <div className="px-4 py-4"><p className="truncate text-xs font-medium">Neha Patil</p><p className="mt-2 truncate text-[11px] text-zinc-500">Can I reschedule?</p></div>
              </div>
              <div className="flex min-w-0 flex-col">
                <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3"><div><p className="text-xs font-medium">Priya Sharma</p><p className="mt-1 text-[10px] text-zinc-600">Customer conversation</p></div><span className="text-[10px] text-zinc-500">Take over</span></div>
                <div className="flex flex-1 flex-col justify-end gap-3 px-4 py-4 sm:px-6"><div className="max-w-[85%] border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-xs leading-5 text-zinc-300">Hi! Do you have a haircut slot today?</div><div className="ml-auto max-w-[85%] border border-emerald-500/20 bg-emerald-950/50 px-3 py-2.5 text-xs leading-5 text-zinc-200">I can check that for you. What time works best?</div><p className="ml-auto text-[9px] uppercase tracking-wider text-emerald-400">Receptionist</p></div>
                <div className="border-t border-zinc-800 px-3 py-3"><div className="flex items-center justify-between border border-zinc-700 px-3 py-2.5 text-xs text-zinc-600"><span>Reply to Priya…</span><span className="grid h-6 w-6 place-items-center bg-emerald-400 text-[#102016]">↗</span></div></div>
              </div>
            </div>
            <div className="flex items-center gap-2 border-t border-zinc-800 px-5 py-3 text-[10px] text-zinc-600"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />A calmer way to keep every conversation moving</div>
          </div>
        </div>
      </section>

      <section id="workflow" className="border-y border-zinc-800 bg-[#151b17]">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-14 md:grid-cols-[0.7fr_1.3fr] md:px-10 md:py-16"><div><p className="text-xs uppercase tracking-[0.2em] text-emerald-300">The everyday flow</p><h2 className="mt-4 max-w-sm text-3xl font-semibold leading-tight">From first hello to the next visit.</h2></div><div className="grid gap-7 sm:grid-cols-3">{features.map(([number, title, description]) => <article key={number} className="border-t border-zinc-700 pt-4"><p className="text-xs text-emerald-400">{number}</p><h3 className="mt-4 text-sm font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-zinc-500">{description}</p></article>)}</div></div>
      </section>

      <section className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-12 md:flex-row md:items-center md:justify-between md:px-10"><div><p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Early access</p><h2 className="mt-2 text-xl font-semibold">Simple pilot pricing, coming soon.</h2></div><a href="mailto:hello@salondesk.in?subject=SalonDesk%20demo" className="w-fit border border-zinc-700 px-4 py-2.5 text-sm text-zinc-200 hover:border-emerald-400">Book a demo <span aria-hidden="true">↗</span></a></section>
      <footer className="border-t border-zinc-800 px-5 py-5 text-center text-xs text-zinc-600">SalonDesk · A better day at the salon starts behind the scenes.</footer>
    </main>
  )
}
