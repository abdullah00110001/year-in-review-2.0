import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { clearDeviceLog, readDeviceLog, shareDeviceLog } from '@/lib/logger';

export default function DeviceLogPanel() {
  const [text, setText] = useState('');
  const [path, setPath] = useState('');

  const refresh = async () => {
    const r = await readDeviceLog();
    setText(r.text);
    setPath(r.path);
  };

  useEffect(() => { refresh(); }, []);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Device log</CardTitle>
        <p className="text-xs text-muted-foreground break-all">{path}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={refresh}>Refresh</Button>
          <Button size="sm" variant="outline" onClick={() => shareDeviceLog()}>Share</Button>
          <Button size="sm" variant="outline" onClick={async () => { await clearDeviceLog(); refresh(); }}>Clear</Button>
        </div>
        <pre className="max-h-80 overflow-auto rounded-lg bg-muted p-3 text-[11px] leading-relaxed whitespace-pre-wrap break-words">
          {text || 'No log entries yet.'}
        </pre>
      </CardContent>
    </Card>
  );
}
