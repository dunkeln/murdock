import Link from "next/link";

import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function PublicHomePage() {
  return (
    <main className="min-h-screen bg-ink text-paper">
      <PageContainer className="flex min-h-screen flex-col">
        <header className="flex h-20 items-center justify-between border-b border-paper/15">
          <Link href="/" className="font-heading text-3xl uppercase leading-none">
            Murdock
          </Link>
          <nav className="hidden items-center gap-8 text-sm text-paper/70 md:flex">
            <Link href="#problem">Problem</Link>
            <Link href="#workflow">Workflow</Link>
            <Link href="#contact">Contact</Link>
          </nav>
          <Button
            asChild
            className="rounded-none bg-paper text-ink hover:bg-paper/90"
          >
            <Link href="/dashboard">Enter app</Link>
          </Button>
        </header>

        <section className="relative flex flex-1 flex-col justify-center gap-10 overflow-hidden py-16">
          <div
            aria-hidden="true"
            className="absolute inset-0 z-0 opacity-30 [background-image:linear-gradient(to_right,var(--color-paper)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-paper)_1px,transparent_1px)] [background-size:2rem_2rem]"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,transparent_0%,var(--color-ink)_70%)]"
          />
          <div className="relative z-10 grid gap-8 border-b border-paper/15 pb-12 lg:grid-cols-[1fr_18rem] lg:items-end">
            <h1 className="font-heading text-7xl uppercase leading-[0.84] tracking-tight text-paper sm:text-8xl lg:text-[10rem]">
              Legal work deserves fewer handoffs
            </h1>
            <p className="max-w-sm text-lg leading-7 text-paper/70">
              A focused workspace for turning intake, deadlines, and document
              review into a clearer operating rhythm for law firms.
            </p>
          </div>

          <div className="relative z-10 grid gap-6 text-sm text-paper/70 md:grid-cols-3">
            <p>Built for legal case workflows.</p>
            <p>Structured around review queues, matters, and documents.</p>
            <p>Scoped as a Glade forward-deployed engineering assessment.</p>
          </div>
        </section>
      </PageContainer>

      <section id="problem" className="border-y border-paper/15">
        <PageContainer className="grid gap-10 py-20 md:grid-cols-[0.8fr_1.2fr]">
          <h2 className="font-heading text-6xl uppercase leading-none">
            What this is for
          </h2>
          <div className="flex flex-col gap-6 text-xl leading-8 text-paper/75">
            <p>
              Legal teams lose time when case context, filing dates, client
              updates, and draft documents are split across disconnected tools.
            </p>
            <p>
              This project will grow into a small product surface that shows how
              those moving pieces can become one reliable workflow.
            </p>
          </div>
        </PageContainer>
      </section>

      <section id="workflow">
        <PageContainer className="grid gap-4 py-20 md:grid-cols-3">
          {[
            {
              step: "01",
              label: "Capture the matter",
              className: "border-paper/15 text-paper",
              stepClassName: "text-paper/45",
            },
            {
              step: "02",
              label: "Surface the next action",
              className: "border-paper bg-paper text-ink",
              stepClassName: "text-ink/45",
            },
            {
              step: "03",
              label: "Prepare review-ready work",
              className: "border-paper/15 text-paper",
              stepClassName: "text-paper/45",
            },
          ].map(({ step, label, className, stepClassName }) => (
            <div
              className={cn(
                "flex min-h-48 flex-col justify-between border p-6",
                className
              )}
              key={step}
            >
              <span className={cn("text-sm", stepClassName)}>{step}</span>
              <h3 className="font-heading text-5xl uppercase leading-none">
                {label}
              </h3>
            </div>
          ))}
        </PageContainer>
      </section>

      <section id="contact" className="border-t border-paper/15">
        <PageContainer className="flex flex-col gap-8 py-20 md:flex-row md:items-end md:justify-between">
          <h2 className="max-w-3xl font-heading text-6xl uppercase leading-none sm:text-7xl">
            Start with the workflow. Earn trust with the details.
          </h2>
          <Button
            asChild
            className="w-fit rounded-none bg-paper text-ink hover:bg-paper/90"
          >
            <Link href="/dashboard">View app route</Link>
          </Button>
        </PageContainer>
      </section>
    </main>
  );
}
