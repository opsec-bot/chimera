import React from 'react';
import { AppHeader } from './layout/AppHeader';
import { PageContainer } from './layout/PageContainer';

type Props = {
  children: React.ReactNode;
  title?: string;
  fluid?: boolean; // if true, don't constrain to max width
  className?: string;
  sidebar?: React.ReactNode;
  showProfile?: boolean;
  actions?: React.ReactNode;
  onSettings?: () => void;
};

export function PageLayout({
  children,
  title,
  fluid,
  className,
  sidebar,
  actions,
  onSettings,
  showProfile,
}: Props) {
  // If a sidebar is provided, render a two-column layout matching existing dashboard patterns
  if (sidebar) {
    return (
      <div className={`min-h-screen bg-background ${className || ''}`}>
        <AppHeader actions={actions} onSettings={onSettings} showProfile={showProfile} />
        <div className="flex h-[calc(100vh-3.5rem)]">
          <aside className="flex-shrink-0">{sidebar}</aside>
          <main className="flex-1 overflow-auto custom-scrollbar">
            <PageContainer title={title} fluid={fluid}>
              {children}
            </PageContainer>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-background ${className || ''}`}>
      <AppHeader actions={actions} onSettings={onSettings} showProfile={showProfile} />
      <div className="h-[calc(100vh-3.5rem)] flex">
        <main className="flex-1 overflow-auto custom-scrollbar">
          <PageContainer title={title} fluid={fluid}>
            {children}
          </PageContainer>
        </main>
      </div>
    </div>
  );
}
