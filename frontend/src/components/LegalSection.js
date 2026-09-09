import { useState } from 'react';
import { Shield, ScrollText, Package } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Section, Row } from '@/components/settingsUi';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/context/I18nProvider';

export const COPYRIGHT_YEAR = 2026;
export const COPYRIGHT_HOLDER = 'Mohammed Yousef Gumilar';

const MIT_PARAGRAPHS = [
  `Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:`,
  `The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.`,
  `THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`,
];

const THIRD_PARTY = [
  ['gallery-dl', 'GPL-2.0-only', 'The download engine. Bundled as an unmodified executable and run as a separate process. Source: github.com/mikf/gallery-dl'],
  ['yt-dlp', 'Unlicense', 'Optional video downloader, fetched on demand. Source: github.com/yt-dlp/yt-dlp'],
  ['FFmpeg', 'LGPL-2.1-or-later / GPL', 'Optional media processing (gyan.dev release build), fetched on demand. Source: ffmpeg.org'],
  ['Electron, React, and other npm packages', 'MIT and compatible', 'Each package retains its own license; see its distribution for full terms.'],
];

function Body({ children }) {
  return (
    <ScrollArea className="max-h-[60vh] pr-3">
      <div className="text-xs leading-relaxed text-muted-foreground space-y-3">{children}</div>
    </ScrollArea>
  );
}

export default function LegalSection() {
  const { t } = useI18n();
  const [dlg, setDlg] = useState(null); // 'privacy' | 'license' | 'notices'
  const copyright = `Copyright (c) ${COPYRIGHT_YEAR} ${COPYRIGHT_HOLDER}`;

  return (
    <>
      <Section label={t('settings.legal')}>
        <Row title={t('settings.privacy')} desc={t('settings.privacyDesc')}>
          <Button variant="outline" size="sm" onClick={() => setDlg('privacy')}>
            <Shield className="w-3.5 h-3.5 mr-1.5" /> {t('settings.read')}
          </Button>
        </Row>
        <Row title={t('settings.license')} desc={t('settings.licenseDesc')}>
          <Button variant="outline" size="sm" onClick={() => setDlg('license')}>
            <ScrollText className="w-3.5 h-3.5 mr-1.5" /> {t('settings.read')}
          </Button>
        </Row>
        <Row title={t('settings.notices')} desc={t('settings.noticesDesc')}>
          <Button variant="outline" size="sm" onClick={() => setDlg('notices')}>
            <Package className="w-3.5 h-3.5 mr-1.5" /> {t('settings.read')}
          </Button>
        </Row>
      </Section>

      <Dialog open={!!dlg} onOpenChange={o => !o && setDlg(null)}>
        <DialogContent className="max-w-lg">
          {dlg === 'privacy' && (
            <>
              <DialogHeader>
                <DialogTitle className="tracking-tight">{t('settings.privacy')}</DialogTitle>
                <DialogDescription>{t('settings.privacyTagline')}</DialogDescription>
              </DialogHeader>
              <Body>
                <p>{t('settings.privacyBody1')}</p>
                <p>{t('settings.privacyBody2')}</p>
                <p>{t('settings.privacyBody3')}</p>
              </Body>
            </>
          )}
          {dlg === 'license' && (
            <>
              <DialogHeader>
                <DialogTitle className="tracking-tight">{t('settings.license')}</DialogTitle>
                <DialogDescription>{t('settings.licenseTagline')}</DialogDescription>
              </DialogHeader>
              <Body>
                <p className="text-foreground font-medium">MIT License</p>
                <p className="text-foreground">{copyright}</p>
                {MIT_PARAGRAPHS.map((para, idx) => <p key={idx}>{para}</p>)}
              </Body>
            </>
          )}
          {dlg === 'notices' && (
            <>
              <DialogHeader>
                <DialogTitle className="tracking-tight">{t('settings.notices')}</DialogTitle>
                <DialogDescription>{t('settings.noticesTagline')}</DialogDescription>
              </DialogHeader>
              <Body>
                {THIRD_PARTY.map(([name, lic, note]) => (
                  <div key={name}>
                    <p className="text-foreground font-medium">
                      {name} <span className="text-muted-foreground font-normal">· {lic}</span>
                    </p>
                    <p>{note}</p>
                  </div>
                ))}
                <p>{t('settings.noticesFootnote')}</p>
              </Body>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
