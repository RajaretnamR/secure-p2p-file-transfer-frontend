import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  ShieldCheck,
  Smartphone,
  Laptop,
  Zap,
  QrCode,
  CheckCircle2,
  Wifi,
  Lock,
  Files,
  Fingerprint,
  ServerCog,
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col gradient-bg relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-120px] left-[-120px] h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute top-[20%] right-[-120px] h-96 w-96 rounded-full bg-purple-500/10 blur-3xl" />
        <div className="absolute bottom-[-120px] left-[35%] h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl" />
      </div>

      {/* Header */}
      <header className="container mx-auto px-6 py-6 relative z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl glass flex items-center justify-center border border-white/10">
              <ShieldCheck className="h-5 w-5 text-cyan-300" />
            </div>

            <div>
              <h1 className="text-lg font-bold tracking-wide">
                Secure P2P Transfer
              </h1>
              <p className="text-xs text-muted-foreground">
                Browser-to-Browser Secure File Sharing
              </p>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-2 glass px-4 py-2 rounded-full border border-white/10">
            <CheckCircle2 className="h-4 w-4 text-green-400" />
            <span className="text-sm text-white/90">
              Live & Production Ready
            </span>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 relative z-10">
        <section className="container mx-auto px-6 pt-10 pb-16">
          <div className="max-w-5xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass border border-white/10 mb-8">
              <Fingerprint className="h-4 w-4 text-cyan-300" />
              <span className="text-sm font-medium">
                Private • Fast • Verified Transfers
              </span>
            </div>

            <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-tight">
              Transfer Files
              <span className="block bg-gradient-to-r from-cyan-300 via-white to-purple-300 bg-clip-text text-transparent">
                Directly Between Devices
              </span>
            </h1>

            <p className="mt-8 text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              Secure peer-to-peer file transfer platform powered by WebRTC.
              Share files instantly between laptops, desktops, and mobile
              devices with QR pairing, SHA-256 verification, and multi-file ZIP
              delivery.
            </p>

            {/* CTA */}
            <div className="flex flex-col sm:flex-row gap-5 justify-center mt-12">
              <Link href="/send">
                <Button
                  size="lg"
                  className="w-full sm:w-auto group px-8 py-7 rounded-2xl text-base font-semibold hover-lift"
                >
                  Send Files
                  <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Button>
              </Link>

              <Link href="/receive">
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full sm:w-auto px-8 py-7 rounded-2xl text-base font-semibold glass border-white/10 hover-lift"
                >
                  Receive Files
                </Button>
              </Link>
            </div>

            {/* Trust Badges */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-16">
              {[
                {
                  icon: Wifi,
                  title: "WebRTC Direct",
                },
                {
                  icon: QrCode,
                  title: "QR Pairing",
                },
                {
                  icon: Files,
                  title: "Multi File Support",
                },
                {
                  icon: ShieldCheck,
                  title: "SHA-256 Verified",
                },
              ].map((item, i) => (
                <div
                  key={i}
                  className="glass rounded-2xl px-4 py-5 border border-white/10 hover-lift"
                >
                  <item.icon className="h-6 w-6 mx-auto text-cyan-300 mb-3" />
                  <p className="text-sm font-medium">{item.title}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="container mx-auto px-6 py-12">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold">
              Why This Platform?
            </h2>
            <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
              Built for modern secure file sharing with speed, privacy, and
              reliability at its core.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                icon: Lock,
                title: "Privacy First",
                desc: "Files move directly between connected devices without permanent server storage.",
              },
              {
                icon: Zap,
                title: "Ultra Fast Transfers",
                desc: "Optimized peer-to-peer architecture delivers high-speed file transfers.",
              },
              {
                icon: Smartphone,
                title: "Cross Device Sharing",
                desc: "Transfer seamlessly between laptop, desktop, Android, and mobile browsers.",
              },
              {
                icon: QrCode,
                title: "Instant Device Pairing",
                desc: "Connect using QR scan or transfer code for frictionless pairing.",
              },
              {
                icon: ServerCog,
                title: "Reliable Session Management",
                desc: "Backend signaling ensures stable session negotiation and reconnection handling.",
              },
              {
                icon: ShieldCheck,
                title: "Integrity Verification",
                desc: "SHA-256 checksum validation confirms received files remain untampered.",
              },
            ].map((feature, i) => (
              <div
                key={i}
                className="glass rounded-3xl p-8 border border-white/10 hover-lift"
              >
                <div className="h-12 w-12 rounded-2xl bg-white/10 flex items-center justify-center mb-5">
                  <feature.icon className="h-6 w-6 text-cyan-300" />
                </div>

                <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>

                <p className="text-muted-foreground leading-relaxed">
                  {feature.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Workflow */}
        <section className="container mx-auto px-6 py-20">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold">
              How It Works
            </h2>
            <p className="mt-4 text-muted-foreground">
              Simple secure transfer in 4 steps.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[
              {
                step: "01",
                title: "Create Session",
                desc: "Sender starts a secure transfer session.",
                icon: Laptop,
              },
              {
                step: "02",
                title: "Pair Devices",
                desc: "Receiver joins using QR code or transfer code.",
                icon: QrCode,
              },
              {
                step: "03",
                title: "Transfer Securely",
                desc: "Files stream directly over encrypted peer connection.",
                icon: ShieldCheck,
              },
              {
                step: "04",
                title: "Download ZIP",
                desc: "Receiver downloads verified files instantly.",
                icon: Files,
              },
            ].map((step, i) => (
              <div
                key={i}
                className="glass rounded-3xl p-6 border border-white/10 hover-lift text-center"
              >
                <div className="text-cyan-300 font-bold text-sm mb-3">
                  STEP {step.step}
                </div>

                <div className="h-14 w-14 mx-auto rounded-2xl bg-white/10 flex items-center justify-center mb-5">
                  <step.icon className="h-6 w-6 text-cyan-300" />
                </div>

                <h3 className="text-lg font-semibold mb-3">{step.title}</h3>

                <p className="text-sm text-muted-foreground leading-relaxed">
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/10 mt-10">
        <div className="container mx-auto px-6 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            Secure P2P File Transfer • Built with Next.js, WebRTC, Rust Axum &
            WebSockets
          </p>

                <p className="text-xs text-white/50 mt-2">
                  Developed by{" "}
                  <a
                    href="https://github.com/RajaretnamR"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cyan-300 hover:text-cyan-200 underline underline-offset-4 transition-colors duration-200"
                  >
                    Raja Retnam
                  </a>
                </p>
        </div>
      </footer>
    </div>
  );
}