import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { useObjects } from '@/features/metadata/use-objects';
import { useGlobalSearch } from './use-global-search';

/** Cmd/Ctrl+K global search palette: finds records across all readable objects. */
export function CommandPalette({ workspaceId }: { workspaceId: string | null }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const results = useGlobalSearch(workspaceId, query);
  const objects = useObjects(workspaceId);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  function goToRecord(objectApiName: string, recordId: string) {
    setOpen(false);
    setQuery('');
    void navigate({ to: '/records/$objectApiName/$recordId', params: { objectApiName, recordId } });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0">
        <DialogTitle className="sr-only">{t('search.title')}</DialogTitle>
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={t('search.placeholder')}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {query.trim().length === 0 ? (
              <CommandEmpty>{t('search.hint')}</CommandEmpty>
            ) : results.data && results.data.length === 0 ? (
              <CommandEmpty>{t('search.noResults')}</CommandEmpty>
            ) : (
              <CommandGroup heading={t('search.results')}>
                {(results.data ?? []).map((result) => {
                  const objectDef = objects.data?.find((o) => o.apiName === result.objectApiName);
                  return (
                    <CommandItem
                      key={`${result.objectApiName}-${result.recordId}`}
                      value={`${result.objectApiName}-${result.recordId}`}
                      onSelect={() => goToRecord(result.objectApiName, result.recordId)}
                    >
                      <span className="font-medium">{result.name}</span>
                      <span className="text-muted-foreground">
                        {objectDef?.labelSingular ?? result.objectLabel}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
