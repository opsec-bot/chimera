import React, { useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, X, Filter, SortAsc, SortDesc } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface SearchFilter {
  key: string;
  label: string;
  type: 'select' | 'text' | 'date';
  options?: { value: string; label: string }[];
}

export interface SearchSort {
  key: string;
  label: string;
}

export interface SearchInputProps {
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  onSearch?: (query: string) => void;
  onFilterChange?: (filters: Record<string, any>) => void;
  onSortChange?: (sortBy: string, sortOrder: 'asc' | 'desc') => void;
  filters?: SearchFilter[];
  sortOptions?: SearchSort[];
  currentFilters?: Record<string, any>;
  currentSort?: { sortBy: string; sortOrder: 'asc' | 'desc' };
  loading?: boolean;
  className?: string;
  showFilters?: boolean;
  showSort?: boolean;
  debounceMs?: number;
}

export function SearchInput({
  placeholder = 'Search...',
  value,
  onChange,
  onSearch,
  onFilterChange,
  onSortChange,
  filters = [],
  sortOptions = [],
  currentFilters = {},
  currentSort,
  loading = false,
  className,
  showFilters = true,
  showSort = true,
  debounceMs = 300,
}: SearchInputProps) {
  const [localValue, setLocalValue] = useState(value);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localValue !== value) {
        onChange(localValue);
        onSearch?.(localValue);
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [localValue, value, onChange, onSearch, debounceMs]);

  // Sync external value changes
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleFilterChange = useCallback(
    (key: string, filterValue: any) => {
      const newFilters = { ...currentFilters };
      if (
        filterValue === '' ||
        filterValue === null ||
        filterValue === undefined ||
        filterValue === '__all__'
      ) {
        delete newFilters[key];
      } else {
        newFilters[key] = filterValue;
      }
      onFilterChange?.(newFilters);
    },
    [currentFilters, onFilterChange],
  );

  const clearFilters = useCallback(() => {
    onFilterChange?.({});
  }, [onFilterChange]);

  const handleSortChange = useCallback(
    (sortBy: string) => {
      if (currentSort?.sortBy === sortBy) {
        // Toggle sort order
        const newOrder = currentSort.sortOrder === 'asc' ? 'desc' : 'asc';
        onSortChange?.(sortBy, newOrder);
      } else {
        // New sort field, default to desc
        onSortChange?.(sortBy, 'desc');
      }
    },
    [currentSort, onSortChange],
  );

  const activeFiltersCount = Object.keys(currentFilters).length;
  const hasActiveFilters = activeFiltersCount > 0;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {/* Search Input */}
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={placeholder}
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          className="pl-10 pr-4"
          disabled={loading}
        />
        {localValue && (
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
            onClick={() => {
              setLocalValue('');
              onChange('');
              onSearch?.('');
            }}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Filters - Commented out */}
      {false && showFilters && filters.length > 0 && (
        <Popover open={isFilterOpen} onOpenChange={setIsFilterOpen}>
          <PopoverTrigger asChild>
            <Button
              variant={hasActiveFilters ? 'default' : 'outline'}
              size="sm"
              className="relative"
            >
              <Filter className="h-4 w-4 mr-2" />
              Filters
              {hasActiveFilters && (
                <Badge variant="secondary" className="ml-2 h-5 w-5 p-0 text-xs">
                  {activeFiltersCount}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="end">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Filters</h4>
                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearFilters}
                    className="h-6 px-2 text-xs"
                  >
                    Clear all
                  </Button>
                )}
              </div>

              <div className="flex flex-col gap-3">
                {filters.map((filter) => (
                  <div key={filter.key} className="flex flex-col gap-1">
                    <label className="text-sm font-medium">{filter.label}</label>
                    {filter.type === 'select' && filter.options ? (
                      <Select
                        value={currentFilters[filter.key] || '__all__'}
                        onValueChange={(value) => handleFilterChange(filter.key, value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={`All ${filter.label.toLowerCase()}`} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__all__">All {filter.label.toLowerCase()}</SelectItem>
                          {filter.options.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : filter.type === 'text' ? (
                      <Input
                        placeholder={`Filter by ${filter.label.toLowerCase()}`}
                        value={currentFilters[filter.key] || ''}
                        onChange={(e) => handleFilterChange(filter.key, e.target.value)}
                      />
                    ) : filter.type === 'date' ? (
                      <Input
                        type="date"
                        value={currentFilters[filter.key] || ''}
                        onChange={(e) => handleFilterChange(filter.key, e.target.value)}
                      />
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      )}

      {/* Sort - Commented out */}
      {false && showSort && sortOptions.length > 0 && (
        <Popover open={isSortOpen} onOpenChange={setIsSortOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              {currentSort?.sortOrder === 'asc' ? (
                <SortAsc className="h-4 w-4 mr-2" />
              ) : (
                <SortDesc className="h-4 w-4 mr-2" />
              )}
              Sort
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48" align="end">
            <div className="flex flex-col gap-2">
              <h4 className="font-medium">Sort by</h4>
              {sortOptions.map((option) => (
                <Button
                  key={option.key}
                  variant={currentSort?.sortBy === option.key ? 'default' : 'ghost'}
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => handleSortChange(option.key)}
                >
                  {option.label}
                  {currentSort?.sortBy === option.key && (
                    <span className="ml-auto">
                      {currentSort.sortOrder === 'asc' ? (
                        <SortAsc className="h-3 w-3" />
                      ) : (
                        <SortDesc className="h-3 w-3" />
                      )}
                    </span>
                  )}
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
