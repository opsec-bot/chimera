import { useState, useEffect, useCallback } from 'react';
import { getJson } from '../utils/api';

export interface SearchOptions {
  query?: string;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  filters?: Record<string, any>;
}

export interface SearchResult<T> {
  data: T[];
  total: number;
  hasMore: boolean;
}

export interface UseSearchOptions {
  endpoint: string;
  initialOptions?: SearchOptions;
  autoSearch?: boolean;
  debounceMs?: number;
}

export function useSearch<T = any>({
  endpoint,
  initialOptions = {},
  autoSearch = true,
  debounceMs = 300,
}: UseSearchOptions) {
  const [data, setData] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<SearchOptions>(initialOptions);

  const search = useCallback(
    async (searchOptions: SearchOptions = {}) => {
      try {
        setLoading(true);
        setError(null);

        const queryParams = new URLSearchParams();

        // Add search parameters
        if (searchOptions.query) queryParams.append('query', searchOptions.query);
        if (searchOptions.limit) queryParams.append('limit', searchOptions.limit.toString());
        if (searchOptions.offset) queryParams.append('offset', searchOptions.offset.toString());
        if (searchOptions.sortBy) queryParams.append('sortBy', searchOptions.sortBy);
        if (searchOptions.sortOrder) queryParams.append('sortOrder', searchOptions.sortOrder);

        // Add filters
        if (searchOptions.filters) {
          Object.entries(searchOptions.filters).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
              queryParams.append(`filters.${key}`, value.toString());
            }
          });
        }

        const url = `${endpoint}?${queryParams.toString()}`;
        const result: SearchResult<T> = await getJson(url);

        setData(result.data);
        setTotal(result.total);
        setHasMore(result.hasMore);
      } catch (err: any) {
        setError(err.message || 'Search failed');
        setData([]);
        setTotal(0);
        setHasMore(false);
      } finally {
        setLoading(false);
      }
    },
    [endpoint],
  );

  // Debounced search effect
  useEffect(() => {
    if (!autoSearch) return;

    const timer = setTimeout(() => {
      search(options);
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [options, search, autoSearch, debounceMs]);

  const updateOptions = useCallback((newOptions: Partial<SearchOptions>) => {
    setOptions((prev) => ({ ...prev, ...newOptions }));
  }, []);

  const setQuery = useCallback(
    (query: string) => {
      updateOptions({ query, offset: 0 }); // Reset offset when query changes
    },
    [updateOptions],
  );

  const setFilters = useCallback(
    (filters: Record<string, any>) => {
      updateOptions({ filters, offset: 0 }); // Reset offset when filters change
    },
    [updateOptions],
  );

  const setSort = useCallback(
    (sortBy: string, sortOrder: 'asc' | 'desc') => {
      updateOptions({ sortBy, sortOrder, offset: 0 }); // Reset offset when sort changes
    },
    [updateOptions],
  );

  const loadMore = useCallback(() => {
    if (hasMore && !loading) {
      updateOptions({ offset: (options.offset || 0) + (options.limit || 50) });
    }
  }, [hasMore, loading, options.offset, options.limit, updateOptions]);

  const reset = useCallback(() => {
    setOptions(initialOptions);
    setData([]);
    setTotal(0);
    setHasMore(false);
    setError(null);
  }, [initialOptions]);

  return {
    data,
    total,
    hasMore,
    loading,
    error,
    options,
    search: (searchOptions?: SearchOptions) => search(searchOptions),
    updateOptions,
    setQuery,
    setFilters,
    setSort,
    loadMore,
    reset,
  };
}

// Specific hooks for different search endpoints
export function useBrowserSearch(
  initialOptions?: SearchOptions,
  searchOptions?: { autoSearch?: boolean },
) {
  return useSearch({
    endpoint: '/api/search/browser',
    initialOptions,
    autoSearch: searchOptions?.autoSearch,
  });
}

export function useFilesearchSearch(initialOptions?: SearchOptions) {
  return useSearch({
    endpoint: '/api/search/filesearch',
    initialOptions,
  });
}

export function useWalletSearch(initialOptions?: SearchOptions) {
  return useSearch({
    endpoint: '/api/search/wallet',
    initialOptions,
  });
}

export function useGlobalSearch(initialOptions?: SearchOptions) {
  return useSearch({
    endpoint: '/api/search/global',
    initialOptions,
  });
}

export function useUserSearch(initialOptions?: SearchOptions) {
  return useSearch({
    endpoint: '/api/search/admin/users',
    initialOptions,
  });
}

export function useInviteSearch(initialOptions?: SearchOptions) {
  return useSearch({
    endpoint: '/api/search/admin/invites',
    initialOptions,
  });
}
