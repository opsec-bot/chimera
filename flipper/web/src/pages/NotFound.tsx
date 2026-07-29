import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Home, ArrowLeft, Search as SearchIcon } from 'lucide-react';
import { PageLayout } from '../components/PageLayout';

export function NotFound() {
  const navigate = useNavigate();

  return (
    <PageLayout showProfile={false}>
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center flex flex-col gap-6 max-w-md mx-auto px-4">
          {/* 404 Icon */}
          <div className="relative">
            <div className="text-9xl font-bold text-muted-foreground/20 select-none">404</div>
            <div className="absolute inset-0 flex items-center justify-center">
              <SearchIcon className="h-14 w-14 text-muted-foreground/40" />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Page not found</h1>
            <p className="text-sm text-muted-foreground">
              The page you're looking for doesn't exist or has been moved.
            </p>
          </div>

          <div className="flex flex-col justify-center gap-2 sm:flex-row">
            <Button onClick={() => navigate('/dashboard')}>
              <Home className="h-4 w-4" /> Dashboard
            </Button>
            <Button variant="outline" onClick={() => window.history.back()}>
              <ArrowLeft className="h-4 w-4" /> Go back
            </Button>
          </div>

          {/* Additional Help */}
          <div className="pt-6 border-t border-border">
            <p className="text-sm text-muted-foreground">
              If you believe this is an error, please contact support or try refreshing the page.
            </p>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
