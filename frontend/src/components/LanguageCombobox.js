import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { LANGUAGES } from '@/locales/languages';

// A searchable language picker (Settings > Appearance). Plain <Select> stops
// being usable once there are 40+ options; this is the standard shadcn
// Popover+Command combobox pattern instead. Search matches on the English
// name, the native name, or the language code, so "Chinese", "中文", and
// "zh" all find the same entries.
export default function LanguageCombobox({ value, onValueChange, t }) {
  const [open, setOpen] = useState(false);
  const current = LANGUAGES.find(l => l.code === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-56 justify-between font-normal"
          data-testid="lang-select"
        >
          <span className="truncate">{current ? current.native : t('settings.selectLanguage')}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0">
        {/* Remounting on each open clears cmdk's internal search state, which
            otherwise persists (and stacks on top of new typing) across opens. */}
        <Command
          key={open}
          filter={(itemValue, search) => {
            const lang = LANGUAGES.find(l => l.code === itemValue);
            if (!lang) return 0;
            const haystack = `${lang.name} ${lang.native} ${lang.code}`.toLowerCase();
            return haystack.includes(search.toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput placeholder={t('settings.searchLanguage')} />
          <CommandList>
            <CommandEmpty>{t('settings.noLanguageFound')}</CommandEmpty>
            <CommandGroup>
              {LANGUAGES.map(l => (
                <CommandItem
                  key={l.code}
                  value={l.code}
                  onSelect={(code) => { onValueChange(code); setOpen(false); }}
                >
                  <Check className={cn('h-4 w-4', value === l.code ? 'opacity-100' : 'opacity-0')} />
                  <span className="flex-1">{l.native}</span>
                  {l.native !== l.name && (
                    <span className="text-xs text-muted-foreground">{l.name}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
