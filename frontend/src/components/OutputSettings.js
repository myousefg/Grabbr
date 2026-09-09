import { FolderOpen, Braces } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Section, Row } from '@/components/settingsUi';
import { useI18n } from '@/context/I18nProvider';
import { useSettings } from '@/context/SettingsProvider';
import { isElectron } from '@/lib/electron';

const FOLDER_STRUCTURES = ['site_user', 'site', 'flat', 'custom'];

// gallery-dl format fields offered by the "Insert field" menus.
const NAME_TOKENS = ['category', 'id', 'num', 'filename', 'extension', 'title', 'date', 'user'];
const NAME_TOKEN_TEXT = {
  category: '{category}', id: '{id}', num: '{num}', filename: '{filename}',
  extension: '{extension}', title: '{title}', date: '{date:%Y%m%d}', user: '{user[name]}',
};
const PATH_TOKENS = ['category', 'user', 'subcategory', 'date'];
const PATH_TOKEN_TEXT = {
  category: '{category}', user: '{user[name]}', subcategory: '{subcategory}', date: '{date:%Y-%m}',
};

function TokenMenu({ tokens, text, onPick }) {
  const { t } = useI18n();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" title={t('settings.tokens.insert')}>
          <Braces className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {tokens.map(k => (
          <DropdownMenuItem
            key={k}
            onSelect={() => onPick(text[k])}
            className="flex flex-col items-start gap-0.5 py-1.5"
          >
            <code className="text-xs">{text[k]}</code>
            <span className="text-[11px] text-muted-foreground">{t(`settings.tokens.${k}`)}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function OutputSettings() {
  const { t } = useI18n();
  const { settings: s, update } = useSettings();
  if (!s) return null;

  const browseFolder = async () => {
    if (!isElectron) return;
    const p = await window.electronAPI.selectFolder({ title: t('settings.outputDir'), defaultPath: s.output_dir });
    if (p) update({ output_dir: p });
  };

  const addToken = (key, token, sep = '') => {
    const cur = s[key] || '';
    const glue = cur && sep && !cur.endsWith(sep) ? sep : '';
    update({ [key]: cur + glue + token });
  };

  return (
    <Section label={t('settings.output')}>
      <Row title={t('settings.outputDir')} desc={t('settings.outputDirDesc')}>
        <Input
          value={s.output_dir || ''} onChange={e => update({ output_dir: e.target.value })}
          className="w-64 font-mono text-xs" data-testid="output-dir"
        />
        {isElectron && (
          <Button variant="outline" size="icon" onClick={browseFolder} title={t('settings.browse')}>
            <FolderOpen className="w-4 h-4" />
          </Button>
        )}
      </Row>

      <Row title={t('settings.folderStructure')} desc={t('settings.folderStructureDesc')}>
        <Select value={s.folder_structure || 'site_user'} onValueChange={v => update({ folder_structure: v })}>
          <SelectTrigger className="w-56" data-testid="folder-structure"><SelectValue /></SelectTrigger>
          <SelectContent>
            {FOLDER_STRUCTURES.map(f => <SelectItem key={f} value={f}>{t(`settings.fs.${f}`)}</SelectItem>)}
          </SelectContent>
        </Select>
      </Row>

      {s.folder_structure === 'custom' && (
        <Row title={t('settings.folderCustom')} desc={t('settings.folderCustomDesc')}>
          <Input
            value={s.folder_custom || ''} onChange={e => update({ folder_custom: e.target.value })}
            placeholder="{category}/{user[name]}" className="w-64 font-mono text-xs"
          />
          <TokenMenu tokens={PATH_TOKENS} text={PATH_TOKEN_TEXT} onPick={tok => addToken('folder_custom', tok, '/')} />
        </Row>
      )}

      <Row title={t('settings.filenameFormat')} desc={t('settings.filenameFormatDesc')}>
        <Input
          value={s.filename_format || ''} onChange={e => update({ filename_format: e.target.value })}
          placeholder="{category}_{id}.{extension}" className="w-64 font-mono text-xs"
        />
        <TokenMenu tokens={NAME_TOKENS} text={NAME_TOKEN_TEXT} onPick={tok => addToken('filename_format', tok)} />
      </Row>
    </Section>
  );
}
