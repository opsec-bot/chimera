import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageContainer } from '@/components/layout/PageContainer';
import {
  Shield,
  Network,
  Lock,
  Zap,
  Users,
  BarChart3,
  CheckCircle,
  ArrowRight,
  Monitor,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type Feature = {
  icon: LucideIcon;
  title: string;
  description: string;
};

const FEATURES: Feature[] = [
  {
    icon: Shield,
    title: 'Advanced security',
    description:
      'Multi-factor authentication, encrypted communications, and role-based access control.',
  },
  {
    icon: Network,
    title: 'Network monitoring',
    description:
      'Real-time monitoring of network devices, performance metrics, and automated alerts.',
  },
  {
    icon: Zap,
    title: 'Automated management',
    description: 'Automated deployment, configuration management, and maintenance tasks.',
  },
  {
    icon: Users,
    title: 'Team collaboration',
    description: 'Multi-user support with granular permissions and audit trails for all actions.',
  },
  {
    icon: BarChart3,
    title: 'Analytics & reporting',
    description: 'Comprehensive reporting and analytics for performance and security events.',
  },
  {
    icon: Lock,
    title: 'Compliance ready',
    description: 'Built-in compliance features for SOC2, ISO27001, and other enterprise standards.',
  },
];

export function LandingPage() {
  const navigate = useNavigate();
  const handleGetStarted = () => navigate('/auth');

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 h-14 border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <div className="flex size-7 items-center justify-center rounded-md border border-border bg-card">
              <span className="text-sm font-semibold">F</span>
            </div>
            <span className="text-sm font-semibold tracking-tight">Flipper</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={handleGetStarted}>
              Sign in
            </Button>
            <Button size="sm" onClick={handleGetStarted}>
              Get started
              <ArrowRight className="ml-1.5 size-3.5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div
            className="absolute inset-x-0 top-0 h-[500px] opacity-60"
            style={{
              background:
                'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(255,255,255,0.06), transparent 70%)',
            }}
          />
        </div>
        <PageContainer className="py-24">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
            <Badge variant="outline" className="text-xs font-medium text-muted-foreground">
              Enterprise remote management
            </Badge>
            <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-6xl">
              Secure remote management for enterprise networks
            </h1>
            <p className="max-w-2xl text-balance text-base text-muted-foreground md:text-lg">
              Flipper provides enterprise-grade remote management with advanced security, monitoring,
              and automation to keep your infrastructure under control.
            </p>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" onClick={handleGetStarted}>
                Start free trial
                <ArrowRight className="ml-1.5 size-4" />
              </Button>
              <Button size="lg" variant="outline">
                Learn more
              </Button>
            </div>
          </div>
        </PageContainer>
      </section>

      {/* Features */}
      <section className="border-b border-border">
        <PageContainer className="py-20">
          <div className="mx-auto mb-14 flex max-w-2xl flex-col items-center gap-3 text-center">
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Enterprise-grade features
            </h2>
            <p className="text-base text-muted-foreground">
              Built for enterprise networks with security, scalability, and reliability in mind.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="group flex flex-col gap-3 rounded-lg border border-border bg-card p-6 transition-colors hover:border-foreground/20"
              >
                <div className="flex size-9 items-center justify-center rounded-md border border-border bg-background">
                  <Icon className="size-4 text-foreground/80" />
                </div>
                <h3 className="text-base font-semibold tracking-tight">{title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
        </PageContainer>
      </section>

      {/* Benefits / mock dashboard */}
      <section className="border-b border-border">
        <PageContainer className="py-20">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div className="flex flex-col gap-8">
              <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
                Why choose Flipper?
              </h2>
              <ul className="flex flex-col gap-6">
                {[
                  {
                    title: 'Enterprise security',
                    body: 'Bank-grade encryption and security protocols to protect your network infrastructure.',
                  },
                  {
                    title: 'Scalable architecture',
                    body: 'Designed to scale from small teams to large networks with thousands of devices.',
                  },
                  {
                    title: '24/7 support',
                    body: 'Dedicated enterprise support team available around the clock for critical issues.',
                  },
                ].map(({ title, body }) => (
                  <li key={title} className="flex items-start gap-3">
                    <CheckCircle className="mt-0.5 size-4 shrink-0 text-success" />
                    <div className="flex flex-col gap-1">
                      <h3 className="text-sm font-semibold">{title}</h3>
                      <p className="text-sm text-muted-foreground">{body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg border border-border bg-card p-6 shadow-xl shadow-black/20">
              <div className="mb-6 flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-md border border-border bg-background">
                  <Monitor className="size-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Network dashboard</h3>
                  <p className="text-xs text-muted-foreground">Real-time monitoring</p>
                </div>
              </div>
              <ul className="flex flex-col gap-2">
                {[
                  { name: 'Core switches', status: 'Online', tone: 'success' as const },
                  { name: 'Firewalls', status: 'Online', tone: 'success' as const },
                  { name: 'Backup server', status: 'Warning', tone: 'warning' as const },
                ].map(({ name, status, tone }) => (
                  <li
                    key={name}
                    className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2.5"
                  >
                    <span className="text-sm text-foreground">{name}</span>
                    <span
                      className={
                        'flex items-center gap-1.5 text-xs font-medium ' +
                        (tone === 'success' ? 'text-success' : 'text-warning')
                      }
                    >
                      <span
                        className={
                          'size-1.5 rounded-full ' +
                          (tone === 'success' ? 'bg-success' : 'bg-warning')
                        }
                      />
                      {status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </PageContainer>
      </section>

      {/* CTA */}
      <section className="border-b border-border">
        <PageContainer className="py-20">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 text-center">
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Ready to secure your network?
            </h2>
            <p className="max-w-xl text-base text-muted-foreground">
              Join enterprise teams who trust Flipper for their remote management needs.
            </p>
            <Button size="lg" onClick={handleGetStarted}>
              Get started today
              <ArrowRight className="ml-1.5 size-4" />
            </Button>
          </div>
        </PageContainer>
      </section>

      {/* Footer */}
      <footer>
        <PageContainer className="py-12">
          <div className="grid gap-8 md:grid-cols-4">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className="flex size-7 items-center justify-center rounded-md border border-border bg-card">
                  <span className="text-sm font-semibold">F</span>
                </div>
                <span className="text-sm font-semibold">Flipper</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Enterprise remote management for modern networks.
              </p>
            </div>
            {[
              { title: 'Product', items: ['Features', 'Security', 'Pricing', 'Documentation'] },
              { title: 'Company', items: ['About', 'Contact', 'Support', 'Status'] },
              { title: 'Legal', items: ['Privacy', 'Terms', 'Compliance', 'Security'] },
            ].map(({ title, items }) => (
              <div key={title} className="flex flex-col gap-3">
                <h3 className="text-sm font-semibold">{title}</h3>
                <ul className="flex flex-col gap-2">
                  {items.map((item) => (
                    <li key={item} className="text-sm text-muted-foreground">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-12 border-t border-border pt-6 text-center text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Flipper. All rights reserved.
          </div>
        </PageContainer>
      </footer>
    </div>
  );
}
