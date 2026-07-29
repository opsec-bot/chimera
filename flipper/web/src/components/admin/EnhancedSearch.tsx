/**
 * Enhanced Search Component for Admin Panel
 * Provides powerful search capabilities across all entities
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Search, User, Database, FileText, Wallet, Clock, MapPin } from 'lucide-react';
import { cn } from '../../lib/utils';

interface SearchResult {
  id: number;
  type: string;
  title: string;
  description: string;
  metadata: Record<string, any>;
  createdAt: string;
}

interface SearchResponse {
  success: boolean;
  query: string;
  results: {
    users: SearchResult[];
    browserSubmissions: SearchResult[];
    filesearchSubmissions: SearchResult[];
    walletSubmissions: SearchResult[];
  };
  totalResults: number;
}

interface SearchSuggestions {
  success: boolean;
  suggestions: string[];
  query: string;
}

export function EnhancedSearch() {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeTab, setActiveTab] = useState('all');

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchTerm.length >= 2) {
        fetchSuggestions(searchTerm);
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchSuggestions = async (query: string) => {
    try {
      const response = await fetch(
        `/admin/api/search/suggestions?q=${encodeURIComponent(query)}&limit=8`,
      );
      const data: SearchSuggestions = await response.json();
      if (data.success) {
        setSuggestions(data.suggestions);
        setShowSuggestions(true);
      }
    } catch (error) {
      console.error('Failed to fetch suggestions:', error);
    }
  };

  const handleSearch = useCallback(async () => {
    if (!searchTerm.trim()) return;

    setLoading(true);
    setShowSuggestions(false);

    try {
      const response = await fetch(
        `/admin/api/search/global?q=${encodeURIComponent(searchTerm)}&limit=50`,
      );
      const data: SearchResponse = await response.json();

      if (data.success) {
        setResults(data);
      } else {
        console.error('Search failed:', data);
      }
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  }, [searchTerm]);

  const handleSuggestionClick = (suggestion: string) => {
    setSearchTerm(suggestion);
    setShowSuggestions(false);
    // Trigger search immediately
    setTimeout(() => handleSearch(), 100);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getEntityIcon = (type: string) => {
    switch (type) {
      case 'user':
        return <User className="h-4 w-4" />;
      case 'browser_submission':
        return <Database className="h-4 w-4" />;
      case 'filesearch_submission':
        return <FileText className="h-4 w-4" />;
      case 'wallet_submission':
        return <Wallet className="h-4 w-4" />;
      default:
        return <Search className="h-4 w-4" />;
    }
  };

  const getEntityColor = (type: string) => {
    switch (type) {
      case 'user':
        return 'bg-info/15 text-info';
      case 'browser_submission':
        return 'bg-success/15 text-success';
      case 'filesearch_submission':
        return 'bg-accent text-accent-foreground';
      case 'wallet_submission':
        return 'bg-warning/15 text-warning';
      default:
        return 'bg-card text-card-foreground';
    }
  };

  const renderResultItem = (result: SearchResult) => (
    <div
      key={`${result.type}-${result.id}`}
      className="p-3 border rounded-lg hover:bg-muted/50 transition-colors"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3 flex-1">
          <div className="flex-shrink-0 mt-1">{getEntityIcon(result.type)}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-medium text-sm truncate">{result.title}</h4>
              <Badge variant="secondary" className={cn('text-xs', getEntityColor(result.type))}>
                {result.type.replace('_', ' ')}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mb-2">{result.description}</p>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDate(result.createdAt)}
              </div>
              {result.metadata.ipAddress && (
                <div className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {result.metadata.ipAddress}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const filteredResults = results
    ? {
        users: results.results.users,
        browserSubmissions: results.results.browserSubmissions,
        filesearchSubmissions: results.results.filesearchSubmissions,
        walletSubmissions: results.results.walletSubmissions,
      }
    : null;

  return (
    <div className="flex flex-col gap-6">
      {/* Search Input */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Enhanced Search
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  placeholder="Search users, submissions, wallets, IPs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                  className="pr-10"
                />

                {/* Suggestions Dropdown */}
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg z-50 max-h-60 overflow-y-auto">
                    {suggestions.map((suggestion, index) => (
                      <button
                        key={index}
                        onClick={() => handleSuggestionClick(suggestion)}
                        className="w-full px-3 py-2 text-left hover:bg-muted text-sm border-b last:border-b-0"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Button onClick={handleSearch} disabled={loading || !searchTerm.trim()}>
                {loading ? 'Searching...' : 'Search'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search Results */}
      {results && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Search Results ({results.totalResults} found)</CardTitle>
              <Badge variant="outline">Query: "{results.query}"</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="all">All ({results.totalResults})</TabsTrigger>
                <TabsTrigger value="users">Users ({results.results.users.length})</TabsTrigger>
                <TabsTrigger value="browser">
                  Browser ({results.results.browserSubmissions.length})
                </TabsTrigger>
                <TabsTrigger value="filesearch">
                  Filesearch ({results.results.filesearchSubmissions.length})
                </TabsTrigger>
                <TabsTrigger value="wallets">
                  Wallets ({results.results.walletSubmissions.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="all" className="flex flex-col gap-4">
                {results.totalResults === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No results found for "{results.query}"
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {results.results.users.map(renderResultItem)}
                    {results.results.browserSubmissions.map(renderResultItem)}
                    {results.results.filesearchSubmissions.map(renderResultItem)}
                    {results.results.walletSubmissions.map(renderResultItem)}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="users" className="flex flex-col gap-4">
                {results.results.users.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">No users found</div>
                ) : (
                  <div className="flex flex-col gap-3">{results.results.users.map(renderResultItem)}</div>
                )}
              </TabsContent>

              <TabsContent value="browser" className="flex flex-col gap-4">
                {results.results.browserSubmissions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No browser submissions found
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {results.results.browserSubmissions.map(renderResultItem)}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="filesearch" className="flex flex-col gap-4">
                {results.results.filesearchSubmissions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No filesearch submissions found
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {results.results.filesearchSubmissions.map(renderResultItem)}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="wallets" className="flex flex-col gap-4">
                {results.results.walletSubmissions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No wallet submissions found
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {results.results.walletSubmissions.map(renderResultItem)}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
